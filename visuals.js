// Server-side generator for the display's backdrop images.
//
// Time is divided into 15-minute slots aligned to the clock (:00, :15, :30,
// :45). Each slot gets one AI-generated portrait image whose prompt is built
// from the live weather/sky data the display is showing. While a slot is on
// screen, the image for the *next* slot is generated in the background so the
// client can swap to it the instant the slot boundary passes.
//
// Nothing is generated unless a browser has polled /api/visual recently, so an
// idle server (screen off, nobody watching) costs nothing.

import { readdir, readFile, writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { GoogleAuth } from "google-auth-library";
import { fetchWeather, fetchSkyColors, colorWords, WMO, moonPhase, toDate } from "./src/lib/sky.js";

export const SLOT_MS = 15 * 60 * 1000;
const LEAD_MS = 12 * 60 * 1000; // start the next slot's image this long before it begins
const VIEWER_TIMEOUT_MS = 2 * 60 * 1000; // no poll for this long = nobody watching
const RETRY_MS = 90 * 1000; // wait this long after a failed generation
const TICK_MS = 15 * 1000;
const KEEP = 12; // images kept on disk

const TZ = "America/New_York";

export const slotOf = (ms) => Math.floor(ms / SLOT_MS) * SLOT_MS;

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

const pick = (v, table) => table.find(([max]) => v <= max)[1];

const TEMP_WORDS = [
  [15, "bitterly cold"],
  [32, "freezing cold"],
  [45, "cold"],
  [58, "chilly"],
  [68, "mild"],
  [78, "warm"],
  [88, "hot"],
  [Infinity, "sweltering"],
];
const WIND_WORDS = [
  [4, "dead calm air"],
  [11, "a light breeze"],
  [19, "a steady breeze"],
  [29, "gusty wind"],
  [Infinity, "strong, buffeting wind"],
];
const AQI_WORDS = [
  [50, "crisp, clean air with sharp distant detail"],
  [100, "a faint haze softening the distance"],
  [150, "a visible grey-brown haze"],
  [Infinity, "thick smoky haze that swallows the skyline"],
];
const MOON_WORDS = {
  "New Moon": "no moon in the sky",
  "Waxing Crescent": "a thin waxing crescent moon",
  "First Quarter": "a half moon",
  "Waxing Gibbous": "a bright waxing gibbous moon",
  "Full Moon": "a full moon",
  "Waning Gibbous": "a waning gibbous moon",
  "Last Quarter": "a half moon",
  "Waning Crescent": "a thin waning crescent moon",
};

const monthWord = (m) =>
  ["early ", "mid-", "late "][m.phase] +
  ["January","February","March","April","May","June","July","August","September","October","November","December"][m.month];

// What each reading *looks like*. Image models paint descriptions far better
// than they paint numbers, and a list of figures ("Humidity 70%", "UV 0")
// mostly just tempts them to draw text.
const TEMP_LOOK = [
  [15, "Bitter cold: thick white steam plumes pouring from rooftop vents and chimneys, ice at the water's edge, frost on railings."],
  [32, "Freezing: white steam rising from rooftops, frost on surfaces, a hard brittle clarity."],
  [45, "Cold: thin steam drifting from a few rooftop vents, a raw wintry feel."],
  [58, "Chilly: cool, fresh-looking air."],
  [68, "Mild and comfortable."],
  [78, "Warm: a soft, pleasant warmth in the light."],
  [88, "Hot: a hazy heat softening the distance."],
  [Infinity, "Sweltering: heavy shimmering heat haze and bleached light."],
];
const WIND_LOOK = [
  [4, "Still air: the water glassy with clean reflections, steam rising straight up."],
  [11, "A light breeze: small ripples on the water, flags barely stirring."],
  [19, "A steady breeze: choppy water, flags standing out, clouds visibly on the move."],
  [29, "Gusty: whitecaps on the river, trees bending, clouds torn and streaming."],
  [Infinity, "A gale: spray off the river, trees and flags thrashing, ragged racing clouds."],
];
const SEASON = [
  "deep winter, bare trees",
  "deep winter, bare trees",
  "late winter turning to spring, trees still bare",
  "spring, trees in fresh pale-green leaf and blossom",
  "late spring, full fresh green foliage",
  "early summer, lush green foliage",
  "high summer, heavy dark-green foliage",
  "high summer, heavy dark-green foliage",
  "late summer, foliage just starting to tire",
  "autumn, trees in orange, rust and yellow",
  "late autumn, trees bare or holding their last brown leaves",
  "early winter, bare trees",
];

// The light depends on both where the sun is and how much cloud is in the way.
// (Telling the model "golden hour, long shadows" under a 100% overcast gets a
// muddled picture that is neither.)
const LIGHT = {
  day: {
    clear: "bright direct sunlight from a clear blue sky, crisp hard-edged shadows, strong saturated color",
    broken: "sun coming and going between clouds, patches of sunlight and shadow across the buildings and water, bright blue gaps between well-defined clouds",
    overcast: "soft, even, shadowless daylight under a solid cloud deck: no sun disc, no cast shadows",
  },
  golden: {
    clear: "low golden-hour sun raking in from the west just above the horizon, long shadows, warm light on every west-facing surface, the sky grading from pale gold at the horizon to deep blue overhead",
    broken: "low sun slipping under the clouds and lighting their undersides orange and rose, shafts of warm light, long shadows, cool blue-grey cloud tops",
    overcast: "dim, flat late-afternoon light under a solid overcast, the day visibly draining away: no sun disc, no cast shadows and no sunset colors, only a slightly paler band of cloud low on the western horizon, with the first windows and street lamps beginning to glow warm against the grey",
  },
  sunrise: {
    clear: "the first low golden light just after sunrise coming from the east, long shadows, the sky pale peach at the horizon rising to clear blue",
    broken: "just after sunrise, low eastern sun catching the cloud undersides in pink and gold, long cool shadows",
    overcast: "a grey dawn just after sunrise under a solid overcast: flat, cool, slowly brightening light, no sun disc, no shadows, a few lights still on",
  },
  dusk: {
    clear: "blue hour right after sunset: a deep cobalt sky, a last thin band of orange on the western horizon, city lights on and reflecting in the water",
    broken: "blue hour right after sunset: dark clouds with a last smoulder of red on their western edges, deep blue gaps between them, city lights on",
    overcast: "heavy blue-grey dusk right after sunset under a solid overcast: no sunset color, the cloud base starting to glow from the city below, lights on everywhere",
  },
  dawn: {
    clear: "pre-dawn twilight: a dark blue sky paling to a thin cold glow on the eastern horizon, city lights still on",
    broken: "pre-dawn twilight: dark clouds against a slowly paling blue sky, city lights still on",
    overcast: "pre-dawn under a solid overcast: near-dark, the cloud base faintly lit by the city, the first cold grey just arriving",
  },
  night: {
    clear: "full night: a dark clear sky, the city fully lit, windows and bridge lights reflecting in the water",
    broken: "full night: ragged clouds lit dull orange from below drifting across a dark sky, the city fully lit",
    overcast: "full night under low cloud: the whole cloud deck glowing a dull orange-mauve with reflected city light, the city fully lit",
  },
};

const PRECIP_LOOK = {
  drizzle: "A fine drizzle is falling: glistening wet surfaces, soft reflections, the distance veiled.",
  rain: "It is raining: visible rain streaks, wet reflective ground, the distant skyline greyed out behind the rain.",
  "freezing rain": "Freezing rain is falling: everything glazed with ice, wet reflective ground, the distance greyed out.",
  snow: "It is snowing: flakes in the air, snow settling on ledges, railings and the ground, the distance fading into white.",
  thunderstorm: "A thunderstorm: dark towering cloud, heavy sheets of rain, a fork of lightning in the distance.",
};

function precipKind(code, precip, feels) {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([56, 57, 66, 67].includes(code)) return "freezing rain";
  if ([95, 96, 99].includes(code)) return "thunderstorm";
  if ([51, 53, 55].includes(code)) return "drizzle";
  if ([61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if (precip > 0) return feels <= 32 ? "snow" : "rain";
  return null;
}

function skyLook(cloud, fog) {
  if (fog) return "thick fog: the tops of the towers vanish into it and the far shore is barely there";
  if (cloud < 10) return "cloudless";
  if (cloud < 30) return "almost clear, only a few small clouds";
  if (cloud < 60) return "about half cloud: well-defined clouds with open sky between them";
  if (cloud < 85) return "mostly cloudy with a few breaks";
  return "fully overcast, a continuous cloud deck from horizon to horizon. Give the deck real structure (layered bands, darker bellies, soft rifts, subtle shifts of grey) rather than a flat blank fill";
}

// Where we are relative to sunrise/sunset.
function sunContext(daily, now) {
  const events = [];
  (daily?.sunrise || []).forEach((t) => events.push({ label: "sunrise", at: toDate(t) }));
  (daily?.sunset || []).forEach((t) => events.push({ label: "sunset", at: toDate(t) }));
  events.sort((a, b) => a.at - b.at);
  const next = events.find((e) => e.at > now);
  const prev = [...events].reverse().find((e) => e.at <= now);
  const mins = (e) => Math.abs(Math.round((e.at - now) / 60000));
  const plural = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  const fmt = (m) => (m >= 60 ? `${plural(Math.floor(m / 60), "hour")} ${plural(m % 60, "minute")}` : plural(m, "minute"));
  if (!next) return { phase: "day", sentence: "" };
  const toNext = mins(next);
  const sincePrev = prev ? mins(prev) : null;
  let phase;
  if (next.label === "sunset") {
    if (sincePrev != null && sincePrev < 45) phase = "sunrise";
    else if (toNext < 60) phase = "golden";
    else phase = "day";
  } else {
    if (sincePrev != null && sincePrev < 40) phase = "dusk";
    else if (toNext < 40) phase = "dawn";
    else phase = "night";
  }
  return {
    phase,
    sentence: `It is ${fmt(toNext)} before ${next.label}` + (prev ? ` and ${fmt(sincePrev)} after ${prev.label}` : "") + ".",
  };
}

// Everything the prompt is built from: the weather reading plus, when
// available, the measured color of the real sky (as `sky`).
export async function fetchConditions() {
  const [w, sky] = await Promise.all([fetchWeather(), fetchSkyColors()]);
  return { ...w, sky };
}

// The measured sky colors as a sentence, e.g. "light greyish blue (#93b5d2)
// to the west, ...". Neighbouring directions with the same name are merged.
function measuredSky(sky) {
  if (!sky) return "";
  const parts = [];
  for (const [dir, label] of [["west", "west"], ["north-west", "north-west"], ["north-east", "north-east"], ["east", "east"]]) {
    const words = colorWords(sky[dir]);
    if (!words) continue;
    const last = parts[parts.length - 1];
    if (last && last.words === words) last.dirs.push(label);
    else parts.push({ words, hex: sky[dir], dirs: [label] });
  }
  if (!parts.length) return "";
  const where = (dirs) => (dirs.length === 4 ? "in every direction" : `to the ${dirs.join(" and ")}`);
  const list = parts.map((p) => `${p.words} (${p.hex}) ${where(p.dirs)}`).join(", ");
  return `A camera above Manhattan has just measured the actual color of the sky: ${list}. Paint the sky in these measured colors and at this brightness; where they differ from the description above, the measurement wins.`;
}

// Turn a weather reading + timestamp into what every style shares:
//   scene: a visual description of the conditions, for the pictorial styles
//   facts: the raw figures, for the styles that encode data as shapes
export function describe(w, now = new Date()) {
  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ });
  const month = Number(now.toLocaleString("en-US", { month: "numeric", timeZone: TZ })) - 1;
  const day = Number(now.toLocaleString("en-US", { day: "numeric", timeZone: TZ }));
  const hour = Number(now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: TZ })) % 24;
  const temp = Math.round(w.temperature_2m);
  const feels = Math.round(w.apparent_temperature ?? w.temperature_2m);
  const wind = Math.round(w.wind_speed_10m ?? 0);
  const humidity = Math.round(w.relative_humidity_2m ?? 0);
  const code = w.weather_code;
  const [, skyLabel] = WMO[code] || ["", "unsettled sky"];
  const sun = sunContext(w.daily, now);
  const moon = moonPhase(now);
  const aqi = w.aqi;
  const uv = Math.round(w.uv_index ?? 0);
  const precip = w.precipitation ?? 0;
  const cloud = Math.round(w.cloud_cover ?? 0);
  const fog = code === 45 || code === 48;
  const falling = precipKind(code, precip, feels); // null when dry
  const bucket = cloud >= 85 || fog || falling ? "overcast" : cloud >= 30 ? "broken" : "clear";
  const isDark = ["dusk", "dawn", "night"].includes(sun.phase);
  const light = LIGHT[sun.phase][bucket];
  const season = monthWord({ month, phase: day <= 10 ? 0 : day <= 20 ? 1 : 2 });
  const partOfDay =
    hour < 5 ? "The middle of the night" : hour < 8 ? "Early morning" : hour < 11 ? "Morning" : hour < 14 ? "Midday" :
    hour < 16 ? "Afternoon" : hour < 18 ? "Late afternoon" : hour < 21 ? "Evening" : "Night";

  // Only something that could really be seen gets drawn.
  const moonVisible = isDark && bucket !== "overcast" && moon !== "New Moon";
  const sunVisible = !isDark && bucket !== "overcast";
  const skyObject = moonVisible ? MOON_WORDS[moon] : sunVisible ? (sun.phase === "day" ? "the sun" : "a low sun near the horizon") : null;

  const scene = [
    `${partOfDay} in ${season} in New York City (${SEASON[month]}).`,
    sun.sentence,
    `Light: ${light}.`,
    `Sky: ${skyLook(cloud, fog)}.`,
    falling ? PRECIP_LOOK[falling] : "It is completely dry: no rain, no snow, no falling streaks of any kind.",
    pick(feels, TEMP_LOOK),
    pick(wind, WIND_LOOK),
    aqi != null ? `Air: ${pick(aqi, AQI_WORDS)}.` : "",
    humidity >= 88 && !falling && !fog ? "Humid, with a thin mist low over the water." : "",
    moonVisible
      ? `The moon is out: ${MOON_WORDS[moon]}, drawn with exactly that shape${bucket === "broken" ? ", glimpsed between clouds" : ""}.`
      : "Do not draw a moon.",
    measuredSky(w.sky),
  ]
    .filter(Boolean)
    .join(" ");

  const facts = [
    `${date}, ${time}, ${season} in Long Island City, Queens, New York.`,
    sun.sentence,
    `Sky: ${skyLabel.toLowerCase()}, ${cloud}% cloud cover.`,
    falling ? `${falling} is falling right now.` : "No precipitation.",
    `Temperature ${temp}°F, feels like ${feels}°F: ${pick(feels, TEMP_WORDS)}.`,
    `Wind ${wind} mph: ${pick(wind, WIND_WORDS)}.`,
    `Humidity ${humidity}%.`,
    aqi != null ? `Air quality index ${aqi}.` : "",
    `UV index ${uv}.`,
    `Moon phase: ${moon}.`,
  ]
    .filter(Boolean)
    .join(" ");

  return { scene, facts, temp, feels, wind, aqi, uv, moon, skyLabel, cloud, precip, falling, fog, light, humidity, isDark, moonVisible, sunVisible, skyObject, phase: sun.phase };
}

// The display lays large white text over the whole height of the image, so
// every style has to stay legible under it: deep enough tones, no fussy detail
// behind the text, nothing the model might mistake for a place to write.
const TONE =
  "Keep overall values mid to deep, with nothing blown out to white or pale cream, because large white text is overlaid on this image and must stay legible. " +
  "Full bleed to every edge: no border, frame, mat, paper margin or vignette.";
const NO_TEXT = "Absolutely no text, letters, numerals, words, captions, signatures, logos or watermarks anywhere in the image.";
// For the landscape-like styles: subject low, sky doing the work above.
const LOW_SUBJECT =
  "Composition: the subject and all fine detail sit in the bottom third of the tall frame; the upper two thirds is sky, " +
  "rendered with real tonal depth and character but without small busy high-contrast detail.";
// Every image is artwork. Photographic realism is never wanted, whatever the style.
const NOT_PHOTO =
  "This is a hand-made artwork, never a photograph: no photorealism, no photographic or 3D-rendered look, no lens or camera effects. The medium named above must be unmistakable.";
const FINISH = `${NOT_PHOTO} ${TONE} ${NO_TEXT}`;

// Symbol styles draw the sun/moon only when it would really be visible.
const symbol = (d, how) => (d.skyObject ? `${d.skyObject} ${how}` : "no sun or moon at all (hidden by cloud)");

// Each style turns the shared conditions into a very different picture. They
// are deliberately far apart (medium, era, viewpoint, palette) so a day of
// slots doesn't blur together.
export const STYLES = {
  // Painterly view of the LIC waterfront looking at Manhattan.
  skyline: (d) =>
    `Tall vertical painting in rich opaque gouache with confident visible brushwork and a bold, considered color scheme, the craft of a classic mid-century travel poster crossed with an Edward Hopper cityscape. ` +
    `Subject: Gantry Plaza State Park on the Long Island City waterfront in Queens, New York, seen from the shore at eye level, looking west across the East River to the Midtown Manhattan skyline ` +
    `(the Empire State Building, the Chrysler Building's spire, the slab of the UN Secretariat at the water's edge). ` +
    `In the foreground: the two squat black riveted-steel gantry towers standing on their wooden piers, and the vintage Pepsi-Cola sign as a small glowing red neon scrawl, too far away to read. ` +
    `Conditions to paint faithfully: ${d.scene} ` +
    `The sky is the star of the picture. ${LOW_SUBJECT} No people. ${FINISH}`,

  // Abstract poster that encodes each metric as geometry.
  poster: (d) =>
    `Tall vertical abstract data-art poster, a two-color-plus-black risograph print on deep-toned paper with visible grain, halftone and slight ink misregistration; elegant Swiss modernist composition with generous empty space. ` +
    `It encodes the weather as pure geometry, with no labels: ` +
    `the background is a smooth vertical gradient in the real color of the sky right now (${d.light}); ` +
    `a large thin-lined circle in the upper third stands for the moon (${MOON_WORDS[d.moon]}), filled in proportion to its phase; ` +
    `${d.wind < 4 ? "almost no diagonal lines, because the air is still; " : `${Math.min(40, d.wind)} long thin parallel diagonal lines sweep across the frame for a ${d.wind} mph wind; `}` +
    `soft overlapping horizontal bands cover about ${d.cloud} percent of the frame for the cloud cover; ` +
    `one tall narrow vertical bar on the left edge is filled about ${Math.max(0, Math.min(100, d.temp))} percent of its height for the temperature, in ${d.feels <= 45 ? "a cold blue" : d.feels <= 68 ? "a soft green-yellow" : "a hot orange-red"}; ` +
    `a small semicircle on the bottom edge with ${d.uv} short rays stands for the UV index; ` +
    `a single horizontal row of small dots near the bottom, ${d.aqi == null || d.aqi <= 50 ? "sparse and evenly spaced for clean air" : d.aqi <= 100 ? "moderately dense for slightly hazy air" : "dense and crowded for polluted air"}` +
    `${d.falling ? `; fine falling ${d.falling === "snow" ? "dots" : "vertical lines"} over the whole composition for the ${d.falling}` : ""}. ` +
    `${FINISH}`,

  // Linocut looking straight up between LIC towers.
  lookup: (d) =>
    `Tall vertical reduction linocut print in three or four inks, bold carved lines, visible gouge marks and slightly uneven hand-pulled ink: ` +
    `the view looking straight up from a Long Island City street in Queens, New York, between tall residential towers whose facades converge dramatically toward an irregular opening of sky. ` +
    `Strong graphic composition, the towers as deep dark carved masses. ` +
    `The sky in the opening shows these conditions exactly, translated into the print: ${d.scene} ` +
    `${d.isDark ? "A scatter of small warm lit windows cut into the dark facades. " : ""}No signage, no people. ${FINISH}`,

  // Pastel drawing looking out from inside an apartment.
  window: (d) =>
    `Tall vertical drawing in soft pastel and colored pencil on dark toned paper, rich layered color and visible strokes, by a gifted illustrator: ` +
    `the view from inside a dim, quiet Long Island City apartment, looking out through one large steel-framed window over Queens rooftops and wooden water towers ` +
    `to the Manhattan skyline in the distance. The window fills nearly the whole sheet; a radiator, a trailing plant and a mug on the sill are small dark shapes along the bottom edge, ` +
    `and the room is in deep warm shadow. ` +
    `Everything seen through the glass matches these conditions: ${d.scene} ` +
    `${d.falling === "snow" ? "Snow gathering on the outer sill. " : d.falling ? "Raindrops and running streaks on the glass, the view softened behind them. " : ""}` +
    `${d.humidity > 80 && d.feels < 50 ? "A little condensation fogging the corners of the pane. " : ""}` +
    `The sky takes up the upper two thirds of the window. ${FINISH}`,

  // Palette-knife oil painting of the elevated 7 train platform.
  platform: (d) =>
    `Tall vertical oil painting in thick impasto, laid on with a palette knife and broad brushes, the paint texture clearly visible, in the tradition of the Ashcan School painters of New York: ` +
    `the end of the elevated 7 train platform at Queensboro Plaza in Long Island City, looking down the tracks toward Manhattan, ` +
    `steel rails and riveted elevated structure converging into the distance, signal lights as dabs of glowing color, a subway train small and far off, the skyline beyond. ` +
    `Sky, light and weather match these conditions: ${d.scene} ` +
    `${d.falling === "snow" ? "Snow on the platform edge and sleepers. " : d.falling ? "The platform wet and reflective. " : "The platform dry. "}` +
    `${LOW_SUBJECT} No people, no signs. ${FINISH}`,

  // Japanese woodblock print.
  woodblock: (d) =>
    `Tall vertical ukiyo-e woodblock print in the manner of Hiroshige's One Hundred Famous Views of Edo: flat areas of color with visible wood grain, strong dark keyline, ` +
    `and a deep bokashi gradient across the top of the sky. It depicts the East River and the Queensboro Bridge seen from the Long Island City shore, a bare branch or pier post cutting boldly across the foreground. ` +
    `Translate these conditions into the print's visual language: ${d.scene} ` +
    `${d.falling === "snow" ? "Snow as scattered white dots and soft caps on every surface. " : d.falling ? "Rain as fine dark parallel diagonal lines across the whole image. " : ""}` +
    `Clouds as flat stylized bands; the sky in saturated indigo, slate and smoke tones rather than bare paper. ${LOW_SUBJECT} ${FINISH}`,

  // Pixel art.
  pixel: (d) =>
    `Tall vertical 16-bit pixel art scene with crisp chunky pixels, a carefully chosen limited palette and beautiful dithered gradients, in the style of a lovingly made 1990s adventure game background: ` +
    `a Long Island City street corner in Queens, New York with a brick walk-up, a corner bodega with a striped awning, a fire hydrant and a street tree, the Manhattan skyline small on the horizon. ` +
    `Weather and light match these conditions, drawn in pixels: ${d.scene} ` +
    `The sky above the rooftops is a big dithered gradient with pixel clouds, and ${symbol(d, "as a clean pixel disc")}. ${LOW_SUBJECT} No people, blank signs. ${FINISH}`,

  // Illustrated bird's-eye map.
  satellite: (d) =>
    `Tall vertical hand-illustrated bird's-eye map in ink line and flat gouache color, in the manner of a beautifully drawn mid-century pictorial city map: ` +
    `looking straight down on the East River, with Midtown Manhattan's street grid on the left, Long Island City, Queens on the right, ` +
    `Roosevelt Island a long sliver in the channel and the Queensboro Bridge crossing it, buildings as tiny drawn blocks, the river a deep flat color. ` +
    `${d.fog ? "Drawn fog fills the river and streets, with only the tallest towers poking through. " : d.cloud >= 85 ? "A layer of stylized drawn clouds drifts over most of the map, with openings through which the river, the bridge and patches of the grid show clearly. " : d.cloud >= 30 ? "Scattered stylized clouds float over the map, each with its drawn shadow on the city. " : "A completely clear view of the whole city grid. "}` +
    `${d.isDark ? "It is dark: a deep night palette, the streets a lattice of tiny warm dots of light, the river near black, the bridge a string of lights. " : d.phase === "day" ? "" : "The sun is very low: long drawn shadows stretch from every tower. "}` +
    `Palette and atmosphere follow these conditions: ${d.scene} ${FINISH}`,

  // Cut-paper collage.
  collage: (d) =>
    `Tall vertical cut-paper collage in the spirit of Matisse's cut-outs and mid-century children's book illustration: layered matte colored papers with crisp cut and soft torn edges casting small real shadows, ` +
    `a bold and harmonious palette. It shows the Long Island City waterfront: a row of towers, the gantries, a small red sign shape, the river in the bottom third, the Manhattan skyline as a single cut silhouette. ` +
    `Every condition becomes a paper shape: ${d.scene} ` +
    `Clouds as overlapping torn papers, ${symbol(d, "as one cleanly cut paper shape")}` +
    `${d.falling === "snow" ? ", snow as punched white confetti" : d.falling ? ", rain as thin cut paper strips" : ""}${d.wind >= 12 ? ", wind as long curled paper ribbons" : ""}. ` +
    `The sky is a large sheet of deep-colored paper filling the upper two thirds. ${FINISH}`,

  // Loose watercolor.
  watercolor: (d) =>
    `Tall vertical watercolor on rough cold-pressed paper by a master of the medium: big confident wet-on-wet washes, granulating pigment, soft blooms and a few crisp dry-brush accents, ` +
    `painted to the edges of the sheet in rich saturated washes. Subject: the black gantry towers and wooden pier of Gantry Plaza State Park in Long Island City, with the Manhattan skyline as a soft wash across the river. ` +
    `The washes carry these conditions: ${d.scene} ` +
    `${d.falling && d.falling !== "snow" ? "Rain suggested by pigment dragged down the wet sheet. " : ""}` +
    `The sky is one big expressive wash. ${LOW_SUBJECT} No people. ${FINISH}`,

  // Neon synthwave.
  neon: (d) =>
    `Tall vertical 1980s synthwave illustration, airbrushed and glossy: the Manhattan skyline seen from Long Island City as a glowing neon outline, a chrome-dark East River mirroring it, ` +
    `a perspective grid receding across the water, and ${d.skyObject ? `${d.skyObject} as a huge glowing disc behind the skyline` : "a wide soft glow behind the skyline with no sun or moon disc"}. ` +
    `Palette and sky derived from these conditions: ${d.scene} ` +
    `${d.feels <= 50 ? "Cold palette: electric blue, violet and ice cyan. " : d.feels <= 72 ? "Balanced palette: teal, violet and pink. " : "Hot palette: magenta, orange and gold. "}` +
    `Clouds as soft glowing horizontal bands covering about ${d.cloud} percent of the sky${d.falling ? `; ${d.falling === "snow" ? "snow as drifting neon specks" : "rain as fine falling neon lines"}` : ""}. ` +
    `Very dark background. ${LOW_SUBJECT} ${FINISH}`,

  // Charcoal sketch.
  charcoal: (d) =>
    `Tall vertical drawing in charcoal and white chalk on dark slate-grey paper by a superb draughtsman: loose expressive strokes, smudged atmospheric shading, bright chalk for the lights and highlights, ` +
    `plus one single accent color (${d.feels <= 45 ? "a cold blue" : d.feels <= 68 ? "an ochre" : "a warm red-orange"}) used sparingly. Subject: the Queensboro Bridge seen from the Long Island City waterfront, its cantilever trusses crossing the lower third. ` +
    `The drawing depicts these conditions: ${d.scene} ` +
    `Clouds as soft rubbed charcoal and chalk${d.falling === "snow" ? ", snow as stippled chalk dots" : d.falling ? ", rain as vigorous diagonal hatching" : ""}${d.wind >= 12 ? ", wind as swept smudges" : ""}. ` +
    `${LOW_SUBJECT} ${FINISH}`,

  // Flat vector.
  flat: (d) =>
    `Tall vertical flat vector illustration in the style of a contemporary editorial poster: bold simple geometric shapes, no outlines, a strict palette of six sophisticated colors, subtle grain texture. ` +
    `The Long Island City waterfront reduced to essentials: a few stylized towers, the gantries, one small red sign shape, the river as a flat band, the Manhattan skyline as a single silhouette. ` +
    `Weather and light as simple shapes matching these conditions: ${d.scene} ` +
    `In the sky: ${symbol(d, "as a perfect flat shape")}; clouds as rounded flat shapes covering about ${d.cloud} percent of it` +
    `${d.falling === "snow" ? "; snow as small dots" : d.falling ? "; rain as short diagonal dashes" : ""}${d.wind >= 12 ? "; wind as a few curved lines" : ""}. ` +
    `${LOW_SUBJECT} ${FINISH}`,

  // Blueprint / cyanotype.
  blueprint: (d) =>
    `Tall vertical cyanotype blueprint: fine white technical line drawing on deep Prussian blue paper with a faint grid and the mottled texture of a real sun print. ` +
    `An engineer's elevation of a rooftop weather station in Long Island City, drawn with exquisite precision in the bottom third: a cup anemometer, a wind vane, a rain gauge, a thermometer and an aneroid barometer on a mast, ` +
    `with the Manhattan skyline as a thin outline behind. ` +
    `Each instrument is drawn in the state matching these readings, shown by needle positions, fill levels and motion lines, never by labels: ${d.facts} ` +
    `In the upper third, a precise astronomical diagram of the moon at its current phase (${MOON_WORDS[d.moon]}). The rest is empty blue paper. ${FINISH}`,

  // Ligne claire comic panel of a street corner.
  street: (d) =>
    `Tall vertical illustration in the ligne claire tradition of European comics: clean, even ink outlines, flat harmonious color with a few simple shadow shapes, meticulous architectural drawing. ` +
    `A corner of Vernon Boulevard in Long Island City, Queens: a low brick block with a corner deli awning, parked cars, a street tree, fire escapes, a real and specific New York corner. ` +
    `Light and weather match these conditions: ${d.scene} ` +
    `${d.falling === "snow" ? "Fresh snow on the cars and sidewalk. " : d.falling ? "Wet asphalt and puddles reflecting the lights. " : "Dry pavement. "}` +
    `${LOW_SUBJECT} Blank signs, no people. ${FINISH}`,

  // 1930s Art Deco poster.
  artdeco: (d) =>
    `Tall vertical 1930s Art Deco poster, lithographed in a few flat inks with metallic gold accents and fine airbrushed gradients: ` +
    `the towers of Long Island City and the Manhattan skyline stylized into stepped, streamlined monumental forms rising from the East River, the Queensboro Bridge as a sweeping geometric arc, ` +
    `bold symmetry and strong radiating lines in the sky. ` +
    `The sky's rays, bands and palette express these conditions: ${d.scene} ` +
    `In the sky: ${symbol(d, "as a stylized Deco disc with radiating lines")}; clouds as layered streamlined bands` +
    `${d.falling === "snow" ? "; snow as a pattern of small stars" : d.falling ? "; rain as ruled parallel diagonals" : ""}. ` +
    `${LOW_SUBJECT} ${FINISH}`,

  // Subway-station tile mosaic.
  mosaic: (d) =>
    `Tall vertical glazed ceramic tile mosaic in the style of the art mosaics in New York City subway stations: thousands of small hand-cut tesserae with visible grout lines, slight irregularity and a soft glaze sheen. ` +
    `It depicts the Long Island City waterfront: the gantries, the river in rippling bands of tile, the Manhattan skyline as simple tiled silhouettes. ` +
    `Tile colors and patterns express these conditions: ${d.scene} ` +
    `The sky fills the upper two thirds in flowing courses of tile that follow the shapes of the clouds, with ${symbol(d, "as a disc of radiating tiles")}` +
    `${d.falling === "snow" ? "; snow as scattered white tiles" : d.falling ? "; rain as diagonal lines of pale tiles" : ""}. ` +
    `${LOW_SUBJECT} ${FINISH}`,

  // Stained glass.
  stainedglass: (d) =>
    `Tall vertical stained glass window in the manner of Tiffany studios, lit from behind: richly colored, streaked and mottled glass pieces joined by dark lead came, glowing against a dark surround. ` +
    `It shows the Queensboro Bridge and the East River from Long Island City, the skyline as faceted glass shapes. ` +
    `The colors of the glass express these conditions: ${d.scene} ` +
    `The sky is large flowing pieces of streaky glass following the cloud shapes, with ${symbol(d, "as a single round piece of glowing glass")}` +
    `${d.falling === "snow" ? "; snow as small white roundels" : d.falling ? "; rain as thin slanted slivers of pale glass" : ""}. ` +
    `Deep, saturated, jewel-dark glass overall. ${LOW_SUBJECT} ${FINISH}`,

  // Isometric miniature.
  isometric: (d) =>
    `Tall vertical isometric illustration, crisp and charming, in the style of a meticulously drawn editorial infographic: a small floating slab of Long Island City seen from above at a 30 degree isometric angle, ` +
    `with a few towers, a brick warehouse, the gantries on their pier, a slice of the East River and a tiny elevated train, every edge clean, flat colors with soft gradient shading. ` +
    `The slab sits in the lower third against a big plain backdrop that is the color of the sky. The weather happens over the little city, matching these conditions: ${d.scene} ` +
    `Small stylized clouds hover over the slab covering about ${d.cloud} percent of it` +
    `${d.falling === "snow" ? ", dropping tiny snowflakes that settle on the roofs" : d.falling ? ", dropping tiny rain streaks, the streets wet" : ""}` +
    `${d.isDark ? "; it is dark, so the tiny windows and street lamps are lit" : ""}; ${symbol(d, "as a simple disc above")}. ${FINISH}`,

  // Meteorological chart.
  isobar: (d) =>
    `Tall vertical hand-drafted meteorological chart in fine white and pale-colored ink on deep slate-green paper, like a beautiful vintage synoptic weather map: ` +
    `sweeping concentric isobar contour lines, wind barbs, station-model circles, front lines with their triangles and semicircles, and a faint outline of the New York harbor coastline with Long Island City marked by a small ring. ` +
    `No labels or figures; everything is line and symbol. The chart is drawn for these readings: ${d.facts} ` +
    `${d.wind >= 20 ? "The isobars are packed tightly together, with long wind barbs. " : d.wind >= 8 ? "The isobars are moderately spaced, with short wind barbs. " : "The isobars are wide apart and lazy, with almost no wind barbs. "}` +
    `${d.falling ? `Fine hatching marks the area of ${d.falling}. ` : ""}` +
    `${d.cloud >= 85 ? "The station circles are fully filled in for overcast sky. " : d.cloud >= 30 ? "The station circles are half filled for partial cloud. " : "The station circles are open for clear sky. "}` +
    `Elegant, sparse composition with large areas of empty paper. ${FINISH}`,

  // Antique engraved almanac plate.
  engraving: (d) =>
    `Tall vertical antique copperplate engraving printed in cream-white ink on very dark indigo paper, like a plate from a 19th century atlas of the heavens and the weather: ` +
    `exquisitely fine cross-hatching and stipple. In the lower third, an engraved view of the East River with the Queensboro Bridge and the Manhattan skyline. ` +
    `Above it, the sky is engraved as a study of the atmosphere under these conditions: ${d.scene} ` +
    `Clouds built from swirling parallel engraved lines${d.falling === "snow" ? ", snow as fine stipple" : d.falling ? ", rain as long ruled diagonals" : ""}${d.wind >= 12 ? ", wind as long flowing streamlines" : ""}, ` +
    `and ${symbol(d, "engraved with radiating lines")}. One restrained second ink color, used sparingly. ${FINISH}`,
};

// Picks the prompt style. "random" chooses any style other than `avoid` (the
// previous slot's style) so consecutive slots never look alike.
export function buildPrompt(weather, now, styleName, avoid) {
  const names = Object.keys(STYLES);
  let style = styleName;
  if (!STYLES[style]) {
    const pool = names.filter((n) => n !== avoid);
    style = pool[Math.floor(Math.random() * pool.length)];
  }
  return { style, prompt: STYLES[style](describe(weather, now)) };
}

// ---------------------------------------------------------------------------
// Image provider: Gemini Nano Banana on Vertex AI, authenticated with
// Application Default Credentials (no API key). ADC is found automatically
// from GOOGLE_APPLICATION_CREDENTIALS (a service-account JSON file), from
// `gcloud auth application-default login`, or from the GCE metadata server.
// ---------------------------------------------------------------------------

const SCOPES = ["https://www.googleapis.com/auth/cloud-platform"];

// Vertex endpoint for a model. Nano Banana 2.1 is only served from "global".
export function vertexUrl({ project, location, model }) {
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
}

export async function vertexGenerate(prompt, cfg, fetchFn = fetch) {
  const token = await cfg.auth.getAccessToken();
  const res = await fetchFn(vertexUrl(cfg), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": cfg.project,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "9:16", imageSize: cfg.size },
      },
    }),
  });
  if (!res.ok) throw new Error(`vertex ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error("vertex returned no image: " + JSON.stringify(json).slice(0, 300));
  const ext = /png/.test(part.inlineData.mimeType) ? "png" : "jpg";
  // Image output is billed at $30 per million tokens; a 1K image is a flat
  // 1120 tokens ($0.0336) on Nano Banana 2.1. Prefer the reported count.
  const tokens =
    json.usageMetadata?.candidatesTokensDetails?.find((d) => d.modality === "IMAGE")?.tokenCount ?? 1120;
  return { buffer: Buffer.from(part.inlineData.data, "base64"), ext, tokens, usd: (tokens / 1e6) * 30 };
}

// Resolves credentials and project up front. Returns null (generation off)
// when ADC can't be found or no project is known, and says why.
export async function createProvider(env = process.env, log = console.log) {
  const cfg = {
    project: env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT,
    location: env.GOOGLE_CLOUD_LOCATION || "global",
    model: env.IMAGE_MODEL || "gemini-nano-banana-2.1",
    size: env.IMAGE_SIZE || "1K", // "2K" is sharper on a 4K panel but costs more per image
  };
  try {
    cfg.auth = new GoogleAuth({ scopes: SCOPES });
    await cfg.auth.getClient();
    if (!cfg.project) cfg.project = await cfg.auth.getProjectId().catch(() => undefined);
  } catch (err) {
    log(`[visuals] no Google credentials found (${err.message}); backdrop generation off. See .env.example.`);
    return null;
  }
  if (!cfg.project) {
    log("[visuals] credentials found but no project: set GOOGLE_CLOUD_PROJECT in .env. Backdrop generation off.");
    return null;
  }
  return { name: `vertex:${cfg.project}`, model: cfg.model, generate: (prompt) => vertexGenerate(prompt, cfg) };
}

// ---------------------------------------------------------------------------
// Slot manager
// ---------------------------------------------------------------------------

export function createVisuals({ dir, provider, designer = null, style = "random", log = console.log }) {
  const images = new Map(); // slot -> meta
  let lastSeen = 0;
  let generating = null; // slot currently being generated
  let lastFailure = null; // { slot, at, error }
  let weatherCache = null; // { at, data }

  async function load() {
    await mkdir(dir, { recursive: true });
    for (const f of await readdir(dir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const meta = JSON.parse(await readFile(join(dir, f), "utf8"));
        images.set(meta.slot, meta);
      } catch {}
    }
    log(`[visuals] loaded ${images.size} image(s) from ${dir}`);
  }

  async function weather() {
    if (weatherCache && Date.now() - weatherCache.at < 10 * 60 * 1000) return weatherCache.data;
    const data = await fetchConditions();
    weatherCache = { at: Date.now(), data };
    return data;
  }

  async function prune() {
    const slots = [...images.keys()].sort((a, b) => b - a);
    for (const slot of slots.slice(KEEP)) {
      const meta = images.get(slot);
      images.delete(slot);
      await Promise.allSettled([unlink(join(dir, meta.file)), unlink(join(dir, `${slot}.json`))]);
    }
  }

  async function generate(slot) {
    generating = slot;
    const started = Date.now();
    try {
      const w = await weather();
      // Describe conditions as of the slot's start (or now, if generating late).
      const at = new Date(Math.max(slot, Date.now()));
      const previous = latestBefore(slot)?.style;
      const { style: used, prompt } = buildPrompt(w, at, style, previous);
      log(`[visuals] generating slot ${new Date(slot).toISOString()} (${used}, ${provider.name}/${provider.model})`);
      const { buffer, ext, tokens, usd } = await provider.generate(prompt);
      const file = `${slot}.${ext}`;
      // Have the readout layout designed for this particular image. Optional:
      // without it the display uses the built-in layout for the style.
      let layout = null;
      if (designer) {
        try {
          const d = await designer.design({ buffer, ext, style: used });
          layout = d.layout;
          log(`[layout] ${designer.name} (~$${d.usd.toFixed(4)}): ${d.rationale}`);
        } catch (err) {
          log(`[layout] failed, using the built-in ${used} layout: ${String(err.message || err).slice(0, 200)}`);
        }
      }
      const meta = { slot, file, url: `/generated/${file}?v=${Date.now().toString(36)}`, style: used, layout, prompt, provider: provider.name, model: provider.model, createdAt: new Date().toISOString(), ms: Date.now() - started, tokens, usd };
      await writeFile(join(dir, file), buffer);
      await writeFile(join(dir, `${slot}.json`), JSON.stringify(meta, null, 2));
      images.set(slot, meta);
      lastFailure = null;
      log(`[visuals] done in ${Math.round(meta.ms / 1000)}s -> ${file}` + (usd != null ? ` (${tokens} tokens, ~$${usd.toFixed(4)})` : ""));
      await prune();
    } catch (err) {
      lastFailure = { slot, at: Date.now(), error: String(err.message || err) };
      log(`[visuals] failed: ${lastFailure.error}`);
    } finally {
      generating = null;
    }
  }

  // Runs every TICK_MS. Decides whether anything needs generating.
  function tick() {
    if (!provider || generating) return;
    const now = Date.now();
    if (now - lastSeen > VIEWER_TIMEOUT_MS) return; // nobody watching
    if (lastFailure && now - lastFailure.at < RETRY_MS) return;
    const cur = slotOf(now);
    const nxt = cur + SLOT_MS;
    if (!images.has(cur) && !latestBefore(cur)) return void generate(cur); // cold start: nothing to show yet
    if (!images.has(nxt) && nxt - now <= LEAD_MS) return void generate(nxt);
    if (!images.has(cur)) return void generate(cur); // we have something old on screen; refresh it
  }

  const latestBefore = (slot) => {
    let best = null;
    for (const m of images.values()) if (m.slot <= slot && (!best || m.slot > best.slot)) best = m;
    return best;
  };

  // Called by the API: marks a viewer as present and returns what to show.
  function snapshot() {
    lastSeen = Date.now();
    const cur = slotOf(lastSeen);
    const strip = (m) => m && { slot: m.slot, url: m.url, style: m.style, layout: m.layout || null, createdAt: m.createdAt };
    return {
      enabled: Boolean(provider),
      now: lastSeen,
      slotMs: SLOT_MS,
      current: strip(images.get(cur) || latestBefore(cur)),
      next: strip(images.get(cur + SLOT_MS)),
      generating: generating ? new Date(generating).toISOString() : null,
      lastError: lastFailure?.error || null,
    };
  }

  function start() {
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }

  return { load, start, snapshot, tick, generate, images };
}

// Tiny .env loader (no dependency): KEY=value lines, # comments, optional quotes.
export async function loadDotenv(path) {
  try {
    for (const line of (await readFile(path, "utf8")).split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
      if (!m || line.trim().startsWith("#")) continue;
      if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {}
}

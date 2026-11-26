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
import { fetchToday, factFor } from "./src/lib/today.js";

export const SLOT_MS = 15 * 60 * 1000;
const LEAD_MS = 12 * 60 * 1000; // start the next slot's image this long before it begins
const VIEWER_TIMEOUT_MS = 2 * 60 * 1000; // no poll for this long = nobody watching
const RETRY_MS = 90 * 1000; // wait this long after a failed generation
const TICK_MS = 15 * 1000;
// Images are kept on disk for this long, then deleted; the /gallery page shows
// what is kept. About 2 MB each, so three days of a screen that is always on
// (288 images) is roughly 600 MB. The newest few are kept whatever their age,
// so the display always has something to show.
export const KEEP_MS = Math.max(0.1, Number(process.env.IMAGE_KEEP_DAYS) || 3) * 24 * 60 * 60 * 1000;
const KEEP_MIN = 12;

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

// What the display's readouts showed for an image when it was made: the time,
// the weather figures and the "today" fact. Saved with the image so the
// gallery can show it exactly as it appeared, not with today's data.
let todayCache = null; // { at, facts }
export async function snapshotReadout(w, at, slot) {
  if (!todayCache || Date.now() - todayCache.at > 60 * 60 * 1000) {
    todayCache = { at: Date.now(), facts: await fetchToday().catch(() => todayCache?.facts || []) };
  }
  return {
    at: at.toISOString(),
    weather: {
      temperature_2m: w.temperature_2m,
      weather_code: w.weather_code,
      uv_index: w.uv_index,
      aqi: w.aqi,
      daily: { sunrise: w.daily?.sunrise, sunset: w.daily?.sunset },
    },
    fact: factFor(todayCache.facts, slot),
  };
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
// Every image is artwork. Photographic realism is never wanted, whatever the style.
const NOT_PHOTO =
  "This is a hand-made artwork, never a photograph: no photorealism, no photographic or 3D-rendered look, no lens or camera effects. The medium named above must be unmistakable.";
const FINISH = `${NOT_PHOTO} ${TONE} ${NO_TEXT}`;

// For the styles on a light ground (paper, a reflective LCD), where the
// readouts are set in dark ink instead.
const TONE_LIGHT =
  "Composition: everything drawn sits small and low, strictly within the bottom quarter of the tall frame. The top three quarters is kept light, even and quiet, with nothing there darker than a pale tint and no drawn detail, because dark text is overlaid on it and must stay legible. " +
  "The sheet itself runs full bleed to every edge: no border, frame, mat, margin, binding, desk or vignette.";
const FINISH_LIGHT = `${NOT_PHOTO} ${TONE_LIGHT} ${NO_TEXT}`;

// Symbol styles draw the sun/moon only when it would really be visible.
const symbol = (d, how) => (d.skyObject ? `${d.skyObject} ${how}` : "no sun or moon at all (hidden by cloud)");

// Each style turns the shared conditions into a very different picture, and
// each is a matched pair: it is designed together with its lettering (see
// STYLE_TYPE in src/lib/layout.js), so the picture leaves the right kind of
// space for it: dark glowing sky for an LED clock, open paper for handwriting.
export const STYLES = {

  // Neon megacity, under a seven-segment LED clock.
  cyberpunk: (d) =>
    `Tall vertical background painting from a hand-painted cyberpunk anime of the late 1980s: gouache and airbrush on board, dense with lovingly drawn detail, every edge painted by hand. ` +
    `Long Island City, Queens imagined as a neon megacity. In the bottom third: a canyon of stacked towers along the East River waterfront, elevated train lines threading between them, ` +
    `the old black gantry towers dwarfed at the water's edge, rooftop water tanks, ducts, cables and plumes of steam, and glowing sign panels in magenta, cyan and amber that are blank shapes of light with no characters on them, ` +
    `all of it mirrored in wet streets and the river; beyond, the Manhattan skyline as a wall of lit megastructures. ` +
    `The real weather and hour drive the scene, pushed through this world's palette: ${d.scene} ` +
    `${d.isDark ? "The neon does the lighting. " : "It is daytime: keep it daylit and true to those conditions, but heavy and smog-laden, deep teal and violet in the shadows, the signs still burning. "}` +
    `The upper two thirds is one deep, low-contrast, smog-dark sky in the hue of the real sky deepened in value, with soft colored glow rising into it from the city, ` +
    `because a glowing segment-display clock hangs there. No people, no vehicles in the sky. ${FINISH}`,

  // Urban sketcher's pencil page, under handwritten notes.
  sketchbook: (d) =>
    `Tall vertical page of an urban sketcher's sketchbook, the cream paper itself filling the frame: a quick, confident graphite pencil drawing with visible paper tooth, ` +
    `searching construction lines left in, loose directional hatching, a few thumb-smudged tones and a handful of dark accents pressed in with a soft pencil. ` +
    `Drawn on location, small, along the bottom quarter of the page: the gantry towers and wooden pier of Gantry Plaza State Park in Long Island City, the East River, and the Manhattan skyline set down in a few sure lines. ` +
    `Just above the skyline the sky is only suggested: a few faint looping strokes for cloud` +
    `${d.falling === "snow" ? ", scattered dots for snow" : d.falling ? ", quick slanting strokes for rain" : ""}${d.wind >= 12 ? ", a couple of sweeping lines for the wind" : ""}` +
    `${d.skyObject ? `, and ${d.skyObject} as a simple drawn outline` : ""}, all of it close to the skyline, leaving the rest of the page as open paper. ` +
    `What the sketch records, in pencil tone and mark-making only, never in color: ${d.scene} ` +
    `${d.isDark ? "It is dark out: say so with denser hatching low in the sky and lit windows left as specks of bare paper, while the sheet as a whole stays light. " : ""}` +
    `No people, and no handwriting or notes of any kind. ${FINISH_LIGHT}`,

  // Isometric city-builder pixel art, under pixel type.
  isopixel: (d) =>
    `Tall vertical isometric pixel art in the style of a classic 1990s isometric city-building game: hand-placed pixels on a strict 2:1 isometric grid, a limited palette of about 32 colors, ` +
    `crisp one-pixel outlines, checkerboard dithering, no anti-aliasing, no blur, no gradients that are not dithered. ` +
    `A diamond-shaped piece of Long Island City, Queens fills the lower half: brick warehouses, glass residential towers, the black gantry towers on their pier, the elevated 7 train on its steel viaduct, ` +
    `rooftop water tanks, tiny parked cars, street trees, and a strip of the East River in repeating water tiles. ` +
    `Behind and above it the sky is one broad dithered gradient with blocky pixel clouds covering about ${d.cloud} percent of it, and ${symbol(d, "as a clean pixel disc")}. ` +
    `The weather and light of this moment, drawn in pixels: ${d.scene} ` +
    `${d.falling === "snow" ? "Snow lies on every roof tile and falls as single white pixels. " : d.falling ? "Rain falls as short diagonal pixel streaks and the streets shine. " : ""}` +
    `${d.isDark ? "It is dark, so windows and street lamps are lit pixels. " : ""}` +
    `No people, no interface, no cursor. ${FINISH}`,

  // Full-color LED dot-matrix sign, under dot-matrix type.
  dotmatrix: (d) =>
    `Tall vertical image built entirely from round glowing LED dots on a matte black panel, like a close view of a huge full-color LED dot-matrix sign: ` +
    `one perfectly regular grid about 72 dots wide running to every edge, each dot a separate soft-edged point of light with black between, the picture formed only by which dots are lit, how brightly and in what color. ` +
    `The picture on the sign, in the bottom third: the Manhattan skyline and the Queensboro Bridge seen across the East River from Long Island City, simplified to what so coarse a grid can hold. ` +
    `Above it the sky is a field of dim dots carrying the color and brightness of the real sky: ${d.scene} ` +
    `Clouds are patches of ${d.isDark ? "slightly brighter" : "paler"} dots` +
    `${d.falling === "snow" ? ", snow is scattered single bright dots" : d.falling ? ", rain is short falling columns of lit dots" : ""}; ${symbol(d, "as a bright disc of dots")}. ` +
    `Keep the sky dots dim, because a readout in brighter dots is overlaid on them. ${FINISH}`,

  // Chalk on a blackboard, under chalk lettering.
  chalkboard: (d) =>
    `Tall vertical chalk drawing on a real slate blackboard that fills the frame: deep green-black slate carrying the ghosts of old erasings and a haze of chalk dust, ` +
    `drawn by a gifted sign artist in soft white chalk and a few colored chalks (pale yellow, dusty blue, brick red), every stroke dry, grainy and visibly made by hand. ` +
    `Along the bottom quarter: the Long Island City waterfront with its gantry towers and pier, the East River, and the Manhattan skyline in outline with a little side-of-the-chalk shading. ` +
    `In a band of sky just above the skyline: ${symbol(d, "drawn in chalk")}; clouds as a few light chalk outlines, ${d.cloud >= 85 ? "one overlapping the next the whole way across" : d.cloud >= 30 ? "scattered across it" : "one or two at most"}` +
    `${d.falling === "snow" ? "; snow as dabbed chalk dots" : d.falling ? "; rain as quick slanting chalk dashes" : ""}${d.wind >= 12 ? "; wind as long curling chalk lines" : ""}. ` +
    `The drawing shows these conditions: ${d.scene} The slate always stays dark; the conditions change what is drawn and how heavily the sky is dusted with chalk. ` +
    `The drawing, sky included, stays small and low, within the bottom third of the board. The top two thirds is clean dark slate with nothing drawn on it, only dust and old erasings, because chalk lettering goes there. No writing of any kind. ${FINISH}`,

  // Vector graphics on a phosphor monitor, under terminal type.
  crt: (d) =>
    `Tall vertical image of vector graphics glowing on the black glass of a vintage phosphor monitor: razor-thin luminous lines in ${d.feels <= 45 ? "cold cyan-green" : d.feels <= 72 ? "green" : "amber"} phosphor, ` +
    `each with a soft bloom, brighter where lines cross, faint horizontal scanlines, nothing filled in. ` +
    `In the bottom third a wireframe model of the Manhattan skyline and the Queensboro Bridge stands on a perspective grid of water receding to the horizon. ` +
    `The black sky above carries the weather as vector symbols: ` +
    `${d.cloud >= 10 ? `clouds as ${d.cloud >= 85 ? "an unbroken row" : d.cloud >= 30 ? "a broken row" : "one or two"} of small wireframe outlines just above the skyline` : "no clouds"}; ${symbol(d, "as an outlined circle")}` +
    `${d.falling === "snow" ? "; snow as small falling crosses" : d.falling ? "; rain as short falling line segments" : ""}${d.wind >= 12 ? "; wind as long horizontal streamlines" : ""}` +
    `${d.isDark && d.cloud < 30 ? "; stars as single points" : ""}. ` +
    `Drawn for these readings, shown by line and symbol only: ${d.facts} ` +
    `Mostly black, sparse and precise: everything drawn stays within the bottom 40 percent, and the top 60 percent is empty black glass with at most a few faint falling marks, because terminal text is displayed there. ${FINISH}`,

  // Naturalist's journal in ink and watercolor, under a typewritten label.
  fieldnotes: (d) =>
    `Tall vertical page from a naturalist's field journal, the paper itself filling the frame: fine sepia ink line and delicate transparent watercolor on warm off-white laid paper with a little foxing. ` +
    `In the bottom third, a small, closely observed watercolor study of the Long Island City shore: the gantry towers, the pier pilings, the East River and the far Manhattan skyline. ` +
    `Directly above it, pale and airy, a low band of today's sky in thin washes that keep the lightness of the paper` +
    `${d.skyObject ? `, with ${d.skyObject} as a small ink-outlined disc` : ""}, and one or two tiny marginal studies tucked beside it (a leaf or seed head of the season, a gull). ` +
    `It records these conditions: ${d.scene} ` +
    `${d.isDark ? "It is dark out: say so with a deeper wash low in the sky and warm specks for lit windows, while the page as a whole stays light. " : ""}` +
    `No writing, labels or numbers anywhere, and no ruled border or frame line around the page. ${FINISH_LIGHT}`,

  // 1960s comic-book panel, under comic lettering.
  popart: (d) =>
    `Tall vertical pop-art comic panel in the manner of 1960s American comics printing: heavy black brush-inked outlines, flat process colors, coarse Ben-Day dots for every tone, ` +
    `plates slightly off register on cheap newsprint. ` +
    `In the bottom third: the Long Island City waterfront, its gantry towers, and the Manhattan skyline across the East River, drawn with comic-book drama. ` +
    `The sky fills the upper two thirds as one big simple field of Ben-Day dots in a single deep color, with a few bold outlined cloud shapes covering about ${d.cloud} percent of it; ` +
    `${symbol(d, "as a bold flat disc with a black outline")}` +
    `${d.falling === "snow" ? "; snow as fat white dots" : d.falling ? "; rain as bold black diagonal slashes" : ""}${d.wind >= 12 ? "; wind as sweeping speed lines" : ""}. ` +
    `The weather is this, exaggerated the way a comic would: ${d.scene} ` +
    `No speech balloons, no caption boxes, no sound-effect lettering, no panel border. ${FINISH}`,

  // Book-of-hours miniature, under blackletter.
  manuscript: (d) =>
    `Tall vertical illuminated miniature from a medieval book of hours, filling the whole page with no decorated border and no script: egg tempera and burnished gold leaf on vellum, ` +
    `flat jewel colors, fine dark outlines, charmingly naive perspective, tiny patterned details. ` +
    `In the bottom third, Long Island City and Manhattan as a medieval illuminator would picture them: a walled city of slender towers on the far bank of a river of curling stylized waves, ` +
    `the Queensboro Bridge as a many-arched stone bridge, little ships on the water, a few trees of the season on the near shore. ` +
    `The upper two thirds is the heavens: a deep ${d.isDark ? "midnight ultramarine" : "ultramarine or slate-blue"} field; ` +
    `${symbol(d, d.isDark ? "as a gilded shape with a calm face" : "as a gilded disc with a calm face and fine rays")}; clouds as scalloped ribbon-like bands covering about ${d.cloud} percent of it` +
    `${d.falling === "snow" ? "; snow as small white dots" : d.falling ? "; rain as fine parallel silver strokes" : ""}${d.isDark && d.cloud < 30 ? "; small gold stars" : ""}. ` +
    `It illustrates this very hour: ${d.scene} ${FINISH}`,

  // Four-shade handheld-console LCD, under pixel type in the darkest shade.
  handheld: (d) =>
    `Tall vertical pixel art exactly as shown on the reflective LCD of an early-1990s handheld game console: only four shades (pale pea green, light olive, dark olive, near-black green), ` +
    `big square pixels on a faintly visible pixel grid, flat fills and coarse ordered dithering, no other colors at all. ` +
    `In the bottom third: a side-on scene of the Long Island City waterfront, the gantry towers on their pier, a strip of river, and the Manhattan skyline as a dark-olive silhouette with a few recognizable spires. ` +
    `The sky fills the upper two thirds in the palest shade with only light dithering: clouds as simple light-olive pixel shapes covering about ${d.cloud} percent of it; ${symbol(d, "as a small pixel disc")}` +
    `${d.falling === "snow" ? "; snow as single dark pixels" : d.falling ? "; rain as short diagonal pixel dashes" : ""}. ` +
    `These conditions, reduced to four shades: ${d.scene} ` +
    `${d.isDark ? "It is dark out: show it with a band of dither low in the sky and lit windows as pale pixels, but keep the sky as a whole pale. " : ""}${FINISH_LIGHT}`,

  // Spray-paint stencil on concrete, between huge stencilled numerals.
  stencil: (d) =>
    `Tall vertical street-art piece: spray paint through hand-cut multi-layer stencils on a weathered dark concrete wall that fills the frame, crisp stencil edges with soft overspray, a few drips, ` +
    `three or four flat paint colors plus black and white. ` +
    `The stencilled picture occupies only the middle third of the wall, as a wide band: the Manhattan skyline and the Queensboro Bridge over the East River, cut into bold stencil shapes with bridges between the islands of each layer, ` +
    `under a stencilled sky with ${symbol(d, "as one clean sprayed disc")}, clouds as flat sprayed shapes covering about ${d.cloud} percent of it` +
    `${d.falling === "snow" ? ", snow as sprayed dots" : d.falling ? ", rain as sprayed diagonal dashes" : ""}. ` +
    `Its colors and mood follow these conditions: ${d.scene} ` +
    `The stencilled picture is kept strictly between one third and two thirds of the way down the wall. The top third and the bottom third are bare wall: dark stained concrete with form-tie holes, hairline cracks and faint ghosts of buffed-out paint, ` +
    `kept plain because large stencilled numerals go there. No tags, no lettering, no posters. ${FINISH}`,

  // Wood engraving on a letterpress broadside, under wood type.
  letterpress: (d) =>
    `Tall vertical letterpress broadside on thick warm cream cotton paper that fills the frame: a single wood engraving printed in dense black ink with one soft second color, ` +
    `the ink a little uneven and salty, the impression visibly pressed into the paper. ` +
    `The engraving is a wide, shallow vignette across the bottom quarter of the sheet: the Long Island City waterfront with its gantry towers, the East River and the Manhattan skyline, cut in fine parallel lines in the manner of a 19th century wood engraver. ` +
    `Its sky is a low band, rising only a little way above the skyline, in engraved lines (clouds as swelling parallel lines` +
    `${d.falling === "snow" ? ", snow as white flecks" : d.falling ? ", rain as ruled diagonals" : ""}${d.skyObject ? `, ${d.skyObject} with fine radiating lines` : ""}) and then fades out raggedly into clean paper. ` +
    `It depicts these conditions, in line and the one second color only: ${d.scene} ` +
    `${d.isDark ? "It is dark out: the engraved sky is densely cut and the windows are left as specks of paper, while the sheet above stays clean. " : ""}` +
    `All the rest of the sheet is blank paper, kept clean for wood type printed over it. No type, ornaments or rules. ${FINISH_LIGHT}`,
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
    const cutoff = Date.now() - KEEP_MS;
    for (const slot of slots.slice(KEEP_MIN).filter((t) => t < cutoff)) {
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
      const readout = await snapshotReadout(w, at, slot).catch(() => null);
      const meta = { slot, file, url: `/generated/${file}?v=${Date.now().toString(36)}`, style: used, layout, readout, prompt, provider: provider.name, model: provider.model, createdAt: new Date().toISOString(), ms: Date.now() - started, tokens, usd };
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

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
import { fetchWeather, WMO, moonPhase, toDate } from "./src/lib/sky.js";

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

// Where we are relative to sunrise/sunset, and what the light looks like.
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
  if (!next) return { light: "daylight", sentence: "" };
  const toNext = mins(next);
  const sincePrev = prev ? mins(prev) : null;
  let light;
  if (next.label === "sunset") {
    if (sincePrev != null && sincePrev < 45) light = "the first low golden light just after sunrise";
    else if (toNext < 60) light = "low, warm golden-hour light with long shadows, the sun close to setting";
    else light = "full daylight";
  } else {
    if (sincePrev != null && sincePrev < 40) light = "deep blue dusk right after sunset, a last band of color on the horizon";
    else if (toNext < 40) light = "pre-dawn twilight, the sky just starting to lighten";
    else light = "full night, city lights on";
  }
  return {
    light,
    sentence: `It is ${fmt(toNext)} before ${next.label}` + (prev ? ` and ${fmt(sincePrev)} after ${prev.label}` : "") + ".",
  };
}

// Turn a weather reading + timestamp into the facts every style shares.
export function describe(w, now = new Date()) {
  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ });
  const month = Number(now.toLocaleString("en-US", { month: "numeric", timeZone: TZ })) - 1;
  const day = Number(now.toLocaleString("en-US", { day: "numeric", timeZone: TZ }));
  const temp = Math.round(w.temperature_2m);
  const feels = Math.round(w.apparent_temperature ?? w.temperature_2m);
  const wind = Math.round(w.wind_speed_10m ?? 0);
  const [, skyLabel] = WMO[w.weather_code] || ["", "unsettled sky"];
  const sun = sunContext(w.daily, now);
  const moon = moonPhase(now);
  const aqi = w.aqi;
  const uv = Math.round(w.uv_index ?? 0);
  const precip = w.precipitation ?? 0;
  const cloud = Math.round(w.cloud_cover ?? 0);
  const isDark = /night|dusk|twilight/.test(sun.light);

  const facts = [
    `${date}, ${time}, ${monthWord({ month, phase: day <= 10 ? 0 : day <= 20 ? 1 : 2 })} in Long Island City, Queens, New York.`,
    sun.sentence,
    `The light is ${sun.light}.`,
    `Sky: ${skyLabel.toLowerCase()}, ${Math.round(w.cloud_cover ?? 0)}% cloud cover.`,
    precip > 0 ? `Precipitation is falling right now (${precip} mm in the last hour).` : "",
    `Temperature ${temp}°F, feels like ${feels}°F: ${pick(feels, TEMP_WORDS)}.`,
    `Wind ${wind} mph: ${pick(wind, WIND_WORDS)}.`,
    `Humidity ${Math.round(w.relative_humidity_2m ?? 0)}%.`,
    aqi != null ? `Air quality index ${aqi}: ${pick(aqi, AQI_WORDS)}.` : "",
    isDark ? `UV index ${uv} (night).` : `UV index ${uv}${uv <= 2 ? ", very weak sun" : uv >= 8 ? ", harsh bright sun" : ""}.`,
    `Moon phase: ${moon}, ${MOON_WORDS[moon]}` +
      (cloud >= 85 ? ", hidden behind the cloud deck" : isDark ? " visible in the sky" : ", faint in the daytime sky if visible at all") +
      ".",
  ]
    .filter(Boolean)
    .join(" ");

  return { facts, temp, feels, wind, aqi, uv, moon, skyLabel, cloud: Math.round(w.cloud_cover ?? 0), precip, light: sun.light, humidity: Math.round(w.relative_humidity_2m ?? 0) };
}

const NO_TEXT =
  "Absolutely no text, letters, numerals, words, logos or watermarks anywhere in the image. " +
  "Keep the upper half and the center of the frame calm and uncluttered so large text overlaid on top stays legible.";

// Each style turns the shared facts into a very different picture. They are
// deliberately far apart (medium, era, viewpoint, palette) so a day of slots
// doesn't blur together. Every one ends with NO_TEXT and keeps the upper and
// middle of the frame quiet for the overlaid readouts.
export const STYLES = {
  // Painterly view of the LIC waterfront looking at Manhattan.
  skyline: (d) =>
    `Tall vertical painterly illustration, gouache and soft pastel texture, of the Long Island City waterfront in Queens, New York, ` +
    `looking west across the East River toward the Manhattan skyline, with the red Pepsi-Cola sign and the Gantry Plaza cranes small in the lower third. ` +
    `Depict these exact conditions faithfully: ${d.facts} ` +
    `Muted, desaturated palette appropriate to the season and light. Large calm areas of sky in the upper two thirds. ` +
    `No people in the foreground. ${NO_TEXT}`,

  // Abstract poster that encodes each metric as geometry.
  poster: (d) =>
    `Tall vertical abstract generative-art poster encoding weather data as geometry, in the style of a screen-printed risograph data visualization with slight ink misregistration. ` +
    `Background: a soft vertical gradient of the actual sky right now in New York, matching ${d.light}, ${d.skyLabel.toLowerCase()}. ` +
    `A large thin-lined circle near the top represents the moon: ${MOON_WORDS[d.moon]}, filled in proportion to the phase. ` +
    `A horizontal row of exactly ${Math.max(1, Math.min(200, d.aqi ?? 50))} tiny evenly spaced dots represents the air quality index of ${d.aqi ?? 50}. ` +
    `${Math.max(0, Math.min(40, d.wind))} long diagonal streaks sweep across the frame representing a ${d.wind} mph wind${d.wind < 4 ? " (so almost no streaks)" : ""}. ` +
    `A small sun glyph at the bottom edge with ${d.uv} rays represents a UV index of ${d.uv}. ` +
    `A thermometer-like vertical bar on one side filled to about ${Math.max(0, Math.min(100, d.temp))} percent represents ${d.temp}°F. ` +
    `Soft overlapping horizontal cloud bands cover about ${d.cloud} percent of the middle of the frame. ` +
    `${d.precip > 0 ? "Fine vertical rain or snow lines fall across the whole composition. " : ""}` +
    `Context: ${d.facts} ${NO_TEXT}`,

  // Cinematic shot looking straight up between LIC towers.
  lookup: (d) =>
    `Tall vertical cinematic photograph on medium format film with soft grain, looking straight up from a Long Island City street in Queens, New York, ` +
    `between the glass facades of tall residential towers so the buildings converge toward a narrow slice of sky at the top of the frame. ` +
    `Render these exact conditions: ${d.facts} ` +
    `Dark, moody tones with the facades reflecting the real sky, the frame mostly dark so bright overlaid text reads clearly. ` +
    `No signage, no people. ${NO_TEXT}`,

  // Looking out from inside an apartment.
  window: (d) =>
    `Tall vertical photograph from inside a quiet Long Island City apartment, looking out through a large window at the Queens rooftops and water towers, ` +
    `the Manhattan skyline faint in the distance. The window glass fills most of the frame; the room edge (a radiator, a plant on the sill, a mug) is small and dark at the bottom. ` +
    `What is seen through the glass must match these exact conditions: ${d.facts} ` +
    `${d.precip > 0 ? "Rain or snow streaks and droplets on the glass, the view beyond softened. " : ""}` +
    `${d.humidity > 80 ? "A little condensation fogging the corners of the pane. " : ""}` +
    `Soft natural light, warm interior shadow, cool exterior. ${NO_TEXT}`,

  // Elevated 7 train platform.
  platform: (d) =>
    `Tall vertical photograph from the elevated 7 train platform at Queensboro Plaza in Long Island City, looking down the tracks toward Manhattan, ` +
    `steel canopy and rails leading into the distance, a purple 7 train small and far off. ` +
    `The sky, light and weather must match these exact conditions: ${d.facts} ` +
    `Long exposure feel, wet or dry platform as the weather dictates, 35mm color negative film look. ` +
    `The upper half of the frame is open sky above the canopy. No people, no signage. ${NO_TEXT}`,

  // Japanese woodblock print.
  woodblock: (d) =>
    `Tall vertical ukiyo-e woodblock print in the manner of Hiroshige, flat colors with visible wood grain and bokashi gradients, ` +
    `depicting the East River and the Queensboro Bridge seen from the Long Island City shore. ` +
    `Translate these exact conditions into the print's visual language: ${d.facts} ` +
    `Rain as fine diagonal lines, wind as bent reeds and stretched clouds, cold as pale indigo and white, warmth as ochre and vermilion, ` +
    `the moon phase shown exactly in the sky, clouds as flat stylized bands. Large areas of plain paper-colored sky at the top. ${NO_TEXT}`,

  // Pixel art.
  pixel: (d) =>
    `Tall vertical 16-bit pixel art scene, chunky visible pixels, limited 32-color palette, of a Long Island City street corner in Queens, New York ` +
    `with a bodega awning, a fire hydrant, a brick walk-up and the Manhattan skyline on the horizon. ` +
    `The weather and light must match these exact conditions, drawn with pixel-art sprites (pixel raindrops, pixel snow, pixel clouds, a pixel sun or moon of the right phase): ${d.facts} ` +
    `Mostly flat sky in the upper two thirds so overlaid text reads. No people, no signage. ${NO_TEXT}`,

  // Satellite view.
  satellite: (d) =>
    `Tall vertical satellite image looking straight down at the East River with Long Island City, Queens on the right and Midtown Manhattan on the left, ` +
    `Roosevelt Island in the channel, the Queensboro Bridge crossing the frame. Photorealistic earth-observation rendering. ` +
    `The cloud layer, haze, shadows and lighting must match these exact conditions: ${d.facts} ` +
    `${d.cloud >= 70 ? "Thick cloud cover hides most of the ground, with only breaks showing the river. " : d.cloud >= 30 ? "Scattered clouds casting shadows on the city. " : "Clear view of the whole city grid. "}` +
    `${d.light.includes("night") ? "Night: the city is a lattice of warm lights, the river black. " : ""}` +
    `Keep the center of the frame relatively even in tone. ${NO_TEXT}`,

  // Cut-paper collage.
  collage: (d) =>
    `Tall vertical cut-paper collage in a mid-century modern style, layered colored papers with visible torn and cut edges and subtle shadows, ` +
    `of the Long Island City skyline, the Pepsi-Cola sign and the river. ` +
    `Every weather fact is a paper shape: ${d.facts} ` +
    `Clouds as torn grey paper, rain as thin paper strips, the sun or moon as a punched circle of the right phase, wind as curled paper ribbons, cold as blues and whites, warmth as oranges. ` +
    `Big plain paper sky at the top. ${NO_TEXT}`,

  // Loose watercolor.
  watercolor: (d) =>
    `Tall vertical loose watercolor painting on cold-pressed paper, wet-on-wet washes, bleeding edges, lots of untouched white paper, ` +
    `of the Gantry Plaza gantries and pier in Long Island City with the Manhattan skyline as a faint wash behind. ` +
    `The washes must carry these exact conditions: ${d.facts} ` +
    `${d.precip > 0 ? "Drips and spatters of rain running down the sheet. " : ""}` +
    `Sky as one big expressive wash covering the top two thirds. No people. ${NO_TEXT}`,

  // Neon synthwave.
  neon: (d) =>
    `Tall vertical 1980s synthwave illustration: a glowing neon outline of the Manhattan skyline seen from Long Island City, a chrome-reflective East River, ` +
    `a perspective grid floor fading into the distance, and a huge sun or moon disc behind the skyline showing the exact phase. ` +
    `Palette and sky derived from these exact conditions: ${d.facts} ` +
    `Cold weather shifts the palette to electric blue and violet, warm weather to magenta and orange; clouds as glowing horizontal neon bands covering ${d.cloud} percent of the sky; ` +
    `rain as falling neon lines. Dark background overall so overlaid text glows. ${NO_TEXT}`,

  // Charcoal sketch.
  charcoal: (d) =>
    `Tall vertical charcoal and graphite sketch on toned paper, loose expressive strokes, smudged shading, white chalk highlights, ` +
    `of the Queensboro Bridge from the Long Island City waterfront. Monochrome except for one accent color chosen by the weather. ` +
    `The sketch depicts these exact conditions: ${d.facts} ` +
    `Rain as vigorous diagonal hatching, wind as swept smudges, the moon phase drawn precisely in chalk, clouds as soft rubbed charcoal. ` +
    `Leave the upper half of the paper mostly bare. ${NO_TEXT}`,

  // Flat vector.
  flat: (d) =>
    `Tall vertical flat vector illustration, bold simple geometric shapes, no outlines, no gradients, a strict six-color palette, ` +
    `of the Long Island City waterfront: a few stylized towers, the Pepsi-Cola sign as a red shape, the river as a flat band, the skyline as a silhouette. ` +
    `Weather and light as simple symbols that match these exact conditions: ${d.facts} ` +
    `A sun or moon circle with the exact phase, clouds as rounded blobs covering ${d.cloud} percent of the sky, rain as short dashes, wind as curved lines. ` +
    `Large flat sky color at the top. ${NO_TEXT}`,

  // Blueprint / cyanotype.
  blueprint: (d) =>
    `Tall vertical cyanotype blueprint, white line drawing on deep Prussian blue paper with faint grid, ` +
    `an engineer's elevation drawing of a rooftop weather station in Long Island City: an anemometer, a wind vane, a rain gauge, a thermometer, a barometer, ` +
    `with the skyline as a thin outline behind. ` +
    `Each instrument is drawn in the state matching these exact conditions, using needle positions, fill levels and vane direction rather than labels: ${d.facts} ` +
    `The moon drawn as a precise astronomical diagram of its current phase in the upper corner. Keep the upper center empty blue paper. ${NO_TEXT}`,

  // Long-exposure night / day street photo.
  street: (d) =>
    `Tall vertical street photograph on Vernon Boulevard in Long Island City, Queens: a low brick block, a corner deli awning, parked cars, bare or leafy trees as the season dictates, ` +
    `shot on a 28mm lens with a slightly tilted horizon, documentary color film look. ` +
    `Light and weather must match these exact conditions: ${d.facts} ` +
    `${d.precip > 0 ? "Wet asphalt reflecting the lights, umbrellas absent, puddles. " : ""}` +
    `The street sits in the lower third; the upper two thirds is sky and building tops. No readable signage, no people's faces. ${NO_TEXT}`,
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
        imageConfig: { aspectRatio: "9:16", imageSize: "1K" },
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

export function createVisuals({ dir, provider, style = "random", log = console.log }) {
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
    const data = await fetchWeather();
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
      const meta = { slot, file, url: `/generated/${file}`, style: used, prompt, provider: provider.name, model: provider.model, createdAt: new Date().toISOString(), ms: Date.now() - started, tokens, usd };
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
    const strip = (m) => m && { slot: m.slot, url: m.url, style: m.style, createdAt: m.createdAt };
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

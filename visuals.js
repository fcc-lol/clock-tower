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
    `UV index ${uv}${uv <= 2 ? ", very weak sun" : uv >= 8 ? ", harsh bright sun" : ""}.`,
    `Moon phase: ${moon}, ${MOON_WORDS[moon]}${sun.light.includes("night") || sun.light.includes("dusk") ? " visible in the sky" : ", faint in the daytime sky if visible at all"}.`,
  ]
    .filter(Boolean)
    .join(" ");

  return { facts, temp, feels, wind, aqi, uv, moon, skyLabel, cloud: Math.round(w.cloud_cover ?? 0), precip, light: sun.light, humidity: Math.round(w.relative_humidity_2m ?? 0) };
}

const NO_TEXT =
  "Absolutely no text, letters, numerals, words, logos or watermarks anywhere in the image. " +
  "Keep the upper half and the center of the frame calm and uncluttered so large text overlaid on top stays legible.";

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
};

export function buildPrompt(weather, now, styleName) {
  const names = Object.keys(STYLES);
  const style = STYLES[styleName] ? styleName : names[Math.floor(Math.random() * names.length)];
  return { style, prompt: STYLES[style](describe(weather, now)) };
}

// ---------------------------------------------------------------------------
// Image providers
// ---------------------------------------------------------------------------

async function openaiGenerate(prompt, cfg) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.model || "gpt-image-2.5-flare",
      prompt,
      n: 1,
      size: cfg.size || "1024x1824",
      quality: cfg.quality || "medium",
      output_format: "jpeg",
      output_compression: 85,
      moderation: "low",
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  // gpt-image-2.5 bills $30 per million image output tokens.
  const tokens = json.usage?.output_tokens;
  return { buffer: Buffer.from(json.data[0].b64_json, "base64"), ext: "jpg", tokens, usd: tokens != null ? (tokens / 1e6) * 30 : undefined };
}

async function geminiGenerate(prompt, cfg) {
  const model = cfg.model || "gemini-nano-banana-2.1";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": cfg.key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: "9:16", imageSize: "1K" },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error("gemini returned no image");
  const ext = /png/.test(part.inlineData.mimeType) ? "png" : "jpg";
  // Image output is billed at $30 per million tokens; a 1K image is a flat
  // 1120 tokens ($0.0336) on Nano Banana 2.1. Prefer the reported count.
  const tokens =
    json.usageMetadata?.candidatesTokensDetails?.find((d) => d.modality === "IMAGE")?.tokenCount ?? 1120;
  return { buffer: Buffer.from(part.inlineData.data, "base64"), ext, tokens, usd: (tokens / 1e6) * 30 };
}

// Gemini (Nano Banana) is the default; set IMAGE_PROVIDER=openai for GPT Image.
export function providerFromEnv(env = process.env) {
  const provider = (env.IMAGE_PROVIDER || "gemini").toLowerCase();
  const key = provider === "openai" ? env.OPENAI_API_KEY : env.GEMINI_API_KEY;
  if (!key) return null;
  const cfg = { key, model: env.IMAGE_MODEL, quality: env.IMAGE_QUALITY, size: env.IMAGE_SIZE };
  const fn = provider === "openai" ? openaiGenerate : geminiGenerate;
  return { name: provider, model: cfg.model || (provider === "openai" ? "gpt-image-2.5-flare" : "gemini-nano-banana-2.1"), generate: (prompt) => fn(prompt, cfg) };
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
      const { style: used, prompt } = buildPrompt(w, at, style);
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

// Made-up but plausible conditions, in exactly the shape the live data hub
// produces (see data.js), so any visualization can be looked at in any
// weather, at any hour, in any season, without waiting for the real thing.
// Used by the gallery, by `?wx=` / `?at=` / `?scenario=` on the display and
// runner pages, and by scripts/shoot.js. Everything here is deterministic.

import { sunPosition, sunTimes } from "./astro.js";
import { mix, ramp, adjust } from "./color.js";
import { zoned, zonedToUtc, startOfDay } from "./time.js";

const HOUR = 3600 * 1000;
const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------------------------------------------------------------------------
// A model of the sky's color, standing in for the camera on One Vanderbilt
// (which reports the real color in four directions). Also used by state.js
// whenever there is no fresh camera reading.
// ---------------------------------------------------------------------------

const alt01 = (alt) => clamp((alt + 18) / 78);
const at = (alt, color) => [alt01(alt), color];
const CLEAR = ramp([
  at(-18, "#05070f"), at(-12, "#0a1024"), at(-9, "#121b3d"), at(-6, "#22305f"), at(-3, "#445488"),
  at(0, "#7088b8"), at(3, "#7fa3d6"), at(10, "#6aa3e0"), at(30, "#4f8fdc"), at(60, "#3d7fd0"),
]);
const CLOUDY = ramp([
  at(-18, "#1d1b1c"), at(-9, "#2a2a30"), at(-6, "#3b3e48"), at(-3, "#5a606c"),
  at(0, "#7a808a"), at(6, "#9aa2ab"), at(20, "#b1bac2"), at(60, "#bcc4cb"),
]);
const GLOW = ramp([at(-11, "#3a2f5e"), at(-8, "#6a3f78"), at(-5, "#b5557a"), at(-2, "#e8795a"), at(1, "#f29a54"), at(5, "#f6c56b"), at(9, "#e9d9a6")]);

const DIRECTIONS = { west: 270, northWest: 315, northEast: 45, east: 90 };

// { west, northWest, northEast, east } as "#rrggbb" for an instant, a cloud
// fraction (0-1) and what is falling (null, "rain", "snow", "storm"...).
export function modelSky(ms, cloud = 0, falling = null, fog = false) {
  const sun = sunPosition(ms);
  const out = {};
  for (const [name, bearing] of Object.entries(DIRECTIONS)) {
    let clear = CLEAR(alt01(sun.alt));
    // Toward the sun, low on the horizon, the sky warms.
    const off = Math.abs((((sun.az - bearing) % 360) + 540) % 360 - 180);
    const near = Math.exp(-((off / 60) ** 2));
    const low = sun.alt > -11 && sun.alt < 9 ? Math.sin(((sun.alt + 11) / 20) * Math.PI) : 0;
    clear = mix(clear, GLOW(alt01(sun.alt)), near * low * 0.8);
    // Even at midday the sky is paler toward the sun and deeper away from it.
    if (sun.alt > 0) clear = adjust(clear, { l: (l) => l + 0.07 * (near - 0.35) * Math.min(1, sun.alt / 10) });
    let c = mix(clear, CLOUDY(alt01(sun.alt)), Math.pow(clamp(cloud), 1.2));
    if (fog) c = mix(c, mix("#34353a", "#c2c6c8", clamp((sun.alt + 6) / 12)), 0.6);
    if (falling === "storm") c = adjust(c, { l: (l) => l * 0.62, c: (v) => v * 0.8 });
    else if (falling === "snow") c = adjust(c, { l: (l) => l * 0.96 + 0.03, c: (v) => v * 0.6 });
    else if (falling) c = adjust(c, { l: (l) => l * 0.8, c: (v) => v * 0.85 });
    out[name] = c;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Weather presets: the reading "right now". `temp` is only a default; a
// scenario usually sets its own for the season.
// ---------------------------------------------------------------------------

export const PRESETS = {
  clear: { code: 0, cloud: 3, temp: 72, wind: 6, gust: 10, humidity: 45, precip: 0, aqi: 38, visibility: 10 },
  partly: { code: 2, cloud: 45, temp: 66, wind: 9, gust: 16, humidity: 52, precip: 0, aqi: 44, visibility: 10 },
  overcast: { code: 3, cloud: 100, temp: 51, wind: 10, gust: 24, humidity: 80, precip: 0, aqi: 30, visibility: 9 },
  fog: { code: 45, cloud: 100, temp: 44, wind: 2, gust: 4, humidity: 98, precip: 0, aqi: 62, visibility: 0.2 },
  drizzle: { code: 53, cloud: 100, temp: 52, wind: 7, gust: 12, humidity: 93, precip: 0.02, aqi: 28, visibility: 4 },
  rain: { code: 63, cloud: 100, temp: 55, wind: 12, gust: 22, humidity: 92, precip: 0.14, aqi: 24, visibility: 3 },
  downpour: { code: 65, cloud: 100, temp: 61, wind: 18, gust: 31, humidity: 96, precip: 0.5, aqi: 20, visibility: 1 },
  storm: { code: 95, cloud: 100, temp: 74, wind: 24, gust: 44, humidity: 90, precip: 0.65, aqi: 35, visibility: 1.5 },
  snow: { code: 73, cloud: 100, temp: 27, wind: 9, gust: 17, humidity: 88, precip: 0.05, snowfall: 0.5, aqi: 33, visibility: 0.8 },
  blizzard: { code: 75, cloud: 100, temp: 19, wind: 30, gust: 48, humidity: 90, precip: 0.12, snowfall: 1.4, aqi: 30, visibility: 0.15 },
  windy: { code: 1, cloud: 22, temp: 49, wind: 28, gust: 45, humidity: 38, precip: 0, aqi: 26, visibility: 10 },
  heat: { code: 1, cloud: 14, temp: 97, wind: 5, gust: 9, humidity: 62, precip: 0, aqi: 152, visibility: 5 },
  cold: { code: 0, cloud: 0, temp: 9, wind: 16, gust: 27, humidity: 36, precip: 0, aqi: 41, visibility: 10 },
};

// Named moments worth looking at. `at` is New York local time.
export const SCENARIOS = {
  "clear-noon-summer": { at: "2026-07-14T12:40", wx: "clear", temp: 84, note: "cloudless July midday, high sun, UV 9" },
  "overcast-afternoon-fall": { at: "2026-11-27T14:45", wx: "overcast", temp: 51, note: "flat grey late-November afternoon" },
  "golden-partly-spring": { at: "2026-04-22T19:12", wx: "partly", temp: 63, note: "golden hour, half cloud, half an hour before sunset" },
  "rain-dusk-fall": { at: "2026-10-08T18:44", wx: "rain", temp: 55, note: "steady rain at dusk, just after sunset" },
  "overcast-sunset-fall": { at: "2026-11-27T16:27", wx: "overcast", temp: 49, note: "the sun on the horizon, half light: where a light ground is turning dark" },
  "clear-night-fullmoon-winter": { at: "2027-01-22T21:30", wx: "cold", temp: 18, wind: 7, gust: 12, note: "clear, bitter January night under a full moon" },
  "snow-morning-winter": { at: "2027-01-08T08:10", wx: "snow", temp: 27, note: "snow falling on a January morning" },
  "storm-night-summer": { at: "2026-08-03T23:20", wx: "storm", temp: 74, note: "thunderstorm on a summer night, strong gusty wind" },
  "fog-dawn-spring": { at: "2026-03-15T06:52", wx: "fog", temp: 41, note: "thick fog at dawn, still air" },
  "heat-afternoon-summer": { at: "2026-07-21T15:30", wx: "heat", temp: 97, note: "hazy heat wave afternoon, AQI 152" },
  "windy-midnight-newmoon": { at: "2026-12-09T00:00", wx: "windy", temp: 9, cloud: 5, code: 0, note: "12:00 AM exactly (the widest time), new moon, gale, 9 degrees" },
  "blizzard-evening-winter": { at: "2027-02-02T17:40", wx: "blizzard", temp: 19, note: "blizzard at nightfall" },
  "offline-morning": { at: "2026-05-05T10:08", wx: null, note: "no data at all: only the clock and what can be computed" },
};

// The ones a new piece is checked against first. (Every scenario: Object.keys(SCENARIOS).)
export const CORE_SCENARIOS = ["clear-noon-summer", "overcast-afternoon-fall", "overcast-sunset-fall", "rain-dusk-fall", "clear-night-fullmoon-winter", "snow-morning-winter", "storm-night-summer"];

const FACTS = [
  { label: "Today is", value: "National Bavarian Cream Pie Day" },
  { label: "On this day in 1895", value: "Alfred Nobel Signs the Will That Establishes the Nobel Prizes" },
  { label: "In bloom now", value: "Witch Hazel" },
  { label: "Today is", value: "Pins and Needles Day" },
  { label: "On this day in 1924", value: "The First Macy's Thanksgiving Day Parade" },
  { label: "In bloom now", value: "Thanksgiving Cactus" },
];

// ---------------------------------------------------------------------------

// "2026-07-14T12:40" (New York) -> epoch ms.
function parseLocal(s) {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d?):(\d\d)(?::(\d\d))?)?$/.exec(s);
  if (!m) return NaN;
  return zonedToUtc(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

// Reads an `at` value: epoch ms, a New York local date-time, "HH:MM" today, or
// a part of the day ("dawn", "sunrise", "morning", "noon", "afternoon",
// "golden", "sunset", "dusk", "night", "midnight") on the day of `base`.
export function parseAt(value, base = Date.now()) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (/^\d{11,}$/.test(s)) return Number(s);
  if (/^\d{4}-\d\d-\d\d/.test(s)) {
    const t = parseLocal(s);
    return Number.isNaN(t) ? null : t;
  }
  const day = startOfDay(base);
  const hm = /^(\d\d?):(\d\d)$/.exec(s);
  if (hm && (+hm[1] > 23 || +hm[2] > 59)) return null;
  if (hm) {
    const z = zoned(day + 12 * HOUR);
    return zonedToUtc(z.year, z.month, z.day, +hm[1], +hm[2]);
  }
  const sun = sunTimes(day + 12 * HOUR);
  const local = (h, min = 0) => {
    const z = zoned(day + 12 * HOUR);
    return zonedToUtc(z.year, z.month, z.day, h, min);
  };
  const named = {
    midnight: () => day,
    dawn: () => (sun.civilDawn + sun.rise) / 2,
    sunrise: () => sun.rise + 10 * 60000,
    morning: () => local(9, 30),
    noon: () => sun.noon,
    afternoon: () => local(15, 0),
    golden: () => sun.set - 35 * 60000,
    sunset: () => sun.set - 3 * 60000,
    dusk: () => sun.set + 22 * 60000,
    night: () => local(22, 30),
  };
  return named[s.toLowerCase()] ? Math.round(named[s.toLowerCase()]()) : null;
}

// Works out what to simulate from URL parameters (scenario, wx, at). Returns
// null when none are given (use live data and the real clock), else
// { wx, ms, overrides, name }: `wx` is a preset name, null for "no data at
// all", or "live" (only together with the real clock); `ms` null means "the
// real clock".
export function resolveSim(params, now = Date.now()) {
  const get = (k) => (typeof params.get === "function" ? params.get(k) : params[k]);
  const scenario = SCENARIOS[get("scenario")];
  const wxParam = get("wx");
  const atParam = get("at");
  if (!scenario && !wxParam && !atParam) return null;
  let wx = scenario ? scenario.wx : "live";
  let ms = scenario ? parseLocal(scenario.at) : null;
  const overrides = {};
  if (scenario) for (const k of ["temp", "wind", "gust", "cloud", "code", "humidity", "aqi", "precip"]) if (scenario[k] != null) overrides[k] = scenario[k];
  if (wxParam) wx = wxParam === "none" || wxParam === "offline" ? null : PRESETS[wxParam] ? wxParam : wxParam === "live" ? "live" : wx;
  // A scenario's own figures (84 degrees at noon in July) belong to its weather, not to another preset.
  if (scenario && wx !== scenario.wx) for (const k of Object.keys(overrides)) delete overrides[k];
  if (atParam) ms = parseAt(atParam, now) ?? ms;
  // Live readings belong to the real present: at any other instant, simulate.
  if (wx === "live" && ms != null) wx = "partly";
  return { wx, ms, overrides, name: get("scenario") || null };
}

// A clock that can be started at another instant and run at another speed.
// With no `at` it is the real clock. Returns () => epoch ms.
export function createClock({ at = null, rate = 1 } = {}) {
  if (at == null && rate === 1) return () => Date.now();
  const t0 = performance.now();
  const start = at ?? Date.now();
  return () => start + (performance.now() - t0) * rate;
}

// Uniform-ish UV index from the sun's height and the cloud.
const uvOf = (ms, cloud01) => {
  const alt = sunPosition(ms).alt;
  if (alt <= 0) return 0;
  return 10.5 * Math.pow(Math.sin((alt * Math.PI) / 180), 1.35) * (1 - 0.72 * cloud01 * cloud01);
};

// The whole data bundle for one weather preset at one instant.
export function simulate({ wx = "overcast", ms = Date.now(), overrides = {} } = {}) {
  const empty = { weather: null, air: null, sky: null, skyDay: [], tides: null, facts: [], fetched: {}, simulated: true };
  if (!wx || !PRESETS[wx]) return empty;
  const p = { ...PRESETS[wx], ...overrides };
  // The variation belongs to the preset, not the hour, so a time-lapse does not lurch.
  const seed = [...wx].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 9973, 7);
  const cloud0 = clamp(p.cloud / 100);
  const hod = (t) => {
    const z = zoned(t);
    return z.hour + z.minute / 60;
  };
  const wave = (h) => Math.cos(((h - 15) / 24) * Math.PI * 2);
  const amp = 9 - 6 * cloud0;
  const mean = p.temp - amp * wave(hod(ms));
  const trend = (hash(seed) - 0.5) * 8; // degrees per day
  const wet = p.precip > 0;
  const kind = [71, 73, 75, 77, 85, 86].includes(p.code) ? "snow" : [95, 96, 99].includes(p.code) ? "storm" : wet ? "rain" : null;

  const windWave = (dh) => 0.85 + 0.3 * Math.sin(dh / 4.2 + hash(seed + 2) * 6);
  // Conditions `dh` hours from now: the preset fades toward ordinary weather.
  const f = (t) => {
    const dh = (t - ms) / HOUR;
    const w = Math.exp(-Math.abs(dh) / 9);
    const drift = 22 * Math.sin(dh / 6.5 + hash(seed + 1) * 6);
    const cloud = clamp((p.cloud * w + (42 + drift) * (1 - w)) / 100) * 100;
    const temp = mean + amp * wave(hod(t)) + (trend * dh) / 24;
    const wind = Math.max(0, (p.wind * (0.55 + 0.45 * w) * windWave(dh)) / windWave(0));
    const precip = wet ? p.precip * w * w * (0.6 + 0.8 * hash(seed + Math.round(dh) * 7.3)) : 0;
    const pop = wet ? clamp(0.12 + 0.88 * w) * 100 : clamp(0.04 + 0.18 * (cloud / 100) * hash(seed + Math.round(dh) * 3.1)) * 100;
    const code = Math.abs(dh) < 3 ? p.code : precip > 0.01 ? (kind === "snow" ? 71 : 61) : cloud > 85 ? 3 : cloud > 30 ? 2 : cloud > 10 ? 1 : 0;
    const chill = temp < 50 ? Math.min(1.2, (50 - temp) / 40) * wind * 0.35 : 0;
    const muggy = temp > 80 ? ((temp - 80) * (p.humidity - 40)) / 55 : 0;
    return {
      ms: t,
      temp,
      feels: temp - chill + Math.max(0, muggy),
      humidity: clamp(p.humidity / 100 + (1 - w) * 0.1 * Math.sin(dh / 5)) * 100,
      cloud,
      pop,
      precip,
      code,
      wind,
      windDir: (((p.windDir ?? 250) + 40 * Math.sin(dh / 9 + hash(seed + 3) * 6)) % 360 + 360) % 360,
      uv: uvOf(t, cloud / 100),
      pressure: (wet ? 1004 : cloud0 > 0.7 ? 1010 : 1021) + 6 * Math.sin(dh / 14 + hash(seed + 4) * 6),
    };
  };

  const hourly = [];
  const first = startOfDay(ms, -1);
  for (let t = first; t < first + 96 * HOUR; t += HOUR) hourly.push(f(t));
  const daily = [];
  for (let d = -1; d <= 2; d++) {
    const a = startOfDay(ms, d);
    const b = startOfDay(ms, d + 1);
    const temps = hourly.filter((h) => h.ms >= a && h.ms < b).map((h) => h.temp);
    const uvs = hourly.filter((h) => h.ms >= a && h.ms < b).map((h) => h.uv);
    daily.push({ ms: a, high: Math.max(...temps), low: Math.min(...temps), uvMax: Math.max(...uvs) });
  }
  const nowv = f(ms);
  const current = {
    temp: p.temp,
    feels: p.feels ?? p.temp - (p.temp < 50 ? Math.min(1.2, (50 - p.temp) / 40) * p.wind * 0.35 : 0) + (p.temp > 80 ? ((p.temp - 80) * (p.humidity - 40)) / 55 : 0),
    humidity: p.humidity,
    dewPoint: p.temp - (100 - p.humidity) / 2.8,
    code: p.code,
    cloud: p.cloud,
    precip: p.precip,
    snowfall: p.snowfall ?? 0,
    wind: p.wind,
    gust: p.gust,
    windDir: nowv.windDir,
    pressure: nowv.pressure,
    uv: p.uv ?? uvOf(ms, cloud0),
    visibility: p.visibility,
  };

  const fog = p.code === 45 || p.code === 48;
  const skyAt = (t) => {
    const v = f(t);
    const near = Math.abs(t - ms) < 3 * HOUR;
    return modelSky(t, v.cloud / 100, near ? kind : v.precip > 0.01 ? "rain" : null, near && fog);
  };
  const quarter = 15 * 60000;
  const lastSample = Math.floor(ms / quarter) * quarter;
  const skyDay = [];
  for (let t = first; t <= lastSample; t += quarter) skyDay.push({ ms: t, ...skyAt(t) });

  // Semidiurnal tide around a real high water at Hunters Point (2026-11-27 15:02 UTC).
  const M2 = 12.4206 * HOUR;
  const ref = Date.UTC(2026, 10, 27, 15, 2);
  const k0 = Math.floor((ms - 30 * HOUR - ref) / M2);
  const tides = [];
  for (let k = k0; ref + k * M2 < ms + 54 * HOUR; k++) {
    const even = ((k % 2) + 2) % 2 === 0;
    tides.push({ ms: ref + k * M2, ft: even ? 5.8 : 4.3, kind: "high" });
    tides.push({ ms: ref + (k + 0.5) * M2, ft: even ? -0.5 : -0.2, kind: "low" });
  }

  const offset = Math.floor(ms / quarter) % FACTS.length;
  return {
    weather: { at: ms - 4 * 60000, current, hourly, daily },
    air: { at: ms - 20 * 60000, aqi: p.aqi, pm25: p.aqi * 0.24, pm10: p.aqi * 0.3, ozone: 40 + p.aqi * 0.3, no2: 14 },
    sky: { at: lastSample, colors: skyAt(lastSample) },
    skyDay,
    tides,
    facts: FACTS.map((_, i) => FACTS[(i + offset) % FACTS.length]),
    fetched: { weather: ms, air: ms, sky: ms, skyDay: ms, tides: ms, facts: ms },
    simulated: true,
  };
}

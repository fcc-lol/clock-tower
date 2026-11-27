// Live data for the display: fetches every source, keeps the last good copy of
// each, and hands the bundle to whoever is drawing. All sources are free and
// need no key. The bundle is plain JSON (it is posted to the visualization's
// iframe and cached in localStorage):
//
//   weather  { at, current, hourly: [...], daily: [...] }   Open-Meteo
//   air      { at, aqi, pm25, pm10, ozone, no2 }             Open-Meteo air quality
//   sky      { at, colors: { west, northWest, northEast, east } }   NYC Sky Colors (a camera on One Vanderbilt)
//   skyDay   [{ ms, west, northWest, northEast, east }]      the same, every 15 min, yesterday and today
//   tides    [{ ms, ft, kind: "high" | "low" }]              NOAA predictions, Hunters Point (East River)
//   facts    [{ label, value }]                              Today API
//   fetched  { weather: ms, ... }                            when each last arrived
//
// Units: deg F, mph, inches (per hour for rates), hPa, miles, percent.
// Nothing here throws at the caller: a source that fails keeps its old value.

import { LAT, LON } from "./astro.js";
import { dateKey, startOfDay } from "./time.js";
import { fetchToday } from "./today.js";

const MIN = 60 * 1000;

const OM = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}`;
const OM_UNITS = `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timeformat=unixtime&timezone=America%2FNew_York`;
export const WEATHER_URL =
  OM +
  `&current=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,weather_code,cloud_cover,precipitation,snowfall,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,uv_index,visibility` +
  `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,cloud_cover,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,uv_index,pressure_msl` +
  `&daily=temperature_2m_max,temperature_2m_min,uv_index_max&past_days=1&forecast_days=3` +
  OM_UNITS;
// The short query the display used before the forecast was added: tried when
// the full one is refused, so the readouts never depend on the extras.
export const WEATHER_URL_BASIC =
  OM + `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,uv_index,cloud_cover,precipitation` + OM_UNITS;
export const AIR_URL =
  `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}` +
  `&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide&timeformat=unixtime&timezone=America%2FNew_York`;
export const SKY_URL = "https://nyc-sky-colors.fcc.lol/api";
// Hunters Point, Newtown Creek: the NOAA tide station at Long Island City.
export const TIDE_STATION = "8517847";
export const tideUrl = (begin, end) =>
  `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${begin}&end_date=${end}&station=${TIDE_STATION}` +
  `&product=predictions&datum=MLLW&time_zone=gmt&interval=hilo&units=english&format=json`;

const num = (v, fallback = null) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

// A request that never settles would stop its source for good, so each one
// gets a time limit.
const TIMEOUT_MS = 20000;

async function getJson(url, fetchFn) {
  const res = await fetchFn(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw Object.assign(new Error(json?.reason || `HTTP ${res.status}`), { status: res.status });
  return json;
}

function shapeWeather(wx) {
  const c = wx.current;
  if (!c || num(c.temperature_2m) == null) throw new Error("weather unavailable");
  // "current" precipitation is the total over the last `interval` seconds (15 minutes): make it a rate per hour.
  const perHour = 3600 / (num(c.interval) > 0 ? c.interval : 3600);
  const current = {
    temp: c.temperature_2m,
    feels: num(c.apparent_temperature, c.temperature_2m),
    humidity: num(c.relative_humidity_2m, 60),
    dewPoint: num(c.dew_point_2m),
    code: num(c.weather_code, 2),
    cloud: num(c.cloud_cover, 40),
    precip: num(c.precipitation, 0) * perHour,
    snowfall: num(c.snowfall, 0) * perHour,
    wind: num(c.wind_speed_10m, 0),
    gust: num(c.wind_gusts_10m),
    windDir: num(c.wind_direction_10m),
    pressure: num(c.pressure_msl),
    uv: num(c.uv_index, 0),
    visibility: num(c.visibility) != null ? c.visibility / 5280 : null, // feet -> miles
  };
  const h = wx.hourly;
  const hourly = (h?.time || []).map((t, i) => ({
    ms: t * 1000,
    temp: num(h.temperature_2m?.[i], current.temp),
    feels: num(h.apparent_temperature?.[i], current.feels),
    humidity: num(h.relative_humidity_2m?.[i], current.humidity),
    cloud: num(h.cloud_cover?.[i], current.cloud),
    pop: num(h.precipitation_probability?.[i], 0),
    precip: num(h.precipitation?.[i], 0),
    code: num(h.weather_code?.[i], current.code),
    wind: num(h.wind_speed_10m?.[i], current.wind),
    windDir: num(h.wind_direction_10m?.[i], current.windDir ?? 250),
    uv: num(h.uv_index?.[i], 0),
    pressure: num(h.pressure_msl?.[i], current.pressure ?? 1016),
  }));
  const d = wx.daily;
  const daily = (d?.time || []).map((t, i) => ({
    ms: t * 1000,
    high: num(d.temperature_2m_max?.[i]),
    low: num(d.temperature_2m_min?.[i]),
    uvMax: num(d.uv_index_max?.[i]),
  }));
  return { at: num(c.time) != null ? c.time * 1000 : Date.now(), current, hourly, daily };
}

export async function fetchWeather(fetchFn = fetch) {
  try {
    return shapeWeather(await getJson(WEATHER_URL, fetchFn));
  } catch (err) {
    // Only when the fuller query itself is refused. A passing network error
    // must not swap a complete reading for one with no forecast.
    if (err?.status !== 400) throw err;
    return shapeWeather(await getJson(WEATHER_URL_BASIC, fetchFn));
  }
}

export async function fetchAir(fetchFn = fetch) {
  const c = (await getJson(AIR_URL, fetchFn)).current;
  if (!c || num(c.us_aqi) == null) throw new Error("air quality unavailable");
  return { at: c.time * 1000, aqi: c.us_aqi, pm25: num(c.pm2_5), pm10: num(c.pm10), ozone: num(c.ozone), no2: num(c.nitrogen_dioxide) };
}

const HEX = /^#[0-9a-f]{6}$/i;
const shapeColors = (c) => {
  const out = { west: c?.west, northWest: c?.["north-west"], northEast: c?.["north-east"], east: c?.east };
  return Object.values(out).every((v) => HEX.test(v || "")) ? out : null;
};

// The sky's color right now. Null (not an error) when the camera has nothing fresh.
export async function fetchSky(fetchFn = fetch) {
  const d = await getJson(SKY_URL, fetchFn);
  const colors = shapeColors(d.colors);
  const at = d.metadata?.lastUpdated?.timestamp;
  if (!colors || !at || d.metadata?.isHistoricalData) return null;
  return { at, colors };
}

// Every reading for yesterday and today (New York dates), oldest first. Readings
// already held (`prev`) are kept, so one failed request does not lose a day.
export async function fetchSkyDay(fetchFn = fetch, now = Date.now(), prev = null) {
  const days = await Promise.all(
    [dateKey(now, -1), dateKey(now)].map((key) => getJson(`${SKY_URL}?date=${key}`, fetchFn).catch(() => null)),
  );
  if (!days.some(Boolean)) throw new Error("sky history unavailable");
  const out = (Array.isArray(prev) ? prev : []).filter((e) => e && e.ms > now - 49 * 60 * MIN);
  for (const day of days) {
    for (const it of Array.isArray(day?.intervals) ? day.intervals : []) {
      const colors = shapeColors(it?.colors);
      if (colors && num(it.timestamp) != null) out.push({ ms: it.timestamp, ...colors });
    }
  }
  return [...new Map(out.map((e) => [e.ms, e])).values()].sort((a, b) => a.ms - b.ms);
}

export async function fetchTides(fetchFn = fetch, now = Date.now()) {
  const ymd = (days) => dateKey(now, days).replace(/-/g, "");
  const d = await getJson(tideUrl(ymd(-1), ymd(3)), fetchFn);
  const out = (Array.isArray(d.predictions) ? d.predictions : [])
    .filter((p) => p && typeof p.t === "string")
    .map((p) => ({ ms: Date.parse(`${p.t.replace(" ", "T")}:00Z`), ft: Number(p.v), kind: p.type === "H" ? "high" : "low" }))
    .filter((p) => Number.isFinite(p.ms) && Number.isFinite(p.ft));
  if (!out.length) throw new Error("tides unavailable");
  return out;
}

// `every` is how long to wait after a success; a function gets the time now.
const SOURCES = [
  { key: "weather", every: 10 * MIN, run: (f) => fetchWeather(f) },
  { key: "air", every: 20 * MIN, run: (f) => fetchAir(f) },
  { key: "sky", every: 5 * MIN, run: (f) => fetchSky(f) },
  { key: "skyDay", every: 15 * MIN, run: (f, now, prev) => fetchSkyDay(f, now, prev) },
  { key: "tides", every: 6 * 60 * MIN, run: (f, now) => fetchTides(f, now) },
  {
    key: "facts",
    // Hourly, and again just after New York midnight so the new day's facts arrive promptly.
    every: (now) => Math.min(60 * MIN, Math.max(MIN, startOfDay(now, 1) + 90 * 1000 - now)),
    run: (f, now, prev) => fetchToday(f, prev).then((facts) => (facts.length ? facts : Promise.reject(new Error("no facts")))),
  },
];

export const emptyData = () => ({ weather: null, air: null, sky: null, skyDay: [], tides: null, facts: [], fetched: {} });

const STORE_KEY = "clock-tower:data:v1";

// Starts fetching and keeps going. `onChange(data)` is called with a new
// bundle object each time any source arrives. The last bundle is restored from
// localStorage on start, so a reload (or a network blip at boot) still has
// something to show; state.js decides what is too old to trust.
export function createHub({ onChange = () => {}, fetchFn = (...a) => fetch(...a), storage = safeStorage() } = {}) {
  let data = emptyData();
  try {
    // Take only what has the right shape: a bundle saved by another version of
    // this code must not be able to break the pieces that read it.
    const saved = JSON.parse(storage?.getItem(STORE_KEY) || "null");
    const list = (v) => (Array.isArray(v) ? v.filter((e) => e && typeof e === "object") : null);
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      const w = saved.weather;
      if (w && typeof w.at === "number" && typeof w.current?.temp === "number") data.weather = { at: w.at, current: w.current, hourly: list(w.hourly) || [], daily: list(w.daily) || [] };
      if (typeof saved.air?.aqi === "number" && typeof saved.air.at === "number") data.air = saved.air;
      if (typeof saved.sky?.at === "number" && shapeColors({ west: saved.sky.colors?.west, "north-west": saved.sky.colors?.northWest, "north-east": saved.sky.colors?.northEast, east: saved.sky.colors?.east })) data.sky = saved.sky;
      data.skyDay = (list(saved.skyDay) || []).filter((e) => typeof e.ms === "number" && HEX.test(e.west || "") && HEX.test(e.northWest || "") && HEX.test(e.northEast || "") && HEX.test(e.east || ""));
      const tides = (list(saved.tides) || []).filter((e) => typeof e.ms === "number" && typeof e.ft === "number");
      data.tides = tides.length ? tides : null;
      data.facts = (list(saved.facts) || []).filter((e) => typeof e.label === "string" && typeof e.value === "string");
      if (saved.fetched && typeof saved.fetched === "object") data.fetched = saved.fetched;
    }
  } catch {}
  const timers = {}; // source key -> pending timeout
  let stopped = false;

  async function pull(source) {
    let value;
    try {
      value = await source.run(fetchFn, Date.now(), data[source.key]);
    } catch {
      return false; // keep what we have
    }
    if (stopped) return true;
    data = { ...data, [source.key]: value, fetched: { ...data.fetched, [source.key]: Date.now() } };
    try {
      storage?.setItem(STORE_KEY, JSON.stringify(data));
    } catch {}
    try {
      onChange(data);
    } catch {}
    return true;
  }

  function start() {
    for (const source of SOURCES) {
      let fails = 0;
      const loop = async () => {
        const ok = await pull(source);
        fails = ok ? 0 : fails + 1;
        const every = typeof source.every === "function" ? source.every(Date.now()) : source.every;
        // After a failure try again sooner, backing off: 2, 4, 8, 16, 32 minutes.
        const wait = ok ? every : Math.min(Math.max(every, 2 * MIN), 2 * MIN * 2 ** Math.min(fails - 1, 4));
        if (!stopped) timers[source.key] = setTimeout(loop, wait);
      };
      loop();
    }
    return stop;
  }
  function stop() {
    stopped = true;
    Object.values(timers).forEach(clearTimeout);
  }
  return { start, stop, get data() { return data; } };
}

function safeStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

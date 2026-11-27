// Turns the data bundle (data.js, or simulate.js) plus an instant into
// `state`: the one object every visualization draws from. It is always
// complete: where live data is missing or stale, typical values and computed
// ones stand in, so a picture never has to check for null. The same object is
// updated in place and handed to the visualization on every frame.
//
// The full reference for what is in it is src/visuals/README.md.

import { sunPosition, sunTimes, moonPosition, moonIllumination, moonPhaseName, moonEvents } from "./astro.js";
import { toOklab, fromOklab } from "./color.js";
import { zoned, startOfDay, dayOfYear, WEEKDAYS, MONTHS } from "./time.js";
import { labelOf, kindOf, fallingOf, intensityOf, compassPoint, typicalWeather } from "./weather.js";
import { modelSky } from "./simulate.js";
import { factFor } from "./today.js";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const WEATHER_MAX_AGE = 3 * HOUR; // older than this is not "live" any more
const AIR_MAX_AGE = 6 * HOUR;
const SKY_MAX_AGE = 45 * 60 * 1000;

const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const pad = (n) => String(n).padStart(2, "0");

// The camera that measures the sky exposes for what it sees, so a cloudy night
// comes back as a mid grey. For painting, cap the lightness by how dark it
// really is outside.
export function nightTone(hex, sunAlt) {
  const cap = 0.3 + 0.7 * smoothstep(-10, 1, sunAlt);
  const lab = toOklab(hex);
  if (lab[0] <= cap) return hex;
  const k = cap / lab[0];
  return fromOklab([cap, lab[1] * k, lab[2] * k]);
}

const SMOOTHED = ["temp", "feels", "humidity", "dewPoint", "wind", "gust", "cloud", "precip", "pressure", "visibility", "uv", "aqi", "pm25", "intensity"];

export function createState({ slot = 0, seed = 1 } = {}) {
  const state = {
    // the animation clock
    t: 0, dt: 0, frame: 0,
    // the instant being shown
    ms: 0, now: new Date(0),
    slot, seed,
    W: 1080, H: 1920, scale: 1,
    daylight: 0,
    clock: {},
    sun: {},
    moon: {},
    weather: {},
    hours: [],
    pastHours: [],
    sky: {},
    tide: {},
    fact: null,
    text: {},
  };

  let lastData = null;
  let lastSecond = null;
  let dayKey = null; // sun times are per day
  let sunDays = null;
  let moonKey = null; // moonrise/moonset: every ten minutes
  let hourKey = null;
  let skyDayKey = null;
  let target = {}; // smoothed weather numbers head toward these
  let snap = true;

  function slow(data, ms) {
    // ----- clock -----
    const z = zoned(ms);
    const c = state.clock;
    c.offset = z.offset;
    c.year = z.year; c.monthIndex = z.month; c.day = z.day; c.weekdayIndex = z.weekday;
    c.h24 = z.hour; c.m = z.minute; c.s = z.second;
    c.h12 = z.hour % 12 || 12;
    c.ampm = z.hour < 12 ? "AM" : "PM";
    c.hh = String(c.h12); c.mm = pad(z.minute); c.ss = pad(z.second);
    c.time = `${c.hh}:${c.mm}`;
    c.weekday = WEEKDAYS[z.weekday];
    c.month = MONTHS[z.month - 1];
    c.date = `${c.weekday}, ${c.month} ${z.day}`;
    c.doy = dayOfYear(ms);
    c.yearFrac = (c.doy - 1 + (z.hour + z.minute / 60) / 24) / (z.year % 4 === 0 && (z.year % 100 !== 0 || z.year % 400 === 0) ? 366 : 365);
    const midnight = startOfDay(ms);

    // ----- sun -----
    const key = `${z.year}-${z.month}-${z.day}`;
    if (key !== dayKey) {
      dayKey = key;
      sunDays = [-1, 0, 1].map((d) => sunTimes(startOfDay(ms, d) + 12 * HOUR));
    }
    const today = sunDays[1];
    const pos = sunPosition(ms);
    const s = state.sun;
    s.alt = pos.alt; s.az = pos.az;
    s.up = pos.alt > -0.833;
    s.rise = today.rise; s.set = today.set; s.noon = today.noon;
    s.civilDawn = today.civilDawn; s.civilDusk = today.civilDusk;
    s.nauticalDawn = today.nauticalDawn; s.nauticalDusk = today.nauticalDusk;
    s.astroDawn = today.astroDawn; s.astroDusk = today.astroDusk;
    s.goldenEnd = today.goldenEnd; s.goldenStart = today.goldenStart;
    s.dayLength = (today.set - today.rise) / HOUR;
    s.noonAlt = sunPosition(today.noon).alt;
    const events = [];
    for (const d of sunDays) events.push({ kind: "sunrise", ms: d.rise }, { kind: "sunset", ms: d.set });
    events.sort((a, b) => a.ms - b.ms);
    const next = events.find((e) => e.ms > ms) || { kind: "sunrise", ms: ms + 12 * HOUR };
    const prev = [...events].reverse().find((e) => e.ms <= ms) || { kind: "sunset", ms: ms - 12 * HOUR };
    const mins = Math.max(0, Math.round((next.ms - ms) / 60000));
    s.next = { kind: next.kind, ms: next.ms, minutes: mins };
    s.prev = { kind: prev.kind, ms: prev.ms };
    // 0..1 through the day (sunrise to sunset) or through the night.
    s.progress = clamp((ms - prev.ms) / Math.max(1, next.ms - prev.ms));
    const morning = ms < today.noon;
    s.phase =
      pos.alt < -12 ? "night" : pos.alt < -0.833 ? (morning ? "dawn" : "dusk") : pos.alt < 6 ? (morning ? "sunrise" : "golden") : "day";
    state.daylight = smoothstep(-9, 6, pos.alt);

    // ----- moon -----
    const ill = moonIllumination(ms);
    const mp = moonPosition(ms);
    const m = state.moon;
    m.phase = ill.phase; m.illumination = ill.fraction; m.waxing = ill.phase < 0.5;
    m.name = moonPhaseName(ill.phase);
    m.alt = mp.alt; m.az = mp.az; m.up = mp.alt > 0;
    m.tilt = ill.angle - mp.parallactic; // the lit side, degrees counter-clockwise from "up", as seen here
    m.distance = mp.distance;
    const mk = Math.floor(ms / (10 * 60 * 1000));
    if (mk !== moonKey) {
      moonKey = mk;
      const ev = moonEvents(ms, ms + 26 * HOUR);
      m.nextRise = ev.find((e) => e.kind === "rise")?.ms ?? null;
      m.nextSet = ev.find((e) => e.kind === "set")?.ms ?? null;
    }

    // ----- weather -----
    const wx = data?.weather;
    const live = Boolean(wx?.current && Math.abs(ms - wx.at) < WEATHER_MAX_AGE);
    const cur = live ? wx.current : typicalWeather(z.month, z.hour + z.minute / 60);
    const air = data?.air && Math.abs(ms - data.air.at) < AIR_MAX_AGE ? data.air : null;
    const w = state.weather;
    if (w.live !== live) snap = true;
    w.live = live;
    w.code = cur.code;
    w.label = live ? labelOf(cur.code) : "";
    w.kind = kindOf(cur.code);
    const feels = cur.feels ?? cur.temp;
    w.falling = fallingOf(cur.code, cur.precip, feels);
    w.fog = cur.code === 45 || cur.code === 48;
    w.windDirTarget = cur.windDir ?? 250;
    w.windFrom = compassPoint(w.windDirTarget);
    w.hasAir = Boolean(air);
    const gust = cur.gust ?? cur.wind * 1.6;
    target = {
      temp: cur.temp,
      feels,
      humidity: cur.humidity ?? 60,
      dewPoint: cur.dewPoint ?? cur.temp - (100 - (cur.humidity ?? 60)) / 2.8,
      wind: cur.wind ?? 0,
      gust: Math.max(gust, cur.wind ?? 0),
      cloud: cur.cloud ?? 40,
      precip: cur.precip ?? 0,
      pressure: cur.pressure ?? 1016,
      visibility: cur.visibility ?? 10,
      uv: cur.uv ?? 0,
      aqi: air?.aqi ?? 40,
      pm25: air?.pm25 ?? 9,
      intensity: w.falling ? Math.max(0.12, intensityOf(cur.code, cur.precip)) : 0,
    };

    // ----- forecast: the next 48 hours and the last 24, hourly -----
    const hk = `${Math.floor(ms / HOUR)}:${live ? wx.at : "none"}`;
    if (hk !== hourKey) {
      hourKey = hk;
      const start = Math.floor(ms / HOUR) * HOUR;
      const byHour = new Map();
      if (live) for (const h of wx.hourly || []) byHour.set(Math.round(h.ms / HOUR), h);
      const entry = (t) => {
        const h = byHour.get(Math.round(t / HOUR));
        if (h) return { ...h, kind: kindOf(h.code), label: labelOf(h.code) };
        const zz = zoned(t);
        const ty = typicalWeather(zz.month, zz.hour);
        // Without a forecast, hold the current reading and let it follow a normal day's curve.
        const base = live ? cur.temp - typicalWeather(z.month, z.hour).temp : 0;
        const code = live ? cur.code : ty.code;
        return {
          ms: t, temp: ty.temp + base, feels: ty.temp + base, humidity: target.humidity, cloud: target.cloud, pop: 0, precip: 0,
          code, wind: target.wind, windDir: w.windDirTarget, uv: 0, pressure: target.pressure, kind: kindOf(code), label: labelOf(code),
        };
      };
      state.hours = Array.from({ length: 48 }, (_, i) => entry(start + i * HOUR));
      state.pastHours = Array.from({ length: 24 }, (_, i) => entry(start - (24 - i) * HOUR));
      w.hasForecast = live && byHour.size > 0;
      const todays = live ? (wx.daily || []).find((d) => Math.abs(d.ms - midnight) < 2 * HOUR) : null;
      const span = [...state.pastHours, ...state.hours].filter((h) => h.ms >= midnight && h.ms < midnight + DAY).map((h) => h.temp);
      w.high = todays?.high ?? Math.max(...span, cur.temp);
      w.low = todays?.low ?? Math.min(...span, cur.temp);
    }

    // ----- the sky's color -----
    const sk = state.sky;
    const fresh = data?.sky?.colors && Math.abs(ms - data.sky.at) < SKY_MAX_AGE;
    const rawSky = fresh ? data.sky.colors : modelSky(ms, target.cloud / 100, w.falling, w.fog);
    sk.measured = Boolean(fresh);
    sk.raw = rawSky;
    for (const dir of ["west", "northWest", "northEast", "east"]) sk[dir] = nightTone(rawSky[dir], pos.alt);
    const labs = ["west", "northWest", "northEast", "east"].map((d) => toOklab(sk[d]));
    sk.mean = fromOklab([0, 1, 2].map((i) => (labs[0][i] + labs[1][i] + labs[2][i] + labs[3][i]) / 4));
    const sdk = `${Math.floor(ms / 60000)}:${data?.skyDay?.length || 0}:${data?.fetched?.skyDay || 0}`;
    if (sdk !== skyDayKey) {
      skyDayKey = sdk;
      sk.day = (data?.skyDay || [])
        .filter((e) => e.ms > ms - DAY && e.ms <= ms)
        .map((e) => {
          const alt = sunPosition(e.ms).alt;
          return { ms: e.ms, west: nightTone(e.west, alt), northWest: nightTone(e.northWest, alt), northEast: nightTone(e.northEast, alt), east: nightTone(e.east, alt) };
        });
    }

    // ----- tide at Hunters Point -----
    const td = state.tide;
    const list = data?.tides || [];
    const after = list.findIndex((e) => e.ms > ms);
    if (after > 0) {
      const a = list[after - 1];
      const b = list[after];
      const k = (1 - Math.cos(Math.PI * clamp((ms - a.ms) / (b.ms - a.ms)))) / 2; // cosine between turns
      td.live = true;
      td.level = a.ft + (b.ft - a.ft) * k;
      td.rising = b.kind === "high";
      td.next = { kind: b.kind, ms: b.ms, ft: b.ft, minutes: Math.round((b.ms - ms) / 60000) };
      td.prev = { kind: a.kind, ms: a.ms, ft: a.ft };
      td.events = list;
    } else {
      // No table: the mean semidiurnal tide (12.42 h), phased from a known high water.
      const M2 = 12.4206 * HOUR;
      const ph = ((((ms - Date.UTC(2026, 10, 27, 15, 2)) / M2) % 1) + 1) % 1; // 0 at high water
      td.live = false;
      td.level = 2.6 + 2.6 * Math.cos(ph * Math.PI * 2);
      td.rising = ph > 0.5;
      const toNext = (td.rising ? 1 - ph : 0.5 - ph) * M2;
      td.next = { kind: td.rising ? "high" : "low", ms: ms + toNext, ft: td.rising ? 5.2 : 0, minutes: Math.round(toNext / 60000) };
      td.prev = { kind: td.rising ? "low" : "high", ms: ms + toNext - M2 / 2, ft: td.rising ? 0 : 5.2 };
      td.events = [];
    }
    const lo = Math.min(td.prev.ft, td.next.ft);
    const hi = Math.max(td.prev.ft, td.next.ft);
    td.norm = hi > lo ? clamp((td.level - lo) / (hi - lo)) : 0.5; // 0 at low water, 1 at high

    // ----- today's fact -----
    state.fact = factFor(data?.facts, state.slot ? state.slot * 15 * 60 * 1000 : ms);

    // ----- ready-made strings for the readouts -----
    const tx = state.text;
    tx.time = c.time; tx.hh = c.hh; tx.mm = c.mm; tx.ampm = c.ampm;
    tx.date = c.date; tx.weekday = c.weekday; tx.monthDay = `${c.month} ${z.day}`;
    tx.temp = live ? `${Math.round(cur.temp)}°` : "–°";
    tx.condition = live ? w.label : "No weather data";
    tx.sunLabel = `${next.kind === "sunrise" ? "Sunrise" : "Sunset"} in`;
    tx.sunValue = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
    tx.moon = m.name;
    tx.aqi = air ? String(Math.round(air.aqi)) : "–";
    tx.uv = live ? String(Math.round(cur.uv ?? 0)) : "–";
    tx.factLabel = state.fact?.label ?? "";
    tx.factValue = state.fact?.value ?? "";
    tx.high = live ? `${Math.round(w.high)}°` : "–°";
    tx.low = live ? `${Math.round(w.low)}°` : "–°";
    tx.feels = live ? `${Math.round(feels)}°` : "–°";
    tx.wind = live ? `${Math.round(cur.wind ?? 0)} mph ${w.windFrom}` : "–";
    tx.humidity = live ? `${Math.round(cur.humidity ?? 0)}%` : "–";
  }

  // Called once per frame. `data` is the bundle, `ms` the instant to show,
  // `t` / `dt` the animation clock in seconds.
  function update(data, ms, t, dt) {
    state.t = t;
    state.dt = dt;
    state.frame++;
    state.ms = ms;
    state.now.setTime(ms);
    const second = Math.floor(ms / 1000);
    if (second !== lastSecond || data !== lastData) {
      lastSecond = second;
      lastData = data;
      slow(data, ms);
    }
    // Per-frame: fractions of the clock, and weather numbers easing toward
    // their latest readings so a refresh glides instead of jumping.
    const c = state.clock;
    const local = ms + c.offset;
    c.dayFrac = (((local % DAY) + DAY) % DAY) / DAY;
    c.sf = c.s + (((ms % 1000) + 1000) % 1000) / 1000; // seconds with fraction
    c.mf = c.m + c.sf / 60; // minutes with fraction
    c.hf = c.h24 + c.mf / 60; // hours (0-24) with fraction
    const w = state.weather;
    const k = snap ? 1 : 1 - Math.exp(-Math.max(0, dt) / 3);
    for (const key of SMOOTHED) w[key] = w[key] == null ? target[key] : w[key] + (target[key] - w[key]) * k;
    if (snap || w.windDir == null) w.windDir = w.windDirTarget;
    else w.windDir = (w.windDir + ((((w.windDirTarget - w.windDir) % 360) + 540) % 360 - 180) * k + 360) % 360;
    snap = false;
    return state;
  }

  return { state, update };
}

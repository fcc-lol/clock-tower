// Pure helpers shared by the browser display and the server-side image
// generator: WMO weather codes, moon phase, and sunrise/sunset countdowns.

// WMO weather interpretation codes -> icon + label.
export const WMO = {
  0: ["☀️", "Clear sky"],
  1: ["🌤️", "Mainly clear"],
  2: ["⛅", "Partly cloudy"],
  3: ["☁️", "Overcast"],
  45: ["🌫️", "Fog"],
  48: ["🌫️", "Rime fog"],
  51: ["🌦️", "Light drizzle"],
  53: ["🌦️", "Drizzle"],
  55: ["🌦️", "Heavy drizzle"],
  56: ["🌧️", "Freezing drizzle"],
  57: ["🌧️", "Freezing drizzle"],
  61: ["🌧️", "Light rain"],
  63: ["🌧️", "Rain"],
  65: ["🌧️", "Heavy rain"],
  66: ["🌧️", "Freezing rain"],
  67: ["🌧️", "Freezing rain"],
  71: ["🌨️", "Light snow"],
  73: ["🌨️", "Snow"],
  75: ["❄️", "Heavy snow"],
  77: ["🌨️", "Snow grains"],
  80: ["🌦️", "Light showers"],
  81: ["🌧️", "Showers"],
  82: ["⛈️", "Violent showers"],
  85: ["🌨️", "Snow showers"],
  86: ["❄️", "Snow showers"],
  95: ["⛈️", "Thunderstorm"],
  96: ["⛈️", "Thunderstorm, hail"],
  99: ["⛈️", "Thunderstorm, hail"],
};

// Current moon phase from the synodic cycle, referenced to a known new moon
// (2000-01-06 18:14 UTC). Returns a human label.
export const MOON_PHASES = [
  "New Moon",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent",
];
export function moonPhase(date) {
  const SYNODIC = 29.530588853;
  const REF = Date.UTC(2000, 0, 6, 18, 14) / 86400000; // days
  const days = date.getTime() / 86400000 - REF;
  const frac = ((days % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC;
  // 8 segments centered on the named phases.
  return MOON_PHASES[Math.floor(frac * 8 + 0.5) % 8];
}

// Open-Meteo times arrive as unix seconds (timeformat=unixtime), which are
// unambiguous wherever this runs. ISO strings are accepted too for safety.
export const toDate = (t) => new Date(typeof t === "number" ? t * 1000 : t);

// Given the daily sunrise/sunset arrays and now, return the next event and how
// long until it.
export function nextSunEvent(daily, now) {
  if (!daily) return null;
  const events = [];
  daily.sunrise.forEach((t) => events.push({ label: "Sunrise", at: toDate(t) }));
  daily.sunset.forEach((t) => events.push({ label: "Sunset", at: toDate(t) }));
  const upcoming = events
    .filter((e) => e.at > now)
    .sort((a, b) => a.at - b.at)[0];
  if (!upcoming) return null;
  const mins = Math.round((upcoming.at - now) / 60000);
  return { label: upcoming.label, h: Math.floor(mins / 60), m: mins % 60 };
}

// Long Island City, NY (ZIP 11101).
export const LAT = 40.7447;
export const LON = -73.9485;
export const WEATHER_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
  `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,uv_index,cloud_cover,precipitation` +
  `&daily=sunrise,sunset&timezone=America%2FNew_York&forecast_days=2` +
  `&temperature_unit=fahrenheit&wind_speed_unit=mph&timeformat=unixtime`;
export const AQI_URL =
  `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}` +
  `&current=us_aqi&timezone=America%2FNew_York`;

// Fetch both Open-Meteo endpoints and merge into one flat reading.
export async function fetchWeather(fetchFn = fetch) {
  const [wxRes, aqRes] = await Promise.all([fetchFn(WEATHER_URL), fetchFn(AQI_URL)]);
  const wx = await wxRes.json();
  const aq = await aqRes.json();
  if (!wx.current) throw new Error(wx.reason || "weather unavailable");
  return { ...wx.current, daily: wx.daily, aqi: aq.current?.us_aqi };
}

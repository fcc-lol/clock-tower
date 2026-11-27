// What the WMO weather codes mean, and typical New York conditions to fall
// back on when there is no live reading.

// code -> [label, kind]. `kind` is the family a picture cares about:
// clear | partly | overcast | fog | drizzle | rain | snow | storm
export const WMO = {
  0: ["Clear sky", "clear"],
  1: ["Mainly clear", "clear"],
  2: ["Partly cloudy", "partly"],
  3: ["Overcast", "overcast"],
  45: ["Fog", "fog"],
  48: ["Rime fog", "fog"],
  51: ["Light drizzle", "drizzle"],
  53: ["Drizzle", "drizzle"],
  55: ["Heavy drizzle", "drizzle"],
  56: ["Freezing drizzle", "drizzle"],
  57: ["Freezing drizzle", "drizzle"],
  61: ["Light rain", "rain"],
  63: ["Rain", "rain"],
  65: ["Heavy rain", "rain"],
  66: ["Freezing rain", "rain"],
  67: ["Freezing rain", "rain"],
  71: ["Light snow", "snow"],
  73: ["Snow", "snow"],
  75: ["Heavy snow", "snow"],
  77: ["Snow grains", "snow"],
  80: ["Light showers", "rain"],
  81: ["Showers", "rain"],
  82: ["Violent showers", "rain"],
  85: ["Snow showers", "snow"],
  86: ["Snow showers", "snow"],
  95: ["Thunderstorm", "storm"],
  96: ["Thunderstorm, hail", "storm"],
  99: ["Thunderstorm, hail", "storm"],
};

export const labelOf = (code) => WMO[code]?.[0] ?? "";
export const kindOf = (code) => WMO[code]?.[1] ?? "overcast";

// What is falling, if anything: null | "drizzle" | "rain" | "freezing" | "snow" | "storm".
export function fallingOf(code, precip = 0, feels = 50) {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([56, 57, 66, 67].includes(code)) return "freezing";
  if ([95, 96, 99].includes(code)) return "storm";
  if ([51, 53, 55].includes(code)) return "drizzle";
  if ([61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if (precip > 0) return feels <= 32 ? "snow" : "rain";
  return null;
}

// How hard it is coming down, 0..1, from the code and the rate (inches/hour).
export function intensityOf(code, precip = 0) {
  const byCode = { 51: 0.15, 53: 0.25, 55: 0.4, 56: 0.2, 57: 0.4, 61: 0.3, 63: 0.55, 65: 0.9, 66: 0.35, 67: 0.8, 71: 0.3, 73: 0.55, 75: 0.9, 77: 0.25, 80: 0.35, 81: 0.6, 82: 1, 85: 0.4, 86: 0.85, 95: 0.85, 96: 1, 99: 1 };
  const fromCode = byCode[code] ?? 0;
  const fromRate = Math.min(1, Math.sqrt(Math.max(0, precip) / 0.5));
  return fromCode ? Math.max(fromCode, fromRate * 0.9) : fromRate;
}

// Sixteen-point compass name for a bearing in degrees ("NW").
const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compassPoint = (deg) => POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

// Normal daily mean temperature in New York by month (deg F), and a plausible
// reading built from it: what the pictures draw from when there is no data.
const NORMAL_TEMP = [33, 35, 43, 53, 63, 72, 77, 76, 69, 58, 48, 38];
export function typicalWeather(month, hour) {
  const mean = NORMAL_TEMP[month - 1] ?? 55;
  const temp = mean + 7 * Math.cos(((hour - 15) / 24) * Math.PI * 2);
  return {
    temp, feels: temp, humidity: 60, dewPoint: temp - 14, code: 2, cloud: 40, precip: 0, snowfall: 0,
    wind: 8, gust: 14, windDir: 250, pressure: 1016, uv: 0, visibility: 10,
  };
}

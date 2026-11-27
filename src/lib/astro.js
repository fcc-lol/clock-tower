// Sun and moon for a place and an instant: where they are in the sky, when
// they rise and set, the twilights, and the moon's phase.
//
// These are the standard low-precision formulas (Meeus, "Astronomical
// Algorithms", and the Astronomical Almanac's series for the moon). Checked
// against JPL Horizons for 2026-2027: the sun to about 0.02 degrees and its
// rise and set to well under a minute; the moon to a few tenths of a degree
// and its rise and set to a few minutes. Everything is a
// pure function of an instant in epoch milliseconds, so no time zone is
// involved. Angles in the public API are degrees; azimuth is a compass
// bearing (0 north, 90 east, 180 south, 270 west).

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const TAU = Math.PI * 2;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = 23.4397 * RAD; // tilt of the Earth's axis

// Long Island City, NY (ZIP 11101).
export const LAT = 40.7447;
export const LON = -73.9485;

const toDays = (ms) => ms / DAY_MS - 0.5 + J1970 - J2000; // days since J2000.0
const fromJulian = (j) => (j + 0.5 - J1970) * DAY_MS;

const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
// Azimuth here is measured from south, turning west; compass() converts.
const azimuthOf = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const altitudeOf = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d, lw) => RAD * (280.4606 + 360.98564737 * d) - lw;
const compass = (azSouth) => (((azSouth * DEG + 180) % 360) + 360) % 360;

// How much the atmosphere lifts an object near the horizon, in radians.
function refraction(h) {
  if (h < 0) h = 0;
  return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
}

const solarMeanAnomaly = (d) => RAD * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M, d) {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)); // equation of center
  const P = RAD * (102.9372 + 0.0000471 * d); // perihelion of the Earth, from the equinox of date
  return M + C + P + Math.PI;
}
function sunCoords(d) {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M, d);
  return { dec: declination(L, 0), ra: rightAscension(L, 0), M, L };
}

// Where the sun is: { alt, az } in degrees. `alt` is the geometric altitude of
// the sun's centre (negative below the horizon).
export function sunPosition(ms, lat = LAT, lon = LON) {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(ms);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return { alt: altitudeOf(H, phi, c.dec) * DEG, az: compass(azimuthOf(H, phi, c.dec)) };
}

// The sun's declination (degrees) and the equation of time (minutes: apparent
// solar time minus mean solar time).
export function sunDeclination(ms) {
  return sunCoords(toDays(ms)).dec * DEG;
}
export function equationOfTime(ms) {
  const d = toDays(ms);
  const { M, L } = sunCoords(d);
  return -(0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L)) * 1440;
}

const J0 = 0; // times here are UTC throughout
const julianCycle = (d, lw) => Math.round(d - J0 - lw / TAU);
const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / TAU + n;
const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h, phi, dec) => Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));

// The sun's day around the instant `ms` (the solar day whose noon is nearest
// to it; pass local noon to get a calendar day). All values are epoch ms, or
// NaN where the sun never reaches that altitude on that day.
//   rise / set          the upper limb on the horizon (-0.833 deg)
//   noon / nadir        highest and lowest points
//   civilDawn / civilDusk            -6 deg
//   nauticalDawn / nauticalDusk      -12 deg
//   astroDawn / astroDusk            -18 deg
//   goldenEnd / goldenStart          +6 deg (morning golden hour ends, evening one starts)
export function sunTimes(ms, lat = LAT, lon = LON) {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const n = julianCycle(toDays(ms), lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M, ds);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);
  const pair = (angle) => {
    const w = hourAngle(angle * RAD, phi, dec);
    const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
    return [fromJulian(Jnoon - (Jset - Jnoon)), fromJulian(Jset)];
  };
  const [rise, set] = pair(-0.833);
  const [civilDawn, civilDusk] = pair(-6);
  const [nauticalDawn, nauticalDusk] = pair(-12);
  const [astroDawn, astroDusk] = pair(-18);
  const [goldenEnd, goldenStart] = pair(6);
  return {
    noon: fromJulian(Jnoon),
    nadir: fromJulian(Jnoon - 0.5),
    rise, set, civilDawn, civilDusk, nauticalDawn, nauticalDusk, astroDawn, astroDusk, goldenEnd, goldenStart,
  };
}

// The moon's place among the stars: the low-precision series of the
// Astronomical Almanac (good to a few tenths of a degree), with its parallax,
// which is how far its nearness shifts it for an observer on the surface.
function moonCoords(d) {
  const T = d / 36525;
  const s = (a, b) => Math.sin(RAD * (a + b * T));
  const c = (a, b) => Math.cos(RAD * (a + b * T));
  const l =
    RAD *
    (218.32 + 481267.881 * T + 6.29 * s(135.0, 477198.87) - 1.27 * s(259.3, -413335.36) + 0.66 * s(235.7, 890534.22) +
      0.21 * s(269.9, 954397.74) - 0.19 * s(357.5, 35999.05) - 0.11 * s(186.5, 966404.03));
  const b = RAD * (5.13 * s(93.3, 483202.02) + 0.28 * s(228.2, 960400.89) - 0.28 * s(318.3, 6003.15) - 0.17 * s(217.6, -407332.21));
  const par = RAD * (0.9508 + 0.0518 * c(135.0, 477198.87) + 0.0095 * c(259.3, -413335.36) + 0.0078 * c(235.7, 890534.22) + 0.0028 * c(269.9, 954397.74));
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 6378.14 / Math.sin(par), par };
}

// Where the moon is: { alt, az } in degrees (alt as seen: parallax and refraction included),
// `distance` in km, and `parallactic` (degrees), the tilt of the moon's
// north-south axis from the vertical as seen from this place.
export function moonPosition(ms, lat = LAT, lon = LON) {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(ms);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  let h = altitudeOf(H, phi, c.dec);
  const pa = Math.atan2(Math.sin(H), Math.tan(phi) * Math.cos(c.dec) - Math.sin(c.dec) * Math.cos(H));
  h -= c.par * Math.cos(h); // seen from the surface, not the Earth's centre
  h += refraction(h);
  return { alt: h * DEG, az: compass(azimuthOf(H, phi, c.dec)), distance: c.dist, parallactic: pa * DEG };
}

// The lit face of the moon:
//   fraction   0 (new) to 1 (full): how much of the disc is lit
//   phase      0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter, to 1
//   angle      position angle of the bright limb's midpoint, in degrees, measured
//              from celestial north toward the east. Subtract moonPosition's
//              `parallactic` to get the tilt of the lit side as actually seen
//              in the sky from that place (counter-clockwise from "up").
export function moonIllumination(ms) {
  const d = toDays(ms);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598000; // km from Earth to the sun
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra),
  );
  return {
    fraction: (1 + Math.cos(inc)) / 2,
    phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI,
    angle: angle * DEG,
  };
}

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
// The name for a phase value (0..1): eight equal spans centred on the named phases.
export const moonPhaseName = (phase) => MOON_PHASES[Math.floor(phase * 8 + 0.5) % 8];

// When the moon rises and sets within [from, to] (epoch ms): a list of
// { kind: "rise" | "set", ms } in time order. Found by stepping its altitude.
export function moonEvents(from, to, lat = LAT, lon = LON) {
  const H0 = -0.26; // rise and set are when the upper limb is on the horizon: the centre is half a disc below
  const step = 10 * 60 * 1000;
  const out = [];
  let prev = moonPosition(from, lat, lon).alt - H0;
  for (let t = from + step; t <= to + step; t += step) {
    const cur = moonPosition(t, lat, lon).alt - H0;
    if (prev < 0 !== cur < 0) {
      const at = t - step + (step * -prev) / (cur - prev);
      if (at <= to) out.push({ kind: prev < 0 ? "rise" : "set", ms: Math.round(at) });
    }
    prev = cur;
  }
  return out;
}

// Local sidereal time in hours (0..24): the right ascension now on the meridian.
export function siderealHours(ms, lon = LON) {
  const h = (siderealTime(toDays(ms), RAD * -lon) * DEG) / 15;
  return ((h % 24) + 24) % 24;
}

// A fixed star (or anything given as right ascension in hours and declination
// in degrees, epoch J2000) to { alt, az } in degrees for this place and instant.
export function equatorialToHorizontal(raHours, decDeg, ms, lat = LAT, lon = LON) {
  const phi = RAD * lat;
  const dec = decDeg * RAD;
  const H = siderealTime(toDays(ms), RAD * -lon) - raHours * 15 * RAD;
  return { alt: altitudeOf(H, phi, dec) * DEG, az: compass(azimuthOf(H, phi, dec)) };
}

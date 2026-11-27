// Small color toolkit. Colors go in as "#rgb", "#rrggbb" or [r, g, b] (0-255)
// and come out as "#rrggbb". Mixing and lightness work in OKLab, so blends
// stay clean (no muddy midpoints) and lightness steps look even.

export function parse(c) {
  if (Array.isArray(c)) return [0, 1, 2].map((i) => (Number.isFinite(c[i]) ? c[i] : 0));
  let s = String(c || "").trim().replace(/^#/, "");
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if (!/^[0-9a-f]{6}$/i.test(s)) return [0, 0, 0]; // not a color: black, rather than something invalid
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const to2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
export const toHex = (rgb) => `#${to2(rgb[0])}${to2(rgb[1])}${to2(rgb[2])}`;

// "rgba(r, g, b, a)" for canvas and CSS.
export function rgba(c, alpha = 1) {
  const [r, g, b] = parse(c);
  return `rgba(${r},${g},${b},${alpha})`;
}

const toLinear = (v) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055);

// [L, a, b] in OKLab: L is 0 (black) to 1 (white).
export function toOklab(c) {
  const [R, G, B] = parse(c);
  const r = toLinear(R);
  const g = toLinear(G);
  const b = toLinear(B);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return toHex([
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]);
}

// { l, c, h }: lightness 0-1, chroma (0 grey, about 0.3 very vivid), hue in degrees.
export function toOklch(c) {
  const [L, a, b] = toOklab(c);
  return { l: L, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

// A color from lightness, chroma and hue. Out-of-gamut colors have their
// chroma reduced until they fit, so the lightness and hue asked for are kept.
export function oklch(l, c, h) {
  if (!Number.isFinite(l)) l = 0;
  if (!Number.isFinite(c)) c = 0;
  if (!Number.isFinite(h)) h = 0;
  const rad = (h * Math.PI) / 180;
  const inGamut = (cc) => {
    const a = cc * Math.cos(rad);
    const b = cc * Math.sin(rad);
    const lr = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const mr = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const sr = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const r = 4.0767416621 * lr - 3.3077115913 * mr + 0.2309699292 * sr;
    const g = -1.2684380046 * lr + 2.6097574011 * mr - 0.3413193965 * sr;
    const bb = -0.0041960863 * lr - 0.7034186147 * mr + 1.707614701 * sr;
    return r >= -0.0005 && r <= 1.0005 && g >= -0.0005 && g <= 1.0005 && bb >= -0.0005 && bb <= 1.0005;
  };
  let lo = 0;
  let hi = Math.max(0, c);
  if (!inGamut(hi)) {
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(mid)) lo = mid;
      else hi = mid;
    }
    hi = lo;
  }
  return fromOklab([Math.max(0, Math.min(1, l)), hi * Math.cos(rad), hi * Math.sin(rad)]);
}

// Blend two colors: t = 0 gives a, t = 1 gives b.
export function mix(a, b, t) {
  const A = toOklab(a);
  const B = toOklab(b);
  const k = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  return fromOklab([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]);
}

// Change a color's lightness, chroma or hue. Each of l, c, h may be a number
// (set it) or a function of the current value (e.g. { l: (v) => v * 0.5 }).
export function adjust(color, change = {}) {
  const cur = toOklch(color);
  const next = (key) => (typeof change[key] === "function" ? change[key](cur[key]) : change[key] ?? cur[key]);
  return oklch(next("l"), next("c"), next("h"));
}

// WCAG relative luminance (0-1) and contrast ratio (1-21). Body text wants a
// ratio of at least 4.5 against what is behind it; large display type, 3.
export function luminance(c) {
  const [r, g, b] = parse(c).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Whichever of `light` and `dark` reads better on `bg`.
export const readableOn = (bg, light = "#ffffff", dark = "#000000") => (contrast(bg, light) >= contrast(bg, dark) ? light : dark);

// A gradient as a function: ramp(["#000", "#f80", "#fff"])(0.5) -> "#rrggbb".
// Stops may also be [position, color] pairs with positions from 0 to 1.
export function ramp(stops) {
  // A stop is a color, or [position, color]; a color may itself be an [r, g, b] array.
  const isPair = (s) => Array.isArray(s) && s.length === 2 && typeof s[0] === "number" && (typeof s[1] === "string" || Array.isArray(s[1]));
  const list = stops.map((s, i) => (isPair(s) ? [s[0], toOklab(s[1])] : [stops.length > 1 ? i / (stops.length - 1) : 0, toOklab(s)]));
  list.sort((a, b) => a[0] - b[0]);
  return (t) => {
    if (!(t > list[0][0])) return fromOklab(list[0][1]);
    for (let i = 1; i < list.length; i++) {
      if (t <= list[i][0]) {
        const [p0, a] = list[i - 1];
        const [p1, b] = list[i];
        const k = p1 === p0 ? 0 : (t - p0) / (p1 - p0);
        return fromOklab([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
      }
    }
    return fromOklab(list[list.length - 1][1]);
  };
}

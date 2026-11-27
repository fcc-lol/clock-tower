// Poured Hours
//
// A wall-sized falling-sand toy. The whole frame above the base is one cellular
// automaton of 6 px grains (180 x 270 cells). The time is two rows of chunky
// numerals made of grains glued in place; when a minute passes the old numeral
// comes unglued and avalanches away, and a little hopper prints the new one in
// sand, layer by layer, inside a faint mould of its shape.
//
// How the conditions drive it:
//   seconds       one bead of sand a second falls down the gap between the digits
//   temperature   the pigment of the glued numerals: ultramarine in deep cold,
//                 through viridian and ochre, to vermilion in heat
//   sky colour    every loose grain takes the colour the measured sky has when it
//                 falls (west on the left, east on the right); the dune at the
//                 bottom starts as strata of the last 24 hours of sky
//   rain          real water cells: they run off the numerals, sieve through the
//                 lettering, pool in the dune's hollows and seep away
//   snow          slow white grains that settle on every shoulder and melt above 34 F
//   wind          leans everything that falls, and makes the dune's surface hop
//                 downwind so it grows a slip face and creeps along the floor
//   fog, bad air  slow motes hanging in the air
//   cloud, sun    the paper's tone, and the hard little shadows under everything
//   day / night   warm paper by day, charcoal at night; inks flip while the
//                 ground is mid-grey
// The date, temperature, condition and countdown are 5x7 pixel lettering inside
// the simulation (grains land on them and sift through). Moon, air, UV and the
// day's fact are set as type on the base.

import { clamp, lerp, smoothstep, rng, oklch, toOklab, mix, el, addStyle, pixelCanvas, grain } from "../lib/kit.js";
import { sunPosition } from "../lib/astro.js";

const CELL = 6;
const COLS = 180;
const FLOOR = 270; // first row of the base; the simulation is rows 0..FLOOR-1
const LEFT = 11;
const DATE_Y = 11;
const HOUR_Y = 26;
const MIN_Y = 109;
const U = 5; // cells per numeral pixel
const DW = 13 * U;
const DH = 15 * U;
const SLOT_X = [11, 88];
const THREAD_X = 82;
const TEMP_Y = 193;
const CD_Y = 212;
const SCAN_Y = 221; // the dune lives below this row

const T_SAND = 1; // settled dune sand
const T_FRESH = 2; // sand that is still on its way
const T_WATER = 3;
const T_SNOW = 4;
const T_GLUE = 5; // numerals
const T_INK = 6; // lettering
const T_WALL = 7;

const NJ = 4;
const HIST = 12;
const SLOTS = HIST * 2 + 16;
const P_SKY = 1;
const P_PIG = P_SKY + SLOTS * NJ;
const P_INK = P_PIG + 6;
const P_WATER = P_INK + 2;
const P_SNOW = P_WATER + 4;
const JIT = [-0.04, -0.013, 0.013, 0.04];

// ----- the numerals: 13 x 15, each pixel 5 x 5 grains -----
const rep = (s, n) => Array(n).fill(s);
const BIG_SRC = {
  0: [".###########.", "#############", "#############", ...rep("####.....####", 9), "#############", "#############", ".###########."],
  1: ["...######....", "..#######....", ".########....", ".########....", ...rep("....#####....", 8), ...rep(".###########.", 3)],
  2: [".###########.", "#############", "#############", ...rep(".........####", 3), ".############", "#############", "############.", ...rep("####.........", 3), ...rep("#############", 3)],
  3: [".###########.", "#############", "#############", ...rep(".........####", 3), "...##########", "...#########.", "...##########", ...rep(".........####", 3), "#############", "#############", ".###########."],
  4: [".......######", "......#######", ".....########", "....#########", "...#####.####", "..#####..####", ".#####...####", "#####....####", ...rep("#############", 3), ...rep(".........####", 4)],
  5: [...rep("#############", 3), ...rep("####.........", 3), "############.", "#############", ".############", ...rep(".........####", 3), "#############", "#############", ".###########."],
  6: [".###########.", "#############", "#############", ...rep("####.........", 3), "############.", "#############", "#############", ...rep("####.....####", 3), "#############", "#############", ".###########."],
  7: [...rep("#############", 3), ...rep("........#####", 2), ...rep(".......#####.", 2), ...rep("......#####..", 2), ...rep(".....#####...", 2), ...rep("....#####....", 2), ...rep("...#####.....", 2)],
  8: [".###########.", "#############", "#############", ...rep("####.....####", 3), "#############", ".###########.", "#############", ...rep("####.....####", 3), "#############", "#############", ".###########."],
  9: [".###########.", "#############", "#############", ...rep("####.....####", 3), "#############", "#############", ".############", ...rep(".........####", 3), "#############", "#############", ".###########."],
};
const BIG = {};
for (const [ch, rows] of Object.entries(BIG_SRC)) {
  const m = new Uint8Array(13 * 15);
  rows.forEach((row, y) => {
    for (let x = 0; x < 13; x++) m[y * 13 + x] = row[x] === "#" ? 1 : 0;
  });
  BIG[ch] = m;
}

// ----- the lettering: 5 x 7, proportional -----
const FONT_SRC = {
  A: "01110 10001 10001 11111 10001 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110", C: "01110 10001 10000 10000 10000 10001 01110",
  D: "11110 10001 10001 10001 10001 10001 11110", E: "11111 10000 10000 11110 10000 10000 11111", F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01110 10001 10000 10111 10001 10001 01110", H: "10001 10001 10001 11111 10001 10001 10001", I: "111 010 010 010 010 010 111",
  J: "0011 0001 0001 0001 0001 1001 0110", K: "10001 10010 10100 11000 10100 10010 10001", L: "1000 1000 1000 1000 1000 1000 1111",
  M: "10001 11011 10101 10101 10001 10001 10001", N: "10001 10001 11001 10101 10011 10001 10001", O: "01110 10001 10001 10001 10001 10001 01110",
  P: "11110 10001 10001 11110 10000 10000 10000", Q: "01110 10001 10001 10001 10101 10010 01101", R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110", T: "11111 00100 00100 00100 00100 00100 00100", U: "10001 10001 10001 10001 10001 10001 01110",
  V: "10001 10001 10001 10001 10001 01010 00100", W: "10001 10001 10001 10101 10101 10101 01010", X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 01010 00100 00100 00100 00100", Z: "11111 00001 00010 00100 01000 10000 11111",
  0: "01110 10001 10001 10001 10001 10001 01110", 1: "010 110 010 010 010 010 111", 2: "01110 10001 00001 00110 01000 10000 11111",
  3: "11110 00001 00001 01110 00001 00001 11110", 4: "00010 00110 01010 10010 11111 00010 00010", 5: "11111 10000 11110 00001 00001 10001 01110",
  6: "01110 10000 10000 11110 10001 10001 01110", 7: "11111 00001 00010 00100 00100 01000 01000", 8: "01110 10001 10001 01110 10001 10001 01110",
  9: "01110 10001 10001 01111 00001 00001 01110",
  "°": "111 101 111 000 000 000 000", ",": "00 00 00 00 00 01 01 10", ".": "0 0 0 0 0 0 1", ":": "0 0 1 0 0 1 0", "-": "000 000 000 111 000 000 000",
  "–": "0000 0000 0000 1111 0000 0000 0000", "'": "1 1 0 0 0 0 0", "/": "001 001 010 010 010 100 100", "+": "000 000 010 111 010 000 000",
  "%": "11001 11010 00010 00100 01000 01011 10011", "&": "01100 10010 10100 01000 10101 10010 01101", " ": "000 000 000 000 000 000 000",
};
const FONT = {};
for (const [ch, src] of Object.entries(FONT_SRC)) {
  const rows = src.split(" ");
  FONT[ch] = { w: rows[0].length, rows: rows.map((r) => [...r].map((c) => c === "1")) };
}
FONT["−"] = FONT["-"];
FONT["’"] = FONT["'"];

// Pigment by temperature (F): [temp, lightness, chroma, hue].
const PIGMENT = [
  [0, 0.4, 0.21, 266], [20, 0.45, 0.19, 258], [36, 0.5, 0.14, 238], [50, 0.5, 0.115, 172],
  [62, 0.54, 0.115, 88], [74, 0.57, 0.155, 55], [86, 0.59, 0.205, 35], [100, 0.53, 0.215, 27],
];
function pigmentAt(temp, out) {
  let i = 1;
  while (i < PIGMENT.length - 1 && temp > PIGMENT[i][0]) i++;
  const a = PIGMENT[i - 1];
  const b = PIGMENT[i];
  const k = clamp((temp - a[0]) / (b[0] - a[0]));
  out[0] = lerp(a[1], b[1], k);
  out[1] = lerp(a[2], b[2], k);
  out[2] = lerp(a[3], b[3], k);
  return out;
}

// OKLab to a packed little-endian RGBA pixel.
const gam = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)));
function pack(L, a, b, alpha = 255) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const R = gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const G = gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const B = gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return ((alpha << 24) | (B << 16) | (G << 8) | R) >>> 0;
}
const css = (p) => `rgb(${p & 255},${(p >>> 8) & 255},${(p >>> 16) & 255})`;

const STYLE = `
.ph { position: absolute; inset: 0; overflow: hidden; background: #141211; }
.ph-base { position: absolute; left: 0; right: 0; top: ${FLOOR * CELL}px; bottom: 0; box-sizing: border-box; border-top: ${CELL}px solid #888;
  background: #171412; color: #d8cebc; font-family: "Fraunces", Georgia, serif; z-index: 3; }
.ph-trio { position: absolute; left: ${LEFT * CELL}px; right: 64px; top: 18px; display: grid; grid-template-columns: 1fr auto auto; column-gap: 60px; }
.ph-lab { font: 500 24px/28px "DM Mono", ui-monospace, monospace; letter-spacing: 0.14em; text-transform: uppercase; color: #9a9184; white-space: nowrap; }
.ph-val { font-size: 40px; line-height: 46px; font-weight: 400; font-variation-settings: "opsz" 36; white-space: nowrap; }
.ph-fact { position: absolute; left: ${LEFT * CELL}px; right: 64px; top: 108px; }
.ph-factv { margin-top: 4px; font-size: 38px; line-height: 43px; font-weight: 400; font-variation-settings: "opsz" 36;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; text-wrap: balance; }
.ph-base.nofact .ph-trio { top: 104px; }
.ph-base.nofact .ph-fact { display: none; }
`;

export default {
  title: "Poured Hours",
  description: "A wall-sized falling-sand toy: the time is poured in sand, and the weather is poured on top of it.",
  fonts: ["Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400", "DM Mono:wght@400;500"],
  fps: 30,

  mount(root, { state, seed }) {
    addStyle(root, STYLE);
    const wrap = el("div", { class: "ph" });
    root.append(wrap);
    const layer = pixelCanvas(wrap, { size: CELL });
    const ctx = layer.ctx;
    const img = ctx.createImageData(COLS, FLOOR);
    const px = new Uint32Array(img.data.buffer);

    const nMoon = el("div", { class: "ph-val" });
    const nAqi = el("div", { class: "ph-val" });
    const nUv = el("div", { class: "ph-val" });
    const nFactLab = el("div", { class: "ph-lab" });
    const nFact = el("div", { class: "ph-factv" });
    const cell = (label, node) => el("div", {}, el("div", { class: "ph-lab", text: label }), node);
    const base = el(
      "div",
      { class: "ph-base" },
      el("div", { class: "ph-trio" }, cell("Moon", nMoon), cell("Air quality", nAqi), cell("UV index", nUv)),
      el("div", { class: "ph-fact" }, nFactLab, nFact),
    );
    wrap.append(base);
    grain(wrap, { opacity: 0.05 });

    const shownText = {};
    const put = (key, node, value) => {
      if (shownText[key] === value) return false;
      shownText[key] = value;
      node.textContent = value;
      return true;
    };

    // ----- randomness (xorshift, seeded from the showing's seed) -----
    let rs = Math.floor(rng(seed)() * 4294967295) | 0 || 0x9e3779b9;
    const rnd = () => {
      rs ^= rs << 13;
      rs ^= rs >>> 17;
      rs ^= rs << 5;
      return rs >>> 0;
    };

    // ----- the grid -----
    const N = COLS * FLOOR;
    const type = new Uint8Array(N + COLS * 2);
    const col = new Uint8Array(N + COLS * 2);
    const ghost = new Uint8Array(N);
    const live = new Uint8Array(FLOOR + 3); // live[y + 1]: steps row y stays awake
    let stepN = 0;
    let sandCount = 0;
    let sandTarget = 0;
    let waterCount = 0;
    const wake = (y0, y1) => {
      for (let y = Math.max(0, y0); y <= y1 && y < FLOOR; y++) live[y + 1] = 2;
    };

    // ----- what the weather is doing, as numbers the automaton uses -----
    const E = { rain: 0, snow: 0, wdir: 1, ws: 0, temp: 50, cloud: 0, fog: 0, haze: 0, sun: 0, lagP: 20, driftP: 0, rainDrift: 0, snowDrift: 0, melt: 0, seepP: 6, snowCap: 3 };
    function readWeather(s) {
      const w = s.weather;
      const f = w.falling;
      E.rain = f === "rain" || f === "drizzle" || f === "storm" || f === "freezing" ? w.intensity : 0;
      E.snow = f === "snow" ? w.intensity : 0;
      const ew = -Math.sin((w.windDir * Math.PI) / 180); // + blows toward the east, the right of the frame
      if (Math.abs(ew) > 0.12 || E.ws === 0) E.wdir = ew >= 0 ? 1 : -1;
      const gust = 0.5 + 0.5 * Math.sin(s.t * 0.37 + 1.3 * Math.sin(s.t * 0.11));
      const speed = w.wind + Math.max(0, w.gust - w.wind) * gust * gust * 0.8;
      E.ws = clamp(speed / 30, 0, 1.4) * (0.5 + 0.5 * Math.abs(ew));
      E.temp = w.temp;
      E.cloud = clamp(w.cloud / 100);
      E.fog = w.fog ? 1 : clamp((2.5 - w.visibility) / 2.5) * 0.8;
      E.haze = clamp((w.aqi - 70) / 110);
      E.sun = s.daylight * (1 - 0.88 * Math.pow(E.cloud, 1.5)) * (f ? 0.25 : 1) * (1 - E.fog);
      const heat = clamp((w.temp - 84) / 16);
      E.lagP = 26 + Math.round(heat * 70); // of 256: how often a falling grain hesitates
      E.driftP = Math.round(clamp(E.ws * 0.11) * 256);
      E.rainDrift = Math.round(clamp(E.ws * 0.42) * 256);
      E.snowDrift = Math.round(clamp(E.ws * 0.85, 0, 0.9) * 256);
      E.melt = clamp((w.temp - 34) / 14);
      E.snowCap = 2 + Math.round(E.snow * 5);
    }

    // ----- colour -----
    const lut = new Uint32Array(256);
    const skyLab = new Float32Array(SLOTS * 3);
    let gen = 0;
    let skyKey = "";
    let skyVer = 0;
    const setSlot = (slot, hex) => {
      const lab = toOklab(hex);
      skyLab[slot * 3] = lab[0];
      skyLab[slot * 3 + 1] = lab[1];
      skyLab[slot * 3 + 2] = lab[2];
    };
    function readSky(s) {
      const k = s.sky.west + s.sky.northWest + s.sky.northEast + s.sky.east;
      if (k === skyKey) return;
      if (skyKey) gen = (gen + 1) & 3;
      skyKey = k;
      skyVer++;
      const b = HIST * 2 + gen * 4;
      setSlot(b, s.sky.west);
      setSlot(b + 1, s.sky.northWest);
      setSlot(b + 2, s.sky.northEast);
      setSlot(b + 3, s.sky.east);
    }
    // The palette index for a grain let loose at column x now: the sky, west to east.
    const skyCol = (x) => {
      const d = (x * 3) / (COLS - 1);
      let lo = d | 0;
      if (lo < 3 && (rnd() & 255) < (d - lo) * 256) lo++;
      return P_SKY + (HIST * 2 + gen * 4 + lo) * NJ + (rnd() & 3);
    };
    const pigCol = (x, y) => {
      const v = 2.5 + 1.5 * Math.sin(y * 0.83 + x * 0.021) + ((rnd() % 3) - 1);
      return P_PIG + (v < 0 ? 0 : v > 5 ? 5 : v | 0);
    };

    const CREAM = toOklab("#f6edda");
    const CHAR = toOklab("#141211");
    const ground = [0, 0, 0];
    const pig = [0, 0, 0];
    let lastSig = "";
    let shadowPx = 0;
    let ghostFill = 0;
    let ghostEdge = 0;
    let motePx = 0;
    let inkPx = 0;
    let bolt = 0; // 0..1 soft lift of the ground in a thunderstorm
    let nextBolt = 9;
    let boltAt = -99;
    let skyMeanKey = "";
    let skyMean = [0.7, 0, 0];

    function relight(s) {
      if (s.sky.mean !== skyMeanKey) {
        skyMeanKey = s.sky.mean;
        skyMean = toOklab(s.sky.mean);
      }
      const g = smoothstep(0.2, 0.8, s.daylight);
      const wet = Math.max(E.rain, E.snow * 0.6);
      const storm = s.weather.falling === "storm" ? 1 : 0;
      const Lp = 0.955 - 0.075 * E.cloud - 0.05 * wet - 0.07 * storm - 0.03 * E.fog - 0.02 * E.haze;
      const k = 0.1 + 0.3 * E.cloud;
      const warm = clamp((E.temp - 78) / 20) - clamp((36 - E.temp) / 30);
      const pa = CREAM[1] * (1 - k) + skyMean[1] * k * 0.6 + 0.004 * Math.max(0, warm) + 0.006 * E.haze;
      const pb = CREAM[2] * (1 - k) + skyMean[2] * k * 0.6 + 0.012 * warm + 0.014 * E.haze;
      ground[0] = lerp(CHAR[0], Lp, g) + bolt * 0.075;
      ground[1] = lerp(CHAR[1] + skyMean[1] * 0.12, pa, g);
      ground[2] = lerp(CHAR[2] + skyMean[2] * 0.12, pb, g);
      const Lg = ground[0];
      const gp = pack(Lg, ground[1], ground[2]);
      const sig = `${gp}|${Math.round(E.temp * 2)}|${skyVer}|${Math.round(E.fog * 20)}|${Math.round(E.sun * 40)}|${Math.round(E.haze * 10)}`;
      if (sig === lastSig) return;
      lastSig = sig;
      wrap.style.background = css(gp);
      const fl = smoothstep(0.5, 0.62, Lg); // 1: dark things on a light ground. 0: light things on a dark ground.
      const fogMix = 0.3 * E.fog;

      for (let sl = 0; sl < SLOTS; sl++) {
        const Li = skyLab[sl * 3];
        const ai = skyLab[sl * 3 + 1];
        const bi = skyLab[sl * 3 + 2];
        const ci = Math.hypot(ai, bi);
        const cs = (ci > 0.12 ? 0.12 / ci : 1) * lerp(0.8, 1, fl);
        for (let j = 0; j < NJ; j++) {
          const Ld = Lg - 0.11 - 0.22 * (1 - Li) + JIT[j];
          const Ln = Lg + 0.08 + 0.22 * Li + JIT[j] * 0.7;
          const L = lerp(lerp(Ln, Ld, fl), Lg, fogMix);
          lut[P_SKY + sl * NJ + j] = pack(L, lerp(ai * cs, ground[1], fogMix), lerp(bi * cs, ground[2], fogMix));
        }
      }

      pigmentAt(E.temp, pig);
      const dayP = toOklab(oklch(Math.min(pig[0], Lg - 0.38), pig[1], pig[2]));
      const nightP = toOklab(oklch(Math.max(0.7, Lg + 0.42), Math.max(0.075, pig[1] * 0.62), pig[2]));
      const pL = lerp(nightP[0], dayP[0], fl);
      const pA = lerp(nightP[1], dayP[1], fl);
      const pB = lerp(nightP[2], dayP[2], fl);
      for (let j = 0; j < 6; j++) lut[P_PIG + j] = pack(pL + (j - 2.5) * 0.013, pA, pB);
      ghostFill = pack(pL, pA, pB, 62);
      ghostEdge = pack(pL, pA, pB, 150);
      base.style.borderTopColor = css(pack(nightP[0] - 0.06 - 0.1 * (1 - g), nightP[1], nightP[2]));
      base.style.background = css(pack(lerp(0.13, 0.19, g), 0.004, 0.006));
      base.style.color = css(pack(lerp(0.76, 0.86, g), 0.006, 0.022));

      const inkL = lerp(Math.max(0.8, Lg + 0.36), Math.min(0.27, Lg - 0.46), fl);
      lut[P_INK] = pack(inkL, 0.003, 0.012);
      lut[P_INK + 1] = pack(inkL + 0.025, 0.003, 0.012);
      inkPx = lut[P_INK];

      const wHue = (242 * Math.PI) / 180;
      const wL = lerp(Lg + 0.27, Lg - 0.24, fl);
      const wC = lerp(0.075, 0.1, fl);
      for (let j = 0; j < 4; j++) lut[P_WATER + j] = pack(wL + [0, -0.025, 0.025, lerp(0.14, 0.09, fl)][j], wC * Math.cos(wHue), wC * Math.sin(wHue));
      const sL = lerp(0.84, 0.995, g);
      for (let j = 0; j < 4; j++) lut[P_SNOW + j] = pack(sL - j * 0.014, -0.002, -0.008 - 0.004 * (1 - g));

      shadowPx = E.sun * fl > 0.02 ? pack(0.2, 0.01, 0.02, Math.round(46 * E.sun * fl)) : 0;
      const mL = lerp(Lg + 0.16, Lg - 0.13, fl);
      motePx = pack(mL, ground[1] + 0.01 * E.haze, ground[2] + 0.035 * E.haze, 170);
    }

    // ----- lettering in the simulation -----
    const mkLedge = (x, y, scale) => ({ x, y, scale, text: null, w: 0, n: 0, cells: new Int32Array(2600) });
    const Ldate = mkLedge(LEFT, DATE_Y, 1);
    const Ltemp = mkLedge(LEFT, TEMP_Y, 2);
    const Lcond = mkLedge(LEFT, TEMP_Y + 7, 1);
    const Lcd = mkLedge(LEFT, CD_Y, 1);
    const Lap1 = mkLedge(158, MIN_Y + DH - 30, 2);
    const Lap2 = mkLedge(158, MIN_Y + DH - 14, 2);
    function stamp(L, text) {
      for (let k = 0; k < L.n; k++) if (type[L.cells[k]] === T_INK) type[L.cells[k]] = 0;
      L.n = 0;
      L.text = text;
      let x = L.x;
      const sc = L.scale;
      for (const ch of text) {
        const g = FONT[ch] || FONT[" "];
        for (let r = 0; r < g.rows.length; r++) {
          for (let c = 0; c < g.w; c++) {
            if (!g.rows[r][c]) continue;
            for (let sy = 0; sy < sc; sy++) {
              for (let sx = 0; sx < sc; sx++) {
                const cx = x + c * sc + sx;
                const cy = L.y + r * sc + sy;
                if (cx >= COLS || cy >= FLOOR || L.n >= L.cells.length) continue;
                const i = cy * COLS + cx;
                if (type[i] === T_SAND) sandCount--;
                type[i] = T_INK;
                col[i] = P_INK + ((cx * 7 + cy * 13) % 5 === 0 ? 1 : 0);
                L.cells[L.n++] = i;
              }
            }
          }
        }
        x += (g.w + 1) * sc;
      }
      L.w = Math.max(0, x - L.x - sc);
      wake(L.y - 2, L.y + 8 * sc + 1);
    }
    function syncText(s) {
      const tx = s.text;
      const date = tx.date.toUpperCase();
      if (date !== Ldate.text) stamp(Ldate, date);
      const cond = tx.condition.toUpperCase();
      if (tx.temp !== Ltemp.text || cond !== Lcond.text) {
        stamp(Ltemp, tx.temp);
        Lcond.x = LEFT + Ltemp.w + 6;
        stamp(Lcond, cond);
      }
      const cd = `${tx.sunLabel} ${tx.sunValue}`.toUpperCase();
      if (cd !== Lcd.text) stamp(Lcd, cd);
      if (tx.ampm[0] !== Lap1.text) {
        stamp(Lap1, tx.ampm[0]);
        stamp(Lap2, tx.ampm[1]);
      }
    }

    // ----- the numerals -----
    const shown = [["", ""], ["", ""]];
    const rowY = (r) => (r ? MIN_Y : HOUR_Y);
    function glueSlot(r, slot, ch) {
      const x0 = SLOT_X[slot];
      const y0 = rowY(r);
      const m = ch ? BIG[ch] : null;
      for (let cy = 0; cy < DH; cy++) {
        for (let cx = 0; cx < DW; cx++) {
          const i = (y0 + cy) * COLS + x0 + cx;
          ghost[i] = 0;
          const on = m && m[((cy / U) | 0) * 13 + ((cx / U) | 0)];
          if (on) {
            type[i] = T_GLUE;
            col[i] = pigCol(x0 + cx, y0 + cy);
          } else if (type[i] === T_GLUE) type[i] = 0;
        }
      }
      wake(y0 - 2, y0 + DH + 1);
    }

    const LT = 10; // rows printed per pass of the hopper
    const PASSES = Math.ceil(DH / LT);
    const mkJob = (r) => ({ r, active: false, step0: 0, pr0: 0, n: 0, ptr: 0, keys: new Uint32Array(2 * DW * DH), cr: [false, false], crumbling: false, x0: 0, x1: 0, dir0: 1, S: 40, hx: -20, stream: -1, leaving: false });
    const jobs = [mkJob(0), mkJob(1)];

    function finishJob(job) {
      glueSlot(job.r, 0, shown[job.r][0]);
      glueSlot(job.r, 1, shown[job.r][1]);
      job.active = false;
    }
    function startJob(job, want) {
      const r = job.r;
      const y0 = rowY(r);
      const y1 = y0 + DH - 1;
      job.n = 0;
      job.ptr = 0;
      job.crumbling = false;
      job.leaving = false;
      let x0 = COLS;
      let x1 = 0;
      for (let sl = 0; sl < 2; sl++) {
        job.cr[sl] = false;
        if (want[sl] === shown[r][sl]) continue;
        if (shown[r][sl]) {
          job.cr[sl] = true;
          job.crumbling = true;
        }
        if (want[sl]) {
          x0 = Math.min(x0, SLOT_X[sl]);
          x1 = Math.max(x1, SLOT_X[sl] + DW - 1);
        }
      }
      job.x0 = x0;
      job.x1 = x1;
      const span = Math.max(1, x1 - x0);
      job.S = span > 70 ? 56 : 40;
      job.dir0 = (x0 + x1) / 2 < COLS / 2 ? 1 : -1;
      for (let sl = 0; sl < 2; sl++) {
        if (want[sl] === shown[r][sl] || !want[sl]) continue;
        const m = BIG[want[sl]];
        const sx = SLOT_X[sl];
        const inside = (cx, cy) => cx >= 0 && cy >= 0 && cx < DW && cy < DH && m[((cy / U) | 0) * 13 + ((cx / U) | 0)] === 1;
        for (let cy = 0; cy < DH; cy++) {
          for (let cx = 0; cx < DW; cx++) {
            if (!inside(cx, cy)) continue;
            const x = sx + cx;
            const y = y0 + cy;
            const i = y * COLS + x;
            ghost[i] = inside(cx - 1, cy) && inside(cx + 1, cy) && inside(cx, cy - 1) && inside(cx, cy + 1) ? 1 : 2;
            const p = ((y1 - y) / LT) | 0;
            const rb = (y1 - y) % LT;
            const dir = p % 2 === 0 ? job.dir0 : -job.dir0;
            const u = dir > 0 ? (x - x0) / span : (x1 - x) / span;
            const time = Math.round(p * job.S + u * job.S * 0.85 + rb * 0.5 + (rnd() % 3));
            job.keys[job.n++] = time * 65536 + i;
          }
        }
      }
      job.keys.subarray(0, job.n).sort();
      job.step0 = stepN;
      job.pr0 = job.crumbling ? 92 : 44;
      job.hx = job.dir0 > 0 ? -12 : COLS + 12;
      job.stream = -1;
      job.active = true;
      shown[r][0] = want[0];
      shown[r][1] = want[1];
    }
    function jobStep(job) {
      const e = stepN - job.step0;
      const y0 = rowY(job.r);
      const y1 = y0 + DH - 1;
      if (job.crumbling) {
        const front = Math.min(DH, (e * 1.7) | 0);
        const force = e > 60;
        for (let sl = 0; sl < 2; sl++) {
          if (!job.cr[sl]) continue;
          const sx = SLOT_X[sl];
          for (let y = y1; y > y1 - front; y--) {
            const row = y * COLS;
            for (let x = sx; x < sx + DW; x++) {
              const i = row + x;
              if (type[i] === T_GLUE && (force || (rnd() & 3) === 0)) {
                type[i] = T_FRESH;
                col[i] = skyCol(x);
              }
            }
          }
        }
        wake(y1 - front - 1, y1 + 1);
        if (force) job.crumbling = false;
      }
      job.stream = -1;
      if (!job.n) {
        if (!job.crumbling) job.active = false;
        return;
      }
      const tau = e - job.pr0;
      const startX = job.dir0 > 0 ? job.x0 : job.x1;
      if (job.leaving) {
        const out = job.hx < COLS / 2 ? -1 : 1;
        job.hx += out * 2.2;
        if (job.hx < -12 || job.hx > COLS + 12) job.active = false;
        return;
      }
      if (tau < 0) {
        const f = clamp((tau + 40) / 40);
        const from = job.dir0 > 0 ? -12 : COLS + 12;
        job.hx = lerp(from, startX, 1 - (1 - f) * (1 - f) * (1 - f));
        return;
      }
      while (job.ptr < job.n && job.keys[job.ptr] >>> 16 <= tau) {
        const i = job.keys[job.ptr++] & 0xffff;
        if (type[i] === T_SAND) sandCount--;
        type[i] = T_GLUE;
        col[i] = pigCol(i % COLS, (i / COLS) | 0);
        ghost[i] = 0;
      }
      const p = Math.min(PASSES - 1, (tau / job.S) | 0);
      const f = clamp((tau - p * job.S) / (job.S * 0.85));
      const dir = p % 2 === 0 ? job.dir0 : -job.dir0;
      job.hx = dir > 0 ? lerp(job.x0, job.x1, f) : lerp(job.x1, job.x0, f);
      // The stream runs only while there is something under the hopper to fill on this pass.
      const hxi = Math.round(job.hx);
      const top = Math.max(y0, y1 - (p + 1) * LT + 1);
      for (let y = y1 - p * LT; y >= top; y--) {
        const i = y * COLS + hxi;
        if (ghost[i] !== 0 || type[i] === T_GLUE) {
          job.stream = y1 - p * LT;
          break;
        }
      }
      if (job.ptr >= job.n && tau > PASSES * job.S + 6) {
        for (let cy = 0; cy < DH; cy++) for (let x = job.x0; x <= job.x1; x++) ghost[(y0 + cy) * COLS + x] = 0;
        job.leaving = true;
      }
    }
    function syncTime(s, snap) {
      for (let r = 0; r < 2; r++) {
        const str = r ? s.text.mm : s.text.hh;
        const want = str.length === 1 ? [str, ""] : [str[0], str[1]];
        if (want[0] === shown[r][0] && want[1] === shown[r][1]) continue;
        const job = jobs[r];
        if (snap) {
          shown[r][0] = want[0];
          shown[r][1] = want[1];
          finishJob(job);
          continue;
        }
        if (job.active) finishJob(job);
        startJob(job, want);
      }
    }

    // ----- the dune -----
    const slots = [0, 0, 0, 0];
    function buildDune(s) {
      const r = rng(seed + 11);
      const n = s.sky.day ? s.sky.day.length : 0;
      for (let k = 0; k < HIST; k++) {
        let wHex;
        let eHex;
        if (n >= 4) {
          const e = s.sky.day[Math.min(n - 1, Math.floor(((k + 0.5) / HIST) * n))];
          wHex = mix(e.west, e.northWest, 0.5);
          eHex = mix(e.east, e.northEast, 0.5);
        } else {
          // No record of the sky: stand-in strata from where the sun was.
          const alt = sunPosition(s.ms - 24 * 3600e3 * (1 - (k + 0.5) / HIST)).alt;
          const day = smoothstep(-9, 8, alt);
          const glow = Math.exp(-((alt / 6) ** 2));
          const c = mix(mix("#141a33", "#78a6d8", day), "#e2987c", glow * 0.6);
          wHex = mix(c, s.sky.mean, 0.25);
          eHex = mix(c, s.sky.mean, 0.4);
        }
        setSlot(k * 2, wHex);
        setSlot(k * 2 + 1, eHex);
      }
      const ws = clamp(s.weather.wind / 30);
      const crest = 0.5 + 0.42 * ws;
      const hump = (u) => {
        u -= Math.floor(u);
        if (E.wdir < 0) u = 1 - u;
        const v = u < crest ? u / crest : (1 - u) / (1 - crest);
        return v * v * (3 - 2 * v);
      };
      const ph1 = r();
      const ph2 = r();
      const ph3 = r() * 6.28;
      const wk = [];
      const fk = [];
      const pk = [];
      for (let k = 0; k < HIST; k++) {
        wk.push(k === HIST - 1 ? 0.5 : r.range(0.6, 1.5));
        fk.push(r.range(0.018, 0.075));
        pk.push(r.range(0, 6.28));
      }
      const th = new Float32Array(HIST);
      for (let x = 0; x < COLS; x++) {
        const h = Math.round(13 + 14 * hump(x / COLS + ph1) + 5 * hump((2 * x) / COLS + ph2) + 1.3 * Math.sin(x * 0.21 + ph3));
        let total = 0;
        for (let k = 0; k < HIST; k++) {
          th[k] = wk[k] * (1 + 0.5 * Math.sin(x * fk[k] + pk[k]));
          total += th[k];
        }
        for (let hh = 0; hh < h; hh++) {
          const v = clamp((hh + 0.5 + (r() - 0.5) * 0.9) / h, 0, 0.999) * total;
          let k = 0;
          let acc = th[0];
          while (k < HIST - 1 && v > acc) acc += th[++k];
          const i = (FLOOR - 1 - hh) * COLS + x;
          type[i] = T_SAND;
          col[i] = P_SKY + (k * 2 + (r() < x / COLS ? 1 : 0)) * NJ + ((r() * NJ) | 0);
          sandCount++;
        }
      }
      sandTarget = sandCount;
      for (let k = 0; k < 4; k++) slots[k] = Math.round(((k + 0.2 + 0.6 * r()) / 4) * COLS);
      wake(SCAN_Y, FLOOR - 1);
    }
    // Lets one grain out through the floor; the hole walks up through the strata and folds them.
    function drainOne() {
      const r0 = rnd();
      let x = clamp(slots[r0 & 3] + (((r0 >>> 2) % 5) - 2), 0, COLS - 1);
      let y = FLOOR - 1;
      let i = y * COLS + x;
      if (type[i] !== T_SAND) return;
      type[i] = 0;
      sandCount--;
      while (y > SCAN_Y) {
        const r = rnd();
        let nx = x + ((r & 3) === 0 ? -1 : (r & 3) === 1 ? 1 : 0);
        if (nx < 0 || nx >= COLS) nx = x;
        let j = (y - 1) * COLS + nx;
        if (type[j] !== T_SAND) {
          nx = x;
          j = (y - 1) * COLS + x;
          if (type[j] !== T_SAND) break;
        }
        type[i] = T_SAND;
        col[i] = col[j];
        type[j] = 0;
        i = j;
        x = nx;
        y--;
      }
      wake(y - 2, y + 1);
    }
    // The wind lifts one grain off the dune's surface and sets it down a little downwind.
    function hop() {
      const r = rnd();
      const x = r % COLS;
      let y = SCAN_Y;
      let i = y * COLS + x;
      while (y < FLOOR && type[i] === 0) {
        y++;
        i += COLS;
      }
      if (y >= FLOOR || y <= SCAN_Y + 1) return;
      const t = type[i];
      if (t !== T_SAND && t !== T_SNOW && t !== T_FRESH) return;
      let nx = x + E.wdir;
      if (nx < 0) nx += COLS;
      else if (nx >= COLS) nx -= COLS;
      const lift = ((r >>> 8) & 7) === 0 ? 2 + ((r >>> 11) & 1) : 1;
      const j = (y - lift) * COLS + nx;
      if (type[j] !== 0) return;
      type[j] = t;
      col[j] = col[i];
      type[i] = 0;
      wake(y - lift - 1, y + 1);
    }

    // ----- what falls in from the top -----
    let beadLeft = 0;
    let lastSec = -1;
    let hopAcc = 0;
    let rainAcc = 0;
    let snowAcc = 0;
    function feed() {
      // the seconds thread
      if (beadLeft > 0 || stepN % 6 === 0) {
        if (type[THREAD_X] === 0) {
          type[THREAD_X] = T_FRESH;
          col[THREAD_X] = skyCol(THREAD_X);
          live[1] = live[2] = 2;
        }
        if (beadLeft > 0) beadLeft--;
      }
      if (E.rain > 0) {
        rainAcc += E.rain * 3.4;
        while (rainAcc >= 1) {
          rainAcc--;
          const x = rnd() % COLS;
          if (type[x] === 0) {
            type[x] = T_WATER;
            col[x] = P_WATER + (rnd() & 3);
            waterCount++;
          }
        }
        live[1] = live[2] = 2;
      }
      if (E.snow > 0) {
        snowAcc += E.snow * 1.5;
        while (snowAcc >= 1) {
          snowAcc--;
          const x = rnd() % COLS;
          if (type[x] === 0) {
            type[x] = T_SNOW;
            col[x] = P_SNOW + (rnd() & 3);
          }
        }
        live[1] = live[2] = 2;
      }
      hopAcc += E.ws * E.ws * 5.5;
      while (hopAcc >= 1) {
        hopAcc--;
        hop();
      }
      if (sandCount > sandTarget && (stepN & 3) === 0) drainOne();
      if (E.melt > 0) {
        for (let k = 0; k < 10; k++) {
          const r = rnd();
          const i = r % N;
          if (type[i] === T_SNOW && ((r >>> 20) & 255) < E.melt * 256) {
            type[i] = T_WATER;
            col[i] = P_WATER + (r & 3);
            waterCount++;
            wake(((i / COLS) | 0) - 1, ((i / COLS) | 0) + 1);
          }
        }
      }
      E.seepP = waterCount > 500 + 1500 * E.rain ? 40 : 7;
    }

    // ----- one step of the automaton: bottom row first, only rows that are awake -----
    function step() {
      stepN++;
      const ltr = (stepN & 1) === 1;
      const wdir = E.wdir;
      const lagP = E.lagP;
      const driftP = E.driftP;
      for (let y = FLOOR - 1; y >= 0; y--) {
        if (live[y + 1] === 0) continue;
        live[y + 1]--;
        const row = y * COLS;
        const onFloor = y === FLOOR - 1;
        for (let k = 0; k < COLS; k++) {
          const x = ltr ? k : COLS - 1 - k;
          const i = row + x;
          const t = type[i];
          if (t === 0 || t >= T_GLUE) continue;
          const r = rnd();
          const below = i + COLS;
          const tb = onFloor ? T_WALL : type[below];

          if (t <= T_FRESH) {
            if (tb === 0) {
              if ((r & 255) < lagP) {
                live[y + 1] = 2;
                continue;
              }
              let j = below;
              if (((r >>> 8) & 255) < driftP) {
                const nx = x + wdir;
                const jw = nx < 0 ? below + COLS - 1 : nx >= COLS ? below - COLS + 1 : below + wdir;
                if (type[jw] === 0) j = jw;
              } else if (((r >>> 16) & 31) === 0) {
                const d = (r >>> 22) & 1 ? 1 : -1;
                if (x + d >= 0 && x + d < COLS && type[below + d] === 0) j = below + d;
              }
              type[j] = t;
              col[j] = col[i];
              type[i] = 0;
              live[y] = live[y + 1] = live[y + 2] = 2;
              continue;
            }
            if (tb === T_WATER) {
              if (r & 1) {
                type[below] = t;
                type[i] = T_WATER;
                const c = col[below];
                col[below] = col[i];
                col[i] = c;
              }
              live[y] = live[y + 1] = live[y + 2] = 2;
              continue;
            }
            let d = r & 2 ? 1 : -1;
            let moved = false;
            for (let q = 0; q < 2; q++, d = -d) {
              if (x + d < 0 || x + d >= COLS) continue;
              const j = below + d;
              if (onFloor) break;
              if (type[j] === 0) {
                type[j] = t;
                col[j] = col[i];
                type[i] = 0;
                moved = true;
                break;
              }
            }
            if (moved) {
              live[y] = live[y + 1] = live[y + 2] = 2;
              continue;
            }
            if (t !== T_FRESH || tb === T_FRESH) continue;
            // Fresh sand at rest on something: it lingers, then sinks in (the deeper the heap, the faster).
            live[y + 1] = 2;
            let hf = 0;
            for (let j = i - COLS; j >= 0 && hf < 6 && type[j] === T_FRESH; j -= COLS) hf++;
            const p = 2 + hf * hf * 3;
            const pr = (r >>> 8) & 255;
            if (tb === T_GLUE) {
              if (((r >>> 3) & 3) === 0) {
                const dd = ((r >>> 5) & 3) === 0 ? -wdir : (r >>> 7) & 1 ? 1 : -1;
                if (x + dd >= 0 && x + dd < COLS && type[i + dd] === 0) {
                  type[i + dd] = t;
                  col[i + dd] = col[i];
                  type[i] = 0;
                  live[y] = 2;
                  continue;
                }
              }
              if (pr < p) {
                type[i] = 0;
                live[y] = 2;
              }
            } else if (tb === T_INK) {
              if (pr < p * 2) {
                let j = below;
                let n = 0;
                while (n < 16 && j < N && type[j] === T_INK) {
                  j += COLS;
                  n++;
                }
                if (j < N && type[j] === 0) {
                  type[j] = t;
                  col[j] = col[i];
                  live[y + n + 1] = live[y + n + 2] = 2;
                }
                type[i] = 0;
                live[y] = 2;
              }
            } else if (pr < p * 3) {
              if (tb !== T_SNOW && ((r >>> 16) & 255) < 13) {
                type[i] = T_SAND;
                sandCount++;
              } else type[i] = 0;
              live[y] = 2;
            }
            continue;
          }

          if (t === T_WATER) {
            if (tb === 0) {
              let j = below;
              let yy = y + 1;
              if (((r >>> 8) & 255) < E.rainDrift) {
                const nx = x + wdir;
                const jw = nx < 0 ? below + COLS - 1 : nx >= COLS ? below - COLS + 1 : below + wdir;
                if (type[jw] === 0) j = jw;
              }
              if (yy + 1 < FLOOR && type[j + COLS] === 0) {
                j += COLS;
                yy++;
                if (r & 1 && yy + 1 < FLOOR && type[j + COLS] === 0) {
                  j += COLS;
                  yy++;
                }
              }
              type[j] = T_WATER;
              col[j] = col[i];
              type[i] = 0;
              live[y] = live[y + 1] = 2;
              live[yy + 1] = live[yy + 2] = 2;
              continue;
            }
            live[y + 1] = 2;
            const d = r & 2 ? 1 : -1;
            const okA = x + d >= 0 && x + d < COLS;
            const okB = x - d >= 0 && x - d < COLS;
            let j = -1;
            if (!onFloor && okA && type[below + d] === 0) j = below + d;
            else if (!onFloor && okB && type[below - d] === 0) j = below - d;
            else if (okA && type[i + d] === 0) j = i + d;
            else if (okB && type[i - d] === 0) j = i - d;
            const pr = (r >>> 8) & 255;
            if (tb === T_INK && pr < 70) {
              let q = below;
              let n = 0;
              while (n < 16 && q < N && type[q] === T_INK) {
                q += COLS;
                n++;
              }
              if (q < N && type[q] === 0) {
                type[q] = T_WATER;
                col[q] = col[i];
                type[i] = 0;
                live[y] = 2;
                live[y + n + 1] = live[y + n + 2] = 2;
                continue;
              }
            }
            if ((tb === T_SAND || tb === T_FRESH || tb === T_WALL || tb === T_SNOW) && pr < E.seepP) {
              type[i] = 0;
              waterCount--;
              live[y] = 2;
              continue;
            }
            if (j < 0) {
              if (tb === T_GLUE && pr < 10) {
                type[i] = 0;
                waterCount--;
                live[y] = 2;
              }
              continue;
            }
            type[j] = T_WATER;
            col[j] = col[i];
            type[i] = 0;
            live[y] = live[y + 2] = 2;
            continue;
          }

          // snow: slow, wobbling, sticky
          if ((r & 3) !== 0) {
            if (tb === 0) live[y + 1] = 2;
            continue;
          }
          if (tb === 0) {
            let dx = 0;
            const wob = (r >>> 2) & 7;
            if (((r >>> 8) & 255) < E.snowDrift) dx = wdir;
            else if (wob === 0) dx = -1;
            else if (wob === 1) dx = 1;
            let j = below;
            if (dx !== 0) {
              const nx = x + dx;
              const jw = nx < 0 ? below + COLS - 1 : nx >= COLS ? below - COLS + 1 : below + dx;
              if (type[jw] === 0) j = jw;
            }
            type[j] = T_SNOW;
            col[j] = col[i];
            type[i] = 0;
            live[y] = live[y + 1] = live[y + 2] = 2;
            continue;
          }
          if (tb === T_WATER) {
            type[i] = T_WATER;
            col[i] = P_WATER + (r & 3);
            waterCount++;
            continue;
          }
          const d = (r >>> 5) & 1 ? 1 : -1;
          if (!onFloor && x + d >= 0 && x + d < COLS && type[below + d] === 0 && type[i + d] === 0 && (y + 2 >= FLOOR || type[below + d + COLS] === 0) && ((r >>> 6) & 1)) {
            type[below + d] = T_SNOW;
            col[below + d] = col[i];
            type[i] = 0;
            live[y] = live[y + 1] = live[y + 2] = 2;
            continue;
          }
          // at rest: drifts only get so deep on each kind of surface
          let depth = 0;
          let q = below;
          while (depth < 12 && q < N && type[q] === T_SNOW) {
            q += COLS;
            depth++;
          }
          const under = q < N ? type[q] : T_WALL;
          const cap = under === T_INK ? 1 : under === T_GLUE ? E.snowCap : E.snowCap + 2;
          if (depth >= cap && ((r >>> 8) & 7) === 0) {
            type[i] = 0;
            live[y] = 2;
          }
        }
      }
    }

    // ----- motes: fog and bad air hanging in the frame -----
    const MOTES = 4200;
    const mx = new Float32Array(MOTES);
    const my = new Float32Array(MOTES);
    const mp = new Float32Array(MOTES);
    {
      const r = rng(seed + 5);
      for (let k = 0; k < MOTES; k++) {
        mx[k] = r() * COLS;
        my[k] = r() * FLOOR;
        mp[k] = r() * 6.283;
      }
    }

    // ----- drawing -----
    const HOPPER = [9, 9, 7, 5, 3];
    function render(s) {
      for (let i = 0; i < N; i++) {
        const t = type[i];
        px[i] = t !== 0 ? lut[col[i]] : ghost[i] !== 0 ? (ghost[i] === 1 ? ghostFill : ghostEdge) : 0;
      }
      if (shadowPx !== 0) {
        for (let y = 2; y < FLOOR; y++) {
          const row = y * COLS;
          for (let x = 2; x < COLS; x++) {
            const i = row + x;
            if (px[i] !== 0) continue;
            const t1 = type[i - COLS - 1];
            if ((t1 !== 0 && t1 !== T_WATER) || type[i - 2 * COLS - 2] === T_GLUE) px[i] = shadowPx;
          }
        }
      }
      const nm = Math.round(MOTES * clamp(E.fog * 0.95 + E.haze * 0.3));
      if (nm > 0) {
        const t = s.t;
        const dt = s.dt;
        const push = E.wdir * E.ws * 2.2;
        for (let k = 0; k < nm; k++) {
          let x = mx[k] + (0.55 * Math.sin(my[k] * 0.045 + t * 0.11 + mp[k]) + push) * dt;
          let y = my[k] + 0.4 * Math.cos(mx[k] * 0.04 - t * 0.09 + mp[k] * 1.7) * dt;
          if (x < 0) x += COLS;
          else if (x >= COLS) x -= COLS;
          if (y < 0) y += FLOOR;
          else if (y >= FLOOR) y -= FLOOR;
          mx[k] = x;
          my[k] = y;
          const i = (y | 0) * COLS + (x | 0);
          if (type[i] === 0) px[i] = motePx;
        }
      }
      for (let r = 0; r < 2; r++) {
        const job = jobs[r];
        if (!job.active || !job.n) continue;
        const hx = Math.round(job.hx);
        const hy = rowY(r) - 7;
        if (job.stream >= 0) {
          for (let y = hy + 5; y <= job.stream; y++) {
            for (let dx = -1; dx <= 1; dx++) {
              const x = hx + dx;
              if (x < 0 || x >= COLS) continue;
              const i = y * COLS + x;
              if (dx === 0 && type[i] === T_GLUE) {
                y = FLOOR;
                break;
              }
              if (type[i] === T_GLUE) continue;
              const h = Math.imul(x * 374761393 + (y - stepN * 2) * 668265263, 1274126177) >>> 24;
              if (h > (dx === 0 ? 40 : 120)) px[i] = lut[P_PIG + (h & 3)];
            }
          }
        }
        for (let q = 0; q < HOPPER.length; q++) {
          const half = (HOPPER[q] - 1) >> 1;
          for (let x = hx - half; x <= hx + half; x++) if (x >= 0 && x < COLS) px[(hy + q) * COLS + x] = inkPx;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    // ----- set the stage, and run it in so the first frame is already mid-weather -----
    readWeather(state);
    readSky(state);
    buildDune(state);
    syncText(state);
    syncTime(state, true);
    if (E.snow > 0) {
      // drifts already lying on every exposed shoulder
      for (let x = 0; x < COLS; x++) {
        let clear = 0;
        for (let y = 0; y < FLOOR - 1; y++) {
          const i = y * COLS + x;
          if (type[i] !== 0) {
            clear = 0;
            continue;
          }
          clear++;
          const tb = type[i + COLS];
          if (tb === 0 || clear < 4) continue;
          const cap = tb === T_INK ? 1 : tb === T_GLUE ? E.snowCap : E.snowCap + 2;
          const d = Math.min(clear - 1, Math.max(1, Math.round(cap * (0.55 + (rnd() % 100) / 220))));
          for (let k = 0; k < d; k++) {
            type[i - k * COLS] = T_SNOW;
            col[i - k * COLS] = P_SNOW + (rnd() & 3);
          }
        }
      }
    }
    for (let k = 0; k < 420; k++) {
      feed();
      step();
    }

    let lastMs = state.ms;
    let acc = 0;

    return {
      frame(s) {
        const jumped = Math.abs(s.ms - lastMs) > 4000;
        lastMs = s.ms;
        readWeather(s);
        readSky(s);
        syncText(s);
        syncTime(s, jumped);
        if (s.clock.s !== lastSec) {
          lastSec = s.clock.s;
          beadLeft = 4;
        }

        // a thunderstorm now and then lifts the light, slowly
        if (s.weather.falling === "storm") {
          if (s.t > nextBolt) {
            boltAt = s.t;
            nextBolt = s.t + 11 + (rnd() % 1000) / 55;
          }
          const a = s.t - boltAt;
          bolt = a < 0 ? 0 : a < 0.5 ? smoothstep(0, 0.5, a) : Math.exp(-(a - 0.5) / 0.9);
          if (bolt < 0.01) bolt = 0;
        } else bolt = 0;

        acc += s.dt * 60;
        let n = acc | 0;
        acc -= n;
        if (n > 4) n = 4;
        for (let k = 0; k < n; k++) {
          feed();
          if (jobs[0].active) jobStep(jobs[0]);
          if (jobs[1].active) jobStep(jobs[1]);
          step();
        }

        relight(s);
        render(s);

        const tx = s.text;
        put("moon", nMoon, tx.moon);
        put("aqi", nAqi, tx.aqi);
        put("uv", nUv, tx.uv);
        put("fl", nFactLab, tx.factLabel);
        if (put("fv", nFact, tx.factValue)) base.classList.toggle("nofact", tx.factValue === "");
      },
    };
  },
};

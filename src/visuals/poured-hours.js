// Poured Hours
//
// A wall-sized falling-sand toy. Everything above the bedrock is one cellular
// automaton of 6 px grains (180 x 263 cells). The time is two rows of chunky
// numerals made of sand packed into invisible moulds: each numeral is poured
// from a sweeping spout in layers, so it carries wavy sand-art strata in one
// mineral pigment, with little heaps sitting on its shoulders. When a minute
// passes the old numeral comes unglued and avalanches away, and the new one is
// poured inside a faint outline of its shape (so the time never stops
// reading). AM/PM is poured in the same pigment, one mark under the minutes.
// The other readouts are pixel-letter ledges in the same sand world: grains
// land on them, pile on their tops and sift through their gaps. The dune sits
// on dark bedrock, and the moon, the air, the UV and the day's fact are cut
// into the rock.
//
// Layout: type keeps to the left; the seconds thread has its own lane down the
// right-hand side, clear of every line, like the stream in an hourglass, and
// heaps a mound under itself at the bottom.
//
// How the conditions drive it:
//   seconds       a thread of sand falls without stop down its lane with
//                 a short gap at every second, so the tick runs down it, and
//                 feeds the mound on the dune (which drains through a slot in
//                 the rock beneath it)
//   temperature   the pigment of the packed numerals: ultramarine in deep cold,
//                 through teal, olive and ochre, to vermilion in heat
//   sky colour    every loose grain has the colour the measured sky has when it
//                 falls (west on the left, east on the right); the dune at the
//                 bottom starts as unlabelled strata of the last 24 hours of sky
//                 and lets its oldest sand out through slots in the base
//   rain          water cells, as many as it is raining, falling in short
//                 streaks: they run off the numerals in little falls, sift
//                 through the lettering, pool in the dune's hollows and seep away
//   snow          slow white grains that settle on every shoulder, melt above 34 F
//   wind          leans the rain, the snow and (within its lane) the thread, blows sand and
//                 snow off every crest in streams, and makes the dune's surface
//                 hop downwind so it creeps along the floor
//   fog, bad air  a veil hanging in soft banks that slide along at their own
//                 pace (grey fog, brown haze), with slow motes; fog greys the pigment
//   storm         a heavy pour and, now and then, a slow two-second lift of light
//   cloud, sun    the tone of the paper and the hard little shadows of sunlight
//   day / night   warm paper by day, charcoal at night; inks and pigment switch
//                 in one step while the ground is mid-grey
// The fact is set in Space Grotesk, engraved into the bedrock.

import { clamp, lerp, smoothstep, rng, toOklab, mix, el, addStyle, pixelCanvas, grain } from "../lib/kit.js";
import { sunPosition } from "../lib/astro.js";

const CELL = 6;
const COLS = 180;
const FLOOR = 263; // first row of the bedrock; the simulation is rows 0..FLOOR-1
const ROWS = 320; // the whole stage in cells
const BR = ROWS - FLOOR; // rows of bedrock
const LEFT = 11; // 66 px
const RIGHT = 169; // last column text may use (1014 px)
const DATE_Y = 11;
const HOUR_Y = 29;
const MIN_Y = 112;
const U = 5; // cells per numeral pixel
const GW = 13;
const GH = 15;
const DW = GW * U;
const DH = GH * U;
const SLOT_X = [11, 88];
const CENTER_X = 49; // a lone hour digit, centred over the minutes
const THREAD_X = 162; // the thread is THREAD_X and THREAD_X + 1: its own lane, right of every line of type
const TEMP_Y = 196; // temperature (and AM/PM) row
const COND_Y = 218;
const CD_Y = 235;
const MOON_R = 5; // the engraved line, in bedrock rows
const SCAN_Y = 222; // the dune lives below this row
const LH = 9; // height of the pixel letters
const TEXT_END = 112;
const LOW_Y = TEMP_Y + 2 * LH; // below this row, nothing may heap above the dune's ceiling // no readout below the minutes reaches past this column
const SNOW_TOP = DATE_Y + LH + 5; // drifts on the hours stop short of the date
const GAP_Y = HOUR_Y + GH * U; // and drifts on the minutes stop short of the hours
const noDrift = (y) => y < SNOW_TOP || (y >= GAP_Y && y < GAP_Y + 3);

const T_SAND = 1; // sand that stays: the dune, heaps on shoulders
const T_FRESH = 2; // the thread and spills: becomes dune sand when it lands there
const T_CRUMB = 3; // an old numeral's avalanche: sinks away where it lands
const T_WATER = 4;
const T_SNOW = 5;
const T_GLUE = 6; // numerals
const T_INK = 7; // lettering
const T_WALL = 8;

const NJ = 4;
const HIST = 12;
const SLOTS = HIST * 2 + 16;
const P_SKY = 1;
const P_PIG = P_SKY + SLOTS * NJ; // 4 strata tones x 4 grain jitters
const P_SPK = P_PIG + 16; // dark and light mineral grains in the numerals
const P_LOOSE = P_SPK + 2; // pigment sand that has come loose
const P_INK = P_LOOSE + 2;
const P_WATER = P_INK + 2;
const P_SNOW = P_WATER + 4;
const P_SSPK = P_SNOW + 4; // dark and light grains in the sky sand
const P_DIM = P_SSPK + 2; // the quieter ink of labels
const P_THREAD = P_DIM + 1; // the seconds thread: the sky's colour, pushed to a glint (always the last index)
const JIT = [-0.04, -0.013, 0.013, 0.04];

// ----- the numerals: 13 x 15, each pixel 5 x 5 grains, corners cut at 45 degrees -----
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
const GLYPH = {}; // 1 inside, 2 inside and on the edge
for (const [ch, rows] of Object.entries(BIG_SRC)) {
  const on = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && rows[y][x] === "#";
  const m = new Uint8Array(DW * DH);
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const full = on(gx, gy);
      let tri = 0;
      if (!full) {
        const n = on(gx, gy - 1);
        const s = on(gx, gy + 1);
        const w = on(gx - 1, gy);
        const e = on(gx + 1, gy);
        if (s && e && !n && !w) tri = 1;
        else if (s && w && !n && !e) tri = 2;
        else if (n && e && !s && !w) tri = 3;
        else if (n && w && !s && !e) tri = 4;
      }
      for (let cy = 0; cy < U; cy++) {
        for (let cx = 0; cx < U; cx++) {
          let v = full;
          if (tri === 1) v = cx + cy >= U - 1;
          else if (tri === 2) v = cy >= cx;
          else if (tri === 3) v = cx >= cy;
          else if (tri === 4) v = cx + cy <= U - 1;
          if (v) m[(gy * U + cy) * DW + gx * U + cx] = 1;
        }
      }
    }
  }
  for (let y = 0; y < DH; y++) {
    for (let x = 0; x < DW; x++) {
      const i = y * DW + x;
      if (!m[i]) continue;
      const out = x === 0 || y === 0 || x === DW - 1 || y === DH - 1 || !m[i - 1] || !m[i + 1] || !m[i - DW] || !m[i + DW];
      if (out) m[i] = 2;
    }
  }
  GLYPH[ch] = m;
}

// ----- the lettering: a 5 x 7 pixel alphabet drawn 9 tall (rows 2 and 6 doubled) -----
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
  0: "01110 10001 10011 10101 11001 10001 01110", 1: "010 110 010 010 010 010 111", 2: "01110 10001 00001 00110 01000 10000 11111",
  3: "11110 00001 00001 01110 00001 00001 11110", 4: "00010 00110 01010 10010 11111 00010 00010", 5: "11111 10000 11110 00001 00001 10001 01110",
  6: "01110 10000 10000 11110 10001 10001 01110", 7: "11111 00001 00010 00100 00100 01000 01000", 8: "01110 10001 10001 01110 10001 10001 01110",
  9: "01110 10001 10001 01111 00001 00001 01110",
  "°": "111 101 111 000 000 000 000", ",": "00 00 00 00 00 01 01 10", ".": "0 0 0 0 0 0 1", ":": "0 0 1 0 0 1 0", "-": "000 000 000 111 000 000 000",
  "–": "0000 0000 0000 1111 0000 0000 0000", "'": "1 1 0 0 0 0 0", "/": "001 001 010 010 010 100 100", "+": "000 000 010 111 010 000 000",
  "%": "11001 11010 00010 00100 01000 01011 10011", "&": "01100 10010 10100 01000 10101 10010 01101", " ": "00 00 00 00 00 00 00",
};
const FONT = {};
for (const [ch, src] of Object.entries(FONT_SRC)) {
  const r = src.split(" ");
  const rows = [r[0], r[1], r[1], r[2], r[3], r[4], r[5], r[5], r[6]];
  if (r.length > 7) rows.push(r[7]);
  FONT[ch] = { w: r[0].length, rows: rows.map((row) => [...row].map((c) => c === "1")) };
}
FONT["−"] = FONT["-"];
FONT["’"] = FONT["'"];
const textWidth = (text, sc) => {
  let w = 0;
  for (const ch of text) w += ((FONT[ch] || FONT[" "]).w + 1) * sc;
  return Math.max(0, w - sc);
};

// Pigment by temperature (F): [temp, lightness, chroma, hue].
const PIGMENT = [
  [0, 0.42, 0.2, 266], [20, 0.46, 0.19, 258], [36, 0.5, 0.15, 240], [50, 0.5, 0.12, 190],
  [62, 0.53, 0.12, 110], [74, 0.57, 0.15, 62], [86, 0.58, 0.2, 38], [100, 0.53, 0.215, 27],
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
// The four strata tones of one pigment: [dL, dC, dHue].
const TONES = [[0, 0, 0], [-0.07, 0.012, -9], [0.06, -0.03, 7], [-0.025, 0.03, 15]];

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
const tri = (u) => {
  u -= Math.floor(u);
  return u < 0.5 ? u * 2 : 2 - u * 2;
};

const STYLE = `
.ph { position: absolute; inset: 0; overflow: hidden; background: #2a2724; }
.ph-base { position: absolute; left: 0; right: 0; top: ${FLOOR * CELL}px; bottom: 0; color: #eee7da;
  font-family: "Space Grotesk", sans-serif; z-index: 3; text-shadow: 0 -2px 0 rgba(0,0,0,0.55); }
.ph-fact { position: absolute; left: ${LEFT * CELL}px; right: 66px; top: ${(MOON_R + LH) * CELL + 48}px; }
.ph-fl { font-weight: 700; font-size: 26px; line-height: 30px; letter-spacing: 0.16em; text-transform: uppercase; color: #aaa192; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.ph-fv { margin-top: 12px; font-weight: 500; font-size: 46px; line-height: 1.2; letter-spacing: -0.005em; text-wrap: balance;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.ph-base.nofact .ph-fact { display: none; }
`;

export default {
  title: "Poured Hours",
  description: "A wall-sized falling-sand toy: the time is poured in sand, and the weather is poured on top of it.",
  fonts: ["Space Grotesk:wght@500;700"],
  fps: 30,

  mount(root, { state, seed }) {
    addStyle(root, STYLE);
    const wrap = el("div", { class: "ph" });
    root.append(wrap);
    const layer = pixelCanvas(wrap, { size: CELL });
    const ctx = layer.ctx;
    const img = ctx.createImageData(COLS, FLOOR);
    const px = new Uint32Array(img.data.buffer);
    // the bedrock under the dune: drawn only when its colours or lettering change
    const bedImg = ctx.createImageData(COLS, BR);
    const bedPx = new Uint32Array(bedImg.data.buffer);
    const bedBand = new Uint8Array(COLS * BR); // stratum 0..4, +8 for a pebble, +16 for a dark pebble
    const bedMark = new Uint8Array(COLS * BR); // 1 value letter, 2 label letter, 3 the cut's shadow, 4 a slot
    const bedCol = new Uint32Array(32);
    let bedDirty = true;
    {
      const r = rng(seed + 31);
      const bounds = [1, 7, 15, 24, 33, 44];
      const fr = bounds.map(() => r.range(0.04, 0.12));
      const ph = bounds.map(() => r.range(0, 6.28));
      const am = bounds.map(() => r.range(0.6, 2.2));
      for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < BR; y++) {
          let b = 0;
          for (let k = 1; k < bounds.length; k++) if (y > bounds[k] + am[k] * Math.sin(x * fr[k] + ph[k]) + 0.6 * Math.sin(x * 0.53 + k)) b = k;
          const q = r();
          bedBand[y * COLS + x] = (b % 5) + (y > 0 && q < 0.035 ? 8 : y > 0 && q < 0.06 ? 16 : 0);
        }
      }
    }

    const nFactLab = el("div", { class: "ph-fl" });
    const nFact = el("div", { class: "ph-fv" });
    const base = el("div", { class: "ph-base" }, el("div", { class: "ph-fact" }, nFactLab, nFact));
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
    const inBand = new Uint8Array(N + COLS); // the boxes that hold lettering: loose things sift through them
    let stepN = 0;
    let sandCount = 0;
    let sandTarget = 0;
    let waterCount = 0;
    const wake = (y0, y1) => {
      for (let y = Math.max(0, y0); y <= y1 && y < FLOOR; y++) live[y + 1] = 2;
    };

    // ----- what the weather is doing, as numbers the automaton uses -----
    const E = { rain: 0, snow: 0, wdir: 1, ws: 0, temp: 50, cloud: 0, fog: 0, haze: 0, sun: 0, lagP: 20, driftP: 0, threadP: 0, rainDrift: 0, snowDrift: 0, melt: 0, seepP: 6, snowCap: 3 };
    function readWeather(s) {
      const w = s.weather;
      const f = w.falling;
      E.rain = f === "rain" || f === "drizzle" || f === "storm" || f === "freezing" ? Math.max(0.15, w.intensity) : 0;
      E.snow = f === "snow" ? Math.max(0.15, w.intensity) : 0;
      const ew = -Math.sin((w.windDir * Math.PI) / 180); // + blows toward the east, the right of the frame
      if (Math.abs(ew) > 0.12 || E.ws === 0) E.wdir = ew >= 0 ? 1 : -1;
      const gust = 0.5 + 0.5 * Math.sin(s.t * 0.37 + 1.3 * Math.sin(s.t * 0.11));
      const speed = w.wind + Math.max(0, w.gust - w.wind) * gust * gust * 0.8;
      E.ws = clamp(speed / 30, 0, 1.4) * (0.7 + 0.3 * Math.abs(ew));
      E.temp = w.temp;
      E.cloud = clamp(w.cloud / 100);
      E.fog = w.fog || w.kind === "fog" ? 1 : clamp((2.5 - w.visibility) / 2.5) * 0.8;
      E.haze = clamp((w.aqi - 70) / 110);
      E.sun = s.daylight * (1 - 0.88 * Math.pow(E.cloud, 1.5)) * (f ? 0.25 : 1) * (1 - E.fog);
      const heat = clamp((w.temp - 84) / 16);
      E.lagP = 20 + Math.round(heat * 70); // of 256: how often a falling grain hesitates
      E.driftP = Math.round(clamp(E.ws * 0.5, 0, 0.75) * 256);
      E.threadP = Math.round(clamp(E.ws * 0.05, 0, 0.05) * 256); // the thread leans a little, inside its lane
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
      const r = rnd();
      if ((r & 31) === 0) return P_SSPK + ((r >>> 5) & 1);
      const d = (x * 3) / (COLS - 1);
      let lo = d | 0;
      if (lo < 3 && ((r >>> 8) & 255) < (d - lo) * 256) lo++;
      return P_SKY + (HIST * 2 + gen * 4 + lo) * NJ + ((r >>> 16) & 3);
    };

    const CREAM = toOklab("#f5ecd9");
    const ground = [0, 0, 0];
    const pig = [0, 0, 0];
    const sig = new Float64Array(4).fill(-1);
    let shadowPx = 0;
    let ghostFill = 0;
    let ghostEdge = 0;
    let motePx = 0;
    let inkPx = 0;
    let streakPx = 0;
    let streakPx2 = 0;
    let spoutPx = 0;
    let veilA = 0;
    const veilPx = new Uint32Array(32);
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
      // The ground is kept out of mid-grey for as much of twilight as it can be.
      const g = smoothstep(0.24, 0.44, s.daylight);
      const wet = Math.max(E.rain, E.snow * 0.6);
      const storm = s.weather.falling === "storm" ? 1 : 0;
      const Lp = 0.955 - 0.08 * E.cloud - 0.05 * wet - 0.06 * storm - 0.03 * E.fog - 0.02 * E.haze;
      const k = 0.12 + 0.3 * E.cloud;
      const warm = clamp((E.temp - 78) / 20) - clamp((36 - E.temp) / 30);
      const pa = CREAM[1] * (1 - k) + skyMean[1] * k * 0.6 + 0.004 * Math.max(0, warm) + 0.006 * E.haze;
      const pb = CREAM[2] * (1 - k) + skyMean[2] * k * 0.6 + 0.014 * warm + 0.014 * E.haze;
      ground[0] = lerp(0.175, Lp, g) + bolt * 0.07;
      ground[1] = lerp(0.002 + skyMean[1] * 0.14, pa, g);
      ground[2] = lerp(0.004 + skyMean[2] * 0.14, pb, g);
      const Lg = ground[0];
      const gp = pack(Lg, ground[1], ground[2]);
      const fl = Lg >= 0.575 ? 1 : 0; // inks: dark on a light ground, light on a dark one, switched in one step
      // recolour only when something that shows has changed
      const kT = Math.round(E.temp * 2);
      const kF = Math.round(E.fog * 20) * 4096 + Math.round(E.sun * 40) * 64 + Math.round(E.haze * 10) * 2 + fl;
      if (gp === sig[0] && kT === sig[1] && skyVer === sig[2] && kF === sig[3]) return;
      sig[0] = gp;
      sig[1] = kT;
      sig[2] = skyVer;
      sig[3] = kF;
      wrap.style.background = css(gp);
      const fs = smoothstep(0.42, 0.72, Lg); // the sky sand moves smoothly from lighter-than-ground to darker
      const fogMix = 0.3 * E.fog;

      for (let sl = 0; sl < SLOTS; sl++) {
        const Li = skyLab[sl * 3];
        const ai = skyLab[sl * 3 + 1];
        const bi = skyLab[sl * 3 + 2];
        const ci = Math.hypot(ai, bi);
        const cs = (ci > 0.13 ? 0.13 / ci : 1) * lerp(0.85, 1.15, fs);
        for (let j = 0; j < NJ; j++) {
          const Ld = Lg - 0.13 - 0.24 * (1 - Li) + JIT[j];
          const Ln = Lg + 0.08 + 0.2 * Li + JIT[j] * 0.7;
          const L = lerp(lerp(Ln, Ld, fs), Lg, fogMix);
          lut[P_SKY + sl * NJ + j] = pack(L, lerp(ai * cs, ground[1], fogMix), lerp(bi * cs, ground[2], fogMix));
        }
      }
      // the thread: the mean sky, but always well apart from the ground
      const thL = fl ? Math.min(skyMean[0] - 0.25, Lg - 0.42) : Math.max(skyMean[0] + 0.2, Lg + 0.34);
      const thC = Math.hypot(skyMean[1], skyMean[2]);
      const thK = thC > 0.11 ? 0.11 / thC : thC < 0.04 ? 0.04 / Math.max(0.005, thC) : 1;
      lut[P_THREAD] = pack(thL, skyMean[1] * thK, skyMean[2] * thK - (thC < 0.005 ? 0.04 : 0));
      lut[P_THREAD + 1] = pack(thL + (fl ? 0.05 : -0.05), skyMean[1] * thK, skyMean[2] * thK - (thC < 0.005 ? 0.04 : 0));
      const sMid = lerp(Lg + 0.16, Lg - 0.25, fs);
      lut[P_SSPK] = pack(sMid - lerp(0.1, 0.2, fs), 0.004, 0.01);
      lut[P_SSPK + 1] = pack(sMid + 0.12, 0.002, 0.012);

      // the numerals' pigment, in four strata tones
      pigmentAt(E.temp, pig);
      const baseL = fl ? Math.min(pig[0], Lg - 0.43) : Math.max(0.6, Lg + 0.42);
      const baseC = (fl ? pig[1] : Math.max(0.07, pig[1] * 0.58)) * (1 - 0.45 * E.fog); // fog greys it
      for (let b = 0; b < 4; b++) {
        const T = TONES[b];
        const L = baseL + T[0] * (fl ? 1 : 0.8);
        const C = Math.max(0.02, baseC + T[1]);
        const h = ((pig[2] + T[2]) * Math.PI) / 180;
        const A = C * Math.cos(h);
        const B = C * Math.sin(h);
        for (let j = 0; j < 4; j++) lut[P_PIG + b * 4 + j] = pack(L + (j - 1.5) * 0.013, A, B);
      }
      const ph = (pig[2] * Math.PI) / 180;
      const pA = baseC * Math.cos(ph);
      const pB = baseC * Math.sin(ph);
      lut[P_SPK] = pack(baseL - 0.14, pA * 0.7, pB * 0.7);
      lut[P_SPK + 1] = pack(baseL + 0.13, pA * 0.5, pB * 0.5);
      lut[P_LOOSE] = pack(lerp(baseL, Lg, 0.4), lerp(pA, ground[1], 0.4), lerp(pB, ground[2], 0.4));
      lut[P_LOOSE + 1] = pack(lerp(baseL, Lg, 0.5), lerp(pA, ground[1], 0.5), lerp(pB, ground[2], 0.5));
      ghostFill = pack(baseL, pA, pB, 46);
      ghostEdge = pack(baseL, pA, pB, 130);
      spoutPx = pack(baseL - (fl ? 0.08 : -0.06), pA, pB);

      const inkL = fl ? Math.min(0.24, Lg - 0.5) : Math.max(0.93, Lg + 0.5);
      lut[P_INK] = pack(inkL, 0.003, 0.012);
      lut[P_INK + 1] = pack(inkL + (fl ? 0.03 : -0.03), 0.003, 0.012);
      inkPx = lut[P_INK];
      // labels: a quieter ink, but never closer than 0.45 to the ground
      lut[P_DIM] = pack(fl ? Math.min(0.42, Lg - 0.45) : Math.max(0.74, Lg + 0.45), 0.004, 0.014);

      const wHue = (240 * Math.PI) / 180;
      const wL = fl ? Lg - 0.27 : Lg + 0.3;
      const wC = fl ? 0.11 : 0.08;
      const wOff = [0, -0.03, 0.03, fl ? 0.12 : 0.16];
      for (let j = 0; j < 4; j++) lut[P_WATER + j] = pack(wL + wOff[j], wC * Math.cos(wHue), wC * Math.sin(wHue));
      streakPx = pack(wL, wC * Math.cos(wHue), wC * Math.sin(wHue), 150);
      streakPx2 = pack(wL, wC * Math.cos(wHue), wC * Math.sin(wHue), 70);
      const sL = fl ? Math.max(0.99, Lg) : lerp(0.7, 0.76, g); // a little dimmer at night
      for (let j = 0; j < 4; j++) lut[P_SNOW + j] = pack(sL - j * 0.016, -0.002, -0.01 - 0.004 * (1 - g));

      shadowPx = E.sun * fl > 0.02 ? pack(0.22, 0.012, 0.025, Math.round(52 * E.sun * fl)) : 0;
      const mL = fl ? Lg - 0.14 : Lg + 0.17;
      motePx = pack(mL, ground[1] + 0.01 * E.haze, ground[2] + 0.035 * E.haze, 170);
      // the veil of fog (or brown haze) hanging in banks: 32 strengths of one tint
      veilA = Math.max(E.fog * 0.6, E.haze * 0.24) * lerp(0.55, 1, g); // thinner at night, so it does not light the room
      veilPx[0] = 0;
      for (let q = 1; q < 32; q++) veilPx[q] = veilA > 0.01 ? pack(mL, ground[1] + 0.012 * E.haze, ground[2] + 0.04 * E.haze, Math.round((q / 31) * veilA * 255)) : 0;

      // the bedrock: always dark, a shade apart from the night ground, in five strata
      const rL = lerp(0.125, 0.185, g);
      const BAND = [0, 0.028, -0.014, 0.042, 0.012];
      for (let b = 0; b < 5; b++) {
        bedCol[b] = pack(rL + BAND[b], 0.005 + b * 0.0015, 0.012 - b * 0.002);
        bedCol[b + 8] = pack(rL + BAND[b] + 0.06, 0.006, 0.016);
        bedCol[b + 16] = pack(rL + BAND[b] - 0.045, 0.004, 0.008);
      }
      bedCol[5] = pack(rL + (fl ? 0.1 : 0.13), 0.006, 0.016); // the lip the dune rests on
      bedCol[24] = pack(0.885, 0.004, 0.014); // engraved values
      bedCol[25] = pack(0.67, 0.006, 0.018); // engraved labels
      bedCol[26] = pack(rL - 0.075, 0.003, 0.006); // the shadow inside the cut
      bedCol[27] = pack(0.06, 0.002, 0.004); // the slots
      bedDirty = true;
    }
    function drawBed() {
      for (let i = 0; i < COLS * BR; i++) {
        const m = bedMark[i];
        bedPx[i] = m ? bedCol[23 + m] : i < COLS ? bedCol[5] : bedCol[bedBand[i]];
      }
      ctx.putImageData(bedImg, 0, FLOOR);
      bedDirty = false;
    }
    // Cuts a line of pixel letters into the bedrock: kind 1 values, 2 labels.
    function bedText(text, x, y, kind) {
      for (const ch of text) {
        const g = FONT[ch] || FONT[" "];
        for (let r = 0; r < g.rows.length; r++) {
          for (let c = 0; c < g.w; c++) {
            if (!g.rows[r][c]) continue;
            const cx = x + c;
            const cy = y + r;
            if (cx < 0 || cx >= COLS || cy >= BR) continue;
            bedMark[cy * COLS + cx] = kind;
            const a = (cy - 1) * COLS + cx;
            if (bedMark[a] === 0) bedMark[a] = 3;
          }
        }
        x += g.w + 1;
      }
      bedDirty = true;
    }

    // ----- lettering in the simulation -----
    // pal: 0 ink, 1 the quieter label ink, 2 the numerals' pigment, in strata
    const mkLedge = (x, y, scale, pal = 0) => {
      const L = { x, y, scale, pal, text: null, w: 0, bx: 0, n: 0, cells: new Int32Array(3200) };
      return L;
    };
    const Ldate = mkLedge(LEFT, DATE_Y, 1);
    const Ltemp = mkLedge(LEFT, TEMP_Y, 2);
    const Lcond = mkLedge(LEFT, COND_Y, 1);
    const Lcdl = mkLedge(LEFT, CD_Y, 1, 1);
    const Lcdv = mkLedge(LEFT, CD_Y, 1);
    const Lap = mkLedge(LEFT, TEMP_Y, 2, 2); // one mark, under the minutes' right edge
    const shownBed = { moon: null, air: null };
    function stamp(L, text) {
      for (let k = 0; k < L.n; k++) if (type[L.cells[k]] === T_INK) type[L.cells[k]] = 0;
      const y1 = Math.min(FLOOR, L.y + LH * L.scale);
      for (let y = L.y; y < y1; y++) inBand.fill(0, y * COLS + Math.max(0, L.bx), y * COLS + Math.min(COLS, L.bx + L.w + 1));
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
                if (cx < 0 || cx >= COLS || cy >= FLOOR || L.n >= L.cells.length) continue;
                const i = cy * COLS + cx;
                type[i] = T_INK;
                if (L.pal === 2) {
                  const band = ((cy - L.y + 1.6 * Math.sin(cx * 0.45 + L.y)) / 5) | 0;
                  col[i] = (cx * 5 + cy * 11) % 23 === 0 ? P_SPK + (cx & 1) : P_PIG + ((band + 1) & 3) * 4 + ((cx * 7 + cy * 13) & 3);
                } else col[i] = L.pal === 1 ? P_DIM : P_INK + ((cx * 7 + cy * 13) % 5 === 0 ? 1 : 0);
                L.cells[L.n++] = i;
              }
            }
          }
        }
        x += (g.w + 1) * sc;
      }
      L.w = Math.max(0, x - L.x - sc);
      L.bx = L.x;
      for (let y = L.y; y < y1; y++) inBand.fill(1, y * COLS + Math.max(0, L.x), y * COLS + Math.min(COLS, L.x + L.w + 1));
      wake(L.y - 2, L.y + (LH + 1) * sc + 1);
    }
    function syncText(s) {
      const tx = s.text;
      const date = tx.date.toUpperCase();
      if (date !== Ldate.text) stamp(Ldate, date);
      if (tx.temp !== Ltemp.text) stamp(Ltemp, tx.temp);
      const cond = tx.condition.toUpperCase();
      if (cond !== Lcond.text) stamp(Lcond, cond);
      const cdl = tx.sunLabel.toUpperCase();
      const cdv = tx.sunValue.toUpperCase();
      if (cdl !== Lcdl.text || cdv !== Lcdv.text) {
        stamp(Lcdl, cdl);
        Lcdv.x = LEFT + Lcdl.w + 5;
        stamp(Lcdv, cdv);
      }
      if (tx.ampm !== Lap.text) {
        Lap.x = SLOT_X[1] + DW - textWidth(tx.ampm, 2);
        stamp(Lap, tx.ampm);
      }
      // cut into the bedrock: the moon on the left, the air and UV on the right
      const moon = tx.moon.toUpperCase();
      const air = tx.aqi + "|" + tx.uv;
      if (moon !== shownBed.moon || air !== shownBed.air) {
        shownBed.moon = moon;
        shownBed.air = air;
        bedMark.fill(0, (MOON_R - 1) * COLS, (MOON_R + LH) * COLS);
        bedText(moon, LEFT, MOON_R, 1);
        // label to value one space (18 px); value to the next label 54 px
        const wA = textWidth("AQI", 1);
        const wa = textWidth(tx.aqi, 1);
        const wU = textWidth("UV", 1);
        const wu = textWidth(tx.uv, 1);
        let x = RIGHT + 1 - (wA + 3 + wa + 9 + wU + 3 + wu);
        bedText("AQI", x, MOON_R, 2);
        bedText(tx.aqi, (x += wA + 3), MOON_R, 1);
        bedText("UV", (x += wa + 9), MOON_R, 2);
        bedText(tx.uv, x + wU + 3, MOON_R, 1);
      }
    }

    // ----- the numerals -----
    const shown = [["", ""], ["", ""]];
    const slotX = [[SLOT_X[0], SLOT_X[1]], [SLOT_X[0], SLOT_X[1]]];
    const rowY = (r) => (r ? MIN_Y : HOUR_Y);

    // Each pour lays down wavy strata, peaked like heaps, in the pigment's four tones.
    const NB = 16;
    const strata = [0, 1].map(() => ({ off: new Float32Array(COLS * NB), tone: new Uint8Array(NB + 1), wph: 0 }));
    function newStrata(r) {
      const S = strata[r];
      let acc = -3 - (rnd() % 4);
      let prev = rnd() & 3;
      S.tone[0] = prev;
      for (let k = 0; k < NB; k++) {
        acc += rnd() % 4 === 0 ? 2 + (rnd() % 2) : 5 + (rnd() % 8); // now and then a thin seam
        const amp = 1 + (rnd() % 100) / 30;
        const fr = 1 / (18 + (rnd() % 40));
        const ph = (rnd() % 1000) / 1000;
        const fr2 = 1 / (9 + (rnd() % 14));
        const ph2 = (rnd() % 628) / 100;
        const a2 = 0.25 + (rnd() % 100) / 140;
        for (let x = 0; x < COLS; x++) S.off[x * NB + k] = acc + amp * (tri(x * fr + ph) * 2 - 1) + a2 * Math.sin(x * fr2 + ph2);
        prev = (prev + 1 + (rnd() % 3)) & 3;
        S.tone[k + 1] = prev;
      }
      S.wph = (rnd() % 1000) / 1000;
    }
    function toneAt(r, x, y) {
      const S = strata[r];
      const h = rowY(r) + DH - 1 - y;
      const o = x * NB;
      let b = 0;
      for (let k = 0; k < NB; k++) if (h > S.off[o + k]) b = k + 1;
      return S.tone[b];
    }
    const pigCol = (r, x, y) => {
      const q = rnd();
      if ((q & 31) === 0) return P_SPK + ((q >>> 5) & 1);
      return P_PIG + toneAt(r, x, y) * 4 + ((q >>> 8) & 3);
    };

    // Loose heaps on the top of every stroke: what the spout spilt.
    const topY = new Int16Array(DW + 1);
    function heapTops(r) {
      const y0 = rowY(r);
      for (let sl = 0; sl < 2; sl++) {
        if (!shown[r][sl]) continue;
        const x0 = slotX[r][sl];
        for (let cx = 0; cx < DW; cx++) {
          topY[cx] = -1;
          for (let cy = 0; cy < DH; cy++) {
            if (type[(y0 + cy) * COLS + x0 + cx] === T_GLUE) {
              topY[cx] = y0 + cy;
              break;
            }
          }
        }
        topY[DW] = -2;
        let a = 0;
        for (let cx = 1; cx <= DW; cx++) {
          if (topY[cx] === topY[a]) continue;
          const len = cx - a;
          const ty = topY[a];
          if (ty > 3 && len >= 4 && rnd() % 100 < 90) {
            const c1 = a + (rnd() % len);
            const h1 = r ? 3 + (rnd() % 3) : 2 + (rnd() % 2); // low on the hours, to keep air under the date
            const c2 = len > 20 ? a + (rnd() % len) : -99;
            const h2 = r ? 2 + (rnd() % 3) : 2;
            for (let x = a; x < cx; x++) {
              const edge = Math.min(x - a + 1, cx - x);
              const h = Math.min(edge, Math.max(h1 - Math.abs(x - c1), h2 - Math.abs(x - c2)));
              for (let k = 1; k <= h; k++) {
                const i = (ty - k) * COLS + x0 + x;
                if (type[i] !== 0) break;
                type[i] = T_SAND;
                col[i] = skyCol(x0 + x);
              }
            }
          }
          a = cx;
        }
      }
      wake(y0 - 8, y0 + DH);
    }

    function glueSlot(r, slot, ch) {
      if (!ch) return;
      const x0 = slotX[r][slot];
      const y0 = rowY(r);
      const m = GLYPH[ch];
      for (let cy = 0; cy < DH; cy++) {
        for (let cx = 0; cx < DW; cx++) {
          const i = (y0 + cy) * COLS + x0 + cx;
          ghost[i] = 0;
          const v = m[cy * DW + cx];
          if (v && !(v === 2 && rnd() % 13 === 0)) {
            type[i] = T_GLUE;
            col[i] = pigCol(r, x0 + cx, y0 + cy);
          } else if (type[i] === T_GLUE || type[i] === T_SAND) type[i] = 0;
        }
      }
      wake(y0 - 2, y0 + DH + 1);
    }

    const LT = 10; // rows printed per pass of the spout
    const PASSES = Math.ceil(DH / LT) + 1;
    const mkJob = (r) => ({ r, ox0: SLOT_X[0], chg: [true, true], active: false, step0: 0, pr0: 0, n: 0, ptr: 0, keys: new Uint32Array(2 * DW * DH), cr: [false, false], crumbling: false, x0: 0, x1: 0, dir0: 1, S: 40, hx: -20, stream: -1, leaving: false });
    const jobs = [mkJob(0), mkJob(1)];

    // Clears whatever is left glued in a slot's box.
    function clearBox(r, x0) {
      const y0 = rowY(r);
      for (let cy = 0; cy < DH; cy++) {
        for (let cx = 0; cx < DW; cx++) {
          const i = (y0 + cy) * COLS + x0 + cx;
          if (type[i] === T_GLUE) type[i] = 0;
        }
      }
      wake(y0 - 2, y0 + DH + 1);
    }
    function finishJob(job) {
      if (job.active && job.crumbling) {
        if (job.cr[0]) clearBox(job.r, job.ox0);
        if (job.cr[1]) clearBox(job.r, SLOT_X[1]);
      }
      job.crumbling = false;
      if (job.chg[0]) glueSlot(job.r, 0, shown[job.r][0]);
      if (job.chg[1]) glueSlot(job.r, 1, shown[job.r][1]);
      heapTops(job.r);
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
      const nx0 = want[1] === "" ? CENTER_X : SLOT_X[0];
      const relayout = nx0 !== slotX[r][0];
      job.ox0 = slotX[r][0];
      slotX[r][0] = nx0;
      for (let sl = 0; sl < 2; sl++) {
        job.cr[sl] = false;
        job.chg[sl] = relayout || want[sl] !== shown[r][sl];
        if (!job.chg[sl]) continue;
        if (shown[r][sl]) {
          job.cr[sl] = true;
          job.crumbling = true;
        }
        if (want[sl]) {
          x0 = Math.min(x0, slotX[r][sl]);
          x1 = Math.max(x1, slotX[r][sl] + DW - 1);
        }
      }
      job.x0 = x0;
      job.x1 = x1;
      const span = Math.max(1, x1 - x0);
      job.S = span > 70 ? 44 : 34;
      job.dir0 = (x0 + x1) / 2 < COLS / 2 ? 1 : -1;
      newStrata(r);
      const wph = strata[r].wph;
      for (let sl = 0; sl < 2; sl++) {
        if (!job.chg[sl] || !want[sl]) continue;
        const m = GLYPH[want[sl]];
        const sx = slotX[r][sl];
        for (let cy = 0; cy < DH; cy++) {
          for (let cx = 0; cx < DW; cx++) {
            const v = m[cy * DW + cx];
            if (!v) continue;
            const x = sx + cx;
            const y = y0 + cy;
            const i = y * COLS + x;
            if (v === 2 && rnd() % 13 === 0) continue; // a ragged, packed edge
            ghost[i] = v;
            // the fill rises in heaped layers, like the strata it leaves
            const hq = Math.max(0, y1 - y + 4 + 4 * (tri(x / 26 + wph) * 2 - 1));
            const p = (hq / LT) | 0;
            const rb = hq - p * LT;
            const dir = p % 2 === 0 ? job.dir0 : -job.dir0;
            const u = dir > 0 ? (x - x0) / span : (x1 - x) / span;
            const time = p * job.S + u * job.S * 0.85 + rb * 0.4 + (rnd() % 3);
            job.keys[job.n++] = ((Math.round(time) << 16) | i) >>> 0;
          }
        }
      }
      job.keys.subarray(0, job.n).sort();
      job.step0 = stepN;
      job.pr0 = job.crumbling ? 70 : 34;
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
        // the old numeral comes unglued from the bottom up and avalanches
        const front = Math.min(DH, (e * 1.8) | 0);
        const force = e > 50;
        for (let sl = 0; sl < 2; sl++) {
          if (!job.cr[sl]) continue;
          const sx = sl ? SLOT_X[1] : job.ox0;
          for (let y = y1; y > y1 - front; y--) {
            const row = y * COLS;
            for (let x = sx; x < sx + DW; x++) {
              const i = row + x;
              if (type[i] === T_GLUE && ghost[i] === 0 && (force || (rnd() & 3) === 0)) {
                type[i] = T_CRUMB;
                col[i] = P_LOOSE + (rnd() & 1);
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
        const f = clamp((tau + 34) / 34);
        const from = job.dir0 > 0 ? -12 : COLS + 12;
        job.hx = lerp(from, startX, 1 - (1 - f) * (1 - f) * (1 - f));
        return;
      }
      while (job.ptr < job.n && job.keys[job.ptr] >>> 16 <= tau) {
        const i = job.keys[job.ptr++] & 0xffff;
        type[i] = T_GLUE;
        col[i] = pigCol(job.r, i % COLS, (i / COLS) | 0);
        ghost[i] = 0;
      }
      const p = Math.min(PASSES - 1, (tau / job.S) | 0);
      const f = clamp((tau - p * job.S) / (job.S * 0.85));
      const dir = p % 2 === 0 ? job.dir0 : -job.dir0;
      job.hx = dir > 0 ? lerp(job.x0, job.x1, f) : lerp(job.x1, job.x0, f);
      // the stream runs down to whatever is under the spout
      const hxi = Math.round(job.hx);
      job.stream = -1;
      for (let y = y0; y <= y1; y++) {
        const i = y * COLS + hxi;
        if (ghost[i] !== 0 || type[i] === T_GLUE) {
          let yy = y;
          while (yy < y1 && type[yy * COLS + hxi] !== T_GLUE) yy++;
          job.stream = yy;
          break;
        }
      }
      if (job.ptr >= job.n && tau > p * job.S + 4 && tau > (PASSES - 1) * job.S) {
        for (let cy = 0; cy < DH; cy++) for (let x = job.x0; x <= job.x1; x++) ghost[(y0 + cy) * COLS + x] = 0;
        heapTops(job.r);
        job.leaving = true;
      }
    }
    function syncTime(s, snap) {
      let started = false;
      for (let r = 0; r < 2; r++) {
        const str = r ? s.text.mm : s.text.hh;
        const want = str.length === 1 ? [str, ""] : [str[0], str[1]];
        if (want[0] === shown[r][0] && want[1] === shown[r][1]) continue;
        const job = jobs[r];
        if (snap) {
          if (job.active) job.active = false;
          shown[r][0] = want[0];
          shown[r][1] = want[1];
          newStrata(r);
          job.chg[0] = job.chg[1] = true;
          slotX[r][0] = want[1] === "" ? CENTER_X : SLOT_X[0];
          for (let y = rowY(r) - 10; y < rowY(r) + DH; y++) {
            for (let x = 0; x < COLS; x++) {
              const i = y * COLS + x;
              ghost[i] = 0;
              const t = type[i];
              if (t === T_GLUE || t === T_SAND || t === T_CRUMB || (t === T_FRESH && (x < THREAD_X || x > THREAD_X + 1))) type[i] = 0;
            }
          }
          finishJob(job);
          continue;
        }
        if (started) continue; // one new pour per frame; the other row starts on the next
        started = true;
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
      const newest = HIST * 2 + gen * 4;
      for (let x = 0; x < COLS; x++) {
        // a low dune under the readouts, rising to the mound the thread has been building
        const mound = 34 - Math.abs(x - THREAD_X - 0.5) * 0.62 + 0.7 * Math.sin(x * 1.7);
        const base = Math.round(5 + 4 * hump(x / COLS + ph1) + 2 * hump((2 * x) / COLS + ph2) + Math.sin(x * 0.21 + ph3));
        const top = Math.min(FLOOR - ceilRow[x], Math.max(base, Math.round(mound)));
        const h = Math.abs(x - THREAD_X - 0.5) < 7 ? top - 2 : top; // the tip of the mound is the newest sand
        let total = 0;
        for (let k = 0; k < HIST; k++) {
          th[k] = wk[k] * (1 + 0.5 * Math.sin(x * fk[k] + pk[k]));
          total += th[k];
        }
        for (let hh = 0; hh < top; hh++) {
          const i = (FLOOR - 1 - hh) * COLS + x;
          type[i] = T_SAND;
          if (hh >= h) {
            col[i] = P_SKY + (newest + Math.min(3, ((x * 3) / (COLS - 1)) | 0)) * NJ + ((r() * NJ) | 0);
            continue;
          }
          const v = clamp((hh + 0.5 + (r() - 0.5) * 0.9) / h, 0, 0.999) * total;
          let k = 0;
          let acc = th[0];
          while (k < HIST - 1 && v > acc) acc += th[++k];
          col[i] = r() < 0.03 ? P_SSPK + (r() < 0.6 ? 0 : 1) : P_SKY + (k * 2 + (r() < x / COLS ? 1 : 0)) * NJ + ((r() * NJ) | 0);
        }
      }
      countSand();
      sandTarget = sandCount + 60;
      // slots in the rock: one right under the thread (an hourglass), three spread along the floor
      const sp = [0.16, 0.38, 0.6];
      for (let k = 0; k < 3; k++) slots[k] = Math.round((sp[k] + (r() - 0.5) * 0.08) * COLS);
      slots[3] = THREAD_X;
      for (let k = 0; k < 4; k++) for (let dx = -1; dx <= 1; dx++) bedMark[slots[k] + dx] = bedMark[COLS + slots[k] + dx] = 4;
      wake(SCAN_Y, FLOOR - 1);
    }
    // The highest row the dune may reach in each column: a clear 54 px under the
    // lowest readout above it, and never more than a gentle slope from its neighbours.
    const ceilRow = new Int16Array(COLS);
    {
      const hm = new Float32Array(COLS);
      for (let x = 0; x < COLS; x++) hm[x] = x <= TEXT_END ? FLOOR - (CD_Y + LH + 9) : FLOOR - (TEMP_Y + 2 * LH + 14);
      for (let x = 1; x < COLS; x++) hm[x] = Math.min(hm[x], hm[x - 1] + 1);
      for (let x = COLS - 2; x >= 0; x--) hm[x] = Math.min(hm[x], hm[x + 1] + 1);
      for (let x = 0; x < COLS; x++) ceilRow[x] = FLOOR - hm[x];
    }
    function countSand() {
      let c = 0;
      for (let i = SCAN_Y * COLS; i < N; i++) if (type[i] === T_SAND) c++;
      sandCount = c;
    }
    // Lets one grain out through a slot in the floor; the hole walks up through the strata and folds them.
    function drainOne() {
      const r0 = rnd();
      let x = clamp(slots[r0 & 3] + (((r0 >>> 2) % 3) - 1), 0, COLS - 1);
      let y = FLOOR - 1;
      let i = y * COLS + x;
      const t0 = type[i];
      if (t0 !== T_SAND && t0 !== T_CRUMB && t0 !== T_FRESH) return;
      type[i] = 0;
      if (t0 === T_SAND) sandCount--;
      while (y > SCAN_Y - 30) {
        const r = rnd();
        let nx = x + ((r & 3) === 0 ? -1 : (r & 3) === 1 ? 1 : 0);
        if (nx < 0 || nx >= COLS) nx = x;
        let j = (y - 1) * COLS + nx;
        let tj = type[j];
        if (tj !== T_SAND && tj !== T_FRESH) {
          nx = x;
          j = (y - 1) * COLS + x;
          tj = type[j];
          if (tj !== T_SAND && tj !== T_FRESH) break;
        }
        type[i] = tj;
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
      let y = SCAN_Y - 10;
      let i = y * COLS + x;
      while (y < FLOOR && type[i] === 0) {
        y++;
        i += COLS;
      }
      if (y >= FLOOR || y <= SCAN_Y - 8) return;
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
    let sprayAcc = 0;
    function spindrift() {
      const r = rnd();
      const x = r % COLS;
      let i = x;
      let y = 0;
      while (y < SCAN_Y && type[i] === 0) {
        y++;
        i += COLS;
      }
      const t = type[i];
      if (y < 2 || y >= FLOOR - 1 || (t !== T_SAND && t !== T_SNOW) || inBand[i]) return;
      const nx = x + E.wdir;
      if (nx < 0 || nx >= COLS) return;
      const j = i - COLS + E.wdir;
      if (type[j] !== 0) return;
      type[j] = t === T_SNOW ? T_SNOW : T_FRESH;
      col[j] = col[i];
      if (((r >>> 12) & 3) === 0) type[i] = 0;
      wake(y - 2, y + 1);
    }
    let rainAcc = 0;
    let snowAcc = 0;
    function feed() {
      // the seconds thread: a steady stream with a short gap at every second, so the tick runs down it
      if (beadLeft > 0) beadLeft--;
      else {
        for (let q = 0; q < 2; q++) {
          const x = THREAD_X + q;
          if (type[x] === 0 && (rnd() & 7) < 6) {
            type[x] = T_FRESH;
            col[x] = P_THREAD + (rnd() & 1);
          }
        }
        live[1] = live[2] = 2;
      }
      if (E.rain > 0 && waterCount < 2400 + 3000 * E.rain) {
        rainAcc += E.rain * 9;
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
        snowAcc += E.snow * 1.6;
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
      // strong wind blows sand and snow off every crest in streams
      const spray = Math.max(0, E.ws - 0.3);
      sprayAcc += spray * spray * 14;
      while (sprayAcc >= 1) {
        sprayAcc--;
        spindrift();
      }
      hopAcc += E.ws * E.ws * 5.5;
      while (hopAcc >= 1) {
        hopAcc--;
        hop();
      }
      // sand that heaps higher than its column allows blows away, so the dune never climbs into the type
      for (let k = 0; k < 6; k++) {
        const x = rnd() % COLS;
        const i = (ceilRow[x] - 1) * COLS + x;
        if (type[i] === T_SAND || (type[i] === T_FRESH && type[i + COLS] !== 0)) {
          if (type[i] === T_SAND) sandCount--;
          type[i] = 0;
          live[ceilRow[x]] = 2;
        }
      }
      if ((stepN & 15) === 0) countSand();
      const over = sandCount - sandTarget;
      if (over > 0) {
        const nd = Math.min(6, 1 + (over >> 8));
        for (let k = 0; k < nd; k++) drainOne();
      }
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
      E.seepP = waterCount > 1300 + 1100 * E.rain ? 40 : 4;
    }

    // Moves a loose thing at i straight down through lettering to the first free cell below it.
    function sift(i, y, t) {
      let q = i + COLS;
      let n = 1;
      while (n < 24 && q < N && (type[q] === T_INK || (inBand[q] && type[q] !== 0))) {
        q += COLS;
        n++;
      }
      if (q < N && type[q] === 0 && t !== T_SNOW) {
        type[q] = t;
        col[q] = col[i];
        live[y + n + 1] = live[y + n + 2] = 2;
      } else if (t === T_WATER) waterCount--;
      type[i] = 0;
      live[y] = live[y + 1] = 2;
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
          const band = inBand[i];
          const r = rnd();
          const below = i + COLS;
          const tb = onFloor ? T_WALL : type[below];

          if (t <= T_CRUMB) {
            if (tb === 0) {
              if (t === T_SAND && (r & 255) < lagP) {
                live[y + 1] = 2;
                continue;
              }
              let j = below;
              let yy = y + 1;
              if (t === T_FRESH && col[i] >= P_THREAD) {
                // the thread leans with the wind, but never out of its own lane
                const nx = x + wdir;
                if (((r >>> 8) & 255) < E.threadP && nx >= THREAD_X - 5 && nx <= THREAD_X + 6 && type[below + wdir] === 0) j = below + wdir;
              } else if (((r >>> 8) & 255) < driftP) {
                const nx = x + wdir;
                const jw = nx < 0 ? below + COLS - 1 : nx >= COLS ? below - COLS + 1 : below + wdir;
                if (type[jw] === 0) j = jw;
              } else if (((r >>> 16) & 31) === 0) {
                const d = (r >>> 22) & 1 ? 1 : -1;
                if (x + d >= 0 && x + d < COLS && type[below + d] === 0) j = below + d;
              }
              // loose sand in free fall covers two cells a step now and then
              if (t !== T_SAND && (r >>> 26) & 1 && yy + 1 < FLOOR && type[j + COLS] === 0) {
                j += COLS;
                yy++;
              }
              type[j] = t;
              col[j] = col[i];
              type[i] = 0;
              live[y] = live[y + 1] = 2;
              live[yy + 1] = live[yy + 2] = 2;
              continue;
            }
            if (tb === T_WATER || (tb === T_SNOW && (r & 7) === 0)) {
              // sand is heavier than water and snow: it sinks through them
              if (r & 1) {
                type[below] = t;
                type[i] = tb;
                const c = col[below];
                col[below] = col[i];
                col[i] = c;
              }
              live[y] = live[y + 1] = live[y + 2] = 2;
              continue;
            }
            if (band && (tb === T_INK || tb <= T_CRUMB)) {
              sift(i, y, t);
              continue;
            }
            // the angle of repose: slide down a diagonal if one is free
            let d = r & 2 ? 1 : -1;
            let moved = false;
            if (!onFloor) {
              for (let q = 0; q < 2; q++, d = -d) {
                if (x + d < 0 || x + d >= COLS) continue;
                const j = below + d;
                if (type[j] === 0 && type[i + d] === 0) {
                  type[j] = t;
                  col[j] = col[i];
                  type[i] = 0;
                  moved = true;
                  break;
                }
              }
            }
            if (moved) {
              live[y] = live[y + 1] = live[y + 2] = 2;
              continue;
            }
            if (t === T_SAND) continue;
            live[y + 1] = 2;
            const pr = (r >>> 8) & 255;
            if (t === T_FRESH) {
              if (y >= SCAN_Y && tb !== T_GLUE && tb !== T_INK) {
                type[i] = T_SAND; // the thread joins the dune, in the sky's own colour
                if (col[i] >= P_THREAD) col[i] = skyCol(x);
                continue;
              }
              // Resting up on a numeral, a heap or a ledge, a grain slides along the
              // top, away from where the thread lands, and spills off the edge in a
              // stream. It moves only against the scan, so once a step; on its own
              // kind it creeps more slowly, so a pile slumps a little below 45 degrees.
              // Down among the readouts it does not creep, so the cone the thread
              // builds on the dune never climbs into the type.
              if ((y < TEMP_Y || tb === T_INK) && (tb === T_GLUE || tb === T_INK || tb === T_SAND || tb === T_SNOW || tb === T_FRESH)) {
                const dir = x < THREAD_X ? -1 : x > THREAD_X + 1 ? 1 : r & 4 ? 1 : -1;
                if (dir > 0 !== ltr && pr < (tb === T_FRESH ? 26 : 150) && x + dir >= 0 && x + dir < COLS && type[i + dir] === 0) {
                  type[i + dir] = T_FRESH;
                  col[i + dir] = col[i];
                  type[i] = 0;
                  live[y] = live[y + 2] = 2;
                  continue;
                }
              }
              // stuck in a corner: it lingers, then (rarely) slips away
              if (y >= TEMP_Y ? pr < 6 : ((r >>> 16) & 1023) < 3) {
                type[i] = 0;
                live[y] = 2;
              }
              continue;
            }
            // an avalanche grain at rest sinks away, faster under a deep heap
            let hf = 0;
            for (let j = i - COLS; j >= 0 && hf < 6 && type[j] === T_CRUMB; j -= COLS) hf++;
            if (pr < 3 + hf * hf * 4) {
              type[i] = 0;
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
            if (band && tb !== T_GLUE) {
              sift(i, y, t);
              continue;
            }
            if (y > LOW_Y && y < ceilRow[x] && ((r >>> 8) & 255) < 48) {
              // a pool never rises into the readouts: what would, soaks away
              type[i] = 0;
              waterCount--;
              live[y] = 2;
              continue;
            }
            const d = r & 2 ? 1 : -1;
            const okA = x + d >= 0 && x + d < COLS;
            const okB = x - d >= 0 && x - d < COLS;
            let j = -1;
            if (!onFloor && okA && type[below + d] === 0) j = below + d;
            else if (!onFloor && okB && type[below - d] === 0) j = below - d;
            else if (okA && type[i + d] === 0) j = i + d;
            else if (okB && type[i - d] === 0) j = i - d;
            const pr = (r >>> 8) & 255;
            if ((tb === T_SAND || tb === T_FRESH || tb === T_CRUMB || tb === T_WALL || tb === T_SNOW) && pr < E.seepP) {
              type[i] = 0;
              waterCount--;
              live[y] = 2;
              continue;
            }
            if (j < 0) {
              if ((tb === T_GLUE || tb === T_INK) && pr < 12) {
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
          if (band && tb !== T_GLUE) {
            type[i] = 0;
            live[y] = 2;
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
          if ((depth >= cap || noDrift(y) || (y > LOW_Y && y < ceilRow[x])) && ((r >>> 8) & 7) === 0) {
            type[i] = 0;
            live[y] = 2;
          }
        }
      }
    }

    // ----- motes: fog and bad air hanging in the frame -----
    const MOTES = 2600;
    const mx = new Float32Array(MOTES);
    const my = new Float32Array(MOTES);
    const mp = new Float32Array(MOTES);
    {
      const r = rng(seed + 5);
      const banks = [r.range(20, 70), r.range(110, 160), r.range(190, 250)];
      for (let k = 0; k < MOTES; k++) {
        mx[k] = r() * COLS;
        my[k] = k % 3 === 0 ? r() * FLOOR : (((banks[k % 3 === 1 ? 0 : (k >> 1) % 3] + r.gauss() * 22) % FLOOR) + FLOOR) % FLOOR;
        mp[k] = r() * 6.283;
      }
    }
    // the veil: soft banks across the rows, wisps along them, each row sliding at its own pace
    const rowD = new Uint8Array(FLOOR);
    const rowOff = new Uint16Array(FLOOR);
    const rowSp = new Float32Array(FLOOR);
    const colD = new Uint8Array(COLS * 2);
    const bank = new Float32Array(9); // centre, width, phase for three banks
    {
      const r = rng(seed + 7);
      const a = r() * 6.28;
      const b = r() * 6.28;
      const c = r() * 6.28;
      for (let x = 0; x < COLS; x++) {
        const u = (x / COLS) * 6.2832;
        const v = clamp(0.5 + 0.26 * Math.sin(2 * u + a) + 0.18 * Math.sin(5 * u + b) + 0.1 * Math.sin(9 * u + c)) * 255;
        colD[x] = colD[x + COLS] = v;
      }
      for (let y = 0; y < FLOOR; y++) rowSp[y] = 0.45 + 0.3 * Math.sin(y * 0.071 + a) + 0.15 * Math.sin(y * 0.19 + b);
      for (let k = 0; k < 3; k++) {
        bank[k * 3] = r.range(0.12, 0.88) * FLOOR;
        bank[k * 3 + 1] = r.range(16, 30);
        bank[k * 3 + 2] = r() * 6.28;
      }
    }
    function veilRows(s) {
      const t = s.t;
      const push = E.wdir * E.ws * 2.5;
      for (let y = 0; y < FLOOR; y++) {
        let d = 0.28;
        for (let k = 0; k < 3; k++) {
          const c = bank[k * 3] + 14 * Math.sin(t * 0.021 + bank[k * 3 + 2]);
          const u = (y - c) / bank[k * 3 + 1];
          d += 0.85 * Math.exp(-u * u);
        }
        rowD[y] = Math.min(255, d * 230);
        const o = Math.floor(t * (rowSp[y] + push)) % COLS;
        rowOff[y] = o < 0 ? o + COLS : o;
      }
    }

    // ----- drawing -----
    const SPOUT = [13, 11, 9, 7, 5, 3, 3];
    function render(s) {
      if (veilA > 0.01) {
        veilRows(s);
        for (let y = 0, i = 0; y < FLOOR; y++) {
          const rd = rowD[y];
          const off = rowOff[y];
          for (let x = 0; x < COLS; x++, i++) {
            const t = type[i];
            px[i] = t !== 0 && (t >= T_GLUE || !inBand[i]) ? lut[col[i]] : ghost[i] !== 0 ? (ghost[i] === 1 ? ghostFill : ghostEdge) : veilPx[(rd * colD[x + off]) >> 11];
          }
        }
      } else {
        for (let i = 0; i < N; i++) {
          const t = type[i];
          // loose things inside a line of lettering pass behind it, so they never read as strokes
          px[i] = t !== 0 && (t >= T_GLUE || !inBand[i]) ? lut[col[i]] : ghost[i] !== 0 ? (ghost[i] === 1 ? ghostFill : ghostEdge) : 0;
        }
      }
      if (shadowPx !== 0) {
        for (let y = 2; y < FLOOR; y++) {
          const row = y * COLS;
          for (let x = 2; x < COLS; x++) {
            const i = row + x;
            if (type[i] !== 0 || ghost[i] !== 0) continue;
            const t1 = type[i - COLS - 1];
            if ((t1 !== 0 && t1 !== T_WATER) || type[i - 2 * COLS - 2] === T_GLUE) px[i] = shadowPx;
          }
        }
      }
      if (E.rain > 0) {
        // falling drops trail a short streak, leaning with the wind
        const lean = E.rainDrift > 90 ? -E.wdir : 0;
        for (let i = 3 * COLS; i < N - COLS; i++) {
          if (type[i] !== T_WATER || type[i + COLS] !== 0) continue;
          const a = i - COLS + lean;
          if (type[a] === 0 && !inBand[a]) px[a] = streakPx;
          const b = a - COLS + lean;
          if (type[b] === 0 && !inBand[b]) px[b] = streakPx2;
        }
      }
      const nm = Math.round(MOTES * clamp(E.fog * 0.9 + E.haze * 0.4));
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
          if (type[i] === 0 && !inBand[i]) px[i] = motePx;
        }
      }
      for (let r = 0; r < 2; r++) {
        const job = jobs[r];
        if (!job.active || !job.n) continue;
        const hx = Math.round(job.hx);
        const hy = rowY(r) - 8;
        if (job.stream >= 0) {
          for (let y = hy + SPOUT.length; y < job.stream; y++) {
            for (let dx = -1; dx <= 1; dx++) {
              const x = hx + dx;
              if (x < 0 || x >= COLS) continue;
              const i = y * COLS + x;
              if (type[i] === T_GLUE) continue;
              const h = Math.imul(x * 374761393 + (y - stepN * 2) * 668265263, 1274126177) >>> 24;
              if (h > (dx === 0 ? 30 : 150)) px[i] = lut[P_PIG + (h & 15)];
            }
          }
        }
        for (let q = 0; q < SPOUT.length; q++) {
          const half = (SPOUT[q] - 1) >> 1;
          for (let x = hx - half; x <= hx + half; x++) if (x >= 0 && x < COLS) px[(hy + q) * COLS + x] = q === 0 ? inkPx : spoutPx;
        }
      }
      ctx.putImageData(img, 0, 0);
      if (bedDirty) drawBed();
    }

    // ----- set the stage, already mid-weather, so the first frame looks right -----
    readWeather(state);
    readSky(state);
    buildDune(state);
    syncText(state);
    syncTime(state, true);
    {
      const r = rng(seed + 23);
      // the thread, already falling
      for (let y = 0; y < FLOOR; y++) {
        for (let q = 0; q < 2; q++) {
          const lean = clamp(Math.round((E.wdir * y * E.threadP) / 384), -5, 5);
          const i = y * COLS + THREAD_X + q + lean;
          if (type[i] === 0 && r() < 0.7 && (y + 3) % 90 > 8) {
            type[i] = T_FRESH;
            col[i] = P_THREAD + (q & 1);
          }
        }
      }
      // rain and snow in the air
      const nr = Math.round(E.rain * 3600);
      for (let k = 0; k < nr; k++) {
        const i = ((r() * SCAN_Y) | 0) * COLS + ((r() * COLS) | 0);
        if (type[i] === 0) {
          type[i] = T_WATER;
          col[i] = P_WATER + ((r() * 4) | 0);
          waterCount++;
        }
      }
      const ns = Math.round(E.snow * 2600);
      for (let k = 0; k < ns; k++) {
        const i = ((r() * FLOOR) | 0) * COLS + ((r() * COLS) | 0);
        if (type[i] === 0) {
          type[i] = T_SNOW;
          col[i] = P_SNOW + ((r() * 4) | 0);
        }
      }
    }
    if (E.snow > 0 || (state.weather.falling === "freezing" && E.temp < 33)) {
      // drifts already lying on every exposed shoulder
      for (let x = 0; x < COLS; x++) {
        let clear = 0;
        for (let y = 0; y < FLOOR - 1; y++) {
          const i = y * COLS + x;
          if (type[i] !== 0 && type[i] !== T_SNOW) {
            clear = 0;
            continue;
          }
          clear++;
          const tb = type[i + COLS];
          if (tb === 0 || tb === T_SNOW || tb === T_WATER || clear < 4) continue;
          if (inBand[i] || (y > LOW_Y && y < ceilRow[x])) continue;
          const room = noDrift(y) ? 0 : y < GAP_Y ? y - SNOW_TOP + 1 : y - GAP_Y - 2;
          if (room < 1) continue;
          const cap = tb === T_INK ? 1 : tb === T_GLUE ? E.snowCap : E.snowCap + 2;
          const d = Math.min(clear - 1, room, Math.max(1, Math.round(cap * (0.55 + (rnd() % 100) / 220))));
          for (let k = 0; k < d; k++) {
            type[i - k * COLS] = T_SNOW;
            col[i - k * COLS] = P_SNOW + (rnd() & 3);
          }
        }
      }
    }
    for (let y = 0; y < FLOOR; y++) live[y + 1] = 2;

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
          beadLeft = 6;
        }

        // a thunderstorm now and then lifts the light, slowly
        if (s.weather.falling === "storm") {
          if (s.t > nextBolt) {
            boltAt = s.t;
            nextBolt = s.t + 11 + (rnd() % 1000) / 55;
          }
          const a = s.t - boltAt;
          bolt = a < 0 ? 0 : a < 0.6 ? smoothstep(0, 0.6, a) : Math.exp(-(a - 0.6) / 0.9);
          if (bolt < 0.01) bolt = 0;
          bolt = Math.round(bolt * 24) / 24;
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
        put("fl", nFactLab, tx.factLabel);
        if (put("fv", nFact, tx.factValue)) {
          base.classList.toggle("nofact", tx.factValue === "");
          // 46 px on one line; two lines at 42 px (38 px if it needs it) still clear the bottom by 64 px
          nFact.style.fontSize = "46px";
          if (nFact.scrollHeight > 46 * 1.2 + 4) {
            nFact.style.fontSize = "42px";
            if (nFact.scrollHeight > 2 * 42 * 1.2 + 4) nFact.style.fontSize = "38px";
          }
        }
      },
    };
  },
};

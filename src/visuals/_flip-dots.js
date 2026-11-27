// Flip Dots
//
// A full-height wall of electromechanical flip-discs, the kind bus destination
// signs are made of: 90 x 119 discs on a 12 px pitch, and below them a finer
// module of 180 x 82 discs on a 6 px pitch for the small lines. Every disc has
// a black face and a pale face, and nothing is ever drawn that a real sign could
// not do: discs turn over, one at a time, in waves.
//
// The time is giant numerals rasterised from Archivo Black onto the grid (hour
// over minutes), then the date, temperature and condition in 5x7 dot type,
// then sun, moon, air, UV and today's fact on the fine module. Every line of
// type sits on a solid halo of the opposite face, so it always reads on/off.
// Everything else on the wall is the weather, passing through the discs:
//
//   light   by day the field shows its pale faces, lit with the colour measured
//           from the tower (west on the left columns to east on the right), and
//           the type is black. As the light goes, the field's discs turn back
//           one by one on an ordered dither, and when the wall is more dark than
//           pale the whole sign rewrites itself: pale type on black for the
//           night, the faces dimmed for a dark room. Dawn runs it backwards.
//   cloud   drifting dithered blobs, covering the wall in proportion to the real
//           cloud cover, travelling with the real wind (west is left, north is
//           up) and stretching along it when it blows hard.
//   wind    broad bands of discs that turn over and back, sweeping downwind;
//           more wind, more and faster bands.
//   rain    streaks of discs ticking down at the wind's slant, as many as it
//           is raining hard, all the way to the floor (silver at night, black
//           by day). Drizzle is single ticks.
//           A storm sometimes lays a slow jagged branch and unpicks it.
//   snow    single white discs wandering down and settling into a drift on the
//           floor of the fine module, which the wind slowly erodes.
//   fog     an even ordered haze rising from the floor, as high as the
//           visibility is poor: the wall thins out into grey.
//   cold    white frost ferns grow in from the right-hand corners below 30 F.
//   heat    above 86 F the numerals shimmer: rows slip a disc sideways.
//   no data the field is left plain, with one slow diagonal sweep a minute.
//
// One accent colour, the fluorescent yellow-green of old signs, used only for
// AM/PM and the disc above it that flips every second, on a small black plate.
//
// How it is drawn: the wall is one canvas that is painted once and then left
// alone; only discs in the middle of a flip are redrawn. A pale face is a hole
// in that canvas; the colour seen through it comes from a tiny canvas below
// (one pixel per fine disc), so the wall changes colour with the sky and the
// daylight without redrawing a single disc.

import { TAU, clamp, lerp, smoothstep, rng, mix, toOklch, oklch, parse, el, addStyle, canvas2d, pixelCanvas, mask, grain } from "../lib/kit.js";

const W = 1080, H = 1920;
// the main wall
const P = 12, COLS = 90, ROWS = 119, N1 = COLS * ROWS;
// the fine module below it
const FP = 6, FCOLS = 180, FTOP = ROWS * P, FROWS = (H - FTOP) / FP, N2 = FCOLS * FROWS;
const N = N1 + N2;
const UC = W / FP; // columns of the colour layer (one pixel per fine disc)
const FLOOR = ROWS + FROWS / 2; // the floor, in main-wall rows

// faces a disc can show
const DARK = 0, FIELD = 1, BRIGHT = 2, ACCENT = 3, SPARK = 4;
// what a cell is reserved for
const L_MOAT = 1, L_TEXT = 2, L_ACCENT = 3, L_SEC = 4, L_PLATE = 5;
// weather overlays (bit flags)
const O_RAIN = 1, O_FLAKE = 2, O_GUST = 4, O_BOLT = 8, O_STRAY = 16, O_DRIP = 32; // DRIP: rain just left
// sprites
const SP_DARK = 0, SP_DARK_HALF = 1, SP_EDGE = 2, SP_PALE_HALF = 3, SP_PALE = 4;

const FLIP = 0.19; // seconds a disc takes to turn over
const BUSY = 160; // more discs than this turning at once: they skip the half-open step
const SWEEP = 0.7; // every disc re-reads the weather this often (staggered)
const CLOUD_SOFT = 26; // width of a cloud's dithered edge, in noise levels

// layout of the main wall, in discs
const LEFT = 6, RIGHT = 83; // 72 px margins
const DIG_H = 28;
const HOUR_ROW = 6, MIN_ROW = 36;
const AMPM_ROW = MIN_ROW + DIG_H - 7;
const DATE_ROW = 69, DATE_ROW2 = 78;
const TEMP_ROW = 89, TEMP_H = 12;
const COND_ROW = 103, COND_ROW2 = 112;
// layout of the fine module, in fine discs
const FLEFT = 12, FRIGHT = 167; // 72 px margins, aligned with the wall's

const LAMP = oklch(0.69, 0.065, 76);
const NUM_FONT = '"Archivo Black", "Arial Black", sans-serif';

const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];

// A 5 x 7 dot-matrix face (some characters are narrower).
const F57 = {
  A: "01110 10001 10001 11111 10001 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110", C: "01110 10001 10000 10000 10000 10001 01110",
  D: "11110 10001 10001 10001 10001 10001 11110", E: "11111 10000 10000 11110 10000 10000 11111", F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01110 10001 10000 10111 10001 10001 01111", H: "10001 10001 10001 11111 10001 10001 10001", I: "111 010 010 010 010 010 111",
  J: "00111 00010 00010 00010 00010 10010 01100", K: "10001 10010 10100 11000 10100 10010 10001", L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10101 10001 10001 10001", N: "10001 11001 11001 10101 10011 10011 10001", O: "01110 10001 10001 10001 10001 10001 01110",
  P: "11110 10001 10001 11110 10000 10000 10000", Q: "01110 10001 10001 10001 10101 10010 01101", R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110", T: "11111 00100 00100 00100 00100 00100 00100", U: "10001 10001 10001 10001 10001 10001 01110",
  V: "10001 10001 10001 10001 10001 01010 00100", W: "10001 10001 10001 10101 10101 11011 10001", X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 01010 00100 00100 00100 00100", Z: "11111 00001 00010 00100 01000 10000 11111",
  0: "01110 10001 10011 10101 11001 10001 01110", 1: "010 110 010 010 010 010 111", 2: "01110 10001 00001 00110 01000 10000 11111",
  3: "11110 00001 00001 01110 00001 00001 11110", 4: "00010 00110 01010 10010 11111 00010 00010", 5: "11111 10000 11110 00001 00001 10001 01110",
  6: "00110 01000 10000 11110 10001 10001 01110", 7: "11111 00001 00010 00100 01000 01000 01000", 8: "01110 10001 10001 01110 10001 10001 01110",
  9: "01110 10001 10001 01111 00001 00010 01100",
  ",": "00 00 00 00 00 01 10", ".": "0 0 0 0 0 0 1", "-": "000 000 000 111 000 000 000", "–": "0000 0000 0000 1111 0000 0000 0000",
  "'": "1 1 0 0 0 0 0", '"': "101 101 000 000 000 000 000", "/": "001 001 010 010 010 100 100", "°": "010 101 010 000 000 000 000",
  ":": "0 0 1 0 0 1 0", ";": "00 00 01 00 00 01 10", "!": "1 1 1 1 1 0 1", "?": "01110 10001 00001 00110 00100 00000 00100",
  "(": "001 010 100 100 100 010 001", ")": "100 010 001 001 001 010 100", "&": "01100 10010 10100 01000 10101 10010 01101",
  "+": "00000 00100 00100 11111 00100 00100 00000", "%": "11001 11010 00010 00100 01000 01011 10011", "#": "01010 11111 01010 01010 01010 11111 01010",
  "·": "0 0 0 1 0 0 0", " ": "000 000 000 000 000 000 000",
};
const GLYPH = {};
for (const ch in F57) {
  const rows = F57[ch].split(" ");
  const w = rows[0].length;
  const d = new Uint8Array(w * 7);
  for (let y = 0; y < 7; y++) for (let x = 0; x < w; x++) d[y * w + x] = rows[y][x] === "1" ? 1 : 0;
  GLYPH[ch] = { w, h: 7, d };
}
const glyphOf = (ch) => GLYPH[ch] || GLYPH[" "];
const textWidth = (str) => {
  let w = 0;
  for (const ch of str) w += glyphOf(ch).w + 1;
  return Math.max(0, w - 1);
};
// What a sign can spell: capitals, no accents, straight quotes.
const signText = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—]/g, "–")
    .toUpperCase();
// Greedy word wrap in dot columns.
const wrapDots = (str, maxW) => {
  const lines = [];
  let line = "";
  for (const word of str.split(/\s+/)) {
    if (!word) continue;
    const test = line ? `${line} ${word}` : word;
    if (line && textWidth(test) > maxW) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
};

// Numerals from a heavy grotesque, thresholded onto the grid, all the same
// width so the clock never jumps sideways.
function rasterDigits(rows, maxW, thr) {
  const cols = rows * 2 + 8;
  let fs = 0;
  let sx = 1;
  let out;
  for (let pass = 0; pass < 2; pass++) {
    out = {};
    let widest = 0;
    for (const ch of "0123456789") {
      const m = mask(cols, rows + 4, (c) => {
        if (!fs) {
          c.font = `200px ${NUM_FONT}`;
          fs = (rows * 200) / (c.measureText("7").actualBoundingBoxAscent || 140);
        }
        c.font = `${fs}px ${NUM_FONT}`;
        c.textBaseline = "alphabetic";
        c.scale(sx, 1);
        c.fillText(ch, 4 / sx, rows + 2);
      });
      let x0 = cols;
      let x1 = -1;
      for (let y = 2; y < rows + 2; y++) {
        for (let x = 0; x < cols; x++) {
          if (m.data[y * cols + x] >= thr) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
          }
        }
      }
      const w = Math.max(1, x1 - x0 + 1);
      const d = new Uint8Array(w * rows);
      for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) d[y * w + x] = m.data[(y + 2) * cols + x0 + x] >= thr ? 1 : 0;
      out[ch] = { w, h: rows, d };
      if (w > widest) widest = w;
    }
    if (widest <= maxW) break;
    sx = (maxW - 0.4) / widest;
  }
  return out;
}

// The temperature, in the same face as the numerals, as one bitmap. At only
// twelve rows a heavy face clogs: a high threshold keeps its counters open.
const TEMP_THR = 185;
let tempFs = 0;
function rasterTemp(text, rows) {
  const ring = text.endsWith("°");
  const str = ring ? text.slice(0, -1) : text;
  if (str === "–" || str === "-") {
    // no reading: a heavy dash at mid-height, then the ring
    const w = 9 + (ring ? DEGREE.w + 2 : 0);
    const d = new Uint8Array(w * rows);
    const y0 = (rows >> 1) - 1;
    for (let x = 0; x < 9; x++) d[y0 * w + x] = d[(y0 + 1) * w + x] = 1;
    if (ring) for (let y = 0; y < DEGREE.h; y++) for (let x = 0; x < DEGREE.w; x++) d[y * w + 11 + x] = DEGREE.d[y * DEGREE.w + x];
    return { w, h: rows, d };
  }
  const cols = 96;
  const m = mask(cols, rows + 6, (c) => {
    if (!tempFs) {
      c.font = `200px ${NUM_FONT}`;
      tempFs = (rows * 200) / (c.measureText("0").actualBoundingBoxAscent || 140);
    }
    c.font = `${tempFs}px ${NUM_FONT}`;
    c.textBaseline = "alphabetic";
    c.fillText(str, 2, rows + 3);
  });
  let x0 = cols;
  let x1 = -1;
  for (let y = 2; y < rows + 4; y++) {
    for (let x = 0; x < cols; x++) {
      if (m.data[y * cols + x] >= TEMP_THR) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
    }
  }
  const w0 = Math.max(1, x1 - x0 + 1);
  // the degree sign, as a heavy ring of discs (the font's own is too small to survive the grid)
  const deg = ring ? DEGREE.w + 2 : 0;
  const w = w0 + deg;
  const d = new Uint8Array(w * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < w0; x++) d[y * w + x] = m.data[(y + 3) * cols + x0 + x] >= TEMP_THR ? 1 : 0;
  if (ring) for (let y = 0; y < DEGREE.h; y++) for (let x = 0; x < DEGREE.w; x++) d[y * w + w0 + 2 + x] = DEGREE.d[y * DEGREE.w + x];
  return { w, h: rows, d };
}
const DEGREE = { w: 6, h: 6, d: Uint8Array.from("011110111111110011110011111111011110".split(""), Number) };

// A tileable 128 x 128 field of smooth noise, equalised so every value 0..255
// is about equally common (a threshold then cuts off a known share of it).
function makeNoise(seed) {
  const r = rng(seed);
  const M = 128;
  const f = new Float32Array(M * M);
  const ia = new Int32Array(M), ib = new Int32Array(M), tw = new Float32Array(M);
  const octaves = [3, 0.56, 7, 0.28, 13, 0.16];
  for (let o = 0; o < 6; o += 2) {
    const g = octaves[o], amp = octaves[o + 1];
    const lat = new Float32Array(g * g);
    for (let i = 0; i < lat.length; i++) lat[i] = r() * amp;
    for (let x = 0; x < M; x++) {
      const fx = (x * g) / M;
      const x0 = fx | 0;
      const t = fx - x0;
      ia[x] = x0 % g;
      ib[x] = (x0 + 1) % g;
      tw[x] = t * t * (3 - 2 * t);
    }
    for (let y = 0; y < M; y++) {
      const ya = ia[y] * g, yb = ib[y] * g, ty = tw[y];
      for (let x = 0; x < M; x++) {
        const a = lat[ya + ia[x]], b = lat[ya + ib[x]];
        const c = lat[yb + ia[x]], d = lat[yb + ib[x]];
        const t = tw[x];
        const top = a + (b - a) * t;
        const bot = c + (d - c) * t;
        f[y * M + x] += top + (bot - top) * ty;
      }
    }
  }
  // equalise through a histogram (no sort)
  const B = 2048;
  const hist = new Uint32Array(B + 1);
  const q = new Uint16Array(M * M);
  for (let i = 0; i < M * M; i++) {
    let v = (f[i] * B) | 0;
    v = v < 0 ? 0 : v >= B ? B - 1 : v;
    q[i] = v;
    hist[v + 1]++;
  }
  for (let k = 0; k < B; k++) hist[k + 1] += hist[k];
  const out = new Uint8Array(M * M);
  for (let i = 0; i < M * M; i++) out[i] = Math.min(255, ((hist[q[i]] + hist[q[i] + 1]) * 128) / (M * M));
  return out;
}

// The pictures a disc is drawn from, at one pitch. Three are opaque tiles: the
// dark face, the dark face half turned, and the disc edge on. Two are masks
// cut out of whatever is there, opening a hole for the pale face half turned
// and fully shown; where a mask is weaker a little of the dark stays, which
// shades the face and leaves the two pivots.
function makeSprites(pitch, ratio) {
  const S = Math.max(3, Math.round(pitch * ratio));
  const c = document.createElement("canvas");
  c.width = S * 5;
  c.height = S;
  const g = c.getContext("2d");
  const u = S / pitch;
  const R = 0.46 * pitch * u;
  const cx = S / 2;
  const cy = S / 2;
  const squash = [1, 0.56, 0.17, 0.56, 1];
  for (let k = 0; k < 5; k++) {
    g.save();
    g.translate(k * S, 0);
    g.beginPath();
    g.rect(0, 0, S, S);
    g.clip();
    const face = () => {
      g.beginPath();
      g.ellipse(cx, cy, R, R * squash[k], -Math.PI / 4, 0, TAU);
    };
    const shade = g.createLinearGradient(cx - R * 0.7, cy - R * 0.7, cx + R * 0.7, cy + R * 0.7);
    if (k <= SP_EDGE) {
      g.fillStyle = "#0d0e0f";
      g.fillRect(0, 0, S, S);
      g.fillStyle = "#060707"; // the recess the disc sits in
      g.beginPath();
      g.arc(cx, cy, R + 0.04 * pitch * u, 0, TAU);
      g.fill();
      face();
      if (k === SP_EDGE) {
        g.fillStyle = "#3a3d41";
        g.fill();
      } else {
        g.fillStyle = k === SP_DARK ? "#17181a" : "#111214";
        g.fill();
        shade.addColorStop(0, "rgba(255,255,255,0.06)");
        shade.addColorStop(0.5, "rgba(255,255,255,0)");
        shade.addColorStop(1, "rgba(0,0,0,0.25)");
        g.fillStyle = shade;
        g.fill();
      }
    } else {
      const top = k === SP_PALE ? 1 : 0.78;
      shade.addColorStop(0, `rgba(0,0,0,${top})`);
      shade.addColorStop(0.5, `rgba(0,0,0,${top})`);
      shade.addColorStop(1, `rgba(0,0,0,${top - 0.2})`);
      face();
      g.fillStyle = shade;
      g.fill();
    }
    if (k === SP_DARK || k === SP_PALE) {
      // the two pivots on the diagonal
      const o = R * 0.72;
      g.beginPath();
      g.arc(cx + o, cy - o, 0.06 * pitch * u, 0, TAU);
      g.arc(cx - o, cy + o, 0.06 * pitch * u, 0, TAU);
      if (k === SP_PALE) g.globalCompositeOperation = "destination-out";
      g.fillStyle = "#0c0d0e";
      g.fill();
    }
    g.restore();
  }
  // single tiles, for painting the whole wall at once with a pattern
  const tile = (k) => {
    const t = document.createElement("canvas");
    t.width = t.height = S;
    t.getContext("2d").drawImage(c, k * S, 0, S, S, 0, 0, S, S);
    return t;
  };
  // the surround of a pale disc: the dark tile with the pale face cut out of it
  const frame = tile(SP_DARK);
  const fg = frame.getContext("2d");
  fg.globalCompositeOperation = "destination-out";
  fg.drawImage(c, SP_PALE * S, 0, S, S, 0, 0, S, S);
  return { canvas: c, S, dark: tile(SP_DARK), frame };
}

const CSS = `.fd { position: absolute; inset: 0; background: #0b0c0d; overflow: hidden; }`;

export default {
  title: "Flip Dots",
  description: "A wall of twenty-five thousand flip-discs that turns itself over with the light: the time in giant dot numerals, and the real weather passing through the discs around them.",
  fonts: ["Archivo Black"],
  fps: 30,

  mount(root, { state, seed }) {
    addStyle(root, CSS);
    const wrap = el("div", { class: "fd" });
    root.append(wrap);
    const under = pixelCanvas(wrap, { size: FP, alpha: false });
    const top = canvas2d(wrap, { maxScale: 2 });
    const ctx = top.ctx;
    grain(wrap, { opacity: 0.035, size: 128 });

    // ----- per-disc data -----
    const r = rng(seed);
    let NZ = null; // the noise field, made in prepare()
    const cxs = new Uint8Array(N); // column and row in its own grid
    const cys = new Uint8Array(N);
    const rowG = new Uint8Array(N); // row index shared by both grids (fine rows follow the wall's)
    const fxs = new Float32Array(N); // position in wall units, for the weather
    const fys = new Float32Array(N);
    const pix = new Uint32Array(N); // its first pixel in the colour layer
    const pcol = new Uint8Array(N); // its column in the colour layer
    const bay = new Uint8Array(N); // ordered threshold 0..63
    const lagOf = new Float32Array(N); // every disc is a little late; a few are sticky
    const warp = new Float32Array(N); // bends the wind bands
    const perm = new Uint16Array(N);
    const lock = new Uint8Array(N);
    const lockNew = new Uint8Array(N);
    const want = new Uint8Array(N);
    const shown = new Uint8Array(N);
    const tone = new Uint8Array(N); // which colour is behind the disc: 0 sky, 1 white, 2 accent
    const ov = new Uint8Array(N);
    const anim = new Uint8Array(N);
    const aIdx = new Uint16Array(N);
    const aStart = new Float32Array(N);
    const aStage = new Uint8Array(N);
    const aTo = new Uint8Array(N);
    const aQuick = new Uint8Array(N);
    let na = 0;

    // how much of the noise lies above each threshold, for the cloud cover
    const thrOf = new Int16Array(101);
    // The field's noise and every disc's own numbers. Made on the first frame,
    // not here, so that arriving is split into short stalls (see frame()).
    const prepareField = () => {
      NZ = makeNoise(seed + 11);
      for (let i = 0; i < N; i++) {
        let x, y;
        if (i < N1) {
          x = i % COLS;
          y = (i / COLS) | 0;
          fxs[i] = x;
          fys[i] = y;
          rowG[i] = y;
          pix[i] = y * 2 * UC + x * 2;
          pcol[i] = x * 2;
        } else {
          const j = i - N1;
          x = j % FCOLS;
          y = (j / FCOLS) | 0;
          fxs[i] = x * 0.5;
          fys[i] = ROWS + y * 0.5;
          rowG[i] = ROWS + y;
          pix[i] = (FTOP / FP + y) * UC + x;
          pcol[i] = x;
        }
        cxs[i] = x;
        cys[i] = y;
        bay[i] = BAYER[(y & 7) * 8 + (x & 7)];
        const hh = Math.imul(i ^ seed, 0x9e3779b1) >>> 0;
        lagOf[i] = (hh & 1023) < 20 ? 0.3 + ((hh >>> 10) & 255) / 1700 : ((hh >>> 18) & 1023) / 20480;
        warp[i] = (NZ[(((fys[i] * 0.6) & 127) << 7) | ((fxs[i] * 0.6 + 90) & 127)] - 128) * 0.11;
        perm[i] = i;
      }
      for (let i = N - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        const tmp = perm[i];
        perm[i] = perm[j];
        perm[j] = tmp;
      }

      {
        const hist = new Uint32Array(256);
        for (let y = 0; y < 128; y++) {
          for (let x = 0; x < 128; x++) {
            const n1 = NZ[(y << 7) | x];
            const n2 = NZ[(((y * 2.3 + 40) & 127) << 7) | ((x * 2.3 + 70) & 127)];
            hist[(n1 * 3 + n2) >> 2]++;
          }
        }
        let acc = 0;
        let v = 255;
        for (let p = 1; p <= 100; p++) {
          while (v > 0 && acc + hist[v] <= (p / 100) * 16384) acc += hist[v--];
          thrOf[p] = v;
        }
        thrOf[0] = 999;
      }
    };

    // ----- colours -----
    const img = under.ctx.createImageData(under.cols, under.rows);
    const u32 = new Uint32Array(img.data.buffer);
    u32.fill(0xff000000);
    const palF = new Uint32Array(UC); // the field
    const palB = new Uint32Array(UC); // type (and its halo by day)
    const palS = new Uint32Array(UC); // weather sparks: rain, snow, frost, lightning
    let palA = 0xff000000;
    const PN = 39; // 4 stops x (field, bright, spark) rgb + accent rgb
    const palCur = new Float32Array(PN);
    const palTgt = new Float32Array(PN);
    let palMoving = true;
    let uDirty = true;
    const sk = { w: "", nw: "", ne: "", e: "", dl: -1 };
    const put3 = (o, c) => {
      palTgt[o] = c[0];
      palTgt[o + 1] = c[1];
      palTgt[o + 2] = c[2];
    };
    const stopTone = (hex, dd, o) => {
      const c = toOklch(hex);
      const h = c.h || 0;
      // the field: the measured sky, kept light by day and dim at night
      const fl = clamp(c.l, lerp(0.42, 0.66, dd), lerp(0.48, 0.82, dd));
      const fc = Math.min(c.c * 1.15, lerp(0.035, 0.13, dd));
      put3(o, parse(oklch(fl, fc, h)));
      // type: white with a breath of the sky by day, a warm dim lamp at night
      put3(o + 3, parse(mix(LAMP, oklch(Math.max(0.9, fl + 0.13), Math.min(fc * 0.55, 0.06), h), dd)));
      // weather: white by day, a cool moonlit silver at night
      put3(o + 6, parse(oklch(lerp(0.66, 0.97, dd), lerp(0.03, Math.min(fc * 0.3, 0.03), dd), h)));
    };
    const colourOf = (tn, c) => (tn === 0 ? palF[c] : tn === 1 ? palB[c] : tn === 3 ? palS[c] : palA);
    const writeTone = (i) => {
      const v = colourOf(tone[i], pcol[i]);
      const p = pix[i];
      u32[p] = v;
      if (i < N1) {
        u32[p + 1] = v;
        u32[p + UC] = v;
        u32[p + UC + 1] = v;
      }
    };
    const chan = (o, t, k) => Math.round(palCur[o + k] + (palCur[o + 9 + k] - palCur[o + k]) * t);
    const rgbAt = (o, t, k) => 0xff000000 | (chan(o, t, k + 2) << 16) | (chan(o, t, k + 1) << 8) | chan(o, t, k);
    const packPalette = () => {
      for (let x = 0; x < UC; x++) {
        const f = (x / (UC - 1)) * 3;
        const a = Math.min(2, f | 0);
        const t = f - a;
        const o = a * 9;
        palF[x] = rgbAt(o, t, 0);
        palB[x] = rgbAt(o, t, 3);
        palS[x] = rgbAt(o, t, 6);
      }
      palA = 0xff000000 | (Math.round(palCur[38]) << 16) | (Math.round(palCur[37]) << 8) | Math.round(palCur[36]);
      for (let i = 0; i < N; i++) writeTone(i);
      uDirty = true;
    };
    const updatePalette = (s, dt, snap) => {
      const dlq = Math.round(s.daylight * 250);
      const sky = s.sky;
      if (sky.west !== sk.w || sky.northWest !== sk.nw || sky.northEast !== sk.ne || sky.east !== sk.e || dlq !== sk.dl) {
        sk.w = sky.west; sk.nw = sky.northWest; sk.ne = sky.northEast; sk.e = sky.east; sk.dl = dlq;
        const dd = smoothstep(0.08, 0.62, dlq / 250);
        stopTone(sky.west, dd, 0);
        stopTone(sky.northWest, dd, 9);
        stopTone(sky.northEast, dd, 18);
        stopTone(sky.east, dd, 27);
        const a = parse(oklch(lerp(0.72, 0.9, dd), lerp(0.17, 0.2, dd), 122));
        put3(36, a);
        palMoving = true;
      }
      if (!palMoving && !snap) return;
      const k = snap ? 1 : 1 - Math.pow(0.5, dt / 1.2);
      let far = 0;
      for (let i = 0; i < PN; i++) {
        const d = palTgt[i] - palCur[i];
        palCur[i] += d * k;
        if (Math.abs(d) > far) far = Math.abs(d);
      }
      if (far < 0.6) {
        palCur.set(palTgt);
        palMoving = false;
      }
      packPalette();
    };

    // ----- drawing discs -----
    const spM = makeSprites(P, top.ratio);
    const spF = makeSprites(FP, top.ratio);
    const SM = spM.S, SF = spF.S;
    const sheetM = spM.canvas, sheetF = spF.canvas;
    let cutting = false;
    const cut = (on) => {
      if (on === cutting) return;
      cutting = on;
      ctx.globalCompositeOperation = on ? "destination-out" : "source-over";
    };
    // an opaque tile, or (cut) a hole through what is there
    const blit = (i, sp) => {
      if (i < N1) ctx.drawImage(sheetM, sp * SM, 0, SM, SM, cxs[i] * P, cys[i] * P, P, P);
      else ctx.drawImage(sheetF, sp * SF, 0, SF, SF, cxs[i] * FP, FTOP + cys[i] * FP, FP, FP);
    };
    // this frame's paint, in two queues (see frame())
    const qdI = new Uint16Array(N * 2), qdS = new Uint8Array(N * 2);
    const qcI = new Uint16Array(N), qcS = new Uint8Array(N);
    let nQD = 0, nQC = 0;
    const qDark = (i, sp) => {
      qdI[nQD] = i;
      qdS[nQD++] = sp;
    };
    const qCut = (i, sp) => {
      qcI[nQC] = i;
      qcS[nQC++] = sp;
    };
    const toneOf = (face) => (face === BRIGHT ? 1 : face === ACCENT ? 2 : face === SPARK ? 3 : 0);
    const setTone = (i, face) => {
      const tn = toneOf(face);
      if (tone[i] === tn) return;
      tone[i] = tn;
      writeTone(i);
      uDirty = true;
    };
    // Paint the whole wall from `shown` in a handful of calls: a carpet of dark
    // discs, then every pale disc cut out of it at once through a mask.
    const pattern = (c2, tileCanvas, pitch, S) => {
      const p = c2.createPattern(tileCanvas, "repeat");
      p.setTransform(new DOMMatrix([pitch / S, 0, 0, pitch / S, 0, 0]));
      return p;
    };
    const mc = document.createElement("canvas");
    mc.width = UC;
    mc.height = H / FP;
    const mctx = mc.getContext("2d");
    const mi = mctx.createImageData(mc.width, mc.height);
    const m32 = new Uint32Array(mi.data.buffer);
    const renderAll = () => {
      for (let i = 0; i < N; i++) {
        tone[i] = toneOf(shown[i]);
        writeTone(i);
      }
      under.ctx.putImageData(img, 0, 0);
      uDirty = false;
      cutting = false;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = pattern(ctx, spM.dark, P, SM);
      ctx.fillRect(0, 0, W, FTOP);
      ctx.fillStyle = pattern(ctx, spF.dark, FP, SF);
      ctx.fillRect(0, FTOP, W, H - FTOP);
      // which discs are pale, one pixel per fine disc
      m32.fill(0);
      for (let i = 0; i < N; i++) {
        if (!shown[i]) continue;
        const p = pix[i];
        m32[p] = 0xffffffff;
        if (i < N1) {
          m32[p + 1] = 0xffffffff;
          m32[p + UC] = 0xffffffff;
          m32[p + UC + 1] = 0xffffffff;
        }
      }
      mctx.putImageData(mi, 0, 0);
      // cut those cells out whole, then lay the surround of a pale disc under the holes
      ctx.globalCompositeOperation = "destination-out";
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(mc, 0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = pattern(ctx, spM.frame, P, SM);
      ctx.fillRect(0, 0, W, FTOP);
      ctx.fillStyle = pattern(ctx, spF.frame, FP, SF);
      ctx.fillRect(0, FTOP, W, H - FTOP);
      ctx.globalCompositeOperation = "source-over";
    };

    // ----- the weather field -----
    let instant = true; // while setting up or after a jump: no animation
    let now = 0; // animation clock
    let lagNext = 0;
    let live = true;
    let secOn = false;
    let dayMode = false; // the wall's polarity: pale field and black type
    let dayDen = 0; // share of clear-sky discs showing their pale face, 0..64
    let cloudThr = 999, cloudLo = 0, cloudHi = 0;
    let ux = 1, uy = 0, invStretch = 1, driftU = 0, driftW = 0;
    let fogOn = false, fogTop = FLOOR, fogK = 0, fogMax = 0, fogLevel = 0, fogScroll = 0;
    let frostLevel = 0;
    let sweepPos = 0;
    let starry = false;
    const drift = new Uint8Array(FCOLS); // snow on the floor, in fine rows
    const driftTarget = new Uint8Array(FCOLS);
    const frostOrd = new Uint8Array(N);
    const frostEdge = new Uint8Array(ROWS + FROWS); // frost keeps to the right of the lettering
    const rightmost = new Uint8Array(ROWS + FROWS);

    const startFlip = (i) => {
      if (instant) {
        shown[i] = want[i];
        return;
      }
      if (anim[i]) return;
      anim[i] = 1;
      aIdx[na] = i;
      aStart[na] = now + lagNext + lagOf[i];
      aStage[na] = 255;
      aTo[na] = 255;
      na++;
    };

    const evalCell = (i) => {
      let f;
      const L = lock[i];
      if (L) {
        if (L === L_MOAT) f = dayMode ? BRIGHT : DARK;
        else if (L === L_TEXT) f = dayMode ? DARK : BRIGHT;
        else if (L === L_ACCENT) f = ACCENT;
        else if (L === L_PLATE) f = DARK;
        else f = secOn ? ACCENT : DARK;
      } else {
        const o = ov[i];
        if (o & (O_FLAKE | O_BOLT)) f = SPARK;
        else if (o & O_STRAY) f = starry ? FIELD : dayMode ? DARK : FIELD;
        else if (frostOrd[i] && frostOrd[i] <= frostLevel && cxs[i] > frostEdge[rowG[i]]) f = SPARK;
        else if (i >= N1 && cys[i] >= FROWS - drift[cxs[i]]) f = SPARK;
        else {
          const x = fxs[i];
          const y = fys[i];
          let pale = 0;
          if (!live) {
            pale = dayDen > bay[i] ? 1 : 0;
            let d = (x + y - sweepPos) % 250;
            if (d < 0) d += 250;
            if (d < 5 || (d < 10 && bay[i] > d * 12 - 56)) pale ^= 1;
          } else {
            let dens = dayDen;
            const thr = bay[i];
            if (cloudThr < 300) {
              const u = (x * ux + y * uy) * invStretch - driftU + 8192;
              const w = y * ux - x * uy + driftW + 8192;
              const ui = u | 0;
              const wr = (w & 127) << 7;
              const uf = u - ui;
              const n1 = NZ[wr | (ui & 127)] * (1 - uf) + NZ[wr | ((ui + 1) & 127)] * uf;
              const n2 = NZ[(((w * 2.3 + 40) & 127) << 7) | ((u * 2.3 - driftU * 0.9 + 70) & 127)];
              const dn = (n1 * 3 + n2) * 0.25 - cloudThr;
              if (dn > 0) {
                // the edge ramps inward, so the share of the wall touched is the real cover
                const m = dn > CLOUD_SOFT ? 1 : dn / CLOUD_SOFT;
                // thick and thin patches inside the cloud
                const n3 = NZ[(((w * 1.7 + 150) & 127) << 7) | ((u * 1.7 - driftU * 0.5 + 20) & 127)];
                const cl = cloudLo + (cloudHi - cloudLo) * (n3 / 255);
                dens += (cl - dens) * m;
              }
            }
            if (fogOn) {
              // long horizontal banks drifting with the wind, thin at the top
              // and thick at the floor, with clear lanes between them
              const nz = NZ[(((y * 1.9 + 30) & 127) << 7) | ((x * 0.2 + fogScroll) & 127)];
              const d = (y - fogTop + (nz - 128) * 0.12) * fogK;
              if (d > 0) {
                const bank = nz < 80 ? 0 : nz > 190 ? 1 : (nz - 80) / 110;
                let fm = (d > 1 ? 1 : d) * fogMax * (0.2 + bank * 0.95);
                if (fm > 1) fm = 1;
                dens += (fogLevel - dens) * fm;
              }
            }
            pale = dens > thr ? 1 : 0;
          }
          if (o & O_GUST) pale ^= 1;
          f = pale;
          if (o & O_RAIN) f = dayMode ? DARK : SPARK;
        }
      }
      if (f !== want[i]) {
        want[i] = f;
        startFlip(i);
      }
    };

    // ----- lettering -----
    const bigDigits = rasterDigits(DIG_H, 30, 128);
    const rowShift = new Int8Array(ROWS); // heat shimmer
    // a panel: where its cells start, and its size
    const MAIN = { base: 0, cols: COLS, rows: ROWS };
    const FINE = { base: N1, cols: FCOLS, rows: FROWS };
    const stamp = (g, pn, col, row, val, shifted) => {
      for (let y = 0; y < g.h; y++) {
        const yy = row + y;
        if (yy < 0 || yy >= pn.rows) continue;
        const sh = shifted ? rowShift[yy] : 0;
        for (let x = 0; x < g.w; x++) {
          if (!g.d[y * g.w + x]) continue;
          const xx = col + x + sh;
          if (xx >= 0 && xx < pn.cols) lockNew[pn.base + yy * pn.cols + xx] = val;
        }
      }
    };
    const stampText = (pn, str, col, row, val) => {
      let x = col;
      for (const ch of str) {
        const g = glyphOf(ch);
        stamp(g, pn, x, row, val, false);
        x += g.w + 1;
      }
    };
    const stampDigits = (str, col, row) => {
      let x = col;
      for (const ch of str) {
        const g = bigDigits[ch];
        if (!g) continue;
        stamp(g, MAIN, x, row, L_TEXT, true);
        x += g.w + 3;
      }
    };
    // a solid halo of the opposite face round everything written in rows r0..r1
    const halo = (pn, r0, r1, rad) => {
      r0 = Math.max(0, r0);
      r1 = Math.min(pn.rows - 1, r1);
      const C = pn.cols;
      for (let y = r0; y <= r1; y++) {
        for (let x = 0; x < C; x++) {
          const v = lockNew[pn.base + y * C + x];
          if (v !== L_TEXT) continue;
          for (let dy = -rad; dy <= rad; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= pn.rows) continue;
            for (let dx = -rad; dx <= rad; dx++) {
              if (rad > 1 && (dx === rad || dx === -rad) && (dy === rad || dy === -rad)) continue;
              const xx = x + dx;
              if (xx < 0 || xx >= C) continue;
              const n = pn.base + yy * C + xx;
              if (!lockNew[n]) lockNew[n] = L_MOAT;
            }
          }
        }
      }
    };
    const rect = (pn, c0, r0, c1, r1, val) => {
      for (let y = Math.max(0, r0); y <= Math.min(pn.rows - 1, r1); y++) {
        for (let x = Math.max(0, c0); x <= Math.min(pn.cols - 1, c1); x++) {
          const n = pn.base + y * pn.cols + x;
          if (!lockNew[n]) lockNew[n] = val;
        }
      }
    };

    // what is written, as the sign spells it
    const tx = { hh: "", mm: "", ampm: "", wd: "", md: "", temp: "", c1: "", c2: "" };
    let tempG = null;
    const fine = []; // { str, col, row }
    const raw = { hh: "", mm: "", ampm: "", weekday: "", monthDay: "", temp: "", condition: "", sunLabel: "", sunValue: "", moon: "", aqi: "", uv: "", factLabel: "", factValue: "" };
    const RAW_KEYS = Object.keys(raw);
    const textChanged = (t) => {
      let changed = false;
      for (let k = 0; k < RAW_KEYS.length; k++) {
        const key = RAW_KEYS[k];
        if (t[key] !== raw[key]) {
          raw[key] = t[key];
          changed = true;
        }
      }
      return changed;
    };
    const layoutText = () => {
      tx.hh = raw.hh;
      tx.mm = raw.mm;
      tx.ampm = raw.ampm;
      tx.wd = signText(raw.weekday);
      tx.md = signText(raw.monthDay);
      if (raw.temp !== tx.temp) {
        tx.temp = raw.temp;
        tempG = rasterTemp(raw.temp, TEMP_H);
      }
      const cl = wrapDots(signText(raw.condition), RIGHT - LEFT + 1);
      tx.c1 = cl[0] || "";
      tx.c2 = cl.slice(1).join(" ");
      // the fine module
      fine.length = 0;
      const span = FRIGHT - FLEFT + 1;
      const sun = signText(`${raw.sunLabel} ${raw.sunValue}`);
      let moon = signText(raw.moon);
      const aq = `AQI ${signText(raw.aqi)}`;
      const uv = `UV ${signText(raw.uv)}`;
      const rw = Math.max(textWidth(aq), textWidth(uv));
      const rcol = FRIGHT + 1 - rw;
      if (!moon.includes("MOON") && textWidth(`${moon} MOON`) < rcol - FLEFT - 8) moon += " MOON";
      // small readouts: two lines with AQI and UV in a right-hand column, or three
      const small = [];
      if (textWidth(sun) < rcol - FLEFT - 8 && textWidth(moon) < rcol - FLEFT - 8) {
        small.push([[sun, FLEFT], [aq, rcol]], [[moon, FLEFT], [uv, rcol]]);
      } else {
        small.push([[sun, FLEFT]], [[moon, FLEFT]], [[`${aq}   ${uv}`, FLEFT]]);
      }
      const fl = signText(raw.factLabel);
      let fv = raw.factValue ? wrapDots(signText(raw.factValue), span) : [];
      // even out the lines (no lonely last word) without adding one
      if (fv.length > 1) {
        const n = fv.length;
        let best = fv;
        for (let wdt = span - 4; wdt > span * 0.5; wdt -= 4) {
          const tryL = wrapDots(signText(raw.factValue), wdt);
          if (tryL.length > n) break;
          best = tryL;
        }
        fv = best;
      }
      // rows: 7-dot lines 4 rows apart (24 px), 8 rows (48 px) between the
      // small readouts and the fact, 2 between the fact's label and its text.
      // Only an unusually long fact is set tighter, to keep the bottom margin.
      const last = Math.floor((H - 64 - FTOP) / FP) - 7; // the last row a line may start on
      const top0 = tx.c2 ? 10 : 7; // more air under a condition on two lines
      let pitch = 11, gapS = 8;
      const need = () => top0 + (small.length - 1) * pitch + (fv.length ? 7 + gapS + (fl ? 9 : 0) + (fv.length - 1) * pitch : 0);
      while (need() > last && pitch > 9) pitch--;
      while (need() > last && gapS > 4) gapS--;
      let row = top0;
      for (const l of small) {
        for (const [str, col] of l) fine.push({ str, col, row });
        row += pitch;
      }
      row += gapS + 7 - pitch;
      if (fv.length) {
        if (fl) {
          fine.push({ str: fl, col: FLEFT, row });
          row += 9;
        }
        for (const l of fv) {
          fine.push({ str: l, col: FLEFT, row });
          row += pitch;
        }
      }
    };
    const buildLocks = () => {
      lockNew.fill(0);
      // the time
      stampDigits(tx.hh, LEFT, HOUR_ROW);
      stampDigits(tx.mm, LEFT, MIN_ROW);
      halo(MAIN, HOUR_ROW, MIN_ROW + DIG_H - 1, 2);
      // AM/PM and the seconds disc, on their own small black plate
      const aw = textWidth(tx.ampm);
      const ac = RIGHT + 1 - aw;
      stampText(MAIN, tx.ampm, ac, AMPM_ROW, L_ACCENT);
      const secCol = ac + (aw >> 1);
      lockNew[(AMPM_ROW - 3) * COLS + secCol] = L_SEC;
      rect(MAIN, ac - 1, AMPM_ROW - 4, RIGHT + 1, AMPM_ROW + 7, L_PLATE);
      // date, temperature, condition
      stampText(MAIN, tx.wd, LEFT, DATE_ROW, L_TEXT);
      stampText(MAIN, tx.md, LEFT, DATE_ROW2, L_TEXT);
      if (tempG) stamp(tempG, MAIN, LEFT, TEMP_ROW, L_TEXT, false);
      stampText(MAIN, tx.c1, LEFT, COND_ROW, L_TEXT);
      if (tx.c2) stampText(MAIN, tx.c2, LEFT, COND_ROW2, L_TEXT);
      // a halo of clear sky two discs wide round all the type, so no weather ever touches it
      halo(MAIN, DATE_ROW, ROWS - 1, 2);
      // a condition on two lines reaches the foot of the wall: carry its halo
      // on across the seam into the fine module, so the letters never touch it
      if (tx.c2) {
        for (let x = 0; x < COLS; x++) {
          let near = false;
          for (let dx = -2; dx <= 2 && !near; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < COLS && (lockNew[(ROWS - 1) * COLS + xx] === L_TEXT || lockNew[(ROWS - 2) * COLS + xx] === L_TEXT)) near = true;
          }
          if (near) rect(FINE, x * 2, 0, x * 2 + 1, 3, L_MOAT);
        }
      }
      // the fine module
      for (let k = 0; k < fine.length; k++) stampText(FINE, fine[k].str, fine[k].col, fine[k].row, L_TEXT);
      halo(FINE, 0, FROWS - 1, 2);
      // frost keeps clear of everything written
      for (let g = 0; g < ROWS + FROWS; g++) {
        const pn = g < ROWS ? MAIN : FINE;
        const y = g < ROWS ? g : g - ROWS;
        let x = pn.cols - 1;
        while (x >= 0 && !lockNew[pn.base + y * pn.cols + x]) x--;
        rightmost[g] = x + 1;
      }
      for (let g = 0; g < ROWS + FROWS; g++) {
        const fineRow = g >= ROWS;
        const reach = fineRow ? 6 : 3;
        const lo = fineRow ? ROWS : 0;
        const hi = fineRow ? ROWS + FROWS - 1 : ROWS - 1;
        let far = 0;
        for (let k = Math.max(lo, g - reach); k <= Math.min(hi, g + reach); k++) if (rightmost[k] > far) far = rightmost[k];
        frostEdge[g] = far + (fineRow ? 5 : 2);
      }
    };
    // Reserve the new cells and let go of the old ones. With `scan`, the
    // change runs across the wall column by column, as a sign rewrites itself.
    const applyLocks = (scan) => {
      for (let i = 0; i < N; i++) {
        if (lockNew[i] === lock[i]) continue;
        lock[i] = lockNew[i];
        lagNext = scan ? fxs[i] * 0.011 : 0;
        evalCell(i);
      }
      lagNext = 0;
    };
    // The polarity changed: every reserved disc turns, in one sweep.
    const relock = () => {
      for (let i = 0; i < N; i++) {
        if (!lock[i]) continue;
        lagNext = instant ? 0 : fxs[i] * 0.016 + fys[i] * 0.004;
        evalCell(i);
      }
      lagNext = 0;
    };

    // ----- frost: ferns that grow in from the corners (made on the first frame) -----
    const prepareFrost = () => {
      const fr = rng(seed + 5);
      const markCell = (i, v) => {
        if (!frostOrd[i] || frostOrd[i] > v) frostOrd[i] = v;
      };
      // x, y in wall units; below the wall the fine discs take it, two by two
      const mark = (x, y, o) => {
        const v = clamp(Math.round(o), 1, 255);
        if (y < ROWS) {
          const cx = Math.round(x);
          const cy = Math.round(y);
          if (cx < 0 || cx >= COLS || cy < 0) return;
          markCell(cy * COLS + cx, v);
        } else {
          const cx = Math.round(x * 2);
          const cy = Math.round((y - ROWS) * 2);
          if (cx < 0 || cx >= FCOLS || cy < 0 || cy >= FROWS) return;
          markCell(N1 + cy * FCOLS + cx, v);
        }
      };
      const STEP = 255 / 64;
      // a straight arm with barbs at sixty degrees, shorter toward the tip
      const arm = (x, y, a, len, o, depth) => {
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        for (let s = 0; s < len; s += 0.5) {
          const si = s | 0;
          mark(x + dx * s, y + dy * s, o + s * STEP);
          if (s !== si) continue;
          if (depth === 0 && si > 2 && si % 4 === 0) {
            const bl = Math.min((len - si) * 0.42, si % 8 === 0 ? 11 : 6);
            if (bl >= 2) {
              arm(x + dx * si, y + dy * si, a + TAU / 6, bl, o + si * STEP, 1);
              arm(x + dx * si, y + dy * si, a - TAU / 6, bl, o + si * STEP, 1);
            }
          } else if (depth === 1 && si > 2 && si % 4 === 0 && len - si > 3) {
            mark(x + dx * si + Math.cos(a + TAU / 6), y + dy * si + Math.sin(a + TAU / 6), o + si * STEP + 4);
            mark(x + dx * si + Math.cos(a - TAU / 6), y + dy * si + Math.sin(a - TAU / 6), o + si * STEP + 4);
          }
        }
      };
      const crystal = (x, y, a0, len, o) => {
        for (let k = 0; k < 6; k++) arm(x, y, a0 + (k * TAU) / 6, len * (k % 2 ? 0.8 : 1), o, 0);
      };
      crystal(COLS, FLOOR, 0.55 + fr.range(-0.08, 0.08), 60, 0);
      crystal(COLS, -1, 0.5 + fr.range(-0.08, 0.08), 50, 10);
      crystal(COLS, fr.range(38, 56), fr.range(0, 1), 32, 70);
      crystal(COLS, fr.range(100, 118), fr.range(0, 1), 28, 100);
    };

    
    const gq = new Uint16Array(N);
    const bStart = new Uint16Array(514);
    const bCells = new Uint16Array(N);
    const bFill = new Uint16Array(513);
    let nB = 0;
    let bux = 0, buy = 0; // direction the buckets were built for (0, 0 = not yet)
    const KB = 2;
    const bandHead = new Int16Array(KB);
    const bandG = new Float32Array(KB);
    const bandV = new Float32Array(KB);
    const bandW = new Uint8Array(KB);
    const bandQ = new Uint8Array(KB);
    const bandSx = new Uint8Array(KB);
    const bandSy = new Uint8Array(KB);
    const bandOn = new Uint8Array(KB);
    let bandTimer = 0;
    const buildBuckets = () => {
      for (let i = 0; i < N; i++) {
        if (ov[i] & O_GUST) {
          ov[i] &= ~O_GUST;
          evalCell(i);
        }
      }
      bandOn.fill(0);
      bux = ux;
      buy = uy;
      let mn = 1e9;
      for (let i = 0; i < N; i++) {
        const g = fxs[i] * bux + fys[i] * buy + warp[i];
        if (g < mn) mn = g;
      }
      bStart.fill(0);
      nB = 0;
      for (let i = 0; i < N; i++) {
        const b = Math.min(511, (fxs[i] * bux + fys[i] * buy + warp[i] - mn) | 0);
        gq[i] = b;
        bStart[b + 1]++;
        if (b >= nB) nB = b + 1;
      }
      for (let b = 0; b < 512; b++) bStart[b + 1] += bStart[b];
      for (let b = 0; b < 512; b++) bFill[b] = bStart[b];
      for (let i = 0; i < N; i++) bCells[bFill[gq[i]]++] = i;
    };
    // A band is a soft dithered wave: as it passes, each disc in it turns over
    // (the ones in the middle of the dither first) and then turns back.
    const bandStep = (k) => {
      const head = bandHead[k];
      const BW = bandW[k];
      const Q = bandQ[k];
      const sx = bandSx[k];
      const sy = bandSy[k];
      const step = Math.max(1, (BW / (Q + 1) / 2) | 0);
      // each quarter of the discs (by their dither rank) turns over at its own
      // depth into the band and back at the mirror depth: only those two rows
      // of the band have anything to do
      for (let q = 0; q <= Q; q++) {
        const dOn = q * step;
        const bOn = head - dOn;
        if (bOn >= 0 && bOn < nB) {
          for (let j = bStart[bOn]; j < bStart[bOn + 1]; j++) {
            const i = bCells[j];
            if (bay[i] >> 4 !== q) continue;
            if (NZ[(((fys[i] + sy) & 127) << 7) | ((fxs[i] + sx) & 127)] > 100) {
              ov[i] |= O_GUST;
              evalCell(i);
            }
          }
        }
        const bOff = head - (BW - 1 - dOn);
        if (bOff >= 0 && bOff < nB) {
          for (let j = bStart[bOff]; j < bStart[bOff + 1]; j++) {
            const i = bCells[j];
            if (bay[i] >> 4 !== q || !(ov[i] & O_GUST)) continue;
            ov[i] &= ~O_GUST;
            evalCell(i);
          }
        }
      }
    };
    const spawnBand = (speed, width, quarters) => {
      for (let k = 0; k < KB; k++) {
        if (bandOn[k]) continue;
        bandOn[k] = 1;
        bandG[k] = -1;
        bandHead[k] = -1;
        bandV[k] = speed;
        bandW[k] = width;
        bandQ[k] = quarters;
        bandSx[k] = r.int(0, 255);
        bandSy[k] = r.int(0, 255);
        return;
      }
    };

    // ----- rain: rows are in wall units, and carry on through the fine module -----
    const RMAX = 190;
    const rX = new Float32Array(RMAX), rY = new Float32Array(RMAX), rV = new Float32Array(RMAX), rS = new Float32Array(RMAX);
    const rLen = new Uint8Array(RMAX), rAct = new Uint8Array(RMAX);
    const rHead = new Int16Array(RMAX);
    let rainTarget = 0, rainSlant = 0, rainV0 = 14, rainV1 = 20, rainL0 = 2, rainL1 = 5;
    const spawnRain = (k, atTop) => {
      const span = rainSlant * FLOOR;
      rX[k] = r.range(Math.min(0, -span) - 1, Math.max(COLS, COLS - span) + 1);
      rS[k] = rainSlant + r.range(-0.03, 0.03);
      rV[k] = r.range(rainV0, rainV1);
      rLen[k] = r.int(rainL0, rainL1);
      rY[k] = atTop ? -r.range(0, 30) : r.range(-20, FLOOR);
      rHead[k] = Math.floor(rY[k]) - (atTop ? 0 : rLen[k] + 1);
      rAct[k] = 1;
    };
    const flag = (i, bit, on) => {
      if (on) ov[i] |= bit;
      else ov[i] &= ~bit;
      evalCell(i);
    };
    const rainMark = (k, row, on) => {
      if (row < 0 || row >= FLOOR) return;
      const xf = rX[k] + rS[k] * row;
      if (row < ROWS) {
        const x = Math.round(xf);
        if (x >= 0 && x < COLS) {
          if (!on) ov[row * COLS + x] |= O_DRIP;
          flag(row * COLS + x, O_RAIN, on);
        }
      } else {
        // on the fine discs a streak is a dotted line, every other row
        const x = Math.round(xf * 2);
        const y = (row - ROWS) * 2;
        if (x >= 0 && x < FCOLS) {
          if (!on) ov[N1 + y * FCOLS + x] |= O_DRIP;
          flag(N1 + y * FCOLS + x, O_RAIN, on);
        }
      }
    };

    // ----- snow -----
    const SMAX = 260;
    const sX = new Float32Array(SMAX), sY = new Float32Array(SMAX), sV = new Float32Array(SMAX), sF = new Float32Array(SMAX), sP = new Float32Array(SMAX);
    const sC = new Int32Array(SMAX).fill(-1);
    const sAct = new Uint8Array(SMAX);
    let snowTarget = 0, snowVx = 0, snowFast = 1, driftKey = -1, erodeTimer = 0;
    const spawnFlake = (k, atTop) => {
      sX[k] = r.range(0, COLS);
      sY[k] = atTop ? -r.range(0, 12) : r.range(-4, FLOOR - 4);
      sV[k] = r.range(2.2, 4.6) * snowFast;
      sF[k] = r.range(0.5, 1.3);
      sP[k] = r.range(0, TAU);
      sC[k] = -1;
      sAct[k] = 1;
    };
    const setDriftTarget = (amount) => {
      for (let x = 0; x < FCOLS; x++) {
        const dune = NZ[(37 << 7) | ((x + seed) & 127)] / 255;
        driftTarget[x] = amount > 0 ? Math.min(9, Math.round(2 + amount * 3 + dune * (2 + amount * 4))) : 0;
      }
    };

    // ----- stray discs: a twinkle by day, a few stars on a clear night -----
    const STRAY = 46;
    const stCell = new Uint16Array(STRAY);
    const stOn = new Uint8Array(STRAY);
    const stT = new Float32Array(STRAY);
    for (let k = 0; k < STRAY; k++) {
      stCell[k] = r.int(0, ROWS - 4) * COLS + r.int(1, COLS - 2);
      stT[k] = r.range(0, 8);
    }
    let strayInit = false;

    // ----- lightning: a slow branch, never a flash -----
    const bolt = new Uint16Array(420);
    let boltN = 0, boltT = 99, boltLit = 0, boltGone = 0, boltWait = 5;
    const makeBolt = () => {
      boltN = 0;
      let x = r.int(14, COLS - 14);
      let dir = r.sign();
      const end = r.int(64, 112);
      let fork = r.int(18, 40);
      for (let y = 0; y < end && boltN < 400; y++) {
        if (r.chance(0.3)) dir = -dir;
        if (r.chance(0.72)) x += dir;
        x = clamp(x, 1, COLS - 3);
        bolt[boltN++] = y * COLS + x;
        if (y < end * 0.5) bolt[boltN++] = y * COLS + x + 1;
        if (y === fork) {
          let fx = x;
          const fd = -dir;
          const fl = r.int(10, 22);
          for (let k = 1; k < fl && y + k < ROWS && boltN < 400; k++) {
            if (r.chance(0.8)) fx += fd;
            fx = clamp(fx, 1, COLS - 2);
            bolt[boltN++] = (y + k) * COLS + fx;
          }
          fork += r.int(16, 30);
        }
      }
      boltT = 0;
      boltLit = 0;
      boltGone = 0;
    };

    let sweepPtr = 0;
    let lastSec = -1;
    let heatTimer = 0;
    let heatOn = false;
    const secCell = () => {
      for (let i = AMPM_ROW * COLS - 3 * COLS; i < (AMPM_ROW - 2) * COLS; i++) if (lock[i] === L_SEC) return i;
      return -1;
    };

    // One step of the weather and the clock: decides which discs should show
    // what. Drawing happens afterwards, in frame().
    const advance = (s, t, dt) => {
      now = t;
      const w = s.weather;
      live = w.live;
      const wind = live ? w.wind : 0;
      const gust = live ? w.gust : 0;
      const fall = live ? w.falling : null;
      const inten = w.intensity;

      // lettering
      if (textChanged(s.text)) {
        layoutText();
        buildLocks();
        applyLocks(!instant);
      }
      const sec = s.clock.s;
      if (sec !== lastSec) {
        lastSec = sec;
        secOn = (sec & 1) === 0;
        const sc = secCell();
        if (sc >= 0) evalCell(sc);
      }
      // heat: rows of the numerals slip sideways in slow rising waves
      const heat = live ? smoothstep(86, 98, w.temp) : 0;
      if (heat > 0 || heatOn) {
        heatTimer -= dt;
        if (heatTimer <= 0) {
          heatTimer = 0.22;
          const lim = lerp(0.99, 0.95, heat);
          let changed = false;
          for (let y = HOUR_ROW; y < MIN_ROW + DIG_H; y++) {
            const v = heat > 0 ? Math.sin(y * 0.24 + t * 0.8 + Math.sin(y * 0.05 - t * 0.17) * 1.3) : 0;
            const sh = v > lim ? 1 : 0;
            if (sh !== rowShift[y]) {
              rowShift[y] = sh;
              changed = true;
            }
          }
          heatOn = heat > 0;
          if (changed) {
            buildLocks();
            applyLocks(false);
          }
        }
      }

      // light: how much of the clear sky shows its pale face
      const dl = s.daylight;
      const day = smoothstep(0.16, 0.6, dl);
      dayDen = day * 64;

      // wind
      const toward = ((w.windDir + 180) * Math.PI) / 180;
      ux = Math.sin(toward);
      uy = -Math.cos(toward);
      const stretch = 1 + clamp(wind / 22, 0, 1.5);
      invStretch = 1 / stretch;
      driftU = (driftU + dt * (0.3 + wind * 0.11) * invStretch) % 2560;
      driftW = (driftW + dt * 0.05) % 256;
      if (ux * bux + uy * buy < 0.9975) buildBuckets();

      // fog and haze, from the visibility
      const fogAmt = live ? Math.max(w.fog ? 0.8 : 0, smoothstep(8, 0.2, w.visibility)) : 0;
      fogOn = fogAmt > 0.02;
      fogTop = FLOOR * (1 - 0.95 * fogAmt);
      fogK = 1 / (FLOOR - fogTop + 1);
      fogMax = Math.min(0.97, 0.35 + fogAmt * 0.65);
      fogLevel = lerp(0.44, 0.5, day) * 64;
      fogScroll = (fogScroll + dt * (0.35 + wind * 0.12)) % 256;

      // cloud (in thick fog there is no sky to see). Inside a cloud the share of
      // pale discs is lower than clear sky by day and higher than it by night.
      const cover = live ? clamp(w.cloud / 100) * (1 - fogAmt) : 0;
      cloudThr = cover < 0.03 ? 999 : thrOf[Math.round(cover * 100)] - cover * cover * 40;
      let lo = lerp(0.12, 0.38, day);
      let hi = lerp(0.5, 0.8, day);
      if (fall === "rain" || fall === "drizzle" || fall === "freezing" || fall === "storm") {
        // lighter by day, so the dark streaks show; sparser by night, so the pale ones do
        lo += lerp(-0.04, 0.16, day);
        hi += lerp(-0.08, 0.1, day);
      } else if (fall === "snow") {
        // an even, quiet sky, so the white flakes are what moves
        lo = hi = lerp(0.3, 0.5, day);
      }
      cloudLo = lo * 64;
      cloudHi = hi * 64;

      // polarity: which way round the sign is written
      let ground = day * (1 - cover) + ((lo + hi) / 2) * cover;
      if (fogOn) ground += (fogLevel / 64 - ground) * fogAmt * 0.8;
      const wasDay = dayMode;
      if (instant) dayMode = ground > 0.5;
      else if (!dayMode && ground > 0.53) dayMode = true;
      else if (dayMode && ground < 0.47) dayMode = false;
      if (dayMode !== wasDay) relock();

      // frost
      const frost = live ? smoothstep(30, 0, w.temp) : 0;
      frostLevel = frost > 0 ? Math.round(frost * 250 + 4 * Math.sin(t * 0.21)) : 0;

      // the idle sweep when there is no weather to show
      sweepPos = (s.clock.sf / 60) * 250;

      // wind bands
      if (live) {
        bandTimer -= dt;
        if (bandTimer <= 0) {
          bandTimer = clamp(12 - wind * 0.25, 4.5, 12) * r.range(0.75, 1.25);
          const force = wind * 0.6 + gust * 0.4;
          spawnBand(Math.min(18, 6 + force * 0.42), Math.round(clamp(16 + force * 0.45, 16, 30)), force > 12 ? 1 : 0);
        }
      }
      for (let k = 0; k < KB; k++) {
        if (!bandOn[k]) continue;
        bandG[k] += bandV[k] * dt;
        const g1 = Math.floor(bandG[k]);
        while (bandHead[k] < g1) {
          bandHead[k]++;
          bandStep(k);
        }
        if (bandHead[k] - bandW[k] > nB) bandOn[k] = 0;
      }

      // rain
      const windX = wind * ux;
      if (fall === "drizzle") {
        rainTarget = Math.round(30 + inten * 120);
        rainV0 = 6; rainV1 = 9; rainL0 = 1; rainL1 = 1;
      } else if (fall === "rain" || fall === "freezing") {
        rainTarget = Math.round(30 + inten * 110);
        rainV0 = 11; rainV1 = 16; rainL0 = 3; rainL1 = 6;
      } else if (fall === "storm") {
        rainTarget = Math.round(45 + inten * 85);
        rainV0 = 14; rainV1 = 20; rainL0 = 4; rainL1 = 8;
      } else rainTarget = 0;
      rainSlant = clamp(windX * 0.028, -0.8, 0.8);
      for (let k = 0; k < RMAX; k++) {
        if (!rAct[k]) {
          if (k < rainTarget) spawnRain(k, !instant);
          else continue;
        }
        rY[k] += rV[k] * dt;
        const nh = Math.floor(rY[k]);
        let h = rHead[k];
        if (nh > h) {
          const len = rLen[k];
          while (h < nh) {
            h++;
            rainMark(k, h, true);
            rainMark(k, h - len, false);
          }
          rHead[k] = h;
          if (h - len >= FLOOR) {
            if (k < rainTarget) spawnRain(k, true);
            else rAct[k] = 0;
          }
        }
      }

      // snow
      const snowing = fall === "snow";
      snowTarget = snowing ? Math.round(50 + inten * 110) : 0;
      snowVx = clamp(windX * 0.15, -4.5, 4.5);
      snowFast = 1 + clamp(wind / 40, 0, 0.7);
      const dk = snowing ? Math.round(inten * 12) : -1;
      if (dk !== driftKey) {
        driftKey = dk;
        setDriftTarget(snowing ? inten : 0);
        if (instant) {
          for (let x = 0; x < FCOLS; x++) drift[x] = Math.max(0, driftTarget[x] - (r.chance(0.35) ? 1 : 0));
        }
      }
      for (let k = 0; k < SMAX; k++) {
        if (!sAct[k]) {
          if (k < snowTarget) spawnFlake(k, !instant);
          else continue;
        }
        sY[k] += sV[k] * dt;
        let x = sX[k] + (snowVx + Math.sin(t * sF[k] + sP[k]) * 0.7) * dt;
        if (x < 0) x += COLS;
        else if (x >= COLS) x -= COLS;
        sX[k] = x;
        const y = sY[k];
        let ci = -1;
        let fcx = 0, fcy = 0;
        if (y >= ROWS) {
          fcx = Math.min(FCOLS - 1, (x * 2) | 0);
          fcy = ((y - ROWS) * 2) | 0;
          ci = N1 + Math.min(FROWS - 1, fcy) * FCOLS + fcx;
        } else if (y >= 0) ci = (y | 0) * COLS + (x | 0);
        if (ci === sC[k]) continue;
        const old = sC[k];
        if (old >= 0) flag(old, O_FLAKE, false);
        if (y >= ROWS && fcy >= FROWS - 1 - drift[fcx]) {
          // landed: settle on the lowest of the three columns below
          let lx = fcx;
          if (fcx > 0 && drift[fcx - 1] < drift[lx]) lx = fcx - 1;
          if (fcx < FCOLS - 1 && drift[fcx + 1] < drift[lx]) lx = fcx + 1;
          if (drift[lx] < driftTarget[lx]) {
            drift[lx]++;
            evalCell(N1 + (FROWS - drift[lx]) * FCOLS + lx);
          }
          sC[k] = -1;
          if (k < snowTarget) spawnFlake(k, true);
          else sAct[k] = 0;
          continue;
        }
        sC[k] = ci;
        if (ci >= 0) flag(ci, O_FLAKE, true);
      }
      // the wind takes the drift away again, a disc at a time
      erodeTimer -= dt;
      while (erodeTimer <= 0) {
        erodeTimer += snowing ? 0.3 : 0.05;
        const x = r.int(0, FCOLS - 1);
        if (drift[x] > 0 && drift[x] >= driftTarget[x]) {
          const i = N1 + (FROWS - drift[x]) * FCOLS + x;
          drift[x]--;
          evalCell(i);
        }
        if (dt === 0) break;
      }

      // stray discs
      const clearSky = live ? 1 - cover : 0;
      const night = dl < 0.3;
      starry = night;
      const allowed = clearSky < 0.25 || fogAmt > 0.4 ? 0 : Math.round(STRAY * clearSky * (night ? 0.9 : 0.45));
      for (let k = 0; k < STRAY; k++) {
        if (!strayInit) {
          stOn[k] = night && k < allowed && r.chance(0.9) ? 1 : 0;
          stT[k] = stOn[k] ? r.range(4, 90) : r.range(0, night ? 10 : 30);
          if (stOn[k]) flag(stCell[k], O_STRAY, true);
          continue;
        }
        stT[k] -= dt;
        if (stT[k] > 0 && !(stOn[k] && k >= allowed)) continue;
        if (stOn[k]) {
          stOn[k] = 0;
          stT[k] = night ? r.range(2, 7) : r.range(8, 34);
          flag(stCell[k], O_STRAY, false);
        } else {
          if (k >= allowed) {
            stT[k] = 5;
            continue;
          }
          stOn[k] = 1;
          stT[k] = night ? r.range(25, 110) : r.range(1.2, 2.8);
          flag(stCell[k], O_STRAY, true);
        }
      }
      strayInit = true;

      // lightning
      if (fall === "storm" || boltT < 4) {
        if (boltT > 3.6) {
          boltWait -= dt;
          if (boltWait <= 0 && fall === "storm") {
            boltWait = r.range(9, 17);
            makeBolt();
          }
        }
        if (boltT <= 3.6) {
          boltT += dt;
          const lit = Math.min(boltN, Math.floor(boltN * clamp(boltT / 0.45)));
          while (boltLit < lit) flag(bolt[boltLit++], O_BOLT, true);
          const gone = Math.min(boltN, Math.floor(boltN * clamp((boltT - 1.1) / 2.3)));
          while (boltGone < gone) flag(bolt[boltGone++], O_BOLT, false);
        }
      }

      // every disc re-reads the weather in turn
      let count = Math.min(N, Math.ceil((N * dt) / SWEEP));
      while (count-- > 0) {
        evalCell(perm[sweepPtr]);
        if (++sweepPtr >= N) sweepPtr = 0;
      }
    };

    // Go straight to the state of the wall for `s`, with nothing turning.
    const settle = (s, t) => {
      instant = true;
      updatePalette(s, 0, true);
      advance(s, t, 0);
      for (let i = 0; i < N; i++) evalCell(i);
      for (let k = 0; k < na; k++) anim[aIdx[k]] = 0;
      na = 0;
      shown.set(want);
      renderAll();
      instant = false;
    };

    // ----- set up: the field is made on the first frame and the wall built,
    // complete, on the second. (Splitting the work of arriving into three
    // short stalls rather than one long one: the runner gives a piece unseen
    // frames before it is cut to, and the previous piece keeps moving.)
    let stage = 0;
    let lastMs = state.ms;

    return {
      frame(s) {
        const t = s.t;
        const dt = s.dt;
        if (stage < 2) {
          if (stage++ === 0) {
            prepareField();
            prepareFrost();
          } else settle(s, t);
          lastMs = s.ms;
          return;
        }
        // the clock jumped (fast gallery, test steps, a wake from sleep)
        if (Math.abs(s.ms - lastMs - dt * 1000) > 5000) {
          lastMs = s.ms;
          settle(s, t);
          return;
        }
        lastMs = s.ms;
        updatePalette(s, dt, false);
        advance(s, t, dt);

        // turn the discs that are turning
        for (let k = 0; k < na; ) {
          const i = aIdx[k];
          const p = (t - aStart[k]) / FLIP;
          if (p < 0) {
            k++;
            continue;
          }
          let to = aTo[k];
          if (to === 255) {
            to = want[i];
            if (to === shown[i]) {
              anim[i] = 0;
              na--;
              aIdx[k] = aIdx[na]; aStart[k] = aStart[na]; aStage[k] = aStage[na]; aTo[k] = aTo[na]; aQuick[k] = aQuick[na];
              continue;
            }
            aTo[k] = to;
            // rain ticks straight over (it is gone again in a moment); gusts and
            // flakes, and everything when the wall is busy, skip the half-open step
            const drip = ov[i] & (O_RAIN | O_DRIP);
            ov[i] &= ~O_DRIP;
            aQuick[k] = drip ? 2 : na > BUSY || ov[i] & (O_GUST | O_FLAKE) ? 1 : 0;
          }
          // edge on, half open, open (when the wall is busy the middle step is dropped)
          const stage = aQuick[k] === 2 || p >= 0.7 ? 3 : p < 0.36 ? 1 : 2;
          const was = aStage[k];
          if (stage !== was) {
            if (was === 255) {
              if (to) setTone(i, to);
              if ((to || !aQuick[k]) && aQuick[k] !== 2) qDark(i, SP_EDGE);
            }
            if (stage === 2 && !aQuick[k]) {
              if (to) qCut(i, SP_PALE_HALF);
              else qDark(i, SP_DARK_HALF);
            } else if (stage === 3) {
              if (to) {
                if (!(aQuick[k] === 2 && shown[i])) qCut(i, SP_PALE);
              } else qDark(i, SP_DARK);
            }
            aStage[k] = stage;
          }
          if (stage === 3) {
            shown[i] = to;
            if (want[i] !== to) {
              aStart[k] = t;
              aStage[k] = 255;
              aTo[k] = 255;
              k++;
            } else {
              anim[i] = 0;
              na--;
              aIdx[k] = aIdx[na]; aStart[k] = aStart[na]; aStage[k] = aStage[na]; aTo[k] = aTo[na]; aQuick[k] = aQuick[na];
            }
            continue;
          }
          k++;
        }
        // paint them: every opaque tile first, then every hole, so the canvas
        // changes mode twice a frame rather than at every disc (a disc's own
        // steps within one frame are always opaque before hole)
        if (nQD) {
          cut(false);
          for (let q = 0; q < nQD; q++) blit(qdI[q], qdS[q]);
          nQD = 0;
        }
        if (nQC) {
          cut(true);
          for (let q = 0; q < nQC; q++) blit(qcI[q], qcS[q]);
          nQC = 0;
        }
        cut(false);
        if (uDirty) {
          uDirty = false;
          under.ctx.putImageData(img, 0, 0);
        }
      },
    };
  },
};

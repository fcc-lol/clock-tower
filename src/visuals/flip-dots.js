// Flip Dots
//
// A wall of 12,060 electromechanical flip-discs (90 x 134 on a 12 px pitch), the
// kind bus destination signs are made of, with a small enamel plate under it.
// Every disc has a dark face and a pale face. The time is written in giant
// dot numerals (hour over minutes); the date, temperature and condition are
// written under it in dot-matrix type. Everything else on the wall is the
// weather, physically passing through the discs as texture:
//
//   cloud   drifting dithered blobs of flipped discs. The share of the wall
//           they cover is the real cloud cover; they travel with the real wind
//           (the wall is a map: west is left, north is up) and stretch along it
//           when it blows hard.
//   wind    broken bands of discs that flip and flip back, sweeping downwind.
//           More wind: more bands, faster.
//   rain    streaks of inverted discs falling at the wind's slant, as many as
//           it is raining hard. Drizzle is single ticking discs. A storm
//           sometimes lays a slow jagged branch and unpicks it.
//   snow    single white discs wandering down and settling into a drift on
//           the bottom rows, which the wind keeps eroding.
//   fog     an ordered-dither haze rising from the floor; the worse the
//           visibility the higher it climbs.
//   cold    frost ferns grow in from the corners below about 30 F.
//   heat    above about 86 F the numerals shimmer: rows slip one disc sideways
//           in slow rising waves.
//   sky     the pale faces take the colour measured from the tower, west on
//           the left columns to east on the right. Weather discs show that
//           colour itself; the numerals and lettering show it lifted to white.
//           Even the dark faces catch a little of it by day. Everything dims
//           with the daylight, so the wall is dark at night.
//   no data the weather field is left empty except for one slow diagonal
//           sweep a minute.
//
// One accent colour (the fluorescent yellow-green of old signs) is used only
// for AM/PM and for the single disc under the minutes that flips every second.
//
// How it is drawn: the wall is a canvas that is painted once and then left
// alone. Only discs that are in the middle of a flip are redrawn. A pale face
// is a hole in that canvas; the colour seen through it comes from a tiny
// 90 x 160 canvas underneath (one pixel per disc), so the whole wall can change
// colour with the sky and the daylight without redrawing a single disc.

import { TAU, clamp, lerp, smoothstep, rng, mix, toOklch, oklch, parse, el, addStyle, canvas2d, pixelCanvas, mask, grain } from "../lib/kit.js";

const P = 12; // pitch, stage px
const COLS = 90;
const ROWS = 134;
const N = COLS * ROWS;
const WALL_H = ROWS * P; // 1608; the plate takes the rest

// faces a disc can show
const DARK = 0, FIELD = 1, BRIGHT = 2, ACCENT = 3;
// what a cell is reserved for
const L_MOAT = 1, L_TEXT = 2, L_ACCENT = 3, L_SEC = 4;
// weather overlays (bit flags)
const O_RAIN = 1, O_FLAKE = 2, O_GUST = 4, O_BOLT = 8, O_STRAY = 16;
// sprites
const SP_DARK = 0, SP_DARK_HALF = 1, SP_EDGE = 2, SP_PALE_HALF = 3, SP_PALE = 4;

const FLIP = 0.19;
const BUSY = 260; // more discs than this turning at once: they skip the half-open step // seconds a disc takes to turn over
const SWEEP = 0.7;
const CLOUD_SOFT = 34; // half-width of a cloud's dithered edge, in noise levels // every disc re-reads the weather this often (staggered)

// layout, in discs
const LEFT = 6, RIGHT = 83; // text columns (72 px margins)
const DIG_H = 32;
const HOUR_ROW = 6, MIN_ROW = 42;
const AMPM_ROW = MIN_ROW + DIG_H - 7;
const SEC_ROW = 76;
const DATE_ROW = 79, DATE_ROW2 = 88;
const TEMP_ROW = 99, TEMP_H = 14;
const COND_ROW = 116, COND_ROW2 = 125;

const LAMP = oklch(0.67, 0.05, 78);
const NUM_FONT = '"Archivo Black", "Arial Black", sans-serif';

const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];

// A 5 x 7 dot-matrix face (some characters are narrower).
const F57 = {
  A: "01110 10001 10001 11111 10001 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110", C: "01110 10001 10000 10000 10000 10001 01110",
  D: "11110 10001 10001 10001 10001 10001 11110", E: "11111 10000 10000 11110 10000 10000 11111", F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01110 10001 10000 10111 10001 10001 01110", H: "10001 10001 10001 11111 10001 10001 10001", I: "111 010 010 010 010 010 111",
  J: "00111 00010 00010 00010 00010 10010 01100", K: "10001 10010 10100 11000 10100 10010 10001", L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10101 10001 10001 10001", N: "10001 11001 11001 10101 10011 10011 10001", O: "01110 10001 10001 10001 10001 10001 01110",
  P: "11110 10001 10001 11110 10000 10000 10000", Q: "01110 10001 10001 10001 10101 10010 01101", R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01110 10001 10000 01110 00001 10001 01110", T: "11111 00100 00100 00100 00100 00100 00100", U: "10001 10001 10001 10001 10001 10001 01110",
  V: "10001 10001 10001 10001 10001 01010 00100", W: "10001 10001 10001 10101 10101 11011 10001", X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 01010 00100 00100 00100 00100", Z: "11111 00001 00010 00100 01000 10000 11111",
  0: "01110 10001 10001 10001 10001 10001 01110", 1: "010 110 010 010 010 010 111", 2: "01110 10001 00001 00110 01000 10000 11111",
  3: "01110 10001 00001 00110 00001 10001 01110", 4: "00010 00110 01010 10010 11111 00010 00010", 5: "11111 10000 11110 00001 00001 10001 01110",
  6: "01110 10000 10000 11110 10001 10001 01110", 7: "11111 00001 00010 00100 00100 01000 01000", 8: "01110 10001 10001 01110 10001 10001 01110",
  9: "01110 10001 10001 01111 00001 00001 01110",
  ",": "00 00 00 00 00 01 10", ".": "0 0 0 0 0 0 1", "-": "000 000 000 111 000 000 000", "–": "0000 0000 0000 1111 0000 0000 0000",
  "'": "1 1 0 0 0 0 0", "/": "001 001 010 010 010 100 100", "°": "010 101 010 000 000 000 000", " ": "000 000 000 000 000 000 000",
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

// The temperature is the same face doubled, with its diagonals smoothed (the
// "scale2x" rule), so it reads as the sign's double-height bold.
const BIG = {};
for (const ch of "0123456789-–°") {
  const g = GLYPH[ch];
  const at = (x, y) => (x < 0 || y < 0 || x >= g.w || y >= 7 ? 0 : g.d[y * g.w + x]);
  const w = g.w * 2;
  const d = new Uint8Array(w * 14);
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < g.w; x++) {
      const p = at(x, y), a = at(x, y - 1), b = at(x + 1, y), c = at(x - 1, y), e = at(x, y + 1);
      d[y * 2 * w + x * 2] = c === a && c !== e && a !== b ? a : p;
      d[y * 2 * w + x * 2 + 1] = a === b && a !== c && b !== e ? b : p;
      d[(y * 2 + 1) * w + x * 2] = e === c && e !== b && c !== a ? c : p;
      d[(y * 2 + 1) * w + x * 2 + 1] = b === e && b !== a && e !== c ? e : p;
    }
  }
  BIG[ch] = { w, h: 14, d };
}
BIG["−"] = BIG["-"];

// Numerals from a heavy grotesque, thresholded onto the grid.
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

// A tileable 256 x 256 field of smooth noise, equalised so every value 0..255
// is equally common (a threshold then cuts off a known share of it).
function makeNoise(seed) {
  const r = rng(seed);
  const f = new Float32Array(65536);
  for (const [g, amp] of [[6, 0.56], [13, 0.28], [27, 0.16]]) {
    const lat = new Float32Array(g * g);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let y = 0; y < 256; y++) {
      const fy = (y * g) / 256;
      const y0 = Math.floor(fy);
      let ty = fy - y0;
      ty = ty * ty * (3 - 2 * ty);
      const ya = (y0 % g) * g;
      const yb = ((y0 + 1) % g) * g;
      for (let x = 0; x < 256; x++) {
        const fx = (x * g) / 256;
        const x0 = Math.floor(fx);
        let tx = fx - x0;
        tx = tx * tx * (3 - 2 * tx);
        const xa = x0 % g;
        const xb = (x0 + 1) % g;
        const top = lat[ya + xa] + (lat[ya + xb] - lat[ya + xa]) * tx;
        const bot = lat[yb + xa] + (lat[yb + xb] - lat[yb + xa]) * tx;
        f[y * 256 + x] += amp * (top + (bot - top) * ty);
      }
    }
  }
  const order = new Uint32Array(65536);
  for (let i = 0; i < 65536; i++) order[i] = i;
  order.sort((a, b) => f[a] - f[b]);
  const out = new Uint8Array(65536);
  for (let k = 0; k < 65536; k++) out[order[k]] = k >> 8;
  return out;
}

// The pictures a disc is drawn from. Three are opaque tiles: the dark face
// (slightly see-through, so it picks up a trace of the light behind), the dark
// face half turned, and the disc edge on. Two are masks that are cut out of
// whatever is there, opening a hole for the pale face half turned and fully
// shown; where a mask is weaker a little of the dark stays, which shades the
// face and leaves the two pivots.
function makeSprites(ratio) {
  const S = Math.max(3, Math.round(P * ratio));
  const c = document.createElement("canvas");
  c.width = S * 5;
  c.height = S;
  const g = c.getContext("2d");
  const u = S / P;
  const R = 5.25 * u;
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
      g.fillStyle = "#121314";
      g.fillRect(0, 0, S, S);
      g.fillStyle = "#08090a"; // the recess the disc sits in
      g.beginPath();
      g.arc(cx, cy, R + 0.5 * u, 0, TAU);
      g.fill();
      face();
      if (k === SP_EDGE) {
        g.fillStyle = "#34373b";
        g.fill();
      } else {
        if (k === SP_DARK) {
          g.globalCompositeOperation = "destination-out";
          g.fillStyle = "#000";
          g.fill();
          g.globalCompositeOperation = "source-over";
        }
        g.fillStyle = k === SP_DARK ? "rgba(21,22,24,0.86)" : "#111214";
        g.fill();
        shade.addColorStop(0, "rgba(255,255,255,0.07)");
        shade.addColorStop(0.5, "rgba(255,255,255,0)");
        shade.addColorStop(1, "rgba(0,0,0,0.25)");
        g.fillStyle = shade;
        g.fill();
      }
    } else {
      const top = k === SP_PALE ? 1 : 0.78;
      shade.addColorStop(0, `rgba(0,0,0,${top})`);
      shade.addColorStop(0.5, `rgba(0,0,0,${top})`);
      shade.addColorStop(1, `rgba(0,0,0,${top - 0.24})`);
      face();
      g.fillStyle = shade;
      g.fill();
    }
    if (k === SP_DARK || k === SP_PALE) {
      // the two pivots on the diagonal
      const o = R * 0.72;
      g.beginPath();
      g.arc(cx + o, cy - o, 0.75 * u, 0, TAU);
      g.arc(cx - o, cy + o, 0.75 * u, 0, TAU);
      if (k === SP_PALE) g.globalCompositeOperation = "destination-out";
      g.fillStyle = "#0c0d0e";
      g.fill();
    }
    g.restore();
  }
  return { canvas: c, S };
}

const DBG = { draws: 0, evals: 0, sum: 0, max: 0, n: 0, builds: 0 };
const CSS = `
.fd { position: absolute; inset: 0; background: #0a0b0c; overflow: hidden; }
.fd-plate { position: absolute; left: 0; top: ${WALL_H}px; width: 1080px; height: ${1920 - WALL_H}px; z-index: 5;
  background: linear-gradient(180deg, #18191b 0px, #111213 12px, #0d0e0f 100%); box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 -1px 0 #000;
  font-family: "Barlow Condensed", "Arial Narrow", sans-serif; color: var(--ink, #e9e6dd); }
.fd-box { position: absolute; left: 48px; right: 48px; top: 26px; bottom: 46px; border: 1.5px solid var(--rule, #48494b); border-radius: 9px; display: flex; flex-direction: column; }
.fd-row { display: grid; grid-template-columns: 216px 1fr 222px 172px; height: 94px; flex: none; }
.fd-cell { padding: 9px 0 0 22.5px; border-left: 1.5px solid var(--rule, #48494b); }
.fd-cell:first-child { border-left: 0; }
.fd-k { font-weight: 600; font-size: 24px; line-height: 28px; letter-spacing: 0.11em; text-transform: uppercase; color: var(--ink2, #a8a59d); white-space: nowrap; }
.fd-v { font-weight: 500; font-size: 44px; line-height: 46px; letter-spacing: 0.01em; white-space: nowrap; }
.fd-fact { flex: 1; border-top: 1.5px solid var(--rule, #48494b); padding: 10px 22.5px 0; }
.fd-fact .fd-v { white-space: normal; font-size: 40px; line-height: 44px; text-wrap: pretty; }
.fd-plate.short .fd-fact .fd-v { font-size: 60px; line-height: 66px; letter-spacing: 0; }
.fd-plate.long .fd-row { height: 88px; }
.fd-plate.long .fd-cell { padding-top: 6px; }
.fd-plate.long .fd-fact { padding-top: 4px; }
.fd-plate.long .fd-fact .fd-k { line-height: 26px; }
.fd-plate.long .fd-fact .fd-v { font-size: 36px; line-height: 38px; }
.fd-plate.nofact .fd-fact { display: none; }
.fd-plate.nofact .fd-box { top: 62px; bottom: 64px; }
.fd-plate.nofact .fd-row { height: 100%; }
.fd-plate.nofact .fd-cell { padding-top: 40px; }
.fd-plate.nofact .fd-v { font-size: 52px; line-height: 58px; }
`;

export default {
  title: "Flip Dots",
  description: "A wall of twelve thousand flip-discs: the time in giant dot numerals, and the real weather passing through the discs around them.",
  fonts: ["Archivo Black", "Barlow Condensed:wght@500;600"],
  fps: 30,

  mount(root, { state, seed }) {
    addStyle(root, CSS);
    const wrap = el("div", { class: "fd" });
    root.append(wrap);
    const under = pixelCanvas(wrap, { size: P, alpha: false });
    const top = canvas2d(wrap, { maxScale: 2 });
    const ctx = top.ctx;

    // ----- the plate -----
    const cell = (label) => {
      const k = el("div", { class: "fd-k", text: label });
      const v = el("div", { class: "fd-v" });
      return { k, v, node: el("div", { class: "fd-cell" }, k, v) };
    };
    const cSun = cell("");
    const cMoon = cell("Moon");
    const cAir = cell("Air quality");
    const cUv = cell("UV index");
    const factK = el("div", { class: "fd-k" });
    const factV = el("div", { class: "fd-v" });
    const plate = el("div", { class: "fd-plate" }, el("div", { class: "fd-box" }, el("div", { class: "fd-row" }, cSun.node, cMoon.node, cAir.node, cUv.node), el("div", { class: "fd-fact" }, factK, factV)));
    wrap.append(plate);
    grain(wrap, { opacity: 0.04 });

    const shown_ = {};
    const put = (key, node, value) => {
      if (shown_[key] === value) return false;
      shown_[key] = value;
      node.textContent = value;
      return true;
    };

    // ----- per-disc data -----
    const r = rng(seed);
    const NZ = makeNoise(seed + 11);
    const cxs = new Uint8Array(N);
    const cys = new Uint8Array(N);
    const bay = new Uint8Array(N); // 0..63
        const lagOf = new Float32Array(N); // every disc is a little late; a few are sticky
    const warp = new Float32Array(N); // bends the wind bands
    const perm = new Uint16Array(N);
    for (let i = 0; i < N; i++) {
      const x = i % COLS;
      const y = (i / COLS) | 0;
      cxs[i] = x;
      cys[i] = y;
      bay[i] = BAYER[(y & 7) * 8 + (x & 7)];
      lagOf[i] = r() < 0.02 ? r.range(0.3, 0.45) : r() * 0.05;
      warp[i] = (NZ[(((y * 0.6) & 255) << 8) | ((x * 0.6 + 90) & 255)] - 128) * 0.11;
      perm[i] = i;
    }
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const tmp = perm[i];
      perm[i] = perm[j];
      perm[j] = tmp;
    }

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
    {
      const hist = new Uint32Array(256);
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const n1 = NZ[(y << 8) | x];
          const n2 = NZ[(((y * 2.3 + 40) & 255) << 8) | ((x * 2.3 + 70) & 255)];
          hist[(n1 * 3 + n2) >> 2]++;
        }
      }
      let acc = 0;
      let v = 255;
      for (let p = 1; p <= 100; p++) {
        while (v > 0 && acc + hist[v] <= (p / 100) * 65536) acc += hist[v--];
        thrOf[p] = v;
      }
      thrOf[0] = 999;
    }

    // ----- colours -----
    const img = under.ctx.createImageData(under.cols, under.rows);
    const u32 = new Uint32Array(img.data.buffer);
    u32.fill(0xff000000);
    const palF = new Uint32Array(COLS);
    const palB = new Uint32Array(COLS);
    let palA = 0xff000000;
    const palCur = new Float32Array(27); // 4 stops x (field rgb, bright rgb) + accent rgb
    const palTgt = new Float32Array(27);
    let palMoving = true;
    let uDirty = true;
    const sk = { w: "", nw: "", ne: "", e: "", dl: -1 };
    const stopTone = (hex, dl, o) => {
      const c = toOklch(hex);
      const fl = clamp(c.l, lerp(0.31, 0.42, dl), lerp(0.37, 0.57, dl));
      const fc = Math.min(c.c * lerp(0.85, 1.2, dl), 0.15);
      const f = parse(oklch(fl, fc, c.h));
      // by day the white faces carry a breath of the sky; at night they are lamp-lit, warm and dim
      const b = parse(mix(LAMP, oklch(0.95, Math.min(fc * 0.4, 0.045), c.h), Math.pow(dl, 0.6)));
      palTgt[o] = f[0]; palTgt[o + 1] = f[1]; palTgt[o + 2] = f[2];
      palTgt[o + 3] = b[0]; palTgt[o + 4] = b[1]; palTgt[o + 5] = b[2];
    };
    const packPalette = () => {
      for (let x = 0; x < COLS; x++) {
        const f = (x / (COLS - 1)) * 3;
        const a = Math.min(2, f | 0);
        const t = f - a;
        const o = a * 6;
        const mixc = (k) => Math.round(palCur[o + k] + (palCur[o + 6 + k] - palCur[o + k]) * t);
        palF[x] = 0xff000000 | (mixc(2) << 16) | (mixc(1) << 8) | mixc(0);
        palB[x] = 0xff000000 | (mixc(5) << 16) | (mixc(4) << 8) | mixc(3);
      }
      palA = 0xff000000 | (Math.round(palCur[26]) << 16) | (Math.round(palCur[25]) << 8) | Math.round(palCur[24]);
      for (let i = 0; i < N; i++) {
        const tn = tone[i];
        u32[i] = tn === 0 ? palF[cxs[i]] : tn === 1 ? palB[cxs[i]] : palA;
      }
      uDirty = true;
    };
    const updatePalette = (s, dt, snap) => {
      const dlq = Math.round(s.daylight * 250);
      const sky = s.sky;
      if (sky.west !== sk.w || sky.northWest !== sk.nw || sky.northEast !== sk.ne || sky.east !== sk.e || dlq !== sk.dl) {
        sk.w = sky.west; sk.nw = sky.northWest; sk.ne = sky.northEast; sk.e = sky.east; sk.dl = dlq;
        const dl = dlq / 250;
        stopTone(sky.west, dl, 0);
        stopTone(sky.northWest, dl, 6);
        stopTone(sky.northEast, dl, 12);
        stopTone(sky.east, dl, 18);
        const a = parse(oklch(lerp(0.66, 0.9, dl), lerp(0.15, 0.2, dl), 118));
        palTgt[24] = a[0]; palTgt[25] = a[1]; palTgt[26] = a[2];
        palMoving = true;
        const ink = mix("#99958b", "#ebe8df", dl);
        const ink2 = mix("#86837b", "#a9a69e", dl);
        wrap.style.setProperty("--ink", ink);
        wrap.style.setProperty("--ink2", ink2);
        wrap.style.setProperty("--rule", mix("#343537", "#4c4d50", dl));
      }
      if (!palMoving) return;
      const k = snap ? 1 : 1 - Math.pow(0.5, dt / 1.2);
      let far = 0;
      for (let i = 0; i < 27; i++) {
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
    const sprites = makeSprites(top.ratio);
    const SS = sprites.S;
    const sheet = sprites.canvas;
    let cutting = false;
    const cut = (on) => {
      if (on === cutting) return;
      cutting = on;
      ctx.globalCompositeOperation = on ? "destination-out" : "source-over";
    };
    // an opaque tile, or (cut) a hole through what is there
    const blit = (i, sp) => {
      DBG.draws++;
      ctx.drawImage(sheet, sp * SS, 0, SS, SS, cxs[i] * P, cys[i] * P, P, P);
    };
    const drawDark = (i) => {
      DBG.draws += 2;
      const x = cxs[i] * P;
      const y = cys[i] * P;
      cut(false);
      ctx.clearRect(x, y, P, P);
      ctx.drawImage(sheet, 0, 0, SS, SS, x, y, P, P);
    };
    const setTone = (i, face) => {
      const tn = face === BRIGHT ? 1 : face === ACCENT ? 2 : 0;
      if (tone[i] === tn) return;
      tone[i] = tn;
      u32[i] = tn === 0 ? palF[cxs[i]] : tn === 1 ? palB[cxs[i]] : palA;
      uDirty = true;
    };

    // ----- the weather field -----
    let instant = true; // while setting up: no animation
    let now = 0; // animation clock
    let lagNext = 0;
    let live = true;
    let secOn = false;
    let cloudThr = 999;
    let ux = 1, uy = 0, invStretch = 1, driftU = 0, driftW = 0;
    let fogOn = false, fogTop = ROWS, fogK = 0, fogMax = 0, fogScroll = 0;
    let frostLevel = 0;
    let sweepPos = 0;
    let starry = false;
    const drift = new Uint8Array(COLS);
    const driftTarget = new Uint8Array(COLS);
    const frostOrd = new Uint8Array(N);
    const frostEdge = new Uint8Array(ROWS); // frost keeps to the right of the lettering

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
      if (L) f = L === L_MOAT ? DARK : L === L_TEXT ? BRIGHT : L === L_ACCENT ? ACCENT : secOn ? ACCENT : DARK;
      else {
        const o = ov[i];
        const x = cxs[i];
        const y = cys[i];
        if (o & (O_FLAKE | O_BOLT)) f = BRIGHT;
        else if (o & O_STRAY) f = starry ? BRIGHT : FIELD;
        else if (frostOrd[i] && frostOrd[i] <= frostLevel && x > frostEdge[y]) f = BRIGHT;
        else if (y >= ROWS - drift[x]) f = BRIGHT;
        else {
          let pale = 0;
          if (!live) {
            let d = (x + y - sweepPos) % 250;
            if (d < 0) d += 250;
            if (d < 5 || (d < 10 && bay[i] > d * 12 - 56)) pale = 1;
          } else {
            if (cloudThr < 300) {
              const u = (x * ux + y * uy) * invStretch - driftU + 8192;
              const w = y * ux - x * uy + driftW + 8192;
              const wr = (w & 255) << 8;
              const uf = u - (u | 0);
              const n1 = NZ[wr | (u & 255)] * (1 - uf) + NZ[wr | ((u + 1) & 255)] * uf;
              const n2 = NZ[(((w * 2.3 + 40) & 255) << 8) | ((u * 2.3 - driftU * 0.9 + 70) & 255)];
              const dn = (n1 * 3 + n2) * 0.25 - cloudThr + CLOUD_SOFT;
              if (dn > 0) {
                // soft dithered edges, and thinner patches inside the cloud
                let dens = dn * (32 / CLOUD_SOFT);
                if (dens > 64) dens = 64;
                const n3 = NZ[(((w * 1.7 + 150) & 255) << 8) | ((u * 1.7 - driftU * 0.5 + 20) & 255)];
                if (n3 > 140) dens -= (n3 - 140) * 0.24;
                if (dens > bay[i]) pale = 1;
              }
            }
            if (!pale && fogOn) {
              const d = (y - fogTop + (NZ[(((y * 2) & 255) << 8) | ((x * 2 + fogScroll) & 255)] - 128) * 0.09) * fogK;
              if (d > 0 && d * Math.sqrt(d) * fogMax > bay[i]) pale = 1; // thin at the top, thick at the floor
            }
          }
          if (o & O_RAIN) pale ^= 1;
          if (o & O_GUST) pale ^= 1;
          f = pale;
        }
      }
      if (f !== want[i]) {
        want[i] = f;
        startFlip(i);
      }
    };

    // ----- lettering on the wall -----
    const bigDigits = rasterDigits(DIG_H, 30, 128);
    const rowShift = new Int8Array(ROWS); // heat shimmer
    const stamp = (g, col, row, val, shifted) => {
      for (let y = 0; y < g.h; y++) {
        const yy = row + y;
        if (yy < 0 || yy >= ROWS) continue;
        const sh = shifted ? rowShift[yy] : 0;
        for (let x = 0; x < g.w; x++) {
          if (!g.d[y * g.w + x]) continue;
          const xx = col + x + sh;
          if (xx >= 0 && xx < COLS) lockNew[yy * COLS + xx] = val;
        }
      }
    };
    const stampText = (str, col, row, val) => {
      let x = col;
      for (const ch of str) {
        const g = glyphOf(ch);
        stamp(g, x, row, val, false);
        x += g.w + 1;
      }
    };
    const stampDigits = (str, set, col, row, gap, shifted) => {
      let x = col;
      for (const ch of str) {
        const g = set[ch];
        if (!g) continue;
        stamp(g, x, row, L_TEXT, shifted);
        x += g.w + gap;
      }
    };
    const moat = (r0, r1, rad) => {
      r0 = Math.max(0, r0);
      r1 = Math.min(ROWS - 1, r1);
      for (let y = r0; y <= r1; y++) {
        for (let x = 0; x < COLS; x++) {
          if (lockNew[y * COLS + x] < 2) continue;
          for (let dy = -rad; dy <= rad; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= ROWS) continue;
            for (let dx = -rad; dx <= rad; dx++) {
              if (rad === 2 && (dx === 2 || dx === -2) && (dy === 2 || dy === -2)) continue;
              const xx = x + dx;
              if (xx < 0 || xx >= COLS) continue;
              const n = yy * COLS + xx;
              if (!lockNew[n]) lockNew[n] = L_MOAT;
            }
          }
        }
      }
    };
    const tx = { hh: "", mm: "", ampm: "", wd: "", md: "", temp: "", c1: "", c2: "" };
    const buildLocks = () => {
      lockNew.fill(0);
      stampDigits(tx.hh, bigDigits, LEFT, HOUR_ROW, 3, true);
      stampDigits(tx.mm, bigDigits, LEFT, MIN_ROW, 3, true);
      stampText(tx.ampm, RIGHT + 1 - textWidth(tx.ampm), AMPM_ROW, L_ACCENT);
      moat(HOUR_ROW, MIN_ROW + DIG_H - 1, 2);
      lockNew[SEC_ROW * COLS + LEFT] = L_SEC;
      stampText(tx.wd, LEFT, DATE_ROW, L_TEXT);
      stampText(tx.md, LEFT, DATE_ROW2, L_TEXT);
      stampDigits(tx.temp, BIG, LEFT, TEMP_ROW, 2, false);
      stampText(tx.c1, LEFT, COND_ROW, L_TEXT);
      if (tx.c2) stampText(tx.c2, LEFT, COND_ROW2, L_TEXT);
      moat(SEC_ROW, COND_ROW2 + 7, 1);
      for (let y = 0; y < ROWS; y++) {
        let far = 0;
        for (let yy = Math.max(0, y - 3); yy <= Math.min(ROWS - 1, y + 3); yy++) {
          let x = COLS - 1;
          while (x >= 0 && !lockNew[yy * COLS + x]) x--;
          if (x > far) far = x;
        }
        frostEdge[y] = far + 3;
      }
    };
    // Reserve the new cells and let go of the old ones. With `scan`, the
    // change runs across the wall column by column, as a sign rewrites itself.
    const applyLocks = (scan) => {
      for (let i = 0; i < N; i++) {
        if (lockNew[i] === lock[i]) continue;
        lock[i] = lockNew[i];
        lagNext = scan ? cxs[i] * 0.011 : 0;
        evalCell(i);
      }
      lagNext = 0;
    };
    const readText = (s) => {
      const t = s.text;
      const cond = String(t.condition || "").toUpperCase();
      let c1 = cond;
      let c2 = "";
      if (textWidth(cond) > RIGHT - LEFT + 1) {
        const words = cond.split(" ");
        c1 = words[0];
        let k = 1;
        while (k < words.length && textWidth(`${c1} ${words[k]}`) <= RIGHT - LEFT + 1) c1 += ` ${words[k++]}`;
        c2 = words.slice(k).join(" ");
      }
      const wd = String(t.weekday || "").toUpperCase();
      const md = String(t.monthDay || "").toUpperCase();
      if (t.hh === tx.hh && t.mm === tx.mm && t.ampm === tx.ampm && wd === tx.wd && md === tx.md && t.temp === tx.temp && c1 === tx.c1 && c2 === tx.c2) return false;
      tx.hh = t.hh; tx.mm = t.mm; tx.ampm = t.ampm; tx.wd = wd; tx.md = md; tx.temp = t.temp; tx.c1 = c1; tx.c2 = c2;
      return true;
    };

    // ----- frost: ferns that grow in from the corners -----
    {
      const fr = rng(seed + 5);
      const mark = (x, y, o) => {
        x = Math.round(x);
        y = Math.round(y);
        if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
        const i = y * COLS + x;
        const v = clamp(Math.round(o), 1, 255);
        if (!frostOrd[i] || frostOrd[i] > v) frostOrd[i] = v;
      };
      const STEP = 255 / 64;
      // a straight arm with barbs at sixty degrees, shorter toward the tip
      const arm = (x, y, a, len, o, depth) => {
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        for (let s = 0; s < len; s++) {
          mark(x + dx * s, y + dy * s, o + s * STEP);
          if (depth === 0 && s > 2 && s % 4 === 0) {
            const bl = Math.min((len - s) * 0.42, s % 8 === 0 ? 11 : 6);
            if (bl >= 2) {
              arm(x + dx * s, y + dy * s, a + TAU / 6, bl, o + s * STEP, 1);
              arm(x + dx * s, y + dy * s, a - TAU / 6, bl, o + s * STEP, 1);
            }
          } else if (depth === 1 && s > 2 && s % 4 === 0 && len - s > 3) {
            mark(x + dx * s + Math.cos(a + TAU / 6), y + dy * s + Math.sin(a + TAU / 6), o + s * STEP + 4);
            mark(x + dx * s + Math.cos(a - TAU / 6), y + dy * s + Math.sin(a - TAU / 6), o + s * STEP + 4);
          }
        }
      };
      const crystal = (x, y, a0, len, o) => {
        for (let k = 0; k < 6; k++) arm(x, y, a0 + (k * TAU) / 6, len * (k % 2 ? 0.8 : 1), o, 0);
      };
      crystal(COLS, ROWS, 0.55 + fr.range(-0.08, 0.08), 58, 0);
      crystal(COLS, -1, 0.5 + fr.range(-0.08, 0.08), 50, 10);
      crystal(COLS, fr.range(38, 56), fr.range(0, 1), 34, 70);
      crystal(COLS, fr.range(86, 104), fr.range(0, 1), 30, 100);
      crystal(fr.range(50, 64), ROWS, fr.range(0, 1), 30, 90);
    }

    // ----- wind bands -----
    const gq = new Uint16Array(N);
    const bStart = new Uint16Array(514);
    const bCells = new Uint16Array(N);
    const bFill = new Uint16Array(513);
    let nB = 0;
    let bux = 0, buy = 0; // direction the buckets were built for (0, 0 = not yet)
    const KB = 5;
    const bandHead = new Int16Array(KB);
    const bandG = new Float32Array(KB);
    const bandV = new Float32Array(KB);
    const bandSx = new Uint8Array(KB);
    const bandSy = new Uint8Array(KB);
    const bandOn = new Uint8Array(KB);
    const BAND_W = 10;
    let bandTimer = 0;
    const buildBuckets = () => {
      DBG.builds++;
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
        const g = cxs[i] * bux + cys[i] * buy + warp[i];
        if (g < mn) mn = g;
      }
      bStart.fill(0);
      nB = 0;
      for (let i = 0; i < N; i++) {
        const b = Math.min(511, (cxs[i] * bux + cys[i] * buy + warp[i] - mn) | 0);
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
      const sx = bandSx[k];
      const sy = bandSy[k];
      for (let d = 0; d < BAND_W; d++) {
        const b = head - d;
        if (b < 0 || b >= nB) continue;
        for (let j = bStart[b]; j < bStart[b + 1]; j++) {
          const i = bCells[j];
          const q = bay[i] >> 4; // a quarter of the discs each; two quarters take part
          if (q > 1) continue;
          const dOn = q * 3;
          if (d === dOn) {
            if (NZ[(((cys[i] + sy) & 255) << 8) | ((cxs[i] + sx) & 255)] > 110) {
              ov[i] |= O_GUST;
              evalCell(i);
            }
          } else if (d === BAND_W - 1 - dOn && ov[i] & O_GUST) {
            ov[i] &= ~O_GUST;
            evalCell(i);
          }
        }
      }
    };
    const spawnBand = (speed, at) => {
      for (let k = 0; k < KB; k++) {
        if (bandOn[k]) continue;
        bandOn[k] = 1;
        bandG[k] = at;
        bandHead[k] = Math.floor(at);
        bandV[k] = speed;
        bandSx[k] = r.int(0, 255);
        bandSy[k] = r.int(0, 255);
        return;
      }
    };

    // ----- rain -----
    const RMAX = 170;
    const rX = new Float32Array(RMAX), rY = new Float32Array(RMAX), rV = new Float32Array(RMAX), rS = new Float32Array(RMAX);
    const rLen = new Uint8Array(RMAX), rAct = new Uint8Array(RMAX);
    const rHead = new Int16Array(RMAX);
    let rainTarget = 0, rainSlant = 0, rainV0 = 14, rainV1 = 20, rainL0 = 2, rainL1 = 5;
    const spawnRain = (k, atTop) => {
      const span = rainSlant * ROWS;
      rX[k] = r.range(Math.min(0, -span) - 1, Math.max(COLS, COLS - span) + 1);
      rS[k] = rainSlant + r.range(-0.03, 0.03);
      rV[k] = r.range(rainV0, rainV1);
      rLen[k] = r.int(rainL0, rainL1);
      rY[k] = atTop ? -r.range(0, 30) : r.range(-20, ROWS);
      rHead[k] = Math.floor(rY[k]) - rLen[k];
      rAct[k] = 1;
    };
    const rainMark = (k, row, on) => {
      if (row < 0 || row >= ROWS) return;
      const x = Math.round(rX[k] + rS[k] * row);
      if (x < 0 || x >= COLS) return;
      const i = row * COLS + x;
      if (on) ov[i] |= O_RAIN;
      else ov[i] &= ~O_RAIN;
      evalCell(i);
    };

    // ----- snow -----
    const SMAX = 250;
    const sX = new Float32Array(SMAX), sY = new Float32Array(SMAX), sV = new Float32Array(SMAX), sF = new Float32Array(SMAX), sP = new Float32Array(SMAX);
    const sC = new Int32Array(SMAX).fill(-1);
    const sAct = new Uint8Array(SMAX);
    let snowTarget = 0, snowVx = 0, snowFast = 1, driftKey = -1, erodeTimer = 0;
    const spawnFlake = (k, atTop) => {
      sX[k] = r.range(0, COLS);
      sY[k] = atTop ? -r.range(0, 12) : r.range(-4, ROWS - 6);
      sV[k] = r.range(2.2, 4.6) * snowFast;
      sF[k] = r.range(0.5, 1.3);
      sP[k] = r.range(0, TAU);
      sC[k] = -1;
      sAct[k] = 1;
    };
    const setDriftTarget = (amount) => {
      for (let x = 0; x < COLS; x++) {
        const dune = NZ[(37 << 8) | ((x * 2 + seed) & 255)] / 255;
        driftTarget[x] = amount > 0 ? Math.round(1.5 + amount * 5 + dune * (2 + amount * 6)) : 0;
      }
    };

    // ----- stray discs: a twinkle by day, a few stars on a clear night -----
    const STRAY = 46;
    const stCell = new Uint16Array(STRAY);
    const stOn = new Uint8Array(STRAY);
    const stT = new Float32Array(STRAY);
    for (let k = 0; k < STRAY; k++) {
      stCell[k] = r.int(0, ROWS - 14) * COLS + r.int(1, COLS - 2);
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

    // One step of the weather and the clock: decides which discs should show
    // what. Drawing happens afterwards, in frame().
    const advance = (s, t, dt) => {
      now = t;
      const w = s.weather;
      live = w.live;

      // lettering
      if (readText(s)) {
        buildLocks();
        applyLocks(!instant);
      }
      const sec = s.clock.s;
      if (sec !== lastSec) {
        lastSec = sec;
        secOn = (sec & 1) === 0;
        evalCell(SEC_ROW * COLS + LEFT);
      }
      // heat: rows of the numerals slip sideways in slow rising waves
      const heat = live ? smoothstep(86, 98, w.temp) : 0;
      if (heat > 0 || heatOn) {
        heatTimer -= dt;
        if (heatTimer <= 0) {
          heatTimer = 0.22;
          const cut = lerp(0.97, 0.8, heat);
          let changed = false;
          for (let y = HOUR_ROW; y < MIN_ROW + DIG_H; y++) {
            const v = heat > 0 ? Math.sin(y * 0.24 + t * 0.8 + Math.sin(y * 0.05 - t * 0.17) * 1.3) : 0;
            const sh = v > cut ? 1 : 0;
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

      // wind
      const toward = ((w.windDir + 180) * Math.PI) / 180;
      ux = Math.sin(toward);
      uy = -Math.cos(toward);
      const wind = live ? w.wind : 0;
      const gust = live ? w.gust : 0;
      const stretch = 1 + clamp(wind / 22, 0, 1.5);
      invStretch = 1 / stretch;
      driftU = (driftU + dt * (0.3 + wind * 0.11) * invStretch) % 2560;
      driftW = (driftW + dt * 0.05) % 256;
      if (ux * bux + uy * buy < 0.9975) buildBuckets();

      // fog and haze, from the visibility
      const fogAmt = live ? Math.max(w.fog ? 0.8 : 0, smoothstep(8, 0.2, w.visibility)) : 0;
      fogOn = fogAmt > 0.02;
      fogTop = ROWS * (1 - 0.9 * fogAmt);
      fogK = 1 / (ROWS - fogTop + 1);
      fogMax = Math.min(0.97, 0.3 + fogAmt * 0.7) * 64;
      fogScroll = (fogScroll + dt * (0.8 + wind * 0.2)) % 256;

      // cloud (in thick fog there is no sky to see)
      const cover = live ? clamp(w.cloud / 100) * (1 - 0.85 * fogAmt * fogAmt) : 0;
      cloudThr = cover < 0.03 ? 999 : thrOf[Math.round(cover * 100)] - cover * cover * 40;

      // frost
      const frost = live ? smoothstep(30, 0, w.temp) : 0;
      frostLevel = frost > 0 ? Math.round(frost * 250 + 4 * Math.sin(t * 0.21)) : 0;

      // the idle sweep when there is no weather to show
      sweepPos = (s.clock.sf / 60) * 250;

      // wind bands
      if (live) {
        bandTimer -= dt;
        if (bandTimer <= 0) {
          bandTimer = clamp(12 - wind * 0.34, 3, 12) * r.range(0.7, 1.3);
          spawnBand(Math.min(22, 7 + (wind * 0.6 + gust * 0.4) * 0.45), -1);
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
        if (bandHead[k] - BAND_W > nB) bandOn[k] = 0;
      }

      // rain
      const fall = live ? w.falling : null;
      const inten = w.intensity;
      const windX = wind * ux;
      if (fall === "drizzle") {
        rainTarget = Math.round(24 + inten * 150);
        rainV0 = 6; rainV1 = 10; rainL0 = 1; rainL1 = 1;
      } else if (fall === "rain" || fall === "freezing") {
        rainTarget = Math.round(30 + inten * 120);
        rainV0 = 13; rainV1 = 20; rainL0 = 3; rainL1 = 7;
      } else if (fall === "storm") {
        rainTarget = Math.round(60 + inten * 90);
        rainV0 = 18; rainV1 = 26; rainL0 = 5; rainL1 = 9;
      } else rainTarget = 0;
      rainSlant = clamp(windX * 0.028, -0.8, 0.8);
      for (let k = 0; k < RMAX; k++) {
        if (!rAct[k]) {
          if (k < rainTarget) spawnRain(k, !instant ? true : false);
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
          if (h - len >= ROWS) {
            if (k < rainTarget) spawnRain(k, true);
            else rAct[k] = 0;
          }
        }
      }

      // snow
      const snowing = fall === "snow";
      snowTarget = snowing ? Math.round(50 + inten * 190) : 0;
      snowVx = clamp(windX * 0.17, -7, 7);
      snowFast = 1 + clamp(wind / 40, 0, 0.7);
      const dk = snowing ? Math.round(inten * 12) : -1;
      if (dk !== driftKey) {
        driftKey = dk;
        setDriftTarget(snowing ? inten : 0);
        if (instant) {
          for (let x = 0; x < COLS; x++) drift[x] = Math.max(0, driftTarget[x] - (r.chance(0.35) ? 1 : 0));
        }
      }
      for (let k = 0; k < SMAX; k++) {
        if (!sAct[k]) {
          if (k < snowTarget) spawnFlake(k, !instant);
          else continue;
        }
        sY[k] += sV[k] * dt;
        let x = sX[k] + (snowVx + Math.sin(t * sF[k] + sP[k]) * 0.9) * dt;
        if (x < 0) x += COLS;
        else if (x >= COLS) x -= COLS;
        sX[k] = x;
        const cx = x | 0;
        const cy = Math.floor(sY[k]);
        const ci = cy >= 0 ? cy * COLS + cx : -1;
        if (ci === sC[k]) continue;
        const old = sC[k];
        if (old >= 0) {
          ov[old] &= ~O_FLAKE;
          evalCell(old);
        }
        if (cy >= ROWS - drift[cx]) {
          // landed: settle on the lowest of the three columns below
          let lx = cx;
          if (cx > 0 && drift[cx - 1] < drift[lx]) lx = cx - 1;
          if (cx < COLS - 1 && drift[cx + 1] < drift[lx]) lx = cx + 1;
          if (drift[lx] < driftTarget[lx]) {
            drift[lx]++;
            evalCell((ROWS - drift[lx]) * COLS + lx);
          }
          sC[k] = -1;
          if (k < snowTarget) spawnFlake(k, true);
          else sAct[k] = 0;
          continue;
        }
        sC[k] = ci;
        if (ci >= 0) {
          ov[ci] |= O_FLAKE;
          evalCell(ci);
        }
      }
      // the wind takes the drift away again, a disc at a time
      erodeTimer -= dt;
      if (erodeTimer <= 0) {
        erodeTimer = snowing ? 0.35 : 0.08;
        const x = r.int(0, COLS - 1);
        if (drift[x] > 0 && drift[x] >= driftTarget[x]) {
          const i = (ROWS - drift[x]) * COLS + x;
          drift[x]--;
          evalCell(i);
        }
      }

      // stray discs
      const clearSky = live ? 1 - cover : 0;
      const night = s.daylight < 0.3;
      starry = night;
      const allowed = clearSky < 0.25 || fogAmt > 0.4 ? 0 : Math.round(STRAY * clearSky * (night ? 0.9 : 0.45));
      for (let k = 0; k < STRAY; k++) {
        if (!strayInit) {
          stOn[k] = night && k < allowed && r.chance(0.9) ? 1 : 0;
          stT[k] = stOn[k] ? r.range(4, 90) : r.range(0, night ? 10 : 30);
          if (stOn[k]) {
            ov[stCell[k]] |= O_STRAY;
            evalCell(stCell[k]);
          }
          continue;
        }
        stT[k] -= dt;
        if (stT[k] > 0 && !(stOn[k] && k >= allowed)) continue;
        if (stOn[k]) {
          stOn[k] = 0;
          stT[k] = night ? r.range(2, 7) : r.range(8, 34);
          ov[stCell[k]] &= ~O_STRAY;
        } else {
          if (k >= allowed) {
            stT[k] = 5;
            continue;
          }
          stOn[k] = 1;
          stT[k] = night ? r.range(25, 110) : r.range(1.2, 2.8);
          ov[stCell[k]] |= O_STRAY;
        }
        evalCell(stCell[k]);
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
          while (boltLit < lit) {
            ov[bolt[boltLit]] |= O_BOLT;
            evalCell(bolt[boltLit++]);
          }
          const gone = Math.min(boltN, Math.floor(boltN * clamp((boltT - 1.1) / 2.3)));
          while (boltGone < gone) {
            ov[bolt[boltGone]] &= ~O_BOLT;
            evalCell(bolt[boltGone++]);
          }
        }
      }

      // every disc re-reads the weather in turn
      let count = Math.min(N, Math.ceil((N * dt) / SWEEP));
      while (count-- > 0) {
        evalCell(perm[sweepPtr]);
        if (++sweepPtr >= N) sweepPtr = 0;
      }
    };

    // ----- set up: the wall is complete on the first frame -----
    updatePalette(state, 0, true);
    for (let k = 0; k < 140; k++) advance(state, -7 + k * 0.05, 0.05);
    for (let i = 0; i < N; i++) evalCell(i);
    for (let i = 0; i < N; i++) {
      shown[i] = want[i];
      tone[i] = want[i] === BRIGHT ? 1 : want[i] === ACCENT ? 2 : 0;
      if (want[i]) {
        cut(false);
        blit(i, SP_EDGE);
        cut(true);
        blit(i, SP_PALE);
      } else drawDark(i);
    }
    packPalette();
    instant = false;

    return {
      frame(s) {
        DBG.draws = 0; DBG.evals = 0; DBG.builds0 = DBG.builds;
        const t = s.t;
        const dt = s.dt;
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
            aQuick[k] = na > BUSY ? 1 : 0;
          }
          // edge on, half open, open (when the wall is busy the middle step is dropped)
          const stage = p < 0.36 ? 1 : p < 0.7 ? 2 : 3;
          const was = aStage[k];
          if (stage !== was) {
            if (was === 255) {
              setTone(i, to);
              if (to || !aQuick[k]) {
                cut(false);
                blit(i, SP_EDGE);
              }
            }
            if (stage === 2 && !aQuick[k]) {
              cut(!!to);
              blit(i, to ? SP_PALE_HALF : SP_DARK_HALF);
            } else if (stage === 3) {
              if (to) {
                cut(true);
                blit(i, SP_PALE);
              } else drawDark(i);
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
        cut(false);
        if (uDirty) {
          uDirty = false;
          under.ctx.putImageData(img, 0, 0);
        }

        DBG.sum += DBG.draws; if (DBG.draws > DBG.max) DBG.max = DBG.draws; DBG.n++;
        if (DBG.n % 120 === 0) console.warn("DBG avg draws", (DBG.sum / DBG.n).toFixed(0), "max", DBG.max, "na", na, "builds", DBG.builds);
        // the plate
        const tt = s.text;
        put("sunK", cSun.k, tt.sunLabel);
        put("sunV", cSun.v, tt.sunValue);
        put("moon", cMoon.v, tt.moon);
        put("aqi", cAir.v, tt.aqi);
        put("uv", cUv.v, tt.uv);
        put("factK", factK, tt.factLabel);
        if (put("factV", factV, tt.factValue)) {
          plate.classList.toggle("nofact", !tt.factValue);
          plate.classList.remove("long", "short");
          if (tt.factValue) {
            const h = factV.offsetHeight;
            if (h > 44 * 2 + 4) plate.classList.add("long");
            else if (h <= 48) {
              // a short fact is set larger, if it still fits on one line
              plate.classList.add("short");
              if (factV.offsetHeight > 70) plate.classList.remove("short");
            }
          }
        }
      },
    };
  },
};

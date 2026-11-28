// Rubber Hours
//
// The time is four fat rubber-tube numerals (hours over minutes), each a soft
// body of 14 nodes sprung to its skeleton and stroked 130 px thick in three
// flat tones plus a glint. The weather handles the rubber:
//   - feels-like temperature is the material and the colour. One toy colour per
//     band (glacier blue, mint, mustard, tangerine, watermelon); stiffness,
//     damping and sag are continuous in the temperature: rigid, frosted and
//     hung with icicles below freezing, lively in the 60s and 70s, and above
//     85 F a taffy that droops and lets one slow drip stretch, fall and land
//     (knocking a tag, or puddling on the label).
//   - wind (speed, gusts, direction) is a force on every node and swings the
//     paper hang-tags; every raindrop that lands dents a tube; snow drives past;
//     fog hangs round the tubes; thunder makes the whole set shudder.
//   - the ground is the measured sky, muted and kept deep enough for the tubes
//     to stand off it; sun gives a hard gloss and a cast shadow, cloud takes
//     both away. At night the tubes are a dim toy colour on near-black, lit
//     from behind by a bright rim (the city across the river).
// On the minute the old numeral is twisted into the new one like a balloon
// animal; on the hour all four bounce.
// The readouts are tied on as paper tags: temperature and condition on the big
// tag hung from AM/PM, the sun countdown with a UV sticker and the moon with an
// air-quality sticker under the minutes, and the date and today's fact on a
// label sewn in at the foot. Paper and ink flip together at mid-grey.
import {
  W, H, TAU, clamp, lerp, smoothstep, approach, rng, createNoise,
  mix, adjust, oklch, toOklch, rgba, luminance, contrast, readableOn,
  el, addStyle, canvas2d, grain, fitText,
} from "../lib/kit.js";

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
const TUBE = 130; // tube thickness
const SK_W = 318; // extent of a numeral's centreline
const SK_H = 388; // shorter than they could be: the two rows keep 40 px apart even when the hours sag, and the tags below hang clear over a two-line fact
const LEFT = 82;
const ROW_H = 68; // top of the hours row (outer edge of the tubes)
const ROW_M = 656; // top of the minutes row: clear air between the two rows of the time
const CELL = SK_W + TUBE;
const CELL_GAP = 20;
const NN = 14; // nodes per numeral
const SUB = 6; // spline steps between nodes
const NP = (NN - 1) * SUB + 1;
const MINI = 32; // AM/PM tube thickness
const MINI_H = 96;
// The paper tags under the minutes: the sticker, and the room between the words and it.
const STK = 112;
const STK_GAP = 50;
const SUN_W = 384;
const MOON_W = 490;
const SUN_COL = SUN_W - 44 - STK_GAP - STK; // room for the sun countdown beside its sticker
const LAW_AIR = 64; // clear ground kept between those tags and the label at the foot

// Light comes from the upper left: each tone of the tube is the same path,
// thinner and shifted further toward the light.
const LX = -0.63;
const LY = -0.78;

// The numerals. Coordinates are fractions of the centreline box, y down.
// c: nodes where the tube folds sharply. s: sub-strokes as [first, last, closed].
function digitDefs() {
  const ring = (cx, cy, rx, ry, n, a0, pow = 2) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / (n - 1)) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      out.push([cx + rx * Math.sign(c) * Math.abs(c) ** (2 / pow), cy + ry * Math.sign(s) * Math.abs(s) ** (2 / pow)]);
    }
    return out;
  };
  const stem = [];
  for (let k = 1; k <= 11; k++) stem.push([0.3, k / 11]);
  const raw = {
    0: { p: ring(0.5, 0.5, 0.5, 0.5, 14, -Math.PI / 2, 2.5), s: [[0, 13, 1]] },
    1: { p: [[0, 0.25], [0.15, 0.125], [0.3, 0], ...stem], c: [2] },
    2: { p: [[0.02, 0.29], [0.12, 0.1], [0.36, 0], [0.64, 0], [0.9, 0.1], [1, 0.28], [0.93, 0.46], [0.72, 0.62], [0.44, 0.78], [0.18, 0.92], [0.02, 1], [0.35, 1], [0.68, 1], [1, 1]], c: [10] },
    3: { p: [[0.04, 0.15], [0.22, 0.03], [0.5, 0], [0.8, 0.05], [0.95, 0.22], [0.8, 0.41], [0.46, 0.47], [0.82, 0.54], [1, 0.73], [0.88, 0.92], [0.62, 1], [0.36, 1], [0.14, 0.94], [0, 0.82]], c: [6] },
    4: { p: [[0.2, 0], [0.15, 0.165], [0.1, 0.33], [0.05, 0.495], [0, 0.66], [0.26, 0.66], [0.52, 0.66], [0.77, 0.66], [1, 0.66], [0.74, 0], [0.74, 0.25], [0.74, 0.5], [0.74, 0.75], [0.74, 1]], c: [4], s: [[0, 8, 0], [9, 13, 0]] },
    5: { p: [[0.92, 0], [0.64, 0], [0.38, 0], [0.12, 0], [0.09, 0.2], [0.06, 0.41], [0.3, 0.36], [0.58, 0.36], [0.86, 0.45], [1, 0.64], [0.92, 0.85], [0.68, 0.98], [0.38, 1], [0.07, 0.87]], c: [3, 5] },
    6: { p: [[0.84, 0.05], [0.6, 0], [0.34, 0.06], [0.14, 0.22], [0.03, 0.44], [0, 0.66], [0.1, 0.87], [0.32, 0.99], [0.6, 1], [0.88, 0.9], [1, 0.7], [0.9, 0.5], [0.64, 0.4], [0.34, 0.44]] },
    7: { p: [[0, 0], [0.25, 0], [0.5, 0], [0.75, 0], [1, 0], [0.92, 0.12], [0.84, 0.23], [0.76, 0.34], [0.68, 0.45], [0.6, 0.56], [0.52, 0.67], [0.45, 0.78], [0.4, 0.89], [0.36, 1]], c: [4] },
    8: { p: [...ring(0.5, 0.245, 0.4, 0.245, 7, Math.PI / 2), ...ring(0.5, 0.735, 0.5, 0.265, 7, -Math.PI / 2)], s: [[0, 6, 1], [7, 13, 1]] },
    9: { p: [[0.66, 0.56], [0.36, 0.6], [0.1, 0.5], [0, 0.3], [0.12, 0.1], [0.4, 0], [0.68, 0.01], [0.9, 0.13], [1, 0.34], [0.97, 0.56], [0.86, 0.78], [0.66, 0.94], [0.4, 1], [0.16, 0.95]] },
  };
  const defs = [];
  for (let d = 0; d < 10; d++) {
    const r = raw[d];
    const corner = new Uint8Array(NN);
    for (const i of r.c || []) corner[i] = 1;
    let w = 0;
    for (const p of r.p) w = Math.max(w, p[0]);
    // only numerals whose tube crosses or meets itself are laid down in pieces
    defs.push({ p: r.p, corner, strokes: r.s || [[0, NN - 1, 0]], w, piece: d === 6 || d === 9 ? 18 : 99 });
  }
  return defs;
}
const DIGITS = digitDefs();

// AM / PM, as small tubes of the same rubber. Fractions of a box w x MINI_H.
const MINIS = {
  A: { w: 78, p: [[0, 1], [0.25, 0.5], [0.5, 0], [0.75, 0.5], [1, 1], [0.2, 0.66], [0.8, 0.66]], c: [2], s: [[0, 4], [5, 6]] },
  P: { w: 68, p: [[0, 1], [0, 0.5], [0, 0], [0.55, 0], [0.98, 0.14], [0.98, 0.42], [0.55, 0.56], [0.06, 0.56]], c: [2], s: [[0, 7]] },
  M: { w: 98, p: [[0, 1], [0, 0.5], [0, 0], [0.25, 0.33], [0.5, 0.66], [0.75, 0.33], [1, 0], [1, 0.5], [1, 1]], c: [2, 4, 6], s: [[0, 8]] },
};

// A cardinal spline through the nodes of each sub-stroke, as a polyline.
// Node i lands on point i * SUB.
function spline(nx, ny, strokes, corner, outX, outY) {
  for (let k = 0; k < strokes.length; k++) {
    const a = strokes[k][0];
    const b = strokes[k][1];
    const closed = strokes[k][2];
    for (let i = a; i < b; i++) {
      const x0 = nx[i], y0 = ny[i], x1 = nx[i + 1], y1 = ny[i + 1];
      let m0x, m0y, m1x, m1y;
      if (corner[i]) m0x = m0y = 0;
      else if (i === a) {
        if (closed) { m0x = (x1 - nx[b - 1]) * 0.5; m0y = (y1 - ny[b - 1]) * 0.5; }
        else { m0x = x1 - x0; m0y = y1 - y0; }
      } else { m0x = (x1 - nx[i - 1]) * 0.5; m0y = (y1 - ny[i - 1]) * 0.5; }
      if (corner[i + 1]) m1x = m1y = 0;
      else if (i + 1 === b) {
        if (closed) { m1x = (nx[a + 1] - x0) * 0.5; m1y = (ny[a + 1] - y0) * 0.5; }
        else { m1x = x1 - x0; m1y = y1 - y0; }
      } else { m1x = (nx[i + 2] - x0) * 0.5; m1y = (ny[i + 2] - y0) * 0.5; }
      for (let q = 0; q < SUB; q++) {
        const t = q / SUB;
        const t2 = t * t;
        const t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;
        const j = i * SUB + q;
        outX[j] = h00 * x0 + h10 * m0x + h01 * x1 + h11 * m1x;
        outY[j] = h00 * y0 + h10 * m0y + h01 * y1 + h11 * m1y;
      }
    }
    outX[b * SUB] = nx[b];
    outY[b * SUB] = ny[b];
  }
}

// The rubber by temperature: [feels-like F, stiffness (rad/s), damping ratio, sag (px)].
const MATERIAL = [
  [10, 27, 0.92, 0],
  [32, 22, 0.8, 0],
  [50, 13, 0.34, 0],
  [62, 10, 0.22, 0],
  [72, 8.5, 0.19, 4],
  [85, 6, 0.27, 20],
  [95, 4.2, 0.4, 46],
  [105, 3.4, 0.48, 60],
];
// One toy colour per temperature band: [upper limit F, lightness, chroma, hue].
const BANDS = [
  [32, 0.86, 0.085, 232], // glacier blue
  [50, 0.88, 0.125, 166], // mint
  [68, 0.85, 0.165, 93], // mustard
  [85, 0.78, 0.175, 55], // tangerine
  [999, 0.71, 0.2, 14], // watermelon
];
const BAND_HEX = BANDS.map((b) => oklch(b[1], b[2], b[3]));
function toyColor(t) {
  for (let i = 0; i < BANDS.length - 1; i++) {
    const edge = BANDS[i][0];
    if (t < edge - 2) return BAND_HEX[i];
    if (t < edge + 2) return mix(BAND_HEX[i], BAND_HEX[i + 1], smoothstep(edge - 2, edge + 2, t));
  }
  return BAND_HEX[BANDS.length - 1];
}

export default {
  title: "Rubber Hours",
  description: "Fat rubber-tube numerals that the weather handles: heat sags them, frost stiffens them, wind shoves them, rain dents them.",
  fonts: ["Patrick Hand", "DM Sans:wght@500;800;900"],

  mount(root, { state, seed }) {
    addStyle(root, `
      .rh { position: absolute; inset: 0; overflow: hidden; background: #0a0c11;
        --paper: #f3ead6; --ink: #1b2030; --ink2: #4a4f5c; --string: #efe6d2; --stk: #ffb060; --stkink: #1b2030;
        --hole: #223; --base: #fbf5e6; --accent: #ffd; --emb: rgba(0,0,0,.3); --tsh: .2; --shx: 6px; --shy: 9px; }
      .rh .ground, .rh .flash { position: absolute; inset: 0; }
      .rh .flash { background: #cdd3ff; opacity: 0; will-change: opacity; } /* its own layer: a rumble must not repaint the ground */
      .rh .tag { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 3; will-change: transform; }
      .rh .str { position: absolute; left: -1.5px; top: 0; width: 3px; background: var(--string); border-radius: 2px; }
      .rh .knot { position: absolute; left: -5px; top: -6px; width: 10px; height: 10px; border-radius: 50%; background: var(--string); }
      .rh .card { position: absolute; transform-origin: 50% 26px; will-change: transform; }
      .rh .sh, .rh .paper { clip-path: polygon(30px 0, calc(100% - 30px) 0, 100% 30px, 100% 100%, 0 100%, 0 30px); }
      .rh .sh { position: absolute; inset: 0; background: #000; opacity: var(--tsh); transform: translate(var(--shx), var(--shy)); }
      .rh .paper { position: relative; box-sizing: border-box; width: 100%; background: var(--paper); color: var(--ink);
        font-family: "Patrick Hand", cursive; text-align: center; padding: 50px 16px 18px; }
      .rh .hole { position: absolute; left: 50%; top: 26px; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%;
        background: var(--hole); box-shadow: 0 0 0 5px var(--stk); }
      .rh .lab { font-size: 36px; line-height: 1; color: var(--ink2); }
      .rh .stk { width: ${STK}px; height: ${STK}px; border-radius: 50%; background: var(--stk); color: var(--stkink); flex: none;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        box-shadow: inset 0 0 0 4px var(--stkrim); }
      .rh .stk b { font-family: "DM Sans", sans-serif; font-weight: 900; font-size: 24px; line-height: 1; letter-spacing: 0.08em; margin-top: 4px; }
      .rh .stk i { font-style: normal; font-size: 58px; line-height: 0.9; margin-top: 10px; white-space: nowrap; }
      .rh .t-temp .paper { padding: 50px 14px 22px; }
      .rh .t-temp .temp { font-size: 190px; line-height: 0.8; margin: 4px -10px 0 0; white-space: nowrap; }
      .rh .t-temp .cond { font-size: 54px; text-wrap: balance;
        /* a wrapped condition gets 40 px of air between its lines; the margins take the
           extra leading back off a single line, so it sits 48 px clear of the temperature */
        line-height: calc(1em + 42px); margin: calc(9px + 0.1em) -1px calc(0.1em - 21px); }
      .rh .t-sun .card { width: ${SUN_W}px; left: -${SUN_W / 2}px; }
      .rh .t-moon .card { width: ${MOON_W}px; left: -${MOON_W / 2}px; }
      .rh .t-sun .paper, .rh .t-moon .paper { display: flex; align-items: center; justify-content: space-between; gap: ${STK_GAP}px;
        text-align: left; padding: 48px 18px 20px 26px; }
      .rh .col { flex: 1; min-width: 0; }
      .rh .t-sun .val { font-size: 80px; line-height: 0.92; white-space: nowrap; margin-top: 10px; }
      .rh .t-sun .stk { transform: rotate(8deg); }
      .rh .t-moon .val { font-size: 52px; line-height: 1.2; margin-top: 6px; white-space: nowrap; }
      .rh .t-moon .val.wrap { white-space: normal; line-height: calc(1em + 42px); margin: calc(0.1em - 15px) 0 calc(0.1em - 21px); }
      .rh .t-moon .stk { transform: rotate(-9deg); }
      .rh .law { position: absolute; left: 64px; right: 64px; bottom: 40px; z-index: 2; box-sizing: border-box;
        background: var(--paper); color: var(--ink); border-radius: 4px 4px 10px 10px; padding: 28px 36px 28px;
        font-family: "DM Sans", sans-serif; box-shadow: var(--shx) var(--shy) 0 rgba(0,0,0,var(--tsh)); }
      .rh .law::before { content: ""; position: absolute; inset: 11px; border: 3px dashed var(--ink2); border-radius: 3px; opacity: 0.38; }
      .rh .law::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 9px; background: var(--fold); border-radius: 4px 4px 0 0; }
      .rh .date { font-weight: 900; font-size: 62px; line-height: 1.02; letter-spacing: -0.015em; white-space: nowrap; }
      .rh .fact { margin-top: 32px; padding-top: 29px; border-top: 3px solid var(--rule); }
      .rh .flab { font-weight: 800; font-size: 25px; line-height: 1.2; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
      .rh .fval { font-weight: 700; font-size: 40px; letter-spacing: -0.005em; text-wrap: pretty;
        /* a two-line fact gets 40 px of air between its lines; on one line the margins
           take the extra leading back off */
        line-height: calc(1em + 40px); margin: calc(0.11em - 10px) 0 calc(0.11em - 20px); }
    `);

    const wrap = el("div", { class: "rh" });
    const ground = el("div", { class: "ground" });
    const flash = el("div", { class: "flash" });
    wrap.append(ground, flash);
    const layer = canvas2d(wrap, { maxScale: 1.25, adaptive: true });
    const ctx = layer.ctx;

    // ----- the tags (DOM, so the lettering is crisp) -----
    const T = {};
    const sticker = (key, label) => el("div", { class: "stk" }, el("b", { text: label }), (T[key] = el("i")));
    const makeTag = (cls, len, ...content) => {
      const str = el("div", { class: "str", style: { height: `${len + 26}px` } });
      const hole = el("div", { class: "hole" });
      const paper = el("div", { class: "paper" }, hole, ...content);
      const card = el("div", { class: "card", style: { top: `${len}px` } }, el("div", { class: "sh" }), paper);
      const node = el("div", { class: `tag ${cls}` }, card, str, el("div", { class: "knot" }));
      wrap.append(node);
      return { node, card, hole, str, len, len0: len, w: 226, h: 300, th: 0, om: 0, ph: 0, pom: 0, x: 0, y: 0, pvx: 0, shift: 0, shiftT: 0, ss: "", sx: "", sc: "" };
    };
    const tagTemp = makeTag("t-temp", 48,
      (T.temp = el("div", { class: "temp" })), (T.cond = el("div", { class: "cond" })));
    const tagSun = makeTag("t-sun", 44,
      el("div", { class: "col" }, (T.sunLabel = el("div", { class: "lab" })), (T.sunValue = el("div", { class: "val" }))),
      sticker("uv", "UV"));
    const tagMoon = makeTag("t-moon", 50,
      el("div", { class: "col" }, el("div", { class: "lab", text: "Moon" }), (T.moon = el("div", { class: "val" }))),
      sticker("aqi", "AQI"));
    tagTemp.w = 280; tagSun.w = SUN_W; tagMoon.w = MOON_W;
    const tags = [tagTemp, tagSun, tagMoon];

    // the sewn-in label at the toy's foot: when it was made, and today's fact
    const law = el("div", { class: "law" },
      (T.date = el("div", { class: "date" })),
      (T.fact = el("div", { class: "fact" }, (T.factLabel = el("div", { class: "flab" })), (T.factValue = el("div", { class: "fval" })))));
    wrap.append(law);
    root.append(wrap);
    grain(wrap, { opacity: 0.05 });

    const shown = {};
    const put = (key, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      T[key].textContent = value;
      return true;
    };

    const R = rng(seed);
    const noise = createNoise(seed);

    // ----- the four numerals -----
    const f32 = (n) => new Float32Array(n);
    const makeSlot = (row, index) => ({
      row, index, rowY: row ? ROW_M : ROW_H, vis: false, digit: -1, def: DIGITS[0], x0: 0, xs: 1,
      hx: f32(NN), hy: f32(NN), ax: f32(NN), ay: f32(NN), bx: f32(NN), by: f32(NN),
      ux: f32(NN), uy: f32(NN), vx: f32(NN), vy: f32(NN), fx: f32(NN), fy: f32(NN),
      comp: f32(NN), compA: f32(NN), compB: f32(NN), px: f32(NP), py: f32(NP),
      morph: 1, twist: 1, cx: 0, cy: 0, wax: 0, way: 0, leaving: false,
      tie: 0, low: 0, ice: new Int16Array(3), iceLen: f32(3), iceN: 0, iceGrow: 1,
      dripJ: 0, dripW: 34, tieAX: 0, tieAY: 0, glint: R.range(0, 30), frostF: f32(72), frostL: f32(72), frostS: f32(72),
    });
    const slots = [makeSlot(0, 0), makeSlot(0, 1), makeSlot(1, 2), makeSlot(1, 3)];
    for (const sl of slots) {
      for (let i = 0; i < 72; i++) {
        sl.frostF[i] = R();
        sl.frostL[i] = R.sign() * (0.5 - 0.42 * R() * R());
        sl.frostS[i] = R.range(2.2, 5.2);
      }
    }
    const tmpX = f32(NP);
    const tmpY = f32(NP);

    function setDigit(sl, d, x0, xs, centre, snap) {
      const def = DIGITS[d];
      const off = centre ? (1 - def.w) / 2 : 0;
      let cx = 0, cy = 0;
      for (let i = 0; i < NN; i++) {
        sl.bx[i] = x0 + TUBE / 2 + (def.p[i][0] + off) * SK_W * xs;
        sl.by[i] = sl.rowY + TUBE / 2 + def.p[i][1] * SK_H;
        cx += sl.bx[i] / NN;
        cy += sl.by[i] / NN;
        sl.compB[i] = 0.14 + 1.7 * Math.pow(def.p[i][1], 1.2);
      }
      for (const st of def.strokes) {
        if (st[2]) continue;
        sl.compB[st[0]] *= 1.7; sl.compB[st[0] + 1] *= 1.28;
        sl.compB[st[1]] *= 1.7; sl.compB[st[1] - 1] *= 1.28;
      }
      const fresh = snap || !sl.vis;
      // where the tag was tied, so it can slide across to its new knot during the twist
      if (sl.vis) { sl.tieAX = sl.px[sl.tie]; sl.tieAY = sl.py[sl.tie]; }
      for (let i = 0; i < NN; i++) {
        if (fresh && snap) { sl.hx[i] = sl.bx[i]; sl.hy[i] = sl.by[i]; sl.comp[i] = sl.compB[i]; }
        else if (fresh) { sl.hx[i] = sl.bx[2]; sl.hy[i] = sl.by[2]; sl.ux[i] = sl.uy[i] = sl.vx[i] = sl.vy[i] = 0; }
        sl.ax[i] = sl.hx[i]; sl.ay[i] = sl.hy[i];
        sl.compA[i] = fresh ? sl.compB[i] : sl.comp[i];
      }
      sl.morph = snap ? 1 : 0;
      sl.twist = (sl.index + d) % 2 ? 1 : -1;
      sl.cx = cx; sl.cy = cy;
      sl.def = def; sl.digit = d; sl.x0 = x0; sl.xs = xs; sl.vis = true; sl.leaving = false;

      // Where things attach, from the numeral at rest.
      spline(sl.bx, sl.by, def.strokes, def.corner, tmpX, tmpY);
      const mid = x0 + TUBE / 2 + (off + def.w / 2) * SK_W * xs;
      let best = -1e9;
      const cand = [];
      // a tag under the minutes is tied near the bottom, as far toward its own side as the
      // numeral allows, so the two tags hang clear of each other
      let maxY = 0;
      for (const st of def.strokes) for (let j = st[0] * SUB; j <= st[1] * SUB; j++) maxY = Math.max(maxY, tmpY[j]);
      const target = sl.index === 2 ? 280 : sl.index === 3 ? 822 : mid;
      const pull = sl.row ? 0.45 : 0.14;
      for (const st of def.strokes) {
        for (let j = st[0] * SUB; j <= st[1] * SUB; j++) {
          const score = sl.row && tmpY[j] < maxY - 46 ? -1e8 : tmpY[j] - pull * Math.abs(tmpX[j] - target);
          if (score > best) { best = score; sl.low = j; }
          // icicles: under level runs of tube and under downward ends, where there is room below
          const a = Math.max(st[0] * SUB, j - 1);
          const b = Math.min(st[1] * SUB, j + 1);
          const tx = tmpX[b] - tmpX[a];
          const ty = tmpY[b] - tmpY[a];
          const level = Math.abs(ty) < 0.36 * Math.hypot(tx, ty);
          const end = (j === st[0] * SUB || j === st[1] * SUB) && !st[2] && Math.abs(tx) < Math.abs(ty);
          if (!level && !end) continue;
          // never down into the row below, nor into the tags under the minutes
          const top = tmpY[j] + TUBE / 2 - 14;
          let room = sl.row ? sl.rowY + TUBE + SK_H + 30 - top : ROW_H + TUBE + SK_H + 16 - top;
          for (const s2 of def.strokes) {
            for (let q = s2[0] * SUB; q <= s2[1] * SUB; q++) {
              const dy = tmpY[q] - tmpY[j];
              if (dy > 50 && Math.abs(tmpX[q] - tmpX[j]) < 84) room = Math.min(room, dy - TUBE);
            }
          }
          if (room > 46) cand.push([j, Math.min(room - 8, 112)]);
        }
      }
      sl.tie = sl.low;
      sl.tieY = tmpY[sl.tie] + TUBE / 2 - 5; // where its tag is tied, at rest
      // where the heat makes it drip: low on the numeral, toward the gap between the tags,
      // and only from the underside of a level run of tube (a wide neck) or from a
      // downward-pointing end (a narrow one), so the neck never sticks out into the air
      let bd = -1e9;
      sl.dripW = 0;
      for (const st of def.strokes) {
        const a0 = st[0] * SUB, b0 = st[1] * SUB;
        for (let j = a0; j <= b0; j++) {
          if (tmpY[j] < maxY - 70) continue;
          const a = Math.max(a0, j - 2), b = Math.min(b0, j + 2);
          const tx = tmpX[b] - tmpX[a], ty = tmpY[b] - tmpY[a];
          const inner = j > a0 + SUB / 2 && j < b0 - SUB / 2;
          const level = inner && Math.abs(ty) < 0.22 * Math.hypot(tx, ty);
          const downEnd = !st[2] && (j === a0 || j === b0) && Math.abs(tx) < 0.5 * Math.abs(ty) &&
            tmpY[j] > tmpY[j === a0 ? a0 + 1 : b0 - 1];
          if (!level && !downEnd) continue;
          const sc = tmpY[j] + 0.9 * tmpX[j];
          if (sc > bd) { bd = sc; sl.dripJ = j; sl.dripW = level ? 34 : 10; }
        }
      }
      if (!sl.dripW) { // nothing suitable: the lowest point, with a narrow neck
        for (const st of def.strokes) for (let j = st[0] * SUB + 1; j < st[1] * SUB; j++) if (tmpY[j] > bd) { bd = tmpY[j]; sl.dripJ = j; }
        sl.dripW = 10;
      }
      sl.iceN = 0;
      const pick = rng(seed + d * 31 + sl.index * 7);
      const order = pick.shuffle(cand);
      for (const [j, room] of order) {
        if (sl.iceN >= 3) break;
        let ok = Math.abs(j - sl.tie) > 3 || sl.row === 0;
        for (let k = 0; k < sl.iceN; k++) if (Math.abs(tmpX[sl.ice[k]] - tmpX[j]) < 62) ok = false;
        if (!ok) continue;
        sl.ice[sl.iceN] = j;
        sl.iceLen[sl.iceN] = Math.min(room, pick.range(44, 112));
        sl.iceN++;
      }
      sl.iceGrow = snap ? 1 : 0;
    }

    // ----- AM / PM -----
    const mini = { letters: [], tieL: 1, tieJ: 0, tieX0: 0, x: 0, y: ROW_H, ux: 0, uy: 0, vx: 0, vy: 0, key: "", tieX: 0, tieY: 0, width: 0 };
    const MP = 64;
    function buildMini(letter) {
      const def = MINIS[letter];
      const n = def.p.length;
      const nx = f32(n), ny = f32(n);
      for (let i = 0; i < n; i++) { nx[i] = def.p[i][0] * def.w; ny[i] = def.p[i][1] * MINI_H; }
      const corner = new Uint8Array(n);
      for (const i of def.c) corner[i] = 1;
      const bx = f32(MP), by = f32(MP);
      spline(nx, ny, def.s, corner, bx, by);
      return { def, bx, by, px: f32(MP), py: f32(MP), ox: 0, glint: R.range(0, 30) };
    }
    const miniCache = { A: buildMini("A"), P: buildMini("P"), M: buildMini("M") };
    // When the hours change width (9 -> 10, 12 -> 1, 11 -> 12) AM/PM and its tag slide to
    // their new place with the twist of the numerals, instead of jumping there in one frame.
    let glide = null;
    function setMini(ampm, zoneL, snap) {
      const c0 = mini.tieX0 + tagTemp.shift; // where the card hangs now
      mini.letters = [miniCache[ampm[0]], miniCache.M];
      const w0 = mini.letters[0].def.w + MINI;
      const w1 = mini.letters[1].def.w + MINI;
      mini.width = w0 + 12 + w1;
      const cxm = Math.min((zoneL + 1016) / 2, 846);
      const x1 = Math.round(cxm - mini.width / 2);
      mini.letters[0].ox = MINI / 2;
      mini.letters[1].ox = w0 + 12 + MINI / 2;
      mini.key = ampm;
      // the temperature tag hangs from whichever foot leaves it the most room
      const mid = (zoneL + 1016) / 2;
      const feet = [[0, 0], [1, 0], [1, (MINIS.M.p.length - 1) * SUB]];
      let best = 1e9, tieX0 = 0;
      for (const [li, j] of feet) {
        const L = mini.letters[li];
        const fx = x1 + L.ox + L.bx[j];
        if (Math.abs(fx - mid) < best) { best = Math.abs(fx - mid); mini.tieL = li; mini.tieJ = j; tieX0 = fx; }
      }
      // the card fills the room between the hours and the frame, its hole off centre if need be
      const w = Math.round(clamp(1018 - zoneL, 236, 360));
      const centre = clamp(tieX0, zoneL + w / 2, 1018 - w / 2);
      const c1 = tieX0 + Math.round(clamp(centre - tieX0, -w / 2 + 50, w / 2 - 50));
      const first = shown.tw === undefined;
      if (snap || first || (Math.abs(x1 - mini.x) < 0.5 && w === tagTemp.w && Math.abs(c1 - c0) < 1)) {
        glide = null;
        mini.x = x1;
        const resize = first || w !== tagTemp.w;
        if (first) { shown.tw = w; tagTemp.w = -1; }
        placeTemp(c1, w);
        if (resize) fitTemp();
        return;
      }
      glide = { t: 0, x0: mini.x, x1, c0, c1, w0: tagTemp.w, w1: w };
      // the type is fitted to the narrower of the two cards, so it fits all the way across
      const wm = Math.min(tagTemp.w, w);
      if (wm < tagTemp.w) {
        const keep = tagTemp.w;
        tagTemp.w = wm; tagTemp.card.style.width = `${wm}px`;
        fitTemp();
        tagTemp.w = keep; tagTemp.card.style.width = `${keep}px`;
      }
    }
    function placeTemp(c, w) {
      if (w !== tagTemp.w) {
        tagTemp.w = w;
        tagTemp.card.style.width = `${w}px`;
        tagTemp.ss = ""; // re-centre card and hole on the next placement
      }
      const L = mini.letters[mini.tieL];
      mini.tieX0 = mini.x + L.ox + L.bx[mini.tieJ];
      tagTemp.shift = Math.round(clamp(c - mini.tieX0, -w / 2 + 50, w / 2 - 50));
    }
    function glideMini(dt) {
      if (!glide) return;
      const t = (glide.t = Math.min(1, glide.t + dt / lerp(0.95, 1.5, P.heat)));
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // the numerals' own easing
      mini.x = lerp(glide.x0, glide.x1, e);
      placeTemp(lerp(glide.c0, glide.c1, e), Math.round(lerp(glide.w0, glide.w1, e)));
      if (t >= 1) { glide = null; fitTemp(); }
    }
    function fitTemp() {
      if (shown.temp === undefined) return;
      fitText(T.temp, tagTemp.w - 34, 190);
      // the condition is set smaller (never under 44 px) to stay on one line; only what
      // still does not fit wraps, by word, with the lines well apart
      let fs = 54;
      const over = () => T.cond.scrollWidth > T.cond.clientWidth + 1 || T.cond.offsetHeight > fs + 42 + 4;
      T.cond.style.padding = "";
      T.cond.style.fontSize = `${fs}px`;
      while (fs > 44 && over()) { fs -= 2; T.cond.style.fontSize = `${fs}px`; }
      if (!over()) {
        // on one line: keep it off the edges of the card as well, where it can still be 44 px
        T.cond.style.padding = "0 12px";
        while (fs > 44 && over()) { fs -= 2; T.cond.style.fontSize = `${fs}px`; }
        if (over()) T.cond.style.padding = "";
      }
      tagTemp.h = tagTemp.card.offsetHeight || tagTemp.h;
    }

    let timeKey = "";
    let zoneL = 0;
    function layout(s, snap) {
      const hh = s.text.hh;
      const mm = s.text.mm;
      const hourChanged = shown.hh !== undefined && shown.hh !== hh;
      shown.hh = hh;
      const two = hh.length === 2;
      const h1 = slots[0], h2 = slots[1];
      let x = two ? 64 : LEFT;
      if (two) {
        const d = +hh[0];
        if (h1.digit !== d || !h1.vis) setDigit(h1, d, x, 1, false, snap);
        x += DIGITS[d].w * SK_W + TUBE + 6;
      } else if (snap) { h1.vis = false; h1.leaving = false; }
      else if (h1.vis && !h1.leaving) {
        // the first hour numeral is drawn in toward its top and let go: the reverse of how
        // one appears, rather than vanishing from one frame to the next
        for (let i = 0; i < NN; i++) {
          h1.ax[i] = h1.hx[i]; h1.ay[i] = h1.hy[i];
          h1.bx[i] = h1.hx[2]; h1.by[i] = h1.hy[2];
          h1.compA[i] = h1.comp[i];
        }
        h1.morph = 0;
        h1.leaving = true;
      }
      const dh = +hh[hh.length - 1];
      const xs = two ? 0.82 : 1;
      if (h2.digit !== dh || h2.x0 !== x || h2.xs !== xs || !h2.vis) setDigit(h2, dh, x, xs, false, snap);
      zoneL = x + DIGITS[dh].w * SK_W * xs + TUBE + 48; // clear air beside the hours
      for (let k = 0; k < 2; k++) {
        const sl = slots[2 + k];
        const d = +mm[k];
        if (sl.digit !== d || !sl.vis) setDigit(sl, d, LEFT + k * (CELL + CELL_GAP), 1, true, snap);
      }
      setMini(s.text.ampm, zoneL, snap);
      if (hourChanged && !snap) for (const sl of slots) for (let i = 0; i < NN; i++) sl.vy[i] -= 260 * sl.comp[i];
    }

    // ----- weather particles -----
    const NR = 300;
    const rx = f32(NR), ry = f32(NR), rvx = f32(NR), rvy = f32(NR), rtt = f32(NR), rlat = f32(NR);
    const rslot = new Int8Array(NR), rpt = new Int16Array(NR), ron = new Uint8Array(NR);
    let hitBudget = 0;
    const ND = 28;
    const dslot = new Int8Array(ND).fill(-1), dpt = new Int16Array(ND), dlat = f32(ND), dage = f32(ND).fill(9);
    let dnext = 0;
    const NS = 260;
    const sx = f32(NS), sy = f32(NS), ssz = f32(NS), sph = f32(NS);
    for (let i = 0; i < NS; i++) { sx[i] = R.range(-100, W + 100); sy[i] = R.range(-40, H + 40); ssz[i] = R.range(2.4, 6.4); sph[i] = R.range(0, TAU); }

    // fog: soft banks of light lying in the ground behind the tubes (painted into the
    // ground itself, so no extra layer), and a veil over the tube colours (see palette)
    const fogBanks = [];
    for (let i = 0; i < 4; i++) {
      fogBanks.push([Math.round(R.range(70, 95)), Math.round(R.range(16, 22)), Math.round(R.range(10, 90)), Math.round(8 + i * 26 + R.range(-6, 6))]);
    }
    // A bank's white, as a share of its peak, at r (0 its centre, 1 its rim).
    const bankRel = (r) => (r >= 1 ? 0 : r < 0.5 ? 1 - 1.2 * r : 0.8 * (1 - r));
    // The foot of the time, in % of the height: the minutes row (bottom at 1174 px) with
    // room for its sag and for the ground right beside it.
    const TIME_FOOT = 66;
    const fogPeak = [0, 0, 0, 0];
    // The peak white of each bank, given the most white the fog may lay anywhere behind or
    // beside the time (room): the banks over the time are held to it, overlaps included,
    // and a bank lying below the time keeps as much as its tail allows.
    function fogLimit(want, room) {
      const peaks = (t) => {
        for (let i = 0; i < fogBanks.length; i++) {
          const [, h, , y] = fogBanks[i];
          const rl = bankRel(Math.max(0, (y - TIME_FOOT) / h));
          fogPeak[i] = rl > 0 ? Math.min(want, (t * want) / rl) : want;
        }
      };
      const worst = () => {
        let m = 0;
        for (let yy = 0; yy <= TIME_FOOT; yy++) {
          let clear = 1;
          for (let i = 0; i < fogBanks.length; i++) clear *= 1 - fogPeak[i] * bankRel(Math.abs(yy - fogBanks[i][3]) / fogBanks[i][1]);
          m = Math.max(m, 1 - clear);
        }
        return m;
      };
      peaks(1);
      if (worst() <= room) return;
      let lo = 0, hi = 1;
      for (let k = 0; k < 14; k++) {
        const mid = (lo + hi) / 2;
        peaks(mid);
        if (worst() <= room) lo = mid; else hi = mid;
      }
      peaks(lo);
    }
    // luminance of a ground colour with white laid over it at alpha a (as the browser
    // composites the banks: in sRGB)
    const linC = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    function fogLum(hex, a) {
      const n = parseInt(hex.slice(1), 16);
      const f = (v) => linC(v + a * (255 - v));
      return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
    }
    function fogCss() {
      let out = "";
      for (let i = 0; i < fogBanks.length; i++) {
        const [w, h, x, y] = fogBanks[i];
        const p = fogPeak[i];
        if (p < 0.002) continue;
        out += `radial-gradient(${w}% ${h}% at ${x}% ${y}%, rgba(255,255,255,${p.toFixed(3)}), rgba(255,255,255,${(0.4 * p).toFixed(3)}) 50%, rgba(255,255,255,0)),`;
      }
      return out;
    }

    // drip (one at a time, off the last hour numeral)
    const drip = { phase: R.range(0.25, 0.7), state: 0, y: 0, vy: 0, x: 0, wait: 0, len: 0, pool: 0 };
    let lawTop = 1580;

    // ----- per-frame values -----
    const P = { w2: 81, zeta: 0.2, kc: 60, sag: 0, soft: 1, frost: 0, heat: 0, wx: 1, wy: 0, wind: 0, gust: 0, rainy: 0, snowy: 0, fog: 0, direct: 0, night: 0 };
    const pal = {
      shade: "#000", rim: "#000", shadowA: 0, body: "#888", light: "#999", spec: "#fff", shadow: "rgba(0,0,0,.3)", shx: 12, shy: 18,
      ice: "#fff", iceHi: "#fff", iceSh: "#99b", rain: "rgba(255,255,255,.5)", snow: "#fff", frost: "#fff", string: "#eee",
      dimple: "#000",
    };
    let palClock = 99;
    let lastMs = state.ms;
    let lastStormK = -1;
    let stormPulse = 0;

    function material(s) {
      const w = s.weather;
      const feels = w.live ? w.feels : 60;
      let i = 0;
      while (i < MATERIAL.length - 2 && feels > MATERIAL[i + 1][0]) i++;
      const a = MATERIAL[i], b = MATERIAL[i + 1];
      const k = clamp((feels - a[0]) / (b[0] - a[0]));
      const om = lerp(a[1], b[1], k);
      P.w2 = om * om;
      P.zeta = lerp(a[2], b[2], k);
      P.sag = lerp(a[3], b[3], k);
      P.kc = 0.8 * P.w2;
      P.frost = w.live ? smoothstep(35, 27, feels) : 0;
      P.cold = w.live ? smoothstep(33, 20, feels) : 0;
      P.heat = w.live ? smoothstep(84, 94, feels) : 0;
      P.feels = feels;
      const dir = (w.windDir * Math.PI) / 180;
      P.wx = -Math.sin(dir);
      P.wy = Math.cos(dir);
      P.wind = w.wind;
      P.gust = Math.max(w.gust, w.wind);
      const f = w.falling;
      P.rainy = f && f !== "snow" ? w.intensity : 0;
      P.drizzle = f === "drizzle";
      P.snowy = f === "snow" ? w.intensity : 0;
      P.storm = f === "storm" || w.kind === "storm";
      P.fog = approach(P.fog, w.fog ? 1 : clamp((1.2 - w.visibility) / 1.2) * 0.6, s.dt, 2);
      const cloud = w.cloud / 100;
      const drift = w.kind === "partly" ? 0.5 + 0.5 * noise.n2(s.t * 0.045, 11.3) : 1;
      P.direct = s.daylight * (1 - 0.92 * cloud * drift) * (1 - 0.8 * P.fog) * (f ? 0.3 : 1);
      P.night = 1 - smoothstep(0.04, 0.6, s.daylight);
      P.lowSun = s.sun.alt > 0 ? 1 - smoothstep(4, 40, s.sun.alt) : 0;
      P.moon = s.moon.up ? s.moon.illumination : 0;
    }

    // Wind speed (mph) felt at x just now: gusts roll across the frame downwind.
    function gustAt(x, t) {
      const n = noise.n2(t * 0.32 - x * P.wx * 0.0011, 7.7);
      const fl = noise.n2(t * 1.7 + x * 0.004, 21.3);
      return Math.max(0, P.wind + (P.gust - P.wind) * Math.max(0, n) * 1.15 + P.wind * 0.2 * fl);
    }

    // ----- colours: recomputed a few times a second, they move slowly -----
    // the paper for a given ink (side 0 the light ink, 1 the dark), moved away from the ink
    // just as far as the two need to stand well apart (found exactly, so that the paper
    // moves smoothly with the light instead of in notches)
    const legible = (bg, light, dark, out, side) => {
      const ink = side ? dark : light;
      if (contrast(bg, ink) < 4.7) {
        const l0 = toOklch(bg).l;
        let lo = 0, hi = 0.25;
        if (contrast(adjust(bg, { l: clamp(l0 + (side ? hi : -hi)) }), ink) >= 4.7) {
          for (let i = 0; i < 14; i++) {
            const m = (lo + hi) / 2;
            if (contrast(adjust(bg, { l: clamp(l0 + (side ? m : -m)) }), ink) >= 4.7) hi = m; else lo = m;
          }
        }
        bg = adjust(bg, { l: clamp(l0 + (side ? hi : -hi)) });
      }
      out.bg = bg;
      out.ink = ink;
    };
    const pair = { bg: "", ink: "" };
    // the tags' flip: the side now chosen, where the paper stands between the two (w), and
    // the paper each side would have just now
    const flip = { side: -1, w: 0, paperL: "", paperD: "", stkL: "", stkD: "", rest: "" };
    function palette(s) {
      const day = smoothstep(0.04, 0.6, s.daylight);
      const toy = toOklch(toyColor(P.feels));
      const frost = P.frost;
      const bodyDay = oklch(lerp(toy.l, 0.9, frost * 0.22), toy.c * (1 - 0.25 * frost), toy.h);
      // at night the toy keeps its colour (warm hues lean redder so they stay candy, not mud)
      // and is lit from behind by the city across the river: a bright rim on the far edge
      const warm = toy.h > 30 && toy.h < 120;
      const hN = warm ? toy.h - (toy.h < 72 ? 17 : 14) : toy.h;
      const bodyNight = oklch(0.53, clamp(toy.c * 0.8, warm ? 0.12 : 0.08, 0.14), hN);
      const body = mix(bodyNight, bodyDay, day);
      const b = toOklch(body);
      const flat = Math.max(P.fog * 0.6, 1 - clamp(P.direct * 1.6 + 0.35));
      pal.body = body;
      pal.shade = oklch(b.l * lerp(0.7, 0.8, flat) - 0.03 * (1 - day), b.c * 1.08, b.h + (b.h > 180 ? 10 : -8));
      pal.light = oklch(Math.min(0.96, b.l + lerp(0.065, 0.035, flat)), b.c * 0.86, b.h);
      const specDay = mix(body, "#ffffff", lerp(0.9, 0.42, Math.max(flat * 0.8, frost * 0.5)));
      const specNight = oklch(lerp(0.86, 0.94, P.moon), toy.c * 0.4, hN);
      pal.spec = mix(specNight, specDay, day);
      pal.rim = mix(oklch(0.83, clamp(toy.c * 0.7, 0.06, 0.13), hN), pal.shade, smoothstep(0.1, 0.45, s.daylight));

      // the ground: the measured sky, muted, and deep enough for the tubes to stand off it
      const bl = luminance(body);
      const cap = Math.cbrt(Math.max(0.0015, Math.min(0.15, (bl + 0.05) / 3.5 - 0.05)));
      const tone = (hex, dl) => {
        const c = toOklch(hex);
        const l = Math.min(cap, c.l * lerp(0.32, 0.74, smoothstep(0.05, 0.6, s.daylight))) + dl;
        return oklch(clamp(l, 0.08, cap), c.c * lerp(0.6, 0.8, s.daylight) + 0.008, c.h);
      };
      const skyTop = mix(s.sky.west, s.sky.northWest, 0.5);
      const skyBot = mix(s.sky.east, s.sky.northEast, 0.5);
      let gTop = tone(skyTop, 0);
      let gBot = tone(skyBot, -0.04);
      if (P.fog > 0.02) {
        // fog veils the toy: every tone drifts toward the colour of the fog (at night the
        // fog is lit by the city, a haze about as bright as the tubes, so the veil greys
        // them without sinking them toward the ground)
        const fogC = mix(gTop, "#f2f4f6", lerp(0.5, 0.6, day));
        const v = 0.32 * P.fog;
        pal.body = mix(pal.body, fogC, v); pal.light = mix(pal.light, fogC, v); pal.shade = mix(pal.shade, fogC, v);
        pal.rim = mix(pal.rim, fogC, v); pal.spec = mix(pal.spec, fogC, v * 0.5);
      }
      const fa = Math.round(P.fog * lerp(0.35, 1, 1 - P.night) * 0.85 * 50) / 50;
      if (fa > 0) {
        // the cap must hold for the ground as it is seen, with the banks laid on it, and
        // against the tubes as they are seen, veiled: the brightest the fogged ground may
        // get behind or beside the time (lc) is set from the veiled body. To leave the fog
        // room to show, the bare ground goes down first (at most as far as keeps a share of
        // the banks' white), then the banks over the time take what room is left.
        const want = 0.55 * fa;
        const lc = Math.max(0, (luminance(pal.body) + 0.05) / 3.4 - 0.05);
        const sc = lc <= 0.0031308 ? 12.92 * lc : 1.055 * lc ** (1 / 2.4) - 0.055;
        const keep = Math.min(want, 0.4 * sc);
        const over = (a) => Math.max(fogLum(gTop, a), fogLum(gBot, a));
        if (over(keep) > lc) {
          let lo = 0, hi = 0.4;
          for (let k = 0; k < 14; k++) {
            const m = (lo + hi) / 2;
            gTop = tone(skyTop, -m); gBot = tone(skyBot, -0.04 - m);
            if (over(keep) > lc) lo = m; else hi = m;
          }
          gTop = tone(skyTop, -hi); gBot = tone(skyBot, -0.04 - hi);
        }
        let room = 0;
        if (over(0) < lc) {
          let lo = 0, hi = want;
          for (let k = 0; k < 14; k++) {
            const m = (lo + hi) / 2;
            if (over(m) > lc) hi = m; else lo = m;
          }
          room = lo;
        }
        fogLimit(want, room);
      }
      const g = `${fa > 0 ? fogCss() : ""}linear-gradient(172deg, ${gTop} 8%, ${gBot} 92%)`;
      if (shown.g !== g) { shown.g = g; ground.style.background = g; }
      const gl = toOklch(gTop);
      pal.shadowA = lerp(0.16, 0.6, clamp(P.direct * 1.2)) * (0.3 + 0.7 * day);
      pal.shadow = rgba(oklch(gl.l * 0.5, gl.c, gl.h), pal.shadowA);
      const reach = lerp(12, 22 + 30 * P.lowSun, clamp(P.direct * 1.3));
      pal.shx = reach * 0.62;
      pal.shy = reach * 0.9;
      pal.dimple = pal.shade;
      pal.ice = mix(body, lerp(0, 1, day) > 0.5 ? "#f4fbff" : "#b9c9d8", 0.62);
      pal.iceHi = mix(pal.spec, "#ffffff", 0.5 * day);
      pal.iceSh = mix(pal.shade, pal.ice, 0.45);
      pal.rain = rgba(mix(gTop, "#eaf4ff", lerp(0.5, 0.86, day)), lerp(0.5, 0.62, day));
      pal.snow = mix(gTop, "#ffffff", lerp(0.74, 0.95, day));
      pal.frost = mix(body, "#ffffff", lerp(0.5, 0.9, day));
      pal.string = mix(gTop, "#f1e8d4", lerp(0.4, 0.92, day));

      // paper and ink flip together where the paper passes mid-grey. Each side is taken
      // outright (pale ink on dark paper, or dark ink on light paper), chosen with some
      // hysteresis so it cannot flicker, and the paper crosses from one to the other in
      // about a second (see tagInk), never minutes of mid-grey paper.
      const pk = smoothstep(0.22, 0.55, s.daylight);
      const side = flip.side < 0 ? (pk > 0.41 ? 1 : 0) : flip.side ? (pk < 0.39 ? 0 : 1) : (pk > 0.43 ? 1 : 0);
      if (flip.side < 0) flip.w = side;
      flip.side = side;
      const paperBase = mix("#302f2d", "#f3ead6", pk);
      const stkBase = mix(oklch(0.36, Math.min(toy.c, 0.09), toy.h), bodyDay, pk);
      legible(paperBase, "#efe5d0", "#1b2030", pair, 0); flip.paperL = pair.bg;
      legible(paperBase, "#efe5d0", "#1b2030", pair, 1); flip.paperD = pair.bg;
      legible(stkBase, "#f6eedd", "#1b2030", pair, 0); flip.stkL = pair.bg;
      legible(stkBase, "#f6eedd", "#1b2030", pair, 1); flip.stkD = pair.bg;
      flip.rest = `;--string:${pal.string};--hole:${mix(gTop, gBot, 0.4)};--tsh:${(0.1 + 0.3 * clamp(P.direct * 1.2)).toFixed(2)};--shx:${(pal.shx * 0.5).toFixed(1)}px;--shy:${(pal.shy * 0.5).toFixed(1)}px`;
      tagInk();
    }
    // The tags' paper and ink, from where the flip stands (flip.w: 0 the dark-paper side,
    // 1 the light-paper side). At rest the paper is exactly the chosen side's; while it
    // crosses, each ink is whichever of the two stands further from the paper under it.
    function tagInk() {
      const e = flip.w * flip.w * (3 - 2 * flip.w);
      const paper = e <= 0 ? flip.paperL : e >= 1 ? flip.paperD : mix(flip.paperL, flip.paperD, e);
      const stk = e <= 0 ? flip.stkL : e >= 1 ? flip.stkD : mix(flip.stkL, flip.stkD, e);
      const ink = readableOn(paper, "#efe5d0", "#1b2030");
      const stkInk = readableOn(stk, "#f6eedd", "#1b2030");
      // the quiet labels are the ink let toward the paper, less so where the paper is mid-grey
      // (as it is through twilight), so that they never sink into it
      const quiet = 0.24 * smoothstep(4.7, 7, contrast(paper, ink));
      const css = `--paper:${paper};--ink:${ink};--ink2:${mix(ink, paper, quiet)};--stk:${stk};--stkink:${stkInk};` +
        `--stkrim:${rgba(stkInk, 0.16)};--fold:${mix(paper, stk, 0.85)};--rule:${mix(paper, ink, 0.16)}${flip.rest}`;
      if (shown.css !== css) { shown.css = css; wrap.style.cssText = css; }
    }

    // ----- physics -----
    function forces(s) {
      const t = s.t;
      for (const sl of slots) {
        if (!sl.vis) continue;
        const mph = gustAt(sl.cx, t);
        const acc = 12 * Math.pow(mph, 1.45);
        sl.wax = P.wx * acc;
        sl.way = P.wy * acc * 0.3;
        // the hours slump onto the minutes but are not let sink into them, so the time stays crisp
        const sagF = ((sl.row ? P.sag : Math.min(P.sag, 30)) * P.w2) / 1.82;
        for (let i = 0; i < NN; i++) {
          // still air is never quite still: a slow breathing
          sl.fx[i] = sl.wax * (0.75 + 0.5 * noise.n2(i * 0.31 + sl.index * 5.1, t * 0.9)) + 150 * noise.n2(i * 0.23 + sl.index * 9.7, t * 0.21);
          sl.fy[i] = sl.way + 120 * noise.n2(i * 0.23 + sl.index * 3.3 + 40, t * 0.17) + sagF;
        }
      }
    }
    function stepSlots(h) {
      for (const sl of slots) {
        if (!sl.vis) continue;
        const { ux, uy, vx, vy, comp, fx, fy } = sl;
        const strokes = sl.def.strokes;
        const big = sl.morph < 1 ? 190 : 0;
        for (let k = 0; k < strokes.length; k++) {
          const a = strokes[k][0], b = strokes[k][1];
          for (let i = a; i <= b; i++) {
            const kk = P.w2 / comp[i];
            const c = 2 * P.zeta * Math.sqrt(kk);
            const il = i > a ? i - 1 : i, ir = i < b ? i + 1 : i;
            const axx = -kk * ux[i] + P.kc * (ux[il] + ux[ir] - 2 * ux[i]) + fx[i];
            const ayy = -kk * uy[i] + P.kc * (uy[il] + uy[ir] - 2 * uy[i]) + fy[i];
            vx[i] = (vx[i] + axx * h) / (1 + c * h);
            vy[i] = (vy[i] + ayy * h) / (1 + c * h);
          }
        }
        for (let i = 0; i < NN; i++) {
          ux[i] += vx[i] * h;
          uy[i] += vy[i] * h;
          const max = 26 + 36 * comp[i] + big; // the skeleton may bend, never collapse
          const r = Math.hypot(ux[i], uy[i]);
          if (r > max) { const q = max / r; ux[i] *= q; uy[i] *= q; vx[i] *= 0.8; vy[i] *= 0.8; }
        }
        for (let k = 0; k < strokes.length; k++) {
          if (!strokes[k][2]) continue; // a ring's two ends are one point
          const a = strokes[k][0], b = strokes[k][1];
          ux[a] = ux[b] = (ux[a] + ux[b]) / 2; uy[a] = uy[b] = (uy[a] + uy[b]) / 2;
          vx[a] = vx[b] = (vx[a] + vx[b]) / 2; vy[a] = vy[b] = (vy[a] + vy[b]) / 2;
        }
      }
    }
    // The balloon twist: the home of each node travels from the old numeral to
    // the new one, a little later for each node along the tube, swinging round
    // the middle on the way. The rubber follows with its own lag and overshoot.
    function morphs(dt) {
      const dur = lerp(0.95, 1.5, P.heat);
      for (const sl of slots) {
        if (!sl.vis || sl.morph >= 1) continue;
        sl.morph = Math.min(1, sl.morph + dt / dur);
        for (let i = 0; i < NN; i++) {
          let e = clamp(sl.morph * 1.5 - 0.5 * (i / (NN - 1)));
          e = e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2;
          const bx = lerp(sl.ax[i], sl.bx[i], e) - sl.cx;
          const by = lerp(sl.ay[i], sl.by[i], e) - sl.cy;
          const sw = Math.sin(Math.PI * e);
          const ang = sl.twist * 0.75 * sw;
          const sc = 1 - 0.2 * sw;
          const ca = Math.cos(ang) * sc, sa = Math.sin(ang) * sc;
          const nx = sl.cx + bx * ca - by * sa;
          const ny = sl.cy + bx * sa + by * ca;
          sl.ux[i] -= (nx - sl.hx[i]) * 0.8;
          sl.uy[i] -= (ny - sl.hy[i]) * 0.8;
          sl.hx[i] = nx; sl.hy[i] = ny;
          sl.comp[i] = lerp(sl.compA[i], sl.compB[i], e);
        }
        if (sl.morph >= 1 && sl.leaving) { sl.vis = false; sl.leaving = false; }
      }
    }
    // a numeral being let go thins out to nothing as it is drawn in
    const thick = (sl) => (sl.leaving ? 1 - smoothstep(0.45, 1, sl.morph) : 1);
    function shape() {
      for (const sl of slots) {
        if (!sl.vis) continue;
        for (let i = 0; i < NN; i++) { tmpNX[i] = sl.hx[i] + sl.ux[i]; tmpNY[i] = sl.hy[i] + sl.uy[i]; }
        spline(tmpNX, tmpNY, sl.def.strokes, sl.def.corner, sl.px, sl.py);
      }
    }
    const tmpNX = f32(NN), tmpNY = f32(NN);

    function stepMini(s, dt) {
      const mph = gustAt(mini.x, s.t);
      const acc = 12 * Math.pow(mph, 1.45) * 0.35;
      const k = P.w2 * 2.2, c = 2 * Math.min(1, P.zeta * 1.6) * Math.sqrt(k);
      const fxm = P.wx * acc + 240 * noise.n2(s.t * 0.23, 91.1) - tagTemp.th * 500;
      const fym = 200 * noise.n2(s.t * 0.19, 55.5) + P.sag * k * 0.2;
      mini.vx = (mini.vx + (-k * mini.ux + fxm) * dt) / (1 + c * dt);
      mini.vy = (mini.vy + (-k * mini.uy + fym) * dt) / (1 + c * dt);
      mini.ux = clamp(mini.ux + mini.vx * dt, -24, 24);
      mini.uy = clamp(mini.uy + mini.vy * dt, -18, 24);
    }
    function shapeMini() {
      const rot = mini.ux * 0.004;
      const ca = Math.cos(rot), sa = Math.sin(rot);
      for (const L of mini.letters) {
        const n = (L.def.p.length - 1) * SUB + 1;
        for (let j = 0; j < n; j++) {
          const x = L.bx[j] + L.ox - mini.width / 2, y = L.by[j];
          L.px[j] = mini.x + mini.width / 2 + mini.ux + x * ca - y * sa;
          L.py[j] = mini.y + MINI / 2 + mini.uy + x * sa + y * ca;
        }
      }
      const L = mini.letters[mini.tieL];
      mini.tieX = L.px[mini.tieJ];
      mini.tieY = L.py[mini.tieJ];
    }

    // Tags: a string on a knot and a card on the string, both swinging.
    function stepTags(s, dt, snap) {
      // the two tags under the minutes keep clear of each other and of the frame: when their
      // knots are close, each card slides along its string (the hole sits off centre)
      {
        // The cards also make room for the way the wind will swing them: in a steady
        // wind each one rests leaning downwind, its foot moved by about D px.
        const A = tags[1], B = tags[2];
        const leanM = Math.sin(Math.atan(Math.tan(clamp(P.wind * 0.011, 0, 0.6))));
        const DA = P.wx * leanM * (A.len + A.h), DB = P.wx * leanM * (B.len + B.h);
        const L2 = A.x - A.w / 2 + Math.min(0, DA), R2 = A.x + A.w / 2, L3 = B.x - B.w / 2, R3 = B.x + B.w / 2 + Math.max(0, DB);
        let a = Math.max(0, 60 - L2), b = -Math.max(0, R3 - 1020);
        const need = Math.max(0, 48 - (L3 + b - (R2 + a)));
        const roomA = Math.max(0, L2 + a - 60), roomB = Math.max(0, 1020 - (R3 + b));
        let da = need / 2, db = need / 2;
        if (da > roomA) { db += da - roomA; da = roomA; }
        if (db > roomB) { da = Math.min(roomA, da + db - roomB); db = roomB; }
        A.shiftT = clamp(a - da, -A.w / 2 + 44, A.w / 2 - 44);
        B.shiftT = clamp(b + db, -B.w / 2 + 44, B.w / 2 - 44);
        A.shift = snap ? A.shiftT : approach(A.shift, A.shiftT, dt, 0.2);
        B.shift = snap ? B.shiftT : approach(B.shift, B.shiftT, dt, 0.2);
      }
      for (let k = 0; k < 3; k++) {
        const tg = tags[k];
        let tx, ty, pvx;
        if (k === 0) { tx = mini.tieX; ty = mini.tieY + MINI / 2 - 3; pvx = mini.vx; }
        else {
          const sl = slots[1 + k];
          tx = sl.px[sl.tie]; ty = sl.py[sl.tie] + TUBE / 2 - 5;
          if (sl.morph < 1) {
            const e = smoothstep(0.35, 1, sl.morph);
            tx = lerp(sl.tieAX, tx, e); ty = lerp(sl.tieAY + TUBE / 2 - 5, ty, e);
          }
          pvx = sl.vx[Math.round(sl.tie / SUB)];
        }
        if (snap) { tg.x = tx; tg.y = ty; }
        else { tg.x = approach(tg.x, tx, dt, 0.09); tg.y = approach(tg.y, ty, dt, 0.09); }
        const arm = tg.len + tg.h * 0.55;
        const mph = gustAt(tx, s.t + 0.4 + k);
        const lean = Math.tan(clamp(mph * 0.011, 0, 0.6)); // paper catches a lot of air
        const g = 2300;
        const w0 = g / arm;
        const flutter = noise.n2(s.t * 2.3 + k * 13, 3.3) * mph * 0.01 + noise.n2(s.t * 0.3 + k * 7, 8.8) * 0.02;
        // (a positive angle swings the foot to the left, so an eastward wind is a negative push)
        const acc = -w0 * Math.sin(tg.th) - w0 * (P.wx * lean + flutter) * Math.cos(tg.th) - ((pvx - tg.pvx) / Math.max(dt, 0.008)) / arm * 0.5;
        tg.pvx = pvx;
        tg.om = (tg.om + acc * dt) / (1 + 0.55 * dt);
        tg.th += tg.om * dt;
        // keep the card inside the frame (and off the numerals) however hard it blows
        const cx = tx + tg.shift;
        let roomR = (k === 0 ? 1040 : 1030) - (cx + tg.w / 2);
        let roomL = k === 0 ? cx - tg.w / 2 - (zoneL + 4) : cx - tg.w / 2 - 50;
        if (k === 1) roomR = Math.min(roomR, tags[2].x + tags[2].shift - tags[2].w / 2 - (cx + tg.w / 2) - 30);
        if (k === 2) roomL = Math.min(roomL, cx - tg.w / 2 - (tags[1].x + tags[1].shift + tags[1].w / 2) - 30);
        const full = tg.len + tg.h;
        // ... and its low corner off the label at the foot: a tilted card drops one corner
        const tilt = k === 0 ? 0.42 : clamp((lawTop - LAW_AIR + 12 - (ty + full)) / (tg.w / 2 + Math.abs(tg.shift)), 0.015, 0.42);
        const hi = Math.min(tilt, clamp(roomL / full, 0.015, 0.42)), lo = -Math.min(tilt, clamp(roomR / full, 0.015, 0.42));
        if (tg.th > hi) { tg.th = hi + (tg.th - hi) * 0.5; if (tg.om > 0) tg.om *= 0.6; }
        if (tg.th < lo) { tg.th = lo + (tg.th - lo) * 0.5; if (tg.om < 0) tg.om *= 0.6; }
        // the card turns on its hole, a beat behind the string
        const pacc = -60 * (tg.ph + tg.th * 0.25) - acc * 0.5 + noise.n2(s.t * 3.1 + k * 5, 17.1) * mph * 0.5;
        tg.pom = (tg.pom + pacc * dt) / (1 + 3.4 * dt);
        const phMax = Math.min(clamp(Math.max(0, Math.min(roomL, roomR)) / tg.h + 0.035, 0.035, 0.16), Math.max(0.012, tilt - Math.abs(tg.th))); // tight quarters: less turn
        tg.ph = clamp(tg.ph + tg.pom * dt, -phMax, phMax);
      }
    }
    function placeTags() {
      for (const tg of tags) {
        const a = `translate(${tg.x.toFixed(1)}px,${tg.y.toFixed(1)}px) rotate(${tg.th.toFixed(4)}rad)`;
        if (a !== tg.sx) { tg.sx = a; tg.node.style.transform = a; }
        const b = `rotate(${tg.ph.toFixed(4)}rad)`;
        if (b !== tg.sc) { tg.sc = b; tg.card.style.transform = b; }
        const sh = Math.round(tg.shift);
        if (sh !== tg.ss) {
          tg.ss = sh;
          const hx = tg.w / 2 - sh;
          tg.card.style.left = `${-hx}px`;
          tg.card.style.transformOrigin = `${hx}px 26px`;
          tg.hole.style.left = `${hx}px`;
        }
      }
    }

    // ----- drawing -----
    function trace(px, py, a, b, ox, oy) {
      ctx.moveTo(px[a] + ox, py[a] + oy);
      for (let j = a + 1; j <= b; j++) ctx.lineTo(px[j] + ox, py[j] + oy);
    }
    // part of the polyline between fractional indices
    function span(px, py, a, b, ox, oy) {
      const ia = Math.floor(a), fa = a - ia;
      ctx.moveTo(px[ia] + (px[ia + 1] - px[ia]) * fa + ox, py[ia] + (py[ia + 1] - py[ia]) * fa + oy);
      const ib = Math.floor(b), fb = b - ib;
      for (let j = ia + 1; j <= ib; j++) ctx.lineTo(px[j] + ox, py[j] + oy);
      if (fb > 0.001) ctx.lineTo(px[ib] + (px[ib + 1] - px[ib]) * fb + ox, py[ib] + (py[ib + 1] - py[ib]) * fb + oy);
    }
    // One sub-stroke of tube from point A to point B, in three flat tones and
    // a glint. It is laid down in pieces along its length so that where the
    // tube crosses itself the later part lies on top.
    function tube(px, py, A, B, w, phase, piece) {
      const bo = w * 0.062, lo = w * 0.2, so = w * (0.33 + 0.07 * P.night);
      const bw = w * 0.875, lw = w * 0.4, sw = w * lerp(0.085, 0.05, P.night);
      const on = lerp(13, 30, P.night); // the glint closes into a continuous rim at night
      ctx.lineJoin = "round";
      for (let s0 = A; s0 < B; s0 += piece) {
        let e = Math.min(B, s0 + piece);
        if (B - e < 5) e = B;
        const first = s0 === A, last = e === B;
        ctx.lineCap = "butt";
        ctx.strokeStyle = ctx.fillStyle = pal.rim;
        ctx.lineWidth = w;
        ctx.beginPath(); trace(px, py, Math.max(A, s0 - 1), e, 0, 0); ctx.stroke();
        if (first || last) {
          ctx.beginPath();
          if (first) ctx.arc(px[A], py[A], w / 2, 0, TAU);
          if (last) { ctx.moveTo(px[B] + w / 2, py[B]); ctx.arc(px[B], py[B], w / 2, 0, TAU); }
          ctx.fill();
        }
        ctx.strokeStyle = ctx.fillStyle = pal.body;
        ctx.lineWidth = bw;
        ctx.beginPath(); trace(px, py, Math.max(A, s0 - 2), e, LX * bo, LY * bo); ctx.stroke();
        if (first || last) {
          ctx.beginPath();
          if (first) ctx.arc(px[A] + LX * bo, py[A] + LY * bo, bw / 2, 0, TAU);
          if (last) { ctx.moveTo(px[B] + LX * bo + bw / 2, py[B] + LY * bo); ctx.arc(px[B] + LX * bo, py[B] + LY * bo, bw / 2, 0, TAU); }
          ctx.fill();
        }
        ctx.lineCap = "round";
        ctx.strokeStyle = pal.light;
        ctx.lineWidth = lw;
        const la = Math.max(A + 1, s0 - 4), lb = Math.min(e, B - 1);
        if (lb > la) { ctx.beginPath(); trace(px, py, la, lb, LX * lo, LY * lo); ctx.stroke(); }
        // glints: a long one, a gap, a dot
        ctx.strokeStyle = pal.spec;
        ctx.lineWidth = sw;
        const ga = Math.max(A + 2, s0 - 9), gb = Math.min(e, B - 2);
        ctx.beginPath();
        let any = false;
        for (let base0 = A + phase - 30; base0 < gb; base0 += 30) {
          let a1 = Math.max(ga, base0 + 1), b1 = Math.min(gb, base0 + 1 + on);
          if (b1 - a1 > 0.05) { span(px, py, a1, b1, LX * so, LY * so); any = true; }
          if (on < 20) {
            a1 = Math.max(ga, base0 + on + 5); b1 = Math.min(gb, base0 + on + 5.8);
            if (b1 - a1 > 0.05) { span(px, py, a1, b1, LX * so, LY * so); any = true; }
          }
        }
        if (any) ctx.stroke();
      }
    }

    function drawShadows() {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (pal.shadowA > 0.06) { // in the dark there is no cast shadow to speak of: skip the fill
        ctx.strokeStyle = pal.shadow;
        ctx.lineWidth = TUBE;
        ctx.beginPath();
        for (const sl of slots) {
          if (!sl.vis || sl.leaving) continue;
          for (const st of sl.def.strokes) trace(sl.px, sl.py, st[0] * SUB, st[1] * SUB, pal.shx, pal.shy);
        }
        ctx.stroke();
        for (const sl of slots) {
          if (!sl.vis || !sl.leaving || thick(sl) < 0.02) continue;
          ctx.lineWidth = TUBE * thick(sl);
          ctx.beginPath();
          for (const st of sl.def.strokes) trace(sl.px, sl.py, st[0] * SUB, st[1] * SUB, pal.shx, pal.shy);
          ctx.stroke();
        }
        ctx.lineWidth = MINI;
        ctx.beginPath();
        for (const L of mini.letters) for (const st of L.def.s) trace(L.px, L.py, st[0] * SUB, st[1] * SUB, pal.shx * 0.5, pal.shy * 0.5);
        ctx.stroke();
      }
    }

    function drawIcicles(sl) {
      const grow = P.cold * sl.iceGrow * thick(sl);
      if (grow < 0.03) return;
      const n = P.feels < 21 ? sl.iceN : Math.min(sl.iceN, 2);
      for (let k = 0; k < n; k++) {
        const j = sl.ice[k];
        const x = sl.px[j], y = sl.py[j] + TUBE / 2 - 14;
        const len = sl.iceLen[k] * grow + 14;
        const hw = 10 + len * 0.085;
        ctx.fillStyle = pal.iceSh;
        ctx.beginPath();
        ctx.moveTo(x - hw, y); ctx.lineTo(x + hw, y); ctx.quadraticCurveTo(x + hw * 0.45, y + len * 0.5, x + 2.5, y + len);
        ctx.quadraticCurveTo(x, y + len + 3, x - 1.5, y + len); ctx.quadraticCurveTo(x - hw * 0.5, y + len * 0.5, x - hw, y);
        ctx.fill();
        ctx.fillStyle = pal.ice;
        ctx.beginPath();
        ctx.moveTo(x - hw, y); ctx.lineTo(x + hw * 0.35, y); ctx.quadraticCurveTo(x + hw * 0.1, y + len * 0.5, x, y + len * 0.96);
        ctx.quadraticCurveTo(x - hw * 0.5, y + len * 0.5, x - hw, y);
        ctx.fill();
        ctx.strokeStyle = pal.iceHi;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(x - hw * 0.5, y + 16); ctx.lineTo(x - hw * 0.2, y + len * 0.55); ctx.stroke();
      }
    }

    function drawFrost(sl, t) {
      if (P.frost < 0.03) return;
      const strokes = sl.def.strokes;
      ctx.fillStyle = pal.frost;
      for (let pass = 0; pass < 2; pass++) {
        // two interleaved sets that brighten and fade against each other: a slow glitter
        ctx.globalAlpha = P.frost * thick(sl) * (0.62 + 0.3 * Math.sin(t * 0.7 + pass * Math.PI + sl.index));
        ctx.beginPath();
        for (let i = pass; i < 72; i += 2) {
          const st = strokes[i % strokes.length];
          const a = st[0] * SUB, b = st[1] * SUB;
          const j = Math.min(b - 1, Math.max(a + 1, Math.round(a + sl.frostF[i] * (b - a))));
          const tx = sl.px[j + 1] - sl.px[j - 1], ty = sl.py[j + 1] - sl.py[j - 1];
          const q = (sl.frostL[i] * TUBE * 0.86) / (Math.hypot(tx, ty) || 1);
          const x = sl.px[j] - ty * q, y = sl.py[j] + tx * q;
          const r = sl.frostS[i];
          ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
          ctx.moveTo(x - r * 0.6, y - r * 0.6); ctx.lineTo(x + r * 0.6, y + r * 0.6); ctx.moveTo(x + r * 0.6, y - r * 0.6); ctx.lineTo(x - r * 0.6, y + r * 0.6);
        }
        ctx.strokeStyle = pal.frost;
        ctx.lineWidth = 1.8;
        ctx.lineCap = "round";
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // the string tied round the tube where a tag hangs
    function drawTies() {
      ctx.strokeStyle = pal.string;
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let k = 2; k < 4; k++) {
        const tg = tags[k - 1];
        const x = tg.x, y = tg.y - TUBE / 2 + 5;
        ctx.moveTo(x - 2, y - TUBE / 2 + 2);
        ctx.quadraticCurveTo(x + 13, y, x, y + TUBE / 2 - 3);
      }
      ctx.moveTo(mini.tieX - MINI / 2 + 1, mini.tieY - 5);
      ctx.quadraticCurveTo(mini.tieX, mini.tieY + 1, mini.tieX + MINI / 2 - 1, mini.tieY - 7);
      ctx.stroke();
    }

    function hitNode(sl, j, ix, iy) {
      const i = clamp(Math.round(j / SUB), 0, NN - 1);
      const soft = Math.min(2.2, 9 / Math.sqrt(P.w2));
      sl.vx[i] += ix * soft; sl.vy[i] += iy * soft;
      if (i > 0) { sl.vx[i - 1] += ix * soft * 0.4; sl.vy[i - 1] += iy * soft * 0.4; }
      if (i < NN - 1) { sl.vx[i + 1] += ix * soft * 0.4; sl.vy[i + 1] += iy * soft * 0.4; }
    }
    function dimple(si, j, lat) {
      dslot[dnext] = si; dpt[dnext] = j; dlat[dnext] = lat; dage[dnext] = 0;
      dnext = (dnext + 1) % ND;
    }
    function randomPoint(sl) {
      const st = sl.def.strokes[R() < 0.5 || sl.def.strokes.length < 2 ? 0 : 1];
      return clamp(Math.round(R.range(st[0] * SUB + 1, st[1] * SUB - 1)), 1, NP - 2);
    }

    function spawnDrop(i, anywhere) {
      const fast = P.drizzle ? 820 : P.storm ? 1750 : 1450;
      const vy = fast * R.range(0.85, 1.15);
      const vxw = P.wx * (P.wind + (P.gust - P.wind) * 0.4) * (P.drizzle ? 9 : 17);
      rvy[i] = vy; rvx[i] = vxw + R.range(-20, 20);
      rtt[i] = -1; rslot[i] = -1;
      if (hitBudget >= 1) {
        // this one is going to land on a numeral
        hitBudget -= 1;
        let si = R.int(0, 3);
        if (!slots[si].vis) si = 1;
        const sl = slots[si];
        const j = randomPoint(sl);
        const tt = anywhere ? R.range(0.05, 0.9) : R.range(0.5, 1.1);
        rslot[i] = si; rpt[i] = j; rlat[i] = R.range(-0.3, 0.3); rtt[i] = tt;
        rx[i] = sl.px[j] - rvx[i] * tt; ry[i] = sl.py[j] - vy * tt;
      } else {
        const lean = (rvx[i] / vy) * H;
        rx[i] = R.range(Math.min(0, -lean) - 40, W + Math.max(0, -lean) + 40);
        ry[i] = anywhere ? R.range(-80, H) : R.range(-260, -40);
      }
    }
    function stepRain(dt, count) {
      hitBudget = Math.min(3, hitBudget + (2.5 + 11 * P.rainy) * dt);
      for (let i = 0; i < NR; i++) {
        if (!ron[i]) {
          if (i < count) { ron[i] = 1; spawnDrop(i, true); }
          continue;
        }
        rx[i] += rvx[i] * dt; ry[i] += rvy[i] * dt;
        if (rtt[i] >= 0) {
          rtt[i] -= dt;
          if (rtt[i] <= 0) {
            const sl = slots[rslot[i]];
            if (sl.vis) { hitNode(sl, rpt[i], rvx[i] * 0.05, P.storm ? 95 : 70); dimple(rslot[i], rpt[i], rlat[i]); }
            if (i < count) spawnDrop(i, false); else ron[i] = 0;
          }
        } else if (ry[i] > H + 80) {
          if (i < count) spawnDrop(i, false); else ron[i] = 0;
        }
      }
    }
    function drawRain() {
      ctx.strokeStyle = pal.rain;
      ctx.lineWidth = P.drizzle ? 2 : 2.6;
      ctx.lineCap = "round";
      const tau = P.drizzle ? 0.03 : 0.036;
      ctx.beginPath();
      for (let i = 0; i < NR; i++) {
        if (!ron[i]) continue;
        ctx.moveTo(rx[i], ry[i]);
        ctx.lineTo(rx[i] - rvx[i] * tau, ry[i] - rvy[i] * tau);
      }
      ctx.stroke();
    }
    function drawDimples(dt) {
      for (let k = 0; k < ND; k++) {
        if (dslot[k] < 0) continue;
        dage[k] += dt;
        const a = dage[k] / 0.75;
        if (a >= 1) { dslot[k] = -1; continue; }
        const sl = slots[dslot[k]];
        if (!sl.vis) continue;
        const j = dpt[k];
        const tx = sl.px[j + 1] - sl.px[j - 1], ty = sl.py[j + 1] - sl.py[j - 1];
        const q = (dlat[k] * TUBE) / (Math.hypot(tx, ty) || 1);
        const x = sl.px[j] - ty * q + LX * 6, y = sl.py[j] + tx * q + LY * 6;
        const grow = 1 - (1 - a) * (1 - a);
        const r = 9 + 15 * grow;
        ctx.globalAlpha = (1 - a) * 0.75;
        ctx.fillStyle = pal.dimple;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.74, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = pal.spec;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, y + 1.5, r, r * 0.74, 0, 0.12 * TAU, 0.38 * TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function stepSnow(s, dt, count) {
      const push = P.wx * (P.wind + (P.gust - P.wind) * (0.5 + 0.5 * noise.n2(s.t * 0.4, 2.2))) * 11;
      for (let i = 0; i < count; i++) {
        const z = ssz[i];
        sx[i] += (push * (0.6 + z * 0.1) + Math.sin(s.t * 0.9 + sph[i]) * 22) * dt;
        sy[i] += (58 + z * 19 + Math.abs(push) * 0.12) * dt;
        if (sy[i] > H + 20) { sy[i] = -20; sx[i] = R.range(-200, W + 200); }
        if (sx[i] > W + 220) sx[i] -= W + 420;
        else if (sx[i] < -220) sx[i] += W + 420;
      }
      return push;
    }
    function drawSnow(count, push) {
      ctx.strokeStyle = pal.snow;
      ctx.lineCap = "round";
      const k = 0.022;
      for (let pass = 0; pass < 2; pass++) {
        ctx.lineWidth = pass ? 7.5 : 4.6;
        ctx.beginPath();
        for (let i = pass; i < count; i += 2) {
          const z = ssz[i];
          ctx.moveTo(sx[i], sy[i]);
          ctx.lineTo(sx[i] - push * (0.6 + z * 0.1) * k, sy[i] - (58 + z * 19) * k * 0.5 - 0.1);
        }
        ctx.stroke();
      }
    }

    // One slow drip in the heat: a bead swells under the left minute numeral,
    // stretches into a long string of taffy, lets go, and lands on whatever is
    // below: a tag (which it knocks swinging) or the label (where it puddles).
    function stepDrip(s, dt) {
      if (P.heat < 0.05) { drip.state = 0; drip.len = 0; drip.pool = 0; return; }
      const sl = slots[2];
      const ax = sl.px[sl.dripJ], ay = sl.py[sl.dripJ];
      drip.pool = Math.max(0, drip.pool - dt / 2.6);
      if (drip.state === 0 && sl.morph < 1) {
        // the twist takes the bead back in
        drip.phase = approach(drip.phase, 0, dt, 0.12);
        drip.len = Math.pow(clamp(drip.phase), 2.4) * lerp(120, 190, P.heat);
      }
      else if (drip.state === 0) {
        drip.phase += dt / lerp(15, 9, P.heat);
        drip.len = Math.pow(clamp(drip.phase), 2.4) * lerp(120, 190, P.heat);
        drip.x = ax; drip.y = ay + TUBE / 2 - 8 + drip.len;
        if (drip.phase >= 1.1) { drip.state = 1; drip.vy = 60; hitNode(sl, sl.dripJ, 0, -90); }
      } else if (drip.state === 1) {
        drip.len = approach(drip.len, 0, dt, 0.08);
        drip.vy += 1700 * dt;
        drip.y += drip.vy * dt;
        for (let k = 1; k < 3 && drip.state === 1; k++) {
          const tg = tags[k];
          const top = tg.y + tg.len + 4;
          if (Math.abs(drip.x - tg.x - tg.shift) < tg.w / 2 - 6 && drip.y > top && drip.y < top + 60) {
            tg.om += clamp((tg.x - drip.x) / tg.w, -0.5, 0.5) * 1.4;
            tg.pom += clamp((drip.x - tg.x) / tg.w, -0.5, 0.5) * 3;
            drip.state = 2; drip.wait = R.range(3, 6);
          }
        }
        if (drip.state === 1 && drip.y > lawTop - 16) {
          drip.state = 2; drip.wait = R.range(3, 6); drip.pool = 1; drip.y = lawTop;
        }
      } else {
        drip.len = 0;
        drip.wait -= dt;
        if (drip.wait <= 0) { drip.state = 0; drip.phase = 0; }
      }
    }
    function bead(x, y, r, stretch) {
      ctx.fillStyle = pal.shade;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * stretch, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = pal.body;
      ctx.beginPath(); ctx.ellipse(x + LX * r * 0.13, y + LY * r * 0.13, r * 0.86, r * 0.86 * stretch, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = pal.spec;
      ctx.beginPath(); ctx.arc(x + LX * r * 0.42, y + LY * r * 0.42 * stretch, r * 0.18, 0, TAU); ctx.fill();
    }
    function drawDrip() {
      if (P.heat < 0.05) return;
      const sl = slots[2];
      const ax = sl.px[sl.dripJ], ay = sl.py[sl.dripJ] + TUBE / 2 - 30;
      if (drip.len > 1 && drip.state !== 2) {
        const tipY = ay + 22 + drip.len;
        const k = clamp(drip.len / 150);
        const r = drip.state === 0 ? lerp(14, 27, k) : 9;
        const neck = drip.state === 0 ? lerp(sl.dripW > 20 ? 30 : 20, 8, k) : 5;
        const sw = sl.dripW;
        for (let pass = 0; pass < 2; pass++) {
          const o = pass ? 3 : 0;
          const nk = neck - (pass ? 2.4 : 0);
          ctx.fillStyle = pass ? pal.body : pal.shade;
          ctx.beginPath();
          ctx.moveTo(ax - sw - nk + o * LX, ay);
          ctx.quadraticCurveTo(ax - nk + o * LX, ay + 18, ax - nk + o * LX, tipY - 4);
          ctx.lineTo(ax + nk + o * LX, tipY - 4);
          ctx.quadraticCurveTo(ax + nk + o * LX, ay + 18, ax + sw + nk + o * LX, ay);
          ctx.fill();
        }
        if (drip.state === 0) bead(ax, tipY, r, 1.12);
      }
      if (drip.state === 1) bead(drip.x, drip.y, 24, clamp(1 + drip.vy / 2400, 1, 1.45));
      if (drip.pool > 0.01) {
        // a puddle on the label's top edge, sinking back in
        const q = drip.pool;
        bead(drip.x, lawTop - 9 * q, 26 + 34 * (1 - q), 0.36 * q + 0.05);
      }
    }

    function draw(s) {
      layer.clear(); // the whole surface: a partial clear stalled Chromium badly in testing
      drawShadows();
      for (let row = 1; row >= 0; row--) {
        for (const sl of slots) {
          if (sl.row !== row || !sl.vis || thick(sl) < 0.02) continue;
          const k = thick(sl);
          drawIcicles(sl);
          const ph = (sl.glint + s.t * 0.22) % 30;
          for (const st of sl.def.strokes) tube(sl.px, sl.py, st[0] * SUB, st[1] * SUB, TUBE * k, ph, sl.def.piece);
          drawFrost(sl, s.t);
        }
      }
      drawDrip();
      for (const L of mini.letters) for (const st of L.def.s) tube(L.px, L.py, st[0] * SUB, st[1] * SUB, MINI, L.glint, 99);
      drawTies();
      drawDimples(s.dt);
      if (rainCount > 0 || anyRain) drawRain();
      if (snowCount > 0) drawSnow(snowCount, snowPush);
    }
    let rainCount = 0, snowCount = 0, snowPush = 0, anyRain = false;

    function simulate(s, dt, snap) {
      forces(s);
      const wmax = Math.sqrt(P.w2 / 0.14 + 4 * P.kc);
      const n = Math.max(1, Math.ceil((dt * wmax) / 0.6));
      const h = dt / n;
      morphs(dt);
      for (let i = 0; i < n; i++) stepSlots(h);
      shape();
      glideMini(dt);
      stepMini(s, dt);
      shapeMini();
      stepTags(s, dt, snap);
    }

    function texts(s) {
      const x = s.text;
      let measure = false;
      const a = put("temp", x.temp);
      if (put("cond", x.condition) || a) fitTemp();
      put("aqi", x.aqi);
      put("uv", x.uv);
      put("sunLabel", x.sunLabel);
      // a value fitted smaller (or back to full size) changes the tag's height: measure again
      if (put("sunValue", x.sunValue)) { fitText(T.sunValue, SUN_COL, 80); measure = true; }
      if (put("moon", x.moon)) {
        measure = true;
        // the moon's name on one line; a name too long even at 44 px wraps, lines well apart
        let fs = 52;
        T.moon.classList.remove("wrap");
        T.moon.style.fontSize = `${fs}px`;
        while (fs > 44 && T.moon.scrollWidth > T.moon.clientWidth + 1) { fs -= 2; T.moon.style.fontSize = `${fs}px`; }
        if (T.moon.scrollWidth > T.moon.clientWidth + 1) T.moon.classList.add("wrap");
      }
      // (a date fitted to another size changes the label's height, and so where the tags may hang)
      if (put("date", x.date)) { fitText(T.date, 952 - 72, 62); measure = true; }
      const has = x.factValue !== "";
      if (shown.has !== has) { shown.has = has; T.fact.style.display = has ? "" : "none"; }
      if (has) {
        put("factLabel", x.factLabel);
        if (put("factValue", x.factValue)) {
          // at most two lines
          let fs = 40;
          T.factValue.style.fontSize = `${fs}px`;
          while (fs > 36 && T.factValue.offsetHeight > (fs + 40) * 2 + 2) { fs -= 2; T.factValue.style.fontSize = `${fs}px`; }
        }
      }
      if (measure || shown.measured === undefined || shown.lawFact !== x.factValue) {
        shown.measured = 1;
        shown.lawFact = x.factValue;
        lawTop = law.offsetTop || lawTop;
        for (let k = 1; k < 3; k++) tags[k].h = tags[k].card.offsetHeight || tags[k].h;
        stringKey = "";
      }
    }

    // The tags under the minutes hang on shorter strings when the label below needs the
    // room (a two-line fact, or the heat letting the numerals down), so that a clear band
    // of ground always separates them from it.
    let stringKey = "";
    function fitStrings() {
      const key = `${lawTop}|${Math.round(P.sag / 3)}|${Math.round(P.wind / 3)}|${slots[2].tieY}|${slots[3].tieY}|${tags[1].h}|${tags[2].h}`;
      if (key === stringKey) return;
      stringKey = key;
      // a card leaning in a steady wind lets one lower corner down by about this much
      const lean = Math.sin(clamp(P.wind * 0.011, 0, 0.6));
      for (let k = 1; k < 3; k++) {
        const tg = tags[k];
        const sl = slots[1 + k];
        const len = Math.round(clamp(lawTop - LAW_AIR - tg.h - lean * tg.w * 0.5 - (sl.tieY + P.sag), 14, tg.len0));
        if (len === tg.len) continue;
        tg.len = len;
        tg.str.style.height = `${len + 26}px`;
        tg.card.style.top = `${len}px`;
      }
    }

    // ----- first frame: everything already hanging where the weather puts it -----
    material(state);
    P.fog = state.weather.fog ? 1 : 0;
    layout(state, true);
    timeKey = state.text.time + state.text.ampm;
    texts(state);
    palette(state);
    fitStrings();
    for (let i = 0; i < 36; i++) simulate(state, 1 / 15, i < 2);
    for (const tg of tags) tg.om *= 0.3;

    return {
      frame(s) {
        const dt = s.dt;
        const jump = Math.abs(s.ms - lastMs - dt * 1000) > 3000;
        lastMs = s.ms;
        material(s);
        const key = s.text.time + s.text.ampm;
        if (key !== timeKey || jump) {
          timeKey = key;
          layout(s, jump);
        }
        texts(s);
        palClock += dt;
        if (palClock > 0.25 || jump) { palClock = 0; palette(s); }
        if (flip.w !== flip.side) {
          // the tags' paper crossing to the other side: under a second, whatever the light does
          flip.w = jump ? flip.side : flip.side ? Math.min(1, flip.w + dt / 0.9) : Math.max(0, flip.w - dt / 0.9);
          tagInk();
        }

        // thunder: a soft, rare brightening and one collective shudder
        if (P.storm) {
          const per = 26;
          const kk = Math.floor(s.t / per);
          const te = kk * per + 4 + 9 * ((Math.sin(kk * 127.1 + seed) * 43758.5453) % 1 + 1) % 1;
          const x = s.t - te;
          stormPulse = x < 0 ? 0 : x < 0.5 ? smoothstep(0, 0.5, x) : Math.exp(-(x - 0.5) / 1.4);
          if (x > 0.7 && lastStormK !== kk) {
            lastStormK = kk;
            for (const sl of slots) for (let i = 0; i < NN; i++) { sl.vx[i] += R.range(-50, 50) * sl.comp[i]; sl.vy[i] += 110 * sl.comp[i]; }
          }
        } else stormPulse = 0;
        const fl = (stormPulse * 0.13).toFixed(3);
        if (shown.fl !== fl) { shown.fl = fl; flash.style.opacity = fl; }

        fitStrings();
        simulate(s, dt, jump);
        for (const sl of slots) if (sl.iceGrow < 1) sl.iceGrow = Math.min(1, sl.iceGrow + dt / 14);
        rainCount = P.rainy > 0 ? Math.round((P.drizzle ? 26 + 130 * P.rainy : 40 + 250 * P.rainy)) : 0;
        anyRain = false;
        for (let i = 0; i < NR; i++) if (ron[i]) { anyRain = true; break; }
        if (rainCount > 0 || anyRain) stepRain(dt, Math.min(NR, rainCount));
        snowCount = P.snowy > 0 ? Math.min(NS, Math.round(70 + 200 * P.snowy)) : 0;
        if (snowCount > 0) snowPush = stepSnow(s, dt, snowCount);
        stepDrip(s, dt);
        placeTags();
        draw(s);
      },
    };
  },
};

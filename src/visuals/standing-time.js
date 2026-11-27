// Standing Time
//
// Four slab-serif numerals stand like monuments on a stone plaza by the East
// River, looking west across the water to Manhattan, and the weather happens
// to them. Each numeral wears exactly as much weather as the time it has stood:
// the last minute digit is under a minute old and nearly clean, the tens of
// minutes up to ten minutes, the hour up to an hour, the little AM/PM block half
// a day, and the date, a row of small far-off stones, the whole day. A small
// plate on each pedestal says how long that figure has stood. On the minute the
// old figure sinks into its pedestal, snow and all, and a clean one rises.
//
// How the conditions drive it
//   light    The sun throws real shadows across the plaza: their direction is
//            the sun's bearing seen from a studio facing west (afternoon sun is
//            behind the figures and throws their shadows toward you, morning
//            sun is behind you and lights their faces), their length is its
//            height, their edge is the cloud. Low sun puts a warm rim on the
//            top edges. When the sky darkens the floodlights come on: the faces
//            are lit from below, their tops go dark, and pools of light lie in
//            front of the pedestals.
//   snow     Caps grow on every upward-facing edge of a figure at the real
//            rate of snowfall times that figure's age, thinner on the windward
//            side, never closing a counter. The plaza whitens, and shed caps
//            heap up on the pedestals until the hour.
//   rain     A figure darkens from its top edges down, with a few bold
//            rivulets; the plaza goes wet and glossy, holds reflections of the
//            figures and rings with drops.
//   dry      Dust motes ride the real wind, more of them in bad air; heat
//            shimmers at the horizon; fog dissolves the far side of the plaza;
//            partly cloudy skies drag cloud shadows across the stones.
//   colour   The strip of sky is the measured sky (west to north-west). The
//            figures are one pigment chosen by the season: cobalt in winter,
//            viridian in spring, oxide red in summer, ochre in autumn. Every
//            face is set against the ground it stands on for contrast.
//
// Everything that accumulates is a function of (figure age, weather), not of
// what happened since the page loaded, so the first frame is already right
// and a jump of the clock goes straight to the new state.
//
// Not in the kit, written here: per-figure canvases with extrusion, surface
// tracing (the upward-facing edges of a rasterised letterform), and shadows
// projected onto the ground with an affine transform.

import { W, H, TAU, clamp, lerp, smoothstep, ease, hash, createNoise, mix, oklch, toOklch, luminance, contrast, rgba, el, addStyle, canvas2d, mask, grain, fitText } from "../lib/kit.js";

const MX = 64;
const SLAB = '"Alfa Slab One", "Rockwell", serif';
const D2R = Math.PI / 180;
const HZ = 246; // the far edge of the plaza; the river and Manhattan beyond
const RIV = 9; // the river's strip
const FE = 1440; // the near edge of the plaza; the podium face below it
const LIP = 8;
const ROW = [
  { base: 334, ped: 0, pt: 0, k: 0.12 }, // the date, far away
  { base: 828, ped: 40, pt: 8, k: 0.3 }, // the hours
  { base: 1372, ped: 46, pt: 10, k: 0.42 }, // the minutes
];
const GAP = 34; // between the pedestals' cells
const T_SINK = 1.2; // the old figure goes down into its pedestal
const T_RISE0 = 0.9; // the new one starts up
const T_RISE = 2.0;
const GW = W / 2; // particle collision grid, 2 px cells
const GH = H / 2;
const GK0 = 0.1; // where the ground goes from night to day (daylight)
const GK1 = 0.24;

// The season's pigment: [hue, chroma] in OKLCh, changing over about three weeks
// around each solstice and equinox.
const PIG = [
  [262, 0.165], // winter: cobalt
  [160, 0.11], // spring: viridian
  [31, 0.165], // summer: oxide red
  [70, 0.13], // autumn: ochre
];
const BND = [79, 172, 265, 355]; // day of year each of spring, summer, autumn, winter starts
function pigmentAt(doy) {
  let bi = 0;
  let bd = 999;
  for (let i = 0; i < 4; i++) {
    let d = doy - BND[i];
    if (d > 182) d -= 365;
    if (d < -182) d += 365;
    if (Math.abs(d) < Math.abs(bd)) { bd = d; bi = i; }
  }
  const a = PIG[(bi + 4) % 4];
  const b = PIG[(bi + 1) % 4];
  const t = smoothstep(-10, 10, bd);
  const dh = ((b[0] - a[0] + 540) % 360) - 180;
  return [(a[0] + dh * t + 360) % 360, lerp(a[1], b[1], t)];
}

const CSS = `
.st { position: absolute; inset: 0; overflow: hidden; background: #14161b; font-family: "Rokkitt", Georgia, serif; }
.st .gbox { position: absolute; overflow: hidden; }
.st .gbox canvas { position: absolute; left: 0; top: 0; will-change: transform; }
.st .clip { position: absolute; left: 0; top: ${HZ}px; width: ${W}px; height: ${FE - HZ}px; overflow: hidden; }
.st .blob { position: absolute; left: 0; top: 0; border-radius: 50%; opacity: 0; will-change: transform; }
.st .swell { position: absolute; inset: 0; opacity: 0; background: radial-gradient(1100px 760px at 58% 6%, rgba(222,230,255,0.95), rgba(222,230,255,0) 72%); }
.st .t { position: absolute; white-space: nowrap; line-height: 1; color: var(--ink); text-shadow: 0 -1.5px 0 rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.08); }
.st .temp { font-family: ${SLAB}; font-size: 116px; left: ${MX - 3}px; }
.st .cond { font-weight: 600; font-size: 52px; letter-spacing: 0.06em; text-transform: uppercase; }
.st .sub { font-weight: 400; font-size: 36px; color: var(--soft); }
.st .lab { font-weight: 600; font-size: 25px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--lab); }
.st .val { font-weight: 500; font-size: 44px; }
.st .fact { font-weight: 400; font-size: 40px; line-height: 46px; white-space: normal; left: ${MX}px; width: ${W - MX * 2}px; text-wrap: balance; }
.st .rule { position: absolute; left: ${MX}px; width: ${W - MX * 2}px; height: 2px; background: rgba(0,0,0,0.55); box-shadow: 0 1px 0 rgba(255,255,255,0.09); }
.st .age { position: absolute; font-weight: 600; font-size: 26px; letter-spacing: 0.12em; text-transform: uppercase; white-space: nowrap; line-height: 1; transform: translateX(-50%); color: var(--lab); text-shadow: 0 -1px 0 rgba(0,0,0,0.65), 0 1px 0 rgba(255,255,255,0.07); }
`;

export default {
  title: "Standing Time",
  description: "Four monolith numerals stand on a plaza by the East River, and each one wears exactly as much snow, rain and sun as the time it has stood.",
  fonts: ["Alfa Slab One", "Rokkitt:wght@400;500;600"],
  fps: 30,

  mount(root, { state, seed }) {
    const noise = createNoise(seed);
    addStyle(root, CSS);
    const wrap = el("div", { class: "st" });
    root.append(wrap);

    // ---- layers, back to front ----------------------------------------------
    const ground = canvas2d(wrap, { maxScale: 2, alpha: false }); // sky strip, plaza, pedestals, podium
    const R = ground.ratio; // real pixels per stage unit, for the figures too
    const fx = canvas2d(wrap, { maxScale: 1 }); // shadows and reflections on the ground
    const clipBox = el("div", { class: "clip" });
    const fogBox = el("div", { class: "clip" });
    wrap.append(clipBox, fogBox);
    const blobs = [];
    for (let i = 0; i < 5; i++) {
      const w = 760 + hash(i, seed + 5) * 520;
      const h = 210 + hash(i, seed + 6) * 120;
      const node = el("div", { class: "blob", style: { width: `${w}px`, height: `${h}px` } });
      clipBox.append(node);
      blobs.push({ node, w, h, y: 60 + (i / 5) * (FE - HZ - 200) + hash(i, seed + 7) * 120, ph: hash(i, seed + 8), sp: 0.6 + 0.8 * hash(i, seed + 9), o: "" });
    }
    const wisps = [];
    const mkWisp = (i, parent, y0, y1) => {
      const w = 700 + hash(i, seed + 21) * 600;
      const h = 220 + hash(i, seed + 22) * 200;
      const node = el("div", { class: "blob", style: { width: `${w}px`, height: `${h}px` } });
      parent.append(node);
      wisps.push({ node, w, h, y: y0 + hash(i, seed + 23) * (y1 - y0), ph: hash(i, seed + 24), sp: 0.5 + hash(i, seed + 25), o: "", front: parent !== fogBox });
    };
    for (let i = 0; i < 5; i++) mkWisp(i, fogBox, -60, 640);

    // ---- type metrics ---------------------------------------------------------
    const meas = document.createElement("canvas").getContext("2d");
    const metricsOf = (font) => {
      meas.font = font.replace("%", "100");
      const m = meas.measureText("H");
      return { a: m.fontBoundingBoxAscent / 100, d: m.fontBoundingBoxDescent / 100, cap: m.actualBoundingBoxAscent / 100 };
    };
    const mSlab = metricsOf(`%px ${SLAB}`);
    const mRok = metricsOf('500 %px "Rokkitt"');
    const topFor = (baseline, px, m, lh = px) => baseline - ((lh - (m.a + m.d) * px) / 2 + m.a * px);
    meas.font = `100px ${SLAB}`;
    const inkOf = (ch) => {
      const m = meas.measureText(ch);
      return (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) / 100;
    };
    let digitInk = 0;
    for (const d of "0123456789") digitInk = Math.max(digitInk, inkOf(d));
    const digitCap = meas.measureText("0").actualBoundingBoxAscent / 100;
    const mCap = meas.measureText("M").actualBoundingBoxAscent / 100;
    const mInk = inkOf("M");

    // ---- figure classes ----------------------------------------------------------
    const mkClass = (kind, px, dz, capMax, k, cellW, inkH) => {
      const padX = Math.ceil(18 + 16 * k);
      const padT = Math.ceil(dz + capMax + 12);
      const bw = Math.ceil(cellW + padX * 2);
      const bh = Math.ceil(padT + inkH + 3);
      return { kind, px, font: `${px}px ${SLAB}`, dz, capMax, k, cellW, inkH, padX, padT, bw, bh, oy: bh - 3 };
    };
    const MPX = 620;
    const HPX = 540;
    const APX = 112;
    const DPX = 72;
    const CLS = {
      min: mkClass(0, MPX, 26, 84, 1, Math.ceil(digitInk * MPX + 6), digitCap * MPX),
      hour: mkClass(0, HPX, 22, 70, 0.87, Math.ceil(digitInk * HPX + 6), digitCap * HPX),
      ap: mkClass(1, APX, 9, 26, 0.4, Math.ceil(mInk * APX + 8), 2 * mCap * APX + 6),
      date: mkClass(2, DPX, 5, 10, 0.2, W - MX * 2, mCap * DPX),
    };
    let sbw = 0;
    let sbh = 0;
    for (const k in CLS) { sbw = Math.max(sbw, CLS[k].bw); sbh = Math.max(sbh, CLS[k].bh); }
    const scratch = () => {
      const c = document.createElement("canvas");
      c.width = Math.ceil(sbw * R);
      c.height = Math.ceil(sbh * R);
      return c;
    };
    const SA = scratch();
    const SB = scratch();
    const sa = SA.getContext("2d");
    const sb = SB.getContext("2d");

    function makeSlot(id, row, cls, hasAge) {
      const box = el("div", { class: "gbox" });
      wrap.append(box);
      const faces = [0, 1].map(() => {
        const cv = document.createElement("canvas");
        cv.width = Math.ceil(cls.bw * R);
        cv.height = Math.ceil(cls.bh * R);
        cv.style.width = `${cls.bw}px`;
        cv.style.height = `${cls.bh}px`;
        box.append(cv);
        const sil = document.createElement("canvas");
        sil.width = cls.bw;
        sil.height = cls.bh;
        return { cv, ctx: cv.getContext("2d"), sil, sctx: sil.getContext("2d"), str: "", off: 0, vis: true, offTxt: "" };
      });
      return {
        id, row, cls, box, faces, cur: 0,
        str: "", px: cls.px, font: cls.font, cellX: 0, x: 0, gy: 0, sx: 0, present: true,
        anim: false, t0: 0,
        mask: null, chains: [], inkL: 0, inkR: 0, inkT: 0, inkB: 0,
        ox: 0, oy: cls.oy, ox2: 0, oy2: 0, chars: [], cx: [],
        rv: new Float32Array(16 * 6), nrv: 0, seed: 0,
        age: 0, D: 0, Ddrawn: -1, wetKey: -1, wetDrawn: -2, palDrawn: -1,
        heap: 0,
        age_: hasAge ? el("div", { class: "age" }) : null, ageText: "",
      };
    }
    const S = {
      date: makeSlot(5, 0, CLS.date, false),
      h1: makeSlot(0, 1, CLS.hour, true),
      h2: makeSlot(1, 1, CLS.hour, true),
      ap: makeSlot(4, 1, CLS.ap, true),
    };
    for (let i = 5; i < 9; i++) mkWisp(i, wrap, 380, 1100); // fog between the hours and the minutes
    S.m1 = makeSlot(2, 2, CLS.min, true);
    S.m2 = makeSlot(3, 2, CLS.min, true);
    const slots = [S.h1, S.h2, S.m1, S.m2, S.ap, S.date];
    const pedSlots = [S.h1, S.h2, S.ap, S.m1, S.m2];

    const air = canvas2d(wrap, { adaptive: true });
    const swell = el("div", { class: "swell" });
    wrap.append(swell);

    // ---- inscriptions on the podium (DOM) --------------------------------------
    const T = (cls) => el("div", { class: `t ${cls}` });
    const n = {
      temp: T("temp"), cond: T("cond"), sub: T("sub"),
      sunL: T("lab"), sunV: T("val"), moonL: T("lab"), moonV: T("val"), aqiL: T("lab"), aqiV: T("val"), uvL: T("lab"), uvV: T("val"),
      factL: T("lab"), factV: T("fact"),
      rule1: el("div", { class: "rule" }), rule2: el("div", { class: "rule" }),
    };
    n.moonL.textContent = "Moon";
    n.aqiL.textContent = "Air quality";
    n.uvL.textContent = "UV index";
    const COL = [MX, 300, 642, 850];
    const colW = [226, 330, 196, W - MX - 850];
    wrap.append(...Object.values(n), ...pedSlots.map((s) => s.age_));
    function layoutText(shift) {
      const y = (v) => `${Math.round(v + shift)}px`;
      const tb = 1562;
      n.temp.style.top = y(topFor(tb, 116, mSlab));
      n.cond.style.top = y(topFor(tb - mSlab.cap * 116 + mRok.cap * 52, 52, mRok));
      n.sub.style.top = y(topFor(tb, 36, mRok));
      n.rule1.style.top = y(1592);
      for (const [l, v, c] of [[n.sunL, n.sunV, 0], [n.moonL, n.moonV, 1], [n.aqiL, n.aqiV, 2], [n.uvL, n.uvV, 3]]) {
        l.style.left = v.style.left = `${COL[c]}px`;
        l.style.top = y(topFor(1636, 25, mRok));
        v.style.top = y(topFor(1688, 44, mRok));
      }
      n.rule2.style.top = y(1714);
      n.factL.style.left = `${MX}px`;
      n.factL.style.top = y(topFor(1754, 25, mRok));
      n.factV.style.top = y(topFor(1798, 40, mRok, 46));
    }
    grain(wrap, { opacity: 0.05 });

    const shown = {};
    const put = (key, node, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };
    const css = (key, node, prop, value) => {
      if (shown[key] === value) return;
      shown[key] = value;
      node.style[prop] = value;
    };

    // ---- letterforms ----------------------------------------------------------------
    function drawShape(c, sl, dx, dy) {
      const k = sl.cls.kind;
      c.font = sl.font;
      c.textBaseline = "alphabetic";
      c.textAlign = "left";
      if (k === 0) c.fillText(sl.str, sl.ox + dx, sl.oy + dy);
      else if (k === 1) {
        c.fillText("M", sl.ox + dx, sl.oy + dy);
        c.fillText(sl.str[0], sl.ox2 + dx, sl.oy2 + dy);
      } else for (let i = 0; i < sl.chars.length; i++) c.fillText(sl.chars[i], sl.cx[i] + dx, sl.oy + dy);
    }

    // Trace the upward-facing edges of the figure ("surfaces": runs of columns
    // whose top is continuous) and how much open air is above each column.
    function analyse(sl) {
      const { bw, bh } = sl.cls;
      const m = sl.mask;
      const chains = [];
      let open = [];
      let L = bw, Rt = -1, Tp = bh, B = -1;
      for (let x = 0; x < bw; x++) {
        const next = [];
        let prev = false;
        let lastEnd = -1;
        for (let y = 0; y < bh; y++) {
          const s = m[y * bw + x] > 100;
          if (s && !prev) {
            const gap = lastEnd < 0 ? 9999 : y - lastEnd;
            let ch = null;
            for (let i = 0; i < open.length; i++) {
              const c = open[i];
              if (c && Math.abs(c.last - y) <= 4) { ch = c; open[i] = null; break; }
            }
            if (!ch) { ch = { x0: x, ys: [], gaps: [], last: y }; chains.push(ch); }
            ch.ys.push(y); ch.gaps.push(gap); ch.last = y;
            next.push(ch);
            if (x < L) L = x;
            if (x > Rt) Rt = x;
            if (y < Tp) Tp = y;
          } else if (!s && prev) { lastEnd = y; if (y > B) B = y; }
          prev = s;
        }
        if (prev) B = bh;
        open = next;
      }
      sl.chains = [];
      for (const ch of chains) {
        const len = ch.ys.length;
        if (len < 4) continue;
        let openCols = 0;
        for (const g of ch.gaps) if (g >= 9000) openCols++;
        sl.chains.push({ x0: ch.x0, n: len, y: Float32Array.from(ch.ys), gap: Float32Array.from(ch.gaps), open: openCols > len * 0.5 });
      }
      sl.inkL = L; sl.inkR = Rt + 1; sl.inkT = Tp; sl.inkB = B;
    }

    // Where the rivulets will run: a few columns on the open top edges.
    function seedRivulets(sl) {
      const k = sl.cls.k;
      const max = sl.cls.kind === 0 ? 7 : sl.cls.kind === 1 ? 3 : 16;
      const spacing = sl.cls.kind === 2 ? 30 : 50 * k + 6;
      const open = sl.chains.filter((c) => c.open && c.n > 8);
      let count = 0;
      for (let tries = 0; tries < 90 && count < max && open.length; tries++) {
        const ch = open[Math.floor(hash(tries, sl.seed) * open.length)];
        const i = 2 + Math.floor(hash(tries, sl.seed + 11) * (ch.n - 4));
        const x = ch.x0 + i;
        let ok = true;
        for (let j = 0; j < count; j++) if (Math.abs(sl.rv[j * 6] - x) < spacing) ok = false;
        if (!ok) continue;
        const o = count * 6;
        sl.rv[o] = x;
        sl.rv[o + 1] = ch.y[i];
        sl.rv[o + 2] = (13 + 19 * hash(tries, sl.seed + 12)) * (0.35 + 0.65 * k);
        sl.rv[o + 3] = 0.55 + 1.5 * hash(tries, sl.seed + 13) ** 1.6;
        sl.rv[o + 4] = count === 0 ? 2 : 34 * hash(tries, sl.seed + 14);
        sl.rv[o + 5] = hash(tries, sl.seed + 15) * TAU;
        count++;
      }
      sl.nrv = count;
    }

    const DATE_LS = 0.06;
    const advance = (font, str, ls) => {
      meas.font = font;
      let w = 0;
      for (const ch of str) w += meas.measureText(ch).width + ls;
      return w - ls;
    };
    function setGlyph(sl, f, str, s) {
      sl.str = str;
      f.str = str;
      const c = sl.cls;
      if (!str) { sl.chains = []; sl.nrv = 0; sl.mask = null; return; }
      sl.oy = c.oy;
      if (c.kind === 0) {
        meas.font = sl.font;
        const m = meas.measureText(str);
        sl.ox = c.bw / 2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
      } else if (c.kind === 1) {
        meas.font = sl.font;
        const m = meas.measureText("M");
        sl.ox = c.bw / 2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
        const p = meas.measureText(str[0]);
        sl.ox2 = c.bw / 2 - (p.actualBoundingBoxRight - p.actualBoundingBoxLeft) / 2;
        sl.oy2 = sl.oy - Math.round(m.actualBoundingBoxAscent) - Math.round(c.dz * 0.5) - 1;
      } else {
        const [a, b] = str.split("|");
        const room = W - MX * 2 - 56;
        const w100 = advance(`100px ${SLAB}`, a, DATE_LS * 100) + advance(`100px ${SLAB}`, b, DATE_LS * 100);
        sl.px = Math.max(46, Math.min(DPX, Math.floor((100 * room) / w100)));
        sl.font = `${sl.px}px ${SLAB}`;
        const ls = DATE_LS * sl.px;
        sl.chars = [];
        sl.cx = [];
        meas.font = sl.font;
        let x = c.padX;
        for (const ch of a) { sl.chars.push(ch); sl.cx.push(x); x += meas.measureText(ch).width + ls; }
        x = c.padX + (W - MX * 2) - advance(sl.font, b, ls);
        for (const ch of b) { sl.chars.push(ch); sl.cx.push(x); x += meas.measureText(ch).width + ls; }
      }
      sl.mask = mask(c.bw, c.bh, (ctx) => drawShape(ctx, sl, 0, 0)).data;
      analyse(sl);
      // the same figure put up at the same instant always weathers the same way
      sl.seed = (Math.floor((s.ms - sl.age * 1000) / 1000 + 0.5) % 100000) + sl.id * 7919;
      seedRivulets(sl);
      paintSil(sl, f);
      sl.palDrawn = -1;
    }
    function paintSil(sl, f) {
      const c = f.sctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = "source-over";
      c.clearRect(0, 0, sl.cls.bw, sl.cls.bh);
      if (!f.str) return;
      c.fillStyle = pal.shadow;
      drawShape(c, sl, 0, 0);
    }

    // ---- palette --------------------------------------------------------------------
    const mkP = () => ({ face: "#000", faceLo: "#000", top: "#000", side: "#000", rim: "#000", rimOn: false, wet1: "#000", wet2: "#000", glint: "#000", night: false });
    const pal = {
      version: 0, key: "",
      big: mkP(), date: mkP(),
      night: false, gk: 1, sky0: "#888", sky1: "#888", sky2: "#888", zen: "#888", horizon: "#888", river: "#888",
      skyline: "#777", winA: 0, starA: 0, gNear: "#ccc", gFar: "#ccc", joint: "#000", jointA: 0,
      shadow: "#223", granite: "#222", graniteTop: "#333", lip: "#666", pool: "#ffd9a0", poolA: 0,
      snow: "#fff", snowShade: "#ccd", rain: "#fff", mote: "#fff", fog: "#ddd", cloudShadow: "#445",
      ink: "#eee", lab: "#ccc", soft: "#ccc",
      shA: 0, shAx: 0, shBy: 0, shSoft: 2, nsA: 0, contactA: 0.4, refA: 0,
    };
    let hue = 262;
    let chroma = 0.16;
    const pig = (Y, c = 1) => {
      let L = Math.cbrt(Math.max(0.0005, Y));
      for (let i = 0; i < 5; i++) {
        const y = luminance(oklch(L, chroma * c, hue));
        L = clamp(L * Math.cbrt((Y + 0.003) / (y + 0.003)), 0.02, 0.995);
      }
      return oklch(L, chroma * c, hue);
    };
    const lumOfL = (L, c = 1) => luminance(oklch(L, chroma * c, hue));
    const farness = (y) => (y <= HZ ? 1 : Math.pow(clamp((FE - y) / (FE - HZ)), 2));
    const groundAt = (y) => mix(pal.gNear, pal.gFar, farness(y));

    let snowK = 0; // 0..1 it is snowing
    let rainK = 0; // 0..1 it is raining
    let wet = 0; // 0..1 the plaza is wet
    let cover = 0; // 0..1 snow lying on the plaza
    let fogK = 0;
    let lat = 1; // which way the wind carries things across the picture, -1..1
    let capWind = 0;
    let partly = 0;
    let heat = 0;

    function updatePalette(s) {
      const w = s.weather;
      const dl = s.daylight;
      const alt = s.sun.alt;
      const az = s.sun.az * D2R;
      const cloud = clamp(w.cloud / 100);
      const direct = Math.pow(1 - cloud, 1.6) * smoothstep(-0.5, 8, alt);
      const gk = smoothstep(GK0, GK1, dl);
      const sinA = Math.sin(az);
      const cosA = Math.cos(az);
      const frontSun = clamp(sinA) * Math.cos(Math.max(0, alt) * D2R);
      const backSun = clamp(-sinA);
      const golden = 1 - smoothstep(3, 26, alt);
      const sunTint = mix("#ffa860", "#fff2dc", smoothstep(1, 30, alt));
      [hue, chroma] = pigmentAt(s.clock.doy);
      partly = smoothstep(8, 35, w.cloud) * (1 - smoothstep(70, 92, w.cloud));
      heat = smoothstep(84, 96, w.temp) * smoothstep(0.3, 0.8, dl);

      // the sky, and Manhattan under it
      const sw = s.sky.west, snw = s.sky.northWest, sne = s.sky.northEast, se = s.sky.east, mean = s.sky.mean;
      const fogCol = mix(mean, gk > 0.5 ? "#dfe2e4" : "#2c3138", 0.45);
      pal.fog = fogCol;
      pal.sky0 = mix(sw, fogCol, fogK * 0.6);
      pal.sky2 = mix(snw, fogCol, fogK * 0.6);
      pal.sky1 = mix(pal.sky0, pal.sky2, 0.5);
      pal.zen = mix(mix(mix(sne, se, 0.5), "#000000", 0.18), fogCol, fogK * 0.5);
      const horizon = mix(pal.sky0, pal.sky2, 0.4);
      pal.horizon = horizon;
      const ho = toOklch(horizon);
      pal.skyline = mix(mix(horizon, oklch(ho.l * 0.62, ho.c * 0.7, ho.h), 0.85), fogCol, fogK * 0.85);
      pal.river = mix(horizon, gk > 0.5 ? "#ffffff" : "#000000", 0.14);
      pal.winA = (1 - smoothstep(0.05, 0.35, dl)) * (1 - fogK * 0.8) * 0.85;
      pal.starA = (1 - smoothstep(0.02, 0.12, dl)) * Math.pow(1 - cloud, 2) * (1 - fogK) * 0.7;

      // the plaza: limestone lit by the sky by day, deep blue-grey at night
      const mo = toOklch(mean);
      const skyHue = Number.isFinite(mo.h) ? mo.h : 250;
      let gDay = oklch(0.765 + 0.07 * direct - 0.035 * cloud, 0.014 + 0.024 * direct * golden, 78);
      gDay = mix(gDay, sunTint, 0.16 * direct * golden);
      gDay = mix(gDay, oklch(toOklch(gDay).l, Math.min(0.03, mo.c * 0.5), skyHue), 0.32);
      const gNight = oklch(0.175, Math.min(0.034, mo.c * 0.6 + 0.012), skyHue);
      let gNear = mix(gNight, gDay, gk);
      if (wet > 0) {
        const o = toOklch(gNear);
        gNear = oklch(o.l * (1 - 0.2 * wet), o.c * (1 + 0.3 * wet), o.h);
      }
      const snowG = mix(oklch(0.26, 0.03, 258), oklch(0.955, 0.012, 250), gk);
      gNear = mix(gNear, snowG, cover);
      let gFar = mix(gNear, horizon, 0.36 + 0.3 * wet * (1 - cover));
      gFar = mix(gFar, fogCol, fogK * 0.85);
      pal.gNear = gNear;
      pal.gFar = gFar;
      pal.gk = gk;
      pal.joint = gk > 0.5 ? "#2a2620" : "#000000";
      pal.jointA = (0.08 + 0.05 * wet) * (1 - cover) * (1 - fogK * 0.5);

      // shadows: the sun's (direction from its bearing, length from its height,
      // sharpness from the cloud), and at night the floodlights' (thrown back)
      const shadowCol = mix(oklch(0.3, 0.05, 262), oklch(0.08, 0.02, skyHue), 1 - gk);
      pal.shadow = shadowCol;
      const cot = 1 / Math.tan(Math.max(4.5, alt) * D2R);
      const len = Math.min(cot, 2.3);
      pal.shAx = -cosA * len;
      pal.shBy = sinA * len; // multiplied by the row's foreshortening when drawn
      pal.shA = 0.62 * direct * smoothstep(0, 5, alt) * (1 - fogK * 0.8) * (1 - cover * 0.25);
      pal.shSoft = 1.5 + 8 * cloud + len * 2.5;
      pal.nsA = 0.5 * (1 - gk) * (1 - fogK * 0.6);
      pal.contactA = lerp(0.55, 0.38, gk) * (1 - fogK * 0.3);
      pal.refA = wet * (1 - cover) * lerp(0.42, 0.3, gk);
      pal.cloudShadow = shadowCol;

      // the figures: day faces dark against the light plaza, night faces lit
      // by the floodlights against the dark one, always 3.4:1 or better
      const sh = pal.shA * 0.75;
      let ymin = 1, ymax = 0;
      for (const y of [400, ROW[1].base, 1000, ROW[2].base]) {
        const g = groundAt(y);
        const Yg = luminance(g);
        const Ys = luminance(mix(g, shadowCol, sh));
        ymin = Math.min(ymin, Yg, Ys);
        ymax = Math.max(ymax, Yg);
      }
      const night = 0.68 / (ymax + 0.05) > (ymin + 0.05) / 0.056;
      pal.night = night;
      const moonS = smoothstep(-2, 10, s.moon.alt) * s.moon.illumination * Math.pow(1 - cloud, 1.3);
      const lamp = "#ffd7a3";
      const setFaces = (P, CT, Ylo, Yhi, scale) => {
        P.night = night;
        if (!night) {
          const L = 0.44 + 0.13 * frontSun * direct - 0.05 * backSun * direct + 0.02 * cloud;
          const cap = (Ylo + 0.05) / CT - 0.05;
          const Yf = clamp(Math.min(lumOfL(L), cap), 0.0035, 1);
          P.face = pig(Yf);
          P.faceLo = P.face;
          P.side = pig(Yf * 0.42, 0.9);
          const Yt = Math.min(Yf * 2.4 + 0.05 + 0.12 * direct * Math.sin(Math.max(0, alt) * D2R), 0.62);
          P.top = mix(pig(Yt, 0.75), sunTint, 0.18 * direct);
          const rimAmt = direct * (0.25 + 0.75 * backSun) * (0.35 + 0.65 * golden);
          P.rimOn = rimAmt > 0.12;
          P.rim = mix(P.top, mix(sunTint, "#ffffff", 0.3), clamp(rimAmt * 1.1));
          P.wet1 = pig(Yf * 0.55);
          P.wet2 = pig(Yf * 0.3);
          P.glint = mix(P.wet1, "#ffffff", 0.32);
        } else {
          const need = CT * (Yhi + 0.05) - 0.05;
          const Yt = clamp(Math.max(0.2, need), 0, 0.92);
          const Yb = Math.min(0.92, Math.max(Yt * 1.5, Yt + 0.04));
          P.face = pig(Yt, 0.82);
          P.faceLo = mix(pig(Yb, 0.85), lamp, 0.12);
          P.side = pig(Yt * 0.3, 0.7);
          P.top = mix(pig(0.018, 0.6), "#c8d4ff", 0.3 * moonS);
          P.rimOn = moonS > 0.15;
          P.rim = mix(P.top, "#e4eaff", 0.75 * moonS);
          P.wet1 = pig(Math.max(need, Yt * 0.86), 0.95);
          P.wet2 = pig(Math.max(need, Yt * 0.74), 1);
          P.glint = mix(P.faceLo, "#ffffff", 0.45);
        }
      };
      setFaces(pal.big, 3.4, ymin, ymax, 1);
      const gd = groundAt(ROW[0].base - 30);
      const Ygd = luminance(gd);
      setFaces(pal.date, 5, Ygd, Ygd, 0.2);

      // stone, snow, water and the inscriptions
      pal.granite = oklch(lerp(0.12, 0.2, gk), 0.008, 60);
      pal.graniteTop = mix(pal.granite, mean, 0.28);
      pal.lip = mix(oklch(lerp(0.2, 0.42, gk), 0.01, 70), mean, 0.2);
      pal.pool = lamp;
      pal.poolA = 0.3 * (1 - gk);
      pal.snow = oklch(lerp(0.74, 0.985, gk), 0.012, 250);
      pal.snowShade = oklch(lerp(0.55, 0.84, gk), 0.035, 255);
      pal.rain = gk > 0.5 ? mix(mean, "#e8f0ff", 0.55) : mix(mean, "#c9d6ee", 0.45);
      pal.mote = gk > 0.5 ? mix(gNear, w.aqi > 100 ? "#7a6448" : "#5b5246", 0.7) : mix(gNear, "#fff1d8", 0.7);
      const ink = oklch(0.95, 0.018, 85);
      let lab = mix(ink, oklch(0.8, chroma * 0.7, hue), 0.55);
      if (contrast(lab, pal.granite) < 5.5) lab = mix(ink, oklch(0.85, chroma * 0.5, hue), 0.4);
      pal.ink = ink;
      pal.lab = lab;
      pal.soft = mix(ink, pal.granite, 0.16);

      wrap.style.setProperty("--ink", ink);
      wrap.style.setProperty("--lab", lab);
      wrap.style.setProperty("--soft", pal.soft);
      const blobCol = rgba(pal.cloudShadow, 0.9);
      if (shown.blob !== blobCol) {
        shown.blob = blobCol;
        for (const b of blobs) b.node.style.background = `radial-gradient(closest-side, ${blobCol}, ${rgba(pal.cloudShadow, 0)})`;
      }
      const wispCol = rgba(fogCol, 0.95);
      if (shown.wisp !== wispCol) {
        shown.wisp = wispCol;
        for (const v of wisps) v.node.style.background = `radial-gradient(closest-side, ${wispCol}, ${rgba(fogCol, 0)})`;
      }

      const b = pal.big, d = pal.date;
      const key = `${b.face}${b.faceLo}${b.top}${b.side}${b.rim}${b.rimOn}${b.wet1}${b.wet2}${d.face}${d.faceLo}${d.top}${d.rim}${d.wet1}${pal.snow}`;
      if (key !== pal.key) {
        pal.key = key;
        pal.version++;
      }
    }

    // ---- painting one figure: side, top faces, rim, face, wet, snow ---------------
    function paintWet(c, sl, age, P) {
      const cl = sl.cls;
      const k = cl.k;
      const I = rainK;
      const inkH = sl.inkB - sl.inkT;
      const B = inkH * 1.2 * (1 - Math.exp((-I * age) / 1000));
      const drops = Math.min(cl.kind === 2 ? 90 : 130, Math.floor(I * age * 1.5));
      c.fillStyle = P.wet2;
      c.beginPath();
      for (let i = 0; i < drops; i++) {
        const x = sl.inkL + hash(i, sl.seed + 31) * (sl.inkR - sl.inkL);
        const y = sl.inkT + hash(i, sl.seed + 32) * inkH;
        const r = (2.2 + 4.6 * hash(i, sl.seed + 33)) * (0.4 + 0.6 * k);
        c.moveTo(x + r, y);
        c.arc(x, y, r, 0, TAU);
      }
      c.fill();
      if (B > 1) {
        c.fillStyle = P.wet1;
        c.beginPath();
        for (const ch of sl.chains) {
          const sh = ch.open ? 1 : 0.4;
          c.moveTo(ch.x0 - 1, ch.y[0] - 3);
          for (let i = 0; i < ch.n; i += 2) c.lineTo(ch.x0 + i, ch.y[i] - 3);
          c.lineTo(ch.x0 + ch.n + 1, ch.y[ch.n - 1] - 3);
          for (let i = ch.n - 1; i >= 0; i -= 2) {
            const x = ch.x0 + i;
            c.lineTo(x + 1, ch.y[i] + B * sh * (0.74 + 0.4 * noise.n2((x * 0.02) / k, sl.seed * 0.37)));
          }
          c.closePath();
        }
        c.fill();
      }
      c.lineCap = "round";
      c.lineJoin = "round";
      for (let pass = 0; pass < 2; pass++) {
        c.strokeStyle = pass ? P.glint : P.wet2;
        c.fillStyle = P.wet2;
        for (let j = 0; j < sl.nrv; j++) {
          const o = j * 6;
          const t = age - sl.rv[o + 4];
          if (t <= 0) continue;
          const w = sl.rv[o + 2];
          const len = Math.min(cl.bh, sl.rv[o + 3] * Math.pow(t, 0.93) * (0.4 + 1.1 * I) * (0.3 + 0.7 * k));
          if (len < w * 0.5) continue;
          const x0 = sl.rv[o] - (pass ? w * 0.24 : 0);
          const y0 = sl.rv[o + 1] - 2;
          const ph = sl.rv[o + 5];
          const amp = 5 * k + 1;
          const lean = lat * capWind * capWind * 0.22;
          c.lineWidth = pass ? Math.max(1.2, w * 0.13) : w;
          c.globalAlpha = pass ? 0.55 : 1;
          c.beginPath();
          const a = pass ? Math.min(len * 0.2, 10) : 0;
          const z = pass ? len - w * 0.4 : len;
          let px = 0;
          for (let dy = a; dy <= z + 0.01; dy += 14) {
            px = x0 + lean * dy + amp * Math.sin((dy * 0.021) / (0.4 + 0.6 * k) + ph) * Math.min(1, dy / 40);
            if (dy === a) c.moveTo(px, y0 + dy);
            else c.lineTo(px, y0 + dy);
          }
          px = x0 + lean * z + amp * Math.sin((z * 0.021) / (0.4 + 0.6 * k) + ph) * Math.min(1, z / 40);
          c.lineTo(px, y0 + z);
          c.stroke();
          if (!pass) {
            c.beginPath();
            c.arc(px, y0 + z, w * 0.68, 0, TAU);
            c.fill();
          }
        }
      }
      c.globalAlpha = 1;
    }

    // Chunky caps on every surface of a figure, standing on the top of its
    // extrusion. D is the depth the oldest, most open surface has.
    const capD = new Float32Array(1400);
    const capT = new Float32Array(1400);
    function paintCaps(c, sl, oy, D) {
      const k = sl.cls.k;
      const dz = sl.cls.dz;
      const lw = clamp(D * 0.2, 0, 8 * (0.4 + 0.6 * k));
      const R0 = clamp(D * 0.95, 3, 60);
      const lean = capWind * 0.3;
      c.lineJoin = "round";
      c.lineCap = "round";
      c.lineWidth = lw;
      for (let pass = 0; pass < 2; pass++) {
        c.fillStyle = c.strokeStyle = pass ? pal.snow : pal.snowShade;
        c.beginPath();
        for (const ch of sl.chains) {
          const len = ch.n;
          let top = 0;
          for (let i = 0; i < len; i++) {
            const i0 = i > 3 ? i - 4 : 0;
            const i1 = i < len - 4 ? i + 4 : len - 1;
            const slope = (ch.y[i1] - ch.y[i0]) / (i1 - i0 || 1);
            const sf = clamp(1.4 - 1.2 * Math.abs(slope));
            const e = Math.min(i, len - 1 - i) + 2;
            const sh = e >= R0 ? 1 : Math.sqrt(1 - (1 - e / R0) * (1 - e / R0));
            const u = capWind >= 0 ? i / len : 1 - i / len;
            const er = 1 - Math.abs(capWind) * 0.62 * (1 - smoothstep(0, 0.6, u));
            const xs = (ch.x0 + i) / k;
            const lump = 1 + 0.24 * noise.n2(xs * 0.026 + sl.seed * 0.13, 3.1) + 0.1 * noise.n2(xs * 0.08, sl.seed * 0.29);
            const gp = ch.gap[i];
            let d = D * sf * sh * er * lump * (gp >= 9000 ? 1 : 0.45);
            const room = (gp - dz) * 0.3;
            if (gp < 9000 && d > room) d = Math.max(0, room);
            capT[i] = d;
          }
          for (let i = 0; i < len; i++) {
            const a = capT[i > 1 ? i - 2 : 0], b = capT[i > 0 ? i - 1 : 0], d = capT[i], e = capT[i < len - 1 ? i + 1 : len - 1], f = capT[i < len - 2 ? i + 2 : len - 1];
            capD[i] = (a + 2 * b + 3 * d + 2 * e + f) / 9;
            if (capD[i] > top) top = capD[i];
          }
          if (top < 0.7) continue;
          const lower = pass ? 0.36 : 0;
          const y0 = oy - dz;
          c.moveTo(ch.x0 - 0.5, y0 + ch.y[0] + 1.5 - capD[0] * lower);
          for (let i = 0; i < len; i++) c.lineTo(ch.x0 + i + lean * capD[i], y0 + ch.y[i] - capD[i]);
          c.lineTo(ch.x0 + len + 0.5, y0 + ch.y[len - 1] + 1.5 - capD[len - 1] * lower);
          for (let i = len - 1; i >= 0; i--) c.lineTo(ch.x0 + i + lean * capD[i] * lower, y0 + ch.y[i] + 1.5 - (capD[i] + 1.5) * lower);
          c.closePath();
        }
        c.fill();
        if (lw > 0.6) c.stroke();
      }
    }

    function extrude(ctx, canvas, dist, horizontal) {
      // grow the silhouette already in `canvas` by `dist` device pixels, upward
      // or sideways, by drawing it onto itself at doubling offsets
      let covered = 0;
      const need = Math.abs(dist);
      const dir = Math.sign(dist) || 1;
      while (covered < need) {
        const sh = Math.min(covered + 1, need - covered);
        if (horizontal) ctx.drawImage(canvas, dir * sh, 0);
        else ctx.drawImage(canvas, 0, -sh);
        covered += sh;
      }
    }

    function buildFace(sl, f) {
      const cl = sl.cls;
      const P = cl.kind === 2 ? pal.date : pal.big;
      const c = f.ctx;
      const cw = f.cv.width;
      const chh = f.cv.height;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = 1;
      c.clearRect(0, 0, cw, chh);
      sl.palDrawn = pal.version;
      sl.wetDrawn = sl.wetKey;
      sl.Ddrawn = sl.D;
      if (!sl.str) return;
      const silhouette = () => {
        sa.setTransform(1, 0, 0, 1, 0, 0);
        sa.globalCompositeOperation = "source-over";
        sa.clearRect(0, 0, cw, chh);
        sa.setTransform(R, 0, 0, R, 0, 0);
        sa.fillStyle = "#000";
        drawShape(sa, sl, 0, 0);
        sa.setTransform(1, 0, 0, 1, 0, 0);
      };
      const tint = (ctx, col) => {
        ctx.globalCompositeOperation = "source-in";
        ctx.fillStyle = col;
        ctx.fillRect(0, 0, cw, chh);
        ctx.globalCompositeOperation = "source-over";
      };
      const sxD = Math.round(sl.sx * R);
      const dzD = Math.max(1, Math.round(cl.dz * R));
      silhouette();
      // 1. the side face the viewer can see, from where the figure stands
      if (sxD !== 0) {
        sb.setTransform(1, 0, 0, 1, 0, 0);
        sb.globalCompositeOperation = "source-over";
        sb.clearRect(0, 0, cw, chh);
        sb.drawImage(SA, 0, 0);
        extrude(sb, SB, sxD, true);
        tint(sb, P.side);
        c.drawImage(SB, 0, 0);
      }
      // 2. the top faces (seen from above), with a rim of light on their back edges
      sb.setTransform(1, 0, 0, 1, 0, 0);
      sb.globalCompositeOperation = "source-over";
      sb.clearRect(0, 0, cw, chh);
      sb.drawImage(SA, 0, 0);
      extrude(sb, SB, dzD, false);
      const snowTop = smoothstep(0.3, 4, sl.D);
      if (P.rimOn && snowTop < 0.9) {
        tint(sb, P.rim);
        c.drawImage(SB, 0, -Math.max(1, Math.round(1.6 * R * (0.4 + 0.6 * cl.k))));
      }
      let top = P.top;
      if (sl.wetKey >= 0) top = mix(top, P.wet2, 0.5 * rainK + 0.2);
      if (snowTop > 0) top = mix(top, pal.snow, snowTop);
      tint(sb, top);
      c.drawImage(SB, 0, 0);
      // 3. the face: flat by day, lit from below by the floodlights at night
      c.setTransform(R, 0, 0, R, 0, 0);
      if (P.night && P.faceLo !== P.face) {
        const g = c.createLinearGradient(0, sl.oy - cl.inkH * (cl.kind === 1 ? 1 : 1.0), 0, sl.oy);
        g.addColorStop(0, P.face);
        g.addColorStop(1, P.faceLo);
        c.fillStyle = g;
      } else c.fillStyle = P.face;
      drawShape(c, sl, 0, 0);
      c.setTransform(1, 0, 0, 1, 0, 0);
      // 4. what the rain has done to it
      if (sl.wetKey >= 0 && rainK > 0.01) {
        sb.setTransform(1, 0, 0, 1, 0, 0);
        sb.globalCompositeOperation = "source-over";
        sb.clearRect(0, 0, cw, chh);
        sb.setTransform(R, 0, 0, R, 0, 0);
        paintWet(sb, sl, sl.age, P);
        sb.setTransform(1, 0, 0, 1, 0, 0);
        sb.globalCompositeOperation = "destination-in";
        sb.drawImage(SA, 0, 0);
        sb.globalCompositeOperation = "source-over";
        c.drawImage(SB, 0, 0);
      }
      // 5. snow
      if (snowK > 0 && sl.D > 0.4) {
        c.setTransform(R, 0, 0, R, 0, 0);
        paintCaps(c, sl, 0, sl.D);
        c.setTransform(1, 0, 0, 1, 0, 0);
      }
    }

    // ---- Manhattan, stars --------------------------------------------------------------
    const rr = (() => {
      let st = (seed * 2654435761 + 977) >>> 0;
      return () => (st = (Math.imul(st, 1664525) + 1013904223) >>> 0) / 4294967296;
    })();
    const bld = [];
    const wins = [];
    {
      // Midtown straight across the water, lower towers to either side
      let x = -10;
      while (x < W + 10) {
        const w = 14 + rr() * 46;
        const mid = Math.exp(-(((x - 610) / 230) ** 2)) + 0.45 * Math.exp(-(((x - 120) / 120) ** 2));
        let h = 8 + rr() * 22 + mid * (26 + rr() * 50);
        if (rr() < 0.07) h += 20 + rr() * 22;
        bld.push(x, w, h);
        for (let wy = HZ - RIV - h + 5; wy < HZ - RIV - 3; wy += 5) for (let wx = x + 3; wx < x + w - 3; wx += 5) if (rr() < 0.13) wins.push(wx, wy);
        x += w + (rr() < 0.25 ? 2 + rr() * 8 : 0);
      }
      // two spires the eye knows
      bld.push(676, 18, 112, 470, 14, 98);
    }
    const stars = new Float32Array(90);
    for (let i = 0; i < 30; i++) { stars[i * 3] = rr() * W; stars[i * 3 + 1] = 20 + rr() * (HZ - 140); stars[i * 3 + 2] = 1 + rr() * 1.6; }

    // speckle for the granite, made once
    const speck = document.createElement("canvas");
    speck.width = speck.height = 160;
    {
      const c = speck.getContext("2d");
      for (let i = 0; i < 900; i++) {
        const x = rr() * 160, y = rr() * 160, r = 0.4 + rr() * 1.3;
        c.fillStyle = rr() < 0.55 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.28)";
        c.fillRect(x, y, r, r);
      }
    }
    const speckPat = ground.ctx.createPattern(speck, "repeat");

    // ---- the ground layer: drawn when something in it changes ----------------------------
    function drawGround() {
      const g = ground.ctx;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
      // the sky
      let gr = g.createLinearGradient(0, 0, W, 0);
      gr.addColorStop(0, pal.sky0);
      gr.addColorStop(0.5, pal.sky1);
      gr.addColorStop(1, pal.sky2);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, HZ + 2);
      gr = g.createLinearGradient(0, 0, 0, HZ);
      gr.addColorStop(0, rgba(pal.zen, 0.7));
      gr.addColorStop(1, rgba(pal.zen, 0));
      g.fillStyle = gr;
      g.fillRect(0, 0, W, HZ);
      if (pal.starA > 0.02) {
        g.fillStyle = rgba("#ffffff", pal.starA);
        g.beginPath();
        for (let i = 0; i < 30; i++) g.rect(stars[i * 3], stars[i * 3 + 1], stars[i * 3 + 2], stars[i * 3 + 2]);
        g.fill();
      }
      // Manhattan
      g.fillStyle = pal.skyline;
      g.beginPath();
      for (let i = 0; i < bld.length; i += 3) g.rect(bld[i], HZ - RIV - bld[i + 2], bld[i + 1], bld[i + 2] + 1);
      g.fill();
      g.beginPath();
      g.moveTo(683, HZ - RIV - 112);
      g.lineTo(685, HZ - RIV - 138);
      g.lineTo(687, HZ - RIV - 112);
      g.moveTo(475, HZ - RIV - 98);
      g.lineTo(477, HZ - RIV - 122);
      g.lineTo(479, HZ - RIV - 98);
      g.fill();
      if (pal.winA > 0.02) {
        g.fillStyle = rgba("#ffd9a0", pal.winA);
        g.beginPath();
        for (let i = 0; i < wins.length; i += 2) g.rect(wins[i], wins[i + 1], 1.6, 1.6);
        g.fill();
      }
      g.fillStyle = pal.river;
      g.fillRect(0, HZ - RIV, W, RIV);
      // the plaza
      gr = g.createLinearGradient(0, HZ, 0, FE);
      for (let i = 0; i <= 8; i++) {
        const y = HZ + ((FE - HZ) * i) / 8;
        gr.addColorStop(i / 8, mix(pal.gNear, pal.gFar, farness(y)));
      }
      g.fillStyle = gr;
      g.fillRect(0, HZ, W, FE - HZ);
      if (fogK > 0.02) {
        gr = g.createLinearGradient(0, HZ - 120, 0, HZ + 520);
        gr.addColorStop(0, rgba(pal.fog, 0.95 * fogK));
        gr.addColorStop(1, rgba(pal.fog, 0));
        g.fillStyle = gr;
        g.fillRect(0, HZ - 120, W, 640);
      }
      // the joints between the paving slabs, in perspective
      if (pal.jointA > 0.01) {
        g.strokeStyle = rgba(pal.joint, pal.jointA);
        g.lineWidth = 1.4;
        g.beginPath();
        for (let z = 1.08; z < 60; z *= 1.32) {
          const y = HZ + (FE - HZ) / z;
          g.moveTo(0, y);
          g.lineTo(W, y);
        }
        for (let i = -6; i <= 12; i++) {
          const xf = 540 + (i - 3) * 230;
          g.moveTo(xf, FE);
          g.lineTo(540 + (xf - 540) * 0.05, HZ + 30);
        }
        g.stroke();
      }
      // pools of floodlight in front of the pedestals
      if (pal.poolA > 0.01) {
        for (const sl of pedSlots) {
          if (!sl.present) continue;
          const row = ROW[sl.row];
          const cx = sl.cellX + sl.cls.cellW / 2;
          const cy = row.base + row.pt + row.ped + 6;
          const r = sl.cls.cellW * 0.95 + 40;
          g.save();
          g.translate(cx, cy);
          g.scale(1, 0.24);
          const pg = g.createRadialGradient(0, 0, 0, 0, 0, r);
          pg.addColorStop(0, rgba(pal.pool, pal.poolA * (wet > 0.3 ? 1.3 : 1)));
          pg.addColorStop(1, rgba(pal.pool, 0));
          g.fillStyle = pg;
          g.fillRect(-r, -r, r * 2, r * 2);
          g.restore();
        }
      }
      // the pedestals, with what has settled on them
      for (const sl of pedSlots) {
        if (!sl.present) continue;
        const row = ROW[sl.row];
        const x0 = sl.cellX - 6;
        const w = sl.cls.cellW + 12;
        const yt = row.base - row.pt;
        const yf = row.base + row.pt;
        g.fillStyle = pal.graniteTop;
        g.fillRect(x0, yt, w, row.pt * 2);
        g.fillStyle = pal.granite;
        g.fillRect(x0, yf, w, row.ped);
        g.fillStyle = speckPat;
        g.fillRect(x0, yf, w, row.ped);
        g.fillStyle = "rgba(255,255,255,0.12)";
        g.fillRect(x0, yf, w, 1.5);
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.fillRect(x0 + w - 3, yf, 3, row.ped);
        const lay = cover * row.pt * 1.2;
        if (lay + sl.heap > 0.6) {
          for (let pass = 0; pass < 2; pass++) {
            g.fillStyle = pass ? pal.snow : pal.snowShade;
            g.beginPath();
            g.moveTo(x0 - 2, yf + (pass ? 0 : 3));
            for (let x = 0; x <= w + 4; x += 4) {
              const u = (x - w / 2) / (w * 0.4);
              const hgt = lay * (0.8 + 0.3 * noise.n2((x0 + x) * 0.05, sl.id * 3.1)) + sl.heap * Math.exp(-u * u) * (0.85 + 0.25 * noise.n2((x0 + x) * 0.03, sl.id * 7.7));
              g.lineTo(x0 - 2 + x, yt + row.pt - hgt * (pass ? 1 : 0.9) - (pass ? 2 : 0));
            }
            g.lineTo(x0 + w + 2, yf + (pass ? 0 : 3));
            g.closePath();
            g.fill();
          }
        }
      }
      // the podium face, with its lit lip
      g.fillStyle = cover > 0.3 ? mix(pal.lip, pal.snow, cover) : pal.lip;
      g.fillRect(0, FE, W, LIP);
      g.fillStyle = pal.granite;
      g.fillRect(0, FE + LIP, W, H - FE - LIP);
      g.fillStyle = speckPat;
      g.fillRect(0, FE + LIP, W, H - FE - LIP);
      gr = g.createLinearGradient(0, FE + LIP, 0, FE + LIP + 60);
      gr.addColorStop(0, "rgba(0,0,0,0.45)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(0, FE + LIP, W, 60);
    }

    // ---- shadows and reflections: redrawn while a figure moves ---------------------------
    function shadowOf(f, sl, face, ax, by, alpha, passes, soft) {
      const row = ROW[sl.row];
      const base = row.base;
      const x = sl.x;
      const y = sl.gy + face.off;
      for (let p = 0; p < passes; p++) {
        const j = passes > 1 ? p / (passes - 1) - 0.5 : 0;
        const a = ax + j * soft * 0.02;
        const b = by * (1 + j * 0.12) - 0.035;
        f.save();
        f.setTransform(1, 0, -a, b, a * base, base - b * base);
        f.beginPath();
        f.rect(x - 400, base - 1400, sl.cls.bw + 800, 1400);
        f.clip();
        f.globalAlpha = alpha / passes;
        f.drawImage(face.sil, x, y, sl.cls.bw, sl.cls.bh);
        f.restore();
      }
    }
    function drawFx() {
      fx.clear();
      const f = fx.ctx;
      f.save();
      f.beginPath();
      f.rect(0, HZ, W, FE - HZ);
      f.clip();
      for (const sl of slots) {
        if (!sl.present) continue;
        const row = ROW[sl.row];
        const k = row.k;
        for (let fi = 0; fi < 2; fi++) {
          const face = sl.faces[fi];
          if (!face.vis || !face.str) continue;
          // contact: the stone darkens where it stands
          shadowOf(f, sl, face, 0, 0, pal.contactA, 3, 8);
          if (pal.shA > 0.01) shadowOf(f, sl, face, pal.shAx, pal.shBy * k, pal.shA, 4, pal.shSoft);
          if (pal.nsA > 0.01) shadowOf(f, sl, face, 0.08 * ((sl.cellX + sl.cls.cellW / 2 - W / 2) / (W / 2)), 0.55 * k + 0.05, pal.nsA, 4, 10);
        }
      }
      // on a wet plaza, each figure stands in its own broken reflection
      if (pal.refA > 0.01) {
        for (const sl of slots) {
          if (!sl.present) continue;
          const row = ROW[sl.row];
          const base = row.base + row.pt + row.ped;
          const face = sl.faces[sl.cur];
          if (!face.str) continue;
          const kr = 0.55;
          for (let p = 0; p < 3; p++) {
            f.save();
            f.setTransform(1, 0, 0, -kr, 0, base * (1 + kr) + p * 7);
            f.beginPath();
            f.rect(sl.x - 50, row.base - 1400, sl.cls.bw + 100, 1400);
            f.clip();
            f.globalAlpha = pal.refA * (p === 0 ? 0.6 : 0.3);
            f.drawImage(face.cv, sl.x, sl.gy + face.off, sl.cls.bw, sl.cls.bh);
            f.restore();
          }
        }
      }
      f.restore();
    }

    // ---- collision grid: which row's stone is at each 2 px cell ---------------------------
    // values: 1 date, 2 hours, 3 minutes, 4 the podium face
    const grid = new Uint8Array(GW * GH);
    const RD = [0, 1, 2, 3, 3.4];
    function rebuildGrid() {
      grid.fill(0);
      for (let y = FE >> 1; y < GH; y++) grid.fill(4, y * GW, (y + 1) * GW);
      for (const sl of slots) {
        if (!sl.present || !sl.str || !sl.mask) continue;
        const { bw } = sl.cls;
        const v = sl.row + 1;
        const row = ROW[sl.row];
        if (row.ped) {
          const y0 = (row.base - row.pt) >> 1;
          const y1 = (row.base + row.pt + row.ped) >> 1;
          const x0 = Math.max(0, (sl.cellX - 6) >> 1);
          const x1 = Math.min(GW, (sl.cellX + sl.cls.cellW + 6) >> 1);
          for (let y = y0; y < y1; y++) grid.fill(v, y * GW + x0, y * GW + x1);
        }
        const dz = sl.cls.dz;
        const yEnd = Math.min(sl.cls.bh, row.base - sl.gy);
        for (let x = 0; x < bw; x += 2) {
          const gx = (sl.x + x) >> 1;
          if (gx < 0 || gx >= GW) continue;
          let wasSolid = false;
          for (let y = 0; y < yEnd; y += 2) {
            const solid = sl.mask[y * bw + x] > 100;
            if (solid) {
              const top = solid && !wasSolid ? y - dz : y;
              for (let yy = Math.max(0, top); yy <= y; yy += 2) {
                const gy = (sl.gy + yy) >> 1;
                if (gy >= 0 && gy < GH) grid[gy * GW + gx] = v;
              }
            }
            wasSolid = solid;
          }
        }
      }
    }

    // ---- the air: snow, rain or dust, at six depths ----------------------------------------
    const NP = 680;
    const px = new Float32Array(NP), py = new Float32Array(NP), psz = new Float32Array(NP), pph = new Float32Array(NP), pland = new Float32Array(NP);
    const plane = new Uint8Array(NP);
    const PD = [0.5, 1.5, 2, 2.5, 3, 3.5]; // depth of each lane, against RD
    const SC = [0.42, 0.56, 0.7, 0.8, 0.95, 1.3]; // size and speed of each lane
    const landFor = (lane) => {
      switch (lane) {
        case 0: return lerp(HZ + 4, ROW[0].base - 2, rr());
        case 1: return lerp(ROW[0].base + 6, ROW[1].base - 20, rr());
        case 2: return lerp(ROW[1].base + 2, ROW[1].base + 60, rr());
        case 3: return lerp(ROW[1].base + 60, ROW[2].base - 6, rr());
        case 4: return lerp(ROW[2].base + 2, FE - 2, rr());
        default: return H + 30;
      }
    };
    for (let i = 0; i < NP; i++) {
      const c = i % 25;
      const lane = c < 3 ? 0 : c < 8 ? 1 : c < 11 ? 2 : c < 17 ? 3 : c < 22 ? 4 : 5;
      plane[i] = lane;
      px[i] = -120 + rr() * (W + 240);
      psz[i] = rr();
      pph[i] = rr();
      pland[i] = landFor(lane);
      py[i] = -60 + rr() * (pland[i] + 60);
    }
    const NR = 48;
    const rpx = new Float32Array(NR), rpy = new Float32Array(NR), rpt = new Float32Array(NR).fill(-9), rps = new Float32Array(NR);
    let rpi = 0;
    const ripple = (x, y, sc) => {
      rpx[rpi] = x; rpy[rpi] = y; rpt[rpi] = now; rps[rpi] = sc;
      rpi = (rpi + 1) % NR;
    };
    const NS = 40;
    const spx = new Float32Array(NS), spy = new Float32Array(NS), spt = new Float32Array(NS).fill(-9), sps = new Float32Array(NS);
    let spi = 0;
    const splash = (x, y, sc) => {
      spx[spi] = x; spy[spi] = y; spt[spi] = now; sps[spi] = sc;
      spi = (spi + 1) % NS;
    };
    const hidden = (x, y, lane) => {
      if (x < 0 || x >= W || y < 0 || y >= H) return false;
      const v = grid[(y >> 1) * GW + (x >> 1)];
      return v !== 0 && RD[v] > PD[lane];
    };

    let now = 0;
    let precip = 0; // 0 dry, 1 rain, 2 snow
    function drawAir(s) {
      const c = air.ctx;
      air.clear();
      const dt = s.dt;
      const w = s.weather;
      const gust = 1 + 0.3 * Math.sin(now * 0.31) + 0.18 * Math.sin(now * 0.83 + 1.7);
      const wind = w.wind * gust * lat;
      const I = w.intensity;
      if (precip === 2) {
        const count = Math.round(lerp(190, NP, clamp(I * 1.15)));
        const fall = 0.75 + 0.6 * I;
        for (let i = 0; i < count; i++) {
          const sc = SC[plane[i]];
          py[i] += (50 + 90 * psz[i]) * fall * sc * dt;
          px[i] += (wind * 7 * (0.55 + 0.6 * psz[i]) * sc + 16 * sc * Math.sin(now * (0.5 + pph[i]) + pph[i] * 40)) * dt;
          const x = px[i], y = py[i];
          const lane = plane[i];
          let dead = y > pland[i];
          if (!dead && (lane === 2 || lane === 4) && x >= 0 && x < W && y > 0 && grid[(y >> 1) * GW + (x >> 1)] === (lane === 2 ? 2 : 3)) dead = true;
          if (dead) {
            py[i] = -12 - rr() * 90;
            px[i] = -260 * Math.sign(wind) * clamp(Math.abs(wind) / 20) - 80 + rr() * (W + 160);
          }
          if (px[i] < -280) px[i] += W + 560;
          else if (px[i] > W + 280) px[i] -= W + 560;
        }
        c.fillStyle = pal.snow;
        for (let pass = 0; pass < 3; pass++) {
          c.globalAlpha = pass === 0 ? 0.6 : pass === 1 ? 0.9 : 0.95;
          c.beginPath();
          for (let i = 0; i < count; i++) {
            const lane = plane[i];
            if ((lane < 2 ? 0 : lane < 4 ? 1 : 2) !== pass) continue;
            const x = px[i], y = py[i];
            if (y < -8 || x < -8 || x > W + 8) continue;
            if (hidden(x, y, lane)) continue;
            const r = (1.3 + 2.9 * psz[i]) * SC[lane];
            c.moveTo(x + r, y);
            c.arc(x, y, r, 0, TAU);
          }
          c.fill();
        }
        c.globalAlpha = 1;
      } else if (precip === 1) {
        const count = Math.round(lerp(110, 600, clamp(I * 1.05)));
        const slow = w.falling === "drizzle" ? 0.55 : 1;
        const vx = wind * 15;
        for (let i = 0; i < count; i++) {
          const lane = plane[i];
          const sc = SC[lane];
          py[i] += (680 + 400 * psz[i]) * slow * sc * dt;
          px[i] += vx * (0.8 + 0.4 * psz[i]) * sc * dt;
          const x = px[i], y = py[i];
          let dead = y > pland[i];
          let onStone = false;
          if (!dead && (lane === 2 || lane === 4) && x >= 0 && x < W && y > 0 && grid[(y >> 1) * GW + (x >> 1)] === (lane === 2 ? 2 : 3)) { dead = true; onStone = true; }
          if (dead) {
            if (x > 0 && x < W && (i & 1) === 0) {
              if (onStone) splash(x, y, sc);
              else if (lane < 5) ripple(x, pland[i], sc);
            }
            py[i] = -20 - rr() * 240;
            px[i] = -vx * 1.2 - 60 + rr() * (W + 120);
          }
        }
        c.strokeStyle = pal.rain;
        c.lineCap = "round";
        for (let pass = 0; pass < 3; pass++) {
          c.globalAlpha = pass === 0 ? 0.32 : pass === 1 ? 0.55 : 0.62;
          c.lineWidth = pass === 0 ? 1.1 : pass === 1 ? 1.8 : 2.6;
          c.beginPath();
          for (let i = 0; i < count; i++) {
            const lane = plane[i];
            if ((lane < 2 ? 0 : lane < 4 ? 1 : 2) !== pass) continue;
            const x = px[i], y = py[i];
            if (y < 0 || x < -20 || x > W + 20) continue;
            if (hidden(x, y, lane)) continue;
            const sc = SC[lane];
            const tau = (0.022 + 0.014 * psz[i]) * sc;
            c.moveTo(x, y);
            c.lineTo(x - vx * (0.8 + 0.4 * psz[i]) * tau, y - (680 + 400 * psz[i]) * slow * tau);
          }
          c.stroke();
        }
        // rings on the wet plaza
        c.lineWidth = 1.3;
        for (let pass = 0; pass < 2; pass++) {
          c.globalAlpha = pass ? 0.28 : 0.55;
          c.beginPath();
          for (let i = 0; i < NR; i++) {
            const a = (now - rpt[i]) / 0.7;
            if (a < 0 || a >= 1 || (a >= 0.45) !== (pass === 1)) continue;
            const r = (3 + 16 * a) * rps[i];
            c.moveTo(rpx[i] + r, rpy[i]);
            c.ellipse(rpx[i], rpy[i], r, r * 0.26, 0, 0, TAU);
          }
          c.stroke();
        }
        // splashes where drops hit stone
        c.globalAlpha = 0.75;
        c.lineWidth = 1.6;
        c.beginPath();
        for (let i = 0; i < NS; i++) {
          const a = (now - spt[i]) / 0.3;
          if (a < 0 || a >= 1) continue;
          const x = spx[i], y = spy[i], sc = sps[i];
          const r = (3 + 9 * a) * sc;
          const h = 18 * a * (1 - a) * sc;
          c.moveTo(x - r * 0.4, y - 1);
          c.lineTo(x - r, y - 1 - h);
          c.moveTo(x + r * 0.4, y - 1);
          c.lineTo(x + r, y - 1 - h);
        }
        c.stroke();
        c.globalAlpha = 1;
      } else {
        // dust on the wind, more of it in bad air
        const count = Math.round(clamp(80 + w.aqi * 1.6 + fogK * 60, 70, 380));
        const stream = clamp(Math.abs(wind) / 26);
        for (let i = 0; i < count; i++) {
          const sc = SC[plane[i]];
          const ph = pph[i];
          const vx = (wind * (3.2 + 4.4 * psz[i]) + 9 * Math.sin(now * 0.27 + ph * 31)) * sc;
          const vy = (7 * Math.cos(now * 0.21 + ph * 47) + 3 * Math.sin(now * 0.5 + ph * 13) - 1.5) * sc;
          px[i] += vx * dt;
          py[i] += vy * dt;
          if (px[i] < -40) px[i] += W + 80;
          else if (px[i] > W + 40) px[i] -= W + 80;
          const top = plane[i] === 0 ? HZ - 120 : 60;
          if (py[i] < top) py[i] += pland[i] - top;
          else if (py[i] > pland[i]) py[i] -= pland[i] - top;
        }
        c.strokeStyle = pal.mote;
        c.lineCap = "round";
        const dim = pal.night ? 0.55 : 1;
        for (let pass = 0; pass < 2; pass++) {
          c.globalAlpha = (pass ? 0.75 : 0.45) * dim;
          c.lineWidth = pass ? 3.2 : 2;
          c.beginPath();
          for (let i = 0; i < count; i++) {
            const lane = plane[i];
            if ((lane >= 3) !== (pass === 1)) continue;
            const x = px[i], y = py[i];
            if (y < 0 || x < 0 || x >= W || y > FE) continue;
            if (hidden(x, y, lane)) continue;
            const tail = (0.5 + stream * (10 + 22 * psz[i])) * SC[lane];
            c.moveTo(x, y);
            c.lineTo(x - Math.sign(wind || 1) * tail, y + 0.01);
          }
          c.stroke();
        }
        // heat: the far stones shimmer with a mirage of the sky
        if (heat > 0.02) {
          c.strokeStyle = pal.horizon;
          c.lineWidth = 2.2;
          c.globalAlpha = 0.55 * heat;
          c.beginPath();
          for (let j = 0; j < 9; j++) {
            const y = HZ + 3 + j * 4.2 + 1.5 * Math.sin(now * 1.3 + j * 2.1);
            for (let x = 0; x <= W; x += 24) {
              const yy = y + 1.6 * Math.sin(x * 0.045 + now * (1.7 + j * 0.13) + j);
              if (x === 0) c.moveTo(x, yy);
              else c.lineTo(x, yy);
            }
          }
          c.stroke();
        }
        c.globalAlpha = 1;
      }
    }

    // ---- per-figure age and the amounts that follow from it ---------------------------------
    const fmtAge = (sec, coarse) => {
      if (sec < 60) return `${Math.floor(sec)} sec`;
      const m = Math.floor(sec / 60);
      if (m < 60) return `${m} min`;
      const h = Math.floor(m / 60);
      return coarse || m % 60 === 0 ? `${h} hr` : `${h} hr ${m % 60} min`;
    };
    function ages(s) {
      const c = s.clock;
      const inHour = c.m * 60 + c.sf;
      S.m2.age = c.sf;
      S.m1.age = (c.m % 10) * 60 + c.sf;
      S.h2.age = inHour;
      S.h1.age = c.h12 >= 10 ? (c.h12 - 10) * 3600 + inHour : 0;
      S.ap.age = (c.h24 % 12) * 3600 + inHour;
      S.date.age = c.h24 * 3600 + inHour;
      return inHour;
    }
    // Snow the day has brought (hours of it, weighted by rate) less what a thaw
    // has taken back, over the last twelve hours.
    let histKey = "";
    let histSnow = 0;
    let histWet = 0;
    function history(s) {
      const ph = s.pastHours;
      const key = `${s.clock.h24}:${ph.length}:${ph.length ? ph[ph.length - 1].ms : 0}`;
      if (key === histKey) return;
      histKey = key;
      let e = 0;
      let wetH = 0;
      const start = s.ms - 12 * 3600000;
      for (const h of ph) {
        if (h.ms < start) continue;
        if (h.kind === "snow") e += clamp(Math.sqrt(Math.max(0.004, h.precip) / 0.12), 0.15, 1);
        else if (h.temp > 34) e = Math.max(0, e - clamp((h.temp - 34) / 10));
      }
      for (let i = Math.max(0, ph.length - 2); i < ph.length; i++) if (ph[i].precip > 0.005 && ph[i].kind !== "snow") wetH = Math.max(wetH, i === ph.length - 1 ? 0.5 : 0.3);
      histSnow = e;
      histWet = wetH;
    }

    const wetKeyOf = (age) => (age < 90 ? Math.floor(age * 2) : age < 900 ? 180 + Math.floor((age - 90) / 3) : 450 + Math.floor((age - 900) / 20));

    // ---- layout --------------------------------------------------------------------------
    let tens = null;
    function layout(hasTens) {
      tens = hasTens;
      let tot = CLS.min.cellW * 2 + GAP;
      let x = Math.round((W - tot) / 2);
      S.m1.cellX = x;
      S.m2.cellX = x + CLS.min.cellW + GAP;
      const cH = CLS.hour.cellW;
      const cA = CLS.ap.cellW;
      tot = (hasTens ? cH * 2 + GAP : cH) + GAP + cA;
      x = Math.round((W - tot) / 2);
      S.h1.present = hasTens;
      if (hasTens) { S.h1.cellX = x; x += cH + GAP; }
      S.h2.cellX = x;
      x += cH + GAP;
      S.ap.cellX = x;
      S.date.cellX = MX;
      for (const sl of slots) {
        const row = ROW[sl.row];
        sl.x = sl.cellX - sl.cls.padX;
        sl.gy = row.base - sl.cls.oy;
        sl.box.style.display = sl.present ? "" : "none";
        sl.box.style.left = `${sl.x}px`;
        sl.box.style.top = `${sl.gy}px`;
        sl.box.style.width = `${sl.cls.bw}px`;
        sl.box.style.height = `${row.base - sl.gy}px`;
        const cxn = (sl.cellX + sl.cls.cellW / 2 - W / 2) / (W / 2);
        sl.sx = sl.row === 0 ? 0 : -clamp(cxn, -1, 1) * 9 * sl.cls.k;
        sl.palDrawn = -1;
        if (sl.age_) {
          sl.age_.style.display = sl.present ? "" : "none";
          sl.age_.style.left = `${Math.round(sl.cellX + sl.cls.cellW / 2)}px`;
          sl.age_.style.top = `${Math.round(topFor(row.base + row.pt + row.ped / 2 + (mRok.cap * 26) / 2, 26, mRok))}px`;
        }
      }
    }

    function place(f, travel) {
      const vis = f.vis && f.str !== "" && f.off < travel - 1;
      const txt = vis ? `translate3d(0,${f.off.toFixed(1)}px,0)` : "none";
      if (f.offTxt !== txt) {
        f.offTxt = txt;
        f.cv.style.transform = vis ? txt : "";
        f.cv.style.visibility = vis ? "visible" : "hidden";
      }
    }

    // ---- one frame -----------------------------------------------------------------------
    let lastMs = null;
    let palClock = 0;
    let textShift = null;
    let groundKey = "";
    let groundClock = 0;
    let fxKey = "";
    let layoutVer = 0;
    let gridDirty = true;

    function update(s) {
      now = s.t;
      const w = s.weather;
      const first = lastMs === null;
      const step = first ? 0 : s.ms - lastMs;
      const jump = first || Math.abs(step) > 4000;
      const fast = jump || step > 300; // the clock is being run quickly: no transitions
      lastMs = s.ms;

      // weather drivers
      history(s);
      const fall = w.falling;
      const I = w.intensity;
      snowK = fall === "snow" ? clamp(I) : 0;
      rainK = fall && fall !== "snow" ? clamp(I) : 0;
      precip = snowK > 0.004 ? 2 : rainK > 0.004 ? 1 : 0;
      const sn = Math.sin(w.windDir * D2R);
      lat = -(sn >= 0 ? 1 : -1) * (0.4 + 0.6 * Math.abs(sn));
      capWind = Math.round(lat * clamp(w.wind / 32) * 20) / 20;
      fogK = Math.max(w.fog ? 1 : 0, smoothstep(2.5, 0.25, w.visibility));
      const inHour = ages(s);
      let snowAmt = histSnow + snowK * (inHour / 3600);
      if (!snowK && w.temp > 34) snowAmt *= smoothstep(46, 34, w.temp);
      cover = Math.round((precip === 2 ? Math.max(1 - Math.exp(-snowAmt * 1.4), 0.6 + 0.4 * snowK) : 1 - Math.exp(-snowAmt * 1.4)) * 20) / 20;
      wet = cover > 0.5 ? 0 : Math.round((precip === 1 ? 0.6 + 0.4 * rainK : histWet) * 20) / 20;

      palClock -= s.dt;
      if (palClock <= 0 || fast) {
        palClock = 0.5;
        updatePalette(s);
      }

      // what each slot should be showing
      const c = s.clock;
      const hasTens = c.hh.length > 1;
      if (tens !== hasTens) { layout(hasTens); layoutVer++; gridDirty = true; }
      const want = [hasTens ? c.hh[0] : "", c.hh[c.hh.length - 1], c.mm[0], c.mm[1], c.ampm, `${s.text.weekday.toUpperCase()}|${s.text.monthDay.toUpperCase()}`];
      for (let i = 0; i < 6; i++) {
        const sl = slots[i];
        if (sl.str === want[i]) continue;
        gridDirty = true;
        const animate = !fast && sl.str !== "" && want[i] !== "" && sl.row !== 0;
        if (animate) {
          // the outgoing figure keeps its picture, snow and all, and sinks
          sl.faces[sl.cur].vis = true;
          sl.cur = 1 - sl.cur;
          sl.anim = true;
          sl.t0 = now;
        } else {
          sl.anim = false;
          sl.faces[1 - sl.cur].vis = false;
          sl.faces[1 - sl.cur].str = "";
        }
        const f = sl.faces[sl.cur];
        f.vis = true;
        setGlyph(sl, f, want[i], s);
      }
      if (gridDirty) {
        rebuildGrid();
        gridDirty = false;
      }

      // amounts
      const since = inHour;
      let heapKey = "";
      for (const sl of slots) {
        const eff = sl === S.date ? (histSnow * 3600 + snowK * inHour) / 4 : snowK * sl.age;
        sl.D = precip === 2 ? sl.cls.capMax * (1 - Math.exp(-eff / 600)) : 0;
        sl.wetKey = precip === 1 ? wetKeyOf(sl.age) + Math.round(rainK * 12) * 1000 : -1;
      }
      const capAt = (age) => 84 * (1 - Math.exp((-snowK * age) / 600));
      if (precip === 2) {
        const mins = Math.floor(since / 60);
        S.m2.heap = Math.min(30, 2.2 * Math.sqrt(mins * capAt(60)));
        S.m1.heap = Math.min(30, 2.2 * Math.sqrt(Math.floor(mins / 10) * capAt(600)));
        const hourly = Math.min(22, 1.6 * Math.sqrt(c.h12 * capAt(3600) * 0.3));
        S.h2.heap = hourly;
        S.h1.heap = hourly * 0.6;
        S.ap.heap = Math.min(10, hourly * 0.4);
      } else for (const sl of pedSlots) sl.heap = 0;
      for (const sl of pedSlots) heapKey += Math.round(sl.heap);

      // rebuild what has changed; in real time, at most one figure a frame
      let budget = fast ? 99 : 1;
      let rebuilt = false;
      for (const sl of slots) {
        if (!sl.present || !sl.str) continue;
        const stale = sl.palDrawn !== pal.version || sl.wetDrawn !== sl.wetKey || Math.abs(sl.D - sl.Ddrawn) >= 0.5;
        if (stale && budget > 0) {
          budget--;
          buildFace(sl, sl.faces[sl.cur]);
          if (sl.palDrawn !== shown[`sil${sl.id}`]) {
            shown[`sil${sl.id}`] = sl.palDrawn;
            paintSil(sl, sl.faces[sl.cur]);
          }
          rebuilt = true;
        }
      }

      // the figures moving: the old one sinks, the new one rises
      let moving = false;
      for (const sl of slots) {
        const cur = sl.faces[sl.cur];
        const old = sl.faces[1 - sl.cur];
        const travel = sl.cls.bh;
        let offC = 0;
        let offO = travel;
        if (sl.anim) {
          const a = now - sl.t0;
          if (a >= T_RISE0 + T_RISE || fast) {
            sl.anim = false;
            old.vis = false;
            old.str = "";
          } else {
            moving = true;
            offO = travel * ease.in(clamp(a / T_SINK));
            offC = travel * (1 - ease.cubicOut(clamp((a - T_RISE0) / T_RISE)));
            if (a >= T_SINK) old.vis = false;
          }
        }
        cur.off = offC;
        old.off = offO;
        place(cur, travel);
        place(old, travel);
      }

      // the ground: when what lies on it, the light or the layout changes
      groundClock -= s.dt;
      const gKey = `${pal.version}|${pal.gNear}|${pal.gFar}|${pal.sky0}|${pal.sky2}|${pal.winA.toFixed(2)}|${cover}|${wet}|${heapKey}|${layoutVer}`;
      if (gKey !== groundKey && (groundClock <= 0 || fast)) {
        groundKey = gKey;
        groundClock = 0.5;
        drawGround();
      }
      const fKey = `${pal.version}|${pal.shA.toFixed(2)}|${pal.shAx.toFixed(2)}|${pal.shBy.toFixed(2)}|${pal.nsA.toFixed(2)}|${pal.refA.toFixed(2)}|${layoutVer}`;
      if (moving || rebuilt || fKey !== fxKey) {
        fxKey = fKey;
        drawFx();
      }

      // ---- text
      const tx = s.text;
      put("temp", n.temp, tx.temp);
      if (shown.tempFor !== tx.temp) {
        shown.tempFor = tx.temp;
        shown.tempW = n.temp.offsetWidth;
      }
      const left = MX + (shown.tempW || 0) + 30;
      css("condL", n.cond, "left", `${left}px`);
      css("subL", n.sub, "left", `${left}px`);
      if (put("cond", n.cond, tx.condition) || shown.condAt !== left) {
        shown.condAt = left;
        fitText(n.cond, W - MX - left);
      }
      const sub = w.live ? `Feels ${tx.feels} · Wind ${tx.wind}` : "";
      if (put("sub", n.sub, sub) || shown.subAt !== left) {
        shown.subAt = left;
        fitText(n.sub, W - MX - left);
      }
      put("sunL", n.sunL, tx.sunLabel);
      if (put("sunV", n.sunV, tx.sunValue)) fitText(n.sunV, colW[0]);
      if (put("moonV", n.moonV, tx.moon)) fitText(n.moonV, colW[1]);
      put("aqiV", n.aqiV, tx.aqi);
      put("uvV", n.uvV, tx.uv);
      const hasFact = tx.factValue !== "";
      put("factL", n.factL, tx.factLabel);
      if (put("factV", n.factV, tx.factValue) && hasFact) {
        n.factV.style.fontSize = "40px";
        n.factV.style.lineHeight = "46px";
        if (n.factV.offsetHeight > 96) {
          n.factV.style.fontSize = "36px";
          n.factV.style.lineHeight = "42px";
        }
      }
      const shift = hasFact ? 0 : 58;
      if (shift !== textShift) {
        textShift = shift;
        layoutText(shift);
        n.factL.style.display = n.factV.style.display = n.rule2.style.display = hasFact ? "" : "none";
      }
      for (const sl of pedSlots) {
        if (!sl.present || !sl.str) continue;
        const txt = fmtAge(sl.age, sl === S.ap);
        if (txt !== sl.ageText) {
          sl.ageText = txt;
          sl.age_.textContent = txt;
        }
      }

      // ---- the slow parts of the sky
      let sw = 0;
      if (fall === "storm") {
        const per = 23;
        const k = Math.floor(now / per);
        const tt = now - k * per - 4 - 12 * hash(k, seed + 70);
        if (tt > 0 && tt < 4.5) sw = Math.sin((tt / 4.5) * Math.PI) ** 2 * (0.5 + 0.5 * hash(k, seed + 71));
      }
      css("swell", swell, "opacity", (sw * (pal.night ? 0.2 : 0.1)).toFixed(3));
      const cloudO = partly * pal.shA * 0.75;
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        const o = cloudO.toFixed(2);
        if (b.o !== o) { b.o = o; b.node.style.opacity = o; }
        if (cloudO > 0.01) {
          const span = W + b.w;
          const drift = (b.ph * span + now * (6 + Math.abs(w.wind) * 2.2) * b.sp * (lat >= 0 ? 1 : -1)) % span;
          const x = ((drift + span) % span) - b.w;
          b.node.style.transform = `translate3d(${x.toFixed(1)}px, ${b.y.toFixed(1)}px, 0)`;
        }
      }
      for (let i = 0; i < wisps.length; i++) {
        const v = wisps[i];
        const peak = v.front ? 0.2 : 0.8;
        const o = (fogK * peak * (0.6 + 0.4 * Math.sin(now * 0.05 * v.sp + v.ph * 9))).toFixed(2);
        if (v.o !== o) { v.o = o; v.node.style.opacity = o; }
        if (fogK > 0.01) {
          const span = W + v.w;
          const drift = (v.ph * span + now * (5 + Math.abs(w.wind) * 1.6) * v.sp * (lat >= 0 ? 1 : -1)) % span;
          const x = ((drift + span) % span) - v.w;
          v.node.style.transform = `translate3d(${x.toFixed(1)}px, ${(v.y + 22 * Math.sin(now * 0.07 + v.ph * 20)).toFixed(1)}px, 0)`;
        }
      }

      drawAir(s);
    }

    if (state && state.clock && state.clock.hh) update(state);
    return { frame: update };
  },
};

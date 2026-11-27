// One Hundred Views of the East River
//
// A woodblock print, after Hiroshige, of the view from Long Island City: the
// Queensboro truss, the Manhattan skyline and the black gantry, standing in
// today's real weather. Everything is flat colour blocks, bokashi gradation
// and ruled lines, the things a woodblock print is made of.
//
// How the conditions drive it:
//   - Rain is two sets of ruled lines at the angle the real wind gives them
//     (wind direction against the west-facing view, and its speed); their
//     number is how hard it is raining. Snow is paper-white dots, and white
//     caps on the steel and the rooftops.
//   - Cloud, fog and poor visibility slide round-ended mist bands across the
//     sky and the towers; thick fog hides the skyline and pales the bridge.
//   - The sky block takes its colour from the measured sky (the flat tint from
//     the north-west, the horizon band from the west), deepening to indigo
//     at night; windows come on one at a time through dusk.
//   - Water lines drift with the tide (upstream on the flood, downstream on
//     the ebb) and tighten into chop in wind. A barge passes now and then.
//   - A red sun or a paper moon is only ever an incidental printed disc at a
//     fixed spot behind the skyline, shown when it is really there to see.
//   - The time is the sumi block cut into the sky; the date and the condition
//     hang in beni-red cartouches; the rest is a colophon in the margin.

import { W, H, TAU, clamp, lerp, smoothstep, remap, approach, rng, mix, adjust, toOklch, el, svg, addStyle, canvas2d, grain } from "../lib/kit.js";

// The print inside its paper margin, and the far waterline.
const X0 = 44, Y0 = 44, X1 = 1036, Y1 = 1744;
const PW = X1 - X0, PH = Y1 - Y0;
const HY = 1172;
const LX = 92, RX = 988; // inner edges that type keeps to

const PAPER_D = "#eee3c7", PAPER_N = "#101219", PAPER_DUSK = "#262b44";
const SUMI = "#191514", CREAM_N = "#d9cfb3";

const f1 = (v) => Math.round(v * 10) / 10;
const rect = (x, y, w, h) => `M${f1(x)} ${f1(y)}h${f1(w)}v${f1(h)}h${f1(-w)}Z`;
// A straight member of a given thickness, as a filled quad.
function seg(x1, y1, x2, y2, w) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
  const nx = ((-dy / L) * w) / 2, ny = ((dx / L) * w) / 2;
  return `M${f1(x1 + nx)} ${f1(y1 + ny)}L${f1(x2 + nx)} ${f1(y2 + ny)}L${f1(x2 - nx)} ${f1(y2 - ny)}L${f1(x1 - nx)} ${f1(y1 - ny)}Z`;
}
function svgBox(parent, x, y, w, h) {
  const node = svg("svg", { viewBox: `${x} ${y} ${w} ${h}`, width: w, height: h });
  Object.assign(node.style, { position: "absolute", left: `${x}px`, top: `${y}px`, overflow: "hidden" });
  parent.append(node);
  return node;
}

// ---------------------------------------------------------------------------
// The Manhattan skyline: one stepped silhouette in two tones, with windows.
// ---------------------------------------------------------------------------
function buildSkyline() {
  const r = rng(1909);
  let far = "", near = "", caps = "";
  const wins = Array.from({ length: 16 }, () => "");
  const light = (x, top, w, bottom, p = 0.3) => {
    for (let yy = top + 8; yy < bottom - 10; yy += 11) for (let xx = x + 4; xx < x + w - 5; xx += 8) if (r() < p) wins[r.int(0, 15)] += rect(xx, yy, 3, 4.5);
  };
  const block = (x, w, h, lit = 0.3) => {
    near += rect(x, HY - h, w, h + 2);
    caps += rect(x - 1, HY - h - 3, w + 2, 4);
    light(x, HY - h, w, HY, lit);
  };
  for (let x = X0 - 12; x < X1 + 12; ) {
    const w = r.range(24, 56);
    const h = r.range(70, 150) * (x > 540 ? 0.7 : 1);
    far += rect(x, HY - h, w + 1, h + 2);
    if (r.chance(0.3)) far += rect(x + w * 0.3, HY - h - r.range(8, 20), w * 0.4, 22);
    x += w;
  }
  for (let x = X0 - 8; x < X1 + 8; ) {
    const w = r.range(20, 46);
    const h = r.range(38, 104) * (x > 540 ? 0.78 : 1);
    block(x, w, h);
    if (r.chance(0.35)) block(x + w * 0.22, w * 0.56, h + r.range(8, 22), 0);
    x += w + (r.chance(0.2) ? r.range(2, 10) : 0);
  }
  // Empire State
  block(96, 48, 104); block(102, 36, 152); block(109, 22, 178, 0.2);
  near += rect(116, HY - 200, 8, 24) + rect(119, HY - 222, 2, 24);
  // One Vanderbilt
  near += `M204 ${HY + 2}L204 ${HY - 120}L212 ${HY - 186}L224 ${HY - 186}L238 ${HY - 120}L238 ${HY + 2}Z` + rect(217, HY - 206, 2.4, 22);
  light(206, HY - 118, 30, HY, 0.3);
  // Chrysler
  block(262, 28, 146);
  near += `M264 ${HY - 146}L276 ${HY - 182}L288 ${HY - 146}Z` + rect(275, HY - 200, 2, 20);
  // United Nations slab, on the water
  block(318, 62, 92, 0.42);
  // Trump World Tower, Citigroup, 432 Park
  block(392, 30, 134);
  near += `M446 ${HY + 2}L446 ${HY - 112}L482 ${HY - 142}L482 ${HY + 2}Z`;
  light(446, HY - 106, 36, HY, 0.3);
  block(506, 17, 214, 0.25);
  return { far, near, caps, wins };
}

// ---------------------------------------------------------------------------
// The Queensboro cantilever truss, receding from the right edge toward
// Manhattan. Strict lattice: chords, a vertical at every panel point and
// X-bracing between, towers with finials on stone piers.
// ---------------------------------------------------------------------------
function buildBridge() {
  const VX = 150, XN = 1243, HD = 168, DT = 40, HT = 152, E = 74;
  const A = 0.000869, DN = 271;
  const sOf = (d) => 1 / (1 + A * (d - DN));
  const xOf = (s) => VX + (XN - VX) * s;
  const SPANS = [
    [0, 459, 7, -1, 0],
    [459, 1443, 16, 0, 0.34],
    [1443, 2073, 10, 0, 0.66],
    [2073, 3255, 18, 0, 0.3],
    [3255, 3724, 7, 1, 0],
  ];
  const pts = [];
  for (const [d0, d1, n, anchor, sag] of SPANS) {
    for (let i = pts.length ? 1 : 0; i <= n; i++) {
      const t = i / n;
      let h;
      if (anchor < 0) h = 26 + (HT - 26) * Math.pow(t, 1.5);
      else if (anchor > 0) h = 26 + (HT - 26) * Math.pow(1 - t, 1.5);
      else h = HT * (sag + (1 - sag) * (2 * t - 1) * (2 * t - 1));
      pts.push({ d: d0 + (d1 - d0) * t, h, tower: (i === 0 || i === n) && !((anchor < 0 && i === 0) || (anchor > 0 && i === n)) });
    }
  }
  let truss = "", piers = "", caps = "", lamps = "", beacons = "";
  let prev = null;
  for (const p of pts) {
    const s = sOf(p.d);
    const q = { x: xOf(s), s, lo: HY - HD * s, up: HY - (HD + DT) * s, top: HY - (HD + DT + p.h) * s, tower: p.tower };
    if (q.x < X1 + 140) {
      const wv = Math.max(1, 3 * s);
      truss += seg(q.x, q.lo, q.x, q.top, q.tower ? Math.max(2.4, 9 * s) : wv);
      if (q.tower) {
        const fw = 12 * s, fh = 40 * s;
        truss += `M${f1(q.x - fw / 2)} ${f1(q.top)}L${f1(q.x)} ${f1(q.top - fh)}L${f1(q.x + fw / 2)} ${f1(q.top)}Z`;
        truss += rect(q.x - 9 * s, q.top - 2 * s, 18 * s, 5 * s);
        beacons += `M${f1(q.x + 2.6)} ${f1(q.top - fh - 2)}a2.6 2.6 0 1 0 -5.2 0a2.6 2.6 0 1 0 5.2 0Z`;
        const pw = 34 * s, base = HY + E * s;
        piers += `M${f1(q.x - pw / 2)} ${f1(q.lo)}L${f1(q.x + pw / 2)} ${f1(q.lo)}L${f1(q.x + pw * 0.62)} ${f1(base)}L${f1(q.x - pw * 0.62)} ${f1(base)}Z`;
        piers += rect(q.x - pw * 0.66, q.lo - 1, pw * 1.32, 5 * s);
      }
      if (prev && prev.x < X1 + 200) {
        const sm = (s + prev.s) / 2;
        const pw = Math.abs(prev.x - q.x);
        truss += seg(prev.x, prev.top, q.x, q.top, Math.max(1.8, 7.5 * sm));
        truss += seg(prev.x, prev.up, q.x, q.up, Math.max(1.8, 6.5 * sm));
        truss += seg(prev.x, prev.lo, q.x, q.lo, Math.max(1.6, 5.5 * sm));
        caps += seg(prev.x, prev.top - 4.4 * sm - 1, q.x, q.top - 4.4 * sm - 1, Math.max(1.6, 4 * sm));
        if (pw > 6.5) {
          const wd = Math.max(0.9, 2.3 * sm);
          truss += seg(prev.x, prev.top, q.x, q.up, wd) + seg(prev.x, prev.up, q.x, q.top, wd);
          truss += seg(prev.x, prev.up, q.x, q.lo, wd) + seg(prev.x, prev.lo, q.x, q.up, wd);
        }
        const lr = Math.max(1.3, 2.6 * sm);
        const lx = (prev.x + q.x) / 2, ly = (prev.up + q.up) / 2 - 5 * sm;
        if (pw > 4) lamps += `M${f1(lx + lr)} ${f1(ly)}a${f1(lr)} ${f1(lr)} 0 1 0 ${f1(-2 * lr)} 0a${f1(lr)} ${f1(lr)} 0 1 0 ${f1(2 * lr)} 0Z`;
      }
    }
    prev = q;
  }
  // Roosevelt Island: a low strip under the middle towers.
  const r = rng(77);
  let island = `M470 ${HY + 9}L470 ${HY - 3}`;
  for (let x = 474; x < 842; x += r.range(9, 22)) island += `L${f1(x)} ${f1(HY - r.range(3, 13))}`;
  island += `L846 ${HY + 9}Z`;
  return { truss, piers, caps, lamps, beacons, island };
}

// ---------------------------------------------------------------------------
// The Long Island gantry, cropped hard at the right edge of the print.
// ---------------------------------------------------------------------------
function buildGantry() {
  let g = "", caps = "";
  const P0 = 1124, P1 = 1210, T1 = 1284; // sign plate, then the truss under it
  const xs = [766, 862, 958, 1054];
  g += rect(752, P0, 320, P1 - P0) + rect(752, P1, 320, 12) + rect(752, T1 - 12, 320, 12);
  caps += rect(750, P0 - 5, 300, 6);
  for (let i = 0; i < xs.length; i++) {
    g += rect(xs[i] - 5, P1, 10, T1 - P1);
    if (i) g += seg(xs[i - 1], P1 + 8, xs[i], T1 - 8, 6) + seg(xs[i - 1], T1 - 8, xs[i], P1 + 8, 6);
  }
  // machine house on top
  g += rect(886, 1084, 84, 42) + `M878 1086L928 1062L978 1086Z` + rect(940, 1052, 7, 22);
  caps += `M878 1084L928 1060L978 1084L972 1087L928 1066L884 1087Z`;
  // two lattice legs
  for (const lx of [796, 986]) {
    g += rect(lx, T1, 11, Y1 - T1) + rect(lx + 49, T1, 11, Y1 - T1);
    for (let y = T1 + 4; y < Y1; y += 62) {
      g += seg(lx + 6, y, lx + 54, y + 62, 4.6) + seg(lx + 54, y, lx + 6, y + 62, 4.6);
      g += rect(lx, y + 59, 60, 5);
    }
  }
  // tie beam, sway bracing, and the hanging girder
  g += rect(856, 1470, 130, 12);
  caps += rect(858, 1465, 126, 6);
  g += seg(858, T1 + 2, 984, 1470, 4.4) + seg(984, T1 + 2, 858, 1470, 4.4);
  for (const hx of [884, 921, 958]) g += rect(hx - 1.6, 1482, 3.2, 100);
  g += rect(866, 1582, 110, 20) + rect(872, 1602, 10, 16) + rect(960, 1602, 10, 16);
  caps += rect(868, 1577, 106, 6);
  // the pier it stands on
  g += rect(744, 1694, 320, 60) + rect(770, 1672, 16, 24) + rect(766, 1668, 24, 7) + rect(904, 1672, 16, 24) + rect(900, 1668, 24, 7);
  caps += rect(746, 1689, 50, 6) + rect(858, 1689, 126, 6);
  return { g, caps, signY: P1 - 20 };
}

// Brush-like water lines for one strip of river, drawn twice so the strip can
// slide and wrap.
function waterPath(r, n, y0, y1, lmin, lmax, th) {
  let d = "";
  for (let i = 0; i < n; i++) {
    const x = r.range(0, PW), y = r.range(y0 + 3, y1 - 3), l = r.range(lmin, lmax), t = th * r.range(0.8, 1.25);
    for (const ox of [0, PW]) {
      const a = X0 + x + ox;
      d += `M${f1(a)} ${f1(y)}Q${f1(a + l / 2)} ${f1(y - t)} ${f1(a + l)} ${f1(y)}Q${f1(a + l / 2)} ${f1(y + t)} ${f1(a)} ${f1(y)}Z`;
    }
  }
  return d;
}

export default {
  title: "One Hundred Views of the East River",
  description: "A Hiroshige woodblock of the Queensboro Bridge, the skyline and the gantry, printed in today's real weather.",
  fonts: ["Abril Fatface", "Zen Antique"],
  fps: 30,

  mount(root, { seed }) {
    addStyle(root, `
      .er { position: absolute; inset: 0; background: var(--paper); color: var(--ink); font-family: "Zen Antique", "Shippori Mincho", Georgia, serif; }
      .er .print { position: absolute; left: ${X0}px; top: ${Y0}px; width: ${PW}px; height: ${PH}px; overflow: hidden; }
      .er .inner { position: absolute; left: ${-X0}px; top: ${-Y0}px; width: ${W}px; height: ${H}px; }
      .er .sky { position: absolute; left: ${X0}px; top: ${Y0}px; width: ${PW}px; height: ${HY - Y0 + 2}px; }
      .er .flash { position: absolute; left: ${X0}px; top: ${Y0}px; width: ${PW}px; height: 620px; opacity: 0; background: linear-gradient(to bottom, var(--flash) 0%, var(--flash) 30%, transparent 100%); }
      .er .river { position: absolute; left: ${X0}px; top: ${HY}px; width: ${PW}px; height: ${Y1 - HY}px; }
      .er .slide { will-change: transform; }
      .er .mist { position: absolute; left: 0; top: 0; will-change: transform, opacity; }
      .er .mist i { position: absolute; display: block; border-radius: 999px; background: var(--mist); }
      .er .mist.deck i { background: var(--deck); }
      .er .cloud { position: absolute; left: 0; top: 0; overflow: visible; will-change: transform, opacity; }
      .er .num { font-family: "Abril Fatface", "Playfair Display", Georgia, serif; fill: var(--timeInk); stroke: var(--timeKey); stroke-width: 7px; paint-order: stroke fill; stroke-linejoin: round; }
      .er .tz { position: absolute; top: 84px; width: 100px; box-sizing: border-box; padding: 34px 0 36px; background: var(--beni); color: var(--cream);
        writing-mode: vertical-rl; font-size: 48px; line-height: 100px; letter-spacing: 0.05em; white-space: nowrap; }
      .er .tz::after, .er .seal::after { content: ""; position: absolute; inset: 7px; border: 1.5px solid var(--cream); opacity: 0.5; }
      .er .seal { position: absolute; top: 572px; width: 94px; height: 94px; background: var(--beni); color: var(--cream);
        font: 400 44px/94px "Abril Fatface", Georgia, serif; text-align: center; letter-spacing: 0.02em; }
      .er .fact { position: absolute; left: ${LX}px; bottom: ${H - 1700}px; width: fit-content; min-width: 360px; max-width: 664px; box-sizing: border-box; padding: 20px 34px 26px 30px; background: var(--paper); color: var(--ink); border: 2px solid var(--ink); }
      .er .fact::after { content: ""; position: absolute; inset: 6px; border: 1px solid var(--ink); opacity: 0.45; }
      .er .fact .lab { font-size: 28px; letter-spacing: 0.08em; color: var(--beniText); }
      .er .fact .val { font-size: 40px; line-height: 1.2; margin-top: 4px; }
      .er .colo { position: absolute; left: ${LX}px; width: ${RX - LX}px; top: 1764px; display: flex; justify-content: space-between; align-items: flex-start; white-space: nowrap; }
      .er .colo .lab { font-size: 28px; letter-spacing: 0.08em; color: var(--beniText); line-height: 32px; }
      .er .colo .val { font-size: 46px; line-height: 52px; margin-top: 0; }
      .er .edge { position: absolute; left: ${X0}px; top: ${Y0}px; width: ${PW}px; height: ${PH}px; box-sizing: border-box; border: 2px solid var(--edge); pointer-events: none; }
    `);

    const wrap = el("div", { class: "er" });
    root.append(wrap);
    const print = el("div", { class: "print" });
    const inner = el("div", { class: "inner" });
    print.append(inner);
    wrap.append(print);

    const r = rng(seed);

    // ----- sky -----
    const sky = el("div", { class: "sky" });
    const flash = el("div", { class: "flash" });
    inner.append(sky, flash);

    const skyArt = svgBox(inner, X0, Y0, PW, HY - Y0);
    let starPath = "";
    for (let i = 0; i < 46; i++) {
      const sx = r.range(X0 + 20, X1 - 20), sy = r.range(Y0 + 30, 930), sr = r.pick([1.4, 1.4, 1.9, 2.5]);
      starPath += `M${f1(sx + sr)} ${f1(sy)}a${sr} ${sr} 0 1 0 ${-2 * sr} 0a${sr} ${sr} 0 1 0 ${2 * sr} 0Z`;
    }
    const stars = svg("path", { d: starPath, style: "fill: var(--star)", opacity: 0 });
    const sunDisc = svg("circle", { cx: 610, cy: 1012, r: 66, style: "fill: var(--sun)", opacity: 0 });
    const moonDisc = svg("path", { d: "", style: "fill: var(--moon)", opacity: 0 });
    skyArt.append(stars, sunDisc, moonDisc);
    const flock = svg("svg", { viewBox: "0 0 170 80", width: 170, height: 80, class: "slide" });
    Object.assign(flock.style, { position: "absolute", left: "0", top: "0" });
    let birdPath = "";
    for (const [bx, by, bs] of [[84, 16, 1], [58, 30, 0.9], [112, 34, 0.92], [30, 48, 0.8], [140, 54, 0.85], [72, 62, 0.75]]) {
      birdPath += `M${f1(bx - 11 * bs)} ${f1(by - 3 * bs)}Q${f1(bx - 5 * bs)} ${f1(by - 7 * bs)} ${bx} ${by}Q${f1(bx + 5 * bs)} ${f1(by - 7 * bs)} ${f1(bx + 11 * bs)} ${f1(by - 3 * bs)}`;
    }
    const birds = svg("path", { d: birdPath, fill: "none", "stroke-width": 2.6, "stroke-linecap": "round", style: "stroke: var(--bird)", opacity: 0 });
    flock.append(birds);
    inner.append(flock);
    const flockDir = r.chance(0.5) ? 1 : -1;
    const FLOCK_RUN = PW + 170 + 700;
    let flockX = r.range(0.1, 0.8) * PW + 170;

    // ----- mist bands (traditional round-ended bands, stepped) -----
    // level: how much cloud or fog it takes before the band is printed.
    const mists = [];
    const addMist = (parent, y, w, h, level, alpha, speed, deck = false) => {
      const node = el("div", { class: deck ? "mist deck" : "mist" });
      const bars = r.int(2, 3);
      const lean = r.sign();
      for (let b = 0; b < bars; b++) {
        const bw = b === 0 ? w : w * r.range(0.34, 0.62);
        const bx = b === 0 ? 0 : (lean * (b === 1 ? 1 : -1) > 0 ? r.range(0.5, 0.72) : r.range(0.04, 0.2)) * (w - bw);
        const by = b === 0 ? 0 : b === 1 ? -(h - 1) : h - 1;
        node.append(el("i", { style: { left: `${f1(bx)}px`, top: `${f1(by)}px`, width: `${f1(bw)}px`, height: `${h}px` } }));
      }
      parent.append(node);
      mists.push({ node, y, w, h, level, alpha, speed, deck, x0: r.range(0, PW + w), shownO: -1 });
    };

    // ----- the cloud deck: broad stratus bands printed in grey when it is overcast -----
    const deckLayer = el("div");
    inner.append(deckLayer);
    addMist(deckLayer, 96, 1500, 46, 0, 1, 0.35, true);
    addMist(deckLayer, 228, 1260, 36, 0, 1, 0.5, true);
    addMist(deckLayer, 404, 1420, 30, 0, 0.9, 0.42, true);
    addMist(deckLayer, 610, 1180, 26, 0, 0.85, 0.6, true);
    addMist(deckLayer, 790, 1340, 34, 0, 0.9, 0.5, true);

    // ----- cumulus: lobed woodblock clouds, two blocks each (body and shaded
    // belly, a hair out of register), as many as the cloud cover calls for -----
    const clouds = [];
    {
      const ys = r.shuffle([250, 380, 520, 640, 760, 860, 930]);
      const levels = [0.08, 0.2, 0.3, 0.4, 0.52, 0.62, 0.72];
      for (let i = 0; i < 7; i++) {
        const w = r.range(250, 560), h = w * r.range(0.28, 0.36);
        const n = Math.max(3, Math.round(w / 78));
        let body = rect(0, h * 0.62, w, h * 0.38);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const rr = Math.min(h * (0.36 + 0.64 * Math.sin(Math.PI * t)) * r.range(0.82, 1.08), h) * 0.5 + h * 0.08;
          const cx = clamp(t * w + r.range(-0.15, 0.15) * (w / n), rr * 0.7, w - rr * 0.7);
          const cy = h - rr;
          body += `M${f1(cx + rr)} ${f1(cy)}a${f1(rr)} ${f1(rr)} 0 1 0 ${f1(-2 * rr)} 0a${f1(rr)} ${f1(rr)} 0 1 0 ${f1(2 * rr)} 0Z`;
        }
        const bh = h * 0.2;
        const belly = `M${f1(w * 0.03 + bh / 2 + 2)} ${f1(h - bh)}H${f1(w * 0.97 - bh / 2 + 2)}a${f1(bh / 2)} ${f1(bh / 2)} 0 0 1 0 ${f1(bh)}H${f1(w * 0.03 + bh / 2 + 2)}a${f1(bh / 2)} ${f1(bh / 2)} 0 0 1 0 ${f1(-bh)}Z`;
        const node = svg("svg", { class: "cloud", viewBox: `0 0 ${f1(w + 4)} ${f1(h + 2)}`, width: f1(w + 4), height: f1(h + 2) });
        node.append(svg("path", { d: body, style: "fill: var(--cloud)" }), svg("path", { d: belly, style: "fill: var(--cloudB)" }));
        clouds.push({ node, w, h, y: ys[i] - h, level: levels[i], speed: r.range(0.6, 1.2), x0: r.range(0, PW + w), shownO: -1 });
      }
    }
    const cloudLayer = el("div");
    for (const c of clouds) cloudLayer.append(c.node);
    inner.append(cloudLayer);
    const mistHigh = el("div");
    inner.append(mistHigh);
    addMist(mistHigh, 318, 980, 22, 0.52, 0.9, 0.8);
    addMist(mistHigh, 706, 1120, 24, 0.36, 0.9, 1.1);
    addMist(mistHigh, 912, 860, 20, 0.6, 0.92, 1.25);

    // ----- skyline -----
    const sl = buildSkyline();
    const skyline = svgBox(inner, X0, 930, PW, HY - 930 + 4);
    const slFar = svg("path", { d: sl.far, style: "fill: var(--far)" });
    const slNear = svg("path", { d: sl.near, style: "fill: var(--near)" });
    const slCaps = svg("path", { d: sl.caps, style: "fill: var(--cap)", opacity: 0 });
    skyline.append(slFar, slNear, slCaps);
    const winNodes = sl.wins.map((d) => {
      const n = svg("path", { d, style: "fill: var(--window)", opacity: 0 });
      skyline.append(n);
      return n;
    });
    const winShown = new Float32Array(16).fill(-1);

    const mistMid = el("div");
    inner.append(mistMid);
    addMist(mistMid, 1058, 940, 22, 0.24, 0.95, 1);
    addMist(mistMid, 1120, 1100, 24, 0.56, 0.96, 0.7);
    addMist(mistMid, 992, 820, 22, 0.8, 0.96, 1.25);

    // ----- river -----
    const river = el("div", { class: "river" });
    inner.append(river);
    const glints = svgBox(inner, X0, HY, PW, 70);
    let glintPath = "";
    for (let i = 0; i < 80; i++) {
      const gx = X0 + 20 + Math.pow(r(), 1.5) * (PW - 300), gl = r.range(5, 16);
      glintPath += rect(gx, HY + r.range(5, 56), r.range(4, 9), 1.6) + (r.chance(0.5) ? rect(gx + 1, HY + r.range(5, 56), gl, 1.4) : "");
    }
    const glint = svg("path", { d: glintPath, style: "fill: var(--glint)", opacity: 0 });
    glints.append(glint);
    const STRIPS = [
      { y0: HY + 6, y1: 1232, n: 22, l: [18, 64], th: 1.1, k: 0.3 },
      { y0: 1232, y1: 1312, n: 17, l: [34, 110], th: 1.5, k: 0.45 },
      { y0: 1312, y1: 1424, n: 15, l: [50, 170], th: 1.9, k: 0.62 },
      { y0: 1424, y1: 1570, n: 13, l: [70, 240], th: 2.3, k: 0.8 },
      { y0: 1570, y1: Y1, n: 12, l: [100, 330], th: 2.8, k: 1 },
    ];
    const strips = STRIPS.map((st) => {
      const node = svg("svg", { viewBox: `${X0} ${st.y0} ${PW * 2} ${st.y1 - st.y0}`, width: PW * 2, height: st.y1 - st.y0, class: "slide" });
      Object.assign(node.style, { position: "absolute", left: `${X0}px`, top: `${st.y0}px` });
      const lightLines = svg("path", { d: waterPath(r, st.n, st.y0, st.y1, st.l[0], st.l[1], st.th), style: "fill: var(--waterLight)" });
      const darkLines = svg("path", { d: waterPath(r, Math.round(st.n * 0.7), st.y0, st.y1, st.l[0], st.l[1], st.th), style: "fill: var(--waterDark)" });
      const chop = svg("path", { d: waterPath(r, st.n * 2, st.y0, st.y1, st.l[0] * 0.5, st.l[1] * 0.45, st.th * 0.9), style: "fill: var(--waterLight)", opacity: 0 });
      node.append(darkLines, lightLines, chop);
      inner.append(node);
      return { node, chop, k: st.k, off: r.range(0, PW) };
    });

    // ----- bridge -----
    const br = buildBridge();
    const bridge = svgBox(inner, 400, 800, X1 - 400, 470);
    const brLamps = svg("path", { d: br.lamps, style: "fill: var(--lamp)", opacity: 0 });
    const brBeacons = svg("path", { d: br.beacons, style: "fill: var(--beacon)", opacity: 0 });
    const brCaps = svg("path", { d: br.caps, style: "fill: var(--cap)", opacity: 0 });
    bridge.append(
      svg("path", { d: br.island, style: "fill: var(--island)" }),
      svg("path", { d: br.piers, style: "fill: var(--pier)" }),
      svg("path", { d: br.truss, style: "fill: var(--bridge)" }),
      brCaps, brLamps, brBeacons,
    );

    // ----- barge and tug -----
    const barge = svg("svg", { viewBox: "0 0 250 60", width: 250, height: 60, class: "slide" });
    Object.assign(barge.style, { position: "absolute", left: "0", top: "0" });
    barge.append(
      svg("path", { d: "M2 34H150L143 47H10Z M162 36H232L224 47H168Z M150 39H164V41H150Z", style: "fill: var(--hull)" }),
      svg("path", { d: rect(16, 19, 34, 15) + rect(96, 19, 38, 15), style: "fill: var(--beni)" }),
      svg("path", { d: rect(54, 13, 38, 21), style: "fill: var(--ochre)" }),
      svg("path", { d: rect(176, 23, 30, 13) + rect(183, 12, 15, 11) + rect(209, 14, 7, 22), style: "fill: var(--hull)" }),
      svg("path", { d: rect(186, 15, 9, 5), style: "fill: var(--window)" }),
    );
    inner.append(barge);
    const bargeDir = r.chance(0.5) ? 1 : -1;
    const BARGE_RUN = PW + 250 + 520;
    let bargeX = r.range(0.12, 0.7) * PW + 250;

    const mistLow = el("div");
    inner.append(mistLow);
    addMist(mistLow, 1184, 900, 14, 0.06, 0.8, 0.6);
    addMist(mistLow, 1150, 1300, 40, 0.9, 0.97, 0.5);
    addMist(mistLow, 1056, 1400, 46, 1.0, 0.97, 0.4);
    addMist(mistLow, 1240, 1000, 26, 0.95, 0.9, 0.8);

    // ----- gantry -----
    const ga = buildGantry();
    const gantry = svgBox(inner, 740, 1040, X1 - 740, Y1 - 1040);
    const gaCaps = svg("path", { d: ga.caps, style: "fill: var(--cap)", opacity: 0 });
    gantry.append(
      svg("path", { d: ga.g, style: "fill: var(--gantry)" }),
      svg("text", { x: 772, y: ga.signY, "font-size": 66, "letter-spacing": 3, style: 'font-family: "Abril Fatface", Georgia, serif; fill: var(--sign)', text: "LONG ISLAND" }),
      gaCaps,
    );

    // ----- rain and snow: the one layer drawn every frame -----
    const live = canvas2d(inner, { maxScale: 2, adaptive: true });
    const NR = 900;
    const RP = 3300; // lines wrap over this distance along their fall
    const rU = new Float32Array(NR), rV = new Float32Array(NR), rL = new Float32Array(NR), rS = new Float32Array(NR);
    for (let i = 0; i < NR; i++) {
      rU[i] = r.range(-1080, 1080);
      rV[i] = r.range(0, RP);
      rL[i] = r.range(420, 1180);
      rS[i] = r.range(0.8, 1.25);
    }
    const NS = 460;
    const sX = new Float32Array(NS), sY = new Float32Array(NS), sR = new Float32Array(NS), sF = new Float32Array(NS), sP = new Float32Array(NS);
    for (let i = 0; i < NS; i++) {
      sX[i] = r.range(0, PW + 80);
      sY[i] = r.range(0, PH + 40);
      const c = r();
      sR[i] = c < 0.5 ? 2.3 : c < 0.85 ? 3.5 : 5.2;
      sF[i] = r.range(0.75, 1.2) * (0.6 + sR[i] / 6);
      sP[i] = r.range(0, TAU);
    }
    let rainTravel = 0, snowFall = 0, snowDrift = 0, liveDirty = false;

    // ----- type: the time as a sumi block, the temperature beside it -----
    const type = svgBox(inner, X0, 150, PW, 760);
    const hh = svg("text", { class: "num", x: LX - 8, y: 500, "font-size": 412 });
    const mm = svg("text", { class: "num", x: LX - 8, y: 860, "font-size": 412 });
    const temp = svg("text", { class: "num", x: RX, y: 860, "font-size": 156, "text-anchor": "end", style: "stroke-width: 5px" });
    type.append(hh, mm, temp);
    const seal = el("div", { class: "seal" });
    const tzDate = el("div", { class: "tz", style: { left: `${RX - 100}px` } });
    const tzCond = el("div", { class: "tz", style: { left: `${RX - 218}px` } });
    const factLab = el("div", { class: "lab" });
    const factVal = el("div", { class: "val" });
    const fact = el("div", { class: "fact" }, factLab, factVal);
    inner.append(seal, tzDate, tzCond, fact);
    wrap.append(el("div", { class: "edge" }));

    // ----- colophon in the bottom margin -----
    const colo = el("div", { class: "colo" });
    const coloItem = (label) => {
      const lab = el("div", { class: "lab", text: label });
      const val = el("div", { class: "val" });
      colo.append(el("div", {}, lab, val));
      return { lab, val };
    };
    const cSun = coloItem("");
    const cMoon = coloItem("Moon");
    const cAir = coloItem("Air quality");
    const cUv = coloItem("UV index");
    wrap.append(colo);

    // ----- paper: fibres everywhere, wood grain inside the print -----
    const paper = canvas2d(wrap, { maxScale: 1 });
    paper.canvas.style.zIndex = "40";
    paper.canvas.style.pointerEvents = "none";
    {
      const c = paper.ctx;
      const pr = rng(4242);
      c.lineCap = "round";
      for (let pass = 0; pass < 2; pass++) {
        c.strokeStyle = pass ? "rgba(255,248,230,0.05)" : "rgba(30,22,16,0.06)";
        c.lineWidth = 1;
        c.beginPath();
        for (let i = 0; i < 1500; i++) {
          const x = pr.range(0, W), y = pr.range(0, H), a = pr.range(0, TAU), l = pr.range(8, 34);
          c.moveTo(x, y);
          c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + pr.range(-5, 5), y + Math.sin(a) * l * 0.5 + pr.range(-5, 5), x + Math.cos(a) * l, y + Math.sin(a) * l);
        }
        c.stroke();
        c.strokeStyle = pass ? "rgba(255,248,230,0.035)" : "rgba(20,16,12,0.045)";
        c.lineWidth = 1.5;
        c.beginPath();
        for (let i = 0; i < 70; i++) {
          let x = pr.range(X0 - 100, X1 - 200), y = pr.range(Y0, Y1);
          const l = pr.range(300, 900);
          c.moveTo(Math.max(X0, x), y);
          for (let k = 0; k < l; k += 60) {
            x += 60;
            y += pr.range(-1.6, 1.6);
            c.lineTo(clamp(x, X0, X1), clamp(y, Y0, Y1));
          }
        }
        c.stroke();
      }
    }
    grain(wrap, { opacity: 0.05 });

    // ----- helpers -----
    const shown = {};
    const put = (key, node, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };
    const vars = {};
    const setVar = (name, value) => {
      if (vars[name] === value) return;
      vars[name] = value;
      wrap.style.setProperty(name, value);
    };
    const opac = {};
    const setOpacity = (key, node, v) => {
      const q = Math.round(clamp(v) * 50) / 50;
      if (opac[key] === q) return;
      opac[key] = q;
      node.setAttribute("opacity", q);
    };
    const fitTall = (node, maxH) => {
      node.style.fontSize = "48px";
      const h = node.offsetHeight;
      if (h > maxH) node.style.fontSize = `${Math.max(44, Math.floor((48 * (maxH - 70)) / (h - 70)))}px`;
    };

    // Eased weather factors (they snap when the clock jumps).
    const f = { wet: 0, snow: 0, storm: 0, fog: 0, heat: 0 };
    let first = true, lastMs = 0, palT = -10;
    let rainRGB = "28,32,48", rainAlpha = 0.5, snowCol = "#f7f2e4";
    let moonKey = "";

    function palette(s) {
      const w = s.weather;
      const d = s.daylight;
      const dd = smoothstep(0.02, 0.62, d);
      const cl = clamp(w.cloud / 100);
      const alt = s.sun.alt;
      const sunLow = smoothstep(16, 3, alt) * smoothstep(-9, -3, alt);
      const wetI = f.wet * clamp(w.intensity * 1.2);

      // sky: a dark strip at the top, a flat tint, a band at the horizon
      const up = mix(s.sky.northWest, s.sky.mean, 0.5);
      // clear: a saturated Prussian-leaning blue; cloud washes it toward paper grey
      let flatDay = mix(up, PAPER_D, 0.14 + 0.34 * cl);
      flatDay = adjust(flatDay, { c: (v) => v * (1 + 0.45 * (1 - cl) * (1 - f.heat)), h: (v) => v + 6 * (1 - cl) });
      flatDay = mix(flatDay, "#c8c4b2", 0.35 * f.heat);
      flatDay = mix(flatDay, adjust(flatDay, { l: (v) => Math.min(v, 0.63), c: (v) => v * 0.7 }), f.snow);
      const flatNight = mix(adjust(up, { l: (v) => Math.min(v, 0.26) }), "#0a1026", 0.55);
      let flat = mix(flatNight, flatDay, dd);
      flat = adjust(flat, { l: (v) => v * (1 - 0.22 * f.storm) });
      let glowDay = adjust(mix(s.sky.west, PAPER_D, 0.74 - 0.56 * sunLow), { c: (v) => v * (1 + 0.7 * sunLow) });
      glowDay = mix(glowDay, "#eba25c", 0.66 * sunLow * (1 - 0.6 * cl * cl));
      glowDay = mix(glowDay, "#dcae56", 0.6 * f.heat);
      const glowNight = mix(adjust(s.sky.west, { l: (v) => Math.min(v, 0.3) }), "#1d2b55", 0.55);
      let glow = mix(glowNight, glowDay, dd);
      glow = mix(glow, flat, 0.75 * f.fog);
      let topDay = mix("#0f2f66", "#3a3e46", cl);
      topDay = mix(topDay, "#5f7894", 0.55 * f.heat);
      topDay = adjust(topDay, { l: (v) => v * (1 - 0.5 * f.storm - 0.12 * wetI) });
      const top = mix("#020308", topDay, smoothstep(0.02, 0.7, d));
      const flatL = toOklch(flat).l;
      const onLight = flatL > 0.553; // the ground is light: print in sumi; else leave the type as bare paper
      // the horizon band climbs higher in heat haze
      const g0 = 71 - 30 * f.heat, g1 = 80 - 24 * f.heat, g2 = 91 - 12 * f.heat;
      sky.style.background = `linear-gradient(to bottom, ${top} 0%, ${mix(top, flat, 0.4)} 5%, ${mix(top, flat, 0.82)} 10%, ${flat} 14%, ${flat} ${g0}%, ${mix(flat, glow, 0.35)} ${g1}%, ${mix(flat, glow, 0.8)} ${g2}%, ${glow} 100%)`;

      // The paper margin: cream by day, indigo-dyed (aizome) paper through the
      // half-light and the evening, near-black at night. The passage from
      // cream to indigo is kept to a few minutes either side of sunset.
      const paperC = d >= 0.66 ? mix(PAPER_DUSK, PAPER_D, smoothstep(0.66, 0.74, d)) : mix(PAPER_N, PAPER_DUSK, smoothstep(0.08, 0.6, d));
      const paperLight = toOklch(paperC).l > 0.553;
      setVar("--paper", paperC);
      setVar("--ink", paperLight ? SUMI : CREAM_N);
      setVar("--beniText", paperLight ? "#a62a20" : "#f08e76");
      setVar("--edge", paperLight ? SUMI : "#2c3040");
      setVar("--timeInk", onLight ? SUMI : mix(CREAM_N, "#f4ecd6", d));
      setVar("--timeKey", onLight ? mix(flat, PAPER_D, 0.85) : mix(flat, "#05060c", 0.8));
      setVar("--beni", mix("#5e1a18", "#bf3427", dd));
      setVar("--cream", mix("#d8cdb0", "#f7efda", dd));
      setVar("--ochre", mix("#5d4a22", "#d6a03c", dd));
      setVar("--flash", mix(flat, "#cfd6e6", 0.5));

      // mist: bare paper on a light ground, a paler tint of the sky on a dark one
      let mistC = onLight ? mix(flat, "#f4ecd8", 0.82) : adjust(flat, { l: (v) => Math.min(v + 0.1 + 0.07 * f.fog, 0.47), c: (v) => v * 0.8 });
      if (onLight) mistC = mix(mistC, "#efcf86", 0.75 * f.heat);
      setVar("--mist", mistC);
      // the deck: grey stratus a shade darker than the sky (lighter at night),
      // never so dark by day that the sumi time loses it
      setVar("--deck", onLight
        ? adjust(mix(flat, "#6b6f78", 0.3), { l: (v) => Math.max(v - 0.07, 0.64) })
        : adjust(flat, { l: (v) => Math.min(v + 0.045, 0.36), c: (v) => v * 0.7 }));
      // cumulus: a cream body warmed by a low sun, a grey-blue belly
      let cloudC = onLight ? mix(flat, "#f6eedb", 0.86) : adjust(flat, { l: (v) => Math.min(v + 0.09, 0.4), c: (v) => v * 0.8 });
      cloudC = mix(cloudC, glow, 0.35 * sunLow * dd);
      setVar("--cloud", cloudC);
      setVar("--cloudB", onLight ? adjust(mix(flat, "#8d95a6", 0.45), { l: (v) => Math.max(v, 0.66) }) : adjust(flat, { l: (v) => Math.min(v + 0.04, 0.34) }));

      // river
      let rivDay = mix(mix("#2767ad", "#5c7385", cl * 0.85), s.sky.mean, 0.12);
      rivDay = adjust(rivDay, { l: (v) => v * (1 - 0.2 * wetI) });
      rivDay = mix(rivDay, "#4f6072", 0.5 * f.snow);
      const riv = mix(mix("#0a1330", rivDay, dd), flat, 0.45 * f.fog);
      river.style.background = `linear-gradient(to bottom, ${mix(riv, glow, 0.5)} 0%, ${mix(riv, glow, 0.12)} 16%, ${riv} 34%, ${riv} 62%, ${adjust(riv, { l: (v) => v * 0.6 })} 100%)`;
      setVar("--waterLight", mix(mix(riv, "#93a6cf", 0.32), mix(riv, "#f6efdc", 0.8), dd));
      setVar("--waterDark", adjust(riv, { l: (v) => v * 0.6 }));

      // skyline, bridge, gantry
      let near = mix("#04050c", mix("#3f5879", "#565f6a", cl * 0.7), dd);
      near = mix(near, "#1b1f3e", 0.7 * sunLow * dd);
      near = mix(near, glow, 0.3 * f.heat);
      let far = mix(near, glow, 0.46 + 0.3 * f.heat);
      near = mix(near, flat, 0.74 * f.fog);
      far = mix(far, flat, 0.95 * f.fog);
      setVar("--near", near);
      setVar("--far", far);
      setVar("--bridge", mix(mix("#020309", "#252a40", dd), flat, 0.56 * f.fog));
      setVar("--pier", mix(mix("#0c0e17", mix("#b8a37b", "#8e8c85", cl * 0.6), dd), flat, 0.5 * f.fog));
      setVar("--island", mix(mix("#03040a", "#2f4a45", dd), flat, 0.6 * f.fog));
      setVar("--gantry", mix("#010103", "#17120f", dd));
      setVar("--sign", mix("#571917", "#c2382a", dd));
      setVar("--hull", mix("#020308", "#1c1a1c", dd));
      setVar("--window", "#e8b656");
      setVar("--lamp", "#f1d68c");
      setVar("--beacon", "#d5432e");
      setVar("--sun", "#d6402b");
      setVar("--moon", mix("#cfc8b2", "#f6efdb", d));
      setVar("--star", "#bfc4d4");
      setVar("--bird", onLight ? "#23252f" : "#9ea3b4");
      setOpacity("birds", birds, smoothstep(0.25, 0.6, d) * (1 - f.wet) * (1 - f.snow) * (1 - f.fog) * smoothstep(30, 20, w.wind));
      const snowC = mix("#b4b2aa", "#f8f3e6", dd);
      setVar("--cap", snowC);
      snowCol = snowC;
      rainRGB = onLight ? "26,30,46" : "172,184,212";
      rainAlpha = onLight ? 0.62 : 0.34;

      // things that come and go with the light and the sky
      setOpacity("stars", stars, smoothstep(0.14, 0.02, d) * (1 - cl) * (1 - f.fog));
      const west = s.sun.az > 180 ? 1 : 0;
      setOpacity("sun", sunDisc, west * smoothstep(-5, -1, alt) * smoothstep(15, 8, alt) * (1 - 0.9 * cl * cl) * (1 - f.wet) * (1 - f.fog));
      const mo = s.moon;
      const moonOn = smoothstep(-1, 5, mo.alt) * smoothstep(0.35, 0.08, d) * (1 - 0.92 * cl) * (1 - f.fog) * (mo.illumination > 0.03 ? 1 : 0);
      setOpacity("moon", moonDisc, moonOn);
      if (moonOn > 0) {
        const k = clamp(mo.illumination, 0.04, 1);
        const key = `${Math.round(k * 60)}:${Math.round(mo.tilt / 3)}`;
        if (key !== moonKey) {
          moonKey = key;
          const R = 54, tx = Math.max(0.5, R * Math.abs(1 - 2 * k));
          moonDisc.setAttribute("d", `M0 ${-R}A${R} ${R} 0 0 1 0 ${R}A${f1(tx)} ${R} 0 0 ${k > 0.5 ? 1 : 0} 0 ${-R}Z`);
          moonDisc.setAttribute("transform", `translate(318 1000) rotate(${f1(-(mo.tilt + 90))})`);
        }
      }
      for (let i = 0; i < 16; i++) {
        const o = Math.round(clamp((0.07 + 0.36 * (i / 15) - d) * 30) * 20) / 20;
        if (winShown[i] !== o) {
          winShown[i] = o;
          winNodes[i].setAttribute("opacity", o);
        }
      }
      const lampOn = smoothstep(0.42, 0.14, d);
      setOpacity("lamps", brLamps, lampOn);
      setOpacity("beacons", brBeacons, lampOn);
      // glints on the far water: lamplight at night, hard sun on a clear day
      const sunGlint = dd * (1 - cl) * (1 - f.wet) * (1 - f.snow);
      setVar("--glint", lampOn > sunGlint ? "#e8b656" : "#fbf5e4");
      setOpacity("glint", glint, Math.max(lampOn * 0.75, sunGlint * 0.9) * (1 - f.fog));
      const capOn = f.snow;
      setOpacity("capS", slCaps, capOn);
      setOpacity("capB", brCaps, capOn);
      setOpacity("capG", gaCaps, capOn);
    }

    return {
      frame(s) {
        const w = s.weather, tx = s.text, dt = s.dt;
        const jump = first || Math.abs(s.ms - lastMs) > 4000;
        lastMs = s.ms;

        // ----- readouts -----
        put("hh", hh, tx.hh);
        if (put("mm", mm, tx.mm) || first) seal.style.left = `${Math.round(LX - 8 + mm.getComputedTextLength() + 26)}px`;
        put("ampm", seal, tx.ampm);
        if (put("temp", temp, tx.temp)) {
          temp.setAttribute("font-size", 156);
          const len = temp.getComputedTextLength();
          if (len > 330) temp.setAttribute("font-size", Math.max(96, Math.floor((156 * 330) / len)));
        }
        if (put("date", tzDate, tx.date)) fitTall(tzDate, 660);
        if (put("cond", tzCond, tx.condition)) fitTall(tzCond, 600);
        put("sunL", cSun.lab, tx.sunLabel);
        put("sunV", cSun.val, tx.sunValue);
        put("moon", cMoon.val, tx.moon);
        put("aqi", cAir.val, tx.aqi);
        put("uv", cUv.val, tx.uv);
        put("factL", factLab, tx.factLabel);
        if (put("factV", factVal, tx.factValue)) fact.style.display = tx.factValue ? "" : "none";

        // ----- weather factors -----
        const falling = w.falling;
        const tWet = falling && falling !== "snow" ? 1 : 0;
        const tSnow = falling === "snow" ? 1 : 0;
        const tStorm = falling === "storm" || w.kind === "storm" ? 1 : 0;
        const tFog = w.fog ? 1 : remap(w.visibility, 2.5, 0.2, 0, 0.85);
        const tHeat = smoothstep(88, 98, w.temp);
        if (jump) {
          f.wet = tWet; f.snow = tSnow; f.storm = tStorm; f.fog = tFog; f.heat = tHeat;
        } else {
          f.wet = approach(f.wet, tWet, dt, 1.5);
          f.snow = approach(f.snow, tSnow, dt, 1.5);
          f.storm = approach(f.storm, tStorm, dt, 1.5);
          f.fog = approach(f.fog, tFog, dt, 2);
          f.heat = approach(f.heat, tHeat, dt, 2);
        }
        if (jump || s.t - palT > 0.5) {
          palT = s.t;
          palette(s);
        }

        // The wind across a view that faces west-north-west: positive blows to the right.
        const cross = w.wind * Math.cos(((w.windDir + 180 - 20) * Math.PI) / 180);
        const dir = cross < 0 ? -1 : 1;
        const cl = clamp(w.cloud / 100);

        // ----- mist bands -----
        const mistAmount = clamp(0.1 + 0.42 * cl * cl + 0.9 * f.fog + 0.1 * f.wet + 0.45 * f.heat);
        const deckAmount = smoothstep(0.62, 0.95, cl) * (1 - 0.8 * f.fog);
        const mistSpeed = dir * (2.4 + Math.abs(cross) * 0.45);
        for (let i = 0; i < mists.length; i++) {
          const m = mists[i];
          m.x0 += mistSpeed * m.speed * dt;
          const span = PW + m.w;
          const x = X0 - m.w + ((((m.x0 % span) + span) % span));
          const o = Math.round((m.deck ? deckAmount : smoothstep(m.level - 0.1, m.level + 0.06, mistAmount)) * m.alpha * 40) / 40;
          if (o !== m.shownO) {
            m.shownO = o;
            m.node.style.opacity = o;
            m.node.style.visibility = o > 0 ? "visible" : "hidden";
          }
          if (o > 0) m.node.style.transform = `translate3d(${f1(x)}px,${m.y}px,0)`;
        }

        // ----- cumulus: one cloud more for every tenth or so of cover; they
        // close up into the grey deck when the sky is overcast -----
        const cloudOn = (1 - smoothstep(0.8, 0.97, cl)) * (1 - f.fog) * (1 - 0.7 * f.wet) * (1 - f.snow);
        const cloudSpeed = dir * (3 + Math.abs(cross) * 0.7);
        for (let i = 0; i < clouds.length; i++) {
          const c = clouds[i];
          c.x0 += cloudSpeed * c.speed * dt;
          const span = PW + c.w;
          const x = X0 - c.w + ((((c.x0 % span) + span) % span));
          const o = Math.round(smoothstep(c.level - 0.05, c.level + 0.04, cl) * cloudOn * 40) / 40;
          if (o !== c.shownO) {
            c.shownO = o;
            c.node.style.opacity = o;
            c.node.style.visibility = o > 0 ? "visible" : "hidden";
          }
          if (o > 0) c.node.style.transform = `translate3d(${f1(x)}px,${f1(c.y)}px,0)`;
        }

        // ----- water: the tide's current, and the wind's chop -----
        const flow = (s.tide.rising ? 1 : -1) * (0.25 + 0.75 * Math.sin(Math.PI * clamp(s.tide.norm)));
        let current = 15 * flow + 0.3 * cross;
        if (Math.abs(current) < 3.5) current = current < 0 ? -3.5 : 3.5;
        const chop = smoothstep(9, 28, w.wind);
        for (let i = 0; i < strips.length; i++) {
          const st = strips[i];
          st.off += current * st.k * dt;
          const x = -((((-st.off % PW) + PW) % PW));
          st.node.style.transform = `translate3d(${f1(x)}px,0,0)`;
          setOpacity(`chop${i}`, st.chop, chop);
        }
        bargeX += bargeDir * 8.5 * dt;
        const bx = ((bargeX % BARGE_RUN) + BARGE_RUN) % BARGE_RUN;
        barge.style.transform = `translate3d(${f1(X0 - 250 + bx)}px,${1218 + (bargeDir > 0 ? 0 : 26)}px,0) scaleX(${bargeDir})`;

        flockX += flockDir * 12 * dt;
        const fx = ((flockX % FLOCK_RUN) + FLOCK_RUN) % FLOCK_RUN;
        flock.style.transform = `translate3d(${f1(X0 - 170 + fx)}px,${f1(868 + 7 * Math.sin(s.t * 0.35))}px,0) scaleX(${flockDir})`;

        // ----- lightning: a slow, rare lightening of the top of the sky -----
        let fl = 0;
        if (f.storm > 0.01) {
          const k = Math.floor(s.t / 21);
          const tau = s.t - k * 21 - 4 - 9 * (((k * 7919 + seed) % 97) / 97);
          if (tau > 0 && tau < 3.2) fl = (tau < 0.8 ? smoothstep(0, 0.8, tau) : 1 - smoothstep(0.8, 3.2, tau)) * 0.34 * f.storm;
        }
        fl = Math.round(fl * 100) / 100;
        if (shown.flash !== fl) {
          shown.flash = fl;
          flash.style.opacity = fl;
        }

        // ----- rain: two sets of ruled lines at the wind's angle -----
        const inten = clamp(w.intensity);
        const drizzle = falling === "drizzle" ? 1 : 0;
        const nRain = f.wet > 0.02 ? Math.round(f.wet * (drizzle ? lerp(90, 230, inten * 2) : lerp(170, NR, Math.pow(inten, 0.85)))) : 0;
        const nSnow = f.snow > 0.02 ? Math.round(f.snow * lerp(130, NS, inten)) : 0;
        if (nRain > 0 || nSnow > 0) {
          const ctx = live.ctx;
          live.clear();
          liveDirty = true;
          if (nRain > 0) {
            // slant: mostly the wind across the view, a little of it however it blows
            const deg = dir * clamp(4 + 1.2 * Math.abs(cross) + 0.45 * (w.wind - Math.abs(cross)), 5, 50);
            rainTravel += (190 + 250 * inten) * dt;
            const lenK = drizzle ? 0.36 : 1;
            ctx.lineCap = "butt";
            for (let set = 0; set < 2; set++) {
              const a = ((deg + (set ? dir * (3.2 + 2.5 * f.storm) : 0)) * Math.PI) / 180;
              const ca = Math.cos(a), sa = Math.sin(a);
              ctx.strokeStyle = `rgba(${rainRGB},${f1((rainAlpha * (set ? 0.7 : 1) * (drizzle ? 0.7 : 1)))})`;
              ctx.lineWidth = (set ? 1.1 : 1.5) * (drizzle ? 0.8 : 1 + 0.25 * inten);
              ctx.beginPath();
              for (let i = set; i < nRain; i += 2) {
                const u = rU[i], L = rL[i] * lenK;
                const v = ((rV[i] + rainTravel * rS[i]) % RP) - RP * 0.56;
                const x = 540 + u * ca + v * sa, y = 894 - u * sa + v * ca;
                ctx.moveTo(x, y);
                ctx.lineTo(x + L * sa, y + L * ca);
              }
              ctx.stroke();
            }
          }
          if (nSnow > 0) {
            snowFall += (26 + 30 * inten) * dt;
            snowDrift += clamp(cross * 3.2, -80, 80) * dt;
            const sw = PW + 80, sh = PH + 40;
            ctx.fillStyle = snowCol;
            ctx.beginPath();
            for (let i = 0; i < nSnow; i++) {
              const rad = sR[i];
              const y = Y0 - 20 + ((sY[i] + snowFall * sF[i]) % sh);
              const xx = sX[i] + snowDrift * sF[i] + 9 * Math.sin(sP[i] + snowFall * 0.02 * sF[i]);
              const x = X0 - 40 + ((((xx % sw) + sw) % sw));
              ctx.moveTo(x + rad, y);
              ctx.arc(x, y, rad, 0, TAU);
            }
            ctx.fill();
          }
        } else if (liveDirty) {
          live.clear();
          liveDirty = false;
        }
        first = false;
      },
    };
  },
};

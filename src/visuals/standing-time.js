// Standing Time
//
// Four slab-serif numerals stand outdoors like a monument, hours on a ledge
// above minutes on a plinth, and the weather happens to them. Each numeral
// shows how long it has stood: the last minute digit is at most sixty seconds
// old and nearly clean, the hour digit carries up to an hour of weather, the
// AM/PM block half a day of it and the date line the whole day.
//
// How the conditions drive it
//   snow     caps grow on every upward-facing edge of a glyph at the real rate
//            of snowfall times that glyph's age, lean and thin out on the
//            windward side, and never fill a counter. The ledges collect it
//            too, with a heap where each minute digit has shed its cap, and
//            are swept on the hour.
//   rain     a glyph darkens from its top edges down, with a few bold rivulets
//            running ahead; an hour-old digit is soaked, a new one is dry with
//            its first drops. The ledges hold a film of water and drip.
//   dry      nothing accumulates: dust motes ride the real wind (more of them
//            in bad air) and the sun or the moon puts a clean rim on the side
//            it stands on, with the side face of each block turned away from it.
//   colour   the field is the measured sky, west at the left to east at the
//            right. The monoliths are one pigment that travels with the season
//            from cobalt (January) to oxide red (July). By day they stand dark
//            against the sky; when the sky goes dark they stand pale against it.
//
// Everything that accumulates is a function of (glyph age, weather), not of
// what happened since the page loaded, so the first frame is already right
// and a jump of the clock goes straight to the new state.
//
// Not in the kit, written here: per-glyph offscreen canvases and surface
// tracing (the upward-facing edges of a rasterised letterform).

import { W, H, TAU, clamp, lerp, smoothstep, ease, hash, createNoise, mix, oklch, toOklch, luminance, contrast, rgba, el, addStyle, canvas2d, mask, grain, fitText } from "../lib/kit.js";

const MX = 64; // side margin
const GAP = 22; // between numerals
const SLAB = '"Alfa Slab One", "Rockwell", serif';
const BIG_PX = 520;
const AP_PX = 132;
// Each row: the strip of the stage it owns on the canvas, and the line its glyphs stand on.
const ROWS = [
  { y0: 0, y1: 186, base: 170, ledge: 12 }, // the date
  { y0: 186, y1: 746, base: 732, ledge: 46 }, // hours
  { y0: 746, y1: 1326, base: 1312, ledge: 60 }, // minutes, on the plinth
];
const PLINTH = ROWS[2].base;
const T_SINK = 1.25; // the old numeral goes down into its slot
const T_RISE0 = 1.05; // the new one starts up
const T_RISE = 1.95;
const GW = W / 2; // collision grid, 2 px cells
const GH = H / 2;

const CSS = `
.st { position: absolute; inset: 0; overflow: hidden; font-family: "Rokkitt", Georgia, serif; }
.st .field, .st .swell { position: absolute; inset: 0; }
.st .swell { opacity: 0; background: radial-gradient(900px 620px at 62% 16%, rgba(214,226,255,0.9), rgba(214,226,255,0) 70%); }
.st .wisp { position: absolute; left: 0; top: 0; border-radius: 50%; opacity: 0; will-change: transform; }
.st .ledge { position: absolute; left: 0; width: ${W}px; }
.st .plinth { position: absolute; left: 0; top: ${PLINTH}px; width: ${W}px; height: ${H - PLINTH}px; }
.st .groove { position: absolute; left: 0; width: ${W}px; height: 3px; }
.st .t { position: absolute; white-space: nowrap; line-height: 1; text-shadow: 0 -1.5px 0 rgba(0,0,0,0.42), 0 1.5px 0 rgba(255,255,255,0.09); }
.st .plate { font-weight: 600; font-size: 25px; letter-spacing: 0.16em; text-transform: uppercase; transform: translateX(-50%); }
.st .temp { font-family: ${SLAB}; font-size: 128px; left: ${MX - 4}px; }
.st .cond { font-weight: 600; font-size: 52px; letter-spacing: 0.05em; text-transform: uppercase; }
.st .sub { font-weight: 400; font-size: 38px; }
.st .lab { font-weight: 600; font-size: 25px; letter-spacing: 0.16em; text-transform: uppercase; }
.st .val { font-weight: 500; font-size: 48px; }
.st .fact { font-weight: 400; font-size: 42px; line-height: 50px; white-space: normal; left: ${MX}px; width: ${W - MX * 2}px; text-wrap: balance; }
.st .rule { position: absolute; left: ${MX}px; width: ${W - MX * 2}px; height: 2px; box-shadow: 0 1.5px 0 rgba(255,255,255,0.07); background: rgba(0,0,0,0.34); }
`;

export default {
  title: "Standing Time",
  description: "Four monolith numerals stand out in the weather, and each one wears exactly as much snow or rain as the time it has stood.",
  fonts: ["Alfa Slab One", "Rokkitt:wght@400;500;600"],
  fps: 30,

  mount(root, { state, seed }) {
    const noise = createNoise(seed);
    addStyle(root, CSS);
    const wrap = el("div", { class: "st" });
    root.append(wrap);

    // ---- the still parts, in DOM: sky field, ledges, plinth ----------------
    const field = el("div", { class: "field" });
    const swell = el("div", { class: "swell" });
    const wisps = [];
    for (let i = 0; i < 6; i++) {
      const w = 760 + hash(i, seed) * 520;
      const h = 300 + hash(i, seed + 1) * 260;
      wisps.push({ node: el("div", { class: "wisp", style: { width: `${w}px`, height: `${h}px` } }), w, h, y: 150 + (i / 6) * 1050 + hash(i, seed + 2) * 120, ph: hash(i, seed + 3), sp: 0.5 + hash(i, seed + 4) });
    }
    const ledges = [0, 1].map((i) => el("div", { class: "ledge", style: { top: `${ROWS[i].base}px`, height: `${ROWS[i].ledge}px` } }));
    const plinth = el("div", { class: "plinth" });
    const groove = el("div", { class: "groove", style: { top: `${PLINTH + ROWS[2].ledge}px` } });
    wrap.append(field, swell, ...wisps.map((w) => w.node), ...ledges, plinth, groove);

    // ---- canvases: the monoliths and what has settled on them (drawn only
    // when something changes), and the air (redrawn every frame) -------------
    const mono = canvas2d(wrap, { maxScale: 2 });
    const air = canvas2d(wrap, { adaptive: true });
    const R = mono.ratio;
    const mctx = mono.ctx;

    // ---- type metrics -------------------------------------------------------
    const meas = document.createElement("canvas").getContext("2d");
    const metricsOf = (font) => {
      meas.font = font.replace("%", "100");
      const m = meas.measureText("H");
      return { a: m.fontBoundingBoxAscent / 100, d: m.fontBoundingBoxDescent / 100, cap: m.actualBoundingBoxAscent / 100 };
    };
    const mSlab = metricsOf(`%px ${SLAB}`);
    const mRok = metricsOf('500 %px "Rokkitt"');
    // top of a line box (line-height `lh`) whose first baseline should sit at `baseline`
    const topFor = (baseline, px, m, lh = px) => baseline - ((lh - (m.a + m.d) * px) / 2 + m.a * px);
    const advance = (font, str, ls = 0) => {
      meas.font = font;
      let w = 0;
      for (const ch of str) w += meas.measureText(ch).width + ls;
      return w - ls;
    };
    // The date is set as two groups, weekday at the left margin and month-day
    // at the right: size it so the longest pair still leaves a gap.
    const DATE_LS = 0.07;
    const worst = advance(`100px ${SLAB}`, "WEDNESDAY", DATE_LS * 100) + advance(`100px ${SLAB}`, "SEPTEMBER 30", DATE_LS * 100);
    const DATE_PX = Math.max(46, Math.min(62, Math.floor((100 * (W - MX * 2 - 44)) / worst)));

    // ---- glyph classes ------------------------------------------------------
    const scratch = (bw, bh) => {
      const c = document.createElement("canvas");
      c.width = Math.ceil(bw * R);
      c.height = Math.ceil(bh * R);
      return c;
    };
    const mkClass = (kind, px, padX, padT, padB, inkW, inkH, depth, dmax, k) => {
      const bw = Math.ceil(inkW + padX * 2);
      const bh = Math.ceil(inkH + padT + padB);
      const sa = scratch(bw, bh);
      const sb = scratch(bw, bh);
      return { kind, px, font: `${px}px ${SLAB}`, padX, padT, padB, bw, bh, depth, dmax, k, sa, sb, sactx: sa.getContext("2d"), sbctx: sb.getContext("2d") };
    };
    const CLS = {
      big: mkClass(0, BIG_PX, 34, 108, 14, BIG_PX * 0.76, BIG_PX * 0.83, 1, 84, 1),
      ap: mkClass(1, AP_PX, 18, 62, 8, AP_PX * 1.17, AP_PX * 0.8 * 2 + 8, 0.5, 40, 0.5),
      date: mkClass(2, DATE_PX, 14, 40, 6, W - MX * 2, DATE_PX * 0.8, 0.24, 19, 0.24),
    };

    function makeSlot(id, row, cls, hasPlate) {
      const comp = scratch(cls.bw, cls.bh);
      const old = scratch(cls.bw, cls.bh);
      const sl = {
        id, row, cls,
        str: "", x: 0, gy: ROWS[row].base - (cls.bh - cls.padB),
        comp, cctx: comp.getContext("2d"), old, octx: old.getContext("2d"), oldX: 0, hadOld: false,
        anim: false, t0: 0,
        mask: null, chains: [], inkL: 0, inkR: 0, inkT: 0, inkB: 0,
        ox: 0, oy: 0, ox2: 0, oy2: 0, chars: [], cx: [],
        rv: new Float32Array(16 * 6), nrv: 0, seed: 0,
        age: 0, D: 0, Ddrawn: -1, wetKey: -2, wetDrawn: -2, palDrawn: -1,
        plate: hasPlate ? el("div", { class: "t plate" }) : null, plateText: "", plateX: -1,
      };
      return sl;
    }
    const S = {
      h1: makeSlot(0, 1, CLS.big, true),
      h2: makeSlot(1, 1, CLS.big, true),
      m1: makeSlot(2, 2, CLS.big, true),
      m2: makeSlot(3, 2, CLS.big, true),
      ap: makeSlot(4, 2, CLS.ap, true),
      date: makeSlot(5, 0, CLS.date, false),
    };
    const slots = [S.h1, S.h2, S.m1, S.m2, S.ap, S.date];
    const rowSlots = [[S.date], [S.h1, S.h2], [S.m1, S.m2, S.ap]];

    // ---- inscriptions on the plinth (DOM) -----------------------------------
    const T = (cls, style) => el("div", { class: `t ${cls}`, style });
    const n = {
      temp: T("temp"), cond: T("cond"), sub: T("sub"),
      sunL: T("lab"), sunV: T("val"), moonL: T("lab", null), moonV: T("val"), aqiL: T("lab"), aqiV: T("val"), uvL: T("lab"), uvV: T("val"),
      factL: T("lab"), factV: T("fact"),
      rule1: el("div", { class: "rule" }), rule2: el("div", { class: "rule" }),
    };
    n.moonL.textContent = "Moon";
    n.aqiL.textContent = "Air quality";
    n.uvL.textContent = "UV index";
    const COL = [MX, 318, 668, 872];
    const colW = [230, 326, 180, W - MX - 872];
    wrap.append(...Object.values(n), ...slots.filter((s) => s.plate).map((s) => s.plate));
    function layoutText(shift) {
      const y = (v) => `${Math.round(v + shift)}px`;
      const tempBase = 1508;
      n.temp.style.top = y(topFor(tempBase, 128, mSlab));
      n.cond.style.top = y(topFor(tempBase - mSlab.cap * 128 + mRok.cap * 52, 52, mRok));
      n.sub.style.top = y(topFor(tempBase, 38, mRok));
      n.rule1.style.top = y(1546);
      for (const [l, v, c] of [[n.sunL, n.sunV, 0], [n.moonL, n.moonV, 1], [n.aqiL, n.aqiV, 2], [n.uvL, n.uvV, 3]]) {
        l.style.left = v.style.left = `${COL[c]}px`;
        l.style.top = y(topFor(1594, 25, mRok));
        v.style.top = y(topFor(1646, 48, mRok));
      }
      n.rule2.style.top = y(1682);
      n.factL.style.left = `${MX}px`;
      n.factL.style.top = y(topFor(1728, 25, mRok));
      n.factV.style.top = y(topFor(1780, 42, mRok, 50));
    }
    for (const sl of slots) if (sl.plate) sl.plate.style.top = `${Math.round(topFor(ROWS[sl.row].base + ROWS[sl.row].ledge / 2 + mRok.cap * 12.5, 25, mRok))}px`;
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

    // ---- letterforms --------------------------------------------------------
    function drawShape(c, sl, dx, dy) {
      const k = sl.cls.kind;
      c.font = sl.cls.font;
      c.textBaseline = "alphabetic";
      c.textAlign = "left";
      if (k === 0) c.fillText(sl.str, sl.ox + dx, sl.oy + dy);
      else if (k === 1) {
        c.fillText("M", sl.ox + dx, sl.oy + dy);
        c.fillText(sl.str[0], sl.ox2 + dx, sl.oy2 + dy);
      } else for (let i = 0; i < sl.chars.length; i++) c.fillText(sl.chars[i], sl.cx[i] + dx, sl.oy + dy);
    }

    // Trace the upward-facing edges of the glyph ("surfaces": runs of columns
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
          } else if (!s && prev && y > B) B = y;
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
      const max = sl.cls.kind === 0 ? 7 : sl.cls.kind === 1 ? 4 : 16;
      const spacing = sl.cls.kind === 2 ? 34 : 50 * k + 6;
      let count = 0;
      for (let tries = 0; tries < 90 && count < max; tries++) {
        const open = sl.chains.filter((c) => c.open && c.n > 8);
        if (!open.length) break;
        const ch = open[Math.floor(hash(tries, sl.seed) * open.length)];
        const i = 2 + Math.floor(hash(tries, sl.seed + 11) * (ch.n - 4));
        const x = ch.x0 + i;
        let ok = true;
        for (let j = 0; j < count; j++) if (Math.abs(sl.rv[j * 6] - x) < spacing) ok = false;
        if (!ok) continue;
        const o = count * 6;
        sl.rv[o] = x;
        sl.rv[o + 1] = ch.y[i];
        sl.rv[o + 2] = (13 + 19 * hash(tries, sl.seed + 12)) * (0.35 + 0.65 * k); // width
        sl.rv[o + 3] = 0.55 + 1.5 * hash(tries, sl.seed + 13) ** 1.6; // speed
        sl.rv[o + 4] = count === 0 ? 2 : 34 * hash(tries, sl.seed + 14); // delay, s
        sl.rv[o + 5] = hash(tries, sl.seed + 15) * TAU; // meander phase
        count++;
      }
      sl.nrv = count;
    }

    function setGlyph(sl, str, s) {
      sl.str = str;
      if (!str) { sl.chains = []; sl.nrv = 0; sl.mask = null; return; }
      const c = sl.cls;
      sl.oy = c.bh - c.padB;
      if (c.kind === 0) sl.ox = c.padX + 14;
      else if (c.kind === 1) {
        sl.ox = c.padX + 4;
        meas.font = c.font;
        sl.ox2 = sl.ox + (meas.measureText("M").width - meas.measureText(str[0]).width) / 2;
        sl.oy2 = sl.oy - Math.round(mSlab.cap * c.px) - 6;
      } else {
        const ls = DATE_LS * c.px;
        const [a, b] = str.split("|");
        sl.chars = [];
        sl.cx = [];
        meas.font = c.font;
        let x = c.padX;
        for (const ch of a) { sl.chars.push(ch); sl.cx.push(x); x += meas.measureText(ch).width + ls; }
        x = c.padX + (W - MX * 2) - advance(c.font, b, ls);
        for (const ch of b) { sl.chars.push(ch); sl.cx.push(x); x += meas.measureText(ch).width + ls; }
      }
      sl.mask = mask(c.bw, c.bh, (ctx) => drawShape(ctx, sl, 0, 0)).data;
      analyse(sl);
      // the same glyph born at the same instant always weathers the same way
      sl.seed = (Math.floor((s.ms - sl.age * 1000) / 1000 + 0.5) % 100000) + sl.id * 7919;
      seedRivulets(sl);
    }

    // ---- palette ------------------------------------------------------------
    const pal = {
      version: 0, key: "", lit: 0, ex: -12, rimShift: 1,
      big: { face: "#000", side: "#000", rim: "#000", rimOn: false, wet1: "#000", wet2: "#000", glint: "#000" },
      date: { face: "#000", side: "#000", rim: "#000", rimOn: false, wet1: "#000", wet2: "#000", glint: "#000" },
      snow: "#fff", shade: "#ccd", puddle: "#888", rain: "#fff", rainA: 0.5, mote: "#fff", moteA: 0.5, field: "#000",
    };
    const toneL = (l) => (l <= 0.37 ? l : l <= 0.507 ? 0.37 + (l - 0.37) * (0.042 / 0.137) : l <= 0.575 ? 0.412 + (l - 0.507) * (0.228 / 0.068) : l <= 0.71 ? 0.64 + (l - 0.575) * (0.07 / 0.135) : Math.min(l, 0.85));
    const tone = (hex) => {
      const o = toOklch(hex);
      const l2 = toneL(o.l);
      return oklch(l2, o.c * (o.l > 0.05 ? clamp(l2 / o.l, 0.7, 1.25) : 1), o.h);
    };
    let hue = 262;
    let chroma = 0.17;
    // the pigment at a wanted luminance
    const pig = (Y, c = 1) => {
      let L = Math.cbrt(Math.max(0.0005, Y));
      for (let i = 0; i < 4; i++) {
        const y = luminance(oklch(L, chroma * c, hue));
        L = clamp(L * Math.cbrt((Y + 0.003) / (y + 0.003)), 0.02, 0.99);
      }
      return oklch(L, chroma * c, hue);
    };
    let rainK = 0; // 0..1 it is raining
    let snowK = 0; // 0..1 it is snowing
    let lat = 1; // which way the wind carries things across the picture, -1..1
    let capWind = 0;
    let fogK = 0;

    function updatePalette(s) {
      const season = 0.5 - 0.5 * Math.cos(TAU * (s.clock.yearFrac - 0.04)); // 0 mid-January, 1 mid-July
      hue = (262 + 134 * season) % 360;
      chroma = 0.175 - 0.03 * Math.sin(Math.PI * season);
      const f0 = tone(s.sky.west), f1 = tone(s.sky.northWest), f2 = tone(s.sky.northEast), f3 = tone(s.sky.east);
      const mean = tone(s.sky.mean);
      const Lf = toOklch(mean).l;
      const Yf = luminance(mean);
      const lit = smoothstep(0.57, 0.45, Lf);
      const cloud = clamp(s.weather.cloud / 100);

      // which side the light stands on
      const sunLx = Math.sin((s.sun.az * Math.PI) / 180);
      const moonVis = smoothstep(-2, 8, s.moon.alt) * s.moon.illumination;
      const nightLx = lerp(-0.75, Math.sin((s.moon.az * Math.PI) / 180), smoothstep(0.02, 0.2, moonVis));
      const lx = lerp(nightLx, sunLx, smoothstep(0.08, 0.45, s.daylight));
      const shape = (lx / Math.sqrt(lx * lx + 0.012)) * (0.45 + 0.55 * Math.abs(lx));
      const ex = Math.round(-22 * shape * 2) / 2;
      const direct = Math.pow(1 - cloud, 1.4) * smoothstep(-1, 10, s.sun.alt);
      const moonS = moonVis * Math.pow(1 - cloud, 1.2);
      const rimAmt = lerp(0.8 * direct, 0.9 * moonS, lit);
      const rimTint = mix(mix("#ffb46a", "#fff3dc", smoothstep(0, 24, s.sun.alt)), "#eef2ff", lit);

      const dayY = clamp((Yf + 0.05) / 3.4 - 0.05, 0.012, 0.085);
      const wetFloor = 3.25 * (Yf + 0.05) - 0.05;
      const dryLit = clamp(wetFloor * (1.22 + 0.5 * rainK), 0.2, 0.62);
      const b = pal.big;
      b.face = mix(pig(dayY), pig(dryLit, 0.62), lit);
      b.side = mix(pig(dayY * 0.4, 0.9), pig(dryLit * 0.27, 0.6), lit);
      b.wet1 = mix(pig(dayY * 0.5), pig(Math.max(wetFloor * 1.14, dryLit * 0.66), 0.75), lit);
      b.wet2 = mix(pig(dayY * 0.24), pig(wetFloor, 0.8), lit);
      b.glint = mix(b.wet1, "#ffffff", 0.3);
      b.rimOn = rimAmt > 0.04;
      b.rim = mix(b.face, rimTint, rimAmt);
      // the date line is smaller, so it gets more contrast
      const dDayY = clamp((Yf + 0.05) / 4.9 - 0.05, 0.005, 0.06);
      const d45 = 4.8 * (Yf + 0.05) - 0.05;
      const d = pal.date;
      d.face = mix(pig(dDayY), pig(clamp(d45 * (1 + 0.35 * rainK), dryLit, 0.75), 0.6), lit);
      d.side = mix(pig(dDayY * 0.4, 0.9), pig(dryLit * 0.27, 0.6), lit);
      d.wet1 = d.wet2 = mix(pig(dDayY * 0.45), pig(Math.min(0.7, d45), 0.75), lit);
      d.glint = mix(d.wet1, "#ffffff", 0.3);
      d.rimOn = b.rimOn;
      d.rim = mix(d.face, rimTint, rimAmt);

      const stone = mix(pig(0.021, 0.78), pig(Yf * 1.25 + 0.016, 0.5), lit);
      const hi = mix(stone, mix("#fff4e0", "#c9d4f0", lit), lerp(0.42, 0.3, lit));
      const ink = mix(oklch(0.955, 0.018, 85), oklch(0.86, 0.02, 250), lit);
      let label = mix(ink, stone, 0.24);
      if (contrast(label, stone) < 5.2) label = ink;
      pal.snow = oklch(lerp(1, 0.9, lit), 0.012 * lit, 250);
      pal.shade = oklch(lerp(0.86, 0.7, lit), 0.035, 255);
      pal.puddle = mix(stone, mean, 0.6);
      pal.rain = lit > 0.5 ? mix(mean, "#d6e4ff", 0.55) : mix(mean, "#16233d", 0.5);
      pal.mote = lit > 0.5 ? mix(mean, "#b9c4e2", 0.6) : mix(mean, "#fffaf0", 0.85);
      pal.field = mean;
      pal.lit = lit;

      css("field", field, "background", `linear-gradient(90deg, ${f0} 0%, ${f1} 34%, ${f2} 66%, ${f3} 100%)`);
      for (let i = 0; i < 2; i++) {
        css(`lg${i}`, ledges[i], "background", stone);
        css(`lgs${i}`, ledges[i], "boxShadow", `inset 0 ${i ? 3 : 2}px 0 ${hi}, inset 0 -2px 0 rgba(0,0,0,0.28)`);
      }
      css("pl", plinth, "background", stone);
      css("pls", plinth, "boxShadow", `inset 0 3px 0 ${hi}`);
      css("gr", groove, "background", `linear-gradient(${rgba("#000000", 0.34)} 0 67%, ${rgba(hi, 0.5)} 67% 100%)`);
      css("ink", wrap, "color", ink);
      for (const k of ["sunL", "moonL", "aqiL", "uvL", "factL"]) css(`c${k}`, n[k], "color", label);
      for (const sl of slots) if (sl.plate) css(`cp${sl.id}`, sl.plate, "color", label);
      const wispCol = lit > 0.5 ? rgba(mix(mean, "#8f9ab4", 0.5), 0.5) : rgba(mix(mean, "#ffffff", 0.6), 0.85);
      if (shown.wisp !== wispCol) {
        shown.wisp = wispCol;
        for (const w of wisps) w.node.style.background = `radial-gradient(closest-side, ${wispCol}, ${wispCol.replace(/[\d.]+\)$/, "0)")})`;
      }

      const key = `${b.face}${b.side}${b.rim}${b.wet1}${b.wet2}${d.face}${d.wet1}${d.rim}${ex}`;
      if (key !== pal.key) {
        pal.key = key;
        pal.ex = ex;
        pal.version++;
      }
    }

    // ---- building one glyph's picture: side face, rim, face, wet -------------
    function paintWet(c, sl, age, P) {
      const cl = sl.cls;
      const k = cl.k;
      const I = rainK;
      const inkH = sl.inkB - sl.inkT;
      const B = inkH * 1.2 * (1 - Math.exp((-I * age) / 1000));
      // the first drops
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
      // the wet creeping down from every top edge
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
      // a few bold rivulets running ahead of it
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
          c.globalAlpha = pass ? 0.5 : 1;
          c.beginPath();
          const a = pass ? Math.min(len * 0.2, 10) : 0;
          const z = pass ? len - w * 0.4 : len;
          let px = 0, py = 0;
          for (let dy = a; dy <= z + 0.01; dy += 14) {
            px = x0 + lean * dy + amp * Math.sin(dy * 0.021 / (0.4 + 0.6 * k) + ph) * Math.min(1, dy / 40);
            py = y0 + dy;
            if (dy === a) c.moveTo(px, py);
            else c.lineTo(px, py);
          }
          px = x0 + lean * z + amp * Math.sin(z * 0.021 / (0.4 + 0.6 * k) + ph) * Math.min(1, z / 40);
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

    function buildComp(sl) {
      const cl = sl.cls;
      const P = cl.kind === 2 ? pal.date : pal.big;
      const c = sl.cctx;
      const cw = sl.comp.width;
      const chh = sl.comp.height;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = "source-over";
      c.clearRect(0, 0, cw, chh);
      sl.palDrawn = pal.version;
      sl.wetDrawn = sl.wetKey;
      if (!sl.str) return;
      const a = cl.sactx;
      const ex = Math.round(pal.ex * cl.depth * R); // device px, signed
      const dir = Math.sign(ex) || 1;
      // 1. the side face: the letterform swept sideways, away from the light
      if (ex !== 0) {
        a.setTransform(R, 0, 0, R, 0, 0);
        a.globalCompositeOperation = "source-over";
        a.clearRect(0, 0, cl.bw, cl.bh);
        a.fillStyle = "#000";
        drawShape(a, sl, 0, 0);
        a.setTransform(1, 0, 0, 1, 0, 0);
        let covered = 0;
        const need = Math.abs(ex);
        while (covered < need) {
          const sh = Math.min(covered + 1, need - covered);
          a.drawImage(cl.sa, dir * sh, 0);
          covered += sh;
        }
        a.globalCompositeOperation = "source-in";
        a.fillStyle = P.side;
        a.fillRect(0, 0, cw, chh);
        c.drawImage(cl.sa, 0, 0);
      }
      // 2. the face, with a rim on the edges that look toward the light
      c.setTransform(R, 0, 0, R, 0, 0);
      if (P.rimOn) {
        c.fillStyle = P.rim;
        drawShape(c, sl, 0, 0);
        const rw = Math.max(1.5, 3.6 * (0.3 + 0.7 * cl.k));
        a.setTransform(R, 0, 0, R, 0, 0);
        a.globalCompositeOperation = "source-over";
        a.clearRect(0, 0, cl.bw, cl.bh);
        a.fillStyle = P.face;
        drawShape(a, sl, dir * rw, rw * 0.45);
        a.globalCompositeOperation = "destination-in";
        drawShape(a, sl, 0, 0);
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.drawImage(cl.sa, 0, 0);
      } else {
        c.fillStyle = P.face;
        drawShape(c, sl, 0, 0);
      }
      // 3. what the rain has done to it
      if (sl.wetKey >= 0 && rainK > 0.01) {
        a.setTransform(R, 0, 0, R, 0, 0);
        a.globalCompositeOperation = "source-over";
        a.clearRect(0, 0, cl.bw, cl.bh);
        paintWet(a, sl, sl.age, P);
        a.globalCompositeOperation = "destination-in";
        a.fillStyle = "#000";
        drawShape(a, sl, 0, 0);
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.drawImage(cl.sa, 0, 0);
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
    }

    // ---- snow ---------------------------------------------------------------
    const capD = new Float32Array(1200);
    const capT = new Float32Array(1200);
    // Chunky caps on every surface of a glyph. (ox, oy) is where the glyph's
    // box sits in the context; D is the depth the oldest, most open surface has.
    function paintCaps(c, sl, ox, oy, D) {
      const k = sl.cls.k;
      const lw = clamp(D * 0.2, 0, 8 * (0.4 + 0.6 * k));
      const R0 = clamp(D * 0.95, 3, 60);
      const lean = capWind * 0.3;
      c.lineJoin = "round";
      c.lineCap = "round";
      c.lineWidth = lw;
      for (let pass = 0; pass < 2; pass++) {
        c.fillStyle = c.strokeStyle = pass ? pal.snow : pal.shade;
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
            const u = capWind >= 0 ? i / len : 1 - i / len; // 0 at the windward end
            const er = 1 - Math.abs(capWind) * 0.62 * (1 - smoothstep(0, 0.6, u));
            const xs = (ch.x0 + i) / k;
            const lump = 1 + 0.24 * noise.n2(xs * 0.026 + sl.seed * 0.13, 3.1) + 0.1 * noise.n2(xs * 0.08, sl.seed * 0.29);
            const gp = ch.gap[i];
            let d = D * sf * sh * er * lump * (gp >= 9000 ? 1 : 0.45);
            if (gp < 9000 && d > gp * 0.3) d = gp * 0.3;
            capT[i] = d;
          }
          // soften the profile
          for (let i = 0; i < len; i++) {
            const a = capT[i > 1 ? i - 2 : 0], b = capT[i > 0 ? i - 1 : 0], d = capT[i], e = capT[i < len - 1 ? i + 1 : len - 1], f = capT[i < len - 2 ? i + 2 : len - 1];
            capD[i] = (a + 2 * b + 3 * d + 2 * e + f) / 9;
            if (capD[i] > top) top = capD[i];
          }
          if (top < 0.7) continue;
          const lower = pass ? 0.36 : 0; // the white part stops short of the bottom: the rest is the shaded underside
          c.moveTo(ox + ch.x0 - 0.5, oy + ch.y[0] + 1.5 - capD[0] * lower);
          for (let i = 0; i < len; i++) c.lineTo(ox + ch.x0 + i + lean * capD[i], oy + ch.y[i] - capD[i]);
          c.lineTo(ox + ch.x0 + len + 0.5, oy + ch.y[len - 1] + 1.5 - capD[len - 1] * lower);
          for (let i = len - 1; i >= 0; i--) c.lineTo(ox + ch.x0 + i + lean * capD[i] * lower, oy + ch.y[i] + 1.5 - (capD[i] + 1.5) * lower);
          c.closePath();
        }
        c.fill();
        if (lw > 0.6) c.stroke();
      }
    }

    // Snow lying on a ledge: a base layer since the ledge was last swept, plus a
    // heap under each minute digit from the caps it has shed.
    const led = [
      { d: 0, drawn: -1, max: 13, heaps: [] },
      { d: 0, drawn: -1, max: 28, heaps: [] },
      { d: 0, drawn: -1, max: 34, heaps: [{ x: 0, a: 0, s: 1 }, { x: 0, a: 0, s: 1 }] },
    ];
    const ledgeDepth = (ri, x) => {
      const L = led[ri];
      let d = L.d * (0.76 + 0.34 * noise.n2(x * 0.011, ri * 9.3 + 0.5) + 0.1 * noise.n2(x * 0.045, ri * 3.7));
      for (const h of L.heaps) if (h.a > 0.2) d += h.a * Math.exp(-(((x - h.x) / h.s) ** 2));
      return d;
    };
    function paintLedgeSnow(c, ri) {
      const L = led[ri];
      const base = ROWS[ri].base;
      let any = L.d > 0.4;
      for (const h of L.heaps) if (h.a > 0.4) any = true;
      if (!any) return;
      const lipMax = ri === 0 ? 4 : 9;
      for (let pass = 0; pass < 2; pass++) {
        c.fillStyle = pass ? pal.snow : pal.shade;
        c.beginPath();
        c.moveTo(-4, base + 1);
        for (let x = -4; x <= W + 4; x += 6) c.lineTo(x, base - ledgeDepth(ri, x));
        if (pass) for (let x = W + 4; x >= -4; x -= 6) c.lineTo(x, base - ledgeDepth(ri, x) * 0.34);
        else for (let x = W + 4; x >= -4; x -= 6) c.lineTo(x, base + Math.min(lipMax, ledgeDepth(ri, x) * 0.32) * (0.6 + 0.4 * noise.n2(x * 0.03, ri + 20)));
        c.closePath();
        c.fill();
      }
    }
    function paintPuddle(c, ri) {
      const L = led[ri];
      if (L.d < 0.3) return;
      const base = ROWS[ri].base;
      c.fillStyle = pal.puddle;
      c.beginPath();
      c.moveTo(-4, base + 1.5);
      for (let x = -4; x <= W + 4; x += 8) c.lineTo(x, base - L.d * clamp(0.7 + 0.9 * noise.n2(x * 0.006, ri * 5.1 + 40)));
      c.lineTo(W + 4, base + 1.5);
      c.closePath();
      c.fill();
    }

    // ---- painting a row of the monument --------------------------------------
    let now = 0; // animation clock
    let precip = 0; // 0 dry, 1 rain, 2 snow
    const TRAVEL = (sl) => sl.cls.bh - sl.cls.padB + 4;
    function paintRow(ri, x0 = 0, x1 = W) {
      const row = ROWS[ri];
      const c = mctx;
      x0 = Math.max(0, Math.floor(x0));
      x1 = Math.min(W, Math.ceil(x1));
      c.save();
      c.beginPath();
      c.rect(x0, row.y0, x1 - x0, row.y1 - row.y0);
      c.clip();
      c.clearRect(x0, row.y0, x1 - x0, row.y1 - row.y0);
      c.save();
      c.beginPath();
      c.rect(x0, row.y0, x1 - x0, row.base - row.y0);
      c.clip();
      for (const sl of rowSlots[ri]) {
        let off = 0;
        const travel = TRAVEL(sl);
        if (sl.anim) {
          const a = now - sl.t0;
          if (sl.hadOld && a < T_SINK) c.drawImage(sl.old, sl.oldX, sl.gy + travel * ease.in(clamp(a / T_SINK)), sl.cls.bw, sl.cls.bh);
          off = travel * (1 - ease.cubicOut(clamp((a - T_RISE0) / T_RISE)));
        }
        if (sl.str && off < travel - 1) {
          c.drawImage(sl.comp, sl.x, sl.gy + off, sl.cls.bw, sl.cls.bh);
          if (precip === 2 && sl.D > 0.4) paintCaps(c, sl, sl.x, sl.gy + off, sl.D);
        }
        if (!sl.anim) sl.Ddrawn = sl.D;
      }
      c.restore();
      if (precip === 2) paintLedgeSnow(c, ri);
      else if (precip === 1) paintPuddle(c, ri);
      led[ri].drawn = led[ri].d;
      c.restore();
    }

    // ---- collision grid: which row's stone, if any, is at each 2 px cell ------
    const grid = new Uint8Array(GW * GH);
    function rebuildGrid() {
      grid.fill(0);
      for (let ri = 0; ri < 2; ri++) {
        const y0 = ROWS[ri].base >> 1;
        const y1 = (ROWS[ri].base + ROWS[ri].ledge) >> 1;
        for (let y = y0; y < y1; y++) grid.fill(ri + 1, y * GW, (y + 1) * GW);
      }
      for (const sl of slots) {
        if (!sl.str || !sl.mask) continue;
        const { bw, bh } = sl.cls;
        const v = sl.row + 1;
        const yEnd = Math.min(bh, ROWS[sl.row].base - sl.gy);
        for (let y = 0; y < yEnd; y += 2) {
          const gy = (sl.gy + y) >> 1;
          if (gy < 0 || gy >= GH) continue;
          for (let x = 0; x < bw; x += 2) {
            if (sl.mask[y * bw + x] > 100) {
              const gx = (sl.x + x) >> 1;
              if (gx >= 0 && gx < GW) grid[gy * GW + gx] = v;
            }
          }
        }
      }
    }

    // ---- the air: snow, rain or dust -----------------------------------------
    const NP = 660;
    const px = new Float32Array(NP), py = new Float32Array(NP), psz = new Float32Array(NP), pph = new Float32Array(NP);
    const pk = new Uint8Array(NP); // 0 behind the stone, 1..3 lands on that row, 4 in front
    let rs = (seed * 2654435761) >>> 0;
    const rnd = () => ((rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < NP; i++) {
      px[i] = -120 + rnd() * (W + 240);
      py[i] = -60 + rnd() * (PLINTH + 60);
      psz[i] = rnd();
      pph[i] = rnd();
      const c = i % 10;
      pk[i] = c < 3 ? 0 : c < 4 ? 1 : c < 6 ? 2 : c < 8 ? 3 : 4;
    }
    const NS = 72;
    const spx = new Float32Array(NS), spy = new Float32Array(NS), spt = new Float32Array(NS).fill(-9);
    let spi = 0;
    const splash = (x, y) => {
      spx[spi] = x; spy[spi] = y; spt[spi] = now;
      spi = (spi + 1) % NS;
    };
    // where water drips from under the ledges
    const ND = 9;
    const drips = [];
    for (let i = 0; i < ND; i++) {
      const top = i < 3 ? 0 : 1;
      drips.push({ x: 90 + hash(i, seed + 50) * (W - 180), y: ROWS[top].base + ROWS[top].ledge, per: 1.6 + 2.6 * hash(i, seed + 51), ph: hash(i, seed + 52) * 9, land: PLINTH });
    }
    function landDrips() {
      for (const d of drips) {
        let y = d.y + 4;
        const gx = d.x >> 1;
        while (y < PLINTH && grid[(y >> 1) * GW + gx] === 0) y += 2;
        d.land = y;
      }
    }

    function drawAir(s) {
      const c = air.ctx;
      air.clear();
      const dt = s.dt;
      const w = s.weather;
      const gust = 1 + 0.3 * Math.sin(now * 0.31) + 0.18 * Math.sin(now * 0.83 + 1.7);
      const wind = w.wind * gust * lat; // mph across the picture
      const I = w.intensity;
      const floor = PLINTH - led[2].d * 0.7;
      if (precip === 2) {
        // ---- snow
        const count = Math.round(lerp(170, NP, clamp(I * 1.15)));
        const fall = 0.75 + 0.6 * I;
        for (let i = 0; i < count; i++) {
          const z = psz[i];
          const kd = pk[i];
          const sp = kd === 0 ? 0.72 : kd === 4 ? 1.28 : 1;
          py[i] += (52 + 92 * z) * fall * sp * dt;
          px[i] += (wind * 7.2 * (0.55 + 0.6 * z) * sp + 16 * Math.sin(now * (0.5 + pph[i]) + pph[i] * 40)) * dt;
          let x = px[i], y = py[i];
          let dead = y > floor;
          if (!dead && kd > 0 && kd < 4 && y > 0 && x >= 0 && x < W && grid[(y >> 1) * GW + (x >> 1)] === kd) dead = true;
          if (dead) {
            py[i] = y = -12 - rnd() * 90;
            px[i] = x = -260 * Math.sign(wind) * clamp(Math.abs(wind) / 20) - 80 + rnd() * (W + 160);
          }
          if (x < -280) px[i] += W + 560;
          else if (x > W + 280) px[i] -= W + 560;
        }
        for (let pass = 0; pass < 3; pass++) {
          c.fillStyle = pal.snow;
          c.globalAlpha = pass === 0 ? 0.62 : pass === 1 ? 1 : 0.94;
          c.beginPath();
          for (let i = 0; i < count; i++) {
            const kd = pk[i];
            if ((pass === 0) !== (kd === 0) || (pass === 2) !== (kd === 4)) continue;
            const x = px[i], y = py[i];
            if (y < -8 || x < -8 || x > W + 8) continue;
            if (kd === 0 && y > 0 && x >= 0 && x < W && grid[(y >> 1) * GW + (x >> 1)] !== 0) continue;
            const r = (1.5 + 3.3 * psz[i]) * (kd === 0 ? 0.72 : kd === 4 ? 1.3 : 1);
            c.moveTo(x + r, y);
            c.arc(x, y, r, 0, TAU);
          }
          c.fill();
        }
        c.globalAlpha = 1;
      } else if (precip === 1) {
        // ---- rain
        const count = Math.round(lerp(90, 560, clamp(I * 1.05)));
        const slow = w.falling === "drizzle" ? 0.55 : 1;
        const vx = wind * 15;
        for (let i = 0; i < count; i++) {
          const z = psz[i];
          const kd = pk[i];
          const vy = (700 + 420 * z) * slow * (kd === 0 ? 0.85 : 1);
          py[i] += vy * dt;
          px[i] += vx * (0.8 + 0.4 * z) * dt;
          let x = px[i], y = py[i];
          let dead = y > floor;
          if (!dead && kd > 0 && kd < 4 && y > 0 && x >= 0 && x < W && grid[(y >> 1) * GW + (x >> 1)] === kd) dead = true;
          if (dead) {
            if (kd > 0 && x > 0 && x < W && (i & 1) === 0) splash(x, Math.min(y, floor));
            py[i] = -20 - rnd() * 260;
            px[i] = -vx * 1.2 - 60 + rnd() * (W + 120);
          }
        }
        c.strokeStyle = pal.rain;
        c.lineCap = "round";
        for (let pass = 0; pass < 3; pass++) {
          c.globalAlpha = pass === 0 ? 0.4 : pass === 1 ? 0.75 : 0.6;
          c.lineWidth = pass === 0 ? 1.5 : pass === 1 ? 2.1 : 2.8;
          c.beginPath();
          for (let i = 0; i < count; i++) {
            const kd = pk[i];
            if ((pass === 0) !== (kd === 0) || (pass === 2) !== (kd === 4)) continue;
            const x = px[i], y = py[i];
            if (y < 0 || x < -20 || x > W + 20) continue;
            if (kd === 0 && x >= 0 && x < W && grid[(y >> 1) * GW + (x >> 1)] !== 0) continue;
            const tau = (0.02 + 0.014 * psz[i]) * (kd === 4 ? 1.25 : 1);
            c.moveTo(x, y);
            c.lineTo(x - vx * (0.8 + 0.4 * psz[i]) * tau, y - (700 + 420 * psz[i]) * slow * tau);
          }
          c.stroke();
        }
        // splashes where drops land on stone
        c.globalAlpha = 0.8;
        c.lineWidth = 1.8;
        c.beginPath();
        for (let i = 0; i < NS; i++) {
          const a = (now - spt[i]) / 0.3;
          if (a < 0 || a >= 1) continue;
          const x = spx[i], y = spy[i];
          const r = 3 + 9 * a;
          const h = 9 * a * (1 - a) * 4 * 0.5;
          c.moveTo(x - r * 0.4, y - 1);
          c.lineTo(x - r, y - 1 - h);
          c.moveTo(x + r * 0.4, y - 1);
          c.lineTo(x + r, y - 1 - h);
        }
        c.stroke();
        // drips from under the ledges
        c.globalAlpha = 0.85;
        c.lineWidth = 3.2;
        c.beginPath();
        for (let i = 0; i < ND; i++) {
          const d = drips[i];
          const per = d.per / (0.35 + I);
          const tt = (now + d.ph) % per;
          const hang = Math.min(1, tt / (per * 0.45));
          const tf = tt - per * 0.45;
          if (tf < 0) {
            c.moveTo(d.x, d.y - 1);
            c.lineTo(d.x, d.y + 1 + 5 * hang);
          } else {
            const y = d.y + 6 + 520 * tf * tf + 40 * tf;
            if (y < d.land) {
              c.moveTo(d.x, y);
              c.lineTo(d.x, y + 9);
            } else if (y < d.land + 60) {
              const a = (y - d.land) / 60;
              c.moveTo(d.x - 3 - 8 * a, d.land - 1 - 5 * a * (1 - a) * 4 * 0.4);
              c.lineTo(d.x - 2, d.land - 1);
              c.moveTo(d.x + 3 + 8 * a, d.land - 1 - 5 * a * (1 - a) * 4 * 0.4);
              c.lineTo(d.x + 2, d.land - 1);
            }
          }
        }
        c.stroke();
        c.globalAlpha = 1;
      } else {
        // ---- dry: dust on the wind, more of it in bad air
        const count = Math.round(clamp(70 + w.aqi * 1.5 + fogK * 60, 60, 330));
        const stream = clamp(Math.abs(wind) / 26);
        for (let i = 0; i < count; i++) {
          const z = psz[i];
          const ph = pph[i];
          const vx = wind * (3.2 + 4.4 * z) + 9 * Math.sin(now * 0.27 + ph * 31);
          const vy = 7 * Math.cos(now * 0.21 + ph * 47) + 3 * Math.sin(now * 0.5 + ph * 13) - 1.5;
          px[i] += vx * dt;
          py[i] += vy * dt;
          if (px[i] < -40) px[i] += W + 80;
          else if (px[i] > W + 40) px[i] -= W + 80;
          if (py[i] < -30) py[i] += PLINTH + 30;
          else if (py[i] > PLINTH) py[i] -= PLINTH + 30;
        }
        c.strokeStyle = pal.mote;
        c.lineCap = "round";
        const nightDim = lerp(1, 0.55, pal.lit);
        for (let pass = 0; pass < 2; pass++) {
          c.globalAlpha = (pass ? 0.9 : 0.5) * nightDim;
          c.lineWidth = pass ? 3.4 : 2.4;
          c.beginPath();
          for (let i = 0; i < count; i++) {
            const front = pk[i] >= 3;
            if (front !== (pass === 1)) continue;
            const x = px[i], y = py[i];
            if (y < 0 || x < 0 || x >= W) continue;
            if (!front && grid[(y >> 1) * GW + (x >> 1)] !== 0) continue;
            const tail = 0.5 + stream * (10 + 22 * psz[i]);
            c.moveTo(x, y);
            c.lineTo(x - Math.sign(wind || 1) * tail, y + 0.01);
          }
          c.stroke();
        }
        c.globalAlpha = 1;
      }
    }

    // ---- per-glyph age and the amounts that follow from it --------------------
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
    // How much snow the day has laid on the date line: hours of snowfall since
    // midnight (from the hourly record), less what a thaw has taken back.
    let dayKey = "";
    let dayEff = 0;
    function daySnow(s) {
      const key = `${s.clock.h24}:${s.pastHours.length}:${s.pastHours[23]?.precip}`;
      if (key === dayKey) return dayEff;
      dayKey = key;
      let e = 0;
      const start = s.ms - s.clock.h24 * 3600000 - s.clock.m * 60000;
      for (const h of s.pastHours) {
        if (h.ms < start - 1800000) continue;
        if (h.kind === "snow") e += 3600 * clamp(Math.sqrt(Math.max(0.004, h.precip) / 0.12), 0.15, 1);
        else if (h.temp > 34) e = Math.max(0, e - 3600 * clamp((h.temp - 34) / 10));
      }
      dayEff = e;
      return e;
    }

    const wetKeyOf = (age) => (age < 90 ? Math.floor(age * 2) : age < 900 ? 180 + Math.floor((age - 90) / 3) : 450 + Math.floor((age - 900) / 20));

    // ---- one frame's bookkeeping ----------------------------------------------
    let lastMs = null;
    let palClock = 0;
    let textShift = null;
    const dirty = [false, false, false];
    const dx0 = [0, 0, 0];
    const dx1 = [W, W, W];
    const mark = (ri, a = 0, b = W) => {
      if (!dirty[ri]) { dirty[ri] = true; dx0[ri] = a; dx1[ri] = b; }
      else { dx0[ri] = Math.min(dx0[ri], a); dx1[ri] = Math.max(dx1[ri], b); }
    };

    function update(s) {
      now = s.t;
      const w = s.weather;
      const first = lastMs === null;
      const step = first ? 0 : s.ms - lastMs;
      const jump = first || Math.abs(step) > 4000;
      const fast = jump || step > 300; // the clock is being run quickly: no transitions
      lastMs = s.ms;

      // weather drivers
      const fall = w.falling;
      const I = w.intensity;
      snowK = fall === "snow" ? clamp(I * 1.0) : 0;
      rainK = fall && fall !== "snow" ? clamp(I) : 0;
      const newPrecip = snowK > 0.004 ? 2 : rainK > 0.004 ? 1 : 0;
      const sn = Math.sin((w.windDir * Math.PI) / 180);
      lat = -(sn >= 0 ? 1 : -1) * (0.4 + 0.6 * Math.abs(sn));
      const cw = Math.round(lat * clamp(w.wind / 32) * 20) / 20;
      fogK = Math.max(w.fog ? 1 : 0, smoothstep(2.5, 0.25, w.visibility));
      let all = jump || newPrecip !== precip;
      if (cw !== capWind) {
        capWind = cw;
        if (newPrecip) all = true;
      }
      precip = newPrecip;

      // palette (a few times a second is plenty)
      palClock -= s.dt;
      if (palClock <= 0 || fast) {
        palClock = 0.3;
        updatePalette(s);
      }

      // what each slot should be showing
      const inHour = ages(s);
      const c = s.clock;
      const want = [c.hh.length > 1 ? c.hh[0] : "", c.hh[c.hh.length - 1], c.mm[0], c.mm[1], c.ampm, `${s.text.weekday.toUpperCase()}|${s.text.monthDay.toUpperCase()}`];
      let changed = false;
      for (let i = 0; i < 6; i++) {
        const sl = slots[i];
        if (sl.str === want[i]) continue;
        changed = true;
        if (!fast && sl.str !== "" || (!fast && want[i] !== "")) {
          // keep a picture of the outgoing numeral, snow and all, to sink into the slot
          sl.hadOld = sl.str !== "";
          if (sl.hadOld) {
            const o = sl.octx;
            o.setTransform(1, 0, 0, 1, 0, 0);
            o.clearRect(0, 0, sl.old.width, sl.old.height);
            o.drawImage(sl.comp, 0, 0);
            if (precip === 2 && sl.D > 0.4) {
              o.setTransform(R, 0, 0, R, 0, 0);
              paintCaps(o, sl, 0, 0, sl.D);
            }
            sl.oldX = sl.x;
          }
          sl.anim = true;
          sl.t0 = now;
        } else sl.anim = false;
        setGlyph(sl, want[i], s);
        sl.wetDrawn = -2;
      }
      if (changed) {
        // lay the rows out again
        let x = MX;
        for (const sl of [S.h1, S.h2]) if (sl.str) { sl.x = x - sl.inkL; x += sl.inkR - sl.inkL + GAP; }
        x = MX;
        for (const sl of [S.m1, S.m2]) { sl.x = x - sl.inkL; x += sl.inkR - sl.inkL + GAP; }
        S.ap.x = W - MX - S.ap.inkR;
        S.date.x = MX - S.date.cls.padX;
        rebuildGrid();
        landDrips();
        for (const sl of slots) {
          if (!sl.plate) continue;
          const cx = sl.str ? Math.round(sl.x + (sl.inkL + sl.inkR) / 2) : -1;
          if (cx !== sl.plateX) {
            sl.plateX = cx;
            sl.plate.style.left = `${cx}px`;
            sl.plate.style.display = cx < 0 ? "none" : "";
          }
        }
        all = true;
      }

      // amounts
      const sweep = inHour < 3 && !fast ? ease.inOut(inHour / 3) : 1; // the ledges are swept on the hour
      const since = sweep < 1 ? lerp(3600, inHour, sweep) : inHour;
      for (const sl of slots) {
        const eff = sl === S.date ? daySnow(s) + snowK * inHour : snowK * sl.age;
        sl.D = precip === 2 ? sl.cls.dmax * (1 - Math.exp(-eff / 600)) : 0;
        sl.wetKey = precip === 1 ? wetKeyOf(sl.age) + Math.round(rainK * 12) * 1000 : -1;
      }
      const cap = (age) => 84 * (1 - Math.exp((-snowK * age) / 600));
      if (precip === 2) {
        led[0].d = led[0].max * (1 - Math.exp(-(daySnow(s) + snowK * inHour) / 2400));
        led[1].d = led[1].max * (1 - Math.exp((-snowK * since) / 900));
        led[2].d = led[2].max * (1 - Math.exp((-snowK * since) / 900));
        const mins = since / 60;
        const hp = led[2].heaps;
        hp[0].x = S.m1.x + (S.m1.inkL + S.m1.inkR) / 2;
        hp[0].s = (S.m1.inkR - S.m1.inkL) * 0.44;
        hp[0].a = Math.min(46, 0.9 * Math.sqrt(8 * Math.floor(mins / 10) * cap(600)));
        hp[1].x = S.m2.x + (S.m2.inkL + S.m2.inkR) / 2;
        hp[1].s = (S.m2.inkR - S.m2.inkL) * 0.44;
        hp[1].a = Math.min(46, 0.9 * Math.sqrt(8 * Math.floor(mins) * cap(60)));
      } else if (precip === 1) {
        led[0].d = 3 * rainK + 1.5;
        led[1].d = led[2].d = (2 + 4.5 * rainK) * (1 - Math.exp((-rainK * since) / 240));
        led[2].heaps[0].a = led[2].heaps[1].a = 0;
      } else {
        led[0].d = led[1].d = led[2].d = 0;
        led[2].heaps[0].a = led[2].heaps[1].a = 0;
      }

      // rebuild what has changed; in real time, at most one glyph a frame
      let budget = fast || all ? 99 : 1;
      for (const sl of slots) {
        const stale = sl.palDrawn !== pal.version || sl.wetDrawn !== sl.wetKey;
        if (stale && budget > 0) {
          budget--;
          buildComp(sl);
          mark(sl.row, sl.x - 2, sl.x + sl.cls.bw + 2);
        }
        if (Math.abs(sl.D - sl.Ddrawn) >= 0.5 && !sl.anim) mark(sl.row, sl.x - 8, sl.x + sl.cls.bw + 8);
        if (sl.anim) {
          if (now - sl.t0 >= T_RISE0 + T_RISE || fast) {
            sl.anim = false;
            mark(sl.row);
          } else mark(sl.row, Math.min(sl.x, sl.hadOld ? sl.oldX : sl.x) - 6, Math.max(sl.x, sl.hadOld ? sl.oldX : sl.x) + sl.cls.bw + 6);
        }
      }
      for (let ri = 0; ri < 3; ri++) {
        if (all || Math.abs(led[ri].d - led[ri].drawn) >= 0.4) mark(ri);
        if (dirty[ri]) {
          paintRow(ri, dx0[ri], dx1[ri]);
          dirty[ri] = false;
        }
      }

      // ---- text
      const tx = s.text;
      put("temp", n.temp, tx.temp);
      const tw = shown.tempW ?? 0;
      if (shown.tempFor !== tx.temp) {
        shown.tempFor = tx.temp;
        shown.tempW = n.temp.offsetWidth;
      }
      const left = MX + (shown.tempW || tw) + 26;
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
      put("sunV", n.sunV, tx.sunValue);
      if (put("moonV", n.moonV, tx.moon)) fitText(n.moonV, colW[1]);
      put("aqiV", n.aqiV, tx.aqi);
      put("uvV", n.uvV, tx.uv);
      const hasFact = tx.factValue !== "";
      put("factL", n.factL, tx.factLabel);
      if (put("factV", n.factV, tx.factValue) && hasFact) {
        n.factV.style.fontSize = "42px";
        if (n.factV.offsetHeight > 104) n.factV.style.fontSize = "37px";
      }
      const shift = hasFact ? 0 : 84;
      if (shift !== textShift) {
        textShift = shift;
        layoutText(shift);
        n.factL.style.display = n.factV.style.display = n.rule2.style.display = hasFact ? "" : "none";
      }
      for (const sl of slots) {
        if (!sl.plate || !sl.str) continue;
        const txt = fmtAge(sl.age, sl === S.ap);
        if (txt !== sl.plateText) {
          sl.plateText = txt;
          sl.plate.textContent = txt;
        }
      }

      // ---- the sky's slow parts
      const storm = fall === "storm" ? 1 : 0;
      let sw = 0;
      if (storm) {
        const per = 23;
        const k = Math.floor(now / per);
        const tt = now - k * per - 4 - 12 * hash(k, seed + 70);
        if (tt > 0 && tt < 4.5) sw = Math.sin((tt / 4.5) * Math.PI) ** 2 * (0.5 + 0.5 * hash(k, seed + 71));
      }
      const swo = (sw * (pal.lit > 0.5 ? 0.1 : 0.28)).toFixed(3);
      css("swell", swell, "opacity", swo);
      const wo = fogK * (pal.lit > 0.5 ? 0.5 : 1);
      for (let i = 0; i < wisps.length; i++) {
        const wv = wisps[i];
        const o = (wo * (0.55 + 0.45 * Math.sin(now * 0.05 * wv.sp + wv.ph * 9))).toFixed(2);
        if (wv.o !== o) { wv.o = o; wv.node.style.opacity = o; }
        if (wo > 0.01) {
          const span = W + wv.w;
          const drift = (wv.ph * span + now * (5 + Math.abs(w.wind) * 1.6) * wv.sp * (lat >= 0 ? 1 : -1)) % span;
          const x = ((drift + span) % span) - wv.w;
          wv.node.style.transform = `translate3d(${x.toFixed(1)}px, ${(wv.y + 26 * Math.sin(now * 0.07 + wv.ph * 20)).toFixed(1)}px, 0)`;
        }
      }

      drawAir(s);
    }

    if (state && state.clock && state.clock.hh) update(state);
    return { frame: update };
  },
};

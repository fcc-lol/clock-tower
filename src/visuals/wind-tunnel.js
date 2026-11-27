// Wind Tunnel
//
// The hour stands in a smoke tunnel, seen from above with north at the top.
// The numerals are solid bodies; ninety smoke filaments are blown past them
// from wherever the real wind is coming from, at the real wind's speed. The
// smoke parts around the digits, speeds up over their shoulders and rolls up
// into vortices behind them. Every other readout is in the tunnel too: each
// line of type is a small streamlined body, so the smoke divides around the
// words and closes again behind them.
//
// How the conditions drive it:
//   wind direction  where the smoke enters (a west wind enters at the left)
//   wind speed      how fast the smoke travels (8 + 5 px/s per mph, capped),
//                   and how hard and how often the digits shed vortices
//   gusts           how strong and irregular the shed vortices are, plus
//                   slow surges in speed: steady air gives tidy, nearly
//                   stationary wakes, gusty air ragged vortex streets
//   calm air        nothing carries the smoke, so it rises from the bottom
//                   edge as slow plumes that curl as they climb
//   rain            beads ride the filaments and gather on windward edges
//   snow            slow bright flecks, and rime that builds on windward edges
//   fog             the filaments swell into thick, soft, low-contrast smoke
//   heat / cold     buoyant, shimmering smoke / hair-thin, laminar filaments
//   storm           violent shedding, a dimmed page, a rare soft brightening
//   daylight, sky   paper and graphite by day (tinted a little by the measured
//                   sky), black with pale light-sheet smoke at night
//
// How it works: when the minute changes, the digits and the text are
// rasterised to a 12 px grid and a stream function is relaxed around them
// (potential flow; each body floats at its own constant; the lee of each
// digit is a porous dead zone). The relaxation is spread over frames. Each
// digit sheds point vortices from alternate flanks (Strouhal-like timing,
// strength from wind and gusts), which are carried by the flow and splatted
// into a velocity grid. Each filament is a chain of particles emitted upwind
// and carried by the sum, plus a little advected noise in the wakes.

import {
  W, H, clamp, lerp, smoothstep, approach, rng, createNoise,
  mix, luminance, el, svg, svgLayer, addStyle, canvas2d, mask, grain, fitText,
} from "../lib/kit.js";

// filaments
const NL = 80; // filaments in the rake
const NN = 88; // particles per filament
const LINE_GAP = 32; // px between filaments
// flow grid (the stage plus a margin, so the flow can spread)
const CELL = 12;
const GX0 = -240;
const GY0 = -240;
const GC = 130;
const GR = 200;
const GN = GC * GR;
const INVH = 1 / CELL;
const CX = W / 2;
const CY = H / 2;
const WAKE_LEN = 420; // px over which a digit's dead zone fades
const KAPPA = 0.012; // how solid that dead zone is
const MAXL = 120; // bodies at most
// turbulence tile (periodic, sampled twice at different drifts)
const TS = 128;
const TM = TS - 1;
const TINV = 1 / 6;
// drawing buckets: alpha levels of the crisp core and of the soft halo
const NA = 8;
const NB = NA + 1;
const NH = 6;
const NBH = NH + 1;
// rain beads / snow flecks, rime, vortices, text bodies
const NP = 560;
const NRIME = 1400;
const NV = 72;
const NCAP = 48;
const PAD = 18; // clear air kept around every line of type

const NIGHT = "#060607";
const PAPER = "#e6e2d9";
const INK = "#111113";

const fontStr = (px) => `800 expanded ${px}px "Archivo", "Arial Black", sans-serif`;

export default {
  title: "Wind Tunnel",
  description: "The hour stands in a smoke tunnel: filaments blow past the numerals from the real wind's bearing at its speed, and roll up into vortices with its gusts.",
  fonts: ["Archivo:wdth,wght@62..125,100..900", "IBM Plex Mono:wght@500"],
  fps: 30,

  mount(root, { state, seed }) {
    const __T = [performance.now()]; // DIAG
    addStyle(root, `
      .wt { position: absolute; inset: 0; overflow: hidden; background: var(--bg); color: var(--ink);
            font-family: "Archivo", "Arial Black", sans-serif; font-kerning: normal; }
      .wt .nums text { font-family: "Archivo", "Arial Black", sans-serif; font-weight: 800; font-stretch: 125%; fill: var(--num); }
      .wt .cap { font-family: "IBM Plex Mono", ui-monospace, monospace; font-weight: 500; font-size: 26px; line-height: 30px;
                 letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; color: var(--cap); }
      .wt .date { position: absolute; left: 64px; top: 60px; font-size: 48px; line-height: 56px; font-weight: 700;
                  font-stretch: 112%; white-space: nowrap; letter-spacing: -0.005em; }
      .wt .hdr { position: absolute; left: 64px; right: 64px; top: 134px; display: flex; align-items: center; gap: 34px; }
      .wt .temp { flex: none; margin-left: -6px; font-size: 156px; line-height: 150px; font-weight: 800; font-stretch: 125%;
                  letter-spacing: -0.03em; white-space: nowrap; }
      .wt .cw { min-width: 0; display: flex; flex-direction: column; gap: 10px; padding-top: 6px; }
      .wt .cond { font-size: 48px; line-height: 56px; font-weight: 500; font-stretch: 100%; white-space: nowrap; }
      .wt .bot { position: absolute; left: 64px; right: 64px; bottom: 64px; display: flex; flex-direction: column; }
      .wt .row { display: grid; grid-template-columns: 476px 1fr; row-gap: 34px; }
      .wt .it .val { margin-top: 8px; font-size: 46px; line-height: 52px; font-weight: 700; font-stretch: 110%; white-space: nowrap; }
      .wt .fact { margin-top: 46px; }
      .wt .fact .fv { margin-top: 10px; font-size: 40px; line-height: 48px; font-weight: 500; font-stretch: 100%; text-wrap: balance; }
    `);

    const wrap = el("div", { class: "wt" });
    const glow = canvas2d(wrap, { adaptive: true, maxScale: 0.5 }); // soft smoke, drawn small and scaled up
    const layer = canvas2d(wrap, { adaptive: true });
    const ctx = layer.ctx;
    const nums = svgLayer(wrap, { class: "nums" });

    const T = {};
    const item = (key) => {
      T[`${key}L`] = el("div", { class: "cap" });
      T[key] = el("div", { class: "val" });
      return el("div", { class: "it" }, T[`${key}L`], T[key]);
    };
    T.date = el("div", { class: "date" });
    T.temp = el("div", { class: "temp" });
    T.cond = el("div", { class: "cond" });
    T.wind = el("div", { class: "cap" });
    const cw = el("div", { class: "cw" }, T.cond, T.wind);
    const hdr = el("div", { class: "hdr" }, T.temp, cw);
    const row = el("div", { class: "row" }, item("sun"), item("moon"), item("aqi"), item("uv"));
    T.factL = el("div", { class: "cap" });
    T.fact = el("div", { class: "fv" });
    const factBox = el("div", { class: "fact" }, T.factL, T.fact);
    const bot = el("div", { class: "bot" }, row, factBox);
    wrap.append(T.date, hdr, bot);
    root.append(wrap);
    grain(wrap, { opacity: 0.07 });
    const capNodes = [T.date, T.temp, T.cond, T.wind, T.sunL, T.sun, T.moonL, T.moon, T.aqiL, T.aqi, T.uvL, T.uv, T.factL, T.fact];

    const shown = {};
    let textDirty = true;
    const put = (key, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      T[key].textContent = value;
      textDirty = true;
      return true;
    };

    // ------------------------------------------------------------------
    // The numerals: measured once, placed glyph by glyph (so the SVG type and
    // the obstacle mask agree exactly), hours left, minutes right, a step down.
    // ------------------------------------------------------------------
    const mctx = document.createElement("canvas").getContext("2d");
    const REF = 400;
    mctx.font = fontStr(REF);
    const metric = {};
    const measure = (str) => {
      const m = mctx.measureText(str);
      return (metric[str] = { l: m.actualBoundingBoxLeft / REF, r: m.actualBoundingBoxRight / REF });
    };
    let digitMax = 0;
    for (const ch of "0123456789") {
      const m = measure(ch);
      digitMax = Math.max(digitMax, m.l + m.r);
    }
    measure("AM");
    measure("PM");
    const capK = mctx.measureText("H").actualBoundingBoxAscent / REF;
    const GAPK = 0.07; // gap between digits, in ems
    const ROW_W = 872; // the widest a row of two digits may be
    const FS = Math.floor(ROW_W / (2 * digitMax + GAPK));
    const CAP = FS * capK;
    const FS2 = Math.round(FS * 0.19);
    const Y_HOURS = 352 + CAP; // baselines
    const Y_MINS = Y_HOURS + CAP * 0.25 + CAP;
    const Y_AMPM = Y_MINS + CAP * 0.17 + FS2 * capK;

    const glyphs = []; // { node, ch, x, y, size }
    for (let i = 0; i < 5; i++) {
      const node = svg("text", { x: 0, y: 0 });
      nums.append(node);
      glyphs.push({ node, ch: "", x: 0, y: 0, size: FS });
    }
    function layoutTime(hh, mm, ampm) {
      const place = (g, ch, x, y, size) => {
        if (g.ch !== ch) g.node.textContent = ch;
        g.ch = ch; g.x = x; g.y = y; g.size = size;
        g.node.setAttribute("x", x.toFixed(2));
        g.node.setAttribute("y", y.toFixed(2));
        g.node.setAttribute("font-size", size);
      };
      const gap = GAPK * FS;
      let x = 64; // hours: ink flush left
      for (let i = 0; i < 2; i++) {
        const ch = hh[i] || "";
        const m = metric[ch];
        if (!m) { place(glyphs[i], "", 0, 0, FS); continue; }
        place(glyphs[i], ch, x + m.l * FS, Y_HOURS, FS);
        x += (m.l + m.r) * FS + gap;
      }
      x = W - 64; // minutes: ink flush right
      for (let i = 1; i >= 0; i--) {
        const m = metric[mm[i]] || metric["0"];
        place(glyphs[2 + i], mm[i] || "", x - m.r * FS, Y_MINS, FS);
        x -= (m.l + m.r) * FS + gap;
      }
      const ma = metric[ampm] || metric.PM;
      place(glyphs[4], ampm, W - 64 - ma.r * FS2, Y_AMPM, FS2);
    }

    // The lines of type, as rectangles in stage units (from the live layout).
    const CAPS = new Float32Array(NCAP * 4);
    let nCap = 0;
    const range = document.createRange();
    function measureCaps() {
      const rr = wrap.getBoundingClientRect();
      const k = rr.width > 0 ? W / rr.width : 1;
      nCap = 0;
      for (const node of capNodes) {
        if (!node.firstChild || !node.textContent) continue;
        range.selectNodeContents(node);
        const rs = range.getClientRects();
        for (let i = 0; i < rs.length && nCap < NCAP; i++) {
          const r = rs[i];
          if (r.width < 1 || r.height < 1) continue;
          const h = r.height * k;
          CAPS[nCap * 4] = (r.left - rr.left) * k;
          CAPS[nCap * 4 + 1] = (r.top - rr.top) * k + h * 0.12;
          CAPS[nCap * 4 + 2] = r.width * k;
          CAPS[nCap * 4 + 3] = h * 0.8;
          nCap++;
        }
      }
    }

    // ------------------------------------------------------------------
    // The flow field
    // ------------------------------------------------------------------
    const lab = new Uint8Array(GN); // body label per cell (0 = air)
    const edge = new Uint8Array(GN); // 1 on the rim of the grid
    const wlab = new Uint8Array(GN); // which body's wake a cell is in
    const open = new Uint8Array(GN); // 1 where air can get to (not a body, not a closed counter)
    const nearBig = new Uint8Array(GN); // 1 on the air just outside a digit
    const sd = new Float32Array(GN); // signed distance to the nearest body surface, px
    const S = new Float32Array(GN); // wake strength, 0..1
    const P = new Float32Array(GN); // dead-zone penalty
    const psi = new Float64Array(GN); // stream function for a unit free stream
    const VX = new Float32Array(GN);
    const VY = new Float32Array(GN);
    const WX = new Float32Array(GN); // velocity induced by the shed vortices, px/s
    const WY = new Float32Array(GN);
    const scratch = new Float32Array(GN);
    const stack = new Int32Array(GN);
    const bodyIdx = new Int32Array(GN);
    const bnd = new Int32Array(GN * 2);
    const bndL = new Uint8Array(GN * 2);
    let nBody = 0, nBnd = 0, nLab = 0;
    const psib = new Float64Array(MAXL + 2), acc = new Float64Array(MAXL + 2), accw = new Float64Array(MAXL + 2);
    const bcx = new Float64Array(MAXL + 2), bcy = new Float64Array(MAXL + 2);
    const big = new Uint8Array(MAXL + 2); // 1 for a digit (sheds vortices), 0 for a line of type
    const bhw = new Float32Array(MAXL + 2), bhl = new Float32Array(MAXL + 2); // half width across the stream, reach downstream
    const shPh = new Float32Array(MAXL + 2), shSide = new Int8Array(MAXL + 2);
    for (let j = 0; j < GR; j++) for (let i = 0; i < GC; i++) edge[j * GC + i] = i === 0 || j === 0 || i === GC - 1 || j === GR - 1 ? 1 : 0;

    let sux = 1, suy = 0; // the free-stream direction the field is solved for
    for (let j = 0; j < GR; j++) for (let i = 0; i < GC; i++) psi[j * GC + i] = sux * (GY0 + (j + 0.5) * CELL - CY) - suy * (GX0 + (i + 0.5) * CELL - CX);

    const toGrid = (c) => { c.scale(INVH, INVH); c.translate(-GX0, -GY0); };
    const drawGlyphs = (c) => {
      toGrid(c);
      c.textBaseline = "alphabetic";
      c.textAlign = "left";
      for (const g of glyphs) {
        if (!g.ch) continue;
        c.font = fontStr(g.size);
        c.fillText(g.ch, g.x, g.y);
      }
    };
    const drawCaps = (c) => {
      toGrid(c);
      c.beginPath();
      for (let i = 0; i < nCap; i++) {
        const x = CAPS[i * 4], y = CAPS[i * 4 + 1], w = CAPS[i * 4 + 2], h = CAPS[i * 4 + 3];
        const hh = h + 2 * PAD;
        c.roundRect(x - PAD, y - PAD, w + 2 * PAD, hh, hh / 2);
      }
      c.fill();
    };

    function buildBodies() {
      const mg = mask(GC, GR, drawGlyphs).data;
      const mc = mask(GC, GR, drawCaps).data;
      const solid = scratch; // reused as a flag here, as a distance below
      for (let c = 0; c < GN; c++) solid[c] = !edge[c] && (mg[c] >= 100 || mc[c] >= 128) ? 1 : 0;
      // carry the old field across, so the new one starts close
      for (let c = 0; c < GN; c++) if (lab[c] && !solid[c]) psi[c] = psib[lab[c]];
      lab.fill(0);
      nLab = 0; nBody = 0; nBnd = 0;
      for (let c0 = 0; c0 < GN; c0++) {
        if (!solid[c0] || lab[c0] || nLab >= MAXL) continue;
        const l = ++nLab;
        let sp = 0, sx = 0, sy = 0, n = 0, sPsi = 0, isBig = 0;
        stack[sp++] = c0;
        lab[c0] = l;
        while (sp) {
          const c = stack[--sp];
          bodyIdx[nBody++] = c;
          sx += c % GC; sy += (c / GC) | 0; sPsi += psi[c]; n++;
          if (mg[c] >= 100) isBig = 1;
          const a = c - 1, b = c + 1, d = c - GC, e = c + GC;
          if (solid[a] && !lab[a]) { lab[a] = l; stack[sp++] = a; }
          if (solid[b] && !lab[b]) { lab[b] = l; stack[sp++] = b; }
          if (solid[d] && !lab[d]) { lab[d] = l; stack[sp++] = d; }
          if (solid[e] && !lab[e]) { lab[e] = l; stack[sp++] = e; }
        }
        bcx[l] = GX0 + (sx / n + 0.5) * CELL;
        bcy[l] = GY0 + (sy / n + 0.5) * CELL;
        big[l] = isBig && n > 60 ? 1 : 0;
        psib[l] = sPsi / n;
      }
      nearBig.fill(0);
      for (let k = 0; k < nBody; k++) {
        const c = bodyIdx[k], l = lab[c];
        if (!lab[c - 1]) { bnd[nBnd] = c - 1; bndL[nBnd++] = l; }
        if (!lab[c + 1]) { bnd[nBnd] = c + 1; bndL[nBnd++] = l; }
        if (!lab[c - GC]) { bnd[nBnd] = c - GC; bndL[nBnd++] = l; }
        if (!lab[c + GC]) { bnd[nBnd] = c + GC; bndL[nBnd++] = l; }
      }
      for (let k = 0; k < nBnd; k++) if (big[bndL[k]]) nearBig[bnd[k]] = 1;
      // air the stream can reach, flooded from a corner (the inside of a 0 is not)
      open.fill(0);
      {
        let sp = 0;
        stack[sp++] = GC + 1;
        open[GC + 1] = 1;
        while (sp) {
          const c = stack[--sp];
          const a = c - 1, b = c + 1, d = c - GC, e = c + GC;
          if (!open[a] && !lab[a] && !edge[a]) { open[a] = 1; stack[sp++] = a; }
          if (!open[b] && !lab[b] && !edge[b]) { open[b] = 1; stack[sp++] = b; }
          if (!open[d] && !lab[d] && !edge[d]) { open[d] = 1; stack[sp++] = d; }
          if (!open[e] && !lab[e] && !edge[e]) { open[e] = 1; stack[sp++] = e; }
        }
        for (let c = 0; c < GN; c++) if (edge[c]) open[c] = 1;
      }
      // signed distance (chamfer, one pass each way, outside and in)
      const BIG = 1e5, D = Math.SQRT2;
      const dOut = sd, dIn = scratch;
      for (let c = 0; c < GN; c++) { dOut[c] = lab[c] ? 0 : BIG; dIn[c] = lab[c] ? BIG : 0; }
      for (let pass = 0; pass < 2; pass++) {
        const f = pass ? dIn : dOut;
        for (let j = 1; j < GR - 1; j++) for (let i = 1; i < GC - 1; i++) {
          const c = j * GC + i;
          const v = f[c];
          if (v === 0) continue;
          f[c] = Math.min(v, f[c - 1] + 1, f[c - GC] + 1, f[c - GC - 1] + D, f[c - GC + 1] + D);
        }
        for (let j = GR - 2; j > 0; j--) for (let i = GC - 2; i > 0; i--) {
          const c = j * GC + i;
          const v = f[c];
          if (v === 0) continue;
          f[c] = Math.min(v, f[c + 1] + 1, f[c + GC] + 1, f[c + GC + 1] + D, f[c + GC - 1] + D);
        }
      }
      for (let c = 0; c < GN; c++) sd[c] = lab[c] ? -(dIn[c] - 0.5) * CELL : Math.min(400, (dOut[c] - 0.5) * CELL);
    }

    // How wide each digit is across the stream and how far it reaches down it.
    function measureBodies() {
      const ux = sux, uy = suy;
      for (let l = 1; l <= nLab; l++) { bhw[l] = 0; bhl[l] = 0; }
      for (let k = 0; k < nBody; k++) {
        const c = bodyIdx[k], l = lab[c];
        if (!big[l]) continue;
        const x = GX0 + ((c % GC) + 0.5) * CELL - bcx[l], y = GY0 + (((c / GC) | 0) + 0.5) * CELL - bcy[l];
        const a = x * ux + y * uy, p = Math.abs(-x * uy + y * ux);
        if (a > bhl[l]) bhl[l] = a;
        if (p > bhw[l]) bhw[l] = p;
      }
    }

    // The lee of every digit, swept downwind: where the wake noise acts and
    // where the dead zone holds the smoke apart. Lines of type block it.
    function buildWake() {
      S.fill(0);
      wlab.fill(0);
      const ax = Math.abs(sux), ay = Math.abs(suy);
      const seedCell = (c) => {
        const l = lab[c];
        if (big[l]) { S[c] = 1; wlab[c] = l; } else { S[c] = 0; wlab[c] = 0; }
      };
      if (ax >= ay) {
        const si = sux > 0 ? 1 : -1, f = ay / ax, sj = (suy > 0 ? 1 : -1) * GC;
        const dec = Math.exp((-CELL * Math.sqrt(1 + f * f)) / WAKE_LEN);
        for (let i = si > 0 ? 1 : GC - 2; i > 0 && i < GC - 1; i += si) for (let j = 1; j < GR - 1; j++) {
          const c = j * GC + i;
          if (lab[c]) { seedCell(c); continue; }
          const a = c - si, b = a - sj;
          const va = S[a] * (1 - f), vb = S[b] * f;
          S[c] = (va + vb) * dec;
          wlab[c] = va >= vb ? wlab[a] : wlab[b];
        }
      } else {
        const sj = suy > 0 ? 1 : -1, f = ax / ay, si = sux > 0 ? 1 : -1;
        const dec = Math.exp((-CELL * Math.sqrt(1 + f * f)) / WAKE_LEN);
        for (let j = sj > 0 ? 1 : GR - 2; j > 0 && j < GR - 1; j += sj) for (let i = 1; i < GC - 1; i++) {
          const c = j * GC + i;
          if (lab[c]) { seedCell(c); continue; }
          const a = c - sj * GC, b = a - si;
          const va = S[a] * (1 - f), vb = S[b] * f;
          S[c] = (va + vb) * dec;
          wlab[c] = va >= vb ? wlab[a] : wlab[b];
        }
      }
      for (let c = 0; c < GN; c++) {
        const s = S[c];
        P[c] = lab[c] || s < 0.04 || !wlab[c] ? 0 : KAPPA * s * s;
      }
    }

    // Successive over-relaxation of Laplace's equation for the stream function.
    // Each body floats at its own constant (no circulation), and the dead zone
    // pulls the air behind a digit toward that digit's constant.
    function relax(sweeps, om) {
      for (let it = 0; it < sweeps; it++) {
        for (let k = 0; k < nBody; k++) { const c = bodyIdx[k]; psi[c] = psib[lab[c]]; }
        for (let l = 1; l <= nLab; l++) { acc[l] = 0; accw[l] = 0; }
        for (let j = 1; j < GR - 1; j++) {
          for (let c = j * GC + 1, e = j * GC + GC - 1; c < e; c++) {
            if (lab[c]) continue;
            const p = P[c];
            const sum = psi[c - 1] + psi[c + 1] + psi[c - GC] + psi[c + GC];
            if (p > 0) {
              const l = wlab[c];
              const v = psi[c] + om * ((sum + p * psib[l]) / (4 + p) - psi[c]);
              psi[c] = v;
              acc[l] += p * v; accw[l] += p;
            } else psi[c] += om * (sum * 0.25 - psi[c]);
          }
        }
        for (let k = 0; k < nBnd; k++) { const l = bndL[k]; acc[l] += psi[bnd[k]]; accw[l] += 1; }
        for (let l = 1; l <= nLab; l++) if (accw[l] > 0) psib[l] = acc[l] / accw[l];
      }
      for (let k = 0; k < nBody; k++) { const c = bodyIdx[k]; psi[c] = psib[lab[c]]; }
      const k2 = 1 / (2 * CELL);
      for (let j = 1; j < GR - 1; j++) for (let c = j * GC + 1, e = j * GC + GC - 1; c < e; c++) {
        if (lab[c]) { VX[c] = 0; VY[c] = 0; continue; }
        let vx = (psi[c + GC] - psi[c - GC]) * k2;
        let vy = -(psi[c + 1] - psi[c - 1]) * k2;
        if (!(vx === vx) || !(vy === vy)) { vx = sux; vy = suy; } // never let a bad cell through
        VX[c] = vx; VY[c] = vy;
      }
      for (let c = 0; c < GN; c++) if (edge[c]) { VX[c] = sux; VY[c] = suy; }
    }

    // Turn the free stream: the far field turns exactly, the rest is relaxed.
    function turnStream(nux, nuy) {
      const dux = nux - sux, duy = nuy - suy;
      for (let j = 0; j < GR; j++) {
        const y = GY0 + (j + 0.5) * CELL - CY;
        for (let i = 0; i < GC; i++) psi[j * GC + i] += dux * y - duy * (GX0 + (i + 0.5) * CELL - CX);
      }
      for (let l = 1; l <= nLab; l++) psib[l] += dux * (bcy[l] - CY) - duy * (bcx[l] - CX);
      sux = nux; suy = nuy;
    }

    // ------------------------------------------------------------------
    // Fine turbulence: one periodic tile of a random stream function's
    // gradient, read twice at different drifts so the eddies evolve.
    // ------------------------------------------------------------------
    const TGX = new Float32Array(TS * TS);
    const TGY = new Float32Array(TS * TS);
    {
      const r = rng(seed + 11);
      const cx = new Float32Array(TS), sx = new Float32Array(TS), cy = new Float32Array(TS), sy = new Float32Array(TS);
      for (let kx = -5; kx <= 5; kx++) for (let ky = 0; ky <= 5; ky++) {
        const kk = Math.hypot(kx, ky);
        if (kk < 2 || kk > 5.4 || (ky === 0 && kx <= 0)) continue;
        const a = r.range(0.6, 1) / Math.pow(kk, 1.3), ph = r() * Math.PI * 2;
        for (let i = 0; i < TS; i++) {
          const ax = (2 * Math.PI * kx * i) / TS + ph, ay = (2 * Math.PI * ky * i) / TS;
          cx[i] = Math.cos(ax); sx[i] = Math.sin(ax); cy[i] = Math.cos(ay); sy[i] = Math.sin(ay);
        }
        for (let j = 0; j < TS; j++) for (let i = 0; i < TS; i++) {
          const s = sx[i] * cy[j] + cx[i] * sy[j];
          TGX[j * TS + i] -= a * kx * s;
          TGY[j * TS + i] -= a * ky * s;
        }
      }
      let e = 0;
      for (let i = 0; i < TS * TS; i++) e += TGX[i] * TGX[i] + TGY[i] * TGY[i];
      const k = 1 / Math.sqrt(e / (TS * TS));
      for (let i = 0; i < TS * TS; i++) { TGX[i] *= k; TGY[i] *= k; }
    }
    let oAx = 0, oAy = 0, oBx = 0, oBy = 0;
    let tx = 0, ty = 0; // the tile, read smoothly at (u, v) texels
    function tileAt(u, v) {
      const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
      const i0 = iu & TM, i1 = (iu + 1) & TM, j0 = (iv & TM) * TS, j1 = ((iv + 1) & TM) * TS;
      const a = j0 + i0, b = j0 + i1, c = j1 + i0, d = j1 + i1;
      const w00 = (1 - fu) * (1 - fv), w10 = fu * (1 - fv), w01 = (1 - fu) * fv, w11 = fu * fv;
      tx = TGX[a] * w00 + TGX[b] * w10 + TGX[c] * w01 + TGX[d] * w11;
      ty = TGY[a] * w00 + TGY[b] * w10 + TGY[c] * w01 + TGY[d] * w11;
    }

    // ------------------------------------------------------------------
    // The conditions, reduced to what the tunnel needs
    // ------------------------------------------------------------------
    const noise = createNoise(seed);
    const q = {
      ux: 1, uy: 0, U: 40, vmax2: 1e4,
      wake: 10, amb0: 0, amb1: 0, nsc: 1, shed: 0, gusty: 0, surge: 0,
      calm: 0, fog: 0, cold: 0, heat: 0, storm: 0, cloud: 0,
      rain: 0, snow: 0, flash: 0,
      rup: 700, rperp: 1000, spacing: 24, lineK: 1,
    };
    const ez = { fog: 0, storm: 0, rain: 0, snow: 0 };
    function readConditions(s, snap) {
      const w = s.weather;
      const live = w.live;
      const mph = live ? w.wind : 0;
      const gust = live ? Math.max(w.gust, mph) : 0;
      const surge = Math.pow(0.5 + 0.5 * noise.n2(s.t * 0.045, 9.1), 2); // slow gust surges, 0..1
      const gf = mph > 0.5 ? clamp(gust / mph, 1, 2.6) : 1;
      const gusty = clamp((gf - 1) / 1.3);
      const eff = mph + (gust - mph) * surge * 0.6;
      const hl = snap ? 1e-4 : 2;
      ez.fog = approach(ez.fog, w.fog || w.kind === "fog" ? 1 : 0, s.dt, hl);
      ez.storm = approach(ez.storm, w.kind === "storm" ? 1 : 0, s.dt, hl);
      const wet = w.falling === "rain" || w.falling === "drizzle" || w.falling === "storm" || w.falling === "freezing";
      ez.rain = approach(ez.rain, wet ? (w.falling === "drizzle" ? 0.5 : 1) * w.intensity : 0, s.dt, hl);
      ez.snow = approach(ez.snow, w.falling === "snow" ? w.intensity : 0, s.dt, hl);
      q.fog = ez.fog; q.storm = ez.storm; q.rain = ez.rain; q.snow = ez.snow;
      q.calm = 1 - smoothstep(1.5, 4, mph);
      q.heat = smoothstep(80, 97, w.temp);
      q.cold = 1 - smoothstep(12, 36, w.temp);
      q.cloud = w.cloud / 100;
      q.gusty = gusty;
      q.surge = surge;
      const a = (w.windDir * Math.PI) / 180;
      const uw = Math.min(160, 8 + 5 * eff) * (1 - q.calm);
      const vx = -Math.sin(a) * uw;
      const vy = Math.cos(a) * uw - (13 * q.calm + 9 * q.heat); // warm, still air rises
      const vl = Math.hypot(vx, vy) || 1;
      q.U = Math.max(6, vl);
      q.ux = vx / vl;
      q.uy = vy / vl;
      q.vmax2 = (3 * q.U + 24) * (3 * q.U + 24);
      // how hard the digits shed: the wind itself, then the gusts, then a storm
      const windy = smoothstep(2, 9, mph);
      q.shed = clamp((0.22 + 0.8 * gusty + 0.25 * surge * gusty) * windy * (1 - 0.55 * q.cold * (1 - gusty)) + 0.3 * q.storm, 0, 1.25) * (1 - q.calm);
      q.wake = q.U * (0.06 + 0.2 * gusty * windy + 0.2 * q.storm);
      q.amb0 = q.U * (0.012 * gusty + 0.08 * q.heat) + 1.2 * q.calm;
      q.amb1 = 15 * q.calm + q.U * 0.1 * q.heat;
      q.nsc = lerp(1, 0.62, q.storm);
      q.rup = Math.abs(q.ux) * CX + Math.abs(q.uy) * CY + 150;
      q.rperp = Math.abs(q.ux) * CY + Math.abs(q.uy) * CX + 90;
      q.spacing = (q.rup * 2.08) / NN;
      q.lineK = lerp(1.06, 0.84, q.cold) * lerp(1, 1.3, q.fog);
      // a soft, rare brightening in a thunderstorm
      const slot = Math.floor(s.t / 7), ph = s.t / 7 - slot;
      const due = q.storm > 0.5 && noise.n2(slot * 3.3, 5.5) > 0.42;
      q.flash = due ? Math.pow(Math.sin(Math.PI * clamp(ph * 2.4)), 2) : 0;
    }

    // ------------------------------------------------------------------
    // Sampling the flow at a point. Results in f*.
    // ------------------------------------------------------------------
    let fvx = 0, fvy = 0, fsd = 400, fc = -1, famp = 0;
    function flowAt(x, y, amb) {
      const gx = (x - GX0) * INVH - 0.5, gy = (y - GY0) * INVH - 0.5;
      let vx, vy, s;
      if (gx >= 0 && gy >= 0 && gx < GC - 1 && gy < GR - 1) {
        const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, c = j * GC + i;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        vx = (VX[c] * w00 + VX[c + 1] * w10 + VX[c + GC] * w01 + VX[c + GC + 1] * w11) * q.U
           + WX[c] * w00 + WX[c + 1] * w10 + WX[c + GC] * w01 + WX[c + GC + 1] * w11;
        vy = (VY[c] * w00 + VY[c + 1] * w10 + VY[c + GC] * w01 + VY[c + GC + 1] * w11) * q.U
           + WY[c] * w00 + WY[c + 1] * w10 + WY[c + GC] * w01 + WY[c + GC + 1] * w11;
        s = S[c] * w00 + S[c + 1] * w10 + S[c + GC] * w01 + S[c + GC + 1] * w11;
        fc = c + (fx >= 0.5 ? 1 : 0) + (fy >= 0.5 ? GC : 0);
        fsd = sd[fc];
      } else {
        vx = sux * q.U; vy = suy * q.U; s = 0; fc = -1; fsd = 400;
      }
      let amp = q.wake * s + amb;
      if (amp > 0.05) {
        if (fsd < 26) amp *= fsd < 2 ? 0 : (fsd - 2) / 24; // eddies die at a wall
        const n = q.nsc;
        tileAt((x * n - oAx) * TINV, (y * n - oAy) * TINV);
        let nx = ty, ny = -tx;
        tileAt((y * n - oBx) * TINV, (-x * n - oBy) * TINV);
        nx += tx; ny += ty;
        vx += nx * amp * 0.72; vy += ny * amp * 0.72;
      } else amp = 0;
      const v2 = vx * vx + vy * vy;
      if (v2 > q.vmax2) { const k = Math.sqrt(q.vmax2 / v2); vx *= k; vy *= k; }
      fvx = vx; fvy = vy; famp = amp;
    }

    // ------------------------------------------------------------------
    // Vortices shed from alternate flanks of each digit
    // ------------------------------------------------------------------
    const VPX = new Float32Array(NV), VPY = new Float32Array(NV), VA = new Float32Array(NV), VR = new Float32Array(NV);
    let nV = 0;
    const vr = rng(seed + 41);
    function shedFrom(l, t) {
      const ux = sux, uy = suy, px = -uy, py = ux;
      const hw = bhw[l], side = (shSide[l] = shSide[l] > 0 ? -1 : 1);
      const rc = clamp(0.3 * hw, 30, 66);
      const x = bcx[l] + ux * (bhl[l] + 0.2 * hw) + px * side * 0.52 * hw;
      const y = bcy[l] + uy * (bhl[l] + 0.2 * hw) + py * side * 0.52 * hw;
      const gx = ((x - GX0) * INVH) | 0, gy = ((y - GY0) * INVH) | 0;
      if (gx < 1 || gy < 1 || gx >= GC - 1 || gy >= GR - 1) return;
      if (sd[gy * GC + gx] < rc * 0.3) return; // no room: another body is in the way
      const irregular = 0.6 + 0.8 * (0.5 + 0.5 * noise.n2(t * 0.11, l * 3.7));
      const a = -side * q.shed * q.U * irregular;
      if (Math.abs(a) < 1.5) return;
      let k = nV;
      if (nV < NV) nV++;
      else { // replace the weakest
        k = 0;
        for (let i = 1; i < NV; i++) if (Math.abs(VA[i]) < Math.abs(VA[k])) k = i;
      }
      VPX[k] = x; VPY[k] = y; VA[k] = a; VR[k] = rc;
    }
    function stepVortices(dt, t, splat) {
      // shedding
      for (let l = 1; l <= nLab; l++) {
        if (!big[l] || bhw[l] < 10) continue;
        const f = clamp((0.42 * q.U) / (2 * bhw[l]), 1 / 18, 1 / 5) * (0.85 + 0.3 * (0.5 + 0.5 * noise.n2(t * 0.07, l * 1.9)));
        shPh[l] += dt * f * 2;
        if (shPh[l] >= 1) { shPh[l] -= 1; if (q.shed > 0.02) shedFrom(l, t); }
      }
      // carried by the flow (and by each other), fading and spreading
      const fadeK = Math.exp(-dt / lerp(9, 6, q.storm)), grow = 1 + 0.05 * dt;
      for (let i = 0; i < nV; i++) {
        flowAt(VPX[i], VPY[i], 0);
        VPX[i] += fvx * 0.78 * dt; VPY[i] += fvy * 0.78 * dt;
        VA[i] *= fadeK;
        VR[i] = Math.min(110, VR[i] * grow);
        const x = VPX[i], y = VPY[i];
        if (Math.abs(VA[i]) < 1 || fsd < 0 || !(x > -200 && x < W + 200 && y > -200 && y < H + 200)) {
          nV--;
          VPX[i] = VPX[nV]; VPY[i] = VPY[nV]; VA[i] = VA[nV]; VR[i] = VR[nV];
          i--;
        }
      }
      if (!splat) return;
      WX.fill(0);
      WY.fill(0);
      for (let v = 0; v < nV; v++) {
        const x0 = VPX[v], y0 = VPY[v], rc = VR[v], a = VA[v] * 1.567;
        const R = rc * 3, R2 = R * R, irc2 = 1 / (rc * rc), iR2 = 1 / R2;
        const i0 = Math.max(1, Math.floor((x0 - R - GX0) * INVH)), i1 = Math.min(GC - 2, Math.ceil((x0 + R - GX0) * INVH));
        const j0 = Math.max(1, Math.floor((y0 - R - GY0) * INVH)), j1 = Math.min(GR - 2, Math.ceil((y0 + R - GY0) * INVH));
        for (let j = j0; j <= j1; j++) {
          const ry = GY0 + (j + 0.5) * CELL - y0;
          for (let i = i0; i <= i1; i++) {
            const rx = GX0 + (i + 0.5) * CELL - x0;
            const r2 = rx * rx + ry * ry;
            if (r2 >= R2 || r2 < 1) continue;
            const c = j * GC + i, d = sd[c];
            if (d <= 0) continue;
            const t1 = 1 - r2 * iR2;
            // Lamb-Oseen profile (peak speed |a| at 1.12 rc), tapered to 0 at 3 rc, quiet at walls
            const k = ((a * rc * (1 - Math.exp(-r2 * irc2))) / r2) * t1 * t1 * (d < 36 ? d / 36 : 1);
            WX[c] -= ry * k;
            WY[c] += rx * k;
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // The smoke: NL chains of NN particles, newest at `head`.
    // ------------------------------------------------------------------
    const X = new Float32Array(NL * NN), Y = new Float32Array(NL * NN);
    const DN = new Float32Array(NL * NN); // how much smoke was let out when this particle left the nozzle
    const MX = new Float32Array(NL * NN); // how far turbulence has stirred it into haze, 0..1
    const BK = new Uint8Array(NL * NN); // drawing bucket of the core of the line at this particle
    const BH = new Uint8Array(NL * NN); // and of its halo
    const cnt = new Int32Array(NB), cntH = new Int32Array(NBH);
    const off = new Float32Array(NL), lineW = new Float32Array(NL), drop = new Float32Array(NL);
    const act = new Uint8Array(NL);
    {
      const r = rng(seed + 3);
      for (let i = 0; i < NL; i++) {
        off[i] = (i - (NL - 1) / 2 + r.range(-0.22, 0.22)) * LINE_GAP;
        lineW[i] = r() < 0.2 ? r.range(0.35, 0.55) : r.range(0.7, 1);
        drop[i] = r() < 0.56 ? 1 : 0; // filaments shut off when the air is still
      }
    }
    let head = 0, emitAcc = 0, emitCount = 1000;
    const density = (i, n) => 0.45 + 0.55 * smoothstep(-0.6, 0.6, noise.n2(n * 0.07, i * 7.31));
    const MIX_RATE = 0.26;
    const nozX = (i) => CX - q.ux * q.rup - q.uy * off[i] * q.lineK;
    const nozY = (i) => CY - q.uy * q.rup + q.ux * off[i] * q.lineK;
    const inPlay = (i) => (Math.abs(off[i] * q.lineK) < q.rperp ? 1 : 0);

    // Lay one filament down along the flow as it stands (at the start, on a
    // jump of the clock, and when a filament comes into play).
    function trace(i) {
      let x = nozX(i), y = nozY(i), m = 0;
      const base = i * NN;
      for (let a = 0; a < NN; a++) {
        let k = head + a; if (k >= NN) k -= NN;
        const af = a / NN;
        const dt = (a === 0 ? emitAcc : q.spacing) / q.U / 2;
        for (let sub = 0; sub < 2; sub++) {
          flowAt(x, y, q.amb0 + q.amb1 * af * af);
          x += fvx * dt; y += fvy * dt;
          if (fsd < 2 && fc >= 0) { const g = pushOut(fc, fsd); x += gpx * g; y += gpy * g; }
          m += (famp / (q.U + 12)) * MIX_RATE * dt;
        }
        X[base + k] = x; Y[base + k] = y;
        MX[base + k] = m > 1 ? 1 : m;
        DN[base + k] = density(i, emitCount - a);
      }
    }
    // the way out of a wall at cell c: unit normal in gpx, gpy; returns how far to step
    let gpx = 0, gpy = 0;
    function pushOut(c, d) {
      const gx = sd[c + 1] - sd[c - 1], gy = sd[c + GC] - sd[c - GC];
      const gl = Math.hypot(gx, gy) || 1;
      gpx = gx / gl; gpy = gy / gl;
      return Math.min(5, (2 - d) * 0.4);
    }

    // ------------------------------------------------------------------
    // Rain beads, snow flecks, rime
    // ------------------------------------------------------------------
    const PX = new Float32Array(NP), PY = new Float32Array(NP), PVX = new Float32Array(NP), PVY = new Float32Array(NP);
    const PT = new Float32Array(NP); // > 0: sitting on an edge for this long; < 0: just let go, cannot stick yet
    const PH = new Float32Array(NP);
    const RX = new Float32Array(NRIME), RY = new Float32Array(NRIME);
    let nRime = 0, rimeAt = 0;
    const pr = rng(seed + 29);
    for (let i = 0; i < NP; i++) PH[i] = pr();
    function spawn(i, anywhere) {
      const li = (pr() * NL) | 0;
      const o = off[li] * q.lineK + pr.range(-10, 10);
      const along = anywhere ? pr.range(-q.rup, q.rup) : -q.rup + pr.range(0, 70);
      PX[i] = CX + q.ux * along - q.uy * o;
      PY[i] = CY + q.uy * along + q.ux * o;
      PVX[i] = q.ux * q.U; PVY[i] = q.uy * q.U;
      PT[i] = 0;
    }
    for (let i = 0; i < NP; i++) spawn(i, true);
    const addRime = (x, y) => {
      RX[rimeAt] = x; RY[rimeAt] = y;
      rimeAt = (rimeAt + 1) % NRIME;
      if (nRime < NRIME) nRime++;
    };
    function pruneRime() {
      let n = 0;
      for (let i = 0; i < nRime; i++) {
        const gx = ((RX[i] - GX0) * INVH) | 0, gy = ((RY[i] - GY0) * INVH) | 0;
        const c = gy * GC + gx;
        const ok = gx > 0 && gy > 0 && gx < GC - 1 && gy < GR - 1 && sd[c] > -8 && sd[c] < 16 && (nearBig[c] || (lab[c] && big[lab[c]]));
        if (ok) { RX[n] = RX[i]; RY[n] = RY[i]; n++; }
      }
      nRime = n; rimeAt = n % NRIME;
    }
    function seedRime(count) {
      let tries = count * 12;
      while (count > 0 && tries-- > 0 && nBnd > 0) {
        const k = (pr() * nBnd) | 0, c = bnd[k];
        if (!big[bndL[k]]) continue;
        const gx = sd[c + 1] - sd[c - 1], gy = sd[c + GC] - sd[c - GC];
        const gl = Math.hypot(gx, gy) || 1;
        if ((gx * q.ux + gy * q.uy) / gl > -0.3) continue; // windward faces only
        addRime(GX0 + ((c % GC) + 0.5) * CELL + pr.range(-6, 6), GY0 + (((c / GC) | 0) + 0.5) * CELL + pr.range(-6, 6));
        count--;
      }
    }
    let nPart = 0, partSnow = 0;

    function stepParticles(dt) {
      const snow = q.snow > q.rain;
      const amount = snow ? q.snow : q.rain;
      nPart = amount > 0.01 ? Math.min(NP, Math.round(snow ? 170 + 390 * amount : 120 + 440 * amount)) : 0;
      partSnow = snow ? 1 : 0;
      const tau = snow ? 0.9 : 0.3, gain = snow ? 0.55 : 1.12, stickAt = snow ? 6 : 5;
      const k = Math.min(1, dt / tau);
      const lim = q.rup + 40;
      for (let i = 0; i < nPart; i++) {
        if (PT[i] > 0) { // a drop sitting on an edge
          PT[i] -= dt;
          if (PT[i] <= 0) { PT[i] = -2.5; PVX[i] = 0; PVY[i] = 0; }
          continue;
        }
        if (PT[i] < 0) PT[i] = Math.min(0, PT[i] + dt);
        let x = PX[i], y = PY[i];
        flowAt(x, y, snow ? 7 + q.U * 0.08 : 0);
        PVX[i] += (fvx * gain - PVX[i]) * k;
        PVY[i] += (fvy * gain - PVY[i]) * k;
        x += PVX[i] * dt; y += PVY[i] * dt;
        if (fc >= 0 && fsd < stickAt) {
          const gx = sd[fc + 1] - sd[fc - 1], gy = sd[fc + GC] - sd[fc - GC];
          const gl = Math.hypot(gx, gy) || 1, nx = gx / gl, ny = gy / gl;
          const vn = PVX[i] * nx + PVY[i] * ny;
          if (vn < 0 && PT[i] === 0 && fsd > -4 && nearBig[fc]) {
            if (snow) { addRime(x, y); spawn(i, false); continue; }
            PT[i] = 3 + 9 * PH[i];
          } else {
            const push = (stickAt - fsd) * 0.5; // slide along the wall
            x += nx * push; y += ny * push;
            if (vn < 0) { PVX[i] -= vn * nx; PVY[i] -= vn * ny; }
          }
        }
        if (fc >= 0 && !open[fc]) { spawn(i, false); continue; } // never inside a counter
        PX[i] = x; PY[i] = y;
        const along = (x - CX) * q.ux + (y - CY) * q.uy;
        if (!(along < lim && along > -lim - 80 && x > -160 && x < W + 160 && y > -160 && y < H + 160)) spawn(i, false);
      }
    }

    // ------------------------------------------------------------------
    // One step of the smoke
    // ------------------------------------------------------------------
    function step(dt) {
      const vx0 = q.ux * q.U * q.nsc * dt, vy0 = q.uy * q.U * q.nsc * dt;
      oAx += vx0 * 0.5; oAy += vy0 * 0.5;
      oBx += vy0 * 0.86; oBy -= vx0 * 0.86;
      for (let i = 0; i < NL; i++) {
        const on = inPlay(i);
        if (on && !act[i]) trace(i);
        act[i] = on;
      }
      emitAcc += q.U * dt;
      while (emitAcc >= q.spacing) {
        emitAcc -= q.spacing;
        head = head ? head - 1 : NN - 1;
        emitCount++;
        for (let i = 0; i < NL; i++) {
          if (!act[i]) continue;
          const n = i * NN + head;
          X[n] = nozX(i); Y[n] = nozY(i);
          MX[n] = 0;
          DN[n] = density(i, emitCount);
        }
      }
      cnt.fill(0);
      cntH.fill(0);
      const invSp = 1 / q.spacing, invN = 1 / NN;
      const fade = 0.55 * q.calm; // still air: the plumes thin out as they rise
      const haze = 0.82 * q.fog; // fog: mostly haze
      const mixK = (MIX_RATE * dt) / (q.U + 12);
      for (let i = 0; i < NL; i++) {
        if (!act[i]) continue;
        const base = i * NN;
        const lw = lineW[i] * (1 - q.calm * drop[i]);
        let px = 0, py = 0;
        for (let a = 0; a < NN; a++) {
          let k = head + a; if (k >= NN) k -= NN;
          const n = base + k, af = a * invN;
          let x = X[n], y = Y[n];
          flowAt(x, y, q.amb0 + q.amb1 * af * af);
          x += fvx * dt; y += fvy * dt;
          if (fsd < 2 && fc >= 0) { const g = pushOut(fc, fsd); x += gpx * g; y += gpy * g; } // never into a body
          if (!(x > -2000 && x < 3000 && y > -2000 && y < 4000)) { x = nozX(i); y = nozY(i); } // never lose a particle
          X[n] = x; Y[n] = y;
          let m = MX[n] + famp * mixK;
          if (m > 1) m = 1;
          MX[n] = m;
          let b = 0, bh = 0;
          if (a > 0 && lw > 0.02 && x > -60 && x < W + 60 && y > -60 && y < H + 60 && (fc < 0 || open[fc])) {
            const dx = x - px, dy = y - py;
            const st = Math.sqrt(dx * dx + dy * dy) * invSp; // how far this piece has been pulled out
            if (st < 4.2) {
              let al = lw * DN[n];
              if (fade > 0) al *= 1 - fade * af * af;
              if (af > 0.8) al *= (1 - af) * 5; // the tail thins away
              if (st > 1.4) al *= (1.4 / st) * (1.4 / st); // stretched smoke thins
              else if (st < 0.3) al *= st / 0.3; // bunched up against a wall
              const cm = 1 - (m > haze ? m : haze);
              let lv = (al * cm * cm * NA + 0.5) | 0;
              b = lv > NA ? NA : lv;
              lv = (al * (0.55 + 0.45 * m) * NH + 0.5) | 0;
              bh = lv > NH ? NH : lv;
            }
          }
          BK[n] = b; cnt[b]++;
          BH[n] = bh; cntH[bh]++;
          px = x; py = y;
        }
      }
      if (q.rain > 0.01 || q.snow > 0.01) stepParticles(dt);
      else nPart = 0;
    }

    // ------------------------------------------------------------------
    // Colour
    // ------------------------------------------------------------------
    const col = { bg: "", num: "", ink: "", cap: "", smoke: INK, master: 0.6, light: 0, flip: -1, speck: "#fff" };
    function readColour(s, snap) {
      const dl = s.daylight;
      let paper = mix(PAPER, "#8f9296", clamp(0.28 * q.cloud + 0.3 * q.rain + 0.34 * q.snow + 0.16 * q.fog));
      paper = mix(paper, s.sky.mean, 0.12 + 0.1 * (1 - dl));
      const night = mix(NIGHT, s.sky.mean, 0.05);
      // the ground moves continuously, but spends as little of twilight as it can in mid-grey
      const g = smoothstep(0.16, 0.66, dl);
      const bg = mix(night, paper, g * (1 - 0.42 * q.storm));
      const lum = luminance(bg);
      const light = lum < 0.2 ? 1 : 0; // pale ink on a dark ground
      if (snap || col.flip < 0) col.flip = light;
      else col.flip = approach(col.flip, light, s.dt * 12, 0.25);
      const f = col.flip;
      const lift = smoothstep(0.02, 0.17, lum); // pale ink has to be brighter on a grey ground than on black
      const numLight = mix("#a49e93", "#f1ede4", lift);
      const inkLight = mix("#d2cdc2", "#f6f3ec", lift);
      const numDark = mix(INK, bg, 0.12 * q.fog);
      col.num = f <= 0 ? numDark : f >= 1 ? numLight : mix(numDark, numLight, f);
      col.ink = f <= 0 ? INK : f >= 1 ? inkLight : mix(INK, inkLight, f);
      col.cap = mix(col.ink, bg, 0.16);
      col.smoke = f < 0.5 ? "#1b1b1f" : "#efeadf";
      col.light = f;
      // how strongly the smoke is drawn
      const moon = s.moon.up ? s.moon.illumination : 0;
      const day = lerp(0.8, 0.7, q.cloud);
      const dark = 0.84 + 0.16 * moon;
      col.master = (f < 0.5 ? day : lerp(0.86, dark, 1 - lift)) * Math.abs(f * 2 - 1) * lerp(1, 0.55, q.fog) * (1 + 0.4 * q.flash);
      col.speck = f < 0.5 ? "#141417" : "#f8f5ee";
      if (bg !== col.bg) { col.bg = bg; wrap.style.setProperty("--bg", bg); }
      if (shown.num !== col.num) { shown.num = col.num; wrap.style.setProperty("--num", col.num); }
      if (shown.ink !== col.ink) { shown.ink = col.ink; wrap.style.setProperty("--ink", col.ink); wrap.style.setProperty("--cap", col.cap); }
    }

    // ------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------
    // One pass per bucket: every piece of filament in it as a smoothed run.
    function strokeBucket(c, bk, b) {
      c.beginPath();
      for (let i = 0; i < NL; i++) {
        if (!act[i]) continue;
        const base = i * NN;
        let pen = false;
        let kp = head, k = head + 1; if (k >= NN) k -= NN;
        for (let a = 1; a < NN - 1; a++) {
          let kn = k + 1; if (kn >= NN) kn -= NN;
          const n = base + k;
          if (bk[n] === b) {
            const x = X[n], y = Y[n];
            if (!pen) { c.moveTo((X[base + kp] + x) * 0.5, (Y[base + kp] + y) * 0.5); pen = true; }
            c.quadraticCurveTo(x, y, (x + X[base + kn]) * 0.5, (y + Y[base + kn]) * 0.5);
          } else pen = false;
          kp = k; k = kn;
        }
      }
      c.stroke();
    }

    function draw() {
      const night = col.light >= 0.5;
      const wBase = lerp(lerp(night ? 1.9 : 2.2, 1.35, q.cold), 2.8, 0.45 * q.cloud * (1 - q.cold) + 0.3 * q.heat);
      const g = glow.ctx;
      glow.clear();
      g.lineJoin = "round";
      g.lineCap = "butt";
      g.strokeStyle = col.smoke;
      g.lineWidth = wBase * lerp(night ? 4.4 : 3.6, 13, q.fog);
      const ha = col.master * lerp(night ? 0.24 : 0.16, 0.3, q.fog);
      for (let b = 1; b < NBH; b++) {
        if (!cntH[b]) continue;
        g.globalAlpha = Math.min(1, ha * (b / NH));
        strokeBucket(g, BH, b);
      }
      g.globalAlpha = 1;

      layer.clear();
      ctx.lineCap = "butt";
      ctx.lineJoin = "round";
      ctx.strokeStyle = col.smoke;
      ctx.lineWidth = wBase;
      for (let b = 1; b < NB; b++) {
        if (!cnt[b]) continue;
        ctx.globalAlpha = Math.min(1, col.master * (b / NA));
        strokeBucket(ctx, BK, b);
      }
      // rime, then what is in the air
      if (nRime > 0) {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = "#fbf9f4";
        ctx.beginPath();
        for (let i = 0; i < nRime; i++) ctx.rect(RX[i] - 1.8, RY[i] - 1.8, 3.6, 3.6);
        ctx.fill();
      }
      if (nPart > 0) {
        ctx.lineCap = "round";
        if (partSnow) {
          for (let pass = 0; pass < 3; pass++) {
            // by day a faint dark rim first, so white flecks hold on pale paper
            if (pass === 0 && night) continue;
            ctx.strokeStyle = pass === 0 ? "#2a2a30" : "#fdfbf6";
            ctx.globalAlpha = pass === 0 ? 0.22 : pass === 1 ? 0.85 : 1;
            ctx.lineWidth = pass === 0 ? 10 : pass === 1 ? 5.5 : 8;
            ctx.beginPath();
            for (let i = pass === 2 ? 1 : 0; i < nPart; i += pass === 0 ? 1 : 2) {
              const x = PX[i], y = PY[i];
              if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;
              ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y);
            }
            ctx.stroke();
          }
        } else {
          ctx.strokeStyle = col.speck;
          for (let pass = 0; pass < 2; pass++) { // in flight, then sitting on an edge
            ctx.globalAlpha = pass ? 1 : 0.85;
            ctx.lineWidth = pass ? 6 : 3;
            ctx.beginPath();
            for (let i = 0; i < nPart; i++) {
              if ((PT[i] > 0 ? 1 : 0) !== pass) continue;
              const x = PX[i], y = PY[i];
              if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;
              ctx.moveTo(x, y); ctx.lineTo(x - PVX[i] * 0.06 + 0.01, y - PVY[i] * 0.06);
            }
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // ------------------------------------------------------------------
    // Text
    // ------------------------------------------------------------------
    function readText(s) {
      const t = s.text, w = s.weather;
      put("date", t.date);
      put("temp", t.temp);
      if (put("cond", t.condition)) {
        T.cond.style.fontSize = "";
        fitText(T.cond, Math.max(200, hdr.clientWidth - T.temp.offsetWidth - 34));
      }
      const mph = Math.round(w.wind);
      put("wind", !w.live ? "Wind –" : mph < 2 ? "Calm air" : `Wind ${w.windFrom} ${mph} mph · gusts ${Math.round(Math.max(w.gust, w.wind))}`);
      put("sunL", t.sunLabel);
      put("sun", t.sunValue);
      put("moonL", "Moon");
      put("moon", t.moon);
      put("aqiL", "Air quality");
      put("aqi", t.aqi);
      put("uvL", "UV index");
      put("uv", t.uv);
      put("factL", t.factLabel);
      if (put("fact", t.factValue)) {
        factBox.style.display = t.factValue ? "" : "none";
        T.fact.style.fontSize = "";
        T.fact.style.lineHeight = "";
        if (t.factValue && T.fact.offsetHeight > 100) { T.fact.style.fontSize = "36px"; T.fact.style.lineHeight = "44px"; }
      }
    }

    // ------------------------------------------------------------------
    // Start: everything already in place on the first frame.
    // ------------------------------------------------------------------
    let timeKey = "", lastMs = state.ms, pending = 0;
    function setTime(s) {
      const key = `${s.text.hh}:${s.text.mm} ${s.text.ampm}`;
      if (key === timeKey && !textDirty) return false;
      if (key !== timeKey) { timeKey = key; layoutTime(s.text.hh, s.text.mm, s.text.ampm); }
      textDirty = false;
      measureCaps();
      buildBodies();
      measureBodies();
      buildWake();
      pruneRime();
      return true;
    }
    // A wake as it would be after a while: vortices already on their way.
    function seedVortices(t) {
      nV = 0;
      for (let l = 1; l <= nLab; l++) { shPh[l] = vr(); shSide[l] = vr() < 0.5 ? 1 : -1; }
      const n = 60;
      for (let i = 0; i < n; i++) stepVortices(0.25, t - (n - i) * 0.25, i === n - 1);
    }
    function settle(seconds) {
      for (let i = 0; i < NL; i++) { act[i] = inPlay(i); if (act[i]) trace(i); }
      const n = Math.round(seconds * 8);
      for (let i = 0; i < n; i++) { stepVortices(1 / 8, state.t, true); step(1 / 8); }
    }

    __T.push(performance.now()); // DIAG
    readConditions(state, true);
    readColour(state, true);
    readText(state);
    turnStream(q.ux, q.uy);
    __T.push(performance.now()); // DIAG
    setTime(state);
    __T.push(performance.now()); // DIAG
    if (q.snow > 0.01) seedRime(Math.round(260 + 520 * q.snow));
    relax(56, 1.94);
    __T.push(performance.now()); // DIAG
    pending = 360;
    seedVortices(state.t);
    __T.push(performance.now()); // DIAG
    settle(2.5);
    __T.push(performance.now()); // DIAG
    console.warn('DIAG mount ' + __T.map((t, i) => i ? (t - __T[i - 1]).toFixed(1) : '').join(' ')); // DIAG

    return {
      frame(s) {
        const jumped = Math.abs(s.ms - lastMs - s.dt * 1000) > 5000;
        lastMs = s.ms;
        readConditions(s, jumped);
        if (jumped || s.frame % 10 === 0 || (col.flip > 0 && col.flip < 1) || q.flash > 0) readColour(s, jumped);
        readText(s);

        const __a = performance.now(); // DIAG
        const changed = setTime(s);
        if (performance.now() - __a > 8) console.warn('DIAG setTime ' + (performance.now() - __a).toFixed(1)); // DIAG
        const turned = q.ux * sux + q.uy * suy < 0.99985; // about one degree
        if (turned) { turnStream(q.ux, q.uy); buildWake(); measureBodies(); }
        if (jumped && (changed || turned)) {
          relax(48, 1.94);
          pending = 160;
          seedVortices(s.t);
          settle(1.5);
        } else {
          if (changed) pending = Math.max(pending, 150);
          else if (turned) pending = Math.max(pending, 24);
          if (pending > 0) {
            const n = Math.min(pending, 3);
            relax(n, 1.92);
            pending -= n;
          }
          if (s.dt > 0) {
            stepVortices(s.dt, s.t, true);
            step(s.dt);
          }
        }
        draw();
      },
    };
  },
};

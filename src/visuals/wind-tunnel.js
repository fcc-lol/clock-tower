// Wind Tunnel
//
// The hour stands in a smoke tunnel, seen from above with north at the top.
// The numerals are solid bodies; a rake of smoke filaments is blown past them
// from wherever the real wind is coming from, at the real wind's speed, and
// the smoke parts around the digits and sheds wakes behind them.
//
// How the conditions drive it:
//   wind direction  where the smoke enters (a west wind enters at the left)
//   wind speed      how fast the smoke travels (8 + 5 px/s per mph, capped)
//   gusts           how ragged the wakes are, and slow surges in speed
//   calm air        no wind to carry it, so the smoke rises from the bottom
//                   edge as slow plumes that curl as they age
//   rain            beads ride the filaments and gather on windward edges
//   snow            slow white flecks, and a rime that builds on windward edges
//   fog             the filaments swell into thick, soft, low-contrast smoke
//   heat / cold     buoyant, shimmering, soft smoke / hair-thin, dense, laminar
//   storm           big slow vortices, a dimmed page, a rare soft brightening
//   daylight, sky   paper and graphite by day (tinted a little by the measured
//                   sky), black with pale light-sheet smoke at night
//
// How it works: once a minute the digits are rasterised to a coarse grid and
// a stream function is relaxed around them (potential flow, each digit a
// floating streamline, its lee a porous dead zone). Each filament is a chain
// of particles emitted upwind and carried by that field plus advected noise
// in the wakes, so the pattern is nearly stationary in steady wind.

import {
  W, H, clamp, lerp, smoothstep, approach, rng, createNoise,
  mix, luminance, el, svg, svgLayer, addStyle, canvas2d, mask, grain,
} from "../lib/kit.js";

// streaklines
const NL = 104; // filaments in the rake
const NN = 64; // particles per filament
const LINE_GAP = 24; // px between filaments
// flow grid (covers the stage plus a margin so the flow can spread)
const CELL = 8;
const GX0 = -320;
const GY0 = -320;
const GC = 215;
const GR = 320;
const GN = GC * GR;
const INVH = 1 / CELL;
const CX = W / 2;
const CY = H / 2;
const WAKE_LEN = 430; // px over which a wake fades
const KAPPA = 0.014; // how solid the dead zone behind a body is
// turbulence tile (periodic, sampled twice at different drifts)
const TS = 256;
const TM = TS - 1;
const TINV = 1 / 4;
// drawing buckets: alpha levels x width classes
const NA = 8; // the crisp core of a filament: alpha levels
const NB = NA + 1;
const NH = 6; // its soft halo: alpha levels
const NBH = NH + 1;
const NPUFF = 1500; // puffs of stirred smoke drawn per frame, at most
// rain beads / snow flecks, and rime
const NP = 560;
const NRIME = 1500;

const NIGHT = "#060607";
const PAPER = "#e4e0d7";
const INK = "#121214";

const rgbaOf = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a.toFixed(3)})`;
const fontStr = (px) => `800 expanded ${px}px "Archivo", "Arial Black", sans-serif`;

export default {
  title: "Wind Tunnel",
  description: "The hour stands in a smoke tunnel: filaments blow past the numerals from the real wind's bearing at its speed, and shed wakes with its gusts.",
  fonts: ["Archivo:wdth,wght@62..125,100..900", "IBM Plex Mono:wght@500"],
  fps: 30,

  mount(root, { state, seed }) {
    addStyle(root, `
      .wt { position: absolute; inset: 0; overflow: hidden; background: var(--bg); color: var(--ink);
            font-family: "Archivo", "Arial Black", sans-serif; font-stretch: 125%; font-kerning: normal; }
      .wt .nums text { font-family: "Archivo", "Arial Black", sans-serif; font-weight: 800; font-stretch: 125%; fill: var(--num); }
      .wt .cap { font-family: "IBM Plex Mono", ui-monospace, monospace; font-stretch: 100%; font-weight: 500; font-size: 24px;
                 line-height: 1; letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; color: var(--cap); }
      .wt .top { position: absolute; left: 64px; right: 64px; top: 64px; height: 200px; }
      .wt .date, .wt .cond { position: absolute; left: 0; font-size: 46px; line-height: 58px; white-space: nowrap; letter-spacing: -0.005em; }
      .wt .date { top: 0; font-weight: 800; }
      .wt .cond { top: 58px; font-weight: 500; }
      .wt .temp { position: absolute; right: -4px; top: -7px; font-weight: 800; font-size: 132px; line-height: 1; letter-spacing: -0.02em; white-space: nowrap; }
      .wt .wind { position: absolute; left: 1px; top: 142px; }
      .wt .bot { position: absolute; left: 64px; right: 64px; bottom: 60px; display: flex; flex-direction: column; }
      .wt .row { display: flex; justify-content: space-between; align-items: flex-start; }
      .wt .it .val { margin-top: 14px; font-weight: 800; font-size: 38px; line-height: 44px; white-space: nowrap; }
      .wt .fact { margin-top: 44px; }
      .wt .fact .fv { margin-top: 14px; font-weight: 500; font-stretch: 100%; font-size: 38px; line-height: 46px; text-wrap: balance; }
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
    T.cond = el("div", { class: "cond" });
    T.temp = el("div", { class: "temp" });
    T.wind = el("div", { class: "cap wind" });
    const top = el("div", { class: "top" }, T.date, T.cond, T.temp, T.wind);
    const row = el("div", { class: "row" }, item("sun"), item("moon"), item("aqi"), item("uv"));
    T.factL = el("div", { class: "cap" });
    T.fact = el("div", { class: "fv" });
    const factBox = el("div", { class: "fact" }, T.factL, T.fact);
    const bot = el("div", { class: "bot" }, row, factBox);
    wrap.append(top, bot);
    root.append(wrap);
    grain(wrap, { opacity: 0.07 });

    const shown = {};
    const put = (key, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      T[key].textContent = value;
      return true;
    };

    // ------------------------------------------------------------------
    // The numerals: measured once, placed glyph by glyph (so the SVG type and
    // the obstacle mask agree exactly), hours top-left, minutes lower-right.
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
    const GAPK = 0.085; // gap between digits, in ems
    const ROW_W = 764; // the widest a row of two digits may be
    const FS = Math.floor(ROW_W / (2 * digitMax + GAPK));
    const CAP = FS * capK;
    const FS2 = Math.round(FS * 0.2);
    const Y_HOURS = 322 + CAP; // baselines
    const Y_MINS = Y_HOURS + CAP * 0.27 + CAP;
    const Y_AMPM = Y_MINS + CAP * 0.2 + FS2 * capK;

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
      // hours: ink flush left
      let x = 64;
      for (let i = 0; i < 2; i++) {
        const ch = hh[i] || "";
        const m = metric[ch];
        if (!m) { place(glyphs[i], "", 0, 0, FS); continue; }
        place(glyphs[i], ch, x + m.l * FS, Y_HOURS, FS);
        x += (m.l + m.r) * FS + gap;
      }
      // minutes: ink flush right
      x = W - 64;
      for (let i = 1; i >= 0; i--) {
        const m = metric[mm[i]];
        place(glyphs[2 + i], mm[i], x - m.r * FS, Y_MINS, FS);
        x -= (m.l + m.r) * FS + gap;
      }
      const ma = metric[ampm] || metric.PM;
      place(glyphs[4], ampm, W - 64 - ma.r * FS2, Y_AMPM, FS2);
    }

    // ------------------------------------------------------------------
    // The flow field
    // ------------------------------------------------------------------
    const lab = new Uint8Array(GN); // body label per cell (0 = air)
    const edge = new Uint8Array(GN); // 1 on the rim of the grid
    const wlab = new Uint8Array(GN); // which body's wake a cell is in
    const open = new Uint8Array(GN); // 1 where air can get to (not a body, not a closed counter)
    const sd = new Float32Array(GN); // signed distance to the nearest body surface, px
    const S = new Float32Array(GN); // wake strength, 0..1
    const P = new Float32Array(GN); // dead-zone penalty
    const psi = new Float64Array(GN); // stream function for a unit free stream
    const VX = new Float32Array(GN);
    const VY = new Float32Array(GN);
    const scratch = new Float32Array(GN);
    const stack = new Int32Array(GN);
    const bodyIdx = new Int32Array(GN);
    const bnd = new Int32Array(GN * 2);
    const bndL = new Uint8Array(GN * 2);
    let nBody = 0, nBnd = 0, nLab = 0;
    const psib = new Float64Array(32), acc = new Float64Array(32), accw = new Float64Array(32);
    const bcx = new Float64Array(32), bcy = new Float64Array(32), bcn = new Float64Array(32);
    for (let j = 0; j < GR; j++) for (let i = 0; i < GC; i++) edge[j * GC + i] = i === 0 || j === 0 || i === GC - 1 || j === GR - 1 ? 1 : 0;

    let sux = 1, suy = 0; // the free-stream direction the field is solved for
    for (let j = 0; j < GR; j++) for (let i = 0; i < GC; i++) psi[j * GC + i] = sux * (GY0 + (j + 0.5) * CELL - CY) - suy * (GX0 + (i + 0.5) * CELL - CX);

    const drawGlyphs = (c) => {
      c.scale(INVH, INVH);
      c.translate(-GX0, -GY0);
      c.textBaseline = "alphabetic";
      c.textAlign = "left";
      for (const g of glyphs) {
        if (!g.ch) continue;
        c.font = fontStr(g.size);
        c.fillText(g.ch, g.x, g.y);
      }
    };

    function buildBodies() {
      const m = mask(GC, GR, drawGlyphs).data;
      lab.fill(0);
      nLab = 0; nBody = 0; nBnd = 0;
      // connected components: each glyph is one body
      for (let c0 = 0; c0 < GN; c0++) {
        if (m[c0] < 100 || lab[c0] || edge[c0] || nLab >= 30) continue;
        const l = ++nLab;
        let sp = 0, sx = 0, sy = 0, n = 0, sPsi = 0;
        stack[sp++] = c0;
        lab[c0] = l;
        while (sp) {
          const c = stack[--sp];
          bodyIdx[nBody++] = c;
          sx += c % GC; sy += (c / GC) | 0; sPsi += psi[c]; n++;
          const a = c - 1, b = c + 1, d = c - GC, e = c + GC;
          if (m[a] >= 100 && !lab[a] && !edge[a]) { lab[a] = l; stack[sp++] = a; }
          if (m[b] >= 100 && !lab[b] && !edge[b]) { lab[b] = l; stack[sp++] = b; }
          if (m[d] >= 100 && !lab[d] && !edge[d]) { lab[d] = l; stack[sp++] = d; }
          if (m[e] >= 100 && !lab[e] && !edge[e]) { lab[e] = l; stack[sp++] = e; }
        }
        bcx[l] = GX0 + (sx / n + 0.5) * CELL;
        bcy[l] = GY0 + (sy / n + 0.5) * CELL;
        bcn[l] = n;
        psib[l] = sPsi / n; // start from what the air there was doing
      }
      for (let k = 0; k < nBody; k++) {
        const c = bodyIdx[k], l = lab[c];
        if (!lab[c - 1]) { bnd[nBnd] = c - 1; bndL[nBnd++] = l; }
        if (!lab[c + 1]) { bnd[nBnd] = c + 1; bndL[nBnd++] = l; }
        if (!lab[c - GC]) { bnd[nBnd] = c - GC; bndL[nBnd++] = l; }
        if (!lab[c + GC]) { bnd[nBnd] = c + GC; bndL[nBnd++] = l; }
      }
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
      // signed distance (two chamfer passes each way)
      const BIG = 1e5, D = Math.SQRT2;
      const dOut = sd, dIn = scratch;
      for (let c = 0; c < GN; c++) { dOut[c] = lab[c] ? 0 : BIG; dIn[c] = lab[c] ? BIG : 0; }
      for (let pass = 0; pass < 2; pass++) {
        const f = pass ? dIn : dOut;
        for (let j = 1; j < GR - 1; j++) for (let i = 1; i < GC - 1; i++) {
          const c = j * GC + i;
          let v = f[c];
          if (v === 0) continue;
          v = Math.min(v, f[c - 1] + 1, f[c - GC] + 1, f[c - GC - 1] + D, f[c - GC + 1] + D);
          f[c] = v;
        }
        for (let j = GR - 2; j > 0; j--) for (let i = GC - 2; i > 0; i--) {
          const c = j * GC + i;
          let v = f[c];
          if (v === 0) continue;
          v = Math.min(v, f[c + 1] + 1, f[c + GC] + 1, f[c + GC + 1] + D, f[c + GC - 1] + D);
          f[c] = v;
        }
      }
      for (let c = 0; c < GN; c++) sd[c] = lab[c] ? -(dIn[c] - 0.5) * CELL : Math.min(400, (dOut[c] - 0.5) * CELL);
    }

    // The lee of every body, swept downwind: where the wake noise acts and
    // where the dead zone holds the smoke apart.
    function buildWake() {
      S.fill(0);
      wlab.fill(0);
      const ax = Math.abs(sux), ay = Math.abs(suy);
      if (ax >= ay) {
        const si = sux > 0 ? 1 : -1, f = ay / ax, sj = (suy > 0 ? 1 : -1) * GC;
        const dec = Math.exp((-CELL * Math.sqrt(1 + f * f)) / WAKE_LEN);
        for (let i = si > 0 ? 1 : GC - 2; i > 0 && i < GC - 1; i += si) for (let j = 1; j < GR - 1; j++) {
          const c = j * GC + i;
          if (lab[c]) { S[c] = 1; wlab[c] = lab[c]; continue; }
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
          if (lab[c]) { S[c] = 1; wlab[c] = lab[c]; continue; }
          const a = c - sj * GC, b = a - si;
          const va = S[a] * (1 - f), vb = S[b] * f;
          S[c] = (va + vb) * dec;
          wlab[c] = va >= vb ? wlab[a] : wlab[b];
        }
      }
      for (let c = 0; c < GN; c++) {
        const s = S[c];
        P[c] = lab[c] || s < 0.04 ? 0 : KAPPA * s * s;
      }
    }

    // Successive over-relaxation of Laplace's equation for the stream function.
    // Each body floats at its own constant (no circulation), and the wake pulls
    // the air behind a body toward that constant.
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
        VX[c] = (psi[c + GC] - psi[c - GC]) * k2;
        VY[c] = -(psi[c + 1] - psi[c - 1]) * k2;
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
    // Turbulence: one periodic tile of a random stream function's gradient,
    // read twice at different drifts so the eddies evolve as they are carried.
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
        // psi = a cos(ax + ay); gradient = -a k sin(ax + ay)
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

    // ------------------------------------------------------------------
    // The conditions, reduced to what the tunnel needs
    // ------------------------------------------------------------------
    const noise = createNoise(seed);
    const q = {
      ux: 1, uy: 0, U: 40, // direction and speed of the stream, px/s
      wake: 20, amb0: 0, amb1: 0, nsc: 1, // turbulence amplitudes (px/s) and eddy scale
      calm: 0, fog: 0, cold: 0, heat: 0, storm: 0, cloud: 0,
      rain: 0, snow: 0, night: 0, flash: 0,
      rup: 700, rperp: 1000, spacing: 24, lineK: 1,
    };
    const ez = { fog: 0, storm: 0, rain: 0, snow: 0 };
    function readConditions(s, snap) {
      const w = s.weather;
      const live = w.live;
      const mph = live ? w.wind : 0;
      const gust = live ? Math.max(w.gust, mph) : 0;
      const surge = Math.pow(0.5 + 0.5 * noise.n2(s.t * 0.05, 9.1), 2); // slow gust surges, 0..1
      const gf = mph > 0.5 ? clamp(gust / mph, 1, 2.6) : 1;
      const gusty = clamp((gf - 1) / 1.3);
      const eff = mph + (gust - mph) * surge * 0.7;
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
      q.night = 1 - s.daylight;
      const a = (w.windDir * Math.PI) / 180;
      const uw = Math.min(160, 8 + 5 * eff) * (1 - q.calm);
      const vx = -Math.sin(a) * uw;
      const vy = Math.cos(a) * uw - (13 * q.calm + 9 * q.heat); // warm, still air rises
      q.U = Math.max(6, Math.hypot(vx, vy));
      q.ux = vx / Math.hypot(vx, vy);
      q.uy = vy / Math.hypot(vx, vy);
      q.wake = q.U * (0.24 + 0.5 * gusty + 0.3 * surge * gusty + 0.25 * q.storm) * (1 - 0.4 * q.cold * (1 - gusty));
      q.amb0 = q.U * (0.015 * gusty + 0.08 * q.heat) + 1.2 * q.calm;
      q.amb1 = 15 * q.calm + q.U * 0.1 * q.heat;
      q.nsc = lerp(1, 0.62, q.storm);
      q.rup = Math.abs(q.ux) * CX + Math.abs(q.uy) * CY + 150;
      q.rperp = Math.abs(q.ux) * CY + Math.abs(q.uy) * CX + 90;
      q.spacing = (q.rup * 2.06) / NN;
      q.lineK = lerp(1.08, 0.84, q.cold) * lerp(1, 1.3, q.fog);
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
        vx = VX[c] * w00 + VX[c + 1] * w10 + VX[c + GC] * w01 + VX[c + GC + 1] * w11;
        vy = VY[c] * w00 + VY[c + 1] * w10 + VY[c + GC] * w01 + VY[c + GC + 1] * w11;
        s = S[c] * w00 + S[c + 1] * w10 + S[c + GC] * w01 + S[c + GC + 1] * w11;
        fc = c + (fx >= 0.5 ? 1 : 0) + (fy >= 0.5 ? GC : 0);
        fsd = sd[fc];
      } else {
        vx = sux; vy = suy; s = 0; fc = -1; fsd = 400;
      }
      vx *= q.U; vy *= q.U;
      let amp = q.wake * s + amb;
      if (amp > 0.05) {
        if (fsd < 26) amp *= fsd < 2 ? 0 : (fsd - 2) / 24; // eddies die at a wall
        const n = q.nsc;
        let k = ((((y * n - oAy) * TINV) | 0) & TM) * TS + ((((x * n - oAx) * TINV) | 0) & TM);
        let nx = TGY[k], ny = -TGX[k];
        k = ((((-x * n - oBy) * TINV) | 0) & TM) * TS + ((((y * n - oBx) * TINV) | 0) & TM);
        nx += TGX[k]; ny += TGY[k];
        vx += nx * amp * 0.72; vy += ny * amp * 0.72;
      } else amp = 0;
      fvx = vx; fvy = vy; famp = amp;
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
    const FX = new Float32Array(NPUFF), FY = new Float32Array(NPUFF), FR = new Float32Array(NPUFF), FA = new Float32Array(NPUFF);
    let nPuff = 0;
    // a soft round puff, in graphite and in pale smoke
    const puffs = ["#1c1c20", "#efeadd"].map((c) => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 64;
      const g = cv.getContext("2d");
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      for (let i = 0; i <= 8; i++) gr.addColorStop(i / 8, rgbaOf(c, Math.pow(Math.cos((i / 8) * Math.PI * 0.5), 2.2)));
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      return cv;
    });
    const off = new Float32Array(NL), lineW = new Float32Array(NL), drop = new Float32Array(NL);
    const act = new Uint8Array(NL);
    {
      const r = rng(seed + 3);
      for (let i = 0; i < NL; i++) {
        off[i] = (i - (NL - 1) / 2 + r.range(-0.28, 0.28)) * LINE_GAP;
        lineW[i] = r.range(0.66, 1);
        drop[i] = r() < 0.56 ? 1 : 0; // filaments shut off when the air is still
      }
    }
    let head = 0, emitAcc = 0, emitCount = 1000;
    const density = (i, n) => 0.62 + 0.38 * (0.5 + 0.5 * noise.n2(n * 0.1, i * 7.31));
    const MIX_RATE = 0.36;
    const nozX = (i) => CX - q.ux * q.rup - q.uy * off[i] * q.lineK;
    const nozY = (i) => CY - q.uy * q.rup + q.ux * off[i] * q.lineK;

    // Lay one filament down along the flow as it stands (used at the start, on
    // a jump of the clock, and when a filament comes into play).
    function trace(i) {
      let x = nozX(i), y = nozY(i), m = 0;
      const base = i * NN;
      for (let a = 0; a < NN; a++) {
        let k = head + a; if (k >= NN) k -= NN;
        const af = a / NN;
        const dt = (a === 0 ? emitAcc : q.spacing) / q.U / 3;
        for (let sub = 0; sub < 3; sub++) {
          flowAt(x, y, q.amb0 + q.amb1 * af * af);
          x += fvx * dt; y += fvy * dt;
          m += (famp / (q.U + 12)) * MIX_RATE * dt;
        }
        X[base + k] = x; Y[base + k] = y;
        MX[base + k] = m > 1 ? 1 : m;
        DN[base + k] = density(i, emitCount - a);
      }
    }

    const BAND = new Float32Array(H + 2); // how strongly smoke shows at each height (it thins behind the text bands)
    let bandTop = 300, bandBot = 1460;
    function buildBand() {
      for (let y = 0; y < H + 2; y++) {
        const a = smoothstep(bandTop - 50, bandTop + 40, y), b = 1 - smoothstep(bandBot - 60, bandBot + 30, y);
        BAND[y] = 0.36 + 0.64 * Math.min(a, b);
      }
    }

    // ------------------------------------------------------------------
    // Rain beads, snow flecks, rime
    // ------------------------------------------------------------------
    const PX = new Float32Array(NP), PY = new Float32Array(NP), PVX = new Float32Array(NP), PVY = new Float32Array(NP);
    const PT = new Float32Array(NP); // > 0: stuck for this long; < 0: just let go, cannot stick yet
    const PH = new Float32Array(NP);
    const RX = new Float32Array(NRIME), RY = new Float32Array(NRIME);
    let nRime = 0, rimeAt = 0;
    const pr = rng(seed + 29);
    for (let i = 0; i < NP; i++) PH[i] = pr();
    function spawn(i, anywhere) {
      const li = (pr() * NL) | 0;
      const o = off[li] * q.lineK;
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
        const d = gx > 0 && gy > 0 && gx < GC && gy < GR ? sd[gy * GC + gx] : 99;
        if (d > -6 && d < 14) { RX[n] = RX[i]; RY[n] = RY[i]; n++; }
      }
      nRime = n; rimeAt = n % NRIME;
    }
    function seedRime(count) {
      let tries = count * 12;
      while (count > 0 && tries-- > 0 && nBnd > 0) {
        const c = bnd[(pr() * nBnd) | 0];
        const gx = sd[c + 1] - sd[c - 1], gy = sd[c + GC] - sd[c - GC];
        const gl = Math.hypot(gx, gy) || 1;
        if ((gx * q.ux + gy * q.uy) / gl > -0.3) continue; // windward faces only
        addRime(GX0 + ((c % GC) + 0.5) * CELL + pr.range(-5, 5), GY0 + (((c / GC) | 0) + 0.5) * CELL + pr.range(-5, 5));
        count--;
      }
    }
    let nPart = 0, partSnow = 0;

    function stepParticles(dt) {
      const snow = q.snow > q.rain;
      const amount = snow ? q.snow : q.rain;
      nPart = amount > 0.01 ? Math.min(NP, Math.round(snow ? 150 + 400 * amount : 110 + 430 * amount)) : 0;
      partSnow = snow ? 1 : 0;
      const tau = snow ? 0.9 : 0.3, gain = snow ? 0.5 : 1.12, stickAt = snow ? 6 : 5;
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
          if (vn < 0 && PT[i] === 0 && fsd > -4) {
            if (snow) { addRime(x, y); spawn(i, false); continue; }
            PT[i] = 3 + 9 * PH[i];
          } else {
            const push = (stickAt - fsd) * 0.5; // slide along the wall
            x += nx * push; y += ny * push;
            if (vn < 0) { PVX[i] -= vn * nx; PVY[i] -= vn * ny; }
          }
        }
        PX[i] = x; PY[i] = y;
        const along = (x - CX) * q.ux + (y - CY) * q.uy;
        if (along > lim || along < -lim - 80 || x < -160 || x > W + 160 || y < -160 || y > H + 160) spawn(i, false);
      }
    }

    // ------------------------------------------------------------------
    // One step of the smoke
    // ------------------------------------------------------------------
    function step(dt) {
      const vx0 = q.ux * q.U * q.nsc * dt, vy0 = q.uy * q.U * q.nsc * dt;
      oAx += vx0 * 0.5; oAy += vy0 * 0.5;
      oBx += vy0 * 0.86; oBy -= vx0 * 0.86;
      // which filaments are in play
      for (let i = 0; i < NL; i++) {
        const on = Math.abs(off[i] * q.lineK) < q.rperp ? 1 : 0;
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
      nPuff = 0;
      const puffR = 1 + 0.5 * q.calm;
      const invSp = 1 / q.spacing, invN = 1 / NN;
      const fade = 0.5 * q.calm; // still air: the plumes thin out as they rise
      const haze = 0.86 * q.fog; // fog: nothing but haze
      const mixK = (MIX_RATE * dt) / (q.U + 12);
      const vig = 0.55 * q.night, invR2 = 1 / (780 * 780);
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
          if (fsd < 2 && fc >= 0) { // never into a body
            const gx = sd[fc + 1] - sd[fc - 1], gy = sd[fc + GC] - sd[fc - GC];
            const gl = Math.hypot(gx, gy) || 1, push = Math.min(4, (2 - fsd) * 0.35);
            x += (gx / gl) * push; y += (gy / gl) * push;
          }
          X[n] = x; Y[n] = y;
          let m = MX[n] + famp * mixK;
          if (m > 1) m = 1;
          MX[n] = m;
          let b = 0, bh = 0;
          if (a > 0 && lw > 0.02 && x > -60 && x < W + 60 && y > -60 && y < H + 60 && (fc < 0 || open[fc])) {
            const dx = x - px, dy = y - py;
            const st = Math.sqrt(dx * dx + dy * dy) * invSp; // how far this piece has been pulled out
            let al = lw * DN[n] * BAND[y < 0 ? 0 : y > H ? H : y | 0];
            if (fade > 0) al *= 1 - fade * af * af;
            if (vig > 0) {
              const rx = x - CX, ry = (y - CY) * 0.6;
              al *= 1 - vig * Math.min(1, (rx * rx + ry * ry) * invR2);
            }
            if (m > 0.1 && nPuff < NPUFF && (m < 0.55 || (a & 1) === 0)) { // stirred smoke: a soft puff
              const k = m < 0.4 ? (m - 0.1) / 0.3 : 1;
              FX[nPuff] = x; FY[nPuff] = y;
              FR[nPuff] = (13 + 30 * m) * puffR;
              FA[nPuff++] = al * k * (0.27 - 0.13 * m) * (st > 1.5 ? 1.22 / Math.sqrt(st) : 1);
            }
            if (st < 4) {
              if (st > 1.3) al *= (1.3 / st) * (1.3 / st);
              else if (st < 0.3) al *= st / 0.3; // bunched up against a wall
              const cm = 1 - (m > haze ? m : haze);
              let lv = (al * cm * cm * NA + 0.5) | 0;
              if (lv > NA) lv = NA;
              b = lv;
              lv = (al * (1 - 0.7 * m) * NH + 0.5) | 0;
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
    const col = { bg: "", num: "", ink: "", cap: "", smoke: INK, master: 0.6, light: 0, flip: -1, speck: "#fff", bgLum: 1 };
    function readColour(s, snap) {
      const dl = s.daylight;
      let paper = mix(PAPER, "#8d9094", clamp(0.3 * q.cloud + 0.3 * q.rain + 0.3 * q.snow + 0.16 * q.fog));
      paper = mix(paper, s.sky.mean, 0.12 + 0.1 * (1 - dl));
      const night = mix(NIGHT, s.sky.mean, 0.05);
      let bg = mix(night, paper, Math.pow(dl, 1.15) * (1 - 0.42 * q.storm));
      const lum = luminance(bg);
      const light = lum < 0.19 ? 1 : 0; // pale ink on a dark ground
      if (snap || col.flip < 0) col.flip = light;
      else col.flip = approach(col.flip, light, s.dt * 12, 0.3);
      const f = col.flip;
      const lift = smoothstep(0.02, 0.17, lum); // pale ink has to be brighter on a grey ground than on black
      const numLight = mix("#96918a", "#e6e1d6", lift);
      const inkLight = mix("#c9c4b8", "#f2eee4", lift);
      const numDark = mix(INK, bg, 0.14 * q.fog);
      col.num = f <= 0 ? numDark : f >= 1 ? numLight : mix(numDark, numLight, f);
      col.ink = f <= 0 ? INK : f >= 1 ? inkLight : mix(INK, inkLight, f);
      col.cap = mix(col.ink, bg, 0.2);
      col.smoke = f < 0.5 ? "#1c1c20" : "#efeadd";
      col.light = f;
      col.bgLum = lum;
      // how strongly the smoke is drawn
      const moon = s.moon.up ? s.moon.illumination : 0;
      const day = lerp(0.85, 0.74, q.cloud);
      const dark = 0.86 + 0.14 * moon;
      col.master = (f < 0.5 ? day : lerp(0.9, dark, 1 - lift)) * Math.abs(f * 2 - 1) * lerp(1, 0.5, q.fog) * (1 + 0.45 * q.flash);
      col.speck = f < 0.5 ? "#17171a" : "#f6f2e8";
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
      const wBase = lerp(lerp(2.2, 1.45, q.cold), 2.7, 0.5 * q.cloud + 0.3 * q.heat);
      const g = glow.ctx;
      glow.clear();
      g.lineJoin = "round";
      g.strokeStyle = col.smoke;
      g.lineCap = "butt";
      g.lineWidth = wBase * lerp(3.4, 13, q.fog);
      const ha = col.master * lerp(0.2, 0.3, q.fog);
      for (let b = 1; b < NBH; b++) {
        if (!cntH[b]) continue;
        g.globalAlpha = Math.min(1, ha * (b / NH));
        strokeBucket(g, BH, b);
      }
      const sprite = puffs[col.light < 0.5 ? 0 : 1];
      for (let i = 0; i < nPuff; i++) {
        const r = FR[i];
        g.globalAlpha = Math.min(1, FA[i] * col.master);
        g.drawImage(sprite, FX[i] - r, FY[i] - r, r * 2, r * 2);
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
        for (let i = 0; i < nRime; i++) ctx.rect(RX[i] - 1.7, RY[i] - 1.7, 3.4, 3.4);
        ctx.fill();
      }
      if (nPart > 0) {
        ctx.lineCap = "round";
        if (partSnow) {
          ctx.strokeStyle = "#fbf9f4";
          for (let pass = 0; pass < 2; pass++) {
            ctx.globalAlpha = pass ? 1 : 0.9;
            ctx.lineWidth = pass ? 8 : 5;
            ctx.beginPath();
            for (let i = pass; i < nPart; i += 2) {
              const x = PX[i], y = PY[i];
              if (x < -8 || x > W + 8 || y < 0 || y > H || BAND[y | 0] < 0.8) continue;
              ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y);
            }
            ctx.stroke();
          }
        } else {
          ctx.strokeStyle = col.speck;
          for (let pass = 0; pass < 2; pass++) { // in flight, then sitting on an edge
            ctx.globalAlpha = pass ? 1 : 0.9;
            ctx.lineWidth = pass ? 4.4 : 2.8;
            ctx.beginPath();
            for (let i = 0; i < nPart; i++) {
              if ((PT[i] > 0 ? 1 : 0) !== pass) continue;
              const x = PX[i], y = PY[i];
              if (x < -8 || x > W + 8 || y < 0 || y > H || BAND[y | 0] < 0.8) continue; // the text bands stay dry
              ctx.moveTo(x, y); ctx.lineTo(x - PVX[i] * 0.045 + 0.01, y - PVY[i] * 0.045);
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
      put("cond", t.condition);
      put("temp", t.temp);
      const mph = Math.round(w.wind);
      put("wind", !w.live ? "No wind reading" : mph < 1.5 ? "Calm air" : `Wind ${w.windFrom} ${mph} mph · gusts ${Math.round(Math.max(w.gust, w.wind))}`);
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
        const y = bot.offsetTop;
        if (y > 0) { bandBot = y; buildBand(); }
      }
    }

    // ------------------------------------------------------------------
    // Start: everything already in place on the first frame.
    // ------------------------------------------------------------------
    let timeKey = "", lastMs = state.ms, pending = 0;
    function setTime(s) {
      const key = `${s.text.hh}:${s.text.mm} ${s.text.ampm}`;
      if (key === timeKey) return false;
      timeKey = key;
      layoutTime(s.text.hh, s.text.mm, s.text.ampm);
      buildBodies();
      buildWake();
      pruneRime();
      return true;
    }
    function settle(sweeps, seconds) {
      relax(sweeps, 1.93);
      for (let i = 0; i < NL; i++) if (act[i]) trace(i);
      const n = Math.round(seconds * 12);
      for (let i = 0; i < n; i++) step(1 / 12);
    }

    readConditions(state, true);
    readColour(state, true);
    readText(state);
    buildBand();
    turnStream(q.ux, q.uy);
    setTime(state);
    for (let i = 0; i < NL; i++) act[i] = Math.abs(off[i] * q.lineK) < q.rperp ? 1 : 0;
    if (q.snow > 0.01) seedRime(Math.round(260 + 520 * q.snow));
    settle(340, 14);

    return {
      frame(s) {
        const jumped = Math.abs(s.ms - lastMs - s.dt * 1000) > 5000;
        lastMs = s.ms;
        readConditions(s, jumped);
        if (jumped || s.frame % 10 === 0 || (col.flip > 0 && col.flip < 1) || q.flash > 0) readColour(s, jumped);
        readText(s);

        const changed = setTime(s);
        const turned = q.ux * sux + q.uy * suy < 0.99985; // about one degree
        if (turned) { turnStream(q.ux, q.uy); buildWake(); }
        if (jumped && (changed || turned)) {
          settle(60, 2);
          pending = 0;
        } else {
          if (changed) pending = 160;
          else if (turned) pending = Math.max(pending, 24);
          if (pending > 0) {
            const n = Math.min(pending, 8);
            relax(n, 1.9);
            pending -= n;
          }
          if (s.dt > 0) step(s.dt);
        }
        draw();
      },
    };
  },
};

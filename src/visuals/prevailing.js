// Prevailing: a field of parallel lines laid along the real wind, north up. A
// west wind runs them left to right, a north wind top to bottom; waves travel
// down them at the wind's speed, and how much they heave is how gusty it is.
// The time is not printed anywhere: the huge stacked digits appear because the
// lines swell in weight where they cross them, and the lines go taut there.
//
// What the air is doing decides what the lines are made of. In still air they
// bead into a motionless dot matrix. Rain breaks them into streaks that run
// downwind; snow turns them into beads that slide; fog takes them away toward
// the edges; heat makes them shimmer; cold draws them to hairlines. A new
// minute blows in as a front that crosses the field, shearing the lines half a
// pitch as it passes. The lines take their colors from the measured sky, west
// at the left of the frame to east at the right, on paper by day and on black
// at night. Everything else is set on the solid block the field stands on:
// the sky's own hue made deep (navy under a blue sky, slate under cloud, an
// inky blue at night), with AM/PM on a tab standing up out of it.

import { W, clamp, lerp, smoothstep, mix, adjust, oklch, toOklch, rng, hash, el, addStyle, canvas2d, mask, grain, fitText } from "../lib/kit.js";

const FIELD_H = 1290; // the lines cover the frame down to here; the block of type is below
const TAB_H = 126; // the AM/PM tab stands this far up out of the block
const PITCH = 21; // distance between lines
const STEP = 12; // sampling along a line
const BANDS = 9; // the sky's sweep of color is laid across the frame in this many bands
const CELL = 4; // the digit mask is this coarse
const MC = Math.ceil(W / CELL);
const MR = Math.ceil(FIELD_H / CELL);
const THICK = 0.86; // line weight (share of the pitch) inside the digits
const M = 72;
const ROW_TOP = 98; // top of the hour digits
const ROW_GAP = 82; // between hours and minutes
const CAP = 0.72; // height of an Archivo Black figure, in ems
const TAU = Math.PI * 2;
const CHIRP = 0.00011; // waves shorten toward the downwind edge
const FRONT_W = 190; // half-width of the front that carries a new minute in
const WIPE = 0.14; // the old figures give way to the new over this share of it
const INK = "#f2eee4"; // type on the block
const TAUT = 0.82; // how much the waves ease off inside the figures (thick line is stiff line)
const BEAD_Q = 0.3; // bead radii are rounded to this, px
const NBUCKET = 40; // enough widths for the biggest bead (THICK * PITCH / 2 / BEAD_Q)

export default {
  title: "Prevailing",
  description: "Lines laid along the real wind, heaving with its gusts; the time is where they swell.",
  fonts: ["Archivo Black", "Space Grotesk:wght@400;500;700"],
  fps: 24, // the waves are slow; 24 is smooth for them and leaves the Pi room to fill a 4K field

  mount(root, { seed }) {
    addStyle(root, `
      .pv { position: absolute; inset: 0; font-family: "Space Grotesk", sans-serif; color: ${INK}; }
      .pv .band { position: absolute; left: 0; right: 0; top: ${FIELD_H}px; bottom: 0; }
      .pv .tab { position: absolute; right: 0; top: ${FIELD_H - TAB_H}px; height: ${TAB_H + 2}px; padding: 0 64px 0 34px; font-family: "Archivo Black", sans-serif; font-size: 112px; line-height: ${TAB_H + 10}px; white-space: nowrap; }
      .pv .plate { position: absolute; left: ${M}px; right: ${M}px; top: ${FIELD_H + 50}px; bottom: 64px; display: flex; flex-direction: column; justify-content: space-between; gap: 48px; }
      .pv .date { font-size: 46px; font-weight: 400; line-height: 1; white-space: nowrap; opacity: 0.86; }
      .pv .now { display: flex; align-items: baseline; gap: 40px; white-space: nowrap; }
      .pv .temp { font-size: 164px; font-weight: 700; line-height: 0.74; letter-spacing: -0.04em; }
      .pv .cond { font-size: 60px; font-weight: 500; line-height: 1; }
      .pv .stats { display: flex; justify-content: space-between; column-gap: 48px; }
      .pv .stat span, .pv .fact span { display: block; font-size: 24px; font-weight: 500; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; white-space: nowrap; opacity: 0.72; }
      .pv .stat b { display: block; margin-top: 14px; font-size: 40px; font-weight: 500; line-height: 1; white-space: nowrap; }
      .pv .fact b { display: block; margin-top: 14px; font-size: 37px; font-weight: 500; line-height: 1.24; text-wrap: balance; max-height: ${Math.ceil(37 * 1.24 * 2) + 1}px; overflow: hidden; }
    `);
    const wrap = el("div", { class: "pv" });
    root.append(wrap);
    const field = canvas2d(wrap, { maxScale: 1.5, adaptive: true }); // 1.5 px per unit: crisp enough at 4K, and a third less to fill than 2

    const band = el("div", { class: "band" });
    const ampm = el("div", { class: "tab" }); // AM/PM: a tab of the block, standing up beside the minutes
    const date = el("div", { class: "date" });
    const temp = el("div", { class: "temp" });
    const cond = el("div", { class: "cond" });
    const stat = (label) => {
      const span = el("span", { text: label });
      const b = el("b", {});
      return { node: el("div", { class: "stat" }, span, b), span, b };
    };
    const sSun = stat("");
    const sMoon = stat("Moon");
    const sAir = stat("AQI");
    const sUv = stat("UV index");
    const factLabel = el("span", {});
    const factValue = el("b", {});
    const fact = el("div", { class: "fact" }, factLabel, factValue);
    wrap.append(
      band,
      ampm,
      el("div", { class: "plate" },
        date,
        el("div", { class: "now" }, temp, cond),
        el("div", { class: "stats" }, sSun.node, sMoon.node, sAir.node, sUv.node),
        fact),
    );
    grain(wrap, { opacity: 0.045 });

    // ---- the digits, as a coarse grid of coverage the lines read their weight from ----
    // Every figure is the same size at every hour: the size at which the widest
    // pair of digits just fills the width.
    let digitSize = 0;
    let rowCap = 0;
    function digits(hh, mm, blur) {
      return mask(MC, MR, (ctx) => {
        ctx.textBaseline = "alphabetic";
        if (!digitSize) {
          ctx.font = `100px "Archivo Black"`;
          let widest = 1;
          for (let n = 0; n < 60; n++) widest = Math.max(widest, ctx.measureText(String(n).padStart(2, "0")).width);
          const capMax = (FIELD_H - TAB_H - 42 - ROW_TOP - ROW_GAP) / 2;
          digitSize = Math.min(capMax / CAP, ((W - 140) * 100) / widest);
          rowCap = digitSize * CAP;
        }
        ctx.font = `${digitSize / CELL}px "Archivo Black"`;
        ctx.filter = `blur(${blur}px)`; // soft edges: the lines swell into the figures, they do not step
        ctx.fillText(hh, 66 / CELL, (ROW_TOP + rowCap) / CELL);
        ctx.fillText(mm, 66 / CELL, (ROW_TOP + rowCap + ROW_GAP + rowCap) / CELL);
      });
    }
    let cur = null; // the mask in force
    let old = null; // the one it is replacing, while the front crosses
    // A wide blur of the same figures: where the lines go taut. Blurred here in
    // plain arithmetic (two box passes each way) rather than by the canvas, so a
    // fast-running clock that changes the minute every frame stays cheap.
    const halo = { cols: MC, rows: MR, data: new Uint8Array(MC * MR) };
    const blurA = new Float32Array(MC * MR);
    const blurB = new Float32Array(MC * MR);
    const boxPass = (src, dst, len, count, stride, step, r) => {
      // a running-sum box blur of radius r along `count` rows of `len` cells
      const inv = 1 / (2 * r + 1);
      for (let row = 0; row < count; row++) {
        const base = row * stride;
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += src[base + clamp(k, 0, len - 1) * step];
        for (let k = 0; k < len; k++) {
          dst[base + k * step] = acc * inv;
          acc += src[base + Math.min(len - 1, k + r + 1) * step] - src[base + Math.max(0, k - r) * step];
        }
      }
    };
    const makeHalo = (m) => {
      const d = m.data;
      for (let i = 0; i < d.length; i++) blurA[i] = d[i];
      for (let pass = 0; pass < 2; pass++) {
        boxPass(blurA, blurB, MC, MR, MC, 1, 6); // along rows
        boxPass(blurB, blurA, MR, MC, 1, MC, 6); // down columns
      }
      const h = halo.data;
      for (let i = 0; i < h.length; i++) h[i] = blurA[i] > 255 ? 255 : blurA[i];
    };
    let maskKey = "";
    const coverage = (m, x, y) => {
      // bilinear lookup, 0..1
      const fx = x / CELL - 0.5;
      const fy = y / CELL - 0.5;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      if (x0 < 0 || y0 < 0 || x0 >= MC - 1 || y0 >= MR - 1) return 0;
      const tx = fx - x0;
      const ty = fy - y0;
      const i = y0 * MC + x0;
      const d = m.data;
      return ((d[i] * (1 - tx) + d[i + 1] * tx) * (1 - ty) + (d[i + MC] * (1 - tx) + d[i + MC + 1] * tx) * ty) / 255;
    };
    const nearest = (m, x, y) => {
      const c = (x / CELL) | 0;
      const r = (y / CELL) | 0;
      if (x < 0 || y < 0 || c >= MC || r >= MR) return 0;
      return m.data[r * MC + c] / 255;
    };

    // ---- the lines ----
    const r = rng(seed);
    const SPAN = Math.hypot(W, FIELD_H) + 80; // long enough at any angle
    const HALF = SPAN / 2;
    const N = Math.ceil(SPAN / PITCH) + 2;
    const SAMPLES = Math.ceil(SPAN / STEP) + 1;
    // Per line: where it sits in each wave. Neighbours move almost together, so
    // the field heaves as one cloth. Kept as sines and cosines so that nothing
    // in the inner loop has to call one.
    const phase = new Float32Array(N);
    const c1 = new Float32Array(N);
    const s1 = new Float32Array(N);
    const c2 = new Float32Array(N);
    const s2 = new Float32Array(N);
    const cg = new Float32Array(N);
    const sg = new Float32Array(N);
    const ch = new Float32Array(N);
    const sh = new Float32Array(N);
    const cb = new Float32Array(N);
    const sb = new Float32Array(N);
    const shift = new Float32Array(N); // where this line's dashes or beads start
    const pace = new Float32Array(N); // and how fast they run, relative to the others
    for (let i = 0; i < N; i++) {
      phase[i] = i * 0.34 + r.range(-0.1, 0.1);
      c1[i] = Math.cos(phase[i]);
      s1[i] = Math.sin(phase[i]);
      c2[i] = Math.cos(phase[i] * 1.6);
      s2[i] = Math.sin(phase[i] * 1.6);
      cg[i] = Math.cos(i * 0.085);
      sg[i] = Math.sin(i * 0.085);
      ch[i] = Math.cos(i * 0.9);
      sh[i] = Math.sin(i * 0.9);
      cb[i] = Math.cos(i * 0.16);
      sb[i] = Math.sin(i * 0.16);
      shift[i] = r.range(0, 400);
      pace[i] = r.range(0.82, 1.18);
    }
    // Per sample along a line, refilled each frame.
    const W1s = new Float32Array(SAMPLES);
    const W1c = new Float32Array(SAMPLES);
    const W2s = new Float32Array(SAMPLES);
    const W2c = new Float32Array(SAMPLES);
    const Gs = new Float32Array(SAMPLES);
    const Gc = new Float32Array(SAMPLES);
    const Hs = new Float32Array(SAMPLES);
    const Hc = new Float32Array(SAMPLES);
    const Bs = new Float32Array(SAMPLES);
    const Bc = new Float32Array(SAMPLES);
    const FRONT = new Float32Array(SAMPLES); // how far the new minute has arrived here, 0..1
    const HUMP = new Float32Array(SAMPLES); // the shear the front carries

    // Still air: one bead per lattice point, sorted by color band and width before drawing.
    const MAXB = 8000;
    const NKEY = BANDS * NBUCKET;
    const beadXY = new Float32Array(MAXB * 4);
    const beadB = new Uint16Array(MAXB);
    const beadOrder = new Uint16Array(MAXB);
    const bucketN = new Uint32Array(NKEY);

    let angle = null; // direction the air is moving, radians, screen coordinates
    let travel = 0; // how far the waves have run, px
    let slide = 0; // how far the rain or snow has run along the lines, px
    let frontAt = -1e9; // animation time the last minute's front set off
    let lastMs = 0;
    const shown = {};
    const put = (key, node, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };
    const bandInk = new Array(BANDS).fill("#000"); // the lines: a sweep of the sky's colors, west to east, in bands
    const bandX = new Float32Array(BANDS + 1); // band edges, on whole device pixels
    // Every ribbon of the frame, kept so each band can be filled in one pass.
    const RA = new Float32Array(N * SAMPLES * 4); // per sample: ax, ay, bx, by
    const RLo = new Uint8Array(N * SAMPLES); // and the bands its width reaches across
    const RHi = new Uint8Array(N * SAMPLES);
    const RN = new Uint16Array(N); // samples kept per line
    // Snow beads, likewise.
    const SMAX = 16000;
    const snowXYR = new Float32Array(SMAX * 3);
    const snowB = new Uint8Array(SMAX);
    let murkX = 0;
    let murkY = 0;

    // ---- this frame's numbers, shared by the passes below ----
    let dx = 1, dy = 0, nx = 0, ny = 1;
    let k1 = 0, k2 = 0, kg = 0, amp = 0, heat = 0, murk = 0, frontS = 0, frontOn = false, now = 0;
    const cx = W / 2;
    const cy = FIELD_H / 2;
    // The part of line `i` inside the frame, as a range of distance along it.
    let lo = 0, hi = 0;
    const span = (off) => {
      const m = 44;
      const ox = cx + nx * off;
      const oy = cy + ny * off;
      lo = -HALF;
      hi = HALF;
      if (Math.abs(dx) > 1e-5) {
        const a = (-m - ox) / dx;
        const b = (W + m - ox) / dx;
        lo = Math.max(lo, Math.min(a, b));
        hi = Math.min(hi, Math.max(a, b));
      } else if (ox < -m || ox > W + m) return false;
      if (Math.abs(dy) > 1e-5) {
        const a = (-m - oy) / dy;
        const b = (FIELD_H + m - oy) / dy;
        lo = Math.max(lo, Math.min(a, b));
        hi = Math.min(hi, Math.max(a, b));
      } else if (oy < -m || oy > FIELD_H + m) return false;
      return hi > lo;
    };
    // The same sideways displacement the ribbons use, at any point of any line.
    const dispAt = (sd, i, taut) => {
      const u = sd + CHIRP * sd * sd;
      const env = 0.6 + 0.4 * Math.sin(kg * (sd - travel * 0.7) + i * 0.085);
      let d = amp * env * taut * (Math.sin(k1 * (u - travel) + phase[i]) + 0.4 * Math.sin(k2 * (u - travel * 1.3) + phase[i] * 1.6));
      if (heat) d += heat * Math.sin(sd * 0.19 + now * 3.1 + i * 0.9);
      if (frontOn) {
        const f = (sd - frontS) / FRONT_W;
        d += PITCH * 0.5 * Math.exp(-f * f * 1.6) * (1.6 - taut);
      }
      return d;
    };
    const covAt = (x, y, sd) => {
      if (!frontOn) return coverage(cur, x, y);
      const f = 1 - smoothstep(-WIPE, WIPE, (sd - frontS) / FRONT_W);
      if (f >= 1) return coverage(cur, x, y);
      if (f <= 0) return coverage(old, x, y);
      return lerp(coverage(old, x, y), coverage(cur, x, y), f);
    };
    const fadeAt = (x, y) => {
      // fog: the lines thin away toward the edges of the field
      if (!murk) return 1;
      const ex = (x - cx) * murkX;
      const ey = (y - cy) * murkY;
      return 1 - murk * smoothstep(0.3, 1.05, Math.sqrt(ex * ex + ey * ey));
    };
    const swell = (cov) => {
      const t = cov < 0.14 ? 0 : cov > 0.86 ? 1 : (cov - 0.14) / 0.72;
      return t * t * (3 - 2 * t);
    };

    return {
      frame(s) {
        const w = s.weather;
        const tx = s.text;
        const jumped = Math.abs(s.ms - lastMs) > 5000;
        lastMs = s.ms;
        now = s.t;

        // ---- the time, as a mask; a new minute is carried in by a front running downwind ----
        const key = `${tx.hh}|${tx.mm}`;
        if (key !== maskKey) {
          old = maskKey && !jumped ? cur : null;
          cur = digits(tx.hh, tx.mm, 1.5); // mask() returns fresh data each time, so both can be held
          makeHalo(cur);
          frontAt = old ? s.t : -1e9;
          maskKey = key;
        }
        if (jumped) old = null;
        frontS = -HALF - FRONT_W * 1.3 + (s.t - frontAt) * 480;
        frontOn = old != null && frontS < HALF + FRONT_W * 1.3;
        if (!frontOn) old = null;

        // ---- colors: the sky's own, as ink on paper by day; as light on black at night ----
        const day = smoothstep(0.4, 0.6, s.daylight);
        const sk = s.sky;
        const tq = Math.round((w.live ? w.temp : 50) / 3);
        const ck = `${sk.west}${sk.northWest}${sk.northEast}${sk.east}${Math.round(day * 60)}|${tq}`;
        if (shown.colors !== ck) {
          shown.colors = ck;
          const paper = mix("#f5f2e9", sk.mean, 0.15);
          const ground = mix("#050609", paper, day);
          const gl = toOklch(ground).l;
          const dark = gl < 0.56; // the ink flips while the ground is mid-grey, and is at its strongest either side
          // At night the measured sky is nearly colourless, so the air's warmth tints
          // the light lines: steel on a bitter night, parchment when mild, amber when hot.
          const tc = tq * 3;
          const tint = tc < 52 ? mix("#a9c3e2", "#cdbfa6", smoothstep(16, 50, tc)) : mix("#cdbfa6", "#e2ae7e", smoothstep(56, 82, tc));
          const stops = [sk.west, sk.northWest, sk.northEast, sk.east].map((c, i) =>
            dark
              ? adjust(mix(c, tint, 0.6), { l: lerp(0.6, 0.95, clamp(gl / 0.56)), c: (v) => clamp(v * 1.5, 0.03, 0.1) })
              : adjust(c, { l: lerp(0.12, 0.36, clamp((gl - 0.56) / 0.36)) + 0.018 * i, c: (v) => Math.min(0.19, v * 1.7 + 0.022) }),
          );
          // The sweep of the four samples, west to east, cut into vertical bands of
          // solid color (a gradient fill over a hundred ribbons is several times
          // dearer to rasterize than a flat one).
          for (let k = 0; k < BANDS; k++) {
            const t = (k + 0.5) / BANDS;
            const at = clamp((t - 0.04) / 0.92) * 3;
            const a = Math.min(2, Math.floor(at));
            bandInk[k] = mix(stops[a], stops[a + 1], at - a);
          }
          // The block: the sky's own color, deep. By day a strong ink (navy under a blue sky,
          // slate under cloud); at night the same hue sunk almost to black, never plain black.
          const sm = toOklch(sk.mean);
          const night = oklch(0.17, clamp(sm.c * 1.1, 0.028, 0.05), sm.c < 0.012 ? 262 : sm.h); // a grey sky has no hue worth keeping: ink blue
          const block = mix(night, adjust(sk.mean, { l: 0.26, c: (v) => Math.min(0.13, v * 1.4 + 0.012) }), day);
          wrap.style.background = ground;
          band.style.background = block;
          ampm.style.background = block;
        }

        // ---- the wind ----
        const live = w.live;
        const from = (w.windDir * Math.PI) / 180;
        const want = live ? Math.atan2(Math.cos(from), -Math.sin(from)) : Math.PI / 2; // where the air is going; no reading: plumb
        if (angle == null || jumped) angle = want;
        else {
          let d = want - angle;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          angle += d * (1 - Math.pow(0.5, s.dt / 4));
        }
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        nx = -dy; // across the lines
        ny = dx;
        const mph = live ? w.wind : 0;
        const speed = live ? 8 + 4.4 * Math.pow(mph, 0.94) : 0; // px per second the waves run downwind
        travel += speed * s.dt;
        const gusty = clamp((w.gust - w.wind) / 20);
        const blow = clamp(mph / 30);
        const stir = smoothstep(1.5, 5, mph); // below a couple of mph the lines lie straight
        amp = stir * (1.5 + 6 * blow + 9 * gusty * (0.62 + 0.38 * Math.sin(s.t * 0.21))); // capped: it never thrashes
        heat = live ? smoothstep(84, 98, w.feels) * 1.9 : 0;
        k1 = TAU / (340 - 120 * blow);
        k2 = k1 * 2.3;
        kg = TAU / 880;
        const kb = TAU / 640;
        const falling = live ? w.falling : null;
        const snow = falling === "snow";
        const rain = falling != null && !snow;
        const hard = clamp(w.intensity);
        // Still air: the lines come apart into a lattice of beads.
        const still = live && !falling ? 1 - smoothstep(1.2, 4, mph) : 0;
        murk = live ? (w.fog ? 0.94 : 0.5 * smoothstep(1.5, 0.2, w.visibility)) : 0;
        murkX = 1 / (W * 0.62);
        murkY = 1 / (FIELD_H * 0.6);
        const thin = lerp(0.105, 0.17, smoothstep(18, 88, w.temp)); // hairlines in the cold
        const breathe = speed < 20 ? 0.15 : 0.05; // the weave inside the figures swells and eases, most when nothing else moves
        slide += (snow ? 14 + speed * 0.4 : Math.min(250, 70 + speed * 1.15 + 90 * hard)) * s.dt;
        const period = snow ? lerp(36, 25, hard) : lerp(150, 84, hard);
        const fill = lerp(0.36, 0.68, hard); // share of a streak's period that is ink

        // ---- everything that depends only on distance along a line ----
        for (let j = 0; j < SAMPLES; j++) {
          const sd = -HALF + j * STEP;
          const u = sd + CHIRP * sd * sd;
          const p1 = k1 * (u - travel);
          const p2 = k2 * (u - travel * 1.3);
          W1s[j] = Math.sin(p1);
          W1c[j] = Math.cos(p1);
          W2s[j] = Math.sin(p2);
          W2c[j] = Math.cos(p2);
          const pg = kg * (sd - travel * 0.7);
          Gs[j] = Math.sin(pg);
          Gc[j] = Math.cos(pg);
          const pb = kb * sd - s.t * 0.55;
          Bs[j] = Math.sin(pb);
          Bc[j] = Math.cos(pb);
          if (heat) {
            const ph = sd * 0.19 + s.t * 3.1;
            Hs[j] = Math.sin(ph);
            Hc[j] = Math.cos(ph);
          }
          if (frontOn) {
            const f = (sd - frontS) / FRONT_W;
            FRONT[j] = 1 - smoothstep(-WIPE, WIPE, f); // a crisp wipe: the figures are never a blend of two minutes
            HUMP[j] = PITCH * 0.5 * Math.exp(-f * f * 1.6);
          }
        }

        const { ctx } = field;
        ctx.clearRect(0, 0, W, FIELD_H + 4); // nothing is ever drawn below the field
        // Band edges on whole device pixels, so neighbouring bands meet without a seam.
        const ratio = field.ratio;
        for (let k = 0; k <= BANDS; k++) bandX[k] = Math.round(((k * W) / BANDS) * ratio) / ratio;
        bandX[0] = -60;
        bandX[BANDS] = W + 60;
        const toBand = BANDS / W;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, FIELD_H);
        ctx.clip();
        const halfPitch = PITCH / 2;

        if (still > 0.02) {
          // ---- still air: beads on a lattice, big where the time is. As the air
          // starts to move they draw out into dashes and join up into lines.
          // Each bead is a short round-capped stroke; beads are sorted by color
          // band and size so the whole lattice is a few dozen strokes. ----
          const reach = Math.max(0.01, halfPitch * (1 - still) * 1.04); // half the straight part of a bead
          const small = lerp(thin, 0.25, still);
          let nb = 0;
          bucketN.fill(0);
          for (let i = 0; i < N; i++) {
            const off = (i - (N - 1) / 2) * PITCH;
            if (!span(off)) continue;
            const kTo = Math.floor(hi / PITCH);
            for (let k = Math.ceil(lo / PITCH); k <= kTo && nb < MAXB; k++) {
              const sd = k * PITCH;
              const px = cx + dx * sd + nx * off;
              const py = cy + dy * sd + ny * off;
              const taut = 1 - TAUT * nearest(halo, px, py);
              const d = amp || frontOn ? dispAt(sd, i, taut) : 0;
              const qx = px + nx * d;
              const qy = py + ny * d;
              const sw = swell(covAt(qx, qy, sd));
              const pulse = 1 - breathe * (0.5 + 0.5 * Math.sin(kb * sd - s.t * 0.55 + i * 0.16));
              const b = Math.round((halfPitch * lerp(small * fadeAt(qx, qy), THICK * pulse, sw)) / BEAD_Q);
              if (b < 1) continue;
              const band = clamp((qx * toBand) | 0, 0, BANDS - 1);
              const key = band * NBUCKET + Math.min(NBUCKET - 1, b);
              const q = nb * 4;
              beadXY[q] = qx - dx * reach;
              beadXY[q + 1] = qy - dy * reach;
              beadXY[q + 2] = qx + dx * reach;
              beadXY[q + 3] = qy + dy * reach;
              beadB[nb++] = key;
              bucketN[key]++;
            }
          }
          // counting sort by band and width
          for (let key = 0, at = 0; key < NKEY; key++) {
            const c = bucketN[key];
            bucketN[key] = at;
            at += c;
          }
          for (let n = 0; n < nb; n++) beadOrder[bucketN[beadB[n]]++] = n;
          ctx.lineCap = "round";
          let n = 0;
          while (n < nb) {
            const key = beadB[beadOrder[n]];
            ctx.strokeStyle = bandInk[(key / NBUCKET) | 0];
            ctx.lineWidth = 2 * (key % NBUCKET) * BEAD_Q;
            ctx.beginPath();
            while (n < nb && beadB[beadOrder[n]] === key) {
              const q = beadOrder[n++] * 4;
              ctx.moveTo(beadXY[q], beadXY[q + 1]);
              ctx.lineTo(beadXY[q + 2], beadXY[q + 3]);
            }
            ctx.stroke();
          }
        } else {
          // ---- moving air: ribbons. Each line is built once, then each color band
          // fills the stretches of every line that reach into it, clipped to its
          // edges; the stretches overlap, so neighbouring bands meet without a gap. ----
          const outside = snow ? 0 : rain ? thin * 1.35 : thin; // in snow the thin lines are beads, drawn below
          for (let i = 0; i < N; i++) {
            RN[i] = 0;
            const off = (i - (N - 1) / 2) * PITCH;
            if (!span(off)) continue;
            const j0 = Math.max(0, Math.floor((lo + HALF) / STEP));
            const j1 = Math.min(SAMPLES - 1, Math.ceil((hi + HALF) / STEP));
            const run = rain ? shift[i] - slide * pace[i] : 0;
            const base = i * SAMPLES;
            let n = 0;
            for (let j = j0; j <= j1; j++) {
              const sd = -HALF + j * STEP;
              const px = cx + dx * sd + nx * off;
              const py = cy + dy * sd + ny * off;
              const near = nearest(halo, px, py);
              // Thick line is stiff line: the waves ease off where the figures are.
              let disp = amp * (1 - TAUT * near) * (0.6 + 0.4 * (Gs[j] * cg[i] + Gc[j] * sg[i])) * (W1s[j] * c1[i] + W1c[j] * s1[i] + 0.4 * (W2s[j] * c2[i] + W2c[j] * s2[i]));
              if (heat) disp += heat * (Hs[j] * ch[i] + Hc[j] * sh[i]);
              if (frontOn) disp += HUMP[j] * (0.6 + 0.6 * near);
              const qx = px + nx * disp;
              const qy = py + ny * disp;
              let cov;
              if (frontOn) {
                const f = FRONT[j];
                cov = f >= 1 ? coverage(cur, qx, qy) : f <= 0 ? coverage(old, qx, qy) : lerp(coverage(old, qx, qy), coverage(cur, qx, qy), f);
              } else cov = coverage(cur, qx, qy);
              const sw = swell(cov);
              let lean = outside;
              if (sw < 1 && lean) {
                if (rain) {
                  // A streak: fine at its tail, full at its head, then a gap.
                  const g = (((sd + run) % period) + period) % period / period / fill;
                  lean *= g >= 1 ? 0 : Math.min(g / 0.55, 1, (1 - g) / 0.12);
                }
                if (murk) lean *= fadeAt(qx, qy);
              }
              const pulse = 1 - breathe * (0.5 + 0.5 * (Bs[j] * cb[i] + Bc[j] * sb[i]));
              const half = halfPitch * (lean + (THICK * pulse - lean) * sw);
              const q = (base + n) * 4;
              const ex = nx * half;
              RA[q] = qx + ex;
              RA[q + 1] = qy + ny * half;
              RA[q + 2] = qx - ex;
              RA[q + 3] = qy - ny * half;
              const xl = ex < 0 ? qx + ex : qx - ex;
              const xr = ex < 0 ? qx - ex : qx + ex;
              RLo[base + n] = xl <= 0 ? 0 : xl * toBand >= BANDS ? BANDS - 1 : (xl * toBand) | 0;
              RHi[base + n] = xr <= 0 ? 0 : xr * toBand >= BANDS ? BANDS - 1 : (xr * toBand) | 0;
              n++;
            }
            RN[i] = n;
          }
          for (let k = 0; k < BANDS; k++) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(bandX[k], -60, bandX[k + 1] - bandX[k], FIELD_H + 120);
            ctx.clip();
            ctx.beginPath();
            let any = false;
            for (let i = 0; i < N; i++) {
              const n = RN[i];
              if (n < 2) continue;
              const base = i * SAMPLES;
              let j = 0;
              while (j < n) {
                if (RLo[base + j] > k || RHi[base + j] < k) {
                  j++;
                  continue;
                }
                let e = j;
                while (e + 1 < n && RLo[base + e + 1] <= k && RHi[base + e + 1] >= k) e++;
                // the stretch that reaches into this band, and one sample either side to reach its edges
                const a0 = j > 0 ? j - 1 : 0;
                const a1 = e + 1 < n ? e + 1 : e;
                let q = (base + a0) * 4;
                ctx.moveTo(RA[q], RA[q + 1]);
                for (let m = a0 + 1; m <= a1; m++) {
                  q = (base + m) * 4;
                  ctx.lineTo(RA[q], RA[q + 1]);
                }
                for (let m = a1; m >= a0; m--) {
                  q = (base + m) * 4;
                  ctx.lineTo(RA[q + 2], RA[q + 3]);
                }
                ctx.closePath();
                any = true;
                j = e + 1;
              }
            }
            if (any) {
              ctx.fillStyle = bandInk[k];
              ctx.fill();
            }
            ctx.restore();
          }

          if (snow) {
            // ---- snow: beads sliding down the lines, of all sizes, thinning out into the figures ----
            const size = lerp(3.1, 4.3, hard);
            let ns = 0;
            for (let i = 0; i < N; i++) {
              const off = (i - (N - 1) / 2) * PITCH;
              if (!span(off)) continue;
              const run = shift[i] + slide * pace[i];
              const kTo = Math.floor((hi - run) / period);
              for (let k = Math.ceil((lo - run) / period); k <= kTo && ns < SMAX; k++) {
                const sd = k * period + run;
                const px = cx + dx * sd + nx * off;
                const py = cy + dy * sd + ny * off;
                const d = dispAt(sd, i, 1 - TAUT * nearest(halo, px, py));
                const qx = px + nx * d;
                const qy = py + ny * d;
                const sw = swell(covAt(qx, qy, sd));
                if (sw > 0.6) continue;
                const rad = size * (0.55 + 0.75 * hash(i, k)) * (1 - sw / 0.6) * fadeAt(qx, qy);
                if (rad < 0.3) continue;
                snowXYR[ns * 3] = qx;
                snowXYR[ns * 3 + 1] = qy;
                snowXYR[ns * 3 + 2] = rad;
                snowB[ns++] = clamp((qx * toBand) | 0, 0, BANDS - 1);
              }
            }
            for (let k = 0; k < BANDS; k++) {
              ctx.beginPath();
              let any = false;
              for (let m = 0; m < ns; m++) {
                if (snowB[m] !== k) continue;
                const qx = snowXYR[m * 3];
                const qy = snowXYR[m * 3 + 1];
                const rad = snowXYR[m * 3 + 2];
                ctx.moveTo(qx + rad, qy);
                ctx.arc(qx, qy, rad, 0, TAU);
                any = true;
              }
              if (any) {
                ctx.fillStyle = bandInk[k];
                ctx.fill();
              }
            }
          }
        }
        ctx.restore();

        // Thunder: now and then the whole weave lifts, softly, and settles.
        let lift = 1;
        if (falling === "storm") {
          const c = (s.t + (seed % 17)) % 23;
          lift = 0.8 + 0.2 * (c < 0.5 ? c / 0.5 : Math.exp(-(c - 0.5) / 1.5));
        }
        const op = lift.toFixed(2);
        if (shown.lift !== op) {
          shown.lift = op;
          field.canvas.style.opacity = op;
        }

        // ---- type ----
        put("ampm", ampm, tx.ampm);
        const fresh = put("temp", temp, tx.temp);
        if (put("cond", cond, tx.condition) || fresh) fitText(cond, W - 2 * M - 40 - temp.offsetWidth, 60);
        if (put("date", date, tx.date)) fitText(date, W - 2 * M, 46);
        put("sunL", sSun.span, tx.sunLabel);
        put("sunV", sSun.b, tx.sunValue);
        put("moon", sMoon.b, tx.moon);
        put("aqi", sAir.b, tx.aqi);
        put("uv", sUv.b, tx.uv);
        put("factL", factLabel, tx.factLabel);
        put("factV", factValue, tx.factValue === "Witch Hazel" ? "Alfred Nobel Signs the Will That Establishes the Nobel Prizes in Paris, France, 1895" : tx.factValue); // QATEMP
        const factShow = tx.factValue ? "" : "none";
        if (shown.factShow !== factShow) {
          shown.factShow = factShow;
          fact.style.display = factShow;
        }
      },
    };
  },
};

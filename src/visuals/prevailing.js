// Prevailing: a field of parallel lines laid along the real wind. A west wind
// runs them left to right, a north wind top to bottom; waves travel down them
// at the wind's speed, and how much they heave is how gusty it is. In a calm
// they are ruler-straight. The time is not printed anywhere: the huge stacked
// digits appear because the lines swell in weight where they cross them. Rain
// breaks the lines into dashes that run downwind, snow into beads; fog takes
// the top of the field away; heat makes it shimmer. The lines take their
// colors from the measured sky.

import { W, clamp, lerp, smoothstep, mix, adjust, rgba, luminance, rng, el, addStyle, canvas2d, mask, grain, fitText } from "../lib/kit.js";

const FIELD_H = 1436; // the lines cover the frame down to here; type sits below
const PITCH = 21; // distance between lines
const STEP = 12; // sampling along a line
const CELL = 4; // the digit mask is this coarse
const MC = Math.ceil(W / CELL);
const MR = Math.ceil(FIELD_H / CELL);
const THIN = 0.13; // line weight (share of the pitch) outside the digits
const THICK = 0.88; // and inside them
const M = 72;

export default {
  title: "Prevailing",
  description: "Lines laid along the real wind, heaving with its gusts; the time is where they swell.",
  fonts: ["Archivo Black", "Space Grotesk:wght@400;500;700"],
  fps: 30,

  mount(root, { seed }) {
    addStyle(root, `
      .pv { position: absolute; inset: 0; font-family: "Space Grotesk", sans-serif; }
      .pv .ampm { position: absolute; right: 64px; top: 1170px; font-family: "Archivo Black", sans-serif; font-size: 104px; line-height: 1; padding: 14px 20px 10px; white-space: nowrap; }
      .pv .plate { position: absolute; left: ${M}px; right: ${M}px; top: ${FIELD_H + 30}px; }
      .pv .top { display: flex; justify-content: space-between; align-items: baseline; }
      .pv .date { font-size: 46px; font-weight: 500; line-height: 1; white-space: nowrap; }
      .pv .wind { font-size: 30px; font-weight: 500; line-height: 1; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
      .pv .now { display: flex; align-items: baseline; gap: 26px; margin-top: 22px; white-space: nowrap; }
      .pv .temp { font-size: 112px; font-weight: 700; line-height: 0.82; letter-spacing: -0.03em; }
      .pv .cond { font-size: 54px; font-weight: 500; line-height: 1; }
      .pv .stats { display: flex; justify-content: space-between; margin-top: 26px; }
      .pv .stat span, .pv .fact span { display: block; font-size: 24px; font-weight: 500; letter-spacing: 0.13em; text-transform: uppercase; white-space: nowrap; opacity: 0.74; }
      .pv .stat b { display: block; margin-top: 8px; font-size: 40px; font-weight: 500; line-height: 1; white-space: nowrap; }
      .pv .fact { margin-top: 24px; }
      .pv .fact b { display: block; margin-top: 8px; font-size: 38px; font-weight: 500; line-height: 1.12; text-wrap: balance; max-height: 86px; overflow: hidden; }
    `);
    const wrap = el("div", { class: "pv" });
    root.append(wrap);
    const field = canvas2d(wrap, { maxScale: 2, adaptive: true });

    const ampm = el("div", { class: "ampm" }); // a solid tag set into the field, beside the minutes
    wrap.append(ampm);
    const date = el("div", { class: "date" });
    const wind = el("div", { class: "wind" });
    const temp = el("div", { class: "temp" });
    const cond = el("div", { class: "cond" });
    const stat = (label) => {
      const span = el("span", { text: label });
      const b = el("b", {});
      return { node: el("div", { class: "stat" }, span, b), span, b };
    };
    const sSun = stat("");
    const sMoon = stat("Moon");
    const sAir = stat("Air quality");
    const sUv = stat("UV index");
    const factLabel = el("span", {});
    const factValue = el("b", {});
    const fact = el("div", { class: "fact" }, factLabel, factValue);
    wrap.append(
      el("div", { class: "plate" },
        el("div", { class: "top" }, date, wind),
        el("div", { class: "now" }, temp, cond),
        el("div", { class: "stats" }, sSun.node, sMoon.node, sAir.node, sUv.node),
        fact),
    );
    grain(wrap, { opacity: 0.045 });

    // ---- the digits, as a coarse grid of coverage the lines read their weight from ----
    function digits(hh, mm) {
      return mask(MC, MR, (ctx) => {
        ctx.textBaseline = "alphabetic";
        const left = 70 / CELL;
        const maxW = (W - 140 - 230) / CELL; // both rows keep clear of the AM/PM tag at the right
        const row = (text, top, bottom) => {
          // Sized so the figures fill the row's height, narrowed if they would run wide.
          let size = (bottom - top) / 0.72;
          ctx.font = `${size}px "Archivo Black"`;
          const w = ctx.measureText(text).width;
          if (w > maxW) {
            size *= maxW / w;
            ctx.font = `${size}px "Archivo Black"`;
          }
          ctx.fillText(text, left, bottom - (bottom - top - size * 0.72) / 2);
        };
        row(hh, 96 / CELL, 668 / CELL);
        row(mm, 748 / CELL, 1320 / CELL);
      });
    }
    let cur = null; // the mask in force
    let old = null; // the one it is replacing, while they cross over
    let cross = 1;
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

    // ---- the lines ----
    const r = rng(seed);
    const SPAN = Math.hypot(W, FIELD_H) + 80; // long enough at any angle
    const N = Math.ceil(SPAN / PITCH) + 2;
    const SAMPLES = Math.ceil(SPAN / STEP) + 1;
    const phase = new Float32Array(N);
    const dashShift = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // Neighbouring lines move almost together, so the field heaves as one cloth.
      phase[i] = i * 0.34 + r.range(-0.12, 0.12);
      dashShift[i] = r.range(0, 400);
    }
    const ax = new Float32Array(SAMPLES); // one edge of the ribbon being built
    const ay = new Float32Array(SAMPLES);
    const bx = new Float32Array(SAMPLES); // the other edge
    const by = new Float32Array(SAMPLES);

    let angle = null; // direction the air is moving, radians, screen coordinates
    let travel = 0; // how far the waves have run, px
    let pulseAt = -1e9; // animation time of the last minute's gust
    let lastMs = 0;
    const shown = {};
    const put = (key, node, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };
    let colors = ["#000", "#000", "#000", "#000"];
    let ground = "#000";
    let veil = null; // fog: the ground color fading down the field

    return {
      frame(s) {
        const w = s.weather;
        const tx = s.text;
        const jumped = Math.abs(s.ms - lastMs) > 5000;
        lastMs = s.ms;

        // ---- the time, as a mask; a new minute crosses over and sends a gust down the lines ----
        const key = `${tx.hh}|${tx.mm}`;
        if (key !== maskKey) {
          old = cur;
          cur = digits(tx.hh, tx.mm);
          // mask() reuses one canvas but returns fresh data each time, so both can be held.
          cross = old && !jumped ? 0 : 1;
          if (maskKey && !jumped) pulseAt = s.t;
          maskKey = key;
        }
        cross = Math.min(1, cross + s.dt / 1.4);
        const blend = cross * cross * (3 - 2 * cross);

        // ---- colors: the sky's own, darkened on paper by day; dim on black at night ----
        const day = smoothstep(0.4, 0.6, s.daylight);
        const ck = `${s.sky.west}${s.sky.northWest}${s.sky.northEast}${s.sky.east}${Math.round(day * 40)}${w.fog ? 1 : 0}`;
        if (shown.colors !== ck) {
          shown.colors = ck;
          const paper = mix("#f4f1e8", s.sky.mean, 0.16);
          ground = mix("#06070a", paper, day);
          const dark = luminance(ground) < 0.2;
          colors = [s.sky.west, s.sky.northWest, s.sky.northEast, s.sky.east].map((c, i) =>
            dark
              ? adjust(mix(c, "#b8ae9c", 0.55), { l: 0.6 + 0.03 * i, c: (v) => Math.max(v, 0.035) })
              : adjust(c, { l: 0.3 + 0.045 * i, c: (v) => Math.min(0.2, v * 1.5 + 0.05) }),
          );
          wrap.style.background = ground;
          wrap.style.color = dark ? "#ece7dc" : "#14161b";
          ampm.style.background = ground;
          ampm.style.color = colors[1];
          veil = field.ctx.createLinearGradient(0, 0, 0, FIELD_H);
          veil.addColorStop(0, ground);
          veil.addColorStop(1, rgba(ground, 0));
        }

        // ---- the wind ----
        const from = (w.windDir * Math.PI) / 180;
        const want = Math.atan2(Math.cos(from), -Math.sin(from)); // where the air is going
        if (angle == null || jumped) angle = want;
        else {
          let d = want - angle;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          angle += d * (1 - Math.pow(0.5, s.dt / 4));
        }
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const speed = 10 + w.wind * 5.5; // px per second the waves run downwind
        travel += speed * s.dt;
        const gusty = clamp((w.gust - w.wind) / 18);
        const blow = clamp(w.wind / 28);
        const calm = smoothstep(1.5, 5, w.wind); // below a couple of mph the lines lie straight
        const amp = calm * (2 + 7 * blow + 11 * gusty * (0.65 + 0.35 * Math.sin(s.t * 0.21)));
        const heat = smoothstep(84, 98, w.feels) * 1.6;
        const k1 = (2 * Math.PI) / (330 - 110 * blow);
        const k2 = k1 * 2.3;
        // The minute's gust: one hump running the length of the lines.
        const pulseS = -SPAN / 2 + (s.t - pulseAt) * 620;
        const pulseOn = pulseS < SPAN / 2 + 300;

        // Rain breaks the lines into dashes, snow into beads, both running downwind.
        const falling = w.falling;
        const snow = falling === "snow";
        const period = snow ? 30 : lerp(190, 84, clamp(w.intensity));
        const gapShare = falling ? (snow ? 0.52 : lerp(0.16, 0.42, clamp(w.intensity))) : 0;
        const run = snow ? travel * 0.35 : travel * 1.6 + s.t * 60;

        const { ctx } = field;
        field.clear();
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, FIELD_H);
        ctx.clip();
        const cx = W / 2;
        const cy = FIELD_H / 2;
        const nx = -dy; // across the lines
        const ny = dx;
        for (let c = 0; c < 4; c++) {
          ctx.fillStyle = colors[c];
          ctx.beginPath();
          for (let i = c; i < N; i += 4) {
            const off = (i - (N - 1) / 2) * PITCH;
            // Gusts pass over the field in broad patches.
            const swell = amp * (0.7 + 0.3 * Math.sin(i * 0.13 + s.t * 0.27));
            let n = 0;
            for (let j = 0; j < SAMPLES; j++) {
              const sd = -SPAN / 2 + j * STEP;
              const px = cx + dx * sd + nx * off;
              const py = cy + dy * sd + ny * off;
              if (px < -60 || px > W + 60 || py < -60 || py > FIELD_H + 60) {
                if (n > 1) {
                  // close the piece of ribbon that just left the frame
                  ctx.moveTo(ax[0], ay[0]);
                  for (let q = 1; q < n; q++) ctx.lineTo(ax[q], ay[q]);
                  for (let q = n - 1; q >= 0; q--) ctx.lineTo(bx[q], by[q]);
                  ctx.closePath();
                }
                n = 0;
                continue;
              }
              let disp = swell * (Math.sin(k1 * sd - k1 * travel + phase[i]) + 0.4 * Math.sin(k2 * sd - k2 * travel * 1.3 + phase[i] * 1.6));
              if (heat) disp += heat * Math.sin(sd * 0.21 + s.t * 5 + i * 0.5);
              if (pulseOn) {
                const u = (sd - pulseS) / 170;
                disp += 26 * Math.exp(-u * u);
              }
              const qx = px + nx * disp;
              const qy = py + ny * disp;
              let cov = coverage(cur, qx, qy);
              if (blend < 1 && old) cov = lerp(coverage(old, qx, qy), cov, blend);
              let half = (PITCH * lerp(THIN, THICK, cov)) / 2;
              if (gapShare && cov < 0.55) {
                // A gap in the line, with soft ends. Only outside the digits: the time stays whole.
                const g = (((sd + dashShift[i] - run) % period) + period) % period / period;
                const edge = Math.min(g, 1 - g) / (gapShare / 2);
                if (edge < 1) half *= edge < 0.7 ? 0 : (edge - 0.7) / 0.3;
              }
              ax[n] = qx + nx * half;
              ay[n] = qy + ny * half;
              bx[n] = qx - nx * half;
              by[n] = qy - ny * half;
              n++;
            }
            if (n > 1) {
              ctx.moveTo(ax[0], ay[0]);
              for (let q = 1; q < n; q++) ctx.lineTo(ax[q], ay[q]);
              for (let q = n - 1; q >= 0; q--) ctx.lineTo(bx[q], by[q]);
              ctx.closePath();
            }
          }
          ctx.fill();
        }
        if (w.fog) {
          // Fog takes the top of the field.
          ctx.globalAlpha = 0.78;
          ctx.fillStyle = veil;
          ctx.fillRect(0, 0, W, FIELD_H);
          ctx.globalAlpha = 1;
        }
        ctx.restore();

        // ---- type ----
        put("ampm", ampm, tx.ampm);
        if (put("date", date, tx.date)) fitText(date, W - 2 * M - 400);
        put("wind", wind, w.live ? `Wind ${w.windFrom} ${Math.round(w.wind)} mph` : "Wind –");
        put("temp", temp, tx.temp);
        if (put("cond", cond, tx.condition)) fitText(cond, W - 2 * M - 300);
        put("sunL", sSun.span, tx.sunLabel);
        put("sunV", sSun.b, tx.sunValue);
        put("moon", sMoon.b, tx.moon);
        put("aqi", sAir.b, tx.aqi);
        put("uv", sUv.b, tx.uv);
        put("factL", factLabel, tx.factLabel);
        put("factV", factValue, tx.factValue);
        const factShow = tx.factValue ? "" : "none";
        if (shown.factShow !== factShow) {
          shown.factShow = factShow;
          fact.style.display = factShow;
        }
      },
    };
  },
};

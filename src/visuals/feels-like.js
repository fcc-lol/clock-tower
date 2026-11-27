// Feels Like: a type specimen sheet in which the weather is the type designer.
// The whole page is set in one variable typeface (Roboto Flex) and the
// conditions set its axes: the temperature is the weight (frost-thin to
// heat-swollen), the humidity is the width (dry air is narrow, wet air is wide),
// and the wind leans every line the way it is blowing, harder in gusts. The
// paper and ink are picked by temperature; rain, snow and dust drift behind the
// type as punctuation. After a while the shape of the numerals says what it is
// like outside before any number is read.

import { W, H, TAU, clamp, lerp, remap, smoothstep, approach, mix, ramp, rgba, luminance, rng, createNoise, el, addStyle, canvas2d, grain, fitText } from "../lib/kit.js";

const M = 96; // side margin
const MEASURE = W - 2 * M;
const MAX_FIGURE = 600; // largest size of the time, px

// Paper and ink by temperature (deg F), day and night.
const T = (f) => clamp((f - 5) / 100);
const PAPER = ramp([[T(5), "#eef3f8"], [T(25), "#cfdae6"], [T(42), "#d8d5cc"], [T(58), "#efe6d1"], [T(72), "#f3cf46"], [T(86), "#f08b2d"], [T(100), "#e2452a"]]);
const INK = ramp([[T(5), "#1b2fc2"], [T(25), "#11265f"], [T(42), "#1b1b1c"], [T(58), "#1d1a15"], [T(72), "#15120c"], [T(86), "#1c0e06"], [T(100), "#150705"]]);
const NIGHT_INK = ramp([[T(5), "#b9ccff"], [T(25), "#b4c6e8"], [T(42), "#d5d2c8"], [T(58), "#eadfc6"], [T(72), "#f2d36a"], [T(86), "#ff9d57"], [T(100), "#ff7858"]]);
const NIGHT_PAPER = ramp([[T(5), "#070a14"], [T(42), "#0b0b0d"], [T(72), "#0e0c07"], [T(100), "#120806"]]);

export default {
  title: "Feels Like",
  description: "A type specimen where the weather designs the type: temperature is the weight, humidity the width, wind the lean.",
  fonts: ["Roboto Flex:opsz,wdth,wght@8..144,25..151,100..1000", "Roboto Mono:wght@400;500"],
  fps: 30,

  mount(root, { seed }) {
    addStyle(root, `
      .fl { position: absolute; inset: 0; font-family: "Roboto Flex", sans-serif; }
      .fl .sheet { position: absolute; left: ${M}px; top: 84px; width: ${MEASURE}px; height: ${H - 84 - 76}px; display: flex; flex-direction: column; }
      .fl .lean { transform-origin: 50% 60%; will-change: transform; white-space: nowrap; }
      .fl .head { display: flex; justify-content: space-between; align-items: baseline; font-size: 46px; line-height: 1; }
      .fl .mono { font-family: "Roboto Mono", monospace; font-weight: 500; font-variation-settings: normal; letter-spacing: 0.04em; }
      .fl .place { font-size: 26px; opacity: 0.72; text-transform: uppercase; letter-spacing: 0.14em; }
      .fl .figures { flex: 1 1 auto; display: flex; flex-direction: column; justify-content: center; min-height: 0; }
      .fl .fig { line-height: 0.78; font-variation-settings: "opsz" 144; align-self: flex-start; }
      .fl .mmrow { display: flex; align-items: flex-start; align-self: flex-start; margin-top: 26px; }
      .fl .ampm { font-size: 64px; line-height: 1; margin: 6px 0 0 22px; }
      .fl .axes { font-size: 25px; line-height: 1; opacity: 0.78; margin: 34px 0 40px; display: flex; justify-content: space-between; }
      .fl .row { display: flex; align-items: baseline; }
      .fl .row + .row { margin-top: 20px; }
      .fl .row i { flex: 0 0 62px; font-style: normal; font-size: 20px; opacity: 0.6; }
      .fl .r96 { font-size: 100px; line-height: 0.95; }
      .fl .r72 { font-size: 72px; line-height: 1; }
      .fl .r56 { font-size: 56px; line-height: 1; }
      .fl .r44 { font-size: 46px; line-height: 1; }
      .fl .fact { display: block; margin-top: 36px; }
      .fl .fact i { display: block; font-size: 24px; opacity: 0.72; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 12px; }
      .fl .fact b { display: block; font-weight: inherit; font-size: 42px; line-height: 1.12; white-space: normal; text-wrap: balance; max-height: 96px; overflow: hidden; }
      .fl b { font-weight: inherit; }
    `);
    const wrap = el("div", { class: "fl" });
    root.append(wrap);
    const motes = canvas2d(wrap, { adaptive: true });

    const date = el("span", { class: "date" });
    const hh = el("div", { class: "fig lean" });
    const mm = el("div", { class: "fig" });
    const ampm = el("div", { class: "ampm" });
    const mmrow = el("div", { class: "mmrow lean" }, mm, ampm);
    const axis = [el("span"), el("span"), el("span")];
    const rows = {};
    const row = (key, size, cls) => {
      rows[key] = el("b", { class: cls });
      return el("div", { class: "row lean" }, el("i", { class: "mono", text: String(size) }), rows[key]);
    };
    const factLabel = el("i", { class: "mono" });
    const factValue = el("b", {});
    const fact = el("div", { class: "row fact lean" }, factLabel, factValue);
    const head = el("div", { class: "head lean" }, date, el("span", { class: "place mono", text: "Long Island City" }));
    const sheet = el(
      "div",
      { class: "sheet" },
      head,
      el("div", { class: "figures" }, hh, mmrow),
      el("div", { class: "axes mono" }, ...axis),
      el("div", {}, row("temp", 96, "r96"), row("sun", 72, "r72"), row("moon", 56, "r56"), row("air", 44, "r44"), fact),
    );
    wrap.append(sheet);
    grain(wrap, { opacity: 0.05 });
    const leaners = [...sheet.querySelectorAll(".lean")];

    // ---- the air: punctuation drifting behind the type ----
    const r = rng(seed);
    const noise = createNoise(seed);
    const N = 320;
    const mote = new Float32Array(N * 3); // x, y, speed factor
    for (let i = 0; i < N; i++) {
      mote[i * 3] = r.range(0, W);
      mote[i * 3 + 1] = r.range(0, H);
      mote[i * 3 + 2] = r.range(0.6, 1.4);
    }

    const shown = {};
    const put = (key, node, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };
    let wght = 0;
    let wdth = 0;
    let swell = 1; // 0 just after the minute turns (hairline), easing back to 1
    let lean = 0;
    let refit = true;
    let lastMs = 0;

    // Sizes one line of the time so it fills the measure, up to the maximum size.
    function fit(node, reserve = 0) {
      node.style.fontSize = "400px";
      const w = node.offsetWidth || 1;
      const size = Math.min(MAX_FIGURE, Math.floor((400 * (MEASURE - reserve)) / w));
      node.style.fontSize = `${size}px`;
    }

    return {
      frame(s) {
        const w = s.weather;
        const tx = s.text;

        // ---- the axes: temperature -> weight, humidity -> width ----
        const wantWght = Math.round(remap(w.temp, 10, 100, 320, 1000) / 4) * 4;
        const wantWdth = Math.round(remap(w.humidity, 20, 100, 40, 151));
        if (shown.minute !== tx.mm) {
          // The new minute swells in from a hairline (not when the clock is being run fast).
          if (shown.minute != null && s.ms - lastMs < 5000) swell = 0;
          shown.minute = tx.mm;
        }
        lastMs = s.ms;
        swell = Math.min(1, swell + s.dt / 1.6);
        const eased = swell * swell * (3 - 2 * swell);
        const figWght = Math.round(lerp(120, wantWght, eased) / 6) * 6;
        if (figWght !== wght || wantWdth !== wdth) {
          wght = figWght;
          wdth = wantWdth;
          const big = `"opsz" 144, "wght" ${wght}, "wdth" ${wdth}`;
          hh.style.fontVariationSettings = big;
          mm.style.fontVariationSettings = big;
          refit = true;
        }
        // The smaller lines carry the same instance, held to a readable range.
        const smallKey = `${clamp(wantWght, 360, 820)}/${clamp(wantWdth, 70, 118)}`;
        if (shown.small !== smallKey) {
          shown.small = smallKey;
          sheet.style.fontVariationSettings = `"wght" ${clamp(wantWght, 360, 820)}, "wdth" ${clamp(wantWdth, 70, 118)}`;
          ampm.style.fontVariationSettings = `"wght" ${clamp(wantWght, 360, 820)}, "wdth" ${clamp(wantWdth, 70, 118)}`;
        }

        // ---- type ----
        if (put("hh", hh, tx.hh)) refit = true;
        if (put("mm", mm, tx.mm)) refit = true;
        put("ampm", ampm, tx.ampm);
        put("date", date, tx.date);
        put("temp", rows.temp, `${tx.temp} ${tx.condition}`);
        put("sun", rows.sun, `${tx.sunLabel} ${tx.sunValue}`);
        put("moon", rows.moon, tx.moon);
        put("air", rows.air, `Air quality ${tx.aqi} / UV ${tx.uv}`);
        put("factL", factLabel, tx.factLabel);
        put("factV", factValue, tx.factValue);
        const factShow = tx.factValue ? "" : "none";
        if (shown.factShow !== factShow) {
          shown.factShow = factShow;
          fact.style.display = factShow;
        }
        // The key to the specimen: what set each axis.
        put("ax0", axis[0], w.live ? `${tx.temp} = wght ${wantWght}` : `wght ${wantWght}`);
        put("ax1", axis[1], w.live ? `${tx.humidity} = wdth ${wantWdth}` : `wdth ${wantWdth}`);
        if (refit) {
          refit = false;
          fit(hh);
          fit(mm, 150); // room for AM/PM beside the minutes
        }
        // A wide, heavy instance can push a long line past the measure: let it shrink.
        const fitKey = `${shown.small}|${shown.temp}|${shown.sun}|${shown.moon}|${shown.air}|${shown.date}`;
        if (shown.fit !== fitKey) {
          shown.fit = fitKey;
          for (const key of ["temp", "sun", "moon", "air"]) fitText(rows[key], MEASURE - 62);
          fitText(date, MEASURE - 330);
        }

        // ---- the wind leans every line; gusts lean it further and let go ----
        const east = -Math.sin((w.windDir * Math.PI) / 180); // which way the air is going, east positive
        const side = Math.abs(east) > 0.25 ? Math.sign(east) : 1;
        const gust = clamp((w.gust - w.wind) / 20);
        const surge = 0.5 + 0.5 * noise.n2(s.t * 0.11, 3.7);
        const want = side * clamp(w.wind / 30) * 11 * (1 + gust * 0.9 * surge) + noise.n2(s.t * 0.07, 9.1) * 0.5;
        lean = approach(lean, clamp(want, -13, 13), s.dt, 0.9);
        const leanKey = lean.toFixed(2);
        if (shown.lean !== leanKey) {
          shown.lean = leanKey;
          const t = `skewX(${(-lean).toFixed(2)}deg)`;
          for (let i = 0; i < leaners.length; i++) leaners[i].style.transform = t;
          put("ax2", axis[2], w.live ? `${tx.wind} = lean ${Math.abs(lean).toFixed(0)}°` : `lean ${Math.abs(lean).toFixed(0)}°`);
        }

        // ---- paper and ink: by temperature, by day and by night ----
        // The paper crosses from dark to light quickly, so the moment when neither
        // ink is at its best against it is short.
        const day = smoothstep(0.4, 0.6, s.daylight);
        const tt = T(w.feels);
        const colorKey = `${Math.round(tt * 60)}/${Math.round(day * 50)}/${w.fog ? 1 : 0}/${Math.round(w.cloud / 10)}`;
        if (shown.color !== colorKey) {
          shown.color = colorKey;
          // Overcast greys the paper a little; fog lifts the ink toward it.
          const dayPaper = mix(PAPER(tt), "#b9bcbd", (w.cloud / 100) * 0.22);
          const paper = mix(NIGHT_PAPER(tt), dayPaper, day);
          const dark = luminance(paper) < 0.17;
          let ink = dark ? NIGHT_INK(tt) : INK(tt);
          if (w.fog) ink = mix(ink, paper, 0.22);
          wrap.style.background = paper;
          wrap.style.color = ink;
          shown.ink = ink;
        }

        // ---- the air behind the type ----
        const { ctx } = motes;
        motes.clear();
        const snow = w.falling === "snow";
        const wet = Boolean(w.falling) && !snow;
        const n = Math.round(N * (w.falling ? 0.3 + 0.7 * w.intensity : w.fog ? 1 : 0.34));
        const fallSpeed = snow ? 55 : wet ? 380 + 420 * w.intensity : 0;
        const driftX = east * (8 + w.wind * (wet ? 9 : 5));
        const slant = wet ? clamp((east * w.wind) / 34, -0.8, 0.8) : 0;
        ctx.fillStyle = ctx.strokeStyle = rgba(shown.ink, wet ? 0.2 : snow ? 0.3 : w.fog ? 0.12 : 0.14);
        ctx.lineWidth = 5;
        ctx.lineCap = "butt";
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const j = i * 3;
          const k = mote[j + 2];
          let x = mote[j] + driftX * k * s.dt;
          let y = mote[j + 1] + fallSpeed * k * s.dt + (fallSpeed ? 0 : Math.sin(s.t * 0.3 + i) * 4 * s.dt);
          if (snow) x += Math.sin(s.t * 0.8 + i * 1.7) * 14 * s.dt;
          if (y > H + 40) y -= H + 80;
          if (x > W + 40) x -= W + 80;
          else if (x < -40) x += W + 80;
          mote[j] = x;
          mote[j + 1] = y;
          if (wet) {
            // rain: the vertical bar
            const len = 30 + 26 * k;
            ctx.moveTo(x, y);
            ctx.lineTo(x - slant * len, y - len);
          } else if (snow) {
            // snow: the asterisk
            const a = 9 * k;
            ctx.moveTo(x - a, y);
            ctx.lineTo(x + a, y);
            ctx.moveTo(x - a * 0.5, y - a * 0.87);
            ctx.lineTo(x + a * 0.5, y + a * 0.87);
            ctx.moveTo(x + a * 0.5, y - a * 0.87);
            ctx.lineTo(x - a * 0.5, y + a * 0.87);
          } else {
            // dry air: the interpunct
            ctx.moveTo(x + 4, y);
            ctx.arc(x, y, 4, 0, TAU);
          }
        }
        if (wet || snow) {
          ctx.lineWidth = snow ? 3 : 5;
          ctx.stroke();
        } else ctx.fill();
      },
    };
  },
};

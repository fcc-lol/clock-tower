// Feels Like: a type specimen sheet in which the weather is the type designer.
// The whole page is set in one variable typeface (Roboto Flex) and the
// conditions set its axes: the temperature is the weight (frost-thin to
// heat-swollen), the humidity is the width (dry air is narrow, wet air is wide),
// and the wind leans every line the way it is blowing, harder in gusts. The
// paper and ink are picked by temperature and inverted at night. The air behind
// the type is set in punctuation: bars for rain, commas for drizzle, asterisks
// for snow, dashes for fog, hyphens streaming in a gale, degree signs rising in
// heat, interpuncts for dust. After a while the shape of the numerals says what
// it is like outside before any number is read.

import { W, H, TAU, clamp, lerp, remap, smoothstep, approach, mix, ramp, rgba, contrast, toOklch, oklch, rng, hash, createNoise, el, addStyle, canvas2d, grain, fitText } from "../lib/kit.js";

const M = 96; // side margin
const MEASURE = W - 2 * M;
const TOP = 72;
const BOTTOM = 66;
const LABEL = 66; // the column of point sizes in the left margin
const MAX_FIGURE = 720; // largest size of the time, px
const LH = 0.76; // line height of the time, em: the figures fill it top to bottom
const EDGE = 26; // how far past the measure a leaning line may reach (it stays 70 px inside the frame)

// Paper and ink by temperature (deg F), day and night.
const T = (f) => clamp((f - 5) / 100);
const PAPER = ramp([[T(5), "#eef3f8"], [T(25), "#cfdae6"], [T(42), "#d8d5cc"], [T(58), "#efe6d1"], [T(72), "#f3cf46"], [T(86), "#f08b2d"], [T(100), "#e2452a"]]);
const INK = ramp([[T(5), "#1b2fc2"], [T(25), "#11265f"], [T(42), "#1b1b1c"], [T(58), "#1d1a15"], [T(72), "#15120c"], [T(86), "#1c0e06"], [T(100), "#150705"]]);
const NIGHT_INK = ramp([[T(5), "#b9ccff"], [T(25), "#b4c6e8"], [T(42), "#d5d2c8"], [T(58), "#eadfc6"], [T(72), "#f2d36a"], [T(86), "#ff9d57"], [T(100), "#ff7858"]]);
const NIGHT_PAPER = ramp([[T(5), "#070a14"], [T(42), "#0b0b0d"], [T(72), "#0e0c07"], [T(100), "#120806"]]);

// The punctuation the air is set in.
const DOT = 0; // interpuncts: dust on a dry day
const BAR = 1; // vertical bars: rain (short ones: drizzle)
const STAR = 2; // asterisks: snow
const DASH = 3; // em dashes: fog
const RING = 4; // degree signs: heat
const HYPHEN = 5; // hyphens: a gale

export default {
  title: "Feels Like",
  description: "A type specimen where the weather designs the type: temperature is the weight, humidity the width, wind the lean.",
  fonts: ["Roboto Flex:opsz,wdth,wght@8..144,25..151,100..1000", "Roboto Mono:wght@400;500"],
  fps: 30,

  mount(root, { seed }) {
    addStyle(root, `
      .fl { position: absolute; inset: 0; font-family: "Roboto Flex", sans-serif; }
      .fl .flash { position: absolute; inset: 0; opacity: 0; will-change: opacity; }
      .fl .sheet { position: absolute; left: ${M}px; top: ${TOP}px; width: ${MEASURE}px; height: ${H - TOP - BOTTOM}px; display: flex; flex-direction: column; }
      .fl .lean { transform-origin: 0% 100%; will-change: transform; white-space: nowrap; }
      .fl .mono { font-family: "Roboto Mono", monospace; font-weight: 500; font-variation-settings: normal; letter-spacing: 0.04em; }
      .fl .head { display: flex; justify-content: space-between; align-items: baseline; font-size: 46px; line-height: 1; }
      .fl .place { font-size: 24px; text-transform: uppercase; letter-spacing: 0.16em; }
      .fl .rule { flex: 0 0 3px; background: currentColor; }
      .fl .head + .rule { margin-top: 22px; }
      .fl .figures { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; justify-content: center; }
      .fl .fig { line-height: ${LH}; font-variation-settings: "opsz" 144; align-self: flex-start; }
      .fl .mmrow { display: flex; align-items: flex-start; align-self: flex-start; margin-top: 30px; }
      .fl .ampm { font-size: 64px; line-height: 1; margin: 2px 0 0 22px; }
      .fl .axes { font-size: 24px; line-height: 1; margin: 22px 0 30px; display: flex; justify-content: space-between; }
      .fl .row { display: flex; align-items: baseline; }
      .fl .row + .row { margin-top: 14px; }
      .fl .row i { flex: 0 0 ${LABEL}px; font-style: normal; font-size: 24px; letter-spacing: 0; }
      .fl b { font-weight: inherit; display: block; }
      .fl .r132 { font-size: 132px; line-height: 0.9; }
      .fl .cond { font-size: 76px; line-height: 0.9; margin-left: 26px; }
      .fl .r72 { font-size: 72px; line-height: 1; }
      .fl .r56 { font-size: 56px; line-height: 1; }
      .fl .r46 { font-size: 46px; line-height: 1; }
      .fl .row.fact { margin-top: 26px; }
      .fl .fact u { display: block; text-decoration: none; font-size: 24px; line-height: 1; text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 12px; }
      .fl .fact b { font-size: 40px; line-height: 1.14; white-space: normal; text-wrap: balance; max-width: ${MEASURE - LABEL - 30}px; }
    `);
    const wrap = el("div", { class: "fl" });
    root.append(wrap);
    const air = canvas2d(wrap, { adaptive: true });
    const flash = el("div", { class: "flash" });

    const date = el("span", { class: "date" });
    const hh = el("div", { class: "fig lean" });
    const mm = el("div", { class: "fig" });
    const ampm = el("div", { class: "ampm" });
    const mmrow = el("div", { class: "mmrow lean" }, mm, ampm);
    const figures = el("div", { class: "figures" }, hh, mmrow);
    const axis = [el("span"), el("span"), el("span")];
    const rows = {};
    const labels = {};
    const row = (key, cls, ...more) => {
      rows[key] = el("b", { class: cls });
      labels[key] = el("i", { class: "mono" });
      return el("div", { class: "row lean" }, labels[key], rows[key], ...more);
    };
    const cond = el("b", { class: "cond" });
    const factLabel = el("u", { class: "mono" });
    const factValue = el("b", {});
    labels.fact = el("i", { class: "mono" });
    const fact = el("div", { class: "row fact lean" }, labels.fact, el("div", {}, factLabel, factValue));
    const head = el("div", { class: "head lean" }, date, el("span", { class: "place mono", text: "Long Island City" }));
    const axes = el("div", { class: "axes mono" }, ...axis);
    const block = el("div", {}, row("temp", "r132", cond), row("sun", "r72"), row("moon", "r56"), row("air", "r46"), fact);
    const sheet = el("div", { class: "sheet" }, head, el("div", { class: "rule" }), figures, el("div", { class: "rule" }), axes, block);
    wrap.append(flash, sheet);
    grain(wrap, { opacity: 0.05 });
    const leaners = [...sheet.querySelectorAll(".lean")];

    // ---- the air: punctuation drifting behind the type, in three depths ----
    const r = rng(seed);
    const noise = createNoise(seed);
    const N = 450;
    const P = new Float32Array(N * 5); // x, y, speed factor, rank (drawn when below the density), phase
    for (let i = 0; i < N; i++) {
      P[i * 5] = r.range(-60, W + 60);
      P[i * 5 + 1] = r.range(-60, H + 60);
      P[i * 5 + 2] = r.range(0.7, 1.3);
      P[i * 5 + 3] = r();
      P[i * 5 + 4] = r();
    }
    // The readouts are kept clear: punctuation that would pass behind a line of
    // small type is set much fainter there (and a little fainter just around it),
    // so the air never costs a readout its contrast. One box per line of type,
    // measured whenever the lines change.
    const Z = new Uint8Array(N); // 0 open air, 1 near a line of type, 2 behind it
    const ZONE_ALPHA = [1, 0.5, 0.18];
    const FEATHER = 44;
    const BOXES = 8;
    const box = new Float32Array(BOXES * 4); // x0, y0, x1, y1 in stage px
    let boxes = 0;
    const lines = [head, axes, ...block.children];
    function measureBoxes() {
      boxes = 0;
      for (const line of lines) {
        if (line.style.display === "none" || boxes >= BOXES) continue;
        let x0 = Infinity;
        let x1 = -Infinity;
        for (const c of line.children) {
          x0 = Math.min(x0, c.offsetLeft);
          x1 = Math.max(x1, c.offsetLeft + c.offsetWidth);
        }
        const b = boxes * 4;
        const y0 = TOP + line.offsetTop;
        const lift = line.offsetHeight * 0.24; // room for the lean, up to 13 degrees
        box[b] = M + x0 - 20 - (line === axes ? 0 : 6);
        box[b + 1] = y0 - 14;
        box[b + 2] = M + x1 + 20 + lift;
        box[b + 3] = y0 + line.offsetHeight + 14;
        boxes++;
      }
    }

    const shown = {};
    const put = (key, node, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };
    let wght = 0; // the weight the figures are drawn in right now
    let big = ""; // the instance the figures are fitted for
    let swell = 1; // 0 just after the minute turns (hairline), easing back to 1
    let lean = 0;
    let refit = true;
    let lastMs = 0;
    let flashShown = 0;

    // Sizes the two lines of the time, as one block, to fill the measure or the
    // room between the rules, whichever binds first. `tan` is the lean to leave
    // room for, `grow` the swell.
    function fitFigures(tan, grow) {
      hh.style.fontVariationSettings = mm.style.fontVariationSettings = big;
      hh.style.fontSize = mm.style.fontSize = "400px";
      const wh = hh.offsetWidth / 400;
      const wm = mm.offsetWidth / 400;
      const side = mmrow.offsetWidth - mm.offsetWidth; // AM/PM and its gap
      const room = figures.clientHeight - 30 - 56;
      const size = Math.floor(
        Math.min(MAX_FIGURE, room / (2 * LH), (MEASURE + EDGE) / (wh + LH * tan) / grow, (MEASURE + EDGE - side) / (wm + LH * tan) / grow),
      );
      hh.style.fontSize = mm.style.fontSize = `${size}px`;
      wght = 0; // the weight in use is set again by the caller
    }

    // The fact may be 80 characters: step its size down until it sits in two lines.
    function fitFact() {
      let size = 42;
      for (; size >= 36; size -= 2) {
        factValue.style.fontSize = `${size}px`;
        if (factValue.offsetHeight <= size * 1.14 * 2 + 2) break;
      }
      labels.fact.textContent = String(Math.max(36, size));
    }

    return {
      frame(s) {
        const w = s.weather;
        const tx = s.text;
        const jumped = Math.abs(s.ms - lastMs) > 5000;
        lastMs = s.ms;

        // ---- the axes: temperature -> weight, humidity -> width ----
        const wantWght = Math.round(remap(w.temp, 10, 100, 320, 1000) / 4) * 4;
        const wantWdth = Math.round(remap(w.humidity, 20, 100, 40, 151));
        const wantBig = `"opsz" 144, "wght" ${wantWght}, "wdth" ${wantWdth}`;
        if (big !== wantBig) {
          big = wantBig;
          refit = true;
        }
        // The smaller lines carry the same instance, held to a readable range.
        const smallWght = clamp(wantWght, 400, 820);
        const smallWdth = clamp(wantWdth, 70, 118);
        const smallKey = `"wght" ${smallWght}, "wdth" ${smallWdth}`;
        if (shown.small !== smallKey) {
          shown.small = smallKey;
          sheet.style.fontVariationSettings = smallKey;
          factValue.style.fontVariationSettings = `"wght" ${smallWght}, "wdth" ${Math.min(smallWdth, 100)}`;
        }

        // ---- type ----
        if (put("hh", hh, tx.hh)) refit = true;
        if (put("mm", mm, tx.mm)) {
          // The new minute swells in from a hairline (not when the clock is being run fast).
          if (shown.minute != null && !jumped) swell = 0;
          shown.minute = tx.mm;
          refit = true;
        }
        if (put("ampm", ampm, tx.ampm)) refit = true;
        put("date", date, tx.date);
        put("temp", rows.temp, tx.temp);
        put("cond", cond, tx.condition);
        put("sun", rows.sun, `${tx.sunLabel} ${tx.sunValue}`);
        put("moon", rows.moon, tx.moon);
        put("air", rows.air, `Air quality ${tx.aqi} / UV ${tx.uv}`);
        put("factL", factLabel, tx.factLabel);
        put("factV", factValue, tx.factValue);
        const factShow = tx.factValue ? "" : "none";
        if (shown.factShow !== factShow) {
          shown.factShow = factShow;
          fact.style.display = factShow;
          refit = true;
        }
        // The key to the specimen: what set each axis. A caption, in words.
        put("ax0", axis[0], w.live ? `${tx.temp} = wght ${wantWght}` : `wght ${wantWght}`);
        put("ax1", axis[1], w.live ? `${tx.humidity} = wdth ${wantWdth}` : `wdth ${wantWdth}`);

        // A wide, heavy instance can push a long line past the measure: let it
        // shrink, and let the size in the margin say so.
        const fitKey = `${shown.small}|${shown.temp}|${shown.cond}|${shown.sun}|${shown.moon}|${shown.air}|${shown.date}|${shown.factV}`;
        if (shown.fit !== fitKey) {
          shown.fit = fitKey;
          const measure = MEASURE - LABEL - 24;
          labels.temp.textContent = String(fitText(rows.temp, measure, 132));
          fitText(cond, measure - rows.temp.offsetWidth - 26, 76);
          for (const key of ["sun", "moon", "air"]) labels[key].textContent = String(fitText(rows[key], measure));
          fitText(date, MEASURE - 340);
          if (tx.factValue) fitFact();
          measureBoxes();
          refit = true; // the room left for the figures may have changed
        }

        // ---- the wind leans every line; gusts lean it further and let go ----
        const east = -Math.sin((w.windDir * Math.PI) / 180); // which way the air is going, east positive
        const side = Math.abs(east) > 0.25 ? Math.sign(east) : 1;
        const gust = clamp((w.gust - w.wind) / 20);
        const surge = 0.5 + 0.5 * noise.n2(s.t * 0.11, 3.7);
        const steady = clamp(w.wind / 30) * 11;
        const want = side * steady * (1 + gust * 0.9 * surge) + noise.n2(s.t * 0.07, 9.1) * 0.5;
        lean = jumped ? clamp(want, -13, 13) : approach(lean, clamp(want, -13, 13), s.dt, 0.9);
        // Heat: the figures swell and settle, slowly.
        const heat = smoothstep(86, 102, w.feels);
        const grow = 1 + heat * 0.014;
        const breath = heat ? 1 + heat * 0.014 * (0.5 + 0.5 * Math.sin((s.t * TAU) / 11)) : 1;

        const reach = Math.ceil(Math.min(13, steady * (1 + gust * 0.9) + 0.5)); // the furthest it will lean, degrees
        const roomKey = `${reach}/${heat > 0 ? 1 : 0}`;
        if (shown.room !== roomKey) {
          shown.room = roomKey;
          refit = true;
        }
        if (refit) {
          refit = false;
          fitFigures(Math.tan((reach * Math.PI) / 180), grow);
        }
        // The weight of the figures: the instance, or on its way up to it from a
        // hairline after the minute turns. Stepped ten times a second, not every
        // frame, so the big glyphs are drawn again as seldom as possible.
        swell = jumped ? 1 : Math.min(1, swell + s.dt / 1.6);
        const stepped = swell >= 1 ? 1 : Math.floor(swell * 16) / 16;
        const figWght = Math.round(lerp(Math.min(140, wantWght), wantWght, stepped * stepped * (3 - 2 * stepped)));
        if (figWght !== wght) {
          wght = figWght;
          hh.style.fontVariationSettings = mm.style.fontVariationSettings = `"opsz" 144, "wght" ${wght}, "wdth" ${wantWdth}`;
        }

        const leanKey = `${Math.round(lean * 25)}/${Math.round(breath * 2000)}`;
        if (shown.lean !== leanKey) {
          shown.lean = leanKey;
          // Each line pivots on the corner that keeps it inside the left margin.
          const origin = lean >= 0 ? "0% 100%" : "0% 0%";
          const skew = `skewX(${(-lean).toFixed(2)}deg)`;
          const swollen = heat ? `${skew} scale(${breath.toFixed(4)})` : skew;
          for (let i = 0; i < leaners.length; i++) {
            const node = leaners[i];
            node.style.transform = node === hh || node === mmrow ? swollen : skew;
            if (shown.origin !== origin) node.style.transformOrigin = origin;
          }
          shown.origin = origin;
          put("ax2", axis[2], w.live ? `${tx.wind} = lean ${Math.abs(lean).toFixed(0)}°` : `lean ${Math.abs(lean).toFixed(0)}°`);
        }

        // ---- paper and ink: by temperature, by day and by night ----
        // The paper crosses from dark to light quickly, so the moment when neither
        // ink is at its best against it is short.
        const day = smoothstep(0.4, 0.6, s.daylight);
        const twilight = smoothstep(0.02, 0.22, s.daylight) * (1 - smoothstep(0.34, 0.6, s.daylight));
        const tt = T(w.feels);
        const wet = w.falling && w.falling !== "snow" ? 0.12 + 0.2 * w.intensity + (w.kind === "storm" ? 0.14 : 0) : 0;
        const colorKey = `${Math.round(tt * 60)}/${Math.round(day * 50)}/${Math.round(twilight * 20)}/${w.fog ? 1 : 0}/${Math.round(w.cloud / 10)}/${Math.round(wet * 20)}/${s.sky.mean}`;
        if (shown.color !== colorKey) {
          shown.color = colorKey;
          // Cloud greys the paper; rain darkens it. At dusk and dawn the dark
          // sheet takes a little of the colour of the sky.
          let dayPaper = mix(PAPER(tt), "#b6b9ba", (w.cloud / 100) * 0.42);
          dayPaper = mix(dayPaper, "#7d8388", wet);
          const nightPaper = mix(NIGHT_PAPER(tt), mix("#000000", s.sky.mean, 0.34), twilight * 0.7);
          const paper = mix(nightPaper, dayPaper, day);
          const dark = contrast(paper, NIGHT_INK(tt)) > contrast(paper, INK(tt));
          // At night the warm, heavy instances cover a lot of the sheet: their ink
          // is held lower in deep night (lightness only, so the hue stays
          // saturated) and the room is not lit by the figures.
          const dim = (1 - day) * (0.1 + 0.3 * smoothstep(0.4, 0.85, tt));
          let ink = INK(tt);
          if (dark) {
            const lch = toOklch(NIGHT_INK(tt));
            ink = oklch(lch.l * (1 - 0.9 * dim), lch.c, lch.h);
          }
          if (w.fog) ink = mix(ink, paper, 0.2);
          wrap.style.background = paper;
          wrap.style.color = ink;
          flash.style.background = ink;
          // Fog: the figures go out of focus, soft copies of themselves behind the sharp ones.
          const blur = w.fog ? `0 0 26px ${rgba(ink, 0.55)}, 0 -34px 60px ${rgba(ink, 0.3)}, 0 34px 60px ${rgba(ink, 0.3)}` : "none";
          if (shown.blur !== blur) {
            shown.blur = blur;
            hh.style.textShadow = mm.style.textShadow = blur;
          }
          shown.ink = ink;
        }

        // ---- lightning: a soft, rare brightening of the paper ----
        let glow = 0;
        if (w.kind === "storm") {
          const span = 19;
          const n = Math.floor(s.t / span);
          const u = s.t - n * span - (2 + hash(n, seed) * (span - 7));
          if (u > 0 && u < 4.5) glow = smoothstep(0, 0.5, u) * Math.exp(-Math.max(0, u - 0.5) * 1.3);
        }
        glow = Math.round(glow * 0.12 * 200) / 200;
        if (glow !== flashShown) {
          flashShown = glow;
          flash.style.opacity = String(glow);
        }

        // ---- the air behind the type ----
        const snow = w.falling === "snow";
        const rain = Boolean(w.falling) && !snow;
        const drizzle = w.falling === "drizzle";
        const mode = rain ? BAR : snow ? STAR : w.fog ? DASH : w.wind >= 17 ? HYPHEN : heat > 0.15 ? RING : DOT;
        const haze = remap(w.aqi, 20, 150, 0.22, 0.8);
        const density =
          mode === BAR ? (drizzle ? 0.4 + 0.4 * w.intensity : 0.3 + 0.7 * w.intensity)
          : mode === STAR ? 0.3 + 0.7 * w.intensity
          : mode === DASH ? remap(w.visibility, 0.2, 4, 0.5, 0.22)
          : mode === HYPHEN ? 0.42
          : mode === RING ? 0.14 + haze * 0.4
          : haze;
        const fall = mode === BAR ? (drizzle ? 230 : 360 + 400 * w.intensity) : mode === STAR ? 42 + 46 * w.intensity : mode === RING ? -26 : 0;
        const tanA = mode === BAR ? clamp((east * w.wind) / 28, -0.75, 0.75) : 0; // rain falls at the wind's angle
        const blow =
          mode === BAR ? fall * tanA
          : mode === STAR ? east * w.wind * 7
          : mode === DASH ? side * 9 + east * w.wind * 2
          : mode === HYPHEN ? side * Math.min(w.wind, 40) * 8
          : mode === RING ? east * w.wind * 2
          : east * (6 + w.wind * 5);
        const big2 = mode === STAR ? 1 + 0.5 * w.intensity : 1;
        const margin = mode === DASH ? 380 : 110;
        // Move every mark, and note how close it comes to a line of type.
        for (let i = 0; i < N; i++) {
          const j = i * 5;
          const z = (i % 3) / 2; // 0 far, 1 near
          const pace = 0.6 + 0.6 * z;
          const k = P[j + 2];
          const ph = P[j + 4];
          let x = P[j] + blow * k * pace * s.dt;
          let y = P[j + 1] + fall * k * pace * s.dt;
          if (mode === STAR || mode === RING) x += Math.sin(s.t * 0.7 + ph * 40) * 16 * s.dt;
          else if (mode !== BAR) y += Math.sin(s.t * 0.35 + ph * 40) * (mode === HYPHEN ? 14 : 5) * s.dt;
          if (y > H + 110) y -= H + 220;
          else if (y < -110) y += H + 220;
          if (x > W + margin) x -= W + 2 * margin;
          else if (x < -margin) x += W + 2 * margin;
          P[j] = x;
          P[j + 1] = y;
          if (P[j + 3] > density) continue;
          // the mark's reach: half its width, and how far it runs up and down
          let ex;
          let up;
          let down;
          if (mode === BAR) {
            const len = (drizzle ? 16 + 14 * z : 40 + 62 * z) * k;
            ex = Math.abs(tanA) * len * 0.5 + 4;
            up = len;
            down = 0;
            x -= tanA * len * 0.5;
          } else if (mode === DASH || mode === HYPHEN) {
            ex = mode === DASH ? (70 + 250 * ph) * (0.6 + 0.6 * z) : w.wind * (0.7 + 1.5 * z) * k;
            up = down = 7;
          } else {
            ex = up = down = mode === STAR ? (5 + 13 * z) * k * big2 : 16;
          }
          let q = 0;
          for (let b = 0; b < boxes * 4; b += 4) {
            const x0 = box[b] - ex;
            const x1 = box[b + 2] + ex;
            const y0 = box[b + 1] - down;
            const y1 = box[b + 3] + up;
            if (x > x0 - FEATHER && x < x1 + FEATHER && y > y0 - FEATHER && y < y1 + FEATHER) {
              if (x > x0 && x < x1 && y > y0 && y < y1) {
                q = 2;
                break;
              }
              q = 1;
            }
          }
          Z[i] = q;
        }

        // Then set them, in three depths, each depth in three strengths.
        const { ctx } = air;
        air.clear();
        ctx.fillStyle = ctx.strokeStyle = shown.ink;
        ctx.lineCap = "butt";
        for (let pass = 0; pass < 9; pass++) {
          const c = pass % 3;
          const zone = (pass - c) / 3;
          const z = c / 2; // 0 far, 1 near
          ctx.beginPath();
          let any = false;
          for (let i = c; i < N; i += 3) {
            const j = i * 5;
            if (P[j + 3] > density || Z[i] !== zone) continue;
            any = true;
            const k = P[j + 2];
            const ph = P[j + 4];
            const x = P[j];
            const y = P[j + 1];
            if (mode === BAR) {
              const len = (drizzle ? 16 + 14 * z : 40 + 62 * z) * k;
              ctx.moveTo(x, y);
              ctx.lineTo(x - tanA * len, y - len);
            } else if (mode === STAR) {
              // six arms, turning slowly
              const a = (5 + 13 * z) * k * big2;
              const th = ph * TAU + s.t * (0.2 + 0.3 * k) * (i & 1 ? 1 : -1);
              const cx = Math.cos(th) * a;
              const cy = Math.sin(th) * a;
              const dx = cx * 0.5 - cy * 0.866;
              const dy = cy * 0.5 + cx * 0.866;
              const ex = cx * 0.5 + cy * 0.866;
              const ey = cy * 0.5 - cx * 0.866;
              ctx.moveTo(x - cx, y - cy);
              ctx.lineTo(x + cx, y + cy);
              ctx.moveTo(x - dx, y - dy);
              ctx.lineTo(x + dx, y + dy);
              ctx.moveTo(x - ex, y - ey);
              ctx.lineTo(x + ex, y + ey);
            } else if (mode === DASH) {
              const len = (70 + 250 * ph) * (0.6 + 0.6 * z);
              ctx.moveTo(x - len, y);
              ctx.lineTo(x + len, y);
            } else if (mode === HYPHEN) {
              const len = w.wind * (0.7 + 1.5 * z) * k;
              ctx.moveTo(x - len, y);
              ctx.lineTo(x + len, y);
            } else if (mode === RING) {
              const a = (6 + 9 * z) * k;
              ctx.moveTo(x + a, y);
              ctx.arc(x, y, a, 0, TAU);
            } else {
              const a = (2.6 + 4.4 * z) * k;
              ctx.moveTo(x + a, y);
              ctx.arc(x, y, a, 0, TAU);
            }
          }
          if (!any) continue;
          if (mode === DOT) {
            ctx.globalAlpha = (0.13 + 0.12 * z) * ZONE_ALPHA[zone];
            ctx.fill();
          } else {
            ctx.globalAlpha = (mode === DASH ? 0.08 + 0.07 * z : mode === STAR ? 0.24 + 0.2 * z : 0.15 + 0.17 * z) * ZONE_ALPHA[zone];
            ctx.lineWidth = mode === BAR ? (drizzle ? 3 + 2 * z : 3 + 5 * z) : mode === STAR ? 2 + 2.6 * z : mode === DASH ? 5 + 9 * z : mode === HYPHEN ? 3 + 4 * z : 2.5 + 2.5 * z;
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      },
    };
  },
};

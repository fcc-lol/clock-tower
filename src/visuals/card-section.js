// The Card Section
//
// A stadium stand seen front-on: 36 x 64 seats, a little person in each one.
// The people inside the numeral shapes hold up the contrast side of their card
// (ink by day, a warm lit card and a small light after dark), so the crowd
// itself spells the hour over the minutes. Everyone else performs the weather:
//
//   sky      background cards are the measured sky colours, west on the left
//            to east on the right
//   cloud    a share of the cards equal to the cloud cover turns cloud-white,
//            in soft blobs that drift across the stand on the real wind
//   gusts    every so often (how often depends on the gust speed) a stadium
//            wave travels downwind through the crowd
//   rain     the harder it falls, the more people swap card for umbrella;
//            snow also leaves white caps on heads, cards and umbrellas
//   night    the later it gets, the more of the crowd puts the card down and
//            nods off; by 3 AM only the numeral holders are still at it
//   on the minute a diagonal flip-wave runs through the cards and re-forms
//   the digits
//
// Three cloth banners passed over the crowd carry the words: the date, the
// temperature and condition (with AM/PM, air quality and UV), and a tifo with
// the sunrise/sunset countdown, the moon and today's fact.
//
// Technique: one persistent canvas; only seats that are animating are redrawn
// (a few hundred at most), plus a slow rolling refresh so colours follow the
// light. Banners are DOM, cut into 60 px slices that ripple with the wind.

import { TAU, clamp, lerp, smoothstep, rng, hash, createNoise, mix, ramp, rgba, luminance, toOklch, oklch, el, addStyle, canvas2d, grain } from "../lib/kit.js";

const COLS = 36;
const ROWS = 64;
const S = 30; // one seat, in stage units
const N = COLS * ROWS;

// Which rows hold what (64 rows of 30 px fill the 1920 px frame exactly).
const ROW_DATE = 3; // 3 rows
const ROW_HOUR = 7; // 18 rows
const ROW_MID = 26; // 5 rows
const ROW_MIN = 32; // 18 rows
const ROW_TIFO = 51; // 10 rows

// What a seat is showing.
const F_SKY = 0, F_CLOUD = 1, F_CORE = 2, F_INK = 3, F_LIT = 4; // cards
const F_UMB = 5, F_SLEEP = 6, F_HOLD = 7, F_NONE = 8;
// What a seat is for.
const R_BG = 0, R_NUM = 1, R_MOAT = 2, R_HOLD = 3, R_COVER = 4;

// ---------------------------------------------------------------------------
// The seat font: digits 14 seats wide and 18 tall, every stroke 4 seats thick,
// the outside of each bend rounded off by one seat. ("1" is 10 wide.)
// ---------------------------------------------------------------------------
const GH = 18;
const BARS = { T: [0, 0, 14, 4], M: [0, 7, 14, 4], B: [0, 14, 14, 4], LU: [0, 0, 4, 11], LL: [0, 7, 4, 11], RU: [10, 0, 4, 11], RL: [10, 7, 4, 11] };
function glyph(parts, cuts, w = 14) {
  const g = new Uint8Array(w * GH);
  for (const p of parts) {
    const [x, y, pw, ph] = typeof p === "string" ? BARS[p] : p;
    for (let yy = y; yy < y + ph; yy++) for (let xx = x; xx < x + pw; xx++) g[yy * w + xx] = 1;
  }
  for (const [x, y] of cuts) g[y * w + x] = 0;
  return { w, g };
}
const GLYPHS = [
  glyph(["T", "B", "LU", "LL", "RU", "RL"], [[0, 0], [13, 0], [0, 17], [13, 17]]),
  glyph([[3, 0, 4, 18], [0, 0, 7, 4], [0, 14, 10, 4]], [[0, 0]], 10),
  glyph(["T", "RU", "M", "LL", "B"], [[13, 0], [13, 10], [0, 7], [0, 17]]),
  glyph(["T", [3, 7, 11, 4], "B", "RU", "RL"], [[13, 0], [13, 17]]),
  glyph(["LU", "M", "RU", "RL"], [[0, 10]]),
  glyph(["T", "LU", "M", "RL", "B"], [[0, 0], [0, 10], [13, 7], [13, 17]]),
  glyph(["T", "LU", "LL", "M", "RL", "B"], [[0, 0], [0, 17], [13, 17], [13, 7]]),
  glyph(["T", "RU", "RL"], [[13, 0]]),
  glyph(["T", "M", "B", "LU", "LL", "RU", "RL"], [[0, 0], [13, 0], [0, 17], [13, 17]]),
  glyph(["T", "LU", "M", "RU", "RL", "B"], [[0, 0], [13, 0], [13, 17], [0, 10]]),
];

const SKIN = ["#f3cfad", "#e3b188", "#c98f62", "#a56c47", "#7b4c31", "#f6dcc4"];
const HAIR = ["#1c1919", "#34261f", "#62402a", "#a97a36", "#8c8c93", "#d6bd86", "#27212d", "#9a4129"];
const SHIRT = ["#d5492f", "#e3b23f", "#2f6f8f", "#e9e5da", "#3b4160", "#5a9b7b", "#bf6a8d", "#8a8f99"];
const BEANIE = ["#e2533b", "#f0c04f", "#3d7ea6", "#f2efe8", "#57a47d", "#d77fa1"];
const UMBRELLA = ["#d9573f", "#e2b33c", "#2f8f8a", "#3b5fa8", "#d98aa8", "#8fc7a4"];
const INK = ["#0f1118", "#13151d", "#181a24"];

const CSS = `
.cs { position: absolute; inset: 0; overflow: hidden; background: #05060a; font-family: "Bowlby One", "Arial Black", sans-serif; }
.cs .bn { position: absolute; z-index: 3; }
.cs .sl { position: absolute; top: 0; height: 100%; width: 61px; box-sizing: border-box; background: var(--cloth);
  border-top: 4px solid var(--hem); border-bottom: 4px solid var(--hem); }
.cs .tx { position: absolute; inset: 0; color: var(--paint); }
.cs .g { display: inline-block; white-space: pre; }
.cs i { font-style: normal; font-size: 0.64em; color: var(--soft); margin-right: 0.38em; }
.cs .date .tx { display: flex; align-items: center; justify-content: center; font-size: 58px; line-height: 1; white-space: nowrap; }
.cs .mid .tx { display: flex; align-items: center; padding: 0 30px 0 34px; gap: 26px; }
.cs .temp { flex: none; font-size: 122px; line-height: 1; margin-top: -4px; }
.cs .stack { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 10px; }
.cs .cond { font-size: 52px; line-height: 1; white-space: nowrap; }
.cs .air { display: flex; gap: 30px; font-size: 40px; line-height: 1; white-space: nowrap; align-items: baseline; }
.cs .ampm { flex: none; background: var(--accent); color: var(--on); font-size: 58px; line-height: 1; padding: 13px 18px 17px; border-radius: 10px; }
.cs .tifo .tx { display: flex; flex-direction: column; justify-content: center; padding: 0 36px; gap: 13px; }
.cs .row1 { display: flex; justify-content: space-between; align-items: baseline; font-size: 44px; line-height: 1; white-space: nowrap; }
.cs .rule { height: 4px; border-radius: 2px; background: var(--soft); opacity: 0.5; }
.cs .flabel { font-size: 28px; line-height: 1; color: var(--soft); white-space: nowrap; }
.cs .fvalue { font-size: 52px; line-height: 1.08; }
.cs .flash { position: absolute; inset: 0; z-index: 4; background: #c9d4ff; opacity: 0; pointer-events: none; }
`;

export default {
  title: "The Card Section",
  description: "A stadium crowd holds up cards to spell the time, and acts out the sky, the wind and the rain around it.",
  fonts: ["Bowlby One"],

  mount(root, { seed }) {
    addStyle(root, CSS);
    const wrap = el("div", { class: "cs" });
    root.append(wrap);

    const crowd = canvas2d(wrap, { maxScale: 2, alpha: false }); // persistent: only dirty seats are redrawn
    const ctx = crowd.ctx;
    const R = crowd.ratio;
    const wet = canvas2d(wrap, { adaptive: true }); // rain and snow, redrawn in full while it falls
    wet.canvas.style.zIndex = "2";

    const r = rng(seed);
    const noise = createNoise(seed);

    // ----- the people -------------------------------------------------------
    const jx = new Float32Array(N); // sits a little off-centre
    const tilt = new Float32Array(N); // holds the card a little crooked
    const phase = new Float32Array(N);
    const uTh = new Float32Array(N); // brings an umbrella when the rain passes this
    const sTh = new Float32Array(N); // falls asleep when the night passes this
    const hatRoll = new Float32Array(N);
    const capVar = new Float32Array(N);
    const skinI = new Uint8Array(N);
    const hairI = new Uint8Array(N);
    const shirtI = new Uint8Array(N);
    const umbI = new Uint8Array(N);
    const shadeI = new Uint8Array(N);
    const sideI = new Int8Array(N);
    for (let i = 0; i < N; i++) {
      jx[i] = r.range(-1, 1);
      tilt[i] = clamp(r.gauss() * 0.035, -0.08, 0.08);
      phase[i] = r() * TAU;
      uTh[i] = r();
      sTh[i] = r();
      hatRoll[i] = r();
      capVar[i] = r.range(0.5, 1);
      skinI[i] = r.int(0, SKIN.length - 1);
      hairI[i] = r.chance(0.06) ? 255 : r.int(0, HAIR.length - 1);
      shirtI[i] = r.int(0, SHIRT.length - 1);
      umbI[i] = r.int(0, UMBRELLA.length - 1);
      shadeI[i] = r.int(0, 2);
      sideI[i] = r.sign();
    }

    const role = new Uint8Array(N);
    const face = new Uint8Array(N); // what the seat is showing, or turning to
    const prev = new Uint8Array(N); // what it showed before the turn
    const ap = new Float32Array(N).fill(1); // turn progress: below 0 waiting, 0..1 turning, 1 settled
    const dirty = new Uint8Array(N);
    const lift = new Float32Array(N); // the stadium wave: how far this person is out of the seat
    const liftWas = new Float32Array(N);
    const TURN = 1 / 0.48; // turns per second

    // Fidgets: a few people at a time peek over their card, wobble it, stir in their sleep.
    const MAXF = 72;
    const fSeat = new Int16Array(MAXF).fill(-1);
    const fT0 = new Float32Array(MAXF);
    const fDur = new Float32Array(MAXF);
    const fKind = new Uint8Array(MAXF);
    const fidOf = new Int16Array(N).fill(-1);
    let fidAcc = 0;

    // Up to three waves in flight.
    const WAVES = 3;
    const wOn = new Uint8Array(WAVES);
    const wT0 = new Float32Array(WAVES);
    const wDx = new Float32Array(WAVES);
    const wDy = new Float32Array(WAVES);
    const wSpeed = new Float32Array(WAVES);
    const wAmp = new Float32Array(WAVES);
    const wFrom = new Float32Array(WAVES);
    const wTo = new Float32Array(WAVES);
    let gustAcc = 0.72;

    // The rolling refresh visits seats in a scattered order.
    const order = new Uint16Array(N);
    for (let i = 0; i < N; i++) order[i] = i;
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    let orderAt = 0;
    const numList = new Uint16Array(N);
    let numCount = 0;
    let numAt = 0;

    // Cloud field: low-frequency noise, thresholded so that the covered share
    // of the stand equals the cloud cover. Quantiles are measured once.
    const cloudAt = (x, y, z) => 0.72 * noise.n3(x / 340, y / 340, z) + 0.28 * noise.n2(x / 130 + 9.1, y / 130 - 4.3);
    const QN = 4096;
    const quant = new Float32Array(QN);
    for (let i = 0; i < QN; i++) quant[i] = cloudAt(r.range(0, 60000), r.range(0, 60000), r.range(0, 50));
    quant.sort();
    const quantile = (p) => quant[clamp(Math.round(p * (QN - 1)), 0, QN - 1)];
    let cloudX = r.range(0, 5000);
    let cloudY = r.range(0, 5000);

    // ----- palette (rebuilt when the light or the sky changes) ---------------
    const P = {
      stand: "#05060a", eye: "#17181c", snow: "#f5f7fb", light: "#fff2c8", halo: "rgba(255,190,90,0.2)", halo2: "rgba(255,205,120,0.45)", straw: "#e6cd8a",
      sky: new Array(COLS * 3), cloud: new Array(COLS * 3), core: new Array(COLS * 3), lap: new Array(COLS),
      lit: new Array(4), skin: new Array(6), skinLit: new Array(6), skinMoat: new Array(6), hair: new Array(8), shirt: new Array(8),
      beanie: new Array(6), umb: new Array(6), umbDark: new Array(6), veil: new Array(ROWS), veilNum: new Array(ROWS),
    };
    const env = {
      cloud: 0, thrCloud: 9, thrCore: 9, moatCloud: false, lit: false, umb: 0, sleep: 0, snow: 0, beanie: 0, sunhat: 0, fog: 0,
      wx: 1, wy: 0, cloudSpeed: 0, gusty: 0, dayK: 1, t: 0, bannerAmp: 2, bannerOm: 1,
    };
    let paletteKey = "";
    let clothDay = null;

    function computePalette(s) {
      const dl = s.daylight;
      const wx = s.weather;
      const dayK = smoothstep(0.04, 0.6, dl);
      env.dayK = dayK;
      const mean = toOklch(s.sky.mean);
      P.stand = mix(mix("#040508", s.sky.mean, 0.1), oklch(0.27, Math.min(0.05, mean.c * 0.6), mean.h), dayK);
      const moonK = s.moon.up ? s.moon.illumination * (1 - 0.8 * clamp(wx.cloud / 100)) : 0;
      const pl = clamp(0.1 + 0.9 * smoothstep(0.02, 0.5, dl) + 0.12 * moonK);
      const moonTint = (1 - dayK) * moonK * 0.5;
      const person = (c) => mix(P.stand, moonTint > 0.01 ? mix(c, "#93a8cf", moonTint) : c, pl);

      const skyRamp = ramp([s.sky.west, s.sky.northWest, s.sky.northEast, s.sky.east]);
      const cardDim = 0.74 + 0.26 * dayK;
      const cloudMix = 0.28 + 0.54 * dayK;
      for (let c = 0; c < COLS; c++) {
        const sky = mix(P.stand, skyRamp((c + 0.5) / COLS), cardDim);
        const cl = mix(sky, "#f6f2e9", cloudMix);
        const core = mix(mix(cl, sky, 0.24), "#39414f", 0.07);
        P.sky[c * 3] = mix(sky, "#000000", 0.045);
        P.sky[c * 3 + 1] = sky;
        P.sky[c * 3 + 2] = mix(sky, "#ffffff", 0.05);
        P.cloud[c * 3] = mix(cl, sky, 0.07);
        P.cloud[c * 3 + 1] = cl;
        P.cloud[c * 3 + 2] = mix(cl, "#ffffff", 0.07);
        P.core[c * 3] = mix(core, sky, 0.07);
        P.core[c * 3 + 1] = core;
        P.core[c * 3 + 2] = mix(core, "#ffffff", 0.06);
        P.lap[c] = mix(P.stand, sky, 0.55);
      }
      const midSky = P.sky[18 * 3 + 1];
      const midCloud = P.cloud[18 * 3 + 1];

      // Numerals turn from ink to lit cards where the cards behind them are mid-dark.
      if (env.moatCloud ? wx.cloud < 45 : wx.cloud > 55) env.moatCloud = !env.moatCloud;
      const bgLum = luminance(env.moatCloud ? midCloud : midSky);
      if (paletteKey === "") env.lit = bgLum < 0.15;
      else if (env.lit ? bgLum > 0.17 : bgLum < 0.13) env.lit = !env.lit;
      const litBase = mix("#c88a35", "#ffd98a", smoothstep(0.02, 0.12, bgLum));
      for (let k = 0; k < 4; k++) P.lit[k] = mix(litBase, "#7d4c1a", (3 - k) * 0.11);

      for (let k = 0; k < 6; k++) {
        P.skin[k] = person(SKIN[k]);
        P.skinLit[k] = mix(P.skin[k], mix(SKIN[k], "#ffc980", 0.45), 0.25 + 0.75 * (1 - dayK));
        P.skinMoat[k] = mix(P.skin[k], "#c98d45", 0.22 * (1 - dayK));
        P.beanie[k] = person(BEANIE[k]);
        const u = toOklch(mix(UMBRELLA[k], midSky, 0.4));
        const skyL = toOklch(midSky).l;
        const um = oklch(lerp(u.l, skyL, 0.72) + (k % 3 - 1) * 0.03, u.c, u.h);
        P.umb[k] = mix(P.stand, um, 0.5 + 0.5 * dayK);
        P.umbDark[k] = mix(P.umb[k], "#000000", 0.16);
      }
      for (let k = 0; k < 8; k++) {
        P.hair[k] = person(HAIR[k]);
        P.shirt[k] = person(SHIRT[k]);
      }
      P.straw = person("#e6cd8a");
      P.eye = mix(P.stand, "#15161a", 0.4 + 0.6 * pl);
      P.snow = mix(P.stand, "#f5f7fb", 0.3 + 0.7 * pl);

      // Fog and haze take the back rows (the top of the stand) first.
      const fogCol = mix(s.sky.mean, mix("#0a0b10", "#ffffff", dayK), 0.3);
      for (let row = 0; row < ROWS; row++) {
        const a = env.fog * 0.92 * Math.pow(1 - row / ROWS, 1.15);
        P.veil[row] = a > 0.012 ? rgba(fogCol, +a.toFixed(3)) : "";
        P.veilNum[row] = a > 0.08 ? rgba(fogCol, +(a * 0.15).toFixed(3)) : "";
      }

      // Cloth and paint. The cloth is cream by day and dark at night; the paint
      // flips from ink to amber while the cloth is passing through mid-grey.
      const k = smoothstep(0.12, 0.32, dl);
      const day = k > 0.5;
      const st = wrap.style;
      st.setProperty("--cloth", mix("#17181e", "#f1e7d3", k));
      st.setProperty("--hem", mix("#2a2b34", "#d6c8ab", k));
      if (day !== clothDay) {
        clothDay = day;
        st.setProperty("--paint", day ? "#14151c" : "#f1b55b");
        st.setProperty("--soft", day ? "#b0301b" : "#bd8d4c");
        st.setProperty("--accent", day ? "#b0301b" : "#bd8d4c");
        st.setProperty("--on", day ? "#f6eedd" : "#17181e");
      }
    }

    function updateEnv(s) {
      const wx = s.weather;
      env.t = s.t;
      env.cloud = clamp(wx.cloud / 100);
      env.thrCloud = env.cloud < 0.02 ? 9 : env.cloud > 0.985 ? -9 : quantile(1 - env.cloud);
      env.thrCore = env.cloud < 0.02 ? 9 : quantile(1 - env.cloud * 0.5);
      const snowing = wx.falling === "snow";
      env.umb = wx.falling ? clamp((snowing ? 0.12 : 0.22) + wx.intensity * (snowing ? 0.6 : 0.95)) : 0;
      env.snow = snowing ? clamp(0.35 + 0.65 * wx.intensity) : 0;
      const night = 1 - smoothstep(0.06, 0.3, s.daylight);
      env.sleep = night * lerp(0.3, 0.97, smoothstep(0.08, 0.45, s.sun.up ? 0 : s.sun.progress));
      env.beanie = smoothstep(44, 30, wx.temp) * 0.9;
      env.sunhat = smoothstep(80, 92, wx.temp) * smoothstep(0.3, 0.6, s.daylight) * 0.6;
      env.fog = clamp((wx.fog ? 1 : 0.55 * clamp((5 - wx.visibility) / 5)) + 0.3 * clamp((wx.aqi - 90) / 120));
      const b = ((wx.windDir + 180) * Math.PI) / 180; // where the wind is going
      env.wx = Math.sin(b);
      env.wy = -Math.cos(b);
      env.cloudSpeed = wx.wind * 1.7;
      env.gusty = clamp((wx.gust - 10) / 30);
      env.bannerAmp = clamp(1.4 + wx.wind * 0.2, 1.4, 6.5);
      env.bannerOm = (0.55 + wx.wind * 0.07) * (env.wx < 0 ? -1 : 1);
    }

    // ----- banners ----------------------------------------------------------
    function makeBanner(cls, ph) {
      const node = el("div", { class: `bn ${cls}` });
      const slices = [];
      for (let k = 0; k < 17; k++) {
        const sl = el("div", { class: "sl", style: { left: `${k * 60 - 0.5}px` } });
        node.append(sl);
        slices.push(sl);
      }
      const tx = el("div", { class: "tx" });
      node.append(tx);
      wrap.append(node);
      return { node, slices, tx, c0: -1, c1: -1, r0: -1, r1: -1, n: 0, x: 0, ph, items: [] };
    }
    function placeBanner(b, c0, c1, r0, r1) {
      if (b.c0 === c0 && b.c1 === c1 && b.r0 === r0 && b.r1 === r1) return false;
      b.c0 = c0; b.c1 = c1; b.r0 = r0; b.r1 = r1;
      b.x = c0 * S;
      b.n = Math.round(((c1 - c0 + 1) * S) / 60);
      Object.assign(b.node.style, { left: `${b.x}px`, top: `${r0 * S + 13}px`, width: `${(c1 - c0 + 1) * S}px`, height: `${(r1 - r0 + 1) * S - 14}px` });
      b.slices.forEach((sl, k) => (sl.style.display = k < b.n ? "" : "none"));
      return true;
    }
    // Where each rippling piece of type sits across the stage.
    function measure(b) {
      const base = wrap.getBoundingClientRect();
      const k = base.width / 1080 || 1;
      b.items.length = 0;
      for (const node of b.tx.querySelectorAll(".g")) {
        const q = node.getBoundingClientRect();
        b.items.push({ node, x: (q.left + q.width / 2 - base.left) / k, rot: +node.dataset.rot || 0 });
      }
    }
    const letters = (node, text) => {
      node.textContent = "";
      for (const ch of text) node.append(el("span", { class: "g", text: ch === " " ? " " : ch }));
    };
    const words = (node, text) => {
      node.textContent = "";
      text.split(/\s+/).forEach((w, k) => {
        if (k) node.append(" ");
        node.append(el("span", { class: "g", text: w }));
      });
    };
    const pair = (cls) => {
      const label = el("i");
      const value = el("b", { style: { fontWeight: "400" } });
      return { node: el("span", { class: `g ${cls}` }, label, value), label, value };
    };

    const bDate = makeBanner("date", 0);
    const bMid = makeBanner("mid", 2.1);
    const bTifo = makeBanner("tifo", 4.4);
    const banners = [bDate, bMid, bTifo];

    const dateLine = el("span");
    bDate.tx.append(dateLine);

    const tempEl = el("div", { class: "temp g" });
    const condEl = el("div", { class: "cond" });
    const aqi = pair("aqi");
    const uv = pair("uv");
    aqi.label.textContent = "Air quality";
    uv.label.textContent = "UV index";
    const stack = el("div", { class: "stack" }, condEl, el("div", { class: "air" }, aqi.node, uv.node));
    const ampmEl = el("div", { class: "ampm g", "data-rot": "-4" });
    bMid.tx.append(tempEl, stack, ampmEl);

    const sun = pair("sun");
    const moon = pair("moon");
    moon.label.textContent = "Moon";
    const row1 = el("div", { class: "row1" }, sun.node, moon.node);
    const rule = el("div", { class: "rule" });
    const fLabel = el("div", { class: "flabel" });
    const fLabelIn = el("span", { class: "g" });
    fLabel.append(fLabelIn);
    const fValue = el("div", { class: "fvalue" });
    bTifo.tx.append(row1, rule, fLabel, fValue);

    const flash = el("div", { class: "flash" });
    wrap.append(flash);
    grain(wrap, { opacity: 0.05 });

    const shown = {};
    const put = (key, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      return true;
    };
    let rolesStale = true;

    function updateText(s) {
      const tx = s.text;
      let changed = false;
      if (put("date", tx.date)) { letters(dateLine, tx.date); changed = true; }
      if (put("temp", tx.temp)) { tempEl.textContent = tx.temp; changed = true; }
      if (put("cond", tx.condition)) { words(condEl, tx.condition); changed = true; }
      if (put("aqi", tx.aqi)) { aqi.value.textContent = tx.aqi; changed = true; }
      if (put("uv", tx.uv)) { uv.value.textContent = tx.uv; changed = true; }
      if (put("ampm", tx.ampm)) { ampmEl.textContent = tx.ampm; changed = true; }
      if (put("sunLabel", tx.sunLabel)) { sun.label.textContent = tx.sunLabel; changed = true; }
      if (put("sunValue", tx.sunValue)) { sun.value.textContent = tx.sunValue; changed = true; }
      if (put("moon", tx.moon)) { moon.value.textContent = tx.moon; changed = true; }
      if (put("factLabel", tx.factLabel)) { fLabelIn.textContent = tx.factLabel; changed = true; }
      if (put("factValue", tx.factValue)) { words(fValue, tx.factValue); changed = true; }
      if (changed) layout(tx);
    }

    function layout(tx) {
      // The date strip is cut to the length of the date.
      dateLine.style.fontSize = "58px";
      let w = dateLine.offsetWidth;
      if (w > 900) {
        dateLine.style.fontSize = `${Math.max(44, Math.floor((58 * 900) / w))}px`;
        w = dateLine.offsetWidth;
      }
      const seats = clamp(Math.ceil((w + 84) / 60) * 2, 12, 34);
      let moved = placeBanner(bDate, (COLS - seats) / 2, (COLS - seats) / 2 + seats - 1, ROW_DATE, ROW_DATE + 2);

      moved = placeBanner(bMid, 1, 34, ROW_MID, ROW_MID + 4) || moved;
      condEl.style.fontSize = "52px";
      const cw = condEl.scrollWidth;
      const room = stack.clientWidth;
      if (cw > room) condEl.style.fontSize = `${Math.max(44, Math.floor((52 * room) / cw))}px`;

      const hasFact = tx.factValue !== "";
      rule.style.display = fLabel.style.display = fValue.style.display = hasFact ? "" : "none";
      moved = (hasFact ? placeBanner(bTifo, 1, 34, ROW_TIFO, ROW_TIFO + 9) : placeBanner(bTifo, 1, 34, ROW_TIFO + 4, ROW_TIFO + 6)) || moved;
      row1.style.fontSize = "44px";
      const rw = sun.node.offsetWidth + moon.node.offsetWidth + 40;
      if (rw > row1.clientWidth) row1.style.fontSize = `${Math.max(37, Math.floor((44 * row1.clientWidth) / rw))}px`;
      if (hasFact) {
        for (const size of [76, 62, 54, 46, 40, 36]) {
          fValue.style.fontSize = `${size}px`;
          if (fValue.offsetHeight <= 142) break;
        }
      }
      for (const b of banners) measure(b);
      if (moved) rolesStale = true;
    }

    const K1 = TAU / 760;
    const K2 = TAU / 330;
    const waveY = (x, t, ph) => env.bannerAmp * (0.62 * Math.sin(x * K1 - t * env.bannerOm + ph) + 0.38 * Math.sin(x * K2 - t * env.bannerOm * 1.63 + ph * 2.1));
    function ripple(t) {
      for (const b of banners) {
        let yl = waveY(b.x, t, b.ph);
        for (let k = 0; k < b.n; k++) {
          const yr = waveY(b.x + (k + 1) * 60, t, b.ph);
          b.slices[k].style.transform = `translateY(${((yl + yr) / 2).toFixed(2)}px) skewY(${Math.atan2(yr - yl, 60).toFixed(4)}rad)`;
          yl = yr;
        }
        for (const it of b.items) {
          const y = waveY(it.x, t, b.ph);
          const slope = (waveY(it.x + 10, t, b.ph) - waveY(it.x - 10, t, b.ph)) / 20;
          it.node.style.transform = `translateY(${y.toFixed(2)}px) rotate(${(it.rot + Math.atan(slope) * 57.3).toFixed(2)}deg)`;
        }
      }
    }

    // ----- who does what ------------------------------------------------------
    function placeLine(text, row0) {
      let total = -2;
      for (const ch of text) total += GLYPHS[+ch].w + 2;
      let col = Math.floor((COLS - total) / 2);
      for (const ch of text) {
        const { w, g } = GLYPHS[+ch];
        for (let y = 0; y < GH; y++) for (let x = 0; x < w; x++) if (g[y * w + x]) role[(row0 + y) * COLS + col + x] = R_NUM;
        col += w + 2;
      }
    }
    function computeRoles(s) {
      role.fill(R_BG);
      placeLine(s.text.hh, ROW_HOUR);
      placeLine(s.text.mm, ROW_MIN);
      numCount = 0;
      for (let i = 0; i < N; i++) {
        if (role[i] !== R_NUM) continue;
        numList[numCount++] = i;
        const c = i % COLS;
        const rw = (i / COLS) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const cc = c + dx;
            const rr = rw + dy;
            if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) continue;
            const j = rr * COLS + cc;
            if (role[j] === R_BG) role[j] = R_MOAT;
          }
        }
      }
      for (const b of banners) {
        for (let rr = b.r0; rr <= b.r1; rr++) for (let cc = b.c0; cc <= b.c1; cc++) role[rr * COLS + cc] = rr === b.r0 ? R_HOLD : R_COVER;
      }
    }
    function wantOf(i) {
      const ro = role[i];
      if (ro === R_COVER) return F_NONE;
      if (ro === R_HOLD) return F_HOLD;
      if (ro === R_NUM) return env.lit ? F_LIT : F_INK;
      if (ro === R_MOAT) return sTh[i] < env.sleep ? F_SLEEP : env.moatCloud ? F_CLOUD : F_SKY;
      if (uTh[i] < env.umb) return F_UMB;
      if (sTh[i] < env.sleep) return F_SLEEP;
      if (env.thrCloud < 8) {
        const v = cloudAt((i % COLS) * S - cloudX, ((i / COLS) | 0) * S - cloudY, env.t * 0.012);
        if (v > env.thrCore) return F_CORE;
        if (v > env.thrCloud) return F_CLOUD;
      }
      return F_SKY;
    }
    function snapAll() {
      for (let i = 0; i < N; i++) {
        const w = wantOf(i);
        if (face[i] !== w || ap[i] < 1) dirty[i] = 1;
        face[i] = prev[i] = w;
        ap[i] = 1;
        lift[i] = liftWas[i] = 0;
        if (fidOf[i] >= 0) {
          fSeat[fidOf[i]] = -1;
          fidOf[i] = -1;
          dirty[i] = 1;
        }
      }
      wOn.fill(0);
    }
    // On the minute: a diagonal wave of card flips runs down the stand.
    function minuteWave() {
      for (let i = 0; i < N; i++) {
        const w = wantOf(i);
        if (w === face[i] && face[i] > F_LIT) continue;
        if (ap[i] < 1) continue;
        prev[i] = face[i];
        face[i] = w;
        ap[i] = -((i % COLS) * 0.05 + ((i / COLS) | 0) * 0.034 + hash(i, 3) * 0.12) * TURN;
      }
    }

    // ----- drawing one seat ---------------------------------------------------
    function head(i, cx, hy, eyes, look, tip, glow) {
      ctx.fillStyle = glow === 2 ? P.skinLit[skinI[i] % 6] : glow === 1 ? P.skinMoat[skinI[i] % 6] : P.skin[skinI[i] % 6];
      ctx.beginPath();
      ctx.arc(cx, hy, 5.4, 0, TAU);
      ctx.fill();
      if (eyes) {
        ctx.fillStyle = P.eye;
        ctx.beginPath();
        ctx.arc(cx - 2.1 + look, hy + 2, 0.95, 0, TAU);
        ctx.moveTo(cx + 3.05 + look, hy + 2);
        ctx.arc(cx + 2.1 + look, hy + 2, 0.95, 0, TAU);
        ctx.fill();
      }
      const hr = hatRoll[i];
      if (hr < env.beanie) {
        const a0 = -0.12 - tip * 0.5;
        ctx.fillStyle = P.beanie[umbI[i]];
        ctx.beginPath();
        ctx.arc(cx, hy, 5.75, Math.PI + a0, TAU - a0);
        ctx.closePath();
        ctx.moveTo(cx + 1.6, hy - 5.2);
        ctx.arc(cx, hy - 5.2, 1.6, 0, TAU);
        ctx.fill();
      } else if (hr > 1 - env.sunhat) {
        ctx.fillStyle = P.straw;
        ctx.beginPath();
        ctx.ellipse(cx, hy - 1.4 + tip * 2, 8.4, 2.5, 0, 0, TAU);
        ctx.moveTo(cx + 5.2, hy - 1.6);
        ctx.arc(cx, hy - 1.6, 5.2, 0, Math.PI, true);
        ctx.fill();
      } else if (hairI[i] !== 255) {
        const a0 = 0.22 - (hairI[i] % 3) * 0.17 - tip * 0.75;
        ctx.fillStyle = P.hair[hairI[i]];
        ctx.beginPath();
        ctx.arc(cx, hy, 5.7, Math.PI + a0, TAU - a0);
        ctx.closePath();
        ctx.fill();
      }
      if (env.snow > 0.05) {
        const a0 = 0.95 - env.snow * 0.5 * capVar[i];
        ctx.fillStyle = P.snow;
        ctx.beginPath();
        ctx.arc(cx, hy - 0.4, 5.9, Math.PI + a0, TAU - a0);
        ctx.closePath();
        ctx.fill();
      }
    }
    function torso(i, hy) {
      ctx.fillStyle = P.shirt[shirtI[i]];
      ctx.beginPath();
      ctx.ellipse(15, 32, 10.5, 27.5 - hy, 0, Math.PI, TAU);
      ctx.fill();
    }

    function drawSeat(i) {
      const col = i % COLS;
      const row = (i / COLS) | 0;
      const x0 = col * S;
      const y0 = row * S;
      ctx.setTransform(R, 0, 0, R, x0 * R, y0 * R);
      ctx.fillStyle = P.stand;
      ctx.fillRect(0, 0, S, S);

      let f = face[i];
      let open = 1;
      const p = ap[i];
      if (p < 1) {
        if (p < 0.5) {
          f = prev[i];
          if (p > 0) {
            const u = p * 2;
            open = 1 - u * u * (3 - 2 * u);
          }
        } else {
          const u = p * 2 - 1;
          open = u * u * (3 - 2 * u);
        }
      }
      if (f === F_NONE) return;

      // A fidget, if this person is in the middle of one.
      let peek = 0, look = 0, wob = 0, dip = 0;
      const fi = fidOf[i];
      if (fi >= 0) {
        const u = clamp((env.t - fT0[fi]) / fDur[fi]);
        const inOut = smoothstep(0, 0.22, u) * (1 - smoothstep(0.78, 1, u));
        if (fKind[fi] === 0) {
          peek = inOut;
          look = Math.sin(u * TAU * 1.5) * 1.3 * inOut;
        } else {
          wob = Math.sin(u * TAU * 2.5) * 0.13 * (1 - u);
          dip = Math.sin(u * Math.PI) * 1.6;
        }
      }
      const up = lift[i];
      const cx = 15 + jx[i];
      const veil = f === F_INK || f === F_LIT ? "" : P.veil[row];

      if (f <= F_LIT) {
        // Someone holding a card: hair and eyes over the top edge, fingers gripping it.
        const hy = 9.6 - 2.4 * peek - 0.85 * up;
        const numeral = f >= F_INK;
        if (open < 0.97 || up > 0.4) torso(i, hy);
        if (numeral && P.veilNum[row] === "" && P.veil[row] !== "") {
          ctx.fillStyle = P.veil[row];
          ctx.fillRect(0, 0, S, S);
        }
        head(i, cx, hy, peek > 0.12, look, 0, f === F_LIT ? 2 : role[i] === R_MOAT ? 1 : 0);
        const hh = 9.5 * open;
        if (hh > 0.35) {
          const a = tilt[i] + wob;
          const c = Math.cos(a) * R;
          const sn = Math.sin(a) * R;
          ctx.setTransform(c, sn, -sn, c, (x0 + cx) * R, (y0 + 20.1 - up + dip) * R);
          let fill;
          if (f === F_SKY) fill = P.sky[col * 3 + shadeI[i]];
          else if (f === F_CLOUD) fill = P.cloud[col * 3 + shadeI[i]];
          else if (f === F_CORE) fill = P.core[col * 3 + shadeI[i]];
          else if (f === F_INK) fill = INK[shadeI[i]];
          else fill = P.lit[((Math.sin(env.t * 0.55 + phase[i]) * 0.5 + 0.5) * 3.99) | 0];
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.roundRect(-13, -hh, 26, hh * 2, Math.min(3, hh));
          ctx.fill();
          if (env.snow > 0.05) {
            ctx.fillStyle = P.snow;
            ctx.beginPath();
            ctx.roundRect(-13, -hh - 0.6, 26, Math.min(hh, (1.2 + 3.4 * env.snow * capVar[i]) * (numeral ? 0.55 : 1)), 1.6);
            ctx.fill();
          }
          ctx.fillStyle = f === F_LIT ? P.skinLit[skinI[i] % 6] : P.skin[skinI[i] % 6];
          ctx.beginPath();
          ctx.arc(-10.4, -hh + 0.7, 1.9, 0, TAU);
          ctx.moveTo(12.3, -hh + 0.7);
          ctx.arc(10.4, -hh + 0.7, 1.9, 0, TAU);
          ctx.fill();
          if (f === F_LIT && open > 0.5) {
            const lx = sideI[i] * 6.6;
            const ly = -hh - 2.4;
            ctx.fillStyle = P.halo;
            ctx.beginPath();
            ctx.arc(lx, ly, 5.6, 0, TAU);
            ctx.fill();
            ctx.fillStyle = P.halo2;
            ctx.beginPath();
            ctx.arc(lx, ly, 3.1, 0, TAU);
            ctx.fill();
            ctx.fillStyle = P.light;
            ctx.beginPath();
            ctx.arc(lx, ly, 1.6, 0, TAU);
            ctx.fill();
          }
          ctx.setTransform(R, 0, 0, R, x0 * R, y0 * R);
        }
        if (numeral && P.veilNum[row] !== "") {
          ctx.fillStyle = P.veilNum[row];
          ctx.fillRect(0, 0, S, S);
        }
      } else if (f === F_UMB) {
        // Under an umbrella: a face below a scalloped dome.
        const hy = lerp(9.6, 20.2, open);
        torso(i, hy);
        head(i, 15, hy, true, look, 0, 0);
        const rad = 13.2 * open;
        if (rad > 0.6) {
          const a = (up / 9) * 0.5 * (env.wx < 0 ? -1 : 1) + wob * 1.6;
          const c = Math.cos(a) * R;
          const sn = Math.sin(a) * R;
          ctx.setTransform(c, sn, -sn, c, (x0 + 15) * R, (y0 + 14.8 + dip * 0.5) * R);
          const k = umbI[i];
          ctx.fillStyle = P.umb[k];
          ctx.beginPath();
          ctx.moveTo(-rad, 0);
          ctx.arc(0, 0, rad, Math.PI, TAU);
          ctx.quadraticCurveTo(rad * 0.667, -rad * 0.3, rad * 0.333, 0);
          ctx.quadraticCurveTo(0, -rad * 0.3, -rad * 0.333, 0);
          ctx.quadraticCurveTo(-rad * 0.667, -rad * 0.3, -rad, 0);
          ctx.fill();
          ctx.fillStyle = P.umbDark[k];
          ctx.beginPath();
          ctx.moveTo(-rad * 0.333, 0);
          ctx.quadraticCurveTo(-rad * 0.36, -rad * 0.74, 0, -rad);
          ctx.quadraticCurveTo(rad * 0.36, -rad * 0.74, rad * 0.333, 0);
          ctx.quadraticCurveTo(0, -rad * 0.3, -rad * 0.333, 0);
          ctx.fill();
          if (env.snow > 0.05) {
            const a0 = 1.05 - env.snow * 0.45 * capVar[i];
            ctx.fillStyle = P.snow;
            ctx.beginPath();
            ctx.arc(0, 0, rad, Math.PI + a0, TAU - a0);
            ctx.closePath();
            ctx.fill();
          }
          ctx.setTransform(R, 0, 0, R, x0 * R, y0 * R);
        }
      } else if (f === F_SLEEP) {
        // Asleep: card in the lap, head tipped forward.
        const deep = open + (up / 9) * 0.25 - peek * 0.75;
        const hy = lerp(9.6, 18.2, deep);
        torso(i, hy);
        ctx.fillStyle = P.lap[col];
        ctx.fillRect(5.5, 26.2, 19, 3.2);
        head(i, cx, hy, peek > 0.3, look, clamp(deep), role[i] === R_MOAT ? 1 : 0);
      } else {
        // Holding the banner: all you see is someone looking over the top of it.
        head(i, cx, 9.6 - peek, true, look, 0, 0);
      }
      if (veil !== "") {
        ctx.fillStyle = veil;
        ctx.fillRect(0, 0, S, S);
      }
    }

    // ----- rain and snow ------------------------------------------------------
    const DROPS = 340;
    const dx = new Float32Array(DROPS);
    const dy = new Float32Array(DROPS);
    const dv = new Float32Array(DROPS);
    for (let k = 0; k < DROPS; k++) {
      dx[k] = r.range(0, 1080);
      dy[k] = r.range(0, 1920);
      dv[k] = r.range(0.7, 1.3);
    }
    let wetClean = true;
    function drawWet(s) {
      const wx = s.weather;
      const g = wet.ctx;
      const count = wx.falling ? Math.round(DROPS * clamp(0.18 + 0.82 * wx.intensity)) : 0;
      if (!count) {
        if (!wetClean) wet.clear();
        wetClean = true;
        return;
      }
      wet.clear();
      wetClean = false;
      const slant = clamp(env.wx * wx.wind * 0.03, -0.7, 0.7);
      if (wx.falling === "snow") {
        const fall = 46 + wx.intensity * 50;
        g.fillStyle = rgba(P.snow, 0.9);
        g.beginPath();
        for (let k = 0; k < count; k++) {
          const sway = Math.sin(s.t * 0.9 + k) * 14;
          dy[k] += fall * dv[k] * s.dt;
          dx[k] += (slant * fall * 1.6 + sway * 0.4) * dv[k] * s.dt;
          if (dy[k] > 1930) { dy[k] -= 1940; dx[k] = hash(k, s.frame) * 1080; }
          if (dx[k] > 1090) dx[k] -= 1100;
          else if (dx[k] < -10) dx[k] += 1100;
          const q = 1.5 + 1.7 * (dv[k] - 0.7);
          g.moveTo(dx[k] + q, dy[k]);
          g.arc(dx[k], dy[k], q, 0, TAU);
        }
        g.fill();
      } else {
        const fall = wx.falling === "drizzle" ? 420 : 640 + wx.intensity * 260;
        const len = wx.falling === "drizzle" ? 12 : 20 + wx.intensity * 16;
        g.strokeStyle = rgba(mix(P.stand, "#dfe7f5", 0.55 + 0.45 * env.dayK), 0.34);
        g.lineWidth = 1.5;
        g.lineCap = "round";
        g.beginPath();
        for (let k = 0; k < count; k++) {
          dy[k] += fall * dv[k] * s.dt;
          dx[k] += slant * fall * dv[k] * s.dt;
          if (dy[k] > 1930) { dy[k] -= 1960; dx[k] = hash(k, s.frame) * 1080; }
          if (dx[k] > 1090) dx[k] -= 1100;
          else if (dx[k] < -10) dx[k] += 1100;
          const l = len * dv[k];
          g.moveTo(dx[k], dy[k]);
          g.lineTo(dx[k] - slant * l, dy[k] - l);
        }
        g.stroke();
      }
    }

    // ----- the frame ----------------------------------------------------------
    let first = true;
    let lastMs = 0;
    let lastH = -1;
    let lastM = -1;
    let jumped = false;
    let flood = 0;
    let flashWas = 0;

    function frame(s) {
      const t = s.t;
      const dt = s.dt;
      const dms = s.ms - lastMs;
      const jump = first || Math.abs(dms) > 5000;
      lastMs = s.ms;

      updateText(s);
      updateEnv(s);
      if (jump || s.frame % 8 === 0) {
        const key = `${s.sky.west}${s.sky.northWest}${s.sky.northEast}${s.sky.east}${Math.round(s.daylight * 500)}|${Math.round(s.weather.cloud)}|${Math.round(env.fog * 100)}|${Math.round(s.moon.alt)}`;
        if (key !== paletteKey) {
          computePalette(s);
          paletteKey = key;
        }
      }

      // The clouds ride the wind.
      const adv = env.cloudSpeed * clamp(dms / 1000, 0, 900);
      cloudX += env.wx * adv;
      cloudY += env.wy * adv;

      const newMinute = s.clock.h12 !== lastH || s.clock.m !== lastM;
      if (newMinute || rolesStale) {
        lastH = s.clock.h12;
        lastM = s.clock.m;
        const relaid = rolesStale;
        rolesStale = false;
        computeRoles(s);
        if (!jump) {
          if (newMinute) minuteWave();
          else if (relaid) snapAll();
        }
      }

      if (jump) {
        snapAll();
        if (first || !jumped) dirty.fill(1);
        else flood = 4; // racing clock: spread the colour refresh over a few frames
      } else {
        // Does anyone need to turn their card, open an umbrella, nod off?
        for (let i = s.frame & 3; i < N; i += 4) {
          if (ap[i] < 1) continue;
          const w = wantOf(i);
          if (w === face[i]) continue;
          prev[i] = face[i];
          face[i] = w;
          const slow = w === F_UMB || prev[i] === F_UMB ? 2.6 : w === F_SLEEP || prev[i] === F_SLEEP ? 5 : 0.5;
          ap[i] = -hash(i, s.frame) * slow * TURN;
        }
      }
      jumped = jump;
      if (flood > 0) {
        flood--;
        for (let i = flood; i < N; i += 4) dirty[i] = 1;
      }

      // Turns in progress.
      const step = dt * TURN;
      for (let i = 0; i < N; i++) {
        if (ap[i] >= 1) continue;
        const a = ap[i] + step;
        ap[i] = a >= 1 ? 1 : a;
        if (a > 0) dirty[i] = 1;
      }

      // Gusts set off stadium waves that travel downwind.
      if (!jump && env.gusty > 0.01) {
        gustAcc += dt * lerp(1 / 50, 1 / 7, env.gusty);
        if (gustAcc >= 1) {
          gustAcc -= 1;
          for (let k = 0; k < WAVES; k++) {
            if (wOn[k]) continue;
            wOn[k] = 1;
            wT0[k] = t;
            wDx[k] = env.wx;
            wDy[k] = env.wy;
            wSpeed[k] = 230 + 300 * env.gusty;
            wAmp[k] = 5 + 4 * env.gusty;
            const ext = Math.abs(env.wx) * 540 + Math.abs(env.wy) * 960;
            const mid = env.wx * 540 + env.wy * 960;
            wFrom[k] = mid - ext - 90;
            wTo[k] = mid + ext + 90;
            break;
          }
        }
      }
      let anyWave = false;
      for (let k = 0; k < WAVES; k++) if (wOn[k]) anyWave = true;
      if (anyWave) {
        for (let i = 0; i < N; i++) {
          liftWas[i] = lift[i];
          lift[i] = 0;
        }
        for (let k = 0; k < WAVES; k++) {
          if (!wOn[k]) continue;
          const front = wFrom[k] + (t - wT0[k]) * wSpeed[k];
          if (front > wTo[k]) {
            wOn[k] = 0;
            continue;
          }
          const ax = wDx[k] * S;
          const ay = wDy[k] * S;
          const base = wDx[k] * 15 + wDy[k] * 15 - front;
          for (let i = 0; i < N; i++) {
            const d = (i % COLS) * ax + ((i / COLS) | 0) * ay + base;
            if (d > -75 && d < 75) {
              const c = Math.cos(d * 0.020944); // pi / 150
              const v = wAmp[k] * c * c;
              if (v > lift[i]) lift[i] = v;
            }
          }
        }
        for (let i = 0; i < N; i++) {
          if (lift[i] > 0.05 || liftWas[i] > 0.05) {
            dirty[i] = 1;
            if (i >= COLS) dirty[i - COLS] = 1;
          } else lift[i] = 0;
        }
      }

      // Fidgets.
      for (let k = 0; k < MAXF; k++) {
        const i = fSeat[k];
        if (i < 0) continue;
        dirty[i] = 1;
        if (t - fT0[k] >= fDur[k]) {
          fSeat[k] = -1;
          fidOf[i] = -1;
        }
      }
      fidAcc += dt * (5 + 24 * env.dayK);
      while (fidAcc >= 1) {
        fidAcc -= 1;
        const i = Math.floor(r() * N);
        const f = face[i];
        if (f === F_NONE || fidOf[i] >= 0 || ap[i] < 1) continue;
        for (let k = 0; k < MAXF; k++) {
          if (fSeat[k] >= 0) continue;
          fSeat[k] = i;
          fidOf[i] = k;
          fT0[k] = t;
          fDur[k] = 1.4 + r() * 1.6;
          fKind[k] = f === F_UMB ? 1 : f === F_SLEEP || f === F_HOLD ? 0 : r() < 0.6 ? 0 : 1;
          break;
        }
      }

      // The rolling refresh: everyone by day; at night mostly the lights, which breathe.
      const nightly = env.lit ? 30 : 0;
      for (let k = 0; k < nightly && numCount; k++) {
        numAt = (numAt + 1) % numCount;
        dirty[numList[numAt]] = 1;
      }
      for (let k = 0; k < 26; k++) {
        orderAt = (orderAt + 1) % N;
        dirty[order[orderAt]] = 1;
      }

      for (let i = 0; i < N; i++) {
        if (dirty[i]) {
          dirty[i] = 0;
          drawSeat(i);
        }
      }
      drawWet(s);
      if (jump || (s.frame & 1) === 0) ripple(t);

      // Lightning: a soft, rare lift of the whole stand.
      let fl = 0;
      if (s.weather.kind === "storm") {
        const slot = Math.floor(t / 11);
        if (hash(slot, seed) < 0.45) {
          const u = (t - slot * 11 - 2 - hash(slot, 7) * 5) / 1.8;
          if (u > 0 && u < 1) fl = Math.sin(u * Math.PI) ** 2 * 0.1;
        }
      }
      if (fl !== flashWas) {
        flashWas = fl;
        flash.style.opacity = fl.toFixed(3);
      }
      first = false;
    }

    return { frame };
  },
};

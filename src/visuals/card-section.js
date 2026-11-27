// The Card Section
//
// A stadium stand seen front-on: 36 x 64 seats, a little person in each one.
// The people inside the numeral shapes hold up the contrast side of their card,
// so the crowd itself spells the hour over the minutes, framed by a one-seat
// moat (white cards by day, cards lowered into a dark halo once the numerals
// are lit). Everyone else performs the weather:
//
//   sky      background cards are the measured sky colours, west on the left
//            to east on the right
//   cloud    a share of the cards equal to the cloud cover turns cloud-white,
//            in soft blobs that drift across the stand on the real wind
//   wind     cards are held crooked against it; every so often (how often
//            depends on the gusts) a stadium wave travels downwind
//   rain     the harder it falls, the more people swap card for umbrella (dim
//            wet domes after dark); snow leaves white caps on heads and cards
//   heat     sun hats, and people fanning themselves with their cards
//   cold     beanies
//   fog      the back rows (the top of the stand) fade into it
//   night    the crowd goes dark and nods off; the numeral holders light their
//            cards. Ink switches to lit cards in one step, early: when the
//            cards behind are no longer light enough, or the light under the
//            weather (twilight under heavy cloud counts as night) drops
//   minute   a diagonal flip-wave turns over every card in the minute half of
//            the stand and re-forms the digits; on the hour, the whole stand
//
// Three cloth banners passed over the crowd carry the words: the date, the
// temperature and condition (with AM/PM, air quality and UV), and a tifo with
// the sunrise/sunset countdown, the moon and today's fact.
//
// Technique: one persistent canvas. Only seats that change are redrawn, at most
// DRAW_BUDGET a frame, round-robin, so busy moments (the minute wave, a gust)
// spread over frames instead of costing one big one; turns are stepped so a
// flipping card is redrawn only a handful of times. Rain and snow are small
// sprites on their own layer. Banners are DOM, cut into 60 px slices that
// ripple with the wind.

import { TAU, clamp, lerp, smoothstep, rng, hash, createNoise, mix, ramp, rgba, luminance, toOklch, oklch, el, addStyle, canvas2d, grain } from "../lib/kit.js";

const COLS = 36;
const ROWS = 64;
const S = 30; // one seat, in stage units
const N = COLS * ROWS;

// Where things sit (64 rows of 30 px fill the 1920 px frame exactly). The
// digits are 18 rows each; the banners are placed in stage pixels so that
// each keeps at least 50 px of crowd between itself and the digits.
const ROW_HOUR = 6; // rows 6-23: y 180-720
const ROW_MIN = 31; // rows 31-48: y 930-1470
const DATE_TOP = 0, DATE_H = 154; // the ribbon board along the roof: 0-154
const MID_TOP = 770, MID_H = 110; // 770-880
const TIFO_TOP = 1520; // height follows its content

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

const CSS = `
.cs { position: absolute; inset: 0; overflow: hidden; background: #05060a; font-family: "Bowlby One", "Arial Black", sans-serif; }
.cs .bn { position: absolute; z-index: 3; box-sizing: border-box; }
.cs .board { --paint: #f3ead8; --soft: #eba851; border: 6px solid #2a2c35; border-radius: 6px;
  background: radial-gradient(circle, rgba(255,240,215,0.045) 1.1px, transparent 1.7px) 0 0 / 6px 6px, #0f1015;
  box-shadow: 0 5px 0 rgba(0,0,0,0.4), inset 0 0 0 2px #17181e; }
.cs .date.board { border-width: 0 0 6px 0; border-radius: 0; --paint: #f6bf66; }
.cs .post { position: absolute; z-index: 2; width: 24px; background: linear-gradient(90deg, #26272f, #3a3c46 40%, #1c1d23); }
.cs .mid .sl::before { content: ""; position: absolute; top: -7px; left: 11px; width: 10px; height: 10px; border-radius: 50%;
  background: var(--hand1); box-shadow: 27px 1px 0 var(--hand1); }
.cs .mid .sl:nth-child(3n+1)::before { background: var(--hand2); box-shadow: 27px 1px 0 var(--hand2); }
.cs .mid .sl:nth-child(3n+2)::before { background: var(--hand3); box-shadow: 27px -1px 0 var(--hand3); }
.cs .sl { position: absolute; top: 0; height: 100%; width: 61px; box-sizing: border-box; background: var(--cloth);
  border-top: 4px solid var(--hem); border-bottom: 4px solid var(--hem); }
.cs .tx { position: absolute; inset: 0; color: var(--paint); }
.cs .g { display: inline-block; white-space: pre; }
.cs i { font-style: normal; font-size: 28px; color: var(--soft); margin-right: 12px; }
.cs .date .tx { display: flex; align-items: center; justify-content: center; padding-top: 26px; font-size: 58px; line-height: 1; white-space: nowrap; }
.cs .mid .tx { display: flex; align-items: center; padding: 0 30px 0 34px; gap: 44px; }
.cs .temp { flex: none; font-size: 104px; line-height: 1; margin-top: -2px; }
.cs .stack { flex: 1; min-width: 0; }
.cs .cond { font-size: 54px; line-height: 1; white-space: nowrap; }
.cs .ampm { flex: none; background: var(--accent); color: var(--on); font-size: 50px; line-height: 1; padding: 12px 16px 15px; border-radius: 10px; }
.cs .col { position: absolute; left: 0; right: 0; top: 0; padding: 21px 34px 24px; display: flex; flex-direction: column; }
.cs .row1 { display: flex; justify-content: space-between; align-items: baseline; gap: 44px; font-size: 42px; line-height: 1; white-space: nowrap; }
.cs .row2 { display: flex; align-items: baseline; gap: 56px; margin-top: 24px; font-size: 42px; line-height: 1; white-space: nowrap; }
.cs .rule { height: 3px; margin-top: 28px; border-radius: 2px; background: var(--soft); opacity: 0.5; }
.cs .flabel { margin-top: 26px; font-size: 28px; line-height: 1; color: var(--soft); white-space: nowrap; }
.cs .fvalue { margin-top: 10px; font-size: 50px; line-height: 1.2; text-wrap: balance; }
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
    // The kit keeps setTransform() in stage units (it applies the canvas's own
    // pixel ratio itself), so R stays 1 at any screen scale.
    const R = 1;
    const wet = canvas2d(wrap, { adaptive: true }); // rain and snow, redrawn in full while it falls
    wet.canvas.style.zIndex = "2";

    const r = rng(seed);
    const noise = createNoise(seed);

    // ----- the people -------------------------------------------------------
    const jx = new Float32Array(N); // sits a little off-centre
    const tilt = new Float32Array(N); // holds the card a little crooked
    const uTh = new Float32Array(N); // brings an umbrella when the rain passes this
    const sTh = new Float32Array(N); // falls asleep when the night passes this
    const hatRoll = new Float32Array(N);
    const capVar = new Float32Array(N);
    const skinI = new Uint8Array(N);
    const hairI = new Uint8Array(N);
    const shirtI = new Uint8Array(N);
    const umbI = new Uint8Array(N);
    const shadeI = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      jx[i] = r.range(-1, 1);
      tilt[i] = clamp(r.gauss() * 0.035, -0.08, 0.08);
      uTh[i] = r();
      sTh[i] = r();
      hatRoll[i] = r();
      capVar[i] = r.range(0.5, 1);
      skinI[i] = r.int(0, SKIN.length - 1);
      hairI[i] = r.chance(0.06) ? 255 : r.int(0, HAIR.length - 1);
      shirtI[i] = r.int(0, SHIRT.length - 1);
      umbI[i] = r.int(0, UMBRELLA.length - 1);
      shadeI[i] = r.int(0, 2);
    }

    const role = new Uint8Array(N);
    const face = new Uint8Array(N); // what the seat is showing, or turning to
    const prev = new Uint8Array(N); // what it showed before the turn
    const ap = new Float32Array(N).fill(1); // turn progress: below 0 waiting, 0..1 turning, 1 settled
    const dirty = new Uint8Array(N);
    const lift = new Float32Array(N); // the stadium wave: how far this person is out of the seat
    const liftWas = new Float32Array(N);
    const numLvl = new Uint8Array(N); // a numeral card's shade in the slow ripple across the figures
    const TURN = 1 / 0.6; // turns per second
    const stage = new Uint8Array(N); // the turn in steps: a seat is redrawn only when its step changes
    const steps = new Uint8Array(N).fill(4); // four steps for the minute wave, three for everyday turns

    // Fidgets: a few people at a time peek over their card, wobble it, stir in their sleep.
    const MAXF = 32;
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
    const wFrom = new Float32Array(WAVES);
    const wTo = new Float32Array(WAVES);
    let gustAcc = 0.72;
    let ambAcc = 0.62; // the first wave comes round a few seconds after the cut
    let ambSide = 1;
    let waveLive = false;
    function launchWave(t, dx, dy, speed) {
      for (let k = 0; k < WAVES; k++) {
        if (wOn[k]) continue;
        wOn[k] = 1;
        wT0[k] = t;
        wDx[k] = dx;
        wDy[k] = dy;
        wSpeed[k] = speed;
        const ext = Math.abs(dx) * 540 + Math.abs(dy) * 960;
        const mid = dx * 540 + dy * 960;
        wFrom[k] = mid - ext - 100;
        wTo[k] = mid + ext + 100;
        return;
      }
    }

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
      stand: "#05060a", eye: "#17181c", snow: "#f5f7fb", flake: "#f5f7fb", rain: "#dfe7f5", straw: "#e6cd8a",
      sky: new Array(COLS * 3), cloud: new Array(COLS * 3), core: new Array(COLS * 3), lap: new Array(COLS),
      lit: new Array(4), litSeam: "#000", ink: new Array(4), inkSeam: "#000", umbHi: new Array(6), skin: new Array(6), skinLit: new Array(6), skinMoat: new Array(6), hair: new Array(8), shirt: new Array(8),
      beanie: new Array(6), umb: new Array(6), umbDark: new Array(6), veil: new Array(ROWS), veilNum: new Array(ROWS),
    };
    const env = {
      cloud: 0, thrCloud: 9, thrCore: 9, lit: false, umb: 0, sleep: 0, snow: 0, beanie: 0, sunhat: 0, fog: 0,
      wx: 1, wy: 0, cloudSpeed: 0, gloomLight: 1, lean: 0, heat: 0, gusty: 0, dayK: 1, t: 0, bannerAmp: 2, bannerOm: 1,
    };
    let paletteKey = "";
    let clothDay = null;

    function computePalette(s) {
      const dl = s.daylight;
      const wx = s.weather;
      const dayK = smoothstep(0.04, 0.6, dl);
      env.dayK = dayK;
      const skyRamp = ramp([s.sky.west, s.sky.northWest, s.sky.northEast, s.sky.east]);
      const rawMid = skyRamp(0.5);
      // By day the stand between the cards is a shade of the sky itself, not a
      // dark grid, so the crowd reads as one calm field around the numerals.
      // Snow settles on it.
      let standDay = mix(rawMid, "#0d0e13", 0.46);
      if (env.snow > 0) standDay = mix(standDay, "#dfe5ee", 0.32 * env.snow);
      let standNight = mix("#040508", s.sky.mean, 0.1);
      if (env.snow > 0) standNight = mix(standNight, "#5d6676", 0.4 * env.snow);
      P.stand = mix(standNight, standDay, dayK);
      const moonK = s.moon.up ? s.moon.illumination * (1 - 0.8 * clamp(wx.cloud / 100)) : 0;
      const pl = clamp(0.17 + 0.83 * smoothstep(0.02, 0.5, dl) + 0.12 * moonK);
      const moonTint = (1 - dayK) * moonK * 0.5;
      // People's own colours are muted toward the sky by day: the crowd is the
      // ground, the numerals are the figure.
      const calm = 0.42 * dayK;
      const person = (c) => {
        let q = moonTint > 0.01 ? mix(c, "#93a8cf", moonTint) : c;
        if (calm > 0.01) q = mix(q, rawMid, calm);
        return mix(P.stand, q, pl);
      };

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

      // Numerals switch from ink to lit cards in one step, well before the crowd
      // goes dark: when the light is low (twilight under heavy cloud counts as
      // night) or the cards behind them are no longer light enough for ink.
      // What frames the ink is the moat's white cards: once those dim to mid-grey
      // (or the light under the weather fails), light up.
      const bgLum = luminance(midCloud);
      const gloom = env.gloomLight;
      if (paletteKey === "") env.lit = bgLum < 0.305 || gloom < 0.175;
      else env.lit = env.lit ? bgLum < 0.33 || gloom < 0.19 : bgLum < 0.28 || gloom < 0.16;
      // Deep amber at night (the room stays dark), brighter while there is light.
      const litBase = mix("#b37836", "#ffd98a", smoothstep(0.0, 0.25, bgLum));
      for (let k = 0; k < 4; k++) P.lit[k] = mix(litBase, "#8a5520", (3 - k) * 0.11);
      P.litSeam = mix(litBase, "#3a2208", 0.42);
      // By day the numerals are one flat ink, with the faintest slow ripple.
      for (let k = 0; k < 4; k++) P.ink[k] = mix("#111219", "#262833", k * 0.22);
      P.inkSeam = "#2c2e3a";

      for (let k = 0; k < 6; k++) {
        P.skin[k] = person(SKIN[k]);
        P.skinLit[k] = mix(P.skin[k], mix(SKIN[k], "#ffc980", 0.45), 0.25 + 0.75 * (1 - dayK));
        P.skinMoat[k] = mix(P.skin[k], "#c98d45", 0.22 * (1 - dayK));
        P.beanie[k] = person(BEANIE[k]);
        const u = toOklch(mix(UMBRELLA[k], midSky, 0.4));
        const skyL = toOklch(midSky).l;
        const um = oklch(lerp(u.l, skyL, 0.72) + (k % 3 - 1) * 0.03, u.c, u.h);
        // After dark the umbrellas keep a dim colour of their own, wet domes
        // catching the light from the cards, so the rain still shows in the crowd.
        const umNight = oklch(0.33 + (k % 3 - 1) * 0.03, Math.min(0.08, u.c * 0.7), u.h);
        P.umb[k] = mix(umNight, um, dayK);
        P.umbDark[k] = mix(P.umb[k], "#000000", 0.18);
        P.umbHi[k] = mix(P.umb[k], dayK > 0.5 ? "#ffffff" : "#ffcf8a", 0.38); // wet sheen
      }
      for (let k = 0; k < 8; k++) {
        P.hair[k] = person(HAIR[k]);
        P.shirt[k] = person(SHIRT[k]);
      }
      P.straw = person("#e6cd8a");
      P.eye = mix(P.stand, "#15161a", 0.4 + 0.6 * pl);
      P.snow = mix(P.stand, "#f5f7fb", 0.3 + 0.7 * pl);
      P.flake = mix(P.stand, "#f8f9fc", 0.8 + 0.2 * pl); // falling flakes catch the stadium lights
      P.rain = mix(P.stand, "#dfe7f5", 0.75 + 0.25 * dayK);

      // Fog and haze take the back rows (the top of the stand) first.
      const fogCol = mix(s.sky.mean, mix("#0a0b10", "#ffffff", dayK), 0.3);
      for (let row = 0; row < ROWS; row++) {
        const a = env.fog * 0.92 * Math.pow(1 - row / ROWS, 1.15);
        P.veil[row] = a > 0.012 ? rgba(fogCol, +a.toFixed(3)) : "";
        P.veilNum[row] = a > 0.08 ? rgba(fogCol, +(a * 0.15).toFixed(3)) : "";
      }

      // Cloth and paint. The cloth is cream by day and dark at night; the paint
      // flips from ink to amber while the cloth is passing through mid-grey.
      const k = smoothstep(0.15, 0.17, env.gloomLight); // a short passage: about two minutes of real twilight
      const day = k > 0.5;
      const st = wrap.style;
      st.setProperty("--cloth", mix("#17181e", "#f1e7d3", k));
      st.setProperty("--hem", mix("#2a2b34", "#d6c8ab", k));
      st.setProperty("--hand1", P.skin[1]);
      st.setProperty("--hand2", P.skin[3]);
      st.setProperty("--hand3", P.skin[0]);
      if (day !== clothDay) {
        clothDay = day;
        st.setProperty("--paint", day ? "#14151c" : "#f6be64");
        st.setProperty("--soft", day ? "#b0301b" : "#bd8d4c");
        st.setProperty("--accent", day ? "#b0301b" : "#bd8d4c");
        st.setProperty("--on", day ? "#f6eedd" : "#17181e");
      }
    }

    function updateEnv(s) {
      const wx = s.weather;
      // The light as it feels under the weather: heavy cloud, rain and fog make
      // an evening night early.
      env.gloomLight = s.daylight * clamp(1 - 0.3 * clamp(wx.cloud / 100) - 0.25 * wx.intensity - 0.1 * (wx.fog ? 1 : 0), 0.3, 1);
      env.t = s.t;
      env.cloud = clamp(wx.cloud / 100);
      env.thrCloud = env.cloud < 0.02 ? 9 : env.cloud > 0.985 ? -9 : quantile(1 - env.cloud);
      env.thrCore = env.cloud < 0.02 ? 9 : quantile(1 - env.cloud * 0.5);
      const snowing = wx.falling === "snow";
      env.umb = wx.falling ? clamp((snowing ? 0.12 : 0.4) + wx.intensity * (snowing ? 0.6 : 1.1)) : 0;
      env.snow = snowing ? clamp(0.35 + 0.65 * wx.intensity) : 0;
      const night = 1 - smoothstep(0.06, 0.3, s.daylight);
      env.sleep = night * lerp(0.3, 0.97, smoothstep(0.08, 0.45, s.sun.up ? 0 : s.sun.progress));
      env.beanie = smoothstep(44, 30, wx.temp) * 0.9;
      env.sunhat = smoothstep(80, 92, wx.temp) * smoothstep(0.3, 0.6, s.daylight) * 0.85;
      env.heat = smoothstep(82, 95, wx.temp) * smoothstep(0.3, 0.6, s.daylight);
      env.fog = clamp((wx.fog ? 1 : 0.55 * clamp((5 - wx.visibility) / 5)) + 0.3 * clamp((wx.aqi - 90) / 120));
      const b = ((wx.windDir + 180) * Math.PI) / 180; // where the wind is going
      env.wx = Math.sin(b);
      env.wy = -Math.cos(b);
      env.cloudSpeed = 4 + 9 * Math.sqrt(wx.wind); // px/s: 24 at 5 mph, 53 at 30 mph
      env.gusty = clamp((wx.gust - 10) / 30);
      // Cards are held a little crooked against the wind (rounded so it only
      // changes the palette key when it really moves).
      env.lean = Math.round(clamp((wx.wind - 6) / 30) * 0.16 * (env.wx < 0 ? -1 : 1) * 50) / 50;
      env.bannerAmp = clamp(1.4 + wx.wind * 0.2, 1.4, 6.5);
      env.bannerOm = (0.55 + wx.wind * 0.07) * (env.wx < 0 ? -1 : 1);
    }

    // ----- banners ----------------------------------------------------------
    function makeBanner(cls, ph, rigid = false) {
      const node = el("div", { class: `bn ${cls}${rigid ? " board" : ""}` });
      const slices = [];
      for (let k = 0; k < (rigid ? 0 : 17); k++) {
        const sl = el("div", { class: "sl", style: { left: `${k * 60 - 0.5}px` } });
        node.append(sl);
        slices.push(sl);
      }
      const tx = el("div", { class: "tx" });
      node.append(tx);
      wrap.append(node);
      return { node, slices, tx, rigid, c0: -1, c1: -1, r0: -1, r1: -1, top: -1, h: -1, n: 0, x: 0, ph, items: [], sy: new Float32Array(17).fill(99), sa: new Float32Array(17) };
    }
    // A banner over columns c0..c1, from y `top`, `h` tall. The row it starts in
    // holds it up (heads peek over the top); rows it mostly covers are hidden.
    function placeBanner(b, c0, c1, top, h) {
      const r0 = Math.floor(top / S);
      const r1 = Math.floor((top + h - 22) / S);
      if (b.c0 === c0 && b.c1 === c1 && b.top === top && b.h === h) return false;
      b.c0 = c0; b.c1 = c1; b.r0 = r0; b.r1 = r1; b.top = top; b.h = h;
      b.x = c0 * S;
      b.n = b.rigid ? 0 : Math.round(((c1 - c0 + 1) * S) / 60);
      Object.assign(b.node.style, { left: `${b.x}px`, top: `${top}px`, width: `${(c1 - c0 + 1) * S}px`, height: `${h}px` });
      b.slices.forEach((sl, k) => (sl.style.display = k < b.n ? "" : "none"));
      b.sy.fill(99);
      return true;
    }
    // Where each rippling piece of type sits across the stage.
    function measure(b) {
      if (b.rigid) return;
      const base = wrap.getBoundingClientRect();
      const k = base.width / 1080 || 1;
      b.items.length = 0;
      for (const node of b.tx.querySelectorAll(".g")) {
        const q = node.getBoundingClientRect();
        b.items.push({ node, x: (q.left + q.width / 2 - base.left) / k, rot: +node.dataset.rot || 0, y: 99, a: 0 });
      }
    }
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

    // The date runs on the ribbon board along the roof, the temperature on a
    // painted sheet the crowd holds up between the hour and the minutes, and
    // the rest on the scoreboard standing in the lower stand.
    const bDate = makeBanner("date", 0, true);
    const bMid = makeBanner("mid", 2.1);
    const bTifo = makeBanner("tifo", 4.4, true);
    const posts = [el("div", { class: "post" }), el("div", { class: "post" })];
    wrap.append(...posts);
    const banners = [bDate, bMid, bTifo];

    const dateLine = el("span");
    bDate.tx.append(dateLine);

    const tempEl = el("div", { class: "temp g" });
    const condEl = el("div", { class: "cond" });
    const stack = el("div", { class: "stack" }, condEl);
    const ampmEl = el("div", { class: "ampm g", "data-rot": "-4" });
    bMid.tx.append(tempEl, stack, ampmEl);

    const sun = pair("sun");
    const moon = pair("moon");
    moon.label.textContent = "Moon";
    const aqi = pair("aqi");
    const uv = pair("uv");
    aqi.label.textContent = "Air quality";
    uv.label.textContent = "UV index";
    const row1 = el("div", { class: "row1" }, sun.node, moon.node);
    const row2 = el("div", { class: "row2" }, aqi.node, uv.node);
    const rule = el("div", { class: "rule" });
    const fLabel = el("div", { class: "flabel" });
    const fLabelIn = el("span", { class: "g" });
    fLabel.append(fLabelIn);
    const fValue = el("div", { class: "fvalue" });
    const col = el("div", { class: "col" }, row1, row2, rule, fLabel, fValue);
    bTifo.tx.append(col);

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
      if (put("date", tx.date)) { dateLine.textContent = tx.date; changed = true; }
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
      if (w > 880) {
        dateLine.style.fontSize = `${Math.max(44, Math.floor((58 * 880) / w))}px`;
        w = dateLine.offsetWidth;
      }
      let moved = placeBanner(bDate, 0, COLS - 1, DATE_TOP, DATE_H);

      // So is the temperature strip, to the length of what it says.
      condEl.style.fontSize = "54px";
      const natural = tempEl.offsetWidth + condEl.scrollWidth + ampmEl.offsetWidth + 88 + 70;
      const mseats = clamp(Math.ceil(natural / 60) * 2, 16, 34);
      moved = placeBanner(bMid, (COLS - mseats) / 2, (COLS - mseats) / 2 + mseats - 1, MID_TOP, MID_H) || moved;
      const cw = condEl.scrollWidth;
      const room = stack.clientWidth;
      if (cw > room) condEl.style.fontSize = `${Math.max(44, Math.floor((54 * room) / cw))}px`;

      // The tifo: the countdown and the moon, air quality and UV, then the fact.
      const hasFact = tx.factValue !== "";
      moved = placeBanner(bTifo, 1, 34, TIFO_TOP, bTifo.h > 0 ? bTifo.h : 300) || moved; // its width, before measuring
      rule.style.display = fLabel.style.display = fValue.style.display = hasFact ? "" : "none";
      row1.style.fontSize = "42px";
      const inner = 1020 - 12 - 68;
      const rw = sun.node.offsetWidth + moon.node.offsetWidth + 44;
      if (rw > inner) row1.style.fontSize = `${Math.max(36, Math.floor((42 * inner) / rw))}px`;
      if (hasFact) {
        // As large as fits in two lines and keeps the banner 64 px off the bottom.
        for (const size of [56, 50, 46, 44, 42, 40, 38, 36]) {
          fValue.style.fontSize = `${size}px`;
          const fh = fValue.offsetHeight;
          if (fh <= Math.ceil(size * 1.2 * 2) + 2 && fh <= 112) break;
        }
      }
      moved = placeBanner(bTifo, 1, 34, TIFO_TOP, col.offsetHeight + 12) || moved;
      // The scoreboard stands on two posts.
      const foot = TIFO_TOP + bTifo.h;
      posts.forEach((p, k) => Object.assign(p.style, { left: `${k ? 836 : 220}px`, top: `${foot}px`, height: `${1920 - foot}px` }));
      for (const b of banners) measure(b);
      if (moved) rolesStale = true;
    }

    const K1 = TAU / 760;
    const K2 = TAU / 330;
    const waveY = (x, t, ph) => env.bannerAmp * (0.62 * Math.sin(x * K1 - t * env.bannerOm + ph) + 0.38 * Math.sin(x * K2 - t * env.bannerOm * 1.63 + ph * 2.1));
    function ripple(t) {
      for (const b of banners) {
        if (b.rigid) continue;
        let yl = waveY(b.x, t, b.ph);
        // Only pieces that have visibly moved are written to the DOM.
        for (let k = 0; k < b.n; k++) {
          const yr = waveY(b.x + (k + 1) * 60, t, b.ph);
          const y = (yl + yr) / 2;
          const a = Math.atan2(yr - yl, 60);
          if (Math.abs(y - b.sy[k]) > 0.12 || Math.abs(a - b.sa[k]) > 0.002) {
            b.sy[k] = y;
            b.sa[k] = a;
            b.slices[k].style.transform = `translateY(${y.toFixed(2)}px) skewY(${a.toFixed(4)}rad)`;
          }
          yl = yr;
        }
        for (let k = 0; k < b.items.length; k++) {
          const it = b.items[k];
          const y = waveY(it.x, t, b.ph);
          const a = it.rot + Math.atan((waveY(it.x + 10, t, b.ph) - waveY(it.x - 10, t, b.ph)) / 20) * 40;
          if (Math.abs(y - it.y) > 0.12 || Math.abs(a - it.a) > 0.1) {
            it.y = y;
            it.a = a;
            it.node.style.transform = `translateY(${y.toFixed(2)}px) rotate(${a.toFixed(2)}deg)`;
          }
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
        for (let rr = b.r0; rr <= b.r1; rr++) for (let cc = b.c0; cc <= b.c1; cc++) role[rr * COLS + cc] = rr === b.r0 && !b.rigid ? R_HOLD : R_COVER;
      }
    }
    function wantOf(i) {
      const ro = role[i];
      if (ro === R_COVER) return F_NONE;
      if (ro === R_HOLD) return F_HOLD;
      if (ro === R_NUM) return env.lit ? F_LIT : F_INK;
      // The moat: a one-seat ring that frames the numerals. By day it holds up the
      // white side; once the numerals are lit it lowers its cards, a dark halo.
      if (ro === R_MOAT) return env.lit ? F_SLEEP : F_CLOUD;
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
    // Every card in the minute half of the stand turns over; on the hour, the
    // whole stand. Seats that change face do so as part of the wave.
    function minuteWave(whole) {
      const r0 = whole ? 0 : ROW_MIN - 6;
      const span = whole ? 5.5 : 3.8; // seconds from the first card to the last
      const k = span / (COLS + (ROWS - r0) * 1.4);
      for (let i = 0; i < N; i++) {
        const w = wantOf(i);
        const row = (i / COLS) | 0;
        if (w === face[i] && (face[i] > F_LIT || row < r0)) continue;
        if (ap[i] < 1) continue;
        prev[i] = face[i];
        face[i] = w;
        ap[i] = -((i % COLS) + (row - r0) * 1.4 + hash(i, 3) * 2.5) * k * TURN;
        stage[i] = 0;
        steps[i] = 4;
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
        } else if (fKind[fi] === 1) {
          wob = Math.sin(u * TAU * 2.5) * 0.13 * (1 - u);
          dip = Math.sin(u * Math.PI) * 1.6;
        } else {
          // too hot: fanning themselves with the card
          wob = Math.sin(u * TAU * 5) * 0.2 * inOut;
          dip = (1 - Math.cos(u * TAU * 5)) * 1.1 * inOut;
        }
      }
      const lv = lift[i]; // the stadium wave: 0 seated .. 3 card held high, other face out
      const up = face[i] >= F_INK && face[i] <= F_LIT ? 0 : lv * 3; // numeral holders hold still, so the figure stays whole
      const cx = 15 + jx[i];
      const veil = f === F_INK || f === F_LIT ? "" : P.veil[row];

      if ((f === F_INK || f === F_LIT) && open >= 0.97) {
        // A numeral card, settled: it fills the seat, so the cards close up into
        // one flat figure with only a hairline seam between them.
        const lvl = numLvl[i];
        ctx.fillStyle = f === F_LIT ? P.litSeam : P.inkSeam;
        ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = f === F_LIT ? P.lit[lvl] : P.ink[lvl];
        ctx.fillRect(1, 1, S - 2, S - 2);
        if (env.snow > 0.05 && (row === 0 || role[i - COLS] !== R_NUM)) {
          // Snow settles along the top edge of each stroke.
          ctx.fillStyle = P.snow;
          ctx.beginPath();
          ctx.roundRect(1, 0.5, S - 2, 2 + 3.5 * env.snow * capVar[i], 1.5);
          ctx.fill();
        }
        if (P.veilNum[row] !== "") {
          ctx.fillStyle = P.veilNum[row];
          ctx.fillRect(0, 0, S, S);
        }
        return;
      }

      if (f <= F_LIT) {
        // Someone holding a card: hair and eyes over the top edge, fingers gripping it.
        const hy = Math.max(7.2, 9.6 - 2.4 * peek - 0.4 * up); // stays inside its own seat
        const numeral = f >= F_INK;
        if (open < 0.97 || (up > 0.4 && !numeral)) torso(i, hy);
        if (numeral && P.veilNum[row] === "" && P.veil[row] !== "") {
          ctx.fillStyle = P.veil[row];
          ctx.fillRect(0, 0, S, S);
        }
        head(i, cx, hy, peek > 0.12, look, 0, f === F_LIT ? 2 : role[i] === R_MOAT ? 1 : 0);
        // The wave: the card goes up, turns through edge-on, and shows its other
        // face (sky cards turn cloud-white, cloud cards turn sky) at the crest.
        const turning = !numeral && (lv === 1 || lv === 2);
        const hh = (numeral ? 14 : 9.9) * open * (turning ? 0.4 : 1);
        if (hh > 0.35) {
          const a = numeral ? 0 : tilt[i] + wob + env.lean * capVar[i];
          const c = Math.cos(a) * R;
          const sn = Math.sin(a) * R;
          ctx.setTransform(c, sn, -sn, c, (x0 + (numeral ? 15 : cx)) * R, (y0 + (numeral ? 15 : 19.9) - up + dip) * R);
          const other = !numeral && lv >= 2;
          let fill;
          if (f === F_INK) fill = P.ink[numLvl[i]];
          else if (f === F_LIT) fill = P.lit[numLvl[i]];
          else if ((f === F_SKY) !== other) fill = P.sky[col * 3 + shadeI[i]];
          else if (f === F_CORE && !other) fill = P.core[col * 3 + shadeI[i]];
          else fill = P.cloud[col * 3 + shadeI[i]];
          const hw = numeral ? 14 : 13.6;
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.roundRect(-hw, -hh, hw * 2, hh * 2, Math.min(numeral ? 1 : 3, hh));
          ctx.fill();
          if (env.snow > 0.05 && !numeral) {
            ctx.fillStyle = P.snow;
            ctx.beginPath();
            ctx.roundRect(-hw, -hh - 0.6, hw * 2, Math.min(hh, 1.2 + 3.4 * env.snow * capVar[i]), 1.6);
            ctx.fill();
          }
          if (!numeral) {
            ctx.fillStyle = P.skin[skinI[i] % 6];
            ctx.beginPath();
            ctx.arc(-10.6, -hh + 0.7, 1.9, 0, TAU);
            ctx.moveTo(12.5, -hh + 0.7);
            ctx.arc(10.6, -hh + 0.7, 1.9, 0, TAU);
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
        const rad = 14.6 * open; // domes all but touching: a roof of umbrellas
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
          // A wet highlight along the crown.
          ctx.fillStyle = P.umbHi[k];
          ctx.beginPath();
          ctx.arc(0, 0, rad * 0.8, Math.PI * 1.18, Math.PI * 1.42);
          ctx.arc(0, 0, rad * 0.62, Math.PI * 1.42, Math.PI * 1.18, true);
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
        const deep = open - (up / 9) * 0.7 - peek * 0.75; // the wave rouses them for a moment
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
    const DROPS = 560;
    const dx = new Float32Array(DROPS);
    const dy = new Float32Array(DROPS);
    const dv = new Float32Array(DROPS);
    for (let k = 0; k < DROPS; k++) {
      dx[k] = r.range(0, 1080);
      dy[k] = r.range(0, 1920);
      dv[k] = r.range(0.7, 1.3);
    }
    // Drops and flakes are small sprites, re-drawn only when their colour or
    // slant changes: hundreds of tiny drawImage calls cost far less than one
    // path that spans the whole frame.
    const SPR = 2; // sprite pixels per stage unit
    const dropSpr = document.createElement("canvas");
    dropSpr.width = 40 * SPR;
    dropSpr.height = 56 * SPR;
    const dropCtx = dropSpr.getContext("2d");
    const flakeSpr = document.createElement("canvas");
    flakeSpr.width = flakeSpr.height = 8 * SPR;
    const flakeCtx = flakeSpr.getContext("2d");
    let dropKey = "";
    let flakeKey = "";
    function makeDrop(color, slant) {
      const key = color + slant;
      if (key === dropKey) return;
      dropKey = key;
      dropCtx.setTransform(SPR, 0, 0, SPR, 0, 0);
      dropCtx.clearRect(0, 0, 40, 56);
      dropCtx.strokeStyle = color;
      dropCtx.lineWidth = 2.4;
      dropCtx.lineCap = "round";
      dropCtx.beginPath();
      dropCtx.moveTo(20 + slant * 25, 3);
      dropCtx.lineTo(20 - slant * 25, 53);
      dropCtx.stroke();
    }
    function makeFlake(color) {
      if (color === flakeKey) return;
      flakeKey = color;
      flakeCtx.setTransform(SPR, 0, 0, SPR, 0, 0);
      flakeCtx.clearRect(0, 0, 8, 8);
      flakeCtx.fillStyle = color;
      flakeCtx.globalAlpha = 0.35; // a soft rim, so a flake reads against the busy crowd
      flakeCtx.beginPath();
      flakeCtx.arc(4, 4, 3.9, 0, TAU);
      flakeCtx.fill();
      flakeCtx.globalAlpha = 1;
      flakeCtx.beginPath();
      flakeCtx.arc(4, 4, 2.7, 0, TAU);
      flakeCtx.fill();
    }
    let wetClean = true;
    // In a strong wind a few cards get away and tumble across the stand.
    const LOOSE = 9;
    const lx = new Float32Array(LOOSE);
    const ly = new Float32Array(LOOSE);
    const lsp = new Float32Array(LOOSE);
    const lph = new Float32Array(LOOSE);
    for (let k = 0; k < LOOSE; k++) {
      lx[k] = r.range(0, 1080);
      ly[k] = r.range(200, 1500);
      lsp[k] = r.range(0.7, 1.3);
      lph[k] = r() * TAU;
    }
    function drawLoose(s, g, n) {
      const speed = 40 + s.weather.wind * 6; // px/s: 220 at 30 mph
      const dt = s.dt;
      for (let k = 0; k < n; k++) {
        const v = speed * lsp[k];
        lx[k] += env.wx * v * dt;
        ly[k] += (env.wy * v * 0.5 + Math.sin(s.t * 1.3 + lph[k]) * 30) * dt;
        if (lx[k] > 1110 || lx[k] < -30 || ly[k] > 1900 || ly[k] < 20) {
          // back in from the upwind side
          const across = 160 + hash(k, s.frame) * 1400;
          if (Math.abs(env.wx) >= Math.abs(env.wy)) {
            lx[k] = env.wx > 0 ? -25 : 1105;
            ly[k] = across;
          } else {
            lx[k] = hash(k + 9, s.frame) * 1080;
            ly[k] = env.wy > 0 ? 30 : 1890;
          }
        }
        const a = s.t * 1.7 * lsp[k] + lph[k];
        const q = Math.cos(s.t * 3.1 * lsp[k] + lph[k] * 2); // tumbling: seen face-on, then edge-on
        const c = Math.cos(a);
        const sn = Math.sin(a);
        g.setTransform(c, sn, -sn * q, c * q, lx[k], ly[k]);
        g.fillStyle = (k & 1) ? P.cloud[((k * 7) % COLS) * 3 + 2] : P.sky[((k * 11) % COLS) * 3 + 2];
        g.fillRect(-13, -9.5, 26, 19);
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    function drawWet(s) {
      const wx = s.weather;
      const g = wet.ctx;
      const count = !wx.falling ? 0 : wx.falling === "snow" ? Math.round(DROPS * clamp(0.3 + 0.7 * wx.intensity)) : Math.round(380 * clamp(0.25 + 0.75 * wx.intensity));
      const loose = Math.round(LOOSE * clamp((wx.wind - 13) / 20));
      if (!count && !loose) {
        if (!wetClean) wet.clear();
        wetClean = true;
        return;
      }
      wet.clear();
      wetClean = false;
      if (loose) drawLoose(s, g, loose);
      if (!count) return;
      const slant = Math.round(clamp(env.wx * wx.wind * 0.03, -0.7, 0.7) * 20) / 20;
      if (wx.falling === "snow") {
        makeFlake(P.flake);
        const fall = 46 + wx.intensity * 50;
        const qSnow = 1 + 0.5 * wx.intensity;
        g.globalAlpha = 0.85;
        for (let k = 0; k < count; k++) {
          const sway = Math.sin(s.t * 0.9 + k) * 14;
          dy[k] += fall * dv[k] * s.dt;
          dx[k] += (slant * fall * 1.6 + sway * 0.4) * dv[k] * s.dt;
          if (dy[k] > 1930) { dy[k] -= 1940; dx[k] = hash(k, s.frame) * 1080; }
          if (dx[k] > 1090) dx[k] -= 1100;
          else if (dx[k] < -10) dx[k] += 1100;
          const q = (2 + 3.4 * (dv[k] - 0.7)) * qSnow; // up to about 14 px across in a blizzard
          g.drawImage(flakeSpr, dx[k] - q * 1.2, dy[k] - q * 1.2, q * 2.4, q * 2.4);
        }
        g.globalAlpha = 1;
      } else {
        makeDrop(P.rain, slant);
        const fall = wx.falling === "drizzle" ? 420 : 640 + wx.intensity * 260;
        const len = wx.falling === "drizzle" ? 12 : 20 + wx.intensity * 16;
        g.globalAlpha = 0.62;
        for (let k = 0; k < count; k++) {
          dy[k] += fall * dv[k] * s.dt;
          dx[k] += slant * fall * dv[k] * s.dt;
          if (dy[k] > 1930) { dy[k] -= 1960; dx[k] = hash(k, s.frame) * 1080; }
          if (dx[k] > 1090) dx[k] -= 1100;
          else if (dx[k] < -10) dx[k] += 1100;
          const l = len * dv[k]; // the sprite is 50 units of streak: scale it to this drop
          const sc = l / 50;
          g.drawImage(dropSpr, dx[k] - 20 * sc, dy[k] - 53 * sc, 40 * sc, 56 * sc);
        }
        g.globalAlpha = 1;
      }
    }

    // ----- the frame ----------------------------------------------------------
    let first = true;
    let lastMs = 0;
    let lastH = -1;
    let lastM = -1;
    let flashWas = 0;
    let refreshLeft = 0;
    let drawAt = 0;
    let burst = 0;
    const DRAW_BUDGET = 72; // enough for the minute wave to keep its schedule

    function frame(s) {
      const t = s.t;
      const dt = s.dt;
      const dms = s.ms - lastMs;
      const jump = first || Math.abs(dms) > 5000;
      lastMs = s.ms;

      updateText(s);
      updateEnv(s);
      if (jump || s.frame % 8 === 0) {
        // Coarse steps: a change repaints the whole crowd over the next second or two.
        const key = `${s.sky.west}${s.sky.northWest}${s.sky.northEast}${s.sky.east}${Math.round(s.daylight * 200)}|${Math.round(env.gloomLight * 200)}|${Math.round(s.weather.cloud / 4)}|${Math.round(env.fog * 25)}|${Math.round(s.moon.alt / 2)}|${env.lean}`;
        if (key !== paletteKey) {
          computePalette(s);
          paletteKey = key;
          refreshLeft = N; // repaint everyone once, a few dozen seats a frame
        }
      }

      // The clouds ride the wind.
      const adv = env.cloudSpeed * clamp(dms / 1000, 0, 900);
      cloudX += env.wx * adv;
      cloudY += env.wy * adv;

      const newMinute = s.clock.h12 !== lastH || s.clock.m !== lastM;
      if (newMinute || rolesStale) {
        const hourWas = lastH;
        lastH = s.clock.h12;
        lastM = s.clock.m;
        const relaid = rolesStale;
        rolesStale = false;
        computeRoles(s);
        if (!jump) {
          if (newMinute) minuteWave(s.clock.h12 !== hourWas);
          else if (relaid) snapAll();
        }
      }

      if (jump) {
        // The clock jumped (a cut, a wake from sleep, a racing gallery clock): go
        // straight to the new picture.
        snapAll();
        dirty.fill(1);
        refreshLeft = 0;
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
          stage[i] = 0;
          steps[i] = 3;
        }
      }

      // Turns in progress.
      const step = dt * TURN;
      for (let i = 0; i < N; i++) {
        if (ap[i] >= 1) continue;
        const a = ap[i] + step;
        ap[i] = a >= 1 ? 1 : a;
        const q = a <= 0 ? 0 : a >= 1 ? 7 : 1 + ((a * steps[i]) | 0);
        if (q !== stage[i]) {
          stage[i] = q;
          if (q !== 1) dirty[i] = 1; // step 1 still looks settled
        }
      }

      // The crowd keeps a stadium wave going: one rolls round the stand every
      // twenty seconds or so, downwind. Gusts set off more of them, faster, and
      // along the real wind.
      if (!jump) {
        ambAcc += dt / 21;
        if (ambAcc >= 1) {
          ambAcc -= 1;
          ambSide = Math.abs(env.wx) > 0.2 ? (env.wx > 0 ? 1 : -1) : -ambSide;
          launchWave(t, ambSide, 0, 125);
        }
        if (env.gusty > 0.01) {
          gustAcc += dt * lerp(1 / 50, 1 / 10, env.gusty);
          if (gustAcc >= 1) {
            gustAcc -= 1;
            launchWave(t, env.wx, env.wy, 160 + 130 * env.gusty);
          }
        }
      }
      let anyWave = false;
      for (let k = 0; k < WAVES; k++) if (wOn[k]) anyWave = true;
      if (anyWave || waveLive) {
        waveLive = anyWave;
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
            if (d > -90 && d < 90) {
              const c = Math.cos(d * 0.017453); // pi / 180
              const v = Math.round(3 * c * c); // in steps: up, edge-on, other face
              if (v > lift[i]) lift[i] = v;
            }
          }
        }
        for (let i = 0; i < N; i++) {
          if (lift[i] !== liftWas[i]) dirty[i] = 1;
        }
      }

      // Fidgets.
      for (let k = 0; k < MAXF; k++) {
        const i = fSeat[k];
        if (i < 0) continue;
        if (((s.frame + k) & 1) === 0) dirty[i] = 1; // small motions at half rate
        if (t - fT0[k] >= fDur[k]) {
          dirty[i] = 1;
          fSeat[k] = -1;
          fidOf[i] = -1;
        }
      }
      fidAcc += dt * (3 + 9 * env.dayK) * (1 + 2.5 * env.heat);
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
          const fan = f <= F_CORE && r() < env.heat * 0.8;
          fDur[k] = (fan ? 2.5 : 1.4) + r() * 1.6;
          fKind[k] = fan ? 2 : f === F_UMB ? 1 : f === F_SLEEP || f === F_HOLD ? 0 : r() < 0.6 ? 0 : 1;
          break;
        }
      }

      // A slow ripple runs across the numerals: their cards step through four
      // close shades (amber by night, ink by day). Only cards whose shade
      // changes are redrawn. After a palette change everyone is repainted, a
      // few dozen a frame.
      if ((s.frame & 1) === 0) {
        const ph = t * 0.55;
        for (let k = 0; k < numCount; k++) {
          const i = numList[k];
          const v = ((Math.sin((i % COLS) * 0.36 + ((i / COLS) | 0) * 0.22 - ph) * 0.5 + 0.5) * 3.99) | 0;
          if (v !== numLvl[i]) {
            numLvl[i] = v;
            dirty[i] = 1;
          }
        }
      }
      for (let k = 0; k < 40 && refreshLeft > 0; k++, refreshLeft--) {
        orderAt = (orderAt + 1) % N;
        dirty[order[orderAt]] = 1;
      }

      // Draw what changed, at most a budget of seats a frame, round-robin, so a
      // busy moment is spread over a few frames instead of costing one big one.
      // The cut is drawn whole; a later jump repaints everyone over about five frames.
      if (jump) burst = 5;
      let budget = first ? N : burst > 0 ? 480 : DRAW_BUDGET;
      if (burst > 0) burst--;
      let i = drawAt;
      for (let n = 0; n < N && budget > 0; n++) {
        if (dirty[i]) {
          dirty[i] = 0;
          drawSeat(i);
          budget--;
        }
        if (++i === N) i = 0;
      }
      drawAt = i;
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

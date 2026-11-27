// Last Brick Standing
//
// A game of Breakout that plays itself against a wall of 18 x 40 glazed
// bricks. Each course of the wall is glazed in the colour the sky really was:
// the top course is 24 hours ago, the bottom course is now, and west to east
// runs left to right. The only bricks the ball can never break are the steel
// ones, and they spell the time. Each quarter hour the mason lays the wall
// again (leaving a breach to start from) and the ball spends the next fifteen
// minutes carving the sky away until the hour is nearly all that stands;
// every minute the changed numeral is re-laid with fresh brick, and ragged
// courses are re-laid now and then so it never falls to rubble. Below the
// horizon line the readouts are set into the ground.
//
// What the conditions do:
//   clock        the steel numerals; how far the wall is carved is how far we
//                are into the quarter hour (re-laid at :00 :15 :30 :45)
//   sky record   the glaze of every course (a computed sky stands in if the
//                camera record is missing)
//   live sky     the air behind the wall, seen through what has been carved:
//                deep cobalt or slate by day, the western sky low down, navy
//                with stars on a clear night, sodium glow under cloud
//   daylight     by day the glaze is lit and the steel is ivory; at night the
//                wall is unlit tile, the steel goes moonlit silver and the ball
//                carries a pool of light across the glaze like a lantern
//   wind         a real sideways force: the ball's path curves, the paddle is
//                shoved by gusts, rain slants, snow streaks, shards fly downwind
//   rain         falls through the gaps the ball has opened and across the
//                open play; it patters on the paddle, which goes slick and
//                overshoots
//   snow         settles on every ledge left standing (the numerals' shoulders
//                too) and along the horizon, is knocked loose by the ball, and
//                muffles the bounce
//   heat / cold  hot days quicken play, draw a long molten trail and lay an
//                amber haze over the river; cold slows play to a short icy
//                trail and frosts the brick edges
//   fog          a bank hides the upper wall (never the numerals)
//   thunder      a second ball enters, the wall shivers on a slow rumble and
//                now and then the whole glaze is softly lit
//
// The paddle is played by a slightly human hand: it reacts late, aims for
// sky brick, is thrown off by wind, and now and then misses.

import {
  W, H, TAU, clamp, lerp, smoothstep, approach, rng, hash, createNoise,
  toOklab, toOklch, oklch, mix, adjust, ramp, rgba, luminance, contrast,
  el, addStyle, canvas2d, grain, fitText,
} from "../lib/kit.js";
import { sunPosition } from "../lib/astro.js";

// ----- geometry (stage units) ------------------------------------------------
const COLS = 18;
const ROWS = 40;
const NB = COLS * ROWS;
const BW = 58; // brick pitch
const BH = 22;
const WX = 18; // wall and playfield, left edge
const WR = WX + COLS * BW; // right edge
const WY = 192; // wall top
const WB = WY + ROWS * BH; // wall bottom (1072)
const CEIL = 154;
const FLOOR = 1304; // the horizon: sky and play above, the ground and its readouts below
const PAD_Y = 1264;
const PAD_W = 150;
const PAD_H = 16;
const BR = 9; // ball radius
const QUARTER = 15 * 60 * 1000;
const U0 = 0.62; // how much of its colour an unlit brick keeps at night
const ROW_MS = 36 * 60 * 1000; // 24 hours over 40 courses
const TRAIL = 48;

const STEEL_DAY = "#f5eedd";
const STEEL_NIGHT = "#9ba1aa"; // moonlit steel
const NIGHT_GROUND = "#05060a";
const NIGHT_SKY = "#080b16";

// ----- the numerals: 7 x 15 bricks, strokes two bricks wide, bars three tall ---
// Hours over minutes, two courses of sky brick between them, so the two
// figures read as one time. (AM/PM is set beside the date, in the title line.)
const SEG = { a: [0, 0, 7, 3], g: [0, 6, 7, 3], d: [0, 12, 7, 3], f: [0, 0, 2, 9], b: [5, 0, 2, 9], e: [0, 6, 2, 9], c: [5, 6, 2, 9] };
const DIGITS = ["abcdef", "", "abged", "abgcd", "fgbc", "afgcd", "afgecd", "abc", "abcdefg", "abfgcd"].map((k) => [...k].map((ch) => SEG[ch]));
DIGITS[1] = [[3, 0, 2, 15], [1, 0, 2, 3], [1, 12, 6, 3]];
const HOUR_ROW = 4;
const MIN_ROW = 21;
const SLOT_A = 1;
const SLOT_B = 10;
const SLOT_H = 5;

function stampDigit(map, d, c0, r0) {
  for (const [x, y, w, h] of DIGITS[d] || []) for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) map[(r0 + y + r) * COLS + c0 + x + c] = 1;
}
function buildSteel(map, hh, mm) {
  map.fill(0);
  if (hh.length > 1) {
    stampDigit(map, +hh[0], SLOT_A, HOUR_ROW);
    stampDigit(map, +hh[1], SLOT_B, HOUR_ROW);
  } else stampDigit(map, +hh, SLOT_H, HOUR_ROW); // a lone hour stands in the middle, over the minutes
  stampDigit(map, +mm[0], SLOT_A, MIN_ROW);
  stampDigit(map, +mm[1], SLOT_B, MIN_ROW);
}

// ----- a computed sky, for courses the camera record does not cover -----------
const alt01 = (alt) => clamp((alt + 18) / 78);
const M_CLEAR = ramp([[0, "#05070f"], [0.115, "#121b3d"], [0.19, "#445488"], [0.27, "#7fa3d6"], [0.6, "#4f8fdc"], [1, "#3d7fd0"]]);
const M_CLOUD = ramp([[0, "#1d1b1c"], [0.15, "#3b3e48"], [0.23, "#7a808a"], [0.5, "#b1bac2"], [1, "#bcc4cb"]]);
const M_GLOW = ramp([[0.09, "#3a2f5e"], [0.17, "#b5557a"], [0.24, "#f29a54"], [0.35, "#e9d9a6"]]);
const BEARINGS = [270, 315, 45, 90];
function modelSky(ms, cloud, bearing) {
  const sun = sunPosition(ms);
  const a = alt01(sun.alt);
  const off = Math.abs((((sun.az - bearing) % 360) + 540) % 360 - 180);
  const near = Math.exp(-((off / 60) ** 2));
  const low = sun.alt > -11 && sun.alt < 9 ? Math.sin(((sun.alt + 11) / 20) * Math.PI) : 0;
  return mix(mix(M_CLEAR(a), M_GLOW(a), near * low * 0.8), M_CLOUD(a), Math.pow(clamp(cloud), 1.2));
}

// How much of the reachable sky brick should still stand, p of the way through the quarter hour.
const keepAt = (p) => 0.88 - 0.52 * Math.pow(clamp(p), 0.72); // never below about a third: the sky stays in the wall

const TRAIL_RAMP = ramp([[0, "#9fd4ff"], [0.42, "#f3ebd9"], [0.72, "#ffc56e"], [1, "#ff5f2e"]]);

const CSS = `
.lb { position: absolute; inset: 0; overflow: hidden; background: ${NIGHT_GROUND}; color: var(--ink, ${STEEL_DAY}); font-family: "Silkscreen", "Courier New", monospace; text-transform: uppercase; }
.lb canvas { z-index: 1; }
.lb-title { position: absolute; z-index: 6; left: 76px; width: 928px; top: 52px; height: 80px; display: flex; align-items: baseline; justify-content: space-between; }
.lb-date { font-size: 48px; line-height: 80px; white-space: nowrap; letter-spacing: 0.02em; }
.lb-ampm { font-size: 80px; line-height: 80px; font-weight: 400; white-space: nowrap; letter-spacing: 0.02em; margin-left: 48px; }
.lb-horizon { position: absolute; z-index: 6; left: 0; width: ${W}px; top: ${FLOOR}px; height: 4px; background: currentColor; opacity: 0.5; }
.lb-fog { position: absolute; z-index: 3; left: 0; top: 0; width: ${W}px; height: ${WB + 60}px; overflow: hidden; opacity: 0; display: none;
  background: linear-gradient(to bottom, var(--fog) 0%, var(--fog) 30%, transparent 92%); }
.lb-fog i { position: absolute; display: block; background: radial-gradient(closest-side, var(--fog) 0%, var(--fog) 35%, transparent 100%); will-change: transform; }
.lb-floor { position: absolute; z-index: 6; left: 76px; top: ${FLOOR + 56}px; width: 928px; font-family: "Jersey 10", "Silkscreen", monospace; text-transform: none; }
.lb-a { display: flex; align-items: flex-end; height: 136px; }
.lb-temp { font-size: 228px; line-height: 136px; height: 136px; white-space: nowrap; letter-spacing: 0.01em; }
.lb-cw { margin-left: 44px; min-width: 0; height: 136px; }
.lb-temp .nd { position: relative; top: -64px; font-family: "Silkscreen", monospace; font-size: 132px; margin-right: 0.08em; }
.lb-cond { font-size: 84px; line-height: 70px; height: 70px; white-space: nowrap; }
.lb-au { display: flex; align-items: baseline; margin-top: 24px; height: 42px; white-space: nowrap; }
.lb-au .lb-v { margin: 0 44px 0 14px; line-height: 42px; font-size: 64px; }
.lb-b { position: relative; height: 100px; margin-top: 50px; }
.lb-cell { position: absolute; top: 0; white-space: nowrap; }
.lb-k { font-family: "Silkscreen", monospace; text-transform: uppercase; font-size: 28px; line-height: 22px; letter-spacing: 0.06em; color: var(--acc, #9a9484); }
.lb-v { font-size: 84px; line-height: 64px; margin-top: 14px; }
.lb-fact { margin-top: 48px; }
.lb-fv { font-size: 50px; line-height: 62px; margin-top: 12px; }
`;

export default {
  title: "Last Brick Standing",
  description: "Breakout plays itself against a wall glazed in the last day's sky; the bricks it cannot break spell the time.",
  fonts: ["Silkscreen:wght@400;700", "Jersey 10"],

  mount(root, { state, seed }) {
    addStyle(root, CSS);
    const wrap = el("div", { class: "lb" });
    root.append(wrap);

    // Layers, back to front: weather seen through the wall, the glazed wall,
    // fog, the steel numerals, then everything that moves.
    // stars, behind the wall: seen only through what the ball has carved away
    const STN = 240;
    const stX = new Float32Array(STN), stY = new Float32Array(STN), stZ = new Float32Array(STN);
    {
      const sr = rng(seed + 5);
      for (let i = 0; i < STN; i++) {
        stX[i] = sr.range(0, W);
        stY[i] = sr.range(CEIL, FLOOR - 40);
        stZ[i] = sr() < 0.15 ? 3 : 2;
      }
    }
    let starA = 0;
    const air = canvas2d(wrap, { adaptive: true, maxScale: 0.5 }); // soft: it is the far side of the wall
    const wall = canvas2d(wrap, { maxScale: 2 });
    const fogBlobs = [0, 1, 2, 3].map(() => el("i"));
    const fog = el("div", { class: "lb-fog" }, fogBlobs);
    wrap.append(fog);
    const steelL = canvas2d(wrap, { maxScale: 2 });
    const fx = canvas2d(wrap, { adaptive: true });
    air.canvas.style.zIndex = "1";
    wall.canvas.style.zIndex = "2";
    steelL.canvas.style.zIndex = "4";
    steelL.canvas.style.display = "none";
    fx.canvas.style.zIndex = "5";
    fogBlobs.forEach((b, i) => {
      const w = 760 + i * 130;
      const h = 300 + ((i * 97) % 160);
      Object.assign(b.style, { width: `${w}px`, height: `${h}px`, left: `${-200 + i * 190}px`, top: `${-60 + i * 150}px` });
    });

    const dateEl = el("div", { class: "lb-date" });
    const ampmEl = el("div", { class: "lb-ampm" });
    const tempEl = el("div", { class: "lb-temp" });
    const condEl = el("div", { class: "lb-cond" });
    const cell = (col, label) => {
      const k = el("div", { class: "lb-k", text: label });
      const v = el("div", { class: "lb-v" });
      // cells sit on the brick columns of the wall above
      return { k, v, node: el("div", { class: "lb-cell", style: { left: `${(col - 1) * BW}px` } }, k, v) };
    };
    const sunC = cell(1, "");
    const moonC = cell(7, "Moon");
    const airK = el("div", { class: "lb-k", text: "Air" });
    const airV = el("div", { class: "lb-v" });
    const uvK = el("div", { class: "lb-k", text: "UV" });
    const uvV = el("div", { class: "lb-v" });
    const factK = el("div", { class: "lb-k" });
    const factV = el("div", { class: "lb-fv" });
    const factEl = el("div", { class: "lb-fact" }, factK, factV);
    const floorEl = el("div", { class: "lb-floor" },
      el("div", { class: "lb-a" }, tempEl, el("div", { class: "lb-cw" }, condEl, el("div", { class: "lb-au" }, airK, airV, uvK, uvV))),
      el("div", { class: "lb-b" }, sunC.node, moonC.node),
      factEl);
    wrap.append(
      el("div", { class: "lb-title" }, dateEl, ampmEl),
      el("div", { class: "lb-horizon" }),
      floorEl,
    );
    grain(wrap, { opacity: 0.05 });

    const LAMP = 250; // the lantern's reach at night
    const haloCanvas = document.createElement("canvas");
    haloCanvas.width = haloCanvas.height = 128;
    {
      const m = haloCanvas.getContext("2d");
      const g = m.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, "rgba(255,244,222,0.55)");
      g.addColorStop(0.3, "rgba(255,240,214,0.2)");
      g.addColorStop(1, "rgba(255,240,214,0)");
      m.fillStyle = g;
      m.fillRect(0, 0, 128, 128);
    }

    // ----- the game ----------------------------------------------------------
    const kind = new Uint8Array(NB); // 0 gap, 1 sky brick, 2 steel
    const steel = new Uint8Array(NB); // where the numerals are
    const steelNext = new Uint8Array(NB);
    const reach = new Uint8Array(NB); // sky bricks a ball could ever get to
    const cap = new Float32Array(NB); // snow lying on a brick, 0..1
    const fresh = new Float32Array(NB); // seconds of wet-glaze shine left on a new brick
    const glint = new Float32Array(NB); // a struck steel brick rings for a moment
    const capLvl = new Uint8Array(NB); // the snow depth last painted
    const cellFlag = new Uint8Array(NB);
    const cellList = new Int16Array(NB);
    let nCells = 0;
    const rowDirty = new Uint8Array(ROWS);
    const QN = 2048;
    const qI = new Int16Array(QN);
    const qT = new Float64Array(QN);
    const qK = new Uint8Array(QN);
    let qn = 0;
    const stack = new Int16Array(NB);

    let gr = rng(seed); // the game's dice
    const vr = rng(seed + 17); // dice for things that are only looked at
    const noise = createNoise(seed);

    const env = { wind: 0, ax: 0, speed: 520, rain: 0, snow: 0, slick: 0, storm: false, gust: 0, fog: 0 };
    const pad = { x: W / 2, v: 0, target: W / 2, react: 0, freeze: 0, aim: 0, err: 0 };
    const ai = { lazy: false };
    const mkBall = () => ({ state: 0, x: 0, y: 0, vx: 0, vy: 0, timer: 0, quiet: 0, sincePad: 0, muffle: 1, aimed: false, keep: true, fade: 0, trail: new Float32Array(TRAIL * 2), th: 0, tn: 0 });
    const balls = [mkBall(), mkBall()];
    let simNow = 0;
    let instant = false; // lay bricks at once (catching up, or the clock jumped)
    let ctrlT = 0;
    let snowT = 0;
    let relayCool = 0;
    let spares = 3; // the balls in hand, lying on the floor by the right wall
    let reachTotal = 1;
    let shownH = "";
    let shownM = "";
    let shownA = "";

    // shards of broken brick, and small square particles (snow, spray, sparks)
    const SH = 96;
    const shX = new Float32Array(SH), shY = new Float32Array(SH), shVX = new Float32Array(SH), shVY = new Float32Array(SH);
    const shA = new Float32Array(SH), shVA = new Float32Array(SH), shL = new Float32Array(SH), shW = new Float32Array(SH);
    const shI = new Int16Array(SH);
    let shN = 0;
    const PT = 256;
    const ptX = new Float32Array(PT), ptY = new Float32Array(PT), ptVX = new Float32Array(PT), ptVY = new Float32Array(PT);
    const ptL = new Float32Array(PT), ptM = new Float32Array(PT), ptS = new Float32Array(PT);
    const ptK = new Uint8Array(PT); // 0 ivory, 1 snow, 2 water
    let ptN = 0;
    function spark(x, y, vx, vy, life, size, k) {
      const i = ptN++ % PT;
      ptX[i] = x; ptY[i] = y; ptVX[i] = vx; ptVY[i] = vy; ptL[i] = life; ptM[i] = life; ptS[i] = size; ptK[i] = k;
    }

    const markCell = (i) => {
      if (!cellFlag[i]) {
        cellFlag[i] = 1;
        cellList[nCells++] = i;
      }
    };

    function serve(b, delay) {
      b.state = 1;
      b.timer = delay;
      b.quiet = 0;
      b.sincePad = 0;
      b.tn = 0;
      b.aimed = false;
      b.muffle = 1;
    }
    function launch(b) {
      const a = gr.range(-0.55, 0.55);
      b.vx = Math.sin(a) * env.speed;
      b.vy = -Math.cos(a) * env.speed;
      b.x = pad.x;
      b.y = PAD_Y - BR - 1;
      b.state = 2;
    }
    function pop(b, live) {
      if (live) for (let k = 0; k < 10; k++) spark(b.x, b.y, Math.cos(k * 0.628) * 90, Math.sin(k * 0.628) * 90, 0.45, 4, 0);
      b.state = 3;
      b.timer = 0.9;
      b.tn = 0;
    }

    // Which sky bricks can a ball ever reach? Everything connected to the open
    // playfield through cells that are not steel (the air above the wall links
    // the top course).
    function computeReach() {
      reach.fill(0);
      let n = 0;
      let top = false;
      const push = (i) => {
        if (!reach[i] && !steel[i]) {
          reach[i] = 1;
          stack[n++] = i;
        }
      };
      for (let c = 0; c < COLS; c++) push((ROWS - 1) * COLS + c);
      reachTotal = 0;
      while (n) {
        const i = stack[--n];
        reachTotal++;
        const c = i % COLS;
        const r = (i / COLS) | 0;
        if (c > 0) push(i - 1);
        if (c < COLS - 1) push(i + 1);
        if (r > 0) push(i - COLS);
        else if (!top) {
          top = true;
          for (let k = 0; k < COLS; k++) push(k);
        }
        if (r < ROWS - 1) push(i + COLS);
      }
      reachTotal = Math.max(1, reachTotal);
    }

    // Put one brick in place. A sky brick is not laid on top of a ball; a steel
    // one always is (the time must be right), and a ball caught inside is lost.
    function lay(i, k, live) {
      if (k !== 2 && steel[i] && kind[i] === 2) return; // a late sky brick never covers the time
      const x0 = WX + (i % COLS) * BW;
      const y0 = WY + ((i / COLS) | 0) * BH;
      for (const b of balls) {
        if (b.state !== 2) continue;
        if (b.x > x0 - BR && b.x < x0 + BW + BR && b.y > y0 - BR && b.y < y0 + BH + BR) {
          if (k === 1) return;
          if (b.x > x0 && b.x < x0 + BW && b.y > y0 && b.y < y0 + BH) pop(b, live);
        }
      }
      kind[i] = k;
      if (cap[i] > 0 && i >= COLS) markCell(i - COLS); // its snow went with it
      cap[i] = 0;
      if (i + COLS < NB) cap[i + COLS] = 0; // (that snow lay in this cell, repainted below)
      if (live && k === 1) fresh[i] = 0.35;
      markCell(i);
    }
    function schedule(i, k, delay) {
      if (instant || qn >= QN) lay(i, k, false);
      else {
        qI[qn] = i;
        qT[qn] = simNow + delay;
        qK[qn] = k;
        qn++;
      }
    }
    function relayCells(c0, r0, w, h, rowGap, colGap, withBreach) {
      for (let r = h - 1; r >= 0; r--) for (let c = 0; c < w; c++) {
        const i = (r0 + r) * COLS + c0 + c;
        const k = steel[i] ? 2 : withBreach && breach[i] ? 0 : 1;
        // the time is never wrong, not even mid-wave: steel goes in (and old
        // steel comes out) at once; only the sky brick is laid course by course
        if (k === 2) {
          if (kind[i] !== 2) lay(i, 2, !instant);
        } else {
          if (kind[i] === 2) lay(i, 0, false);
          if (k) schedule(i, k, (h - 1 - r) * rowGap + c * colGap);
        }
      }
    }
    // How long is the run of cells between steel that (r, c) sits in? The mason
    // only lays proper lengths of wall, never a stub between two numerals.
    function runAt(r, c) {
      let a = c;
      let b = c;
      while (a > 0 && !steel[r * COLS + a - 1]) a--;
      while (b < COLS - 1 && !steel[r * COLS + b + 1]) b++;
      return b - a + 1;
    }
    // The mason: re-lay the most ragged course, one brick after another.
    function relayCourse() {
      let best = -1;
      let bestScore = 0;
      for (let r = 0; r < ROWS; r++) {
        let missing = 0;
        for (let c = 0; c < COLS; c++) if (!kind[r * COLS + c] && runAt(r, c) >= 3) missing++;
        if (!missing) continue;
        let near = false;
        for (const b of balls) if (b.state === 2 && Math.abs((b.y - WY) / BH - r - 0.5) < 2.5) near = true;
        if (near) continue;
        const score = missing + gr() * 5;
        if (score > bestScore) {
          bestScore = score;
          best = r;
        }
      }
      if (best < 0) return;
      const dir = gr() < 0.5;
      let n = 0;
      for (let k = 0; k < COLS; k++) {
        const c = dir ? k : COLS - 1 - k;
        const i = best * COLS + c;
        if (!kind[i] && runAt(best, c) >= 3) schedule(i, 1, n++ * 0.075);
      }
    }

    function breakBrick(i, b, live) {
      kind[i] = 0;
      markCell(i);
      if (cap[i] > 0 && i >= COLS) markCell(i - COLS);
      b.quiet = 0;
      if (!live) {
        cap[i] = 0;
        return;
      }
      const x0 = WX + (i % COLS) * BW;
      const y0 = WY + ((i / COLS) | 0) * BH;
      for (let k = 0; k < 4; k++) {
        const j = shN++ % SH;
        shX[j] = x0 + (k & 1 ? 0.75 : 0.25) * BW;
        shY[j] = y0 + (k & 2 ? 0.75 : 0.25) * BH;
        shVX[j] = b.vx * 0.22 + (k & 1 ? 70 : -70) + vr.range(-50, 50) + env.wind * 4;
        shVY[j] = b.vy * 0.18 + (k & 2 ? 30 : -110) + vr.range(-40, 40);
        shA[j] = 0;
        shVA[j] = vr.range(-7, 7);
        shL[j] = vr.range(0.8, 1.2);
        shW[j] = vr.range(0.36, 0.5);
        shI[j] = i;
      }
      if (cap[i] > 0.1) for (let k = 0; k < 7; k++) spark(x0 + vr() * BW, y0 - 2, vr.range(-60, 60) + env.wind * 5, vr.range(-90, -10), vr.range(0.5, 0.9), vr.range(3, 5), 1);
      cap[i] = 0;
    }
    function strike(i, b, live) {
      if (kind[i] === 1) breakBrick(i, b, live);
      else {
        // steel: it rings, and whatever snow lay on it jumps off
        if (live) {
          glint[i] = 0.3;
          if (cap[i] > 0.1) {
            const x0 = WX + (i % COLS) * BW;
            const y0 = WY + ((i / COLS) | 0) * BH;
            for (let k = 0; k < 6; k++) spark(x0 + vr() * BW, y0 - 2, vr.range(-60, 60) + env.wind * 5, vr.range(-80, -10), vr.range(0.5, 0.9), vr.range(3, 5), 1);
          }
        }
        if (cap[i] > 0) markCell(i < COLS ? i : i - COLS);
        cap[i] = 0;
        // a hair of spin so it never settles into a loop between two plates
        const a = (gr() - 0.5) * 0.07;
        const cs = Math.cos(a);
        const sn = Math.sin(a);
        const vx = b.vx * cs - b.vy * sn;
        b.vy = b.vx * sn + b.vy * cs;
        b.vx = vx;
      }
      if (env.snow > 0) b.muffle = 0.62; // snow deadens the bounce
    }

    function collide(b, live) {
      const x = b.x;
      const y = b.y;
      if (y - BR >= WB || y + BR <= WY) return;
      const c0 = Math.max(0, Math.floor((x - BR - WX) / BW));
      const c1 = Math.min(COLS - 1, Math.floor((x + BR - WX) / BW));
      const r0 = Math.max(0, Math.floor((y - BR - WY) / BH));
      const r1 = Math.min(ROWS - 1, Math.floor((y + BR - WY) / BH));
      let best = -1;
      let bestD = BR * BR;
      let nx = 0;
      let ny = 0;
      let qx = 0;
      let qy = 0;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const i = r * COLS + c;
        if (!kind[i]) continue;
        const x0 = WX + c * BW;
        const y0 = WY + r * BH;
        const px = x < x0 ? x0 : x > x0 + BW ? x0 + BW : x;
        const py = y < y0 ? y0 : y > y0 + BH ? y0 + BH : y;
        const dx = x - px;
        const dy = y - py;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          best = i; bestD = d; nx = dx; ny = dy; qx = px; qy = py;
        }
      }
      if (best < 0) return;
      if (bestD < 1e-6) {
        // the centre is inside a brick (one was laid around it)
        if (kind[best] === 1) breakBrick(best, b, live);
        else pop(b, live);
        return;
      }
      if (Math.abs(nx) > Math.abs(ny)) {
        b.vx = nx > 0 ? Math.abs(b.vx) : -Math.abs(b.vx);
        b.x = qx + (nx > 0 ? BR : -BR);
      } else {
        b.vy = ny > 0 ? Math.abs(b.vy) : -Math.abs(b.vy);
        b.y = qy + (ny > 0 ? BR : -BR);
      }
      strike(best, b, live);
    }

    function stepBall(b, dt, live) {
      if (b.state === 0) return;
      if (b.state === 1) {
        b.timer -= dt;
        b.x = pad.x;
        b.y = PAD_Y - BR - 1;
        if (b.timer <= 0) launch(b);
        return;
      }
      if (b.state === 3) {
        b.timer -= dt;
        if (b.timer <= 0) {
          if (b.keep) serve(b, 0.8);
          else b.state = 0;
        }
        return;
      }
      b.quiet += dt;
      b.sincePad += dt;
      if (b.sincePad > 10 && b.quiet > 6) {
        pop(b, live); // rattling somewhere it cannot get out of
        return;
      }
      b.vx += env.ax * dt;
      b.muffle = approach(b.muffle, 1, dt, 0.4);
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const want = env.speed * b.muffle;
      const ns = sp + (want - sp) * Math.min(1, dt * 7);
      b.vx *= ns / sp;
      b.vy *= ns / sp;
      const minV = 0.3 * ns;
      if (Math.abs(b.vy) < minV) {
        b.vy = b.vy < 0 ? -minV : minV;
        b.vx = (b.vx < 0 ? -1 : 1) * Math.sqrt(ns * ns - minV * minV);
      }
      const n = Math.max(1, Math.ceil((ns * dt) / 6));
      const h = dt / n;
      for (let s = 0; s < n && b.state === 2; s++) {
        b.x += b.vx * h;
        b.y += b.vy * h;
        if (b.x < WX + BR) {
          b.x = WX + BR;
          b.vx = Math.abs(b.vx);
        } else if (b.x > WR - BR) {
          b.x = WR - BR;
          b.vx = -Math.abs(b.vx);
        }
        if (b.y < CEIL + BR) {
          b.y = CEIL + BR;
          b.vy = Math.abs(b.vy);
        }
        if (b.vy > 0 && b.y + BR >= PAD_Y && b.y + BR <= PAD_Y + PAD_H + 12 && Math.abs(b.x - pad.x) <= PAD_W / 2 + BR * 0.6) {
          // off the paddle: where it lands on the paddle sets the angle
          const off = clamp((b.x - pad.x) / (PAD_W / 2), -1, 1);
          const a = clamp(off * 1.05 + pad.v * 0.00012, -1.15, 1.15);
          b.vx = Math.sin(a) * ns;
          b.vy = -Math.cos(a) * ns;
          b.y = PAD_Y - BR;
          b.sincePad = 0;
          b.quiet = Math.min(b.quiet, 2);
          b.aimed = false;
          if (live && env.rain > 0) for (let k = 0; k < 4; k++) spark(b.x + vr.range(-8, 8), PAD_Y, vr.range(-90, 90), vr.range(-150, -60), 0.35, 3, 2);
        } else if (b.y - BR > FLOOR) {
          // missed: a spare ball is used up (and when they are all gone, the
          // machine is generous and awards two more)
          spares = spares > 0 ? spares - 1 : 2;
          if (live) for (let k = 0; k < 8; k++) spark(b.x + vr.range(-6, 6), FLOOR, vr.range(-110, 110), vr.range(-200, -60), vr.range(0.3, 0.6), 4, 0);
          b.state = 3;
          b.timer = 1.1;
          b.tn = 0;
        } else collide(b, live);
      }
      if (b.state === 2) {
        b.trail[b.th * 2] = b.x;
        b.trail[b.th * 2 + 1] = b.y;
        b.th = (b.th + 1) % TRAIL;
        if (b.tn < TRAIL) b.tn++;
        if (b.y < WB - 80 && b.vy < 0) b.aimed = false;
      }
    }

    // What would a ball sent from (x, y) in direction (dx, dy) hit first?
    // (The hand allows for the wind, so it aims upwind and the ball arcs back.)
    function cast(x, y, dx, dy) {
      const hs = 8 / env.speed;
      const dax = env.ax * hs * hs;
      for (let n = 0; n < 320; n++) {
        dx += dax / 8;
        x += dx * 8;
        y += dy * 8;
        if (x < WX + BR) {
          x = 2 * (WX + BR) - x;
          dx = -dx;
        } else if (x > WR - BR) {
          x = 2 * (WR - BR) - x;
          dx = -dx;
        }
        if (y < CEIL) return 0;
        if (y < WB && y >= WY) {
          const k = kind[(((y - WY) / BH) | 0) * COLS + (((x - WX) / BW) | 0)];
          if (k) return k;
        }
      }
      return 0;
    }
    const OFFS = 13;
    const offHit = new Uint8Array(OFFS);
    function chooseAim(lx) {
      let match = 0;
      for (let k = 0; k < OFFS; k++) {
        const a = (-0.9 + k * 0.15) * 1.05;
        const hit = cast(lx, PAD_Y - BR, Math.sin(a), -Math.cos(a));
        offHit[k] = ai.lazy ? (hit !== 1 ? 1 : 0) : hit === 1 ? 1 : 0;
        match += offHit[k];
      }
      let pick = gr.int(0, OFFS - 1);
      if (match) {
        let m = gr.int(1, match);
        for (let k = 0; k < OFFS; k++) if (offHit[k] && --m === 0) pick = k;
      }
      pad.aim = clamp(-0.9 + pick * 0.15 + gr.gauss() * 0.06, -0.95, 0.95);
      // the odd lapse: a late start and a misjudged ball
      const lapse = 0.016 + 0.0011 * env.gust + 0.02 * env.slick;
      if (gr() < lapse) {
        pad.freeze = gr.range(0.3, 0.5);
        pad.err = gr.sign() * gr.range(40, 120);
      } else pad.err = gr.gauss() * 5;
    }
    function think() {
      pad.react = gr.range(0.09, 0.17);
      let b = null;
      let other = null;
      for (const q of balls) {
        if (q.state === 2 && q.vy > 0 && (!b || q.y > b.y)) b = q;
        if (q.state === 1 || q.state === 2) other = other || q;
      }
      if (!b) {
        pad.target = other && other.state === 2 ? lerp(other.x, W / 2, 0.3) : pad.target;
        return;
      }
      // where a straight line says it will come down (wind only half reckoned with)
      const t = (PAD_Y - BR - b.y) / b.vy;
      const lo = WX + BR;
      const span = WR - WX - 2 * BR;
      let u = (b.x + b.vx * t + 0.25 * env.ax * t * t - lo) % (2 * span);
      if (u < 0) u += 2 * span;
      if (u > span) u = 2 * span - u;
      const lx = lo + u;
      if (!b.aimed && b.y > WB - 60) {
        b.aimed = true;
        chooseAim(lx);
      }
      pad.target = clamp(lx - (b.aimed ? pad.aim * (PAD_W / 2) + pad.err : 0), WX + PAD_W / 2, WR - PAD_W / 2);
    }

    // One step of the game. `p` is how far through the quarter hour we are.
    function simStep(dt, live, p) {
      simNow += dt;
      pad.react -= dt;
      if (pad.freeze > 0) pad.freeze -= dt;
      else if (pad.react <= 0) think();
      const K = 300;
      const zeta = lerp(0.95, 0.4, env.slick); // a wet paddle slides past its mark
      pad.v += ((pad.target - pad.x) * K - pad.v * 2 * Math.sqrt(K) * zeta + env.wind * 0.8 * K) * dt;
      pad.v = clamp(pad.v, -1900, 1900);
      pad.x += pad.v * dt;
      if (pad.x < WX + PAD_W / 2) {
        pad.x = WX + PAD_W / 2;
        pad.v = 0;
      } else if (pad.x > WR - PAD_W / 2) {
        pad.x = WR - PAD_W / 2;
        pad.v = 0;
      }
      stepBall(balls[0], dt, live);
      stepBall(balls[1], dt, live);

      for (let j = 0; j < qn; ) {
        if (qT[j] <= simNow) {
          lay(qI[j], qK[j], live);
          qn--;
          qI[j] = qI[qn]; qT[j] = qT[qn]; qK[j] = qK[qn];
        } else j++;
      }

      ctrlT -= dt;
      if (ctrlT <= 0) {
        ctrlT += 1;
        let left = 0;
        for (let i = 0; i < NB; i++) if (reach[i] && kind[i] === 1) left++;
        const frac = left / reachTotal;
        const target = keepAt(p);
        ai.lazy = frac < target - 0.06;
        relayCool -= 1;
        if (frac < target - 0.015 && relayCool <= 0 && qn === 0) {
          relayCourse();
          relayCool = gr.range(3, 7);
        }
      }
      if (env.snow > 0) {
        snowT -= dt;
        if (snowT <= 0) {
          snowT += 0.5;
          const rate = (env.snow * 0.5) / 40;
          for (let i = 0; i < NB; i++) {
            if (kind[i] && (i < COLS || !kind[i - COLS])) cap[i] = Math.min(1, cap[i] + rate);
            else cap[i] = 0;
            const lv = cap[i] < 0.06 ? 0 : 1 + Math.round(cap[i] * 4);
            if (lv !== capLvl[i]) {
              capLvl[i] = lv;
              markCell(i < COLS ? i : i - COLS); // its snow is drawn in the cell above
            }
          }
        }
      }
    }

    function readEnv(s) {
      const w = s.weather;
      const g = Math.max(0, noise.n2(s.t * 0.33, 4.2));
      const speed = w.wind + (w.gust - w.wind) * g * g;
      const sx = -Math.sin((w.windDir * Math.PI) / 180); // + is a wind from the west, blowing rightward
      const lateral = (sx < 0 ? -1 : 1) * Math.max(Math.abs(sx), 0.45);
      env.wind = speed * lateral;
      env.gust = w.gust;
      // the push on the ball grows with the wind but saturates, so a gale bends
      // every path hard without pinning the ball against one wall
      env.ax = Math.sign(env.wind) * 330 * (1 - Math.exp(-Math.abs(env.wind) / 22));
      env.rain = w.falling && w.falling !== "snow" ? w.intensity : 0;
      env.snow = w.falling === "snow" ? w.intensity : 0;
      env.slick = Math.min(1, env.rain * 1.6);
      env.storm = w.falling === "storm";
      env.speed = 520 * lerp(1, 1.28, smoothstep(78, 100, w.temp)) * lerp(1, 0.9, smoothstep(40, 10, w.temp)) * (1 - 0.12 * env.snow);
      env.fog = Math.max(w.fog ? 1 : 0, 0.7 * smoothstep(1, 0.1, w.visibility));
    }

    // Carve the wall the way a ball would have: a cavern eaten in from the
    // open air below (and, once it has tunnelled through, from the gap above
    // the top course), along a seeded, uneven grain. Leaves `goal` of the
    // reachable sky brick standing.
    const pcCost = new Float32Array(NB);
    const breach = new Uint8Array(NB); // the cells such a cavern takes, from a whole wall
    function planCarve(goal, q) {
      let n = Math.round(reachTotal * (1 - goal));
      pcCost.fill(1e9);
      breach.fill(0);
      const sd = seed + q * 13;
      for (let c = 0; c < COLS; c++) {
        const i = (ROWS - 1) * COLS + c;
        if (reach[i]) pcCost[i] = 0.25 + 2.2 * hash(i, sd) ** 2;
      }
      let top = false;
      while (n > 0) {
        let best = -1;
        let bc = 1e8;
        for (let i = 0; i < NB; i++) if (!breach[i] && pcCost[i] < bc) { bc = pcCost[i]; best = i; }
        if (best < 0) break;
        breach[best] = 1;
        n--;
        const c = best % COLS;
        const r = (best / COLS) | 0;
        for (let d = 0; d < 4; d++) {
          let j = -1;
          if (d === 0 && c > 0) j = best - 1;
          else if (d === 1 && c < COLS - 1) j = best + 1;
          else if (d === 2 && r < ROWS - 1) j = best + COLS;
          else if (d === 3) j = r > 0 ? best - COLS : -1;
          if (j >= 0 && !breach[j] && reach[j] && !steel[j]) pcCost[j] = Math.min(pcCost[j], bc + 0.25 + 2.2 * hash(j, sd) ** 2);
        }
        if (r === 0 && !top) {
          // through to the gap above the wall: the whole top course is open to it
          top = true;
          for (let k = 0; k < COLS; k++) if (!breach[k] && reach[k] && !steel[k]) pcCost[k] = Math.min(pcCost[k], bc + 0.25 + 2.2 * hash(k, sd) ** 2);
        }
      }
    }
    function preCarve(goal, q) {
      planCarve(goal, q);
      for (let i = 0; i < NB; i++) if (breach[i] && kind[i] === 1) kind[i] = 0;
    }

    // Lay the whole wall for this instant and play the quarter hour so far.
    function rebuild(s, tail = 30) {
      const c = s.clock;
      shownH = c.hh; shownM = c.mm; shownA = c.ampm;
      buildSteel(steel, shownH, shownM);
      computeReach();
      for (let i = 0; i < NB; i++) kind[i] = steel[i] ? 2 : 1;
      preCarve(keepAt(0), Math.floor(s.ms / QUARTER));
      cap.fill(0);
      fresh.fill(0);
      glint.fill(0);
      if (env.snow > 0) for (let i = 0; i < COLS; i++) cap[i] = 1;
      qn = 0;
      shL.fill(0);
      ptL.fill(0);
      const q = Math.floor(s.ms / QUARTER);
      gr = rng(seed + (q % 100000) * 7919);
      simNow = 0;
      ctrlT = 1;
      snowT = 0.5;
      relayCool = 0;
      spares = 3;
      ai.lazy = false;
      pad.x = pad.target = W / 2 + gr.range(-200, 200);
      pad.v = pad.freeze = pad.react = 0;
      balls[0].keep = true;
      serve(balls[0], 0.6);
      balls[1].keep = env.storm;
      if (env.storm) serve(balls[1], 2.2);
      else balls[1].state = 0;
      const elapsed = (((s.ms % QUARTER) + QUARTER) % QUARTER) / 1000;
      const m0 = Math.floor(c.m / 15) * 15;
      // Most of the quarter hour so far is carved analytically (quick); only
      // last half minute is actually played, so the ball's own marks, the
      // paddle and the shards are all where they would be. (In a time-lapse,
      // which jumps every frame, a few seconds of play is all that shows.)
      const pre = Math.max(0, elapsed - tail);
      instant = true;
      if (pre > 0) {
        preCarve(keepAt(pre / 900), q); // a deeper cavern along the same grain
        relayCells(SLOT_B, MIN_ROW, 7, 15, 0, 0);
        if ((m0 + Math.floor(pre / 60)) % 10 === 0) relayCells(SLOT_A, MIN_ROW, 7, 15, 0, 0);
      }
      const h = 1 / 30;
      const steps = Math.round((elapsed - pre) / h);
      let minute = Math.floor(pre / 60);
      for (let n = 0; n < steps; n++) {
        const tau = pre + n * h;
        const km = Math.floor(tau / 60);
        if (km !== minute) {
          minute = km;
          relayCells(SLOT_B, MIN_ROW, 7, 15, 0, 0);
          if ((m0 + km) % 10 === 0) relayCells(SLOT_A, MIN_ROW, 7, 15, 0, 0);
        }
        simStep(h, false, tau / 900);
      }
      instant = false;
      // snow has been lying on whatever stands all along, not just since the
      // last thirty seconds
      if (env.snow > 0) for (let i = 0; i < NB; i++) {
        if (kind[i] && (i < COLS || !kind[i - COLS])) cap[i] = Math.max(cap[i], (0.35 + 0.65 * env.snow) * (0.6 + 0.4 * hash(i, seed + 3)));
      }
      nCells = 0;
      cellFlag.fill(0);
      rowDirty.fill(1);
    }

    // The clock moved on: re-lay what changed.
    function timeChanged(s, now) {
      const c = s.clock;
      buildSteel(steelNext, c.hh, c.mm);
      const whole = c.hh !== shownH || c.ampm !== shownA;
      const tens = c.mm[0] !== shownM[0];
      const ones = c.mm[1] !== shownM[1];
      shownH = c.hh; shownM = c.mm; shownA = c.ampm;
      steel.set(steelNext);
      computeReach();
      instant = now;
      if (whole) {
        // a new quarter hour: the mason lays the whole wall again, from the
        // bottom up, leaving the breach the ball will start from
        planCarve(keepAt(0), Math.floor(s.ms / QUARTER));
        relayCells(0, 0, COLS, ROWS, 0.045, 0.004, true);
      }
      else {
        if (tens) relayCells(SLOT_A, MIN_ROW, 7, 15, 0.08, 0.01);
        if (ones) relayCells(SLOT_B, MIN_ROW, 7, 15, 0.08, 0.01);
      }
      instant = false;
    }

    // ----- glaze -------------------------------------------------------------
    const colDim = new Array(NB).fill("#000");
    const colLit = new Array(NB).fill("#000");
    const lab4 = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const DIRS = ["west", "northWest", "northEast", "east"];
    const Y_MAX = (luminance(STEEL_DAY) + 0.05) / 3.3 - 0.05; // keep the numerals 3.3:1 clear of the brightest glaze
    let unlit = 1; // U0 at night .. 1 by day: how much light is on the wall
    let steelDim = STEEL_DAY;
    let frost = 0;
    let wet = 0;
    let palKey = -1;

    function glaze(s) {
      const day = s.sky.day || [];
      const n = day.length;
      const past = s.pastHours;
      let j = 0;
      for (let r = 0; r < ROWS; r++) {
        const tr = s.ms - (ROWS - 1 - r) * ROW_MS;
        let src = null;
        if (r === ROWS - 1) src = s.sky;
        else if (n) {
          while (j < n - 1 && Math.abs(day[j + 1].ms - tr) <= Math.abs(day[j].ms - tr)) j++;
          if (Math.abs(day[j].ms - tr) < 50 * 60000) src = day[j];
        }
        if (src) for (let d = 0; d < 4; d++) lab4[d] = toOklab(src[DIRS[d]]);
        else {
          let cloud = 0.4;
          if (past && past.length) {
            const k = clamp(Math.round((tr - past[0].ms) / 3600000), 0, past.length - 1);
            cloud = past[k].cloud / 100;
          }
          for (let d = 0; d < 4; d++) lab4[d] = toOklab(modelSky(tr, cloud, BEARINGS[d]));
        }
        for (let c = 0; c < COLS; c++) {
          const i = r * COLS + c;
          const f = (c / (COLS - 1)) * 3;
          const seg = Math.min(2, Math.floor(f));
          const t = f - seg;
          const A = lab4[seg];
          const B = lab4[seg + 1];
          const L0 = A[0] + (B[0] - A[0]) * t;
          const a = A[1] + (B[1] - A[1]) * t;
          const b = A[2] + (B[2] - A[2]) * t;
          // sky into fired glaze: mid-toned, a little richer, never quite the same twice
          const j1 = hash(i, seed) - 0.5;
          const j2 = hash(i, seed + 31) - 0.5;
          // (rain soaks the glaze: darker and deeper in colour)
          let L = (Math.min(0.62, 0.25 + 0.42 * L0) + j1 * 0.06) * (1 - 0.2 * wet);
          const C = Math.min(0.2, Math.hypot(a, b) * 1.4 + 0.018) * (1 + j2 * 0.25) * (1 + 0.2 * wet);
          const hue = (Math.atan2(b, a) * 180) / Math.PI + j2 * 9;
          let hex = oklch(L, C, hue);
          while (luminance(hex) > Y_MAX && L > 0.3) {
            L -= 0.02;
            hex = oklch(L, C, hue);
          }
          colLit[i] = hex;
          colDim[i] = unlit > 0.985 ? hex : oklch(L * unlit, C * (0.72 + 0.28 * unlit), hue);
        }
      }
    }

    function skyDetail(ctx, ox, oy, r, c0, c1, k) {
      const y = oy + r * BH;
      let any = false;
      ctx.beginPath();
      for (let c = c0; c <= c1; c++) {
        if (kind[r * COLS + c] !== 1) continue;
        any = true;
        const x = ox + c * BW;
        ctx.rect(x + 1, y + 1, BW - 2, 2);
        ctx.rect(x + 1, y + 3, 2, BH - 7);
      }
      if (!any) return;
      ctx.fillStyle = `rgba(255,255,255,${((0.16 + 0.2 * wet) * k).toFixed(3)})`;
      ctx.fill();
      ctx.beginPath();
      for (let c = c0; c <= c1; c++) {
        if (kind[r * COLS + c] !== 1) continue;
        const x = ox + c * BW;
        ctx.rect(x + 1, y + BH - 4, BW - 2, 3);
        ctx.rect(x + BW - 3, y + 1, 2, BH - 5);
      }
      ctx.fillStyle = "rgba(0,0,0,0.24)";
      ctx.fill();
      if (frost > 0.02) {
        ctx.beginPath();
        for (let c = c0; c <= c1; c++) {
          const i = r * COLS + c;
          if (kind[i] !== 1) continue;
          const x = ox + c * BW;
          for (let q = 0; q < 5; q++) {
            const hx = hash(i * 7 + q, 91);
            const hy = hash(i * 7 + q, 17);
            ctx.rect(x + 2 + Math.floor(hx * (BW - 7)), y + 2 + Math.floor(hy * hy * 9), hx > 0.6 ? 3 : 2, 2);
          }
        }
        ctx.fillStyle = `rgba(214,236,255,${(0.42 * frost * k).toFixed(3)})`;
        ctx.fill();
      }
    }
    function steelDetail(ctx, ox, oy, r, c0, c1, k) {
      const y = oy + r * BH;
      let any = false;
      ctx.beginPath();
      for (let c = c0; c <= c1; c++) {
        if (kind[r * COLS + c] !== 2) continue;
        any = true;
        const x = ox + c * BW;
        ctx.rect(x + 1, y + 1, BW - 2, 2);
        ctx.rect(x + 1, y + 3, 2, BH - 7);
      }
      if (!any) return;
      ctx.fillStyle = `rgba(255,255,255,${(0.6 * k).toFixed(3)})`;
      ctx.fill();
      ctx.beginPath();
      for (let c = c0; c <= c1; c++) {
        if (kind[r * COLS + c] !== 2) continue;
        const x = ox + c * BW;
        ctx.rect(x + 1, y + BH - 4, BW - 2, 3);
        ctx.rect(x + BW - 3, y + 3, 2, BH - 7);
      }
      ctx.fillStyle = "rgba(74,60,36,0.22)";
      ctx.fill();
    }
    function paintRange(r, c0, c1) {
      const y = WY + r * BH;
      const x = WX + c0 * BW;
      const w = (c1 - c0 + 1) * BW;
      const wc = wall.ctx;
      // the steel shares the wall's layer, except when fog has to pass between them
      const sc = steelOwn ? steelL.ctx : wc;
      wc.clearRect(x, y, w, BH);
      if (steelOwn) sc.clearRect(x, y, w, BH);
      if (starA > 0.02) {
        // stars, seen through the cells the ball has emptied (painted here, so
        // the night needs no extra layer)
        wc.fillStyle = "#dfe6ff";
        for (let q = 0; q < STN; q++) {
          const qy = stY[q];
          const qx = stX[q];
          if (qy < y || qy >= y + BH - 3 || qx < x || qx >= x + w - 3) continue;
          if (kind[r * COLS + (((qx - WX) / BW) | 0)]) continue;
          wc.globalAlpha = starA * (q & 1 ? 0.95 : 0.45);
          wc.fillRect(qx, qy, stZ[q], stZ[q]);
        }
        wc.globalAlpha = 1;
      }
      for (let c = c0; c <= c1; c++) {
        const i = r * COLS + c;
        const k = kind[i];
        if (!k) continue;
        const bx = WX + c * BW;
        if (k === 1) {
          wc.fillStyle = colDim[i];
          wc.fillRect(bx + 1, y + 1, BW - 2, BH - 2);
        } else {
          sc.fillStyle = steelDim;
          sc.fillRect(bx + 1, y + 1, BW - 2, BH - 2);
        }
      }
      // Snow lies on a brick with open air above it, so it is drawn in the
      // empty cell above: this row draws the snow of the row below it (and
      // the top row its own, in the gap above the wall).
      wc.fillStyle = snowCol;
      if (r === 0) wc.clearRect(x, WY - 9, w, 9);
      for (let c = c0; c <= c1; c++) {
        for (let rr = r === 0 ? 0 : r + 1; rr <= r + 1 && rr < ROWS; rr++) {
          const i = rr * COLS + c;
          if (!kind[i] || cap[i] < 0.06 || (rr > r && kind[r * COLS + c])) continue;
          const top = WY + rr * BH;
          const hgt = 3 + Math.round(cap[i] * 7);
          const bx = WX + c * BW;
          wc.fillRect(bx + 1, top - hgt + 1, BW - 2, hgt);
          if (cap[i] > 0.5) wc.fillRect(bx + 5 + ((hash(i, 5) * 12) | 0), top - hgt - 1, BW - 22, 2);
        }
      }
      const k = 0.3 + 0.7 * ((unlit - U0) / (1 - U0));
      skyDetail(wc, WX, WY, r, c0, c1, k);
      steelDetail(sc, WX, WY, r, c0, c1, k);
    }

    // The stars in the open sky around the wall (above it, beside it, over
    // the play), on the wall's own layer: repainted when the light changes.
    function paintSkyStars() {
      const wc = wall.ctx;
      wc.clearRect(0, 0, W, WY);
      wc.clearRect(0, WB, W, FLOOR - WB);
      wc.clearRect(0, WY, WX, WB - WY);
      wc.clearRect(WR, WY, W - WR, WB - WY);
      if (starA <= 0.02) return;
      wc.fillStyle = "#dfe6ff";
      for (let q = 0; q < STN; q++) {
        const qx = stX[q];
        const qy = stY[q];
        if (qx >= WX - 3 && qx < WR && qy >= WY - 3 && qy < WB) continue;
        wc.globalAlpha = starA * (q & 1 ? 0.95 : 0.45);
        wc.fillRect(qx, qy, stZ[q], stZ[q]);
      }
      wc.globalAlpha = 1;
    }

    // The foundation below the horizon: the same brick in a running bond, laid
    // dark, for the scoreboard to be set into (on the wall's layer, once per
    // change of light). Only the mortar and a faint lip show, so the type
    // over it keeps its contrast.
    function paintFloor() {
      const wc = wall.ctx;
      const y0 = FLOOR + 4;
      wc.clearRect(0, y0, W, H - y0);
      wc.beginPath();
      for (let r = 0; y0 + r * BH < H; r++) {
        const y = y0 + r * BH;
        wc.rect(0, y + BH - 2, W, 2);
        const off = r & 1 ? BW / 2 : 0;
        for (let x = WX - BW + off; x < W; x += BW) wc.rect(x + BW - 2, y, 2, BH - 2);
      }
      wc.fillStyle = "rgba(0,0,0,0.26)";
      wc.fill();
      wc.beginPath();
      for (let r = 0; y0 + r * BH < H; r++) wc.rect(0, y0 + r * BH, W, 1);
      wc.fillStyle = "rgba(255,255,255,0.035)";
      wc.fill();
    }

    // ----- weather behind the wall --------------------------------------------
    const RN = 360;
    const rX = new Float32Array(RN), rY = new Float32Array(RN), rV = new Float32Array(RN), rLen = new Float32Array(RN);
    for (let i = 0; i < RN; i++) {
      rX[i] = vr.range(-200, W + 200);
      rY[i] = vr.range(-100, FLOOR);
      rV[i] = vr.range(950, 1400);
      rLen[i] = vr.range(22, 46);
    }
    const SN = 480;
    const sX = new Float32Array(SN), sY = new Float32Array(SN), sV = new Float32Array(SN), sS = new Float32Array(SN), sP = new Float32Array(SN);
    for (let i = 0; i < SN; i++) {
      sX[i] = vr.range(-100, W + 100);
      sY[i] = vr.range(-40, FLOOR);
      sV[i] = vr.range(55, 150);
      sS[i] = vr.range(3, 7);
      sP[i] = vr.range(0, TAU);
    }

    // ----- frame ---------------------------------------------------------------
    const shown = {};
    const put = (key, node, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };
    let lastMs = null;
    let lastQ = null;
    let jumpRun = 0; // > 0 just after a jump: another one means a time-lapse
    let ink = STEEL_DAY;
    let ground = NIGHT_GROUND;
    let trailCol = STEEL_DAY;
    let acc = "#9a9484";
    let snowCol = "#ffffff";
    let rainCol = "rgba(200,220,240,0.4)";
    let flash = 0; // far lightning: 0..1
    let flashT = 6;
    let rumble = 0;
    let shiver = false;
    let fogOn = false;
    let steelOwn = false; // steel on its own layer (only in fog)

    function frame(s) {
      const dms = lastMs == null ? 0 : s.ms - lastMs;
      const first = lastMs == null;
      lastMs = s.ms;
      readEnv(s);
      const dt = s.dt;
      const q = Math.floor(s.ms / QUARTER);
      const p = (((s.ms % QUARTER) + QUARTER) % QUARTER) / QUARTER;

      // ----- the game -----
      let jumped = false;
      if (first || Math.abs(dms) > 60000) {
        rebuild(s, jumpRun > 0 ? 3 : 30);
        jumpRun = 3;
        jumped = true;
      } else {
        const fast = dms > 1000 * dt * 3 + 200; // the clock is being run fast: play to keep up, without ceremony
        const c = s.clock;
        if (q !== lastQ && dms > 0) {
          // a new quarter hour: the whole wall is laid again
          gr = rng(seed + (q % 100000) * 7919);
          shownH = "";
          spares = 3; // a new wall, a new game
        }
        if (c.hh !== shownH || c.mm !== shownM || c.ampm !== shownA) timeChanged(s, fast || Math.abs(dms) > 3000);
        if (env.storm && !balls[1].keep) {
          balls[1].keep = true;
          if (balls[1].state === 0) serve(balls[1], 1.5);
        } else if (!env.storm) balls[1].keep = false;
        if (fast) {
          const span = Math.min(60, dms / 1000);
          const n = Math.ceil(span * 20);
          instant = true;
          for (let k = 0; k < n; k++) simStep(span / n, false, p);
          instant = false;
          jumped = true;
        } else {
          const n = Math.max(1, Math.ceil(dt * 60));
          for (let k = 0; k < n; k++) simStep(dt / n, true, p);
        }
      }
      lastQ = q;
      if (!jumped && jumpRun > 0) jumpRun--;

      // ----- light and colour -----
      const dl = s.daylight;
      const u = Math.round((U0 + (1 - U0) * smoothstep(0.06, 0.7, dl)) * 60) / 60;
      const fr = Math.round(smoothstep(35, 18, s.weather.temp) * 4) / 4;
      const wt = Math.round(env.slick * 4) / 4;
      const ht = Math.round(smoothstep(84, 100, s.weather.temp) * 4) / 4;
      const day = s.sky.day || [];
      // a single number standing for everything the glaze depends on; the
      // live sky is re-read once a minute, not every frame
      const key = (Math.floor(s.ms / 60000) % 100000) * 1e9 + Math.round(u * 60) * 1e7 + Math.round(fr * 4) * 1e6 + Math.round(wt * 4) * 1e5 + ht * 4e4 +
        (day.length % 100) * 1e3 + (day.length ? Math.floor(day[day.length - 1].ms / 60000) % 1000 : 0);
      if (key !== palKey) {
        palKey = key;
        unlit = u;
        frost = fr;
        wet = wt;
        const k = (u - U0) / (1 - U0);
        steelDim = mix(STEEL_NIGHT, STEEL_DAY, k);
        // in fog the steel is whitened, so the numerals stand out of the grey
        if (env.fog > 0.05) steelDim = mix(steelDim, "#fbf8f0", 0.75 * env.fog);
        ink = steelDim;
        // The air behind the wall is the sky as it is now, held deep so the
        // ivory always reads on it: cobalt at noon, slate under cloud, navy at
        // night with the city's sodium glow under a low ceiling of cloud.
        const dk = Math.round(smoothstep(0.08, 0.6, dl) * 40) / 40;
        const cloud = clamp(s.weather.cloud / 100);
        const top = mix(NIGHT_SKY, adjust(s.sky.mean, { l: 0.3, c: (v) => Math.min(v * 0.9, 0.075) }), dk);
        // (low down it is the western sky: the studio looks across the river at Manhattan)
        let bot = mix(mix("#0f1629", "#2a1b16", cloud * 0.85), adjust(mix(s.sky.mean, s.sky.west, 0.7), { l: 0.43, c: (v) => Math.min(v * 1.15, 0.1) }), dk);
        // a hot day leaves an amber haze lying over the river
        if (ht > 0) bot = mix(bot, "#a8673a", 0.42 * ht * (0.3 + 0.7 * dk));
        // the foundation the scoreboard is set in: a deep tone of the sky as it
        // is now (blue under a clear sky, slate under cloud, warm at sundown),
        // darker and bluer when it is wet, a little browner in a heatwave
        const skyLow = mix(s.sky.mean, s.sky.west, 0.4);
        let gDay = adjust(skyLow, { l: 0.24 - 0.04 * wt, c: (v) => Math.min(v * 1.2 + 0.012, 0.08) });
        if (wt > 0) gDay = mix(gDay, "#13233a", 0.3 * wt);
        if (ht > 0) gDay = mix(gDay, "#4a2a18", 0.45 * ht);
        const gNight = mix(NIGHT_GROUND, adjust(skyLow, { l: 0.15, c: (v) => Math.min(v * 1.2 + 0.01, 0.045) }), 0.6);
        ground = mix(gNight, gDay, dk);
        // the arcade's label colour: the hue of the western sky when it has one,
        // otherwise of the temperature (ice blue in the cold, amber in the heat)
        const lw = toOklch(skyLow);
        const tHue = lerp(230, 40, smoothstep(20, 95, s.weather.temp));
        const hue = lw.c > 0.03 ? lw.h : tHue;
        acc = oklch(lerp(0.74, 0.84, dk), 0.13, hue);
        // one background for the whole stage: the sky down to the horizon, then the ground
        wrap.style.background = `linear-gradient(to bottom, ${top} 0px, ${mix(top, bot, 0.45)} ${FLOOR / 2}px, ${bot} ${FLOOR}px, ${mix(ground, bot, 0.25)} ${FLOOR}px, ${ground} ${FLOOR + 160}px, ${ground} ${H}px)`;
        starA = (1 - smoothstep(0.02, 0.3, dl)) * Math.pow(1 - cloud, 1.5) * (1 - env.fog);
        snowCol = mix("#bcc3ce", "#ffffff", k);
        rainCol = rgba(mix("#8fa2bd", "#e4eef7", k), 0.5 + 0.2 * k);
        trailCol = TRAIL_RAMP(clamp((s.weather.temp - 10) / 90));
        glaze(s);
        rowDirty.fill(1);
        paintSkyStars();
        wrap.style.setProperty("--ink", ink);
        wrap.style.setProperty("--acc", acc);
        // fog is pale by day and dusky by night, but never so close to the
        // steel that the numerals (or the title over it) lose their edge
        let fl = lerp(0.3, 0.56, dk);
        let fogCol = adjust(s.sky.mean, { l: fl, c: (v) => v * 0.4 });
        while (contrast(fogCol, steelDim) < 4.6 && fl > 0.12) {
          fl -= 0.02;
          fogCol = adjust(s.sky.mean, { l: fl, c: (v) => v * 0.4 });
        }
        wrap.style.setProperty("--fog", fogCol);
        paintFloor();
      }

      // ----- repaint what changed: single bricks at once, whole courses a few per frame -----
      let budget = jumped ? ROWS : 8;
      for (let r = 0; r < ROWS && budget > 0; r++) {
        if (!rowDirty[r]) continue;
        rowDirty[r] = 0;
        paintRange(r, 0, COLS - 1);
        budget--;
      }
      for (let k = 0; k < nCells; k++) {
        const i = cellList[k];
        cellFlag[i] = 0;
        paintRange((i / COLS) | 0, i % COLS, i % COLS);
      }
      nCells = 0;

      // ----- weather, behind the wall -----
      const ac = air.ctx;
      const airBusy = env.rain > 0.01 || env.snow > 0.01;
      if (airBusy || shown.airKey !== 0) {
        // (in dry weather the layer is cleared once and hidden, not composited)
        shown.airKey = airBusy ? -1 : 0;
        const airOn = airBusy;
        if (shown.airOn !== airOn) {
          shown.airOn = airOn;
          air.canvas.style.display = airOn ? "block" : "none";
        }
        air.clear();
        if (env.rain > 0.01) {
          const n = Math.min(RN, Math.round(70 + 300 * env.rain));
          const slant = env.wind * 9;
          ac.strokeStyle = rainCol;
          ac.lineCap = "butt";
          for (let pass = 0; pass < 2; pass++) {
            ac.lineWidth = pass ? 3 : 2;
            ac.beginPath();
            for (let i = pass; i < n; i += 2) {
              const v = rV[i];
              if (!jumped) {
                rX[i] += slant * dt;
                rY[i] += v * dt;
              }
              if (rY[i] > FLOOR || (rY[i] > PAD_Y && rY[i] - v * dt <= PAD_Y && Math.abs(rX[i] - pad.x) < PAD_W / 2)) {
                const onPad = rY[i] <= FLOOR;
                spark(rX[i], onPad ? PAD_Y : FLOOR, vr.range(-70, 70) + slant * 0.2, vr.range(-170, -70), 0.28, 3, 2);
                rX[i] = vr.range(-200, W + 200);
                rY[i] = vr.range(-160, -20);
                continue;
              }
              const k = rLen[i] / v;
              ac.moveTo(rX[i], rY[i]);
              ac.lineTo(rX[i] - slant * k, rY[i] - rLen[i]);
            }
            ac.stroke();
          }
        }
        if (env.snow > 0.01) {
          const n = Math.min(SN, Math.round(80 + 400 * env.snow));
          const streak = Math.min(16, Math.abs(env.wind) * 0.45); // a driving wind draws the flakes out sideways
          ac.fillStyle = snowCol;
          ac.globalAlpha = 0.48 + 0.37 * ((unlit - U0) / (1 - U0)); // softer in the dark: snow must not light the room
          ac.beginPath();
          for (let i = 0; i < n; i++) {
            if (!jumped) {
              sX[i] += (env.wind * 7 + Math.sin(s.t * 1.3 + sP[i]) * 22) * dt;
              sY[i] += sV[i] * dt;
            }
            if (sY[i] > FLOOR - 2) {
              sY[i] = -10;
              sX[i] = vr.range(-100, W + 100);
            }
            if (sX[i] < -120) sX[i] += W + 240;
            else if (sX[i] > W + 120) sX[i] -= W + 240;
            const z = sS[i];
            ac.rect(sX[i], sY[i], z + streak * (z / 7), z);
          }
          ac.fill();
          ac.globalAlpha = 1;
        }
      }

      // ----- fog over the upper wall -----
      const fogAmt = Math.round(env.fog * 50) / 50;
      if (fogAmt > 0.02 !== fogOn) {
        fogOn = fogAmt > 0.02;
        fog.style.display = fogOn ? "block" : "none";
        steelOwn = fogOn;
        steelL.canvas.style.display = steelOwn ? "block" : "none";
        if (!steelOwn) steelL.clear();
        rowDirty.fill(1);
      }
      if (fogOn) {
        if (shown.fog !== fogAmt) {
          shown.fog = fogAmt;
          fog.style.opacity = String(fogAmt);
        }
        for (let i = 0; i < 4; i++) {
          const dx = Math.sin(s.t * (0.05 + i * 0.013) + i * 2.1) * 140 + env.wind * 3;
          const dy = Math.cos(s.t * (0.04 + i * 0.01) + i) * 26;
          fogBlobs[i].style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`;
        }
      }

      // ----- thunder: a soft glow now and then, and a slow shiver after it -----
      if (env.storm && !jumped) {
        flashT -= dt;
        if (flashT <= 0) {
          flashT = vr.range(9, 20);
          flash = 0.001;
          rumble = 3.2;
        }
      }
      if (flash > 0) {
        // rises over half a second, fades over two
        flash += dt * (flash < 1 && rumble > 2.7 ? 2 : 0);
        if (rumble <= 2.7) flash = Math.max(0, flash - dt * 0.5);
        flash = Math.min(1, flash);
      }
      if (rumble > 0) {
        rumble = Math.max(0, rumble - dt);
        const amp = 2 * Math.min(1, rumble / 1.5) * Math.min(1, (3.2 - rumble) * 2);
        // (a slow tremor, a couple of pixels, never a buzz)
        const tx = `translate(${(Math.sin(s.t * 6.3) * amp).toFixed(2)}px,${(Math.sin(s.t * 4.4 + 1) * amp * 0.5).toFixed(2)}px)`;
        wall.canvas.style.transform = tx;
        steelL.canvas.style.transform = tx;
        shiver = true;
      } else if (shiver) {
        shiver = false;
        wall.canvas.style.transform = "";
        steelL.canvas.style.transform = "";
      }

      // ----- everything that moves -----
      const fc = fx.ctx;
      // a whole-canvas clear: the browser then drops last frame's drawing
      // instead of keeping it queued (a partial clear lets thousands of
      // queued lantern fills pile up and stall a frame for a second)
      fc.clearRect(0, 0, W, H);
      const dark = 1 - (unlit - U0) / (1 - U0); // 1 at night
      if (dark > 0.03) {
        // the ball is a lantern: the glaze near it shows its daylight colour,
        // fading with distance (the bevels are left in shadow)
        for (const b of balls) {
          if (b.state !== 2 && b.state !== 1) continue;
          if (b.y > WB + LAMP || b.y < WY - LAMP) continue;
          const c0 = Math.max(0, Math.floor((b.x - LAMP - WX) / BW));
          const c1 = Math.min(COLS - 1, Math.floor((b.x + LAMP - WX) / BW));
          const r0 = Math.max(0, Math.floor((b.y - LAMP - WY) / BH));
          const r1 = Math.min(ROWS - 1, Math.floor((b.y + LAMP - WY) / BH));
          for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
            const i = r * COLS + c;
            if (!kind[i]) continue;
            const x = WX + c * BW;
            const y = WY + r * BH;
            const dx = x + BW / 2 - b.x;
            const dy = y + BH / 2 - b.y;
            const f = 1 - Math.sqrt(dx * dx + dy * dy) / LAMP;
            if (f <= 0.14) continue; // (too faint to see: not worth a fill)
            fc.globalAlpha = dark * 0.85 * f * f;
            fc.fillStyle = kind[i] === 1 ? colLit[i] : STEEL_DAY;
            fc.fillRect(x + 3, y + 3, BW - 6, BH - 7);
          }
        }
        if (flash > 0.01) {
          // far lightning: the whole glaze, softly, for a moment
          // (one pale fill over every standing sky brick: one path, one paint)
          fc.globalAlpha = dark * 0.3 * flash * (2 - flash);
          fc.fillStyle = "#c9d6ff";
          fc.beginPath();
          for (let i = 0; i < NB; i++) {
            if (kind[i] !== 1) continue;
            fc.rect(WX + (i % COLS) * BW + 1, WY + ((i / COLS) | 0) * BH + 1, BW - 2, BH - 2);
          }
          fc.fill();
        }
        fc.globalAlpha = 1;
      }

      // wet glaze on new bricks, the ring of struck steel
      fc.fillStyle = "#fff8e6";
      for (let i = 0; i < NB; i++) {
        let a = 0;
        if (fresh[i] > 0) {
          const f = fresh[i] / 0.35;
          a = 0.28 * f * f;
          fresh[i] -= dt;
        }
        if (glint[i] > 0) {
          a = Math.max(a, 0.55 * (glint[i] / 0.3));
          glint[i] -= dt;
        }
        if (a > 0.01) {
          const x = WX + (i % COLS) * BW;
          const y = WY + ((i / COLS) | 0) * BH;
          fc.globalAlpha = a;
          fc.fillRect(x + 1, y + 1, BW - 2, BH - 2);
        }
      }
      fc.globalAlpha = 1;

      // shards: lit by the ball they gleam in their full daylight glaze, even at night
      for (let j = 0; j < SH; j++) {
        if (shL[j] <= 0) continue;
        shL[j] -= dt;
        shVY[j] += 1500 * dt;
        shVX[j] += env.ax * 0.6 * dt;
        shX[j] += shVX[j] * dt;
        shY[j] += shVY[j] * dt;
        shA[j] += shVA[j] * dt;
        if (shY[j] > FLOOR - 4) {
          // lands on the horizon and lies there a moment
          shY[j] = FLOOR - 4;
          shVY[j] = 0;
          shVX[j] *= 0.5;
          shVA[j] = 0;
          shA[j] = 0;
          if (shL[j] > 0.6) shL[j] = 0.6;
        }
        const w = BW * shW[j];
        const cs = Math.cos(shA[j]);
        const sn = Math.sin(shA[j]);
        fc.setTransform(cs, sn, -sn, cs, shX[j], shY[j]);
        fc.globalAlpha = Math.min(1, shL[j] * 2.2);
        fc.fillStyle = colLit[shI[j]];
        fc.fillRect(-w / 2, -BH * 0.22, w, BH * 0.44);
      }
      fc.setTransform(1, 0, 0, 1, 0, 0);
      fc.globalAlpha = 1;
      // small particles
      for (let kd = 0; kd < 3; kd++) {
        let any = false;
        fc.beginPath();
        for (let i = 0; i < PT; i++) {
          if (ptL[i] <= 0 || ptK[i] !== kd) continue;
          if (kd === 0) {
            ptL[i] -= dt;
            ptVY[i] += 520 * dt;
          } else {
            ptL[i] -= dt;
            ptVY[i] += (kd === 1 ? 260 : 900) * dt;
          }
          ptX[i] += ptVX[i] * dt;
          ptY[i] += ptVY[i] * dt;
          const z = ptS[i] * Math.min(1, (ptL[i] / ptM[i]) * 2);
          if (z < 0.5) continue;
          any = true;
          fc.rect(ptX[i] - z / 2, ptY[i] - z / 2, z, z);
        }
        if (any) {
          fc.fillStyle = kd === 0 ? ink : kd === 1 ? snowCol : rainCol;
          fc.globalAlpha = kd === 2 ? 1 : 0.9;
          fc.fill();
        }
      }
      fc.globalAlpha = 1;

      // snow lying along the horizon, deeper the harder it comes down
      if (env.snow > 0.01) {
        const d = 3 + 9 * env.snow;
        fc.fillStyle = snowCol;
        fc.beginPath();
        for (let k = 0; k < 90; k++) {
          const h = Math.round(d * (0.55 + 0.45 * hash(k, 77)));
          fc.rect(k * 12, FLOOR - h, 12, h + 1);
        }
        fc.fill();
      }

      // the paddle
      {
        const x0 = pad.x - PAD_W / 2;
        fc.fillStyle = ink;
        fc.fillRect(x0 + 4, PAD_Y, PAD_W - 8, PAD_H);
        fc.fillRect(x0, PAD_Y + 4, PAD_W, PAD_H - 8);
        fc.fillStyle = "rgba(255,255,255,0.45)";
        fc.fillRect(x0 + 4, PAD_Y, PAD_W - 8, 2);
        fc.fillStyle = "rgba(74,60,36,0.3)";
        fc.fillRect(x0 + 4, PAD_Y + PAD_H - 3, PAD_W - 8, 3);
      }

      // the spare balls, lying on the floor in the corner
      fc.fillStyle = ink;
      fc.beginPath();
      for (let k = 0; k < spares; k++) {
        const x = WR - 16 - k * 24;
        fc.moveTo(x + 7, FLOOR - 8);
        fc.arc(x, FLOOR - 8, 7, 0, TAU);
      }
      fc.fill();

      // the balls and their trails: long and molten in heat, short and icy in cold
      const tl = Math.round(lerp(9, TRAIL, smoothstep(15, 96, s.weather.temp)));
      const glow = 0.25 + 0.75 * dark + env.fog * 0.6;
      fc.lineCap = "round";
      fc.lineJoin = "round";
      for (const b of balls) {
        if (b.state === 0 || b.state === 3) continue;
        const n = Math.min(b.tn, tl);
        if (b.state === 2 && n > 1) {
          // in eight bands, each one stroke, fading and thinning away from the ball
          fc.strokeStyle = trailCol;
          let px = b.x;
          let py = b.y;
          let k = 0;
          for (let g = 0; g < 8 && k < n; g++) {
            const end = Math.min(n, Math.ceil(((g + 1) * n) / 8));
            const a = 1 - (g + 0.5) / 8;
            fc.globalAlpha = 0.42 * a * a;
            fc.lineWidth = BR * 2 * (0.25 + 0.75 * a);
            fc.beginPath();
            fc.moveTo(px, py);
            for (; k < end; k++) {
              const j = ((b.th - 1 - k + TRAIL * 2) % TRAIL) * 2;
              px = b.trail[j];
              py = b.trail[j + 1];
              fc.lineTo(px, py);
            }
            fc.stroke();
          }
        }
        const hs = Math.min(190, 64 * (1.1 + glow * 1.6));
        fc.globalAlpha = Math.min(1, 0.1 + glow * 0.6);
        fc.drawImage(haloCanvas, b.x - hs, b.y - hs, hs * 2, hs * 2);
        fc.globalAlpha = b.state === 1 ? 0.85 : 1;
        fc.fillStyle = "#fffaf0";
        fc.beginPath();
        fc.arc(b.x, b.y, BR, 0, TAU);
        fc.fill();
        fc.globalAlpha = 1;
      }

      // ----- the readouts -----
      const tx = s.text;
      const amCh = put("ampm", ampmEl, tx.ampm);
      if (put("date", dateEl, tx.date) || amCh) fitText(dateEl, 928 - 48 - ampmEl.offsetWidth);
      const tch = put("temp", tempEl, tx.temp);
      if (tch && !/\d/.test(tx.temp)) {
        // no reading: the dash is set in the title face (Jersey's sits on the
        // floor), the degree sign stays the same as ever
        tempEl.textContent = "";
        tempEl.append(el("span", { class: "nd", text: tx.temp.slice(0, -1) }), tx.temp.slice(-1));
      }
      if (put("cond", condEl, tx.condition) || tch) fitText(condEl, 928 - 44 - tempEl.offsetWidth);
      put("sunK", sunC.k, tx.sunLabel);
      put("sunV", sunC.v, tx.sunValue);
      put("moon", moonC.v, tx.moon);
      put("aqi", airV, tx.aqi);
      put("uv", uvV, tx.uv);
      if (shown.factOn !== (tx.factValue !== "")) {
        shown.factOn = tx.factValue !== "";
        factEl.style.display = shown.factOn ? "block" : "none";
      }
      put("factK", factK, tx.factLabel);
      if (put("factV", factV, tx.factValue) && shown.factOn) {
        // two lines at most: step the size down if a long one would run to three
        let size = 50;
        factV.style.fontSize = `${size}px`;
        factV.style.lineHeight = `${Math.round(size * 1.24)}px`;
        while (size > 38 && factV.offsetHeight > size * 1.24 * 2 + 4) {
          size -= 2;
          factV.style.fontSize = `${size}px`;
          factV.style.lineHeight = `${Math.round(size * 1.24)}px`;
        }
      }
    }

    // Lay the wall and play the quarter hour so far now; the glaze is fired
    // and painted over the first few (unseen) frames, to keep mount() short.
    readEnv(state);
    rebuild(state);
    lastMs = state.ms;
    lastQ = Math.floor(state.ms / QUARTER);
    return { frame };
  },
};

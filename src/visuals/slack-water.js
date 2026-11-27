// Slack Water
//
// The time stands in the East River as a two-storey pier structure: the hours
// on the upper floor, the minutes on the deck, AM/PM beside them. Everything
// below the waterline is the river, carrying a reflection of the structure
// that is cut into about 150 horizontal strips and displaced row by row.
//
// What drives it:
//   tide        the waterline is the interpolated tide at Hunters Point (about
//               100 px between low and high water; it never reaches the deck).
//               The pilings keep a dark wet stain up to the last high water.
//               The tidal current carries the glints on the surface and trails
//               a wake off every pile: right (north) on the flood, left on the
//               ebb, and at slack water they stop.
//   wind        how broken the reflection is: a near mirror under 3 mph,
//               scattered dashes and whitecaps in a gale, with gusts crossing
//               as bands of rougher water. It also slants the rain and snow.
//   sky         the air is the measured west and north-west sky colour, the
//               water a darker version of it, the structure a single ink.
//   sun         lights the faces of the numerals (front faces in the morning,
//               flanks and tops at midday, silhouettes late in the day) and
//               lays a glitter path on the water when it is low in the west.
//   dark        when the sky behind the structure gets dark (dusk, or a black
//               storm) sodium floodlights on the deck warm up, rake up the
//               numerals and smear down the water.
//   weather     rain rings at the real rate, snow that settles on the deck and
//               on the numerals, fog that swallows the reflection first and
//               then the far shore, drifting ice below about 22 degrees, a
//               bleached, swimming horizon in a heat wave, and a brown haze
//               when the air quality is poor.
//
// Readouts hang from the structure: the date and today's fact are one column
// standing on the hours' cap line; temperature and condition in the upper
// storey's left flank and the sunrise/sunset countdown in its right, all on the
// hours' cap line; the moon stands level with the slab; AQI and UV hang from
// the minutes' cap line in the lower storey's left flank. Their ink is one of two (paper white or the structure's
// blue-black), chosen in one step from what is actually behind them; the sky
// colours are nudged out of the mid-grey band so twilight passes through it
// quickly.
//
// Layers, back to front: sky (CSS gradients), structure (SVG, so the type is
// drawn at the panel's full resolution), water (CSS gradient that moves with
// the tide), one canvas for everything that moves, then the readouts (DOM).
// The reflection is made from an offscreen copy of the structure, repainted
// when the minute or the light changes.

import { W, H, TAU, clamp, lerp, smoothstep, approach, rng, hash, createNoise, mix, adjust, rgba, luminance, contrast, el, svg, svgLayer, addStyle, canvas2d, grain, fitText } from "../lib/kit.js";

// ----- geometry (stage units) ---------------------------------------------
const CX = 540;
const CAP = 0.813; // cap height of Big Shoulders Display, in ems
const DIG_H = 360; // height of the numerals
const NUM_PX = Math.round(DIG_H / CAP);
const HOUR_BASE = 808; // the hours stand on the slab
const SLAB_H = 14;
const MIN_BASE = HOUR_BASE + SLAB_H + 8 + DIG_H; // the minutes stand on the deck and carry the slab
const DECK_H = 42;
const DECK_X0 = 92;
const DECK_X1 = 988;
const DECK_BOT = MIN_BASE + DECK_H;
const AMPM_PX = 108;
const EX = 14; // depth of the structure: back faces sit EX px left and EX/2 px up
const WL_HIGH = DECK_BOT + 34; // waterline at high water
const WL_LOW = DECK_BOT + 138; // and at low water
const SCENE_H = WL_LOW + 12;
const SX0 = 60; // the part of the scene that is reflected
const SW = 960;
const N_LO = 4; // floodlights on the deck (one more lights AM/PM) and on the slab
const N_UP = 3;
const NL = N_LO + 1 + N_UP;
const PILES = [];
for (let i = 0; i < 12; i++) PILES.push(Math.round(DECK_X0 + 36 + (i * (DECK_X1 - DECK_X0 - 72 - 14)) / 11));
const PILE_W = 14;

// readouts: the top band carries the date and the fact; the flanks of the upper
// storey carry the weather (left) and the sky (right), sharing the hours' cap
// line and baseline.
const HOUR_TOP = HOUR_BASE - DIG_H;
const FLANK_BASE = HOUR_BASE - 10; // the flanks' lowest baseline, level with the foot of the hours
const LB_PX = 26; // small labels (DM Mono caps)
const DATE_PX = 70;
const FACT_PX = 44, FACT_LH = 84, FACT_GAP = -2; // a wrapped fact keeps 40 px of air between its lines
const HEAD_GAP = 104; // clear air between the top band's ink and the hours' cap line
const HEAD_GAP2 = 80; // the same under a two-line fact, so the date keeps clear of the top edge
const TEMP_PX = 158;
const COND_PX = 44, COND_LH = 78;
const VAL_PX = 48, VAL_LH = 80;
const AIR_PX = 64; // AQI and UV, hung from the minutes' cap line
const MIN_TOP = MIN_BASE - DIG_H;
const SUN_PX = 74;
const INK_L = "#f4ecdc"; // the two inks: warm paper white, and the structure's blue-black
const INK_D = "#0a1018";

const NUM_FONT = `900 ${NUM_PX}px "Big Shoulders Display"`;
const AMPM_FONT = `900 ${AMPM_PX}px "Big Shoulders Display"`;

// Push a colour out of the mid-grey band (OKLab lightness 0.45..0.645, where
// neither a light nor a dark ink reaches 4.5:1) toward whichever side is nearer,
// keeping its hue. Outside the band colours are left exactly as measured.
const unGrey = (c) => adjust(c, { l: (L) => {
  if (L <= 0.45 || L >= 0.645) return L;
  const u = (L - 0.45) / 0.195;
  return 0.45 + 0.195 * (0.12 * u + 0.88 * smoothstep(0.4, 0.6, u));
} });

const cosd = (a) => Math.cos((a * Math.PI) / 180);
const sind = (a) => Math.sin((a * Math.PI) / 180);

const CSS = `
.sw { position: absolute; inset: 0; overflow: hidden; background: #05070b; color: #f4ecdc;
  font-family: "Big Shoulders Text", "Big Shoulders Display", "Arial Narrow", sans-serif; }
.sw-sky, .sw-swell, .sw-halo, .sw-veil { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }
.sw-swell { opacity: 0; background: radial-gradient(ellipse 900px 520px at 660px 300px, rgba(214,222,240,0.9), rgba(214,222,240,0) 70%); }
.sw-halo { opacity: 0; background:
  radial-gradient(ellipse 470px 330px at ${CX}px ${MIN_BASE + 10}px, rgba(255,166,64,0.50), rgba(255,150,50,0.16) 48%, rgba(255,150,50,0) 74%),
  radial-gradient(ellipse 380px 290px at ${CX}px ${HOUR_BASE + 6}px, rgba(255,166,64,0.36), rgba(255,150,50,0.10) 50%, rgba(255,150,50,0) 74%); }
.sw-water { position: absolute; left: 0; top: 0; width: ${W}px; height: 760px; will-change: transform; }
.sw .c-side { fill: var(--side); }
.sw .c-top { fill: var(--top); }
.sw .c-fasc { fill: var(--fasc); }
.sw .c-pile { fill: var(--pile); }
.sw .c-shore { fill: var(--shore); }
.sw .c-snow { fill: var(--snow); }
.sw .c-out { fill: none; stroke: var(--out); stroke-width: 2.5px; stroke-linejoin: round; }
.sw-r { position: absolute; margin: 0; }
.sw-flank { color: var(--ink-b); text-shadow: 0 0 26px var(--halo-b); }
.sw-flank2 { color: var(--ink-c); text-shadow: 0 0 26px var(--halo-c); }
.sw-lb { font: 500 ${LB_PX}px/${LB_PX + 6}px "DM Mono", ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.16em; white-space: nowrap; }
.sw-head { position: absolute; left: 64px; right: 64px; bottom: ${H - (HOUR_BASE - DIG_H - HEAD_GAP)}px; color: var(--ink-a); text-shadow: 0 0 26px var(--halo-a); }
.sw-date { font-weight: 800; font-size: ${DATE_PX}px; line-height: ${DATE_PX}px; text-transform: uppercase; letter-spacing: 0.015em; white-space: nowrap; }
.sw-date .md { font-weight: 500; margin-left: 0.28em; }
.sw-fact { }
.sw-fact .fv { font-weight: 700; font-size: ${FACT_PX}px; line-height: ${FACT_LH}px; margin-top: ${FACT_GAP}px; letter-spacing: 0.01em;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sw-temp { left: 60px; font: 900 ${TEMP_PX}px/${TEMP_PX}px "Big Shoulders Display", sans-serif; white-space: nowrap; }
.sw-cond { left: 64px; font-weight: 700; font-size: ${COND_PX}px; line-height: ${COND_LH}px; text-transform: uppercase; letter-spacing: 0.03em; }
.sw-air { left: 64px; display: flex; gap: 48px; font-weight: 800; font-size: ${AIR_PX}px; white-space: nowrap; }
.sw-air .vl { line-height: 1; margin-top: 18px; }
.sw-sun { right: 64px; text-align: right; }
.sw-sun .vl { margin-top: 14px; font-weight: 800; font-size: ${SUN_PX}px; line-height: ${SUN_PX}px; text-transform: uppercase; white-space: nowrap; letter-spacing: 0.01em; }
.sw-moon { right: 64px; text-align: right; }
.sw-moon .vl { margin-top: -1px; font-weight: 800; font-size: ${VAL_PX}px; line-height: ${VAL_LH}px; text-transform: uppercase; letter-spacing: 0.02em; }
`;

export default {
  title: "Slack Water",
  description: "The time stands in the East River as a two-storey pier while the real tide, wind and current work on its reflection.",
  fonts: ["Big Shoulders Display:wght@900", "Big Shoulders Text:wght@500;700;800", "DM Mono:wght@500"],
  fps: 30,

  mount(root, { seed }) {
    addStyle(root, CSS);
    const wrap = el("div", { class: "sw" });
    root.append(wrap);
    const r0 = rng(seed);
    const noise = createNoise(seed);

    // ----- layers -----------------------------------------------------------
    const skyDiv = el("div", { class: "sw-sky" });
    const swell = el("div", { class: "sw-swell" });
    const halo = el("div", { class: "sw-halo" });
    wrap.append(skyDiv, swell, halo);
    const art = svgLayer(wrap);
    const veil = el("div", { class: "sw-veil" });
    const water = el("div", { class: "sw-water" });
    wrap.append(veil, water);
    const fx = canvas2d(wrap, { adaptive: true });

    // ----- the structure, in SVG ---------------------------------------------
    const defs = svg("defs");
    // (presentation attributes, not CSS classes: these are drawn through <use>)
    const numAttrs = { "font-family": '"Big Shoulders Display", "Arial Narrow", sans-serif', "font-weight": 900 };
    const hT = svg("text", { id: "sw-h", x: CX, y: HOUR_BASE, "font-size": NUM_PX, "text-anchor": "middle", ...numAttrs });
    const mT = svg("text", { id: "sw-m", x: CX, y: MIN_BASE, "font-size": NUM_PX, "text-anchor": "middle", ...numAttrs });
    const aT = svg("text", { id: "sw-a", x: 800, y: MIN_BASE, "font-size": AMPM_PX, "text-anchor": "start", ...numAttrs });
    defs.append(hT, mT, aT);
    const faceGrad = (id, base, h) => {
      const g = svg("linearGradient", { id, gradientUnits: "userSpaceOnUse", x1: 0, y1: base, x2: 0, y2: base - h });
      g.append(
        svg("stop", { offset: 0, style: "stop-color: var(--f0)" }),
        svg("stop", { offset: 0.45, style: "stop-color: var(--f1)" }),
        svg("stop", { offset: 1, style: "stop-color: var(--f2)" }),
      );
      return g;
    };
    defs.append(faceGrad("sw-gh", HOUR_BASE, DIG_H), faceGrad("sw-gm", MIN_BASE, DIG_H), faceGrad("sw-ga", MIN_BASE, AMPM_PX * CAP));
    // One fan of floodlight per lamp: a tall radial gradient rising from the lamp.
    const fans = [];
    const fanGrad = (id) => {
      const g = svg("radialGradient", { id, gradientUnits: "userSpaceOnUse", cx: 0, cy: 0, r: 1 });
      fans.push(g);
      g.append(
        svg("stop", { offset: 0, "stop-color": "#fff3cf", "stop-opacity": 1 }),
        svg("stop", { offset: 0.3, "stop-color": "#ffcf7d", "stop-opacity": 0.72 }),
        svg("stop", { offset: 0.65, "stop-color": "#ffb24a", "stop-opacity": 0.28 }),
        svg("stop", { offset: 1, "stop-color": "#ffa63a", "stop-opacity": 0 }),
      );
      return g;
    };
    for (let k = 0; k < NL; k++) defs.append(fanGrad(`sw-f${k}`));
    const wetGrad = svg("linearGradient", { id: "sw-wet", x1: 0, y1: 0, x2: 0, y2: 1 },
      svg("stop", { offset: 0, style: "stop-color: var(--wet); stop-opacity: 0" }),
      svg("stop", { offset: 0.12, style: "stop-color: var(--wet); stop-opacity: 1" }),
      svg("stop", { offset: 1, style: "stop-color: var(--wet); stop-opacity: 1" }));
    const deckGlow = svg("linearGradient", { id: "sw-dg", gradientUnits: "userSpaceOnUse", x1: DECK_X0, y1: 0, x2: DECK_X1, y2: 0 },
      svg("stop", { offset: 0, "stop-color": "#ffb85a", "stop-opacity": 0 }),
      svg("stop", { offset: 0.22, "stop-color": "#ffb85a", "stop-opacity": 0.5 }),
      svg("stop", { offset: 0.5, "stop-color": "#ffd28a", "stop-opacity": 0.95 }),
      svg("stop", { offset: 0.8, "stop-color": "#ffb85a", "stop-opacity": 0.6 }),
      svg("stop", { offset: 1, "stop-color": "#ffb85a", "stop-opacity": 0 }));
    defs.append(wetGrad, deckGlow);
    art.append(defs);

    // far shore: a low line of flat silhouettes on the horizon, with pin lights at night
    const shoreG = svg("g");
    const shoreLights = svg("g", { opacity: 0 });
    const SHORE_LX = [];
    {
      const rs = rng(4107);
      let d = `M-20 0H${W + 20}V-5H-20Z`;
      for (let i = 0; i < 64; i++) {
        const x = rs.range(-10, W);
        const mid = Math.exp(-(((x - 400) / 230) ** 2));
        const w = rs.range(10, 46);
        const h = Math.round(rs.range(6, 12) + mid * rs.range(0, 20) * (rs.chance(0.5) ? 1 : 0.3));
        d += `M${x.toFixed(0)} 0h${w.toFixed(0)}v${-h}h${-w.toFixed(0)}Z`;
        const n = rs.int(0, 2);
        for (let k = 0; k < n; k++) {
          const lx = x + rs.range(2, w - 2);
          const ly = -rs.range(2, h - 1);
          shoreLights.append(svg("rect", { x: lx.toFixed(1), y: ly.toFixed(1), width: 2, height: 2, fill: rs.chance(0.75) ? "#ffcf8f" : "#dfe8ff", opacity: rs.range(0.5, 1).toFixed(2) }));
          SHORE_LX.push(lx);
        }
      }
      shoreG.append(svg("path", { d, class: "c-shore" }), shoreLights);
    }
    art.append(shoreG);

    // pilings, with the wet stain
    const wetRects = [];
    const pileG = svg("g");
    for (const x of PILES) {
      pileG.append(svg("rect", { x, y: DECK_BOT - 2, width: PILE_W, height: SCENE_H - DECK_BOT + 10, class: "c-pile" }));
      pileG.append(svg("rect", { x, y: DECK_BOT - 2, width: 3, height: SCENE_H - DECK_BOT + 10, class: "c-top", opacity: 0.55 }));
      const wr = svg("rect", { x, y: WL_HIGH - 10, width: PILE_W, height: SCENE_H - WL_HIGH + 20, fill: "url(#sw-wet)" });
      wetRects.push(wr);
      pileG.append(wr);
    }
    art.append(pileG);

    // a slab seen slightly from the left and above: left face, top face, front face
    const slabParts = (y, h, g) => {
      const side = svg("polygon", { class: "c-side" }), top = svg("polygon", { class: "c-top" }), front = svg("polygon", { class: "c-fasc" });
      g.append(side, top, front);
      return (x0, x1) => {
        side.setAttribute("points", `${x0},${y} ${x0 - EX},${y - EX / 2} ${x0 - EX},${y + h - EX / 2} ${x0},${y + h}`);
        top.setAttribute("points", `${x0},${y} ${x1},${y} ${x1 - EX},${y - EX / 2} ${x0 - EX},${y - EX / 2}`);
        front.setAttribute("points", `${x0},${y} ${x1},${y} ${x1},${y + h} ${x0},${y + h}`);
      };
    };
    // deck
    const deckG = svg("g");
    slabParts(MIN_BASE, DECK_H, deckG)(DECK_X0, DECK_X1);
    const deckSnow = svg("path", { class: "c-snow" });
    const deckLit = svg("polygon", { points: `${DECK_X0},${MIN_BASE} ${DECK_X1},${MIN_BASE} ${DECK_X1 - EX},${MIN_BASE - EX / 2} ${DECK_X0 - EX},${MIN_BASE - EX / 2}`, fill: "url(#sw-dg)", opacity: 0 });
    deckG.append(deckLit, deckSnow);
    art.append(deckG);

    // numerals: back faces (extrusion), front face, floodlight fans
    const extrude = (ref, depth, g) => {
      for (let j = depth; j >= 1; j--) g.append(svg("use", { href: `#${ref}`, transform: `translate(${-j} ${-j / 2})`, class: "c-side" }));
    };
    const minG = svg("g");
    extrude("sw-m", EX, minG);
    extrude("sw-a", 8, minG);
    minG.append(svg("use", { href: "#sw-m", fill: "url(#sw-gm)" }), svg("use", { href: "#sw-a", fill: "url(#sw-ga)" }));
    const minFans = svg("g", { opacity: 0 });
    for (let k = 0; k < N_LO; k++) minFans.append(svg("use", { href: "#sw-m", fill: `url(#sw-f${k})` }));
    minFans.append(svg("use", { href: "#sw-a", fill: `url(#sw-f${N_LO})` }));
    minG.append(minFans, svg("use", { href: "#sw-m", class: "c-out" }), svg("use", { href: "#sw-a", class: "c-out" }));
    art.append(minG);

    // the slab the hours stand on (the minutes carry it)
    const slabG = svg("g");
    const setSlab = slabParts(HOUR_BASE, SLAB_H, slabG);
    const slabSnow = svg("path", { class: "c-snow" });
    slabG.append(slabSnow);
    art.append(slabG);

    const hourG = svg("g");
    extrude("sw-h", EX, hourG);
    hourG.append(svg("use", { href: "#sw-h", fill: "url(#sw-gh)" }));
    const hourFans = svg("g", { opacity: 0 });
    for (let k = 0; k < N_UP; k++) hourFans.append(svg("use", { href: "#sw-h", fill: `url(#sw-f${N_LO + 1 + k})` }));
    hourG.append(hourFans, svg("use", { href: "#sw-h", class: "c-out" }));
    art.append(hourG);

    const capSnow = svg("path", { class: "c-snow" });
    art.append(capSnow);

    // lamp fixtures: small hot dots along the front edges
    const lampDots = svg("g", { opacity: 0 });
    const LAMP_X = new Float32Array(NL);
    const LAMP_Y = new Float32Array(NL);
    const dots = [];
    for (let k = 0; k < NL; k++) {
      LAMP_Y[k] = k <= N_LO ? MIN_BASE + 7 : HOUR_BASE + 6;
      const a = svg("ellipse", { cy: LAMP_Y[k], rx: 15, ry: 7, fill: "#ffb347", opacity: 0.45 });
      const b = svg("ellipse", { cy: LAMP_Y[k], rx: 7, ry: 3.6, fill: "#fff4d6" });
      dots.push(a, b);
      lampDots.append(a, b);
    }
    art.append(lampDots);

    // The widths of the numerals set the slab, the lamps and where AM/PM stands.
    let slabX0 = CX - 250, slabX1 = CX + 250, ampmX = 800, flankL = 260, flankR = 260, airW = 240;
    const meter = document.createElement("canvas").getContext("2d");
    function layout(s) {
      meter.font = NUM_FONT;
      const wh = meter.measureText(s.text.hh).width, wm = meter.measureText(s.text.mm).width;
      const half = Math.max(wh, wm) / 2 + 20;
      slabX0 = Math.round(CX - half); slabX1 = Math.round(CX + half);
      setSlab(slabX0, slabX1);
      ampmX = Math.round(CX + wm / 2 + 26);
      // the flanks of the upper storey hold the readouts: as wide as the hours allow
      flankL = Math.floor(CX - wh / 2 - EX - 48 - 64);
      flankR = Math.floor(W - 64 - (CX + wh / 2 + 48));
      for (const n of [nTemp, nCond]) n.style.width = `${flankL}px`;
      nSun.style.width = `${flankR}px`;
      // the moon stands level with the slab, so it keeps clear of the slab's end;
      // AQI and UV hang in the lower storey's left flank, clear of the minutes
      nMoon.style.width = `${Math.min(flankR, Math.floor(W - 64 - (slabX1 + 48)))}px`;
      airW = Math.floor(CX - wm / 2 - EX - 48 - 64);
      shown.temp = shown.sunV = shown.aqi = null; // refit on the next write
      aT.setAttribute("x", ampmX);
      meter.font = AMPM_FONT;
      const wa = meter.measureText(s.text.ampm).width;
      for (let k = 0; k < NL; k++) {
        const up = k > N_LO, am = k === N_LO;
        LAMP_X[k] = am ? ampmX + wa / 2 : up ? CX + wh * 0.3 * (k - N_LO - 2) * (wh > 300 ? 1 : 0.8) : CX + wm * 0.25 * (k - 1.5);
        dots[k * 2].setAttribute("cx", LAMP_X[k]); dots[k * 2 + 1].setAttribute("cx", LAMP_X[k]);
        fans[k].setAttribute("gradientTransform", `translate(${LAMP_X[k]} ${LAMP_Y[k] + 2}) scale(${am ? 90 : 114} ${am ? 124 : 352})`);
      }
    }

    // ----- readouts (DOM, in the sky) ------------------------------------------
    // Top band: the date, then today's fact. Left flank of the upper storey:
    // temperature on the hours' cap line, the condition under it. Right flank:
    // the sunrise/sunset countdown on the cap line, the moon on the baseline.
    // Left flank of the lower storey: AQI and UV on the minutes' cap line.
    const nWk = el("span", { class: "wk" });
    const nMd = el("span", { class: "md" });
    const nDate = el("div", { class: "sw-date" }, nWk, nMd);
    const nFl = el("div", { class: "sw-lb" });
    const nFv = el("div", { class: "fv" });
    const nFact = el("div", { class: "sw-fact" }, nFl, nFv);
    const nHead = el("div", { class: "sw-head" }, nDate, nFact);
    const nTemp = el("div", { class: "sw-r sw-flank sw-temp" });
    const nCond = el("div", { class: "sw-r sw-flank sw-cond" });
    const nAqi = el("div", { class: "vl" });
    const nUv = el("div", { class: "vl" });
    const nAir = el("div", { class: "sw-r sw-flank2 sw-air" },
      el("div", {}, el("div", { class: "sw-lb", text: "AQI" }), nAqi),
      el("div", {}, el("div", { class: "sw-lb", text: "UV" }), nUv));
    const nSunL = el("div", { class: "sw-lb" });
    const nSunV = el("div", { class: "vl" });
    const nSun = el("div", { class: "sw-r sw-flank sw-sun" }, nSunL, nSunV);
    const nMoonV = el("div", { class: "vl" });
    const nMoon = el("div", { class: "sw-r sw-flank sw-moon" }, el("div", { class: "sw-lb", text: "Moon" }), nMoonV);
    wrap.append(nHead, nTemp, nCond, nAir, nSun, nMoon);
    grain(wrap, { opacity: 0.05 });

    // Place every line by its baseline, from the fonts' own metrics (once).
    let factOff = 0, dateOff = 0; // from the bottom of the fact's (or the date's) line box up to its lowest ink
    {
      const m = document.createElement("canvas").getContext("2d");
      const metric = (font, lh) => { // offset from the top of a line box to its baseline, and the cap height
        m.font = font;
        const q = m.measureText("H08");
        return { base: (lh - (q.fontBoundingBoxAscent + q.fontBoundingBoxDescent)) / 2 + q.fontBoundingBoxAscent, cap: q.actualBoundingBoxAscent };
      };
      const TXT = '"Big Shoulders Text"';
      const lb = metric(`500 ${LB_PX}px "DM Mono"`, LB_PX + 6);
      const dt = metric(`800 ${DATE_PX}px ${TXT}`, DATE_PX);
      const tp = metric(`900 ${TEMP_PX}px "Big Shoulders Display"`, TEMP_PX);
      const cd = metric(`700 ${COND_PX}px ${TXT}`, COND_LH);
      const vw = metric(`800 ${VAL_PX}px ${TXT}`, VAL_LH);
      const fv = metric(`700 ${FACT_PX}px ${TXT}`, FACT_LH);
      m.font = `700 ${FACT_PX}px ${TXT}`;
      factOff = FACT_LH - fv.base - m.measureText("gjpqy,").actualBoundingBoxDescent;
      dateOff = DATE_PX - dt.base;
      const px = (v) => `${Math.round(v)}px`;
      // top band: one column standing on the hours' cap line (it grows upward
      // with a two-line fact, and the date settles onto it when there is none);
      // 66 px of air between the date's baseline and the fact label's caps
      nFact.style.marginTop = px(66 - (DATE_PX - dt.base) - (lb.base - lb.cap));
      // left flank
      const tempBase = HOUR_TOP + tp.cap;
      nTemp.style.top = px(tempBase - tp.base);
      nCond.style.top = px(tempBase + 52 + cd.cap - cd.base);
      nAir.style.top = px(MIN_TOP + lb.cap - lb.base);
      // right flank
      const sunLbBase = HOUR_TOP + lb.cap;
      nSun.style.top = px(sunLbBase - lb.base);
      nMoon.style.bottom = px(H - (FLANK_BASE + (VAL_LH - vw.base)));
    }

    const shown = {};
    const put = (key, node, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };
    const setVar = (name, value) => {
      if (shown[name] === value) return;
      shown[name] = value;
      wrap.style.setProperty(name, value);
    };
    const setAttr = (key, node, name, value) => {
      if (shown[key] === value) return;
      shown[key] = value;
      node.setAttribute(name, value);
    };
    const setStyle = (key, node, prop, value) => {
      if (shown[key] === value) return;
      shown[key] = value;
      node.style[prop] = value;
    };

    // ----- the offscreen scene the reflection is cut from -----------------------
    const scene = document.createElement("canvas");
    scene.width = W;
    scene.height = SCENE_H;
    const sctx = scene.getContext("2d");
    // a half-size raster of the numerals, to find where snow can settle
    const probe = document.createElement("canvas");
    probe.width = W / 2;
    probe.height = Math.ceil((MIN_BASE + 10) / 2);
    const pctx = probe.getContext("2d", { willReadFrequently: true });

    // ----- water: strips, glints, rings, floes ----------------------------------
    const NS = 150;
    const SD = new Float32Array(NS); // depth of the strip's top below the waterline
    const SH = new Float32Array(NS); // its height (they grow toward the viewer)
    const SU = new Float32Array(NS); // warped depth: waves look longer up close
    const OFF = new Float32Array(NS);
    const JY = new Float32Array(NS);
    const AL = new Float32Array(NS);
    const RGH = new Float32Array(NS);
    {
      let d = 0;
      for (let i = 0; i < NS; i++) {
        const h = 1.6 + 6.3 * Math.pow(i / (NS - 1), 1.25);
        SD[i] = d; SH[i] = h; SU[i] = Math.log(1 + d / 70);
        d += h;
      }
    }
    const stripAt = (d) => { // index of the strip at depth d
      let lo = 0, hi = NS - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (SD[m] <= d) lo = m; else hi = m - 1; }
      return lo;
    };

    const NG = 420; // glints
    const GX = new Float32Array(NG), GP = new Float32Array(NG), GS = new Float32Array(NG), GL = new Float32Array(NG);
    const GI = new Uint16Array(NG);
    for (let g = 0; g < NG; g++) {
      GX[g] = r0(); GI[g] = stripAt(Math.pow(r0(), 1.5) * 650); GP[g] = r0() * TAU; GS[g] = r0.range(0.35, 1.1) * r0.sign(); GL[g] = r0.range(0.5, 1.6);
    }
    const NGL = 300; // glitter under the sun or moon
    const GLX = new Float32Array(NGL), GLP = new Float32Array(NGL), GLS = new Float32Array(NGL), GLW = new Float32Array(NGL);
    const GLI = new Uint16Array(NGL);
    for (let g = 0; g < NGL; g++) {
      GLX[g] = clamp(r0.gauss() * 0.5, -1.4, 1.4); GLI[g] = r0.int(0, NS - 1); GLP[g] = r0() * TAU; GLS[g] = r0.range(0.8, 2.2) * r0.sign(); GLW[g] = r0.range(0.4, 1.5);
    }
    // lamp streaks: per lamp and strip, a fixed jitter, width and phase
    const HK1 = new Float32Array(NL * NS), HK2 = new Float32Array(NL * NS), HK3 = new Float32Array(NL * NS);
    for (let q = 0; q < NL * NS; q++) { HK1[q] = r0(); HK2[q] = r0(); HK3[q] = r0(); }
    const HB = new Uint8Array(NL * NS); // which tone each dash is drawn in, this frame
    const NSL = SHORE_LX.length;
    const SLK = new Float32Array(NSL * 16);
    for (let q = 0; q < SLK.length; q++) SLK[q] = r0();

    const NR = 200; // rain rings
    const RX = new Float32Array(NR), RD = new Float32Array(NR), RA = new Float32Array(NR).fill(-1), RL = new Float32Array(NR);
    let ringNext = 0, ringAcc = 0;
    const rr = rng(seed + 11);
    const spawnRing = (age) => {
      const k = ringNext; ringNext = (ringNext + 1) % NR;
      RX[k] = rr.range(-20, W + 20); RD[k] = 6 + Math.pow(rr(), 1.35) * 640; RA[k] = age; RL[k] = rr.range(1.1, 1.9);
    };

    const NF = 40; // ice floes
    const FX = new Float32Array(NF), FD = new Float32Array(NF), FS = new Float32Array(NF), FP = new Float32Array(NF);
    const FV = new Float32Array(NF * 14); // 7 vertices each, unit shape
    for (let f = 0; f < NF; f++) {
      FX[f] = r0(); FD[f] = 24 + Math.pow(r0(), 1.2) * 600; FS[f] = r0.range(0.55, 1.5); FP[f] = r0() * TAU;
      for (let v = 0; v < 7; v++) {
        const a = (v / 7) * TAU + r0.range(-0.25, 0.25);
        const rad = r0.range(0.72, 1.08);
        FV[f * 14 + v * 2] = Math.cos(a) * rad; FV[f * 14 + v * 2 + 1] = Math.sin(a) * rad;
      }
    }

    const NP = 700; // rain or snow in the air
    const PX = new Float32Array(NP), PY = new Float32Array(NP), PV = new Float32Array(NP), PS = new Float32Array(NP), PH = new Float32Array(NP);
    for (let p = 0; p < NP; p++) { PX[p] = r0() * (W + 400) - 200; PY[p] = r0() * 1400; PV[p] = r0.range(0.65, 1.3); PS[p] = r0.range(0.6, 1.5); PH[p] = r0() * TAU; }

    // ----- state carried between frames -----------------------------------------
    const P = { stk: ["", "", ""], gl: ["", "", ""] }; // palette: colours as strings, ready to use
    let first = true;
    let lastMs = 0, lastSec = -1;
    let lamp = 0, lampT = 0, lampQ = -1;
    let WL = (WL_HIGH + WL_LOW) / 2;
    let haze = 0, direct = 0, night = 0;
    let driftX = 0;
    let sceneKey = "", sceneDue = -1, lastPaint = -1, snowDepth = 0, snowKey = "", capsKey = "";
    let glitX = -999, glitK = 0, glitDp = 0;
    let cold = 0, hot = 0, swLast = -1;
    const caps = []; // snow caps on the numerals: flat arrays [x, yTop, thickness, ...] per run

    // ----- snow caps: where the numerals' upward-facing edges are -----------------
    function findCaps(s) {
      caps.length = 0;
      if (snowDepth < 1) return;
      const pw = probe.width, ph = probe.height;
      pctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
      pctx.clearRect(0, 0, W, ph * 2);
      pctx.fillStyle = "#fff";
      pctx.textBaseline = "alphabetic";
      pctx.textAlign = "center"; pctx.font = NUM_FONT;
      pctx.fillText(s.text.hh, CX, HOUR_BASE); pctx.fillText(s.text.mm, CX, MIN_BASE);
      pctx.textAlign = "left"; pctx.font = AMPM_FONT;
      pctx.fillText(s.text.ampm, ampmX, MIN_BASE);
      const px = pctx.getImageData(0, 0, pw, ph).data;
      const bands = [[HOUR_BASE - DIG_H - 12, HOUR_BASE - 40, 1], [MIN_BASE - DIG_H - 4, MIN_BASE - 150, 0.5], [MIN_BASE - AMPM_PX * CAP - 8, MIN_BASE - 30, 0.8]];
      for (let b = 0; b < bands.length; b++) {
        const y0 = Math.floor(bands[b][0] / 2), y1 = Math.floor(bands[b][1] / 2);
        const xa = b === 2 ? Math.floor(ampmX / 2) - 2 : Math.floor((CX - 300) / 2);
        const xb = b === 2 ? Math.floor((ampmX + 170) / 2) : b === 1 ? Math.floor((ampmX - 14) / 2) : Math.floor((CX + 300) / 2);
        let run = null, prev = -1;
        for (let x = xa; x <= xb; x++) {
          let top = -1;
          for (let y = y0; y < y1; y++) if (px[(y * pw + x) * 4 + 3] > 128) { top = y; break; }
          if (top >= 0 && (prev < 0 || Math.abs(top - prev) <= 3)) {
            if (!run) { run = []; caps.push(run); }
            run.push(x * 2, top * 2, bands[b][2]);
          } else if (top >= 0) {
            run = [x * 2, top * 2, bands[b][2]];
            caps.push(run);
          } else run = null;
          prev = top;
        }
      }
    }
    // thickness of the cap at point k of a run: thin at the ends and on slopes
    const capT = (run, k) => {
      const n = run.length / 3;
      const edge = Math.min(1, (Math.min(k, n - 1 - k) + 0.6) / 5);
      const a = Math.max(0, k - 2), b = Math.min(n - 1, k + 2);
      const slope = Math.abs(run[b * 3 + 1] - run[a * 3 + 1]) / Math.max(1, (b - a) * 2);
      return snowDepth * run[k * 3 + 2] * Math.sqrt(edge) * clamp(1.15 - slope * 1.1, 0.12, 1);
    };
    function capPath() {
      let d = "";
      for (const run of caps) {
        const n = run.length / 3;
        if (n < 4) continue;
        d += `M${run[0] - 1} ${run[1] + 2}`;
        for (let k = 0; k < n; k++) d += `L${run[k * 3]} ${(run[k * 3 + 1] - capT(run, k)).toFixed(1)}`;
        d += `L${run[(n - 1) * 3] + 1} ${run[(n - 1) * 3 + 1] + 2}`;
        for (let k = n - 1; k >= 0; k--) d += `L${run[k * 3]} ${run[k * 3 + 1] + 2}`;
        d += "Z";
      }
      return d;
    }
    const lipPath = (x0, x1, y, t) => (t < 1 ? "" :
      `M${x0 - EX} ${y - EX / 2}L${x1 - EX} ${y - EX / 2}L${x1} ${y}L${x1} ${y + t * 0.35}L${x0} ${y + t * 0.35}L${x0 - EX} ${y - EX / 2 + t * 0.35}Z` +
      `M${x0 - EX + 4} ${y - EX / 2}Q${x0 - EX + 4} ${y - EX / 2 - t} ${x0 - EX + 4 + t * 2} ${y - EX / 2 - t}L${x1 - EX - t * 2} ${y - EX / 2 - t}Q${x1 - EX} ${y - EX / 2 - t} ${x1 - EX} ${y - EX / 2}Z`);

    // ----- paint the offscreen scene ----------------------------------------------
    function paintScene(s) {
      const c = sctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = 1;
      c.clearRect(0, 0, W, SCENE_H);
      c.textBaseline = "alphabetic";
      const face = (base, h) => {
        const g = c.createLinearGradient(0, base, 0, base - h);
        g.addColorStop(0, P.f0); g.addColorStop(0.45, P.f1); g.addColorStop(1, P.f2);
        return g;
      };
      const text = (str, x, base, font, align, depth, h) => {
        c.font = font; c.textAlign = align;
        c.fillStyle = P.side;
        for (let j = depth; j >= 2; j -= 3) c.fillText(str, x - j, base - j / 2);
        c.fillStyle = face(base, h);
        c.fillText(str, x, base);
      };
      text(s.text.hh, CX, HOUR_BASE, NUM_FONT, "center", EX, DIG_H);
      text(s.text.mm, CX, MIN_BASE, NUM_FONT, "center", EX, DIG_H);
      text(s.text.ampm, ampmX, MIN_BASE, AMPM_FONT, "left", 8, AMPM_PX * CAP);
      if (lamp > 0.01) { // the fans of floodlight, only where there is something to light
        c.globalCompositeOperation = "source-atop";
        c.globalAlpha = lamp;
        for (let k = 0; k < NL; k++) {
          const up = k > N_LO, am = k === N_LO;
          const rx = am ? 90 : 114, ry = am ? 124 : 352;
          c.save();
          c.translate(LAMP_X[k], LAMP_Y[k]);
          c.scale(rx, ry);
          const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
          g.addColorStop(0, "rgba(255,243,207,1)"); g.addColorStop(0.3, "rgba(255,207,125,0.72)"); g.addColorStop(0.65, "rgba(255,178,74,0.28)"); g.addColorStop(1, "rgba(255,166,58,0)");
          c.fillStyle = g;
          const y0 = up ? HOUR_BASE - DIG_H - 10 : MIN_BASE - DIG_H - 10;
          c.fillRect(-1, (y0 - LAMP_Y[k]) / ry, 2, (LAMP_Y[k] - y0) / ry);
          c.restore();
        }
        c.globalAlpha = 1;
        c.globalCompositeOperation = "source-over";
      }
      if (snowDepth >= 1) {
        c.fillStyle = P.snow;
        c.beginPath();
        for (const run of caps) {
          const n = run.length / 3;
          if (n < 4) continue;
          c.moveTo(run[0], run[1] + 2);
          for (let k = 0; k < n; k++) c.lineTo(run[k * 3], run[k * 3 + 1] - capT(run, k));
          for (let k = n - 1; k >= 0; k--) c.lineTo(run[k * 3], run[k * 3 + 1] + 2);
          c.closePath();
        }
        c.fill();
      }
      // everything else goes behind the numerals
      c.globalCompositeOperation = "destination-over";
      const slab = (x0, x1, y, h, lit) => {
        if (snowDepth >= 1) { c.fillStyle = P.snow; c.fillRect(x0 - EX, y - EX / 2 - snowDepth, x1 - x0, snowDepth + EX / 2); }
        c.fillStyle = P.fasc; c.fillRect(x0, y, x1 - x0, h);
        if (lit > 0.01) {
          c.fillStyle = `rgba(255,190,100,${(0.8 * lit).toFixed(3)})`;
          c.fillRect(slabX0, y - EX / 2, slabX1 - slabX0 - EX, EX / 2);
        }
        c.fillStyle = P.top;
        c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.lineTo(x1 - EX, y - EX / 2); c.lineTo(x0 - EX, y - EX / 2); c.closePath(); c.fill();
        c.fillStyle = P.side;
        c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 - EX, y - EX / 2); c.lineTo(x0 - EX, y + h - EX / 2); c.lineTo(x0, y + h); c.closePath(); c.fill();
      };
      slab(slabX0, slabX1, HOUR_BASE, SLAB_H, lamp * 0.6);
      slab(DECK_X0, DECK_X1, MIN_BASE, DECK_H, lamp);
      c.fillStyle = P.pile;
      for (const x of PILES) c.fillRect(x, DECK_BOT - 2, PILE_W, SCENE_H - DECK_BOT + 2);
      c.globalCompositeOperation = "source-over";
      if (lamp > 0.01) {
        c.globalAlpha = lamp;
        c.fillStyle = "#fff0cc";
        c.beginPath();
        for (let k = 0; k < NL; k++) { c.moveTo(LAMP_X[k] + 9, LAMP_Y[k]); c.ellipse(LAMP_X[k], LAMP_Y[k], 9, 4.5, 0, 0, TAU); }
        c.fill();
        c.globalAlpha = 1;
      }
    }

    // ----- once a second: read the conditions, set the palette -----------------------
    function slow(s) {
      const wx = s.weather, sk = s.sky, dl = s.daylight;
      const cloud = clamp(wx.cloud / 100);
      haze = Math.pow(clamp((4 - wx.visibility) / 3.8), 1.2) * (wx.falling === "snow" ? 0.55 : 1);
      if (wx.fog) haze = Math.max(haze, 0.92);
      // heat bleaches the horizon and makes it swim; bad air shows as a brown haze
      hot = smoothstep(85, 97, wx.temp) * (wx.falling ? 0 : 1);
      const smog = smoothstep(90, 190, Number(wx.aqi) || 0);
      haze = Math.max(haze, 0.22 * smog);
      night = 1 - smoothstep(0.05, 0.45, dl);
      const sunUp = smoothstep(-1.5, 7, s.sun.alt);
      direct = sunUp * (1 - Math.pow(cloud, 1.6)) * (1 - 0.8 * haze) * (wx.falling ? 0.3 : 1);
      const warm = smoothstep(30, 3, s.sun.alt);
      const sunCol = mix("#fff4de", "#ffa95c", warm);
      const frontLit = direct * cosd(s.sun.alt) * Math.max(0, cosd(s.sun.az - 90));
      const sideLit = direct * clamp(0.8 * sind(Math.max(0, s.sun.alt)) + cosd(s.sun.alt) * Math.max(0, cosd(s.sun.az - 180)));
      const moonLight = s.moon.up ? s.moon.illumination * smoothstep(0, 12, s.moon.alt) * (1 - cloud) * night : 0;
      cold = smoothstep(24, 16, wx.temp);

      // sky: the measured west and north-west colours, nudged out of the mid-grey
      // band so that dusk and dawn pass through it quickly (there, no ink reads)
      const skW = unGrey(sk.west), skN = unGrey(sk.northWest);
      const skyMid = mix(skW, skN, 0.5);
      const zen = mix("#01030a", adjust(skyMid, { l: (l) => l * 0.74, c: (c) => c * 1.3 }), smoothstep(0, 0.6, dl));
      const zenA = lerp(0.5, 0.62, dl) * (1 - 0.6 * haze) * (1 - 0.45 * hot);
      let hzCol = mix("#6a5238", mix(skyMid, "#ffffff", 0.5), smoothstep(0.05, 0.5, dl));
      const hzA = clamp(lerp(0.2, 0.46 - 0.22 * cloud, smoothstep(0.05, 0.5, dl)) * (1 - 0.7 * haze) + (0.3 * hot + 0.25 * smog) * dl);
      hzCol = mix(mix(hzCol, "#f3ead6", 0.55 * hot * dl), "#b89c74", 0.45 * smog * dl);
      // a low sun behind the river warms the horizon and rims the structure
      const backLit = direct * warm * Math.max(0, cosd(s.sun.az - 270));
      hzCol = mix(hzCol, sunCol, 0.55 * backLit);
      P.mirage = rgba(mix(hzCol, "#ffffff", 0.35), 0.5 * hot * dl);
      const skyHz = mix(skyMid, hzCol, hzA);
      const skyTop = mix(mix(skW, skN, 0.4), zen, zenA * 0.75);
      const lumTop = luminance(skyTop);
      const lumBehind = luminance(mix(skyMid, skyHz, 0.35));
      lampT = 1 - smoothstep(0.085, 0.14, lumBehind);
      // what is actually behind a point of the sky (the CSS layers below, in colour)
      const zenEnd = WL * 0.66, hzStart = WL * (0.6 - 0.3 * hot);
      const skyAt = (x, y) => {
        let c = mix(skW, skN, clamp((x / W - 0.28) / 0.72));
        c = mix(c, zen, zenA * clamp(1 - y / zenEnd));
        c = mix(c, hzCol, hzA * clamp((y - hzStart) / (WL - hzStart)));
        if (haze > 0.03) c = mix(c, skyMid, haze * (y < 380 ? 0 : y < 470 ? 0.24 * (y - 380) / 90 : 0.24 - 0.09 * clamp((y - 470) / (MIN_BASE - 670))));
        return c;
      };
      // the ink of a zone: whichever of the two reads better against the worst of
      // what is behind it, switched in one step; a soft halo of the ground's own
      // colour pushed away from the ink keeps it clear in the half-light
      const zoneInk = (key, y0, y1) => {
        let cl = 99, cd = 99, avg = null;
        for (let k = 0; k < 6; k++) {
          const c = skyAt(k & 1 ? W - 64 : 64, k < 2 ? y0 : k < 4 ? (y0 + y1) / 2 : y1);
          cl = Math.min(cl, contrast(c, INK_L)); cd = Math.min(cd, contrast(c, INK_D));
          avg = avg ? mix(avg, c, 1 / (k + 1)) : c;
        }
        const prev = shown[key];
        const light = prev === INK_D ? cl > cd + 0.4 : prev === INK_L ? cl + 0.4 > cd : cl >= cd;
        const ink = light ? INK_L : INK_D;
        setVar(`--ink-${key}`, light ? mix(INK_L, "#ffcf94", 0.3 * lamp) : INK_D);
        shown[key] = ink;
        const need = clamp((7 - (light ? cl : cd)) / 3.5); // only as much halo as the contrast needs
        setVar(`--halo-${key}`, light ? rgba(mix(avg, "#000000", 0.6), (0.75 * need).toFixed(2)) : rgba(mix(avg, "#ffffff", 0.55), (0.65 * need).toFixed(2)));
      };
      zoneInk("a", 110, HOUR_TOP - HEAD_GAP);
      zoneInk("b", HOUR_TOP, HOUR_BASE);
      zoneInk("c", MIN_TOP, MIN_TOP + 110);

      // waterline, current
      WL = Math.round(lerp(WL_LOW, WL_HIGH, clamp(s.tide.norm)) * 2) / 2;
      P.current = (s.tide.rising ? 1 : -1) * 2 * Math.sqrt(clamp(s.tide.norm) * (1 - clamp(s.tide.norm)));

      // sun or moon glitter on the water: only when the light is in the western half of the sky
      const src = s.sun.alt > 0 ? s.sun : s.moon;
      glitX = CX + ((((src.az - 270 + 540) % 360) - 180) / 45) * CX;
      glitDp = Math.max(0, src.alt) * 11;
      const inView = smoothstep(-260, 40, glitX) * smoothstep(W + 260, W - 40, glitX);
      glitK = inView * (s.sun.alt > 0 ? direct * smoothstep(0, 4, s.sun.alt) * smoothstep(62, 40, s.sun.alt) : moonLight * 0.75);
      P.glit = s.sun.alt > 0 ? rgba(mix(sunCol, "#ffffff", 0.45), 0.92) : rgba("#dfe7f5", 0.25 + 0.5 * moonLight);
      const sunGlow = s.sun.alt > -7 && s.sun.alt < 14 ? inView * (1 - cloud * 0.75) * (1 - haze) * Math.sin(((s.sun.alt + 7) / 21) * Math.PI) : 0;
      const sky =
        (sunGlow > 0.02 ? `radial-gradient(ellipse 820px 470px at ${glitX.toFixed(0)}px ${WL}px, ${rgba(sunCol, 0.72 * sunGlow)}, ${rgba(sunCol, 0)} 72%), ` : "") +
        `linear-gradient(180deg, ${rgba(zen, zenA)} 0px, ${rgba(zen, 0)} ${Math.round(zenEnd)}px), linear-gradient(180deg, ${rgba(hzCol, 0)} ${Math.round(hzStart)}px, ${rgba(hzCol, hzA)} ${WL}px), ` +
        `linear-gradient(90deg, ${skW} 0%, ${skW} 28%, ${skN} 100%)`;
      setStyle("sky", skyDiv, "background", sky);

      // the structure
      const inkD = mix("#0a1017", skyMid, 0.07);
      const lit = (day, nightCol) => mix(day, mix(nightCol, adjust(nightCol, { h: 25, c: (c) => c * 0.8 }), 1 - smoothstep(0.1, 0.8, lamp)), lamp);
      const coolTop = mix("#b56a12", "#8ea4c4", 0.3 * moonLight);
      P.f0 = lit(mix(inkD, sunCol, 0.16 * frontLit), "#dd8a24");
      P.f1 = lit(mix(mix(inkD, skyMid, 0.05), sunCol, 0.22 * frontLit), "#c8781a");
      P.f2 = lit(mix(mix(inkD, skyMid, 0.13), sunCol, 0.26 * frontLit), coolTop);
      P.side = mix(mix(mix(inkD, skyMid, 0.36), mix(sunCol, "#ffffff", 0.25), 0.9 * sideLit), "#030508", lamp);
      P.top = mix(mix(mix(mix(inkD, skyMid, 0.55), mix(sunCol, "#ffffff", 0.5), 0.85 * sideLit), sunCol, clamp(1.4 * backLit)), "#1a1109", lamp);
      P.out = mix(mix(mix(inkD, "#000000", 0.4), mix(sunCol, "#ffffff", 0.25), clamp(1.6 * backLit)), "#030508", lamp);
      P.fasc = mix(mix(inkD, skyMid, 0.03), "#0b0806", lamp);
      P.pile = mix(mix(inkD, skyHz, 0.42), "#0a0c10", Math.max(lamp, night));
      P.wet = mix(mix(inkD, "#0c1f1a", 0.5), "#030605", night);
      P.snow = mix(mix("#f6f8fa", skyMid, 0.1), mix("#3b4250", "#e3a55c", lamp), night);
      const shoreDay = mix(skyHz, inkD, 0.55);
      P.shore = mix(mix(shoreDay, "#05070a", night), skyHz, clamp(haze * 1.15));

      // water: the horizon colour, darker, and darker still toward the viewer
      const deep = mix("#010306", "#0a2431", dl);
      let wTop = adjust(mix(skyHz, inkD, lerp(0.5, 0.3, dl)), { c: (c) => c * 1.12 });
      let wBot = mix(wTop, deep, lerp(0.72, 0.5, dl));
      wTop = mix(wTop, skyHz, haze * 0.92);
      wBot = mix(wBot, skyHz, haze * 0.8);
      P.wTop = wTop;
      setStyle("water", water, "background",
        `radial-gradient(ellipse 560px 460px at ${CX}px 0px, rgba(255,150,50,${(0.2 * lamp * (0.6 + haze)).toFixed(3)}), rgba(255,150,50,0) 72%), ` +
        `linear-gradient(180deg, ${wTop} 0px, ${mix(wTop, wBot, 0.55)} 190px, ${wBot} 660px)`);
      P.shoreRefl = rgba(mix(P.shore, wTop, 0.25), 0.8 * (1 - clamp(haze * 1.3)));

      // glints, rings, flakes
      const glintCol = mix(mix(mix(skyHz, "#ffffff", 0.6), sunCol, 0.45 * direct), mix(wTop, "#b8c4d8", 0.3 + 0.35 * moonLight), night);
      const gA = lerp(1, 0.55, night) * (1 - 0.5 * haze);
      P.gl[0] = rgba(glintCol, 0.26 * gA); P.gl[1] = rgba(glintCol, 0.5 * gA); P.gl[2] = rgba(glintCol, 0.88 * gA);
      P.foam = rgba(mix("#f4f7f9", "#7d858f", night), 0.9);
      P.ring = rgba(mix(mix(wTop, "#ffffff", 0.62), mix(wTop, "#c3ccda", 0.5), night), 1);
      P.floe = mix(mix(mix(skyHz, "#ffffff", 0.7), "#49525f", night), wTop, haze * 0.5);
      P.floeEdge = mix(wBot, "#000000", 0.3);
      const amb = lamp * (0.5 + 0.5 * night);
      P.stk[0] = rgba("#ffcf8a", 0.85 * amb); P.stk[1] = rgba("#ff9f3a", 0.5 * amb); P.stk[2] = rgba("#e07a18", 0.26 * amb);
      P.shoreStk = rgba("#ffcb8c", 0.5 * night * (1 - clamp(haze * 1.4)));
      P.rain = lumTop > 0.2 ? rgba(mix(inkD, skyMid, 0.25), 0.22 + 0.16 * wx.intensity) : rgba("#aeb9cc", 0.16 + 0.1 * dl + 0.2 * wx.intensity);
      P.rainLit = rgba("#ffc27a", 0.5);
      P.flake = rgba(mix("#ffffff", "#8e97a6", night), lerp(0.95, 0.6, night));
      P.flakeLit = rgba("#ffd29a", 0.95);
      P.flakeShade = rgba(mix(skyMid, inkD, 0.35), 0.35 * (1 - night));

      // fog between us and the structure, thicker toward the top
      setStyle("veil", veil, "background",
        haze > 0.03 ? `linear-gradient(180deg, ${rgba(skyMid, 0)} 380px, ${rgba(skyMid, 0.24 * haze)} 470px, ${rgba(skyMid, 0.15 * haze)} ${MIN_BASE - 200}px, ${rgba(skyMid, 0.04 * haze)} ${DECK_BOT}px, ${rgba(skyMid, 0)} ${WL_HIGH}px)` : "none");

      const textChanged = [put("hh", hT, s.text.hh), put("mm", mT, s.text.mm), put("ap", aT, s.text.ampm)].some(Boolean);
      if (textChanged) layout(s);

      // snow lying on the structure
      let lying = 0;
      if (wx.falling === "snow") lying = 5 + 8 * wx.intensity;
      else if (wx.temp < 34) for (let i = 18; i < 24; i++) if (s.pastHours[i] && s.pastHours[i].kind === "snow") lying = 5;
      snowDepth = Math.round(lying);
      const sk2 = `${snowDepth}|${s.text.time}|${s.text.ampm}`;
      if (sk2 !== snowKey) {
        snowKey = sk2;
        const ck = snowDepth >= 1 ? `${s.text.time}|${s.text.ampm}` : "";
        if (ck !== capsKey) { capsKey = ck; findCaps(s); } // the caps' shape depends on the numerals only
        capSnow.setAttribute("d", capPath());
        deckSnow.setAttribute("d", lipPath(DECK_X0, DECK_X1, MIN_BASE, snowDepth));
        slabSnow.setAttribute("d", lipPath(slabX0, slabX1, HOUR_BASE, snowDepth * 0.8));
      }

      // push to the DOM. The structure's colours (and the offscreen copy the
      // reflection is cut from) follow the light only when it has changed
      // perceptibly, not every second: restyling the SVG costs paint time.
      const palKey = `${Math.round(dl * 60)}|${Math.round(s.sun.alt * 1.5)}|${Math.round(s.sun.az / 4)}|${Math.round(cloud * 25)}|${Math.round(haze * 25)}|${wx.falling}|${Math.round(moonLight * 20)}|${sk.west}${sk.northWest}|${lampQ}`;
      const palChanged = palKey !== shown.palKey;
      if (palChanged) {
        shown.palKey = palKey;
        setVar("--f0", P.f0); setVar("--f1", P.f1); setVar("--f2", P.f2);
        setVar("--side", P.side); setVar("--top", P.top); setVar("--fasc", P.fasc); setVar("--out", P.out);
        setVar("--pile", P.pile); setVar("--wet", P.wet); setVar("--snow", P.snow); setVar("--shore", P.shore);
      }
      const lampS = lamp.toFixed(3);
      setAttr("fanM", minFans, "opacity", lampS); setAttr("fanH", hourFans, "opacity", lampS);
      setAttr("dots", lampDots, "opacity", lampS); setAttr("dlit", deckLit, "opacity", lampS);
      setStyle("halo", halo, "opacity", (lamp * clamp(0.3 + 0.7 * haze + (wx.falling ? 0.25 : 0))).toFixed(3));
      setAttr("slights", shoreLights, "opacity", (night * (1 - clamp(haze * 1.5))).toFixed(2));
      setAttr("shoreY", shoreG, "transform", `translate(0 ${WL})`);
      setStyle("wl", water, "transform", `translateY(${WL}px)`);
      const wetA = (s.tide.rising ? 0.4 : 0.55 + 0.45 * clamp(s.tide.norm)).toFixed(2);
      if (shown.wetA !== wetA) { shown.wetA = wetA; for (const wr of wetRects) wr.setAttribute("opacity", wetA); }

      // readouts
      put("wk", nWk, s.text.weekday); put("md", nMd, s.text.monthDay);
      if (put("temp", nTemp, s.text.temp)) fitText(nTemp, flankL + 8, TEMP_PX);
      put("cond", nCond, s.text.condition);
      put("sunL", nSunL, s.text.sunLabel);
      if (put("sunV", nSunV, s.text.sunValue)) fitText(nSunV, flankR, SUN_PX);
      put("moon", nMoonV, s.text.moon);
      if (put("aqi", nAqi, s.text.aqi) | put("uv", nUv, s.text.uv)) fitText(nAir, airW, AIR_PX); // a three-digit AQI beside wide minutes
      put("fl", nFl, s.text.factLabel);
      const fvNew = put("fv", nFv, s.text.factValue);
      setStyle("factShow", nFact, "display", s.text.factValue ? "block" : "none");
      if (fvNew) { // the top band stands on its lowest ink: a little nearer the hours when the fact wraps
        const two = s.text.factValue !== "" && nFv.clientHeight > FACT_LH * 1.5;
        nHead.style.bottom = `${Math.round(H - (HOUR_TOP - (two ? HEAD_GAP2 : HEAD_GAP) + (s.text.factValue ? factOff : dateOff)))}px`;
      }

      const key = `${palKey}|${snowKey}`;
      if (key !== sceneKey) {
        sceneKey = key;
        // on the minute the reflection catches up a moment later; otherwise at once
        sceneDue = textChanged && !first && !P.jump ? s.t + 0.5 : s.t;
      }
    }

    // ----- every frame ---------------------------------------------------------------
    function frame(s) {
      const t = s.t, dt = s.dt, wx = s.weather;
      const jump = first || Math.abs(s.ms - lastMs - dt * 1000) > 3000;
      lastMs = s.ms;
      P.jump = jump;
      lamp = jump ? lampT : approach(lamp, lampT, dt, 7);
      const q = Math.round(lamp * 40);
      const sec = Math.floor(s.ms / 1000);
      if (sec !== lastSec || q !== lampQ || first) {
        lampQ = q;
        lastSec = sec;
        slow(s);
        if (first) { lamp = lampT; lampQ = Math.round(lamp * 40); slow(s); }
      }
      // (when the clock runs fast, at most five repaints a second)
      if (sceneDue >= 0 && t >= sceneDue && (t - lastPaint >= 0.2 || t < lastPaint)) { sceneDue = -1; lastPaint = t; paintScene(s); }

      const { ctx } = fx;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // a full clear: the browser can discard the old bitmap outright, where a
      // partial clear makes it keep and composite the rest (measurably slower)
      ctx.clearRect(0, 0, W, H);

      const rough = clamp(0.03 + Math.pow(wx.wind / 26, 1.15) + 0.12 * wx.intensity) * (1 - 0.55 * hot);
      const gustK = clamp((wx.gust - wx.wind) / (wx.wind + 6), 0.2, 1.2);
      const windX = -cosd(wx.windDir) * wx.wind;
      const slantX = (windX < 0 ? -1 : 1) * Math.max(Math.abs(windX), 0.4 * wx.wind);
      driftX += P.current * 24 * dt;
      const maxD = H - WL;
      const stretch = 1 / (1 + 0.2 * rough);
      const w1 = 0.8 + rough * 0.9, w2 = 1.3 + rough * 1.2;
      const fadeInv = 1 / lerp(1500, 55, Math.pow(haze, 0.8));
      const reflA = lerp(0.9, 0.96, lamp);
      const gustDrift = t * 0.08 * (windX < 0 ? -1 : 1);

      // ---- displacement of every strip
      let nVis = 0;
      for (let i = 0; i < NS; i++) {
        const d = SD[i];
        if (d >= maxD) break;
        nVis = i + 1;
        const u = SU[i];
        const g = 0.5 + 0.5 * noise.n2(u * 1.7 - t * 0.1, gustDrift + 7.3);
        const rI = rough * (0.55 + 0.95 * g * gustK);
        RGH[i] = rI;
        const wv = Math.sin(u * 13 - t * w1) * 0.55 + Math.sin(u * 31 - t * w2 + 1.7) * 0.28 + noise.n2(u * 7 + 3.1, t * 0.45) * 0.42;
        OFF[i] = (2.2 + d * 0.052) * rI * wv;
        JY[i] = rI * (0.6 + d * 0.016) * Math.sin(u * 21 - t * 1.25 + 0.6) + hot * 3.2 * Math.exp(-d / 70) * Math.sin(u * 47 - t * 1.7 + 2 * noise.n2(u * 9, t * 0.3));
        const n = noise.n2(u * 11 + 40, t * 0.5);
        const drop = clamp((rI - 0.28) * 1.5) * clamp(n * 1.7 + 0.35);
        AL[i] = reflA * Math.exp(-d * fadeInv) * (1 - drop);
      }

      // ---- heat: the air over the far shore swims in thin bright layers
      if (hot > 0.05) {
        ctx.fillStyle = P.mirage;
        ctx.beginPath();
        for (let k = 0; k < 14; k++) {
          const y = WL - 3 - k * 2.4;
          const ox = 90 * noise.n2(k * 0.37, t * 0.22) + 40 * Math.sin(t * 0.6 + k);
          const len = 260 + 200 * (0.5 + 0.5 * noise.n2(k * 0.71 + 9, t * 0.15));
          for (let x = -300 + ox + ((k * 173) % 400); x < W; x += len + 140 + k * 9) ctx.rect(x, y, len * (1 - k / 18), 1.6);
        }
        ctx.fill();
      }

      // ---- the far shore's reflection
      ctx.fillStyle = P.shoreRefl;
      ctx.beginPath();
      for (let i = 0; i < nVis && SD[i] < 7; i++) ctx.rect(-40 + OFF[i], WL + SD[i], W + 80, SH[i] + 0.3);
      ctx.fill();

      // ---- the structure's reflection: strips of the offscreen scene, flipped
      ctx.setTransform(1, 0, 0, -1, 0, 2 * WL);
      ctx.imageSmoothingEnabled = false; // the strips are copied 1:1 across; cheaper unsmoothed
      for (let i = 0; i < nVis; i++) {
        const a = AL[i];
        if (a < 0.02) continue;
        const h = SH[i], d = SD[i];
        const sh = h * stretch;
        let sy = WL - (d + h) * stretch + JY[i];
        if (sy < 0 || sy + sh > SCENE_H) continue;
        ctx.globalAlpha = a;
        ctx.drawImage(scene, SX0, sy, SW, sh, SX0 + OFF[i], WL - d - h, SW, h * (1 - 0.32 * clamp(RGH[i] * 1.2)) + 0.4);
      }
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // ---- sodium light smeared down the water (brightness worked out once per
      // dash, then drawn in three tones)
      if (lamp > 0.02) {
        const decayInv = 1 / (150 + rough * 260);
        for (let k = 0; k < NL; k++) {
          const d0 = (WL - LAMP_Y[k]) / stretch;
          for (let i = 0; i < nVis; i++) {
            const qi = k * NS + i;
            const d = SD[i];
            if (d < d0 - 8) { HB[qi] = 3; continue; }
            const e = Math.exp(-Math.max(0, d - d0) * decayInv) * (0.55 + 0.45 * Math.sin(t * (1 + HK3[qi] * 2) + HK3[qi] * 40)) * AL[i];
            HB[qi] = e > 0.5 ? 0 : e > 0.26 ? 1 : e > 0.09 ? 2 : 3;
          }
        }
        for (let b = 0; b < 3; b++) {
          ctx.fillStyle = P.stk[b];
          ctx.beginPath();
          for (let k = 0; k < NL; k++) {
            const d0 = (WL - LAMP_Y[k]) / stretch;
            for (let i = 0; i < nVis; i++) {
              const qi = k * NS + i;
              if (HB[qi] !== b) continue;
              const d = SD[i];
              const spread = 5 + (d - d0) * (0.035 + rough * 0.12);
              const w = (7 + 26 * HK2[qi]) * (0.7 + rough * 0.7);
              ctx.rect(LAMP_X[k] + OFF[i] * 1.1 + (HK1[qi] - 0.5) * spread - w / 2, WL + d, w, SH[i] * 0.78);
            }
          }
          ctx.fill();
        }
      }
      if (night > 0.05 && haze < 0.7) { // the far shore's lights
        ctx.fillStyle = P.shoreStk;
        ctx.beginPath();
        for (let l = 0; l < NSL; l++) {
          for (let i = 0; i < 16 && i < nVis; i++) {
            const v = SLK[l * 16 + i];
            if (v > 0.5 - i * 0.02) continue;
            ctx.rect(SHORE_LX[l] + OFF[i] * 0.8 + (v - 0.25) * i * 0.8 - 1.5, WL + SD[i], 3 + v * 4, SH[i]);
          }
        }
        ctx.fill();
      }

      // ---- glitter under the sun or the moon
      if (glitK > 0.02) {
        ctx.fillStyle = P.glit;
        ctx.beginPath();
        for (let g = 0; g < NGL; g++) {
          const i = GLI[g];
          if (i >= nVis) continue;
          const d = SD[i];
          const env = clamp(1 - (glitDp - d) / 240);
          if (env <= 0) continue;
          if (Math.sin(GLP[g] + t * GLS[g]) < 1 - 1.7 * glitK * env) continue;
          const wcol = 28 + d * (0.14 + rough * 0.5);
          const w = (12 + d * 0.075) * GLW[g];
          ctx.rect(glitX + GLX[g] * wcol + OFF[i] - w / 2, WL + d, w, Math.max(1.4, SH[i] * 0.62));
        }
        ctx.fill();
      }

      // ---- glints of sky, carried by the tidal current
      const dens = 0.1 + rough * 0.55 + direct * 0.14;
      const thr = 1 - 2 * dens;
      const span = W + 240;
      for (let b = 0; b < 3; b++) {
        ctx.fillStyle = P.gl[b];
        ctx.beginPath();
        const lo = b === 0 ? 0 : b === 1 ? 0.3 : 0.62;
        const hi = b === 0 ? 0.3 : b === 1 ? 0.62 : 9;
        for (let g = 0; g < NG; g++) {
          const i = GI[g];
          if (i >= nVis) continue;
          const a = (Math.sin(GP[g] + t * GS[g]) - thr) / (1 - thr + 0.001);
          if (a < lo || a >= hi) continue;
          const d = SD[i];
          let x = (GX[g] * span + driftX * (0.4 + d * 0.004)) % span;
          if (x < 0) x += span;
          const w = GL[g] * (9 + d * 0.085) * (1.5 - rough * 0.8);
          ctx.rect(x - 120 + OFF[i], WL + d, w, Math.max(1.2, SH[i] * 0.5));
        }
        ctx.fill();
      }
      // ---- the river against the piles: a bright collar where each pile enters
      // the water and, on a running tide, a wake trailing downstream (none at slack)
      {
        const cur = P.current, dir = cur < 0 ? -1 : 1, str = Math.abs(cur);
        const ph = (Math.abs(driftX) * 0.9) % 18;
        ctx.fillStyle = P.gl[1];
        ctx.beginPath();
        for (let k = 0; k < PILES.length; k++) {
          const px = PILES[k] + PILE_W / 2;
          const bob = Math.sin(t * 1.3 + k * 1.7) * (0.5 + rough * 1.5);
          ctx.rect(px - PILE_W / 2 - 3 - 3 * str, WL + 0.5 + bob, PILE_W + 6 + 6 * str, 1.3);
          if (str < 0.12) continue;
          for (let j = 0; j < 5; j++) {
            const jj = j + ph / 18; // continuous position along the wake, so nothing pops
            const off = 12 + jj * 18;
            const len = (17 - jj * 3) * str * (0.7 + 0.3 * Math.sin(t * 0.9 + k * 2.3));
            if (len < 1.5) continue;
            const x = dir > 0 ? px + PILE_W / 2 + off - 12 : px - PILE_W / 2 - off + 12 - len;
            ctx.rect(x, WL + 2.5 + jj * 1.6 + bob * 0.5, len, 1.3);
          }
        }
        ctx.fill();
      }

      if (wx.wind > 15) { // whitecaps
        const fk = smoothstep(15, 32, wx.wind);
        ctx.fillStyle = P.foam;
        ctx.beginPath();
        for (let g = 0; g < NG; g += 2) {
          const i = GI[g];
          if (i >= nVis) continue;
          const a = Math.sin(GP[g] * 1.7 + t * GS[g] * 0.6 + 2);
          if (a < 1 - 0.5 * fk * RGH[i]) continue;
          const d = SD[i];
          let x = (GX[g] * span * 1.31 + driftX * (0.4 + d * 0.004) + t * slantX * (0.3 + d * 0.003)) % span;
          if (x < 0) x += span;
          const w = GL[g] * (10 + d * 0.11);
          ctx.rect(x - 120, WL + d, w, Math.max(1.6, SH[i] * 0.8));
          ctx.rect(x - 120 + w * 0.2, WL + d - SH[i] * 0.5, w * 0.5, Math.max(1.2, SH[i] * 0.5));
        }
        ctx.fill();
      }

      // ---- ice, when it is bitterly cold
      if (cold > 0.02) {
        const nf = Math.round(NF * cold);
        for (let pass = 0; pass < 2; pass++) {
          ctx.fillStyle = pass ? P.floe : P.floeEdge;
          ctx.beginPath();
          for (let f = 0; f < nf; f++) {
            const d = FD[f];
            if (d + 20 >= maxD) continue;
            const sc = (0.3 + d * 0.0016) * FS[f];
            let x = (FX[f] * span + driftX * (0.4 + d * 0.004)) % span;
            if (x < 0) x += span;
            x -= 120;
            const y = WL + d + Math.sin(t * 0.7 + FP[f]) * (0.6 + rough * 3) + (pass ? 0 : 1.5 + sc * 2);
            const rx = 60 * sc, ry = 7.5 * sc;
            for (let v = 0; v < 7; v++) {
              const vx = x + FV[f * 14 + v * 2] * rx, vy = y + FV[f * 14 + v * 2 + 1] * ry;
              if (v) ctx.lineTo(vx, vy); else ctx.moveTo(vx, vy);
            }
            ctx.closePath();
          }
          ctx.fill();
        }
      }

      // ---- rain rings
      const falling = wx.falling;
      const wet = falling && falling !== "snow" ? wx.intensity : 0;
      if (wet > 0.01) {
        const rate = 8 + 90 * wet * wet + 30 * wet;
        if (first) for (let k = 0; k < Math.min(NR, rate * 1.4); k++) spawnRing(rr.range(0, 1.4));
        ringAcc += rate * dt;
        while (ringAcc >= 1) { ringAcc -= 1; spawnRing(0); }
      }
      ctx.strokeStyle = P.ring;
      for (let b = 0; b < 3; b++) {
        ctx.globalAlpha = b === 0 ? 0.75 : b === 1 ? 0.42 : 0.18;
        ctx.beginPath();
        let any = false;
        for (let k = 0; k < NR; k++) {
          if (RA[k] < 0) continue;
          if (b === 0) { RA[k] += dt; if (RA[k] > RL[k]) { RA[k] = -1; continue; } }
          const f = RA[k] / RL[k];
          if ((f < 0.3 ? 0 : f < 0.65 ? 1 : 2) !== b) continue;
          const d = RD[k];
          if (d >= maxD) continue;
          const sc = 0.3 + d * 0.0034;
          const rad = (5 + RA[k] * 42) * sc;
          const y = WL + d;
          ctx.moveTo(RX[k] + rad, y);
          ctx.ellipse(RX[k], y, rad, rad * 0.26, 0, 0, TAU);
          any = true;
        }
        if (any) { ctx.lineWidth = 1.6; ctx.stroke(); }
      }
      ctx.globalAlpha = 1;

      // ---- rain and snow in the air (they stop at the deck and at the water)
      if (falling) {
        const snowing = falling === "snow";
        const n = Math.min(NP, Math.round(snowing ? 130 + 570 * wx.intensity : 50 + 330 * wx.intensity));
        const vy = snowing ? 95 + 60 * wx.intensity : 1050;
        const vx = slantX * (snowing ? 13 : 9);
        const litOn = lamp > 0.3;
        if (snowing) {
          for (let pass = 0; pass < 2; pass++) {
            ctx.fillStyle = pass ? (litOn ? P.flakeLit : P.flake) : P.flake;
            if (pass && !litOn) break;
            ctx.beginPath();
            for (let p = 0; p < n; p++) {
              if (!pass) {
                const sway = Math.sin(t * 0.9 + PH[p]) * 16;
                PY[p] += vy * PV[p] * (0.55 + 0.45 * PS[p]) * dt;
                PX[p] += (vx * PV[p] * (0.55 + 0.45 * PS[p]) + sway) * dt;
                const floor = PX[p] > DECK_X0 - EX && PX[p] < DECK_X1 ? MIN_BASE - 6 : WL;
                if (PY[p] > floor) { PY[p] -= floor + 20; PX[p] = hash(p, s.frame) * (W + 600) - 300; }
                if (PX[p] > W + 300) PX[p] -= W + 600; else if (PX[p] < -300) PX[p] += W + 600;
              }
              const x = PX[p], y = PY[p];
              if (x < -6 || x > W + 6 || y < -6) continue;
              const inLight = litOn && Math.abs(x - CX) < 330 + (y - 400) * 0.1 && y > 400;
              if (inLight !== (pass === 1)) continue;
              const sz = 1.4 + PS[p] * PS[p] * 2.5;
              if (sz < 2.6) ctx.rect(x, y, sz, sz);
              else { ctx.moveTo(x + sz * 0.6, y); ctx.arc(x, y, sz * 0.6, 0, TAU); } // the near flakes are round
            }
            ctx.fill();
          }
        } else {
          const len = 0.034;
          for (let pass = 0; pass < 2; pass++) {
            if (pass && !litOn) break;
            ctx.strokeStyle = pass ? P.rainLit : P.rain;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let p = 0; p < n; p++) {
              if (!pass) {
                PY[p] += vy * PV[p] * dt;
                PX[p] += vx * PV[p] * dt;
                const floor = PX[p] > DECK_X0 - EX && PX[p] < DECK_X1 ? MIN_BASE - 4 : WL;
                if (PY[p] > floor) { PY[p] -= floor + 60; PX[p] = hash(p, s.frame) * (W + 600) - 300; }
              }
              const x = PX[p], y = PY[p];
              if (x < -40 || x > W + 40) continue;
              const inLight = litOn && Math.abs(x - CX) < 320 && y > 430;
              if (inLight !== (pass === 1)) continue;
              ctx.moveTo(x, y);
              ctx.lineTo(x - vx * PV[p] * len, y - vy * PV[p] * len);
            }
            ctx.stroke();
          }
        }
      }

      // ---- a storm: now and then the cloud slowly brightens
      let sw = 0;
      if (falling === "storm") {
        const win = Math.floor(t / 19);
        const start = win * 19 + 2 + hash(win, seed) * 11;
        const f = (t - start) / 3.4;
        if (f > 0 && f < 1) sw = Math.pow(Math.sin(f * Math.PI), 2) * (0.1 + 0.07 * hash(win, 5));
      }
      if (sw !== swLast) { swLast = sw; swell.style.opacity = sw.toFixed(3); }

      first = false;
    }

    return { frame };
  },
};

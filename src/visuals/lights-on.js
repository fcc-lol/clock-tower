// Lights On
//
// One Queens apartment building, front elevation, fills the frame. The time is
// spelled by which windows are awake: hours on the upper five floors, minutes
// on the lower five, AM/PM as the name of the deli underneath.
//
// How the conditions drive it:
// - By day an awake window has its blind up and holds the real sky: the glass
//   takes the four measured sky colors (west on the left columns through east
//   on the right) and one cloud field slides through every pane at the wind's
//   speed, as thick as the cloud cover. As the light goes (earlier under rain
//   or fog) each awake window crosses its own threshold and a lamp comes on, so
//   dusk is the building lighting up; at night the digits are warm rooms.
// - Sun: hard shadows under every sill and off the fire escape, their length
//   and lean set by where the sun is; a warm wash when it is low. No sun, no
//   shadows. The sky's own color tints the brick.
// - Rain darkens the brick from the roof down and drips off sills and the
//   awning; snow settles on every ledge and the sidewalk; fog greys the wall
//   and swells the window glows; wind slants what falls, flaps the awning and
//   blows curtains out of open windows (warm days only); heat makes the air
//   conditioners drip; cold puts steam on the roof; thunder is a slow swell.
// - Readouts are the building's signs: date on the frieze, today's fact on the
//   rooftop billboard, moon phase as the bar's name, the countdown in its neon,
//   temperature on the deli awning, air quality and UV on the lotto panels.
//
// Layers, bottom to top: sky (div), facade (drawn once), sun shadows, tints,
// wetness, night veil and fog (divs whose opacity moves), window glows, the
// awake windows (redrawn singly), weather and street life, then DOM type.

import {
  W, H, TAU, clamp, lerp, smoothstep, approach, ease, rng, hash, createNoise,
  mix, adjust, rgba, luminance, contrast, parse, toHex, ramp,
  el, addStyle, canvas2d, grain, fitText,
} from "../lib/kit.js";

// ---- geometry (stage units) -------------------------------------------------
const ROOF = 214; // top of the parapet
const GX = 54, CW = 108, CH = 100; // window grid: 9 columns, 10 floors
const WW = 76, WH = 80, FR = 5; // window opening and frame width
const HOURS_Y = 336, MINS_Y = 872;
const SHOP = 1378, FASCIA = 1394, FRONT = 1518, WALK = 1800;
const NWIN = 90;
const colX = (c) => GX + c * CW + (CW - WW) / 2;
const rowY = (r) => (r < 5 ? HOURS_Y + r * CH : MINS_Y + (r - 5) * CH) + 12;
const BOARD_X = 236, BOARD_Y = 50, BOARD_W = 780, BOARD_H = 146;
const AWN_X0 = 336, AWN_X1 = 744, AWN_T = FRONT + 2, AWN_B = 1690;

// ---- palette ------------------------------------------------------------------
const BRICK = "#84402e", MORTAR = "#9b6c5a", BRICK_AVG = "#874736";
const STONE = "#d6c8ae", STONE_HI = "#e9dfca", STONE_DK = "#9f927b";
const IRON = "#141316", SIGN = "#13110f", BILL = "#141b18";
const GILT = "#f0d489", CREAM = "#f6ecd6";
const AWNING = "#1e5a45";
const VEIL = "#060912";
const LAMPS = ["#ffb650", "#ffd596", "#ff9b52", "#ffab8a"];
const NEON = "#ffd9e4", NEON_GLOW = "#ff3f86", LED = "#ff7c52";

// 3 x 5 window-pixel digits, one row per floor (4 = left, 2 = middle, 1 = right).
const FONT = [
  [7, 5, 5, 5, 7], [2, 6, 2, 2, 7], [7, 1, 7, 4, 7], [7, 1, 7, 1, 7], [5, 5, 7, 1, 1],
  [7, 4, 7, 1, 7], [7, 4, 7, 5, 7], [7, 1, 1, 1, 1], [7, 5, 7, 5, 7], [7, 5, 7, 1, 7],
];

// Straight sRGB blend: what one flat color looks like through a translucent
// layer of another (which is how the tint, veil and fog layers composite).
function blend(a, b, t) {
  const A = parse(a), B = parse(b);
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}
// Lighten `c` until it stands `min`:1 off `ground`.
function ensure(c, ground, min) {
  let n = 0;
  while (contrast(c, ground) < min && n++ < 16) c = mix(c, "#ffffff", 0.14);
  return c;
}

function offscreen(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.round(w);
  c.height = Math.round(h);
  return c;
}

// A soft cloud field that tiles in both directions. Computed on a coarse grid
// (it is only ever seen small, through panes and a strip of sky) and smoothed
// up, which keeps mount() quick.
function cloudTile(noise, size, tint, shade, lo, hi, ox) {
  const n = 64, F = 2.4, FY = F * 1.7;
  const small = offscreen(n, n);
  const sx = small.getContext("2d");
  const img = sx.createImageData(n, n);
  const T = parse(tint), S = parse(shade);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = i / n, v = j / n;
      const x = u * F + ox, y = v * FY + ox * 0.7;
      const wa = (1 - u) * (1 - v), wb = u * (1 - v), wc = u * v, wd = (1 - u) * v;
      const val =
        (noise.fbm2(x, y, 3) * wa + noise.fbm2(x - F, y, 3) * wb + noise.fbm2(x - F, y - FY, 3) * wc + noise.fbm2(x, y - FY, 3) * wd) /
        Math.sqrt(wa * wa + wb * wb + wc * wc + wd * wd);
      const a = smoothstep(lo, hi, val);
      const k = clamp((val - lo) / (hi - lo + 0.35));
      const o = (j * n + i) * 4;
      img.data[o] = S[0] + (T[0] - S[0]) * k;
      img.data[o + 1] = S[1] + (T[1] - S[1]) * k;
      img.data[o + 2] = S[2] + (T[2] - S[2]) * k;
      img.data[o + 3] = a * 255;
    }
  }
  sx.putImageData(img, 0, 0);
  const out = offscreen(size, size);
  const ox2 = out.getContext("2d");
  ox2.imageSmoothingQuality = "high";
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) ox2.drawImage(small, dx * size, dy * size, size, size);
  return out;
}

function glowSprite(color, a) {
  const c = offscreen(256, 256);
  const x = c.getContext("2d");
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(0.35, rgba(color, a * 0.42));
  g.addColorStop(1, rgba(color, 0));
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  return c;
}

// A lit room seen through one window: lamp light, and a little furniture.
function roomSprite(hue, layout, r) {
  const gw = WW - 2 * FR, gh = WH - 2 * FR;
  const c = offscreen(gw * 2, gh * 2);
  const x = c.getContext("2d");
  x.scale(2, 2);
  const hi = mix(hue, "#fff6e0", 0.5), lo = mix(hue, "#8a3c12", 0.34);
  let g = x.createLinearGradient(0, 0, 0, gh);
  g.addColorStop(0, mix(hue, lo, 0.7));
  g.addColorStop(0.5, hue);
  g.addColorStop(1, mix(hue, lo, 0.3));
  x.fillStyle = g;
  x.fillRect(0, 0, gw, gh);
  const lx = gw * r.range(0.25, 0.75), ly = gh * r.range(0.38, 0.62);
  g = x.createRadialGradient(lx, ly, 2, lx, ly, gw * 0.62);
  g.addColorStop(0, rgba(hi, 0.95));
  g.addColorStop(1, rgba(hi, 0));
  x.fillStyle = g;
  x.fillRect(0, 0, gw, gh);
  if (layout === 1) {
    // drapes drawn back at both sides
    x.fillStyle = rgba(lo, 0.6);
    x.beginPath();
    x.moveTo(0, 0); x.lineTo(gw * 0.32, 0); x.quadraticCurveTo(gw * 0.24, gh * 0.55, gw * 0.08, gh); x.lineTo(0, gh);
    x.moveTo(gw, 0); x.lineTo(gw * 0.68, 0); x.quadraticCurveTo(gw * 0.76, gh * 0.55, gw * 0.92, gh); x.lineTo(gw, gh);
    x.fill();
  } else if (layout === 2) {
    // a sheer shade half down
    x.fillStyle = rgba(hi, 0.55);
    x.fillRect(0, 0, gw, gh * 0.42);
    x.fillStyle = rgba(lo, 0.55);
    x.fillRect(0, gh * 0.42, gw, 2);
  } else if (layout === 3) {
    // a plant on the sill
    const px = gw * r.range(0.18, 0.3);
    x.fillStyle = rgba("#3a1c08", 0.8);
    x.fillRect(px - 6, gh - 11, 12, 11);
    x.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.5;
      x.ellipse(px + Math.cos(a) * 10, gh - 14 + Math.sin(a) * 12, 3.2, 9, a + Math.PI / 2, 0, TAU);
    }
    x.fill();
  }
  return c;
}

export default {
  title: "Lights On",
  description: "A Queens apartment house whose awake windows spell the time: sky in the glass by day, lamps coming on room by room at dusk.",
  fonts: ["Cinzel:wght@600;700", "Oswald:wght@300;400;500;600;700"],

  mount(root, { seed }) {
    const r = rng(seed);
    const noise = createNoise(seed);

    addStyle(root, `
      .lo { position: absolute; inset: 0; overflow: hidden; background: #06080e; font-family: "Oswald", sans-serif; }
      .lo .lay { position: absolute; left: 0; width: ${W}px; pointer-events: none; }
      .lo .sky { top: 0; height: ${ROOF + 12}px; }
      .lo .sky::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,10,0.16), rgba(255,255,255,0.05)); }
      .lo .tx { position: absolute; white-space: nowrap; text-align: center; line-height: 1; }
      .lo .date { left: 64px; width: 952px; top: 254px; height: 68px; font: 600 46px/68px "Cinzel", serif; letter-spacing: 0.13em; padding-left: 0.13em; box-sizing: border-box; text-transform: uppercase; color: var(--date); text-shadow: 0 2px 0 rgba(0,0,0,0.55); }
      .lo .fact { position: absolute; left: ${BOARD_X + 22}px; top: ${BOARD_Y + 12}px; width: ${BOARD_W - 44}px; height: ${BOARD_H - 24}px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
      .lo .factL { font-weight: 500; font-size: 25px; line-height: 30px; letter-spacing: 0.22em; padding-left: 0.22em; text-transform: uppercase; color: var(--gilt); white-space: nowrap; }
      .lo .factV { font-weight: 500; font-size: 38px; line-height: 43px; letter-spacing: 0.01em; color: var(--bill); margin-top: 3px; max-width: 100%; }
      .lo .moonL { left: 64px; width: 236px; top: 1403px; font-weight: 500; font-size: 24px; letter-spacing: 0.42em; padding-left: 0.42em; box-sizing: border-box; color: var(--giltDim); }
      .lo .moonN { left: 64px; width: 236px; font-weight: 600; font-size: 43px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--gilt); }
      .lo .ampm { left: 348px; width: 384px; top: ${FASCIA}px; height: 124px; font-weight: 700; font-size: 100px; line-height: 124px; letter-spacing: 0.08em; padding-left: 0.08em; box-sizing: border-box; color: var(--chan); text-shadow: 3px 4px 0 rgba(0,0,0,0.6), 0 0 26px var(--chanGlow); }
      .lo .sideL { top: ${FASCIA}px; width: 108px; height: 124px; font-weight: 600; font-size: 44px; line-height: 124px; letter-spacing: 0.06em; color: var(--gilt); }
      .lo .led { top: 1566px; width: 108px; height: 140px; font-weight: 600; font-size: 64px; line-height: 140px; color: ${LED}; text-shadow: 0 0 14px rgba(255,80,40,0.55); }
      .lo .neonBox { position: absolute; left: 72px; top: 1554px; width: 220px; height: 164px; box-sizing: border-box; border: 3px solid ${NEON}; border-radius: 18px; box-shadow: 0 0 12px ${NEON_GLOW}, inset 0 0 12px ${NEON_GLOW}; opacity: 0.9; }
      .lo .sunL { left: 64px; width: 236px; top: 1576px; font-weight: 400; font-size: 34px; letter-spacing: 0.07em; color: ${NEON}; text-shadow: 0 0 8px ${NEON_GLOW}, 0 0 20px ${NEON_GLOW}; }
      .lo .sunV { left: 64px; width: 236px; top: 1622px; font-weight: 300; font-size: 74px; letter-spacing: 0.01em; color: ${NEON}; text-shadow: 0 0 9px ${NEON_GLOW}, 0 0 26px ${NEON_GLOW}; }
      .lo .temp { left: 348px; width: 384px; top: 1522px; font-weight: 600; font-size: 112px; padding-left: 0.22em; box-sizing: border-box; color: var(--cream); }
      .lo .cond { left: 348px; width: 384px; top: 1638px; font-weight: 500; font-size: 44px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--cream); }
    `);

    const wrap = el("div", { class: "lo" });
    root.append(wrap);
    const lay = (cls, style) => {
      const d = el("div", { class: `lay ${cls || ""}`, style });
      wrap.append(d);
      return d;
    };

    // ---- layers ---------------------------------------------------------------
    const skyDiv = lay("sky");
    const facade = canvas2d(wrap, { maxScale: 2 });
    const shadow = canvas2d(wrap);
    const wetClip = lay("", { top: `${ROOF}px`, height: `${SHOP - ROOF}px`, overflow: "hidden", visibility: "hidden" });
    const wet = canvas2d(wetClip);
    const walkDiv = lay("", { top: `${WALK}px`, height: `${H - WALK}px` });
    // The air: sky tint, low sun, night and fog, folded into one translucent
    // gradient (one full-stage layer instead of four).
    const airDiv = lay("", { top: "0", height: `${H}px` });
    const flashDiv = lay("", { top: "0", height: `${ROOF}px`, background: "#c9d0ff", opacity: "0" });
    const glow = canvas2d(wrap);
    const win = canvas2d(wrap, { maxScale: 2 });
    const fx = canvas2d(wrap, { adaptive: true });
    const fctx = fx.ctx, wctx = win.ctx, gctx = glow.ctx;

    // ---- type -----------------------------------------------------------------
    const tx = (cls, style, text) => {
      const d = el("div", { class: `tx ${cls}`, style, text });
      wrap.append(d);
      return d;
    };
    const dateEl = tx("date");
    const factL = el("div", { class: "factL" });
    const factV = el("div", { class: "factV" });
    const factEl = el("div", { class: "fact" }, factL, factV);
    wrap.append(factEl);
    tx("moonL", null, "MOON");
    const moonA = tx("moonN", { top: "1431px" });
    const moonB = tx("moonN", { top: "1473px" });
    const ampmEl = tx("ampm");
    tx("sideL", { left: "782px" }, "AIR");
    tx("sideL", { left: "906px" }, "UV");
    const aqiEl = tx("led", { left: "782px" });
    const uvEl = tx("led", { left: "906px" });
    wrap.append(el("div", { class: "neonBox" }));
    const sunL = tx("sunL");
    const sunV = tx("sunV");
    const tempEl = tx("temp");
    const condEl = tx("cond");
    grain(wrap, { opacity: 0.05 });

    const shown = {};
    const put = (key, node, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };
    const css = (key, node, prop, value) => {
      if (shown[key] === value) return;
      shown[key] = value;
      node.style[prop] = value;
    };
    const cssVar = (name, value) => {
      if (shown[name] === value) return;
      shown[name] = value;
      wrap.style.setProperty(name, value);
    };

    // ---- per-window facts -------------------------------------------------------
    const awake = new Float32Array(NWIN); // 0 blind down .. 1 blind up
    const target = new Uint8Array(NWIN);
    const delay = new Float32Array(NWIN);
    const drawn = new Uint8Array(NWIN);
    const lampAt = new Float32Array(NWIN); // the light level at which this room's lamp comes on
    const roomOf = new Uint8Array(NWIN);
    const vig = new Uint8Array(NWIN); // 1 cat, 2 someone walking past, 3 television
    const isOpen = new Uint8Array(NWIN);
    const rank = new Float32Array(NWIN * 3);
    const blindK = new Uint8Array(NWIN); // how far down each daytime blind is drawn (0..3)
    for (let i = 0; i < NWIN; i++) {
      blindK[i] = r.int(0, 3);
      lampAt[i] = r.range(0.17, 0.5);
      roomOf[i] = r.int(0, 15);
      isOpen[i] = r.chance(0.17) ? 1 : 0;
      rank[i * 3] = r();
      rank[i * 3 + 1] = r();
      rank[i * 3 + 2] = r();
    }
    const rooms = [];
    for (let k = 0; k < 16; k++) rooms.push(roomSprite(LAMPS[k % 4], k < 4 ? 0 : k < 8 ? 1 : k < 12 ? 2 : r.chance(0.5) ? 3 : 0, r));

    // Air conditioners live in the three columns that never hold a digit.
    const acs = [];
    for (const c of [0, 4, 8]) for (const rr of r.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, c === 4 ? 1 : 3)) acs.push([c, rr]);

    // ---- ironwork ---------------------------------------------------------------
    const FE0 = 480, FE1 = 600;
    const ironThick = new Path2D(), ironThin = new Path2D();
    const platformY = [];
    for (let rr = 0; rr < 10; rr++) platformY.push(rowY(rr) + WH + 9);
    for (let rr = 0; rr < 10; rr++) {
      const y = platformY[rr];
      ironThick.rect(FE0, y, FE1 - FE0, 4);
      ironThick.rect(FE0, y - 38, FE1 - FE0, 2.6);
      ironThick.rect(FE0, y - 38, 2.6, 40);
      ironThick.rect(FE1 - 2.6, y - 38, 2.6, 40);
      for (let x = FE0 + 10; x < FE1 - 5; x += 10) ironThin.rect(x, y - 36, 1.3, 36);
      if (rr < 9) {
        ironThick.moveTo(FE0 + 4, y + 4); ironThick.lineTo(FE0 + 4, y + 17); ironThick.lineTo(FE0 + 20, y + 4); ironThick.closePath();
        ironThick.moveTo(FE1 - 4, y + 4); ironThick.lineTo(FE1 - 4, y + 17); ironThick.lineTo(FE1 - 20, y + 4); ironThick.closePath();
        // the stair down to the next landing, alternating sides
        const yn = platformY[rr + 1];
        const xa = rr % 2 ? FE0 + 18 : FE1 - 30, xb = rr % 2 ? FE1 - 30 : FE0 + 18;
        for (const o of [0, 12]) {
          ironThick.moveTo(xa + o - 1.3, y + 4); ironThick.lineTo(xa + o + 1.3, y + 4); ironThick.lineTo(xb + o + 1.3, yn); ironThick.lineTo(xb + o - 1.3, yn); ironThick.closePath();
        }
        for (let ty = y + 12; ty < yn - 2; ty += 9) ironThin.rect(lerp(xa, xb, (ty - y - 4) / (yn - y - 4)), ty, 12, 1.4);
      }
    }

    // ---- the roof against the sky -------------------------------------------------
    const roofPath = new Path2D();
    {
      const cx = 132;
      // water tower: conical roof, tank, platform, legs
      roofPath.moveTo(cx, 44); roofPath.lineTo(cx + 54, 82); roofPath.lineTo(cx - 54, 82); roofPath.closePath();
      roofPath.rect(cx - 1.5, 32, 3, 14);
      roofPath.moveTo(cx - 48, 82); roofPath.lineTo(cx + 48, 82); roofPath.lineTo(cx + 44, 158); roofPath.lineTo(cx - 44, 158); roofPath.closePath();
      roofPath.rect(cx - 52, 158, 104, 6);
      for (const lx of [-42, -14, 14, 42]) roofPath.rect(cx + lx - 2.5, 164, 5, ROOF - 164);
      for (const [a, b] of [[-42, 14], [14, -42], [-14, 42], [42, -14]]) {
        roofPath.moveTo(cx + a - 1.5, 168); roofPath.lineTo(cx + a + 1.5, 168); roofPath.lineTo(cx + b + 1.5, ROOF); roofPath.lineTo(cx + b - 1.5, ROOF); roofPath.closePath();
      }
      // vent stack at the far end of the roof
      roofPath.rect(1041, 176, 14, ROOF - 176);
      roofPath.rect(1037, 170, 22, 7);
      // billboard supports
      for (let x = BOARD_X + 40; x < BOARD_X + BOARD_W; x += 100) roofPath.rect(x - 3, BOARD_Y + BOARD_H - 2, 6, ROOF - BOARD_Y - BOARD_H + 2);
      roofPath.rect(BOARD_X + 20, ROOF - 9, BOARD_W - 40, 3);
    }
    const hoops = new Path2D();
    for (const y of [94, 110, 126, 142]) hoops.rect(132 - 48 + (y - 82) * 0.052, y, 96 - (y - 82) * 0.104, 2);
    // the billboard's frame with no panels in it (shown when there is no fact)
    const lattice = new Path2D();
    lattice.rect(BOARD_X, BOARD_Y, BOARD_W, 4); lattice.rect(BOARD_X, BOARD_Y + BOARD_H - 4, BOARD_W, 4);
    for (let x = BOARD_X; x <= BOARD_X + BOARD_W - 4; x += (BOARD_W - 4) / 8) lattice.rect(x, BOARD_Y, 4, BOARD_H);
    for (let k = 0; k < 8; k++) {
      const x0 = BOARD_X + (k * (BOARD_W - 4)) / 8 + 2, x1 = x0 + (BOARD_W - 4) / 8;
      const up = k % 2;
      lattice.moveTo(x0, up ? BOARD_Y + BOARD_H - 3 : BOARD_Y + 3); lattice.lineTo(x0 + 3, up ? BOARD_Y + BOARD_H - 3 : BOARD_Y + 3);
      lattice.lineTo(x1, up ? BOARD_Y + 3 : BOARD_Y + BOARD_H - 3); lattice.lineTo(x1 - 3, up ? BOARD_Y + 3 : BOARD_Y + BOARD_H - 3); lattice.closePath();
    }
    // gooseneck lamps along the top of the board
    const lampArms = new Path2D();
    const lampXs = [BOARD_X + 110, BOARD_X + 297, BOARD_X + 483, BOARD_X + 670];
    for (const x of lampXs) { lampArms.rect(x - 1.5, BOARD_Y - 16, 3, 16); lampArms.rect(x - 9, BOARD_Y - 19, 18, 5); }

    // ---- ledges that hold snow ---------------------------------------------------
    const ledges = [];
    const ledge = (x0, x1, y, k) => {
      for (let x = x0; x < x1 - 1; ) {
        const len = x1 - x0 > 160 ? Math.min(x1 - x, r.range(70, 170)) : x1 - x;
        ledges.push(x, x + len, y, k * r.range(0.7, 1.25));
        x += len;
      }
    };
    ledge(0, W, ROOF, 1.5);
    ledge(0, W, 846, 1.1);
    ledge(0, W, SHOP, 1.3);
    for (let i = 0; i < NWIN; i++) ledge(colX(i % 9) - 6, colX(i % 9) + WW + 6, rowY((i / 9) | 0) + WH + 1, 1);
    for (const y of platformY) ledge(FE0, FE1, y, 0.8);
    for (const [c, rr] of acs) ledge(colX(c) + 13, colX(c) + 63, rowY(rr) + WH - 24, 0.7);
    ledge(132 - 54, 132 + 54, 82, 0.9);
    const LEDGES = new Float32Array(ledges);
    const boardLedge = [];
    for (let x = BOARD_X; x < BOARD_X + BOARD_W - 1; ) { const len = Math.min(BOARD_X + BOARD_W - x, r.range(80, 170)); boardLedge.push(x, x + len, BOARD_Y, r.range(0.8, 1.3)); x += len; }
    const BLEDGE = new Float32Array(boardLedge);

    // ---- the facade, drawn once -----------------------------------------------------
    {
      const ctx = facade.ctx;
      const R = (c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
      const tones = [];
      for (let i = 0; i < 30; i++) {
        const dark = r.chance(0.08) ? 0.085 : 0;
        tones.push(adjust(BRICK, { l: (v) => v + r.range(-0.04, 0.04) - dark, h: (v) => v + r.range(-5, 7), c: (v) => v * r.range(0.82, 1.1) }));
      }
      R(MORTAR, 0, ROOF, W, SHOP - ROOF);
      const BL = 27, BH = 10;
      for (let row = 0, y = ROOF; y < SHOP; row++, y += BH) {
        for (let x = row % 2 ? -BL / 2 : 0; x < W; x += BL) R(tones[(r() * tones.length) | 0], x + 0.6, y + 0.6, BL - 1.2, BH - 1.2);
      }
      // soot under the cornice, grime at the base
      let g = ctx.createLinearGradient(0, ROOF, 0, SHOP);
      g.addColorStop(0, "rgba(28,8,8,0.3)"); g.addColorStop(0.22, "rgba(28,8,8,0.03)"); g.addColorStop(0.82, "rgba(28,8,8,0)"); g.addColorStop(1, "rgba(28,8,8,0.2)");
      R(g, 0, ROOF, W, SHOP - ROOF);

      // cornice and frieze
      R(STONE_HI, 0, ROOF, W, 9); R(STONE_DK, 0, ROOF + 9, W, 5); R(STONE, 0, ROOF + 14, W, 10);
      R("#4a4034", 0, ROOF + 24, W, 11);
      for (let x = 5; x < W; x += 22) R(STONE, x, ROOF + 24, 12, 9);
      R(STONE_HI, 0, ROOF + 35, W, 5);
      R(SIGN, 0, 254, W, 68);
      R("#7b6230", 44, 261, W - 88, 1.5); R("#7b6230", 44, 313.5, W - 88, 1.5);
      ctx.fillStyle = "#a88a44";
      for (const x of [34, W - 34]) { ctx.beginPath(); ctx.moveTo(x, 280); ctx.lineTo(x + 8, 288); ctx.lineTo(x, 296); ctx.lineTo(x - 8, 288); ctx.fill(); }
      R(STONE, 0, 322, W, 7); R(STONE_DK, 0, 329, W, 3);

      // every window asleep: blind down in the recess
      const blinds = ["#3c2a24", "#382d29", "#34302d", "#3f2c22"];
      for (let i = 0; i < NWIN; i++) {
        const x = colX(i % 9), y = rowY((i / 9) | 0);
        // flat arch of soldier bricks
        for (let k = 0; k < 9; k++) R(tones[(k * 7 + i) % tones.length], x - 4 + k * 9.35 + 0.5, y - 14, 8.3, 11.5);
        R("rgba(30,10,8,0.25)", x - 4, y - 14, WW + 8, 11.5);
        R("#1d1310", x - 2, y - 2, WW + 4, WH + 3);
        const b = blinds[(r() * blinds.length) | 0];
        R(b, x, y, WW, WH);
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        for (let yy = y + 5; yy < y + WH - 3; yy += 5.4) ctx.fillRect(x, yy, WW, 1.2);
        R("rgba(255,235,210,0.07)", x, y, WW, 2);
        R("rgba(0,0,0,0.3)", x, y + WH - 5, WW, 5);
        R("#49362e", x - 6, y + WH + 1, WW + 12, 6);
        R("#6a5246", x - 6, y + WH + 1, WW + 12, 1.6);
      }
      for (const [c, rr] of acs) {
        const x = colX(c) + 13, y = rowY(rr) + WH - 24;
        R("#7d776c", x, y, 50, 25); R("#958f83", x, y, 50, 3);
        ctx.fillStyle = "#5c574f";
        for (let k = 0; k < 6; k++) ctx.fillRect(x + 5, y + 7 + k * 2.8, 40, 1.2);
      }
      // string course between the hours and the minutes
      R(STONE, 0, 846, W, 15); R(STONE_HI, 0, 846, W, 3); R(STONE_DK, 0, 858, W, 3); R("rgba(20,6,6,0.3)", 0, 861, W, 4);
      // fire escape
      ctx.fillStyle = IRON; ctx.fill(ironThick); ctx.fill(ironThin);

      // street level
      R(STONE, 0, SHOP, W, 16); R(STONE_HI, 0, SHOP, W, 3); R(STONE_DK, 0, SHOP + 12, W, 4);
      R(SIGN, 0, FASCIA, W, FRONT - FASCIA);
      ctx.strokeStyle = "#735b2a"; ctx.lineWidth = 1.5;
      for (const [x0, x1] of [[48, 316], [340, 740], [764, 1032]]) ctx.strokeRect(x0, FASCIA + 7, x1 - x0, FRONT - FASCIA - 14);
      R("#161412", 0, FRONT, W, WALK - FRONT);
      const shopWindow = (x0, x1) => {
        R(IRON, x0, FRONT + 8, x1 - x0, 222);
        g = ctx.createLinearGradient(0, FRONT + 14, 0, FRONT + 224);
        g.addColorStop(0, "#10171a"); g.addColorStop(1, "#1d262a");
        R(g, x0 + 6, FRONT + 14, x1 - x0 - 12, 210);
        ctx.save(); ctx.beginPath(); ctx.rect(x0 + 6, FRONT + 14, x1 - x0 - 12, 210); ctx.clip();
        ctx.fillStyle = "rgba(170,200,220,0.06)";
        ctx.beginPath(); ctx.moveTo(x0 + 40, FRONT + 14); ctx.lineTo(x0 + 110, FRONT + 14); ctx.lineTo(x0 + 10, FRONT + 224); ctx.lineTo(x0 - 60, FRONT + 224); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x0 + 150, FRONT + 14); ctx.lineTo(x0 + 175, FRONT + 14); ctx.lineTo(x0 + 75, FRONT + 224); ctx.lineTo(x0 + 50, FRONT + 224); ctx.fill();
        ctx.restore();
        R("#1a2a25", x0, FRONT + 236, x1 - x0, WALK - FRONT - 236);
        ctx.strokeStyle = "#2c443b"; ctx.lineWidth = 2; ctx.strokeRect(x0 + 10, FRONT + 244, x1 - x0 - 20, WALK - FRONT - 254);
      };
      shopWindow(48, 316);
      shopWindow(764, 1032);
      for (const x of [782, 906]) { R("#3a3532", x - 3, 1563, 114, 146); R("#090707", x, 1566, 108, 140); }
      // the deli front under the awning
      R("#10100f", 348, FRONT, 384, WALK - FRONT);
      paintDeli(ctx, false);
      for (const [x0, x1] of [[0, 40], [324, 348], [732, 756], [1040, 1080]]) {
        R(STONE, x0, FRONT, x1 - x0, WALK - FRONT); R(STONE_DK, x1 - 3, FRONT, 3, WALK - FRONT);
        R(STONE_HI, x0, FRONT, x1 - x0, 7); R(STONE_DK, x0, FRONT + 7, x1 - x0, 3); R(STONE_DK, x0, WALK - 26, x1 - x0, 26);
      }
      // sidewalk, curb, road
      R("#89857d", 0, WALK, W, 86); R("#5f5b55", 0, WALK, W, 3);
      ctx.fillStyle = "#6d6962";
      for (let x = 70; x < W; x += 135) ctx.fillRect(x, WALK + 3, 2, 83);
      R("#a5a199", 0, WALK + 86, W, 9); R("#2a2a2e", 0, WALK + 95, W, H - WALK - 95);
    }

    // The deli's windows and door. Drawn dim on the facade, and again lit (on
    // the glow layer) when its lights are on.
    function paintDeli(ctx, lit) {
      const top = AWN_B + 30, bot = WALK - 22;
      const glass = lit ? "#f1c987" : "#1b2226";
      const frame = lit ? "#2a1c10" : IRON;
      const shelf = lit ? "#7a5226" : "#11171a";
      const panes = [[356, 494], [586, 724]];
      for (const [x0, x1] of panes) {
        ctx.fillStyle = frame; ctx.fillRect(x0 - 4, top - 4, x1 - x0 + 8, bot - top + 8);
        ctx.fillStyle = glass; ctx.fillRect(x0, top, x1 - x0, bot - top);
        ctx.fillStyle = shelf; ctx.fillRect(x0, top + 26, x1 - x0, 3); ctx.fillRect(x0, bot - 4, x1 - x0, 4);
        // tins and bottles on the shelves
        const cols = lit ? ["#b5482c", "#3d6b4f", "#c98a2b", "#7b3a24", "#e6d6b0"] : ["#2a2422", "#232a28", "#2c2a22"];
        for (let x = x0 + 5, k = 0; x < x1 - 10; k++) {
          const w = 7 + ((k * 5) % 4) * 2, h = 14 + ((k * 7) % 5) * 2;
          ctx.fillStyle = cols[(k * 3 + (x0 > 500 ? 1 : 0)) % cols.length];
          ctx.fillRect(x, top + 26 - h, w, h);
          ctx.fillRect(x + 1, bot - 4 - h - 4, w, h + 4);
          x += w + 3;
        }
      }
      ctx.fillStyle = frame; ctx.fillRect(500, top - 14, 80, WALK - top + 14);
      ctx.fillStyle = glass; ctx.fillRect(507, top - 7, 66, WALK - top - 20);
      ctx.fillStyle = frame; ctx.fillRect(566, top + 28, 4, 16);
      if (!lit) { ctx.fillStyle = "#1a2a25"; ctx.fillRect(352, bot + 4, 146, WALK - bot - 4); ctx.fillRect(582, bot + 4, 146, WALK - bot - 4); }
    }

    // ---- wet brick: a dark sheet that slides down from the roof ---------------------------
    const WET_H = SHOP - ROOF, WET_T = WET_H + 280;
    {
      const ctx = wet.ctx;
      ctx.fillStyle = "rgba(20,8,8,0.42)";
      ctx.fillRect(0, 0, W, WET_H);
      for (let x = 0; x < W; ) {
        const w = r.range(3, 15), len = r.range(8, 250) * r.range(0.3, 1);
        ctx.fillStyle = "rgba(20,8,8,0.42)"; ctx.fillRect(x, WET_H, w, len);
        ctx.fillStyle = "rgba(20,8,8,0.22)"; ctx.fillRect(x + 1, WET_H + len, Math.max(1, w - 2), len * 0.35 + 6);
        x += w;
      }
    }

    // ---- sprites and textures --------------------------------------------------------
    const cloudW = cloudTile(noise, 512, "#ffffff", "#c3cedb", -0.06, 0.34, 0);
    const cloudD = cloudTile(noise, 512, "#566170", "#3b4450", -0.1, 0.4, 7.3);
    const patWw = wctx.createPattern(cloudW, "repeat"), patDw = wctx.createPattern(cloudD, "repeat");
    const patWf = fctx.createPattern(cloudW, "repeat"), patDf = fctx.createPattern(cloudD, "repeat");
    const matW = new DOMMatrix(), matD = new DOMMatrix();
    const warmGlow = glowSprite("#ffae5e", 0.6);
    const pinkGlow = glowSprite(NEON_GLOW, 0.5);
    const redGlow = glowSprite("#ff5a30", 0.45);
    const paleGlow = glowSprite("#fff0cf", 0.5);
    const gloss = offscreen((WW - 2 * FR) * 2, (WH - 2 * FR) * 2);
    {
      const x = gloss.getContext("2d");
      const g = x.createLinearGradient(0, 0, 0, gloss.height);
      g.addColorStop(0, "rgba(10,30,70,0.16)"); g.addColorStop(0.5, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(255,255,255,0.2)");
      x.fillStyle = g; x.fillRect(0, 0, gloss.width, gloss.height);
      x.fillStyle = "rgba(255,255,255,0.1)";
      x.beginPath(); x.moveTo(gloss.width * 0.55, 0); x.lineTo(gloss.width * 0.8, 0); x.lineTo(gloss.width * 0.3, gloss.height); x.lineTo(gloss.width * 0.05, gloss.height); x.fill();
    }

    // the daytime blind's cloth: shade under the roller, light at the hem
    const blindShade = offscreen((WW - 2 * FR) * 2, (WH - 2 * FR) * 2);
    {
      const x = blindShade.getContext("2d"), bw = blindShade.width, bh = blindShade.height;
      let g = x.createLinearGradient(0, 0, 0, bh);
      g.addColorStop(0, "rgba(60,40,20,0.22)"); g.addColorStop(0.25, "rgba(60,40,20,0.04)"); g.addColorStop(0.85, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(255,250,235,0.18)");
      x.fillStyle = g; x.fillRect(0, 0, bw, bh);
      g = x.createLinearGradient(0, 0, bw, 0);
      g.addColorStop(0, "rgba(60,40,20,0.12)"); g.addColorStop(0.18, "rgba(60,40,20,0)"); g.addColorStop(0.82, "rgba(60,40,20,0)"); g.addColorStop(1, "rgba(60,40,20,0.12)");
      x.fillStyle = g; x.fillRect(0, 0, bw, bh);
    }
    // frost creeping in from the corners of a pane on a bitter day
    const frost = offscreen((WW - 2 * FR) * 2, (WH - 2 * FR) * 2);
    {
      const x = frost.getContext("2d"), fw = frost.width, fh = frost.height;
      for (const [cx, cy, rad, a] of [[0, fh, fw * 0.62, 0.8], [fw, fh, fw * 0.55, 0.75], [0, 0, fw * 0.3, 0.45], [fw, 0, fw * 0.34, 0.45]]) {
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, `rgba(240,248,255,${a})`); g.addColorStop(0.55, `rgba(235,245,255,${a * 0.4})`); g.addColorStop(1, "rgba(235,245,255,0)");
        x.fillStyle = g; x.fillRect(0, 0, fw, fh);
      }
      x.fillStyle = "rgba(255,255,255,0.5)";
      for (let k = 0; k < 120; k++) {
        const cx = r() < 0.5 ? 0 : fw, rr = Math.pow(r(), 1.6) * fw * 0.55, an = r() * TAU;
        x.fillRect(cx + Math.cos(an) * rr, fh + Math.sin(an) * rr * 0.9, 1.5, 1.5);
      }
    }

    // ---- things that fall ---------------------------------------------------------------
    const NR = 460, NS = 520;
    const rain = new Float32Array(NR * 3), snow = new Float32Array(NS * 4);
    for (let i = 0; i < NR; i++) rain.set([r.range(-300, W + 300), r.range(0, H), r()], i * 3);
    for (let i = 0; i < NS; i++) snow.set([r.range(0, W), r.range(0, H), r(), r.range(0, TAU)], i * 4);
    const stars = new Float32Array(40 * 3);
    for (let i = 0; i < 40; i++) stars.set([r.range(8, W - 8), r.range(6, ROOF - 14), r.range(1.2, 2.6)], i * 3);

    // ---- the state the frame keeps ------------------------------------------------------
    const PAL = {
      glass: new Array(9).fill("#888888"), frame: "#fff", blind: "#333", tower: "#222", towerHi: "#333", board: BILL, boardLine: CREAM,
      awn: AWNING, awnHi: AWNING, awnVal: AWNING, pipe: CREAM, snow: "#fff", rain: "#fff", curtain: "#fff", walker: "#111", umbrella: "#da3",
      steam: "#fff", star: "#fff", drip: "#fff", lattice: "#222", sillLit: "#fa6",
      aW: 0, aD: 0, glossA: 0, sunS: 0, shTop: 0, shSide: 0, va: 0, fogA: 0, night: 0,
    };
    let lastMs = null, lastH = -1, lastM = -1, first = true;
    let wetness = 0, snowDepth = 0, scrollX = 0, palKey1 = -1, palKey2 = -1, skyKey = "", shKey = -1e9, glowKey = -1, digitVersion = 0;
    let hasFact = false, frostK = 0;

    function setDigits(h12, m) {
      target.fill(0);
      const place = (d, c0, r0) => {
        for (let rr = 0; rr < 5; rr++) for (let c = 0; c < 3; c++) if (FONT[d][rr] & (4 >> c)) target[(r0 + rr) * 9 + c0 + c] = 1;
      };
      if (h12 >= 10) place(1, 1, 0);
      place(h12 % 10, 5, 0);
      place((m / 10) | 0, 1, 5);
      place(m % 10, 5, 5);
      // three small lives, in whichever awake rooms rank highest for each
      vig.fill(0);
      for (let k = 0; k < 3; k++) {
        let best = -1, bv = -1;
        for (let i = 0; i < NWIN; i++) if (target[i] && !vig[i] && rank[i * 3 + k] > bv) { bv = rank[i * 3 + k]; best = i; }
        if (best >= 0) vig[best] = k + 1;
      }
      digitVersion++;
    }

    // Colors and layer opacities. Runs only when the light, sky or weather has moved.
    function updatePalette(s, env) {
      const dl = s.daylight, sky = s.sky, w = s.weather;
      const cloudK = env.cloudK;
      const amb = sky.mean, ambA = dl * (0.05 + 0.13 * cloudK);
      const low = smoothstep(34, 4, s.sun.alt);
      const sunCol = mix("#fff0d2", "#ff9a4e", low);
      const sunA = env.sunS * (0.07 + 0.22 * low);
      const moonK = s.moon.up ? s.moon.illumination * (1 - cloudK) : 0;
      let va = Math.pow(1 - dl, 1.25) * (0.9 - 0.07 * moonK);
      va = 1 - (1 - va) * (1 - 0.22 * env.dark);
      const under = (c) => blend(blend(blend(c, amb, ambA), sunCol, sunA), VEIL, va);
      PAL.va = va;
      PAL.night = 1 - smoothstep(0.1, 0.5, env.light);

      // fog, capped where it would wash the digits out
      const haze = smoothstep(90, 190, w.aqi) * 0.3 * dl;
      const fogCol = mix(mix(sky.mean, "#ffffff", 0.1 * dl), "#cdb98a", haze > env.murk * 0.5 ? 0.5 : 0);
      const wetBrick = blend(BRICK_AVG, "#140808", 0.42 * clamp(wetness * 1.3));
      const brickBase = under(wetBrick);
      let fogA = Math.max(0.52 * env.murk, haze);
      while (fogA > 0.04 && luminance(blend(brickBase, fogCol, fogA)) > 0.135) fogA -= 0.03;
      PAL.fogA = fogA;
      const fogged = (c, k) => blend(c, fogCol, fogA * k);
      const brickNow = fogged(brickBase, 1);

      css("sky", skyDiv, "background", `linear-gradient(90deg, ${sky.west}, ${sky.northWest} 34%, ${sky.northEast} 66%, ${sky.east})`);
      css("shA", shadow.canvas, "opacity", env.sunS.toFixed(3));
      css("shV", shadow.canvas, "visibility", env.sunS > 0.01 ? "visible" : "hidden");
      // Stack the flat washes (sky tint, sun, night veil) and the fog band into
      // one premultiplied color per gradient stop.
      const A1 = parse(amb), A2 = parse(sunCol), A3 = parse(VEIL), A4 = parse(fogCol);
      const stop = (wall, fk, pct) => {
        let r0 = 0, g0 = 0, b0 = 0, al = 0;
        const add = (c, a) => {
          if (a <= 0) return;
          r0 = r0 * (1 - a) + c[0] * a; g0 = g0 * (1 - a) + c[1] * a; b0 = b0 * (1 - a) + c[2] * a; al = al * (1 - a) + a;
        };
        if (wall) { add(A1, ambA); add(A2, sunA); add(A3, va); }
        add(A4, fogA * fk);
        const d = al > 0.0001 ? 1 / al : 0;
        return `rgba(${Math.round(r0 * d)},${Math.round(g0 * d)},${Math.round(b0 * d)},${al.toFixed(3)}) ${pct}`;
      };
      const rf = ((ROOF / H) * 100).toFixed(2);
      css("air", airDiv, "background", `linear-gradient(180deg, ${stop(false, 0.85, "0%")}, ${stop(false, 0.97, rf + "%")}, ${stop(true, 0.97, rf + "%")}, ${stop(true, 1, "14%")}, ${stop(true, 1, "66%")}, ${stop(true, 0.45, "76%")}, ${stop(true, 0.3, "100%")})`);
      const snowWalk = snowDepth > wetness;
      css("walk", walkDiv, "background", snowWalk ? "#e6eaf0" : "#0a0c12");
      css("walkA", walkDiv, "opacity", (snowWalk ? Math.min(0.9, snowDepth * 1.3) : wetness * 0.5).toFixed(3));

      // glass: the measured sky, west to east, lifted until it stands off the brick
      const skyRamp = ramp([sky.west, sky.northWest, sky.northEast, sky.east]);
      for (let c = 0; c < 9; c++) PAL.glass[c] = ensure(mix(skyRamp(c / 8), "#ffffff", 0.1 * dl), brickNow, 3.5);
      const dayK = smoothstep(0.2, 0.7, dl);
      const partly = smoothstep(0.04, 0.5, cloudK) * (1 - 0.6 * smoothstep(0.7, 1, cloudK));
      PAL.aW = dayK * (0.22 + 0.72 * partly);
      PAL.aD = clamp(dl * 3) * (0.5 * smoothstep(0.55, 1, cloudK) * (env.rainK > 0 ? 1 : 0.55) + 0.3 * cloudK * (1 - dayK));
      PAL.glossA = 0.35 + 0.65 * dl;
      PAL.sunS = env.sunS;

      PAL.frame = fogged(under("#f7f2e8"), 0.35);
      PAL.blind = under("#5a4a40");
      PAL.blindDay = fogged(under(mix("#e4e0d8", "#fff7e6", env.sunS)), 0.3);
      PAL.blindBar = fogged(under("#b8ab96"), 0.3);
      PAL.tower = fogged(blend("#3a2a22", VEIL, va * 0.9), 1.5);
      PAL.towerHi = fogged(blend("#5a4436", VEIL, va * 0.9), 1.5);
      PAL.lattice = PAL.tower;
      PAL.board = fogged(under(BILL), 0.55);
      PAL.boardLine = fogged(under("#b9ad90"), 0.4);
      PAL.awn = under(AWNING);
      PAL.awnHi = under("#2c7359");
      PAL.awnVal = under("#184a39");
      PAL.pipe = under("#e7dcc2");
      PAL.snow = blend(under("#f3f5f9"), "#aeb6c6", 0.25 * PAL.night);
      PAL.rain = blend("#dfe8f2", "#8fa0b8", 1 - dl);
      PAL.curtain = under("#f1e9d8");
      PAL.walker = under("#17161a");
      PAL.umbrella = under("#d9a531");
      PAL.steam = blend("#f2f3f6", "#59607a", 1 - dl);
      PAL.star = "#dfe6ff";
      PAL.drip = blend("#e6eef6", "#93a2b6", 1 - dl);

      // signs: light letters on dark grounds, a little dimmer after dark
      const nk = 1 - smoothstep(0.08, 0.6, dl);
      const gilt = blend(GILT, "#b3975a", 0.55 * nk), cream = blend(CREAM, "#a9a190", 0.5 * nk);
      const signNow = fogged(under(SIGN), 0.6);
      cssVar("--date", ensure(gilt, fogged(under(SIGN), 0.9), 5));
      cssVar("--gilt", ensure(gilt, signNow, 5));
      cssVar("--giltDim", ensure(blend(gilt, "#8a744a", 0.3), signNow, 4.8));
      cssVar("--bill", ensure(cream, PAL.board, 6));
      cssVar("--cream", ensure(cream, PAL.awn, 5));
      cssVar("--chan", blend("#f4ead4", "#ffe6b4", nk));
      cssVar("--chanGlow", rgba("#ffb45a", 0.75 * nk));
    }

    function paintShadows(dx, dy) {
      shadow.clear();
      const x = shadow.ctx;
      x.fillStyle = "rgba(26,6,12,0.44)";
      x.beginPath();
      x.rect(0, 254, W, Math.min(68, 13 * dy));
      x.rect(0, 332, W, Math.min(50, 7 * dy));
      x.rect(0, 861, W, Math.min(30, 4 * dy));
      x.rect(0, SHOP + 16, W, Math.min(40, 6 * dy));
      const ox = dx * 5, oy = dy * 5, rs = Math.min(WH * 0.45, 3.2 * dy), ss = Math.min(22, Math.abs(dx) * 3.2);
      for (let i = 0; i < NWIN; i++) {
        const wx = colX(i % 9), wy = rowY((i / 9) | 0);
        const sx = wx - 6, sy = wy + WH + 7, sw = WW + 12;
        x.moveTo(sx, sy); x.lineTo(sx + sw, sy); x.lineTo(sx + sw + ox, sy + oy); x.lineTo(sx + ox, sy + oy); x.closePath();
        x.rect(wx, wy, WW, rs);
        if (dx > 0) x.rect(wx, wy + rs, ss, WH - rs);
        else x.rect(wx + WW - ss, wy + rs, ss, WH - rs);
      }
      x.fill();
      x.save();
      x.beginPath(); x.rect(0, 332, W, SHOP - 332); x.clip();
      x.translate(dx * 18, dy * 13);
      x.fill(ironThick); x.fill(ironThin);
      x.restore();
    }

    // The parts of an awake window that only change with the light: white
    // frame, glass reflection, the daytime blind at one of four heights, sun
    // shade in the reveal, meeting rail and roller. Repainted when the palette
    // moves; each window is then glass + drifting cloud + one of these.
    const FRONT_N = 4;
    const fronts = [];
    for (let k = 0; k < FRONT_N; k++) fronts.push(offscreen(WW * 2, WH * 2));
    const frontLv = (k) => 0.4 + (0.22 * k) / (FRONT_N - 1);
    function paintFronts() {
      const gw = WW - 2 * FR, gh = WH - 2 * FR;
      for (let k = 0; k < FRONT_N; k++) {
        const x = fronts[k].getContext("2d");
        x.setTransform(2, 0, 0, 2, 0, 0);
        x.clearRect(0, 0, WW, WH);
        x.fillStyle = PAL.frame; x.fillRect(0, 0, WW, WH);
        x.clearRect(FR, FR, gw, gh);
        x.globalAlpha = PAL.glossA; x.drawImage(gloss, FR, FR, gw, gh); x.globalAlpha = 1;
        // A cream roller blind part way down: sunlit cloth is the brightest
        // thing on the wall, which is what makes the digits read by day.
        const bh = gh * frontLv(k);
        x.fillStyle = PAL.blindDay; x.fillRect(FR + 1, FR, gw - 2, bh);
        x.drawImage(blindShade, FR + 1, FR, gw - 2, bh);
        x.fillStyle = PAL.blindBar; x.fillRect(FR + 1, FR + bh - 3, gw - 2, 3);
        x.fillRect(FR + gw * 0.5 - 1, FR + bh, 2, 5);
        if (PAL.sunS > 0.03) {
          x.globalAlpha = 0.3 * PAL.sunS; x.fillStyle = "#10182c";
          x.fillRect(FR, FR, gw, PAL.shTop);
          if (PAL.shSide > 0) x.fillRect(FR, FR + PAL.shTop, PAL.shSide, gh - PAL.shTop);
          else x.fillRect(FR + gw + PAL.shSide, FR + PAL.shTop, -PAL.shSide, gh - PAL.shTop);
          x.globalAlpha = 1;
        }
        x.fillStyle = PAL.frame; x.fillRect(FR, FR + gh * 0.5 - 1.5, gw, 3);
        x.fillStyle = PAL.blind; x.fillRect(FR, FR, gw, 5);
      }
    }

    // One awake window: sky in the glass, or a lit room, behind a white frame.
    function drawWin(i, a, lamp, s, flash) {
      const c = i % 9, x = colX(c), y = rowY((i / 9) | 0);
      wctx.clearRect(x - 1, y - 1, WW + 2, WH + 2);
      const e = a >= 1 ? 1 : ease.cubicInOut(a);
      const top = y + WH * (1 - e); // the blind rolls up from the sill
      if (y + WH - top < 0.5) return;
      const clipped = e < 1;
      if (clipped) { wctx.save(); wctx.beginPath(); wctx.rect(x, top, WW, y + WH - top); wctx.clip(); }
      const gx = x + FR, gy = y + FR, gw = WW - 2 * FR, gh = WH - 2 * FR;
      if (lamp < 0.995) {
        const k = blindK[i], cy = gy + gh * frontLv(k) - 3;
        wctx.fillStyle = PAL.glass[c]; wctx.fillRect(gx, cy, gw, gy + gh - cy);
        if (PAL.aW > 0.01) { wctx.globalAlpha = PAL.aW; wctx.fillStyle = patWw; wctx.fillRect(gx, cy, gw, gy + gh - cy); }
        if (PAL.aD > 0.01) { wctx.globalAlpha = PAL.aD; wctx.fillStyle = patDw; wctx.fillRect(gx, cy, gw, gy + gh - cy); }
        // the lower sash pushed up on a warm day: the room's shade behind it
        if (isOpen[i] && env.openK > 0.02) { wctx.globalAlpha = 0.6 * env.openK; wctx.fillStyle = "#0e1218"; wctx.fillRect(gx, gy + gh * 0.5, gw, gh * 0.5); }
        if (flash > 0.01) { wctx.globalAlpha = flash * 0.4; wctx.fillStyle = "#e1e6ff"; wctx.fillRect(gx, cy, gw, gy + gh - cy); }
        wctx.globalAlpha = 1;
        wctx.drawImage(fronts[k], x, y, WW, WH);
      } else {
        wctx.fillStyle = PAL.frame; wctx.fillRect(x, y, WW, WH);
      }
      if (lamp > 0.005) {
        wctx.globalAlpha = lamp; wctx.drawImage(rooms[roomOf[i]], gx, gy, gw, gh); wctx.globalAlpha = 1;
        const v = vig[i];
        if (v && lamp > 0.4) {
          const t = s.t;
          if (v === 1) {
            // a cat on the sill, tail flicking
            const bx = gx + gw - 20, by = gy + gh;
            wctx.fillStyle = "#1d0f08"; wctx.strokeStyle = "#1d0f08";
            wctx.beginPath();
            wctx.ellipse(bx, by - 8, 11, 10, 0, 0, TAU);
            wctx.ellipse(bx + 3, by - 22, 6.5, 6, 0, 0, TAU);
            wctx.moveTo(bx - 2.5, by - 26); wctx.lineTo(bx - 1.5, by - 33); wctx.lineTo(bx + 3, by - 27);
            wctx.moveTo(bx + 4, by - 27); wctx.lineTo(bx + 8.5, by - 33); wctx.lineTo(bx + 9, by - 25);
            wctx.fill();
            const flick = Math.sin(t * 1.3) * 5 + Math.sin(t * 3.1) * 2.5 * smoothstep(0.3, 1, Math.sin(t * 0.37));
            wctx.lineWidth = 3.4; wctx.lineCap = "round";
            wctx.beginPath(); wctx.moveTo(bx - 9, by - 3); wctx.quadraticCurveTo(bx - 24, by - 1, bx - 30, by - 10 + flick);
            wctx.stroke();
          } else if (v === 2) {
            // someone walks past the lamp now and then
            const per = 31, u = (t % per) / 9;
            if (u < 1) {
              const dir = Math.floor(t / per) % 2 ? -1 : 1;
              const px = dir > 0 ? gx - 22 + u * (gw + 44) : gx + gw + 22 - u * (gw + 44);
              wctx.save(); wctx.beginPath(); wctx.rect(gx, gy, gw, gh); wctx.clip();
              wctx.fillStyle = "rgba(46,20,8,0.8)";
              wctx.beginPath();
              wctx.ellipse(px, gy + gh * 0.36 + Math.sin(t * 4.2) * 1.2, 9, 10.5, 0, 0, TAU);
              wctx.moveTo(px - 19, gy + gh); wctx.quadraticCurveTo(px - 19, gy + gh * 0.52, px, gy + gh * 0.5); wctx.quadraticCurveTo(px + 19, gy + gh * 0.52, px + 19, gy + gh);
              wctx.fill();
              wctx.restore();
            }
          } else {
            // a television: slow blue light, never a flicker
            const k = 0.3 + 0.2 * noise.n2(t * 0.55, 9.1) + 0.1 * noise.n2(t * 1.4, 2.2);
            wctx.globalAlpha = k * lamp; wctx.fillStyle = "#78aaff"; wctx.fillRect(gx, gy, gw, gh);
            wctx.globalAlpha = 0.85; wctx.fillStyle = "#1e0e08"; wctx.fillRect(gx + 8, gy + gh - 22, 30, 22);
            wctx.globalAlpha = clamp(0.5 + k * 0.6); wctx.fillStyle = "#bedcff"; wctx.fillRect(gx + 11, gy + gh - 19, 24, 14);
            wctx.globalAlpha = 1;
          }
        }
      }
      if (frostK > 0.01) { wctx.globalAlpha = frostK * (1 - 0.4 * lamp); wctx.drawImage(frost, gx, gy, gw, gh); wctx.globalAlpha = 1; }
      if (lamp > 0.005) {
        wctx.fillStyle = PAL.frame; wctx.fillRect(gx, gy + gh * 0.5 - 1.5, gw, 3);
        wctx.fillStyle = PAL.blind; wctx.fillRect(gx, gy, gw, 5);
      }
      if (clipped) { wctx.fillStyle = PAL.blind; wctx.fillRect(x, top, WW, 4); wctx.restore(); }
    }

    // Light that lit rooms and shop windows throw on the wall and the street.
    function paintGlow(s, env) {
      glow.clear();
      const night = PAL.night;
      gctx.globalCompositeOperation = "lighter";
      const size = 250 * (1 + 0.7 * env.murk);
      for (let i = 0; i < NWIN; i++) {
        const a = awake[i];
        if (a <= 0.02) continue;
        const lamp = a * (1 - smoothstep(lampAt[i] - 0.04, lampAt[i] + 0.04, env.light));
        if (lamp < 0.02) continue;
        gctx.globalAlpha = lamp * (0.42 + 0.3 * env.murk);
        gctx.drawImage(warmGlow, colX(i % 9) + WW / 2 - size / 2, rowY((i / 9) | 0) + WH / 2 - size / 2, size, size);
      }
      gctx.globalCompositeOperation = "source-over";
      for (let i = 0; i < NWIN; i++) {
        const a = awake[i];
        if (a < 1) continue;
        const lamp = 1 - smoothstep(lampAt[i] - 0.04, lampAt[i] + 0.04, env.light);
        if (lamp < 0.05) continue;
        gctx.globalAlpha = lamp * 0.55;
        gctx.fillStyle = "#c98548";
        gctx.fillRect(colX(i % 9) - 6, rowY((i / 9) | 0) + WH + 1, WW + 12, 2.2);
      }
      // the shops
      if (night > 0.02) {
        gctx.globalAlpha = night;
        paintDeli(gctx, true);
        gctx.globalAlpha = night * 0.5;
        gctx.drawImage(warmGlow, 300, 1730, 480, 190);
        gctx.globalAlpha = night * 0.55;
        gctx.drawImage(pinkGlow, 22, 1486, 320, 300);
        gctx.globalAlpha = night * 0.4;
        gctx.drawImage(redGlow, 764, 1530, 268, 220);
        gctx.globalAlpha = 1;
        gctx.fillStyle = "#090707";
        gctx.fillRect(782, 1566, 108, 140); gctx.fillRect(906, 1566, 108, 140);
      }
      // wet pavement holds the light
      const wetK = clamp(wetness * 1.4) * (0.35 + 0.65 * night);
      if (wetK > 0.02) {
        gctx.globalAlpha = wetK * 0.9; gctx.drawImage(pinkGlow, 40, WALK - 40, 284, 240);
        gctx.globalAlpha = wetK * 0.8 * (0.3 + 0.7 * night); gctx.drawImage(warmGlow, 330, WALK - 50, 420, 260);
        gctx.globalAlpha = wetK * 0.7; gctx.drawImage(redGlow, 770, WALK - 40, 256, 230);
      }
      gctx.globalAlpha = 1;
    }

    const mound = (x0, x1, y, h) => {
      fctx.moveTo(x0, y + 0.5);
      fctx.quadraticCurveTo(x0 + 1.5, y - h, x0 + 8, y - h);
      fctx.lineTo(x1 - 8, y - h * 0.86);
      fctx.quadraticCurveTo(x1 - 1.5, y - h * 0.86, x1, y + 0.5);
    };

    const env = { cloudK: 0, rainK: 0, snowK: 0, murk: 0, dark: 0, light: 1, sunS: 0, openK: 0 };

    return {
      frame(s) {
        const w = s.weather, dl = s.daylight, t = s.t, dt = s.dt;
        const jumped = first || lastMs == null || Math.abs(s.ms - lastMs - dt * 1000) > 4000;
        lastMs = s.ms;

        // ---- what the weather is doing, as a few numbers ----
        const cloudK = clamp(w.cloud / 100);
        const isSnow = w.falling === "snow";
        const rainK = w.falling && !isSnow ? w.intensity : 0;
        const snowK = isSnow ? w.intensity : 0;
        const murk = w.fog ? 1 : 0.85 * smoothstep(2.5, 0.15, w.visibility);
        const gloom = Math.max(0.5 * cloudK * cloudK, rainK > 0 ? 0.55 + 0.45 * rainK : 0, snowK > 0 ? 0.45 : 0, 0.8 * murk);
        const light = dl * (1 - 0.42 * gloom);
        const windX = -Math.sin((w.windDir * Math.PI) / 180);
        const ws = lerp(w.wind, Math.max(w.gust, w.wind), smoothstep(0.3, 0.9, 0.5 + 0.5 * noise.n2(t * 0.21, 3.7)));
        const rel = ((s.sun.az - 225) * Math.PI) / 180; // the facade faces south-west
        const facing = smoothstep(0.02, 0.4, Math.cos(rel));
        const sunS = dl * (1 - smoothstep(0.35, 0.9, cloudK)) * (1 - murk) * (w.falling ? 0.15 : 1) * facing * smoothstep(-1, 7, s.sun.alt);
        env.cloudK = cloudK; env.rainK = rainK; env.snowK = snowK; env.murk = murk; env.light = light; env.sunS = sunS;
        env.dark = rainK > 0 ? rainK : snowK * 0.4;
        env.openK = smoothstep(60, 72, w.temp) * (w.falling ? 0 : 1);
        frostK = smoothstep(30, 14, w.temp) * 0.9;

        // wet brick and lying snow build and fade slowly; a new showing starts settled
        let wetT = rainK > 0 ? 0.3 + 0.7 * rainK : 0;
        let snowT = snowK > 0 ? 0.45 + 0.55 * snowK : 0;
        const ph = s.pastHours;
        if (ph.length > 2) {
          const recent = Math.max(ph[ph.length - 1].precip, ph[ph.length - 2].precip);
          if (!w.falling && recent > 0.01) { if (w.temp > 34) wetT = 0.3; else snowT = 0.4; }
        }
        wetness = jumped ? wetT : approach(wetness, wetT, dt, 25);
        snowDepth = jumped ? snowT : approach(snowDepth, snowT, dt, 60);

        // a thunderstorm: a slow swell of light, now and then
        let flash = 0;
        if (w.kind === "storm") {
          const n = Math.floor(t / 14), u = t - (n * 14 + 2 + hash(n, s.seed + 5) * 8);
          if (u > 0 && u < 2.6) flash = smoothstep(0, 0.6, u) * (1 - smoothstep(0.7, 2.6, u));
        }

        // ---- the time ----
        if (s.clock.h12 !== lastH || s.clock.m !== lastM) {
          lastH = s.clock.h12; lastM = s.clock.m;
          setDigits(lastH, lastM);
          let k = 0;
          for (let i = 0; i < NWIN; i++) if (target[i] !== (awake[i] > 0.5 ? 1 : 0)) delay[i] = 0.1 + 0.13 * ((k++ * 7) % 11);
        }
        let moving = false;
        for (let i = 0; i < NWIN; i++) {
          const tg = target[i];
          let a = awake[i];
          if (a === tg) continue;
          if (jumped) a = tg;
          else if (delay[i] > 0) delay[i] -= dt;
          else a = tg ? Math.min(1, a + dt / 0.8) : Math.max(0, a - dt / 0.8);
          awake[i] = a;
          moving = true;
        }

        // ---- palette, only when something has moved ----
        const sh = s.sun;
        const k1 = Math.round(dl * 400) + 1000 * Math.round(w.cloud) + 2e5 * Math.round(murk * 60) + 2e7 * Math.round(wetness * 40);
        const k2 = Math.round(sh.alt * 2) + 1000 * Math.round(sh.az / 2) + 1e6 * Math.round(w.aqi / 4) + 1e8 * Math.round(snowDepth * 30) + 1e10 * Math.round(sunS * 50) + 1e12 * Math.round(light * 200);
        let palChanged = false;
        // sun shadows: length and lean follow the sun
        if (sunS > 0.01) {
          const dx = clamp(Math.tan(rel), -2.2, 2.2), dy = clamp(Math.tan((sh.alt * Math.PI) / 180) / Math.max(0.2, Math.cos(rel)), 0.2, 3.4);
          const key = Math.round(dx * 16) * 1000 + Math.round(dy * 16);
          if (key !== shKey) {
            shKey = key; paintShadows(dx, dy);
            PAL.shTop = Math.min(26, 3.4 * dy); PAL.shSide = clamp(dx * 3.4, -20, 20);
            palChanged = true;
          }
        }
        if (k1 !== palKey1 || k2 !== palKey2 || skyKey !== s.sky.mean + s.sky.west) {
          palKey1 = k1; palKey2 = k2; skyKey = s.sky.mean + s.sky.west;
          updatePalette(s, env);
          palChanged = true;
        }
        if (palChanged) paintFronts();
        css("airO", airDiv, "opacity", (1 - Math.round(flash * 0.16 * 100) / 100).toFixed(2));
        css("flash", flashDiv, "opacity", (Math.round(flash * 0.34 * 100) / 100).toFixed(2));
        css("wet", wet.canvas, "transform", `translateY(${-Math.round((1 - clamp(wetness)) * WET_T)}px)`);
        css("wetV", wetClip, "visibility", wetness > 0.01 ? "visible" : "hidden");


        // ---- clouds drift at the wind's speed ----
        scrollX += (windX >= 0 ? 1 : -1) * (3 + ws * 2.4) * dt;
        matW.e = scrollX; matW.f = 30;
        matD.e = scrollX * 0.8 + 140; matD.f = 210;
        patWw.setTransform(matW); patWf.setTransform(matW); patDw.setTransform(matD); patDf.setTransform(matD);

        // ---- windows ----
        const cloudsShow = PAL.aW + PAL.aD > 0.02;
        for (let i = 0; i < NWIN; i++) {
          const a = awake[i];
          if (a <= 0) {
            if (drawn[i]) { wctx.clearRect(colX(i % 9) - 1, rowY((i / 9) | 0) - 1, WW + 2, WH + 2); drawn[i] = 0; }
            continue;
          }
          const lamp = 1 - smoothstep(lampAt[i] - 0.04, lampAt[i] + 0.04, light);
          if (drawn[i] === 2 && a >= 1 && !palChanged && !(lamp < 0.995 && (cloudsShow || flash > 0 || env.lastFlash > 0)) && !(vig[i] && lamp > 0.4)) continue;
          drawWin(i, a, lamp, s, flash);
          drawn[i] = a >= 1 ? 2 : 1;
        }
        env.lastFlash = flash;

        const gk = digitVersion * 7 + (moving ? s.frame : 0);
        if (palChanged || gk !== glowKey) { glowKey = gk; paintGlow(s, env); }

        // ---- the fx layer: sky, roof, weather, street ----
        fx.clear();
        // stars, and cloud crossing the strip of sky above the roof
        const starA = (1 - smoothstep(0.02, 0.3, dl)) * (1 - cloudK) * (1 - murk);
        if (starA > 0.02) {
          fctx.globalAlpha = starA * 0.9; fctx.fillStyle = PAL.star; fctx.beginPath();
          for (let i = 0; i < 40; i++) fctx.rect(stars[i * 3], stars[i * 3 + 1], stars[i * 3 + 2], stars[i * 3 + 2]);
          fctx.fill();
        }
        if (PAL.aW > 0.01) { fctx.globalAlpha = PAL.aW; fctx.fillStyle = patWf; fctx.fillRect(0, 0, W, ROOF); }
        if (PAL.aD > 0.01) { fctx.globalAlpha = PAL.aD * 0.8; fctx.fillStyle = patDf; fctx.fillRect(0, 0, W, ROOF); }
        fctx.globalAlpha = 1;
        // steam off the roof when it is cold
        const steamK = smoothstep(46, 26, w.temp);
        if (steamK > 0.02) {
          fctx.fillStyle = PAL.steam;
          for (let k = 0; k < 9; k++) {
            const p = (t * 0.085 + k / 9) % 1;
            fctx.globalAlpha = steamK * 0.36 * (1 - p) * smoothstep(0, 0.12, p) * (0.5 + 0.5 * (1 - PAL.night * 0.5));
            fctx.beginPath();
            fctx.arc(1048 + windX * Math.min(26, ws) * p * 9 + Math.sin(t * 0.7 + k * 2.1) * 5 * p, 168 - p * 120 * (1 - Math.min(0.75, ws / 40)), 7 + p * 28, 0, TAU);
            fctx.fill();
          }
          fctx.globalAlpha = 1;
        }
        // water tower, vent, billboard
        fctx.fillStyle = PAL.tower; fctx.fill(roofPath);
        fctx.fillStyle = PAL.towerHi; fctx.fill(hoops);
        if (hasFact) {
          fctx.fillStyle = PAL.tower; fctx.fill(lampArms);
          fctx.fillStyle = PAL.board; fctx.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);
          fctx.strokeStyle = PAL.boardLine; fctx.lineWidth = 2; fctx.strokeRect(BOARD_X + 7, BOARD_Y + 7, BOARD_W - 14, BOARD_H - 14);
          if (PAL.night > 0.02) {
            fctx.save(); fctx.beginPath(); fctx.rect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H); fctx.clip();
            fctx.globalAlpha = PAL.night * 0.4;
            for (let k = 0; k < 4; k++) fctx.drawImage(paleGlow, lampXs[k] - 150, BOARD_Y - 120, 300, 260);
            fctx.restore(); fctx.globalAlpha = 1;
          }
        } else { fctx.fillStyle = PAL.lattice; fctx.fill(lattice); }
        // fog passing in front of the wall
        if (murk > 0.05 && PAL.fogA > 0.02) { fctx.globalAlpha = Math.min(0.2, PAL.fogA * 0.4); fctx.fillStyle = patWf; fctx.fillRect(0, 0, W, SHOP); fctx.globalAlpha = 1; }

        // the deli awning; its valance flaps with the wind
        fctx.fillStyle = PAL.awn;
        fctx.beginPath(); fctx.moveTo(AWN_X0 + 14, AWN_T); fctx.lineTo(AWN_X1 - 14, AWN_T); fctx.lineTo(AWN_X1, AWN_B); fctx.lineTo(AWN_X0, AWN_B); fctx.closePath(); fctx.fill();
        fctx.fillStyle = PAL.awnHi; fctx.fillRect(AWN_X0 + 14, AWN_T, AWN_X1 - AWN_X0 - 28, 5);
        fctx.fillStyle = PAL.awnVal;
        fctx.beginPath(); fctx.moveTo(AWN_X0, AWN_B);
        {
          const n = 12, sw = (AWN_X1 - AWN_X0) / n, amp = 0.8 + Math.min(8, ws * 0.3), sp = 1.1 + ws * 0.09;
          fctx.lineTo(AWN_X0, AWN_B + 18 + Math.sin(t * sp) * amp);
          for (let k = 0; k < n; k++) {
            const xa = AWN_X0 + k * sw;
            fctx.quadraticCurveTo(xa + sw / 2, AWN_B + 34 + Math.sin(t * sp - (k + 0.5) * 0.8) * amp * 1.5, xa + sw, AWN_B + 18 + Math.sin(t * sp - (k + 1) * 0.8) * amp);
          }
        }
        fctx.lineTo(AWN_X1, AWN_B); fctx.closePath(); fctx.fill();
        fctx.fillStyle = PAL.pipe; fctx.fillRect(AWN_X0, AWN_B - 1.5, AWN_X1 - AWN_X0, 3);

        // curtains out of the open windows on a warm day
        if (env.openK > 0.02) {
          const dir = windX >= 0 ? 1 : -1, lift = clamp(ws / 24);
          fctx.fillStyle = PAL.curtain; fctx.globalAlpha = 0.94; fctx.beginPath();
          for (let i = 0; i < NWIN; i++) {
            if (!isOpen[i] || awake[i] < 1) continue;
            const x = colX(i % 9), y = rowY((i / 9) | 0);
            const L = (16 + Math.min(72, ws * 3.4)) * env.openK * (0.75 + 0.5 * rank[i * 3]);
            const xa = dir > 0 ? x + WW - 12 : x + 12, y0 = y + WH * 0.52, y1 = y + WH - 5;
            const p = t * (1.5 + ws * 0.08) + i;
            const tx0 = xa + dir * L, ty0 = y0 + (1 - lift) * 20 + Math.sin(p) * (2 + ws * 0.22), ty1 = y1 + (1 - lift) * 12 + Math.sin(p + 1.1) * (3 + ws * 0.28);
            fctx.moveTo(xa, y0);
            fctx.quadraticCurveTo(xa + dir * L * 0.5, y0 + Math.sin(p + 2) * 4 - 5 * lift, tx0, ty0);
            fctx.lineTo(tx0 - dir * 5, ty1);
            fctx.quadraticCurveTo(xa + dir * L * 0.45, y1 + Math.sin(p + 0.6) * 4 + 5, xa - dir * 14, y1);
            fctx.closePath();
          }
          fctx.fill(); fctx.globalAlpha = 1;
        }

        // snow lying on every ledge
        if (snowDepth > 0.02) {
          const d = snowDepth * 9;
          fctx.fillStyle = PAL.snow; fctx.beginPath();
          for (let i = 0; i < LEDGES.length; i += 4) mound(LEDGES[i], LEDGES[i + 1], LEDGES[i + 2], d * LEDGES[i + 3]);
          if (hasFact) for (let i = 0; i < BLEDGE.length; i += 4) mound(BLEDGE[i], BLEDGE[i + 1], BLEDGE[i + 2], d * BLEDGE[i + 3]);
          mound(AWN_X0 + 14, AWN_X1 - 14, AWN_T + 2, d * 1.2);
          fctx.fill();
        }

        // drips: off the sills and the awning in rain, off the air conditioners in heat
        if (rainK > 0.02) {
          fctx.fillStyle = PAL.drip; fctx.globalAlpha = 0.75; fctx.beginPath();
          const n = Math.round(14 + 34 * rainK);
          for (let k = 0; k < n; k++) {
            const rate = 0.55 + 0.4 * hash(k, 3), u = t * rate + hash(k, 9), cyc = Math.floor(u), p = u - cyc;
            const i = Math.floor(hash(k * 131 + cyc, s.seed) * NWIN);
            const x = colX(i % 9) - 4 + hash(cyc, k) * (WW + 8), y = rowY((i / 9) | 0) + WH + 7 + p * p * 62;
            fctx.rect(x, y, 2, 4 + p * 7);
          }
          for (let k = 0; k < 9; k++) {
            const u = t * (0.7 + 0.3 * hash(k, 4)) + hash(k, 5), p = u - Math.floor(u);
            fctx.rect(AWN_X0 + 10 + hash(Math.floor(u), k + 40) * (AWN_X1 - AWN_X0 - 20), AWN_B + 30 + p * p * 80, 2, 5 + p * 7);
          }
          fctx.fill(); fctx.globalAlpha = 1;
        }
        const acK = smoothstep(76, 90, w.temp);
        if (acK > 0.02) {
          fctx.fillStyle = PAL.drip; fctx.globalAlpha = 0.85 * acK; fctx.beginPath();
          for (let k = 0; k < acs.length; k++) {
            const u = t * (0.5 + 0.25 * hash(k, 21)) + hash(k, 22), p = u - Math.floor(u);
            fctx.rect(colX(acs[k][0]) + 20 + hash(k, 23) * 34, rowY(acs[k][1]) + WH + 2 + p * p * 150, 2.4, 5 + p * 7);
          }
          fctx.fill(); fctx.globalAlpha = 1;
        }

        // someone passes the shops
        {
          const per = 44, n = Math.floor(t / per), u = ((t - n * per) * 52) / (W + 180);
          if (u < 1) {
            const dir = hash(n, s.seed + 11) < 0.5 ? 1 : -1, sc = 0.92 + 0.16 * hash(n, 5);
            const x = dir > 0 ? -90 + u * (W + 180) : W + 90 - u * (W + 180);
            const gy = WALK + 80, st = t * 5.4, swing = Math.sin(st), bob = -Math.abs(Math.cos(st)) * 2.2;
            const hip = gy - 38 * sc + bob;
            fctx.strokeStyle = PAL.walker; fctx.fillStyle = PAL.walker; fctx.lineCap = "round"; fctx.lineWidth = 7 * sc;
            fctx.beginPath();
            fctx.moveTo(x, hip); fctx.lineTo(x + swing * 13 * sc, gy);
            fctx.moveTo(x, hip); fctx.lineTo(x - swing * 13 * sc, gy);
            fctx.stroke();
            fctx.beginPath();
            fctx.moveTo(x - 8 * sc, hip - 36 * sc); fctx.lineTo(x + 8 * sc, hip - 36 * sc); fctx.lineTo(x + 12 * sc, hip + 8 * sc); fctx.lineTo(x - 12 * sc, hip + 8 * sc); fctx.closePath();
            fctx.arc(x + dir * 1.5, hip - 46 * sc, 8 * sc, 0, TAU);
            fctx.fill();
            if (w.falling) {
              fctx.lineWidth = 2; fctx.beginPath(); fctx.moveTo(x + dir * 9, hip - 20 * sc); fctx.lineTo(x + dir * 9, hip - 64 * sc); fctx.stroke();
              fctx.fillStyle = PAL.umbrella; fctx.beginPath(); fctx.ellipse(x + dir * 9, hip - 62 * sc, 31 * sc, 17 * sc, 0, Math.PI, TAU); fctx.fill();
            }
          }
        }

        // rain
        if (rainK > 0.02) {
          const n = Math.round(NR * Math.pow(rainK, 0.8));
          const vx = clamp(windX * ws * 34, -900, 900);
          fctx.strokeStyle = PAL.rain; fctx.lineCap = "butt";
          for (let pass = 0; pass < 2; pass++) {
            fctx.globalAlpha = pass ? 0.5 : 0.28; fctx.lineWidth = pass ? 1.8 : 1.1;
            fctx.beginPath();
            for (let i = pass; i < n; i += 2) {
              const j = i * 3, z = rain[j + 2], vy = 950 + 650 * z;
              rain[j] += vx * dt; rain[j + 1] += vy * dt;
              if (rain[j + 1] > H + 40) { rain[j + 1] -= H + 80; rain[j] = -300 + r() * (W + 600); }
              const len = (30 + 46 * z) * (0.8 + 0.5 * rainK);
              fctx.moveTo(rain[j], rain[j + 1]); fctx.lineTo(rain[j] - (vx / vy) * len, rain[j + 1] - len);
            }
            fctx.stroke();
          }
          fctx.globalAlpha = 1;
        }
        // snow
        if (snowK > 0.02) {
          const n = Math.round(NS * (0.35 + 0.65 * snowK));
          const vx = windX * ws * 9;
          fctx.fillStyle = PAL.snow; fctx.globalAlpha = 0.92; fctx.beginPath();
          for (let i = 0; i < n; i++) {
            const j = i * 4, z = snow[j + 2];
            snow[j] += (vx * (0.6 + 0.6 * z) + Math.sin(t * 0.9 + snow[j + 3]) * 16) * dt;
            snow[j + 1] += (48 + 95 * z + Math.abs(vx) * 0.12) * dt;
            if (snow[j + 1] > H + 6) { snow[j + 1] = -6; snow[j] = r() * W; }
            if (snow[j] > W + 6) snow[j] -= W + 12; else if (snow[j] < -6) snow[j] += W + 12;
            const rad = 1.3 + 2.4 * z;
            fctx.moveTo(snow[j] + rad, snow[j + 1]); fctx.arc(snow[j], snow[j + 1], rad, 0, TAU);
          }
          fctx.fill(); fctx.globalAlpha = 1;
        }

        // ---- the signs ----
        const tx_ = s.text;
        if (put("date", dateEl, tx_.date)) fitText(dateEl, 952);
        if (put("moon", moonA, tx_.moon.split(" ")[0])) { moonB.textContent = tx_.moon.split(" ").slice(1).join(" "); fitText(moonA, 236); fitText(moonB, 236); }
        put("ampm", ampmEl, tx_.ampm);
        if (put("aqi", aqiEl, tx_.aqi)) fitText(aqiEl, 104);
        if (put("uv", uvEl, tx_.uv)) fitText(uvEl, 104);
        put("sunL", sunL, tx_.sunLabel);
        if (put("sunV", sunV, tx_.sunValue)) fitText(sunV, 196);
        put("temp", tempEl, tx_.temp);
        if (put("cond", condEl, tx_.condition)) {
          condEl.style.letterSpacing = "";
          if (fitText(condEl, 372) < 44) { condEl.style.letterSpacing = "0"; fitText(condEl, 372); }
        }
        if (shown.factV !== tx_.factValue || shown.factL !== tx_.factLabel) {
          put("factL", factL, tx_.factLabel);
          put("factV", factV, tx_.factValue);
          hasFact = tx_.factValue !== "";
          factEl.style.display = hasFact ? "flex" : "none";
          if (hasFact) {
            // one line if it fits large, otherwise two lines
            factV.style.whiteSpace = "nowrap"; factV.style.fontSize = "52px"; factV.style.lineHeight = "60px";
            if (factV.scrollWidth > BOARD_W - 60) {
              factV.style.whiteSpace = "normal";
              for (const size of [40, 38, 36]) { factV.style.fontSize = `${size}px`; factV.style.lineHeight = `${size + 5}px`; if (factV.offsetHeight <= (size + 5) * 2 + 2) break; }
            }
          }
        }
        first = false;
      },
    };
  },
};

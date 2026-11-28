// Lights On
//
// One Queens apartment building, front elevation, fills the frame. The time is
// spelled by which windows are awake, in a 3 x 5 window-pixel font: hours on
// the upper five floors, minutes on the lower five, AM/PM as the deli's name.
// Every other readout is one of the building's signs: the date carved in the
// frieze, today's fact on the rooftop billboard (its bare frame when there is
// none), the moon phase as the bar's name, the sunrise/sunset countdown in the
// bar's neon, temperature and condition on the deli awning, air quality and UV
// on the two lotto panels.
//
// How the conditions drive it:
// - Bright day: an awake window is a white frame with a cream blind most of
//   the way down (sunlit cloth, the brightest thing on the wall, so the
//   digits read from across a room) and the real sky in the glass below it:
//   the four measured sky colors, west on the left columns to east on the
//   right, with cloud as thick as the cover. Sleeping windows have dark,
//   recessed shades, a clear step below the brick. The fire escape and the
//   air conditioners keep to the two outer bays, so nothing crosses a figure.
// - Dim light: people switch lamps on whenever the room is dim, so under a
//   closed sky, in rain, snow or fog and in the half-light each awake window
//   crosses its own threshold and its lamp comes on; at dusk the building
//   lights up room by room. Only a bright, open day relies on the blinds. At
//   night the digits are warm rooms throwing light on dark brick, with three
//   small lives (a cat, someone passing, a TV).
// - Sun: hard shadows under the cornice, sills and fire escape, their length
//   and lean set by where the sun is; a warm wash when it is low.
// - Rain darkens the brick from the roof down and drips off the sills and the
//   awning; wet pavement holds the shop lights. Snow settles on every ledge,
//   the awning and the sidewalk. Fog and smog haze the wall and swell the
//   glows. Wind slants what falls, flaps the awning, drives the cloud across
//   the sky and blows sheer curtains out of open windows on warm days. In real
//   heat the windows shut, the air conditioners drip and stain the brick.
//   Bitter cold frosts the panes and puts steam on the roof. A thunderstorm is
//   a slow swell of light, never a flash.
//
// Layers, bottom to top: the wall (one opaque canvas composed only when the
// light, the weather or the minute moves: the measured sky, brick, air, wet,
// lamplight, shadows, every settled window, and the grain, baked in); the
// moving layer (cloud, roof and billboard, weather, street life, vignettes,
// and any window that is switching on or off); the type (DOM). Only two
// full-stage layers are composited each frame, which is what holds 30 fps.

import {
  W, H, TAU, clamp, lerp, smoothstep, approach, ease, rng, hash, createNoise,
  mix, adjust, rgba, luminance, contrast, parse, toHex, ramp,
  el, addStyle, canvas2d, fitText,
} from "../lib/kit.js";

// ---- geometry (stage units) -------------------------------------------------
// (the roofline was lowered 48 px, out of the ten floors, so the billboard can stand
// tall enough for a two-line fact with its lines well apart; the frieze's date sign
// was made 12 px taller so the date stands clear of its rules)
const ROOF = 262; // top of the parapet
const DR = ROOF - 214; // how far the roof furniture moved down with it
const SIGN_Y = ROOF + 40, SIGN_H = 80; // the date's sign in the frieze
const FRIEZE_B = SIGN_Y + SIGN_H + 10; // bottom of the frieze's stone band
const GX = 54, CW = 108, CH = 94; // window grid: 9 columns, 10 floors
const WW = 90, WH = 74, FR = 5; // window opening and frame width
const HOURS_Y = FRIEZE_B + 4, STRING = HOURS_Y + 5 * CH + 10, MINS_Y = HOURS_Y + 5 * CH + 36;
// (the fascia, awning and shopfronts were made taller, and the sidewalk narrower,
// so the two-line bar name and the awning's temperature and condition have room)
const SHOP = 1378, FASCIA = 1394, FRONT = 1544, WALK = 1830, CURB = 1886;
const NWIN = 90;
const colX = (c) => GX + c * CW + (CW - WW) / 2;
const rowY = (r) => (r < 5 ? HOURS_Y + r * CH : MINS_Y + (r - 5) * CH) + 12;
const BOARD_X = 236, BOARD_Y = 44, BOARD_W = 780, BOARD_H = 168;
// a fact that wraps gets a taller board, reaching down to the parapet
const BOARD_Y2 = 34, BOARD_H2 = ROOF - 2 - BOARD_Y2;
const AWN_X0 = 336, AWN_X1 = 744, AWN_T = FRONT + 2, AWN_B = 1754;
const LED_Y = FRONT + 48, AQI_X = 778, UV_X = 910; // the two lotto panels

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

// A soft cloud field that tiles in both directions, computed once on a coarse
// grid (it is only ever seen small, through panes and a strip of sky).
const CN = 48;
function cloudField(noise) {
  const F = 2.4, FY = F * 1.7, f = new Float32Array(CN * CN);
  for (let j = 0; j < CN; j++) {
    for (let i = 0; i < CN; i++) {
      const u = i / CN, v = j / CN, x = u * F, y = v * FY;
      const wa = (1 - u) * (1 - v), wb = u * (1 - v), wc = u * v, wd = (1 - u) * v;
      f[j * CN + i] =
        (noise.fbm2(x, y, 3) * wa + noise.fbm2(x - F, y, 3) * wb + noise.fbm2(x - F, y - FY, 3) * wc + noise.fbm2(x, y - FY, 3) * wd) /
        Math.sqrt(wa * wa + wb * wb + wc * wc + wd * wd);
    }
  }
  return f;
}
// One cloud texture from the field: a threshold, two colors, and a shift so
// the light and dark cloud layers do not line up. Smoothed up to `size`.
function cloudTile(field, size, tint, shade, lo, hi, shift) {
  const small = offscreen(CN, CN);
  const sx = small.getContext("2d");
  const img = sx.createImageData(CN, CN);
  const T = parse(tint), S = parse(shade);
  for (let j = 0; j < CN; j++) {
    for (let i = 0; i < CN; i++) {
      const val = field[((j + shift) % CN) * CN + ((i + shift * 2) % CN)];
      const a = smoothstep(lo, hi, val);
      const k = clamp((val - lo) / (hi - lo + 0.35));
      const o = (j * CN + i) * 4;
      img.data[o] = S[0] + (T[0] - S[0]) * k;
      img.data[o + 1] = S[1] + (T[1] - S[1]) * k;
      img.data[o + 2] = S[2] + (T[2] - S[2]) * k;
      img.data[o + 3] = a * 255;
    }
  }
  sx.putImageData(img, 0, 0);
  const out = offscreen(size, size);
  out.getContext("2d").drawImage(small, 0, 0, size, size);
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
      .lo .tx { position: absolute; white-space: nowrap; text-align: center; line-height: 1; }
      .lo .date { left: 64px; width: 952px; top: ${SIGN_Y}px; height: ${SIGN_H}px; font: 600 46px/${SIGN_H}px "Cinzel", serif; letter-spacing: 0.13em; padding-left: 0.13em; box-sizing: border-box; text-transform: uppercase; color: var(--date); text-shadow: 0 2px 0 rgba(0,0,0,0.55); }
      .lo .fact { position: absolute; left: ${BOARD_X + 22}px; top: 54px; width: ${BOARD_W - 44}px; height: 150px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
      .lo .factL { font-weight: 500; font-size: 24px; line-height: 28px; letter-spacing: 0.22em; padding-left: 0.22em; text-transform: uppercase; color: var(--gilt); white-space: nowrap; }
      .lo .factV { font-weight: 500; font-size: 38px; line-height: 43px; letter-spacing: 0.01em; color: var(--bill); margin-top: 8px; max-width: 100%; }
      .lo .moonN { left: 64px; width: 236px; font-weight: 600; font-size: 36px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--gilt); }
      .lo .ampm { left: 348px; width: 384px; top: ${FASCIA + 5}px; height: 116px; font-weight: 700; font-size: 100px; line-height: 116px; letter-spacing: 0.08em; padding-left: 0.08em; box-sizing: border-box; color: var(--chan); text-shadow: 3px 4px 0 rgba(0,0,0,0.6), 0 0 26px var(--chanGlow); }
      .lo .sideL { top: ${FASCIA}px; width: 108px; height: ${FRONT - FASCIA}px; font-weight: 600; font-size: 44px; line-height: ${FRONT - FASCIA}px; letter-spacing: 0.06em; color: var(--gilt); }
      .lo .led { top: ${LED_Y}px; width: 108px; height: 140px; font-weight: 600; font-size: 64px; line-height: 140px; color: ${LED}; text-shadow: 0 0 14px rgba(255,80,40,0.55); }
      .lo .neonBox { position: absolute; left: 72px; top: ${FRONT + 36}px; width: 220px; height: 164px; box-sizing: border-box; border: 3px solid ${NEON}; border-radius: 18px; box-shadow: 0 0 12px ${NEON_GLOW}, inset 0 0 12px ${NEON_GLOW}; opacity: 0.9; }
      .lo .sunL { left: 64px; width: 236px; top: ${FRONT + 56}px; font-weight: 400; font-size: 34px; letter-spacing: 0.07em; color: ${NEON}; text-shadow: 0 0 8px ${NEON_GLOW}, 0 0 20px ${NEON_GLOW}; }
      .lo .sunV { left: 64px; width: 236px; top: ${FRONT + 107}px; font-weight: 300; font-size: 74px; letter-spacing: 0.01em; color: ${NEON}; text-shadow: 0 0 9px ${NEON_GLOW}, 0 0 26px ${NEON_GLOW}; }
      .lo .temp { left: 348px; width: 384px; top: ${AWN_T + 13}px; font-weight: 600; font-size: 100px; padding-left: 0.22em; box-sizing: border-box; color: var(--cream); }
      .lo .cond { left: 348px; width: 384px; top: ${AWN_B - 60}px; font-weight: 500; font-size: 44px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--cream); }
    `);

    const wrap = el("div", { class: "lo" });
    root.append(wrap);
    const lay = (cls, style) => {
      const d = el("div", { class: `lay ${cls || ""}`, style });
      wrap.append(d);
      return d;
    };

    // ---- layers ---------------------------------------------------------------
    // Two surfaces: the wall (one opaque canvas that holds everything that
    // only changes with the light, the weather or the minute: the measured sky
    // behind the roofline, brick, air, wet, glow, shadows, every settled window
    // and the grain), and the moving layer on top (cloud, roof, weather, street
    // life, and any window that is switching). Then the type.
    const wall = canvas2d(wrap, { maxScale: 2, alpha: false });
    const flashDiv = lay("", { top: "0", height: `${ROOF}px`, background: "#c9d0ff", opacity: "0" });
    const fx = canvas2d(wrap, { adaptive: true });
    const fctx = fx.ctx, wctx = wall.ctx, gctx = wall.ctx;
    // the brick elevation itself, drawn once at the wall's resolution
    const rawC = offscreen(W * wall.ratio, H * wall.ratio);
    const rawX = rawC.getContext("2d");
    rawX.scale(wall.ratio, wall.ratio);
    // the wet sheet's ragged lower edge of runs (soft, so a small fixed canvas)
    const wetRuns = offscreen(W, 300);

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
    // the bar is named for tonight's moon, on two lines
    const moonA = tx("moonN", { top: `${FASCIA + 16}px` });
    const moonB = tx("moonN", { top: `${FASCIA + 91}px` });
    const ampmEl = tx("ampm");
    tx("sideL", { left: `${AQI_X}px` }, "AIR");
    tx("sideL", { left: `${UV_X}px` }, "UV");
    const aqiEl = tx("led", { left: `${AQI_X}px` });
    const uvEl = tx("led", { left: `${UV_X}px` });
    wrap.append(el("div", { class: "neonBox" }));
    const sunL = tx("sunL");
    const sunV = tx("sunV");
    const tempEl = tx("temp");
    const condEl = tx("cond");

    const shown = {};
    const put = (key, node, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };
    const cssVar = (name, value) => {
      if (shown[name] === value) return;
      shown[name] = value;
      wrap.style.setProperty(name, value);
    };

    // ---- per-window facts -------------------------------------------------------
    const awake = new Float32Array(NWIN); // 0 blind down .. 1 blind up
    const target = new Uint8Array(NWIN);
    const baked = new Uint8Array(NWIN); // 1: this window is painted into the wall as it stands
    const delay = new Float32Array(NWIN);
    const lampAt = new Float32Array(NWIN); // the light level at which this room's lamp comes on
    const roomOf = new Uint8Array(NWIN);
    const vig = new Uint8Array(NWIN); // 1 cat, 2 someone walking past, 3 television
    const isOpen = new Uint8Array(NWIN);
    const rank = new Float32Array(NWIN * 3);
    const blindK = new Uint8Array(NWIN); // how far down each daytime blind is drawn (0..3)
    for (let i = 0; i < NWIN; i++) {
      blindK[i] = r.int(0, 3);
      lampAt[i] = r.range(0.3, 0.62);
      roomOf[i] = r.int(0, 15);
      isOpen[i] = r.chance(0.17) ? 1 : 0;
      rank[i * 3] = r();
      rank[i * 3 + 1] = r();
      rank[i * 3 + 2] = r();
    }
    // Each room's lamp is either on or off (with a little hysteresis) and
    // fades over about a second when it switches, never over minutes of
    // light. A room also switches its lamp on, at its own moment, once the
    // daylit blind would stop standing clear of the brick (lampCR is the
    // contrast at which this room gives up on daylight), so no digit is ever
    // a blind sinking into the wall.
    const lampOn = new Uint8Array(NWIN), lampV = new Float32Array(NWIN), lampCR = new Float32Array(NWIN);
    for (let i = 0; i < NWIN; i++) lampCR[i] = 3.8 + 0.8 * hash(i, 7919);
    let lampMoving = false;
    const rooms = [];
    for (let k = 0; k < 16; k++) rooms.push(roomSprite(LAMPS[k % 4], k < 4 ? 0 : k < 8 ? 1 : k < 12 ? 2 : r.chance(0.5) ? 3 : 0, r));

    // Air conditioners live in the left bay, which never holds a digit (the
    // gap between the two figures of a row stays clear brick, so nothing
    // breaks the strokes).
    const acs = [];
    for (const rr of r.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4)) acs.push([0, rr]);

    // ---- ironwork ---------------------------------------------------------------
    // the fire escape climbs the right bay, clear of the digits
    const FE0 = colX(8) + WW / 2 - 60, FE1 = FE0 + 120;
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
      const cx = 132, d = DR;
      // water tower: conical roof, tank, platform, legs
      roofPath.moveTo(cx, 44 + d); roofPath.lineTo(cx + 54, 82 + d); roofPath.lineTo(cx - 54, 82 + d); roofPath.closePath();
      roofPath.rect(cx - 1.5, 32 + d, 3, 14);
      roofPath.moveTo(cx - 48, 82 + d); roofPath.lineTo(cx + 48, 82 + d); roofPath.lineTo(cx + 44, 158 + d); roofPath.lineTo(cx - 44, 158 + d); roofPath.closePath();
      roofPath.rect(cx - 52, 158 + d, 104, 6);
      for (const lx of [-42, -14, 14, 42]) roofPath.rect(cx + lx - 2.5, 164 + d, 5, ROOF - 164 - d);
      for (const [a, b] of [[-42, 14], [14, -42], [-14, 42], [42, -14]]) {
        roofPath.moveTo(cx + a - 1.5, 168 + d); roofPath.lineTo(cx + a + 1.5, 168 + d); roofPath.lineTo(cx + b + 1.5, ROOF); roofPath.lineTo(cx + b - 1.5, ROOF); roofPath.closePath();
      }
      // vent stack at the far end of the roof
      roofPath.rect(1041, ROOF - 38, 14, 38);
      roofPath.rect(1037, ROOF - 44, 22, 7);
      // billboard supports
      for (let x = BOARD_X + 40; x < BOARD_X + BOARD_W; x += 100) roofPath.rect(x - 3, BOARD_Y + BOARD_H - 2, 6, ROOF - BOARD_Y - BOARD_H + 2);
      roofPath.rect(BOARD_X + 20, ROOF - 9, BOARD_W - 40, 3);
    }
    const hoops = new Path2D();
    for (const y of [94, 110, 126, 142]) hoops.rect(132 - 48 + (y - 82) * 0.052, y + DR, 96 - (y - 82) * 0.104, 2);
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
    ledge(0, W, STRING, 1.1);
    ledge(0, W, SHOP, 1.3);
    for (let i = 0; i < NWIN; i++) ledge(colX(i % 9) - 6, colX(i % 9) + WW + 6, rowY((i / 9) | 0) + WH + 1, 1);
    for (const y of platformY) ledge(FE0, FE1, y, 0.8);
    for (const [c, rr] of acs) ledge(colX(c) + 13, colX(c) + 63, rowY(rr) + WH - 24, 0.7);
    ledge(132 - 54, 132 + 54, 82 + DR, 0.9);
    const LEDGES = new Float32Array(ledges);
    const boardLedge = [];
    for (let x = BOARD_X; x < BOARD_X + BOARD_W - 1; ) { const len = Math.min(BOARD_X + BOARD_W - x, r.range(80, 170)); boardLedge.push(x, x + len, BOARD_Y, r.range(0.8, 1.3)); x += len; }
    const BLEDGE = new Float32Array(boardLedge);

    // ---- the facade, drawn once -----------------------------------------------------
    {
      const ctx = rawX;
      const R = (c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
      const tones = [];
      for (let i = 0; i < 30; i++) {
        const dark = r.chance(0.08) ? 0.085 : 0;
        tones.push(adjust(BRICK, { l: (v) => v + r.range(-0.04, 0.04) - dark, h: (v) => v + r.range(-5, 7), c: (v) => v * r.range(0.82, 1.1) }));
      }
      // running bond, laid once on a tile that repeats (half the wall wide)
      const BL = 27, BH = 10, TW = 540, TH = 200;
      const tile = offscreen(TW * 2, TH * 2);
      {
        const t2 = tile.getContext("2d");
        t2.scale(2, 2);
        t2.fillStyle = MORTAR; t2.fillRect(0, 0, TW, TH);
        for (let row = 0, y = 0; y < TH; row++, y += BH) {
          for (let x = row % 2 ? -BL / 2 : 0; x < TW; x += BL) {
            t2.fillStyle = tones[(r() * tones.length) | 0];
            t2.fillRect(x + 0.6, y + 0.6, BL - 1.2, BH - 1.2);
            if (x < 0) t2.fillRect(x + TW + 0.6, y + 0.6, BL - 1.2, BH - 1.2);
          }
        }
      }
      const bond = ctx.createPattern(tile, "repeat");
      bond.setTransform(new DOMMatrix([0.5, 0, 0, 0.5, 0, ROOF]));
      R(bond, 0, ROOF, W, SHOP - ROOF);
      // soot under the cornice, grime at the base
      let g = ctx.createLinearGradient(0, ROOF, 0, SHOP);
      g.addColorStop(0, "rgba(28,8,8,0.3)"); g.addColorStop(0.22, "rgba(28,8,8,0.03)"); g.addColorStop(0.82, "rgba(28,8,8,0)"); g.addColorStop(1, "rgba(28,8,8,0.2)");
      R(g, 0, ROOF, W, SHOP - ROOF);

      // cornice and frieze
      R(STONE_HI, 0, ROOF, W, 9); R(STONE_DK, 0, ROOF + 9, W, 5); R(STONE, 0, ROOF + 14, W, 10);
      R("#4a4034", 0, ROOF + 24, W, 11);
      for (let x = 5; x < W; x += 22) R(STONE, x, ROOF + 24, 12, 9);
      R(STONE_HI, 0, ROOF + 35, W, 5);
      R(SIGN, 0, SIGN_Y, W, SIGN_H);
      R("#7b6230", 44, SIGN_Y + 7, W - 88, 1.5); R("#7b6230", 44, SIGN_Y + SIGN_H - 8.5, W - 88, 1.5);
      ctx.fillStyle = "#a88a44";
      const dm = SIGN_Y + SIGN_H / 2;
      for (const x of [34, W - 34]) { ctx.beginPath(); ctx.moveTo(x, dm - 8); ctx.lineTo(x + 8, dm); ctx.lineTo(x, dm + 8); ctx.lineTo(x - 8, dm); ctx.fill(); }
      R(STONE, 0, SIGN_Y + SIGN_H, W, 7); R(STONE_DK, 0, SIGN_Y + SIGN_H + 7, W, 3);

      // every window asleep: a shade drawn in a tone close to the brick, so by
      // day the wall is one quiet field and the awake windows are the only figure
      const blinds = ["#4c2e26", "#492d27", "#4e3027", "#472c28"];
      for (let i = 0; i < NWIN; i++) {
        const x = colX(i % 9), y = rowY((i / 9) | 0);
        // flat arch of soldier bricks
        for (let k = 0; k < 9; k++) R(tones[(k * 7 + i) % tones.length], x - 4 + (k * (WW + 8)) / 9 + 0.5, y - 14, (WW + 8) / 9 - 1, 11.5);
        R("rgba(30,10,8,0.25)", x - 4, y - 14, WW + 8, 11.5);
        R("#1d1310", x - 2, y - 2, WW + 4, WH + 3);
        const b = blinds[(r() * blinds.length) | 0];
        R(b, x, y, WW, WH);
        ctx.fillStyle = "rgba(0,0,0,0.13)";
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
      R(STONE, 0, STRING, W, 15); R(STONE_HI, 0, STRING, W, 3); R(STONE_DK, 0, STRING + 12, W, 3); R("rgba(20,6,6,0.3)", 0, STRING + 15, W, 4);
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
      for (const x of [AQI_X, UV_X]) { R("#3a3532", x - 3, LED_Y - 3, 114, 146); R("#090707", x, LED_Y, 108, 140); }
      // the deli front under the awning
      R("#10100f", 348, FRONT, 384, WALK - FRONT);
      paintDeli(ctx, false);
      for (const [x0, x1] of [[0, 40], [324, 348], [732, 756], [1040, 1080]]) {
        R(STONE, x0, FRONT, x1 - x0, WALK - FRONT); R(STONE_DK, x1 - 3, FRONT, 3, WALK - FRONT);
        R(STONE_HI, x0, FRONT, x1 - x0, 7); R(STONE_DK, x0, FRONT + 7, x1 - x0, 3); R(STONE_DK, x0, WALK - 26, x1 - x0, 26);
      }
      // sidewalk, curb, road
      R("#89857d", 0, WALK, W, CURB - WALK); R("#5f5b55", 0, WALK, W, 3);
      ctx.fillStyle = "#6d6962";
      for (let x = 70; x < W; x += 135) ctx.fillRect(x, WALK + 3, 2, CURB - WALK - 3);
      R("#a5a199", 0, CURB, W, 9); R("#2a2a2e", 0, CURB + 9, W, H - CURB - 9);
    }

    // The deli's windows and door. Drawn dim on the facade, and again lit (on
    // the glow layer) when its lights are on.
    function paintDeli(ctx, lit) {
      const top = AWN_B + 18, bot = WALK - 16;
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
      const ctx = wetRuns.getContext("2d");
      for (let x = 0; x < W; ) {
        const w = r.range(3, 15), len = r.range(8, 250) * r.range(0.3, 1);
        ctx.fillStyle = "rgba(20,8,8,0.42)"; ctx.fillRect(x, 0, w, len);
        ctx.fillStyle = "rgba(20,8,8,0.22)"; ctx.fillRect(x + 1, len, Math.max(1, w - 2), len * 0.35 + 6);
        x += w;
      }
    }

    // ---- sprites and textures --------------------------------------------------------
    const field = cloudField(noise);
    const cloudW = cloudTile(field, 256, "#ffffff", "#c3cedb", -0.06, 0.34, 0);
    const cloudD = cloudTile(field, 256, "#566170", "#3b4450", -0.1, 0.4, 19);
    const patWg = wctx.createPattern(cloudW, "repeat"), patDg = wctx.createPattern(cloudD, "repeat");
    const patWf = fctx.createPattern(cloudW, "repeat"), patDf = fctx.createPattern(cloudD, "repeat");
    const matW = new DOMMatrix([2, 0, 0, 2, 0, 0]), matD = new DOMMatrix([2, 0, 0, 2, 0, 0]);
    // film grain: black and white specks in equal measure, tiled
    const grainC = offscreen(256, 256);
    {
      // (an inline xorshift: 65k calls to rng() would cost mount ~14 ms)
      const x = grainC.getContext("2d"), img = x.createImageData(256, 256);
      let st = 0x9e3779b9;
      for (let i = 0; i < img.data.length; i += 4) {
        st ^= st << 13; st ^= st >>> 17; st ^= st << 5;
        const v = (st >>> 0) / 4294967296;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v > 0.5 ? 255 : 0;
        img.data[i + 3] = Math.abs(v - 0.5) * 2 * 255;
      }
      x.putImageData(img, 0, 0);
    }
    const grainPat = wctx.createPattern(grainC, "repeat");
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
    // the damp patch an air conditioner leaves on the brick below it
    const stain = offscreen(92, 92);
    {
      const x = stain.getContext("2d");
      const g = x.createRadialGradient(46, 0, 2, 46, 10, 80);
      g.addColorStop(0, "rgba(22,8,6,0.55)"); g.addColorStop(0.5, "rgba(22,8,6,0.22)"); g.addColorStop(1, "rgba(22,8,6,0)");
      x.fillStyle = g; x.beginPath(); x.ellipse(46, 0, 30, 92, 0, 0, TAU); x.fill();
    }
    // frost creeping in from the corners of a pane on a bitter day
    const frost = offscreen((WW - 2 * FR) * 2, (WH - 2 * FR) * 2);
    {
      const x = frost.getContext("2d"), fw = frost.width, fh = frost.height;
      for (const [cx, cy, rad, a] of [[0, fh, fw * 0.7, 0.95], [fw, fh, fw * 0.62, 0.9], [0, 0, fw * 0.32, 0.5], [fw, 0, fw * 0.36, 0.5]]) {
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
    // leaves and scraps of paper the wind carries across the front: x, y, phase, size, depth
    // (kept to the brick, between the frieze and the shopfronts, so nothing moving passes behind type)
    const LEAF_T = FRIEZE_B + 18, LEAF_B = SHOP - 12;
    const NL = 56, leaves = new Float32Array(NL * 5);
    for (let i = 0; i < NL; i++) leaves.set([r.range(-40, W + 40), r.range(LEAF_T, LEAF_B), r.range(0, TAU), r.range(6, 13), r()], i * 5);
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
    let wetness = 0, snowDepth = 0, scrollX = 0, palKey1 = -1, palKey2 = -1, palKey3 = -1, skyKey = "", skyKeyW = "", shKey = -1e9;
    let bY = BOARD_Y, bH = BOARD_H; // the billboard as it stands for today's fact
    let hasFact = false, frostK = 0, winDirty = true, shDx = 0, shDy = 1, wasMoving = false, palPending = false, sinceBuild = 99;

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
      winDirty = true;
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
      PAL.night = 1 - smoothstep(0.1, 0.5, env.light);

      // fog, capped where it would wash the digits out
      const haze = smoothstep(90, 190, w.aqi) * 0.3 * dl;
      const fogCol = mix(mix(sky.mean, "#ffffff", 0.1 * dl), "#cdb98a", haze > env.murk * 0.5 ? 0.5 : 0);
      const wetBrick = blend(BRICK_AVG, "#140808", 0.42 * clamp(wetness * 1.3));
      const brickBase = under(wetBrick);
      let fogA = Math.max(0.52 * env.murk, haze);
      while (fogA > 0.04 && luminance(blend(brickBase, fogCol, fogA)) > 0.1 + 0.04 * dl) fogA -= 0.03;
      PAL.fogA = fogA;
      const fogged = (c, k) => blend(c, fogCol, fogA * k);
      const brickNow = fogged(brickBase, 1);

      PAL.sky4 = [sky.west, sky.northWest, sky.northEast, sky.east];
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
        return [pct, `rgba(${Math.round(r0 * d)},${Math.round(g0 * d)},${Math.round(b0 * d)},${al.toFixed(3)})`];
      };
      const rf = ROOF / H;
      PAL.airStops = [stop(false, 0.85, 0), stop(false, 0.97, rf), stop(true, 0.97, rf), stop(true, 1, 0.14), stop(true, 1, 0.66), stop(true, 0.45, 0.76), stop(true, 0.3, 1)];
      const snowWalk = snowDepth > wetness;
      PAL.walkC = snowWalk ? "#e6eaf0" : "#0a0c12";
      PAL.walkA = snowWalk ? Math.min(0.9, snowDepth * 1.3) : wetness * 0.5;

      // glass: the measured sky, west to east, lifted until it stands off the brick
      const skyRamp = ramp([sky.west, sky.northWest, sky.northEast, sky.east]);
      for (let c = 0; c < 9; c++) PAL.glass[c] = ensure(mix(skyRamp(c / 8), "#ffffff", 0.22 * dl), brickNow, 4.5);
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
      // how far the daylit blind stands off the brick (lamps take over below each room's mark)
      PAL.dayCR = contrast(PAL.blindDay, brickNow);
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
      PAL.curtain = under("#f6f1e6");
      PAL.curtainFold = under("#c9bfae");
      PAL.walker = under("#17161a");
      PAL.umbrella = under("#d9a531");
      PAL.steam = blend("#f2f3f6", "#7d849c", 1 - dl);
      PAL.star = "#dfe6ff";
      // what the wind carries stays faintly visible after dark, as silhouettes on the lit rooms
      const autumn = s.clock.monthIndex >= 9 && s.clock.monthIndex <= 11;
      PAL.leaf = fogged(blend(autumn ? "#c9873a" : "#a99a6a", VEIL, va * 0.8), 0.5);
      PAL.paper = fogged(blend("#ece6d8", VEIL, va * 0.8), 0.5);
      PAL.drip = blend("#e6eef6", "#93a2b6", 1 - dl);

      // signs: light letters on dark grounds, a little dimmer after dark
      const nk = 1 - smoothstep(0.08, 0.6, dl);
      const gilt = blend(GILT, "#b3975a", 0.55 * nk), cream = blend(CREAM, "#a9a190", 0.5 * nk);
      const signNow = fogged(under(SIGN), 0.6);
      cssVar("--date", ensure(gilt, fogged(under(SIGN), 0.9), 5));
      cssVar("--gilt", ensure(gilt, signNow, 5));
      cssVar("--bill", ensure(cream, PAL.board, 6));
      cssVar("--cream", ensure(cream, PAL.awn, 5));
      cssVar("--chan", blend("#f4ead4", "#ffe6b4", nk));
      cssVar("--chanGlow", rgba("#ffb45a", 0.75 * nk));
    }

    // Hard sun shadows under the cornice, sills and fire escape, on the window
    // layer (repainted with it).
    function paintShadows(dx, dy, k) {
      const x = wctx;
      x.save();
      x.globalAlpha = k;
      x.fillStyle = "rgba(26,6,12,0.44)";
      x.beginPath();
      x.rect(0, SIGN_Y, W, Math.min(SIGN_H, 13 * dy));
      x.rect(0, FRIEZE_B, W, Math.min(50, 7 * dy));
      x.rect(0, STRING + 15, W, Math.min(30, 4 * dy));
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
      x.beginPath(); x.rect(0, FRIEZE_B, W, SHOP - FRIEZE_B); x.clip();
      x.translate(dx * 18, dy * 13);
      x.fill(ironThick); x.fill(ironThin);
      x.restore();
      x.restore();
    }

    // The parts of an awake window that only change with the light: white
    // frame, glass reflection, the daytime blind at one of four heights, sun
    // shade in the reveal, meeting rail and roller. Repainted when the palette
    // moves; each window is then glass + drifting cloud + one of these.
    const FRONT_N = 4;
    const fronts = [];
    for (let k = 0; k < FRONT_N; k++) fronts.push(offscreen(WW * 2, WH * 2));
    const frontLv = (k) => 0.55 + (0.2 * k) / (FRONT_N - 1);
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

    // One awake window on the window layer: the front (frame, blind, rail) by
    // day, a lit room at night. The glass behind the front is on its own layer.
    function drawWin(ctx, i, a, lamp) {
      const c = i % 9, x = colX(c), y = rowY((i / 9) | 0);
      const e = a >= 1 ? 1 : ease.cubicInOut(a);
      const top = y + WH * (1 - e); // the blind rolls up from the sill
      if (y + WH - top < 0.5) return;
      const clipped = e < 1;
      if (clipped) { ctx.save(); ctx.beginPath(); ctx.rect(x, top, WW, y + WH - top); ctx.clip(); }
      const gx = x + FR, gy = y + FR, gw = WW - 2 * FR, gh = WH - 2 * FR;
      if (lamp < 0.995) ctx.drawImage(fronts[blindK[i]], x, y, WW, WH);
      else { ctx.fillStyle = PAL.frame; ctx.fillRect(x, y, WW, WH); }
      if (lamp > 0.005) { ctx.globalAlpha = lamp; ctx.drawImage(rooms[roomOf[i]], gx, gy, gw, gh); ctx.globalAlpha = 1; }
      if (frostK > 0.01) { ctx.globalAlpha = frostK * (1 - 0.15 * lamp); ctx.drawImage(frost, gx, gy, gw, gh); ctx.globalAlpha = 1; }
      if (lamp > 0.005) {
        ctx.fillStyle = PAL.frame; ctx.fillRect(gx, gy + gh * 0.5 - 1.5, gw, 3);
        ctx.fillStyle = PAL.blind; ctx.fillRect(gx, gy, gw, 5);
      }
      if (clipped) { ctx.fillStyle = PAL.blind; ctx.fillRect(x, top, WW, 4); ctx.restore(); }
    }

    // The sky in one pane, below its blind: measured color, drifting cloud.
    // Drawn under the window front, on the wall (or on the moving layer while it switches).
    function drawGlass(ctx, pw, pd, i, a) {
      const c = i % 9, x = colX(c), y = rowY((i / 9) | 0);
      const gx = x + FR, gy = y + FR, gw = WW - 2 * FR, gh = WH - 2 * FR;
      const e = a >= 1 ? 1 : ease.cubicInOut(a);
      const cy = Math.max(gy + gh * frontLv(blindK[i]) - 3, y + WH * (1 - e)), hh = gy + gh - cy;
      if (hh < 0.5) return;
      ctx.fillStyle = PAL.glass[c]; ctx.fillRect(gx, cy, gw, hh);
      if (PAL.aW > 0.01) { ctx.globalAlpha = PAL.aW; ctx.fillStyle = pw; ctx.fillRect(gx, cy, gw, hh); }
      if (PAL.aD > 0.01) { ctx.globalAlpha = PAL.aD; ctx.fillStyle = pd; ctx.fillRect(gx, cy, gw, hh); }
      // the lower sash pushed up on a warm day: the room's shade behind it
      if (isOpen[i] && env.openK > 0.02) { ctx.globalAlpha = 0.6 * env.openK; ctx.fillStyle = "#0e1218"; ctx.fillRect(gx, Math.max(cy, gy + gh * 0.5), gw, gy + gh - Math.max(cy, gy + gh * 0.5)); }
      ctx.globalAlpha = 1;
    }

    // The three small lives, drawn over their rooms on the moving layer.
    function drawVig(i, lamp, t) {
      const v = vig[i], x = colX(i % 9), y = rowY((i / 9) | 0);
      const gx = x + FR, gy = y + FR, gw = WW - 2 * FR, gh = WH - 2 * FR;
      if (v === 1) {
        // a cat on the sill, tail flicking
        const bx = gx + gw - 20, by = gy + gh;
        fctx.fillStyle = "#1d0f08"; fctx.strokeStyle = "#1d0f08";
        fctx.beginPath();
        fctx.ellipse(bx, by - 8, 11, 10, 0, 0, TAU);
        fctx.ellipse(bx + 3, by - 22, 6.5, 6, 0, 0, TAU);
        fctx.moveTo(bx - 2.5, by - 26); fctx.lineTo(bx - 1.5, by - 33); fctx.lineTo(bx + 3, by - 27);
        fctx.moveTo(bx + 4, by - 27); fctx.lineTo(bx + 8.5, by - 33); fctx.lineTo(bx + 9, by - 25);
        fctx.fill();
        const flick = Math.sin(t * 1.3) * 5 + Math.sin(t * 3.1) * 2.5 * smoothstep(0.3, 1, Math.sin(t * 0.37));
        fctx.lineWidth = 3.4; fctx.lineCap = "round";
        fctx.beginPath(); fctx.moveTo(bx - 9, by - 3); fctx.quadraticCurveTo(bx - 24, by - 1, bx - 30, by - 10 + flick);
        fctx.stroke();
      } else if (v === 2) {
        // someone walks past the lamp now and then
        const per = 31, u = (t % per) / 9;
        if (u < 1) {
          const dir = Math.floor(t / per) % 2 ? -1 : 1;
          const px = dir > 0 ? gx - 22 + u * (gw + 44) : gx + gw + 22 - u * (gw + 44);
          fctx.save(); fctx.beginPath(); fctx.rect(gx, gy, gw, gh); fctx.clip();
          fctx.fillStyle = "rgba(46,20,8,0.8)";
          fctx.beginPath();
          fctx.ellipse(px, gy + gh * 0.36 + Math.sin(t * 4.2) * 1.2, 9, 10.5, 0, 0, TAU);
          fctx.moveTo(px - 19, gy + gh); fctx.quadraticCurveTo(px - 19, gy + gh * 0.52, px, gy + gh * 0.5); fctx.quadraticCurveTo(px + 19, gy + gh * 0.52, px + 19, gy + gh);
          fctx.fill();
          fctx.restore();
        }
      } else {
        // a television: slow blue light, never a flicker
        const k = 0.3 + 0.2 * noise.n2(t * 0.55, 9.1) + 0.1 * noise.n2(t * 1.4, 2.2);
        fctx.globalAlpha = k * lamp; fctx.fillStyle = "#78aaff"; fctx.fillRect(gx, gy, gw, gh);
        fctx.globalAlpha = 0.85; fctx.fillStyle = "#1e0e08"; fctx.fillRect(gx + 8, gy + gh - 22, 30, 22);
        fctx.globalAlpha = clamp(0.5 + k * 0.6); fctx.fillStyle = "#bedcff"; fctx.fillRect(gx + 11, gy + gh - 19, 24, 14);
        fctx.globalAlpha = 1;
      }
      fctx.fillStyle = PAL.frame; fctx.fillRect(gx, gy + gh * 0.5 - 1.5, gw, 3);
    }

    // The roof against the sky: water tower, vent, the billboard (or its bare
    // frame when there is no fact). On the window layer, repainted with it.
    function paintRoof(ctx) {
      ctx.fillStyle = PAL.tower; ctx.fill(roofPath);
      ctx.fillStyle = PAL.towerHi; ctx.fill(hoops);
      if (hasFact) {
        ctx.save(); ctx.translate(0, bY - BOARD_Y); ctx.fillStyle = PAL.tower; ctx.fill(lampArms); ctx.restore();
        ctx.fillStyle = PAL.board; ctx.fillRect(BOARD_X, bY, BOARD_W, bH);
        ctx.strokeStyle = PAL.boardLine; ctx.lineWidth = 2; ctx.strokeRect(BOARD_X + 7, bY + 7, BOARD_W - 14, bH - 14);
        if (PAL.night > 0.02) {
          ctx.save(); ctx.beginPath(); ctx.rect(BOARD_X, bY, BOARD_W, bH); ctx.clip();
          ctx.globalAlpha = PAL.night * 0.4;
          for (let k = 0; k < 4; k++) ctx.drawImage(paleGlow, lampXs[k] - 150, bY - 120, 300, 260);
          ctx.restore(); ctx.globalAlpha = 1;
        }
      } else { ctx.fillStyle = PAL.lattice; ctx.fill(lattice); }
    }

    // The wall, composed: brick, the wet sheet, the sidewalk, the air (sky
    // tint, low sun, night and fog as one gradient), stars, lamplight, sun
    // shadows, and every window that is not in the middle of switching.
    function buildWall(dl, cloudK, murk, sunS, light) {
      // the measured sky behind the roofline, west to east
      let g = wctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, PAL.sky4[0]); g.addColorStop(0.34, PAL.sky4[1]); g.addColorStop(0.66, PAL.sky4[2]); g.addColorStop(1, PAL.sky4[3]);
      wctx.fillStyle = g; wctx.fillRect(0, 0, W, ROOF + 12);
      g = wctx.createLinearGradient(0, 0, 0, ROOF + 12);
      g.addColorStop(0, "rgba(0,0,10,0.16)"); g.addColorStop(1, "rgba(255,255,255,0.05)");
      wctx.fillStyle = g; wctx.fillRect(0, 0, W, ROOF + 12);
      wctx.drawImage(rawC, 0, 0, W, H);
      if (wetness > 0.01) {
        const yb = ROOF + WET_H - Math.round((1 - clamp(wetness)) * WET_T);
        wctx.save(); wctx.beginPath(); wctx.rect(0, ROOF, W, SHOP - ROOF); wctx.clip();
        wctx.fillStyle = "rgba(20,8,8,0.42)";
        if (yb > ROOF) wctx.fillRect(0, ROOF, W, yb - ROOF);
        wctx.drawImage(wetRuns, 0, yb, W, 300);
        wctx.restore();
      }
      if (PAL.walkA > 0.01) { wctx.globalAlpha = PAL.walkA; wctx.fillStyle = PAL.walkC; wctx.fillRect(0, WALK, W, H - WALK); wctx.globalAlpha = 1; }
      g = wctx.createLinearGradient(0, 0, 0, H);
      for (let k = 0; k < PAL.airStops.length; k++) g.addColorStop(PAL.airStops[k][0], PAL.airStops[k][1]);
      wctx.fillStyle = g; wctx.fillRect(0, 0, W, H);
      const starA = (1 - smoothstep(0.02, 0.3, dl)) * (1 - cloudK) * (1 - murk);
      if (starA > 0.02) {
        wctx.globalAlpha = starA * 0.9; wctx.fillStyle = PAL.star; wctx.beginPath();
        for (let i = 0; i < 40; i++) wctx.rect(stars[i * 3], stars[i * 3 + 1], stars[i * 3 + 2], stars[i * 3 + 2]);
        wctx.fill(); wctx.globalAlpha = 1;
      }
      paintGlow(null, env);
      if (sunS > 0.01) paintShadows(shDx, shDy, sunS);
      baked.fill(0);
      for (let i = 0; i < NWIN; i++) {
        if (awake[i] !== 1 || target[i] !== 1) continue;
        if (lampV[i] > 0 && lampV[i] < 1) continue; // fading: on the moving layer
        const lamp = lampV[i];
        if (lamp < 0.995) drawGlass(wctx, patWg, patDg, i, 1);
        drawWin(wctx, i, 1, lamp);
        baked[i] = 1;
      }
      // grain, baked into the wall so the dark gradients do not band
      wctx.globalAlpha = 0.05; wctx.fillStyle = grainPat; wctx.fillRect(0, 0, W, H); wctx.globalAlpha = 1;
    }

    // Light that lit rooms and shop windows throw on the wall and the street.
    function paintGlow(s, env) {
      const night = PAL.night;
      gctx.globalCompositeOperation = "lighter";
      const size = 250 * (1 + 0.7 * env.murk);
      // a lamp's spill only shows on the brick once the daylight is going
      const dayGlow = 1 - 0.6 * smoothstep(0.3, 0.9, env.dl);
      for (let i = 0; i < NWIN; i++) {
        const a = awake[i];
        if (a <= 0.02) continue;
        const lamp = a * lampV[i];
        if (lamp < 0.02) continue;
        gctx.globalAlpha = lamp * (0.42 + 0.3 * env.murk) * dayGlow;
        gctx.drawImage(warmGlow, colX(i % 9) + WW / 2 - size / 2, rowY((i / 9) | 0) + WH / 2 - size / 2, size, size);
      }
      gctx.globalCompositeOperation = "source-over";
      for (let i = 0; i < NWIN; i++) {
        const a = awake[i];
        if (a < 1) continue;
        const lamp = lampV[i];
        if (lamp < 0.05) continue;
        gctx.globalAlpha = lamp * 0.55;
        gctx.fillStyle = "#c98548";
        gctx.fillRect(colX(i % 9) - 6, rowY((i / 9) | 0) + WH + 1, WW + 12, 2.2);
      }
      // the shops
      gctx.globalAlpha = 0.35 + 0.65 * night;
      paintDeli(gctx, true);
      if (night > 0.02) {
        gctx.globalAlpha = night * 0.5;
        gctx.drawImage(warmGlow, 300, AWN_B + 30, 480, 190);
        gctx.globalAlpha = night * 0.55;
        gctx.drawImage(pinkGlow, 22, FRONT - 32, 320, 300);
        gctx.globalAlpha = night * 0.4;
        gctx.drawImage(redGlow, 764, FRONT + 12, 268, 220);
        gctx.globalAlpha = 1;
        gctx.fillStyle = "#090707";
        gctx.fillRect(AQI_X, LED_Y, 108, 140); gctx.fillRect(UV_X, LED_Y, 108, 140);
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

    const DOG_LEGS = [-9, -5, 6, 10];
    const env = { dl: 1, cloudK: 0, rainK: 0, snowK: 0, murk: 0, dark: 0, light: 1, lampL: 1, sunS: 0, openK: 0 };

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
        // People switch their lamps on whenever the room is dim, not only at
        // night: under a closed sky, in rain, snow or fog, and in the half-light.
        // So the digits are lit rooms in all but bright, open daylight.
        const dim = Math.max(0.9 * smoothstep(0.6, 0.95, cloudK), w.falling ? 1 : 0, murk);
        env.lampL = dl * (1 - 0.88 * dim);
        env.cloudK = cloudK; env.rainK = rainK; env.snowK = snowK; env.murk = murk; env.light = light; env.sunS = sunS;
        env.dark = rainK > 0 ? rainK : snowK * 0.4;
        env.dl = dl;
        // windows open on a warm day; in real heat they shut again and the AC runs
        env.openK = smoothstep(60, 72, w.temp) * (1 - smoothstep(84, 92, w.temp)) * (w.falling ? 0 : 1);
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
        // (frost and open sashes are baked into the wall's windows, so they key a rebuild too)
        const k3 = Math.round(env.lampL * 100) + 1000 * Math.round(frostK * 50) + 1e5 * Math.round(env.openK * 50);
        let palChanged = false;
        // sun shadows: length and lean follow the sun
        if (sunS > 0.01) {
          const dx = clamp(Math.tan(rel), -2.2, 2.2), dy = clamp(Math.tan((sh.alt * Math.PI) / 180) / Math.max(0.2, Math.cos(rel)), 0.2, 3.4);
          const key = Math.round(dx * 16) * 1000 + Math.round(dy * 16);
          if (key !== shKey) {
            shKey = key; shDx = dx; shDy = dy;
            PAL.shTop = Math.min(26, 3.4 * dy); PAL.shSide = clamp(dx * 3.4, -20, 20);
            palChanged = true;
          }
        }
        if (k1 !== palKey1 || k2 !== palKey2 || k3 !== palKey3 || skyKey !== s.sky.mean || skyKeyW !== s.sky.west) {
          palKey1 = k1; palKey2 = k2; palKey3 = k3; skyKey = s.sky.mean; skyKeyW = s.sky.west;
          updatePalette(s, env);
          palChanged = true;
        }
        if (palChanged) paintFronts();

        // ---- lamps: on or off outright, with hysteresis, and a one-second fade ----
        {
          const L = env.lampL, cr = PAL.dayCR;
          let fading = false, settled = false;
          for (let i = 0; i < NWIN; i++) {
            if (lampOn[i]) {
              if (L > lampAt[i] + 0.03 && (L >= 0.82 || cr > lampCR[i] + 0.35)) lampOn[i] = 0;
            } else if (L < lampAt[i] - 0.03 || (L < 0.8 && cr < lampCR[i])) lampOn[i] = 1;
            const tg = lampOn[i];
            let v = lampV[i];
            if (v === tg) continue;
            v = jumped ? tg : tg ? Math.min(1, v + dt / 0.9) : Math.max(0, v - dt / 0.9);
            lampV[i] = v;
            if (v === tg) settled = true; else fading = true;
          }
          // the wall bakes the settled rooms (and the light they throw), so it follows the fades
          if (settled) winDirty = true;
          if (fading) palPending = true;
          lampMoving = fading;
        }
        const flashO = Math.round(flash * 34);
        if (shown.flashO !== flashO) { shown.flashO = flashO; flashDiv.style.opacity = String(flashO / 100); }


        // ---- clouds drift at the wind's speed ----
        scrollX += (windX >= 0 ? 1 : -1) * (3 + ws * 2.4) * dt;
        matW.e = scrollX; matW.f = 30;
        matD.e = scrollX * 0.8 + 140; matD.f = 210;
        patWf.setTransform(matW); patDf.setTransform(matD);

        // ---- the wall: rebuilt only when the light, the weather or the
        // windows have settled into something new
        // (a fast clock moves the light every frame: then at most every 8th frame)
        if (palChanged) palPending = true;
        sinceBuild++;
        if (winDirty || jumped || (wasMoving && !moving) || (palPending && sinceBuild >= 8)) {
          winDirty = false; palPending = false; sinceBuild = 0;
          buildWall(dl, cloudK, murk, sunS, light);
        }
        wasMoving = moving;


        // ---- the fx layer: sky, roof, weather, street ----
        fx.clear();
        // cloud crossing the strip of sky above the roof, at the wind's speed, then the roof
        if (PAL.aW > 0.01) { fctx.globalAlpha = PAL.aW; fctx.fillStyle = patWf; fctx.fillRect(0, 0, W, ROOF); }
        if (PAL.aD > 0.01) { fctx.globalAlpha = PAL.aD * 0.8; fctx.fillStyle = patDf; fctx.fillRect(0, 0, W, ROOF); }
        fctx.globalAlpha = 1;
        paintRoof(fctx);
        // windows that are switching on or off, drawn here until they settle
        if (moving || lampMoving) {
          for (let i = 0; i < NWIN; i++) {
            if (awake[i] <= 0) continue;
            // (a window that has finished rolling up stays on this layer until the wall is next painted:
            // the wall waits for the slowest window, and without this the early ones blinked off meanwhile)
            if (awake[i] === target[i] && !(lampV[i] > 0 && lampV[i] < 1) && baked[i]) continue;
            const lamp = lampV[i];
            if (lamp < 0.995) drawGlass(fctx, patWf, patDf, i, awake[i]);
            drawWin(fctx, i, awake[i], lamp);
          }
        }
        // a thunderstorm's slow swell of light on the wall
        if (flash > 0.01) { fctx.globalAlpha = flash * 0.12; fctx.fillStyle = "#c9d0ff"; fctx.fillRect(0, ROOF, W, SHOP - ROOF); fctx.globalAlpha = 1; }
        // steam off the roof when it is cold
        const steamK = smoothstep(46, 26, w.temp);
        if (steamK > 0.02) {
          fctx.fillStyle = PAL.steam;
          for (let k = 0; k < 9; k++) {
            const p = (t * 0.085 + k / 9) % 1;
            fctx.globalAlpha = steamK * 0.36 * (1 - p) * smoothstep(0, 0.12, p) * (0.5 + 0.5 * (1 - PAL.night * 0.5));
            fctx.beginPath();
            fctx.arc(1048 + windX * Math.min(26, ws) * p * 9 + Math.sin(t * 0.7 + k * 2.1) * 5 * p, ROOF - 46 - p * 120 * (1 - Math.min(0.75, ws / 40)), 7 + p * 28, 0, TAU);
            fctx.fill();
          }
          fctx.globalAlpha = 1;
        }
        // fog passing in front of the wall
        if (murk > 0.05 && PAL.fogA > 0.02) { fctx.globalAlpha = Math.min(0.2, PAL.fogA * 0.4); fctx.fillStyle = patWf; fctx.fillRect(0, 0, W, SHOP); fctx.globalAlpha = 1; }

        // the small lives in three of the lit rooms
        for (let i = 0; i < NWIN; i++) {
          if (!vig[i] || awake[i] < 1) continue;
          const lamp = lampV[i];
          if (lamp > 0.4) drawVig(i, lamp, t);
        }

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

        // Sheer curtains in the open windows on a warm day. The cloth fills the
        // open lower sash (so the digit stays bright) and the real wind carries
        // it out over the brick on the downwind side, rising as it strengthens.
        if (env.openK > 0.02) {
          const dir = windX >= 0 ? 1 : -1, blow = clamp(ws / 22);
          const gw = WW - 2 * FR, gh = WH - 2 * FR;
          // by day white cloth; in a lit room, lamplight glowing through it
          for (let g = 0; g < 2; g++) for (let pass = 0; pass < 2; pass++) {
            if (pass === 0) { fctx.fillStyle = g ? "#ffcf94" : PAL.curtain; fctx.globalAlpha = g ? 0.5 : 0.86; }
            fctx.beginPath();
            for (let i = 0; i < NWIN; i++) {
              if (!isOpen[i] || awake[i] < 1) continue;
              if ((lampV[i] > 0.5 ? 1 : 0) !== g) continue;
              const gx = colX(i % 9) + FR, gy = rowY((i / 9) | 0) + FR;
              const y0 = gy + gh * 0.5 + 1.5, y1 = gy + gh, h = y1 - y0;
              const xe = dir > 0 ? gx + gw : gx, xi = dir > 0 ? gx : gx + gw;
              const L = (8 + 22 * blow) * env.openK * (0.8 + 0.4 * rank[i * 3]);
              const p = t * (1.1 + ws * 0.07) + i * 1.7;
              const lift = blow * (7 + 3 * Math.sin(p * 0.6));
              const ax = xe + dir * L, ay = y0 - lift + Math.sin(p) * (1 + blow * 2);
              const bx = xe + dir * L * 0.82, by = y0 - lift + h * (0.85 - 0.3 * blow) + Math.sin(p + 1.3) * (1.5 + blow * 3);
              if (pass === 0) {
                fctx.moveTo(xi, y0); fctx.lineTo(xe, y0);
                fctx.quadraticCurveTo(xe + dir * L * 0.45, y0 - lift * 0.4 + Math.sin(p + 0.5) * 2, ax, ay);
                fctx.quadraticCurveTo(ax + dir * 4, (ay + by) / 2, bx, by);
                fctx.bezierCurveTo(xe + dir * L * 0.55, by + 4 * Math.sin(p + 2.1), xe + dir * L * 0.2, y1 + 1, xe, y1);
                fctx.lineTo(xi, y1); fctx.closePath();
              } else {
                // soft folds running out along the cloth
                for (let f = 0; f < 3; f++) {
                  const q = 0.25 + f * 0.25;
                  fctx.moveTo(xi + dir * gw * q, y1);
                  fctx.quadraticCurveTo(xe - dir * 6 * (2 - f), y0 + h * (0.25 + 0.2 * f), lerp(ax, bx, q) + dir * 2, lerp(ay, by, q));
                }
              }
            }
            if (pass === 0) fctx.fill();
            else { fctx.strokeStyle = g ? "#b8743a" : PAL.curtainFold; fctx.lineWidth = 1.6; fctx.globalAlpha = 0.5; fctx.stroke(); }
          }
          fctx.globalAlpha = 1;
        }

        // snow lying on every ledge
        if (snowDepth > 0.02) {
          const d = snowDepth * 9;
          fctx.fillStyle = PAL.snow; fctx.beginPath();
          for (let i = 0; i < LEDGES.length; i += 4) mound(LEDGES[i], LEDGES[i + 1], LEDGES[i + 2], d * LEDGES[i + 3]);
          if (hasFact) for (let i = 0; i < BLEDGE.length; i += 4) mound(BLEDGE[i], BLEDGE[i + 1], bY, d * BLEDGE[i + 3]);
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
          // a damp stain under every unit, and the drip that makes it
          fctx.globalAlpha = 0.7 * acK;
          for (let k = 0; k < acs.length; k++) fctx.drawImage(stain, colX(acs[k][0]) + 18, rowY(acs[k][1]) + WH - 1, 46, 46);
          fctx.fillStyle = PAL.drip; fctx.globalAlpha = 0.85 * acK; fctx.beginPath();
          for (let k = 0; k < acs.length; k++) {
            const u = t * (0.5 + 0.25 * hash(k, 21)) + hash(k, 22), p = u - Math.floor(u);
            const y = rowY(acs[k][1]) + WH + 2 + p * p * 150;
            if (y < SHOP - 12) fctx.rect(colX(acs[k][0]) + 34 + hash(k, 23) * 14, y, 2.4, 4 + p * 6);
          }
          fctx.fill(); fctx.globalAlpha = 1;
        }

        // Someone passes the shops about once a minute, dressed for the
        // weather (umbrella when it falls, a hat when it is cold), sometimes
        // with a small dog trotting ahead.
        {
          const per = 44, n = Math.floor(t / per), u = ((t - n * per) * 52) / (W + 240);
          if (u < 1) {
            const dir = hash(n, s.seed + 11) < 0.5 ? 1 : -1, sc = 0.94 + 0.14 * hash(n, 5);
            const dog = hash(n, s.seed + 3) < 0.4;
            const x = dir > 0 ? -120 + u * (W + 240) : W + 120 - u * (W + 240);
            const gy = CURB - 4, st = t * 5.2, sw = Math.sin(st), bob = -Math.abs(Math.cos(st)) * 2;
            const hip = gy - 40 * sc + bob, sho = hip - 33 * sc;
            fctx.strokeStyle = PAL.walker; fctx.fillStyle = PAL.walker; fctx.lineCap = "round"; fctx.lineJoin = "round";
            // legs, then an arm swinging against them
            fctx.lineWidth = 6.5 * sc; fctx.beginPath();
            fctx.moveTo(x, hip); fctx.quadraticCurveTo(x + sw * 6 * sc + dir * 2, hip + 20 * sc, x + sw * 13 * sc, gy);
            fctx.moveTo(x, hip); fctx.quadraticCurveTo(x - sw * 6 * sc + dir * 2, hip + 20 * sc, x - sw * 13 * sc, gy);
            if (!w.falling) { fctx.moveTo(x, sho + 4 * sc); fctx.lineTo(x - sw * 11 * sc, hip + 2 * sc); }
            fctx.stroke();
            // coat, head (a hat when it is cold)
            fctx.beginPath();
            fctx.moveTo(x - 8 * sc, sho); fctx.quadraticCurveTo(x, sho - 4 * sc, x + 8 * sc, sho);
            fctx.lineTo(x + 12 * sc, hip + 12 * sc); fctx.lineTo(x - 12 * sc, hip + 12 * sc); fctx.closePath();
            fctx.moveTo(x + dir * 1.5 + 7.5 * sc, sho - 12 * sc); fctx.arc(x + dir * 1.5, sho - 12 * sc, 7.5 * sc, 0, TAU);
            if (w.temp < 40) fctx.ellipse(x + dir * 1, sho - 18 * sc, 8.5 * sc, 5 * sc, 0, Math.PI, TAU);
            fctx.fill();
            if (w.falling) {
              fctx.lineWidth = 2.5; fctx.beginPath(); fctx.moveTo(x + dir * 9, sho + 10 * sc); fctx.lineTo(x + dir * 9, sho - 32 * sc); fctx.stroke();
              fctx.lineWidth = 4 * sc; fctx.beginPath(); fctx.moveTo(x, sho + 4 * sc); fctx.lineTo(x + dir * 9, sho + 12 * sc); fctx.stroke();
              fctx.fillStyle = PAL.umbrella; fctx.beginPath(); fctx.ellipse(x + dir * 9, sho - 30 * sc, 32 * sc, 16 * sc, 0, Math.PI, TAU); fctx.fill();
            }
            if (dog) {
              // the lead, and a dog on the end of it
              const dx = x + dir * 46 * sc, dy = gy - 15 * sc, ds = Math.sin(st * 1.6);
              fctx.fillStyle = PAL.walker; fctx.lineWidth = 1.4; fctx.beginPath();
              fctx.moveTo(x - sw * 11 * sc * (w.falling ? 0 : 1), w.falling ? sho + 12 * sc : hip + 2 * sc);
              fctx.quadraticCurveTo(x + dir * 30 * sc, hip + 14 * sc, dx + dir * 9 * sc, dy - 6 * sc); fctx.stroke();
              fctx.beginPath();
              fctx.ellipse(dx, dy, 13 * sc, 6 * sc, 0, 0, TAU);
              fctx.moveTo(dx + dir * 15 * sc, dy - 7 * sc); fctx.ellipse(dx + dir * 13 * sc, dy - 7 * sc, 5 * sc, 4.5 * sc, 0, 0, TAU);
              fctx.fill();
              fctx.lineWidth = 3 * sc; fctx.beginPath();
              for (let q = 0; q < 4; q++) { const lx = DOG_LEGS[q]; fctx.moveTo(dx + dir * lx * sc, dy + 3 * sc); fctx.lineTo(dx + dir * lx * sc + ds * (lx > 0 ? 3 : -3) * sc, gy); }
              fctx.moveTo(dx - dir * 12 * sc, dy - 2 * sc); fctx.lineTo(dx - dir * 18 * sc, dy - 9 * sc + ds * 2);
              fctx.stroke();
            }
          }
        }

        // Leaves and litter blown along the front by the real wind (its speed and
        // which way it blows), tumbling end over end; more of them the harder it blows.
        const windK = smoothstep(8, 28, ws) * (snowK > 0.3 ? 0.4 : 1);
        if (windK > 0.02) {
          const n = Math.round(NL * windK), dir = windX >= 0 ? 1 : -1;
          for (let pass = 0; pass < 2; pass++) {
            fctx.fillStyle = pass ? PAL.paper : PAL.leaf; fctx.globalAlpha = 0.95; fctx.beginPath();
            for (let i = pass; i < n; i += 2) {
              const j = i * 5, ph = leaves[j + 2], z = leaves[j + 4];
              leaves[j] += dir * ws * (9 + 7 * z) * dt;
              leaves[j + 1] += (Math.sin(t * (1.1 + z) + ph) * (30 + ws) + 10) * dt;
              if (leaves[j] > W + 40 || leaves[j] < -40 || leaves[j + 1] > LEAF_B || leaves[j + 1] < LEAF_T) {
                leaves[j] = dir > 0 ? -30 : W + 30;
                leaves[j + 1] = LEAF_T + 20 + r() * (LEAF_B - LEAF_T - 40);
              }
              const x = leaves[j], y = leaves[j + 1], sz = leaves[j + 3] * (0.8 + 0.4 * z);
              const a = t * (2 + 3 * z) + ph, ca = Math.cos(a) * sz, sa = Math.sin(a) * sz;
              const flip = 0.25 + 0.75 * Math.abs(Math.sin(t * (1.7 + z) + ph * 2)), cb = -sa * 0.55 * flip, sb = ca * 0.55 * flip;
              fctx.moveTo(x + ca + cb, y + sa + sb); fctx.lineTo(x - ca + cb, y - sa + sb); fctx.lineTo(x - ca - cb, y - sa - sb); fctx.lineTo(x + ca - cb, y + sa - sb);
            }
            fctx.fill();
          }
          fctx.globalAlpha = 1;
        }

        // rain
        if (rainK > 0.02) {
          const n = Math.round(NR * Math.pow(rainK, 0.8));
          const vx = clamp(windX * ws * 34, -900, 900);
          fctx.strokeStyle = PAL.rain; fctx.lineCap = "butt";
          for (let pass = 0; pass < 2; pass++) {
            fctx.globalAlpha = (pass ? 0.5 : 0.28) * (1 + 0.45 * dl); fctx.lineWidth = (pass ? 1.8 : 1.1) + 0.7 * dl;
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
        if (put("date", dateEl, tx_.date)) {
          dateEl.style.letterSpacing = "";
          if (fitText(dateEl, 952) < 44) { dateEl.style.letterSpacing = "0.05em"; fitText(dateEl, 952); }
        }
        if (shown.moon !== tx_.moon) {
          shown.moon = tx_.moon;
          const sp = tx_.moon.indexOf(" ");
          moonA.textContent = sp > 0 ? tx_.moon.slice(0, sp) : tx_.moon;
          moonB.textContent = sp > 0 ? tx_.moon.slice(sp + 1) : "";
          fitText(moonA, 236); fitText(moonB, 236);
        }
        put("ampm", ampmEl, tx_.ampm);
        if (put("aqi", aqiEl, tx_.aqi)) fitText(aqiEl, 100);
        if (put("uv", uvEl, tx_.uv)) fitText(uvEl, 104);
        put("sunL", sunL, tx_.sunLabel);
        if (put("sunV", sunV, tx_.sunValue)) fitText(sunV, 196);
        put("temp", tempEl, tx_.temp);
        if (put("cond", condEl, tx_.condition)) {
          // sign-painter capitals; a long label closes up, then drops to lower case, before it would shrink below 44 px
          condEl.style.letterSpacing = ""; condEl.style.textTransform = "";
          if (fitText(condEl, 372) < 44) { condEl.style.letterSpacing = "0"; if (fitText(condEl, 372) < 44) { condEl.style.textTransform = "none"; fitText(condEl, 372); } }
        }
        if (shown.factV !== tx_.factValue || shown.factL !== tx_.factLabel) {
          put("factL", factL, tx_.factLabel);
          put("factV", factV, tx_.factValue);
          hasFact = tx_.factValue !== "";
          winDirty = true;
          factEl.style.display = hasFact ? "flex" : "none";
          let tall = false;
          if (hasFact) {
            // one line if it fits large, otherwise two lines
            factV.style.whiteSpace = "nowrap"; factV.style.fontSize = "52px"; factV.style.lineHeight = "60px"; factV.style.marginTop = ""; factV.style.marginBottom = "";
            if (factV.scrollWidth > BOARD_W - 60) {
              // one line at 38 (or 36) px if it fits, on the board as it is; otherwise two lines at
              // 36 px on the tall board, a full 80 px apart (line height 2.2, about 44 px of clear
              // space between the lines even past a descender), the label about 26 px above them
              // (the negative margins only trim the half-leading, so the ink sits centred)
              factV.style.whiteSpace = "normal"; factV.style.fontSize = "38px"; factV.style.lineHeight = "55px";
              if (factV.offsetHeight > 57) {
                factV.style.fontSize = "36px";
                if (factV.offsetHeight > 57) {
                  tall = true;
                  factV.style.lineHeight = "80px"; factV.style.marginTop = "-4px"; factV.style.marginBottom = "-11px";
                }
              }
            }
          }
          bY = tall ? BOARD_Y2 : BOARD_Y; bH = tall ? BOARD_H2 : BOARD_H;
          factEl.style.top = `${bY + 10}px`; factEl.style.height = `${bH - (tall ? 20 : 18)}px`;
        }
        first = false;
      },
    };
  },
};

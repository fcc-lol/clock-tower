// Tall Grass
//
// A meadow seen from above and a little to one side. About two thousand blades
// bend in the real wind: gusts cross the field as travelling waves, at the true
// heading (north is up) and at a speed that follows the wind speed, and a bent
// blade shows its pale underside, so a gust reads as a silver band running
// downwind. The time is planted in the field as a taller, stiffer species in
// flower (hours above, minutes below): dark stalks that lean a third as far as
// the grass, carrying a flower colour that belongs to the season. When the
// minute changes the old plants wilt and the new ones grow.
//
// What drives it:
//   wind, gust, windDir   lean, size and sharpness of the silver gust bands,
//                         their speed and heading; a gale lays the field flat
//   day of year           the field's colour family and the flower species
//                         (spring lime + magenta, summer green + poppy red,
//                         autumn straw + aster violet, winter bleached + seed heads)
//   daylight, sky colour  light level and tint; at night the field is near
//                         black-green (blue-black on snow) and the flowers turn
//                         luminous one by one; summer nights have fireflies
//   cloud                 flatter, greyer light; drifting cloud shadows when broken
//   rain                  streaks, blades bowed and nodding under drops, beads,
//                         darker wet wood
//   snow                  white ground, short blades buried, the rest bowed and
//                         capped with snow, flakes, caps on the markers
//   fog, haze, AQI        far rows fade into the measured sky colour; fog (or a
//                         whiteout) also veils the near rows
//   frost, heat           frost-tipped and stiff with tremor in deep cold;
//                         bleached, dusty and slow in heat
//   storm                 violent wave trains and a rare, slow brightening
//
// The other readouts are typed on wooden plant markers staked along the bottom.
//
// Drawing: one opaque canvas, redrawn every frame. The ground (colour, a still
// understory, dither) and the wooden markers are cached in offscreen canvases
// that are repainted only when the light or the weather moves; the frame blits
// them and draws the blades in a few dozen batched fills. Only the type is DOM.

import { W, H, clamp, lerp, smoothstep, rng, hash, createNoise, mix, adjust, rgba, luminance, readableOn, el, addStyle, canvas2d, mask } from "../lib/kit.js";

const KZ = 0.88; // how much of a blade's height shows in this oblique view
const KY = 0.5; // how much the ground is foreshortened toward the top
const CELL = 4; // the planting mask is sampled on a 4 px grid
const MC = W / CELL;
const MR = H / CELL;
const NB = 6; // depth bands (for haze)
const NT = 5; // tones per band, dark to silver
const FRONT0 = NB * NT; // buckets for the blades drawn in front of the markers
const NBUCKET = FRONT0 + NT;
const INK_DARK = "#24160c";
const INK_LIGHT = "#f6ecd2";

// One field family (dark to pale underside) and one flower per season, as they
// look in full sun. `night` is the flower once it has turned luminous.
const SEASONS = {
  winter: { tones: ["#93876a", "#b0a27e", "#c8ba96", "#ddd2b2", "#f1ead6"], ground: "#a39672", stalk: "#7d6045", head: "#22150d", head2: "#3a2617", night: "#b2c9de", pale: "#e4eef7", centre: "#6b5037", hl: 11, hw: 9.5 },
  spring: { tones: ["#4c9c37", "#72bb3c", "#95d247", "#b8e35f", "#e3f5ba"], ground: "#62ab3a", stalk: "#15432b", head: "#b30d6e", head2: "#d2318a", night: "#ff5fae", pale: "#ffb7d8", centre: "#ffe7a0", hl: 7, hw: 13 },
  summer: { tones: ["#439534", "#64b035", "#88c83f", "#aedd57", "#ddf0b0"], ground: "#55a235", stalk: "#103821", head: "#a50f19", head2: "#c4221d", night: "#f0452e", pale: "#ffa089", centre: "#1a0c0c", hl: 2, hw: 14.5 },
  autumn: { tones: ["#a67a2e", "#c59a40", "#dab455", "#ebcf7c", "#f7e9bd"], ground: "#b58c38", stalk: "#4a3a22", head: "#4a27b4", head2: "#6843d8", night: "#9a7dff", pale: "#d0c1ff", centre: "#ffc93a", hl: 2, hw: 13.5 },
};
const ORDER = ["winter", "spring", "summer", "autumn", "winter"];
const CENTRES = [15, 105, 196, 288, 380]; // mid-January, mid-April, mid-July, mid-October

function seasonAt(doy) {
  const x = doy < CENTRES[0] ? doy + 365 : doy;
  let i = 0;
  while (i < 3 && x >= CENTRES[i + 1]) i++;
  const t = smoothstep(0.25, 0.75, (x - CENTRES[i]) / (CENTRES[i + 1] - CENTRES[i]));
  const a = SEASONS[ORDER[i]];
  const b = SEASONS[ORDER[i + 1]];
  const out = { tones: a.tones.map((c, k) => mix(c, b.tones[k], t)), hl: lerp(a.hl, b.hl, t), hw: lerp(a.hw, b.hw, t) };
  for (const key of ["ground", "stalk", "head", "head2", "night", "pale", "centre"]) out[key] = mix(a[key], b[key], t);
  const weight = (name) => (ORDER[i] === name ? 1 - t : 0) + (ORDER[i + 1] === name ? t : 0);
  out.summer = weight("summer");
  out.winter = weight("winter");
  return out;
}

const offscreen = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

export default {
  title: "Tall Grass",
  description: "A meadow bends in the real wind, and the time is planted in it as a taller species in flower.",
  fonts: ["Nunito:wght@900", "Courier Prime:wght@400;700"],
  fps: 24, // a meadow in the wind is slow motion: 24 is smooth, and a fifth less drawing than 30

  mount(root, { seed }) {
    addStyle(root, `
      .tg { position: absolute; inset: 0; overflow: hidden; font-family: "Courier Prime", "Courier New", monospace; color: var(--ink); background: #1d3a22; }
      .tg-txt { position: absolute; inset: 0; }
      .tg-m { position: absolute; left: 0; top: 0; transform-origin: 50% 100%; }
      .tg-plq { box-sizing: border-box; padding: 14px 26px 20px; white-space: nowrap; }
      .tg-lab { font-size: 28px; line-height: 1.15; color: var(--ink2); }
      .tg-val { font-weight: 700; font-size: 48px; line-height: 1.1; margin-top: 16px; }
      .tg-temp { font-weight: 700; font-size: 160px; line-height: .82; letter-spacing: -8px; margin: 14px 0 0 -6px; }
      .tg-cond { font-size: 52px; line-height: 1.75; white-space: normal; max-width: 430px; margin-top: 8px; }
      .tg-d1 { font-weight: 700; font-size: 52px; line-height: 1.4; }
      .tg-d2 { font-size: 52px; line-height: 1.4; margin-top: 16px; }
      .tg-fact .tg-plq { width: 952px; padding: 14px 28px 6px; }
      .tg-fv { font-size: 40px; line-height: 2; white-space: normal; }
      .tg-fv.small { font-size: 36px; line-height: 2.15; }
      .tg-ap .tg-plq { padding: 12px 18px 12px; }
      .tg-apv { font-weight: 700; font-size: 52px; line-height: 1; }
    `);

    const wrap = el("div", { class: "tg" });
    root.append(wrap);
    const view = canvas2d(wrap, { adaptive: true, alpha: false });
    const txt = el("div", { class: "tg-txt" });
    wrap.append(txt);

    const R = rng(seed);
    const noise = createNoise(seed);

    // ---------------------------------------------------------------------
    // The ground cache: colour, a still understory and dither, repainted only
    // when the light or the weather moves. The understory is neutral (black
    // marks, pale marks) and painted once. Both are half resolution: soft.
    // ---------------------------------------------------------------------
    const groundC = offscreen(W / 2, H / 2); // soft, so half resolution is plenty
    const gctx = groundC.getContext("2d", { alpha: false });
    gctx.scale(0.5, 0.5);
    const texDark = offscreen(W / 2, H / 2);
    const texLight = offscreen(W / 2, H / 2);
    const paintUnder = (ctx, count, dark) => {
      ctx.scale(0.5, 0.5);
      ctx.lineCap = "butt";
      if (dark) {
        for (let i = 0; i < 40; i++) {
          const x = R.range(-100, W + 100), y = R.range(0, H), rad = R.range(120, 330);
          const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
          g.addColorStop(0, "rgba(0,0,0,0.14)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.fillRect(x - rad, y - rad * 0.6, rad * 2, rad * 1.2);
        }
      }
      for (let band = 0; band < 5; band++) {
        for (let a = 0; a < 4; a++) {
          const y0 = (band / 5) * (H + 40), y1 = ((band + 1) / 5) * (H + 40);
          const depth = (band + 0.5) / 5;
          ctx.lineWidth = lerp(3, 6.4, depth) * (dark ? 1.2 : 0.9);
          ctx.strokeStyle = dark ? `rgba(0,10,4,${0.12 + a * 0.07})` : `rgba(255,255,226,${0.1 + a * 0.07})`;
          ctx.beginPath();
          const n = Math.round((count / 20) * lerp(1.5, 0.6, depth));
          for (let i = 0; i < n; i++) {
            const x = R.range(-20, W + 20), y = R.range(y0, y1);
            const len = lerp(18, 52, depth) * R.range(0.6, 1.25);
            const lean = R.range(-0.5, 0.5);
            ctx.moveTo(x, y);
            ctx.lineTo(x + lean * len, y - len * 0.86);
          }
          ctx.stroke();
        }
      }
    };
    paintUnder(texDark.getContext("2d"), 3000, true);
    paintUnder(texLight.getContext("2d"), 2000, false);
    // dither: smooth dark gradients band on a big LCD
    const ditherC = offscreen(128, 128);
    {
      const dc = ditherC.getContext("2d");
      const img = dc.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = R();
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v > 0.5 ? 255 : 0;
        img.data[i + 3] = Math.abs(v - 0.5) * 2 * 255;
      }
      dc.putImageData(img, 0, 0);
    }
    const dither = gctx.createPattern(ditherC, "repeat");
    // a soft round shadow, for drifting cloud shadows
    const blobC = offscreen(128, 128);
    {
      const bc = blobC.getContext("2d");
      const g = bc.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, "rgba(4,26,22,0.55)");
      g.addColorStop(0.55, "rgba(4,26,22,0.36)");
      g.addColorStop(1, "rgba(4,26,22,0)");
      bc.fillStyle = g;
      bc.fillRect(0, 0, 128, 128);
    }

    // ---------------------------------------------------------------------
    // The markers. Their type is DOM (crisp on the 4K panel); their wood,
    // stakes, shadows and snow caps are painted into a cache canvas.
    // ---------------------------------------------------------------------
    const markC = offscreen(W, H);
    const mctx = markC.getContext("2d");
    const marker = (cls, kids, stakes = 1) => {
      const plq = el("div", { class: "tg-plq" }, kids);
      const node = el("div", { class: `tg-m ${cls}` }, plq);
      txt.append(node);
      return { node, plq, stakes, rot: R.range(0.6, 1.8) * R.sign(), grain: R.int(1, 1e6), x: 0, y: 0, w: 0, h: 0, stake: 0, off: false };
    };
    const tx = (cls) => el("div", { class: cls });
    const n = {
      temp: tx("tg-temp"), cond: tx("tg-cond"), d1: tx("tg-d1"), d2: tx("tg-d2"),
      sunL: tx("tg-lab"), sunV: tx("tg-val"), moonV: tx("tg-val"), aqiV: tx("tg-val"), uvV: tx("tg-val"),
      factL: tx("tg-lab"), factV: tx("tg-fv"), ap: tx("tg-apv"),
    };
    const lab = (text) => el("div", { class: "tg-lab", text });
    const mTemp = marker("tg-temp-m", [n.temp, n.cond], 2);
    const mDate = marker("tg-date", [n.d1, n.d2]);
    const mSun = marker("tg-sun", [n.sunL, n.sunV]);
    const mMoon = marker("tg-moon", [lab("Moon"), n.moonV]);
    const mAqi = marker("tg-aqi", [lab("Air quality"), n.aqiV]);
    const mUv = marker("tg-uv", [lab("UV index"), n.uvV]);
    const mFact = marker("tg-fact", [n.factL, n.factV], 2);
    const mAp = marker("tg-ap", [n.ap]);
    mFact.rot = 0.3 * Math.sign(mFact.rot);
    mTemp.rot *= 0.5;
    mAp.rot = 2.4 * Math.sign(mAp.rot);
    const allMarkers = [mTemp, mDate, mSun, mMoon, mAqi, mUv, mFact, mAp];
    const stagger = [R.range(-8, 8), R.range(-10, 4), R.range(-10, 4), R.range(-10, 4)];

    const shown = {};
    const put = (key, node, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };
    const place = (m, x, y, stake) => {
      m.x = x; m.y = y; m.stake = stake;
      m.node.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) rotate(${m.rot.toFixed(2)}deg)`;
    };

    // ---------------------------------------------------------------------
    // Where the time stands. The numerals are a mask of Nunito Black; flower
    // heads are planted wherever the mask is set.
    // ---------------------------------------------------------------------
    const probe = offscreen(8, 8).getContext("2d");
    probe.font = '900 100px "Nunito"';
    let pair = 0;
    for (let dgt = 0; dgt < 10; dgt++) pair = Math.max(pair, probe.measureText(`${dgt}${dgt}`).width / 100);
    const capH = (probe.measureText("0").actualBoundingBoxAscent || 70.5) / 100;
    const FS = Math.min(540, 664 / pair);
    const digitH = capH * FS;
    const TIME_TOP = 112;
    const ROW_GAP = 62;
    const HOURS_BASE = TIME_TOP + digitH;
    const MINS_BASE = HOURS_BASE + ROW_GAP + digitH;
    const STALK = 38;

    let timeMask = null;
    const inMask = (x, y) => {
      const c = (x / CELL) | 0, r = (y / CELL) | 0;
      return c >= 0 && c < MC && r >= 0 && r < MR && timeMask.data[r * MC + c] > 96;
    };
    const buildMask = (hh, mm) => {
      timeMask = mask(MC, MR, (ctx) => {
        ctx.font = `900 ${FS / CELL}px "Nunito"`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(hh, W / 2 / CELL, HOURS_BASE / CELL);
        ctx.fillText(mm, W / 2 / CELL, MINS_BASE / CELL);
      });
    };

    // Every place a flower could stand: a jittered hex grid over the time's area.
    const PITCH = 16, PROW = 13.5;
    const px = [], py = [];
    for (let row = 0, y = TIME_TOP - 14; y < MINS_BASE + 14; y += PROW, row++) {
      for (let x = 58 + (row % 2) * (PITCH / 2); x < W - 58; x += PITCH) {
        px.push(x + R.range(-3.4, 3.4));
        py.push(y + R.range(-3.2, 3.2));
      }
    }
    const NP = px.length;
    const PX = Float32Array.from(px), PY = Float32Array.from(py);
    const PSL = new Float32Array(NP), PPH = new Float32Array(NP), PFQ = new Float32Array(NP), PTH = new Float32Array(NP), PDL = new Float32Array(NP), PSD = new Float32Array(NP);
    const PG = new Float32Array(NP); // growth 0..1
    const PT = new Uint8Array(NP); // should it be standing
    const PVAR = new Uint8Array(NP);
    const PHX = new Float32Array(NP), PHY = new Float32Array(NP), PUX = new Float32Array(NP), PUY = new Float32Array(NP);
    const PBK = new Uint8Array(NP); // which head bucket this frame (255 none)
    for (let i = 0; i < NP; i++) {
      PSL[i] = STALK * R.range(0.82, 1.18);
      PPH[i] = R.range(0, 6.283);
      PFQ[i] = R.range(0.7, 1.5);
      PTH[i] = R.range(0.148, 0.172); // how dark the field must be before this head turns luminous
      PDL[i] = R();
      PSD[i] = R.sign() * R.range(0.6, 1.2);
      PVAR[i] = R.chance(0.5) ? 0 : R.chance(0.64) ? 1 : 2;
    }

    // ---------------------------------------------------------------------
    // The field: rows of blades, larger and wider apart toward the bottom.
    // ---------------------------------------------------------------------
    const f = { x: [], y: [], len: [], hw: [], tone: [], ph: [], fq: [], splay: [], stiff: [], band: [], rnd: [], acc: [] };
    for (let y = 26; y < H + 84; ) {
      const depth = clamp(y / H);
      const gap = lerp(25, 47, depth);
      for (let x = -R.range(0, gap); x < W + gap; x += gap * R.range(0.72, 1.28)) {
        const yy = y + R.range(-9, 9);
        f.x.push(x); f.y.push(yy);
        f.len.push(lerp(50, 124, depth) * R.range(0.72, 1.2));
        f.hw.push(lerp(2.7, 6.4, depth) * R.range(0.8, 1.25));
        f.tone.push(R.range(0.2, 0.5) + 0.1 * noise.n2(x / 380, yy / 240));
        f.ph.push(R.range(0, 6.283)); f.fq.push(R.range(0.9, 2.1));
        f.splay.push(R.range(-0.2, 0.2)); f.stiff.push(R.range(0.84, 1.14));
        f.band.push(clamp(Math.floor((yy / H) * NB + R.range(-0.5, 0.5)), 0, NB - 1));
        f.rnd.push(R()); f.acc.push(R());
      }
      y += lerp(19, 38, depth);
    }
    const NF = f.x.length;
    const FX = Float32Array.from(f.x), FY = Float32Array.from(f.y), FLEN = Float32Array.from(f.len), FHW = Float32Array.from(f.hw);
    const FTONE = Float32Array.from(f.tone), FPH = Float32Array.from(f.ph), FFQ = Float32Array.from(f.fq), FSPL = Float32Array.from(f.splay);
    const FSTF = Float32Array.from(f.stiff), FRND = Float32Array.from(f.rnd), FACC = Float32Array.from(f.acc);
    const FBAND = Uint8Array.from(f.band);
    const FFRONT = new Uint8Array(NF); // drawn in front of the markers
    const FHIDE = new Uint8Array(NF); // wholly behind a marker
    const FLIM = new Float32Array(NF).fill(1e3); // longest it may be (so it does not cover a marker's type)
    const FG = new Float32Array(NF).fill(1); // growth
    const FT = new Uint8Array(NF).fill(1); // 0 where the time's plants have taken the ground
    const FNOD = new Float32Array(NF).fill(9); // seconds since a raindrop hit
    const TX = new Float32Array(NF), TY = new Float32Array(NF), CX = new Float32Array(NF), CY = new Float32Array(NF), FL = new Float32Array(NF);
    const FB = new Uint8Array(NF);
    const order = new Uint16Array(NF);
    const cnt = new Int32Array(NBUCKET), start = new Int32Array(NBUCKET);

    // Fireflies, for warm dry summer nights.
    const NFLY = 34;
    const YX = new Float32Array(NFLY), YY = new Float32Array(NFLY), YP = new Float32Array(NFLY), YF = new Float32Array(NFLY), YR = new Float32Array(NFLY);
    for (let i = 0; i < NFLY; i++) {
      YX[i] = R.range(60, W - 60); YY[i] = R.range(160, H - 120); YP[i] = R.range(0, 6.283); YF[i] = R.range(0.7, 1.3); YR[i] = R.range(0.7, 1.2);
    }
    const flyC = offscreen(48, 48);
    {
      const fc = flyC.getContext("2d");
      const g = fc.createRadialGradient(24, 24, 0, 24, 24, 24);
      g.addColorStop(0, "rgba(250,255,190,1)");
      g.addColorStop(0.12, "rgba(240,255,140,0.95)");
      g.addColorStop(0.35, "rgba(200,240,90,0.28)");
      g.addColorStop(1, "rgba(160,220,60,0)");
      fc.fillStyle = g;
      fc.fillRect(0, 0, 48, 48);
    }

    // Rain and snow.
    const NQ = 340;
    const QX = new Float32Array(NQ), QY = new Float32Array(NQ), QZ = new Float32Array(NQ), QP = new Float32Array(NQ);
    for (let i = 0; i < NQ; i++) {
      QX[i] = R.range(-120, W + 120); QY[i] = R.range(-80, H + 80); QZ[i] = R.range(0.6, 1.25); QP[i] = R.range(0, 6.283);
    }

    // After the markers move: which blades stand in front of them, which are hidden.
    const classify = () => {
      for (let i = 0; i < NF; i++) {
        const x = FX[i], y = FY[i];
        let isFront = 0, hide = 0, lim = 1e3, behind = 0;
        for (let k = 0; k < allMarkers.length; k++) {
          const m = allMarkers[k];
          if (m.off) continue;
          const base = m.y + m.h + m.stake;
          if (x > m.x - 4 && x < m.x + m.w + 4 && y > m.y - 4 && y <= base) behind = 1;
          if (x > m.x + 26 && x < m.x + m.w - 26 && y > m.y + FLEN[i] && y < m.y + m.h - 6) hide = 1;
          if (x > m.x - 34 && x < m.x + m.w + 34 && y > base && y < base + 170) {
            isFront = 1;
            lim = Math.min(lim, y - (m.y + m.h) + 16);
          }
        }
        FFRONT[i] = isFront && !behind ? 1 : 0;
        FHIDE[i] = hide;
        FLIM[i] = isFront && !behind ? Math.max(18, lim) : 1e3;
      }
    };

    // the wood, painted into the marker cache
    const wood = { face: "#dfc097", stake: "#b3906a", edge: "#fff3d6", grainD: 0.09, grainL: 0.07, shadow: "#04180e", shadowO: 0.3, cap: 0, snow: "#fbfdff" };
    const paintMarkers = () => {
      const c = mctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, W, H);
      for (let k = 0; k < allMarkers.length; k++) {
        const m = allMarkers[k];
        if (m.off) continue;
        const { w, h } = m;
        const G = rng(m.grain);
        c.setTransform(1, 0, 0, 1, m.x + w / 2, m.y + h);
        c.rotate((m.rot * Math.PI) / 180);
        const x0 = -w / 2, y0 = -h;
        const stakeXs = m.stakes === 1 ? [0] : [x0 + w * 0.14, x0 + w * 0.86];
        // cast shadow, falling down and to the right across the grass
        if (wood.shadowO > 0.01) {
          c.fillStyle = rgba(wood.shadow, wood.shadowO * 0.55);
          c.beginPath();
          roundRect(c, x0 + 14, y0 + 20, w, h, 10);
          c.fill();
          c.fillStyle = rgba(wood.shadow, wood.shadowO * 0.45);
          c.beginPath();
          roundRect(c, x0 + 8, y0 + 11, w, h, 8);
          c.fill();
        }
        // stakes
        for (const sx of stakeXs) {
          c.fillStyle = wood.stake;
          c.fillRect(sx - 9, -6, 18, m.stake + 6);
          c.fillStyle = "rgba(0,0,0,0.2)";
          c.fillRect(sx - 9, -6, 5, m.stake + 6);
          c.fillStyle = "rgba(0,0,0,0.28)";
          c.fillRect(sx - 9, 0, 18, 7);
        }
        // the board
        c.save();
        c.beginPath();
        roundRect(c, x0, y0, w, h, 6);
        c.fillStyle = wood.face;
        c.fill();
        c.clip();
        for (let pass = 0; pass < 2; pass++) {
          c.lineWidth = pass ? 2.2 : 1.1;
          c.strokeStyle = `rgba(60,25,0,${wood.grainD * (pass ? 0.55 : 1)})`;
          c.beginPath();
          for (let yy = y0 + G.range(3, 12); yy < 0; yy += G.range(7, 19)) {
            const a = G.range(-3, 3), b = G.range(-3, 3);
            const xa = x0 + G.range(-40, w * 0.3), xb = xa + G.range(w * 0.4, w * 1.1);
            c.moveTo(xa, yy);
            c.bezierCurveTo(xa + (xb - xa) * 0.33, yy + a, xa + (xb - xa) * 0.66, yy + b, xb, yy + a * 0.4);
          }
          c.stroke();
        }
        c.strokeStyle = `rgba(255,250,235,${wood.grainL})`;
        c.beginPath();
        for (let yy = y0 + G.range(5, 12); yy < 0; yy += G.range(10, 22)) {
          c.moveTo(x0, yy);
          c.bezierCurveTo(x0 + w * 0.4, yy + G.range(-2, 2), x0 + w * 0.7, yy + G.range(-2, 2), x0 + w, yy);
        }
        c.stroke();
        // a knot or two
        c.strokeStyle = `rgba(60,25,0,${wood.grainD * 1.2})`;
        c.lineWidth = 1.6;
        const kx = x0 + G.range(0.15, 0.85) * w, ky = y0 + G.range(0.25, 0.8) * h;
        c.beginPath();
        c.ellipse(kx, ky, G.range(8, 16), G.range(2.5, 4.5), 0, 0, 6.2832);
        c.stroke();
        // bevel
        c.fillStyle = wood.edge;
        c.fillRect(x0, y0, w, 3);
        c.fillStyle = "rgba(40,15,0,0.22)";
        c.fillRect(x0, -6, w, 6);
        c.restore();
        // snow lying on the top edge
        if (wood.cap > 0.02) {
          c.globalAlpha = wood.cap;
          c.fillStyle = wood.snow;
          c.beginPath();
          roundRect(c, x0 - 3, y0 - 7, w + 6, 13, 6);
          for (let xx = x0 + 6; xx < x0 + w - 6; xx += G.range(22, 46)) {
            const rw = G.range(16, 30), rh = G.range(5, 10);
            c.moveTo(xx + rw, y0 - 3);
            c.ellipse(xx, y0 - 3, rw, rh, 0, 0, 6.2832);
          }
          c.fill();
          c.fillStyle = "rgba(80,110,150,0.22)";
          c.fillRect(x0 + 4, y0 + 3, w - 8, 4);
          c.globalAlpha = 1;
        }
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
    };

    let laidFact = null;
    const layout = () => {
      const hasFact = shown.fv !== "";
      mFact.off = !hasFact;
      mFact.node.style.display = hasFact ? "" : "none";
      if (hasFact) {
        // a long fact steps down a size rather than taking a third line
        n.factV.classList.remove("small");
        if (n.factV.offsetHeight > 120) n.factV.classList.add("small");
      }
      // the condition wraps rather than crowd the moon's marker
      const moonW = mMoon.plq.offsetWidth;
      n.cond.style.maxWidth = `${Math.round(clamp(952 - 60 - moonW - 52, 250, 430))}px`;
      // when only a value changed and every board kept its size, nothing moves
      let same = hasFact === laidFact;
      for (const m of allMarkers) {
        const w = m.plq.offsetWidth, h = m.plq.offsetHeight;
        if (w !== m.w || h !== m.h) same = false;
        m.w = w;
        m.h = h;
      }
      if (same) return;
      laidFact = hasFact;
      const L = 64, RT = 1016;
      // The gaps between the rows of markers. When a tall day (a wrapped
      // condition, a two-line fact) would push the top row toward the time,
      // these close up, never below their floors, so the time keeps its air.
      const TOP_MIN = MINS_BASE + 110;
      const stack = (sq) => {
        const gFact = lerp(60, 36, sq), gRow = lerp(62, 38, sq), gDate = lerp(64, 40, sq);
        let y = 1800;
        if (hasFact) {
          place(mFact, L, 1870 - mFact.h, 90);
          y = mFact.y - gFact;
        }
        // the middle row: sun, air, UV
        const row = [mSun, mAqi, mUv];
        let total = 0;
        for (const m of row) total += m.w;
        const gap = (RT - L - total) / 2;
        let x = L, rowTop = 1e4;
        row.forEach((m, i) => {
          const top = y - m.h + stagger[i + 1];
          place(m, x, top, y + 70 - (top + m.h));
          rowTop = Math.min(rowTop, top);
          x += m.w + gap;
        });
        y = rowTop - gRow;
        // the top row: temperature on the left, the date over the moon on the right
        place(mTemp, L, y - mTemp.h, 60);
        place(mMoon, RT - mMoon.w, y - mMoon.h + stagger[0] * 0.5, 64);
        const dBase = mMoon.y - gDate;
        place(mDate, RT - mDate.w + Math.round(stagger[3]), dBase - mDate.h, mMoon.y + mMoon.h + 40 - dBase);
        return Math.min(mTemp.y, mDate.y);
      };
      for (let sq = 0; sq <= 1 && stack(sq) < TOP_MIN; sq += 0.125);
      place(mAp, RT - mAp.w, MINS_BASE - 50 - mAp.h, 46);
      classify();
      paintMarkers();
    };

    // ---------------------------------------------------------------------
    // Colour. Everything is recomputed only when the light or weather moves.
    // ---------------------------------------------------------------------
    const fieldCol = new Array(NBUCKET).fill("#000");
    const pal = { head: new Array(7).fill("#000"), stalk: "#000", centre: "#000", accent: "#000", bead: "#000", rain: "#000", flake: "#000", flake2: "#000", hl: 4, hw: 13, groundLum: 0, bgLum: 0 };
    let season = null, seasonDay = -1;
    let sigA = -1, sigB = -1, sigSky = "";

    const cond = { snow: 0, wet: 0, frost: 0, hot: 0, haze: 0, fog: 0, warm: 0, moon: 0, dew: 0, cloud: 0 };

    const recolour = (s) => {
      const d = s.daylight;
      const dk = Math.pow(d, 1.1);
      const { snow, wet, frost, hot, haze, fog, warm, moon, cloud } = cond;
      const sky = s.sky.mean;
      const twilight = 4 * d * (1 - d);
      const dim = 1 - 0.13 * cloud - 0.07 * wet;
      const chroma = (1 - 0.22 * cloud) * (1 + 0.14 * wet) * (1 - 0.45 * hot);
      const hazeCol = mix(sky, "#f4f6f4", 0.3 * dk);
      const snowDay = mix("#f3f6f9", sky, 0.1);
      const lit = (day, night, skyTint) => mix(mix(night, day, dk), sky, skyTint);

      const midTone = adjust(season.tones[2], { l: (v) => v * dim, c: (v) => v * chroma });
      const base = [];
      for (let k = 0; k < NT; k++) {
        let day = adjust(season.tones[k], { l: (v) => v * dim, c: (v) => v * chroma });
        day = mix(day, midTone, 0.22 * cloud);
        if (warm > 0.01) day = mix(day, "#ffb347", warm * (0.1 + 0.07 * k));
        if (hot > 0.01) day = mix(day, "#dcc47e", hot * (0.38 + 0.06 * k)); // bleached
        if (frost > 0.01) day = mix(day, "#e9f1f5", frost * 0.07 * k);
        if (snow > 0.01) day = mix(day, snowDay, snow * (0.22 + 0.1 * k));
        // night: near black-green with a memory of the season's own colour; the
        // pale underside still catches a little light, so the wind stays visible
        let night = mix(mix("#0d1b15", "#3d5f50", k / (NT - 1)), adjust(season.tones[k], { l: 0.18 + 0.06 * k, c: (v) => v * 0.4 }), 0.4);
        if (moon > 0.01) night = mix(night, "#5a7890", moon * 0.1 * k);
        if (snow > 0.01) night = mix(night, mix("#162030", "#4e6380", k / (NT - 1)), snow * 0.7);
        let c = lit(day, night, 0.05 + 0.17 * twilight);
        // wet blades glisten: the pale side of a bent blade catches the sky
        if (wet > 0.01 && k >= 2) c = mix(c, mix(sky, "#d6e0e6", 0.35 + 0.3 * dk), wet * 0.16 * (k - 1));
        base.push(c);
      }
      // haze fades the far rows; fog also lays a veil over the near ones
      const hz = (b) => clamp(haze * Math.pow(1 - b / (NB - 1), 1.7) + haze * 0.05 + fog * (0.42 - 0.2 * (b / (NB - 1))));
      for (let b = 0; b < NB; b++) for (let k = 0; k < NT; k++) fieldCol[b * NT + k] = mix(base[k], hazeCol, hz(b));
      for (let k = 0; k < NT; k++) fieldCol[FRONT0 + k] = mix(base[k], hazeCol, hz(NB - 1));

      // the ground behind the blades
      let gDay = adjust(season.ground, { l: (v) => v * dim * 0.97, c: (v) => v * chroma });
      if (warm > 0.01) gDay = mix(gDay, "#f0a03c", warm * 0.1);
      if (hot > 0.01) gDay = mix(gDay, "#c9ad62", hot * 0.4);
      gDay = mix(gDay, snowDay, smoothstep(0, 0.8, snow));
      let gNight = mix(mix("#0a1510", adjust(season.ground, { l: 0.17, c: (v) => v * 0.35 }), 0.4), "#141e2c", snow * 0.85);
      if (moon > 0.01) gNight = mix(gNight, "#1c2a36", moon * 0.35);
      const ground = lit(gDay, gNight, 0.06 + 0.18 * twilight);
      const g0 = mix(ground, hazeCol, hz(0)), g1 = mix(ground, hazeCol, hz(1.6)), g2 = mix(ground, hazeCol, hz(3.2));
      const g3 = mix(adjust(ground, { l: (v) => v * 0.94 }), hazeCol, hz(NB - 1));
      pal.groundLum = luminance(g2);
      // how bright the field behind the flowers is: the flowers switch from
      // dark to luminous where the two read equally well against it
      pal.bgLum = 0.5 * pal.groundLum + 0.5 * luminance(fieldCol[2 * NT + 2]);
      const lumi = smoothstep(0.2, 0.12, pal.bgLum);
      const gg = gctx.createLinearGradient(0, 0, 0, H);
      gg.addColorStop(0, g0); gg.addColorStop(0.28, g1); gg.addColorStop(0.58, g2); gg.addColorStop(1, g3);
      gctx.globalAlpha = 1;
      gctx.fillStyle = gg;
      gctx.fillRect(0, 0, W, H);
      gctx.globalAlpha = lerp(0.55, 0.95, dk) * (1 - 0.82 * snow);
      gctx.drawImage(texDark, 0, 0, W, H);
      gctx.globalAlpha = lerp(0.1, 0.7, dk) * (1 - 0.7 * snow) * (1 - 0.3 * cloud);
      gctx.drawImage(texLight, 0, 0, W, H);
      gctx.globalAlpha = 0.045;
      gctx.fillStyle = dither;
      gctx.fillRect(0, 0, W, H);
      gctx.globalAlpha = 1;

      // the time's plants
      const headHaze = haze * 0.16 + fog * 0.06;
      const dusk = 1 - dk;
      const dayHead = (c) => mix(mix(adjust(c, { l: (v) => v * (1 - 0.06 * cloud) }), "#060606", dusk * 0.45), hazeCol, headHaze);
      pal.head[0] = dayHead(season.head);
      pal.head[1] = dayHead(season.head2);
      pal.head[2] = dayHead(mix(season.head2, season.pale, 0.22));
      const headN = mix(adjust(season.night, { l: (v) => v * 0.94 }), season.pale, smoothstep(0.1, 0.45, d) * 0.85);
      pal.head[3] = headN;
      pal.head[4] = mix(headN, "#0a0612", 0.2);
      pal.head[5] = mix(mix(season.pale, "#f4ff8a", season.summer), "#ffffff", season.winter * 0.6);
      pal.stalk = mix(lit(season.stalk, mix("#07100c", season.night, 0.2), 0.03), hazeCol, headHaze);
      pal.head[6] = mix(pal.stalk, lumi > 0.5 ? headN : pal.head[0], 0.5);
      // a luminous head has a pale heart, not a dark one: dark hearts mottle the numerals at night
      pal.centre = mix(mix(season.centre, "#060606", dusk * 0.3), mix(headN, season.pale, 0.55), lumi);
      pal.hl = season.hl;
      pal.hw = season.hw;

      // tips: snow, frost or dust; beads of rain or dew
      const snowTip = lit("#ffffff", "#9fb3c8", 0.04);
      const frostCol = lit("#f4fafc", "#7d93a3", 0);
      const dustCol = lit("#f1d98c", "#5a5234", 0.05);
      pal.accent = snow > 0.2 ? snowTip : frost >= hot ? frostCol : dustCol;
      pal.bead = lit("#f4f8f6", mix("#6f8492", "#aebfcc", moon), 0.1);
      const pale = lit("#ffffff", "#9eb2c4", 0.1);
      pal.rain = pal.groundLum > 0.22 ? rgba(mix("#31505c", sky, 0.25), 0.42) : rgba(pale, 0.3);
      pal.flake = lit("#ffffff", "#9fb2c8", 0.05);
      pal.flake2 = lit("#b3c4d8", "#62748c", 0.05);

      // The markers: pale wood with burnt-in type by day, dark wood with cream
      // type by night. The wood moves quickly through mid-grey and the ink
      // switches sides in one step there; it never fades.
      const wk = smoothstep(0.3, 0.46, d);
      const woodDay = adjust(mix("#e3c69e", "#a07e55", 0.4 * wet), { l: (v) => v * (1 - 0.05 * cloud) });
      const woodNight = mix("#2e2219", "#2a2a33", 0.4 * snow);
      wood.face = mix(mix(woodNight, woodDay, wk), sky, 0.03);
      wood.stake = mix(mix("#1c140e", "#3a3a45", 0.3 * snow), mix("#b3906a", "#7d603f", 0.4 * wet), wk);
      wood.edge = rgba(mix("#5a4634", "#fff3d6", wk), 0.7);
      wood.grainD = lerp(0.2, 0.1, wk);
      wood.grainL = lerp(0.03, 0.08, wk);
      wood.snow = lit("#fbfdff", "#8496ae", 0.04);
      wood.cap = Math.round(smoothstep(0.15, 0.6, snow) * 20) / 20;
      wood.shadow = mix("#04180e", "#2c4468", snow);
      wood.shadowO = Math.round(dk * (1 - 0.7 * cloud) * 0.5 * 50) / 50;
      const ink = readableOn(wood.face, INK_LIGHT, INK_DARK);
      const light = ink === INK_LIGHT;
      wrap.style.setProperty("--ink", ink);
      wrap.style.setProperty("--ink2", light ? "#d9cba8" : mix("#4a3220", INK_DARK, 0.3 + 0.4 * wet));
      if (allMarkers[0].w) paintMarkers();
    };

    // ---------------------------------------------------------------------
    // The frame.
    // ---------------------------------------------------------------------
    let lastMs = null;
    let changeT = -100;
    let phase = R.range(0, 5000);
    let fineP = R.range(0, 5000);
    let shadeP = R.range(0, 3000);
    let timeKey = "";
    let g0 = 0, g1 = 1, gSharp = 2, gDrift = 0;
    const LAMBDA = 6.2832 / 520; // one crest every 520 px of ground
    const gustAt = (u, v) => {
      const warp = 0.6 * Math.sin(v / 330 + gDrift * 9) + 0.4 * Math.sin(v / 170 - u / 640 + gDrift * 13);
      const crest = 0.5 + 0.5 * Math.cos((u - phase) * LAMBDA + warp * 3);
      const patch = smoothstep(g0, g1, noise.n2((u - phase * 0.6) / 1100, v / 640 - gDrift));
      return Math.pow(crest, gSharp) * (0.25 + 0.75 * patch);
    };
    const RN = rng(seed + 77); // raindrops on blades

    const frame = (s) => {
      const t = s.t, dt = s.dt, w = s.weather, d = s.daylight;
      const jumped = lastMs == null || Math.abs(s.ms - lastMs) > 4000;
      lastMs = s.ms;

      // ----- the readouts -----
      const T = s.text;
      let moved = false;
      moved = put("temp", n.temp, T.temp) || moved;
      moved = put("cond", n.cond, T.condition) || moved;
      moved = put("d1", n.d1, `${T.weekday},`) || moved;
      moved = put("d2", n.d2, T.monthDay) || moved;
      moved = put("sunL", n.sunL, T.sunLabel) || moved;
      moved = put("sunV", n.sunV, T.sunValue) || moved;
      moved = put("moon", n.moonV, T.moon) || moved;
      moved = put("aqi", n.aqiV, T.aqi) || moved;
      moved = put("uv", n.uvV, T.uv) || moved;
      moved = put("fl", n.factL, T.factLabel) || moved;
      moved = put("fv", n.factV, T.factValue) || moved;
      moved = put("ap", n.ap, T.ampm) || moved;

      // ----- the time's planting -----
      if (T.time !== timeKey) {
        timeKey = T.time;
        buildMask(T.hh, T.mm);
        changeT = t;
        for (let i = 0; i < NP; i++) PT[i] = inMask(PX[i], PY[i]) ? 1 : 0;
        for (let i = 0; i < NF; i++) {
          const x = FX[i], y = FY[i];
          FT[i] = inMask(x, y - 6) || inMask(x, y - 24) || inMask(x, y - 42) ? 0 : 1;
        }
        if (jumped) changeT = -100;
      }
      if (jumped) {
        for (let i = 0; i < NP; i++) PG[i] = PT[i];
        for (let i = 0; i < NF; i++) FG[i] = FT[i];
      }
      const sinceChange = t - changeT;

      // ----- what the weather is doing -----
      const cloud = w.cloud / 100;
      const falling = w.falling;
      const snowing = falling === "snow" ? w.intensity : 0;
      const raining = falling && falling !== "snow" ? w.intensity : 0;
      let snowPast = 0;
      const past = s.pastHours;
      for (let i = past.length - 1, k = 0; i >= 0 && k < 12; i--, k++) {
        const h = past[i];
        if (h.kind === "snow" && h.temp < 34) snowPast += 0.25;
      }
      cond.snow = w.temp > 36 ? 0 : clamp(Math.max(snowing > 0 ? 0.62 + 0.38 * snowing : 0, Math.min(1, snowPast)));
      cond.wet = clamp(raining * 1.3);
      cond.frost = clamp((33 - w.temp) / 16) * (1 - cond.wet);
      cond.hot = clamp((w.temp - 84) / 12);
      cond.cloud = cloud;
      const fogness = w.fog ? 1 : clamp((5 - w.visibility) / 5);
      cond.fog = fogness;
      cond.haze = clamp(0.1 + 0.72 * fogness + clamp((w.aqi - 60) / 260) + 0.22 * cond.hot + 0.3 * snowing + 0.12 * raining);
      cond.warm = d * (1 - 0.75 * cloud) * (1 - smoothstep(3, 24, s.sun.alt));
      cond.moon = s.moon.up ? s.moon.illumination * clamp(s.moon.alt / 25) * (1 - 0.8 * cloud) * (1 - d) : 0;
      cond.dew = clamp((3.5 - (w.temp - w.dewPoint)) / 3) * (1 - smoothstep(8, 28, s.sun.alt)) * (w.temp > 33 ? 1 : 0);

      if (s.clock.doy !== seasonDay) {
        seasonDay = s.clock.doy;
        season = seasonAt(seasonDay);
        sigA = -1;
      }
      if (moved) layout();
      const a = Math.round(d * 250) + 251 * (Math.round(cloud * 40) + 41 * (Math.round(cond.wet * 30) + 31 * (Math.round(cond.snow * 40) + 41 * Math.round(cond.haze * 60))));
      const b = 400000 * Math.round(cond.fog * 20) + Math.round(cond.warm * 40) + 41 * (Math.round(cond.moon * 20) + 21 * (Math.round(cond.frost * 20) + 21 * Math.round(cond.hot * 20)));
      if (a !== sigA || b !== sigB || s.sky.mean !== sigSky) {
        sigA = a; sigB = b; sigSky = s.sky.mean;
        recolour(s);
      }

      // ----- the wind -----
      const toward = ((w.windDir + 180) * Math.PI) / 180;
      const wdx = Math.sin(toward), wdy = -Math.cos(toward); // north is up
      const windN = clamp(w.wind / 30);
      const gustN = clamp(Math.max(w.gust, w.wind) / 40);
      const cold = clamp((30 - w.temp) / 24);
      const stiff = 1 - 0.45 * cold;
      const baseLean = (0.06 + 0.9 * Math.pow(windN, 1.15)) * stiff;
      const gustAmp = (0.12 + 0.75 * clamp((w.gust - w.wind * 0.4) / 30)) * stiff;
      const speed = (24 + Math.min(w.wind, 40) * 7) * (1 - 0.45 * cond.hot);
      phase += speed * dt;
      fineP += speed * 1.4 * dt;
      const wobAmp = (0.035 + 0.06 * windN) * stiff + 0.035 * cond.hot + 0.012 * cold;
      const wobRate = (1 - 0.5 * cond.hot) * (1 + 2.2 * cold);
      const ripAmp = 0.05 + 0.1 * windN;
      // the silver bands: wave trains travelling downwind, their crests bent
      // by slow noise and stronger in patches; sharper as the wind rises
      g0 = lerp(-0.45, -0.1, windN);
      g1 = lerp(0.55, 0.4, windN);
      gSharp = lerp(1.3, 2.3, windN);
      gDrift = t * 0.016;
      const toneAmp = (0.5 + 0.45 * gustN) * (1 - 0.3 * cloud);
      const sag = 0.3 * cond.wet + 0.06 * cond.dew + 0.26 * cond.snow;
      const bury = cond.snow * 0.5;
      const shorten = (1 - 0.34 * cond.snow) * (1 - 0.1 * cond.wet);
      const drift = t * 0.016;

      // raindrops knock blades down; they spring back
      if (raining > 0) {
        let hits = raining * 170 * dt;
        while (hits > 0) {
          if (hits >= 1 || RN() < hits) FNOD[(RN() * NF) | 0] = 0;
          hits -= 1;
        }
      }

      // ----- the field -----
      cnt.fill(0);
      for (let i = 0; i < NF; i++) {
        let g = FG[i];
        const gt = FT[i];
        if (g !== gt) {
          if (gt) { if (sinceChange > 1.4) g = Math.min(1, g + dt / 1.3); }
          else g = Math.max(0, g - dt / 0.9);
          FG[i] = g;
        }
        const nod = (FNOD[i] += dt);
        if (g < 0.03 || FHIDE[i] || FRND[i] < bury) { FB[i] = 255; continue; }
        const x = FX[i], y = FY[i];
        const gy = y / KY;
        const u = x * wdx + gy * wdy, v = gy * wdx - x * wdy;
        const gst = gustAt(u, v);
        const rip = noise.n2((u - fineP) / 96, v / 210 - drift);
        let th = baseLean * (0.65 + 0.35 * gst) + gustAmp * gst + rip * ripAmp + wobAmp * Math.sin(t * FFQ[i] * wobRate + FPH[i]);
        if (nod < 1.3) th += 0.6 * Math.exp(-3.4 * nod) * Math.cos(10 * nod);
        th *= FSTF[i];
        if (th > 1.42) th = 1.42; else if (th < -0.3) th = -0.3;
        const sn = Math.sin(th), cs = Math.cos(th);
        let len = FLEN[i] * shorten * (0.2 + 0.8 * g);
        if (len > FLIM[i]) len = FLIM[i];
        const tipx = x + len * (sn * wdx + FSPL[i] * cs);
        const tipy = y - len * cs * KZ + len * (sn * wdy * KY + sag);
        TX[i] = tipx; TY[i] = tipy;
        CX[i] = x + (tipx - x) * 0.18;
        CY[i] = y - len * KZ * 0.56 * (0.35 + 0.65 * cs) + len * sag * 0.2;
        FL[i] = g;
        let tone = (FTONE[i] + toneAmp * (gst - 0.28) + rip * 0.04) * NT;
        tone = tone < 0 ? 0 : tone >= NT ? NT - 1 : tone | 0;
        const bk = FFRONT[i] ? FRONT0 + tone : FBAND[i] * NT + tone;
        FB[i] = bk;
        cnt[bk]++;
      }
      let acc = 0;
      for (let k = 0; k < NBUCKET; k++) { start[k] = acc; acc += cnt[k]; cnt[k] = start[k]; }
      for (let i = 0; i < NF; i++) { const bk = FB[i]; if (bk !== 255) order[cnt[bk]++] = i; }

      const ctx = view.ctx;
      ctx.globalAlpha = 1;
      ctx.drawImage(groundC, 0, 0, W, H);
      for (let k = 0; k < FRONT0; k++) {
        const n0 = start[k], n1 = cnt[k];
        if (n1 === n0) continue;
        ctx.fillStyle = fieldCol[k];
        ctx.beginPath();
        for (let j = n0; j < n1; j++) {
          const i = order[j], x = FX[i], y = FY[i], hw = FHW[i] * (0.4 + 0.6 * FL[i]), cx = CX[i], cy = CY[i], tipx = TX[i], tipy = TY[i];
          ctx.moveTo(x - hw, y);
          ctx.quadraticCurveTo(cx - hw * 0.62, cy, tipx, tipy);
          ctx.quadraticCurveTo(cx + hw * 0.62, cy, x + hw, y);
        }
        ctx.fill();
      }

      // snow, frost or dust on the tips; beads of rain or dew along the blades
      ctx.lineCap = "round";
      const tipAmt = Math.max(cond.snow * 0.7, cond.frost * 0.35 * (1 - cond.snow), cond.hot * 0.5);
      if (tipAmt > 0.02) {
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = cond.snow > 0.2 ? 4.2 : 2.6;
        const k0 = cond.snow > 0.2 ? 0.25 : 0.12;
        ctx.beginPath();
        for (let i = 0; i < NF; i++) {
          if (FACC[i] > tipAmt || FB[i] >= FRONT0) continue;
          const tipx = TX[i], tipy = TY[i];
          ctx.moveTo(tipx + (CX[i] - tipx) * k0, tipy + (CY[i] - tipy) * k0);
          ctx.lineTo(tipx, tipy);
        }
        ctx.stroke();
      }
      const beadAmt = Math.max(cond.wet * 0.3, cond.dew * 0.3);
      if (beadAmt > 0.02) {
        ctx.fillStyle = pal.bead;
        ctx.beginPath();
        for (let i = 0; i < NF; i++) {
          if (1 - FACC[i] > beadAmt || FB[i] >= FRONT0) continue;
          const x0 = 0.15 * FX[i] + 0.45 * CX[i] + 0.4 * TX[i], y0 = 0.15 * FY[i] + 0.45 * CY[i] + 0.4 * TY[i];
          ctx.rect(x0 - 1.6, y0 - 1.6, 3.2, 3.2);
        }
        ctx.fill();
      }

      // ----- the time: stiff stalks that lean a third as far, and their flowers -----
      const lean3 = 0.34;
      const bgLum = pal.bgLum;
      const night = 1 - smoothstep(0.05, 0.2, d);
      const glints = night * season.winter * (1 - cond.wet) * 0.22; // frost glints on winter heads
      const flies = night * season.summer * smoothstep(58, 64, w.temp) * (1 - cond.wet) * (1 - smoothstep(10, 18, w.wind));
      ctx.strokeStyle = pal.stalk;
      ctx.lineCap = "butt"; // the heads hide the ends; round caps only cost
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (let i = 0; i < NP; i++) {
        let g = PG[i];
        const gt = PT[i];
        if (g !== gt) {
          if (gt) { if (sinceChange > 0.9 + 1.2 * PDL[i]) g = Math.min(1, g + dt / 1.2); }
          else if (sinceChange > 0.9 * PDL[i]) g = Math.max(0, g - dt / 1.0);
          PG[i] = g;
        }
        if (g < 0.02) { PBK[i] = 255; continue; }
        const e = 1 - (1 - g) * (1 - g);
        const sl = PSL[i];
        const rx = PX[i], ry = PY[i] + sl * KZ;
        const gy = ry / KY;
        const u = rx * wdx + gy * wdy, v = gy * wdx - rx * wdy;
        const gst = gustAt(u, v);
        let th = (baseLean * (0.7 + 0.3 * gst) + gustAmp * gst) * lean3 + wobAmp * 0.5 * Math.sin(t * PFQ[i] * wobRate + PPH[i]);
        let side = wdx, fall = wdy * KY;
        if (g < 1) { th += (1 - e) * 1.25; side = wdx * e + PSD[i] * (1 - e); fall = fall * e + 0.25 * (1 - e); }
        const sn = Math.sin(th), cs = Math.cos(th);
        const len = sl * (0.12 + 0.88 * e);
        const hx = rx + len * sn * side;
        const hy = ry - len * cs * KZ + len * sn * fall;
        ctx.moveTo(rx, ry);
        ctx.lineTo(hx, hy);
        PHX[i] = hx; PHY[i] = hy;
        const il = 1 / (Math.hypot(hx - rx, hy - ry) + 0.001);
        PUX[i] = (hx - rx) * il; PUY[i] = (hy - ry) * il;
        let bk;
        if (g < 0.45) bk = 255;
        else if (g < 0.8) bk = 6;
        else if (bgLum < PTH[i]) {
          bk = PVAR[i] === 1 ? 4 : 3;
          if (glints > 0.02 && PDL[i] < glints) {
            const pulse = Math.sin(t * PFQ[i] * 0.55 + PPH[i] * 3);
            if (pulse > 0.9) bk = 5;
          }
        } else bk = PVAR[i];
        PBK[i] = bk;
      }
      ctx.stroke();

      ctx.lineCap = "round";
      const hl = pal.hl * 0.5;
      for (let k = 0; k < 7; k++) {
        ctx.strokeStyle = pal.head[k];
        ctx.lineWidth = k === 6 ? pal.hw * 0.5 : k === 1 || k === 4 ? pal.hw * 0.86 : pal.hw;
        ctx.beginPath();
        for (let i = 0; i < NP; i++) {
          if (PBK[i] !== k) continue;
          const hx = PHX[i], hy = PHY[i], ux = PUX[i] * hl, uy = PUY[i] * hl;
          ctx.moveTo(hx - ux, hy - uy);
          ctx.lineTo(hx + ux + 0.01, hy + uy);
        }
        ctx.stroke();
      }
      ctx.fillStyle = pal.centre;
      ctx.beginPath();
      for (let i = 0; i < NP; i++) {
        if (PBK[i] > 5) continue;
        ctx.rect(PHX[i] - 2, PHY[i] - 2, 4, 4);
      }
      ctx.fill();

      // ----- fireflies drifting low over the meadow, each glowing now and then -----
      if (flies > 0.05) {
        const nf = Math.round(NFLY * flies);
        for (let i = 0; i < nf; i++) {
          const f2 = YF[i];
          const glow = smoothstep(0.55, 1, Math.sin(t * 0.7 * f2 + YP[i] * 5));
          if (glow < 0.02) continue;
          const x = YX[i] + 70 * Math.sin(t * 0.09 * f2 + YP[i]) + 25 * Math.sin(t * 0.31 * f2 + YP[i] * 2);
          const y = YY[i] + 45 * Math.sin(t * 0.07 * f2 + YP[i] * 3) + 18 * Math.sin(t * 0.27 * f2);
          const r = 30 * YR[i] * (0.75 + 0.25 * glow);
          ctx.globalAlpha = glow * 0.9;
          ctx.drawImage(flyC, x - r, y - r, 2 * r, 2 * r);
        }
        ctx.globalAlpha = 1;
      }

      // ----- broken cloud: shadows drifting downwind -----
      const so = d * smoothstep(0.15, 0.45, cloud) * (1 - smoothstep(0.72, 0.95, cloud));
      if (so > 0.02) {
        shadeP += (14 + w.wind * 3.2) * dt;
        ctx.globalAlpha = so;
        for (let i = 0; i < 3; i++) {
          const along = ((shadeP + i * 1260) % 3780) - 1890;
          const across = (i - 1) * 620 + 160 * Math.sin(i * 2.4 + 1);
          const cx = W / 2 + along * wdx - across * wdy, cy = H / 2 + along * wdy * 0.8 + across * wdx;
          if (cx < -750 || cx > W + 750 || cy < -575 || cy > H + 575) continue;
          ctx.drawImage(blobC, cx - 750, cy - 575, 1500, 1150);
        }
        ctx.globalAlpha = 1;
      }

      // ----- the markers, then the nearest grass in front of them -----
      for (let k = 0; k < allMarkers.length; k++) {
        const m = allMarkers[k];
        if (m.off) continue;
        const bx = Math.max(0, Math.floor(m.x - 24)), by = Math.max(0, Math.floor(m.y - 30));
        const bw = Math.min(W - bx, Math.ceil(m.w + 64)), bh = Math.min(H - by, Math.ceil(m.h + m.stake + 50));
        ctx.drawImage(markC, bx, by, bw, bh, bx, by, bw, bh);
      }
      for (let k = FRONT0; k < NBUCKET; k++) {
        const n0 = start[k], n1 = cnt[k];
        if (n1 === n0) continue;
        ctx.fillStyle = fieldCol[k];
        ctx.beginPath();
        for (let j = n0; j < n1; j++) {
          const i = order[j], x = FX[i], y = FY[i], hw = FHW[i] * (0.4 + 0.6 * FL[i]), cx = CX[i], cy = CY[i], tipx = TX[i], tipy = TY[i];
          ctx.moveTo(x - hw, y);
          ctx.quadraticCurveTo(cx - hw * 0.62, cy, tipx, tipy);
          ctx.quadraticCurveTo(cx + hw * 0.62, cy, x + hw, y);
        }
        ctx.fill();
      }

      // ----- rain or snow -----
      if (raining > 0.01) {
        const count = Math.min(NQ, Math.round(NQ * (0.16 + 0.84 * raining)));
        const heavy = falling === "drizzle" ? 0.55 : 1;
        const vy = (760 + 620 * raining) * heavy, vx = wdx * w.wind * 13 + 20;
        const sl = (0.036 + 0.03 * raining) * heavy;
        ctx.strokeStyle = pal.rain;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const z = QZ[i];
          let x = QX[i] + vx * z * dt, y = QY[i] + vy * z * dt;
          if (y > H + 80) { y -= H + 160; x = hash(i, s.frame) * (W + 240) - 120; }
          if (x > W + 120) x -= W + 240; else if (x < -120) x += W + 240;
          QX[i] = x; QY[i] = y;
          ctx.moveTo(x, y);
          ctx.lineTo(x - vx * z * sl, y - vy * z * sl);
        }
        ctx.stroke();
      } else if (snowing > 0.01) {
        const count = Math.min(NQ, Math.round(NQ * (0.3 + 0.7 * snowing)));
        const vx = wdx * w.wind * 7.5, vy = 70 + 60 * snowing + Math.max(0, wdy) * w.wind * 3;
        for (let pass = 0; pass < 2; pass++) {
          ctx.fillStyle = pass ? pal.flake2 : pal.flake;
          ctx.beginPath();
          for (let i = pass; i < count; i += 2) {
            const z = QZ[i];
            let x = QX[i] + (vx * z + 22 * Math.sin(t * 0.9 + QP[i])) * dt, y = QY[i] + vy * z * dt;
            if (y > H + 80) y -= H + 160;
            if (x > W + 120) x -= W + 240; else if (x < -120) x += W + 240;
            QX[i] = x; QY[i] = y;
            const rad = 1.2 + z * 2.6;
            ctx.moveTo(x + rad, y);
            ctx.arc(x, y, rad, 0, 6.2832);
          }
          ctx.fill();
        }
      }

      // ----- storm: now and then the whole field brightens, slowly -----
      if (falling === "storm") {
        const slotLen = 17;
        const k = Math.floor(t / slotLen);
        const at = (k + 0.25 + 0.5 * hash(k, seed)) * slotLen;
        const since = t - at;
        const fo = since > 0 ? 0.11 * smoothstep(0, 0.55, since) * Math.exp(-Math.max(0, since - 0.55) / 1.3) : 0;
        if (fo > 0.004) {
          ctx.globalAlpha = fo;
          ctx.fillStyle = "#cdd9ff";
          ctx.fillRect(0, 0, W, H);
          ctx.globalAlpha = 1;
        }
      }
    };

    return { frame };
  },
};

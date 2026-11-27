// Tall Grass
//
// A meadow seen from above and a little to one side. About two thousand blades
// bend in the real wind: gusts cross the field as travelling waves, at the true
// heading (north is up) and at a speed that follows the wind speed, and a bent
// blade shows its pale underside, so a gust reads as a silver band. The time is
// planted in the field as a taller, stiffer species in flower (hours above,
// minutes below): dark stalks carrying a flower colour that belongs to the
// season. When the minute changes the old plants wilt and the new ones grow.
//
// What drives it:
//   wind, gust, windDir   lean, wave size, wave speed and heading
//   day of year           the field's colour family and the flower species
//                         (spring lime + magenta, summer green + poppy red,
//                         autumn straw + aster violet, winter bleached + seed heads)
//   daylight, sky colour  light level and tint; at night the field is near
//                         black-green and the flowers turn luminous one by one
//   cloud                 flatter, greyer light; drifting cloud shadows when broken
//   rain                  streaks, blades nodding under drops, beads, darker wood
//   snow                  white ground, short blades buried, flakes, caps on the markers
//   fog, haze, AQI        far rows fade into the measured sky colour
//   frost, heat           frosted or dusty-gold tips; stiff in cold, slow in heat
//   storm                 violent wave trains and a rare, slow brightening
//
// The other readouts are typed on wooden plant markers staked along the bottom.

import { W, H, clamp, lerp, smoothstep, rng, hash, createNoise, mix, adjust, rgba, luminance, el, addStyle, canvas2d, mask, grain } from "../lib/kit.js";

const KZ = 0.88; // how much of a blade's height shows in this oblique view
const KY = 0.5; // how much the ground is foreshortened toward the top
const CELL = 4; // the planting mask is sampled on a 4 px grid
const MC = W / CELL;
const MR = H / CELL;
const NB = 6; // depth bands (for haze)
const NT = 5; // tones per band, dark to silver
const FRONT0 = NB * NT; // buckets for the blades drawn in front of the markers
const NBUCKET = FRONT0 + NT;

// One field family (dark to pale underside) and one flower per season, as they
// look in full sun. `night` is the flower once it has turned luminous.
const SEASONS = {
  winter: { tones: ["#93876a", "#b0a27e", "#c8ba96", "#ddd2b2", "#f1ead6"], ground: "#a39672", stalk: "#7d6045", head: "#22150d", head2: "#3a2617", night: "#93adc4", pale: "#dde9f3", centre: "#6b5037", hl: 11, hw: 9.5 },
  spring: { tones: ["#4c9c37", "#72bb3c", "#95d247", "#b8e35f", "#e3f5ba"], ground: "#62ab3a", stalk: "#15432b", head: "#b30d6e", head2: "#d2318a", night: "#ff5fae", pale: "#ffb7d8", centre: "#ffe7a0", hl: 7, hw: 13 },
  summer: { tones: ["#439534", "#64b035", "#88c83f", "#aedd57", "#ddf0b0"], ground: "#55a235", stalk: "#103821", head: "#a50f19", head2: "#c4221d", night: "#f0452e", pale: "#ffa089", centre: "#1a0c0c", hl: 2, hw: 14.5 },
  autumn: { tones: ["#a67a2e", "#c59a40", "#dab455", "#ebcf7c", "#f7e9bd"], ground: "#b58c38", stalk: "#4a3a22", head: "#4a27b4", head2: "#6843d8", night: "#9a7dff", pale: "#d0c1ff", centre: "#ffc93a", hl: 2, hw: 13.5 },
};
const ORDER = ["winter", "spring", "summer", "autumn", "winter"];
const CENTRES = [15, 105, 196, 288, 380]; // mid-January, mid-April, mid-July, mid-October

function seasonAt(doy) {
  let x = doy < CENTRES[0] ? doy + 365 : doy;
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

export default {
  title: "Tall Grass",
  description: "A meadow bends in the real wind, and the time is planted in it as a taller species in flower.",
  fonts: ["Nunito:wght@900", "Courier Prime:wght@400;700"],
  fps: 30,

  mount(root, { seed }) {
    addStyle(root, `
      .tg { position: absolute; inset: 0; overflow: hidden; font-family: "Courier Prime", "Courier New", monospace; color: var(--ink); --cap: 0; }
      .tg-shade { position: absolute; left: 0; top: 0; width: 1500px; height: 1150px; border-radius: 50%; will-change: transform;
        background: radial-gradient(closest-side, rgba(4,26,22,.5), rgba(4,26,22,.34) 55%, rgba(4,26,22,0) 100%); }
      .tg-m { position: absolute; left: 0; top: 0; transform-origin: 50% 100%; }
      .tg-shd { position: absolute; left: 0; top: 0; width: 100%; height: 100%; border-radius: 8px; background: var(--shadow); opacity: var(--shadowo); }
      .tg-stk { position: absolute; top: calc(100% - 6px); width: 18px; margin-left: -9px; height: 110px; background: var(--wood2);
        box-shadow: inset 5px 0 0 rgba(0,0,0,.16), inset -2px 0 0 rgba(255,255,255,.08); }
      .tg-plq { position: relative; box-sizing: border-box; border-radius: 6px; padding: 15px 24px 22px; white-space: nowrap; background-color: var(--wood);
        background-image: repeating-linear-gradient(179.2deg, rgba(60,25,0,0) 0 6px, rgba(60,25,0,.085) 6px 7.5px, rgba(60,25,0,0) 7.5px 17px, rgba(255,255,255,.07) 17px 18px, rgba(60,25,0,0) 18px 29px, rgba(60,25,0,.06) 29px 31px);
        box-shadow: inset 0 3px 0 var(--edge), inset 0 -6px 0 rgba(40,15,0,.2); }
      .tg-cap { position: absolute; left: -4px; right: -4px; top: -11px; height: 19px; background: var(--snowc); opacity: var(--cap);
        border-radius: 14px 18px 6px 7px / 13px 15px 5px 6px; box-shadow: inset 0 -4px 0 rgba(80,110,150,.22); }
      .tg-lab { font-size: 26px; line-height: 1.2; color: var(--ink2); }
      .tg-val { font-weight: 700; font-size: 40px; line-height: 1.12; }
      .tg-temp { font-weight: 700; font-size: 132px; line-height: .84; letter-spacing: -7px; margin: 10px 0 0 -6px; }
      .tg-cond { font-size: 46px; line-height: 1.08; white-space: normal; max-width: 400px; }
      .tg-d1 { font-weight: 700; font-size: 46px; line-height: 1.14; }
      .tg-d2 { font-size: 46px; line-height: 1.14; }
      .tg-fact .tg-plq { width: 952px; padding: 16px 28px 26px; }
      .tg-fv { font-size: 38px; line-height: 1.17; white-space: normal; margin-top: 4px; }
      .tg-ap .tg-plq { padding: 12px 15px 8px; }
      .tg-apv { font-weight: 700; font-size: 44px; line-height: 1; }
      .tg-flash { position: absolute; inset: 0; background: #cdd9ff; opacity: 0; pointer-events: none; }
    `);

    const wrap = el("div", { class: "tg" });
    root.append(wrap);

    // ---------------------------------------------------------------------
    // Layers, back to front: ground colour (the wrap's own background), a
    // still understory (dark marks, then light marks), the field and the time,
    // cloud shadows, the markers, the nearest grass and the weather, a glow.
    // ---------------------------------------------------------------------
    const texDark = canvas2d(wrap);
    const texLight = canvas2d(wrap);
    const back = canvas2d(wrap, { adaptive: true });
    const shades = [0, 1, 2].map(() => el("div", { class: "tg-shade" }));
    const shadeBox = el("div", { style: { position: "absolute", inset: "0", opacity: "0" } }, shades);
    const markers = el("div", { style: { position: "absolute", inset: "0" } });
    wrap.append(shadeBox, markers);
    const front = canvas2d(wrap, { adaptive: true });
    const flash = el("div", { class: "tg-flash" });
    wrap.append(flash);
    grain(wrap, { opacity: 0.05 });

    const R = rng(seed);
    const noise = createNoise(seed);

    // The still understory: thousands of short marks, painted once. It is
    // neutral (black marks, pale marks), so any ground colour can show through.
    const paintUnder = (ctx, count, dark) => {
      ctx.lineCap = "round";
      if (dark) {
        for (let i = 0; i < 46; i++) {
          const x = R.range(-100, W + 100), y = R.range(0, H), rad = R.range(120, 330);
          const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
          g.addColorStop(0, "rgba(0,0,0,0.13)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.fillRect(x - rad, y - rad * 0.6, rad * 2, rad * 1.2);
        }
      }
      for (let band = 0; band < 5; band++) {
        for (let a = 0; a < 4; a++) {
          const y0 = (band / 5) * (H + 40), y1 = ((band + 1) / 5) * (H + 40);
          const depth = (band + 0.5) / 5;
          ctx.lineWidth = lerp(2.2, 5.2, depth) * (dark ? 1.15 : 0.9);
          ctx.strokeStyle = dark ? `rgba(0,10,4,${0.12 + a * 0.07})` : `rgba(255,255,226,${0.1 + a * 0.07})`;
          ctx.beginPath();
          const n = Math.round((count / 20) * lerp(1.5, 0.6, depth));
          for (let i = 0; i < n; i++) {
            const x = R.range(-20, W + 20), y = R.range(y0, y1);
            const len = lerp(18, 52, depth) * R.range(0.6, 1.25);
            const lean = R.range(-0.5, 0.5);
            ctx.moveTo(x, y);
            ctx.quadraticCurveTo(x + lean * len * 0.25, y - len * 0.6, x + lean * len, y - len * 0.86);
          }
          ctx.stroke();
        }
      }
    };
    paintUnder(texDark.ctx, 9000, true);
    paintUnder(texLight.ctx, 6500, false);

    // ---------------------------------------------------------------------
    // The markers.
    // ---------------------------------------------------------------------
    const marker = (cls, kids, stakes = 1) => {
      const node = el("div", { class: `tg-m ${cls}` });
      const shd = el("div", { class: "tg-shd" });
      node.append(shd);
      if (stakes === 1) node.append(el("div", { class: "tg-stk", style: { left: "50%" } }));
      else node.append(el("div", { class: "tg-stk", style: { left: "14%" } }), el("div", { class: "tg-stk", style: { left: "86%" } }));
      const plq = el("div", { class: "tg-plq" }, el("div", { class: "tg-cap" }), kids);
      node.append(plq);
      markers.append(node);
      return { node, plq, shd, rot: R.range(0.7, 2.2) * R.sign(), x: 0, y: 0, w: 0, h: 0, stake: 0 };
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
    const mAqi = marker("tg-aqi", [lab("AQI"), n.aqiV]);
    const mUv = marker("tg-uv", [lab("UV"), n.uvV]);
    const mFact = marker("tg-fact", [n.factL, n.factV], 2);
    const mAp = marker("tg-ap", [n.ap]);
    mFact.rot = 0.3 * Math.sign(mFact.rot);
    mTemp.rot *= 0.55;
    mAp.rot = 2.2 * Math.sign(mAp.rot);
    const allMarkers = [mTemp, mDate, mSun, mMoon, mAqi, mUv, mFact, mAp];
    const stagger = [R.range(-15, 15), R.range(-15, 15), R.range(-15, 15), R.range(-15, 15)];

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
      m.shd.style.transformOrigin = `50% ${Math.round(m.h + stake)}px`;
      m.shd.style.transform = "skewX(-54deg) scaleY(0.4)";
    };

    // ---------------------------------------------------------------------
    // Where the time stands. The numerals are a mask of Nunito Black; flower
    // heads are planted wherever the mask is set.
    // ---------------------------------------------------------------------
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = '900 100px "Nunito"';
    let pair = 0;
    for (let dgt = 0; dgt < 10; dgt++) pair = Math.max(pair, probe.measureText(`${dgt}${dgt}`).width / 100);
    const capH = (probe.measureText("0").actualBoundingBoxAscent || 70.5) / 100;
    const FS = Math.min(600, 742 / pair);
    const digitH = capH * FS;
    const TIME_TOP = 132;
    const ROW_GAP = 78;
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
      PTH[i] = R.range(0.3, 0.47); // the daylight at which this head turns luminous
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
        f.tone.push(R.range(0.18, 0.6) + 0.14 * noise.n2(x / 380, yy / 240));
        f.ph.push(R.range(0, 6.283)); f.fq.push(R.range(0.9, 2.1));
        f.splay.push(R.range(-0.2, 0.2)); f.stiff.push(R.range(0.82, 1.16));
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
        for (const m of allMarkers) {
          if (m.off) continue;
          const base = m.y + m.h + m.stake;
          if (x > m.x - 4 && x < m.x + m.w + 4 && y > m.y - 4 && y <= base) behind = 1;
          if (x > m.x + 26 && x < m.x + m.w - 26 && y > m.y + FLEN[i] && y < m.y + m.h - 6) hide = 1;
          if (x > m.x - 34 && x < m.x + m.w + 34 && y > base && y < base + 170) {
            isFront = 1;
            lim = Math.min(lim, y - (m.y + m.h) + 20);
          }
        }
        FFRONT[i] = isFront && !behind ? 1 : 0;
        FHIDE[i] = hide;
        FLIM[i] = isFront && !behind ? Math.max(18, lim) : 1e3;
      }
    };

    const layout = () => {
      const hasFact = shown.fv !== "";
      mFact.off = !hasFact;
      mFact.node.style.display = hasFact ? "" : "none";
      for (const m of allMarkers) {
        m.w = m.plq.offsetWidth;
        m.h = m.plq.offsetHeight;
      }
      let y = 1852;
      if (hasFact) {
        place(mFact, 64, y - mFact.h, 90);
        y -= mFact.h + 66;
      } else y = 1796;
      const row = [mSun, mMoon, mAqi, mUv];
      let total = 0;
      for (const m of row) total += m.w;
      const gap = (952 - total) / 3;
      let x = 64, rowTop = 1e4;
      row.forEach((m, i) => {
        const top = y - m.h + stagger[i] - 10;
        place(m, x, top, y + 52 - (top + m.h));
        rowTop = Math.min(rowTop, top);
        x += m.w + gap;
      });
      y = rowTop - 58;
      place(mTemp, 64, y - mTemp.h, 54);
      place(mDate, 1016 - mDate.w, y - mDate.h - 26 + stagger[0], 66);
      place(mAp, 1016 - mAp.w, MINS_BASE - 58 - mAp.h, 50);
      classify();
    };

    // ---------------------------------------------------------------------
    // Colour. Everything is recomputed only when the light or weather moves.
    // ---------------------------------------------------------------------
    const fieldCol = new Array(NBUCKET).fill("#000");
    const pal = { head: new Array(7).fill("#000"), stalk: "#000", centre: "#000", accent: "#000", bead: "#000", rain: "#000", flake: "#000", flake2: "#000", hl: 4, hw: 13 };
    let season = null, seasonDay = -1;
    let sigA = -1, sigB = -1, sigSky = "";
    let texDarkOp = -1, texLightOp = -1, shadeOp = -1, flashOp = -1;

    const cond = { snow: 0, wet: 0, frost: 0, hot: 0, haze: 0, warm: 0, moon: 0, dew: 0, cloud: 0 };

    const recolour = (s) => {
      const d = s.daylight;
      const dk = Math.pow(d, 1.1);
      const { snow, wet, frost, hot, haze, warm, moon, cloud } = cond;
      const sky = s.sky.mean;
      const twilight = 4 * d * (1 - d);
      const dim = 1 - 0.13 * cloud - 0.07 * wet;
      const chroma = (1 - 0.22 * cloud) * (1 + 0.14 * wet);
      const hazeCol = mix(sky, "#f4f6f4", 0.3 * dk);
      const snowDay = mix("#f3f6f9", sky, 0.1);
      const lit = (day, night, skyTint) => mix(mix(night, day, dk), sky, skyTint);

      const midTone = adjust(season.tones[2], { l: (v) => v * dim, c: (v) => v * chroma });
      const base = [];
      for (let k = 0; k < NT; k++) {
        let day = adjust(season.tones[k], { l: (v) => v * dim, c: (v) => v * chroma });
        day = mix(day, midTone, 0.22 * cloud);
        if (warm > 0.01) day = mix(day, "#ffb347", warm * (0.1 + 0.07 * k));
        if (hot > 0.01) day = mix(day, "#d8bd6a", hot * 0.2);
        if (frost > 0.01) day = mix(day, "#e9f1f5", frost * 0.07 * k);
        if (snow > 0.01) day = mix(day, snowDay, snow * (0.22 + 0.1 * k));
        // night: near black-green, with a memory of the season's own colour
        let night = mix(mix("#0b1712", "#2f4d40", k / (NT - 1)), adjust(season.tones[k], { l: 0.17 + 0.055 * k, c: (v) => v * 0.4 }), 0.4);
        if (moon > 0.01) night = mix(night, "#48647a", moon * 0.09 * k);
        if (snow > 0.01) night = mix(night, mix("#162030", "#465a74", k / (NT - 1)), snow * 0.7);
        base.push(lit(day, night, 0.05 + 0.17 * twilight));
      }
      const hz = (b) => clamp(haze * Math.pow(1 - b / (NB - 1), 1.7) + haze * 0.05);
      for (let b = 0; b < NB; b++) for (let k = 0; k < NT; k++) fieldCol[b * NT + k] = mix(base[k], hazeCol, hz(b));
      for (let k = 0; k < NT; k++) fieldCol[FRONT0 + k] = mix(base[k], hazeCol, hz(NB - 1));

      // the ground behind the blades
      let gDay = adjust(season.ground, { l: (v) => v * dim * 0.97, c: (v) => v * chroma });
      if (warm > 0.01) gDay = mix(gDay, "#f0a03c", warm * 0.1);
      if (hot > 0.01) gDay = mix(gDay, "#cdb060", hot * 0.2);
      gDay = mix(gDay, snowDay, smoothstep(0, 0.8, snow));
      let gNight = mix(mix("#09140f", adjust(season.ground, { l: 0.16, c: (v) => v * 0.35 }), 0.4), "#141e2c", snow * 0.85);
      if (moon > 0.01) gNight = mix(gNight, "#1c2a36", moon * 0.35);
      const ground = lit(gDay, gNight, 0.06 + 0.18 * twilight);
      const g0 = mix(ground, hazeCol, hz(0)), g1 = mix(ground, hazeCol, hz(1.6)), g2 = mix(ground, hazeCol, hz(3.2));
      const g3 = adjust(ground, { l: (v) => v * 0.94 });
      wrap.style.background = `linear-gradient(to bottom, ${g0} 0%, ${g1} 28%, ${g2} 58%, ${g3} 100%)`;
      pal.groundLum = luminance(g2);

      const tdo = Math.round(lerp(0.55, 0.95, dk) * (1 - 0.82 * snow) * 50) / 50;
      const tlo = Math.round(lerp(0.1, 0.7, dk) * (1 - 0.7 * snow) * (1 - 0.3 * cloud) * 50) / 50;
      if (tdo !== texDarkOp) texDark.canvas.style.opacity = String((texDarkOp = tdo));
      if (tlo !== texLightOp) texLight.canvas.style.opacity = String((texLightOp = tlo));

      // the time's plants
      const headHaze = haze * 0.16;
      const dusk = 1 - dk;
      const dayHead = (c) => mix(mix(adjust(c, { l: (v) => v * (1 - 0.06 * cloud) }), "#060606", dusk * 0.45), hazeCol, headHaze);
      pal.head[0] = dayHead(season.head);
      pal.head[1] = dayHead(season.head2);
      pal.head[2] = dayHead(mix(season.head2, season.pale, 0.22));
      const headN = mix(adjust(season.night, { l: (v) => v * 0.94 }), season.pale, smoothstep(0.1, 0.45, d) * 0.8);
      pal.head[3] = headN;
      pal.head[4] = mix(headN, "#0a0612", 0.2);
      pal.head[5] = mix(mix(season.pale, "#f4ff8a", season.summer), "#ffffff", season.winter * 0.6);
      pal.stalk = mix(lit(season.stalk, mix("#07100c", season.night, 0.2), 0.03), hazeCol, headHaze);
      pal.head[6] = mix(pal.stalk, d < 0.38 ? headN : pal.head[0], 0.5);
      pal.centre = mix(mix(season.night, "#05060a", 0.62), mix(season.centre, "#060606", dusk * 0.3), smoothstep(0.3, 0.47, d));
      pal.hl = season.hl;
      pal.hw = season.hw;

      // tips: frost, dust, beads of rain or dew
      const frostCol = lit("#f4fafc", "#6f8798", 0);
      const dustCol = lit("#e9c96a", "#5a5234", 0.05);
      pal.accent = frost >= hot ? frostCol : dustCol;
      pal.bead = lit("#f4f8f6", mix("#6f8492", "#aebfcc", moon), 0.1);
      const pale = lit("#ffffff", "#9eb2c4", 0.1);
      pal.rain = pal.groundLum > 0.22 ? rgba(mix("#31505c", sky, 0.25), 0.42) : rgba(pale, 0.36);
      pal.flake = lit("#ffffff", "#8fa3ba", 0.05);
      pal.flake2 = lit("#b3c4d8", "#5d6f86", 0.05);

      // the markers: pale wood with burnt-in type by day, dark wood with pale
      // type by night; the ink changes sides while the wood is mid-grey
      const wk = smoothstep(0.3, 0.52, d);
      const woodDay = adjust(mix("#dfc097", "#9a7850", 0.4 * wet), { l: (v) => v * (1 - 0.06 * cloud) });
      const wood = mix(mix("#17110c", woodDay, wk), sky, 0.03);
      const flip = smoothstep(0.16, 0.2, luminance(wood));
      const inkDark = "#2a1a10";
      wrap.style.setProperty("--wood", wood);
      wrap.style.setProperty("--wood2", mix("#100b07", mix("#b3906a", "#7d603f", 0.4 * wet), wk));
      wrap.style.setProperty("--edge", rgba(mix("#3a2c20", "#fff3d6", wk), 0.7));
      wrap.style.setProperty("--ink", mix(mix("#bfb397", "#fff8e6", clamp(wk * 2.2)), inkDark, flip));
      wrap.style.setProperty("--ink2", mix(mix("#998e74", "#efe2c0", clamp(wk * 2.2)), mix("#5b4029", inkDark, 0.5 * wet), flip));
      wrap.style.setProperty("--snowc", lit("#fbfdff", "#8496ae", 0.04));
      wrap.style.setProperty("--cap", String(Math.round(smoothstep(0.15, 0.6, snow) * 20) / 20));
      wrap.style.setProperty("--shadow", mix("#04180e", "#2c4468", snow));
      wrap.style.setProperty("--shadowo", String(Math.round(dk * (1 - 0.7 * cloud) * 0.34 * 50) / 50));
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
      if (moved) layout();

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
        if (jumped) {
          for (let i = 0; i < NP; i++) PG[i] = PT[i];
          for (let i = 0; i < NF; i++) FG[i] = FT[i];
          changeT = -100;
        }
      } else if (jumped) {
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
      for (let i = s.pastHours.length - 1, k = 0; i >= 0 && k < 12; i--, k++) {
        const h = s.pastHours[i];
        if (h.kind === "snow" && h.temp < 34) snowPast += 0.25;
      }
      cond.snow = w.temp > 36 ? 0 : clamp(Math.max(snowing > 0 ? 0.62 + 0.38 * snowing : 0, Math.min(1, snowPast)));
      cond.wet = clamp(raining * 1.3);
      cond.frost = clamp((33 - w.temp) / 16) * (1 - cond.wet);
      cond.hot = clamp((w.temp - 84) / 12);
      cond.cloud = cloud;
      const fogness = w.fog ? 1 : clamp((5 - w.visibility) / 5);
      cond.haze = clamp(0.1 + 0.72 * fogness + clamp((w.aqi - 60) / 260) + 0.22 * cond.hot + 0.3 * snowing + 0.12 * raining);
      cond.warm = d * (1 - 0.75 * cloud) * (1 - smoothstep(3, 24, s.sun.alt));
      cond.moon = s.moon.up ? s.moon.illumination * clamp(s.moon.alt / 25) * (1 - 0.8 * cloud) * (1 - d) : 0;
      cond.dew = clamp((3.5 - (w.temp - w.dewPoint)) / 3) * (1 - smoothstep(8, 28, s.sun.alt)) * (w.temp > 33 ? 1 : 0);

      if (s.clock.doy !== seasonDay) {
        seasonDay = s.clock.doy;
        season = seasonAt(seasonDay);
        sigA = -1;
      }
      const a = Math.round(d * 250) + 251 * (Math.round(cloud * 40) + 41 * (Math.round(cond.wet * 30) + 31 * (Math.round(cond.snow * 40) + 41 * Math.round(cond.haze * 60))));
      const b = Math.round(cond.warm * 40) + 41 * (Math.round(cond.moon * 20) + 21 * (Math.round(cond.frost * 20) + 21 * Math.round(cond.hot * 20)));
      if (a !== sigA || b !== sigB || s.sky.mean !== sigSky) {
        sigA = a; sigB = b; sigSky = s.sky.mean;
        recolour(s);
      }

      // ----- the wind -----
      const toward = ((w.windDir + 180) * Math.PI) / 180;
      const wdx = Math.sin(toward), wdy = -Math.cos(toward); // north is up
      const windN = clamp(w.wind / 32);
      const cold = clamp((30 - w.temp) / 24);
      const stiff = 1 - 0.5 * cold;
      const baseLean = (0.05 + 0.95 * Math.pow(windN, 1.2)) * stiff;
      const gustAmp = (0.1 + 0.85 * clamp((w.gust - w.wind * 0.5) / 34)) * stiff;
      const speed = (22 + Math.min(w.wind, 36) * 6.6) * (1 - 0.4 * cond.hot);
      phase += speed * dt;
      fineP += speed * 1.5 * dt;
      const wobAmp = (0.035 + 0.06 * windN) * stiff + 0.03 * cond.hot;
      const wobRate = (1 - 0.45 * cond.hot) * (1 + 1.6 * cold);
      const ripAmp = 0.07 + 0.12 * windN;
      const toneAmp = 0.34 + 0.5 * clamp(w.gust / 32);
      const sag = 0.1 * cond.wet + 0.05 * cond.dew;
      const bury = cond.snow * 0.5;
      const shorten = 1 - 0.34 * cond.snow;
      const drift = t * 0.016;

      // raindrops knock blades down; they spring back
      if (raining > 0) {
        let hits = raining * 150 * dt;
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
        const band = noise.n2((u - phase) / 330, v / 880 + drift);
        const rip = noise.n2((u - fineP) / 96, v / 210 - drift);
        const gst = smoothstep(-0.3, 0.7, band);
        let th = baseLean * (0.75 + 0.25 * gst) + gustAmp * gst + rip * ripAmp + wobAmp * Math.sin(t * FFQ[i] * wobRate + FPH[i]);
        if (nod < 1.3) th += 0.55 * Math.exp(-3.4 * nod) * Math.cos(10 * nod);
        th *= FSTF[i];
        if (th > 1.42) th = 1.42; else if (th < -0.3) th = -0.3;
        const sn = Math.sin(th), cs = Math.cos(th);
        let len = FLEN[i] * shorten * (0.2 + 0.8 * g);
        if (len > FLIM[i]) len = FLIM[i];
        const tipx = x + len * (sn * wdx + FSPL[i] * cs);
        const tipy = y - len * cs * KZ + len * sn * (wdy * KY + sag);
        TX[i] = tipx; TY[i] = tipy;
        CX[i] = x + (tipx - x) * 0.18;
        CY[i] = y - len * KZ * 0.56 * (0.35 + 0.65 * cs);
        FL[i] = g;
        let tone = (FTONE[i] + toneAmp * (gst - 0.42) + rip * 0.07) * NT;
        tone = tone < 0 ? 0 : tone >= NT ? NT - 1 : tone | 0;
        const bk = FFRONT[i] ? FRONT0 + tone : FBAND[i] * NT + tone;
        FB[i] = bk;
        cnt[bk]++;
      }
      let acc = 0;
      for (let k = 0; k < NBUCKET; k++) { start[k] = acc; acc += cnt[k]; cnt[k] = start[k]; }
      for (let i = 0; i < NF; i++) { const bk = FB[i]; if (bk !== 255) order[cnt[bk]++] = i; }

      const ctx = back.ctx;
      back.clear();
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

      // frost or dust on the tips, beads of rain or dew along the blades
      ctx.lineCap = "round";
      const tipAmt = Math.max(cond.frost * 0.6 * (1 - cond.snow), cond.hot * 0.5);
      if (tipAmt > 0.02) {
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        for (let i = 0; i < NF; i++) {
          if (FACC[i] > tipAmt || FB[i] >= FRONT0) continue;
          const tipx = TX[i], tipy = TY[i];
          ctx.moveTo(0.09 * FX[i] + 0.42 * CX[i] + 0.49 * tipx, 0.09 * FY[i] + 0.42 * CY[i] + 0.49 * tipy);
          ctx.lineTo(tipx, tipy);
        }
        ctx.stroke();
      }
      const beadAmt = Math.max(cond.wet * 0.45, cond.dew * 0.4);
      if (beadAmt > 0.02) {
        ctx.strokeStyle = pal.bead;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        for (let i = 0; i < NF; i++) {
          if (1 - FACC[i] > beadAmt || FB[i] >= FRONT0) continue;
          const x0 = 0.2 * FX[i] + 0.5 * CX[i] + 0.3 * TX[i], y0 = 0.2 * FY[i] + 0.5 * CY[i] + 0.3 * TY[i];
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + (TX[i] - FX[i]) * 0.05, y0 + (TY[i] - FY[i]) * 0.05);
        }
        ctx.stroke();
      }

      // ----- the time: stiff stalks that lean a third as far, and their flowers -----
      const lean3 = 0.34;
      const glowOn = (1 - smoothstep(0.05, 0.2, d)) * Math.max(season.summer * (w.temp > 58 ? 1 : 0) * (1 - cond.wet), season.winter * 0.8);
      ctx.strokeStyle = pal.stalk;
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
        const gst = smoothstep(-0.3, 0.7, noise.n2((u - phase) / 330, v / 880 + drift));
        let th = (baseLean * (0.75 + 0.25 * gst) + gustAmp * gst) * lean3 + wobAmp * 0.5 * Math.sin(t * PFQ[i] * wobRate + PPH[i]);
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
        else if (d < PTH[i]) {
          bk = PVAR[i] === 1 ? 4 : 3;
          if (glowOn > 0.05 && PDL[i] < 0.5 * glowOn) {
            const pulse = Math.sin(t * PFQ[i] * 0.55 + PPH[i] * 3);
            if (pulse > 0.9) bk = 5;
          }
        } else bk = PVAR[i];
        PBK[i] = bk;
      }
      ctx.stroke();

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
        const bk = PBK[i];
        if (bk > 5) continue;
        ctx.rect(PHX[i] - 2, PHY[i] - 2, 4, 4);
      }
      ctx.fill();

      // ----- in front of the markers: the nearest grass, then rain or snow -----
      const fc = front.ctx;
      front.clear();
      for (let k = FRONT0; k < NBUCKET; k++) {
        const n0 = start[k], n1 = cnt[k];
        if (n1 === n0) continue;
        fc.fillStyle = fieldCol[k];
        fc.beginPath();
        for (let j = n0; j < n1; j++) {
          const i = order[j], x = FX[i], y = FY[i], hw = FHW[i] * (0.4 + 0.6 * FL[i]), cx = CX[i], cy = CY[i], tipx = TX[i], tipy = TY[i];
          fc.moveTo(x - hw, y);
          fc.quadraticCurveTo(cx - hw * 0.62, cy, tipx, tipy);
          fc.quadraticCurveTo(cx + hw * 0.62, cy, x + hw, y);
        }
        fc.fill();
      }
      if (raining > 0.01) {
        const count = Math.min(NQ, Math.round(NQ * (0.16 + 0.84 * raining)));
        const heavy = falling === "drizzle" ? 0.55 : 1;
        const vy = (760 + 620 * raining) * heavy, vx = wdx * w.wind * 13 + 20;
        const sl = (0.036 + 0.03 * raining) * heavy;
        fc.strokeStyle = pal.rain;
        fc.lineWidth = 2.2;
        fc.lineCap = "round";
        fc.beginPath();
        for (let i = 0; i < count; i++) {
          const z = QZ[i];
          let x = QX[i] + vx * z * dt, y = QY[i] + vy * z * dt;
          if (y > H + 80) { y -= H + 160; x = hash(i, s.frame) * (W + 240) - 120; }
          if (x > W + 120) x -= W + 240; else if (x < -120) x += W + 240;
          QX[i] = x; QY[i] = y;
          fc.moveTo(x, y);
          fc.lineTo(x - vx * z * sl, y - vy * z * sl);
        }
        fc.stroke();
      } else if (snowing > 0.01) {
        const count = Math.min(NQ, Math.round(NQ * (0.3 + 0.7 * snowing)));
        const vx = wdx * w.wind * 7.5, vy = 70 + 60 * snowing + Math.max(0, wdy) * w.wind * 3;
        for (let pass = 0; pass < 2; pass++) {
          fc.fillStyle = pass ? pal.flake2 : pal.flake;
          fc.beginPath();
          for (let i = pass; i < count; i += 2) {
            const z = QZ[i];
            let x = QX[i] + (vx * z + 22 * Math.sin(t * 0.9 + QP[i])) * dt, y = QY[i] + vy * z * dt;
            if (y > H + 80) y -= H + 160;
            if (x > W + 120) x -= W + 240; else if (x < -120) x += W + 240;
            QX[i] = x; QY[i] = y;
            const rad = 1.2 + z * 2.6;
            fc.moveTo(x + rad, y);
            fc.arc(x, y, rad, 0, 6.2832);
          }
          fc.fill();
        }
      }

      // ----- broken cloud: shadows drifting downwind -----
      const so = Math.round(d * smoothstep(0.15, 0.45, cloud) * (1 - smoothstep(0.72, 0.95, cloud)) * 25) / 25;
      if (so !== shadeOp) shadeBox.style.opacity = String((shadeOp = so));
      if (so > 0) {
        shadeP += (14 + w.wind * 3.2) * dt;
        for (let i = 0; i < 3; i++) {
          const along = ((shadeP + i * 1260) % 3780) - 1890;
          const across = (i - 1) * 620 + 160 * Math.sin(i * 2.4 + 1);
          shades[i].style.transform = `translate(${(W / 2 - 750 + along * wdx - across * wdy).toFixed(1)}px, ${(H / 2 - 575 + along * wdy * 0.8 + across * wdx).toFixed(1)}px)`;
        }
      }

      // ----- storm: now and then the whole field brightens, slowly -----
      let fo = 0;
      if (falling === "storm") {
        const slotLen = 17;
        const k = Math.floor(t / slotLen);
        const at = (k + 0.25 + 0.5 * hash(k, seed)) * slotLen;
        const since = t - at;
        if (since > 0) fo = 0.11 * smoothstep(0, 0.55, since) * Math.exp(-Math.max(0, since - 0.55) / 1.3);
        fo = Math.round(fo * 200) / 200;
      }
      if (fo !== flashOp) flash.style.opacity = String((flashOp = fo));
    };

    return { frame };
  },
};

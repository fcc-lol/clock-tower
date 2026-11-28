// Murmuration
//
// A flock of starlings over the East River, in the measured colour of the sky.
// The densest part of the flock is the time: about 2,100 birds (and 1,800 far
// specks) circulate inside the strokes of giant numerals (hour over minutes),
// over a soft dark (or, at night, pale) silhouette of the figures that keeps
// them legible however the wind frays them, and about 600 more (with 600
// specks) fly as a free ribbon that folds and twists around them, drawn a
// shade lighter (the farther flock) so the figures read through it. The other readouts
// are captions sitting on three sagging wires at the bottom (the air now; the
// calendar; the fact and the sun), with birds perched in the gaps between words.
//
// Built to be cheap: birds are small filled chevrons batched by size and ink;
// sky, numeral silhouettes and grain share one canvas repainted only when they
// change; each wire is its own little SVG so its sway is a transform; digit
// fields are built only for the digits on show, and the cloud texture a few
// rows per frame after mount.
//
// How the conditions drive it:
//   sky      the whole backdrop is the four measured sky colours, west at the
//            left to east at the right; cloud cover is the opacity of the
//            drifting cloud bands. Where a heavy sky (or its veil over the
//            silhouettes) would leave a numeral short of contrast, the
//            silhouette is lifted clear of the veil and, if that is not
//            enough, a soft patch of thinner cloud (behind dark birds) or
//            denser cloud (behind pale ones) gathers behind it
//   wind     a literal force on every bird: the numerals lean downwind, the
//            looser birds trail off them as streamers, and gusts (travelling
//            across the frame in the wind's direction) peel sheets of birds off
//            that curl back. Perched birds face into it; the wires sway.
//   light    wheeling by day, busiest around sunset, and at night the ribbon
//            comes down to roost on the wires and in the numerals, which go
//            nearly still. Bird and type inks flip from dark to pale as the
//            sky behind them darkens.
//   temp     cold packs the flock tight and crisp; heat loosens it and sends
//            the ribbon high and slow
//   rain     and snow fall through the flock, slanted by the wind; rain sends
//            many of the free birds down to the wires and the rest fly low
//   fog      the far birds of the ribbon fade out
//   storm    a rare soft glow in the cloud startles part of the flock into
//            the air; it settles again over a few seconds
import {
  W, H, TAU, clamp, lerp, smoothstep, rng, hash, createNoise,
  mix, rgba, toOklab, el, svg, addStyle, canvas2d, mask, luminance,
} from "../lib/kit.js";

const DISPLAY = '"Big Shoulders Display", "Anton", "Arial Narrow", sans-serif';
const SANS = '"Instrument Sans", "Helvetica Neue", Arial, sans-serif';
const SERIF = '"Newsreader", Georgia, serif';

const NG = 2100; // birds that live in the numerals
const NF = 600; // free birds: the ribbon, the wires, and at night the numerals too
const N = NG + NF;
const NDG = 1800; // far birds, drawn as specks: these stay in the numerals
const NDF = 600; // far birds that fly with the ribbon by day and come down at night
const ND = NDG + NDF;

const FONT_PX = 670; // the numerals' size
const CELL = 6; // glyph field resolution, stage px
const PAD = 42; // empty margin around a glyph in its field
const LEFT = 104; // left edge of both lines of numerals
const TRACK = 12;
const HOUR_BASE = 610; // the time sits as high as its top margin allows, to give the captions room
const MIN_BASE = 1210;
const MAX_SHEAR = 0.2;

const MARGIN = 64;
const WX0 = -40; // wires run past both edges
const WSPAN = 1160;
const WIRES = [
  // parallel, and far enough apart that each line of captions stands on its
  // own: about 70 px of clear air from the lowest ink on one wire to the
  // highest on the next (the first wire's descenders need it above the date);
  // top/bot: the band each wire and its captions live in
  { y0: 1413, yc: 1463, y1: 1423, top: 1253, bot: 1457 },
  { y0: 1549, yc: 1599, y1: 1559, top: 1481, bot: 1591 },
  { y0: 1671, yc: 1711, y1: 1681, top: 1603, bot: 1713 },
];
// the fact hangs below the last wire: its highest ink here, clear of the sun's
// countdown above it; at most two lines, its lowest ink inside the margin
const FACT_INK = WIRES[2].y0 + 61;
const FACT_SIZES = [[52, 1], [47, 1], [42, 2]]; // font size, lines
const wireY = (w, x) => {
  const k = (x - WX0) / WSPAN;
  const q = WIRES[w];
  return (1 - k) * (1 - k) * q.y0 + 2 * k * (1 - k) * q.yc + k * k * q.y1;
};

// A sine table: the flock asks for tens of thousands of sines a frame.
const SN = 8192;
const SINE = new Float32Array(SN);
for (let i = 0; i < SN; i++) SINE[i] = Math.sin((i / SN) * TAU);
const SK = SN / TAU;
const fsin = (a) => SINE[(a * SK) & (SN - 1)];
const fcos = (a) => SINE[(a * SK + SN / 4) & (SN - 1)];

const SC = 32; // sky grid
const SR = 56;

export default {
  title: "Murmuration",
  description: "Three thousand starlings wheel in the real colour of the sky, and the densest part of the flock is the time; the real wind tears at it.",
  fps: 20, // the flock reads as smooth at this rate, and it divides the panel's 60 Hz evenly (24 would land on 20 anyway, unevenly)
  fonts: ["Big Shoulders Display:wght@900", "Instrument Sans:wdth,wght@75..100,400..700", "Newsreader:ital,opsz,wght@1,6..72,500"],

  mount(root, { state, seed }) {
    addStyle(root, `
      .mu { position: absolute; inset: 0; overflow: hidden; background: #05070f; }
            .mu .cloud { position: absolute; left: 0; top: 0; width: ${Math.ceil(3240 / 24) * 24}px; height: ${Math.ceil(1440 / 24) * 24}px; will-change: transform; }
      .mu .glow { position: absolute; left: 0; top: 0; width: 1500px; height: 1300px; opacity: 0; will-change: opacity;
        background: radial-gradient(closest-side, rgba(226,224,255,0.9), rgba(200,205,255,0.35) 45%, rgba(190,200,255,0) 100%); }
      .mu .band { position: absolute; left: 0; overflow: visible; z-index: 6; will-change: transform; }
      .mu .band text { font-family: ${SANS}; fill: currentColor; font-kerning: normal; paint-order: stroke fill; stroke-width: 8px; stroke-linejoin: round; }
      .mu .wire { fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; opacity: 0.7; }
      .mu .rime { fill: none; stroke: #f4f6f8; stroke-width: 3; stroke-linecap: round; }
      .mu .band .temp { font-size: 140px; font-weight: 700; letter-spacing: -0.005em; }
      .mu .cond { font-size: 50px; font-weight: 500; }
      .mu .date { font-size: 48px; font-weight: 600; }
      .mu .val { font-size: 46px; font-weight: 600; }
      .mu .lab { font-size: 28px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; }
      .mu .soft { font-size: 34px; font-weight: 400; }
      .mu .ampmBox { position: absolute; overflow: visible; z-index: 6; will-change: transform; }
      .mu .ampm { font-family: ${DISPLAY}; font-size: 108px; font-weight: 900; fill: currentColor; letter-spacing: 0.01em; paint-order: stroke fill; stroke-width: 12px; stroke-linejoin: round; }
      .mu .fact { position: absolute; left: ${MARGIN}px; top: ${FACT_INK - 20}px; width: ${W - 2 * MARGIN}px; z-index: 6; will-change: transform;
        font-family: ${SERIF}; font-style: italic; font-weight: 500; font-size: 52px; line-height: 92px; max-height: 92px; overflow: hidden;
        font-optical-sizing: auto; text-wrap: balance; letter-spacing: 0.002em; }
    `);
    const wrap = el("div", { class: "mu" });
    root.append(wrap);

    const R = rng(seed);
    const noise = createNoise(seed + 11);

    // ---------------------------------------------------------------- sky
    // The ground layer: the sky (a 32 x 56 grid of colour, stretched smooth),
    // the soft silhouettes of the numerals, and a fine grain against banding,
    // all in one canvas that is repainted only when one of them changes.
    const ground = canvas2d(wrap, { alpha: false });
    const skyTiny = document.createElement("canvas");
    skyTiny.width = SC;
    skyTiny.height = SR;
    let groundDirty = true;
    const grainTile = document.createElement("canvas");
    grainTile.width = grainTile.height = 128;
    {
      const gctx = grainTile.getContext("2d");
      const img = gctx.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = R();
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v > 0.5 ? 255 : 0;
        img.data[i + 3] = Math.abs(v - 0.5) * 510;
      }
      gctx.putImageData(img, 0, 0);
    }
    const grainFill = ground.ctx.createPattern(grainTile, "repeat");
    const skyTinyCtx = skyTiny.getContext("2d");
    const skyImg = skyTinyCtx.createImageData(SC, SR);
    const skyLum = new Float32Array(SC * SR);
    const lab4 = [new Float32Array(3), new Float32Array(3), new Float32Array(3), new Float32Array(3)];
    const labMean = new Float32Array(3);
    const srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

    function paintSky(s) {
      const sk = s.sky;
      const dirs = [sk.west, sk.northWest, sk.northEast, sk.east];
      for (let d = 0; d < 4; d++) {
        const l = toOklab(dirs[d]);
        lab4[d][0] = l[0]; lab4[d][1] = l[1]; lab4[d][2] = l[2];
      }
      for (let c = 0; c < 3; c++) labMean[c] = (lab4[0][c] + lab4[1][c] + lab4[2][c] + lab4[3][c]) / 4;
      const day = s.daylight;
      const night = 1 - day;
      const clearness = 1 - clamp(s.weather.cloud / 100);
      const mist = smoothstep(3.5, 0.3, s.weather.visibility); // fog, or driving snow
      const murk = smoothstep(9, 4, s.weather.visibility) * (1 - mist) * day; // summer haze
      const dim = smoothstep(0.02, 0.14, day) * (1 - smoothstep(0.4, 0.85, day)); // twilight: the low air darkens first
      // late twilight: a sky still bright from the camera is brought down, so
      // the room is dark once the day has gone (and the ground spends as little
      // of dusk in mid-grey as it can); an already dark sky is left alone
      const nightDim = 0.5 * smoothstep(0.3, 0.08, day);
      const px = skyImg.data;
      for (let j = 0; j < SR; j++) {
        const v = j / (SR - 1);
        const top = 1 - v;
        const dusk = 1 - 0.22 * dim * smoothstep(0.55, 0.9, v);
        const unify = 0.8 * smoothstep(0.45, 0.9, v); // the horizon gathers the four directions into one tone
        const deep = 1 - (0.08 * day * clearness + 0.04 * day + 0.3 * night) * Math.pow(top, 1.5);
        const haze = 0.15 * day * smoothstep(0.5, 1, v); // the sky pales toward the horizon (and lifts the captions off it)
        const glow = night * smoothstep(0.62, 1, v);
        for (let i = 0; i < SC; i++) {
          const f = clamp((i / (SC - 1) - 0.05) / 0.9) * 3;
          const a = Math.min(2, Math.floor(f));
          let k = f - a;
          k = k * k * (3 - 2 * k);
          const A = lab4[a];
          const B = lab4[a + 1];
          let L = A[0] + (B[0] - A[0]) * k;
          let ca = A[1] + (B[1] - A[1]) * k;
          let cb = A[2] + (B[2] - A[2]) * k;
          L += (labMean[0] - L) * unify;
          ca += (labMean[1] - ca) * unify;
          cb += (labMean[2] - cb) * unify;
          L = L * deep * dusk + haze * (1 - L);
          const sat = 1 + 0.2 * day * clearness * top - 0.25 * haze * 4;
          ca *= sat;
          cb *= sat;
          // mist lies in the lower air and takes the colour out of it; haze warms and whitens it
          const veil = mist * smoothstep(0.1, 0.85, v);
          L += veil * (0.05 + 0.07 * day) * (1 - L);
          ca *= 1 - 0.5 * veil;
          cb *= 1 - 0.5 * veil;
          const hz = murk * smoothstep(0.15, 0.95, v) * 0.55;
          L += hz * (0.86 - L);
          ca += hz * (0.004 - ca);
          cb += hz * (0.03 - cb);
          // the city under a night sky: a low warm lift along the bottom
          L *= 1 - nightDim * smoothstep(0.2, 0.45, L);
          L += 0.035 * glow;
          ca += 0.008 * glow;
          cb += 0.014 * glow;
          const l_ = L + 0.3963377774 * ca + 0.2158037573 * cb;
          const m_ = L - 0.1055613458 * ca - 0.0638541728 * cb;
          const s_ = L - 0.0894841775 * ca - 1.291485548 * cb;
          const l3 = l_ * l_ * l_;
          const m3 = m_ * m_ * m_;
          const s3 = s_ * s_ * s_;
          const r = clamp(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3);
          const g = clamp(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3);
          const b = clamp(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3);
          const o = (j * SC + i) * 4;
          px[o] = Math.round(srgb(r) * 255);
          px[o + 1] = Math.round(srgb(g) * 255);
          px[o + 2] = Math.round(srgb(b) * 255);
          px[o + 3] = 255;
          skyLum[j * SC + i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
      }
      skyTinyCtx.putImageData(skyImg, 0, 0);
      groundDirty = true;
    }
    const lumAt = (x, y) => {
      const i = clamp(Math.floor((x / W) * SC), 0, SC - 1);
      const j = clamp(Math.floor((y / H) * SR), 0, SR - 1);
      return skyLum[j * SC + i];
    };
    const lumRegion = (x0, x1, y0, y1) => {
      let sum = 0;
      let n = 0;
      for (let y = y0; y <= y1; y += 30) for (let x = x0; x <= x1; x += 30) { sum += lumAt(x, y); n++; }
      return sum / n;
    };
    const skyHexAt = (x, y) => {
      const i = clamp(Math.floor((x / W) * SC), 0, SC - 1);
      const j = clamp(Math.floor((y / H) * SR), 0, SR - 1);
      const o = (j * SC + i) * 4;
      const h = (v) => v.toString(16).padStart(2, "0");
      return `#${h(skyImg.data[o])}${h(skyImg.data[o + 1])}${h(skyImg.data[o + 2])}`;
    };

    // ------------------------------------------------------------- clouds
    // One soft band texture, built once, twice as wide as its period so it can
    // drift for ever; its tint and opacity follow the cloud cover and the light.
    const CS = 24; // stage px per texel: the bands are soft, so this can be coarse
    const CW = Math.ceil(3240 / CS);
    const CH = Math.ceil(1440 / CS);
    // Its noise is computed a few rows per frame after mount (the piece gets
    // many unseen frames before it is cut to), which keeps mount quick.
    const cloudMask = document.createElement("canvas");
    cloudMask.width = CW;
    cloudMask.height = CH;
    const cloudMaskCtx = cloudMask.getContext("2d");
    const cloudImg = cloudMaskCtx.createImageData(CW, CH);
    let cloudRow = 0;
    const cloudRowCover = new Float32Array(CH);
    const cloudRowMin = new Float32Array(CH);
    const cloudRowMax = new Float32Array(CH);
    function buildCloudRows(rows) {
      const data = cloudImg.data;
      const end = Math.min(CH, cloudRow + rows);
      for (let j = cloudRow; j < end; j++) {
        const y = j * CS;
        const env = smoothstep(1440, 1000, y) * (0.75 + 0.25 * smoothstep(0, 200, y));
        for (let i = 0; i < CW; i++) {
          const a = ((i * CS) / 2160) * TAU;
          const n = 0.7 * noise.fbm3(Math.cos(a) * 0.6, Math.sin(a) * 0.6, y * 0.0052, 3) + 0.5 * noise.n3(Math.cos(a) * 0.3 + 5, Math.sin(a) * 0.3, y * 0.0026);
          const o = (j * CW + i) * 4;
          data[o] = data[o + 1] = data[o + 2] = 255;
          const k = smoothstep(-0.45, 0.6, n);
          data[o + 3] = 255 * k * k * env;
        }
      }
      cloudRow = end;
      if (cloudRow >= CH) {
        cloudMaskCtx.putImageData(cloudImg, 0, 0);
        cloudKey = "";
        // the bands' mean cover along each row (they drift sideways and wrap, so
        // this is what a numeral has behind it on average)
        // (and its densest and thinnest, for the worst a numeral can meet)
        for (let j = 0; j < CH; j++) {
          let sum = 0;
          let lo = 255;
          let hi = 0;
          for (let i = 0; i < CW; i++) {
            const v = data[(j * CW + i) * 4 + 3];
            sum += v;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
          cloudRowCover[j] = sum / (255 * CW);
          cloudRowMin[j] = lo / 255;
          cloudRowMax[j] = hi / 255;
        }
        skyKey = "";
      }
    }

    const cloud = el("canvas", { class: "cloud", width: CW, height: CH });
    wrap.append(cloud);
    const cloudCtx = cloud.getContext("2d");
    let cloudX = R.range(0, 2160);
    const glow = el("div", { class: "glow" });
    wrap.append(glow);

    // --------------------------------------------- the numerals as a field
    // For each digit: a distance-to-edge field inside the strokes. Birds'
    // home points ride its contour lines, so they stream round and round the
    // strokes without ever bunching up or leaving the letterform.
    const probe = document.createElement("canvas").getContext("2d");
    const FONT = `900 ${FONT_PX}px ${DISPLAY}`;
    probe.font = FONT;
    const capH = Math.round(probe.measureText("H").actualBoundingBoxAscent) || Math.round(FONT_PX * 0.8);
    const adv = [];
    let maxAdv = 0;
    for (let d = 0; d < 10; d++) {
      adv[d] = probe.measureText(String(d)).width;
      maxAdv = Math.max(maxAdv, adv[d]);
    }
    const GC = Math.ceil((maxAdv + 2 * PAD) / CELL);
    const GR = Math.ceil((capH + 2 * PAD) / CELL);
    const GWpx = GC * CELL;
    const GHpx = GR * CELL;
    const fields = [];
    const ghostSprites = [];
    const patchSprites = [];
    const PM = 32; // a patch's margin round its glyph field, in field cells
    // Built on demand (only the digits on show), so mount stays quick.
    function buildField(d) {
      const m = mask(GC, GR, (c) => {
        c.scale(1 / CELL, 1 / CELL);
        c.font = FONT;
        c.textBaseline = "alphabetic";
        c.fillText(String(d), PAD, PAD + capH);
      });
      const n = GC * GR;
      const dist = new Float32Array(n);
      let area = 0;
      for (let i = 0; i < n; i++) {
        const inside = m.data[i] > 127;
        dist[i] = inside ? 1e5 : 0;
        if (inside) area++;
      }
      const D1 = 1;
      const D2 = Math.SQRT2;
      for (let y = 1; y < GR - 1; y++) for (let x = 1; x < GC - 1; x++) {
        const i = y * GC + x;
        if (dist[i] === 0) continue;
        dist[i] = Math.min(dist[i], dist[i - 1] + D1, dist[i - GC] + D1, dist[i - GC - 1] + D2, dist[i - GC + 1] + D2);
      }
      for (let y = GR - 2; y > 0; y--) for (let x = GC - 2; x > 0; x--) {
        const i = y * GC + x;
        if (dist[i] === 0) continue;
        dist[i] = Math.min(dist[i], dist[i + 1] + D1, dist[i + GC] + D1, dist[i + GC + 1] + D2, dist[i + GC - 1] + D2);
      }
      // to stage px, soften twice
      let psi = new Float32Array(n);
      for (let i = 0; i < n; i++) psi[i] = Math.max(0, dist[i] - 0.5 + m.data[i] / 255 - 0.5) * CELL;
      for (let pass = 0; pass < 2; pass++) {
        const out = new Float32Array(n);
        for (let y = 1; y < GR - 1; y++) for (let x = 1; x < GC - 1; x++) {
          const i = y * GC + x;
          out[i] = (psi[i - GC - 1] + psi[i - GC] + psi[i - GC + 1] + psi[i - 1] + psi[i] + psi[i + 1] + psi[i + GC - 1] + psi[i + GC] + psi[i + GC + 1]) / 9;
        }
        psi = out;
      }
      const gx = new Float32Array(n);
      const gy = new Float32Array(n);
      for (let y = 1; y < GR - 1; y++) for (let x = 1; x < GC - 1; x++) {
        const i = y * GC + x;
        gx[i] = (psi[i + 1] - psi[i - 1]) / (2 * CELL);
        gy[i] = (psi[i + GC] - psi[i - GC]) / (2 * CELL);
      }
      // the cells a bird may call home: well inside the stroke
      let nv = 0;
      const validTmp = new Int32Array(n);
      for (let i = 0; i < n; i++) if (m.data[i] >= 128 && psi[i] >= 2.5) validTmp[nv++] = i;
      fields[d] = { psi, gx, gy, area, cover: m.data, valid: validTmp.subarray(0, nv) };

      // a soft silhouette at field resolution (shown upscaled): the far mass of
      // the flock. The glyph drawn once through a blur of about 10 px.
      const g = document.createElement("canvas");
      g.width = GC;
      g.height = GR;
      const gc = g.getContext("2d");
      gc.filter = "blur(1.15px)";
      gc.fillStyle = "#fff";
      gc.scale(1 / CELL, 1 / CELL);
      gc.font = FONT;
      gc.textBaseline = "alphabetic";
      gc.fillText(String(d), PAD, PAD + capH);
      ghostSprites[d] = g;

      // a much softer, wider blot of the same figure: the denser (or thinner)
      // patch of cloud laid behind a numeral when the sky alone cannot hold it
      const p = document.createElement("canvas");
      p.width = GC + 2 * PM;
      p.height = GR + 2 * PM;
      const pc = p.getContext("2d");
      pc.filter = "blur(6px)";
      pc.fillStyle = pc.strokeStyle = "#fff";
      pc.lineJoin = "round";
      pc.lineWidth = 150;
      pc.scale(1 / CELL, 1 / CELL);
      pc.font = FONT;
      pc.textBaseline = "alphabetic";
      pc.fillText(String(d), PAD + PM * CELL, PAD + PM * CELL + capH);
      pc.strokeText(String(d), PAD + PM * CELL, PAD + PM * CELL + capH);
      patchSprites[d] = p;
      return fields[d];
    }
    const field = (d) => fields[d] || buildField(d);

    // bilinear sample of a field at glyph-local stage px: results in fPsi, fGx, fGy
    let fPsi = 0, fGx = 0, fGy = 0;
    const sample = (F, x, y) => {
      let cx = x / CELL - 0.5;
      let cy = y / CELL - 0.5;
      if (cx < 0) cx = 0; else if (cx > GC - 1.001) cx = GC - 1.001;
      if (cy < 0) cy = 0; else if (cy > GR - 1.001) cy = GR - 1.001;
      const x0 = cx | 0;
      const y0 = cy | 0;
      const ax = cx - x0;
      const ay = cy - y0;
      const i = y0 * GC + x0;
      const p = F.psi;
      const top = p[i] + (p[i + 1] - p[i]) * ax;
      const bot = p[i + GC] + (p[i + GC + 1] - p[i + GC]) * ax;
      fPsi = top + (bot - top) * ay;
      const n = i + (ax > 0.5 ? 1 : 0) + (ay > 0.5 ? GC : 0); // the gradient is smooth: its nearest cell will do
      fGx = F.gx[n];
      fGy = F.gy[n];
    };

    // Four places a digit can stand: hour (one or two), minute tens, minute ones.
    const slots = [0, 1, 2, 3].map((id) => ({ id, ch: -1, ox: 0, oy: 0, pivot: 0, rel: 0, dir: id % 2 ? -1 : 1, k: Math.floor(R.range(0, 5000)), cx: 0, cy: 0, changed: false, light: 0, inkT: 0 }));
    const ghosts = slots.map(() => {
      const c = document.createElement("canvas");
      c.width = GC;
      c.height = GR;
      const pL = document.createElement("canvas");
      const pD = document.createElement("canvas");
      pL.width = pD.width = GC + 2 * PM;
      pL.height = pD.height = GR + 2 * PM;
      return {
        c, ctx: c.getContext("2d"), key: "", on: false, sh: 0, x: 0, op: -1, dark: true, lum: 0.3, lo: 0.3, hi: 0.3, veil: 0,
        // the worst of the sky and cloud behind it: raw sky at its darkest and
        // brightest, and the cloud bands' thinnest and densest cover over its rows
        rLo: 0.3, rHi: 0.3, aMin: 0, aMax: 0,
        // the lift above the cloud: a light patch (behind dark birds), a dark one
        // (behind pale birds) and the silhouette again, unveiled, as needed
        pL, pLctx: pL.getContext("2d"), pD, pDctx: pD.getContext("2d"), pLkey: "", pDkey: "",
        aL: 0, aD: 0, o2: 0, qL: -1, qD: -1, q2: -1, lx: NaN, lsh: NaN,
      };
    });

    // ------------------------------------------------------------- birds
    const px = new Float32Array(N), py = new Float32Array(N), vx = new Float32Array(N), vy = new Float32Array(N);
    const alx = new Float32Array(N), aly = new Float32Array(N), psi0 = new Float32Array(N);
    const kT = new Float32Array(N), loose = new Float32Array(N), peel = new Float32Array(N), jump = new Float32Array(N);
    const ph = new Float32Array(N), half = new Float32Array(N), bankC = new Float32Array(N), bankS = new Float32Array(N);
    const sl = new Int8Array(N).fill(-1), size = new Uint8Array(N), bk = new Uint8Array(N), md = new Uint8Array(N);
    const fl = new Float32Array(NF), lag = new Float32Array(NF), sb = new Float32Array(NF), sc = new Float32Array(NF), kF = new Float32Array(NF);
    const cand = new Int16Array(NF).fill(-1), perched = new Uint8Array(NF);
    const HALF = [4, 5.6, 9.6];

    for (let i = 0; i < N; i++) {
      const r = R();
      size[i] = r < 0.4 ? 0 : r < 0.84 ? 1 : 2;
      half[i] = HALF[size[i]] * R.range(0.88, 1.14);
      kT[i] = R.range(24, 40);
      loose[i] = R.chance(0.2) ? Math.pow(R(), 1.6) * 0.95 + 0.05 : 0; // the birds the wind can carry off
      peel[i] = loose[i] === 0 && R.chance(0.28) ? R.range(0.5, 1) : 0; // the ones a gust can peel
      const bank = clamp(R.gauss() * 0.42, -1, 1); // each bird banks at its own angle
      bankC[i] = Math.cos(bank);
      bankS[i] = Math.sin(bank);

      jump[i] = R.chance(0.42) ? R.range(0.5, 1) : 0; // the ones a storm glow startles
      ph[i] = R.range(0, TAU);
    }
    for (let j = 0; j < NF; j++) {
      fl[j] = (j + R()) / NF; // how reluctant to fly: the last ones are the wire-sitters
      lag[j] = Math.pow(R(), 1.35);
      sb[j] = clamp(R.gauss() * 0.42, -1, 1);
      sc[j] = clamp(R.gauss() * 0.5, -1, 1);
      kF[j] = R.range(7, 15);
    }

    // the far birds: specks that ride the same streams, with no weight of their own
    const dax = new Float32Array(ND), day_ = new Float32Array(ND), dpsi = new Float32Array(ND);
    const dX = new Float32Array(ND), dY = new Float32Array(ND), dfx = new Float32Array(ND), dfy = new Float32Array(ND), dtw = new Float32Array(ND).fill(1);
    const dL = new Float32Array(ND), dph = new Float32Array(ND);
    const dsl = new Int8Array(ND).fill(-1), dbk = new Uint8Array(ND);
    const dfl = new Float32Array(NDF), dlag = new Float32Array(NDF), dsb = new Float32Array(NDF), dsc = new Float32Array(NDF), dm = new Float32Array(NDF);
    for (let i = 0; i < ND; i++) {
      dL[i] = R.chance(0.25) ? Math.pow(R(), 1.8) : R.range(0, 0.06);
      dph[i] = R.range(0, TAU);
    }
    for (let j = 0; j < NDF; j++) {
      dfl[j] = (j + R()) / NDF;
      dlag[j] = Math.pow(R(), 1.2) * 1.25;
      dsb[j] = clamp(R.gauss() * 0.5, -1.2, 1.2);
      dsc[j] = clamp(R.gauss() * 0.5, -1, 1);
    }

    const G1 = 1 / 1.32471795724;
    const G2 = G1 * G1;
    // the next evenly spread point inside a slot's digit: result in aX, aY, fPsi
    let aX = 0, aY = 0;
    // (a low-discrepancy walk through the digit's home cells, in raster order,
    // so the birds spread evenly through the strokes)
    function newAnchor(slot) {
      const F = fields[slot.ch];
      const V = F.valid;
      const k = slot.k++;
      const c = V[Math.floor(((0.5 + G1 * k) % 1) * V.length)];
      aX = ((c % GC) + ((0.5 + G2 * k) % 1)) * CELL;
      aY = (Math.floor(c / GC) + ((0.5 + 0.41421356 * k) % 1)) * CELL;
      sample(F, aX, aY);
    }

    let timeKey = "";
    const cum = [0, 0, 0, 0];
    function setTime(hh, mm, first) {
      const want = [+hh[0], hh.length > 1 ? +hh[1] : -1, +mm[0], +mm[1]];
      for (let k = 0; k < 4; k++) if (want[k] >= 0) field(want[k]);
      let x = LEFT;
      for (let k = 0; k < 4; k++) {
        const s = slots[k];
        if (k === 2) x = LEFT;
        const ch = want[k];
        const base = k < 2 ? HOUR_BASE : MIN_BASE;
        const ox = x - PAD;
        s.changed = ch !== s.ch || (ch >= 0 && Math.abs(ox - s.ox) > 0.5);
        s.ch = ch;
        if (ch < 0) continue;
        s.ox = ox;
        s.oy = base - capH - PAD;
        s.pivot = base - capH * 0.25;
        s.cx = x + adv[ch] / 2;
        s.cy = base - capH / 2;
        if (s.changed && !first) s.rel = 1;
        x += adv[ch] + TRACK;
      }
      let total = 0;
      for (let k = 0; k < 4; k++) total += slots[k].ch >= 0 ? fields[slots[k].ch].area : 0;
      let run = 0;
      for (let k = 0; k < 4; k++) {
        run += slots[k].ch >= 0 ? fields[slots[k].ch].area : 0;
        cum[k] = run / total;
      }
      for (let i = 0; i < N; i++) {
        const f = i < NG ? (i + 0.5) / NG : (i - NG + 0.5) / NF;
        let k = 0;
        while (k < 3 && f > cum[k]) k++;
        if (k !== sl[i] || slots[k].changed) {
          sl[i] = k;
          newAnchor(slots[k]);
          alx[i] = aX; aly[i] = aY; psi0[i] = fPsi;
        }
      }
      for (let i = 0; i < ND; i++) {
        const f = i < NDG ? (i + 0.5) / NDG : (i - NDG + 0.5) / NDF;
        let k = 0;
        while (k < 3 && f > cum[k]) k++;
        if (k !== dsl[i] || slots[k].changed) {
          // a speck whose digit has gone altogether (12 to 1) leaves at once,
          // so the old figure does not linger to be misread
          const gone = dsl[i] >= 0 && slots[dsl[i]].ch < 0;
          dsl[i] = k;
          newAnchor(slots[k]);
          dax[i] = aX; day_[i] = aY; dpsi[i] = fPsi;
          if (!first) {
            // fly there from wherever it is now, each bird in its own time
            dfx[i] = dX[i];
            dfy[i] = dY[i];
            dtw[i] = gone ? 0.2 : -0.35 * hash(i, 7);
          }
        }
      }
    }

    // ----------------------------------------------- wires and captions
    // Each wire is its own small SVG band, so its sway is a cheap transform.
    const bands = [];
    const rimes = [];
    const arc = []; // per wire: arc length at every 8 px of x, for placing text by x
    WIRES.forEach((q, w) => {
      const d = `M ${WX0} ${q.y0} Q ${WX0 + WSPAN / 2} ${q.yc} ${WX0 + WSPAN} ${q.y1}`;
      const band = svg("svg", { class: "band", width: W, height: q.bot - q.top, viewBox: `0 ${q.top} ${W} ${q.bot - q.top}` });
      band.style.top = `${q.top}px`;
      const rime = svg("path", { d, class: "rime", transform: "translate(0 -2.2)", opacity: 0 });
      band.append(svg("path", { id: `mu-w${w}`, d, class: "wire" }), rime);
      wrap.append(band);
      bands.push(band);
      rimes.push(rime);
      const tab = new Float32Array(Math.ceil(WSPAN / 8) + 2);
      let L = 0;
      for (let k = 1; k < tab.length; k++) {
        const x0 = WX0 + (k - 1) * 8;
        L += Math.hypot(8, wireY(w, x0 + 8) - wireY(w, x0));
        tab[k] = L;
      }
      arc.push(tab);
    });
    const onWire = (w, cls, anchor, ...kids) => {
      const tp = svg("textPath", { href: `#mu-w${w}` }, kids);
      const text = svg("text", { class: cls, "text-anchor": anchor, dy: -26 }, tp);
      bands[w].append(text);
      return { text, tp, w, right: anchor === "end", width: 0, dx: 0 };
    };
    const place = (item, x) => {
      const f = (x - WX0) / 8;
      const k = Math.floor(f);
      const tab = arc[item.w];
      item.tp.setAttribute("startOffset", (tab[k] + (tab[k + 1] - tab[k]) * (f - k)).toFixed(1));
    };
    // wire 1: the air now (temperature and condition at the left, air quality and UV at the right)
    const tTemp = onWire(0, "temp", "start");
    const tCond = onWire(0, "cond", "start");
    const aqiVal = svg("tspan", { class: "val", dx: 18 });
    const uvVal = svg("tspan", { class: "val", dx: 18 });
    const tAir = onWire(0, "lab", "end", svg("tspan", { text: "AQI" }), aqiVal, svg("tspan", { text: "UV", dx: 44 }), uvVal);
    // wire 2: the calendar (date at the left, the moon at the right)
    const tDate = onWire(1, "date", "start");
    const tMoon = onWire(1, "val", "end");
    // wire 3: the fact's label at the left, the sun's countdown at the right; the fact hangs below
    const tFactLab = onWire(2, "lab", "start");
    const sunLab = svg("tspan", { class: "soft" });
    const sunVal = svg("tspan", { class: "val", dx: 18 });
    const tSun = onWire(2, "val", "end", sunLab, sunVal);
    // the computed text length leaves out the tspans' dx gaps: count them in
    tAir.dx = 18 + 44 + 18;
    tSun.dx = 18;
    const ampmBox = svg("svg", { class: "ampmBox", width: 320, height: 160, viewBox: `${W - MARGIN - 320} ${MIN_BASE - 130} 320 160` });
    Object.assign(ampmBox.style, { left: `${W - MARGIN - 320}px`, top: `${MIN_BASE - 130}px`, transformOrigin: "320px 130px" });
    const ampm = svg("text", { class: "ampm", "text-anchor": "end", x: W - MARGIN, y: MIN_BASE });
    ampmBox.append(ampm);
    wrap.append(ampmBox);
    const fact = el("div", { class: "fact" });
    wrap.append(fact);

    const shown = {};
    const put = (key, node, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };

    // Places on the wires where a bird may sit: a fixed scatter along each
    // wire, minus wherever a caption currently is.
    const NC = 330;
    const candW = new Uint8Array(NC), candX = new Float32Array(NC), candOk = new Uint8Array(NC), candUsed = new Uint8Array(NC);
    {
      let c = 0;
      for (let w = 0; w < 3; w++) {
        let x = R.range(6, 24);
        while (x < W - 6 && c < (NC / 3) * (w + 1)) {
          candW[c] = w;
          candX[c] = x;
          c++;
          x += R.chance(0.2) ? R.range(26, 70) : R.range(9.5, 17);
        }
      }
      for (; c < NC; c++) candX[c] = -1;
    }
    const order = R.shuffle(Array.from({ length: NC }, (_, i) => i));
    const NP = 200; // free birds that prefer a wire to the numerals when they come down
    const busy = [[], [], []];
    function seatBirds() {
      for (let c = 0; c < NC; c++) {
        let ok = candX[c] >= 0;
        if (ok) for (const [a, b] of busy[candW[c]]) if (candX[c] > a && candX[c] < b) { ok = false; break; }
        candOk[c] = ok ? 1 : 0;
      }
      for (let j = NF - NP; j < NF; j++) {
        if (cand[j] >= 0 && !candOk[cand[j]]) {
          candUsed[cand[j]] = 0;
          cand[j] = -1;
          perched[j] = 0;
        }
      }
      let o = 0;
      for (let j = NF - 1; j >= NF - NP; j--) {
        if (cand[j] >= 0) continue;
        while (o < NC && (!candOk[order[o]] || candUsed[order[o]])) o++;
        if (o >= NC) break;
        cand[j] = order[o];
        candUsed[order[o]] = 1;
      }
    }

    const GAP = 16;
    const COND_GAP = 44; // temperature to condition: about 48 px of clear space, ink to ink
    const len = (t) => t.text.getComputedTextLength();
    // Narrow the sans captions on a wire (Instrument Sans has a width axis) if
    // they would not fit. Every natural width is read in one layout pass and
    // all the narrowing is written before the next, so the browser lays the
    // captions out at most twice, not once per caption.
    const stretchFor = (items, room) => {
      let total = 0;
      for (const t of items) total += t.width;
      return total <= room ? "" : `${Math.max(75, Math.floor((100 * room) / total) - 1)}%`;
    };
    const caps = [tTemp, tCond, tAir, tDate, tMoon, tFactLab, tSun];
    function layoutCaptions(hasFact) {
      const full = W - 2 * MARGIN;
      tFactLab.text.style.display = hasFact ? "" : "none";
      fact.style.display = hasFact ? "" : "none";
      for (const t of caps) t.text.style.fontStretch = "";
      for (const t of caps) t.width = len(t) + t.dx;
      const wt = tTemp.width;
      const s1 = stretchFor([tCond, tAir], full - wt - COND_GAP - 4 - 40);
      const s2 = stretchFor([tDate, tMoon], full - 48);
      const s3 = stretchFor(hasFact ? [tFactLab, tSun] : [tSun], full - 48);
      tCond.text.style.fontStretch = tAir.text.style.fontStretch = s1;
      tDate.text.style.fontStretch = tMoon.text.style.fontStretch = s2;
      tFactLab.text.style.fontStretch = tSun.text.style.fontStretch = s3;
      if (s1 || s2 || s3) for (const t of caps) t.width = len(t) + t.dx;
      // wire 1: the air now
      place(tTemp, MARGIN);
      place(tCond, MARGIN + wt + COND_GAP);
      place(tAir, W - MARGIN);
      busy[0] = [[MARGIN - GAP, MARGIN + wt + COND_GAP + tCond.width + GAP], [W - MARGIN - tAir.width - GAP, W - MARGIN + GAP]];
      // wire 2: the calendar
      place(tDate, MARGIN);
      place(tMoon, W - MARGIN);
      busy[1] = [[MARGIN - GAP, MARGIN + tDate.width + GAP], [W - MARGIN - tMoon.width - GAP, W - MARGIN + GAP]];
      // wire 3: the fact's label and the sun
      place(tSun, W - MARGIN);
      busy[2] = [[W - MARGIN - tSun.width - GAP, W - MARGIN + GAP]];
      if (hasFact) {
        place(tFactLab, MARGIN);
        busy[2].push([MARGIN - GAP, MARGIN + tFactLab.width + GAP]);
        // a long fact steps down in size rather than overflow, and only the
        // smallest size wraps (to two lines, about 42 px apart ink to ink)
        for (const [fs, lines] of FACT_SIZES) {
          const lh = Math.ceil(fs * 0.96 + 42); // the face's ink spans about 0.96 em
          fact.style.fontSize = `${fs}px`;
          fact.style.lineHeight = `${lh}px`;
          fact.style.maxHeight = `${lines * lh}px`;
          fact.style.top = `${Math.round(FACT_INK - (lh - fs) / 2)}px`;
          if (fact.scrollHeight <= lines * lh + 2) break;
        }
      }
      seatBirds();
    }

    // -------------------------------------------------------------- inks
    const INK_DAY = "#0b0d12";
    const INK_NIGHT = "#e4dac4"; // birds lit from below by the city
    const INK_DUSK = "#ece6d6"; // the same birds catching the last light on a mid-toned sky
    const TYPE_DAY = "#050608";
    const TYPE_NIGHT = "#f5f1e8"; // near-white: at the switch even this only just reads
    const FLIP = 0.168; // sky luminance where dark and pale type read equally well
    const TYPE_HYST = 0.01; // a dead band either side of the type's flip, so its ink cannot flicker
    let birdFlip = 0.1; // the same for birds: silhouettes by full day, the better ink through twilight
    // Each numeral takes the dark or the pale ink outright (never a blend that
    // passes through the tone of the sky behind it), with a dead band either
    // side of the flip so it cannot flicker, and the change itself is a short
    // fade. Near the flip neither ink has much to push against, so the soft
    // silhouette under the birds thickens until the figure holds its contrast.
    const BIRD_HYST = 0.015;
    const INK_HYST = 1.1; // the same, as a ratio of the two inks' contrasts
    const INK_FADE = 0.8; // s
    const GHOST_AIM = 4; // contrast the figure aims for while the sky is near the flip
    const BIRD_COVER = 0.15; // share of a stroke the birds themselves cover, over the silhouette
    const L_DAY = luminance(INK_DAY);
    let paleLum = luminance(INK_NIGHT);
    let inkSnap = true;
    let fading = false;
    const slotInk = new Uint8Array(4);
    const slotCol = ["", "", "", ""];
    // what a numeral really has behind it: the sky, under the cloud bands' mean
    // cover (canvas blends in sRGB, so the mix is made there)
    let cloudCover = 0;
    let cloudV = 0;
    let twilight = 0;
    let lastVeil = 0; // the cloud bands' mean cover over the last region asked for
    const unsrgb = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    // the darkest and the brightest of the sky over a region (it is smooth: a coarse grid will do)
    let regionLo = 0;
    let regionHi = 0;
    const lumSpread = (x0, x1, y0, y1) => {
      regionLo = 1;
      regionHi = 0;
      for (let y = y0; y <= y1; y += 30) for (let x = x0; x <= x1; x += 30) {
        const v = lumAt(x, y);
        if (v < regionLo) regionLo = v;
        if (v > regionHi) regionHi = v;
      }
    };
    const underCloud = (L) => (lastVeil > 0 ? unsrgb(srgb(L) * (1 - lastVeil) + cloudV * lastVeil) : L);
    const groundLum = (x0, x1, y0, y1) => {
      const L = lumRegion(x0, x1, y0, y1);
      lastVeil = 0;
      if (cloudCover <= 0) return L;
      let a = 0;
      let n = 0;
      for (let j = clamp(Math.floor(y0 / CS), 0, CH - 1); j <= clamp(Math.floor(y1 / CS), 0, CH - 1); j++) { a += cloudRowCover[j]; n++; }
      a = (cloudCover * a) / n;
      lastVeil = a;
      return unsrgb(srgb(L) * (1 - a) + cloudV * a);
    };
    const ALPHA = [0.86, 0.95, 1];
    const FLY_ALPHA = 0.6; // the ribbon in flight, against the numerals' full ink
    const WIDTH = [1.8, 2.2, 2.6];
    let pale = INK_NIGHT;
    let skyKey = "";
    let typeInk = "";
    let ampmInk = "";
    let cloudKey = "";
    let cloudTint = "#888888";
    let rainInk = "";
    let snowInk = "";
    let perchDark = true;
    let patchLight = "#c8ccd2";
    let patchDark = "#101216";
    let vPL = 0.8;
    let vPD = 0.06;
    const LIFT_AIM = 3.6; // contrast the figure is held to against the worst of the ground behind it
    const LIFT_FADE = 0.8; // s: how fast the lift may change (it follows the light far slower than this)
    // What the lift must add for one numeral, given the raw sky Lr at its worst
    // point and a cloud cover aw over it: the alpha of the patch behind it
    // (liftA) and the opacity of its unveiled silhouette (liftO), all blended in sRGB.
    let liftA = 0;
    let liftO = 0;
    function liftNeed(dark, Lr, aw, op, Vc, Li, night, gl, patch) {
      const Vr = srgb(Lr);
      let Vg = Vr * (1 - aw) + cloudV * aw; // the ground
      let V0 = (Vr + (Vc - Vr) * op) * (1 - aw) + cloudV * aw; // the silhouette below, veiled
      // a storm's glow lies over both: it washes out a dark silhouette below
      // the lift, and brightens the ground behind a pale one
      if (gl > 0) {
        if (dark) V0 += (0.92 - V0) * gl;
        else Vg += (0.92 - Vg) * gl;
      }
      const Vi = srgb(Li);
      const Vp = dark ? vPL : vPD;
      const Lg = unsrgb(Vg);
      // a patch only where even a solid figure would fall short (with a margin,
      // so the silhouette is not left at full strength: a "solid" figure is
      // still a little thinner than its ink, toward its tips and between birds).
      // Under a veiled night sky, the patch comes first: denser cloud behind
      // the figure keeps the room dark, where a brighter figure would light it.
      const A2 = LIFT_AIM * 1.12;
      const Ls = dark ? Li + 0.012 : 0.85 * Li;
      const Lf = lerp(Ls, unsrgb(V0), night);
      const Gt = dark ? A2 * (Lf + 0.05) - 0.05 : (Lf + 0.05) / A2 - 0.05;
      let a = 0;
      if (patch && (dark ? Lg < Gt : Lg > Gt)) {
        const d = Vp - Vg;
        // (a quarter more than the sum says: the blot thins toward a stroke's tips)
        a = Math.abs(d) < 0.01 ? 1 : clamp((1.25 * (srgb(clamp(Gt)) - Vg)) / d);
      }
      const G1 = unsrgb(Vg + (Vp - Vg) * a);
      // the stroke under the patch: once there is a patch, the silhouette below
      // it is not counted on (the patch and anything drifting over the sky,
      // a storm's glow, can wash it out), and the lift's own silhouette holds it
      const V1 = lerp(V0 + (Vp - V0) * a, Vg + (Vp - Vg) * a, Math.min(1, 4 * a));
      const Lw = dark ? (G1 + 0.05) / LIFT_AIM - 0.05 : LIFT_AIM * (G1 + 0.05) - 0.05;
      // (the birds are not counted on: between them, the silhouette alone must hold)
      const Vw = srgb(clamp(Lw));
      const span = Vi - V1;
      let o = 0;
      if (dark ? Vw < V1 : Vw > V1) o = Math.abs(span) < 0.01 ? 1 : clamp((Vw - V1) / span);
      liftA = a;
      liftO = o;
    }

    function syncLook(s) {
      const sk = s.sky;
      const key = `${sk.west}${sk.northWest}${sk.northEast}${sk.east}${Math.round(s.daylight * 250)}:${Math.round(s.weather.cloud / 4)}:${Math.round(s.weather.visibility * 8)}`;
      if (key !== skyKey) {
        skyKey = key;
        paintSky(s);
        const low = lumRegion(MARGIN, W - MARGIN, 1380, 1820);
        const typeDark = low > FLIP + (typeInk === "" ? 0 : typeInk === TYPE_DAY ? -TYPE_HYST : TYPE_HYST);
        const ink = typeDark ? TYPE_DAY : TYPE_NIGHT;
        if (ink !== typeInk) {
          typeInk = ink;
          for (const b of bands) b.style.color = ink;
          fact.style.color = ink;
        }
        perchDark = typeDark;
        const sideLum = lumRegion(880, 1020, MIN_BASE - 110, MIN_BASE);
        const side = sideLum > FLIP + (ampmInk === "" ? 0 : ampmInk === TYPE_DAY ? -TYPE_HYST : TYPE_HYST) ? TYPE_DAY : TYPE_NIGHT;
        if (side !== ampmInk) {
          ampmInk = side;
          ampmBox.style.color = side;
        }
        // a halo of the sky's own colour behind the type, so a bird passing
        // behind a letter never merges with it
        const mean = lumRegion(60, 1020, 100, 1400);
        // by full day the birds stay silhouettes; through twilight they flip
        // where a solid figure of either ink would read equally well
        twilight = 1 - smoothstep(0.98, 1, s.daylight);
        birdFlip = lerp(0.085, 0.165, twilight);
        pale = mix(INK_NIGHT, INK_DUSK, smoothstep(0.012, 0.08, mean));
        paleLum = luminance(pale);
        rainInk = mean > 0.3 ? rgba("#1d2733", 0.4) : rgba("#c9d2de", 0.42 - 0.12 * (1 - s.daylight));
        snowInk = rgba(mix("#8f959c", "#ffffff", 0.35 + 0.65 * s.daylight), 0.9);
        // cloud tint: lit from above by day, from the city below at night; heavy weather is darker than its sky
        const heavy = s.weather.kind === "storm" || s.weather.kind === "rain";
        const tint = heavy ? mix(sk.mean, "#05060a", 0.35) : mix(sk.mean, s.daylight > 0.5 ? "#ffffff" : "#8a7d74", 0.2 + 0.4 * s.daylight);
        cloudTint = tint;
        // the lift's patches: thinner cloud (the sky's own colour, paled) behind
        // dark birds, denser cloud (the bands' tint, deepened) behind pale ones
        patchLight = mix(sk.mean, "#e9ebee", 0.6);
        patchDark = mix(tint, "#05060a", 0.7);
        vPL = srgb(luminance(patchLight));
        vPD = srgb(luminance(patchDark));
        // a halo of the sky's own colour behind the type, so a bird passing
        // behind a letter never merges with it (AM/PM sits where the cloud
        // bands thin out, so its halo takes a share of their tint)
        const cop = clamp(s.weather.cloud / 100) * (0.5 - 0.2 * (1 - s.daylight)) + 0.25 * smoothstep(3.5, 0.3, s.weather.visibility);
        cloudCover = cloudRow < CH || cop < 0.03 ? 0 : cop;
        cloudV = srgb(luminance(tint));
        ampm.style.stroke = mix(skyHexAt(950, MIN_BASE - 50), tint, 0.3 * clamp(cop));
        for (const t of caps) t.text.style.stroke = skyHexAt(t.right ? 840 : 240, wireY(t.w, t.right ? 840 : 240) - 40);
        // ghosts take the ink that reads on their own patch of sky
        for (let k = 0; k < 4; k++) drawGhost(k);
      }
    }
    function drawGhost(k) {
      const s = slots[k];
      const g = ghosts[k];
      if (s.ch < 0) {
        if (g.key !== "off") {
          g.key = "off";
          g.on = false;
          groundDirty = true;
        }
        return;
      }
      const x0 = s.ox + PAD, x1 = s.ox + GWpx - PAD, y0 = s.oy + PAD, y1 = s.oy + GHpx - PAD;
      let dark;
      let lum;
      // the worst the ground behind this numeral can be: the raw sky at its
      // darkest and brightest, under the cloud bands at their thinnest and densest
      lumSpread(x0, x1, y0, y1);
      g.rLo = regionLo;
      g.rHi = regionHi;
      g.aMin = 0;
      g.aMax = 0;
      if (cloudCover > 0) {
        let lo = 1;
        let hi = 0;
        for (let j = clamp(Math.floor(y0 / CS), 0, CH - 1); j <= clamp(Math.floor(y1 / CS), 0, CH - 1); j++) {
          if (cloudRowMin[j] < lo) lo = cloudRowMin[j];
          if (cloudRowMax[j] > hi) hi = cloudRowMax[j];
        }
        g.aMin = cloudCover * lo;
        g.aMax = cloudCover * hi;
      }
      const under = (L, a) => (a > 0 ? unsrgb(srgb(L) * (1 - a) + cloudV * a) : L);
      if (twilight > 0 || cloudCover > 0) {
        // through twilight, and under any cloud by day: the ink that holds more
        // contrast against the worst of its own patch of sky (the darkest part
        // for dark ink, the brightest for pale), leaning toward silhouettes as
        // full day nears
        const sky = lumRegion(x0, x1, y0, y1);
        lum = lerp(sky, groundLum(x0, x1, y0, y1), twilight);
        g.lo = Math.min(under(regionLo, g.aMin), under(regionLo, g.aMax));
        g.hi = Math.max(under(regionHi, g.aMin), under(regionHi, g.aMax)); // pale ink is weakest where the bands part (or, under bright cloud, where they thicken)
        const dCr = ((g.lo + 0.05) / (L_DAY + 0.05)) * lerp(2.5, 1, twilight);
        const pCr = (paleLum + 0.05) / (g.hi + 0.05);
        dark = g.dark ? dCr * INK_HYST > pCr : dCr > pCr * INK_HYST;
      } else {
        lum = lumRegion(x0, x1, y0, y1);
        g.lo = g.hi = lum;
        dark = lum > birdFlip + (g.dark ? -BIRD_HYST : BIRD_HYST);
      }
      s.light = dark ? 0 : 1;
      if (inkSnap) s.inkT = s.light;
      const col = s.inkT <= 0 ? INK_DAY : s.inkT >= 1 ? pale : mix(INK_DAY, pale, s.inkT);
      const key = `${s.ch}${col}`;
      if (g.key !== key) {
        g.key = key;
        g.on = true;
        groundDirty = true;
        g.ctx.globalCompositeOperation = "copy";
        g.ctx.drawImage(ghostSprites[s.ch], 0, 0);
        g.ctx.globalCompositeOperation = "source-in";
        g.ctx.fillStyle = col;
        g.ctx.fillRect(0, 0, g.c.width, g.c.height);
      }
      g.lum = lum;
      g.veil = twilight > 0 ? lastVeil : 0; // the bands lie over the silhouette too
      g.dark = dark;
    }

    // ------------------------------------------------------ the simulation
    // The lift: above the cloud bands and below the birds. Where the sky (and
    // the cloud over the silhouettes) leaves a numeral short of contrast, a
    // soft patch of thinner or denser cloud behind it, and its silhouette again,
    // clear of the veil. Empty, and hidden, wherever the sky alone holds it.
    const lift = canvas2d(wrap, {});
    lift.canvas.style.zIndex = "3";
    lift.canvas.style.display = "none";
    let liftDirty = false;
    let liftOn = false;
    const birds = canvas2d(wrap, { maxScale: 2, adaptive: true });
    birds.canvas.style.zIndex = "4";

    const P = [R.range(0, TAU), R.range(0, TAU), R.range(0, TAU), R.range(0, TAU), R.range(0, TAU), R.range(0, TAU)];
    const sway = [0, 0, 0];
    let T = R.range(0, 400); // the ribbon's own clock
    let shear = 0;
    let baseShear = 0;
    let act = 1;
    let fog = 0;
    let startle = 0;
    let glowAmt = 0;
    let glowId = -1;
    let snap = true;
    let flap = 9;
    let windSign = 1;
    let tick = 0;
    let beat = 1;

    // A place in the ribbon: a twisting sheet trailing along a wandering path.
    // Result in rX, rY. The path's shape for this frame is in the rb* variables.
    let rX = 0, rY = 0;
    let rbStretch = 2.6, rbCy = 640, rbAmpY = 470, rbWidth = 110, rbDrift = 0;
    function ribbon(lagv, across, thick) {
      const tau = T - lagv * rbStretch;
      const a1 = 0.29 * tau + P[1], a2 = 0.67 * tau + P[2], a3 = 0.21 * tau + P[3], a4 = 0.53 * tau + P[4];
      const cx = 585 + rbDrift + 400 * fsin(a1) + 150 * fsin(a2);
      const cy = rbCy + rbAmpY * fsin(a3) + 160 * fsin(a4);
      const dx = 116 * fcos(a1) + 100.5 * fcos(a2);
      const dy = rbAmpY * 0.21 * fcos(a3) + 84.8 * fcos(a4);
      const speed = Math.sqrt(dx * dx + dy * dy);
      const dl = 1 / (speed + 12);
      const bloom = 1 + 80 / (speed + 50); // where the flock slows to turn, it balloons instead of knotting
      const th = 1.25 * fsin(0.43 * tau + P[5]) + fsin(0.17 * T + lagv * 2.1) + lagv * 0.7;
      const wdt = rbWidth * bloom * (0.5 + 0.95 * fsin(Math.PI * Math.min(1, lagv * 0.9 + 0.1))) * (1 + 0.3 * fsin(0.61 * tau + 1.3));
      const off = across * wdt * (0.25 + 0.75 * fcos(th)) + thick * wdt * 0.34 * fsin(th);
      const along = thick * 26 * bloom * bloom;
      rX = cx - dy * dl * off + dx * dl * along;
      rY = cy + dx * dl * off + dy * dl * along;
    }

    function step(s, dt, t) {
      const wx = s.weather;
      const day = s.daylight;
      const wr = (wx.windDir * Math.PI) / 180;
      const mph = wx.wind;
      const gustMph = Math.max(wx.gust, mph);
      let ux = -Math.sin(wr);
      let uy = Math.cos(wr) * 0.4;
      const windiness = smoothstep(5, 32, mph + 0.3 * (gustMph - mph));
      const gustRatio = clamp((gustMph - mph) / Math.max(5, mph), 0, 1.4);
      const F = 15 * mph;
      const ul = Math.hypot(ux, uy) || 1;
      const nx = ux / ul;
      const ny = uy / ul;
      windSign = ux >= 0 ? 1 : -1;
      const q = TAU / 1900;
      const om = q * (70 + 9 * mph);
      baseShear = clamp(ux * mph * 0.0086, -MAX_SHEAR, MAX_SHEAR);
      shear = baseShear * (1 + 0.12 * fsin(t * 0.43 + P[0]) * windiness);

      // mood
      const heat = smoothstep(82, 99, wx.temp);
      const warm = smoothstep(22, 92, wx.temp);
      const evening = s.ms > s.sun.noon ? 1 : 0.45;
      const dusk = Math.exp(-((s.sun.alt / 7) * (s.sun.alt / 7))) * evening;
      const wet = wx.falling && wx.falling !== "snow" ? wx.intensity : 0;
      const storm = wx.falling === "storm" ? 1 : 0;
      act = (0.13 + 0.87 * smoothstep(0.03, 0.5, day)) * (1 + 0.55 * dusk * smoothstep(0.02, 0.3, day)) * (1 - 0.3 * wx.intensity) * (1 - 0.3 * heat);
      const flyFrac = smoothstep(0.05, 0.42, day) * (0.92 + 0.08 * dusk) * (1 - 0.5 * wet) * (1 - 0.35 * storm) * (1 - 0.25 * (wx.falling === "snow" ? wx.intensity : 0));
      fog = smoothstep(3.5, 0.3, wx.visibility);
      const flow = 44 * act;
      const wob = 1.6 + 7.5 * warm * warm;
      const wobRate = 0.5 + 0.9 * act;
      const turb = (16 + 7 * mph) * (0.35 + 0.65 * act);
      flap = 3.5 + 7.5 * act;
      beat = 0.55 + 0.45 * smoothstep(0.1, 0.6, act);
      const damp = Math.exp(-6.5 * dt);
      const dampF = Math.exp(-3.6 * dt);
      const vmax = 560;
      const gusty = windiness > 0.02;

      // a storm's soft glow, and the start it gives the flock
      if (storm) {
        const period = 34;
        const id = Math.floor(t / period);
        const at = (id + 0.25 + 0.5 * hash(id, seed)) * period;
        const since = t - at;
        glowAmt = since < 0 ? 0 : since < 0.7 ? smoothstep(0, 0.7, since) : Math.exp(-(since - 0.7) / 1.6);
        startle = since < 0 ? 0 : since < 0.9 ? smoothstep(0, 0.9, since) : Math.exp(-(since - 0.9) / 2.1);
        if (id !== glowId) {
          glowId = id;
          glow.style.transform = `translate(${Math.round(-560 + 900 * hash(id, 3))}px, ${Math.round(-500 + 500 * hash(id, 9))}px)`;
        }
      } else {
        glowAmt = 0;
        startle = 0;
      }

      // the hawk pass: a pressure wave that rolls through the flock now and then
      const hawkEvery = 53;
      const hawkId = Math.floor((t + 20) / hawkEvery);
      const hawkAng = (hash(hawkId, seed + 5) - 0.5) * 1.2 + (hash(hawkId, 2) < 0.5 ? 0 : Math.PI);
      const hdx = Math.cos(hawkAng);
      const hdy = Math.sin(hawkAng);
      const hawkFront = -1500 + (((t + 20) % hawkEvery) / 6.5) * 3000 + (hdx * W + hdy * H) * 0.5;
      const hawkAmp = 20 * (0.35 + 0.65 * act);

      // wires sway in the wind
      for (let w = 0; w < 3; w++) sway[w] = (0.6 + 4.5 * windiness) * fsin(t * (0.5 + 0.13 * w) + P[w] + 0.6 * fsin(t * 0.21 + w));

      // the ribbon's path this instant
      const rate = 0.9 * act + 0.05;
      T += dt * rate;
      rbStretch = 3.1 + 1.6 * windiness;
      rbCy = lerp(lerp(640, 430, heat), 930, Math.min(1, wet * 1.3));
      rbAmpY = lerp(470, 330, Math.min(1, wet * 1.3 + heat * 0.5));
      rbWidth = (72 + 96 * warm) * (1 - 0.15 * wet);
      rbDrift = clamp(ux * mph * 3.2, -120, 120);

      for (let k = 0; k < 4; k++) if (slots[k].rel > 0) slots[k].rel = Math.max(0, slots[k].rel - dt / 2.6);

      for (let i = 0; i < N; i++) {
        let tx, ty, k, fm, mode = 0, j = -1;
        if (i >= NG) {
          j = i - NG;
          if (fl[j] < flyFrac) mode = 2;
          else if (cand[j] >= 0) mode = 1;
        }
        const p = ph[i];
        md[i] = mode;
        if (mode === 0) {
          // a home point riding a contour of the digit's field
          const S = slots[sl[i]];
          const Fd = fields[S.ch];
          sample(Fd, alx[i], aly[i]);
          const fix = (psi0[i] - fPsi) * 0.35;
          const adv_ = S.dir * flow * dt;
          alx[i] += -fGy * adv_ + fGx * fix;
          aly[i] += fGx * adv_ + fGy * fix;
          const ay = S.oy + aly[i];
          tx = S.ox + alx[i] + (S.pivot - ay) * shear + wob * fsin(t * wobRate + p);
          ty = ay + wob * fcos(t * wobRate * 0.83 + p * 1.7);
          k = kT[i];
          fm = 1;
          if (S.rel > 0) {
            // the digit has just changed: let go, swirl once, settle
            const r2 = S.rel * S.rel;
            k *= 1 - 0.9 * r2 * (0.5 + 0.5 * peel[i] + 0.5 * loose[i]);
            const rx = px[i] - S.cx;
            const ry = py[i] - S.cy;
            vx[i] += (-ry * 2.6 * S.dir - rx * 0.4) * r2 * dt * 3;
            vy[i] += (rx * 2.6 * S.dir - ry * 0.4 - 160) * r2 * dt * 3;
          }
        } else if (mode === 1) {
          const c = cand[j];
          tx = candX[c];
          ty = wireY(candW[c], tx) + sway[candW[c]] - 1;
          k = 30;
          fm = 0.12;
        } else {
          ribbon(lag[j], sb[j], sc[j]);
          tx = rX;
          ty = rY;
          k = kF[j];
          fm = 0.45;
        }
        const x = px[i];
        const y = py[i];
        if (snap) {
          px[i] = tx;
          py[i] = ty;
          continue;
        }
        // the hawk pass
        const hp = x * hdx + y * hdy - hawkFront;
        if (hp > -220 && hp < 220) {
          const e = Math.exp(-(hp * hp) / 9800) * hawkAmp;
          tx += hdx * e;
          ty += hdy * e;
        }
        // the wind, its gusts and its turbulence
        let g = 0;
        if (gusty) {
          g = fsin((x * nx + y * ny) * q - om * t + 1.3 * fsin(0.37 * t + y * 0.0031 + P[0]));
          g = g < 0.3 ? 0 : (g - 0.3) * 1.43;
          g *= g * gustRatio;
        }
        const L = loose[i];
        if (mode === 0) k = k / (1 + L * windiness * (17 + 26 * g)) * (1 - 0.72 * g * peel[i] * windiness);
        if (startle > 0.01 && jump[i] > 0) {
          k *= 1 - 0.93 * startle * jump[i];
          vy[i] -= (260 + 240 * jump[i]) * startle * dt * (mode === 2 ? 0.3 : 1);
          vx[i] += fsin(p * 7) * 160 * startle * dt;
        }
        const tb = turb * (0.3 + L + (mode === 2 ? 0.5 : 0));
        let ax = k * (tx - x) + fm * F * ux * (1 + 1.3 * g) + tb * fsin(y * 0.012 + t * 0.9 + p) + g * F * 0.5 * -ny * fsin(p + t * 0.6);
        let ay = k * (ty - y) + fm * F * uy * (1 + 1.3 * g) + tb * fcos(x * 0.011 - t * 0.7 + p * 1.3) + g * F * 0.5 * nx * fsin(p + t * 0.6) - g * F * 0.12;
        let nvx = (vx[i] + ax * dt) * (mode === 2 ? dampF : damp);
        let nvy = (vy[i] + ay * dt) * (mode === 2 ? dampF : damp);
        const sp2 = nvx * nvx + nvy * nvy;
        if (sp2 > vmax * vmax) {
          const m = vmax / Math.sqrt(sp2);
          nvx *= m;
          nvy *= m;
        }
        if (mode === 1) {
          const ddx = tx - x, ddy = ty - y;
          const near = ddx * ddx + ddy * ddy < 40 && sp2 < 2500;
          perched[j] = near && g < 0.5 ? 1 : 0;
          if (near) { nvx *= 0.7; nvy *= 0.7; }
        } else if (j >= 0) perched[j] = 0;
        vx[i] = nvx;
        vy[i] = nvy;
        px[i] = x + nvx * dt;
        py[i] = y + nvy * dt;
      }
      // the far birds
      const smear = windiness * windiness * mph;
      const turn = Math.min(1, dt / 2.6);
      tick ^= 1;
      for (let i = 0; i < ND; i++) {
        // the ones that stay in the numerals move slowly enough to be advanced on alternate frames
        let dd = dt;
        if (i < NDG && !snap) {
          if ((i & 1) === tick) continue;
          dd = dt * 2;
        }
        const S = slots[dsl[i]];
        let x, y;
        if (i >= NDG && dm[i - NDG] === 1 && dfl[i - NDG] < flyFrac && dtw[i] >= 1) {
          // in full flight with the ribbon: its home in the numerals can wait
          ribbon(dlag[i - NDG], dsb[i - NDG], dsc[i - NDG]);
          dX[i] = rX;
          dY[i] = rY;
          continue;
        }
        sample(fields[S.ch], dax[i], day_[i]);
        const fix = (dpsi[i] - fPsi) * 0.35;
        const adv_ = S.dir * flow * dd;
        dax[i] += -fGy * adv_ + fGx * fix;
        day_[i] += fGx * adv_ + fGy * fix;
        y = S.oy + day_[i];
        x = S.ox + dax[i] + (S.pivot - y) * shear;
        if (gusty) {
          const gph = (x * nx + y * ny) * q - om * t + 1.3 * fsin(0.37 * t + y * 0.0031 + P[0]);
          let g = fsin(gph);
          g = g < 0.3 ? 0 : (g - 0.3) * 1.43;
          g *= g * gustRatio;
          const d = dL[i] * smear * (2.4 + 4.5 * g);
          x += ux * d + d * 0.16 * fsin(t * 1.1 + dph[i]);
          y += uy * d + d * 0.16 * fcos(t * 0.9 + dph[i] * 2);
        }
        if (i >= NDG) {
          // by day these fly with the ribbon
          const j = i - NDG;
          const want = dfl[j] < flyFrac ? 1 : 0;
          let m = dm[j];
          if (snap) m = want;
          else if (m !== want) m = want ? Math.min(1, m + turn) : Math.max(0, m - turn);
          dm[j] = m;
          if (m > 0) {
            ribbon(dlag[j], dsb[j], dsc[j]);
            const e = m * m * (3 - 2 * m);
            x += (rX - x) * e;
            y += (rY - y) * e;
          }
        }
        if (dtw[i] < 1) {
          const u = (dtw[i] += dd / 2.3);
          if (u <= 0) {
            x = dfx[i];
            y = dfy[i];
          } else if (u < 1) {
            const e = u * u * (3 - 2 * u);
            const bow = fsin(Math.PI * u) * (0.12 + 0.2 * dL[i]) * S.dir;
            const ddx = x - dfx[i], ddy = y - dfy[i];
            x = dfx[i] + ddx * e - ddy * bow;
            y = dfy[i] + ddy * e + ddx * bow - fsin(Math.PI * u) * 26;
          }
        }
        dX[i] = x;
        dY[i] = y;
      }
      snap = false;
    }

    // ------------------------------------------------------------- drawing
    // Every bird is a small filled chevron (filling is far cheaper than
    // stroking), all of one size and ink in a single path.
    // bird indices grouped by size, glyph birds first then free ones, so each
    // group is drawn in one run with one alpha
    const runs = [];
    const drawOrder = new Uint16Array(N);
    {
      let o = 0;
      for (let free = 0; free < 2; free++) for (let z = 0; z < 3; z++) {
        const from = o;
        for (let i = free ? NG : 0; i < (free ? N : NG); i++) if (size[i] === z) drawOrder[o++] = i;
        runs.push({ from, to: o, z, free });
      }
    }
    const runAlpha = new Float32Array(6);
    const dotStyles = ["", "", "", ""];
    let styleFog = -1;
    let stylePale = "";

    function draw(s, t) {
      const ctx = birds.ctx;
      birds.clear();
      const fq = Math.round(fog * 100);
      if (fq !== styleFog || pale !== stylePale) {
        styleFog = fq;
        stylePale = pale;
        for (let r = 0; r < 6; r++) {
          const z = r % 3;
          runAlpha[r] = ALPHA[z] * (r >= 3 ? 1 - fog * [0.92, 0.7, 0.3][z] : 1 - fog * [0.25, 0.1, 0][z]);
        }
        dotStyles[0] = rgba(INK_DAY, +(0.8 * (1 - 0.3 * fog)).toFixed(3));
        dotStyles[1] = rgba(pale, +(0.8 * (1 - 0.3 * fog)).toFixed(3));
        dotStyles[2] = rgba(INK_DAY, +(0.55 * (1 - 0.9 * fog)).toFixed(3));
        dotStyles[3] = rgba(pale, +(0.55 * (1 - 0.9 * fog)).toFixed(3));
      }
      // each numeral's ink (a blend only for the moment of a change)
      fading = false;
      for (let k = 0; k < 4; k++) {
        const sT = slots[k].inkT;
        slotInk[k] = sT <= 0 ? 0 : sT >= 1 ? 1 : 5 + k;
        if (slotInk[k] > 4) {
          fading = true;
          slotCol[k] = mix(INK_DAY, pale, sT);
        }
      }
      // far birds first: specks
      for (let i = 0; i < NDG; i++) dbk[i] = slots[dsl[i]].inkT < 0.5 ? 0 : 1;
      for (let i = NDG; i < ND; i++) {
        if (dm[i - NDG] < 0.5) {
          dbk[i] = slots[dsl[i]].inkT < 0.5 ? 0 : 1;
          continue;
        }
        let ci = (dX[i] * (SC / W)) | 0;
        let cj = (dY[i] * (SR / H)) | 0;
        if (ci < 0) ci = 0; else if (ci >= SC) ci = SC - 1;
        if (cj < 0) cj = 0; else if (cj >= SR) cj = SR - 1;
        dbk[i] = (skyLum[cj * SC + ci] < birdFlip ? 1 : 0) + 2;
      }
      for (let b = 0; b < 4; b++) {
        ctx.fillStyle = dotStyles[b];
        ctx.beginPath();
        for (let i = b < 2 ? 0 : NDG; i < ND; i++) {
          if (dbk[i] !== b) continue;
          const sz = 2.6 + (i & 3) * 0.35;
          ctx.rect(dX[i] - sz * 0.5, dY[i] - sz * 0.5, sz * 1.25, sz);
        }
        ctx.fill();
      }
      // the birds proper. A whole digit flips ink together, so it never averages
      // out to the tone of the sky; a free bird takes the ink that reads where it
      // is, and in flight it is drawn a shade lighter (the ribbon is the farther
      // flock), so where it crosses a numeral the figure still reads through it.
      for (let i = 0; i < N; i++) {
        if (md[i] === 0) bk[i] = slotInk[sl[i]];
        else if (md[i] === 1 && perched[i - NG]) bk[i] = 4;
        else {
          let ci = (px[i] * (SC / W)) | 0;
          let cj = (py[i] * (SR / H)) | 0;
          if (ci < 0) ci = 0; else if (ci >= SC) ci = SC - 1;
          if (cj < 0) cj = 0; else if (cj >= SR) cj = SR - 1;
          bk[i] = (skyLum[cj * SC + ci] < birdFlip ? 1 : 0) + 2;
        }
      }
      for (let r = 0; r < 6; r++) {
        const run = runs[r];
        const z = run.z;
        const wd = WIDTH[z];
        const inks = fading ? 9 : run.free ? 4 : 2;
        for (let ink = 0; ink < inks; ink++) {
          if (ink === 4 || (!run.free && ink > 1 && ink < 4)) continue;
          ctx.globalAlpha = runAlpha[r] * (ink > 1 && ink < 4 ? FLY_ALPHA : 1);
          ctx.fillStyle = ink > 4 ? slotCol[ink - 5] : ink & 1 ? pale : INK_DAY;
          ctx.beginPath();
          for (let o = run.from; o < run.to; o++) {
            const i = drawOrder[o];
            if (bk[i] !== ink) continue;
            // seen from far off and side-on: a wingspan that beats between a V
            // and a ^, thickest at the body
            const hs = half[i];
            const f = fsin(t * flap * (1 + 0.3 * bankS[i]) + ph[i] * 3) * beat;
            const sq = 1 - 0.14 * f * f;
            const bc = bankC[i], bs = bankS[i];
            const sx = bc * hs * sq, sy = bs * hs * sq;
            const ux = bs * hs, uy = -bc * hs;
            const ox = -bs * wd, oy = bc * wd;
            const x = px[i], y = py[i];
            if (z === 2) {
              const wl = 0.26 + 0.36 * f, tl = 0.62 * f - 0.04;
              const ax = x - sx + ux * tl, ay = y - sy + uy * tl;
              const bx = x - sx * 0.46 + ux * wl, by = y - sy * 0.46 + uy * wl;
              const cx = x - ux * 0.06, cy = y - uy * 0.06;
              const dx = x + sx * 0.46 + ux * wl, dy = y + sy * 0.46 + uy * wl;
              const ex = x + sx + ux * tl, ey = y + sy + uy * tl;
              ctx.moveTo(ax, ay);
              ctx.lineTo(bx, by);
              ctx.lineTo(cx, cy);
              ctx.lineTo(dx, dy);
              ctx.lineTo(ex, ey);
              ctx.lineTo(dx + ox, dy + oy);
              ctx.lineTo(cx + ox * 1.7, cy + oy * 1.7);
              ctx.lineTo(bx + ox, by + oy);
            } else {
              const tl = 0.1 + 0.6 * f;
              const bx = x - ux * 0.16 * f, by = y - uy * 0.16 * f;
              ctx.moveTo(x - sx + ux * tl, y - sy + uy * tl);
              ctx.lineTo(bx, by);
              ctx.lineTo(x + sx + ux * tl, y + sy + uy * tl);
              ctx.lineTo(bx + ox * 1.7, by + oy * 1.7);
            }
          }
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      // birds on the wires, facing into the wind: body, head and tail
      const d = -windSign;
      ctx.fillStyle = perchDark ? INK_DAY : pale;
      ctx.beginPath();
      for (let j = NF - NP; j < NF; j++) {
        if (!perched[j]) continue;
        const x = px[NG + j], y = py[NG + j];
        ctx.moveTo(x - d * 4.2, y - 4.4);
        ctx.lineTo(x + d * 0.4, y - 9.6);
        ctx.lineTo(x + d * 3.6, y - 6.2);
        ctx.lineTo(x + d * 1.2, y - 1.4);
        ctx.lineTo(x - d * 5.6, y + 3.4);
        ctx.lineTo(x - d * 6.4, y + 2.6);
        ctx.rect(x + d * 0.8 - 2.1, y - 12.3, 4.2, 4.2);
      }
      ctx.fill();

      // what is falling, through the flock
      const wx = s.weather;
      if (wx.intensity > 0.01 && wx.falling) {
        const wr = (wx.windDir * Math.PI) / 180;
        const ux = -fsin(wr) * wx.wind;
        if (wx.falling === "snow") {
          const n = Math.floor(110 + 420 * wx.intensity);
          const vxs = ux * 9;
          ctx.fillStyle = snowInk;
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const h1 = hash(i, 71), h2 = hash(i, 72), h3 = hash(i, 73);
            const fall = 70 + 90 * h3 + 40 * wx.intensity;
            const sw = 18 * fsin(t * (0.5 + h1) + h2 * 30);
            const drift_ = vxs * (0.7 + 0.6 * h3);
            let x = (h1 * (W + 240) + drift_ * t + sw) % (W + 240);
            if (x < 0) x += W + 240;
            const y = ((h2 * (H + 60) + fall * t) % (H + 60)) - 30;
            const r = i & 1 ? 4.6 : 3;
            ctx.rect(x - 120 - r * 0.5, y - r * 0.5, r, r);
          }
          ctx.fill();
        } else {
          const drizzle = wx.falling === "drizzle";
          const n = Math.floor((drizzle ? 50 : 40) + (drizzle ? 160 : 250) * wx.intensity);
          const fall = drizzle ? 760 : 1250;
          const vxr = ux * 13;
          const lenK = drizzle ? 0.022 : 0.036;
          const lw = drizzle ? 1.3 : 1.6;
          ctx.fillStyle = rainInk;
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const h1 = hash(i, 51), h2 = hash(i, 52), h3 = hash(i, 53);
            const vyr = fall * (0.8 + 0.4 * h3);
            let x = (h1 * (W + 400) + vxr * t * (0.9 + 0.2 * h3)) % (W + 400);
            if (x < 0) x += W + 400;
            const y = ((h2 * (H + 120) + vyr * t) % (H + 120)) - 60;
            const x0 = x - 200;
            const x1 = x0 + vxr * lenK, y1 = y + vyr * lenK;
            ctx.moveTo(x0, y);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x1 + lw, y1);
            ctx.lineTo(x0 + lw, y);
          }
          ctx.fill();
        }
      }
    }

    // ------------------------------------------------------ slow things
    function syncText(s, jumped) {
      const tx = s.text;
      let relayout = false;
      const tk = `${tx.hh}:${tx.mm}`;
      if (tk !== timeKey) {
        const first = timeKey === "" || jumped;
        timeKey = tk;
        setTime(tx.hh, tx.mm, first);
        for (let k = 0; k < 4; k++) drawGhost(k);
      }
      put("ampm", ampm, tx.ampm);
      if (put("date", tDate.tp, tx.date)) relayout = true;
      if (put("temp", tTemp.tp, tx.temp)) relayout = true;
      if (put("cond", tCond.tp, tx.condition)) relayout = true;
      if (put("sunL", sunLab, tx.sunLabel)) relayout = true;
      if (put("sunV", sunVal, tx.sunValue)) relayout = true;
      if (put("moon", tMoon.tp, tx.moon)) relayout = true;
      if (put("aqi", aqiVal, tx.aqi)) relayout = true;
      if (put("uv", uvVal, tx.uv)) relayout = true;
      const hasFact = tx.factValue !== "";
      if (put("factL", tFactLab.tp, hasFact ? tx.factLabel : "")) relayout = true;
      if (put("factV", fact, tx.factValue)) relayout = true;
      if (relayout && laidOut) layoutCaptions(hasFact);
    }

    function paintGround() {
      groundDirty = false;
      const c = ground.ctx;
      c.resetTransform();
      c.globalAlpha = 1;
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      c.drawImage(skyTiny, 0.5, 0.5, SC - 1, SR - 1, 0, 0, W, H);
      for (let k = 0; k < 4; k++) {
        const S = slots[k];
        const g = ghosts[k];
        if (S.ch < 0 || !g.on || g.op <= 0) continue;
        // lean with the numerals: x shifts by (pivot - y) * shear
        c.globalAlpha = g.op;
        c.setTransform(1, 0, -g.sh, 1, S.ox + g.sh * (S.pivot - S.oy), S.oy);
        c.drawImage(g.c, 0, 0, GC, GR, 0, 0, GWpx, GHpx);
      }
      c.resetTransform();
      c.globalAlpha = 0.05;
      c.fillStyle = grainFill;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
    function paintLift() {
      liftDirty = false;
      const c = lift.ctx;
      let any = false;
      for (let k = 0; k < 4; k++) if (slots[k].ch >= 0 && (ghosts[k].qL > 0 || ghosts[k].qD > 0 || ghosts[k].q2 > 0)) any = true;
      if (!any) {
        if (liftOn) {
          liftOn = false;
          lift.clear();
          lift.canvas.style.display = "none";
        }
        return;
      }
      if (!liftOn) {
        liftOn = true;
        lift.canvas.style.display = "";
      }
      lift.clear();
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      const PWpx = (GC + 2 * PM) * CELL;
      const PHpx = (GR + 2 * PM) * CELL;
      // the patches first, all of them, then the silhouettes over them
      for (let pass = 0; pass < 2; pass++) {
        for (let k = 0; k < 4; k++) {
          const S = slots[k];
          const g = ghosts[k];
          if (S.ch < 0) continue;
          c.setTransform(1, 0, -g.lsh, 1, S.ox + g.lsh * (S.pivot - S.oy), S.oy);
          if (pass === 0) {
            for (let side = 0; side < 2; side++) {
              const a = side ? g.qD : g.qL;
              if (a <= 0) continue;
              const col = side ? patchDark : patchLight;
              const key = `${S.ch}${col}`;
              const cv = side ? g.pD : g.pL;
              if ((side ? g.pDkey : g.pLkey) !== key) {
                const pc = side ? g.pDctx : g.pLctx;
                pc.globalCompositeOperation = "copy";
                pc.drawImage(patchSprites[S.ch], 0, 0);
                pc.globalCompositeOperation = "source-in";
                pc.fillStyle = col;
                pc.fillRect(0, 0, cv.width, cv.height);
                if (side) g.pDkey = key;
                else g.pLkey = key;
              }
              c.globalAlpha = a;
              c.drawImage(cv, 0, 0, cv.width, cv.height, -PM * CELL, -PM * CELL, PWpx, PHpx);
            }
          } else if (g.q2 > 0 && g.on) {
            c.globalAlpha = g.q2;
            c.drawImage(g.c, 0, 0, GC, GR, 0, 0, GWpx, GHpx);
          }
        }
      }
      c.resetTransform();
      c.globalAlpha = 1;
    }
    const swayShown = [NaN, NaN, NaN];
    function syncLayers(s, dt) {
      // ghosts lean with the numerals
      const wx = s.weather;
      const night = 1 - s.daylight;
      // (in coarse steps, so the ground is repainted only now and then)
      const qs = Math.round(baseShear * 250) / 250;
      // near the flip (only in twilight: full day and full night keep their look)
      const aim = twilight;
      // the lift works through twilight and night, and by day under any cloud
      // (a clear full day keeps its look)
      const veiled = smoothstep(0.02, 0.1, cloudCover);
      const liftAim = Math.max(twilight, veiled);
      // and under a veiled night sky it would rather deepen the cloud behind a
      // pale figure than brighten the figure (a clear night keeps its look)
      const nightPref = veiled * (1 - smoothstep(0.1, 0.3, s.daylight));
      const gl = glowAmt * (0.2 + 0.12 * s.daylight) * 0.9; // the glow's opacity, as drawn below
      for (let k = 0; k < 4; k++) {
        const S = slots[k];
        const g = ghosts[k];
        if (S.ch < 0) continue;
        // a change of ink is a short fade
        if (S.inkT !== S.light) {
          S.inkT = inkSnap ? S.light : S.light > S.inkT ? Math.min(S.light, S.inkT + dt / INK_FADE) : Math.max(S.light, S.inkT - dt / INK_FADE);
          drawGhost(k);
        }
        // strong enough that the figure reads on its own, even where birds
        // peel away or the ribbon crosses it; thicker near the ink switch,
        // where neither ink has much to push against
        // (the figure is birds over the silhouette, the silhouette blended over
        // the sky in sRGB: find the silhouette tone the aim asks for, then its opacity)
        let opNeed = 0;
        if (aim > 0) {
          const Lg = S.light === 0 ? g.lo : g.hi; // the worst of the sky behind it
          const Li = S.light === 0 ? L_DAY : paleLum;
          const want = S.light === 0 ? (Lg + 0.05) / GHOST_AIM - 0.05 : GHOST_AIM * (Lg + 0.05) - 0.05;
          const Vg = srgb(clamp((want - BIRD_COVER * Li) / (1 - BIRD_COVER)));
          const Vs = srgb(Lg);
          const Vi = srgb(Li);
          const span = (Vi - Vs) * (1 - g.veil);
          opNeed = clamp((Vg - Vs) / (Math.abs(span) < 0.02 ? (Vi > Vs ? 0.02 : -0.02) : span), 0, 0.94) * aim;
        }
        const op = Math.round(Math.max(lerp(0.68, 0.46, S.inkT), opNeed) * (1 - 0.45 * S.rel) * 40) / 40;
        if (op !== g.op || qs !== g.sh || S.ox !== g.x) {
          g.op = op;
          g.sh = qs;
          g.x = S.ox;
          groundDirty = true;
        }
        // then make sure the figure really holds against the worst of the
        // ground behind it, cloud included; if the silhouette under the veil
        // cannot, lift it clear of the veil, and if no silhouette can, change
        // the ground: a soft patch of thinner or denser cloud behind it
        let tL = 0;
        let tD = 0;
        let t2 = 0;
        if (liftAim > 0) {
          const dk = S.light === 0;
          const Li = dk ? L_DAY : paleLum;
          const Vc = lerp(srgb(L_DAY), srgb(paleLum), S.inkT);
          const Lr = dk ? g.rLo : g.rHi;
          // the digits of a line are set close: a patch would reach under its
          // neighbour, so where the neighbour has the other ink there is none
          // (and the silhouette alone holds the figure)
          const nb = slots[k ^ 1];
          const patchOk = nb.ch < 0 || nb.light === S.light;
          liftNeed(dk, Lr, g.aMin, op, Vc, Li, dk ? 0 : nightPref, gl, patchOk);
          let a = liftA;
          let o = liftO;
          if (g.aMax !== g.aMin) {
            liftNeed(dk, Lr, g.aMax, op, Vc, Li, dk ? 0 : nightPref, gl, patchOk);
            a = Math.max(a, liftA);
            o = Math.max(o, liftO);
          }
          if (dk) tL = a * liftAim;
          else tD = a * liftAim;
          t2 = o * liftAim * (1 - 0.45 * S.rel);
        }
        const step_ = dt / LIFT_FADE;
        const toward = (v, t) => (inkSnap ? t : t > v ? Math.min(t, v + step_) : Math.max(t, v - step_));
        g.aL = toward(g.aL, tL);
        g.aD = toward(g.aD, tD);
        g.o2 = toward(g.o2, t2);
        const qL = Math.round(g.aL * 50) / 50;
        const qD = Math.round(g.aD * 50) / 50;
        const q2 = Math.round(g.o2 * 50) / 50;
        if (qL !== g.qL || qD !== g.qD || q2 !== g.q2 || ((qL > 0 || qD > 0 || q2 > 0) && (qs !== g.lsh || S.ox !== g.lx))) {
          g.qL = qL;
          g.qD = qD;
          g.q2 = q2;
          g.lsh = qs;
          g.lx = S.ox;
          liftDirty = true;
        }
      }
      inkSnap = false;
      if (groundDirty) {
        paintGround();
        liftDirty = true; // the silhouettes may have changed ink
      }
      if (liftDirty) paintLift();
      if (shown.ampmTf !== qs) {
        shown.ampmTf = qs;
        ampmBox.style.transform = `skewX(${((-Math.atan(qs) * 180) / Math.PI).toFixed(2)}deg)`;
      }
      // clouds drift with the wind
      const ux = -Math.sin((wx.windDir * Math.PI) / 180);
      cloudX = (((cloudX - ux * (3 + wx.wind * 1.1) * dt) % 2160) + 2160) % 2160;
      const cx10 = Math.round(cloudX * 10);
      if (shown.cloudX !== cx10) {
        shown.cloudX = cx10;
        cloud.style.transform = `translate(${-cx10 / 10}px, 0)`;
      }
      if (cloudRow < CH) buildCloudRows(8);
      if (cloudRow >= CH && cloudKey !== cloudTint) {
        cloudKey = cloudTint;
        cloudCtx.globalCompositeOperation = "copy";
        cloudCtx.drawImage(cloudMask, 0, 0);
        cloudCtx.globalCompositeOperation = "source-in";
        cloudCtx.fillStyle = cloudTint;
        cloudCtx.fillRect(0, 0, CW, CH);
      }
      const cop = cloudRow < CH ? 0 : +(clamp(wx.cloud / 100) * (0.5 - 0.2 * night) + 0.25 * fog).toFixed(3);
      if (shown.cop !== cop) {
        shown.cop = cop;
        cloud.style.opacity = cop;
        cloud.style.display = cop < 0.03 ? "none" : "";
      }
      const gop = +(glowAmt * (0.2 + 0.12 * s.daylight)).toFixed(3);
      if (shown.gop !== gop) {
        shown.gop = gop;
        glow.style.opacity = gop;
        glow.style.display = gop > 0 ? "" : "none";
      }
      for (let w = 0; w < 3; w++) {
        const y = Math.round(sway[w] * 10);
        if (swayShown[w] !== y) {
          swayShown[w] = y;
          bands[w].style.transform = `translate3d(0, ${y / 10}px, 0)`;
        }
      }
      const rime = wx.falling === "snow" ? +(0.35 + 0.5 * wx.intensity).toFixed(2) : 0;
      if (shown.rime !== rime) {
        shown.rime = rime;
        for (const r of rimes) r.setAttribute("opacity", rime);
      }
      const fy = Math.round(sway[2] * 6);
      if (shown.fy !== fy) {
        shown.fy = fy;
        fact.style.transform = `translate3d(0, ${fy / 10}px, 0)`;
      }
    }

    let lastMs = state.ms;
    // A staged start, so that no single step freezes the screen for long: mount
    // only builds the scene; the first frames build the fields of the digits on
    // show (hours, then minutes), then place the flock and paint the sky, then
    // measure and place the captions and draw. The runner gives the piece many
    // unseen frames before it is cut to, so the first frame seen is finished.
    // The flock starts in full flight: that first drawn frame places every bird
    // at its home (`snap`), and the unseen frames let the streamers develop.
    let laidOut = false;
    let setup = 0;

    return {
      frame(s) {
        if (setup < 3) {
          const tx = s.text;
          if (setup === 0) for (const c of tx.hh) field(+c);
          else if (setup === 1) for (const c of tx.mm) field(+c);
          else {
            syncText(s, false);
            syncLook(s);
          }
          setup++;
          lastMs = s.ms;
          return;
        }
        // the clock jumped (a time-lapse, a laptop waking): go straight to the new state
        const jumped = Math.abs(s.ms - lastMs) > 5000;
        lastMs = s.ms;
        if (jumped) {
          snap = true;
          inkSnap = true;
          for (let k = 0; k < 4; k++) slots[k].rel = 0;
        }
        syncText(s, jumped);
        if (!laidOut) {
          laidOut = true;
          layoutCaptions(s.text.factValue !== "");
        }
        syncLook(s);
        step(s, s.dt, s.t);
        syncLayers(s, s.dt);
        draw(s, s.t);
      },
    };
  },
};

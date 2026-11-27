// Die-Cut
//
// A heavy sheet of cotton paper with the time punched clean through it in
// stencil numerals. Behind the sheet hangs a paper-cut waterfront, lit from
// behind by the sky as the tower camera measures it: paper clouds on threads
// behind the hours; the skyline, the Queensboro Bridge, the river and the Long
// Island City gantries behind the minutes. The readouts are letterpressed into
// the strip between the rows and into the print's lower margin.
//
// How the conditions drive it:
//   sky colors      the whole palette behind the sheet (west on the left, north-west on the right)
//   daylight        the sheet turns from cotton white to indigo-black; the scene behind is kept
//                   darker than the sheet by day and lighter by night, so the numerals always read;
//                   windows, bridge lamps and pier lamps come on as the light goes
//   cloud cover     how many paper clouds hang on their threads, then full-width cloud sheets
//   wind            slides the clouds and the fog (speed and direction), leans rain and snow,
//                   swings the threads, flies the pennants
//   rain            hanging threads carrying paper dashes; the front sheet cockles with damp
//   snow            paper confetti; it banks up on the lower edges of the cut numerals
//   cold            paper icicles hang from the upper edges of the cuts
//   visibility/fog  each paper layer fades into the fog toward its base, the far city first;
//                   in thick fog sheets of vellum drift through the hours, a pale sun hangs
//                   behind them and the lamps bloom
//   air quality     a warm haze over the far layers
//   storm           dark cloud sheets and a slow glow behind them
//   temperature     the paper's tint (cool white to warm ivory); UV lengthens the paper sun's rays
//   tide            lifts the paper water and sets which way it slides
// On the minute the changed numeral closes behind two hinged paper flaps and
// the new one folds open.
//
// How it is drawn: every paper layer is baked into its own bitmap when its
// colors change (one bitmap per frame at most, unless the clock jumps), and
// each frame only composites those bitmaps with small parallax offsets and
// draws the few things that really move (threads, rain, snow, train, ferry).
// The front sheet is its own canvas, repainted only when the time or the
// light changes.

import {
  W, H, TAU, clamp, lerp, smoothstep, norm, lerpAngle, ease, rng, hash, createNoise,
  mix, oklch, toOklch, rgba, el, addStyle, canvas2d, mask, fitText,
} from "../lib/kit.js";

const MX = 64; // side margin for type
const TOP = 70; // top of the hour numerals
const HD = 612; // height of a numeral
const STRIP = 128; // the letterpress strip between the rows (the date has clear air above and below)
const R1 = TOP;
const R1B = R1 + HD;
const R2 = R1B + STRIP;
const R2B = R2 + HD;
const GAP = 30; // between two numerals
const WATER = R2B - 96; // the waterline of the paper river
const SCENE_H = R2B + 24;
const DFONT = '"Stardos Stencil", "Rockwell", serif';
const AMPM_CAP = 60;
const PAD = 24; // spare width on the layer bitmaps, for the sway

const roundRect = (p, x, y, w, h, r) => {
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.arc(x + w - r, y + r, r, -TAU / 4, 0);
  p.lineTo(x + w, y + h - r);
  p.arc(x + w - r, y + h - r, r, 0, TAU / 4);
  p.lineTo(x + r, y + h);
  p.arc(x + r, y + h - r, r, TAU / 4, TAU / 2);
  p.lineTo(x, y + r);
  p.arc(x + r, y + r, r, TAU / 2, (TAU * 3) / 4);
  p.closePath();
};

const offscreen = (w, h) => {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return c;
};

export default {
  title: "Die-Cut",
  description: "The time punched through a sheet of heavy paper; behind it, a paper-cut waterfront backlit by the measured sky.",
  fonts: ["Stardos Stencil:wght@400;700", "Cormorant Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600"],
  fps: 20,

  mount(root, { seed }) {
    const r = rng(seed);
    const noise = createNoise(seed);

    addStyle(root, `
      .dc { position: absolute; inset: 0; overflow: hidden; background: #0b0d1c; font-family: "Cormorant Garamond", Georgia, serif;
            --ink: #1b1e36; --hl: rgba(255,255,255,.7); --sheet: #f3efe6; color: var(--ink); font-variant-numeric: lining-nums; }
      .dc .blob { position: absolute; left: 0; top: 0; width: 1300px; height: 900px; border-radius: 50%; will-change: transform, opacity;
                  background: radial-gradient(closest-side, rgba(22,26,60,.2), rgba(22,26,60,.12) 45%, rgba(22,26,60,0) 100%); }
      .dc .flap { position: absolute; background: var(--sheet); display: none; will-change: transform; }
      .dc .flap.t { transform-origin: 50% 0; box-shadow: 0 3px 5px rgba(5,8,30,.28); }
      .dc .flap.b { transform-origin: 50% 100%; box-shadow: 0 -2px 4px rgba(5,8,30,.2); }
      .dc .flap i { position: absolute; inset: 0; background: #070a20; opacity: 0; }
      .dc .txt { position: absolute; inset: 0; text-shadow: 0 1.2px 0 var(--hl); }
      .dc .strip { position: absolute; left: ${MX}px; top: ${R1B}px; width: ${W - 2 * MX}px; height: ${STRIP}px; display: flex; align-items: center; }
      .dc .date { font-size: 52px; font-weight: 700; letter-spacing: .01em; white-space: nowrap; line-height: 1; padding-bottom: 6px; }
      .dc .rule { flex: 1; height: 2px; background: currentColor; opacity: .55; margin: 0 30px; box-shadow: 0 1.2px 0 var(--hl); }
      .dc .ampmgap { flex: none; }
      .dc .foot { position: absolute; left: ${MX}px; width: ${W - 2 * MX}px; top: ${R2B + 58}px; height: ${H - 64 - R2B - 58}px;
                  display: flex; flex-direction: column; justify-content: space-between; }
      .dc .title { display: flex; align-items: baseline; white-space: nowrap; }
      .dc .temp { font-family: ${DFONT}; font-weight: 700; font-size: 120px; line-height: .84; letter-spacing: -.01em; }
      .dc .cond { font-style: italic; font-weight: 600; font-size: 60px; line-height: 1; margin-left: 24px; }
      .dc .sp { flex: 1; }
      .dc .lab { font-weight: 700; font-size: 27px; letter-spacing: .16em; text-transform: uppercase; }
      .dc .val { font-weight: 700; font-size: 46px; line-height: 1; }
      .dc .ed .val { margin-left: 12px; }
      .dc .ed .dot { margin: 0 16px; font-weight: 700; font-size: 34px; }
      .dc .line2 { display: flex; align-items: baseline; justify-content: space-between; white-space: nowrap; }
      .dc .line2 .val { margin-left: 14px; }
      .dc .line2 .moon { font-style: italic; font-weight: 600; }
      .dc .fact .lab { display: block; margin-bottom: 6px; }
      .dc .fact .fv { font-style: italic; font-weight: 600; font-size: 42px; line-height: 1.2; max-height: 2.4em; overflow: hidden; }
      .dc.nofact .foot { justify-content: center; gap: 64px; }
      .dc.nofact .temp { font-size: 150px; }
      .dc.nofact .cond { font-size: 64px; }
      .dc.nofact .fact { display: none; }
    `);

    const wrap = el("div", { class: "dc" });
    root.append(wrap);

    // ---------------------------------------------------------------- surfaces
    const scene = canvas2d(wrap, { adaptive: true, alpha: false }); // composited from the layer bitmaps every frame
    const sheet = canvas2d(wrap, { maxScale: 2 }); // the front sheet with the cuts: repainted when the time or the light changes
    const ctx = scene.ctx;
    const sc = sheet.ctx;

    const mcan = offscreen(W, H); // the sheet's silhouette (white, with the cuts open)
    const mctx = mcan.getContext("2d");
    const shcan = offscreen(W / 2, H / 2); // its soft shadow, cast into the cuts
    const shctx = shcan.getContext("2d");
    const glcan = offscreen(W / 2, H / 2); // a warm inner glow for the cut edges at night
    const glctx = glcan.getContext("2d");
    const q1 = offscreen(W / 4, H / 4), q2 = offscreen(W / 8, H / 8); // for softening: shrink, then enlarge
    const q1x = q1.getContext("2d"), q2x = q2.getContext("2d");
    for (const c of [shctx, glctx, q1x, q2x]) c.imageSmoothingQuality = "high";

    // ---------------------------------------------------------------- numerals
    mctx.font = `700 1000px ${DFONT}`;
    let maxAsc = 0, maxDesc = 0, maxInk = 0;
    const inkMid = {}, inkW = {}, inkAsc = {};
    for (const ch of "0123456789") {
      const m = mctx.measureText(ch);
      inkW[ch] = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      inkAsc[ch] = m.actualBoundingBoxAscent;
      maxAsc = Math.max(maxAsc, m.actualBoundingBoxAscent);
      maxDesc = Math.max(maxDesc, m.actualBoundingBoxDescent);
      maxInk = Math.max(maxInk, m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
      inkMid[ch] = (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
    }
    const FS = (HD / (maxAsc + maxDesc)) * 1000;
    const K = FS / 1000;
    const SX = Math.min(1, (W - 2 * MX - GAP) / (2 * maxInk * K)); // every numeral is condensed alike so two fit the sheet
    const CELL = maxInk * K * SX;
    const DIGIT_FONT = `700 ${FS.toFixed(1)}px ${DFONT}`;
    const BASE_DROP = maxDesc * K;
    mctx.font = `700 100px ${DFONT}`;
    const FSA = (AMPM_CAP / mctx.measureText("M").actualBoundingBoxAscent) * 100;
    const AMPM_FONT = `700 ${FSA.toFixed(1)}px ${DFONT}`;
    mctx.font = AMPM_FONT;
    const AMPM_W = Math.max(mctx.measureText("AM").width, mctx.measureText("PM").width) * 0.94;
    const AMPM_BASE = R1B + STRIP / 2 + AMPM_CAP / 2;

    // The five places a numeral can sit: a lone hour, two hours, two minutes.
    const SLOTS = [
      { cx: W / 2, y: R1 },
      { cx: W / 2 - (CELL + GAP) / 2, y: R1 },
      { cx: W / 2 + (CELL + GAP) / 2, y: R1 },
      { cx: W / 2 - (CELL + GAP) / 2, y: R2 },
      { cx: W / 2 + (CELL + GAP) / 2, y: R2 },
    ];
    const slotChars = (hh, mm, out) => {
      out[0] = hh.length === 1 ? hh : "";
      out[1] = hh.length === 2 ? hh[0] : "";
      out[2] = hh.length === 2 ? hh[1] : "";
      out[3] = mm[0];
      out[4] = mm[1];
      return out;
    };
    const cur = ["", "", "", "", ""]; // what is cut into the sheet now
    const other = ["", "", "", "", ""]; // the next or previous minute, for the flaps
    let curAmpm = "";

    const drawGlyphs = (c) => {
      c.font = DIGIT_FONT;
      c.textAlign = "left";
      c.textBaseline = "alphabetic";
      for (let i = 0; i < 5; i++) {
        const ch = cur[i];
        if (!ch) continue;
        c.save();
        c.translate(SLOTS[i].cx, SLOTS[i].y + HD - BASE_DROP);
        c.scale(SX, 1);
        c.fillText(ch, -(inkMid[ch] ?? 0) * K, 0);
        c.restore();
      }
      c.font = AMPM_FONT;
      c.textAlign = "right";
      c.save();
      c.translate(W - MX, AMPM_BASE);
      c.scale(0.94, 1);
      c.fillText(curAmpm, 0, 0);
      c.restore();
    };

    // ---------------------------------------------------------------- paper
    // A tile of paper tooth: specks and short fibres, light and dark in equal measure.
    const tile = offscreen(512, 512);
    {
      const t = tile.getContext("2d");
      const pr = rng(seed + 11);
      const img = t.createImageData(512, 512);
      const px = img.data;
      for (let i = 0; i < 4200; i++) {
        const light = pr() > 0.5;
        const a = light ? 0.05 + pr() * 0.1 : 0.04 + pr() * 0.08;
        const s = 1 + Math.floor(pr() * 2.2);
        const x0 = Math.floor(pr() * 512), y0 = Math.floor(pr() * 512);
        for (let yy = 0; yy < s; yy++) {
          for (let xx = 0; xx < s; xx++) {
            const k = ((((y0 + yy) & 511) << 9) + ((x0 + xx) & 511)) << 2;
            px[k] = light ? 255 : 20;
            px[k + 1] = light ? 255 : 22;
            px[k + 2] = light ? 255 : 50;
            px[k + 3] = a * 255;
          }
        }
      }
      t.putImageData(img, 0, 0);
      t.lineWidth = 1;
      for (let i = 0; i < 260; i++) {
        const x = pr() * 512, y = pr() * 512, a = pr() * TAU, l = 6 + pr() * 22;
        t.strokeStyle = pr() > 0.5 ? `rgba(255,255,255,${(0.06 + pr() * 0.1).toFixed(3)})` : `rgba(30,30,60,${(0.04 + pr() * 0.07).toFixed(3)})`;
        t.beginPath();
        t.moveTo(x, y);
        t.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + pr() * 4, y + Math.sin(a) * l * 0.5 + pr() * 4, x + Math.cos(a) * l, y + Math.sin(a) * l);
        t.stroke();
      }
    }
    const tooth = sc.createPattern(tile, "repeat");
    tooth.setTransform(new DOMMatrix().scale(0.5));
    const lightGrad = sc.createLinearGradient(0, 0, W, H);
    lightGrad.addColorStop(0, "rgba(255,255,255,0.06)");
    lightGrad.addColorStop(0.5, "rgba(255,255,255,0)");
    lightGrad.addColorStop(1, "rgba(10,12,40,0.07)");

    // A fine dither for the sky bitmaps, so their gradients do not band on the panel.
    const dither = offscreen(128, 128);
    {
      const c = dither.getContext("2d");
      const img = c.createImageData(128, 128);
      const dr = rng(seed + 5);
      for (let i = 0; i < img.data.length; i += 4) {
        const light = dr() > 0.5;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 255 : 0;
        img.data[i + 3] = 4 + dr() * 10;
      }
      c.putImageData(img, 0, 0);
    }

    // Damp cockling: a relief of soft vertical ripples, pressed into the sheet as much as it is wet.
    // Made the first time the sheet is wet.
    let cockle = null;
    const makeCockle = () => {
      cockle = offscreen(150, 266);
      const c = cockle.getContext("2d");
      const CW = 150, CH = 266, f = 270 / CW;
      const img = c.createImageData(CW, CH);
      const hgt = (x, y) => {
        const xw = x + 9 * noise.n2(x * 0.011, y * 0.006) + 3 * noise.n2(x * 0.05 + 9, y * 0.012);
        return Math.sin(xw * 0.19 + 2.2 * noise.n2(xw * 0.02, y * 0.003 + 4));
      };
      for (let yy = 0; yy < CH; yy++) {
        const y = yy * f;
        for (let xx = 0; xx < CW; xx++) {
          const x = xx * f;
          const slope = hgt(x + 0.7, y) - hgt(x - 0.7, y);
          const patch = smoothstep(-0.35, 0.5, noise.n2(x * 0.008 + 30, y * 0.005)) * (0.45 + 0.55 * (y / 480));
          const v = clamp(slope * 4.2) * patch;
          const u = clamp(-slope * 4.2) * patch;
          const i = (yy * CW + xx) * 4;
          if (v > u) {
            img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
            img.data[i + 3] = v * 110;
          } else {
            img.data[i] = 16; img.data[i + 1] = 20; img.data[i + 2] = 52;
            img.data[i + 3] = u * 62;
          }
        }
      }
      c.putImageData(img, 0, 0);
    };

    // Cloud shadows that cross the front sheet.
    const blobs = [];
    for (let i = 0; i < 3; i++) {
      const node = el("div", { class: "blob" });
      wrap.append(node);
      blobs.push({ node, x0: r.range(0, 2600), y: r.range(-200, 1300), k: r.range(0.8, 1.25), sx: r.range(0.8, 1.2), sy: r.range(0.7, 1.1) });
    }
    let blobOpacity = -1;

    // Flaps: two per slot, hinged at the top and bottom of the cell.
    const flaps = SLOTS.map((s) => {
      const x = s.cx - CELL / 2 - 12;
      const w = CELL + 24;
      const top = el("div", { class: "flap t", style: { left: `${x}px`, top: `${s.y - 10}px`, width: `${w}px`, height: `${HD / 2 + 11}px` } }, el("i"));
      const bot = el("div", { class: "flap b", style: { left: `${x}px`, top: `${s.y + HD / 2}px`, width: `${w}px`, height: `${HD / 2 + 11}px` } }, el("i"));
      wrap.append(top, bot);
      return { top, bot, shown: -1 };
    });

    // ---------------------------------------------------------------- type
    const T = {};
    const txt = el("div", { class: "txt" },
      el("div", { class: "strip" },
        (T.date = el("div", { class: "date" })),
        el("div", { class: "rule" }),
        el("div", { class: "ampmgap", style: { width: `${Math.ceil(AMPM_W)}px` } }),
      ),
      el("div", { class: "foot" },
        el("div", { class: "title" },
          (T.temp = el("span", { class: "temp" })),
          (T.cond = el("span", { class: "cond" })),
          el("span", { class: "sp" }),
          (T.ed = el("span", { class: "ed" },
            el("span", { class: "lab", text: "Air" }), (T.aqi = el("span", { class: "val" })),
            el("span", { class: "dot", text: "·" }),
            el("span", { class: "lab", text: "UV" }), (T.uv = el("span", { class: "val" })),
          )),
        ),
        el("div", { class: "line2" },
          el("span", {}, (T.sunLabel = el("span", { class: "lab" })), (T.sunValue = el("span", { class: "val" }))),
          el("span", {}, el("span", { class: "lab", text: "Moon" }), (T.moon = el("span", { class: "val moon" }))),
        ),
        el("div", { class: "fact" },
          (T.factLabel = el("span", { class: "lab" })),
          (T.factValue = el("div", { class: "fv" })),
        ),
      ),
    );
    wrap.append(txt);

    const shown = {};
    const put = (key, node, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };

    // ---------------------------------------------------------------- the diorama's parts
    // Clouds: flat-bottomed paper cut-outs on two threads each.
    const cloudShape = (w) => {
      const p = new Path2D();
      const h = w * 0.34;
      const bh = h * 0.44;
      roundRect(p, -w / 2, -bh, w, bh, bh / 2);
      const n = 3 + Math.floor(w / 150);
      let top = bh;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const rad = h * (0.26 + 0.36 * Math.sin(Math.PI * u)) * r.range(0.85, 1.15);
        const cx = -w / 2 + w * (0.14 + 0.72 * u);
        const cy = -bh * 0.75 - rad * 0.3;
        p.moveTo(cx + rad, cy);
        p.arc(cx, cy, rad, 0, TAU);
        top = Math.max(top, rad - cy);
      }
      return { p, top };
    };
    const NCLOUD = 11;
    const clouds = [];
    const order = r.shuffle([...Array(NCLOUD).keys()]);
    for (let i = 0; i < NCLOUD; i++) {
      const depth = i % 3; // 0 far .. 2 near
      const w = r.range(250, 420) * (0.8 + depth * 0.22);
      const shape = cloudShape(w);
      const low = i % 4 === 3; // hangs low, behind the skyline
      const c = {
        ...shape, w, depth, order: order[i], low,
        x0: (i / NCLOUD) * (W + 900) + r.range(-80, 80),
        y: low ? r.range(R2 + 90, R2 + 250) : r.range(R1 + 170, R1B - 40),
        speed: 0.55 + depth * 0.3 + r.range(-0.06, 0.06),
        ph: r.range(0, TAU), sf: r.range(0.35, 0.6), sx: 0, sy: 0,
      };
      // its bitmap: the paper and its drop shadow
      c.ox = w / 2 + 16;
      c.oy = shape.top + 10;
      c.can = offscreen(w + 32 + 12, shape.top + 10 + 24);
      clouds.push(c);
    }
    clouds.sort((a, b) => a.depth - b.depth);

    // Cloud sheets: full-width paper borders with a scalloped lower edge, lowered in as the sky closes.
    // Only the scalloped band is a bitmap; above it the sheet is a plain fill.
    const VLEN = 1680;
    const VTOP = 200, VBOT = 112;
    const valances = [0, 1, 2].map((i) => {
      const p = new Path2D();
      p.rect(-20, -VTOP, VLEN + 40, VTOP);
      let x = 0;
      while (x < VLEN - 60) {
        const rad = Math.min(r.range(70, 140), (VLEN - x) / 2 + 30);
        p.moveTo(x + rad * 2, -rad * 0.35);
        p.arc(x + rad, -rad * 0.35, rad, 0, TAU);
        x += rad * r.range(1.2, 1.55);
      }
      return { p, y: [R1 + 520, R1 + 380, R1 + 235][i], x0: r.range(0, VLEN), speed: 0.5 + i * 0.3, can: offscreen(VLEN + 46, VTOP + VBOT) };
    });

    // The skyline: two sheets of towers, with pin-pricked windows (sorted by when they light).
    const sortWins = (a) => {
      const n = a.length / 3;
      const idx = [...Array(n).keys()].sort((p, q) => a[p * 3 + 2] - a[q * 3 + 2]);
      const out = new Float32Array(a.length);
      idx.forEach((j, i) => {
        out[i * 3] = a[j * 3];
        out[i * 3 + 1] = a[j * 3 + 1];
        out[i * 3 + 2] = a[j * 3 + 2];
      });
      return out;
    };
    const buildSkyline = (far) => {
      const p = new Path2D();
      const wins = [];
      let top = WATER;
      const body = (x, t, w, h, prob) => {
        p.rect(x, t, w, h);
        top = Math.min(top, t);
        const gx = far ? 9 : 11, gy = far ? 12 : 14;
        for (let wy = t + 10; wy < Math.min(t + h, WATER - 12); wy += gy) {
          for (let wx = x + 5; wx < x + w - 6; wx += gx) if (r.chance(prob)) wins.push(wx, wy, r());
        }
      };
      const base = WATER + 40;
      let x = -50;
      const marks = far ? [[r.range(200, 330), 0], [r.range(520, 620), 1], [r.range(800, 900), 2]] : [[r.range(380, 520), 3]];
      while (x < W + 50) {
        const mk = marks.find((m) => m[0] >= x && m[0] < x + 70);
        if (mk) {
          const kind = mk[1];
          if (kind === 0) {
            // a stepped tower with a mast
            const w = 96, h = 556;
            const t = WATER - h;
            body(x, t + 150, w, base - t - 150, 0.3);
            body(x + 12, t + 80, w - 24, 72, 0.3);
            body(x + 26, t + 44, w - 52, 38, 0.2);
            p.rect(x + w / 2 - 7, t + 22, 14, 24);
            p.rect(x + w / 2 - 2, t - 30, 4, 54);
            x += w + r.range(2, 8);
          } else if (kind === 1) {
            // a tapered crown and needle
            const w = 74, h = 492;
            const t = WATER - h;
            body(x, t + 110, w, base - t - 110, 0.3);
            p.moveTo(x, t + 112);
            p.quadraticCurveTo(x + w * 0.2, t + 50, x + w / 2 - 2, t - 34);
            p.lineTo(x + w / 2 + 2, t - 34);
            p.quadraticCurveTo(x + w * 0.8, t + 50, x + w, t + 112);
            p.closePath();
            x += w + r.range(2, 8);
          } else if (kind === 2) {
            // a very thin, very tall tower
            const w = 32, h = 540;
            body(x, WATER - h, w, base - WATER + h, 0.35);
            x += w + r.range(4, 10);
          } else {
            // a broad slab by the water
            const w = 150, h = 300;
            body(x, WATER - h, w, base - WATER + h, 0.42);
            x += w + r.range(4, 10);
          }
          mk[0] = -999;
          continue;
        }
        const w = far ? r.range(36, 80) : r.range(60, 130);
        const h = far ? r.range(220, 430) : r.range(100, 270);
        const t = WATER - h;
        const kind = r();
        if (kind < 0.3 && w > 50) {
          const inset = w * r.range(0.14, 0.24);
          body(x, t + h * 0.28, w, base - t - h * 0.28, 0.3);
          body(x + inset, t, w - inset * 2, h * 0.28 + 2, 0.3);
          if (r.chance(0.4)) p.rect(x + w / 2 - 2, t - 30, 4, 32);
        } else if (kind < 0.42) {
          body(x, t + 26, w, base - t - 26, 0.3);
          p.moveTo(x, t + 27);
          p.lineTo(x + w, t - 14);
          p.lineTo(x + w, t + 27);
          p.closePath();
        } else {
          body(x, t, w, base - t, 0.3);
          if (!far && r.chance(0.55)) {
            // a rooftop water tank
            const tx = x + r.range(10, w - 34);
            p.rect(tx + 2, t - 10, 3, 10);
            p.rect(tx + 19, t - 10, 3, 10);
            p.rect(tx, t - 30, 24, 21);
            p.moveTo(tx - 2, t - 30);
            p.lineTo(tx + 12, t - 42);
            p.lineTo(tx + 26, t - 30);
            p.closePath();
          }
        }
        x += w + (r.chance(0.2) ? r.range(6, 18) : r.range(-4, 3));
      }
      return { p, wins: sortWins(wins), top: top - 46 };
    };
    const far = buildSkyline(true);
    const mid = buildSkyline(false);

    // The bridge: a cantilever truss in elevation, towers with finials, masonry piers.
    const DECK = WATER - 140;
    const bridge = { fill: new Path2D(), line: new Path2D(), fine: new Path2D(), lamps: [], top: 0 };
    {
      const shift = r.range(-50, 50);
      const tw = [120 + shift, 452 + shift, 628 + shift, 960 + shift];
      const TH = 186;
      bridge.top = DECK - TH - 40;
      const chord = (x) => {
        if (x <= tw[0]) return lerp(TH, 26, clamp((tw[0] - x) / 230));
        if (x >= tw[3]) return lerp(TH, 26, clamp((x - tw[3]) / 230));
        for (let i = 0; i < 3; i++) {
          if (x <= tw[i + 1]) {
            const u = (x - tw[i]) / (tw[i + 1] - tw[i]);
            const low = i === 1 ? 128 : 58;
            return lerp(TH, low, Math.pow(Math.sin(Math.PI * u), 0.8));
          }
        }
        return TH;
      };
      const f = bridge.fill, l = bridge.line, fi = bridge.fine;
      f.rect(-80, DECK, W + 160, 8);
      f.rect(-80, DECK + 27, W + 160, 6);
      for (const tx of tw) {
        f.moveTo(tx - 15, DECK + 33);
        f.lineTo(tx + 15, DECK + 33);
        f.lineTo(tx + 21, WATER + 30);
        f.lineTo(tx - 21, WATER + 30);
        f.closePath();
        f.rect(tx - 5, DECK - TH - 4, 10, TH + 6);
        f.rect(tx - 1.5, DECK - TH - 34, 3, 32);
        f.moveTo(tx + 5, DECK - TH - 12);
        f.arc(tx, DECK - TH - 12, 5, 0, TAU);
      }
      const STEP = 33;
      const px = -66;
      let flip = false;
      l.moveTo(px, DECK - chord(px));
      for (let x = px; x <= W + 80; x += STEP) {
        const h = chord(x);
        l.lineTo(x, DECK - h);
        bridge.lamps.push(x, DECK - h - 3);
      }
      for (let x = px; x <= W + 80; x += STEP) {
        const h = chord(x), h2 = chord(x + STEP);
        fi.moveTo(x, DECK);
        fi.lineTo(x, DECK - h);
        if (flip) {
          fi.moveTo(x, DECK);
          fi.lineTo(x + STEP, DECK - h2);
        } else {
          fi.moveTo(x, DECK - h);
          fi.lineTo(x + STEP, DECK);
        }
        flip = !flip;
        fi.moveTo(x, DECK + 8);
        fi.lineTo(x + STEP / 2, DECK + 27);
        fi.lineTo(x + STEP, DECK + 8);
      }
      // a lamp on every other deck panel too
      for (let x = px + STEP / 2; x <= W + 80; x += STEP * 2) bridge.lamps.push(x, DECK + 4);
      bridge.lamps = new Float32Array(bridge.lamps);
    }

    // The river: three scalloped paper strips, each a bitmap that slides one scallop at a time.
    const strips = [0, 1, 2].map((i) => {
      const p = new Path2D();
      const per = [64, 82, 104][i];
      const amp = [7, 9, 11][i];
      p.moveTo(-per * 2, 150);
      p.lineTo(-per * 2, 0);
      for (let x = -per * 2; x < W + per * 2; x += per) p.quadraticCurveTo(x + per / 2, -amp * 2, x + per, 0);
      p.lineTo(W + per * 2, 150);
      p.closePath();
      return { p, per, amp, y: WATER + [0, 28, 58][i], speed: [9, 15, 24][i], ph: r.range(0, 100), can: offscreen(W + per * 4, 150 + amp * 2 + 2) };
    });

    // A ferry on a rod.
    const ferry = new Path2D();
    ferry.moveTo(-44, -12);
    ferry.lineTo(44, -12);
    ferry.lineTo(34, 4);
    ferry.lineTo(-36, 4);
    ferry.closePath();
    ferry.rect(-26, -24, 46, 12);
    ferry.rect(-8, -33, 18, 9);
    ferry.rect(8, -42, 5, 10);

    // The near shore: a pier, the gantries and a row of lamp posts.
    const near = { fill: new Path2D(), line: new Path2D(), lamps: [] };
    const gantries = r.chance(0.5) ? [[204, 0.6], [862, 0.5]] : [[850, 0.6], [236, 0.5]];
    const PIER = R2B - 30;
    const NEAR_TOP = PIER - 250;
    {
      const f = near.fill, l = near.line;
      f.rect(-60, PIER, W + 120, 80);
      for (let x = -30; x < W + 40; x += 46) f.rect(x, PIER - 12, 9, 14);
      for (const [gx, k] of gantries) {
        const hh = 296 * k, half = 118 * k, beam = 54 * k, post = 8 * k, legW = 34 * k;
        const topY = PIER - hh;
        // legs: two braced posts each side
        for (const side of [-1, 1]) {
          const x0 = gx + side * (half - legW / 2) - legW / 2;
          f.rect(x0, topY + beam, post, hh - beam);
          f.rect(x0 + legW - post, topY + beam, post, hh - beam);
          const n = Math.round((hh - beam) / (38 * k));
          for (let i = 0; i < n; i++) {
            const y0 = topY + beam + ((hh - beam) / n) * i, y1 = topY + beam + ((hh - beam) / n) * (i + 1);
            l.moveTo(x0 + post / 2, y0);
            l.lineTo(x0 + legW - post / 2, y1);
            l.moveTo(x0 + legW - post / 2, y0);
            l.lineTo(x0 + post / 2, y1);
          }
        }
        // the beam with its shallow roof, and the hanging apron
        f.rect(gx - half - 26 * k, topY, half * 2 + 52 * k, beam);
        f.moveTo(gx - half - 26 * k, topY);
        f.lineTo(gx, topY - 22 * k);
        f.lineTo(gx + half + 26 * k, topY);
        f.closePath();
        f.rect(gx - 44 * k, topY + beam + 26 * k, 88 * k, 12 * k);
        l.moveTo(gx - 40 * k, topY + beam);
        l.lineTo(gx - 40 * k, topY + beam + 26 * k);
        l.moveTo(gx + 40 * k, topY + beam);
        l.lineTo(gx + 40 * k, topY + beam + 26 * k);
        l.moveTo(gx - half + legW, topY + beam + 70 * k);
        l.lineTo(gx - half + legW + 60 * k, topY + beam);
        l.moveTo(gx + half - legW, topY + beam + 70 * k);
        l.lineTo(gx + half - legW - 60 * k, topY + beam);
        f.rect(gx - 1.5, topY - 22 * k - 30, 3, 30); // pennant staff
      }
      // lamp posts along the pier, clear of the gantries
      for (let x = 60; x < W; x += 138) {
        if (gantries.some(([gx, k]) => Math.abs(x - gx) < 150 * k + 20)) continue;
        f.rect(x - 2, PIER - 74, 4, 74);
        f.rect(x - 9, PIER - 80, 18, 6);
        near.lamps.push(x, PIER - 70);
      }
      near.lamps = new Float32Array(near.lamps);
    }

    // Glows, drawn from small bitmaps: the storm behind the clouds, a lamp's bloom, the sun in fog.
    const radial = (size, stops, into) => {
      const c = into || offscreen(size, size);
      const x = c.getContext("2d");
      x.clearRect(0, 0, size, size);
      const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      for (const [o, col] of stops) g.addColorStop(o, col);
      x.fillStyle = g;
      x.fillRect(0, 0, size, size);
      return c;
    };
    const stormGlow = radial(160, [[0, "rgba(246,238,255,0.9)"], [0.35, "rgba(226,214,255,0.4)"], [1, "rgba(220,210,255,0)"]]);
    const bloom = radial(96, [[0, "rgba(255,226,170,0.85)"], [0.25, "rgba(255,214,150,0.4)"], [1, "rgba(255,210,140,0)"]]);
    const haloC = offscreen(192, 192); // the sun's glow in fog, in the palette's own warm (painted with the vellum)

    // Stars: pin-pricks in the sky sheet.
    const NSTAR = 150;
    const stars = new Float32Array(NSTAR * 3);
    for (let i = 0; i < NSTAR; i++) stars.set([r.range(0, W), r.range(0, R2 + 380), r()], i * 3);

    // Rain: threads, each carrying a few paper dashes that slide down it.
    const NR = 150;
    const rain = new Float32Array(NR * 4); // x at top, phase, speed, dash length
    for (let i = 0; i < NR; i++) rain.set([r.range(-420, W + 420), r(), r.range(0.75, 1.3), r.range(16, 30)], i * 4);
    const rainOrder = new Float32Array(NR);
    for (let i = 0; i < NR; i++) rainOrder[i] = r();

    // Snow: paper confetti.
    const NS = 720;
    const snow = new Float32Array(NS * 5); // x, y, size, phase, fall factor
    for (let i = 0; i < NS; i++) snow.set([r.range(0, W), r.range(0, SCENE_H), r.range(5, 11), r.range(0, TAU), r.range(0.7, 1.3)], i * 5);

    // Vellum: tracing paper with a cut, wavy edge, slid between the layers in fog. Only the
    // wavy band is a bitmap (kept small); below it the sheet is a plain translucent fill.
    const VW = 1280;
    const XF = 10;
    const vellums = [
      { top: R1 + 110, bot: R1B + 12, speed: 0.35, amp: 26 },
      { top: R1 + 300, bot: R1B + 12, speed: 0.6, amp: 22 },
      { top: R1 + 480, bot: R1B + 12, speed: 0.9, amp: 18 },
      { top: WATER - 210, bot: WATER + 40, speed: 1.1, amp: 20 },
    ].map((v, i) => {
      const hb = v.amp * 2 + 8; // the band: the edge's full swing (then XF px where it hands over to the plain fill)
      const p = new Path2D(), edge = new Path2D();
      const k1 = 2 + i, k2 = 5 + 2 * i, p1 = r.range(0, TAU), p2 = r.range(0, TAU);
      p.moveTo(-8, hb + XF + 2);
      for (let x = -8; x <= VW + 8; x += 8) {
        const y = v.amp + 4 + v.amp * (0.65 * Math.sin((x / VW) * TAU * k1 + p1) + 0.35 * Math.sin((x / VW) * TAU * k2 + p2));
        p.lineTo(x, y);
        if (x === -8) edge.moveTo(x, y);
        else edge.lineTo(x, y);
      }
      p.lineTo(VW + 8, hb + XF + 2);
      p.closePath();
      return { ...v, p, edge, hb, x0: r.range(0, VW), can: offscreen(VW, hb + XF) };
    });
    const VEL_A = [0.3, 0.38, 0.46, 0.45];
    // The plain part below a sheet's edge does not move, so for the sheets in the hours it is
    // baked into the sky bitmap (solid = true there); only the wavy edge slides each frame.
    const drawVellum = (v, alpha, solid) => {
      const y = Math.round(v.top - v.amp - 4);
      if (solid) {
        // fades in under the band's fading foot, then plain
        const g = solid.createLinearGradient(0, y + v.hb, 0, y + v.hb + XF);
        g.addColorStop(0, rgba(P.vellum, 0));
        g.addColorStop(1, rgba(P.vellum, alpha));
        solid.fillStyle = g;
        solid.fillRect(0, y + v.hb, W, XF);
        solid.globalAlpha = alpha;
        solid.fillStyle = P.vellum;
        solid.fillRect(0, y + v.hb + XF, W, v.bot - y - v.hb - XF);
        solid.globalAlpha = 1;
        return;
      }
      const off = Math.round(-wrapX(v.x0 - drift * v.speed, VW) * 2) / 2;
      ctx.globalAlpha = alpha;
      ctx.drawImage(v.can, off, y);
      ctx.drawImage(v.can, off + VW, y);
      if (v.fade) {
        ctx.fillStyle = v.fade;
        ctx.fillRect(0, y + v.hb, W, XF);
        ctx.fillStyle = P.vellum;
        ctx.fillRect(0, y + v.hb + XF, W, v.bot - y - v.hb - XF);
      }
      ctx.globalAlpha = 1;
    };

    // ---------------------------------------------------------------- snow banks and icicles on the cuts
    let snowPath = null, icePath = null, ledgeKey = "", cutMask = null;
    let discPlaced = false, discSnap = true;
    const readCuts = () => {
      if (cutMask) return;
      cutMask = mask(540, 960, (c) => {
        c.scale(0.5, 0.5);
        drawGlyphs(c);
      });
    };
    // Where the paper sun or moon hangs: wherever the hour numerals show most of it.
    const discHome = r.range(0, 1000);
    let discX = W / 2, discY = R1 + 240, discTX = W / 2, discTY = R1 + 240;
    const placeDisc = () => {
      readCuts();
      discPlaced = true;
      const open = (x, y) => (x < 0 || x >= W || y < 0 || y >= H ? 0 : cutMask.data[(y >> 1) * 540 + (x >> 1)] > 128 ? 1 : 0);
      let best = -1;
      for (let y = R1 + 110; y <= R1B - 150; y += 26) {
        for (let x = 130; x <= W - 130; x += 26) {
          let score = 0;
          for (let a = 0; a < 8; a++) {
            const ca = Math.cos((a * TAU) / 8), sa = Math.sin((a * TAU) / 8);
            score += open(Math.round(x + ca * 62), Math.round(y + sa * 62)) + open(Math.round(x + ca * 100), Math.round(y + sa * 100)) * 0.5;
          }
          score += open(x, y) * 2 + hash(x + discHome, y) * 2.5 - (y - R1) * 0.004;
          if (score > best) {
            best = score;
            discTX = x;
            discTY = y;
          }
        }
      }
    };
    const buildLedges = (depth, cold) => {
      snowPath = depth > 0 ? new Path2D() : null;
      icePath = cold > 0 ? new Path2D() : null;
      if (!snowPath && !icePath) return;
      readCuts();
      const C = 540, S = 2;
      const m = cutMask;
      const open = (x, y) => m.data[y * C + x] > 128;
      const y0 = Math.floor(R1 / S) - 2, y1 = Math.ceil(R2B / S) + 2;
      const s0 = (R1B + 4) / S, s1 = (R2 - 4) / S; // the strip between the rows stays clean
      // Walk each kind of edge (floors hold snow, ceilings grow ice) left to right, joining neighbours into runs.
      const runs = (floor) => {
        const out = [];
        let active = [];
        for (let x = 20; x < C - 20; x++) {
          const next = [];
          for (let y = y0; y < y1; y++) {
            const here = floor ? open(x, y) && !open(x, y + 1) : open(x, y) && !open(x, y - 1);
            if (!here || (y > s0 && y < s1)) continue;
            let room = 0;
            while (room < 60 && open(x, floor ? y - room : y + room)) room++;
            let run = active.find((a) => Math.abs(a.y - y) <= 2 && !a.used);
            if (!run) {
              run = { pts: [] };
              out.push(run);
            }
            run.y = y;
            run.used = true;
            run.pts.push(x * S, (floor ? y + 1 : y) * S, room * S);
            next.push(run);
          }
          for (const a of next) a.used = false;
          active = next;
        }
        return out;
      };
      if (snowPath) {
        for (const run of runs(true)) {
          const n = run.pts.length / 3;
          if (n < 5) continue;
          snowPath.moveTo(run.pts[0], run.pts[1] + 1);
          for (let i = 0; i < n; i++) {
            const x = run.pts[i * 3], y = run.pts[i * 3 + 1], room = run.pts[i * 3 + 2];
            const taper = Math.pow(Math.sin((Math.PI * (i + 0.5)) / n), 0.6);
            const hgt = Math.min(room * 0.55, depth * taper * (0.8 + 0.25 * noise.n2(x * 0.011, y * 0.01)));
            snowPath.lineTo(x, y - hgt);
          }
          for (let i = n - 1; i >= 0; i--) snowPath.lineTo(run.pts[i * 3] + S, run.pts[i * 3 + 1] + 2);
          snowPath.closePath();
        }
      }
      if (icePath) {
        for (const run of runs(false)) {
          const n = run.pts.length / 3;
          let i = 2 + Math.floor(hash(run.pts[0], run.pts[1]) * 4);
          while (i < n - 2) {
            const x = run.pts[i * 3], y = run.pts[i * 3 + 1], room = run.pts[i * 3 + 2];
            const h1 = hash(x, y + 7);
            const len = Math.min(room * 0.5, (10 + 44 * h1 * h1) * cold);
            const wd = 3 + len * 0.13;
            if (len > 5) {
              icePath.moveTo(x - wd, y - 2);
              icePath.lineTo(x + wd, y - 2);
              icePath.lineTo(x + (h1 - 0.5) * 2, y + len);
              icePath.closePath();
            }
            i += 4 + Math.floor(hash(x + 3, y) * 7);
          }
        }
      }
    };

    // ---------------------------------------------------------------- palette
    const P = {
      n: 0, sheet: "#f3efe6", ink: "#1b1e36", hl: "", skyTop: "", skyMid: "", skyHor: "", skyW: "", skyN: "",
      cloud: ["", "", ""], cloudLow: ["", "", ""], val: ["", "", ""], far: "", mid: "", bridge: "", near: "", river: ["", "", ""],
      thread: "", window: "", winC: ["", "", "", ""], sun: "", moon: "", moonDark: "", rain: "", bit: "", fog: "", snow: "", ice: "",
      vellum: "", ghost: "", hazeC: "", haze: 0, shadow: "", trainC: "", ferryC: "", pennantC: "",
      fogK: 0, fogTop: [0, 0, 0, 0], fogBot: [0, 0, 0, 0], riverFog: 0, lampA: 0, lit: 0, starA: 0, vellumA: 0,
      rimA: 0, glowA: 0, shadowA: 0, wet: 0, dull: 0, damp: 0, paintKey: "",
    };
    const NIGHT_SHEET = oklch(0.125, 0.036, 272);
    const FLOOR = Math.cbrt(3.3 * (0.125 ** 3 + 0.05) - 0.05); // the darkest the scene may be behind the night sheet
    const hueOf = (k, fallback) => (k.c < 0.012 ? fallback : k.h);
    // fog over each city layer, at its top and at the waterline (far, mid, bridge, near)
    const FOG_TOP = [0.8, 0.6, 0.42, 0.08];
    const FOG_BOT = [0.97, 0.92, 0.84, 0.45];
    const q2s = (v) => Math.round(v * 50); // a coarse step, for bitmap keys

    const computePalette = (s) => {
      const w = s.weather, d = s.daylight;
      const n = 1 - smoothstep(0.15, 0.28, d);
      const day = 1 - n;
      const wet = w.falling && w.falling !== "snow" ? 1 : 0;
      const dull = clamp(clamp((w.cloud - 50) / 50) * 0.55 + (w.falling ? 0.3 : 0) + (w.kind === "storm" ? 0.25 : 0));
      const warm = norm(w.temp, 24, 94);
      const low = 1 - smoothstep(0.28, 0.8, d);
      const km = toOklch(s.sky.mean), kw = toOklch(s.sky.west), kn = toOklch(s.sky.northWest);
      const hm = hueOf(km, 255);

      // the sheet
      const dayL = 0.957 - 0.026 * dull - 0.04 * low;
      let daySheet = mix(oklch(dayL, 0.011, 245), oklch(dayL, 0.034, 86), warm);
      daySheet = mix(daySheet, oklch(dayL, Math.min(km.c, 0.06), hm), 0.1);
      // a low sun on a clear day warms the paper
      const gold = (1 - smoothstep(2, 16, s.sun.alt)) * (s.sun.alt > -3 ? 1 : 0) * (1 - dull) * (1 - clamp(w.cloud / 90));
      daySheet = mix(daySheet, oklch(dayL - 0.01, 0.05, 66), gold * 0.55);
      P.n = n;
      P.sheet = mix(daySheet, NIGHT_SHEET, n);
      const lit = toOklch(P.sheet).l > 0.56;
      P.ink = lit ? "#1a1c33" : "#e6dfcf";
      P.hl = lit ? "rgba(255,255,255,.75)" : "rgba(0,0,0,.6)";

      // how light the scene may be behind the day sheet, for 3:1 and a little more
      const cap = Math.cbrt((dayL ** 3 + 0.05) / 3.3 - 0.05);
      const bright = clamp((km.l - 0.36) / 0.36);
      const v = clamp(Math.log2(1 + w.visibility) / Math.log2(11)) * (w.fog ? 0.6 : 1);
      const vS = 0.4 + 0.6 * v; // the step between layers never quite collapses: fog does the washing out
      const sky = (k, dL, nL, cK = 1) => {
        const h = hueOf(k, 255);
        const dc = oklch(cap + dL, clamp(k.c * 1.35 * cK, 0.014, 0.17), h);
        const nc = oklch(FLOOR + nL, clamp((k.c * 2 + 0.05) * cK, 0.05, 0.16), lerpAngle(h, 264, 0.45));
        return mix(dc, nc, n);
      };
      const dTop = -0.17 - 0.07 * (1 - bright), dHor = -0.015 - 0.09 * (1 - bright);
      P.skyTop = sky(km, dTop, 0.012);
      P.skyMid = sky(km, lerp(dTop, dHor, 0.55), 0.06);
      P.skyHor = sky(km, dHor, 0.15, 0.9);
      P.skyW = sky(kw, lerp(dTop, dHor, 0.6), 0.08, 1.1);
      P.skyN = sky(kn, lerp(dTop, dHor, 0.6), 0.08, 1.1);

      // nearer sheets step darker; how big the step is depends on how far you can see
      const layer = (stepD, stepN, cK, hShift) => {
        const dc = oklch(Math.max(0.17, cap + dHor - stepD * vS), clamp(km.c * 1.25 * cK, 0.012, 0.15), lerpAngle(hm, 272, hShift));
        const nc = oklch(Math.max(FLOOR + 0.002, FLOOR + 0.15 - stepN * vS), clamp((km.c * 2 + 0.05) * cK, 0.05, 0.15), lerpAngle(hm, 266, 0.5));
        return mix(dc, nc, n);
      };
      P.far = layer(0.1, 0.05, 0.95, 0.15);
      P.mid = layer(0.2, 0.09, 0.9, 0.25);
      P.bridge = layer(0.3, 0.125, 0.85, 0.35);
      P.near = layer(0.4, 0.148, 0.75, 0.45);
      const riv = [layer(0.13, 0.06, 1, 0.1), layer(0.18, 0.085, 1, 0.15), layer(0.24, 0.11, 0.95, 0.2)];

      // fog, and the haze of a bad-air or very hot day: the far layers fade toward the horizon's color
      const fogK = clamp(1 - v);
      const haze = clamp((w.aqi - 55) / 130) * 0.55 + clamp((w.temp - 86) / 12) * 0.2;
      P.fogK = Math.max(fogK, haze * 0.75);
      P.hazeC = oklch(cap + 0.01, 0.09, 72);
      P.haze = Math.round(clamp(haze) * day * (1 - fogK) * 20) / 20;
      P.fog = mix(P.skyHor, P.hazeC, clamp(haze * 1.4) * day * (1 - fogK));
      for (let k = 0; k < 4; k++) {
        P.fogTop[k] = FOG_TOP[k] * P.fogK;
        P.fogBot[k] = FOG_BOT[k] * P.fogK;
      }
      P.riverFog = 0.62 * fogK;
      for (let i = 0; i < 3; i++) P.river[i] = mix(riv[i], P.fog, P.riverFog * (1 - i * 0.12));
      P.vellumA = Math.round(smoothstep(0.55, 0.88, fogK) * 50) / 50;
      P.ghost = oklch(cap + 0.02, 0.022, 85);
      P.vellum = mix(oklch(cap + 0.005, Math.min(0.03, km.c), hm), oklch(FLOOR + 0.2, 0.04, 262), n);

      // clouds: pale on a fair day, slate when it is closing in
      for (let i = 0; i < 3; i++) {
        const fairD = oklch(cap + 0.012 - 0.03 * (2 - i), clamp(km.c * 0.35, 0.008, 0.05), hm);
        const dullD = oklch(cap - 0.2 - 0.05 * i, clamp(km.c * 0.8, 0.012, 0.06), lerpAngle(hm, 270, 0.3));
        const fairN = oklch(FLOOR + 0.12 - 0.03 * (2 - i), 0.05, 272);
        const dullN = oklch(FLOOR + 0.015 + 0.02 * (2 - i), 0.03, 280);
        P.cloud[i] = mix(mix(fairD, dullD, dull), mix(fairN, dullN, dull), n);
        P.cloudLow[i] = mix(P.cloud[i], P.fog, P.fogTop[0]);
        const vD = oklch(cap - 0.045 - 0.075 * i - 0.1 * dull, clamp(km.c * 0.7, 0.012, 0.06), lerpAngle(hm, 268, 0.25));
        const vN = oklch(FLOOR + 0.095 - 0.04 * i - 0.01 * dull, 0.04, 276);
        P.val[i] = mix(vD, vN, n);
      }
      P.thread = mix(oklch(cap - 0.34, 0.03, hm), oklch(FLOOR + 0.3, 0.03, 260), n);
      P.shadow = n > 0.5 ? "rgba(6,8,32,0.12)" : "rgba(10,14,48,0.2)";
      P.window = mix("#ffe2ae", "#ffd492", n);
      for (let k = 0; k < 4; k++) P.winC[k] = mix(P.window, P.fog, (P.fogTop[k] + P.fogBot[k]) * 0.5);
      P.trainC = mix(P.near, P.fog, P.fogTop[2] * 0.6 + P.fogBot[2] * 0.4);
      P.ferryC = mix(P.near, P.fog, P.riverFog * 0.7);
      P.pennantC = mix(P.near, P.fog, P.fogTop[3]);
      P.sun = oklch(cap + 0.15, 0.13, 82);
      P.moon = "#f1ead6";
      P.moonDark = oklch(FLOOR + 0.07, 0.05, 268);
      P.rain = mix(oklch(0.9, 0.02, 235), oklch(0.86, 0.035, 240), n);
      P.bit = mix("#fbfcff", oklch(0.9, 0.02, 250), n);
      P.snow = mix("#ffffff", oklch(0.86, 0.03, 250), n);
      P.ice = mix(oklch(0.985, 0.012, 230), oklch(0.82, 0.05, 235), n);

      // lights: windows, lamps, stars
      P.lit = Math.round(clamp(n * 0.62 + dull * 0.06 * day + (1 - smoothstep(0.28, 0.6, d)) * 0.1 + fogK * 0.08 * day) * 100) / 100;
      P.lampA = Math.round(clamp(Math.max(n, (1 - smoothstep(0.3, 0.75, d)) * Math.max(fogK, dull * 0.6))) * 20) / 20;
      P.starA = Math.round(n * (1 - smoothstep(25, 75, w.cloud)) * (1 - fogK) * 20) / 20;

      // the cut edges: a pale paper edge and a cast shadow by day, a warm rim at night
      const cross = 1 - Math.abs(n - 0.5) * 2;
      P.rimA = lerp(0.9, 0.0, n);
      P.glowA = n * 0.6;
      P.shadowA = lerp(0.5, 0.2, n) + 0.3 * cross;
      P.wet = wet;
      P.dull = dull;
      P.cap = cap;
      P.damp = Math.round((wet ? clamp(0.3 + w.intensity * 0.6) : 0) * lerp(1, 0.3, n) * 10) / 10;
      P.paintKey = `${P.sheet}${Math.round(P.rimA * 16)}${Math.round(P.shadowA * 16)}${P.damp}`;

      // what each bitmap depends on
      const fk = q2s(P.fogK);
      job.sky.want = `${P.skyTop}${P.skyMid}${P.skyHor}${P.skyW}${P.skyN}${P.fog}${fk}${P.vellum}${q2s(P.vellumA)}${P.haze}`;
      job.clouds.want = `${P.cloud.join("")}${P.cloudLow.join("")}${P.val.join("")}${P.shadow}`;
      job.far.want = `${P.far}${P.window}${P.fog}${fk}${P.lit}${P.shadow}`;
      job.mid.want = `${P.mid}${P.window}${P.fog}${fk}${P.lit}${P.shadow}`;
      job.bridge.want = `${P.bridge}${P.window}${P.fog}${fk}${P.lampA}`;
      job.river.want = P.river.join("");
      job.near.want = `${P.near}${P.window}${P.skyHor}${P.fog}${fk}${P.lampA}${P.lit > 0.3}`;
      job.vellum.want = P.vellumA > 0.01 ? `${P.vellum}${P.ghost}` : job.vellum.have;
    };

    // ---------------------------------------------------------------- the layer bitmaps
    const bmp = (h) => {
      const can = offscreen(W + 2 * PAD, h);
      return { can, x: can.getContext("2d") };
    };
    const SKS = 1; // full resolution, so the per-frame copy into the cuts is a plain 1:1 blit
    const skyB = (() => {
      const can = offscreen(W * SKS, SCENE_H * SKS);
      return { can, x: can.getContext("2d", { alpha: false }) };
    })();
    const farB = bmp(WATER + 50 - far.top);
    const midB = bmp(WATER + 50 - mid.top);
    const bridgeB = bmp(WATER + 40 - bridge.top);
    const nearB = bmp(PIER + 82 - NEAR_TOP);
    // The far and mid skylines, the vellum between them and the bridge are composited into one
    // bitmap, rebuilt only when one of their (whole-pixel) offsets or the window twinkle changes.
    const CITY_TOP = Math.min(far.top, mid.top, bridge.top);
    const cityB = (() => {
      const can = offscreen(W, WATER + 50 - CITY_TOP);
      return { can, x: can.getContext("2d"), key: "", ver: 0 };
    })();
    const ditherPat = skyB.x.createPattern(dither, "repeat");

    // fade a layer into the fog toward its base (only over what is already drawn)
    const fogOver = (x, top, k) => {
      if (P.fogTop[k] < 0.01) return;
      x.globalCompositeOperation = "source-atop";
      const g = x.createLinearGradient(0, top, 0, WATER + 10);
      g.addColorStop(0, rgba(P.fog, P.fogTop[k]));
      g.addColorStop(1, rgba(P.fog, P.fogBot[k]));
      x.fillStyle = g;
      x.fillRect(-PAD, top - 60, W + 2 * PAD, WATER + 200 - top);
      x.globalCompositeOperation = "source-over";
    };
    const litIndex = (wins, th) => {
      // how many windows light before `th` (they are sorted)
      let lo = 0, hi = wins.length / 3;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (wins[m * 3 + 2] < th) lo = m + 1;
        else hi = m;
      }
      return lo;
    };
    const drawWins = (x, wins, i0, i1) => {
      x.beginPath();
      for (let i = i0; i < i1; i++) x.rect(wins[i * 3], wins[i * 3 + 1], 3.2, 4.2);
      x.fill();
    };
    const bakeCity = (b, sk, color, k) => {
      const x = b.x;
      x.setTransform(1, 0, 0, 1, PAD, -sk.top);
      x.clearRect(-PAD, sk.top, W + 2 * PAD, b.can.height);
      x.translate(4 + k, 5 + k);
      x.fillStyle = P.shadow;
      x.fill(sk.p);
      x.translate(-4 - k, -5 - k);
      x.fillStyle = color;
      x.fill(sk.p);
      if (P.lit > 0.06) {
        x.fillStyle = P.window;
        drawWins(x, sk.wins, 0, litIndex(sk.wins, P.lit - 0.05));
      }
      fogOver(x, sk.top + 40, k);
    };
    const lampBlooms = (x, lamps, size, a) => {
      if (a < 0.02) return;
      x.globalAlpha = a;
      for (let i = 0; i < lamps.length; i += 2) x.drawImage(bloom, lamps[i] - size / 2, lamps[i + 1] - size / 2, size, size);
      x.fillStyle = P.window;
      x.beginPath();
      for (let i = 0; i < lamps.length; i += 2) {
        x.moveTo(lamps[i] + 2.6, lamps[i + 1]);
        x.arc(lamps[i], lamps[i + 1], 2.6, 0, TAU);
      }
      x.fill();
      x.globalAlpha = 1;
    };

    const job = {
      sky: { have: "", want: "", bake() {
        const x = skyB.x;
        x.setTransform(SKS, 0, 0, SKS, 0, 0);
        const g = x.createLinearGradient(0, 0, 0, WATER);
        g.addColorStop(0, P.skyTop);
        g.addColorStop(R1B / WATER, P.skyMid);
        g.addColorStop((R2 + 150) / WATER, P.skyHor);
        g.addColorStop(1, P.skyHor);
        x.fillStyle = g;
        x.fillRect(0, 0, W, SCENE_H);
        const tint = x.createLinearGradient(0, 0, W, 0);
        tint.addColorStop(0, rgba(P.skyW, 0.75));
        tint.addColorStop(0.42, rgba(P.skyW, 0));
        tint.addColorStop(0.58, rgba(P.skyN, 0));
        tint.addColorStop(1, rgba(P.skyN, 0.75));
        x.fillStyle = tint;
        x.fillRect(0, 0, W, SCENE_H);
        if (P.fogK > 0.02) {
          // the sky behind the city thickens toward the water
          const f = x.createLinearGradient(0, R2, 0, WATER);
          f.addColorStop(0, rgba(P.fog, P.fogK * 0.5));
          f.addColorStop(1, rgba(P.fog, P.fogK * 0.95));
          x.fillStyle = f;
          x.fillRect(0, R2 - 10, W, SCENE_H - R2 + 10);
          x.fillStyle = rgba(P.fog, P.fogK * 0.35);
          x.fillRect(0, 0, W, R2);
        }
        if (P.haze > 0.02) {
          // a hot, bad-air day: the sky bleaches toward a warm haze low down
          const hz = x.createLinearGradient(0, 0, 0, R1B);
          hz.addColorStop(0, rgba(P.hazeC, 0));
          hz.addColorStop(0.6, rgba(P.hazeC, P.haze * 0.22));
          hz.addColorStop(1, rgba(P.hazeC, P.haze * 0.5));
          x.fillStyle = hz;
          x.fillRect(0, 0, W, R1B);
          x.fillStyle = rgba(P.hazeC, P.haze * 0.5);
          x.fillRect(0, R1B, W, SCENE_H - R1B);
        }
        if (P.vellumA > 0.01) for (let i = 0; i < 3; i++) drawVellum(vellums[i], P.vellumA * VEL_A[i], x);
        x.fillStyle = ditherPat;
        x.fillRect(0, 0, W, SCENE_H);
      } },
      clouds: { have: "", want: "", bake() {
        for (const c of clouds) {
          const x = c.can.getContext("2d");
          x.setTransform(1, 0, 0, 1, 0, 0);
          x.clearRect(0, 0, c.can.width, c.can.height);
          x.setTransform(1, 0, 0, 1, c.ox, c.oy);
          x.translate(5 + c.depth * 2, 8 + c.depth * 3);
          x.fillStyle = P.shadow;
          x.fill(c.p);
          x.translate(-5 - c.depth * 2, -8 - c.depth * 3);
          x.fillStyle = c.low ? P.cloudLow[c.depth] : P.cloud[c.depth];
          x.fill(c.p);
        }
        valances.forEach((vl, i) => {
          const x = vl.can.getContext("2d");
          x.setTransform(1, 0, 0, 1, 0, 0);
          x.clearRect(0, 0, vl.can.width, vl.can.height);
          x.setTransform(1, 0, 0, 1, 20, VTOP);
          x.translate(5, 9);
          x.fillStyle = P.shadow;
          x.fill(vl.p);
          x.translate(-5, -9);
          x.fillStyle = P.val[i];
          x.fill(vl.p);
        });
      } },
      far: { have: "", want: "", bake: () => bakeCity(farB, far, P.far, 0) },
      mid: { have: "", want: "", bake: () => bakeCity(midB, mid, P.mid, 1) },
      bridge: { have: "", want: "", bake() {
        const x = bridgeB.x;
        x.setTransform(1, 0, 0, 1, PAD, -bridge.top);
        x.clearRect(-PAD, bridge.top, W + 2 * PAD, bridgeB.can.height);
        x.fillStyle = P.bridge;
        x.strokeStyle = P.bridge;
        x.fill(bridge.fill);
        x.lineWidth = 6;
        x.lineJoin = "round";
        x.stroke(bridge.line);
        x.lineWidth = 2.6;
        x.stroke(bridge.fine);
        fogOver(x, bridge.top + 30, 2);
        lampBlooms(x, bridge.lamps, 22 + 46 * P.fogK, P.lampA);
      } },
      river: { have: "", want: "", bake() {
        strips.forEach((st, i) => {
          const x = st.can.getContext("2d");
          x.setTransform(1, 0, 0, 1, 0, 0);
          x.clearRect(0, 0, st.can.width, st.can.height);
          x.setTransform(1, 0, 0, 1, st.per * 2, st.amp * 2 + 1);
          x.fillStyle = P.river[i];
          x.fill(st.p);
        });
      } },
      near: { have: "", want: "", bake() {
        const x = nearB.x;
        x.setTransform(1, 0, 0, 1, PAD, -NEAR_TOP);
        x.clearRect(-PAD, NEAR_TOP, W + 2 * PAD, nearB.can.height);
        x.fillStyle = P.near;
        x.strokeStyle = P.near;
        x.fill(near.fill);
        x.lineWidth = 3;
        x.stroke(near.line);
        // lettering cut out of the gantry beams
        x.textAlign = "center";
        x.textBaseline = "middle";
        x.fillStyle = P.lit > 0.3 ? P.window : P.skyHor;
        for (let g = 0; g < 2; g++) {
          const gx = gantries[g][0], k = gantries[g][1];
          x.font = `700 ${(31 * k).toFixed(1)}px ${DFONT}`;
          x.fillText("LONG ISLAND", gx, PIER - 296 * k + 29 * k, 236 * k);
        }
        fogOver(x, NEAR_TOP + 20, 3);
        lampBlooms(x, near.lamps, 30 + 56 * P.fogK, P.lampA);
      } },
      vellum: { have: "", want: "", bake() {
        for (const v of vellums) {
          const x = v.can.getContext("2d");
          x.setTransform(1, 0, 0, 1, 0, 0);
          x.clearRect(0, 0, VW, v.hb + XF);
          x.fillStyle = P.vellum;
          x.fill(v.p);
          // its foot fades out where the plain fill fades in
          const g = x.createLinearGradient(0, v.hb, 0, v.hb + XF);
          g.addColorStop(0, "rgba(0,0,0,0)");
          g.addColorStop(1, "rgba(0,0,0,1)");
          x.globalCompositeOperation = "destination-out";
          x.fillStyle = g;
          x.fillRect(0, v.hb, VW, XF);
          x.globalCompositeOperation = "source-over";
          // the cut edge catches a little light
          x.save();
          x.clip(v.p);
          x.strokeStyle = "rgba(255,255,255,0.5)";
          x.lineWidth = 3;
          x.stroke(v.edge);
          x.restore();
          if (v === vellums[0]) radial(192, [[0, rgba(P.ghost, 0.9)], [0.35, rgba(P.ghost, 0.45)], [1, rgba(P.ghost, 0)]], haloC);
          if (v.bot > R1B + 100) {
            // the sheet in front of the city is drawn whole each frame: its hand-over fade, made once here
            const y = Math.round(v.top - v.amp - 4);
            v.fade = ctx.createLinearGradient(0, y + v.hb, 0, y + v.hb + XF);
            v.fade.addColorStop(0, rgba(P.vellum, 0));
            v.fade.addColorStop(1, P.vellum);
          }
        }
      } },
    };
    const JOBS = Object.values(job);
    // Rebakes are spread out: at most one bitmap a frame, and each at most every few seconds
    // (colors drift slowly through twilight), unless the clock has jumped.
    const runJobs = (all, t) => {
      for (const j of JOBS) {
        if (j.have === j.want) continue;
        if (!all && t - (j.at ?? -99) < 4) continue;
        j.have = j.want;
        j.at = t;
        j.bake();
        cityB.ver++;
        if (!all) return true;
      }
      return false;
    };

    // ---------------------------------------------------------------- painting the sheet
    const rebuildCuts = () => {
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.globalCompositeOperation = "source-over";
      mctx.clearRect(0, 0, W, H);
      mctx.fillStyle = "#fff";
      mctx.fillRect(0, 0, W, H);
      mctx.globalCompositeOperation = "destination-out";
      mctx.fillStyle = "#000";
      drawGlyphs(mctx);
      // the shadow the sheet casts into its own cuts (from the upper left), and an even inner glow
      q1x.clearRect(0, 0, W / 4, H / 4);
      q1x.drawImage(mcan, 0, 0, W / 4, H / 4);
      q2x.clearRect(0, 0, W / 8, H / 8);
      q2x.drawImage(q1, 0, 0, W / 8, H / 8);
      shctx.globalCompositeOperation = "source-over";
      shctx.clearRect(0, 0, W / 2, H / 2);
      shctx.drawImage(q2, 2, 3, W / 2, H / 2);
      shctx.globalCompositeOperation = "source-in";
      shctx.fillStyle = "rgb(6,8,34)";
      shctx.fillRect(0, 0, W / 2, H / 2);
      glctx.globalCompositeOperation = "source-over";
      glctx.clearRect(0, 0, W / 2, H / 2);
      glctx.drawImage(q1, 0, 0, W / 2, H / 2);
      glctx.globalCompositeOperation = "source-in";
      glctx.fillStyle = "rgb(255,198,124)";
      glctx.fillRect(0, 0, W / 2, H / 2);
    };

    // Repaints the whole sheet, or (on an ordinary minute) only the cells whose numeral changed.
    const dirty = { full: true, x0: W, y0: H, x1: 0, y1: 0 };
    const markDirty = (x0, y0, x1, y1) => {
      dirty.x0 = Math.min(dirty.x0, x0);
      dirty.y0 = Math.min(dirty.y0, y0);
      dirty.x1 = Math.max(dirty.x1, x1);
      dirty.y1 = Math.max(dirty.y1, y1);
    };
    const paintSheet = () => {
      sc.save();
      if (!dirty.full && dirty.x1 > dirty.x0) {
        sc.beginPath();
        sc.rect(dirty.x0, dirty.y0, dirty.x1 - dirty.x0, dirty.y1 - dirty.y0);
        sc.clip();
      }
      dirty.full = false;
      dirty.x0 = W;
      dirty.y0 = H;
      dirty.x1 = dirty.y1 = 0;
      sc.globalCompositeOperation = "source-over";
      sc.globalAlpha = 1;
      sc.clearRect(0, 0, W, H);
      sc.fillStyle = P.sheet;
      sc.fillRect(0, 0, W, H);
      sc.globalAlpha = lerp(0.85, 0.5, P.n);
      sc.fillStyle = tooth;
      sc.fillRect(0, 0, W, H);
      sc.globalAlpha = lerp(1, 0.4, P.n);
      sc.fillStyle = lightGrad;
      sc.fillRect(0, 0, W, H);
      if (P.damp > 0) {
        if (!cockle) makeCockle();
        sc.globalAlpha = P.damp;
        sc.drawImage(cockle, 0, 0, W, H);
      }
      sc.globalAlpha = 1;
      sc.globalCompositeOperation = "destination-out";
      sc.fillStyle = "#000";
      drawGlyphs(sc);
      // everything below lands only inside the cuts, nearest first
      sc.globalCompositeOperation = "destination-over";
      if (snowPath) {
        sc.fillStyle = P.snow;
        sc.fill(snowPath);
      }
      if (icePath) {
        sc.fillStyle = P.ice;
        sc.fill(icePath);
      }
      if (P.rimA > 0.01) {
        sc.globalAlpha = P.rimA;
        sc.drawImage(mcan, -2.6, -3.6, W, H);
      }
      if (P.glowA > 0.01) {
        sc.globalAlpha = P.glowA;
        sc.drawImage(glcan, 0, 0, W, H);
      }
      sc.globalAlpha = Math.min(1, P.shadowA);
      sc.drawImage(shcan, 0, 0, W, H);
      sc.restore();
    };

    // ---------------------------------------------------------------- compositing the diorama
    let drift = 0; // how far the wind has carried the clouds, px
    let water = 0;
    const clip = new Float32Array(24);
    let nClip = 0;
    const setClip = () => {
      nClip = 0;
      for (let i = 0; i < 5; i++) {
        if (!cur[i]) continue;
        // the numeral's own ink box (a "1" is far narrower than its cell), with a little to spare
        const iw = inkW[cur[i]] * K * SX, base = SLOTS[i].y + HD - BASE_DROP;
        const top = Math.floor(base - inkAsc[cur[i]] * K - 6);
        clip.set([Math.floor(SLOTS[i].cx - iw / 2 - 6), top, Math.ceil(iw + 12), Math.ceil(base + 6 - top)], nClip * 4);
        nClip++;
      }
      clip.set([Math.floor(W - MX - AMPM_W - 10), R1B + 6, Math.ceil(AMPM_W + 20), STRIP - 12], nClip * 4);
      nClip++;
    };
    const wrapX = (v, span) => ((v % span) + span) % span;

    // the windows on the turn, flickering slowly (tt is the twinkle clock)
    const twinkle = (x, wins, ox, color, lit, tt) => {
      if (lit < 0.01) return;
      const i0 = litIndex(wins, lit - 0.05), i1 = litIndex(wins, lit + 0.05);
      if (i1 <= i0) return;
      x.fillStyle = color;
      x.beginPath();
      for (let i = i0; i < i1; i++) {
        const th = wins[i * 3 + 2];
        if (th + 0.05 * Math.sin(tt * (3 + th * 9) + th * 40) < lit) x.rect(wins[i * 3] + ox, wins[i * 3 + 1], 3.2, 4.2);
      }
      x.fill();
    };
    const vy = new Float32Array(3), vs = new Float32Array(3); // the cloud sheets: how far down, and where
    let cityPf = 0, cityPm = 0, cityPb = 0, cityV3 = 0, cityTw = 0, cityVer = -1, cityV3a = 0;

    const drawScene = (s) => {
      const w = s.weather, t = s.t, n = P.n;
      // the wind across the view: we look west, so north is to the right
      let lat = -Math.cos((w.windDir * Math.PI) / 180);
      if (Math.abs(lat) < 0.35) lat = lat < 0 ? -0.35 : 0.35;
      const windV = lat * (5 + w.wind * 3.1);
      drift += windV * s.dt;
      const gusty = clamp(w.wind / 30);
      const swayX = Math.sin((t * TAU) / 40);
      const swayY = Math.cos((t * TAU) / 53);
      const fogHide = 1 - smoothstep(0.5, 0.85, P.fogK) * (w.falling ? 0.4 : 1); // thick fog replaces the cloud paper

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      // A whole-canvas clear lets the browser drop the last frame's drawing instead of keeping it
      // queued (frames that are never shown, while warming up, would otherwise pile up).
      scene.clear();
      // everything is drawn only inside the numerals' boxes: nothing else can be seen
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < nClip; i++) ctx.rect(clip[i * 4], clip[i * 4 + 1], clip[i * 4 + 2], clip[i * 4 + 3]);
      ctx.clip();
      // where the cloud sheets hang: above the lowest one's scallops they are solid paper
      let skyFrom = 0;
      for (let depth = 2; depth >= 0; depth--) {
        vs[depth] = smoothstep(58 + depth * 13, 76 + depth * 12, w.cloud) * fogHide;
        vy[depth] = Math.round(valances[depth].y - (1 - ease.cubicOut(vs[depth])) * 760 + swayY * (1 + depth));
        if (vs[depth] > 0.003) skyFrom = Math.max(skyFrom, vy[depth] - VTOP + 4);
      }
      // the sky, where it can be seen
      for (let i = 0; i < nClip; i++) {
        const x = clip[i * 4], cw = clip[i * 4 + 2];
        const y = Math.max(clip[i * 4 + 1], skyFrom), ch = clip[i * 4 + 1] + clip[i * 4 + 3] - y;
        if (ch > 0) ctx.drawImage(skyB.can, x * SKS, y * SKS, cw * SKS, ch * SKS, x, y, cw, ch);
      }

      // stars, on a clear night: pin-pricks, a few of them flickering slowly
      if (P.starA > 0.02) {
        ctx.globalAlpha = P.starA;
        ctx.fillStyle = P.moon;
        ctx.beginPath();
        for (let i = 0; i < NSTAR; i++) {
          const th = stars[i * 3 + 2];
          if (Math.sin(t * (0.1 + th * 0.25) + th * 60) < -0.8) continue;
          const sz = 2 + th * th * 4.5;
          const sx = stars[i * 3], sy = stars[i * 3 + 1];
          ctx.moveTo(sx, sy - sz);
          ctx.lineTo(sx + sz, sy);
          ctx.lineTo(sx, sy + sz);
          ctx.lineTo(sx - sz, sy);
          ctx.closePath();
        }
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // a slow glow behind the cloud sheets in a storm
      if (w.kind === "storm") {
        const cyc = t / 19 + 0.31;
        const k = Math.floor(cyc), p = cyc - k;
        const env = smoothstep(0, 0.16, p) * (1 - smoothstep(0.16, 0.62, p));
        if (env > 0.01) {
          ctx.globalAlpha = env * lerp(0.55, 0.5, n);
          ctx.drawImage(stormGlow, 140 + hash(k, 3) * 800 - 460, R1 + 160 + hash(k, 9) * 360 - 460, 920, 920);
          ctx.globalAlpha = 1;
        }
      }

      // the paper sun or moon, on its thread; in fog, only a pale disc behind the vellum
      const sunUp = s.sun.alt > -1 ? 1 : 0;
      const sunA = smoothstep(0.3, 0.5, s.daylight) * (1 - smoothstep(55, 85, w.cloud)) * sunUp;
      const moonA = smoothstep(0.6, 1, n) * (1 - smoothstep(60, 90, w.cloud)) * (s.moon.up && s.moon.illumination > 0.04 ? 1 : 0) * (1 - P.fogK * 0.8);
      const ghostA = P.vellumA * smoothstep(-9, 1, s.sun.alt) * (w.falling ? 0 : 1);
      if (sunA > 0.02 || moonA > 0.02 || ghostA > 0.02) {
        if (!discPlaced) {
          placeDisc();
          if (discSnap) {
            discX = discTX;
            discY = discTY;
          }
        }
        const k = 1 - Math.pow(0.5, s.dt / 0.5);
        discX += (discTX - discX) * k;
        discY += (discTY - discY) * k;
        const dx = discX + swayX * 2 + Math.sin(t * 0.31) * 3 * (0.3 + gusty), dy = discY;
        if (sunA > 0.02 || moonA > 0.02) {
          ctx.strokeStyle = P.thread;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.6 * Math.max(sunA, moonA);
          ctx.beginPath();
          ctx.moveTo(discTX, -10);
          ctx.lineTo(dx, dy - 60);
          ctx.stroke();
        }
        ctx.translate(dx, dy);
        if (ghostA > 0.02) {
          ctx.globalAlpha = ghostA * 0.85;
          ctx.drawImage(haloC, -330, -330, 660, 660);
          ctx.globalAlpha = ghostA * 0.55;
          ctx.fillStyle = P.ghost;
          ctx.beginPath();
          ctx.arc(0, 0, 64, 0, TAU);
          ctx.fill();
        }
        if (sunA > 0.02) {
          ctx.globalAlpha = sunA;
          const R0 = 74;
          const rays = clamp(w.uv / 10) * 78 + clamp((w.temp - 84) / 14) * 30;
          ctx.fillStyle = P.shadow;
          ctx.beginPath();
          ctx.arc(7, 10, R0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = P.sun;
          ctx.beginPath();
          ctx.arc(0, 0, R0, 0, TAU);
          if (rays > 6) {
            ctx.rotate(t * 0.035);
            for (let i = 0; i < 16; i++) {
              ctx.rotate(TAU / 16);
              const len = rays * (i % 2 ? 0.62 : 1);
              ctx.moveTo(-11, -(R0 + 14));
              ctx.lineTo(11, -(R0 + 14));
              ctx.lineTo(0, -(R0 + 14 + len));
              ctx.closePath();
            }
          }
          ctx.fill();
        } else if (moonA > 0.02) {
          ctx.globalAlpha = moonA;
          const R0 = 66;
          ctx.fillStyle = P.moonDark;
          ctx.beginPath();
          ctx.arc(0, 0, R0, 0, TAU);
          ctx.fill();
          const kk = 1 - 2 * s.moon.illumination;
          if (!s.moon.waxing) ctx.scale(-1, 1);
          ctx.fillStyle = P.moon;
          ctx.beginPath();
          ctx.arc(0, 0, R0, -TAU / 4, TAU / 4);
          ctx.ellipse(0, 0, Math.max(0.5, R0 * Math.abs(kk)), R0, 0, TAU / 4, -TAU / 4, kk > 0);
          ctx.fill();
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
      }

      // clouds and cloud sheets, far to near
      const count = smoothstep(4, 72, w.cloud) * NCLOUD * fogHide;
      const span = W + 900;
      let coverTop = 0; // below this, a nearer cloud sheet already hides everything
      for (let depth = 0; depth < 3; depth++) {
        const vl = valances[depth];
        if (vs[depth] > 0.003) {
          const y = vy[depth];
          coverTop = 0;
          for (let dd = depth + 1; dd < 3; dd++) if (vs[dd] > 0.003) coverTop = Math.max(coverTop, vy[dd] - VTOP);
          const solid = y - VTOP + 4;
          if (solid > coverTop) {
            ctx.fillStyle = P.val[depth];
            ctx.fillRect(0, coverTop, W, solid - coverTop);
          }
          const off = -wrapX(vl.x0 - drift * vl.speed, VLEN) + swayX * (3 + depth * 3);
          ctx.drawImage(vl.can, off - 20, y - VTOP);
          ctx.drawImage(vl.can, off + VLEN - 20, y - VTOP);
        }
        // threads first, in one stroke
        ctx.strokeStyle = P.thread;
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        let any = false;
        for (let i = 0; i < NCLOUD; i++) {
          const c = clouds[i];
          if (c.depth !== depth) continue;
          const a = clamp(count - c.order);
          c.a = a;
          if (a <= 0) continue;
          const x = wrapX(c.x0 + drift * c.speed, span) - 450;
          const sw = Math.sin(t * c.sf + c.ph) * (2 + 12 * gusty);
          const y = c.y - (1 - ease.cubicOut(a)) * 900;
          c.sx = x + sw + swayX * (3 + depth * 3);
          c.sy = y + swayY;
          if (c.sx < -c.w || c.sx > W + c.w) continue;
          any = true;
          ctx.moveTo(x - c.w * 0.24, -10);
          ctx.lineTo(c.sx - c.w * 0.24, c.sy - c.top + 12);
          ctx.moveTo(x + c.w * 0.24, -10);
          ctx.lineTo(c.sx + c.w * 0.24, c.sy - c.top + 12);
        }
        if (any) ctx.stroke();
        ctx.globalAlpha = 1;
        for (let i = 0; i < NCLOUD; i++) {
          const c = clouds[i];
          if (c.depth !== depth || c.a <= 0 || c.sx < -c.w || c.sx > W + c.w) continue;
          ctx.drawImage(c.can, c.sx - c.ox, c.sy - c.oy);
        }
      }

      // vellum drifting through the hours in fog
      const vA = P.vellumA;
      if (vA > 0.01) for (let i = 0; i < 3; i++) drawVellum(vellums[i], vA * VEL_A[i], null);

      // the city, far to near; each layer's windows that are on the turn twinkle
      const lit = P.lit;
      const pf = Math.round(swayX * 2), pm = Math.round(swayX * 5), pb = Math.round(swayX * 8);
      const v3 = vellums[3];
      const v3a = vA > 0.01 ? vA * VEL_A[3] : 0;
      const v3off = v3a > 0 ? Math.round(-wrapX(v3.x0 - drift * v3.speed, VW)) : 0;
      const tw = lit >= 0.01 ? Math.floor(t * 2) : 0; // the twinkle is slow: twice a second is plenty
      if (cityPf !== pf || cityPm !== pm || cityPb !== pb || cityV3 !== v3off || cityTw !== tw || cityVer !== cityB.ver || cityV3a !== v3a) {
        cityPf = pf; cityPm = pm; cityPb = pb; cityV3 = v3off; cityTw = tw; cityVer = cityB.ver; cityV3a = v3a;
        const x = cityB.x;
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.clearRect(0, 0, cityB.can.width, cityB.can.height);
        x.setTransform(1, 0, 0, 1, 0, -CITY_TOP);
        const tt = tw * 0.5 * 0.05;
        x.drawImage(farB.can, pf - PAD, far.top);
        twinkle(x, far.wins, pf, P.winC[0], lit, tt);
        x.drawImage(midB.can, pm - PAD, mid.top);
        twinkle(x, mid.wins, pm, P.winC[1], lit, tt);
        if (v3a > 0) {
          // a vellum sheet between the city and the bridge
          const y = Math.round(v3.top - v3.amp - 4);
          x.globalAlpha = v3a;
          x.drawImage(v3.can, v3off, y);
          x.drawImage(v3.can, v3off + VW, y);
          if (v3.fade) {
            x.fillStyle = v3.fade;
            x.fillRect(0, y + v3.hb, W, XF);
            x.fillStyle = P.vellum;
            x.fillRect(0, y + v3.hb + XF, W, v3.bot - y - v3.hb - XF);
          }
          x.globalAlpha = 1;
        }
        x.drawImage(bridgeB.can, pb - PAD, bridge.top);
      }
      ctx.drawImage(cityB.can, 0, CITY_TOP);

      // the train on its rod
      const px = pb;
      const tc = (t + 20) / 64;
      const tk = Math.floor(tc), tp = tc - tk;
      const dir = tk % 2 ? -1 : 1;
      const tx = (dir > 0 ? lerp(-320, W + 120, tp * 1.6) : lerp(W + 320, -120, tp * 1.6)) + px;
      if (tp * 1.6 < 1) {
        ctx.fillStyle = P.trainC;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) ctx.rect(tx + i * 46 * dir - (dir > 0 ? 0 : 42), DECK + 10, 42, 15);
        ctx.rect(dir > 0 ? -100 : tx, DECK + 20, dir > 0 ? tx + 100 : W + 200 - tx, 2.5);
        ctx.fill();
        ctx.fillStyle = lit > 0.3 ? P.winC[2] : P.bridge;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) ctx.rect(tx + i * 46 * dir - (dir > 0 ? 0 : 42) + 4 + j * 9.5, DECK + 13, 6, 5);
        ctx.fill();
      }

      // the river: three strips that slide with the tide, and the ferry between them
      water += (s.tide.rising ? 1 : -1) * s.dt;
      const lift = (0.5 - s.tide.norm) * 16;
      for (let i = 0; i < 3; i++) {
        const st = strips[i];
        if (i === 1) {
          const fc = t / 150 + 0.2;
          const fp = fc - Math.floor(fc);
          const fd = Math.floor(fc) % 2 ? -1 : 1;
          const fx = fd > 0 ? lerp(-90, W + 90, fp) : lerp(W + 90, -90, fp);
          const fy = st.y + lift + 6 + Math.sin(t * 0.9) * 2;
          ctx.translate(fx + swayX * 10, fy);
          ctx.scale(fd, 1);
          ctx.fillStyle = P.ferryC;
          ctx.fill(ferry);
          ctx.fillRect(-1.5, 0, 3, 200);
          if (lit > 0.3) {
            ctx.fillStyle = P.window;
            ctx.fillRect(-20, -21, 5, 5);
            ctx.fillRect(-9, -21, 5, 5);
            ctx.fillRect(2, -21, 5, 5);
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        const off = wrapX(st.ph + water * st.speed, st.per) - st.per + swayX * (9 + i * 2);
        ctx.drawImage(st.can, off - st.per * 2, st.y + lift + Math.sin(t * 0.5 + i * 2) * 1.5 - st.amp * 2 - 1);
      }

      // the near shore, and a pennant on each gantry in the wind
      const pn = Math.round(swayX * 14);
      ctx.drawImage(nearB.can, pn - PAD, NEAR_TOP);
      ctx.fillStyle = P.pennantC;
      ctx.beginPath();
      for (let g = 0; g < 2; g++) {
        const gx = gantries[g][0] + pn, k = gantries[g][1];
        const sy = PIER - 296 * k - 22 * k - 28;
        const len = (30 + 20 * gusty) * (lat > 0 ? 1 : -1);
        const fl = Math.sin(t * (1.6 + 3 * gusty) + g) * (2 + 5 * gusty);
        ctx.moveTo(gx, sy);
        ctx.lineTo(gx + len, sy + 7 + fl);
        ctx.lineTo(gx, sy + 14);
        ctx.closePath();
      }
      ctx.fill();

      // rain: threads hung from above, leaning with the wind
      if (w.falling && w.falling !== "snow" && w.intensity > 0.01) {
        const nThreads = Math.min(NR, Math.round(30 + 120 * w.intensity));
        const slant = clamp(lat * w.wind * 0.012, -0.38, 0.38);
        const speed = (w.falling === "drizzle" ? 130 : 250) + 240 * w.intensity;
        ctx.strokeStyle = P.rain;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        for (let i = 0; i < NR; i++) {
          if (rainOrder[i] * NR > nThreads) continue;
          const x0 = rain[i * 4] + Math.sin(t * 0.7 + i) * 2 * gusty;
          ctx.moveTo(x0, -10);
          ctx.lineTo(x0 + slant * (SCENE_H + 10), SCENE_H);
        }
        ctx.stroke();
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        for (let i = 0; i < NR; i++) {
          if (rainOrder[i] * NR > nThreads) continue;
          const j = i * 4;
          const x0 = rain[j] + Math.sin(t * 0.7 + i) * 2 * gusty;
          const len = rain[j + 3];
          for (let q = 0; q < 4; q++) {
            let u = rain[j + 1] + q * 0.25 + (t * speed * rain[j + 2]) / SCENE_H;
            u -= Math.floor(u);
            const y = u * (SCENE_H + 60) - 30;
            ctx.moveTo(x0 + slant * y, y);
            ctx.lineTo(x0 + slant * (y + len), y + len);
          }
        }
        ctx.stroke();
        ctx.lineCap = "butt";
        ctx.globalAlpha = 1;
      }

      // snow: paper confetti, tumbling
      if (w.falling === "snow" && w.intensity > 0.01) {
        const nBits = Math.min(NS, Math.round(140 + 480 * w.intensity + 6 * Math.max(0, w.wind - 15)));
        const vyS = 46 + 60 * w.intensity + w.wind * 1.2;
        const vx = lat * w.wind * 5.5;
        ctx.fillStyle = P.bit;
        ctx.beginPath();
        for (let i = 0; i < nBits; i++) {
          const j = i * 5;
          const ph = snow[j + 3];
          let x = snow[j] + (vx * snow[j + 4] + Math.sin(t * 0.8 + ph) * 14) * s.dt;
          let y = snow[j + 1] + vyS * snow[j + 4] * s.dt;
          if (y > SCENE_H + 12) y -= SCENE_H + 24;
          if (x > W + 12) x -= W + 24;
          else if (x < -12) x += W + 24;
          snow[j] = x;
          snow[j + 1] = y;
          // a scrap of paper turning over as it falls: its width and height breathe out of step
          const sz = snow[j + 2];
          const fw = sz * (0.3 + 0.7 * Math.abs(Math.cos(t * (0.7 + snow[j + 4] * 0.5) + ph)));
          const fh = sz * (0.3 + 0.7 * Math.abs(Math.sin(t * 0.9 + ph * 2)));
          ctx.rect(x - fw / 2, y - fh / 2, fw, fh);
        }
        ctx.fill();
      }
      ctx.restore();
    };

    // ---------------------------------------------------------------- frame
    let ledgeStale = true, lastMs = null, quietUntil = 0, lastPalT = -9, lastPaintT = -9, paintedKey = "", lastTime = "";
    const setFlap = (i, cover) => {
      const f = flaps[i];
      const q = Math.round(cover * 200);
      if (f.shown === q) return;
      f.shown = q;
      if (q === 0) {
        f.top.style.display = f.bot.style.display = "none";
        return;
      }
      f.top.style.display = f.bot.style.display = "block";
      f.top.style.transform = f.bot.style.transform = `scaleY(${(q / 200).toFixed(3)})`;
      f.top.firstChild.style.opacity = f.bot.firstChild.style.opacity = ((1 - q / 200) * 0.42).toFixed(3);
    };

    return {
      frame(s) {
        const jump = lastMs == null || Math.abs(s.ms - lastMs) > 3000;
        lastMs = s.ms;
        if (jump) quietUntil = s.ms + 1500;
        const tx = s.text, w = s.weather;

        if (jump || s.t - lastPalT > 0.4) {
          lastPalT = s.t;
          computePalette(s);
        }
        const baked = runJobs(jump, s.t);

        // what is cut into the sheet
        const stamp = tx.time + tx.ampm;
        let repaint = false;
        if (stamp !== lastTime) {
          lastTime = stamp;
          for (let i = 0; i < 5; i++) other[i] = cur[i];
          slotChars(tx.hh, tx.mm, cur);
          for (let i = 0; i < 5; i++) {
            if (other[i] !== cur[i]) markDirty(SLOTS[i].cx - CELL / 2 - 40, SLOTS[i].y - 40, SLOTS[i].cx + CELL / 2 + 40, SLOTS[i].y + HD + 40);
          }
          if (curAmpm !== tx.ampm) markDirty(W - MX - AMPM_W - 40, R1B - 10, W, R2 + 10);
          curAmpm = tx.ampm;
          setClip();
          rebuildCuts();
          cutMask = null; // read back only if something needs it (the disc, snow banks, icicles)
          discSnap = jump;
          discPlaced = false;
          ledgeStale = true;
          repaint = true;
        }
        // snow lying on the cuts, ice hanging from them
        const snowing = w.falling === "snow" ? w.intensity : 0;
        const depth = snowing > 0 ? Math.round(lerp(16, 36, snowing) / 4) * 4 : 0;
        const cold = Math.round(clamp((33 - w.temp) / 22) * 5) / 5;
        const lk = `${depth}|${cold}`;
        if (lk !== ledgeKey || ledgeStale) {
          if (lk !== ledgeKey) dirty.full = true; // the weather changed them everywhere
          ledgeKey = lk;
          ledgeStale = false;
          buildLedges(depth, cold);
          repaint = true;
        }
        if (repaint || (P.paintKey !== paintedKey && (jump || (!baked && s.t - lastPaintT > 2)))) {
          if (P.paintKey !== paintedKey) dirty.full = true;
          paintedKey = P.paintKey;
          lastPaintT = s.t;
          paintSheet();
          wrap.style.setProperty("--sheet", P.sheet);
          wrap.style.setProperty("--ink", P.ink);
          wrap.style.setProperty("--hl", P.hl);
        }

        drawScene(s);

        // cloud shadows crossing the front sheet on a broken-cloud day
        const shade = (1 - P.n) * smoothstep(8, 35, w.cloud) * (1 - smoothstep(70, 95, w.cloud)) * (w.falling ? 0 : 1);
        const sq = Math.round(shade * 40) / 40;
        if (sq !== blobOpacity) {
          blobOpacity = sq;
          for (const b of blobs) {
            b.node.style.opacity = String(sq);
            b.node.style.display = sq > 0 ? "block" : "none";
          }
        }
        if (sq > 0) {
          for (const b of blobs) {
            const x = Math.round(wrapX(b.x0 + drift * 1.5 * b.k, 3200) - 1400);
            if (x === b.lx) continue;
            b.lx = x;
            b.node.style.transform = `translate(${x}px, ${Math.round(b.y)}px) scale(${b.sx.toFixed(3)}, ${b.sy.toFixed(3)})`;
          }
        }

        // the flaps: closing over a numeral that is about to change, opening on the new one
        let closing = 0, opening = 0;
        if (s.ms >= quietUntil) {
          const sf = s.clock.sf;
          if (sf > 59.45) closing = ease.inOut((sf - 59.45) / 0.55);
          else if (sf < 0.6) opening = 1 - ease.inOut(sf / 0.6);
        }
        if (closing > 0 || opening > 0) {
          let h = s.clock.h12, m = s.clock.m;
          if (closing > 0) {
            m += 1;
            if (m === 60) { m = 0; h = (h % 12) + 1; }
          } else {
            m -= 1;
            if (m < 0) { m = 59; h = h === 1 ? 12 : h - 1; }
          }
          slotChars(String(h), String(m).padStart(2, "0"), other);
          const cover = Math.max(closing, opening);
          for (let i = 0; i < 5; i++) setFlap(i, other[i] !== cur[i] ? cover : 0);
        } else {
          for (let i = 0; i < 5; i++) setFlap(i, 0);
        }

        // the letterpress
        put("date", T.date, tx.date);
        const a = put("temp", T.temp, tx.temp);
        const b = put("cond", T.cond, tx.condition);
        const c = put("aqi", T.aqi, tx.aqi);
        const d = put("uv", T.uv, tx.uv);
        put("sunLabel", T.sunLabel, tx.sunLabel);
        put("sunValue", T.sunValue, tx.sunValue);
        put("moon", T.moon, tx.moon);
        const hasFact = tx.factValue !== "";
        let e = false;
        if (shown.hasFact !== hasFact) {
          shown.hasFact = hasFact;
          wrap.classList.toggle("nofact", !hasFact);
          e = true;
        }
        if (hasFact) {
          put("factLabel", T.factLabel, tx.factLabel);
          put("factValue", T.factValue, tx.factValue);
        }
        if (e) {
          // the condition's natural size differs with and without the fact block
          T.cond.dataset.baseSize = "";
          T.cond.style.fontSize = "";
        }
        if (a || b || c || d || e) fitText(T.cond, W - 2 * MX - T.temp.offsetWidth - T.ed.offsetWidth - 22 - 36);
      },
    };
  },
};

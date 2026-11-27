// Die-Cut
//
// A heavy sheet of cotton paper with the time punched clean through it in
// stencil numerals. Behind the sheet hangs a paper-cut waterfront, lit from
// behind by the sky as the tower camera measures it: paper clouds on threads
// behind the hours, the skyline, the Queensboro Bridge and the Long Island
// City gantries behind the minutes.
//
// How the conditions drive it:
//   sky colors      the whole palette behind the sheet (west on the left, north-west on the right)
//   daylight        the sheet turns from cotton white to indigo-black; the scene behind is kept
//                   darker than the sheet by day and lighter by night, so the numerals always read
//   cloud cover     how many paper clouds hang on their threads, then full-width cloud sheets
//   wind            slides the clouds (speed and direction), leans rain and snow, swings threads
//   rain            hanging threads carrying paper dashes; the front sheet cockles with damp
//   snow            paper confetti; it banks up on the lower edges of the cut numerals
//   cold            paper icicles hang from the upper edges of the cuts
//   visibility/fog  sheets of vellum between the layers, the far city goes first
//   storm           dark cloud sheets and a slow glow behind them
//   temperature     the paper's tint (cool white to warm ivory); UV lengthens the paper sun's rays
//   tide            lifts the paper water and sets which way it slides
// On the minute the changed numeral closes behind two hinged paper flaps and
// the new one folds open.

import {
  W, H, TAU, clamp, lerp, smoothstep, norm, lerpAngle, ease, rng, hash, createNoise,
  mix, oklch, toOklch, rgba, el, addStyle, canvas2d, mask, grain, fitText,
} from "../lib/kit.js";

const MX = 64; // side margin for type
const TOP = 70; // top of the hour numerals
const HD = 660; // height of a numeral
const STRIP = 106; // the letterpress strip between the rows
const R1 = TOP;
const R1B = R1 + HD;
const R2 = R1B + STRIP;
const R2B = R2 + HD;
const GAP = 30; // between two numerals
const WATER = R2B - 96; // the waterline of the paper river
const SCENE_H = R2B + 24;
const DFONT = '"Stardos Stencil", "Rockwell", serif';
const AMPM_CAP = 60;

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
      .dc canvas.ov { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; pointer-events: none; }
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
      .dc .foot { position: absolute; left: ${MX}px; width: ${W - 2 * MX}px; top: ${R2B + 30}px; height: ${H - MX - R2B - 30}px;
                  display: flex; flex-direction: column; justify-content: space-between; }
      .dc .title { display: flex; align-items: baseline; white-space: nowrap; }
      .dc .temp { font-family: ${DFONT}; font-weight: 700; font-size: 128px; line-height: .84; letter-spacing: -.01em; }
      .dc .cond { font-style: italic; font-weight: 600; font-size: 60px; line-height: 1; margin-left: 24px; }
      .dc .sp { flex: 1; }
      .dc .lab { font-weight: 700; font-size: 27px; letter-spacing: .16em; text-transform: uppercase; }
      .dc .val { font-weight: 700; font-size: 46px; line-height: 1; }
      .dc .ed .val { margin-left: 12px; }
      .dc .ed .dot { margin: 0 16px; font-weight: 700; font-size: 34px; }
      .dc .line2 { display: flex; align-items: baseline; justify-content: space-between; white-space: nowrap; }
      .dc .line2 .val { margin-left: 14px; }
      .dc .line2 .moon { font-style: italic; font-weight: 600; }
      .dc .fact .lab { display: block; margin-bottom: 4px; }
      .dc .fact .fv { font-style: italic; font-weight: 600; font-size: 42px; line-height: 1.08; max-height: 2.16em; overflow: hidden; }
      .dc.nofact .foot { justify-content: center; gap: 44px; }
      .dc.nofact .temp { font-size: 150px; }
      .dc.nofact .cond { font-size: 64px; }
      .dc.nofact .fact { display: none; }
    `);

    const wrap = el("div", { class: "dc" });
    root.append(wrap);

    // ---------------------------------------------------------------- surfaces
    const scene = canvas2d(wrap, { adaptive: true, alpha: false }); // the diorama, redrawn every frame
    const sheet = canvas2d(wrap, { maxScale: 2 }); // the front sheet with the cuts: repainted when the time or the light changes
    const ctx = scene.ctx;
    const sc = sheet.ctx;

    const offscreen = (w, h) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c;
    };
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
    const inkMid = {};
    for (const ch of "0123456789") {
      const m = mctx.measureText(ch);
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
      for (let i = 0; i < 5200; i++) {
        const v = pr();
        t.fillStyle = v > 0.5 ? `rgba(255,255,255,${0.05 + pr() * 0.1})` : `rgba(20,22,50,${0.04 + pr() * 0.08})`;
        const s = 1 + pr() * 2.2;
        t.fillRect(pr() * 512, pr() * 512, s, s);
      }
      t.lineWidth = 1;
      for (let i = 0; i < 260; i++) {
        const x = pr() * 512, y = pr() * 512, a = pr() * TAU, l = 6 + pr() * 22;
        t.strokeStyle = pr() > 0.5 ? `rgba(255,255,255,${0.06 + pr() * 0.1})` : `rgba(30,30,60,${0.04 + pr() * 0.07})`;
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

    // Damp cockling: a relief of soft vertical ripples, shown as much as the paper is wet.
    const cockle = offscreen(270, 480);
    cockle.className = "ov";
    {
      const c = cockle.getContext("2d");
      const img = c.createImageData(270, 480);
      const hgt = (x, y) => {
        const xw = x + 9 * noise.n2(x * 0.011, y * 0.006) + 3 * noise.n2(x * 0.05 + 9, y * 0.012);
        return Math.sin(xw * 0.19 + 2.2 * noise.n2(xw * 0.02, y * 0.003 + 4));
      };
      for (let y = 0; y < 480; y++) {
        for (let x = 0; x < 270; x++) {
          const slope = hgt(x + 0.7, y) - hgt(x - 0.7, y);
          const patch = smoothstep(-0.35, 0.5, noise.n2(x * 0.008 + 30, y * 0.005)) * (0.45 + 0.55 * (y / 480));
          const v = clamp(slope * 4.2) * patch;
          const u = clamp(-slope * 4.2) * patch;
          const i = (y * 270 + x) * 4;
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
    }
    cockle.style.opacity = "0";
    wrap.append(cockle);

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
    grain(wrap, { opacity: 0.05 });

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
      clouds.push({
        ...shape, w, depth, order: order[i],
        x0: (i / NCLOUD) * (W + 900) + r.range(-80, 80),
        y: i % 4 === 3 ? r.range(R2 + 90, R2 + 250) : r.range(R1 + 170, R1B - 40),
        speed: 0.55 + depth * 0.3 + r.range(-0.06, 0.06),
        ph: r.range(0, TAU), sf: r.range(0.35, 0.6),
      });
    }
    clouds.sort((a, b) => a.depth - b.depth);

    // Cloud sheets: full-width paper borders with a scalloped lower edge, lowered in as the sky closes.
    const VLEN = 1680;
    const valances = [0, 1, 2].map((i) => {
      const p = new Path2D();
      p.rect(-20, -1400, VLEN + 40, 1400);
      let x = 0;
      while (x < VLEN - 60) {
        const rad = Math.min(r.range(70, 140), (VLEN - x) / 2 + 30);
        p.moveTo(x + rad * 2, -rad * 0.35);
        p.arc(x + rad, -rad * 0.35, rad, 0, TAU);
        x += rad * r.range(1.2, 1.55);
      }
      return { p, y: [R1 + 520, R1 + 380, R1 + 235][i], x0: r.range(0, VLEN), speed: 0.5 + i * 0.3, show: 0 };
    });

    // The skyline: two sheets of towers, with pin-pricked windows.
    const buildSkyline = (far) => {
      const p = new Path2D();
      const wins = [];
      const body = (x, top, w, h, prob) => {
        p.rect(x, top, w, h);
        const gx = far ? 9 : 11, gy = far ? 12 : 14;
        for (let wy = top + 10; wy < Math.min(top + h, WATER - 12); wy += gy) {
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
            const top = WATER - h;
            body(x, top + 150, w, base - top - 150, 0.3);
            body(x + 12, top + 80, w - 24, 72, 0.3);
            body(x + 26, top + 44, w - 52, 38, 0.2);
            p.rect(x + w / 2 - 7, top + 22, 14, 24);
            p.rect(x + w / 2 - 2, top - 30, 4, 54);
            x += w + r.range(2, 8);
          } else if (kind === 1) {
            // a tapered crown and needle
            const w = 74, h = 492;
            const top = WATER - h;
            body(x, top + 110, w, base - top - 110, 0.3);
            p.moveTo(x, top + 112);
            p.quadraticCurveTo(x + w * 0.2, top + 50, x + w / 2 - 2, top - 34);
            p.lineTo(x + w / 2 + 2, top - 34);
            p.quadraticCurveTo(x + w * 0.8, top + 50, x + w, top + 112);
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
        const top = WATER - h;
        const kind = r();
        if (kind < 0.3 && w > 50) {
          const inset = w * r.range(0.14, 0.24);
          body(x, top + h * 0.28, w, base - top - h * 0.28, 0.3);
          body(x + inset, top, w - inset * 2, h * 0.28 + 2, 0.3);
          if (r.chance(0.4)) p.rect(x + w / 2 - 2, top - 30, 4, 32);
        } else if (kind < 0.42) {
          body(x, top + 26, w, base - top - 26, 0.3);
          p.moveTo(x, top + 27);
          p.lineTo(x + w, top - 14);
          p.lineTo(x + w, top + 27);
          p.closePath();
        } else {
          body(x, top, w, base - top, 0.3);
          if (!far && r.chance(0.55)) {
            // a rooftop water tank
            const tx = x + r.range(10, w - 34);
            p.rect(tx + 2, top - 10, 3, 10);
            p.rect(tx + 19, top - 10, 3, 10);
            p.rect(tx, top - 30, 24, 21);
            p.moveTo(tx - 2, top - 30);
            p.lineTo(tx + 12, top - 42);
            p.lineTo(tx + 26, top - 30);
            p.closePath();
          }
        }
        x += w + (r.chance(0.2) ? r.range(6, 18) : r.range(-4, 3));
      }
      return { p, wins: new Float32Array(wins) };
    };
    const far = buildSkyline(true);
    const mid = buildSkyline(false);

    // The bridge: a cantilever truss in elevation, towers with finials, masonry piers.
    const DECK = WATER - 140;
    const bridge = { fill: new Path2D(), line: new Path2D(), fine: new Path2D(), lamps: [] };
    {
      const shift = r.range(-50, 50);
      const tw = [120 + shift, 452 + shift, 628 + shift, 960 + shift];
      const TH = 186;
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
      let px = -66, flip = false;
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
      bridge.lamps = new Float32Array(bridge.lamps);
    }

    // The river: three scalloped paper strips.
    const strips = [0, 1, 2].map((i) => {
      const p = new Path2D();
      const per = [64, 82, 104][i];
      const amp = [7, 9, 11][i];
      p.moveTo(-per * 2, 140);
      p.lineTo(-per * 2, 0);
      for (let x = -per * 2; x < W + per * 2; x += per) p.quadraticCurveTo(x + per / 2, -amp * 2, x + per, 0);
      p.lineTo(W + per * 2, 140);
      p.closePath();
      return { p, per, y: WATER + [0, 28, 58][i], speed: [9, 15, 24][i], ph: r.range(0, 100) };
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

    // The near shore: a pier and the gantries.
    const near = { fill: new Path2D(), line: new Path2D() };
    const gantries = r.chance(0.5) ? [[204, 0.6], [862, 0.5]] : [[850, 0.6], [236, 0.5]];
    const PIER = R2B - 30;
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
    }

    // Storm glow.
    const glowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 460);
    glowGrad.addColorStop(0, "rgba(246,238,255,0.9)");
    glowGrad.addColorStop(0.35, "rgba(226,214,255,0.4)");
    glowGrad.addColorStop(1, "rgba(220,210,255,0)");

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
    const NS = 520;
    const snow = new Float32Array(NS * 5); // x, y, size, phase, fall factor
    for (let i = 0; i < NS; i++) snow.set([r.range(0, W), r.range(0, SCENE_H), r.range(5, 11), r.range(0, TAU), r.range(0.7, 1.3)], i * 5);

    // ---------------------------------------------------------------- snow banks and icicles on the cuts
    let snowPath = null, icePath = null, ledgeKey = "", cutMask = null;
    const readCuts = () => {
      cutMask = mask(540, 960, (c) => {
        c.scale(0.5, 0.5);
        drawGlyphs(c);
      });
    };
    // Where the paper sun or moon hangs: wherever the hour numerals show most of it.
    const discHome = r.range(0, 1000);
    let discX = W / 2, discY = R1 + 240, discTX = W / 2, discTY = R1 + 240;
    const placeDisc = () => {
      const open = (x, y) => (x < 0 || x >= W || y < 0 || y >= H ? 0 : cutMask.data[(y >> 1) * 540 + (x >> 1)] > 128 ? 1 : 0);
      let best = -1;
      for (let y = R1 + 110; y <= R1B - 150; y += 26) {
        for (let x = 130; x <= W - 130; x += 26) {
          let sc = 0;
          for (let a = 0; a < 8; a++) {
            const ca = Math.cos((a * TAU) / 8), sa = Math.sin((a * TAU) / 8);
            sc += open(Math.round(x + ca * 62), Math.round(y + sa * 62)) + open(Math.round(x + ca * 100), Math.round(y + sa * 100)) * 0.5;
          }
          sc += open(x, y) * 2 + hash(x + discHome, y) * 2.5 - (y - R1) * 0.004;
          if (sc > best) {
            best = sc;
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
      cloud: ["", "", ""], val: ["", "", ""], far: "", mid: "", bridge: "", near: "", river: ["", "", ""],
      thread: "", window: "", sun: "", moon: "", moonDark: "", rain: "", bit: "", fog: "", snow: "", ice: "", cut: "",
      fogA: [0, 0, 0], rimA: 0, glowA: 0, shadowA: 0, paintKey: "", skyKey: "", shadow: "",
    };
    const NIGHT_SHEET = oklch(0.125, 0.036, 272);
    const FLOOR = Math.cbrt(3.3 * (0.125 ** 3 + 0.05) - 0.05); // the darkest the scene may be behind the night sheet
    const hueOf = (k, fallback) => (k.c < 0.012 ? fallback : k.h);
    let skyGrad = null, skyTint = null;

    const computePalette = (s) => {
      const w = s.weather, d = s.daylight;
      const n = 1 - smoothstep(0.15, 0.28, d);
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
      P.n = n;
      P.sheet = mix(daySheet, NIGHT_SHEET, n);
      const lit = toOklch(P.sheet).l > 0.56;
      P.ink = lit ? "#1a1c33" : "#e6dfcf";
      P.hl = lit ? "rgba(255,255,255,.75)" : "rgba(0,0,0,.6)";

      // how light the scene may be behind the day sheet, for 3:1 and a little more
      const cap = Math.cbrt((dayL ** 3 + 0.05) / 3.3 - 0.05);
      const bright = clamp((km.l - 0.36) / 0.36);
      const v = clamp(Math.log2(1 + w.visibility) / Math.log2(11)) * (w.fog ? 0.6 : 1);
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
        const dc = oklch(Math.max(0.17, cap + dHor - stepD * v), clamp(km.c * 1.25 * cK, 0.012, 0.15), lerpAngle(hm, 272, hShift));
        const nc = oklch(Math.max(FLOOR + 0.002, FLOOR + 0.15 - stepN * v), clamp((km.c * 2 + 0.05) * cK, 0.05, 0.15), lerpAngle(hm, 266, 0.5));
        return mix(dc, nc, n);
      };
      P.far = layer(0.1, 0.05, 0.95, 0.15);
      P.mid = layer(0.2, 0.09, 0.9, 0.25);
      P.bridge = layer(0.3, 0.125, 0.85, 0.35);
      P.near = layer(0.4, 0.148, 0.75, 0.45);
      P.river[0] = layer(0.13, 0.06, 1, 0.1);
      P.river[1] = layer(0.18, 0.085, 1, 0.15);
      P.river[2] = layer(0.24, 0.11, 0.95, 0.2);
      P.fog = P.skyHor;
      const fogK = 1 - v;
      P.fogA[0] = fogK * 0.5;
      P.fogA[1] = fogK * 0.62;
      P.fogA[2] = fogK * 0.7;

      // clouds: pale on a fair day, slate when it is closing in
      for (let i = 0; i < 3; i++) {
        const fairD = oklch(cap + 0.012 - 0.03 * (2 - i), clamp(km.c * 0.35, 0.008, 0.05), hm);
        const dullD = oklch(cap - 0.2 - 0.05 * i, clamp(km.c * 0.8, 0.012, 0.06), lerpAngle(hm, 270, 0.3));
        const fairN = oklch(FLOOR + 0.12 - 0.03 * (2 - i), 0.05, 272);
        const dullN = oklch(FLOOR + 0.015 + 0.02 * (2 - i), 0.03, 280);
        P.cloud[i] = mix(mix(fairD, dullD, dull), mix(fairN, dullN, dull), n);
        const vD = oklch(cap - 0.045 - 0.075 * i - 0.1 * dull, clamp(km.c * 0.7, 0.012, 0.06), lerpAngle(hm, 268, 0.25));
        const vN = oklch(FLOOR + 0.095 - 0.04 * i - 0.01 * dull, 0.04, 276);
        P.val[i] = mix(vD, vN, n);
      }
      P.thread = mix(oklch(cap - 0.34, 0.03, hm), oklch(FLOOR + 0.3, 0.03, 260), n);
      P.shadow = n > 0.5 ? "rgba(6,8,32,0.12)" : "rgba(10,14,48,0.2)";
      P.window = mix("#ffe2ae", "#ffd492", n);
      P.sun = oklch(cap + 0.15, 0.13, 82);
      P.moon = "#f1ead6";
      P.moonDark = oklch(FLOOR + 0.07, 0.05, 268);
      P.rain = mix(oklch(0.9, 0.02, 235), oklch(0.86, 0.035, 240), n);
      P.bit = mix("#fbfcff", oklch(0.9, 0.02, 250), n);
      P.snow = mix("#ffffff", oklch(0.86, 0.03, 250), n);
      P.ice = mix(oklch(0.985, 0.012, 230), oklch(0.82, 0.05, 235), n);

      // the cut edges: a pale paper edge and a cast shadow by day, a warm rim at night
      const cross = 1 - Math.abs(n - 0.5) * 2;
      P.rimA = lerp(0.9, 0.0, n);
      P.glowA = n * 0.6;
      P.shadowA = lerp(0.5, 0.2, n) + 0.3 * cross;
      P.wet = wet;
      P.dull = dull;
      P.cap = cap;
      P.paintKey = `${P.sheet}${Math.round(P.rimA * 16)}${Math.round(P.shadowA * 16)}`;

      const skyKey = P.skyTop + P.skyMid + P.skyHor + P.skyW + P.skyN;
      if (skyKey !== P.skyKey) {
        P.skyKey = skyKey;
        skyGrad = ctx.createLinearGradient(0, 0, 0, WATER);
        skyGrad.addColorStop(0, P.skyTop);
        skyGrad.addColorStop(R1B / WATER, P.skyMid);
        skyGrad.addColorStop((R2 + 150) / WATER, P.skyHor);
        skyGrad.addColorStop(1, P.skyHor);
        skyTint = ctx.createLinearGradient(0, 0, W, 0);
        skyTint.addColorStop(0, rgba(P.skyW, 0.75));
        skyTint.addColorStop(0.42, rgba(P.skyW, 0));
        skyTint.addColorStop(0.58, rgba(P.skyN, 0));
        skyTint.addColorStop(1, rgba(P.skyN, 0.75));
      }
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

    const paintSheet = () => {
      sc.save();
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

    // ---------------------------------------------------------------- drawing the diorama
    let drift = 0; // how far the wind has carried the clouds, px
    let water = 0;
    const clip = new Float32Array(20);
    let nClip = 0;
    const setClip = () => {
      nClip = 0;
      for (let i = 0; i < 5; i++) {
        if (!cur[i]) continue;
        clip.set([SLOTS[i].cx - CELL / 2 - 6, SLOTS[i].y - 8, CELL + 12, HD + 16], nClip * 4);
        nClip++;
      }
      clip.set([W - MX - AMPM_W - 8, R1B + 8, AMPM_W + 16, STRIP - 16], nClip * 4);
      nClip++;
    };

    const drawScene = (s) => {
      const w = s.weather, t = s.t, n = P.n;
      const day = 1 - n;
      // the wind across the view: we look west, so north is to the right
      let lat = -Math.cos((w.windDir * Math.PI) / 180);
      if (Math.abs(lat) < 0.35) lat = lat < 0 ? -0.35 : 0.35;
      const windV = lat * (5 + w.wind * 3.1);
      drift += windV * s.dt;
      const gusty = clamp(w.wind / 30);
      const swayX = Math.sin((t * TAU) / 40);
      const swayY = Math.cos((t * TAU) / 53);

      scene.clear();
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < nClip; i++) ctx.rect(clip[i * 4], clip[i * 4 + 1], clip[i * 4 + 2], clip[i * 4 + 3]);
      ctx.clip();

      // sky
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, SCENE_H);
      ctx.fillStyle = skyTint;
      ctx.fillRect(0, 0, W, SCENE_H);

      // a slow glow behind the cloud sheets in a storm
      if (w.kind === "storm") {
        const cyc = t / 19 + 0.31;
        const k = Math.floor(cyc), p = cyc - k;
        const env = smoothstep(0, 0.16, p) * (1 - smoothstep(0.16, 0.62, p));
        if (env > 0.01) {
          ctx.globalAlpha = env * lerp(0.55, 0.5, n);
          ctx.translate(140 + hash(k, 3) * 800, R1 + 160 + hash(k, 9) * 360);
          ctx.fillStyle = glowGrad;
          ctx.fillRect(-460, -460, 920, 920);
          ctx.setTransform(scene.ratio, 0, 0, scene.ratio, 0, 0);
          ctx.globalAlpha = 1;
        }
      }

      // stars, on a clear night
      const starA = n * (1 - smoothstep(25, 75, w.cloud)) * (1 - P.fogA[0]);
      if (starA > 0.02) {
        ctx.globalAlpha = starA;
        ctx.fillStyle = P.moon;
        ctx.beginPath();
        for (let i = 0; i < NSTAR; i++) {
          const th = stars[i * 3 + 2];
          if (Math.sin(t * (0.1 + th * 0.25) + th * 60) < -0.72) continue;
          const sz = 1.6 + th * th * 3;
          const x = stars[i * 3], y = stars[i * 3 + 1];
          ctx.moveTo(x, y - sz);
          ctx.lineTo(x + sz, y);
          ctx.lineTo(x, y + sz);
          ctx.lineTo(x - sz, y);
          ctx.closePath();
        }
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // the paper sun or moon, on its thread
      const sunA = smoothstep(0.3, 0.5, s.daylight) * (1 - smoothstep(55, 85, w.cloud)) * (s.sun.alt > 0 ? 1 : 0);
      const moonA = smoothstep(0.6, 1, n) * (1 - smoothstep(60, 90, w.cloud)) * (s.moon.up && s.moon.illumination > 0.04 ? 1 : 0);
      if (sunA > 0.02 || moonA > 0.02) {
        const k = 1 - Math.pow(0.5, s.dt / 0.5);
        discX += (discTX - discX) * k;
        discY += (discTY - discY) * k;
        const dx = discX + swayX * 2 + Math.sin(t * 0.31) * 3 * (0.3 + gusty), dy = discY;
        ctx.strokeStyle = P.thread;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.6 * Math.max(sunA, moonA);
        ctx.beginPath();
        ctx.moveTo(discTX, -10);
        ctx.lineTo(dx, dy - 60);
        ctx.stroke();
        ctx.translate(dx, dy);
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
        } else {
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
        ctx.setTransform(scene.ratio, 0, 0, scene.ratio, 0, 0);
        ctx.globalAlpha = 1;
      }

      // clouds and cloud sheets, far to near
      const count = smoothstep(4, 72, w.cloud) * NCLOUD;
      const span = W + 900;
      for (let depth = 0; depth < 3; depth++) {
        const vl = valances[depth];
        const show = smoothstep(58 + depth * 13, 76 + depth * 12, w.cloud);
        if (show > 0.003) {
          const off = -((((vl.x0 - drift * vl.speed) % VLEN) + VLEN) % VLEN);
          const y = vl.y - (1 - ease.cubicOut(show)) * 760 + swayY * (1 + depth);
          const px = swayX * (3 + depth * 3);
          for (let rep = 0; rep < 2; rep++) {
            ctx.translate(off + rep * VLEN + px + 5, y + 9);
            ctx.fillStyle = P.shadow;
            ctx.fill(vl.p);
            ctx.translate(-5, -9);
            ctx.fillStyle = P.val[depth];
            ctx.fill(vl.p);
            ctx.setTransform(scene.ratio, 0, 0, scene.ratio, 0, 0);
          }
        }
        // threads first, in one stroke
        ctx.strokeStyle = P.thread;
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        for (let i = 0; i < NCLOUD; i++) {
          const c = clouds[i];
          if (c.depth !== depth) continue;
          const a = clamp(count - c.order);
          if (a <= 0) continue;
          const x = ((((c.x0 + drift * c.speed) % span) + span) % span) - 450;
          const sw = Math.sin(t * c.sf + c.ph) * (2 + 12 * gusty);
          const y = c.y - (1 - ease.cubicOut(a)) * 900;
          c.sx = x + sw + swayX * (3 + depth * 3);
          c.sy = y + swayY;
          c.a = a;
          ctx.moveTo(x - c.w * 0.24, -10);
          ctx.lineTo(c.sx - c.w * 0.24, c.sy - c.top + 12);
          ctx.moveTo(x + c.w * 0.24, -10);
          ctx.lineTo(c.sx + c.w * 0.24, c.sy - c.top + 12);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        for (let i = 0; i < NCLOUD; i++) {
          const c = clouds[i];
          if (c.depth !== depth || clamp(count - c.order) <= 0) continue;
          ctx.translate(c.sx + 5 + depth * 2, c.sy + 8 + depth * 3);
          ctx.fillStyle = P.shadow;
          ctx.fill(c.p);
          ctx.translate(-5 - depth * 2, -8 - depth * 3);
          ctx.fillStyle = P.cloud[depth];
          ctx.fill(c.p);
          ctx.setTransform(scene.ratio, 0, 0, scene.ratio, 0, 0);
        }
      }

      // the far city
      const lit = clamp(n * 0.62 + P.dull * 0.06 * day + (1 - smoothstep(0.28, 0.6, s.daylight)) * 0.1);
      const windows = (wins, ox) => {
        if (lit < 0.01) return;
        ctx.fillStyle = P.window;
        ctx.beginPath();
        const slow = t * 0.05;
        for (let i = 0; i < wins.length; i += 3) {
          const th = wins[i + 2];
          if (th + 0.05 * Math.sin(slow * (3 + th * 9) + th * 40) < lit) ctx.rect(wins[i] + ox, wins[i + 1], 3.2, 4.2);
        }
        ctx.fill();
      };
      let px = swayX * 2;
      ctx.translate(px + 4, 5);
      ctx.fillStyle = P.shadow;
      ctx.fill(far.p);
      ctx.translate(-4, -5);
      ctx.fillStyle = P.far;
      ctx.fill(far.p);
      ctx.setTransform(scene.ratio, 0, 0, scene.ratio, 0, 0);
      windows(far.wins, px);
      if (P.fogA[0] > 0.01) {
        ctx.fillStyle = rgbaCache(0, P.fog, P.fogA[0]);
        ctx.fillRect(0, R1B, W, SCENE_H - R1B);
      }

      // the nearer city
      px = swayX * 5;
      ctx.translate(px + 5, 6);
      ctx.fillStyle = P.shadow;
      ctx.fill(mid.p);
      ctx.translate(-5, -6);
      ctx.fillStyle = P.mid;
      ctx.fill(mid.p);
      ctx.setTransform(scene.ratio, 0, 0, scene.ratio, 0, 0);
      windows(mid.wins, px);
      if (P.fogA[1] > 0.01) {
        ctx.fillStyle = rgbaCache(1, P.fog, P.fogA[1]);
        ctx.fillRect(0, R1B, W, SCENE_H - R1B);
      }

      // the bridge, and the train on its rod
      px = swayX * 8;
      ctx.translate(px, 0);
      ctx.fillStyle = P.bridge;
      ctx.strokeStyle = P.bridge;
      ctx.fill(bridge.fill);
      ctx.lineWidth = 6;
      ctx.lineJoin = "round";
      ctx.stroke(bridge.line);
      ctx.lineWidth = 2.6;
      ctx.stroke(bridge.fine);
      const tc = (t + 20) / 64;
      const tk = Math.floor(tc), tp = tc - tk;
      const dir = tk % 2 ? -1 : 1;
      const tx = dir > 0 ? lerp(-320, W + 120, tp * 1.6) : lerp(W + 320, -120, tp * 1.6);
      if (tp * 1.6 < 1) {
        ctx.fillStyle = P.near;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) ctx.rect(tx + i * 46 * dir - (dir > 0 ? 0 : 42), DECK + 10, 42, 15);
        ctx.rect(dir > 0 ? -100 : tx, DECK + 20, dir > 0 ? tx + 100 : W + 200 - tx, 2.5);
        ctx.fill();
        ctx.fillStyle = lit > 0.3 ? P.window : P.far;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) ctx.rect(tx + i * 46 * dir - (dir > 0 ? 0 : 42) + 4 + j * 9.5, DECK + 13, 6, 5);
        ctx.fill();
      }
      if (n > 0.05) {
        ctx.globalAlpha = n;
        ctx.fillStyle = P.window;
        ctx.beginPath();
        const lm = bridge.lamps;
        for (let i = 0; i < lm.length; i += 2) {
          ctx.moveTo(lm[i] + 2.6, lm[i + 1]);
          ctx.arc(lm[i], lm[i + 1], 2.6, 0, TAU);
        }
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.setTransform(scene.ratio, 0, 0, scene.ratio, 0, 0);
      if (P.fogA[2] > 0.01) {
        ctx.fillStyle = rgbaCache(2, P.fog, P.fogA[2]);
        ctx.fillRect(0, R1B, W, SCENE_H - R1B);
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
          ctx.fillStyle = P.near;
          ctx.fill(ferry);
          ctx.fillRect(-1.5, 0, 3, 200);
          if (lit > 0.3) {
            ctx.fillStyle = P.window;
            ctx.fillRect(-20, -21, 5, 5);
            ctx.fillRect(-9, -21, 5, 5);
            ctx.fillRect(2, -21, 5, 5);
          }
          ctx.setTransform(scene.ratio, 0, 0, scene.ratio, 0, 0);
        }
        const off = ((((st.ph + water * st.speed) % st.per) + st.per) % st.per) - st.per;
        ctx.translate(off + swayX * (9 + i * 2), st.y + lift + Math.sin(t * 0.5 + i * 2) * 1.5);
        ctx.fillStyle = P.river[i];
        ctx.fill(st.p);
        ctx.setTransform(scene.ratio, 0, 0, scene.ratio, 0, 0);
      }

      // the near shore
      px = swayX * 14;
      ctx.translate(px, 0);
      ctx.fillStyle = P.near;
      ctx.strokeStyle = P.near;
      ctx.fill(near.fill);
      ctx.lineWidth = 3;
      ctx.stroke(near.line);
      // lettering cut out of the gantry beams, and a pennant in the wind
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = lit > 0.3 ? P.window : P.skyHor;
      for (let g = 0; g < 2; g++) {
        const gx = gantries[g][0], k = gantries[g][1];
        const topY = PIER - 296 * k;
        ctx.font = `700 ${(31 * k).toFixed(1)}px ${DFONT}`;
        ctx.fillText("LONG ISLAND", gx, topY + 29 * k, 236 * k);
      }
      ctx.fillStyle = P.near;
      ctx.beginPath();
      for (let g = 0; g < 2; g++) {
        const gx = gantries[g][0], k = gantries[g][1];
        const sy = PIER - 296 * k - 22 * k - 28;
        const len = (30 + 20 * gusty) * (lat > 0 ? 1 : -1);
        const fl = Math.sin(t * (1.6 + 3 * gusty) + g) * (2 + 5 * gusty);
        ctx.moveTo(gx, sy);
        ctx.lineTo(gx + len, sy + 7 + fl);
        ctx.lineTo(gx, sy + 14);
        ctx.closePath();
      }
      ctx.fill();
      ctx.setTransform(scene.ratio, 0, 0, scene.ratio, 0, 0);

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
        const nBits = Math.min(NS, Math.round(110 + 420 * w.intensity));
        const vy = 46 + 60 * w.intensity + w.wind * 1.2;
        const vx = lat * w.wind * 5.5;
        ctx.fillStyle = P.bit;
        ctx.beginPath();
        for (let i = 0; i < nBits; i++) {
          const j = i * 5;
          const ph = snow[j + 3];
          let x = snow[j] + (vx * snow[j + 4] + Math.sin(t * 0.8 + ph) * 14) * s.dt;
          let y = snow[j + 1] + vy * snow[j + 4] * s.dt;
          if (y > SCENE_H + 12) y -= SCENE_H + 24;
          if (x > W + 12) x -= W + 24;
          else if (x < -12) x += W + 24;
          snow[j] = x;
          snow[j + 1] = y;
          const sz = snow[j + 2];
          const an = t * (0.7 + snow[j + 4] * 0.5) + ph;
          const ca = Math.cos(an) * sz * 0.5, sa = Math.sin(an) * sz * 0.5;
          const fl = 0.3 + 0.7 * Math.abs(Math.sin(t * 0.9 + ph * 2)); // a bit of paper turning over
          ctx.moveTo(x + ca - sa * fl, y + sa + ca * fl);
          ctx.lineTo(x - ca - sa * fl, y - sa + ca * fl);
          ctx.lineTo(x - ca + sa * fl, y - sa - ca * fl);
          ctx.lineTo(x + ca + sa * fl, y + sa - ca * fl);
          ctx.closePath();
        }
        ctx.fill();
      }

      ctx.restore();
    };

    // rgba strings for the fog veils, rebuilt only when the color or alpha moves
    const veil = [{ k: "", v: "" }, { k: "", v: "" }, { k: "", v: "" }];
    const rgbaCache = (i, color, a) => {
      const q = Math.round(a * 100);
      const e = veil[i];
      if (e.c !== color || e.q !== q) {
        e.c = color;
        e.q = q;
        e.v = rgba(color, q / 100);
      }
      return e.v;
    };

    // ---------------------------------------------------------------- frame
    let lastMs = null, quietUntil = 0, lastPalT = -9, lastPaintT = -9, paintedKey = "", lastTime = "";
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
      f.top.style.transform = f.bot.style.transform = `scaleY(${cover.toFixed(3)})`;
      f.top.firstChild.style.opacity = f.bot.firstChild.style.opacity = ((1 - cover) * 0.42).toFixed(3);
    };

    return {
      frame(s) {
        const __t0 = performance.now(); let __a = 0, __b = 0;
        const jump = lastMs == null || Math.abs(s.ms - lastMs) > 3000;
        lastMs = s.ms;
        if (jump) quietUntil = s.ms + 1500;
        const tx = s.text, w = s.weather;

        if (jump || s.t - lastPalT > 0.4) {
          lastPalT = s.t;
          computePalette(s);
        }

        // what is cut into the sheet
        const stamp = tx.time + tx.ampm;
        let repaint = false;
        if (stamp !== lastTime) {
          lastTime = stamp;
          slotChars(tx.hh, tx.mm, cur);
          curAmpm = tx.ampm;
          setClip();
          rebuildCuts();
          readCuts();
          placeDisc();
          if (jump) {
            discX = discTX;
            discY = discTY;
          }
          ledgeKey = "";
          repaint = true;
        }
        // snow lying on the cuts, ice hanging from them
        const snowing = w.falling === "snow" ? w.intensity : 0;
        const depth = snowing > 0 ? Math.round(lerp(16, 36, snowing) / 4) * 4 : 0;
        const cold = Math.round(clamp((33 - w.temp) / 22) * 5) / 5;
        const lk = `${depth}|${cold}`;
        if (lk !== ledgeKey) {
          ledgeKey = lk;
          buildLedges(depth, cold);
          repaint = true;
        }
        if (repaint || (P.paintKey !== paintedKey && (jump || s.t - lastPaintT > 1.5))) {
          paintedKey = P.paintKey;
          lastPaintT = s.t;
          paintSheet();
          wrap.style.setProperty("--sheet", P.sheet);
          wrap.style.setProperty("--ink", P.ink);
          wrap.style.setProperty("--hl", P.hl);
        }

        __a = performance.now();
        drawScene(s);
        __b = performance.now();

        // weather on the front sheet: damp cockling, cloud shadows
        const damp = (P.wet ? clamp(0.3 + w.intensity * 0.6) : 0) * lerp(1, 0.3, P.n);
        const dq = Math.round(damp * 50) / 50;
        if (shown.damp !== dq) {
          shown.damp = dq;
          cockle.style.opacity = String(dq);
        }
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
            const x = ((((b.x0 + drift * 1.5 * b.k) % 3200) + 3200) % 3200) - 1400;
            b.node.style.transform = `translate(${x.toFixed(1)}px, ${b.y.toFixed(0)}px) scale(${b.sx}, ${b.sy})`;
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
          T.cond.dataset.baseSize = "";
          e = true;
        }
        if (hasFact) {
          put("factLabel", T.factLabel, tx.factLabel);
          put("factValue", T.factValue, tx.factValue);
        }
        { const __e = performance.now(); if (__e - __t0 > 8) console.log('SLOW frame', s.frame, 'pre', (__a-__t0).toFixed(0), 'scene', (__b-__a).toFixed(0), 'post', (__e-__b).toFixed(0)); }
        const __f = performance.now();
        if (a || b || c || d || e) fitText(T.cond, W - 2 * MX - T.temp.offsetWidth - T.ed.offsetWidth - 22 - 36);
        { const __e = performance.now(); if (__e - __t0 > 8) console.warn('SLOWX', s.frame, (__f-__t0).toFixed(0), (__e-__f).toFixed(0)); }
      },
    };
  },
};

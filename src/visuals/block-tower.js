// Clock Tower, Literally.
//
// The screen called Clock Tower becomes one: a teetering stack of painted
// wooden toy blocks. The four big cubes are the time (hours over minutes);
// the pile above them spells the date, the temperature and condition, the
// countdown to sunrise or sunset, the moon phase, air quality and UV; the
// base plank has today's fact burned into it.
//
// How the conditions drive it:
//   wind       every course is a slow spring-damper rocking on an edge of the
//              one below, pushed by the live wind speed and gusts from the live
//              direction (wind from the west leans it to the right); in still
//              air it keeps a slow wobble. The pennant streams downwind, a marble
//              rolls along the groove in the top plank as the stack leans, the
//              hanging sky swings, and in a real gust (about 34 mph and up, at
//              most once a minute) the roof slides off, tumbles away and is
//              dropped back on with a bounce.
//   clock      a cube whose digit changes rolls forward a quarter turn, the
//              stack above it hops and a settle wave runs up the tower.
//   daylight   painted beech by day; at night the wood drops out to near black
//              and the letters turn to glow paint. Ink flips where the face
//              behind it is mid-grey and is always fitted to a contrast ratio.
//   sky        the wall is the sky's measured color in four directions. In
//              front of it hangs a toy-theatre sky of painted plywood cut-outs
//              on threads: clouds lowered in as the real cover thickens (white,
//              then grey, then slate in a storm), a sun when it is day and
//              clear, stars on clear nights; painted drops dangle under the
//              clouds in rain, flakes in snow.
//   cloud/sun  how far apart the lit top, front and shaded side of each block
//              are, the gloss on the paint and the shadow on the table.
//   rain       the wood soaks to wet walnut, drops run down the faces, and a
//              puddle at the foot mirrors the plank and the glowing numerals,
//              rippled and ringed by the drops.
//   snow       a white cap grows on every exposed top and the table drifts
//              over; the caps on the top blocks slide off when the stack rocks.
//   fog        a veil over the wall, the upper courses pale into it, banks drift.
//   heat/cold  hot: saturated paint and a warm glare off the table. Freezing:
//              a frost line along the top edges.
//
// Type is DOM (Fredoka); the blocks are inline SVG inside nested groups, one
// per course. The two courses of time cubes show their rocking as a shift
// (snapped to whole device pixels, so the numerals stay crisp); the plank and
// everything above it really tilt, each on an edge of the course below. Behind
// the tower stands a plywood flat of the Manhattan skyline across the river,
// painted in the measured western sky, its windows lit at night. One canvas in
// front carries rain, snow, drips, the puddle and glints.

import { W, H, TAU, clamp, lerp, smoothstep, approach, ease, rng, createNoise, mix, adjust, rgba, luminance, toOklab, fromOklab, el, addStyle, canvas2d, grain } from "../lib/kit.js";

const KX = 0.2; // oblique projection: a unit of depth moves this far right...
const KY = 0.16; // ...and this far up
const GROUND = 1834; // the table: low enough that the base plank is tall enough to give the fact's two lines room
const CUBE = 430;
const TIP = 0.62; // seconds a cube takes to roll over

const BEECH = "#e8c893";
const WALNUT = "#6a4428";
const NIGHTWOOD = "#17100b";
// [on a light face, on a dark face]
const INK = {
  red: ["#cf2a1f", "#ff9f89"],
  cobalt: ["#1f45ba", "#a6c6ff"],
  green: ["#17753a", "#9df0b7"],
  ink: ["#2a2320", "#f7edd8"],
  burn: ["#4b2a13", "#eccb98"],
  yellow: ["#2a2320", "#ffd65c"],
};
// painted faces: [day, night]
const FACE = {
  yellow: ["#f6b912", "#2a1f08"],
  red: ["#c6291f", "#2a0d0a"],
  cobalt: ["#2147b8", "#0b1230"],
  green: ["#18763b", "#08200f"],
};

const CSS = `
.bt{position:absolute;inset:0;overflow:hidden;background:#05060a;font-family:"Fredoka","Arial Rounded MT Bold","Helvetica Rounded",system-ui,sans-serif;font-weight:700}
.bt div{box-sizing:border-box}
.bt .sky,.bt .swell,.bt .haze{position:absolute;inset:0}
.bt .swell{background:radial-gradient(ellipse 90% 60% at 50% 8%,rgba(196,208,255,.95),rgba(196,208,255,0) 72%);opacity:0;display:none;will-change:opacity}
.bt .stars{position:absolute;left:0;top:0;width:2px;height:2px;border-radius:50%}
.bt .hg{position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0;will-change:transform}
.bt .hg>svg{position:absolute;overflow:visible}
.bt .thr{stroke:var(--thr);stroke-width:1.6;fill:none}
.bt .cf{fill:var(--cf)}.bt .cs{fill:var(--cs)}.bt .cb{fill:var(--cb)}
.bt .cg{fill:none;stroke:var(--cg);stroke-width:1.3;stroke-linecap:round}
.bt .chi{fill:none;stroke:var(--chi);stroke-width:3;stroke-linecap:round}
.bt .sf{fill:var(--sf)}.bt .ss{fill:var(--ss)}
.bt .stf{fill:var(--stf)}.bt .sts{fill:var(--sts)}
.bt .dpf{fill:var(--dpf)}.bt .dps{fill:var(--dps)}
.bt .flk{fill:none;stroke:var(--flk);stroke-width:7;stroke-linecap:round}
.bt .flks{fill:none;stroke:var(--flks);stroke-width:7;stroke-linecap:round}
.bt .drop,.bt .flake{display:none}
.bt[data-fall=rain] .drop,.bt[data-fall=snow] .flake{display:inline}
.bt .fog{position:absolute;left:0;top:0;border-radius:50%;will-change:transform;background:radial-gradient(closest-side,var(--fogc),transparent)}
.bt .floor{position:absolute;left:0;top:${GROUND}px;width:${W}px;height:${H - GROUND}px;background:var(--floor);overflow:hidden}
.bt .floor:before{content:"";position:absolute;left:0;top:0;right:0;height:3px;background:var(--floorline)}
.bt .floor svg{position:absolute;left:0;top:0}
.bt .sk1{fill:var(--sk1)}.bt .sk2{fill:var(--sk2)}.bt .sk3{fill:var(--sk3)}.bt .skw{fill:var(--skw)}
.bt .seam{fill:none;stroke:var(--seam);stroke-width:2}
.bt .shadow{position:absolute;left:44px;top:${GROUND}px;width:1000px;height:${H - GROUND}px;transform-origin:0 0;background:linear-gradient(to bottom,rgba(0,0,0,.62),rgba(0,0,0,.3))}
.bt .contact{position:absolute;left:14px;top:${GROUND}px;width:1052px;height:30px;background:linear-gradient(to bottom,rgba(0,0,0,.42),rgba(0,0,0,0))}
.bt .tower{position:absolute;left:0;top:0}
.bt .grp{position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0;will-change:transform}
.bt .blk{position:absolute}
.bt .blk>svg{position:absolute;overflow:visible}
.bt .ff{fill:var(--f)}.bt .ft{fill:var(--t)}.bt .fs{fill:var(--s)}.bt .fm{fill:var(--m)}
.bt .gr{fill:none;stroke:var(--g);stroke-linecap:round;stroke-linejoin:round}
.bt .g1{stroke-width:1;stroke-opacity:.45}.bt .g2{stroke-width:1.4;stroke-opacity:.7}.bt .g3{stroke-width:2;stroke-opacity:1}
.bt .bev{fill:none;stroke:var(--bev);stroke-width:3;stroke-linecap:round}
.bt .raw{fill:none;stroke:var(--raw);stroke-linecap:round}
.bt .rim{fill:none;stroke:var(--rim);stroke-width:var(--rimw);stroke-linecap:round}
.bt .sheenw{fill:url(#bt-sheen);opacity:var(--sheenw)}
.bt .sheenp{fill:url(#bt-sheen);opacity:var(--sheenp)}
.bt .streak{fill:none;stroke:#1a0c04;stroke-linecap:round;opacity:var(--streak)}
.bt .grv{fill:none;stroke:var(--s);stroke-width:8;stroke-linecap:round}
.bt .grv2{fill:none;stroke:var(--bev);stroke-width:1.5;stroke-linecap:round}
.bt .cap{transform-origin:var(--ox) var(--oy)}
.bt .sn{fill:var(--sn);stroke:var(--sn);stroke-width:6;stroke-linejoin:round}
.bt .sn2{fill:var(--sn2)}
.bt .sn3{fill:none;stroke:var(--sn2);stroke-width:2.5;stroke-linecap:round}
.bt .face{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--ink);text-align:center;white-space:nowrap;text-transform:uppercase;letter-spacing:.02em;text-shadow:0 2px 0 var(--hi),0 -1px 0 var(--lo),0 0 20px var(--halo)}
.bt .face>*{flex:none}
.bt .cube{text-shadow:0 4px 0 var(--hi),0 -2px 0 var(--lo),0 0 46px var(--halo);letter-spacing:0}
.bt .dg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:428px;line-height:1;padding-bottom:10px}
.bt .dg.cur{transform-origin:50% 100%}
.bt .dg.nxt{transform-origin:50% 0;transform:scaleY(0)}
.bt .tsh{position:absolute;inset:0;background:var(--t);transform-origin:50% 0;transform:scaleY(0);opacity:0}
.bt .ted{position:absolute;left:0;right:0;top:-3px;height:6px;background:var(--s);opacity:0}
.bt .row{flex-direction:row;justify-content:flex-start;padding:0 30px 0 44px;gap:52px}
.bt .chip{font-size:46px;line-height:1;padding:11px 18px 13px;border-radius:14px;background:var(--chip);color:var(--chipink);text-shadow:none;box-shadow:inset 0 -3px 0 rgba(0,0,0,.18),inset 0 2px 0 rgba(255,255,255,.14)}
.bt .date{font-size:58px;line-height:1;letter-spacing:.035em}
.bt .temp{font-size:138px;line-height:1;letter-spacing:-.01em;padding-left:.12em}
.bt .cond{font-size:58px;line-height:1.56}
.bt .lab{font-size:30px;line-height:1;letter-spacing:.1em;font-weight:600;margin-bottom:12px}
.bt .val{font-size:58px;line-height:1}
.bt .valb{font-size:76px;line-height:.98}
.bt .moon{font-size:56px;line-height:1;letter-spacing:.03em}
.bt .fact{padding:14px 40px 0;text-shadow:0 1px 0 var(--hi),0 0 5px var(--scorch)}
.bt .flab{font-size:28px;line-height:1;letter-spacing:.14em;font-weight:700;margin-bottom:-4px}
.bt .fval{font-size:44px;line-height:1.95;font-weight:600;white-space:normal;text-transform:none;letter-spacing:.005em;max-width:826px;text-wrap:balance}
.bt .marble{position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;will-change:transform}
.bt .marble b{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 50% 50%,var(--m1) 0 46%,var(--m2) 47% 100%);overflow:hidden}
.bt .marble b:before{content:"";position:absolute;left:-20%;top:38%;width:140%;height:26%;border-radius:50%;background:var(--m3)}
.bt .marble u{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 34% 28%,rgba(255,255,255,var(--mh)) 0 7%,rgba(255,255,255,0) 26%),radial-gradient(circle at 60% 70%,rgba(255,255,255,0) 40%,rgba(0,0,0,.35) 100%)}
.bt .mound{position:absolute;left:0;top:0;transform-origin:0 ${GROUND + 26}px}
.bt .pen{position:absolute;overflow:visible;left:0;top:0;will-change:transform}
.bt .ao{position:absolute;left:0;height:26px;background:linear-gradient(rgba(0,0,0,var(--ao)),rgba(0,0,0,0))}
`;

const DEFS = `<svg width="0" height="0" style="position:absolute"><defs>
<linearGradient id="bt-sheen" x1="0" y1="0" x2="0.25" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".3" stop-color="#fff" stop-opacity=".22"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs></svg>`;

// --- color helpers ----------------------------------------------------------

// Darken (dir -1) or lighten (dir +1) a color just far enough to reach a luminance.
function fitLum(c, target, dir) {
  const lum = luminance(c);
  if (dir < 0 ? lum <= target : lum >= target) return c;
  const lab = toOklab(c);
  let lo = 0;
  let hi = 1;
  let out = dir < 0 ? "#000000" : "#ffffff";
  for (let i = 0; i < 9; i++) {
    const m = (lo + hi) / 2;
    const col = dir < 0 ? fromOklab([lab[0] * (1 - m), lab[1] * (1 - m * 0.55), lab[2] * (1 - m * 0.55)]) : fromOklab([lab[0] + (1 - lab[0]) * m, lab[1] * (1 - m), lab[2] * (1 - m)]);
    if (dir < 0 ? luminance(col) <= target : luminance(col) >= target) {
      hi = m;
      out = col;
    } else lo = m;
  }
  return out;
}
// Paint for letters on a face: the hue's deep version on light faces, its
// pale version on dark ones, each pushed as far as needed to hold `ratio`.
function inkFor(bg, pair, ratio) {
  const lb = luminance(bg);
  const k = smoothstep(0.172, 0.204, lb);
  const dark = k > 0 ? fitLum(pair[0], (lb + 0.05) / ratio - 0.05, -1) : null;
  const light = k < 1 ? fitLum(pair[1], ratio * (lb + 0.05) - 0.05, 1) : null;
  return k >= 1 ? dark : k <= 0 ? light : mix(light, dark, k);
}

// --- wood -------------------------------------------------------------------

const f1 = (v) => v.toFixed(1);

// Fine grain lines for a w x h face, running along x. Returns <path>s.
function grainD(r, w, h, { sp = 7, cath = false } = {}) {
  const d = ["", "", ""];
  const A = r.range(1.5, 4.5);
  const F = r.range(0.004, 0.009);
  const P = r.range(0, TAU);
  const cx = r.range(0.3, 0.7) * w;
  const cy = r.range(0.38, 0.62) * h;
  const sx = r.range(0.14, 0.24) * w;
  const sy = h * r.range(0.2, 0.28);
  const n = Math.floor(h / sp);
  for (let i = 0; i < n; i++) {
    const y0 = (i + r.range(0.15, 0.85)) * sp;
    const k = r() < 0.5 ? 0 : r() < 0.72 ? 1 : 2;
    let x0 = 5;
    let x1 = w - 5;
    if (r() < 0.3) {
      const a = r.range(0, 0.5);
      x0 = Math.max(5, a * w);
      x1 = Math.min(w - 5, (a + r.range(0.3, 0.6)) * w);
    }
    const a2 = r.range(0.3, 1.3);
    const p2 = r.range(0, TAU);
    let s = "";
    for (let x = x0; ; x += 24) {
      const xx = Math.min(x, x1);
      let y = y0 + A * Math.sin(xx * F + P) + a2 * Math.sin(xx * F * 2.7 + p2);
      if (cath) {
        const q = (y0 - cy) / sy;
        const g = (xx - cx) / sx;
        y -= sy * 0.72 * Math.exp(-q * q) * Math.exp(-g * g);
      }
      s += `${s ? "L" : "M"}${f1(xx)} ${f1(clamp(y, 2.5, h - 2.5))}`;
      if (xx >= x1) break;
    }
    d[k] += s;
  }
  return d.map((s, i) => (s ? `<path class="gr g${i + 1}" d="${s}"/>` : "")).join("");
}
// End grain: growth rings, for the short end of a plank.
function ringsD(r, w, h) {
  const cx = r.range(-0.4, 0.6) * w;
  const cy = h * r.range(1.1, 1.9);
  let d = "";
  for (let rad = 14; rad < h * 2.6; rad += r.range(5, 9)) {
    let pen = false;
    for (let a = Math.PI; a <= TAU; a += 7 / rad) {
      const x = cx + rad * Math.cos(a);
      const y = cy + rad * Math.sin(a) * 0.8;
      if (x > 2.5 && x < w - 2.5 && y > 2.5 && y < h - 2.5) {
        d += `${pen ? "L" : "M"}${f1(x)} ${f1(y)}`;
        pen = true;
      } else pen = false;
    }
  }
  return d ? `<path class="gr g2" d="${d}"/>` : "";
}
// Worn edges: short strokes of bare wood (or a paler scuff) along the rim of a face.
function wearD(r, w, h, amount = 1) {
  const d = ["", ""];
  const dash = (x0, y0, ux, uy, len) => {
    const n = Math.round((len / 90) * r.range(0.6, 1.4) * amount) + 1;
    for (let i = 0; i < n; i++) {
      const nearCorner = r() < 0.45;
      const u = nearCorner ? (r() < 0.5 ? r.range(0, 0.1) : r.range(0.9, 1)) : r();
      const l = Math.min(len * 0.2, r.range(5, nearCorner ? 44 : 26));
      const a = clamp(u * len - l / 2, 3, len - l - 3);
      const k = r() < 0.7 ? 0 : 1;
      const wob = r.range(-1, 1);
      d[k] += `M${f1(x0 + ux * a)} ${f1(y0 + uy * a)}l${f1(ux * l * 0.5 + uy * wob)} ${f1(uy * l * 0.5 + ux * wob)}l${f1(ux * l * 0.5 - uy * wob)} ${f1(uy * l * 0.5 - ux * wob)}`;
    }
  };
  dash(0, 2.2, 1, 0, w);
  dash(0, h - 2.2, 1, 0, w);
  dash(2.2, 0, 0, 1, h);
  dash(w - 2.2, 0, 0, 1, h);
  return `<path class="raw" stroke-width="3.2" d="${d[0]}"/><path class="raw" stroke-width="6" d="${d[1]}"/>`;
}
// Faint vertical water stains that show only when the wood is wet.
function streakD(r, w, h) {
  let d = "";
  const n = Math.round(w / 46);
  for (let i = 0; i < n; i++) {
    const x = r.range(8, w - 8);
    const y0 = r.range(0, h * 0.3);
    const len = r.range(h * 0.2, h * 0.75);
    d += `M${f1(x)} ${f1(y0)}q${f1(r.range(-3, 3))} ${f1(len / 2)} ${f1(r.range(-2, 2))} ${f1(Math.min(len, h - y0 - 4))}`;
  }
  return `<path class="streak" stroke-width="${f1(r.range(3, 6))}" d="${d}"/>`;
}

// One block as SVG: lit top, shaded right side, front. Origin is the top left
// of the front face.
function woodMarkup(r, o, dx, dy) {
  const { w, h } = o;
  const painted = Boolean(o.scheme.face);
  const pad = 4;
  let m = `<svg width="${w + dx + pad * 2}" height="${h + dy + pad * 2}" viewBox="${-pad} ${f1(-dy - pad)} ${w + dx + pad * 2} ${f1(h + dy + pad * 2)}" style="left:${-pad}px;top:${f1(-dy - pad)}px">`;
  // top face: local (u, v), v = 0 at the back edge
  m += `<g transform="matrix(1 0 ${(-dx / dy).toFixed(4)} 1 ${f1(dx)} ${f1(-dy)})"><rect class="ft" width="${w}" height="${f1(dy + 0.7)}"/>`;
  if (!painted) m += grainD(r, w, dy, { sp: 4.2 });
  if (o.groove) m += `<path class="grv" d="M34 ${f1(dy * 0.5)}H${w - 34}"/><path class="grv2" d="M34 ${f1(dy * 0.5 + 4.5)}H${w - 34}"/>`;
  m += `</g>`;
  // right side: local (u, v)
  m += `<g transform="matrix(1 ${(-dy / dx).toFixed(4)} 0 1 ${w} 0)"><rect class="fs" x="-0.7" width="${f1(dx + 0.7)}" height="${h}"/>`;
  if (!painted) m += o.rings ? ringsD(r, dx, h) : `<g transform="matrix(0 1 1 0 0 0)">${grainD(r, h, dx, { sp: 5 })}</g>`;
  m += `</g>`;
  // front
  m += `<path class="ff" d="M0 0H${w}V${h}H9Q0 ${h} 0 ${h - 9}Z"/>`;
  if (!painted) {
    const g = o.grain === "v" ? `<g transform="matrix(0 1 1 0 0 0)">${grainD(r, h, w, { sp: 7.5, cath: o.cath })}</g>` : grainD(r, w, h, { sp: 7.5, cath: o.cath });
    m += g + streakD(r, w, h);
  } else {
    m += `<g opacity=".4">${grainD(r, w, h, { sp: 13 })}</g>`;
  }
  m += `<rect class="${painted ? "sheenp" : "sheenw"}" width="${w}" height="${h}"/>`;
  m += wearD(r, w, h, painted ? 1.5 : 0.8);
  m += `<path class="bev" d="M3 1.5H${w - 2}M${f1(w - 1.5)} 3V${h - 3}"/>`;
  m += `<path class="rim" d="M1 0H${w}M${f1(dx + 2)} ${f1(-dy)}H${f1(w + dx - 1)}"/>`;
  return `${m}</svg>`;
}

// The roof: a triangular prism.
function roofMarkup(r, w, h, dx, dy) {
  const pad = 6;
  const c = w / 2;
  let m = `<svg width="${w + dx + pad * 2}" height="${h + dy + pad * 2}" viewBox="${-pad} ${f1(-dy - pad)} ${w + dx + pad * 2} ${f1(h + dy + pad * 2)}" style="left:${-pad}px;top:${f1(-dy - pad)}px">`;
  m += `<path class="ft" d="M0 ${h}L${c} 0L${f1(c + dx)} ${f1(-dy)}L${f1(dx)} ${f1(h - dy)}Z"/>`;
  m += `<path class="fm" d="M${c} 0L${w} ${h}L${f1(w + dx)} ${f1(h - dy)}L${f1(c + dx)} ${f1(-dy)}Z"/>`;
  m += `<path class="ff" stroke-linejoin="round" d="M0 ${h}L${c} 0L${w} ${h}Z"/>`;
  m += `<path class="sheenp" d="M0 ${h}L${c} 0L${w} ${h}Z"/>`;
  // wear along the three front edges
  let d = "";
  const edge = (x0, y0, x1, y1, n) => {
    for (let i = 0; i < n; i++) {
      const u = r() < 0.5 ? r.range(0.02, 0.2) : r.range(0.25, 0.98);
      const l = r.range(0.03, 0.09);
      d += `M${f1(lerp(x0, x1, u))} ${f1(lerp(y0, y1, u))}L${f1(lerp(x0, x1, Math.min(1, u + l)))} ${f1(lerp(y0, y1, Math.min(1, u + l)))}`;
    }
  };
  edge(6, h - 3, c, 4, 4);
  edge(c, 4, w - 6, h - 3, 4);
  edge(8, h - 2.5, w - 8, h - 2.5, 5);
  m += `<path class="raw" stroke-width="3.6" d="${d}"/>`;
  m += `<path class="bev" d="M4 ${h - 2}L${c} 2.5"/>`;
  m += `<path class="rim" d="M${c} 0L${f1(c + dx)} ${f1(-dy)}M2 ${h - 1}L${c} 0"/>`;
  return `${m}</svg>`;
}

export default {
  title: "Clock Tower, Literally",
  description: "A teetering stack of painted wooden toy blocks spells the hour and sways in the real wind; rain soaks it, snow caps it, night turns the letters to glow paint.",
  fonts: ["Fredoka:wdth,wght@75..125,300..700"],
  fontFaces: ['700 16px "Fredoka"', '600 16px "Fredoka"'],
  fps: 30,

  mount(root, { state, seed }) {
    const r = rng(seed);
    const noise = createNoise(seed ^ 0x5bd1);
    addStyle(root, CSS);
    const wrap = el("div", { class: "bt" });
    root.append(wrap);
    wrap.insertAdjacentHTML("beforeend", DEFS);

    // ----- behind the tower ---------------------------------------------------
    const skyEl = el("div", { class: "sky" });
    const starEl = el("div", { class: "stars" });
    {
      const sh = [];
      for (let i = 0; i < 90; i++) {
        const big = r() < 0.18;
        sh.push(`${Math.round(r.range(10, W - 10))}px ${Math.round(r.range(10, GROUND - 40))}px 0 ${big ? 1 : 0}px rgba(232,238,255,${r.range(0.35, 0.95).toFixed(2)})`);
      }
      starEl.style.boxShadow = sh.join(",");
    }
    const swellEl = el("div", { class: "swell" });
    // The sky is a toy theatre: painted plywood cut-outs (clouds, a sun, stars)
    // hanging on threads from the top of the frame, each a pendulum the real
    // wind pushes. How many clouds hang, and how grey, is the real cloud cover.
    const hangLayer = el("div", { class: "sky" });
    const HK = 0.2 * 34; // cut-out thickness, in the same oblique projection as the blocks
    const HY = 0.16 * 34;
    const hangs = [];
    function hangNode(ax, L, inner, period, kind, th = 0) {
      const node = el("div", { class: "hg", style: { left: `${ax}px` } });
      node.innerHTML = `<svg width="10" height="10"><path class="thr" d="M0 -40V${f1(L + 4)}"/><g transform="translate(0 ${f1(L)})">${inner}</g></svg>`;
      hangLayer.append(node);
      const h = { node, kind, th, op: -1, lift: L + (kind === "cloud" ? 400 : kind === "sun" ? 220 : 70), arm: L + (kind === "cloud" ? 80 : kind === "sun" ? 92 : 20), k: (TAU / period) ** 2, c: 2 * 0.09 * (TAU / period), a: 0, v: 0, gain: 0.6 + 0.6 * (L / 400), hx: NaN, hy: NaN };
      hangs.push(h);
      return h;
    }
    // extruded copies behind a shape, then the shape itself
    const slab = (shape, front, side) => `<g class="${side}" transform="translate(${f1(HK)} ${f1(-HY)})">${shape}</g><g class="${side}" transform="translate(${f1(HK * 0.5)} ${f1(-HY * 0.5)})">${shape}</g><g class="${front}">${shape}</g>`;
    const tear = (x, y, s) => `<path d="M${f1(x)} ${f1(y - 26 * s)}C${f1(x + 5 * s)} ${f1(y - 14 * s)} ${f1(x + 16 * s)} ${f1(y - 4 * s)} ${f1(x + 16 * s)} ${f1(y + 6 * s)}A${f1(16 * s)} ${f1(16 * s)} 0 1 1 ${f1(x - 16 * s)} ${f1(y + 6 * s)}C${f1(x - 16 * s)} ${f1(y - 4 * s)} ${f1(x - 5 * s)} ${f1(y - 14 * s)} ${f1(x)} ${f1(y - 26 * s)}Z"/>`;
    const flakeD = (x, y, rr) => {
      let d = "";
      for (let k = 0; k < 3; k++) {
        const an = (k * Math.PI) / 3 + Math.PI / 2;
        const ux = Math.cos(an) * rr;
        const uy = Math.sin(an) * rr;
        d += `M${f1(x - ux)} ${f1(y - uy)}L${f1(x + ux)} ${f1(y + uy)}`;
        d += `M${f1(x + ux * 0.62 - uy * 0.25)} ${f1(y + uy * 0.62 + ux * 0.25)}L${f1(x + ux * 0.62)} ${f1(y + uy * 0.62)}L${f1(x + ux * 0.62 + uy * 0.25)} ${f1(y + uy * 0.62 - ux * 0.25)}`;
        d += `M${f1(x - ux * 0.62 - uy * 0.25)} ${f1(y - uy * 0.62 + ux * 0.25)}L${f1(x - ux * 0.62)} ${f1(y - uy * 0.62)}L${f1(x - ux * 0.62 + uy * 0.25)} ${f1(y - uy * 0.62 - ux * 0.25)}`;
      }
      return d;
    };
    // the sun: a painted disc with a ring of rays, hung in a fixed place
    {
      let rays = "";
      for (let k = 0; k < 12; k++) {
        const an = (k / 12) * TAU + 0.13;
        const c1 = Math.cos(an - 0.13);
        const s1 = Math.sin(an - 0.13);
        const c2 = Math.cos(an + 0.13);
        const s2 = Math.sin(an + 0.13);
        rays += `M${f1(c1 * 60)} ${f1(s1 * 60 + 92)}L${f1(Math.cos(an) * 98)} ${f1(Math.sin(an) * 98 + 92)}L${f1(c2 * 60)} ${f1(s2 * 60 + 92)}Z`;
      }
      const shape = `<path d="${rays}"/><circle cx="0" cy="92" r="66"/>`;
      const inner = `${slab(shape, "sf", "ss")}<circle class="chi" cx="0" cy="92" r="56" opacity=".35" stroke-dasharray="40 30 70 24"/><circle class="cg" cx="0" cy="92" r="40"/><circle class="cg" cx="-4" cy="95" r="24"/>`;
      hangNode(196, 20, inner, 3.4, "sun");
    }
    // stars for clear nights, small and high
    {
      const spots = [[60, 70, 15], [138, 160, 21], [262, 36, 13], [372, 128, 18], [470, 54, 14], [1012, 150, 17], [990, 40, 12]];
      for (const [x, L, rr] of spots) {
        let d = "";
        for (let k = 0; k < 10; k++) {
          const an = (k / 10) * TAU - Math.PI / 2;
          const q = k % 2 ? rr * 0.45 : rr;
          d += `${k ? "L" : "M"}${f1(Math.cos(an) * q)} ${f1(Math.sin(an) * q + rr)}`;
        }
        hangNode(x, L, slab(`<path stroke-linejoin="round" d="${d}Z"/>`, "stf", "sts"), r.range(2.2, 3.2), "star");
      }
    }
    // the clouds, in the order they appear as the cover thickens
    const CLOUD = [
      { x: 330, L: 46, w: 380, th: 12 },
      { x: 1000, L: 128, w: 300, th: 24 },
      { x: 84, L: 196, w: 300, th: 36 },
      { x: 640, L: 4, w: 330, th: 48 },
      { x: 170, L: 4, w: 290, th: 60 },
      { x: 900, L: 2, w: 280, th: 72 },
      { x: 470, L: 140, w: 300, th: 84 },
    ];
    let clipN = 0;
    for (const c of CLOUD) {
      const cw = c.w;
      const ch = cw * r.range(0.4, 0.48);
      const n = r() < 0.5 ? 3 : 4;
      const parts = [];
      // a flat-bottomed body and a row of bumps; the biggest bump is where the thread ties on
      let big = 0;
      let bigR = 0;
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        const rad = ch * (k === 0 || k === n - 1 ? r.range(0.3, 0.38) : r.range(0.42, 0.52));
        const cx = (u - 0.5) * cw * 0.78;
        parts.push([cx, ch - rad * 0.72 - ch * 0.18, rad]);
        if (rad > bigR) {
          bigR = rad;
          big = k;
        }
      }
      const ox = parts[big][0];
      const oy = parts[big][1] - parts[big][2];
      let shape = `<rect x="${f1(-cw / 2 - ox)}" y="${f1(ch * 0.46 - oy)}" width="${f1(cw)}" height="${f1(ch * 0.54)}" rx="${f1(ch * 0.27)}"/>`;
      for (const [cx, cy, rad] of parts) shape += `<circle cx="${f1(cx - ox)}" cy="${f1(cy - oy)}" r="${f1(rad)}"/>`;
      const id = `bt-cl${clipN++}`;
      let gr = "";
      for (let k = 0; k < 6; k++) {
        const yy = ch * (0.3 + k * 0.12) - oy + r.range(-4, 4);
        gr += `M${f1(-cw / 2 - ox)} ${f1(yy)}C${f1(-cw * 0.2 - ox)} ${f1(yy + r.range(-7, 7))} ${f1(cw * 0.2 - ox)} ${f1(yy + r.range(-7, 7))} ${f1(cw / 2 - ox)} ${f1(yy + r.range(-4, 4))}`;
      }
      let hl = "";
      for (const [cx, cy, rad] of parts) {
        const x0 = cx - ox;
        const y0 = cy - oy;
        hl += `M${f1(x0 - rad * 0.72)} ${f1(y0 - rad * 0.36)}A${f1(rad * 0.8)} ${f1(rad * 0.8)} 0 0 1 ${f1(x0 + rad * 0.1)} ${f1(y0 - rad * 0.8)}`;
      }
      // what hangs under it: painted drops in rain, flakes in snow
      let drops = "";
      let flakes = "";
      const nd = cw > 320 ? 3 : 2;
      for (let k = 0; k < nd; k++) {
        const x = ((k + 0.5) / nd - 0.5) * cw * 0.7 - ox + r.range(-10, 10);
        const top = ch - oy;
        const len = r.range(26, 90);
        drops += `<path class="thr" d="M${f1(x)} ${f1(top)}V${f1(top + len)}"/>${slab(tear(x, top + len + 30, 1.25), "dpf", "dps")}`;
        flakes += `<path class="thr" d="M${f1(x)} ${f1(top)}V${f1(top + len)}"/><g transform="translate(${f1(HK * 0.6)} ${f1(-HY * 0.6)})"><path class="flks" d="${flakeD(x, top + len + 22, 22)}"/></g><path class="flk" d="${flakeD(x, top + len + 22, 22)}"/>`;
      }
      const inner = `<defs><clipPath id="${id}">${shape}</clipPath></defs><g class="drop">${drops}</g><g class="flake">${flakes}</g>${slab(shape, "cf", "cs")}<g clip-path="url(#${id})"><rect class="cb" x="${f1(-cw / 2 - ox)}" y="${f1(ch * 0.78 - oy)}" width="${f1(cw)}" height="${f1(ch)}"/><path class="cg" d="${gr}"/></g><path class="chi" d="${hl}"/>`;
      hangNode(c.x, c.L, inner, r.range(2.6, 4.2), "cloud", c.th);
    }
    // Behind the tower, a toy-theatre flat of what the studio window looks at:
    // the Manhattan skyline across the East River, cut from plywood (a far row
    // of low blocks, then the near towers with a visible edge), painted in the
    // measured western sky and dark against it. It shows round the sides of the
    // stack, and fully in the gaps beside a single hour cube. Windows glow at night.
    const skylineEl = el("div", { class: "sky" });
    {
      const sr = rng(seed ^ 0x2c1f);
      const G = GROUND;
      const outline = (cx, pts) => {
        let d = "";
        for (let i = 0; i < pts.length; i++) d += `${i ? "L" : "M"}${f1(cx + pts[i][0])} ${f1(pts[i][1])}`;
        for (let i = pts.length - 1; i >= 0; i--) d += `L${f1(cx - pts[i][0])} ${f1(pts[i][1])}`;
        return `${d}Z`;
      };
      const box = (x, w, t) => `M${f1(x)} ${G}V${f1(t)}H${f1(x + w)}V${G}Z`;
      let far = "";
      let near = "";
      let win = "";
      const windows = (x0, x1, t, p) => {
        for (let x = x0 + 7; x < x1 - 9; x += 15) {
          for (let y = t + 16; y < 1640; y += 21) if (sr() < p) win += `M${x} ${y}h6v9h-6Z`;
        }
      };
      for (let x = -30; x < W + 30; ) {
        const w = sr.range(52, 118);
        far += box(x, w - 3, sr.range(1080, 1420));
        x += w;
      }
      // mid-rise towers, then the landmarks: Empire State to the south-west
      // (left), the Secretariat at the left edge, Chrysler and One Vanderbilt
      // to the north-west (right)
      for (const [x, w, t] of [[-20, 80, 1180], [70, 74, 980], [218, 70, 1040], [790, 64, 1010], [990, 46, 1120], [1040, 70, 930]]) {
        near += box(x, w, t);
        windows(x, x + w, t, 0.2);
      }
      const t1 = 768;
      near += outline(150, [[-62, G], [-62, t1 + 262], [-46, t1 + 262], [-46, t1 + 172], [-33, t1 + 172], [-33, t1 + 112], [-22, t1 + 112], [-22, t1 + 72], [-11, t1 + 72], [-11, t1 + 42], [-3, t1 + 42], [-3, t1]]);
      windows(104, 196, t1 + 120, 0.24);
      near += outline(10, [[-70, G], [-70, 1000]]);
      windows(-60, 80, 1000, 0.22);
      const t2 = 790;
      near += outline(918, [[-48, G], [-48, t2 + 232], [-38, t2 + 232], [-38, t2 + 172], [-30, t2 + 172], [-30, t2 + 150], [-24, t2 + 122], [-24, t2 + 112], [-17, t2 + 90], [-17, t2 + 82], [-10, t2 + 58], [-10, t2 + 50], [-2, t2 + 20], [-2, t2]]);
      windows(872, 966, t2 + 180, 0.24);
      const t3 = 700;
      near += outline(1050, [[-54, G], [-54, t3 + 330], [-40, t3 + 205], [-31, t3 + 195], [-23, t3 + 95], [-17, t3 + 86], [-4, t3 + 30], [-2, t3]]);
      windows(1000, 1100, t3 + 340, 0.2);
      skylineEl.innerHTML = `<svg width="${W}" height="${H}" style="position:absolute;left:0;top:0"><path class="sk1" d="${far}"/><g transform="translate(${f1(HK)} ${f1(-HY)})"><path class="sk3" d="${near}"/></g><path class="sk2" d="${near}"/><path class="skw" d="${win}"/></svg>`;
    }
    const fogBack = el("div", { class: "sky" });
    const fogFront = el("div", { class: "sky" });
    const fogs = [];
    for (let i = 0; i < 7; i++) {
      const front = i >= 4;
      const fw = r.range(900, 1400);
      const fh = r.range(240, 420);
      const node = el("div", { class: "fog", style: { width: `${fw.toFixed(0)}px`, height: `${fh.toFixed(0)}px` } });
      (front ? fogFront : fogBack).append(node);
      fogs.push({ node, w: fw, x: r.range(-fw, W), y: front ? r.range(60, 1000) : r.range(0, 1500), sp: r.range(5, 13) * r.sign(), k: front ? r.range(0.24, 0.32) : r.range(0.55, 0.85) });
    }
    const floorEl = el("div", { class: "floor" });
    {
      // floorboards running toward the viewer, in the blocks' projection
      let d = "";
      const fh = H - GROUND;
      for (let x = -40 + r.range(0, 60); x < W + 200; x += 128) d += `M${f1(x)} 3L${f1(x - (fh * KX) / KY)} ${fh}`;
      floorEl.innerHTML = `<svg width="${W}" height="${fh}"><path class="seam" d="${d}"/></svg>`;
    }
    const shadowEl = el("div", { class: "shadow" });
    const contactEl = el("div", { class: "contact" });
    const tower = el("div", { class: "tower" });
    const hazeEl = el("div", { class: "haze" });
    wrap.append(skyEl, starEl, skylineEl, hangLayer, swellEl, hazeEl, fogBack, floorEl, shadowEl, contactEl, tower);

    // ----- the tower ----------------------------------------------------------
    const blocks = [];
    function mk(parent, o) {
      const dx = o.D * KX;
      const dy = o.D * KY;
      const node = el("div", { class: "blk", style: { left: `${o.x}px`, top: `${o.y}px`, width: `${o.w}px`, height: `${o.h}px` } });
      node.innerHTML = (o.roof ? roofMarkup(r, o.w, o.h, dx, dy) : woodMarkup(r, o, dx, dy)) + `<svg class="cap"></svg>`;
      const face = el("div", { class: `face ${o.cls || ""}` });
      if (o.course > 0) node.append(el("div", { class: "ao", style: { top: `${o.h}px`, width: `${o.w}px` } }));
      node.append(face);
      parent.append(node);
      const b = { node, face, o, dx, dy, vars: {}, cap: node.querySelector(".cap"), g: -1, ink: "" };
      blocks.push(b);
      return b;
    }
    const group = (parent) => {
      const g = el("div", { class: "grp" });
      parent.append(g);
      return g;
    };
    const jit = (a) => Math.round(r.range(-a, a));

    // which of the four time cubes is the painted one, and which hue the others get
    const cubeSchemes = r.shuffle([{ ink: "red" }, { ink: "cobalt" }, { ink: "green" }, { face: "yellow", ink: "yellow" }]);
    const cubeO = (x, y, i) => ({ x, y, w: CUBE, h: CUBE, D: CUBE, scheme: cubeSchemes[i], grain: r() < 0.5 ? "v" : "h", cath: true, course: i < 2 ? 2 : 1, ratio: 3.25, cls: "cube" });

    const base = mk(tower, { x: 44, y: 1600, w: 906, h: GROUND - 1600, D: 470, scheme: { ink: "burn" }, grain: "h", rings: true, course: 0, cls: "fact", capT: 16 });
    const C1 = group(tower);
    const j2 = jit(6);
    const hourX = [64 + j2, 500 + j2, 282 + j2];
    const mL = mk(C1, cubeO(64, 1170, 2));
    const mR = mk(C1, cubeO(500, 1170, 3));
    const C2 = group(C1);
    const hL = mk(C2, cubeO(hourX[0], 740, 0));
    const hR = mk(C2, cubeO(hourX[1], 740, 1));
    const C3 = group(C2);
    const plank = mk(C3, { x: 47 + jit(5), y: 622, w: 900, h: 118, D: 330, scheme: { ink: "ink" }, grain: "h", rings: true, course: 3, cls: "row" });
    const C4 = group(C3);
    const j4 = jit(6);
    const tempB = mk(C4, { x: 72 + j4, y: 402, w: 244, h: 220, D: 240, scheme: { face: "cobalt", ink: "ink" }, course: 4 });
    const condB = mk(C4, { x: 322 + j4, y: 402, w: 380, h: 220, D: 260, scheme: { ink: "red" }, grain: "h", cath: true, course: 4 });
    const sunB = mk(C4, { x: 708 + j4, y: 402, w: 236, h: 220, D: 220, scheme: { face: "yellow", ink: "yellow" }, course: 4 });
    const G5a = group(C4);
    const j5 = jit(8);
    const moonB = mk(G5a, { x: 98 + j5, y: 298, w: 470, h: 104, D: 260, scheme: { ink: "cobalt" }, grain: "h", rings: true, groove: true, course: 5, capT: 15 });
    const G5b = group(C4);
    const j6 = jit(5);
    const aqiB = mk(G5b, { x: 578 + j6, y: 242, w: 160, h: 160, D: 160, scheme: { face: "green", ink: "ink" }, course: 5 });
    const uvB = mk(G5b, { x: 744 + j6, y: 242, w: 160, h: 160, D: 160, scheme: { ink: "green" }, grain: "v", course: 5 });
    const roofG = group(G5b);
    const roofB = mk(roofG, { x: 568 + j6, y: 142, w: 346, h: 100, D: 160, scheme: { face: "red", ink: "ink" }, course: 6, roof: true });
    const groups = [C1, C2, C3, C4, G5a, G5b];

    // pennant on the roof's peak
    const penX = roofB.o.w / 2 + roofB.dx * 0.5;
    const penY = -roofB.dy * 0.5;
    roofB.node.insertAdjacentHTML(
      "afterbegin",
      `<svg class="pen" width="10" height="10"><path class="fs" d="M${f1(penX - 3)} ${f1(penY + 4)}V${f1(penY - 84)}h6V${f1(penY + 4)}Z"/><circle class="ft" cx="${f1(penX)}" cy="${f1(penY - 88)}" r="7"/><path class="flag" d=""/></svg>`,
    );
    const flagEl = roofB.node.querySelector(".flag");

    // marble in the groove of the top plank
    const marble = el("div", { class: "marble" }, el("b"), el("u"));
    const marbleShadow = el("div", { style: { position: "absolute", left: "0", top: "0", width: "40px", height: "10px", margin: "-5px 0 0 -20px", borderRadius: "50%", background: "rgba(0,0,0,.4)", willChange: "transform" } });
    G5a.append(marbleShadow, marble);
    const MAR = { u0: 56, u1: moonB.o.w - 56, s: r.range(80, 300), v: 0, shown: -1 };

    // ----- text ---------------------------------------------------------------
    const T = {};
    const digitFace = (b) => {
      const sh = el("div", { class: "tsh" });
      const cur = el("div", { class: "dg cur" });
      const nxt = el("div", { class: "dg nxt" });
      const ed = el("div", { class: "ted" });
      b.face.append(sh, cur, nxt, ed);
      return { b, cur, nxt, sh, ed, val: null, to: null, t0: -1 };
    };
    const slots = [digitFace(hL), digitFace(hR), digitFace(mL), digitFace(mR)];
    T.ampm = el("div", { class: "chip" });
    T.date = el("div", { class: "date" });
    plank.face.append(T.ampm, T.date);
    T.temp = el("div", { class: "temp" });
    tempB.face.append(T.temp);
    T.cond1 = el("div", { class: "cond" });
    T.cond2 = el("div", { class: "cond" });
    condB.face.append(T.cond1, T.cond2);
    T.sunLabel = el("div", { class: "lab" });
    T.sunValue = el("div", { class: "val" });
    sunB.face.append(T.sunLabel, T.sunValue);
    T.moon = el("div", { class: "moon" });
    moonB.face.append(T.moon);
    T.aqi = el("div", { class: "valb" });
    aqiB.face.append(el("div", { class: "lab", text: "AQI" }), T.aqi);
    T.uv = el("div", { class: "valb" });
    uvB.face.append(el("div", { class: "lab", text: "UV" }), T.uv);
    T.factLabel = el("div", { class: "flab" });
    T.factValue = el("div", { class: "fval" });
    base.face.append(T.factLabel, T.factValue);

    // ----- in front of the tower ---------------------------------------------
    const moundEl = el("div", { class: "mound" });
    {
      let d = `M-10 ${H + 10}V${GROUND + 6}`;
      for (let x = -10; x <= W + 40; x += 36) d += `Q${x + 18} ${f1(GROUND - 4 - r.range(0, 1) * (x > 30 && x < 1000 ? 20 : 34))} ${x + 36} ${f1(GROUND + 2 - r.range(0, 9))}`;
      d += `V${H + 10}Z`;
      moundEl.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0"><path style="fill:var(--sn)" d="${d}"/></svg>`;
    }
    wrap.append(moundEl, fogFront);
    const fx = canvas2d(wrap, { adaptive: true, maxScale: 0.7 });
    // its own compositor layer, so redrawing it never repaints what lies under it
    fx.canvas.style.willChange = "transform";
    grain(wrap, { opacity: 0.05 });

    // ----- snow caps ----------------------------------------------------------
    function buildCap(b, uppers) {
      const { w } = b.o;
      const { dx, dy } = b;
      const t = b.o.capT || 20;
      const cr = rng(seed + Math.round(b.o.x * 7 + b.o.y));
      let iv = [[0, w]];
      for (const u of uppers) {
        const a = u.o.x - b.o.x - 5;
        const c = u.o.x + u.o.w - b.o.x + 5;
        iv = iv.flatMap(([p, q]) => (c <= p || a >= q ? [[p, q]] : [[p, Math.min(q, a)], [Math.max(p, c), q]])).filter(([p, q]) => q - p > 12);
      }
      const open = (x) => iv.some(([p, q]) => x > p + 3 && x < q - 3);
      let d = `M-2 0L-2 ${-t}L${f1(dx - 2)} ${f1(-t - dy)}`;
      for (let x = dx + 20; x < w + dx - 10; x += cr.range(28, 60)) d += `L${f1(x)} ${f1(-t - dy - cr.range(0, 5))}`;
      d += `L${f1(w + dx + 2)} ${f1(-t - dy)}L${f1(w + dx + 2)} ${f1(-dy)}L${w + 2} 0`;
      for (let x = w - 8; x > 4; x -= cr.range(16, 30)) d += `L${f1(x)} ${open(x) ? f1(cr.range(2, 10)) : "-1"}`;
      d += "Z";
      const m = `<path class="sn" d="${d}"/><path class="sn2" d="M${w + 1} ${-t + 2}L${f1(w + dx + 1)} ${f1(-t - dy + 2)}L${f1(w + dx + 1)} ${f1(-dy)}L${w + 1} 0Z" opacity=".75"/><path class="sn3" d="M2 ${-t}H${w}L${f1(w + dx - 2)} ${f1(-t - dy)}"/>`;
      const pad = 14;
      const top = t + dy + pad;
      b.cap.setAttribute("width", w + dx + pad * 2);
      b.cap.setAttribute("height", top + pad);
      b.cap.setAttribute("viewBox", `${-pad} ${f1(-top)} ${w + dx + pad * 2} ${f1(top + pad)}`);
      b.cap.style.left = `${-pad}px`;
      b.cap.style.top = `${f1(-top)}px`;
      b.cap.style.setProperty("--ox", `${pad}px`);
      b.cap.style.setProperty("--oy", `${f1(top)}px`);
      b.cap.innerHTML = m;
    }
    {
      // the roof's cap follows its slopes
      const { w, h } = roofB.o;
      const { dx, dy } = roofB;
      const c = w / 2;
      const pad = 16;
      const top = dy + pad + 12;
      roofB.cap.setAttribute("width", w + dx + pad * 2);
      roofB.cap.setAttribute("height", h + top + pad);
      roofB.cap.setAttribute("viewBox", `${-pad} ${f1(-top)} ${w + dx + pad * 2} ${f1(h + top + pad)}`);
      roofB.cap.style.left = `${-pad}px`;
      roofB.cap.style.top = `${f1(-top)}px`;
      roofB.cap.style.setProperty("--ox", `${f1(pad + c)}px`);
      roofB.cap.style.setProperty("--oy", `${f1(top + h)}px`);
      roofB.cap.innerHTML = `<path class="sn" d="M${f1(c + 4)} -4L${w - 30} ${h - 30}L${f1(w + dx - 34)} ${f1(h - dy - 34)}L${f1(c + dx)} ${f1(-dy - 6)}Z"/><path style="fill:none;stroke:var(--sn);stroke-width:17;stroke-linecap:round;stroke-linejoin:round" d="M26 ${h - 26}L${c} -5L${w - 26} ${h - 27}"/>`;
    }

    // ----- layout that depends on the hour having one digit or two ------------
    // Each rocking joint: natural period, damping, how far a unit of wind
    // pressure tips it, the joint it rides on, and where it touches (cl..cr at iy).
    const OSC = [
      { T: 5.4, z: 0.2, A: 0.0052, par: -1, cl: 64, cr: 930, iy: 1600, gain: 1 }, // minutes on the base
      { T: 4.7, z: 0.2, A: 0.0076, par: 0, cl: 64, cr: 930, iy: 1170, gain: 1 }, // hours on minutes
      { T: 4.1, z: 0.19, A: 0.011, par: 1, cl: 64, cr: 930, iy: 740, gain: 1 }, // plank on hours
      { T: 3.6, z: 0.18, A: 0.015, par: 2, cl: tempB.o.x, cr: sunB.o.x + sunB.o.w, iy: 622, gain: 1 },
      { T: 3.2, z: 0.17, A: 0.02, par: 3, cl: moonB.o.x, cr: moonB.o.x + moonB.o.w, iy: 402, gain: 1 },
      { T: 2.9, z: 0.17, A: 0.022, par: 3, cl: aqiB.o.x, cr: uvB.o.x + uvB.o.w, iy: 402, gain: 1 },
    ];
    // the middle of each course, the point whose displacement moves it on screen
    const CH = [430, 430, 118, 220, 104, 160];
    for (let j = 0; j < OSC.length; j++) {
      const o = OSC[j];
      o.cxk = (o.cl + o.cr) / 2;
      o.cyk = o.iy - CH[j] / 2;
    }
    for (const o of OSC) {
      o.w2 = (TAU / o.T) ** 2;
      o.c = 2 * o.z * (TAU / o.T);
    }
    const NO = OSC.length;
    const phi = new Float32Array(NO);
    const om = new Float32Array(NO);
    const acc = new Float32Array(NO);
    const hopY = new Float32Array(NO);
    const KICK = [0.002, 0.004, 0.006, 0.008, 0.013, 0.015];
    const NK = 24;
    const kickT = new Float32Array(NK).fill(-1);
    const kickJ = new Uint8Array(NK);
    const kickV = new Float32Array(NK);
    function thunk(t, strength, from = 0) {
      const sign = r() < 0.5 ? -1 : 1;
      for (let j = from; j < NO; j++) {
        for (let k = 0; k < NK; k++) {
          if (kickT[k] < 0) {
            kickT[k] = t + 0.06 * (j - from);
            kickJ[k] = j;
            kickV[k] = strength * KICK[j] * sign * (j % 2 ? -1 : 1);
            break;
          }
        }
      }
    }

    let hourDigits = 0;
    function layoutHours(n) {
      hourDigits = n;
      const single = n === 1;
      hL.node.style.display = single ? "none" : "";
      hR.o.x = single ? hourX[2] : hourX[1];
      hR.node.style.left = `${hR.o.x}px`;
      const l = single ? hR.o.x : hL.o.x;
      const rt = hR.o.x + CUBE;
      OSC[1].cl = OSC[2].cl = l;
      OSC[1].cr = OSC[2].cr = rt;
      OSC[1].cxk = OSC[2].cxk = (l + rt) / 2;
      OSC[1].gain = single ? 1.3 : 1;
      OSC[2].gain = single ? 1.6 : 1;
      const hours = single ? [hR] : [hL, hR];
      buildCap(base, [mL, mR]);
      buildCap(mL, hours);
      buildCap(mR, hours);
      buildCap(hL, [plank]);
      buildCap(hR, [plank]);
    }
    buildCap(plank, [tempB, condB, sunB]);
    for (const b of [tempB, condB, sunB]) buildCap(b, [moonB, aqiB, uvB]);
    buildCap(moonB, []);
    buildCap(aqiB, [roofB]);
    buildCap(uvB, [roofB]);

    // front faces rain can run down: [group index + 1 (0 = fixed), block]
    const faces = [[0, base], [1, mL], [1, mR], [2, hL], [2, hR], [3, plank], [4, tempB], [4, condB], [4, sunB], [5, moonB], [6, aqiB], [6, uvB]];
    // world matrix of each group (index 0 is the identity)
    const M = new Float32Array(7 * 6);
    M[0] = M[3] = 1;

    // ----- particles ------------------------------------------------------------
    const NR = 300;
    const rain = new Float32Array(NR * 4); // x, y, length, speed
    for (let i = 0; i < NR; i++) rain.set([r.range(-200, W + 200), r.range(-100, H), r.range(34, 80), r.range(1300, 2000)], i * 4);
    const NS = 380;
    const snow = new Float32Array(NS * 5); // x, y, radius, fall speed, phase
    for (let i = 0; i < NS; i++) snow.set([r.range(0, W), r.range(0, H), r.range(1.6, 5.2), r.range(55, 150), r.range(0, TAU)], i * 5);
    const ND = 64;
    const drip = new Float32Array(ND * 5); // face, u (0..1), y, speed, length
    const newDrip = (i, fresh) => {
      const fi = r.int(0, faces.length - 1);
      const b = faces[fi][1];
      const j = i * 5;
      drip[j] = fi;
      drip[j + 1] = r.range(0.04, 0.96);
      drip[j + 2] = fresh ? r.range(0, b.o.h) : -r.range(0, 30);
      drip[j + 3] = r.range(26, 120);
      drip[j + 4] = r.range(12, 38);
    };
    for (let i = 0; i < ND; i++) newDrip(i, true);
    const NRING = 8;
    const ring = new Float32Array(NRING * 3).fill(9); // x, y, age
    let ringNext = 0;
    let fxDirty = false;

    // ----- state that eases -----------------------------------------------------
    const shown = {};
    const put = (key, node, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };
    function fit(node, maxW, baseSize, min) {
      const st = node.style;
      st.fontStretch = "100%";
      st.fontSize = `${baseSize}px`;
      let w = Math.max(node.scrollWidth, node.offsetWidth);
      if (w > maxW) {
        const fs = Math.max(min, Math.floor((baseSize * maxW) / w));
        st.fontSize = `${fs}px`;
        w = Math.max(node.scrollWidth, node.offsetWidth);
        if (w > maxW) st.fontStretch = `${Math.max(75, Math.floor((100 * maxW) / w) - 1)}%`;
      }
    }
    const setVar = (b, name, value) => {
      if (b.vars[name] === value) return;
      b.vars[name] = value;
      b.node.style.setProperty(name, value);
    };
    const gvars = {};
    const setG = (name, value) => {
      if (gvars[name] === value) return;
      gvars[name] = value;
      wrap.style.setProperty(name, value);
    };
    const styleIf = (key, node, prop, value) => {
      if (shown[key] === value) return;
      shown[key] = value;
      node.style[prop] = value;
    };

    const E = { wet: 0, puddle: 0, snow: 0, fog: 0, first: true, lastMs: 0, palKey: "", dirS: 1, pa: 0, swell: 0, swellNext: 6, heat: 0, frost: 0 };
    const roof = { mode: 0, t0: 0, next: 24 + r.range(0, 30), dir: 1, x: 0, y: 0, rot: 0, capG: 1, capDrop: -1 };
    const moonCap = { g: 1, drop: -1, dir: 1, last: -99 };

    // ----- text -----------------------------------------------------------------
    function setDigit(sl, ch) {
      sl.val = ch;
      sl.to = null;
      sl.t0 = -1;
      sl.cur.textContent = ch;
      sl.cur.style.transform = "";
      sl.nxt.style.transform = "";
      sl.sh.style.transform = "";
      sl.sh.style.opacity = "0";
      sl.ed.style.opacity = "0";
    }
    function texts(s, jump) {
      const tx = s.text;
      const hh = tx.hh;
      const mm = tx.mm;
      if (hh.length !== hourDigits) {
        layoutHours(hh.length);
        jump = true;
      }
      const want = [hh.length === 2 ? hh[0] : "", hh[hh.length - 1], mm[0], mm[1]];
      for (let i = 0; i < 4; i++) {
        const sl = slots[i];
        const target = sl.to ?? sl.val;
        if (target === want[i]) continue;
        if (jump || sl.val === null || want[i] === "" || sl.val === "") setDigit(sl, want[i]);
        else {
          if (sl.to !== null) setDigit(sl, sl.to);
          sl.to = want[i];
          sl.t0 = s.t;
          sl.nxt.textContent = want[i];
        }
      }
      put("ampm", T.ampm, tx.ampm);
      if (put("date", T.date, tx.date)) fit(T.date, 900 - 44 - 36 - T.ampm.offsetWidth - 52, 58, 44);
      if (put("temp", T.temp, tx.temp)) fit(T.temp, 244 - 44, 138, 90);
      if (shown.cond !== tx.condition) {
        shown.cond = tx.condition;
        const words = tx.condition.split(" ");
        let a = tx.condition;
        let b = "";
        if (words.length > 1 && tx.condition.length > 9) {
          let best = 1e9;
          for (let i = 1; i < words.length; i++) {
            const l = words.slice(0, i).join(" ");
            const rr = words.slice(i).join(" ");
            const m = Math.max(l.length, rr.length);
            if (m < best) {
              best = m;
              a = l;
              b = rr;
            }
          }
        }
        T.cond1.textContent = a;
        T.cond2.textContent = b;
        T.cond2.style.display = b ? "" : "none";
        fit(T.cond1, 380 - 64, 58, 44);
        if (b) {
          fit(T.cond2, 380 - 64, 58, 44);
          const fs = Math.min(parseFloat(T.cond1.style.fontSize), parseFloat(T.cond2.style.fontSize));
          T.cond1.style.fontSize = T.cond2.style.fontSize = `${fs}px`;
        }
      }
      if (put("sunLabel", T.sunLabel, tx.sunLabel)) fit(T.sunLabel, 236 - 44, 30, 24);
      if (put("sunValue", T.sunValue, tx.sunValue)) fit(T.sunValue, 236 - 48, 58, 36);
      if (put("moon", T.moon, tx.moon)) fit(T.moon, 470 - 64, 56, 40);
      if (put("aqi", T.aqi, tx.aqi)) fit(T.aqi, 160 - 40, 76, 44);
      if (put("uv", T.uv, tx.uv)) fit(T.uv, 160 - 40, 76, 44);
      const fl = put("factLabel", T.factLabel, tx.factLabel);
      const fv = put("factValue", T.factValue, tx.factValue);
      if (fl || fv || !shown.factInit) {
        shown.factInit = true;
        const has = tx.factValue !== "";
        T.factLabel.style.display = T.factValue.style.display = has ? "" : "none";
        if (has) {
          const st = T.factValue.style;
          st.fontStretch = "100%";
          let ok = false;
          // two lines at most (line height 1.95: the lines stand well apart)
          for (let fs = 44; fs >= 36 && !ok; fs -= 2) {
            st.fontSize = `${fs}px`;
            ok = T.factValue.offsetHeight <= fs * 1.95 * 2.4;
          }
          for (let fsr = 94; fsr >= 76 && !ok; fsr -= 6) {
            st.fontStretch = `${fsr}%`;
            ok = T.factValue.offsetHeight <= 36 * 1.95 * 2.4;
          }
        }
      }
    }

    // ----- color ----------------------------------------------------------------
    const FOGK = [0, 0.12, 0.26, 0.44, 0.58, 0.68, 0.78];
    function palette(s) {
      const wx = s.weather;
      const day = s.daylight;
      const nightK = 1 - smoothstep(0.05, 0.62, day);
      const cloud = wx.cloud / 100;
      const sunK = day * (1 - 0.85 * smoothstep(0.2, 0.95, cloud)) * (1 - 0.7 * E.fog);
      const moonK = (s.moon.up ? s.moon.illumination : 0) * (1 - cloud) * nightK;
      const key = `${Math.round(day * 300)}|${Math.round(E.wet * 50)}|${Math.round(E.fog * 40)}|${Math.round(sunK * 40)}|${Math.round(moonK * 20)}|${Math.round(E.snow * 30)}|${Math.round(E.heat * 20)}|${Math.round(E.frost * 20)}|${Math.round(E.puddle * 20)}|${s.sky.west}${s.sky.east}${s.sky.northWest}${s.sky.northEast}`;
      if (key === E.palKey) return;
      E.palKey = key;

      const dim = (c) => mix(c, "#04050a", 0.42 * (1 - day));
      const cw = dim(s.sky.west);
      const cnw = dim(s.sky.northWest);
      const cne = dim(s.sky.northEast);
      const ce = dim(s.sky.east);
      const wall = dim(s.sky.mean);
      skyEl.style.background = `linear-gradient(180deg,rgba(0,0,0,.2),rgba(0,0,0,0) 46%,rgba(255,255,255,${(0.07 * day).toFixed(3)})),linear-gradient(97deg,${cw},${cnw} 36%,${cne} 64%,${ce})`;
      starEl.style.opacity = (nightK * (1 - cloud) * (1 - E.fog)).toFixed(2);
      // the skyline flat: the western sky, deepened; near black at night
      const skFar = mix(mix(cw, "#2b3446", 0.3), "#080a10", 0.55 * nightK);
      const skNear = mix(mix(cw, "#1a212e", 0.5), "#05060a", 0.7 * nightK);
      setG("--sk1", skFar);
      setG("--sk2", skNear);
      setG("--sk3", mix(skNear, "#000000", 0.45));
      setG("--skw", rgba(mix(mix(skNear, "#ffffff", 0.3), "#ffc978", nightK), 0.35 + 0.45 * nightK));

      const snowCol = mix(mix("#f6f8fb", wall, 0.12), "#141a26", nightK * 0.86);
      setG("--sn", snowCol);
      setG("--sn2", mix(snowCol, nightK > 0.5 ? "#0a0e18" : "#8ea0bd", 0.3));
      // the table the tower stands on: dark oak by day, nearly black at night
      let floor = mix(mix("#9a6a3c", wall, 0.1), "#0a0807", nightK * 0.9);
      floor = mix(floor, "#120c08", 0.55 * E.wet);
      floor = mix(floor, snowCol, 0.93 * E.snow);
      setG("--floor", floor);
      setG("--seam", rgba(mix(floor, "#000000", 0.6), 0.3 + 0.2 * nightK));
      setG("--floorline", rgba(mix(floor, "#ffffff", 0.5), 0.3 * (1 - nightK) + 0.05));
      E.pudCol = mix(mix(wall, "#05070c", 0.25), "#000000", nightK * 0.2);
      E.pudHi = mix(mix(wall, "#ffffff", 0.55), "#9fb4d8", nightK);

      // the painted plywood sky
      const grey = clamp(0.55 * smoothstep(0.35, 1, cloud) + (wx.falling ? 0.22 : 0) + (wx.kind === "storm" ? 0.3 : 0));
      const cDay = mix(mix("#fbf8f0", "#8a939e", grey), wall, 0.1);
      const cf = mix(cDay, mix(wall, "#8d95aa", 0.2 + 0.1 * grey), nightK * 0.94);
      setG("--cf", cf);
      setG("--cs", mix(cf, mix("#3a2a1e", "#000000", nightK), 0.32));
      setG("--cb", rgba(mix(cf, "#1e2a40", 0.6), 0.28 * (1 - 0.6 * nightK)));
      setG("--cg", rgba(mix(cf, "#000000", 0.6), 0.13));
      setG("--chi", rgba("#ffffff", 0.55 * (1 - nightK) * (1 - 0.5 * grey)));
      setG("--thr", nightK > 0.5 ? rgba("#c8d0e0", 0.14) : rgba(mix(wall, "#000000", 0.6), 0.5));
      const golden = 1 - smoothstep(0.5, 0.92, day);
      const sunF = mix("#ffc21a", "#ff7a2a", golden);
      setG("--sf", sunF);
      setG("--ss", mix(sunF, "#7a3a08", 0.4));
      E.sunVis = smoothstep(0.3, 0.6, day) * (1 - smoothstep(0.5, 0.88, cloud));
      const starF = mix("#ffe7a0", wall, 0.12);
      setG("--stf", starF);
      setG("--sts", mix(starF, "#2a1e08", 0.65));
      E.starVis = smoothstep(0.55, 0.9, nightK) * (1 - smoothstep(0.3, 0.8, cloud));
      E.cloudFade = 1 - 0.9 * E.fog;
      const dropF = mix("#2a63d4", mix(wall, "#6f9be8", 0.45), nightK);
      setG("--dpf", dropF);
      setG("--dps", mix(dropF, "#000000", 0.4));
      setG("--flk", mix(snowCol, "#ffffff", 0.3 * (1 - nightK)));
      setG("--flks", mix(snowCol, "#6d7c96", 0.5));
      const fogCol = mix(wall, mix("#262931", "#e2e4e6", smoothstep(0.08, 0.45, day)), 0.6);
      setG("--fogc", rgba(fogCol, 0.9));
      // fog: a veil over the wall, thickest up high; heat: a warm glare rising off the table
      const hz = [];
      if (E.fog > 0.02) hz.push(`linear-gradient(180deg,${rgba(fogCol, 0.92 * E.fog)},${rgba(fogCol, 0.55 * E.fog)})`);
      if (E.heat > 0.02) hz.push(`linear-gradient(0deg,${rgba("#ffd29a", 0.62 * E.heat)},${rgba("#fff0d0", 0.18 * E.heat)} 60%,rgba(255,240,208,0))`);
      styleIf("haze", hazeEl, "background", hz.join(",") || "none");
      setG("--ao", (0.16 + 0.14 * sunK + 0.2 * nightK).toFixed(3));

      // light on the blocks
      const lightCol = mix(mix("#fff4dc", wall, 0.25), "#3b4767", nightK);
      const shadeCol = mix("#23130a", "#000000", nightK);
      const tk = lerp(0.1 + 0.26 * sunK, 0.07 + 0.2 * moonK, nightK);
      const sk = lerp(0.14 + 0.2 * sunK, 0.4, nightK);
      const wetK = E.wet;
      let wood = mix(mix(BEECH, "#efc27c", 0.6 * E.heat), WALNUT, wetK);
      wood = mix(mix(wood, wall, 0.08), NIGHTWOOD, nightK);
      const faceCol = {};
      for (const k in FACE) {
        let c = FACE[k][0];
        if (E.heat) c = adjust(c, { c: (v) => v * (1 + 0.16 * E.heat) });
        c = mix(c, adjust(c, { l: (l) => l * 0.8 }), wetK);
        faceCol[k] = mix(mix(c, wall, 0.05), FACE[k][1], nightK);
      }
      const rawWood = mix(mix(BEECH, WALNUT, wetK * 0.8), NIGHTWOOD, nightK * 0.94);
      setG("--sheenw", (0.42 * wetK * (0.35 + 0.65 * day) + 0.1 * sunK).toFixed(3));
      setG("--sheenp", (0.36 * wetK * (0.35 + 0.65 * day) + 0.3 * sunK + 0.04).toFixed(3));
      setG("--streak", (0.22 * wetK * (1 - nightK)).toFixed(3));
      const rimCol = mix(mix("#ffffff", wall, 0.3), "#cfe4ff", E.frost);
      setG("--rim", rgba(rimCol, clamp(0.24 * nightK + 0.45 * moonK + 0.75 * E.frost)));
      setG("--rimw", `${(1.6 + 2.2 * E.frost).toFixed(1)}px`);
      setG("--chip", faceCol.red);
      setG("--chipink", inkFor(faceCol.red, INK.ink, 4.6));
      setG("--scorch", rgba("#3a1c08", 0.5 * (1 - nightK) * (1 - wetK)));
      setG("--m1", mix("#2c8fd6", "#0c1a2c", nightK * 0.85));
      setG("--m2", mix("#bfe6ff", "#1d2c44", nightK * 0.85));
      setG("--m3", mix("#f2b632", "#4a3a1a", nightK * 0.8));
      setG("--mh", (0.95 - 0.5 * nightK).toFixed(2));

      for (const b of blocks) {
        const sc = b.o.scheme;
        const darkPaint = sc.face && sc.face !== "yellow";
        let f = sc.face ? faceCol[sc.face] : wood;
        const fk = E.fog * FOGK[b.o.course] * (darkPaint ? 0.55 : 1);
        if (fk > 0.004) f = mix(f, fogCol, fk);
        const ink = mix(inkFor(f, INK[sc.ink], b.o.ratio || 4.7), "#000000", 0);
        const dark = luminance(ink) < luminance(f);
        b.ink = ink;
        setVar(b, "--f", f);
        setVar(b, "--t", mix(f, lightCol, tk));
        setVar(b, "--s", mix(f, shadeCol, sk));
        setVar(b, "--m", mix(f, shadeCol, sk * 0.45));
        setVar(b, "--ink", ink);
        setVar(b, "--g", rgba(mix(f, "#2a1508", 0.82), sc.face ? 0.4 : 0.62 * (1 - 0.5 * nightK)));
        setVar(b, "--bev", rgba("#ffffff", (0.16 + 0.26 * sunK) * (1 - nightK) + 0.03));
        setVar(b, "--raw", sc.face ? rgba(rawWood, 0.9) : rgba("#fff1d2", 0.3 * (1 - nightK) * (1 - wetK)));
        setVar(b, "--hi", rgba("#ffffff", dark ? 0.3 * (1 - nightK) : 0));
        setVar(b, "--lo", rgba("#000000", dark ? 0.22 : 0.4));
        setVar(b, "--halo", rgba(ink, dark ? 0 : 0.5 * nightK));
      }
      if (shown.flag !== faceCol.yellow) {
        shown.flag = faceCol.yellow;
        flagEl.style.fill = mix(faceCol.yellow, "#ffd65c", nightK * 0.25);
      }
      if (E.wet > 0.02) paintReflection(nightK);
    }

    // What the wet floor mirrors, drawn upside down once per change of light:
    // the base plank's face, then the two minute cubes with a soft smear of
    // their numerals' paint. Drawn to the screen in rippled slices.
    const REFH = 100;
    const refl = document.createElement("canvas");
    refl.width = W;
    refl.height = REFH;
    const rctx = refl.getContext("2d");
    function paintReflection(nightK) {
      rctx.clearRect(0, 0, W, REFH);
      const dk = (c, k) => mix(c, "#000000", k);
      const bf = base.vars["--f"];
      rctx.fillStyle = dk(bf, 0.25);
      rctx.fillRect(base.o.x, 0, base.o.w, 32);
      rctx.fillStyle = dk(base.vars["--s"], 0.5);
      rctx.fillRect(base.o.x + base.o.w, 0, base.dx, 32 - base.dy * 0.3);
      // the plank's face continues, upside down, below the seam
      rctx.fillStyle = dk(bf, 0.4);
      rctx.fillRect(base.o.x, 32, base.o.w, REFH - 32);
      rctx.fillStyle = dk(base.vars["--s"], 0.55);
      rctx.fillRect(base.o.x + base.o.w, 32 - base.dy * 0.3, base.dx, REFH);
      // and its fact, a soft warm smear of glow paint where the letters are
      const g = rctx.createRadialGradient(base.o.x + base.o.w / 2, 92, 4, base.o.x + base.o.w / 2, 92, 300);
      g.addColorStop(0, rgba(base.ink, 0.1 + 0.16 * nightK));
      g.addColorStop(1, rgba(base.ink, 0));
      rctx.fillStyle = g;
      rctx.fillRect(base.o.x, 32, base.o.w, REFH - 32);
      // the wet seam where plank meets floor
      rctx.fillStyle = rgba("#ffffff", 0.12 * (1 - nightK) + 0.04);
      rctx.fillRect(base.o.x, 0, base.o.w, 2);
      const fade = rctx.createLinearGradient(0, 0, 0, REFH);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(1, "rgba(0,0,0,0.7)");
      rctx.globalCompositeOperation = "destination-out";
      rctx.fillStyle = fade;
      rctx.fillRect(0, 0, W, REFH);
      rctx.globalCompositeOperation = "source-over";
    }

    // ----- wind -----------------------------------------------------------------
    function windSpeed(t, wx) {
      const g = clamp(0.5 + 0.85 * noise.n2(t * 0.11, 3.7) + 0.3 * noise.n2(t * 0.41, 9.1));
      const G = g * g * (3 - 2 * g);
      return Math.max(0, wx.wind + (Math.max(wx.gust, wx.wind) - wx.wind) * G + wx.wind * 0.14 * noise.n2(t * 0.9, 17.3));
    }
    let vNow = 0;
    let pNow = 0;
    function physics(t, dt, wx, quiet) {
      const sx = -Math.sin((wx.windDir * Math.PI) / 180);
      const want = sx >= 0 ? Math.max(sx, 0.45) : Math.min(sx, -0.45);
      E.dirS = approach(E.dirS, want, dt, 1.5);
      vNow = windSpeed(t, wx);
      const p = E.dirS * Math.min(2.5, Math.pow(vNow / 26, 1.35));
      E.pa = approach(E.pa, p, dt, 3.5);
      pNow = p;
      const idle = 0.22 * Math.sin((TAU * t) / 6.6 + seed) + 0.1 * Math.sin((TAU * t) / 10.3 + seed * 1.7);
      const pe = p - 0.3 * E.pa + idle;
      if (!quiet) {
        for (let k = 0; k < NK; k++) {
          if (kickT[k] >= 0 && t >= kickT[k]) {
            om[kickJ[k]] += kickV[k];
            kickT[k] = -1;
          }
        }
      }
      const n = Math.max(1, Math.round(dt * 120));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < NO; j++) {
          const o = OSC[j];
          const turb = j >= 3 ? 0.2 * Math.abs(p) * noise.n2(t * 0.8, j * 7.3) : 0;
          const a = -o.w2 * (phi[j] - o.A * o.gain * (pe + turb)) - o.c * om[j] - 0.5 * (o.par >= 0 ? acc[o.par] : 0);
          acc[j] = a;
          om[j] += a * h;
          phi[j] += om[j] * h;
        }
      }
    }
    // settle the sway before the first frame
    for (let i = 0; i < 16 * 30; i++) physics(-16 + i / 30, 1 / 30, state.weather, true);

    // ----- per-frame pieces -------------------------------------------------------
    function tips(s) {
      let lift = 0;
      for (let i = 0; i < 4; i++) {
        const sl = slots[i];
        if (sl.t0 < 0) continue;
        const u = (s.t - sl.t0) / TIP;
        if (u >= 1) {
          setDigit(sl, sl.to);
          thunk(s.t, i >= 2 ? 1 : 0.7, i >= 2 ? 1 : 2);
          if (E.snow > 0.2 && s.t - moonCap.last > 20) shed(s.t);
          continue;
        }
        const a = ease.cubicInOut(clamp(u));
        sl.cur.style.transform = `scaleY(${(1 - a).toFixed(4)})`;
        sl.nxt.style.transform = `scaleY(${a.toFixed(4)})`;
        sl.sh.style.transform = `scaleY(${a.toFixed(4)})`;
        sl.sh.style.opacity = ((1 - a) * 0.85).toFixed(3);
        sl.ed.style.transform = `translateY(${(a * CUBE).toFixed(1)}px)`;
        sl.ed.style.opacity = (0.5 * Math.sin(Math.PI * a)).toFixed(3);
        if (i >= 2) lift = Math.max(lift, Math.sin(Math.PI * clamp(u)) * (i === 2 ? 15 : 11));
      }
      hopY[1] = -lift;
    }
    function shed(t) {
      moonCap.last = t;
      moonCap.drop = t;
      moonCap.dir = phi[0] + phi[1] + phi[2] + phi[3] + phi[4] >= 0 ? 1 : -1;
      roof.capDrop = t + 0.15;
    }

    // Each course rocks on an edge of the one below. On screen that rocking is
    // shown as the displacement it gives each course (a pure translate: rotated
    // layers are far costlier to composite, and at these angles the eye reads
    // the shift, not the tilt). World offsets are summed exactly up the chain.
    // Moving layers sit on whole device pixels: a layer at a fractional offset
    // has to be resampled every frame, which costs more than everything else here.
    const devScale = (root.getBoundingClientRect().width / W || 1) * (window.devicePixelRatio || 1);
    const PX = 1 / Math.max(1, Math.round(devScale));
    const snap = (v) => Math.round(v / PX) * PX;
    const LX = new Float32Array(NO).fill(NaN);
    const LY = new Float32Array(NO).fill(NaN);
    const WX = new Float32Array(NO);
    const WY = new Float32Array(NO);
    const QA = 0.0003; // tilt step (rad): about a third of a pixel at the end of the plank
    const LA = new Float32Array(NO).fill(NaN);
    function transforms() {
      for (let k = 0; k < NO; k++) {
        if (k >= 2) {
          // the plank and everything above it rock visibly: each course tilts
          // on the edge of the one below (its pivot, in the parent's frame)
          const o = OSC[k];
          const qa = Math.round(phi[k] / QA) * QA;
          const hop = Math.round(hopY[k] * 4) / 4;
          const c = Math.cos(qa);
          const sn = Math.sin(qa);
          const px = qa > 0 ? o.cr : o.cl;
          const py = o.iy;
          const e = px - c * px + sn * py;
          const f = py - sn * px - c * py + hop;
          const pi = (o.par + 1) * 6;
          const mi = (k + 1) * 6;
          M[mi] = M[pi] * c + M[pi + 2] * sn;
          M[mi + 1] = M[pi + 1] * c + M[pi + 3] * sn;
          M[mi + 2] = -M[pi] * sn + M[pi + 2] * c;
          M[mi + 3] = -M[pi + 1] * sn + M[pi + 3] * c;
          M[mi + 4] = M[pi] * e + M[pi + 2] * f + M[pi + 4];
          M[mi + 5] = M[pi + 1] * e + M[pi + 3] * f + M[pi + 5];
          if (qa !== LA[k] || hop !== LY[k]) {
            LA[k] = qa;
            LY[k] = hop;
            groups[k].style.transform = qa === 0 && hop === 0 ? "none" : `matrix(${c.toFixed(6)},${sn.toFixed(6)},${(-sn).toFixed(6)},${c.toFixed(6)},${e.toFixed(2)},${f.toFixed(2)})`;
          }
          continue;
        }
        const ok = OSC[k];
        const qx = ok.cxk;
        const qy = ok.cyk;
        let x = qx;
        let y = qy;
        // apply the rotations from the top of the chain down to the base
        for (let j = k; j >= 0; j = OSC[j].par) {
          const o = OSC[j];
          const a = phi[j];
          const c = Math.cos(a);
          const sn = Math.sin(a);
          const px = a > 0 ? o.cr : o.cl;
          const dx = x - px;
          const dy = y - o.iy;
          x = px + c * dx - sn * dy;
          y = o.iy + sn * dx + c * dy + hopY[j];
          if (o.par < 0) break;
        }
        WX[k] = x - qx;
        WY[k] = y - qy;
        const par = ok.par;
        const mi = (k + 1) * 6;
        M[mi] = M[mi + 3] = 1;
        M[mi + 1] = M[mi + 2] = 0;
        M[mi + 4] = WX[k];
        M[mi + 5] = WY[k];
        const lx = snap(WX[k]) - (par >= 0 ? snap(WX[par]) : 0);
        const ly = snap(WY[k]) - (par >= 0 ? snap(WY[par]) : 0);
        if (lx !== LX[k] || ly !== LY[k]) {
          LX[k] = lx;
          LY[k] = ly;
          groups[k].style.transform = `translate(${lx}px,${ly}px)`;
        }
      }
    }

    function roofStep(s, jump) {
      const t = s.t;
      const g = 2600;
      if (jump && roof.mode) {
        roof.mode = 0;
        roof.next = t + 30;
      }
      if (roof.mode === 0 && t > roof.next && vNow > 34 && !jump) {
        roof.mode = 1;
        roof.t0 = t;
        roof.dir = pNow >= 0 ? 1 : -1;
        roof.next = t + 60;
        if (E.snow > 0.2) shed(t);
      }
      let x = 0;
      let y = 0;
      let rot = 0;
      if (roof.mode === 1) {
        const u = t - roof.t0;
        if (u < 0.8) {
          const k = ease.in(u / 0.8);
          x = roof.dir * 172 * k;
          rot = roof.dir * 0.2 * k * k;
        } else {
          const q = u - 0.8;
          x = roof.dir * (172 + 300 * q);
          y = 0.5 * g * q * q + 40 * q;
          rot = roof.dir * (0.2 + 4.6 * q);
          if (y > H + 300) {
            roof.mode = 2;
            roof.t0 = t;
          }
        }
      } else if (roof.mode === 2) {
        y = H + 400;
        if (t - roof.t0 > 2.6) {
          roof.mode = 3;
          roof.t0 = t;
        }
      } else if (roof.mode === 3) {
        // dropped back on: fall, then two small bounces
        const u = t - roof.t0;
        const t1 = Math.sqrt((2 * 620) / g);
        const v2 = 300;
        const t2 = (2 * v2) / g;
        const v3 = 120;
        const t3 = (2 * v3) / g;
        if (u < t1) y = -620 + 0.5 * g * u * u;
        else if (u < t1 + t2) {
          const q = u - t1;
          y = -(v2 * q - 0.5 * g * q * q);
          rot = -roof.dir * 0.03 * Math.sin((Math.PI * q) / t2);
          if (!roof.hit) {
            roof.hit = true;
            thunk(t, 1.2, 3);
          }
        } else if (u < t1 + t2 + t3) {
          const q = u - t1 - t2;
          y = -(v3 * q - 0.5 * g * q * q);
        } else {
          roof.mode = 0;
          roof.hit = false;
        }
      }
      const tf = rot ? `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${rot.toFixed(4)}rad)` : `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      if (tf !== shown.roofTf) {
        shown.roofTf = tf;
        roofG.style.transform = tf;
      }
    }
    roofG.style.transformOrigin = `${roofB.o.x + roofB.o.w / 2}px ${roofB.o.y + roofB.o.h}px`;

    function marbleStep(dt, jump) {
      // the plank's visible tilt (the time cubes below only shift)
      const tilt = phi[2] + phi[3] + phi[4];
      const n = Math.max(1, Math.round(dt * 120));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        MAR.v += (68000 * Math.sin(tilt) - 0.9 * MAR.v) * h;
        MAR.s += MAR.v * h;
        if (MAR.s < MAR.u0) {
          MAR.s = MAR.u0;
          MAR.v = Math.abs(MAR.v) * 0.3;
        } else if (MAR.s > MAR.u1) {
          MAR.s = MAR.u1;
          MAR.v = -Math.abs(MAR.v) * 0.3;
        }
      }
      const q = snap(MAR.s);
      if (q === MAR.shown && !jump) return;
      MAR.shown = q;
      const cx = moonB.o.x + q + moonB.dx * 0.5;
      const cy = moonB.o.y - moonB.dy * 0.5;
      marble.style.transform = `translate(${snap(cx)}px,${snap(cy - 19)}px) rotate(${(q / 22).toFixed(3)}rad)`;
      marbleShadow.style.transform = `translate(${snap(cx + 5)}px,${snap(cy + 1)}px)`;
    }

    function pennant(t, dt) {
      const st = smoothstep(1.5, 17, vNow);
      const ang = lerp(1.32, 0.05, st);
      const L = 124;
      E.flagPhase = (E.flagPhase || 0) + dt * (2.2 + vNow * 0.42);
      const ca = Math.cos(ang) * clamp(E.dirS * 1.8, -1, 1);
      const sa = Math.sin(ang);
      let top = "";
      let bot = "";
      const N = 9;
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const wob = Math.sin(u * 5.4 - E.flagPhase) * (2.5 + 7.5 * st) * u;
        const x = penX + L * u * ca + (ca >= 0 ? 3 : -3) * (u > 0 ? 1 : 0);
        const y = penY - 62 + L * u * sa + wob;
        const half = 21 * (1 - u) + 0.6;
        top += `${i ? "L" : "M"}${x.toFixed(1)} ${(y - half).toFixed(1)}`;
        bot = `L${x.toFixed(1)} ${(y + half).toFixed(1)}${bot}`;
      }
      flagEl.setAttribute("d", `${top}${bot}Z`);
    }

    function caps(s, dt) {
      const t = s.t;
      const g = E.snow;
      const gq = Math.round(g * 100) / 100;
      for (const b of blocks) {
        if (b === moonB || b === roofB) continue;
        if (b.g !== gq) {
          b.g = gq;
          b.cap.style.display = gq > 0.01 ? "" : "none";
          b.cap.style.transform = `scaleY(${gq})`;
        }
      }
      // the two top caps can slide off and grow back
      // moon plank
      let tf;
      if (moonCap.drop >= 0) {
        const u = t - moonCap.drop;
        if (u > 1.3) {
          moonCap.drop = -1;
          moonCap.g = 0;
        }
        tf = `translate(${(moonCap.dir * (60 * u + 520 * u * u)).toFixed(1)}px,${(Math.max(0, u - 0.25) ** 2 * 1700).toFixed(1)}px) rotate(${(moonCap.dir * u * u * 0.9).toFixed(3)}rad) scaleY(${(moonCap.g * g).toFixed(2)})`;
      } else {
        moonCap.g = Math.min(1, moonCap.g + dt / 45);
        tf = `scaleY(${(Math.round(moonCap.g * g * 100) / 100).toFixed(2)})`;
      }
      if (tf !== shown.mcap) {
        shown.mcap = tf;
        moonB.cap.style.display = moonCap.g * g > 0.01 ? "" : "none";
        moonB.cap.style.transform = tf;
      }
      if (roof.capDrop >= 0 && t >= roof.capDrop) {
        const u = t - roof.capDrop;
        if (u > 1.2) {
          roof.capDrop = -1;
          roof.capG = 0;
        }
        tf = `translate(${(moonCap.dir * 300 * u * u).toFixed(1)}px,${(u * u * 1500).toFixed(1)}px) scale(${(roof.capG * g).toFixed(2)})`;
      } else {
        roof.capG = Math.min(1, roof.capG + dt / 45);
        const q = Math.round(roof.capG * g * 100) / 100;
        tf = `scale(${(0.9 + 0.1 * q).toFixed(3)},${q.toFixed(2)})`;
      }
      if (tf !== shown.rcap) {
        shown.rcap = tf;
        roofB.cap.style.display = roof.capG * g > 0.01 ? "" : "none";
        roofB.cap.style.transform = tf;
      }
      // rocking hard enough shakes them loose
      if (g > 0.3 && moonCap.drop < 0 && moonCap.g > 0.6 && t - moonCap.last > 25 && Math.abs(phi[3] + phi[4]) > 0.012) shed(t);
    }

    function backdrop(s, dt, jump) {
      const wx = s.weather;
      const cloud = wx.cloud;
      const drift = pNow * 16 + E.dirS * 3;
      // the hanging cut-outs: pendulums pushed by the same wind as the tower
      const n = Math.max(1, Math.round(dt * 60));
      const h = dt / n;
      for (let i = 0; i < hangs.length; i++) {
        const hg = hangs[i];
        // a cut-out is lowered on its thread when it is wanted and hoisted out of sight when not
        const vis = hg.kind === "cloud" ? smoothstep(hg.th - 4, hg.th + 4, cloud) : hg.kind === "sun" ? E.sunVis : E.starVis;
        const op = vis > 0.002 ? Math.round(E.cloudFade * 50) / 50 : 0;
        if (op !== hg.op) {
          hg.op = op;
          hg.node.style.opacity = op;
          hg.node.style.display = op > 0 ? "" : "none";
        }
        const lift = Math.round((1 - ease.cubicInOut(vis)) * hg.lift * 2) / 2;
        const turb = noise.n2(s.t * 0.55, i * 5.3);
        const target = -hg.gain * (0.03 * pNow + (0.012 + 0.02 * Math.abs(pNow)) * turb);
        for (let k = 0; k < n; k++) {
          hg.v += (-hg.k * (hg.a - target) - hg.c * hg.v) * h;
          hg.a += hg.v * h;
        }
        if (jump) {
          hg.a = target;
          hg.v = 0;
        }
        if (op <= 0) continue;
        // the swing shown as the sideways shift of the cut-out (cheap to composite)
        const hx = snap(-hg.a * hg.arm);
        const hy = snap(-lift);
        if (hx !== hg.hx || hy !== hg.hy) {
          hg.hx = hx;
          hg.hy = hy;
          hg.node.style.transform = `translate(${hx}px,${hy}px)`;
        }
      }
      const fq = wx.kind === "fog" ? Math.round(E.fog * 40) / 40 : 0;
      if (fq !== shown.fogq) {
        shown.fogq = fq;
        fogBack.style.display = fogFront.style.display = fq > 0.02 ? "" : "none";
        for (const f of fogs) f.node.style.opacity = (f.k * fq).toFixed(3);
      }
      if (fq > 0.02) {
        for (const f of fogs) {
          f.x += (f.sp + drift * 0.6) * dt;
          if (f.x > W + 80) f.x = -f.w - 60;
          else if (f.x < -f.w - 80) f.x = W + 60;
          f.node.style.transform = `translate(${snap(f.x)}px,${f.y.toFixed(0)}px)`;
        }
      }
      // storm: a slow, soft swell of light behind the tower, now and then
      if (wx.kind === "storm" && !jump) {
        if (s.t > E.swellNext) {
          E.swellT = s.t;
          E.swellNext = s.t + 9 + 14 * noise.n2(s.t, 41.3) ** 2 + 5;
        }
        const u = s.t - (E.swellT ?? -99);
        E.swell = u < 0 ? 0 : u < 0.7 ? ease.sine(u / 0.7) : Math.exp(-(u - 0.7) / 1.3);
      } else E.swell = 0;
      const sw = Math.round(E.swell * 0.2 * 100) / 100;
      styleIf("swell", swellEl, "opacity", String(sw));
      styleIf("swellD", swellEl, "display", sw > 0 ? "block" : "none");

      // floor shadow from the sun (or a bright moon), its lean from which side the light is on
      const alt = s.sun.alt;
      const cloudK = 1 - 0.85 * smoothstep(20, 95, cloud);
      const light = s.daylight * cloudK * smoothstep(1, 12, alt) * (1 - E.fog) * (1 - 0.6 * E.snow);
      styleIf("shOp", shadowEl, "opacity", (Math.round(light * 0.42 * 50) / 50).toFixed(2));
      if (light > 0.01) {
        const lean = clamp(1.1 / Math.tan((Math.max(8, alt) * Math.PI) / 180), 0.25, 2.6) * (s.sun.az < 180 ? -1 : 1);
        styleIf("shTf", shadowEl, "transform", `skewX(${(Math.atan(lean) * 57.2958).toFixed(1)}deg)`);
      }
      styleIf("ctOp", contactEl, "opacity", (0.55 + 0.45 * s.daylight).toFixed(2));
      const mq = Math.round(E.snow * 50) / 50;
      if (mq !== shown.mound) {
        shown.mound = mq;
        moundEl.style.display = mq > 0.01 ? "" : "none";
        moundEl.style.transform = `scaleY(${mq})`;
      }
    }

    function drawFx(s, dt) {
      const wx = s.weather;
      const fall = wx.falling;
      const inten = wx.intensity;
      const rainAmt = fall && fall !== "snow" ? (fall === "drizzle" ? 0.25 + 0.4 * inten : 0.35 + 0.65 * inten) : 0;
      const snowAmt = fall === "snow" ? 0.3 + 0.7 * inten : 0;
      const heat = E.heat;
      const active = rainAmt > 0 || snowAmt > 0 || heat > 0.03 || E.wet > 0.05;
      if (!active && !fxDirty) return;
      const { ctx } = fx;
      fx.clear();
      fxDirty = active;
      if (!active) return;
      const night = 1 - s.daylight;

      if (heat > 0.03) {
        // glints sliding over the hot floor
        ctx.lineWidth = 2;
        ctx.strokeStyle = rgba("#fff3d6", 0.16 * heat);
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const y0 = GROUND + 16 + k * 22;
          for (let x = -20; x <= W + 20; x += 30) {
            const y = y0 + 3.5 * Math.sin(x * 0.014 + s.t * (0.5 + k * 0.13) + k * 1.7) + 2 * Math.sin(x * 0.041 - s.t * 0.8 + k);
            if (x === -20) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      if (E.puddle > 0.02) {
        // a puddle at the foot: the plank and the minute cubes mirrored, rippling
        // one oval pool on the floor in front of the plank, wholly in the frame:
        // the plank mirrored in it, light sliding over its ripples, a bright lip
        const pk = E.puddle;
        const rx = 330 + 150 * pk;
        const ry = 22 + 18 * pk;
        const cx = 500;
        const cy = GROUND + 52;
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
        ctx.clip();
        ctx.globalAlpha = pk;
        ctx.fillStyle = E.pudCol;
        ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
        ctx.drawImage(refl, 0, 0, W, REFH, 0, GROUND, W, REFH);
        ctx.lineWidth = 2;
        ctx.strokeStyle = rgba(E.pudHi, 0.22 + 0.08 * rainAmt);
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const y0 = cy - ry * 0.55 + k * ry * 0.36;
          const ph = s.t * (0.35 + 0.08 * k) + k * 2.1;
          for (let x = cx - rx; x <= cx + rx; x += 24) {
            const y = y0 + (1 + 1.6 * rainAmt) * Math.sin(x * 0.03 + ph * 3);
            const on = Math.sin(x * 0.011 - ph) > 0.55;
            if (on) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = rgba(E.pudHi, 0.32 * pk);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, Math.PI * 1.04, Math.PI * 1.96);
        ctx.stroke();
      }

      if (E.wet > 0.05 && rainAmt > 0) {
        // drops running down the faces
        const nd = Math.round(ND * clamp(rainAmt * 1.3));
        ctx.lineCap = "round";
        ctx.lineWidth = 3;
        ctx.strokeStyle = `rgba(226,238,255,${(0.34 - 0.16 * night).toFixed(3)})`;
        ctx.beginPath();
        for (let i = 0; i < nd; i++) {
          const j = i * 5;
          const fc = faces[drip[j]];
          const b = fc[1];
          if (b === hL && hourDigits === 1) {
            newDrip(i, false);
            continue;
          }
          // stick, then slip
          const sp = drip[j + 3] * (0.35 + 1.3 * clamp(0.5 + noise.n2(s.t * 0.7 + i * 3.1, i)));
          drip[j + 2] += sp * dt;
          if (drip[j + 2] > b.o.h - 2) {
            newDrip(i, false);
            continue;
          }
          const y1 = drip[j + 2];
          if (y1 < 2) continue;
          const y0 = Math.max(1, y1 - drip[j + 4]);
          const x = b.o.x + drip[j + 1] * b.o.w;
          const mi = fc[0] * 6;
          const X0 = M[mi] * x + M[mi + 2] * (b.o.y + y0) + M[mi + 4];
          const Y0 = M[mi + 1] * x + M[mi + 3] * (b.o.y + y0) + M[mi + 5];
          const X1 = M[mi] * x + M[mi + 2] * (b.o.y + y1) + M[mi + 4];
          const Y1 = M[mi + 1] * x + M[mi + 3] * (b.o.y + y1) + M[mi + 5];
          ctx.moveTo(X0, Y0);
          ctx.lineTo(X1, Y1);
        }
        ctx.stroke();
      }

      if (rainAmt > 0) {
        const n = Math.round(NR * rainAmt);
        const slant = clamp(pNow * 0.22, -0.7, 0.7);
        const drizzle = fall === "drizzle" ? 0.55 : 1;
        for (let pass = 0; pass < 2; pass++) {
          ctx.lineWidth = pass ? 2.4 : 1.5;
          ctx.strokeStyle = `rgba(214,228,250,${((pass ? 0.42 : 0.26) * (1 - 0.45 * night)).toFixed(3)})`;
          ctx.beginPath();
          for (let i = pass; i < n; i += 2) {
            const j = i * 4;
            const sp = rain[j + 3] * drizzle * (pass ? 1 : 0.8);
            rain[j + 1] += sp * dt;
            rain[j] += sp * dt * slant;
            if (rain[j + 1] > H + 90) {
              rain[j + 1] -= H + 180;
              rain[j] = ((rain[j] + 400 + W * 7.31) % (W + 400)) - 200;
            }
            const len = rain[j + 2] * drizzle;
            ctx.moveTo(rain[j], rain[j + 1]);
            ctx.lineTo(rain[j] - slant * len, rain[j + 1] - len);
          }
          ctx.stroke();
        }
        // rings on the puddle
        if (E.puddle > 0.3) {
          const due = Math.floor(s.t * (2 + 9 * rainAmt));
          if (due !== ringNext) {
            ringNext = due;
            const k = (due % NRING) * 3;
            ring[k] = 260 + ((due * 7919) % 480);
            ring[k + 1] = GROUND + 40 + ((due * 104729) % 24);
            ring[k + 2] = 0;
          }
          ctx.lineWidth = 2;
          for (let i = 0; i < NRING; i++) {
            const k = i * 3;
            if (ring[k + 2] > 1) continue;
            ring[k + 2] += dt * 1.15;
            const a = ring[k + 2];
            ctx.strokeStyle = `rgba(220,232,250,${(0.4 * (1 - a) * (1 - 0.4 * night)).toFixed(3)})`;
            ctx.beginPath();
            ctx.ellipse(ring[k], ring[k + 1], 5 + 34 * a, (5 + 34 * a) * 0.26, 0, 0, TAU);
            ctx.stroke();
          }
        }
      }

      if (snowAmt > 0) {
        const n = Math.round(NS * snowAmt);
        const vx = clamp(pNow * 150, -620, 620);
        const speedUp = 1 + Math.abs(pNow) * 0.5;
        for (let i = 0; i < n; i++) {
          const j = i * 5;
          snow[j + 4] += dt * (0.8 + snow[j + 2] * 0.2);
          snow[j + 1] += snow[j + 3] * speedUp * dt;
          snow[j] += (vx * (0.5 + snow[j + 2] * 0.14) + 22 * Math.sin(snow[j + 4])) * dt;
          if (snow[j + 1] > H + 10) snow[j + 1] -= H + 20;
          if (snow[j] > W + 10) snow[j] -= W + 20;
          else if (snow[j] < -10) snow[j] += W + 20;
        }
        // a soft darker rim first, so flakes show against pale sky and pale wood alike
        ctx.fillStyle = `rgba(70,88,120,${(0.3 * s.daylight).toFixed(3)})`;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const j = i * 5;
          ctx.moveTo(snow[j] + snow[j + 2] + 1.4, snow[j + 1] + 1.2);
          ctx.arc(snow[j], snow[j + 1] + 1.2, snow[j + 2] + 1.4, 0, TAU);
        }
        ctx.fill();
        ctx.fillStyle = rgba(mix("#ffffff", "#7f8dab", night * 0.75), 0.95);
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const j = i * 5;
          ctx.moveTo(snow[j] + snow[j + 2], snow[j + 1]);
          ctx.arc(snow[j], snow[j + 1], snow[j + 2], 0, TAU);
        }
        ctx.fill();
      }
    }

    return {
      frame(s) {
        const wx = s.weather;
        const dt = s.dt;
        const jump = E.first || Math.abs(s.ms - E.lastMs - dt * 1000) > 3000;
        E.lastMs = s.ms;

        // how wet, snowed-on, fogged, hot and frozen things are
        const fall = wx.falling;
        const wetT = fall === "rain" || fall === "storm" || fall === "freezing" ? 1 : fall === "drizzle" ? 0.42 : 0;
        const snowT = fall === "snow" ? 1 : 0;
        // low visibility in falling rain or snow is the precipitation itself, not fog
        const fogT = smoothstep(2.2, 0.2, wx.visibility) * (wx.kind === "fog" ? 1 : wx.falling ? 0.3 : 0.7);
        if (jump) {
          E.wet = wetT;
          E.puddle = wetT >= 1 ? 1 : 0;
          E.snow = snowT;
          E.fog = fogT;
        } else {
          E.wet = approach(E.wet, wetT, dt, wetT > E.wet ? 5 : 40);
          E.puddle = approach(E.puddle, wetT >= 1 ? 1 : 0, dt, 25);
          E.snow = approach(E.snow, snowT, dt, snowT ? 40 : 90);
          E.fog = approach(E.fog, fogT, dt, 6);
        }
        E.heat = smoothstep(84, 97, wx.temp) * s.daylight;
        E.frost = smoothstep(34, 24, wx.temp) * (1 - E.wet) * (1 - E.snow * 0.5);

        const fallK = fall === "snow" ? "snow" : fall ? "rain" : "";
        if (shown.fallK !== fallK) {
          shown.fallK = fallK;
          wrap.dataset.fall = fallK;
        }
        texts(s, jump);
        palette(s);

        physics(s.t, dt, wx, false);
        tips(s);
        transforms();
        roofStep(s, jump);
        marbleStep(dt, jump);
        pennant(s.t, dt);
        caps(s, dt);
        backdrop(s, dt, jump);
        drawFx(s, dt);
        E.first = false;
      },
    };
  },
};

// Overprint: a three-ink risograph poster that is being printed all day.
//
//   Ink A is the sky: the colour measured from the tower, used as a flat spot
//   ink; the hour stands on it. Cloud breaks the flat ink into a coarse
//   halftone of soft shapes that drift with the wind; bad air turns it dusty.
//   Ink B is the temperature (violet, blue, teal, yellow, orange, fluorescent
//   pink as it warms, always held 60 degrees of hue away from ink A); the
//   minutes and the temperature stand on it. It carries the weather as print
//   texture: three bold bars thrown across the sky on a clear day, a slanted
//   line screen in rain (slant from the wind, weight from the rate), specks in
//   snow, fat horizontal rules thickening down the sheet in fog, a torn edge in
//   a storm, a slow shimmer in a heat wave.
//   Ink C is the black plate: the numerals and every line of text. Each minute
//   a drum pulls it again, wiping the new time down the sheet.
//
// Where A and B cross (the band between the two lines of numerals, the bars,
// the rain lines) the third colour appears: the overprint. Wind knocks the two
// colour plates out of register against the black (never more than 6 px, a
// gust jolts one), humidity swells the dots and softens the edges. Daylight
// chooses the stock: warm white paper with inks that multiply by day, black
// paper with deep, saturated inks that lighten at night and type in a dim
// cream; the type switches ink in one step where the ground is mid-grey.
//
// The display cuts to a piece on the quarter hour. At that moment the press
// runs the sheet again: three rollers pass down it (sky, temperature, black),
// laying fresh, glossy ink in a new registration over the last pull, which has
// dried a shade lighter. The poster is complete at every moment.
//
// The colour plates are one cheap fragment shader drawn below full resolution
// and only when something on them has moved; all type is DOM, so it is drawn at
// the panel's full resolution.

import {
  W, H, clamp, lerp, remap, smoothstep, lerpAngle, ease, rng, createNoise,
  mix, oklch, toOklch, toOklab, parse, toHex,
  el, addStyle, shader, grain, fitText, wrapText,
} from "../lib/kit.js";

// ---- the sheet -------------------------------------------------------------
const M = 64;                 // unprinted margin: no plate prints nearer the edge than this
const TILT = 3;               // degrees the printed block is turned, counter-clockwise
const PX = 540, PY = 784;     // the point it turns about
const A0 = [-140, 174], A1 = [962, 804];   // ink A field, in block coordinates
const B0 = [122, 744], B1 = [1240, 1374];  // ink B field (the band where they cross sits in the gap between the two lines of numerals)
const SLOT = 15 * 60 * 1000;  // the display cuts to a new piece on every quarter hour
const FS = 604;               // numerals: Anton digits are 0.875 em tall, so 528 px
const HY = 210, MY = 810;     // tops of the hour and minute digits
const DX = 30;                // where the numerals start: left of the margin, so the plate edge cuts them
const CX = 694, CW = 282;     // the column beside the numerals (AM/PM, temperature)
const SIN = Math.sin((TILT * Math.PI) / 180), COS = Math.cos((TILT * Math.PI) / 180);
const MAXREG = 6;             // px: the most a plate may sit out of register

const PAPER_DAY = "#f1ecdf", PAPER_NIGHT = "#0b0a0d";
const INK_DAY = "#131114", INK_NIGHT = "#a09784"; // the night cream stays just below "light" so the room stays dark

// Ink B by temperature: [lightness, chroma, hue, which way to turn if the sky sits on the same hue]
const LADDER = [
  [0.62, 0.17, 296, 1],    // below 25 F: violet
  [0.63, 0.15, 262, -1],   // 25-40: medium blue
  [0.68, 0.115, 188, -1],  // 40-55: teal
  [0.9, 0.18, 100, 1],     // 55-70: yellow
  [0.72, 0.19, 48, -1],    // 70-85: orange
  [0.69, 0.24, 356, -1],   // above 85: fluorescent pink
];
const STEPS = [25, 40, 55, 70, 85];

const f1 = (v) => v.toFixed(1);
const glf = (v) => (Number.isInteger(v) ? `${v}.0` : String(v));

const FRAG = `
uniform vec3 u_p;     // the stock
uniform vec3 u_a;     // ink A on the stock
uniform vec3 u_b;     // ink B on the stock
uniform vec3 u_ab;    // both: the overprint
uniform vec4 u_reg;   // xy plate A offset, zw plate B offset (px)
uniform vec4 u_sky;   // x cloud 0..1, y ink gain 0..1, zw cloud drift (px)
uniform vec4 u_wx;    // x rain weight, y rain slant (tangent), z snow, w fog
uniform vec4 u_mo;    // x rain travel (px), y snow fall (px), z storm, w seed
uniform vec4 u_roll;  // x, y: where the rollers re-inking plates A and B are (px; above it is the new pull); z, w: how wet they are
uniform vec4 u_old;   // the last pull's registration, relative to the new one (A xy, B zw), shown below a roller
uniform vec4 u_fx;    // x clear-sky bars, y heat shimmer, z haze (air quality), w shimmer phase
uniform vec2 u_dry;   // during the print-in: how much lighter the last pull's dried ink is, plates A and B
uniform vec4 u_stamp; // xy centre, zw half size of the stamped box (z = 0: none)
uniform vec2 u_srot;  // its angle: sin, cos
uniform vec4 u_c;     // ink C (rgb) and how much of the night it is: on black stock snow is printed in it
uniform vec2 u_gale;  // x: how far the wind staggers the clear-sky bars (px, signed), y: their slow sway

const vec2 PIV = vec2(${glf(PX)}, ${glf(PY)});
const vec2 RS = vec2(${SIN.toFixed(6)}, ${COS.toFixed(6)});
const vec2 A0 = vec2(${glf(A0[0])}, ${glf(A0[1])});
const vec2 A1 = vec2(${glf(A1[0])}, ${glf(A1[1])});
const vec2 B0 = vec2(${glf(B0[0])}, ${glf(B0[1])});
const vec2 B1 = vec2(${glf(B1[0])}, ${glf(B1[1])});
const float MG = ${glf(M)};
const vec2 C0 = vec2(${glf(CX - 16)}, ${glf(MY - 24)}), C1 = vec2(${glf(CX + CW + 16)}, ${glf(MY + 470)});   // the temperature column

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * vn(p) + 0.3 * vn(p * 2.03 + 7.1) + 0.2 * vn(p * 4.01 + 3.3); }
float box(vec2 q, vec2 lo, vec2 hi) { return max(max(lo.x - q.x, q.x - hi.x), max(lo.y - q.y, q.y - hi.y)); }

// Scattered round specks, one per cell at most. dens is the share of cells that hold one.
float specks(vec2 x, float cell, float dens, float sd, float px) {
  vec2 g = x / cell;
  vec2 i = floor(g), f = fract(g);
  float h = h21(i + sd);
  vec2 c = vec2(h21(i + sd + 3.1), h21(i + sd + 7.7)) * 0.56 + 0.22;
  float r = 0.09 + 0.15 * h21(i + sd + 11.3);
  float aa = px / cell;
  return step(h, dens) * smoothstep(r + aa, r - aa, length(f - c));
}

void main() {
  vec2 p = v_pos;
  vec2 d = p - PIV;
  vec2 q = PIV + vec2(d.x * RS.y - d.y * RS.x, d.x * RS.x + d.y * RS.y);   // block coordinates
  float seed = u_mo.w;
  float gain = u_sky.y;
  float pxs = ${glf(W)} / u_res.x;           // stage px per drawn pixel: edges never get sharper than one pixel
  float soft = max(0.75 + 0.9 * gain, 0.8 * pxs);
  // a roller re-inking a plate: above it the new pull, below it the last one
  float newA = smoothstep(u_roll.x + 6.0, u_roll.x - 6.0, p.y);
  float newB = smoothstep(u_roll.y + 6.0, u_roll.y - 6.0, p.y);
  vec2 offA = u_reg.xy + u_old.xy * (1.0 - newA);
  vec2 offB = u_reg.zw + u_old.zw * (1.0 - newB);

  // ---- plate A: the sky field ------------------------------------------
  vec2 qa = q - offA;
  float pax = p.x - offA.x;
  float cropA = smoothstep(MG - 0.7, MG + 0.7, pax) * smoothstep(${glf(W)} - MG + 0.7, ${glf(W)} - MG - 0.7, pax);
  float wobA = (vn(qa * 0.05 + seed) - 0.5) * (1.6 + 3.4 * gain);
  float inA = smoothstep(soft, -soft, box(qa, A0, A1) + wobA) * cropA;

  float cl = u_sky.x;
  float n = fbm((qa + u_sky.zw) * vec2(0.0015, 0.0026));
  float cov = smoothstep(0.92 - cl * 1.05 - 0.13, 0.92 - cl * 1.05 + 0.2, n) * smoothstep(0.0, 0.12, cl);
  float tone = 1.0 - cov * clamp(0.36 + 0.75 * (n - 0.25), 0.3, 0.78);
  vec2 hp = mat2(0.866, -0.5, 0.5, 0.866) * qa / 14.0;
  float rr = length(fract(hp) - 0.5);
  float rad = mix(sqrt(tone / 3.14159), 0.74, smoothstep(0.62, 1.0, tone)) + 0.035 * gain * (1.0 - tone)
    + 0.016 * sin(u_time * 0.7 + n * 21.0) * (1.0 - tone);
  float haa = max(0.9 + 0.8 * gain, 0.8 * pxs) / 14.0;
  float dotA = max(smoothstep(rad + haa, rad - haa, rr), step(0.992, tone));
  // bad air: the sky ink goes dusty, a fine stipple of paper showing through
  if (u_fx.z > 0.002) dotA *= 1.0 - specks(qa + u_sky.zw * 0.3, 8.0, u_fx.z, seed + 21.0, 0.8 * pxs) * 0.85;

  // ---- plate B: the temperature field, carrying the weather ---------------
  vec2 qb = q - offB;
  // heat: the plate shimmers, its edges and rules swimming slowly
  qb.x += u_fx.y * sin(qb.y * 0.031 + u_fx.w) * (0.6 + 0.4 * sin(qb.y * 0.0071 - u_fx.w * 0.37));
  float pbx = p.x - offB.x;
  float cropB = smoothstep(MG - 0.7, MG + 0.7, pbx) * smoothstep(${glf(W)} - MG + 0.7, ${glf(W)} - MG - 0.7, pbx);
  float wobB = (vn(qb * 0.05 + seed + 31.7) - 0.5) * (1.6 + 3.4 * gain);
  float storm = u_mo.z;
  float tearT = 0.0, tearB = 0.0;
  if (storm > 0.002) {
    tearT = storm * ((fbm(vec2(qb.x * 0.011, seed + 3.7)) - 0.5) * 30.0 + (vn(vec2(qb.x * 0.11, seed)) - 0.5) * 9.0);
    tearB = storm * ((fbm(vec2(qb.x * 0.008, seed + 9.2)) - 0.5) * 70.0 + (vn(vec2(qb.x * 0.09, seed + 5.0)) - 0.5) * 12.0);
  }
  float sdB = max(max(B0.x - qb.x, qb.x - B1.x), max(B0.y - qb.y + tearT, qb.y - B1.y + tearB));
  float inB = smoothstep(soft, -soft, sdB + wobB);
  float inAb = smoothstep(soft, -soft, box(qb, A0, A1));   // the sky field as plate B sees it
  float tin = 1.0;    // coverage inside the field
  float tout = 0.0;   // what the plate throws across the sky field

  // clear sky: three bold flat bars thrown across the sky field, beside the hour;
  // a strong wind staggers them downwind, each one swaying slowly on its own
  if (u_fx.x > 0.002) {
    float yb = qb.y - 452.0;
    float kk = floor(yb / 96.0);
    float fy = yb - kk * 96.0;
    float bx = qb.x - u_gale.x * (kk - 1.0 + 0.4 * sin(u_gale.y + kk * 2.1));
    float bar = step(0.0, kk) * step(kk, 2.0) * smoothstep(soft, -soft, max(max(612.0 - bx, bx - B1.x), max(-fy, fy - 52.0)) + wobB);
    tout = max(tout, bar * u_fx.x);
  }

  float rain = u_wx.x;
  if (rain > 0.002) {
    vec2 al = normalize(vec2(u_wx.y, 1.0));
    vec2 pe = vec2(al.y, -al.x);
    float u = dot(qb, pe) / 15.0;
    float v = dot(qb, al) - u_mo.x;
    float li = floor(u);
    float fu = abs(fract(u) - 0.5);
    float m = vn(vec2(li * 3.17, v * 0.0042 + li * 0.37));
    float aa = max(0.8 + 0.7 * gain, 0.8 * pxs) / 15.0;
    float win = (0.15 + 0.2 * rain) * (0.5 + 1.0 * m);
    float wout = (0.07 + 0.15 * rain) * (0.3 + 1.0 * m) * smoothstep(0.3, 0.5, m);
    float on = smoothstep(0.0, 0.06, rain);
    tin = mix(tin, smoothstep(win + aa, win - aa, fu), on);
    tout = max(tout, on * smoothstep(wout + aa, wout - aa, fu) * step(0.004, wout));
  }

  float fog = u_wx.w;
  if (fog > 0.002) {
    float yy = qb.y / 26.0;
    float li = floor(yy);
    float fr = fract(yy);
    float th = (qb.y - 300.0) / (B1.y - 380.0);   // rules thicken down the sheet
    th = th * th * 1.15 + 0.22 * (vn(vec2(qb.x * 0.0032 + u_sky.z * 0.004, li * 0.71 + seed)) - 0.5);
    float fw = max(0.05, 0.6 * pxs / 26.0);
    float ln = smoothstep(th + fw, th - fw, fr) * step(0.03, th);
    tin = mix(tin, ln, fog);
    tout = max(tout, ln * fog);
  }

  float snow = u_wx.z;
  float drop = 0.0;
  if (snow > 0.002) {
    vec2 fall = vec2(u_mo.y * u_wx.y, u_mo.y);
    float spx = 0.8 * pxs;
    drop = max(specks(q - fall, 27.0, snow * 0.62, seed + 1.0, spx), specks(q - fall * 0.62 + 90.0, 17.0, snow * 0.4, seed + 5.0, spx));
    tout = max(tout, specks(qb - fall * 0.8 + 40.0, 22.0, snow * 0.55, seed + 9.0, spx));
    // at night no flake falls behind the temperature column, so nothing sits behind those letters
    drop *= mix(1.0, smoothstep(-6.0, 6.0, box(q, C0, C1)), u_c.w);
  }

  float cb = (inB * tin + (1.0 - inB) * inAb * tout) * cropB;

  // the stamped box at the foot of the sheet belongs to plate B too
  if (u_stamp.z > 0.0) {
    vec2 sp = vec2(pbx, p.y - offB.y) - u_stamp.xy;
    sp = vec2(sp.x * u_srot.y + sp.y * u_srot.x, -sp.x * u_srot.x + sp.y * u_srot.y);
    vec2 dd = abs(sp) - u_stamp.zw + 14.0;
    float sd = length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0) - 14.0;
    if (abs(sd + 10.0) < 12.0) {   // only near the ring
      float ring = max(smoothstep(4.6, 3.4, abs(sd + 4.5)), smoothstep(1.9, 0.9, abs(sd + 16.0)));
      float press = 0.5 + 0.5 * smoothstep(0.2, 0.62, fbm(sp * 0.012 + seed));
      float bite = smoothstep(0.1, 0.3, vn(sp * 0.33 + seed * 3.0));
      cb = max(cb, ring * press * bite);
    }
  }

  // ---- ink on paper: mottle, pinholes, roller banding (fresh with each pull) --
  float grit = vn(p * 1.9 + seed);
  float pin = smoothstep(0.83, 0.93, grit);
  float mot = vn(p * 0.47 + 17.0);
  float sA = seed + 2.0 + 5.3 * newA, sB = seed + 8.0 + 5.3 * newB;
  float bandA = 1.0 - 0.1 * vn(vec2(sA, (p.y - offA.y) * 0.011)) - 0.05 * mot;
  float bandB = 1.0 - 0.1 * vn(vec2(sB, (p.y - offB.y) * 0.013)) - 0.05 * (1.0 - mot);
  float ca = inA * dotA * (1.0 - drop) * bandA * (1.0 - 0.45 * pin) * (1.0 - u_dry.x * (1.0 - newA));
  cb = cb * (1.0 - drop * inB) * bandB * (1.0 - 0.45 * pin) * (1.0 - u_dry.y * (1.0 - newB));

  vec3 col = mix(mix(u_p, u_a, ca), mix(u_b, u_ab, ca), cb);
  // fresh ink is glossy for a few seconds
  if (u_roll.z + u_roll.w > 0.003) {
    float wet = max(u_roll.z * ca * newA, u_roll.w * cb * newB);
    col *= 1.0 - 0.12 * wet;
    col += 0.07 * wet * smoothstep(0.5, 0.9, vn(vec2(p.x * 0.004 + p.y * 0.002, p.y * 0.05)));
  }
  // paper tooth, and a dither so dark flats never band
  // on black stock a dropout would read as a dark speck: there the snow is printed in ink C
  col = mix(col, u_c.rgb, drop * u_c.w * 0.85 * max(inA, inB * cropB));
  col *= 0.985 + 0.03 * grit;
  col += (h21(p + fract(u_time)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

const CSS = `
.op { position: absolute; inset: 0; font-family: "Space Grotesk", "Helvetica Neue", Arial, sans-serif; font-weight: 700; text-transform: uppercase; }
.op .win, .op .in { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; will-change: transform; }
.op .win { overflow: hidden; }
.op .hd { position: absolute; left: 72px; right: 72px; top: 70px; height: 50px; display: flex; justify-content: space-between; align-items: baseline; line-height: 50px; white-space: nowrap; }
.op .date { font-size: 46px; letter-spacing: 0.035em; }
.op .pull { font-size: 26px; font-weight: 500; letter-spacing: 0.14em; }
.op .pull b { font-weight: 700; }
.op .crop { position: absolute; left: ${M}px; top: 0; width: ${W - 2 * M}px; height: ${H}px; overflow: hidden; }
.op .blk { position: absolute; left: ${-M}px; top: 0; width: ${W}px; height: ${H}px; transform-origin: ${PX}px ${PY}px; transform: rotate(${-TILT}deg); font-family: "Anton", "Impact", sans-serif; font-weight: 400; }
.op .num { position: absolute; left: ${DX}px; font-size: ${FS}px; line-height: 1em; white-space: nowrap; }
.op .fr { color: var(--fr); will-change: transform; }
.op .ampm { position: absolute; left: ${CX}px; top: ${HY - 0.0485 * 206 - 0.016 * 206}px; font-size: 206px; line-height: 1em; white-space: nowrap; }
.op .temp { position: absolute; left: ${CX}px; top: ${MY - 0.0485 * 206}px; font-size: 206px; line-height: 1em; white-space: nowrap; }
.op .cond { position: absolute; left: ${CX + 4}px; top: ${MY + 0.875 * 206 + 30}px; width: ${CW}px; font-size: 60px; line-height: 1.18em; letter-spacing: 0.012em; }
.op .ft { position: absolute; left: 72px; right: 72px; bottom: 72px; }
.op .cr { display: flex; justify-content: space-between; gap: 40px; align-items: baseline; white-space: nowrap; line-height: 58px; height: 58px; }
.op .cr + .cr { margin-top: 6px; }
.op .cr span { display: inline-block; }
.op .cr i { font-style: normal; font-weight: 500; font-size: 25px; letter-spacing: 0.13em; margin-right: 16px; }
.op .cr b { font-size: 42px; letter-spacing: 0.01em; }
.op .stamp { position: relative; margin: 48px 12px 12px; padding: 36px 46px 30px; transform-origin: 50% 50%; }
.op .fl { font-weight: 500; font-size: 25px; letter-spacing: 0.13em; line-height: 30px; }
.op .fv { margin-top: 10px; text-transform: none; font-size: 40px; line-height: 1.22em; letter-spacing: -0.005em; }
.op .bar { position: absolute; left: 0; top: 0; width: ${W}px; height: 150px; will-change: transform; pointer-events: none;
  background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.05) 18%, rgba(0,0,0,0.16) 40%, rgba(255,255,255,0.12) 47%, rgba(255,255,255,0.34) 52%, rgba(255,255,255,0.1) 58%, rgba(0,0,0,0.22) 70%, rgba(0,0,0,0.5) 75.5%, rgba(255,255,255,0.18) 77%, rgba(0,0,0,0.08) 80%, rgba(0,0,0,0) 100%); }
.op .fb { position: absolute; }
`;

export default {
  title: "Overprint",
  description: "A three-ink risograph poster printed live: sky ink, temperature ink carrying the weather as print texture, and a black plate of enormous numerals pulled again every minute.",
  fonts: ["Anton", "Space Grotesk:wght@500;700"],

  mount(root, { state, seed }) {
    const r = rng(seed);
    const noise = createNoise(seed);
    addStyle(root, CSS);
    root.style.background = PAPER_NIGHT;

    // ---- the colour plates -------------------------------------------------
    // One shader, drawn below full resolution (soft dots are fine; every edge
    // that must be sharp is DOM above it) and only when something on the
    // plates has moved: about 15 times a second while the weather crawls,
    // barely at all on a still, clear day.
    const gl = shader(root, { frag: FRAG, maxScale: 0.75 });
    const uP = new Float32Array(3), uA = new Float32Array(3), uB = new Float32Array(3), uAB = new Float32Array(3);
    const uReg = new Float32Array(4), uSky = new Float32Array(4), uWx = new Float32Array(4), uMo = new Float32Array(4);
    const uRoll = new Float32Array(4), uOld = new Float32Array(4), uFx = new Float32Array(4), uDry = new Float32Array(2);
    const uStamp = new Float32Array(4), uSrot = new Float32Array(2), uC = new Float32Array(4);
    gl.set("u_p", uP); gl.set("u_a", uA); gl.set("u_b", uB); gl.set("u_ab", uAB);
    gl.set("u_reg", uReg); gl.set("u_sky", uSky); gl.set("u_wx", uWx); gl.set("u_mo", uMo);
    gl.set("u_roll", uRoll); gl.set("u_old", uOld); gl.set("u_fx", uFx); gl.set("u_dry", uDry);
    gl.set("u_stamp", uStamp); gl.set("u_srot", uSrot); gl.set("u_c", uC);
    uMo[3] = (seed % 977) * 0.137 + 1.3;
    uRoll[0] = uRoll[1] = 1e5; // at rest the whole sheet is the current pull

    const wrap = el("div", { class: "op" });
    root.append(wrap);

    // Without WebGL: the same poster in flat blocks (no textures).
    let fallback = null;
    if (!gl.ok) {
      const fbA = el("div", { class: "fb", style: { left: `${A0[0]}px`, top: `${A0[1]}px`, width: `${A1[0] - A0[0]}px`, height: `${A1[1] - A0[1]}px` } });
      const fbB = el("div", { class: "fb", style: { left: `${B0[0]}px`, top: `${B0[1]}px`, width: `${B1[0] - B0[0]}px`, height: `${B1[1] - B0[1]}px` } });
      const fbAB = el("div", { class: "fb", style: { left: `${B0[0]}px`, top: `${B0[1]}px`, width: `${A1[0] - B0[0]}px`, height: `${A1[1] - B0[1]}px` } });
      wrap.append(el("div", { class: "crop" }, el("div", { class: "blk" }, fbA, fbB, fbAB)));
      fallback = { fbA, fbB, fbAB };
    }

    // ---- the black plate, twice: a pull wipes from one copy to the other ----
    const stampAngle = r.sign() * r.range(1.1, 1.9);
    function buildLayer() {
      const n = {};
      n.date = el("div", { class: "date" });
      n.pull = el("div", { class: "pull" });
      const hd = el("div", { class: "hd" }, n.date, n.pull);
      n.hhF = el("div", { class: "num fr", style: { top: `${HY - 0.0485 * FS}px` } });
      n.mmF = el("div", { class: "num fr", style: { top: `${MY - 0.0485 * FS}px` } });
      n.hh = el("div", { class: "num", style: { top: `${HY - 0.0485 * FS}px` } });
      n.mm = el("div", { class: "num", style: { top: `${MY - 0.0485 * FS}px` } });
      n.ampm = el("div", { class: "ampm" });
      n.temp = el("div", { class: "temp" });
      n.cond = el("div", { class: "cond" });
      const blk = el("div", { class: "blk" }, n.hhF, n.mmF, n.hh, n.mm, n.ampm, n.temp, n.cond);
      const cell = (key, label) => {
        n[`${key}L`] = el("i", { text: label || "" });
        n[key] = el("b");
        return el("span", null, n[`${key}L`], n[key]);
      };
      n.row1 = el("div", { class: "cr" }, cell("sun"), cell("moon", "Moon"));
      n.row2 = el("div", { class: "cr" }, cell("aqi", "Air quality"), cell("uv", "UV"), cell("wind", "Wind"));
      n.fl = el("div", { class: "fl" });
      n.fv = el("div", { class: "fv" });
      n.stamp = el("div", { class: "stamp", style: { transform: `rotate(${stampAngle}deg)` } }, n.fl, n.fv);
      n.ft = el("div", { class: "ft" }, n.row1, n.row2, n.stamp);
      n.inner = el("div", { class: "in" }, hd, el("div", { class: "crop" }, blk), n.ft);
      n.win = el("div", { class: "win" }, n.inner);
      wrap.append(n.win);
      return n;
    }
    const layers = [buildLayer(), buildLayer()];
    const bar = el("div", { class: "bar", style: { visibility: "hidden" } });
    wrap.append(bar);
    grain(root, { opacity: 0.05 });

    // ---- writing text: only when a string changes -----------------------------
    const shown = {};
    const put = (key, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      layers[0][key].textContent = value;
      layers[1][key].textContent = value;
      return true;
    };
    const measure = document.createElement("canvas").getContext("2d");
    const FACT_W = W - 144 - 24 - 92; // the stamp's inner width
    // the largest size (76 px down to 36) at which the fact fits on two lines
    const factSize = (text) => {
      // one line may be as large as 76 px; two lines at most 50, so the billing
      // above never climbs into the printed block
      for (const size of [76, 64, 56, 50, 46, 42, 38, 36]) {
        measure.font = `700 ${size}px "Space Grotesk"`;
        const lines = wrapText(measure, text, FACT_W - 8);
        if (lines.length > (size > 50 ? 1 : 2)) continue;
        if (lines.every((l) => measure.measureText(l).width <= FACT_W - 8)) return size;
      }
      return 36;
    };

    function writeReadouts(s) {
      const tx = s.text;
      if (put("date", tx.date)) for (const L of layers) fitText(L.date, 690);
      if (put("temp", tx.temp)) for (const L of layers) fitText(L.temp, CW);
      if (put("cond", tx.condition)) {
        // wraps in its column; shrinks only if one word is too long for it
        measure.font = '400 60px "Anton"';
        let widest = 1;
        for (const word of tx.condition.toUpperCase().split(/\s+/)) widest = Math.max(widest, measure.measureText(word).width + word.length * 0.8);
        const size = Math.max(46, Math.min(60, Math.floor((60 * (CW - 6)) / widest)));
        for (const L of layers) L.cond.style.fontSize = `${size}px`;
      }
      put("sunL", tx.sunLabel);
      put("sun", tx.sunValue);
      put("moon", tx.moon);
      put("aqi", tx.aqi);
      put("uv", tx.uv);
      put("wind", tx.wind);
      const fact = tx.factValue || "";
      const a = put("fl", tx.factLabel || "");
      const b = put("fv", fact);
      if (a || b) {
        const size = fact ? factSize(fact) : 40;
        for (const L of layers) {
          L.stamp.style.display = fact ? "" : "none";
          // without a fact the billing sits midway between the block and the foot
          L.ft.style.bottom = fact ? "72px" : "214px";
          L.fv.style.fontSize = `${size}px`;
        }
        if (fact) {
          const st = layers[0].stamp;
          const top = layers[0].ft.offsetTop + st.offsetTop;
          uStamp[0] = 72 + st.offsetLeft + st.offsetWidth / 2;
          uStamp[1] = top + st.offsetHeight / 2;
          uStamp[2] = st.offsetWidth / 2;
          uStamp[3] = st.offsetHeight / 2;
        } else uStamp[2] = 0;
        uSrot[0] = Math.sin((stampAngle * Math.PI) / 180);
        uSrot[1] = Math.cos((stampAngle * Math.PI) / 180);
        dirty = true;
      }
    }
    function writeTime(L, s) {
      const c = s.clock;
      L.hh.textContent = L.hhF.textContent = s.text.hh;
      L.mm.textContent = L.mmF.textContent = s.text.mm;
      L.ampm.textContent = s.text.ampm;
      const no = String(c.h24 * 60 + c.m + 1).padStart(4, "0");
      L.pull.innerHTML = `Pull <b>${no}</b> / 1440`;
    }

    // ---- colour ------------------------------------------------------------------
    const mul = (a, b) => { const x = parse(a), y = parse(b); return toHex([(x[0] * y[0]) / 255, (x[1] * y[1]) / 255, (x[2] * y[2]) / 255]); };
    const scr = (a, b) => { const x = parse(a), y = parse(b); return toHex([255 - ((255 - x[0]) * (255 - y[0])) / 255, 255 - ((255 - x[1]) * (255 - y[1])) / 255, 255 - ((255 - x[2]) * (255 - y[2])) / 255]); };
    const fill = (arr, hex) => { const c = parse(hex); arr[0] = c[0] / 255; arr[1] = c[1] / 255; arr[2] = c[2] / 255; };
    // A ground's way from its night colour to its day colour is bent so that
    // paper and both fields all pass the same mid tone at the same moment (g = 0.5):
    // that is where ink C changes from black to cream, legible on either side.
    const LSTAR = 0.475;
    const cross = (night, day, g) => {
      const ln = toOklab(night)[0], ld = toOklab(day)[0];
      const w = clamp((LSTAR - ln) / Math.max(0.01, ld - ln), 0.06, 0.94);
      return mix(night, day, Math.pow(g, Math.log(w) / Math.log(0.5)));
    };
    let hueB = null;
    let pal = { p: PAPER_NIGHT, a: "#000", b: "#000", ab: "#000", g: 0 };
    let dirty = true;
    function palette(s, snap) {
      const g = smoothstep(0.16, 0.62, s.daylight);
      const sky = toOklch(s.sky.mean);
      const hA = lerpAngle(255, sky.h, smoothstep(0.004, 0.02, sky.c));
      const Ad = oklch(clamp(sky.l, 0.66, 0.8), clamp(sky.c * 1.15, 0.045, 0.15), hA);
      // at night the sky ink is a deep, saturated version of itself on black stock
      const An = oklch(0.265, clamp(sky.c * 1.6, 0.075, 0.12), hA);
      // ink B from the temperature ladder
      let f = 0;
      for (const th of STEPS) f += smoothstep(th - 2.5, th + 2.5, s.weather.temp);
      const i = Math.min(4, Math.floor(f)), k = f - i;
      const lo = LADDER[i], hi = LADDER[i + 1];
      let hB = lerpAngle(lo[2], hi[2], k);
      const diff = ((hB - hA + 540) % 360) - 180;
      if (Math.abs(diff) < 60) hB = (hA + (Math.abs(diff) > 12 ? Math.sign(diff) : k < 0.5 ? lo[3] : hi[3]) * 60 + 360) % 360;
      hueB = hueB == null || snap ? hB : lerpAngle(hueB, hB, 0.12);
      const cB = lerp(lo[1], hi[1], k);
      const Bd = oklch(lerp(lo[0], hi[0], k), cB, hueB);
      // yellow cannot glow at night (dark yellow is olive): it turns to amber
      const hBn = hueB > 70 && hueB < 125 ? lerpAngle(hueB, 64, smoothstep(125, 95, hueB) * smoothstep(70, 85, hueB)) : hueB;
      const Bn = oklch(0.285, Math.min(0.125, cB * 0.8), hBn);

      const PAd = mul(PAPER_DAY, Ad), PBd = mul(PAPER_DAY, Bd);
      // the overprint: the two inks multiplied, as on the press, with the little
      // extra saturation real ink trapping gives (so blue over orange is a rich
      // rust, not mud)
      // Opposite hues cancel to a drab olive-brown; there the overprint leans
      // toward a deep version of ink B (blue over orange prints as terracotta).
      const ab = toOklch(mul(PAd, Bd));
      const lean = smoothstep(148, 160, Math.abs(((hueB - hA + 540) % 360) - 180)) * 0.85;
      const PABd = oklch(ab.l + 0.035, Math.min(0.17, ab.c * 1.6 + 0.04 + lean * 0.03), lerpAngle(ab.h, hueB - 14, lean));
      const PAn = scr(PAPER_NIGHT, An), PBn = scr(PAPER_NIGHT, Bn), PABn = scr(PAn, Bn);
      const p = cross(PAPER_NIGHT, PAPER_DAY, g);
      if (p !== pal.p || g !== pal.g) dirty = true;
      pal = { p, a: cross(PAn, PAd, g), b: cross(PBn, PBd, g), ab: cross(PABn, PABd, g), g };
      fill(uP, pal.p); fill(uA, pal.a); fill(uB, pal.b); fill(uAB, pal.ab);
      fill(uC, INK_NIGHT);
      uC[3] = 1 - smoothstep(0.35, 0.65, g);
      if (shown.fr !== pal.ab) { shown.fr = pal.ab; wrap.style.setProperty("--fr", pal.ab); dirty = true; }
      if (shown.bg !== pal.p) { shown.bg = pal.p; root.style.background = pal.p; }
      if (fallback) {
        fallback.fbA.style.background = pal.a;
        fallback.fbB.style.background = pal.b;
        fallback.fbAB.style.background = pal.ab;
      }
    }
    const inkFor = (day) => (day ? INK_DAY : INK_NIGHT);

    // ---- pulls: a drum pass that wipes the black plate from one copy to the other ----
    let cur = 0;
    const pull = { on: false, t0: 0, dur: 1.5, y0: 0, y1: H };
    const setWipe = (y) => {
      const a = layers[1 - cur], b = layers[cur];
      a.win.style.transform = `translateY(${f1(y - H)}px)`;
      a.inner.style.transform = `translateY(${f1(H - y)}px)`;
      b.win.style.transform = `translateY(${f1(y)}px)`;
      b.inner.style.transform = `translateY(${f1(-y)}px)`;
    };
    const rest = () => {
      const a = layers[cur], b = layers[1 - cur];
      a.win.style.transform = a.inner.style.transform = "none";
      a.win.style.visibility = "visible";
      b.win.style.visibility = "hidden";
      pull.on = false;
    };
    const endPull = () => { cur = 1 - cur; rest(); };
    function startPull(s, full, ink) {
      if (pull.on) endPull();
      const L = layers[1 - cur];
      writeTime(L, s);
      L.win.style.color = ink;
      L.win.style.visibility = "visible";
      pull.on = true;
      pull.t0 = s.t;
      pull.dur = full ? 1.7 : 1.5;
      pull.y0 = full ? -40 : 120;
      pull.y1 = full ? H + 40 : 1440;
    }

    // ---- first state: the poster is already printed ---------------------------------
    palette(state, true);
    let inkDay = pal.g > 0.5;
    writeReadouts(state);
    writeTime(layers[0], state);
    writeTime(layers[1], state);
    let timeShown = state.text.time;
    layers[0].win.style.color = layers[1].win.style.color = inkFor(inkDay);
    rest();
    let lastMs = state.ms;
    let palT = 0;
    let driftX = r.range(0, 4000), driftY = r.range(0, 4000), rainTravel = r.range(0, 3000), snowFall = r.range(0, 3000);
    const jolt = new Float32Array(4), joltTarget = new Float32Array(4), regQ = new Int16Array(4);
    let nextJolt = r.range(3, 8);
    let lastDraw = -1, drawnW = 0, drawnH = 0;

    // The print-in. The display cuts to this piece on the quarter hour; at that
    // moment the press runs the sheet again: three rollers pass down it (sky,
    // temperature, black), each laying fresh, glossy ink in a new registration
    // over the last pull. The poster is complete before, during and after.
    let printT0 = -1e9;
    const PASS_A = 0.4, PASS_B = 2.2, PASS_C = 4.0, PASS = 1.6;
    const rollY = (t, t0) => lerp(-60, H + 60, ease.inOut(clamp((t - t0) / PASS)));
    let blackDone = true;

    return {
      frame(s) {
        const t = s.t, dt = s.dt, wx = s.weather;
        const jumped = Math.abs(s.ms - lastMs) > 5000;
        if (!jumped && s.frame > 0 && Math.floor(s.ms / SLOT) > Math.floor(lastMs / SLOT)) {
          printT0 = t;
          blackDone = false;
          for (let i = 0; i < 4; i++) uOld[i] = r.range(-3.5, 3.5); // the last pull sat elsewhere
        }
        lastMs = s.ms;

        if (jumped || t - palT > 0.4 || s.frame < 3) { palette(s, jumped); palT = t; }
        writeReadouts(s);

        // ---- the black plate ---------------------------------------------------
        const pt = t - printT0;
        if (!blackDone && pt >= PASS_C) {
          blackDone = true;
          timeShown = s.text.time;
          startPull(s, true, inkFor(inkDay));
          pull.t0 = printT0 + PASS_C;
        }
        const wantDay = inkDay ? pal.g > 0.48 : pal.g > 0.52;
        if (wantDay !== inkDay) {
          inkDay = wantDay;
          timeShown = s.text.time;
          if (jumped) { if (pull.on) endPull(); writeTime(layers[cur], s); layers[0].win.style.color = layers[1].win.style.color = inkFor(inkDay); }
          else startPull(s, true, inkFor(inkDay));
        } else if (s.text.time !== timeShown) {
          timeShown = s.text.time;
          if (jumped) { if (pull.on) endPull(); writeTime(layers[0], s); writeTime(layers[1], s); }
          else startPull(s, false, inkFor(inkDay));
        }
        let barY = -1e4;
        if (pull.on) {
          const k = clamp((t - pull.t0) / pull.dur);
          const y = lerp(pull.y0, pull.y1, ease.inOut(k));
          setWipe(y);
          barY = y;
          if (k >= 1) endPull();
        }

        // ---- the colour plates: print-in rollers --------------------------------
        let rolling = false;
        if (pt < PASS_C + 8) {
          const yA = pt < PASS_A ? -1e4 : rollY(pt, PASS_A);
          const yB = pt < PASS_B ? -1e4 : rollY(pt, PASS_B);
          uRoll[0] = pt < PASS_A + PASS ? yA : 1e5;
          uRoll[1] = pt < PASS_B + PASS ? yB : 1e5;
          uRoll[2] = pt < PASS_A ? 0 : Math.exp(-Math.max(0, pt - PASS_A - PASS * 0.5) / 2.2);
          uRoll[3] = pt < PASS_B ? 0 : Math.exp(-Math.max(0, pt - PASS_B - PASS * 0.5) / 2.2);
          if (pt >= PASS_A && pt < PASS_A + PASS) barY = yA;
          else if (pt >= PASS_B && pt < PASS_B + PASS) barY = yB;
          // the last pull has dried a shade lighter than the fresh ink coming down over it
          uDry[0] = pt < PASS_A + PASS ? 0.2 * smoothstep(0, 0.4, pt) : 0;
          uDry[1] = pt < PASS_B + PASS ? 0.2 * smoothstep(0, 0.4, pt) : 0;
          rolling = true;
        } else if (uRoll[2] !== 0 || uRoll[3] !== 0) {
          uRoll[0] = uRoll[1] = 1e5;
          uRoll[2] = uRoll[3] = 0;
          uDry[0] = uDry[1] = 0;
          dirty = true;
        }
        if (barY > -100 && barY < H + 100) {
          bar.style.visibility = "visible";
          bar.style.transform = `translateY(${f1(barY - 114)}px)`; // the drum's contact line is the roller position
        } else if (bar.style.visibility !== "hidden") bar.style.visibility = "hidden";

        // ---- registration: the wind knocks the colour plates about -------------------
        // where it blows to on the sheet (east is right, north is up)
        const head = ((wx.windDir + 180) * Math.PI) / 180;
        const vx = Math.sin(head), vy = -Math.cos(head);
        const amp = remap(wx.wind, 0, 28, 0.45, MAXREG);
        const sp = 0.035 + wx.wind * 0.004;
        if (t > nextJolt) {
          // a gust knocks one plate along the wind
          nextJolt = t + r.range(5, 13) * clamp(30 / Math.max(10, wx.gust), 0.6, 3);
          if (wx.gust > 14) {
            const j = r.chance(0.5) ? 0 : 2, m = clamp(wx.gust / 45) * r.range(2.2, 4.2);
            joltTarget[j] = vx * m + r.range(-0.6, 0.6);
            joltTarget[j + 1] = vy * m + r.range(-0.6, 0.6);
          }
        }
        const decay = Math.pow(0.5, dt / 0.9), chase = 1 - Math.pow(0.5, dt / 0.09);
        for (let i = 0; i < 4; i++) {
          joltTarget[i] *= decay;
          jolt[i] += (joltTarget[i] - jolt[i]) * chase;
          uReg[i] = amp * 0.85 * noise.n2(t * sp + i * 17.3, i * 5.1 + 0.5) + jolt[i];
        }
        for (let i = 0; i < 4; i += 2) {
          const len = Math.hypot(uReg[i], uReg[i + 1]);
          if (len > MAXREG) { uReg[i] *= MAXREG / len; uReg[i + 1] *= MAXREG / len; }
        }
        // redraw for registration only when a plate has moved a quarter pixel
        let moved = false;
        for (let i = 0; i < 4; i++) {
          const q = Math.round(uReg[i] * 4);
          if (q !== regQ[i]) { regQ[i] = q; moved = true; }
        }
        if (moved) {
          // the colour laid under the numerals for a rich black shows as a fringe when a plate slips
          const tb = `translate(${f1(uReg[2])}px,${f1(uReg[3])}px)`;
          const ta = `translate(${f1(uReg[0])}px,${f1(uReg[1])}px)`;
          for (const L of layers) { L.hhF.style.transform = tb; L.mmF.style.transform = ta; }
        }

        // ---- the weather, as print texture -------------------------------------------
        const drift = Math.max(1.6, wx.wind * 0.9) * dt;
        driftX -= vx * drift;
        driftY -= vy * drift;
        uSky[0] = clamp(wx.cloud / 100);
        uSky[1] = smoothstep(35, 95, wx.humidity);
        uSky[2] = driftX;
        uSky[3] = driftY;
        const wet = wx.falling === "rain" || wx.falling === "drizzle" || wx.falling === "freezing" || wx.falling === "storm";
        const inten = wx.intensity;
        const slant = clamp(wx.wind * 0.034, 0.05, 0.95) * (vx >= 0 ? 1 : -1);
        uWx[0] = wet ? clamp(0.12 + inten * 0.95) : 0;
        uWx[1] = slant;
        uWx[2] = wx.falling === "snow" ? clamp(0.35 + inten * 0.75) : 0;
        uWx[3] = wx.fog ? 1 : 0;
        rainTravel += (45 + 80 * inten) * dt;
        snowFall += (12 + 16 * inten) * dt;
        uMo[0] = rainTravel;
        uMo[1] = snowFall;
        uMo[2] = wx.kind === "storm" ? 1 : 0;
        uFx[0] = wx.falling || wx.fog ? 0 : smoothstep(34, 22, wx.cloud);
        uFx[1] = smoothstep(84, 96, wx.temp) * 3.2;
        uFx[2] = smoothstep(90, 170, wx.aqi) * 0.42;
        uFx[3] += dt * 0.55;

        // ---- draw the plates when something on them has changed ---------------------
        const crawling = uWx[0] > 0 || uWx[2] > 0 || uWx[3] > 0 || uFx[1] > 0.05 || uSky[0] > 0.08;
        const since = t - lastDraw;
        const resized = gl.canvas.width !== drawnW || gl.canvas.height !== drawnH;
        if (dirty || resized || jumped || moved || rolling || (crawling && since >= 1 / 15) || since >= 0.5 || s.frame < 2) {
          dirty = false;
          lastDraw = t;
          drawnW = gl.canvas.width;
          drawnH = gl.canvas.height;
          gl.draw(t);
        }
      },
    };
  },
};

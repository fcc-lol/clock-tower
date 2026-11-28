// Wash Day
//
// A rear courtyard in Long Island City on wash day. The time is printed in
// Fraunces Black on bedsheets pegged out on pulley lines between two slivers of
// brick wall: the hours on the top line (one digit hangs as a centred pair with
// the AM/PM pillowcase), the minutes on the second. The condition and the date
// are woven into the hem bands of the big sheets. The smaller linen on the third
// line carries the temperature, the countdown to sunrise or sunset, the moon and
// a flannel knitted with the air quality and UV; the long tea towel at the
// bottom carries today's fact (on a day without one it is simply not hung out).
//
// How the conditions drive it
//   wind       every item is a verlet cloth. Speed sets how far it flies, gusts
//              arrive as slow pulses that make the wash breathe, and the bearing
//              decides which way it streams (we look north: a west wind blows
//              left to right). The time sheets are pegged at the bottom corners
//              to a lower cord that gives in a wind, so they belly like sails but
//              never turn their backs; the small linen has weighted hems and
//              streams at no more than about 35 degrees. In a calm it all hangs
//              plumb and barely moves.
//   temperature picks the one print ink (cobalt in the cold, through violet and
//              claret, to tomato in the heat). Below about 25 F the wash freezes
//              in whatever pose the wind left it in and rocks as stiff boards,
//              with frost on the hems and icicles.
//   rain       soaks down from the top hem as a dark front, makes the cloth
//              heavy and less lively, bows the lines and drips from the hems.
//              After rain, humidity decides how long the hems stay damp.
//   snow       falls on the real wind and rides the lines.
//   sky        the background is the measured sky (west on the left, east on
//              the right); cloud softens the light on the cotton and sends
//              shadows across it; fog swallows the rooftops and the far lines;
//              a storm swells the sky with a slow, soft glow now and then.
//   light      the sun sets the direction and warmth of the light on the folds.
//              By day the cotton is white and the ink dark; in the few minutes
//              around the end of dusk a shadow line climbs the wash, and below
//              it the cotton is dark and the print glows pale, so the room stays
//              dark at night. A wall lamp warms the nearest cloth after dark.
//   the clock  on the minute the pulley turns: when only the last digit changes
//              the line runs just far enough to take that sheet behind the
//              right-hand wall and back; when the tens change (and on the
//              hour, for both lines) it runs on round like a conveyor, the old
//              sheets out to the right and the new ones in from the left.
//
// Technique: one WebGL canvas (the kit has full-screen shaders only, so the
// small mesh renderer lives in this file). Prints are drawn to 2D canvases when
// their text changes and used as textures; the type is on canvas because the
// letters are part of the cloth simulation. Rain, snow, drips and icicles are a
// 2D overlay. Without WebGL the wash is drawn hanging flat on a 2D canvas.

import { W, H, TAU, clamp, lerp, smoothstep, approach, rng, hash, createNoise, oklch, toOklch, ramp, vec3, el, canvas2d, wrapText } from "../lib/kit.js";

const FONT = '"Fraunces", Georgia, serif';
const WALL = 50; // width of each brick sliver
const GRAV = 900; // px/s^2: a little slower than life, so it is calm to live with
const LINE_Y = [64, 674, 1284, 1614];
const SHEET_H = 550;
const PERSP = 4200;
const HORIZON = 860;

// key, line, rest x, size, mesh, which columns are pegged, tethered at the bottom corners
const SPEC = [
  { key: "h1", line: 0, x: 84, w: 290, h: SHEET_H, cols: 11, rows: 20, pegs: [0, 5, 10], tether: true },
  { key: "h2", line: 0, x: 84, w: 448, h: SHEET_H, cols: 16, rows: 20, pegs: [0, 5, 10, 15], tether: true },
  { key: "ap", line: 0, x: 548, w: 150, h: 216, cols: 6, rows: 8, pegs: [0, 5] },
  { key: "m1", line: 1, x: 84, w: 448, h: SHEET_H, cols: 16, rows: 20, pegs: [0, 5, 10, 15], tether: true },
  { key: "m2", line: 1, x: 548, w: 448, h: SHEET_H, cols: 16, rows: 20, pegs: [0, 5, 10, 15], tether: true },
  { key: "temp", line: 2, x: 84, w: 232, h: 196, cols: 9, rows: 8, pegs: [0, 8] },
  { key: "sun", line: 2, x: 332, w: 232, h: 190, cols: 9, rows: 8, pegs: [0, 8] },
  { key: "moon", line: 2, x: 580, w: 220, h: 262, cols: 8, rows: 10, pegs: [0, 7] },
  { key: "air", line: 2, x: 816, w: 180, h: 282, cols: 7, rows: 11, pegs: [0, 6] },
  { key: "fact", line: 3, x: 84, w: 912, h: 244, cols: 30, rows: 9, pegs: [0, 10, 19, 29] },
];

// One ink at a time, chosen by the temperature. All dark enough for small type on cotton.
const INK_RAMP = ramp([
  [0.0, "#1c2a94"], // 8 F and below: deep cobalt
  [0.26, "#1b48cc"], // freezing: cobalt
  [0.42, "#3b3ab4"], // 46 F: ultramarine violet
  [0.54, "#6a2a8c"], // 56 F: aubergine
  [0.65, "#9a2262"], // 66 F: claret
  [0.76, "#ab2236"], // 76 F: carmine
  [0.88, "#b62b18"], // 86 F: tomato
  [1.0, "#b2340f"], // 97 F and above
]);

const HAZE = [0.86, 0.8, 0.7];
const LAMP_COL = [0.14, 0.084, 0.0392];
const SIL_DAY = [0.07, 0.08, 0.11];
const CLOUD_NIGHT = [0.09, 0.1, 0.13];
const ROPE = [0.6, 0.52, 0.4];
const ROPE_N = [0.17, 0.165, 0.17];
const CORD = [0.44, 0.4, 0.34];
const CORD_N = [0.12, 0.12, 0.13];

const PREC = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;
// The shadow line that climbs the courtyard at dusk: 0 above it (day), 1 below (night).
const FRONT = `uniform float u_front;
float nightF(vec2 p) { return smoothstep(-0.05, 0.05, u_front - (1.0 - p.y / 1920.0) - (p.x / 1080.0 - 0.5) * 0.14); }
`;

const VS_SKY = `attribute vec2 a_p; varying vec2 v_pos;
void main() { v_pos = vec2((a_p.x * 0.5 + 0.5) * 1080.0, (0.5 - a_p.y * 0.5) * 1920.0); gl_Position = vec4(a_p, 0.0, 1.0); }`;
const FS_SKY = `${PREC}varying vec2 v_pos;
uniform sampler2D u_tex; uniform sampler2D u_noise;
uniform vec3 u_c0; uniform vec3 u_c1; uniform vec3 u_c2; uniform vec3 u_c3;
uniform vec3 u_sil; uniform float u_silA; uniform vec3 u_win;
uniform vec3 u_cloudCol; uniform vec3 u_cloud; uniform vec2 u_drift;
uniform float u_stars; uniform float u_time; uniform float u_flash;
uniform vec4 u_lamp; uniform vec3 u_lampCol; uniform vec2 u_vert; uniform vec4 u_glow; uniform vec3 u_glowCol;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float x = v_pos.x / 1080.0; float y = v_pos.y / 1920.0; float t = x * 3.0;
  vec3 c = mix(mix(u_c0, u_c1, smoothstep(0.0, 1.0, t)), mix(u_c2, u_c3, smoothstep(2.0, 3.0, t)), smoothstep(1.0, 2.0, t));
  c *= mix(u_vert.x, u_vert.y, y);
  if (u_cloud.z > 0.003) {
    vec2 p = v_pos / 1080.0;
    float n = texture2D(u_noise, p * vec2(0.5, 0.85) + u_drift).r * 0.62 + texture2D(u_noise, p * vec2(1.6, 2.5) + u_drift * 2.3 + 0.37).g * 0.38;
    c = mix(c, u_cloudCol, smoothstep(u_cloud.x, u_cloud.y, n) * u_cloud.z);
  }
  if (u_stars > 0.003) {
    vec2 g = v_pos / 54.0; vec2 id = floor(g); float h = hash(id);
    if (h > 0.6) {
      vec2 o = vec2(hash(id + 3.1), hash(id + 7.7)) * 0.7 + 0.15;
      float d = length((fract(g) - o) * 54.0);
      float tw = 0.72 + 0.28 * sin(u_time * (0.35 + h * 0.8) + h * 40.0);
      c += u_stars * tw * (0.2 + 0.8 * fract(h * 17.0)) * smoothstep(1.8, 0.4, d) * vec3(0.8, 0.86, 1.0);
    }
  }
  vec2 gd = (v_pos - u_glow.xy) / u_glow.z;
  c += u_glowCol * (u_glow.w * exp(-dot(gd, gd)));
  vec2 lv = v_pos - u_lamp.xy;
  c += u_lampCol * (u_lamp.w * 0.55 / (1.0 + dot(lv, lv) / 7000.0));
  float sy = (v_pos.y - 1770.0) / 150.0;
  if (sy > 0.0) {
    vec4 sk = texture2D(u_tex, vec2(x, sy));
    c = mix(c, u_sil, sk.r * u_silA);
    c += u_win * sk.g * u_silA;
  }
  c += u_flash * vec3(0.15, 0.16, 0.21) * (1.0 - y * 0.5);
  c += (hash(gl_FragCoord.xy) - 0.5) / 150.0;
  gl_FragColor = vec4(c, 1.0);
}`;

const VS_CLOTH = `attribute vec3 a_pos; attribute vec3 a_nrm; attribute vec2 a_uv;
varying vec2 v_uv; varying vec3 v_n; varying vec3 v_p;
void main() {
  v_uv = a_uv; v_n = a_nrm; v_p = a_pos;
  float s = 1.0 + a_pos.z / ${PERSP}.0;
  gl_Position = vec4((540.0 + (a_pos.x - 540.0) * s) / 540.0 - 1.0, 1.0 - (${HORIZON}.0 + (a_pos.y - ${HORIZON}.0) * s) / 960.0, 0.0, 1.0);
}`;
const FS_CLOTH = `${PREC}varying vec2 v_uv; varying vec3 v_n; varying vec3 v_p;
uniform sampler2D u_tex; uniform sampler2D u_noise;
uniform vec2 u_size; uniform float u_ratio; uniform float u_seed; uniform float u_shade; uniform float u_crumple;
uniform vec3 u_L; uniform vec3 u_amb; uniform vec3 u_sun; uniform vec3 u_cloth; uniform vec3 u_wetTint;
uniform vec3 u_inkDay; uniform vec3 u_inkNight; uniform vec3 u_night; uniform vec3 u_moonL;
uniform vec4 u_lamp; uniform vec3 u_lampCol;
uniform vec2 u_wet; uniform float u_frost; uniform vec4 u_fog; uniform float u_flash; uniform float u_clothNight;
${FRONT}
void main() {
  vec4 pr = texture2D(u_tex, v_uv);
  vec2 q = v_uv * u_size;
  vec4 nz = texture2D(u_noise, q / 340.0 + u_seed);
  vec3 n = normalize(v_n);
  if (n.z < 0.0) n = -n;
  n = normalize(n + vec3((nz.rg - 0.5) * u_crumple, 0.0));
  float ink = clamp(pr.r + pr.g * 0.3, 0.0, 1.0);

  float wv = v_uv.y + (nz.b - 0.5) * 0.12;
  float wet = max(1.0 - smoothstep(u_wet.x - 0.025, u_wet.x + 0.025, wv), smoothstep(u_wet.y - 0.025, u_wet.y + 0.025, wv));

  // by day: white cotton under the sky and the sun
  vec3 light = u_amb + u_sun * mix(u_L.z, max(dot(n, u_L), 0.0), u_shade);
  vec3 dayC = min(u_cloth * light, vec3(1.0));
  dayC = mix(dayC, dayC * u_wetTint, wet);
  float lum = min(dot(light, vec3(0.3, 0.6, 0.1)), 1.0);
  vec3 inkD = u_inkDay * (0.45 + 0.55 * lum) * (1.0 - 0.2 * wet);
  vec3 day = mix(dayC, inkD, ink) * (1.0 - pr.b * 0.1);

  // in shadow: dark cotton by moon and lamp, and the print glows
  vec3 lv = u_lamp.xyz - v_p; float ld = dot(lv, lv);
  float la = u_lamp.w * 2.4 / (1.0 + ld / 380000.0);
  float lamb = 0.35 + 0.65 * max(dot(n, lv * inversesqrt(ld)), 0.0);
  vec3 nightC = u_night * (0.42 + 1.05 * mix(u_moonL.z, max(dot(n, u_moonL), 0.0), u_shade)) + u_lampCol * la * lamb;
  nightC *= 1.0 - 0.3 * wet;
  vec3 inkN = u_inkNight * (0.8 + 0.2 * n.z) + u_lampCol * la * lamb * 0.6;
  vec3 night = mix(nightC, inkN, ink) * (1.0 - pr.b * 0.25);

  float f = u_clothNight;
  vec3 col = mix(day, night, f);

  if (u_frost > 0.003) {
    float band = smoothstep(0.17, 0.0, 1.0 - v_uv.y);
    float edge = 1.0 - smoothstep(0.0, 0.07, min(v_uv.x, 1.0 - v_uv.x));
    vec4 cr = texture2D(u_noise, q / 64.0 + u_seed * 3.0);
    float fr = u_frost * smoothstep(0.42, 0.78, max(band, edge * 0.8) * (0.5 + cr.b * 0.95 + (nz.g - 0.5) * 0.5));
    vec3 frostC = mix(vec3(0.95, 0.98, 1.0) * min(lum + 0.12, 1.0), u_night * 2.6 + vec3(0.05, 0.06, 0.08), f);
    col = mix(col, frostC, fr * (0.85 - 0.72 * ink));
    col += fr * step(0.93, cr.a) * mix(0.1, 0.07, f);
  }
  col += u_flash * vec3(0.09, 0.1, 0.14) * (1.0 - ink);
  col = mix(col, u_fog.rgb, u_fog.a);
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 160.0; // dither: no banding on a big panel
  vec2 e = min(v_uv, 1.0 - v_uv) * u_size * u_ratio;
  float a = clamp(min(e.x, e.y), 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}`;

const VS_LINE = `attribute vec3 a_p; varying float v_s; varying vec2 v_pos;
void main() { v_s = a_p.z; v_pos = a_p.xy; gl_Position = vec4(a_p.x / 540.0 - 1.0, 1.0 - a_p.y / 960.0, 0.0, 1.0); }`;
const FS_LINE = `${PREC}varying float v_s; varying vec2 v_pos;
uniform vec3 u_col; uniform vec3 u_colN; uniform vec2 u_hw; uniform vec4 u_fog;
${FRONT}
void main() {
  float a = clamp((u_hw.x - abs(v_s) * (u_hw.x + 1.0)) * u_hw.y + 0.5, 0.0, 1.0);
  vec3 c = mix(mix(u_col, u_colN, nightF(v_pos)), u_fog.rgb, u_fog.a);
  gl_FragColor = vec4(c * a, a);
}`;

const VS_SPRITE = `attribute vec2 a_p; attribute vec2 a_uv; attribute float a_e;
varying vec2 v_uv; varying vec2 v_pos; varying float v_e;
void main() { v_uv = a_uv; v_pos = a_p; v_e = a_e; gl_Position = vec4(a_p.x / 540.0 - 1.0, 1.0 - a_p.y / 960.0, 0.0, 1.0); }`;
const FS_SPRITE = `${PREC}varying vec2 v_uv; varying vec2 v_pos; varying float v_e;
uniform sampler2D u_tex; uniform vec3 u_light; uniform vec3 u_lightN; uniform vec3 u_emit;
uniform vec4 u_lamp; uniform vec3 u_lampCol; uniform vec4 u_fog; uniform float u_flash;
${FRONT}
void main() {
  vec4 t = texture2D(u_tex, v_uv);
  vec3 light = mix(u_light, u_lightN, nightF(v_pos));
  vec2 lv = v_pos - u_lamp.xy;
  light += u_lampCol * (u_lamp.w * 3.2 / (1.0 + dot(lv, lv) / 30000.0)) + u_flash * vec3(0.1, 0.11, 0.15);
  vec3 c = t.rgb * mix(light, u_emit, v_e);
  c = mix(c, u_fog.rgb * t.a, u_fog.a * (1.0 - v_e));
  gl_FragColor = vec4(c, t.a);
}`;

const font = (weight, size, italic) => `${italic ? "italic " : ""}${weight} ${size}px ${FONT}`;
const projX = (x, z) => 540 + (x - 540) * (1 + z / PERSP);
const projY = (y, z) => HORIZON + (y - HORIZON) * (1 + z / PERSP);

export default {
  title: "Wash Day",
  description: "The time is printed on bedsheets pegged out across a courtyard, and the real wind over Long Island City flies them.",
  fonts: ["Fraunces:opsz,wght@9..144,400..900"],
  fps: 24, // cloth in wind reads as well at 24 frames, and the Pi has a 4K panel to fill

  mount(root, { state, seed }) {
    const r = rng(seed);
    const noise = createNoise(seed);
    const ss0 = state.scale > 0 ? state.scale : 1; // real pixels per stage unit when mounted
    const texScale = clamp(Math.min(2, ss0), 1, 2);

    const wrap = el("div", { style: { position: "absolute", inset: "0", overflow: "hidden", background: "#0b0e18" } });
    root.append(wrap);
    const glCanvas = el("canvas", { style: { position: "absolute", left: "0", top: "0", width: `${W}px`, height: `${H}px` } });
    wrap.append(glCanvas);
    const over = canvas2d(wrap, { adaptive: true }); // precipitation; also tells us how the machine is coping
    over.canvas.style.display = "none"; // shown only while something is falling, dripping or frozen

    // ------------------------------------------------------------------
    // The lines and the wash
    // ------------------------------------------------------------------
    const lines = LINE_Y.map((y) => ({ y, sag: 10, bob: 0, haul: 0, phase: 0, t0: 0, dur: 1, dist: 0, full: false, prog: 0, spin: 0 }));
    const lineY = (L, x) => {
      const k = (x - 540) / 496;
      return L.y + L.bob + L.sag * (1 - k * k);
    };

    let N = 0;
    let indexCount = 0;
    const cloths = SPEC.map((sp, i) => {
      const c = {
        ...sp, i, off: N, n: sp.cols * sp.rows, dx: sp.w / (sp.cols - 1), dy: sp.h / (sp.rows - 1),
        idx0: indexCount, idxN: (sp.cols - 1) * (sp.rows - 1) * 6,
        visible: true, sig: null, dirty: false, tex: null,
        tw: Math.ceil(sp.w * texScale), th: Math.ceil(sp.h * texScale), canvas: document.createElement("canvas"), ctx: null,
        wetA: 0, wetB: 0, wetAmt: 0, ax: 0, az: 0, rip: 0, damp: 1.5, mass: 1, cs: 1, slack: 0,
        th1: 0, th1v: 0, ph1: 0, ph1v: 0, frozenSet: false, seed: r.range(0, 10),
        scallop: new Float32Array(sp.cols),
      };
      c.canvas.width = c.tw;
      c.canvas.height = c.th;
      c.ctx = c.canvas.getContext("2d", { willReadFrequently: true });
      for (let p = 0; p < sp.pegs.length - 1; p++) {
        const a = sp.pegs[p];
        const b = sp.pegs[p + 1];
        for (let k = a; k <= b; k++) c.scallop[k] = (sp.tether ? 6 : 4) * Math.sin((Math.PI * (k - a)) / (b - a)) ** 2;
      }
      N += c.n;
      indexCount += c.idxN;
      return c;
    });
    const byKey = {};
    for (const c of cloths) byKey[c.key] = c;

    const P = new Float32Array(N * 3); // positions
    const Q = new Float32Array(N * 3); // previous positions
    const NR = new Float32Array(N * 3); // normals
    const IM = new Float32Array(N); // inverse mass (0 = pegged)
    const RIP = new Float32Array(N); // this frame's ripple field
    const FRZ = new Float32Array(N * 3); // the pose each cloth froze in, relative to its pegs
    const vbuf = new Float32Array(N * 6);
    const uvs = new Float32Array(N * 2);
    const indices = new Uint16Array(indexCount);

    for (const c of cloths) {
      for (let j = 0; j < c.rows; j++) {
        for (let i = 0; i < c.cols; i++) {
          const k = c.off + j * c.cols + i;
          uvs[k * 2] = i / (c.cols - 1);
          uvs[k * 2 + 1] = j / (c.rows - 1);
          IM[k] = j === 0 ? 0 : 1;
          NR[k * 3 + 2] = 1;
        }
      }
      let o = c.idx0;
      for (let j = 0; j < c.rows - 1; j++) {
        for (let i = 0; i < c.cols - 1; i++) {
          const a = c.off + j * c.cols + i;
          const d = a + c.cols;
          indices[o++] = a; indices[o++] = d; indices[o++] = a + 1;
          indices[o++] = a + 1; indices[o++] = d; indices[o++] = d + 1;
        }
      }
    }
    function hangFlat(c) {
      const L = lines[c.line];
      for (let j = 0; j < c.rows; j++) {
        for (let i = 0; i < c.cols; i++) {
          const k3 = (c.off + j * c.cols + i) * 3;
          const x = c.x + L.haul + i * c.dx;
          P[k3] = Q[k3] = x;
          P[k3 + 1] = Q[k3 + 1] = lineY(L, x) + c.scallop[i] + j * c.dy * 0.985;
          P[k3 + 2] = Q[k3 + 2] = 0;
        }
      }
    }
    function shiftCloth(c, nx) {
      const d = nx - c.x;
      if (!d) return;
      c.x = nx;
      for (let k = c.off; k < c.off + c.n; k++) {
        P[k * 3] += d;
        Q[k * 3] += d;
      }
    }

    // pegs: top pegs on the line, and the two that hold a sheet's bottom corners to the cord
    const pegs = [];
    for (const c of cloths) {
      for (const col of c.pegs) pegs.push({ c, node: c.off + col, bottom: false, tilt: r.range(-0.12, 0.12) });
      if (c.tether) for (const col of [0, c.cols - 1]) pegs.push({ c, node: c.off + (c.rows - 1) * c.cols + col, bottom: true, tilt: r.range(-0.2, 0.2) });
    }
    const spareFact = [{ x: 262, tilt: -0.1 }, { x: 290, tilt: 0.12 }, { x: 700, tilt: 0.06 }];
    const spare = [{ x: 118, tilt: 0.1 }, { x: 146, tilt: -0.14 }, { x: 912, tilt: 0.05 }, { x: 962, tilt: -0.08 }]; // waiting on the hours line when it is half empty

    // ------------------------------------------------------------------
    // What is printed where
    // ------------------------------------------------------------------
    const tx = state.text;
    const disp = { hh: tx.hh, mm: tx.mm, ampm: tx.ampm, weekday: tx.weekday, monthDay: tx.monthDay };
    let direct = null; // set when WebGL is missing: prints are then drawn in their real colors

    function begin(c) {
      const x = c.ctx;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = "source-over";
      x.fillStyle = direct ? direct.cloth : "#000";
      x.fillRect(0, 0, c.tw, c.th);
      x.setTransform(c.tw / c.w, 0, 0, c.th / c.h, 0, 0);
      if (!direct) x.globalCompositeOperation = "lighter";
      // the hem: a line of stitches (blue channel)
      x.strokeStyle = direct ? "rgba(0,0,0,0.08)" : "#0000ff";
      x.lineWidth = 1.6;
      x.setLineDash([7, 5]);
      x.strokeRect(9, 9, c.w - 18, c.h - 18);
      x.setLineDash([]);
      x.fillStyle = x.strokeStyle = direct ? direct.ink : "#ff0000";
      x.textBaseline = "alphabetic";
      x.textAlign = "center";
      return x;
    }
    function fit(x, text, weight, size, maxW, italic, min = 0) {
      x.font = font(weight, size, italic);
      const m = x.measureText(text).width;
      if (m > maxW) {
        size = Math.max(min, Math.floor((size * maxW) / m));
        x.font = font(weight, size, italic);
      }
      return size;
    }
    function bigDigit(x, d, cx, top, bottom, maxW) {
      // measured with left alignment, so the ink box is centred exactly on the sheet
      x.textAlign = "left";
      x.font = font(900, 100);
      const m0 = x.measureText("0");
      const size = ((bottom - top) * 100) / (m0.actualBoundingBoxAscent + m0.actualBoundingBoxDescent);
      x.font = font(900, size);
      const m = x.measureText(d);
      const bw = m.actualBoundingBoxRight + m.actualBoundingBoxLeft;
      const sx = Math.min(1, maxW / bw);
      x.save();
      x.translate(cx, bottom - (m0.actualBoundingBoxDescent * size) / 100);
      x.scale(sx, 1);
      x.fillText(d, -(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, 0);
      // a little ink spread: the Didone hairlines (the diagonal of a 4, the neck of a 2) must carry across a room
      x.lineWidth = size * 0.014;
      x.lineJoin = "round";
      x.strokeText(d, -(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, 0);
      x.restore();
      x.textAlign = "center";
    }
    // The ink box of a line of type in the current font: [ascent, descent] above and below the baseline.
    function inkOf(x, text) {
      const m = x.measureText(text);
      return [m.actualBoundingBoxAscent, m.actualBoundingBoxDescent];
    }
    // Lines of type stacked down a cloth by their real ink, centred between top and bottom. Each row is
    // [text, weight, size, minSize, gap above it (ink to ink)]. Called only when a print changes.
    function stack(x, w, rows, top, bottom, maxW) {
      let total = 0;
      const set = rows.map(([text, weight, size, min, gap], k) => {
        const s = fit(x, text, weight, size, maxW, false, min);
        const [a, d] = inkOf(x, text);
        total += a + d + (k ? gap : 0);
        return [text, font(weight, s), a, d, k ? gap : 0];
      });
      let y = top + (bottom - top - total) / 2;
      const edges = []; // where the ink of each row ends, then where the next begins
      for (const [text, f, a, d, gap] of set) {
        y += gap;
        if (edges.length) edges.push(y);
        y += a;
        x.font = f;
        x.fillText(text, w / 2, y);
        y += d;
        edges.push(y);
      }
      return edges;
    }
    function printSheet(c, digit, word) {
      const x = begin(c);
      const { w, h } = c;
      x.fillRect(0, 20, w, 8);
      x.fillRect(0, 33, w, 2.5);
      x.fillRect(0, 40, w, 2.5);
      x.fillRect(0, h - 30, w, 8);
      x.fillRect(0, h - 118, w, 2.5);
      x.fillRect(0, h - 125, w, 2.5);
      if (word) {
        // centred in the hem band on fixed metrics, so the words on neighbouring sheets share a baseline
        fit(x, word, 800, 48, w - 56, false, 44);
        const cap = inkOf(x, "H")[0];
        const desc = inkOf(x, "y")[1];
        x.fillText(word, w / 2, (h - 115.5 + h - 30) / 2 + (cap - desc) / 2);
      }
      bigDigit(x, digit, w / 2, 66, h - 146, w - 70);
    }
    function printPillow(c, text) {
      const x = begin(c);
      const { w, h } = c;
      x.lineWidth = 4;
      x.strokeRect(17, 17, w - 34, h - 34);
      x.lineWidth = 1.5;
      x.strokeRect(25.5, 25.5, w - 51, h - 51);
      const size = fit(x, text, 900, 70, w - 62);
      x.fillText(text, w / 2, h / 2 + size * 0.36);
    }
    function printTemp(c, text) {
      const x = begin(c);
      const { w, h } = c;
      x.fillRect(0, 14, w, 7);
      x.fillRect(0, 26, w, 2.5);
      x.fillRect(0, h - 21, w, 7);
      x.fillRect(0, h - 28.5, w, 2.5);
      const size = fit(x, text, 900, 146, w - 44, false, 90);
      x.fillText(text, w / 2 + size * 0.05, h / 2 + size * 0.34);
    }
    function printSun(c, label, value) {
      const x = begin(c);
      const { w, h } = c;
      x.fillRect(0, 14, w, 2.5);
      x.fillRect(0, h - 33, w, 2.5);
      x.fillRect(0, h - 25, w, 6);
      stack(x, w, [[label, 500, 28, 24, 0], [value, 900, 56, 36, 20]], 16.5, h - 33, w - 36);
    }
    function printAir(c, aqi, uv) {
      // a flannel with two numbers knitted into it, one above the other
      const x = begin(c);
      const { w, h } = c;
      x.fillRect(0, 12, w, 6);
      x.fillRect(0, 22, w, 2);
      x.fillRect(0, h - 18, w, 6);
      x.fillRect(0, h - 24, w, 2);
      // two pairs, each a label over its number, with a row of stitches between them
      const ys = stack(x, w, [["Air quality", 500, 26, 24, 0], [aqi, 900, 52, 36, 18], ["UV index", 500, 26, 24, 44], [uv, 900, 52, 36, 18]], 24, h - 24, w - 30);
      const mid = (ys[2] + ys[3]) / 2;
      x.save();
      x.globalAlpha = 0.6;
      x.setLineDash([6, 5]);
      x.lineWidth = 1.6;
      x.beginPath();
      x.moveTo(26, mid);
      x.lineTo(w - 26, mid);
      x.stroke();
      x.restore();
    }
    function printMoon(c, name) {
      const x = begin(c);
      const { w, h } = c;
      x.fillRect(0, 14, w, 6);
      x.fillRect(0, 25, w, 2.5);
      x.fillRect(0, h - 20, w, 6);
      x.fillRect(0, h - 27.5, w, 2.5);
      const words = name.split(" ");
      const rowsOf = words.length > 1 ? [words.slice(0, -1).join(" "), words[words.length - 1]] : [name];
      let size = 44;
      for (const t of rowsOf) size = Math.min(size, fit(x, t, 900, 44, w - 36, false, 36));
      stack(x, w, [["Moon", 500, 28, 24, 0], ...rowsOf.map((t, k) => [t, 900, size, size, k ? 42 : 18])], 27.5, h - 27.5, w - 36);
    }
    function printFact(c, label, value) {
      const x = begin(c);
      const { w, h } = c;
      x.lineWidth = 4;
      x.strokeRect(16, 16, w - 32, h - 32);
      if (!value) {
        // nothing to say today: a plain striped tea towel
        for (let k = 0; k < 5; k++) x.fillRect(16, h / 2 - 34 + k * 16, w - 32, k === 2 ? 8 : 3);
        return;
      }
      let size = 40;
      let rowsOf;
      for (;;) {
        x.font = font(600, size);
        rowsOf = wrapText(x, value, w - 110);
        if (rowsOf.length <= 2 || size <= 36) break;
        size -= 2;
      }
      // the label, then the lines, spaced by their real ink: clear air between every line
      stack(x, w, [[label, 500, 27, 24, 0], ...rowsOf.map((t, k) => [t, 600, size, size, k ? 42 : 20])], 18, h - 18, w - 60);
    }

    function print(c) {
      switch (c.key) {
        case "h1": printSheet(c, disp.hh[0], ""); break;
        case "h2": printSheet(c, disp.hh[disp.hh.length - 1], tx.condition); break;
        case "ap": printPillow(c, disp.ampm); break;
        case "m1": printSheet(c, disp.mm[0], disp.weekday); break;
        case "m2": printSheet(c, disp.mm[1], disp.monthDay); break;
        case "temp": printTemp(c, tx.temp); break;
        case "sun": printSun(c, tx.sunLabel, tx.sunValue); break;
        case "air": printAir(c, tx.aqi, tx.uv); break;
        case "fact": printFact(c, tx.factLabel, tx.factValue); break;
        default: printMoon(c, tx.moon);
      }
    }
    function signature(c) {
      switch (c.key) {
        case "h1": return disp.hh.length > 1 ? disp.hh[0] : "";
        case "h2": return `${disp.hh}|${tx.condition}`;
        case "ap": return disp.ampm;
        case "m1": return `${disp.mm[0]}|${disp.weekday}`;
        case "m2": return `${disp.mm[1]}|${disp.monthDay}`;
        case "temp": return tx.temp;
        case "sun": return `${tx.sunLabel}|${tx.sunValue}`;
        case "air": return `${tx.aqi}|${tx.uv}`;
        case "fact": return `${tx.factLabel}|${tx.factValue}`;
        default: return tx.moon;
      }
    }
    let fontEpoch = 0;
    let fontsAsked = "";
    function refreshPrints(force) {
      for (const c of cloths) {
        const sig = signature(c);
        if (!force && sig === c.sig) continue;
        c.sig = sig;
        if (c.key === "h1") c.visible = sig !== "";
        if (c.key === "fact") {
          // no fact today: the tea towel is not hung out at all
          const show = tx.factValue !== "";
          if (show && !c.visible) hangFlat(c);
          c.visible = show;
        }
        if (c.visible || c.key !== "h1") {
          print(c);
          c.dirty = true;
        }
      }
      // A fact may use letters outside the subset already loaded: ask for them, and print again when they arrive.
      if (tx.factValue && tx.factValue !== fontsAsked && document.fonts?.load) {
        fontsAsked = tx.factValue;
        const epoch = ++fontEpoch;
        document.fonts.load(font(600, 36), tx.factValue).then(() => {
          if (epoch === fontEpoch) byKey.fact.sig = null;
        }, () => {});
      }
    }
    function layoutHours() {
      // two digits fill the line; one digit and the pillowcase hang as a centred pair
      const two = disp.hh.length > 1;
      shiftCloth(byKey.h2, two ? 386 : 235);
      shiftCloth(byKey.ap, two ? 846 : 695);
    }
    layoutHours();
    byKey.h1.visible = disp.hh.length > 1;
    for (const c of cloths) hangFlat(c);

    // ------------------------------------------------------------------
    // Textures drawn once: noise, bricks, rooftops, pegs and ironmongery
    // ------------------------------------------------------------------
    function noiseCanvas() {
      const S = 64;
      const cv = document.createElement("canvas");
      cv.width = cv.height = S;
      const cx = cv.getContext("2d", { willReadFrequently: true });
      const img = cx.createImageData(S, S);
      const rr = rng(seed + 11);
      const sm = (t) => t * t * (3 - 2 * t);
      const layer = (periods) => {
        const out = new Float32Array(S * S);
        let amp = 1;
        let total = 0;
        for (const p of periods) {
          const g = new Float32Array(p * p);
          for (let i = 0; i < g.length; i++) g[i] = rr();
          const cell = S / p;
          for (let y = 0; y < S; y++) {
            const gy = y / cell;
            const y0 = Math.floor(gy);
            const fy = sm(gy - y0);
            const ya = (y0 % p) * p;
            const yb = ((y0 + 1) % p) * p;
            for (let x = 0; x < S; x++) {
              const gx = x / cell;
              const x0 = Math.floor(gx);
              const fx = sm(gx - x0);
              const xa = x0 % p;
              const xb = (x0 + 1) % p;
              out[y * S + x] += amp * lerp(lerp(g[ya + xa], g[ya + xb], fx), lerp(g[yb + xa], g[yb + xb], fx), fy);
            }
          }
          total += amp;
          amp *= 0.5;
        }
        for (let i = 0; i < out.length; i++) out[i] /= total;
        return out;
      };
      const a = layer([4, 8, 16]);
      const b = layer([4, 8, 16]);
      const d = layer([8, 16, 32]);
      // The canvas is uploaded as RGBA with alpha kept straight, so alpha can carry a fourth field (white noise).
      for (let i = 0; i < S * S; i++) {
        img.data[i * 4] = clamp((a[i] - 0.5) * 1.9 + 0.5) * 255;
        img.data[i * 4 + 1] = clamp((b[i] - 0.5) * 1.9 + 0.5) * 255;
        img.data[i * 4 + 2] = clamp((d[i] - 0.5) * 1.9 + 0.5) * 255;
        img.data[i * 4 + 3] = 255;
      }
      cx.putImageData(img, 0, 0);
      return cv;
    }
    function brickCanvas() {
      const cv = document.createElement("canvas");
      cv.width = 128;
      cv.height = 512;
      const x = cv.getContext("2d", { willReadFrequently: true });
      x.scale(2, 2); // 64 x 256 stage units
      x.fillStyle = "#b3a290";
      x.fillRect(0, 0, 64, 256);
      const rr = rng(seed + 5);
      const tones = ["#8f4a37", "#9b5540", "#834231", "#a45d45", "#8a4634", "#94503b", "#6a3a2c", "#9f5a48"];
      for (let row = 0; row < 16; row++) {
        const y = row * 16;
        const shift = row % 2 ? -23 : 0;
        for (let bx = shift - 46; bx < 64; bx += 46) {
          x.fillStyle = rr.pick(tones);
          x.fillRect(bx + 1, y + 1, 44, 14);
          x.fillStyle = "rgba(255,235,210,0.07)";
          x.fillRect(bx + 1, y + 1, 44, 2);
          x.fillStyle = "rgba(30,10,5,0.16)";
          x.fillRect(bx + 1, y + 12.5, 44, 2.5);
          if (rr.chance(0.3)) {
            x.fillStyle = `rgba(20,10,8,${rr.range(0.05, 0.16)})`;
            x.fillRect(bx + rr.range(2, 30), y + rr.range(2, 8), rr.range(5, 14), rr.range(2, 5));
          }
        }
      }
      // shading across the sliver: the corner that turns into the courtyard catches the light
      const g = x.createLinearGradient(0, 0, 50, 0);
      g.addColorStop(0, "rgba(10,8,14,0.34)");
      g.addColorStop(0.75, "rgba(10,8,14,0.05)");
      g.addColorStop(0.93, "rgba(255,240,225,0.08)");
      g.addColorStop(1, "rgba(10,8,14,0.5)");
      x.fillStyle = g;
      x.fillRect(0, 0, 50, 256);
      x.fillStyle = "#17110f";
      x.fillRect(50, 0, 14, 256);
      return cv;
    }
    function skylineCanvas() {
      const cv = document.createElement("canvas");
      cv.width = 1024;
      cv.height = 128;
      const x = cv.getContext("2d", { willReadFrequently: true });
      x.fillStyle = "#000";
      x.fillRect(0, 0, 1024, 128);
      x.scale(1024 / 1080, 128 / 150);
      x.globalCompositeOperation = "lighter";
      const rr = rng(seed + 23);
      x.fillStyle = "#ff0000";
      const windows = [];
      let bx = -20;
      while (bx < 1100) {
        const bw = rr.range(70, 190);
        const bh = rr.range(26, 74);
        x.fillRect(bx, 150 - bh, bw, bh);
        if (rr.chance(0.5)) x.fillRect(bx + rr.range(8, bw - 30), 150 - bh - rr.range(8, 16), rr.range(14, 30), 20); // stair bulkhead
        if (rr.chance(0.45)) x.fillRect(bx + rr.range(6, bw - 14), 150 - bh - rr.range(12, 26), 7, 30); // chimney
        if (rr.chance(0.3)) x.fillRect(bx + rr.range(10, bw - 10), 150 - bh - rr.range(24, 44), 1.6, 46); // aerial
        if (bh > 34) for (let k = 0; k < 2; k++) if (rr.chance(0.5)) windows.push([bx + rr.range(10, bw - 16), 150 - bh + rr.range(10, bh - 22)]);
        bx += bw + rr.range(0, 10);
      }
      // a water tower, where the gap under the last towel leaves room to see it
      const tx0 = rr.range(790, 930);
      x.fillRect(tx0 - 15, 66, 30, 34);
      x.beginPath();
      x.moveTo(tx0 - 18, 67);
      x.lineTo(tx0, 52);
      x.lineTo(tx0 + 18, 67);
      x.fill();
      x.fillRect(tx0 - 13, 100, 2.4, 50);
      x.fillRect(tx0 + 10.6, 100, 2.4, 50);
      x.fillRect(tx0 - 1.2, 100, 2.4, 50);
      x.fillStyle = "#00ff00";
      for (const [wx, wy] of windows.slice(0, 5)) x.fillRect(wx, wy, 5, 7);
      return cv;
    }
    function atlasCanvas() {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 256;
      const x = cv.getContext("2d", { willReadFrequently: true });
      // a wooden peg: 11 x 30 stage units at 4x, in (2,2)-(46,122)
      x.save();
      x.translate(2, 2);
      const wood = x.createLinearGradient(0, 0, 44, 0);
      wood.addColorStop(0, "#b98b54");
      wood.addColorStop(0.35, "#e0bc85");
      wood.addColorStop(1, "#c89b62");
      x.fillStyle = wood;
      x.beginPath();
      x.moveTo(8, 4); x.quadraticCurveTo(22, -2, 36, 4); x.lineTo(42, 112); x.quadraticCurveTo(34, 120, 26, 116);
      x.lineTo(22, 60); x.lineTo(18, 116); x.quadraticCurveTo(10, 120, 2, 112);
      x.closePath();
      x.fill();
      x.strokeStyle = "rgba(60,35,10,0.55)";
      x.lineWidth = 2.5;
      x.stroke();
      x.strokeStyle = "#5a5d63";
      x.lineWidth = 5;
      x.beginPath(); x.moveTo(5, 44); x.lineTo(39, 44); x.stroke();
      x.strokeStyle = "#9da2a8";
      x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(5, 42.5); x.lineTo(39, 42.5); x.stroke();
      x.restore();
      // a pulley wheel: 26 x 26 at 4x, in (64,2)-(168,106)
      x.save();
      x.translate(116, 54);
      x.fillStyle = "#2b2d33";
      x.beginPath(); x.arc(0, 0, 50, 0, TAU); x.fill();
      x.fillStyle = "#55585f";
      x.beginPath(); x.arc(0, 0, 40, 0, TAU); x.fill();
      x.fillStyle = "#2b2d33";
      for (let k = 0; k < 3; k++) {
        x.rotate(TAU / 3);
        x.beginPath(); x.arc(0, -23, 10, 0, TAU); x.fill();
      }
      x.beginPath(); x.arc(0, 0, 9, 0, TAU); x.fill();
      x.fillStyle = "#8a8e96";
      x.beginPath(); x.arc(0, 0, 4, 0, TAU); x.fill();
      x.restore();
      // a bulkhead lamp, body in (2,128)-(98,248) and its glass alone in (130,128)-(226,248)
      for (const [ox, glass] of [[2, false], [130, true]]) {
        x.save();
        x.translate(ox, 128);
        if (!glass) {
          x.fillStyle = "#24262b";
          x.fillRect(0, 44, 60, 30);
          x.beginPath(); x.moveTo(36, 8); x.quadraticCurveTo(96, 6, 96, 50); x.lineTo(96, 96); x.quadraticCurveTo(96, 116, 76, 116); x.lineTo(56, 116); x.quadraticCurveTo(36, 116, 36, 96); x.closePath(); x.fill();
        }
        x.fillStyle = glass ? "#ffffff" : "#3b3d42";
        x.beginPath(); x.moveTo(44, 34); x.quadraticCurveTo(66, 16, 88, 34); x.lineTo(88, 96); x.quadraticCurveTo(66, 110, 44, 96); x.closePath(); x.fill();
        if (!glass) {
          x.strokeStyle = "#24262b";
          x.lineWidth = 4;
          for (const yy of [50, 68, 86]) { x.beginPath(); x.moveTo(42, yy); x.lineTo(90, yy); x.stroke(); }
        }
        x.restore();
      }
      return cv;
    }

    // ------------------------------------------------------------------
    // WebGL
    // ------------------------------------------------------------------
    let gl = null;
    let glOK = false;
    let glRatio = 1;
    const res = {};
    const staticTex = { noise: noiseCanvas(), brick: brickCanvas(), skyline: skylineCanvas(), atlas: atlasCanvas() };
    const lineBuf = new Float32Array(9000);
    const spriteBuf = new Float32Array(3000);
    const wallBuf = new Float32Array(60);

    function sizeGL() {
      const quality = over.ratio / Math.min(1, ss0);
      // 1.5 px per stage unit at most: crisp enough for the prints on a 4K panel at about half the fill of 2
      const ratio = clamp(Math.min(1.5, ss0) * quality, 0.2, 1.5);
      const w = Math.round(W * ratio);
      const h = Math.round(H * ratio);
      if (glCanvas.width !== w || glCanvas.height !== h) {
        glCanvas.width = w;
        glCanvas.height = h;
      }
      glRatio = w / W;
    }
    // Shaders are compiled and linked in mount() but only checked on the first frame, so a driver that
    // compiles in parallel does not hold mount() up.
    function program(vs, fs, attribs) {
      const shader = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        return sh;
      };
      const p = gl.createProgram();
      const v = shader(gl.VERTEX_SHADER, vs);
      const f = shader(gl.FRAGMENT_SHADER, fs);
      gl.attachShader(p, v);
      gl.attachShader(p, f);
      attribs.forEach((name, i) => gl.bindAttribLocation(p, i, name));
      gl.linkProgram(p);
      return { p, v, f, u: null };
    }
    function finishProgram(pr) {
      const p = pr.p;
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error(gl.getShaderInfoLog(pr.v) || gl.getShaderInfoLog(pr.f) || gl.getProgramInfoLog(p) || "shader failed to link");
      }
      const u = {};
      const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(p, i);
        u[info.name] = gl.getUniformLocation(p, info.name);
      }
      pr.u = u;
    }
    // Cloth prints are uploaded at their exact size, without mipmaps (they are seen at about 1:1, and a
    // re-print on the minute must be cheap); the small tiling textures are powers of two and mipmapped.
    function texture(source, { repeat = false, premultiply = false, rgb = false, mips = true } = {}) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
      gl.texImage2D(gl.TEXTURE_2D, 0, rgb ? gl.RGB : gl.RGBA, rgb ? gl.RGB : gl.RGBA, gl.UNSIGNED_BYTE, source);
      if (mips) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      if (res.aniso) gl.texParameterf(gl.TEXTURE_2D, res.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
      return t;
    }
    function startGL() {
      gl.getExtension("KHR_parallel_shader_compile");
      res.sky = program(VS_SKY, FS_SKY, ["a_p"]);
      res.cloth = program(VS_CLOTH, FS_CLOTH, ["a_pos", "a_nrm", "a_uv"]);
      res.line = program(VS_LINE, FS_LINE, ["a_p"]);
      res.sprite = program(VS_SPRITE, FS_SPRITE, ["a_p", "a_uv", "a_e"]);
    }
    function finishGL() {
      res.aniso = gl.getExtension("EXT_texture_filter_anisotropic");
      for (const pr of [res.sky, res.cloth, res.line, res.sprite]) finishProgram(pr);
      const buffer = (target, data, usage) => {
        const b = gl.createBuffer();
        gl.bindBuffer(target, b);
        gl.bufferData(target, data, usage);
        return b;
      };
      res.tri = buffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      res.vb = buffer(gl.ARRAY_BUFFER, vbuf, gl.DYNAMIC_DRAW);
      res.uv = buffer(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
      res.ib = buffer(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      res.lb = buffer(gl.ARRAY_BUFFER, lineBuf, gl.DYNAMIC_DRAW);
      res.sb = buffer(gl.ARRAY_BUFFER, spriteBuf, gl.DYNAMIC_DRAW);
      // the two walls: u runs from the frame edge (0) to the corner that faces the courtyard
      const uw = WALL / 64;
      const vw = H / 256;
      let o = 0;
      const wq = (x0, x1, u0, u1) => {
        const v = [x0, 0, u0, 0, x1, 0, u1, 0, x0, H, u0, vw, x1, 0, u1, 0, x1, H, u1, vw, x0, H, u0, vw];
        for (let k = 0; k < 6; k++) {
          wallBuf[o++] = v[k * 4]; wallBuf[o++] = v[k * 4 + 1]; wallBuf[o++] = v[k * 4 + 2]; wallBuf[o++] = v[k * 4 + 3] + (x0 > 500 ? 0.37 : 0); wallBuf[o++] = 0;
        }
      };
      wq(0, WALL, 0, uw);
      wq(W - WALL, W, uw, 0);
      res.wb = buffer(gl.ARRAY_BUFFER, wallBuf, gl.STATIC_DRAW);
      res.noise = texture(staticTex.noise, { repeat: true });
      res.brick = texture(staticTex.brick, { repeat: true, rgb: true });
      res.skyline = texture(staticTex.skyline, { rgb: true });
      res.atlas = texture(staticTex.atlas, { premultiply: true });
      for (const c of cloths) {
        c.tex = texture(c.canvas, { rgb: true, mips: false });
        c.dirty = false;
      }
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      glOK = true;
    }
    function attribs(n) {
      for (let i = 0; i < 3; i++) {
        if (i < n) gl.enableVertexAttribArray(i);
        else gl.disableVertexAttribArray(i);
      }
    }

    refreshPrints(true);
    let glPending = false;
    try {
      const opts = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power", preserveDrawingBuffer: false };
      gl = glCanvas.getContext("webgl", opts) || glCanvas.getContext("experimental-webgl", opts);
      if (gl) {
        sizeGL();
        startGL();
        glPending = true;
        glCanvas.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          glOK = false;
        });
        glCanvas.addEventListener("webglcontextrestored", () => {
          try {
            startGL();
            finishGL();
          } catch {}
        });
      }
    } catch (err) {
      glPending = false;
      console.error(`[wash-day] ${err.message || err}`);
    }
    // Without WebGL: the same wash, hanging flat, drawn once per change on a 2D canvas.
    let flat = null;
    function useFlat() {
      glCanvas.remove();
      flat = canvas2d(wrap, { maxScale: 2 });
      flat.canvas.style.zIndex = "0";
      over.canvas.style.zIndex = "1";
      direct = { cloth: "#f4f0e6", ink: "#1b48cc", key: "" };
    }
    if (!glPending) useFlat();

    // ------------------------------------------------------------------
    // The weather as the wash feels it
    // ------------------------------------------------------------------
    const env = {
      haze: 0, glow: 0, wind: 0, gust: 0, dirX: 0, dirZ: 1, dirRad: 0, frz: 0, frost: 0, wet: 0, damp: 0, rain: 0, snow: 0, snowCap: 0, fog: 0, storm: 0, flash: 0,
      cover: 0, sunVis: 0, level: 1, front: 0, night: 0, lampOn: 0, simT: r.range(0, 500), lastH: 1 / 30, warm: true,
    };
    function readWeather(s, dt, snap) {
      const wx = s.weather;
      env.wind = wx.wind;
      env.gust = Math.max(wx.gust, wx.wind);
      env.dirRad = (wx.windDir * Math.PI) / 180;
      env.dirX = -Math.sin(env.dirRad);
      env.dirZ = Math.cos(env.dirRad);
      env.cover = clamp(wx.cloud / 100);
      const f = wx.falling;
      const raining = f === "rain" || f === "drizzle" || f === "storm" || f === "freezing";
      const hl = snap ? 1e-6 : 4;
      env.rain = approach(env.rain, raining ? wx.intensity : 0, dt, hl);
      env.snow = approach(env.snow, f === "snow" ? wx.intensity : 0, dt, hl);
      env.storm = approach(env.storm, wx.kind === "storm" ? 1 : 0, dt, hl);
      env.fog = approach(env.fog, Math.max(wx.fog ? 1 : 0, smoothstep(3, 0.2, wx.visibility) * (f === "snow" ? 0.75 : 0.6)), dt, hl);
      env.frz = smoothstep(26.5, 23.5, wx.temp);
      env.frost = smoothstep(33, 24, wx.temp) * (1 - env.rain);
      env.snowCap = approach(env.snowCap, f === "snow" ? clamp(0.45 + wx.intensity * 0.8) : 0, dt, snap ? 1e-6 : 20);
      // rain soaks down from the top hem; how far depends on how hard it is coming down
      const target = raining ? 0.34 + 0.95 * wx.intensity : 0;
      env.wet = approach(env.wet, target, dt, snap ? 1e-6 : target > env.wet ? 25 : 70);
      // after rain the hems stay damp for a while: longer in humid air
      let since = 99;
      for (let k = s.pastHours.length - 1; k >= 0 && since === 99; k--) if (s.pastHours[k].precip > 0.01) since = s.pastHours.length - k - 0.5;
      const dryHours = 1 + 4.5 * clamp(wx.humidity / 100) ** 2;
      env.damp = raining || wx.temp < 30 ? 0 : clamp(1 - since / dryHours) * 0.7;
    }

    // ------------------------------------------------------------------
    // The cloth
    // ------------------------------------------------------------------
    function link(a, b, rest, k) {
      const a3 = a * 3;
      const b3 = b * 3;
      const dx = P[b3] - P[a3];
      const dy = P[b3 + 1] - P[a3 + 1];
      const dz = P[b3 + 2] - P[a3 + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      const wa = IM[a];
      const wb = IM[b];
      const ws = wa + wb;
      if (ws === 0 || d2 < 1e-9) return;
      const d = Math.sqrt(d2);
      const f = (k * (d - rest)) / (d * ws);
      P[a3] += dx * f * wa; P[a3 + 1] += dy * f * wa; P[a3 + 2] += dz * f * wa;
      P[b3] -= dx * f * wb; P[b3 + 1] -= dy * f * wb; P[b3 + 2] -= dz * f * wb;
    }
    function feelWind(c, dt) {
      // a slow gust pulse that travels with the wind, a wobble in its bearing, and a finer ripple field
      const t = env.simT;
      const cx = c.x + c.w / 2;
      const cy = lines[c.line].y + c.h / 2;
      const g = noise.n3(cx * 0.0012 - t * 0.13 * env.dirX, cy * 0.001, t * 0.17 + 3.1);
      // while the wash settles in mount() it feels a steady wind, so a freeze catches it in a clean, legible pose
      const pulse = env.warm ? 0.35 : smoothstep(-0.2, 0.7, g);
      const spd = Math.max(env.wind + (env.gust - env.wind) * pulse, 1 + 0.8 * pulse);
      const wob = env.warm ? 0 : noise.n2(t * 0.06 + c.i * 1.9, 7.7) * (0.3 + 0.5 / (1 + spd * 0.3));
      const dir = env.dirRad + wob;
      const A = GRAV * 0.72 * Math.tanh(spd / 22) * (1 - 0.45 * c.wetAmt * (1 - 0.7 * env.storm)) * (c.tether ? 1.2 : 1);
      c.ax = -Math.sin(dir) * A;
      // the gusts make the wash breathe in and out, whatever the bearing
      c.az = Math.cos(dir) * A + A * 0.55 * (pulse - 0.45) * (c.tether ? 1 : 0.6);
      c.rip = A * (1 + 0.6 * clamp((env.gust - env.wind) / 14)) + GRAV * 0.035;
      c.damp = 1.5 + 2.2 * c.wetAmt * (1 - 0.6 * env.storm);
      // the cords at a sheet's bottom corners give in a wind, so it can belly like a sail; in a calm it hangs plumb
      c.slack = approach(c.slack, 0.09 * smoothstep(3, 30, spd) * (1 - 0.7 * env.frz) * (1 - 0.3 * c.wetAmt), dt, 1.5);
      c.mass = 1 + 0.35 * c.wetAmt;
      const adv = t * (0.25 + spd * 0.035);
      const ox = -env.dirX * adv;
      const sd = c.seed + t * 0.55;
      if (env.warm) RIP.fill(0, c.off, c.off + c.n);
      else for (let k = c.off, e = c.off + c.n; k < e; k++) RIP[k] = noise.n3(P[k * 3] * 0.0065 + ox, P[k * 3 + 1] * 0.0065 + t * 0.12, sd);
      // frozen boards only rock: a stiff pendulum about the line, and a little on their pegs
      const hold = c.tether ? 0.12 : 1;
      const w0 = 2.1;
      c.th1v += (-w0 * w0 * (c.th1 - (c.az / GRAV) * 0.22 * hold) - 0.55 * c.th1v) * dt;
      c.th1 += c.th1v * dt;
      c.ph1v += (-w0 * w0 * (c.ph1 - (c.ax / GRAV) * 0.1 * hold) - 0.55 * c.ph1v) * dt;
      c.ph1 += c.ph1v * dt;
      // cloud shadows crossing the yard
      c.cs = 1 - 0.8 * Math.sin(Math.PI * env.cover) * smoothstep(-0.1, 0.5, noise.n3(cx * 0.0007 - t * 0.02 * env.dirX, cy * 0.0006, t * 0.035 + 40));
    }
    function pinTop(c) {
      const L = lines[c.line];
      for (let i = 0; i < c.cols; i++) {
        const k3 = (c.off + i) * 3;
        const x = c.x + L.haul + i * c.dx;
        P[k3] = x;
        P[k3 + 1] = lineY(L, x) + c.scallop[i];
        P[k3 + 2] = 0;
      }
    }
    function stepCloth(c, h) {
      const { cols, rows, off } = c;
      const L = lines[c.line];
      if (env.frz >= 1 && c.frozenSet && !env.warm) {
        pinTop(c);
        poseFrozen(c, 1);
        return;
      }
      const hh = h * h;
      const vs = (h / env.lastH) * Math.exp(-c.damp * h);
      const ax = c.ax;
      const az = c.az;
      const drag = c.tether ? 0.16 : 0.3;
      const rip = c.rip;
      const gy = GRAV * c.mass;
      for (let j = 1; j < rows; j++) {
        const hem = j === rows - 1 ? 1.5 : 1;
        for (let i = 0; i < cols; i++) {
          const k = off + j * cols + i;
          const k3 = k * 3;
          const nx = NR[k3];
          const ny = NR[k3 + 1];
          const nz = NR[k3 + 2];
          const wn = ax * nx + az * nz + RIP[k] * rip;
          const x = P[k3];
          const y = P[k3 + 1];
          const z = P[k3 + 2];
          P[k3] = x + (x - Q[k3]) * vs + (ax * drag + wn * nx) * hh;
          P[k3 + 1] = y + (y - Q[k3 + 1]) * vs + (gy * hem + wn * ny) * hh;
          P[k3 + 2] = z + (z - Q[k3 + 2]) * vs + (az * drag * 0.6 + wn * nz) * hh;
          Q[k3] = x; Q[k3 + 1] = y; Q[k3 + 2] = z;
        }
      }
      pinTop(c);
      const dx = c.dx;
      const dy = c.dy;
      const dd = Math.hypot(dx, dy);
      const bend = 0.12 + 0.1 * (1 - c.wetAmt);
      const last = off + (rows - 1) * cols;
      for (let it = 0; it < 4; it++) {
        for (let j = 0; j < rows - 1; j++) for (let i = 0, k = off + j * cols; i < cols; i++, k++) link(k, k + cols, dy, 1);
        for (let j = 1; j < rows; j++) for (let i = 0, k = off + j * cols; i < cols - 1; i++, k++) link(k, k + 1, dx, 1);
        if (it & 1) {
          for (let j = 0; j < rows - 1; j++) {
            for (let i = 0, k = off + j * cols; i < cols - 1; i++, k++) {
              link(k, k + cols + 1, dd, 0.12);
              link(k + 1, k + cols, dd, 0.12);
            }
          }
        }
        if (it === 0) {
          for (let j = 1; j < rows; j++) for (let i = 0, k = off + j * cols; i < cols - 2; i++, k++) link(k, k + 2, dx * 2, bend);
          for (let j = 0; j < rows - 2; j++) for (let i = 0, k = off + j * cols; i < cols; i++, k++) link(k, k + cols * 2, dy * 2, bend);
        }
        if (c.tether) {
          // elastic cords from the bottom corners to the lower line
          for (let s = 0; s < 2; s++) {
            const k3 = (last + (s ? cols - 1 : 0)) * 3;
            const tx0 = c.x + L.haul + (s ? c.w : 0) + (c.ax / GRAV) * 26;
            const ty0 = lineY(L, tx0) + c.h * (0.972 - c.slack);
            P[k3] += (tx0 - P[k3]) * 0.16;
            P[k3 + 1] += (ty0 - P[k3 + 1]) * 0.16;
            P[k3 + 2] += -P[k3 + 2] * 0.16;
          }
          // the hem is stitched heavy: it may swing in and out but does not roll up sideways
          const off0 = c.x + L.haul + (c.ax / GRAV) * 26;
          for (let i = 1; i < cols - 1; i++) {
            const k3 = (last + i) * 3;
            P[k3] += (off0 + i * dx - P[k3]) * 0.05;
          }
        } else {
          // the small linen has weighted hems: it leans with the wind, only as far as the gap to its neighbours
          // and the walls allows, and keeps its face to the room
          const drop0 = c.h * 0.975;
          const lean = clamp(c.ax / GRAV, -0.6, 0.6) * Math.min(1, 26 / drop0 / 0.6);
          const drop = drop0 / Math.sqrt(1 + lean * lean);
          for (let s = 0; s < 2; s++) {
            const k3 = (last + (s ? cols - 1 : 0)) * 3;
            const px = c.x + L.haul + (s ? c.w : 0);
            const tx0 = px + lean * drop;
            const ty0 = lineY(L, px) + drop;
            P[k3] += (tx0 - P[k3]) * 0.06;
            P[k3 + 1] += (ty0 - P[k3 + 1]) * 0.06;
            P[k3 + 2] -= P[k3 + 2] * 0.1;
          }
        }
      }
      // nothing hangs further from its peg than the cloth is long
      for (let j = 1; j < rows; j++) {
        const max = j * dy * 1.02;
        for (let i = 0; i < cols; i++) {
          const k3 = (off + j * cols + i) * 3;
          const t3 = (off + i) * 3;
          const ex = P[k3] - P[t3];
          const ey = P[k3 + 1] - P[t3 + 1];
          const ez = P[k3 + 2] - P[t3 + 2];
          const d2 = ex * ex + ey * ey + ez * ez;
          if (d2 > max * max) {
            const f = max / Math.sqrt(d2);
            P[k3] = P[t3] + ex * f; P[k3 + 1] = P[t3 + 1] + ey * f; P[k3 + 2] = P[t3 + 2] + ez * f;
          }
        }
      }
      // the courtyard walls: cloth on the line never swings out of sight behind them
      if (L.haul === 0) {
        for (let k = off + cols, e = off + c.n; k < e; k++) {
          const k3 = k * 3;
          let z = P[k3 + 2];
          if (z > 150) z = P[k3 + 2] = 150;
          else if (z < -260) z = P[k3 + 2] = -260;
          const lim = 478 / (1 + z / PERSP);
          const x = P[k3] - 540;
          if (x > lim) P[k3] = 540 + lim;
          else if (x < -lim) P[k3] = 540 - lim;
        }
      }
      if (env.frz > 0 && c.frozenSet && !env.warm) poseFrozen(c, env.frz);
    }
    function captureFrozen(c) {
      for (let j = 0; j < c.rows; j++) {
        for (let i = 0; i < c.cols; i++) {
          const k3 = (c.off + j * c.cols + i) * 3;
          const t3 = (c.off + i) * 3;
          FRZ[k3] = P[k3] - P[t3];
          FRZ[k3 + 1] = P[k3 + 1] - P[t3 + 1];
          FRZ[k3 + 2] = P[k3 + 2] - P[t3 + 2];
        }
      }
      c.frozenSet = true;
      c.th1 = c.th1v = c.ph1 = c.ph1v = 0;
    }
    function poseFrozen(c, amount) {
      const ct = Math.cos(c.th1);
      const st = Math.sin(c.th1);
      const sp = Math.sin(c.ph1);
      for (let j = 1; j < c.rows; j++) {
        for (let i = 0; i < c.cols; i++) {
          const k3 = (c.off + j * c.cols + i) * 3;
          const t3 = (c.off + i) * 3;
          const fy = FRZ[k3 + 1];
          const fz = FRZ[k3 + 2];
          const x = P[t3] + FRZ[k3] + sp * fy;
          const y = P[t3 + 1] + fy * ct - fz * st;
          const z = fz * ct + fy * st;
          if (amount >= 1) {
            P[k3] = Q[k3] = x; P[k3 + 1] = Q[k3 + 1] = y; P[k3 + 2] = Q[k3 + 2] = z;
          } else {
            P[k3] += (x - P[k3]) * amount; P[k3 + 1] += (y - P[k3 + 1]) * amount; P[k3 + 2] += (z - P[k3 + 2]) * amount;
          }
        }
      }
    }
    function normals(c) {
      const { cols, rows, off } = c;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = off + j * cols + i;
          const l3 = (i > 0 ? k - 1 : k) * 3;
          const r3 = (i < cols - 1 ? k + 1 : k) * 3;
          const u3 = (j > 0 ? k - cols : k) * 3;
          const d3 = (j < rows - 1 ? k + cols : k) * 3;
          const ux = P[r3] - P[l3], uy = P[r3 + 1] - P[l3 + 1], uz = P[r3 + 2] - P[l3 + 2];
          const vx = P[d3] - P[u3], vy = P[d3 + 1] - P[u3 + 1], vz = P[d3 + 2] - P[u3 + 2];
          let nx = uy * vz - uz * vy;
          let ny = uz * vx - ux * vz;
          let nz = ux * vy - uy * vx;
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          nx /= len; ny /= len; nz /= len;
          NR[k * 3] = nx; NR[k * 3 + 1] = ny; NR[k * 3 + 2] = nz;
          const v6 = k * 6;
          vbuf[v6] = P[k * 3]; vbuf[v6 + 1] = P[k * 3 + 1]; vbuf[v6 + 2] = P[k * 3 + 2];
          vbuf[v6 + 3] = nx; vbuf[v6 + 4] = ny; vbuf[v6 + 5] = nz;
        }
      }
    }
    function simulate(dt) {
      env.simT += dt;
      const t = env.simT;
      const windN = Math.tanh(env.gust / 30);
      let load = 0;
      for (const c of cloths) load += c.wetAmt * c.w * c.h;
      load /= 1400000;
      for (let i = 0; i < lines.length; i++) {
        const L = lines[i];
        L.bob = (1 + 5 * windN) * noise.n2(t * 0.33, i * 7.3 + 2);
        L.sag = 9 + 16 * clamp(load) + 5 * env.snowCap + i * 0.8;
      }
      const sub = dt > 0.06 ? 2 : 1;
      const h = dt / sub;
      for (const c of cloths) {
        // each cloth soaks or dries toward the weather, a little out of step with its neighbours
        c.wetA = env.wet > 0.01 ? env.wet * (0.9 + 0.2 * hash(c.i, 5)) + 0.02 * Math.sin(t * 0.2 + c.i) : 0;
        c.wetB = env.damp * (0.6 + 0.4 * hash(c.i, 9));
        c.wetAmt = clamp(c.wetA + c.wetB * 0.5);
        if (c.visible) feelWind(c, dt);
      }
      for (let sIdx = 0; sIdx < sub; sIdx++) {
        for (const c of cloths) if (c.visible) stepCloth(c, h);
        env.lastH = h;
      }
      for (const c of cloths) if (c.visible) normals(c);
    }

    // ------------------------------------------------------------------
    // The pulley: hauling a line out to the right-hand window and back
    // ------------------------------------------------------------------
    function applyTime(lineIdx) {
      if (lineIdx === 0) {
        const was = disp.hh.length;
        disp.hh = tx.hh;
        disp.ampm = tx.ampm;
        if (disp.hh.length !== was) {
          layoutHours();
          if (disp.hh.length > 1) {
            byKey.h1.visible = true;
            hangFlat(byKey.h1);
          }
        }
      } else {
        disp.mm = tx.mm;
        disp.weekday = tx.weekday;
        disp.monthDay = tx.monthDay;
      }
      refreshPrints(false);
    }
    function shiftLine(i, d) {
      // the whole line moves at once (cloth, its velocity and all), so a sheet carried round is not torn
      for (const c of cloths) {
        if (c.line !== i) continue;
        for (let k = c.off; k < c.off + c.n; k++) {
          P[k * 3] += d;
          Q[k * 3] += d;
        }
      }
    }
    function runPulleys(s, jumped) {
      if (jumped) {
        for (let i = 0; i < lines.length; i++) {
          const L = lines[i];
          L.phase = 0;
          if (L.haul) {
            L.haul = 0;
            for (const c of cloths) if (c.line === i) hangFlat(c);
          }
        }
        applyTime(0);
        applyTime(1);
        return;
      }
      const hourChanged = tx.hh !== disp.hh || tx.ampm !== disp.ampm;
      const minChanged = tx.mm !== disp.mm || tx.weekday !== disp.weekday;
      for (let i = 0; i < 2; i++) {
        const L = lines[i];
        if (L.phase === 0 && (i === 0 ? hourChanged : minChanged)) {
          // When every sheet on the line changes, the pulley runs the line on round like a conveyor: the old
          // sheets go out behind the right-hand wall and the new ones come in from the left, in one smooth
          // run. When only the last minute digit changes, the line goes just far enough to take that sheet
          // behind the wall and comes back, so the tens stay in view.
          L.full = i === 0 || tx.mm[0] !== disp.mm[0] || tx.weekday !== disp.weekday;
          L.dist = L.full ? 966 : 500;
          L.dur = L.full ? 3.6 : 3;
          L.phase = 1;
          L.t0 = s.t;
          L.prog = 0;
        }
        if (L.phase) {
          const p = clamp((s.t - L.t0) / L.dur);
          let prog;
          if (L.full) {
            prog = 2 * L.dist * p * p * (3 - 2 * p);
            if (L.phase === 1 && prog >= L.dist) {
              shiftLine(i, -2 * L.dist);
              applyTime(i);
              L.phase = 2;
            }
            L.haul = L.phase === 2 ? prog - 2 * L.dist : prog;
          } else {
            L.haul = (L.dist * (1 - Math.cos(TAU * p))) / 2;
            prog = L.haul;
            if (L.phase === 1 && p >= 0.5) {
              applyTime(i);
              L.phase = 2;
            }
          }
          L.spin += prog - L.prog; // the pulley wheels turn with the rope
          L.prog = prog;
          if (p >= 1) {
            L.phase = 0;
            L.haul = 0;
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // Light and color
    // ------------------------------------------------------------------
    const col = {
      sky: [new Float32Array(3), new Float32Array(3), new Float32Array(3), new Float32Array(3)],
      skyRaw: [new Float32Array(3), new Float32Array(3), new Float32Array(3), new Float32Array(3)],
      mean: new Float32Array(3), amb: new Float32Array(3), sun: new Float32Array(3), L: new Float32Array(3), moonL: new Float32Array([0.42, -0.5, 0.76]),
      inkDay: new Float32Array(3), inkNight: new Float32Array(3), night: new Float32Array(3), wetTint: new Float32Array(3),
      fog: new Float32Array(3), sil: new Float32Array(3), cloud: new Float32Array(3), light: new Float32Array(3), lightN: new Float32Array(3),
      rope: new Float32Array(3), ropeN: new Float32Array(3), cord: new Float32Array(3), cordN: new Float32Array(3),
      sunC: new Float32Array(3), skyKey: "", inkKey: -999, lampStrength: 0, stars: 0, sunWarm: 0,
    };
    const LAMP = [WALL - 6, 1236, 150];
    function relight(s) {
      const d = s.daylight;
      const sk = s.sky;
      const key = sk.west + sk.northWest + sk.northEast + sk.east;
      if (key !== col.skyKey) {
        col.skyKey = key;
        [sk.west, sk.northWest, sk.northEast, sk.east].forEach((hex, i) => col.skyRaw[i].set(vec3(hex)));
      }
      const tempKey = Math.round(s.weather.temp * 4);
      if (tempKey !== col.inkKey) {
        col.inkKey = tempKey;
        const ink = INK_RAMP(clamp((s.weather.temp - 8) / 89));
        col.inkDay.set(vec3(ink));
        col.inkNight.set(vec3(oklch(0.72, 0.062, toOklch(ink).h)));
      }
      const dl = smoothstep(0.3, 0.9, d);
      const keep = 0.32 + 0.68 * d;
      // heat and bad air bleach the sky toward a warm haze; a low sun puts a warm glow low on its own side
      env.haze = clamp(smoothstep(86, 99, s.weather.temp) * 0.38 + smoothstep(90, 200, s.weather.aqi) * 0.3) * smoothstep(0.3, 0.8, d);
      env.glow = (1 - smoothstep(3, 24, s.sun.alt)) * smoothstep(-7, 0, s.sun.alt) * (1 - 0.7 * env.cover) * (1 - env.fog) * 0.75;
      col.mean.fill(0);
      for (let i = 0; i < 4; i++) {
        for (let k = 0; k < 3; k++) {
          const v = lerp(k === 2 ? 0.04 : k === 1 ? 0.018 : 0.012, col.skyRaw[i][k], keep);
          col.sky[i][k] = v;
          col.mean[k] += v * 0.25;
          col.sky[i][k] = lerp(v, HAZE[k] * keep, env.haze);
        }
      }
      const alt = s.sun.alt;
      env.sunVis = smoothstep(-1, 9, alt) * (1 - 0.9 * Math.pow(env.cover, 1.3)) * (1 - 0.8 * env.fog) * (1 - 0.6 * Math.max(env.rain, env.snow));
      const warm = 1 - smoothstep(3, 28, alt);
      col.sunWarm = warm;
      // we look north: the morning sun is to the right, the evening sun to the left
      const lx = 0.66 * Math.tanh((180 - s.sun.az) / 28);
      const ly = -(0.26 + 0.4 * clamp(alt / 60));
      const ln = Math.hypot(lx, ly, 0.62);
      col.L[0] = lx / ln; col.L[1] = ly / ln; col.L[2] = 0.62 / ln;
      env.level = (0.72 + 0.28 * dl) * (1 - 0.1 * env.rain - 0.1 * env.storm);
      const S = 0.62 * env.sunVis;
      const A = 0.93 - S * col.L[2];
      const mx = Math.max(col.mean[0], col.mean[1], col.mean[2], 0.02);
      const tintAmt = 0.16 + 0.06 * env.sunVis + 0.36 * (1 - dl);
      const sunC = col.sunC;
      sunC[0] = 1;
      sunC[1] = lerp(0.98, 0.76, warm);
      sunC[2] = lerp(0.94, 0.5, warm);
      for (let k = 0; k < 3; k++) {
        const tint = lerp(1, col.mean[k] / mx, tintAmt);
        col.amb[k] = tint * A * env.level;
        col.sun[k] = sunC[k] * S * env.level;
        col.wetTint[k] = lerp(0.8, (col.mean[k] / mx) * 0.86, 0.35);
        col.light[k] = tint * 0.9 * env.level + sunC[k] * 0.22 * env.sunVis;
      }
      // the night side
      const moon = s.moon.up ? s.moon.illumination * (1 - 0.8 * env.cover) * smoothstep(0, 12, s.moon.alt) : 0;
      const nb = [0.062, 0.076, 0.122];
      const nm = [0.03, 0.038, 0.052];
      for (let k = 0; k < 3; k++) {
        col.night[k] = (nb[k] + nm[k] * moon) * (1 - 0.12 * env.storm);
        col.lightN[k] = 0.07 + 0.018 * k + nm[k] * moon;
        col.fog[k] = lerp(col.mean[k], 1, 0.12 * d);
        col.sil[k] = lerp(col.sky[1][k] * 0.42, SIL_DAY[k], 0.3 * d);
        const lit = lerp(CLOUD_NIGHT[k], col.amb[k] + col.sun[k] * 0.6, smoothstep(0.05, 0.45, d));
        col.cloud[k] = lerp(col.mean[k], lit, 0.55);
        col.rope[k] = ROPE[k] * env.level;
        col.ropeN[k] = ROPE_N[k];
        col.cord[k] = CORD[k] * env.level;
        col.cordN[k] = CORD_N[k];
      }
      // a short passage: every part of the wash is either sunlit or lamp-lit, never mid-grey for long
      env.front = lerp(-0.13, 1.13, clamp((0.31 - d) / 0.07));
      env.night = clamp((0.31 - d) / 0.07);
      env.lampOn = 1 - smoothstep(0.24, 0.44, d);
      col.stars = (1 - smoothstep(0.02, 0.22, d)) * (1 - env.cover) ** 2 * (1 - env.fog);
      // lightning: a soft swell every half minute or so, never a flash
      let flash = 0;
      if (env.storm > 0.05) {
        const period = 23;
        const n = Math.floor(s.t / period);
        const at = (n + 0.2 + 0.6 * hash(n, seed)) * period;
        const u = s.t - at;
        if (u > 0) flash = Math.min(u / 0.35, 1) * Math.exp(-Math.max(0, u - 0.35) / 1.1) * (0.5 + 0.5 * hash(n, 3)) * env.storm;
      }
      env.flash = flash;
    }

    // ------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------
    let lineVerts = 0;
    let ropeVerts = 0;
    function strip(x0, y0, x1, y1, hw) {
      let dx = x1 - x0;
      let dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const g = hw + 1;
      const nx = (-dy / len) * g;
      const ny = (dx / len) * g;
      let o = lineVerts * 3;
      const b = lineBuf;
      b[o++] = x0 + nx; b[o++] = y0 + ny; b[o++] = 1;
      b[o++] = x0 - nx; b[o++] = y0 - ny; b[o++] = -1;
      b[o++] = x1 + nx; b[o++] = y1 + ny; b[o++] = 1;
      b[o++] = x1 + nx; b[o++] = y1 + ny; b[o++] = 1;
      b[o++] = x0 - nx; b[o++] = y0 - ny; b[o++] = -1;
      b[o++] = x1 - nx; b[o++] = y1 - ny; b[o++] = -1;
      lineVerts += 6;
    }
    const cordY = (L, x) => lineY(L, x) + SHEET_H + 20 + 3 * (1 - ((x - 540) / 496) ** 2);
    function buildLines() {
      lineVerts = 0;
      const SEG = 26;
      for (const L of lines) {
        let px = WALL - 8;
        let py = lineY(L, px);
        for (let k = 1; k <= SEG; k++) {
          const x = WALL - 8 + ((W - 2 * WALL + 16) * k) / SEG;
          const y = lineY(L, x);
          strip(px, py, x, y, 1.7);
          px = x;
          py = y;
        }
      }
      ropeVerts = lineVerts;
      for (let i = 0; i < 2; i++) {
        const L = lines[i];
        let px = WALL - 4;
        let py = cordY(L, px);
        for (let k = 1; k <= SEG; k++) {
          const x = WALL - 4 + ((W - 2 * WALL + 8) * k) / SEG;
          const y = cordY(L, x);
          strip(px, py, x, y, 0.9);
          px = x;
          py = y;
        }
      }
      for (const c of cloths) {
        if (!c.tether || !c.visible) continue;
        const L = lines[c.line];
        for (let s = 0; s < 2; s++) {
          const k3 = (c.off + (c.rows - 1) * c.cols + (s ? c.cols - 1 : 0)) * 3;
          const ax = c.x + L.haul + (s ? c.w - 3 : 3);
          strip(projX(P[k3], P[k3 + 2]), projY(P[k3 + 1], P[k3 + 2]), ax, cordY(L, ax), 0.9);
        }
      }
    }
    let spriteVerts = 0;
    function corner(o, x, y, u, v, e) {
      spriteBuf[o] = x; spriteBuf[o + 1] = y; spriteBuf[o + 2] = u; spriteBuf[o + 3] = v; spriteBuf[o + 4] = e;
    }
    function quad(cx, cy, hw, hh, ang, u0, v0, u1, v1, e) {
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const ax = ca * hw, ay = sa * hw, bx = -sa * hh, by = ca * hh;
      const o = spriteVerts * 5;
      spriteVerts += 6;
      corner(o, cx - ax - bx, cy - ay - by, u0, v0, e);
      corner(o + 5, cx + ax - bx, cy + ay - by, u1, v0, e);
      corner(o + 10, cx - ax + bx, cy - ay + by, u0, v1, e);
      corner(o + 15, cx + ax - bx, cy + ay - by, u1, v0, e);
      corner(o + 20, cx + ax + bx, cy + ay + by, u1, v1, e);
      corner(o + 25, cx - ax + bx, cy - ay + by, u0, v1, e);
    }
    const PEG = [2 / 256, 2 / 256, 46 / 256, 122 / 256];
    const WHEEL = [64 / 256, 2 / 256, 168 / 256, 106 / 256];
    function buildSprites() {
      spriteVerts = 0;
      for (const p of pegs) {
        if (!p.c.visible) continue;
        const k3 = p.node * 3;
        const x = projX(P[k3], P[k3 + 2]);
        const y = projY(P[k3 + 1], P[k3 + 2]);
        if (p.bottom) quad(x + (p.tilt > 0 ? 3 : -3), y + 5, 5.5, 15, Math.PI + p.tilt, PEG[0], PEG[1], PEG[2], PEG[3], 0);
        else quad(x, y + 3, 5.5, 15, p.tilt, PEG[0], PEG[1], PEG[2], PEG[3], 0);
      }
      if (disp.hh.length === 1) {
        const L = lines[0];
        for (const p of spare) quad(p.x + L.haul, lineY(L, p.x + L.haul) + 4, 5.5, 15, p.tilt, PEG[0], PEG[1], PEG[2], PEG[3], 0);
      }
      if (!byKey.fact.visible) {
        const L = lines[3];
        for (const p of spareFact) quad(p.x, lineY(L, p.x) + 4, 5.5, 15, p.tilt, PEG[0], PEG[1], PEG[2], PEG[3], 0);
      }
    }
    function buildFixtures() {
      // drawn over the walls: pulley wheels (they turn as the line is hauled) and the lamp
      const first = spriteVerts;
      for (const L of lines) {
        const a = L.spin / 13;
        quad(WALL - 8, lineY(L, WALL - 8) + 13, 13, 13, a, WHEEL[0], WHEEL[1], WHEEL[2], WHEEL[3], 0);
        quad(W - WALL + 8, lineY(L, W - WALL + 8) + 13, 13, 13, a, WHEEL[0], WHEEL[1], WHEEL[2], WHEEL[3], 0);
      }
      quad(WALL - 10, LAMP[1], 12, 15, 0, 2 / 256, 128 / 256, 98 / 256, 248 / 256, 0);
      quad(WALL - 10, LAMP[1], 12, 15, 0, 130 / 256, 128 / 256, 226 / 256, 248 / 256, 1);
      return first;
    }

    function spritePointers() {
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 8);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
    }
    function set3(loc, v) {
      gl.uniform3f(loc, v[0], v[1], v[2]);
    }
    function common(u, fogAmt) {
      gl.uniform1f(u.u_front, env.front);
      gl.uniform4f(u.u_fog, col.fog[0], col.fog[1], col.fog[2], fogAmt);
    }
    function draw(s) {
      sizeGL();
      gl.viewport(0, 0, glCanvas.width, glCanvas.height);
      for (const c of cloths) {
        if (c.dirty && c.tex) {
          gl.bindTexture(gl.TEXTURE_2D, c.tex);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, c.canvas);
          c.dirty = false;
        }
      }
      const lampW = env.lampOn;

      // sky
      let pr = res.sky;
      gl.useProgram(pr.p);
      attribs(1);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.tri);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, res.noise);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, res.skyline);
      let u = pr.u;
      gl.uniform1i(u.u_tex, 0);
      gl.uniform1i(u.u_noise, 1);
      set3(u.u_c0, col.sky[0]); set3(u.u_c1, col.sky[1]); set3(u.u_c2, col.sky[2]); set3(u.u_c3, col.sky[3]);
      set3(u.u_sil, col.sil);
      gl.uniform1f(u.u_silA, 1 - env.fog * 0.96);
      gl.uniform3f(u.u_win, 0.5 * lampW, 0.36 * lampW, 0.18 * lampW);
      set3(u.u_cloudCol, col.cloud);
      const lo = 0.8 - 0.58 * env.cover;
      gl.uniform3f(u.u_cloud, lo, lo + 0.24, (0.12 + 0.8 * Math.pow(1 - env.cover, 0.6)) * smoothstep(0.02, 0.2, env.cover) * (1 - env.fog));
      const drift = env.simT * (0.0016 + env.wind * 0.00035);
      gl.uniform2f(u.u_drift, -env.dirX * drift, 0.13 + env.dirZ * drift * 0.3);
      gl.uniform1f(u.u_stars, col.stars);
      gl.uniform1f(u.u_time, s.t);
      gl.uniform1f(u.u_flash, env.flash);
      gl.uniform4f(u.u_lamp, WALL + 2, LAMP[1], 0, lampW);
      gl.uniform3f(u.u_lampCol, LAMP_COL[0], LAMP_COL[1], LAMP_COL[2]);
      gl.uniform2f(u.u_vert, lerp(0.8, 0.86, s.daylight), lerp(1.16, 1.07, s.daylight));
      gl.uniform4f(u.u_glow, 540 + 640 * Math.tanh((180 - s.sun.az) / 28), 1760, 820, env.glow);
      gl.uniform3f(u.u_glowCol, 0.62, 0.3, 0.09);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // ropes and cords
      buildLines();
      pr = res.line;
      u = pr.u;
      gl.useProgram(pr.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.lb);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineBuf.subarray(0, lineVerts * 3));
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      common(u, env.fog * 0.35);
      set3(u.u_col, col.rope); set3(u.u_colN, col.ropeN);
      gl.uniform2f(u.u_hw, 1.7, glRatio);
      gl.drawArrays(gl.TRIANGLES, 0, ropeVerts);
      set3(u.u_col, col.cord); set3(u.u_colN, col.cordN);
      gl.uniform2f(u.u_hw, 0.9, glRatio);
      gl.drawArrays(gl.TRIANGLES, ropeVerts, lineVerts - ropeVerts);

      // the wash
      pr = res.cloth;
      u = pr.u;
      gl.useProgram(pr.p);
      attribs(3);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.vb);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vbuf);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.uv);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, res.ib);
      gl.uniform1i(u.u_tex, 0);
      gl.uniform1i(u.u_noise, 1);
      gl.uniform1f(u.u_ratio, glRatio);
      gl.uniform1f(u.u_front, env.front);
      set3(u.u_L, col.L); set3(u.u_amb, col.amb);
      gl.uniform3f(u.u_cloth, 0.985, 0.965, 0.93);
      set3(u.u_wetTint, col.wetTint);
      set3(u.u_inkDay, col.inkDay); set3(u.u_inkNight, col.inkNight); set3(u.u_night, col.night); set3(u.u_moonL, col.moonL);
      gl.uniform4f(u.u_lamp, LAMP[0], LAMP[1], LAMP[2], lampW);
      gl.uniform3f(u.u_lampCol, LAMP_COL[0], LAMP_COL[1], LAMP_COL[2]);
      gl.uniform1f(u.u_frost, env.frost);
      gl.uniform1f(u.u_flash, env.flash);
      for (const c of cloths) {
        if (!c.visible) continue;
        gl.bindTexture(gl.TEXTURE_2D, c.tex);
        gl.uniform2f(u.u_size, c.w, c.h);
        gl.uniform1f(u.u_seed, c.seed);
        gl.uniform1f(u.u_shade, c.tether ? 1 : 0.62);
        gl.uniform1f(u.u_crumple, 0.1 + 0.07 * c.wetAmt + 0.22 * env.frz);
        gl.uniform3f(u.u_sun, col.sun[0] * c.cs, col.sun[1] * c.cs, col.sun[2] * c.cs);
        gl.uniform2f(u.u_wet, c.wetA > 0.001 ? c.wetA : -1, c.wetB > 0.001 ? 1.03 - c.wetB : 2);
        // each cloth turns from sunlit to lamp-lit as a whole, so no line of type is ever split by the shadow
        const cy = 1 - (lines[c.line].y + c.h * 0.5) / H;
        gl.uniform1f(u.u_clothNight, smoothstep(-0.015, 0.015, env.front - cy - ((c.x + c.w * 0.5) / W - 0.5) * 0.14));
        gl.uniform4f(u.u_fog, col.fog[0], col.fog[1], col.fog[2], env.fog * (0.1 + 0.07 * (3 - c.line)));
        gl.drawElements(gl.TRIANGLES, c.idxN, gl.UNSIGNED_SHORT, c.idx0 * 2);
      }

      // pegs, then the walls over everything, then what is bolted to the walls
      buildSprites();
      const fixtures = buildFixtures();
      pr = res.sprite;
      u = pr.u;
      gl.useProgram(pr.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.sb);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, spriteBuf.subarray(0, spriteVerts * 5));
      spritePointers();
      gl.uniform1i(u.u_tex, 0);
      common(u, env.fog * 0.2);
      set3(u.u_light, col.light); set3(u.u_lightN, col.lightN);
      gl.uniform3f(u.u_emit, lerp(0.75, 1.0, lampW), lerp(0.76, 0.8, lampW), lerp(0.74, 0.52, lampW));
      gl.uniform4f(u.u_lamp, LAMP[0], LAMP[1], 0, lampW);
      gl.uniform3f(u.u_lampCol, LAMP_COL[0], LAMP_COL[1], LAMP_COL[2]);
      gl.uniform1f(u.u_flash, env.flash);
      gl.bindTexture(gl.TEXTURE_2D, res.atlas);
      gl.drawArrays(gl.TRIANGLES, 0, fixtures);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.wb);
      spritePointers();
      gl.bindTexture(gl.TEXTURE_2D, res.brick);
      gl.drawArrays(gl.TRIANGLES, 0, 12);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.sb);
      spritePointers();
      gl.bindTexture(gl.TEXTURE_2D, res.atlas);
      gl.drawArrays(gl.TRIANGLES, fixtures, spriteVerts - fixtures);
    }

    function drawFlat(s) {
      // the fallback picture, redrawn only when something changes
      const ink = INK_RAMP(clamp((s.weather.temp - 8) / 89));
      const night = s.daylight < 0.26;
      const key = `${ink}|${night}|${cloths.map((c) => c.sig).join("|")}|${s.sky.mean}`;
      if (key === direct.key) return;
      direct.key = key;
      direct.cloth = night ? "#141a2a" : "#f4f0e6";
      direct.ink = night ? oklch(0.72, 0.062, toOklch(ink).h) : ink;
      const { ctx } = flat;
      ctx.fillStyle = night ? "#06080f" : s.sky.mean;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = night ? "#2a2a30" : "#8a7a62";
      ctx.lineWidth = 3;
      for (const L of lines) {
        ctx.beginPath();
        ctx.moveTo(0, L.y);
        ctx.lineTo(W, L.y);
        ctx.stroke();
      }
      for (const c of cloths) {
        if (!c.visible) continue;
        print(c);
        ctx.drawImage(c.canvas, c.x, lines[c.line].y, c.w, c.h);
      }
      ctx.fillStyle = night ? "#120c0b" : "#8f4a37";
      ctx.fillRect(0, 0, WALL, H);
      ctx.fillRect(W - WALL, 0, WALL, H);
    }

    // ------------------------------------------------------------------
    // Rain, snow, drips, icicles: the 2D overlay
    // ------------------------------------------------------------------
    const RN = 900;
    const rain = new Float32Array(RN * 3);
    const snow = new Float32Array(RN * 4);
    for (let i = 0; i < RN; i++) {
      rain.set([r.range(0, W + 240), r.range(0, H + 160), r.range(0.75, 1.25)], i * 3);
      snow.set([r.range(0, W + 80), r.range(0, H + 40), ((i % 3) + r()) / 3, r.range(0, TAU)], i * 4);
    }
    let overUsed = false;
    function drawWeather(s) {
      const { ctx } = over;
      const active = env.rain > 0.01 || env.snow > 0.01 || env.snowCap > 0.02 || env.frost > 0.3 || env.wet > 0.2;
      if (!active && !overUsed) return;
      over.clear();
      overUsed = active;
      // a transparent full-screen layer still costs a blend every frame: take it out while it is empty
      over.canvas.style.display = active ? "" : "none";
      if (!active) return;
      const t = s.t;
      const nt = env.night;
      const windX = env.dirX * env.wind;

      if (env.snowCap > 0.02 && glOK) {
        // snow riding the lines and the top hems
        ctx.strokeStyle = nt > 0.5 ? "rgba(96,108,134,0.9)" : "rgba(250,252,255,0.95)";
        ctx.lineCap = "round";
        ctx.lineWidth = 2 + 6 * env.snowCap;
        ctx.beginPath();
        for (const L of lines) {
          for (let k = 0; k <= 12; k++) {
            const x = WALL + ((W - 2 * WALL) * k) / 12;
            const y = lineY(L, x) - 2.5 - 2.5 * env.snowCap;
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
      if (env.frost > 0.3 && glOK) {
        // icicles on the hems
        const grow = smoothstep(0.3, 1, env.frost);
        ctx.fillStyle = nt > 0.5 ? "rgba(120,140,175,0.8)" : "rgba(236,246,255,0.92)";
        ctx.beginPath();
        for (const c of cloths) {
          if (!c.visible) continue;
          const count = Math.floor(c.w / 42);
          const base = c.off + (c.rows - 1) * c.cols;
          for (let k = 0; k < count; k++) {
            const k3 = (base + Math.round(hash(c.i * 31 + k, 2) * (c.cols - 1))) * 3;
            const x = projX(P[k3], P[k3 + 2]) + (hash(k, c.i) - 0.5) * 16;
            const y = projY(P[k3 + 1], P[k3 + 2]) - 1;
            const len = (7 + 20 * hash(c.i * 17 + k, 4)) * grow;
            ctx.moveTo(x - 2.4, y);
            ctx.lineTo(x + 2.4, y);
            ctx.lineTo(x + 0.3, y + len);
          }
        }
        ctx.fill();
      }
      if (env.wet > 0.2 && glOK) {
        // drips letting go of the hems
        ctx.fillStyle = nt > 0.5 ? "rgba(170,190,225,0.55)" : "rgba(244,248,255,0.85)";
        ctx.beginPath();
        const drips = Math.floor(34 * clamp(env.wet));
        for (let k = 0; k < drips; k++) {
          const c = cloths[k % cloths.length];
          if (!c.visible) continue;
          const period = 1.7 + 2.6 * hash(k, 11);
          const u = (t / period + hash(k, 12)) % 1;
          const k3 = (c.off + (c.rows - 1) * c.cols + Math.round(hash(k, 13) * (c.cols - 1))) * 3;
          const x = projX(P[k3], P[k3 + 2]);
          const y0 = projY(P[k3 + 1], P[k3 + 2]);
          const fall = u * period;
          // it swells on the hem, then falls
          const y = fall < 0.5 ? y0 + 2 : y0 + 2 + 0.5 * 1500 * (fall - 0.5) ** 2;
          if (y > H) continue;
          const len = fall < 0.5 ? 3 + fall * 5 : 7 + (fall - 0.5) * 16;
          ctx.rect(x - 1.25, y, 2.5, len);
        }
        ctx.fill();
      }
      if (env.rain > 0.01) {
        const n = Math.min(RN, Math.floor(50 + 590 * env.rain));
        const slant = clamp(windX / 45, -0.55, 0.55);
        const speed = 640 + 520 * env.rain;
        const len = 20 + 44 * env.rain;
        ctx.strokeStyle = nt > 0.5 ? `rgba(160,180,215,${0.3 + 0.16 * env.rain})` : `rgba(238,244,253,${0.4 + 0.2 * env.rain})`;
        ctx.lineWidth = 2;
        ctx.lineCap = "butt";
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const j = i * 3;
          const k = rain[j + 2];
          const y = ((rain[j + 1] + t * speed * k) % (H + 160)) - 80;
          let x = rain[j] + slant * y;
          x = (((x % (W + 240)) + (W + 240)) % (W + 240)) - 120;
          ctx.moveTo(x, y);
          ctx.lineTo(x - slant * len * k, y - len * k);
        }
        ctx.stroke();
      }
      if (env.snow > 0.01) {
        const n = Math.min(RN, Math.floor(110 + 790 * env.snow));
        const drift = windX * 7;
        ctx.strokeStyle = nt > 0.5 ? "rgba(150,162,188,0.6)" : "rgba(255,255,255,0.93)";
        ctx.lineCap = "round";
        for (let band = 0; band < 3; band++) {
          // flakes are sorted into three sizes; each size is one stroke of zero-length round-capped dashes
          ctx.lineWidth = 3 + 2.6 * band;
          ctx.beginPath();
          for (let i = band; i < n; i += 3) {
            const j = i * 4;
            const k = snow[j + 2];
            const y = ((snow[j + 1] + t * (50 + 80 * k) * (1 + 0.5 * env.snow)) % (H + 40)) - 20;
            let x = snow[j] + t * drift * (0.6 + 0.4 * k) + Math.sin(t * 0.8 + snow[j + 3]) * 12;
            x = (((x % (W + 80)) + (W + 80)) % (W + 80)) - 40;
            ctx.moveTo(x, y);
            ctx.lineTo(x + 0.01, y);
          }
          ctx.stroke();
        }
      }
    }

    // ------------------------------------------------------------------
    // Finished from the first frame: let the wash find its shape before it is seen
    // ------------------------------------------------------------------
    readWeather(state, 0, true);
    for (let i = 0; i < 10; i++) simulate(1 / 30);
    for (const c of cloths) captureFrozen(c);
    env.warm = false;

    let lastMs = state.ms;
    let lastSecond = -1;
    let first = true;

    return {
      frame(s) {
        const jumped = first || Math.abs(s.ms - lastMs) > 3000;
        lastMs = s.ms;
        first = false;
        readWeather(s, s.dt, jumped);
        runPulleys(s, jumped);
        if (s.clock.s !== lastSecond || jumped) {
          lastSecond = s.clock.s;
          refreshPrints(false);
        }
        // a cloth that thaws and freezes again freezes in a new pose
        if (env.frz <= 0) for (const c of cloths) c.frozenSet = false;
        else for (const c of cloths) if (!c.frozenSet && c.visible) captureFrozen(c);
        if (s.dt > 1e-4) simulate(s.dt);
        relight(s);
        if (glPending) {
          glPending = false;
          try {
            finishGL();
          } catch (err) {
            glOK = false;
            console.error(`[wash-day] ${err.message || err}`);
            useFlat();
          }
        }
        if (glOK) draw(s);
        else if (flat) drawFlat(s);
        drawWeather(s);
      },
    };
  },
};

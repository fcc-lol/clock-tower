// The Deep End
//
// You are looking straight down into a tiled swimming pool. The time is laid
// in mosaic on the floor and wobbles under live water. By day the figures are
// cobalt tiles on an aqua field; after dark the field falls to navy and the
// figures turn out to be lit glass tiles, glowing up through black water and
// spilling a halo the waves throw about. The stone coping around the pool is
// above the water, so it is crisp: the other readouts are painted on it, the
// temperature set in depth-marker tiles and the day's fact on an enamel plaque.
//
// How the conditions drive it:
//   wind         size, speed and travel direction of the chop; gusts cross the
//                surface as ruffled cat's-paws. How far the floor may wobble is
//                capped, rougher with wind and rain, so the figures never smear
//   cloud, sun   the caustic light net is as strong as the sun is clear and
//                high; the coping's shadow falls away from the sun; under cloud
//                the net fades and the water takes the sky's colour; a low sun
//                that gets through turns the net amber and warms the stone
//   sky colours  the measured sky (west to east) is what the surface reflects
//   rain         drops falling away from you, ring ripples whose crests catch
//                the light, splashes on the stone: as many as it is raining
//   snow, cold   flakes fall (drawn out into streaks in a hard wind), land and
//                melt into slush rafts; below freezing a cracked ice sheet
//                creeps in from the edges and stills the water, and the wind
//                streams blown snow across it
//   fog          steam wisps drift over the surface
//   storm        slate water, heavy rings, a rare slow brightening
//   tide         the East River tide sets the depth: at high water the floor
//                sits a little further away and the walls show more rows
//   the hour     daylight sets the palette and switches the pool lights on;
//                when the floor gets dark the figure tiles turn from cobalt to
//                pale glaze, one by one in a diagonal sweep
//   the minute   the tiles of a changed figure flip over in a diagonal wave
// Now and then something floats by: a rubber duck, a leaf, a pool ring.
//
// Technique: one fragment shader draws the pool. The mosaic is a 45 x 55
// texture with one texel per tile, plus a blurred copy of the figures sampled
// with linear filtering for the night halo (the kit's shader() has no
// textures, so both are bound here on the kit surface's own GL context).
// Everything above the water (coping, lettering, rain, snow, the float) is DOM
// and a 2D canvas.

import { W, H, TAU, clamp, lerp, smoothstep, approach, rng, hash, el, svg, addStyle, canvas2d, shader, grain, fitText, vec3 } from "../lib/kit.js";

// The pool's opening in the coping, in stage units, and the mosaic grid.
const PX0 = 48, PY0 = 291, PX1 = 1032, PY1 = 1491;
const PCX = (PX0 + PX1) / 2, PCY = (PY0 + PY1) / 2, PHW = (PX1 - PX0) / 2, PHH = (PY1 - PY0) / 2;
const GW = 45, GH = 55;

// ---------------------------------------------------------------------------
// Tile numerals: block figures 13 tiles wide and 22 tall with 4-tile strokes,
// corners clipped the way mosaic setters clip them.
// ---------------------------------------------------------------------------

const DH = 22;
const SEG = { A: [0, 0, 13, 4], G: [0, 9, 13, 13], D: [0, 18, 13, 22], F: [0, 0, 4, 13], B: [9, 0, 13, 13], E: [0, 9, 4, 22], C: [9, 9, 13, 22] };
const DIGITS = ["ABCDEF", "", "ABGED", "ABGCD", "FGBC", "AFGCD", "AFGECD", "ABC", "ABCDEFG", "ABCDFG"];
// AM/PM: 8 x 10 tiles with 2-tile strokes, half the weight of the figures. Eight
// wide so the M's middle stroke is two tiles too and survives the water.
const LW = 8;
const LETTERS = {
  A: [".######.", "########", "##....##", "##....##", "##....##", "########", "########", "##....##", "##....##", "##....##"],
  P: ["#######.", "########", "##....##", "##....##", "########", "#######.", "##......", "##......", "##......", "##......"],
  M: ["##....##", "###..###", "########", "##.##.##", "##.##.##", "##....##", "##....##", "##....##", "##....##", "##....##"],
};

function buildDigit(ch) {
  const w = ch === "1" ? 6 : 13;
  const src = new Uint8Array(w * DH);
  const fill = (x0, y0, x1, y1) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) src[y * w + x] = 1;
  };
  if (ch === "1") {
    fill(2, 0, 6, DH);
    fill(0, 0, 2, 4);
  } else for (const k of DIGITS[+ch]) fill(...SEG[k]);
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < DH && src[y * w + x] === 1;
  const out = Uint8Array.from(src);
  for (let y = 0; y < DH; y++)
    for (let x = 0; x < w; x++)
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
          if (on(x, y)) {
            if (on(x + sx, y) || on(x, y + sy)) continue;
            out[y * w + x] = 0; // an outside corner: clip it
            let rx = 0, ry = 0;
            while (on(x - sx * rx, y)) rx++;
            while (on(x, y - sy * ry)) ry++;
            if (rx >= 5 && ry >= 5) {
              // where a bar turns into a stem, clip a little deeper
              out[y * w + x - sx] = 0;
              out[(y - sy) * w + x] = 0;
            }
          } else if (on(x + sx, y) && on(x, y + sy) && on(x + sx, y + sy)) out[y * w + x] = 1; // an inside corner: fill it
        }
  return { w, h: DH, data: out };
}
const GLYPH = {};
for (let i = 0; i < 10; i++) GLYPH[i] = buildDigit(String(i));
for (const [k, rows] of Object.entries(LETTERS)) {
  const w = rows[0].length;
  const data = new Uint8Array(w * rows.length);
  rows.forEach((row, y) => [...row].forEach((c, x) => (data[y * w + x] = c === "#" ? 1 : 0)));
  GLYPH[k] = { w, h: rows.length, data };
}

// Lays the time out on the floor grid: hours over minutes, AM/PM stacked at
// the right of the hours. `out` is GW x GH, 1 where a digit tile goes.
function layTime(out, hh, mm, ampm) {
  out.fill(0);
  const stamp = (g, x0, y0) => {
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const gx = x0 + x, gy = y0 + y;
        if (g.data[y * g.w + x] && gx >= 0 && gx < GW && gy >= 0 && gy < GH) out[gy * GW + gx] = 1;
      }
  };
  const width = (str) => {
    let w = 0;
    for (let i = 0; i < str.length; i++) {
      const g = GLYPH[str[i]];
      if (g) w += g.w + (i < str.length - 1 ? (str[i] === "1" ? 2 : 3) : 0);
    }
    return w;
  };
  const row = (str, x, y0) => {
    for (const ch of str) {
      const g = GLYPH[ch];
      if (!g) continue;
      stamp(g, x, y0);
      x += g.w + (ch === "1" ? 2 : 3);
    }
  };
  // hours and AM/PM as one unit, centred like the minutes below them
  const hx = 7 + Math.floor((31 - (width(hh) + 3 + LW)) / 2);
  const ax = hx + width(hh) + 3;
  row(hh, hx, 3);
  row(mm, 7 + Math.floor((31 - width(mm)) / 2), 29);
  stamp(GLYPH[ampm[0]] || GLYPH.A, ax, 3);
  stamp(GLYPH.M, ax, 15);
}

// ---------------------------------------------------------------------------
// Small colour maths on [r, g, b] arrays (0..1), allocation-free.
// ---------------------------------------------------------------------------

const set3 = (o, a) => ((o[0] = a[0]), (o[1] = a[1]), (o[2] = a[2]), o);
const mix3 = (o, a, b, t) => ((o[0] = a[0] + (b[0] - a[0]) * t), (o[1] = a[1] + (b[1] - a[1]) * t), (o[2] = a[2] + (b[2] - a[2]) * t), o);
const mul3 = (o, a, k) => ((o[0] = a[0] * k), (o[1] = a[1] * k), (o[2] = a[2] * k), o);
const lin = (v) => Math.pow(v < 0 ? 0 : v > 1 ? 1 : v, 2.2);
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const css = (c) => `rgb(${Math.round(clamp(c[0]) * 255)},${Math.round(clamp(c[1]) * 255)},${Math.round(clamp(c[2]) * 255)})`;

const COL = {
  fClear: [0.36, 0.82, 0.85],
  fHeat: [0.25, 0.86, 0.82],
  fOver: [0.5, 0.67, 0.7],
  fRain: [0.42, 0.55, 0.62],
  fStorm: [0.29, 0.38, 0.47],
  fFog: [0.66, 0.77, 0.76],
  fGold: [0.62, 0.78, 0.6],
  stoneGold: [0.98, 0.8, 0.6],
  fSnow: [0.6, 0.76, 0.8],
  fIce: [0.62, 0.82, 0.9],
  fNight: [0.022, 0.05, 0.1],
  cobalt: [0.07, 0.17, 0.6],
  glaze: [0.55, 0.62, 0.68],
  white: [0.97, 0.98, 0.98],
  black: [0.0, 0.0, 0.0],
  trimDay: [0.1, 0.24, 0.66],
  trimNight: [0.03, 0.05, 0.13],
  stoneClear: [0.89, 0.86, 0.79],
  stoneOver: [0.77, 0.77, 0.75],
  stoneNight: [0.048, 0.055, 0.075],
  paintDay: [0.06, 0.14, 0.47],
  paintNight: [0.66, 0.71, 0.76],
  tileDay: [0.09, 0.22, 0.67],
  tileNight: [0.03, 0.065, 0.2],
  glyphNight: [0.68, 0.73, 0.79],
  veilDay: [0.93, 0.96, 0.97],
  veilNight: [0.1, 0.13, 0.19],
  sunHigh: [1.0, 0.98, 0.9],
  sunLow: [1.0, 0.7, 0.4],
  lampCol: [0.75, 1.0, 0.95],
  glow: [0.64, 0.96, 1.0],
};

// ---------------------------------------------------------------------------
// The water.
// ---------------------------------------------------------------------------

const FRAG = `
uniform sampler2D u_tiles;   // one texel per floor tile: r ink, g and b variation, a flip squash
uniform vec4 u_pool;         // centre x, y and half size of the opening
uniform float u_kd;          // how much smaller the floor looks than the opening (depth)
uniform float u_rows;        // tile rows on the walls
uniform vec3 u_field;
uniform vec3 u_grout;
uniform vec3 u_inkA;         // dark digit tiles
uniform vec3 u_inkB;         // pale digit tiles
uniform vec3 u_trim;
uniform float u_flip;        // 0 all dark .. 1 all pale
uniform vec2 u_wind;         // unit vector the waves travel along
uniform vec4 u_wave;         // chop in px, ruffle 0..1, wave clock, cat's-paw travel in px
uniform vec4 u_light;        // caustics, glints, wall shadow, lamp
uniform vec3 u_sunCol;
uniform vec4 u_sun;          // xy: reach of the wall's shadow on the floor, zw: direction the light travels
uniform vec3 u_glint;        // xy: the slope that mirrors the sun, z: sharpness
uniform vec3 u_skyW;
uniform vec3 u_skyNW;
uniform vec3 u_skyNE;
uniform vec3 u_skyE;
uniform vec2 u_refl;         // flat reflectivity, extra on steep facets
uniform vec4 u_rain;         // heavy drop density, fine drop density, ring strength in px, clock
uniform vec4 u_r0; uniform vec4 u_r1; uniform vec4 u_r2; uniform vec4 u_r3;
uniform vec4 u_r4; uniform vec4 u_r5; uniform vec4 u_r6; uniform vec4 u_r7; // rings: x, y, age, strength
uniform vec4 u_cold;         // ice extent, slush, snow dust, fog
uniform vec3 u_veil;         // the colour of ice, slush and steam in this light
uniform vec4 u_float;        // shadow of whatever is floating: x, y, radius, strength
uniform float u_flash;
uniform sampler2D u_glow;    // the figures blurred (linear filtering): the halo of the lit tiles
uniform vec4 u_glowC;        // rgb: colour of the pool lights, a: how much they are on
uniform float u_cap;         // most the floor may be displaced, px: digits wobble but never smear
uniform vec4 u_hl;           // rgb: what the crest of a ring catches, a: how much

const vec2 GRID = vec2(${GW}.0, ${GH}.0);

float hash1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
vec3 hash3(vec2 p) { return fract(sin(vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9)))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash1(i), hash1(i + vec2(1.0, 0.0)), f.x), mix(hash1(i + vec2(0.0, 1.0)), hash1(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 7.1) + 0.2 * vnoise(p * 4.1 + 13.7); }

// One expanding ring: the slope it adds to the surface.
vec2 ring(vec2 p, vec4 r) {
  if (r.w <= 0.0) return vec2(0.0);
  vec2 dv = p - r.xy;
  float d = length(dv) + 0.001;
  float x = d - (12.0 + 92.0 * r.z);
  return (dv / d) * (sin(x * 0.36) * exp(-x * x / (110.0 + 150.0 * r.z)) * r.w);
}

// Many small rings: one drop at a time in every cell of a grid.
vec2 rainCells(vec2 p, float cell, float time, float dens, float salt) {
  vec2 g = p / cell;
  vec2 b = floor(g - 0.5);
  vec2 acc = vec2(0.0);
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    vec2 id = b + vec2(float(i), float(j));
    vec3 h = hash3(id + salt);
    float ph = time * (0.5 + 0.45 * h.x) + h.y * 9.0;
    float n = floor(ph);
    float u = ph - n;
    vec3 h2 = hash3(id * 1.37 + n * 0.713 + salt);
    if (h2.z > dens) continue;
    vec2 dv = p - (id + 0.25 + 0.5 * h2.xy) * cell;
    float d = length(dv) + 0.001;
    float x = d - u * cell * 0.5;
    acc += (dv / d) * (sin(x * 0.55) * exp(-x * x / (cell * 0.22 + 14.0)) * (1.0 - u) * (1.0 - u));
  }
  return acc;
}

// The light net on a pool floor (after Dave Hoskins' tileable caustic).
float caustic(vec2 uv, float t) {
  vec2 p = mod(uv * 6.2831853, 6.2831853) - 250.0;
  vec2 i = p;
  float c = 1.0;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) * 200.0), p.y / (cos(i.y + tt) * 200.0)));
  }
  c = 1.17 - pow(c / 4.0, 1.4);
  return pow(abs(c), 8.0);
}

void main() {
  vec2 p = v_pos;
  vec2 q = (p - u_pool.xy) / u_pool.zw;
  float m0 = max(abs(q.x), abs(q.y));
  if (m0 > 1.01) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; } // under the coping
  float t = u_wave.z;
  float dEdge = min(u_pool.z - abs(p.x - u_pool.x), u_pool.w - abs(p.y - u_pool.y));

  // Ice grows in from the edges and stills whatever it covers.
  float ice = 0.0;
  float nz = 0.5;
  if (u_cold.x > 0.002) {
    nz = fbm(p * 0.0052 + 11.0);
    float reach = u_cold.x * (u_pool.z + 150.0) + (nz - 0.5) * 300.0 * min(1.0, u_cold.x * 5.0);
    ice = smoothstep(-16.0, 16.0, reach - dEdge);
  }
  float open = 1.0 - ice;

  // The surface, as slopes: three swells fanned around the wind, a slow sway
  // that never stops, gust ruffles, and rings.
  vec2 d = u_wind;
  vec2 n = vec2(-d.y, d.x);
  vec2 d1 = normalize(d + n * 0.32);
  vec2 d2 = normalize(d - n * 0.5);
  vec2 d3 = normalize(d + n * 1.2);
  float a1 = dot(p, d1) * 0.0235 - t * 1.7;
  vec2 s = d1 * cos(a1 + 0.9 * sin(dot(p, n) * 0.0105 + t * 0.37));
  s += d2 * (0.62 * cos(dot(p, d2) * 0.039 - t * 2.3 + 1.2 * sin(dot(p, d3) * 0.016 - t * 0.5)));
  s += d3 * (0.36 * cos(dot(p, d3) * 0.064 - t * 2.9 + sin(a1 * 0.5)));
  s += 0.5 * vec2(cos(p.y * 0.0121 + t * 0.61 + sin(p.x * 0.0083 + t * 0.2)), cos(p.x * 0.0137 - t * 0.53 + sin(p.y * 0.0091)));

  float pm = vnoise((p - d * u_wave.w) * 0.004);
  float patch = smoothstep(0.5, 0.74, pm) * u_wave.y;
  vec2 rs = (d * cos(dot(p, d) * 0.29 - t * 6.0 + pm * 12.0) + d2 * (0.7 * cos(dot(p, d2) * 0.22 - t * 4.7))) * patch;

  vec2 rg = ring(p, u_r0) + ring(p, u_r1) + ring(p, u_r2) + ring(p, u_r3) + ring(p, u_r4) + ring(p, u_r5) + ring(p, u_r6) + ring(p, u_r7);
  if (u_rain.x > 0.0) rg += rainCells(p, 150.0, u_rain.w, u_rain.x, 3.0) * u_rain.z;
  if (u_rain.y > 0.0) rg += rainCells(p, 62.0, u_rain.w * 1.25, u_rain.y, 17.0) * (u_rain.z * 0.55);

  // (the cat's-paw ruffle is kept out of the steep-facet sky reflection: its
  // fine crests lit by the pale sky read as falling rain on a dry day)
  vec2 disp = (s * u_wave.x + rs * 0.3 + rg * 0.5) * open;
  float dl = length(disp);
  disp *= inversesqrt(1.0 + dl * dl / (u_cap * u_cap)); // soft limit
  vec2 sl = (s * (u_wave.x * 0.12) + rs * 0.22 + rg * 0.22) * open;
  disp *= 1.0 - 0.6 * smoothstep(u_kd - 0.01, 1.0, m0); // the walls are nearer the surface
  vec2 qr = q + disp / u_pool.zw;

  vec2 aq = abs(qr);
  float m = max(aq.x, aq.y);
  float aa = (1080.0 / u_res.x) / (u_pool.z * 2.0 * u_kd / GRID.x) * 0.8;
  vec3 col;
  float ink = 0.0;
  float shade = 0.0;
  float floorK = 1.0;
  float halo = 0.0;
  float pale = 0.0;
  if (m <= u_kd) {
    // the floor
    vec2 w = qr / u_kd;
    vec2 tc = (w * 0.5 + 0.5) * GRID;
    vec2 cell = floor(tc);
    vec2 f = fract(tc) - 0.5;
    vec4 tx = texture2D(u_tiles, (cell + 0.5) / GRID);
    ink = tx.r;
    if (u_glowC.a > 0.001) halo = texture2D(u_glow, tc / GRID).r;
    float thr = 0.1 + 0.74 * (cell.x / GRID.x * 0.45 + cell.y / GRID.y * 0.55) + tx.b * 0.1;
    pale = step(thr, u_flip);
    float v = tx.g - 0.5;
    vec3 inkc = mix(u_inkA, u_inkB, pale) * (1.0 + v * mix(0.5, 0.14, pale));
    vec3 fieldc = u_field * (1.0 + v * 0.13) * (1.0 + (tx.b - 0.5) * vec3(-0.1, 0.02, 0.08));
    vec3 tile = mix(fieldc, inkc, ink) * (1.0 - 0.1 * (f.x + f.y));
    float e = max(abs(f.x) / max(tx.a, 0.04), abs(f.y));
    float g = smoothstep(0.445 - aa, 0.445 + aa, e);
    col = mix(tile, mix(u_grout, tile, 0.55 * ink), g);
    col *= 0.8 + 0.2 * smoothstep(0.0, 0.035, 1.0 - max(abs(w.x), abs(w.y)));
    vec2 sp = w - u_sun.xy;
    shade = max(smoothstep(0.985, 1.02, abs(sp.x)), smoothstep(0.985, 1.02, abs(sp.y)));
  } else {
    // a wall, foreshortened
    floorK = 0.55;
    float k = min(m, 1.0);
    float z = clamp((1.0 / k - 1.0) / (1.0 / u_kd - 1.0), 0.0, 1.0);
    bool side = aq.x > aq.y;
    float along = (side ? qr.y : qr.x) / k;
    float sgn = sign(side ? qr.x : qr.y);
    vec2 tc = vec2((along * 0.5 + 0.5) * (side ? GRID.y : GRID.x), z * u_rows);
    vec2 cell = floor(tc);
    vec2 f = fract(tc) - 0.5;
    float h = hash1(cell + (side ? 31.0 : 57.0) + sgn * 9.0);
    float trim = step(tc.y, 1.0);
    vec3 tile = mix(u_field * (1.0 + (h - 0.5) * 0.14), u_trim * (1.0 + (h - 0.5) * 0.3), trim);
    float g = max(smoothstep(0.445 - aa, 0.445 + aa, abs(f.x)), smoothstep(0.36 - aa * 3.0, 0.36 + aa * 3.0, abs(f.y)) * 0.7);
    col = mix(tile, u_grout, g * (1.0 - 0.5 * trim));
    vec2 nout = side ? vec2(sgn, 0.0) : vec2(0.0, sgn);
    col *= mix(1.0, 0.84 + 0.28 * dot(nout, u_sun.zw), min(1.0, u_light.z * 2.5)) * (1.0 - 0.2 * z);
    if (!side && sgn > 0.0) {
      // the lamp, set in the wall at the near end
      float ld = length(vec2(along * GRID.x * 0.5 / 1.5, (z - 0.56) * u_rows / 1.25));
      float disc = 1.0 - smoothstep(0.75, 1.0, ld);
      col = mix(col, mix(u_field * 0.55 + 0.25, vec3(1.0, 0.97, 0.86), u_light.w), disc);
      col += u_light.w * vec3(0.5, 0.75, 0.7) * exp(-ld * 1.5) * 0.3;
    }
  }

  // Light: the sun's net by day, the lamp's pool of light at night.
  vec2 lv = (qr / u_kd - vec2(0.0, 1.0)) * vec2(u_pool.z / u_pool.w, 1.0);
  float dist2 = dot(lv, lv);
  float fall = 1.0 / (1.0 + dist2 * 3.0);
  float beam = 1.0 - 0.45 * lv.x * lv.x / (dist2 + 0.02);
  float lit = (1.0 - u_light.z * shade) * mix(1.0, 0.56 + 0.8 * fall * beam, u_light.w);
  vec2 cuv = (p + disp * 5.0) / 620.0 + u_sun.zw * 0.13 * t * 0.2;
  float c = (u_light.x > 0.004 || u_glowC.a > 0.001) ? caustic(cuv, t * 0.3 + 3.0) : 0.0;
  float cs = u_light.x * mix(1.0, min(1.0, fall * 2.4), u_light.w) * floorK * (1.0 - 0.8 * shade) * (1.0 - 0.75 * ice);
  cs *= 1.0 - 0.35 * ink * (1.0 - pale); // the net plays over the cobalt more softly, so the figures keep their edges
  col *= vec3(lit) + u_sunCol * (cs * (c * 1.9 - 0.3));
  col += u_light.w * vec3(0.012, 0.085, 0.095) * fall * fall * (1.0 - 0.6 * ink);
  // The figures are set in lit glass tiles: after dark they glow, spill a halo
  // into the water around them, and the waves throw that light about.
  float gk = u_glowC.a;
  if (gk > 0.001) {
    float on = ink * pale;
    float hz = halo * (1.0 - ink);
    col = mix(col, col * 0.45 + u_glowC.rgb * 0.74, on * gk);
    col += u_glowC.rgb * gk * (hz * hz * 0.3 + hz * c * 0.55 * (1.0 - 0.5 * ice));
  }
  col *= 0.72 + 0.28 * smoothstep(0.0, 16.0, dEdge); // under the coping's lip

  if (u_float.w > 0.0) {
    float fd = length(p + disp - u_float.xy);
    col *= 1.0 - u_float.w * (1.0 - smoothstep(u_float.z * 0.55, u_float.z * 1.2, fd));
  }

  // The sky on the surface: west on the left, east on the right, and more of
  // it wherever a wave is steep.
  float sx = clamp(q.x * 0.5 + 0.5 - sl.x * 0.3, 0.0, 1.0);
  vec3 sky = sx < 0.3333 ? mix(u_skyW, u_skyNW, sx * 3.0) : sx < 0.6667 ? mix(u_skyNW, u_skyNE, sx * 3.0 - 1.0) : mix(u_skyNE, u_skyE, sx * 3.0 - 2.0);
  float steep = length(sl);
  float fres = u_refl.x + u_refl.y * smoothstep(0.3, 1.5, steep);
  fres *= 1.0 - 0.75 * ink * pale * u_glowC.a; // a dark sky never blots out the lit figures
  col = mix(col, sky * (1.0 + 0.2 * steep), clamp(fres, 0.0, 0.7));
  col *= 1.0 - 0.09 * patch * open; // a cat's-paw: a matte, darker ruffled patch moving downwind
  // Sun glints: where a wave tilts to mirror the sun. Kept off the figures.
  vec2 gd = sl * 0.5 - u_glint.xy;
  float gl = exp(-dot(gd, gd) * u_glint.z) * smoothstep(0.72, 0.95, vnoise(p * 0.09 + vec2(t * 0.9, -t * 0.7)));
  col += u_sunCol * (gl * u_light.y * open * (1.0 - 0.7 * ink));
  // Ring crests catch the light: rain reads in any light.
  col += u_hl.rgb * (clamp(dot(rg, vec2(-0.45, -0.89)) * u_hl.a, -0.25, 0.6) * open);

  float guard = 1.0 - 0.55 * ink; // keep veils from washing out the time
  if (u_cold.y > 0.002) {
    // slush rafts
    float sn = fbm((p - d * u_wave.w * 0.3) * 0.0068 + 5.0);
    float raft = smoothstep(0.52, 0.6, sn) * u_cold.y * open * (0.7 + 0.3 * vnoise(p * 0.21));
    col = mix(col, u_veil, raft * 0.5 * guard);
  }
  if (ice > 0.002) {
    vec2 gp = p / 185.0 + (nz - 0.5) * 0.5;
    vec2 id = floor(gp);
    vec2 gf = fract(gp);
    float f1 = 8.0;
    float f2 = 8.0;
    float plate = 0.5;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 hh = hash2(id + o);
      vec2 r = o + hh - gf;
      float dd = dot(r, r);
      if (dd < f1) { f2 = f1; f1 = dd; plate = hh.x; } else if (dd < f2) { f2 = dd; }
    }
    float edge = sqrt(f2) - sqrt(f1);
    float crack = 1.0 - smoothstep(0.0, 0.03, edge);
    float rime = 1.0 - smoothstep(0.0, 0.2, edge);
    float milk = 0.13 + 0.14 * nz + (plate - 0.5) * 0.12 + rime * 0.1;
    col = mix(col, u_veil, ice * milk * guard);
    col = mix(col, u_veil * 1.06, ice * crack * 0.6);
    col = mix(col, u_veil, ice * open * 1.6 * guard); // the growing edge is thicker and whiter
    if (u_cold.z > 0.002) {
      // snow dust streaming over the ice
      // (pale even at night: blown snow catches whatever light there is)
      float du = vnoise(vec2(dot(p, d) * 0.0035 - u_wave.w * 0.0042, dot(p, n) * 0.028));
      float du2 = vnoise(vec2(dot(p, d) * 0.009 - u_wave.w * 0.011, dot(p, n) * 0.06 + 3.0));
      vec3 dustc = max(u_veil * 1.08, vec3(0.3, 0.35, 0.42));
      col = mix(col, dustc, smoothstep(0.48, 0.85, du * 0.7 + du2 * 0.3) * u_cold.z * ice * 0.62 * guard);
    }
  }
  if (u_cold.w > 0.002) {
    float fb = fbm(p * 0.0034 + vec2(t * 0.03, -t * 0.018) + 21.0);
    float wisp = smoothstep(0.32, 0.78, fb);
    col = mix(col, u_veil, u_cold.w * (0.1 + 0.34 * wisp + 0.1 * (0.5 - q.y * 0.5)) * guard);
  }

  col += u_flash * (0.06 + col * 0.7);
  col += (hash1(gl_FragCoord.xy + fract(u_time) * 61.0) - 0.5) / 160.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------

const STYLE = `
.de { position: absolute; inset: 0; background: #0a1420; font-family: "Jost", sans-serif; overflow: hidden;
  --stone: #ddd; --paint: #123; --tile: #1a3aa8; --glyph: #fff; --nose: #eee; --lip: #000; --jd: rgba(0,0,0,.2); --jl: rgba(255,255,255,.3); }
.de .cop { position: absolute; background-color: var(--stone); }
.de .speck { position: absolute; inset: 0; pointer-events: none; }
.de .j { position: absolute; background: var(--jd); box-shadow: 1.5px 1.5px 0 var(--jl); }
.de .rim { position: absolute; left: ${PX0 - 7}px; top: ${PY0 - 7}px; width: ${PX1 - PX0}px; height: ${PY1 - PY0}px;
  border: 7px solid var(--nose); box-shadow: inset 0 0 0 2px var(--lip), 0 0 0 1.5px var(--jd); border-radius: 3px; }
.de .clip { position: absolute; left: ${PX0}px; top: ${PY0}px; width: ${PX1 - PX0}px; height: ${PY1 - PY0}px; overflow: hidden; }
.de .floaty { position: absolute; left: 0; top: 0; width: 160px; height: 160px; margin: -80px 0 0 -80px; will-change: transform; }
.de .txt { position: absolute; inset: 0; color: var(--paint); }
.de .date { position: absolute; left: 64px; top: 58px; font-weight: 600; font-size: 54px; line-height: 64px; letter-spacing: 0.13em; text-transform: uppercase; }
.de .date div { white-space: nowrap; }
.de .tb { position: absolute; right: 64px; top: 64px; display: flex; flex-direction: column; align-items: flex-end; }
.de .cond { margin-top: 20px; font-weight: 500; font-size: 48px; line-height: 48px; letter-spacing: 0.01em; white-space: nowrap; }
.de .temp { height: 104px; display: flex; gap: 8px; }
.de .temp span { width: 100px; height: 104px; border-radius: 5px; background: var(--tile); color: var(--glyph);
  box-shadow: inset 0 3px 0 rgba(255,255,255,.14), inset 0 -4px 0 rgba(0,0,10,.25), 0 0 0 2px var(--jd);
  font-weight: 600; font-size: 96px; line-height: 104px; text-align: center; }
.de .temp span.deg { width: 72px; }
.de .rowA { position: absolute; left: 64px; right: 64px; top: ${PY1 + 55}px; display: grid; grid-template-columns: 240px 1fr 104px 72px; column-gap: 44px; align-items: start; }
.de .it { display: flex; flex-direction: column; white-space: nowrap; min-width: 0; }
.de .it.end { align-items: flex-end; }
.de .lb { font-weight: 600; font-size: 28px; line-height: 32px; letter-spacing: 0.16em; text-transform: uppercase; }
.de .vl { margin-top: 8px; font-weight: 500; font-size: 48px; line-height: 54px; letter-spacing: 0.01em; }
.de .plaque { position: absolute; left: 64px; right: 64px; height: 168px; bottom: 64px; box-sizing: border-box; padding: 18px 44px 0 44px;
  border-radius: 7px; background: var(--tile); color: var(--glyph);
  box-shadow: inset 0 3px 0 rgba(255,255,255,.14), inset 0 -4px 0 rgba(0,0,10,.25), inset 0 0 0 2px rgba(255,255,255,.1), 0 0 0 2px var(--jd), 0 5px 0 var(--jd); }
.de .plaque .lb { opacity: 0.85; }
.de .fv { margin-top: 8px; font-weight: 500; font-size: 38px; line-height: 1.22; letter-spacing: 0.005em; overflow: hidden; max-height: 94px; }
.de .screw { position: absolute; width: 11px; height: 11px; border-radius: 50%; background: var(--glyph); opacity: 0.5; box-shadow: inset 0 -2px 0 rgba(0,0,0,.35); }
.de.nofact .plaque { display: none; }
.de.nofact .rowA { top: ${Math.round((PY1 + 7 + H - 64) / 2 - 56)}px; }
.de.nofact .lb { font-size: 30px; line-height: 36px; }
.de.nofact .vl { font-size: 56px; line-height: 64px; }
`;

function speckle(r) {
  // a tile of stone: fine speckle and a few travertine pores, black and white with alpha
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r.range(0.03, 0.1)})` : `rgba(255,255,255,${r.range(0.04, 0.14)})`;
    const sz = r.range(0.6, 2.2);
    ctx.fillRect(r.range(0, 256), r.range(0, 256), sz, sz);
  }
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(0,0,0,${r.range(0.06, 0.16)})`;
    ctx.beginPath();
    ctx.ellipse(r.range(4, 252), r.range(4, 252), r.range(1.5, 5), r.range(0.6, 1.6), r.range(-0.3, 0.3), 0, TAU);
    ctx.fill();
  }
  return c.toDataURL("image/png");
}

const DUCK = `
<g>
  <path d="M0 44 L-9 30 L9 30 Z" fill="#f2b705"/>
  <ellipse cx="0" cy="8" rx="27" ry="33" fill="#ffd21c"/>
  <path d="M-19 4 Q-23 22 -8 30 Q-14 16 -12 2 Z" fill="#f4bc0a"/>
  <path d="M19 4 Q23 22 8 30 Q14 16 12 2 Z" fill="#f4bc0a"/>
  <ellipse cx="-7" cy="-2" rx="9" ry="14" fill="#ffe873" opacity=".55"/>
  <path d="M-7 -40 Q0 -58 7 -40 Q0 -34 -7 -40 Z" fill="#ff8a1f"/>
  <circle cx="0" cy="-24" r="18" fill="#ffdc3a"/>
  <circle cx="-9" cy="-30" r="2.6" fill="#1b1b22"/>
  <circle cx="9" cy="-30" r="2.6" fill="#1b1b22"/>
</g>`;
const LEAF = `
<g>
  <path d="M0 -40 C22 -24 26 10 0 40 C-26 10 -22 -24 0 -40 Z" fill="#c8641c"/>
  <path d="M0 -40 C22 -24 26 10 0 40 Z" fill="#e08a24"/>
  <path d="M0 -36 L0 52" stroke="#7a3a10" stroke-width="2.4" stroke-linecap="round" fill="none"/>
  <path d="M0 -14 L12 -22 M0 2 L15 -6 M0 18 L12 10 M0 -14 L-12 -22 M0 2 L-15 -6 M0 18 L-12 10" stroke="#7a3a10" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".7"/>
</g>`;
const RING = `
<g>
  <circle r="46" fill="none" stroke="#fbfbf6" stroke-width="30"/>
  <circle r="46" fill="none" stroke="#ff4b3a" stroke-width="30" stroke-dasharray="36.13 36.13"/>
  <circle r="58" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="5"/>
  <circle r="40" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="5"/>
</g>`;

export default {
  title: "The Deep End",
  description: "Straight down into a tiled pool: the time in mosaic on the floor, under water that the real wind, rain, sun and frost are working on.",
  fonts: ["Jost:wght@500;600"],
  fps: 30,

  mount(root, { state, seed }) {
    addStyle(root, STYLE);
    const wrap = el("div", { class: "de" });
    root.append(wrap);
    const r = rng(seed);

    // ----- the water -----
    const water = shader(wrap, { frag: FRAG, maxScale: 0.67 });
    let gl = null;
    if (water.ok) {
      try {
        gl = water.canvas.getContext("webgl") || water.canvas.getContext("experimental-webgl");
      } catch {}
    }
    let tex = null;
    let texLost = false;
    water.canvas.addEventListener("webglcontextrestored", () => (texLost = true));
    const fallback = water.ok ? null : canvas2d(wrap, { maxScale: 1 }); // no WebGL: a still floor

    // tiles: target mask, and the bytes the shader reads (r ink, g b variation, a squash)
    const mask = new Uint8Array(GW * GH);
    const bytes = new Uint8Array(GW * GH * 4);
    const flipAt = new Float32Array(GW * GH).fill(-1);
    let flipping = 0;
    for (let i = 0; i < GW * GH; i++) {
      bytes[i * 4 + 1] = Math.floor(r() * 256);
      bytes[i * 4 + 2] = Math.floor(r() * 256);
      bytes[i * 4 + 3] = 255;
    }
    // the halo: the figure mask blurred, sampled with linear filtering on unit 1
    const glowA = new Float32Array(GW * GH), glowB = new Float32Array(GW * GH);
    const glowBytes = new Uint8Array(GW * GH);
    let glowTex = null;
    let glowDirty = true;
    function blurGlow() {
      for (let i = 0; i < GW * GH; i++) glowA[i] = mask[i];
      for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < GH; y++)
          for (let x = 0; x < GW; x++) {
            let a = 0;
            for (let k = -2; k <= 2; k++) {
              const xx = x + k;
              if (xx >= 0 && xx < GW) a += glowA[y * GW + xx];
            }
            glowB[y * GW + x] = a / 5;
          }
        for (let y = 0; y < GH; y++)
          for (let x = 0; x < GW; x++) {
            let a = 0;
            for (let k = -2; k <= 2; k++) {
              const yy = y + k;
              if (yy >= 0 && yy < GH) a += glowB[yy * GW + x];
            }
            glowA[y * GW + x] = a / 5;
          }
      }
      for (let i = 0; i < GW * GH; i++) glowBytes[i] = Math.min(255, Math.round(glowA[i] * 330));
      glowDirty = true;
    }
    const makeTex = (filter) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    function upload() {
      if (!gl || !water.ok) return;
      if (!tex || texLost) {
        texLost = false;
        gl.activeTexture(gl.TEXTURE1);
        glowTex = makeTex(gl.LINEAR);
        glowDirty = true;
        gl.activeTexture(gl.TEXTURE0);
        tex = makeTex(gl.NEAREST);
        // the kit's program is the current one: point u_glow at unit 1 (samplers default to 0)
        const prog = gl.getParameter(gl.CURRENT_PROGRAM);
        if (prog) gl.uniform1i(gl.getUniformLocation(prog, "u_glow"), 1);
      }
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      if (glowDirty) {
        glowDirty = false;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, glowTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, GW, GH, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, glowBytes);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GW, GH, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    }

    // ----- what floats (clipped to the pool) -----
    const clip = el("div", { class: "clip" });
    const floaty = svg("svg", { class: "floaty", viewBox: "-80 -80 160 160" });
    clip.append(floaty);
    wrap.append(clip);

    // ----- the coping -----
    const speck = speckle(rng(seed + 5));
    const stoneBox = (x, y, w, h) =>
      el("div", { class: "cop", style: { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` } },
        el("div", { class: "speck", style: { backgroundImage: `url(${speck})`, backgroundSize: "256px 256px", backgroundPosition: `${-x}px ${-y}px` } }));
    wrap.append(stoneBox(0, 0, W, PY0), stoneBox(0, PY1, W, H - PY1), stoneBox(0, PY0, PX0, PY1 - PY0), stoneBox(PX1, PY0, W - PX1, PY1 - PY0));
    const joint = (x, y, w, h) => el("div", { class: "j", style: { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` } });
    // the long end slabs run unbroken behind the lettering; only the corner blocks are jointed off
    for (const x of [PX0 - 8, PX1 + 6]) wrap.append(joint(x, 0, 2, PY0 - 7), joint(x, PY1 + 7, 2, H - PY1 - 7));
    for (let k = 0; k <= 8; k++) {
      const y = PY0 + (k * (PY1 - PY0)) / 8 - 1;
      wrap.append(joint(0, y, PX0 - 7, 2), joint(PX1 + 7, y, W - PX1 - 7, 2));
    }
    wrap.append(el("div", { class: "rim" }));

    // ----- lettering -----
    const txt = el("div", { class: "txt" });
    const wkday = el("div");
    const mday = el("div");
    const date = el("div", { class: "date" }, wkday, mday);
    const cond = el("div", { class: "cond" });
    const temp = el("div", { class: "temp" });
    const tb = el("div", { class: "tb" }, temp, cond);
    const item = (label) => {
      const lb = el("div", { class: "lb", text: label });
      const vl = el("div", { class: "vl" });
      return { node: el("div", { class: "it" }, lb, vl), lb, vl };
    };
    const sunIt = item("");
    const moonIt = item("Moon");
    const aqiIt = item("AQI");
    const uvIt = item("UV");
    uvIt.node.classList.add("end");
    const rowA = el("div", { class: "rowA" }, sunIt.node, moonIt.node, aqiIt.node, uvIt.node);
    const factLb = el("div", { class: "lb" });
    const factVl = el("div", { class: "fv" });
    const plaque = el("div", { class: "plaque" }, factLb, factVl,
      el("div", { class: "screw", style: { left: "14px", top: "14px" } }), el("div", { class: "screw", style: { right: "14px", top: "14px" } }),
      el("div", { class: "screw", style: { left: "14px", bottom: "16px" } }), el("div", { class: "screw", style: { right: "14px", bottom: "16px" } }));
    txt.append(date, tb, rowA, plaque);
    wrap.append(txt);

    // ----- what falls: snowflakes and the splashes of rain on the stone -----
    const over = canvas2d(wrap, { adaptive: true, maxScale: 0.75 }); // soft things only: rain, snow, splashes
    let overDirty = false;
    grain(wrap, { opacity: 0.05 });

    const shown = {};
    const put = (key, node, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };

    // ----- state that eases -----
    const e = { rain: 0, snow: 0, storm: 0, fog: 0, wet: 0 };
    let first = true;
    let lastMs = 0;
    let waveT = r.range(0, 40);
    let travel = r.range(0, 4000);
    let windAng = 0;
    let cssAt = -1;

    // uniforms, allocated once
    const U = {
      pool: [PCX, PCY, PHW, PHH],
      field: [0, 0, 0], grout: [0, 0, 0], inkA: [0, 0, 0], inkB: [0, 0, 0], trim: [0, 0, 0],
      wind: [1, 0], wave: [0, 0, 0, 0], light: [0, 0, 0, 0], sunCol: [1, 1, 1], sun: [0, 0, 0, -1], glint: [0, 0, 60],
      skyW: [0, 0, 0], skyNW: [0, 0, 0], skyNE: [0, 0, 0], skyE: [0, 0, 0], refl: [0, 0],
      rain: [0, 0, 0, 0], cold: [0, 0, 0, 0], veil: [0, 0, 0], float: [0, 0, 0, 0],
      glowC: [0, 0, 0, 0], hl: [0, 0, 0, 0], cap: 6,
    };
    const RING_U = ["u_r0", "u_r1", "u_r2", "u_r3", "u_r4", "u_r5", "u_r6", "u_r7"];
    const rings = [];
    for (let i = 0; i < 8; i++) rings.push({ u: [0, 0, 0, 0], age: 9, life: 1, amp: 0 });
    let ringTimer = 0;
    const tmp = [0, 0, 0];
    const stone = [0, 0, 0], paint = [0, 0, 0], tileBg = [0, 0, 0], glyph = [0, 0, 0], skyMean = [0, 0, 0], nose = [0, 0, 0];
    const skyCache = { west: "", northWest: "", northEast: "", east: "", mean: "" };
    const skyVec = (key, out) => {
      const hex = state.sky[key];
      if (skyCache[key] !== hex) {
        skyCache[key] = hex;
        set3(out, vec3(hex));
      }
    };

    // ----- snowflakes: each one falls away from the viewer toward the spot it lands on -----
    const NF = 420;
    const fl = new Float32Array(NF * 6); // land x, land y, phase, fall seconds, size, sideways drift
    for (let i = 0; i < NF; i++) {
      fl[i * 6] = r.range(-20, W + 20);
      fl[i * 6 + 1] = r.range(-20, H + 20);
      fl[i * 6 + 2] = r();
      fl[i * 6 + 3] = r.range(2.4, 4.4);
      fl[i * 6 + 4] = r.range(0.75, 1.35);
      fl[i * 6 + 5] = r.range(-1, 1);
    }
    // ----- raindrops: falling away from the viewer, toward where each one lands -----
    const NR = 120;
    const rd = new Float32Array(NR * 4); // land x, land y, phase, speed
    for (let i = 0; i < NR; i++) {
      rd[i * 4] = r.range(-40, W + 40);
      rd[i * 4 + 1] = r.range(-40, H + 40);
      rd[i * 4 + 2] = r();
      rd[i * 4 + 3] = r.range(1.6, 2.4);
    }
    // ----- rain on the coping: small splashes -----
    const NS = 70;
    const sp = new Float32Array(NS * 4); // x, y, phase, rate
    const copingSpot = (i) => {
      const band = r();
      if (band < 0.42) (sp[i * 4] = r.range(0, W)), (sp[i * 4 + 1] = r.range(0, PY0 - 10));
      else if (band < 0.9) (sp[i * 4] = r.range(0, W)), (sp[i * 4 + 1] = r.range(PY1 + 10, H));
      else (sp[i * 4] = r() < 0.5 ? r.range(0, PX0 - 10) : r.range(PX1 + 10, W)), (sp[i * 4 + 1] = r.range(PY0, PY1));
    };
    for (let i = 0; i < NS; i++) {
      copingSpot(i);
      sp[i * 4 + 2] = r();
      sp[i * 4 + 3] = r.range(0.9, 1.7);
    }

    // ----- the rare visitor -----
    const visit = { kind: "", x: r.range(200, 780), y: r.range(260, 1080), vx: 0, vy: 0, rot: r.range(0, 360), spin: r.range(-4, 4), wake: r.range(1, 4) };
    const visitor = rng(seed + 77)() < 0.25;

    function spawnRing(x, y, amp, life, age = 0) {
      let best = rings[0];
      for (const g of rings) if (g.age / g.life > best.age / best.life) best = g;
      best.u[0] = x;
      best.u[1] = y;
      best.age = age;
      best.life = life;
      best.amp = amp;
    }

    function drawFallback(s) {
      const { ctx } = fallback;
      ctx.fillStyle = css(U.grout);
      ctx.fillRect(PX0, PY0, PX1 - PX0, PY1 - PY0);
      const ts = (PX1 - PX0) / GW;
      const pale = s.daylight < 0.5;
      for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
          const i = y * GW + x;
          const v = 1 + (bytes[i * 4 + 1] / 255 - 0.5) * 0.14;
          ctx.fillStyle = css(mul3(tmp, mask[i] ? (pale ? U.inkB : U.inkA) : U.field, v));
          ctx.fillRect(PX0 + x * ts + 1.2, PY0 + y * ts + 1.2, ts - 2.4, ts - 2.4);
        }
    }

    return {
      frame(s) {
        const wx = s.weather;
        const dt = s.dt;
        const jump = first || Math.abs(s.ms - lastMs) > 5000;
        lastMs = s.ms;

        // ----- conditions, eased -----
        const fallingRain = wx.falling === "rain" || wx.falling === "drizzle" || wx.falling === "freezing" || wx.falling === "storm";
        const tRain = fallingRain ? wx.intensity : 0;
        const tSnow = wx.falling === "snow" ? wx.intensity : 0;
        const tStorm = wx.kind === "storm" ? 1 : 0;
        const tFog = wx.fog ? 1 : clamp(1 - wx.visibility / 0.6) * 0.8;
        const tWet = fallingRain ? 1 : 0;
        if (jump) {
          e.rain = tRain; e.snow = tSnow; e.storm = tStorm; e.fog = tFog; e.wet = tWet;
        } else {
          e.rain = approach(e.rain, tRain, dt, 2);
          e.snow = approach(e.snow, tSnow, dt, 2);
          e.storm = approach(e.storm, tStorm, dt, 3);
          e.fog = approach(e.fog, tFog, dt, 3);
          e.wet = approach(e.wet, tWet, dt, 3);
        }
        const day = s.daylight;
        const dw = Math.pow(day, 1.15);
        const cloud = clamp(wx.cloud / 100);
        const sunUp = smoothstep(-1, 22, s.sun.alt);
        const direct = sunUp * (1 - Math.pow(cloud, 1.4) * 0.96) * (1 - 0.7 * e.fog) * (1 - 0.6 * e.wet) * (1 - 0.5 * e.snow);
        const heat = smoothstep(84, 96, wx.temp);
        const ice = clamp((33 - wx.temp) / 15);
        const tide = s.tide.norm;
        const wind = wx.wind;
        // the pool lights come on at dusk, sooner when rain or storm darkens the day
        const lamp = smoothstep(0.42, 0.12, day * (1 - 0.35 * e.wet - 0.2 * e.storm));
        // golden hour: a low sun that is getting through warms the water and the stone
        const gold = smoothstep(24, 4, s.sun.alt) * smoothstep(-2, 2, s.sun.alt) * (1 - Math.pow(cloud, 1.4) * 0.9) * (1 - e.fog) * (1 - e.wet) * (1 - lamp);

        // ----- the clocks of the water -----
        const rate = 0.5 + Math.min(1.1, wind / 26);
        waveT += dt * rate;
        travel += dt * (12 + wind * 5.5);
        const ang = ((wx.windDir + 180) * Math.PI) / 180; // the wind blows toward here; north is up
        windAng = jump ? ang : windAng + Math.atan2(Math.sin(ang - windAng), Math.cos(ang - windAng)) * Math.min(1, dt * 0.5);
        U.wind[0] = Math.sin(windAng);
        U.wind[1] = -Math.cos(windAng);
        U.wave[0] = (1.7 + 3.1 * smoothstep(0, 30, wind) + 0.8 * e.storm) * (0.88 + 0.24 * tide);
        U.wave[1] = smoothstep(5, 26, wx.gust);
        U.wave[2] = waveT;
        U.wave[3] = travel;
        const kd = lerp(0.945, 0.905, tide);
        const rows = 5.2 * (1 / kd - 1) / (1 / 0.925 - 1);

        // ----- palette -----
        skyVec("west", U.skyW); skyVec("northWest", U.skyNW); skyVec("northEast", U.skyNE); skyVec("east", U.skyE); skyVec("mean", skyMean);
        const f = U.field;
        mix3(f, COL.fClear, COL.fOver, Math.pow(cloud, 1.3));
        mix3(f, f, COL.fHeat, heat * (1 - cloud));
        mix3(f, f, COL.fFog, e.fog);
        mix3(f, f, COL.fRain, e.wet * (0.6 + 0.4 * e.rain));
        mix3(f, f, COL.fStorm, e.storm);
        mix3(f, f, COL.fSnow, Math.min(1, e.snow * 1.6));
        mix3(f, f, COL.fIce, ice * 0.6);
        mix3(f, f, skyMean, 0.12 * day);
        mix3(f, f, COL.fGold, 0.42 * gold);
        mul3(f, f, lerp(1.04, 0.95, tide));
        mix3(tmp, COL.fNight, skyMean, 0.1);
        mix3(f, tmp, f, dw);
        const F = lum(f);
        const flip = smoothstep(0.215, 0.165, F);
        // dark tiles: cobalt, deepened until it holds against the field
        const wantA = Math.max(0.002, (F + 0.05) / 4.4 - 0.05);
        mul3(U.inkA, COL.cobalt, Math.min(1, Math.pow(wantA / 0.043, 1 / 2.2)));
        // pale tiles: glaze, lifted until it holds against the field
        const wantB = 3.9 * (F + 0.05) - 0.05;
        let k = 0;
        if (lum(COL.glaze) < wantB) {
          let lo = 0, hi = 1;
          for (let i = 0; i < 6; i++) {
            k = (lo + hi) / 2;
            if (lum(mix3(tmp, COL.glaze, COL.white, k)) < wantB) lo = k;
            else hi = k;
          }
          k = hi;
        }
        mix3(U.inkB, COL.glaze, COL.white, k);
        mix3(tmp, f, COL.white, 0.62);
        mul3(U.grout, f, 0.5);
        mix3(U.grout, U.grout, tmp, dw);
        mix3(U.trim, COL.trimNight, COL.trimDay, dw);
        mix3(U.veil, COL.veilNight, COL.veilDay, dw);
        mix3(U.veil, U.veil, skyMean, 0.12);

        // ----- light -----
        const low = smoothstep(26, 3, s.sun.alt);
        mix3(U.sunCol, COL.sunHigh, COL.sunLow, low * (1 - lamp));
        mix3(U.sunCol, U.sunCol, COL.lampCol, lamp);
        U.light[0] = lerp(direct * (0.5 + 0.2 * heat) + 0.03 * day + 0.26 * gold, 0.22, lamp) * (1 - 0.6 * e.storm * lamp);
        U.light[1] = direct * (0.25 + 0.35 * heat + 0.15 * U.wave[1]) + 0.2 * gold;
        U.light[2] = direct * 0.36 + 0.3 * gold; // the long shadow of the coping
        U.light[3] = lamp;
        const az = (s.sun.az * Math.PI) / 180;
        const lx = -Math.sin(az), ly = Math.cos(az); // the way sunlight travels across the floor
        const sinR = Math.cos((Math.max(2, s.sun.alt) * Math.PI) / 180) / 1.33; // refracted into the water
        const reach = Math.min(190, (150 * sinR) / Math.sqrt(1 - sinR * sinR)) * (0.8 + 0.4 * tide);
        U.sun[0] = (lx * reach) / PHW;
        U.sun[1] = (ly * reach) / PHH;
        U.sun[2] = lx;
        U.sun[3] = ly;
        const tilt = 0.1 + 0.3 * (1 - clamp(s.sun.alt / 75));
        U.glint[0] = -lx * tilt;
        U.glint[1] = -ly * tilt;
        U.glint[2] = lerp(55, 90, heat);
        U.refl[0] = (0.04 + 0.1 * cloud + 0.04 * e.wet) * (0.55 + 0.45 * dw) + 0.05 * ice;
        U.refl[1] = (0.3 + 0.22 * cloud) * (1 - 0.5 * lamp);

        // the lit figures after dark, ring crests, and how rough the surface may get
        set3(U.glowC, COL.glow);
        U.glowC[3] = lamp * (1 - 0.3 * e.fog);
        mix3(tmp, skyMean, COL.white, 0.45);
        mul3(tmp, tmp, 0.3 + 0.5 * dw);
        mix3(U.hl, tmp, COL.glow, lamp * 0.55);
        U.hl[3] = 0.075 * (1 - ice);
        U.cap = 3.5 + 4 * Math.max(smoothstep(4, 32, wind), e.rain * 0.8, e.storm);

        // ----- rain -----
        U.rain[0] = clamp(e.rain * 1.5 - 0.35) * 0.95;
        U.rain[1] = e.rain > 0.01 ? clamp(0.3 + e.rain * 0.8) * (1 - ice) : 0;
        U.rain[2] = 2.2 + 3.2 * e.rain;
        U.rain[3] = s.t;
        const ringEvery = e.rain > 0.02 && ice < 0.8 ? lerp(1.1, 0.24, e.rain) : 0;
        if (first && ringEvery) for (let i = 0; i < 8; i++) spawnRing(r.range(PX0 + 30, PX1 - 30), r.range(PY0 + 30, PY1 - 30), 4 + 4 * e.rain, r.range(2, 2.8), r.range(0, 2));
        if (ringEvery) {
          ringTimer -= dt;
          let guard = 0;
          while (ringTimer <= 0 && guard++ < 4) {
            ringTimer += ringEvery * r.range(0.6, 1.4);
            spawnRing(r.range(PX0 + 30, PX1 - 30), r.range(PY0 + 30, PY1 - 30), r.range(3.5, 5) + 3.5 * e.rain, r.range(2, 2.8));
          }
        }
        for (const g of rings) {
          g.age += dt;
          const u = g.age / g.life;
          g.u[2] = g.age;
          g.u[3] = u >= 1 ? 0 : g.amp * (1 - u) * (1 - u) * Math.min(1, g.age * 8);
        }

        // ----- cold, fog, storm -----
        U.cold[0] = ice;
        U.cold[1] = Math.min(1, e.snow * 1.5) * (1 - 0.5 * ice);
        U.cold[2] = ice > 0.25 ? clamp(e.snow * 1.2 + smoothstep(8, 28, wind) * 0.8) : 0;
        U.cold[3] = e.fog;
        let flash = 0;
        if (e.storm > 0.05) {
          const period = 17;
          const n = Math.floor(s.t / period);
          const at = n * period + 3 + hash(n, seed) * 9;
          const u = s.t - at;
          if (hash(n + 40, seed) < 0.7 && u > 0 && u < 3) flash = (u < 0.35 ? smoothstep(0, 0.35, u) : Math.pow(1 - (u - 0.35) / 2.65, 2)) * 0.2 * e.storm;
        }

        // ----- the mosaic -----
        const stamp = s.text.hh + ":" + s.text.mm + s.text.ampm;
        if (shown.stamp !== stamp) {
          shown.stamp = stamp;
          layTime(mask, s.text.hh, s.text.mm, s.text.ampm);
          if (jump || flipping > 0) blurGlow(); // otherwise the halo follows once the wave has passed
          if (jump) {
            for (let i = 0; i < GW * GH; i++) {
              bytes[i * 4] = mask[i] * 255;
              bytes[i * 4 + 3] = 255;
              flipAt[i] = -1;
            }
            flipping = 0;
          } else {
            // the changed tiles turn over in a diagonal wave
            let lo = 1e9;
            for (let i = 0; i < GW * GH; i++) if ((bytes[i * 4] > 127) !== (mask[i] === 1)) lo = Math.min(lo, (i % GW) + Math.floor(i / GW));
            for (let i = 0; i < GW * GH; i++)
              if ((bytes[i * 4] > 127) !== (mask[i] === 1) && flipAt[i] < 0) {
                flipAt[i] = s.t + ((i % GW) + Math.floor(i / GW) - lo) * 0.03 + (bytes[i * 4 + 1] / 255) * 0.08;
                flipping++;
              }
          }
          upload();
          if (fallback) drawFallback(s);
        }
        if (flipping > 0) {
          for (let i = 0; i < GW * GH; i++) {
            if (flipAt[i] < 0) continue;
            const u = (s.t - flipAt[i]) / 0.45;
            if (u <= 0) continue;
            if (u >= 1) {
              bytes[i * 4] = mask[i] * 255;
              bytes[i * 4 + 3] = 255;
              flipAt[i] = -1;
              if (--flipping === 0) blurGlow();
            } else {
              if (u >= 0.5) bytes[i * 4] = mask[i] * 255;
              bytes[i * 4 + 3] = Math.round(255 * Math.abs(Math.cos(Math.PI * u)));
            }
          }
          upload();
        }
        if (texLost) upload();

        // ----- the visitor -----
        let kind = "";
        if (visitor) kind = s.clock.monthIndex >= 9 && s.clock.monthIndex <= 11 && wx.temp > 36 ? "leaf" : wx.temp >= 76 && day > 0.5 ? "ring" : "duck";
        if (kind !== visit.kind) {
          visit.kind = kind;
          floaty.innerHTML = kind === "leaf" ? LEAF : kind === "ring" ? RING : kind === "duck" ? DUCK : "";
          floaty.style.display = kind ? "" : "none";
        }
        if (kind) {
          const free = 1 - smoothstep(0.2, 0.7, ice);
          const sp0 = (3 + wind * 0.7) * free * (kind === "leaf" ? 1.3 : 1);
          visit.vx = approach(visit.vx, U.wind[0] * sp0 + Math.sin(s.t * 0.13 + 1) * 2 * free, dt, 2);
          visit.vy = approach(visit.vy, U.wind[1] * sp0 + Math.cos(s.t * 0.11) * 2 * free, dt, 2);
          visit.x += visit.vx * dt;
          visit.y += visit.vy * dt;
          const mx = kind === "ring" ? 80 : 60;
          // it noses along the wall and comes back round on the eddy
          if (visit.x < mx) visit.x = mx; else if (visit.x > PX1 - PX0 - mx) visit.x = PX1 - PX0 - mx;
          if (visit.y < mx) visit.y = mx; else if (visit.y > PY1 - PY0 - mx) visit.y = PY1 - PY0 - mx;
          visit.rot += (visit.spin + Math.sin(s.t * 0.21) * 5) * dt * free;
          const bob = 1 + Math.sin(s.t * 1.3) * 0.015 * free;
          const sc = kind === "leaf" ? 0.62 : kind === "ring" ? 1.05 : 0.9;
          floaty.style.transform = `translate(${visit.x.toFixed(1)}px,${visit.y.toFixed(1)}px) rotate(${visit.rot.toFixed(1)}deg) scale(${(sc * bob).toFixed(3)})`;
          const op = (0.3 + 0.7 * dw).toFixed(2);
          if (shown.fop !== op) (shown.fop = op), (floaty.style.opacity = op);
          const sh = kind === "leaf" ? 26 : kind === "ring" ? 66 : 40;
          U.float[0] = PX0 + visit.x + U.sun[2] * (20 + 30 * tide);
          U.float[1] = PY0 + visit.y + U.sun[3] * (20 + 30 * tide);
          U.float[2] = sh;
          U.float[3] = 0.1 + 0.3 * direct;
          visit.wake -= dt * free;
          if (visit.wake <= 0 && !ringEvery) {
            visit.wake = r.range(3.5, 6);
            spawnRing(PX0 + visit.x, PY0 + visit.y, kind === "leaf" ? 2 : 3.2, 2.8);
          }
        } else U.float[3] = 0;

        // ----- draw the water -----
        if (water.ok) {
          water.set("u_pool", U.pool);
          water.set("u_kd", kd);
          water.set("u_rows", rows);
          water.set("u_field", U.field);
          water.set("u_grout", U.grout);
          water.set("u_inkA", U.inkA);
          water.set("u_inkB", U.inkB);
          water.set("u_trim", U.trim);
          water.set("u_flip", flip);
          water.set("u_wind", U.wind);
          water.set("u_wave", U.wave);
          water.set("u_light", U.light);
          water.set("u_sunCol", U.sunCol);
          water.set("u_sun", U.sun);
          water.set("u_glint", U.glint);
          water.set("u_skyW", U.skyW);
          water.set("u_skyNW", U.skyNW);
          water.set("u_skyNE", U.skyNE);
          water.set("u_skyE", U.skyE);
          water.set("u_refl", U.refl);
          water.set("u_rain", U.rain);
          for (let i = 0; i < 8; i++) water.set(RING_U[i], rings[i].u);
          water.set("u_cold", U.cold);
          water.set("u_veil", U.veil);
          water.set("u_float", U.float);
          water.set("u_flash", flash);
          water.set("u_glowC", U.glowC);
          water.set("u_hl", U.hl);
          water.set("u_cap", U.cap);
          water.draw(s.t);
        } else if (fallback && (jump || s.t - cssAt > 0.5)) drawFallback(s);

        // ----- the coping's colours (a few times a second is plenty) -----
        if (jump || s.t - cssAt > 0.4) {
          cssAt = s.t;
          mix3(stone, COL.stoneClear, COL.stoneOver, cloud);
          mix3(stone, stone, skyMean, 0.1);
          mix3(stone, stone, COL.stoneGold, 0.5 * gold);
          mul3(stone, stone, 1 - 0.2 * e.wet);
          mix3(stone, stone, COL.white, 0.35 * Math.min(1, e.snow * 1.5 + ice * 0.3));
          // the stone hurries through mid-grey, where neither ink would hold
          const ds = smoothstep(0.3, 0.56, day);
          mix3(stone, COL.stoneNight, stone, ds);
          const S = lum(stone);
          if (S >= 0.18) mul3(paint, COL.paintDay, Math.min(1, Math.pow(Math.max(0, (S + 0.05) / 5.6 - 0.05) / 0.024, 1 / 2.2)));
          else {
            const want = Math.min(0.95, 5.6 * (S + 0.05) - 0.05);
            let lo = 0, hi = 1;
            for (let i = 0; i < 6; i++) {
              const m = (lo + hi) / 2;
              if (lum(mix3(tmp, COL.paintNight, COL.white, m)) < want) lo = m;
              else hi = m;
            }
            mix3(paint, COL.paintNight, COL.white, lum(COL.paintNight) >= want ? 0 : hi);
          }
          const fb = 0.4 + 0.6 * dw;
          shown.splashLight = `rgba(255,255,255,${(0.1 + 0.3 * dw).toFixed(3)})`;
          shown.splashDark = `rgba(10,20,40,${(0.2 + 0.1 * dw).toFixed(3)})`;
          shown.flakeShadow = `rgba(20,40,70,${(0.2 * dw).toFixed(3)})`;
          shown.flakeFar = `rgba(255,255,255,${(0.3 * fb).toFixed(3)})`;
          shown.flakeNear = `rgba(255,255,255,${(0.75 * fb).toFixed(3)})`;
          shown.flakeLand = `rgba(255,255,255,${(0.85 * fb).toFixed(3)})`;
          shown.rainInk = `rgba(${Math.round(lerp(150, 235, dw))},${Math.round(lerp(225, 245, dw))},255,${(0.16 + 0.1 * e.rain).toFixed(2)})`;
          mix3(tileBg, COL.tileNight, COL.tileDay, dw);
          mix3(glyph, COL.glyphNight, COL.white, dw);
          mix3(nose, stone, COL.white, 0.3 * dw + 0.08);
          const key = css(stone) + css(paint) + css(tileBg);
          if (shown.pal !== key) {
            shown.pal = key;
            const st = wrap.style;
            st.setProperty("--stone", css(stone));
            st.setProperty("--paint", css(paint));
            st.setProperty("--tile", css(tileBg));
            st.setProperty("--glyph", css(glyph));
            st.setProperty("--nose", css(nose));
            st.setProperty("--lip", css(mul3(tmp, stone, 0.35)));
            st.setProperty("--jd", `rgba(0,0,0,${(0.1 + 0.14 * dw).toFixed(2)})`);
            st.setProperty("--jl", `rgba(255,255,255,${(0.03 + 0.3 * dw).toFixed(2)})`);
          }
        }

        // ----- snow and splashes -----
        const { ctx } = over;
        const nFl = Math.round(NF * clamp(0.2 + e.snow * 1.4) * (e.snow > 0.01 ? 1 : 0));
        const nSp = ice < 0.5 ? Math.round(NS * clamp(e.rain * 1.3)) : 0;
        const nRd = ice < 0.5 ? Math.round(NR * clamp(e.rain * 1.1)) : 0;
        if (nFl || nSp || nRd || overDirty) over.clear();
        overDirty = nFl > 0 || nSp > 0 || nRd > 0;
        if (nRd) {
          // short motion-blurred streaks, converging on the floor as they fall
          ctx.lineWidth = 2.2;
          ctx.lineCap = "round";
          ctx.strokeStyle = shown.rainInk;
          const drift = 6 + wind * 2.2;
          ctx.beginPath();
          for (let i = 0; i < nRd; i++) {
            const j = i * 4;
            let u = rd[j + 2] + dt * rd[j + 3];
            if (u >= 1) {
              u -= 1;
              rd[j] = r.range(-40, W + 40);
              rd[j + 1] = r.range(-40, H + 40);
            }
            rd[j + 2] = u;
            const up0 = 1 - u, up1 = Math.max(0, 1 - u - 0.07);
            const x = rd[j], y = rd[j + 1];
            const ox = x - W / 2, oy = y - H / 2;
            ctx.moveTo(x + ox * 0.6 * up0 - U.wind[0] * drift * up0, y + oy * 0.6 * up0 - U.wind[1] * drift * up0);
            ctx.lineTo(x + ox * 0.6 * up1 - U.wind[0] * drift * up1, y + oy * 0.6 * up1 - U.wind[1] * drift * up1);
          }
          ctx.stroke();
        }
        if (nFl) {
          const drift = 40 + wind * 9;
          // in a hard wind the falling flakes draw out into streaks along it
          const streak = smoothstep(10, 30, wind);
          const sa = Math.atan2(U.wind[1], U.wind[0]);
          const ca = Math.cos(sa), sn = Math.sin(sa);
          const p0 = dw > 0.15 ? -1 : 0; // flake shadows only show by day (they are what makes white flakes read on pale stone)
          for (let pass = p0; pass < 3; pass++) {
            // the shadows of the falling flakes, then far (big, soft), near, landed
            ctx.fillStyle = pass < 0 ? shown.flakeShadow : pass === 0 ? shown.flakeFar : pass === 1 ? shown.flakeNear : shown.flakeLand;
            ctx.beginPath();
            for (let i = 0; i < nFl; i++) {
              const j = i * 6;
              const fall = fl[j + 3] / (1 + wind * 0.02);
              const rest = 1.6;
              let u = fl[j + 2];
              if (pass === p0) {
                u += dt / (fall + rest);
                if (u >= 1) {
                  u -= 1;
                  fl[j] = r.range(-20, W + 20);
                  fl[j + 1] = r.range(-20, H + 20);
                }
                fl[j + 2] = u;
              }
              const uf = (u * (fall + rest)) / fall; // 0..1 falling, above 1 lying where it landed
              const which = uf >= 1 ? 2 : uf > 0.55 ? 1 : 0;
              if (pass < 0 ? which === 2 : which !== pass) continue;
              let x = fl[j], y = fl[j + 1], sz;
              if (uf < 1) {
                const up = 1 - uf;
                x += (x - W / 2) * 0.5 * up - U.wind[0] * drift * up * fall * 0.5 + fl[j + 5] * 30 * up;
                y += (y - H / 2) * 0.5 * up - U.wind[1] * drift * up * fall * 0.5;
                sz = (2.6 + 8 * up * up) * fl[j + 4];
                if (pass < 0) (x += 3 + 9 * up), (y += 5 + 14 * up);
              } else {
                const melt = (uf - 1) * fall / rest;
                const onWater = x > PX0 && x < PX1 && y > PY0 && y < PY1 && ice < 0.5;
                sz = 2.4 * fl[j + 4] * (onWater ? 1 - melt : 1 - melt * melt * melt);
              }
              if (sz < 0.3) continue;
              if (uf < 1 && streak > 0.05) {
                const rx = sz * (1 + 2.6 * streak);
                ctx.moveTo(x + rx * ca, y + rx * sn);
                ctx.ellipse(x, y, rx, sz, sa, 0, TAU);
                continue;
              }
              if (sz < 2) {
                ctx.rect(x - sz, y - sz, sz * 2, sz * 2); // too small to tell from a disc, and cheaper
                continue;
              }
              ctx.moveTo(x + sz, y);
              ctx.arc(x, y, sz, 0, TAU);
            }
            ctx.fill();
          }
        }
        if (nSp) {
          ctx.lineWidth = 1.6;
          for (let pass = 0; pass < 2; pass++) {
            ctx.strokeStyle = pass ? shown.splashLight : shown.splashDark;
            ctx.beginPath();
            for (let i = 0; i < nSp; i++) {
              const j = i * 4;
              if (pass === 0) {
                sp[j + 2] += dt * sp[j + 3] * 1.4;
                if (sp[j + 2] >= 1) {
                  sp[j + 2] -= 1;
                  copingSpot(i);
                }
              }
              const u = sp[j + 2];
              if (u > 0.5) continue;
              const rad = 2 + u * 22;
              const x = sp[j], y = sp[j + 1] + pass * 1.5;
              ctx.moveTo(x + rad, y);
              ctx.arc(x, y, rad, 0, TAU);
            }
            ctx.globalAlpha = 1;
            ctx.stroke();
          }
        }

        // ----- lettering -----
        const t = s.text;
        const hasFact = t.factValue !== "";
        if (shown.hasFact !== hasFact) {
          shown.hasFact = hasFact;
          wrap.classList.toggle("nofact", !hasFact);
        }
        let topDirty = put("wk", wkday, t.weekday);
        topDirty = put("md", mday, t.monthDay) || topDirty;
        if (shown.temp !== t.temp) {
          shown.temp = t.temp;
          temp.replaceChildren(...[...t.temp].map((ch) => el("span", { class: ch === "°" ? "deg" : "", text: ch })));
          topDirty = true;
        }
        topDirty = put("cond", cond, t.condition) || topDirty;
        if (topDirty) {
          // the date takes what the temperature block leaves, with a clear gap
          // (never below the README's 44 px: every real string fits well above it)
          cond.style.fontSize = "";
          if (fitText(cond, 560) < 44) cond.style.fontSize = "44px";
          const room = W - 128 - 56 - tb.offsetWidth;
          wkday.style.fontSize = mday.style.fontSize = "";
          if (fitText(wkday, room) < 46) wkday.style.fontSize = "46px";
          if (fitText(mday, room) < 46) mday.style.fontSize = "46px";
        }
        put("sunL", sunIt.lb, t.sunLabel);
        put("sunV", sunIt.vl, t.sunValue);
        if (put("moon", moonIt.vl, t.moon) || shown.moonFact !== hasFact) {
          shown.moonFact = hasFact;
          moonIt.vl.style.fontSize = "";
          if (fitText(moonIt.vl, moonIt.node.offsetWidth || 380) < 40) moonIt.vl.style.fontSize = "40px";
        }
        put("aqi", aqiIt.vl, t.aqi);
        put("uv", uvIt.vl, t.uv);
        if (hasFact) {
          put("factL", factLb, t.factLabel);
          if (put("factV", factVl, t.factValue)) {
            // two lines at most: step the size down for a long one
            let size = 38;
            factVl.style.fontSize = "38px";
            while (factVl.scrollHeight > 90 && size > 36) factVl.style.fontSize = `${--size}px`;
          }
        }
        first = false;
      },
    };
  },
};

// Suminagashi: floating-ink marbling.
//
// The frame is a tray of still water. The time floats on it in solid sumi ink,
// and ring upon ring of ink, each one a contour of the distance from the
// numerals, has spread outward from them: bands of black ink, of clear water,
// and of one second ink dyed with the colour the sky is right now (the west
// sky on the left of the tray, the east sky on the right; older rings keep
// the colour the sky had when they were laid down). On every minute a fresh
// drop lands, the changed numeral melts into its new shape and all the rings
// are pushed one step further out.
//
// How the conditions drive it
//   wind         stretches the rings downwind into an egg and combs them into
//                chevrons along the true wind direction (north is up); gusts
//                tug each tine of the comb.
//   rain         every drop opens a round clearing that shoves the rings aside
//                (the marbler's dispersant drop) and slowly closes. Harder
//                rain, more and bigger clearings; a thunderstorm, the biggest,
//                with a rare soft lift of the whole sheet.
//   snow         pale flecks land, bloom, rest on the surface and drift.
//   temperature  viscosity: fine, quick, restless bands in heat; broad slow
//                ones in the cold; below freezing the surface locks and
//                needle cracks shear the rings.
//   humidity/fog feather the edges of the ink, until in fog they are washes.
//   cloud        broadens and calms the bands and greys the sky ink.
//   day/night    warm paper and black ink by day; at night it inverts to
//                black water carrying thin pale films (brighter under a
//                full moon), and stays dark.
//
// The page: the time fills the tray from the top margin down; above it a
// quiet head (the date, the countdown to sunrise or sunset) and below it a
// quiet foot (temperature, condition, moon, today's fact), where the ink
// thins away like the margins of a print. The vermilion AM/PM seal is stamped
// beside the minutes, with the AQI and UV seals below it down the margin.
//
// Layers: one fragment shader (the water and the ink; the kit's shader plus a
// distance-field texture this file uploads itself, run at half resolution),
// SVG numerals laid exactly over the shader's own so their edges are sharp at
// 4K, a canvas for snow (made only when it snows), and DOM type and SVG seals.
// The distance field is worked out in small steps a frame at a time (the
// first one over the first unseen frames, the next minute's ahead of time), so
// neither mount() nor any one frame stalls.

import {
  W, H, TAU, clamp, lerp, lerpAngle, remap, smoothstep, rng,
  mix, adjust, toOklch, oklch, luminance, vec3,
  el, svg, addStyle, canvas2d, shader, mask, grain, fitText,
} from "../lib/kit.js";
import { zoned } from "../lib/time.js";

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const CELL = 5; // stage px per distance-field texel
const FC = W / CELL;
const FR = H / CELL;
const NCELL = FC * FR;
const D_OFF = 96; // distances are stored as (d + D_OFF) * D_Q in 16 bits
const D_Q = 64;
const ND = 24; // rain clearings at once
const NK = 6; // frost cracks
const NUM_FAMILY = '"Shippori Mincho B1"';
const NUM_SIZE = 590; // font size of the time
const NUM_LEFT = 88; // left edge of the numerals
const NUM_TOP = 300; // top of the hour figures
const ROW_GAP = 74; // between the hour and the minute figures
const HEAD_Y = 290; // the quiet head (date, countdown) fades out above here
const FOOT_Y = 1450; // and the quiet foot (weather, fact) below here
const SEAL_COL = 946; // centre line of the seal column down the right margin
const SEAL_W = 100, SEAL_H = 176; // the AM/PM seal
const SEAL_X = SEAL_COL - SEAL_W / 2; // its left edge
const RS = 140; // the AQI and UV seals: their figures at 54 px, captions at 28
const RS_GAP = 34;
const MORPH_S = 2.6; // seconds a changed numeral takes to melt into the next

const SUMI = "#16130f";
const BONE = "#e7e0ce";
const NIGHT_WATER = "#05070a";

// ---------------------------------------------------------------------------
// The shader: water, ink, and every disturbance as a closed-form warp of the
// place each pixel looks up in the distance field.
// ---------------------------------------------------------------------------

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
uniform highp sampler2D u_field;
#else
uniform sampler2D u_field;
#endif
uniform float u_morph;      // 0 = previous minute's numerals, 1 = this minute's
uniform float u_ndrops;
uniform vec4 u_drops[${ND}]; // x, y, radius
uniform float u_cold;       // 0 above freezing .. 1 deep cold
uniform vec4 u_crA[${NK}];  // crack: centre xy, direction xy
uniform vec4 u_crB[${NK}];  // crack: half length, slip
uniform vec4 u_wind;        // downwind xy, stretch, gust depth
uniform vec2 u_comb;        // tine spacing px, gust phase
uniform vec4 u_sw1;         // swirl: direction xy, wavenumber, phase
uniform vec4 u_sw2;
uniform vec4 u_sw3;
uniform vec4 u_swA;         // swirl amplitudes px (three), heat shimmer px
uniform float u_shim;       // shimmer phase
uniform float u_phase;      // how far the rings have travelled, px
uniform float u_pair;       // width of one ink band plus one gap, px
uniform float u_speed;      // px per minute (for the age of a ring)
uniform float u_soft;       // edge softness, px
uniform float u_feather;    // 0 crisp .. 1 fog washes
uniform float u_seed;
uniform float u_night;      // 0 ink on paper .. 1 pale film on black water
uniform float u_lift;       // storm: soft brightening
uniform float u_px;         // stage px per shader pixel
uniform vec4 u_tone;        // ink density, rim strength, film fill, film line
uniform vec3 u_paper;
uniform vec3 u_num;
uniform vec3 u_sumi;
uniform vec3 u_film;
uniform vec3 u_skyW;
uniform vec3 u_skyNW;
uniform vec3 u_skyNE;
uniform vec3 u_skyE;
uniform vec3 u_skyOld;

const vec2 FRES = vec2(${FC}.0, ${FR}.0);
const vec2 STAGE = vec2(${W}.0, ${H}.0);
const float CURVE = 1500.0;

float dec(vec4 t) {
  return mix(t.b * 1020.0 + t.a * 3.984375, t.r * 1020.0 + t.g * 3.984375, u_morph) - ${D_OFF}.0;
}
// One filtered tap: fine for masks.
float fieldFast(vec2 p) {
  return dec(texture2D(u_field, p / STAGE));
}
// Exact bilinear from four unfiltered taps: the distance is 16 bits across two
// channels, which a GPU's own filtering may not keep.
float fieldAt(vec2 p) {
  vec2 pc = clamp(p, vec2(${(CELL * 0.5).toFixed(1)}), STAGE - ${(CELL * 0.5).toFixed(1)});
  float ext = length(p - pc);
  vec2 q = pc / ${CELL}.0 - 0.5;
  vec2 i = floor(q);
  vec2 f = q - i;
  vec2 uv = (i + 0.5) / FRES;
  vec2 e = 1.0 / FRES;
  float a = dec(texture2D(u_field, uv));
  float b = dec(texture2D(u_field, uv + vec2(e.x, 0.0)));
  float c = dec(texture2D(u_field, uv + vec2(0.0, e.y)));
  float d = dec(texture2D(u_field, uv + e));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y) + ext;
}
float hsh(float n) {
  return fract(sin(n * 127.1 + u_seed) * 43758.5453);
}

void main() {
  vec2 p = v_pos;
  float d0 = fieldFast(p);
  float near = smoothstep(2.0, 64.0, d0);   // the numerals themselves never move
  float far = smoothstep(16.0, 400.0, d0);  // the swirl grows with distance from them

  // Rain: each drop is the marbler's ink-drop operator run backwards. Newest first.
  float hole = 0.0;
  float rimv = 0.0;
  for (int i = 0; i < ${ND}; i++) {
    if (float(i) >= u_ndrops) break;
    vec4 D = u_drops[i];
    vec2 r = p - D.xy;
    float r2 = dot(r, r) + 0.001;
    float rr = sqrt(r2);
    float on = step(0.5, D.z);
    hole = max(hole, (1.0 - smoothstep(D.z - u_px, D.z + u_px, rr)) * on);
    rimv = max(rimv, exp(-abs(rr - D.z - 1.5) / (1.2 + u_px)) * on);
    p = D.xy + r * sqrt(max(0.0, 1.0 - D.z * D.z / r2));
  }
  p = mix(v_pos, p, near);

  // Wind: a stretch downwind that grows with distance, drawn out along tine lines.
  vec2 wd = u_wind.xy;
  float q = dot(p, vec2(-wd.y, wd.x));
  float qq = q / u_comb.x + 0.6 * sin(q * 0.0043 + u_seed);
  float tine = exp(-abs(fract(qq) - 0.5) * 7.0);
  float gust = 1.0 + u_wind.w * sin(u_comb.y + qq * 1.3);
  p -= wd * (u_wind.z * (0.42 + 1.05 * tine * gust) * max(d0, 0.0) * near);

  // The slow swirl of the water: three shears, one after the other.
  p += u_sw1.xy * (u_swA.x * far * sin(dot(p, vec2(-u_sw1.y, u_sw1.x)) * u_sw1.z + u_sw1.w));
  p += u_sw2.xy * (u_swA.y * far * sin(dot(p, vec2(-u_sw2.y, u_sw2.x)) * u_sw2.z + u_sw2.w));
  p += u_sw3.xy * (u_swA.z * far * sin(dot(p, vec2(-u_sw3.y, u_sw3.x)) * u_sw3.z + u_sw3.w));
  p.x += u_swA.w * near * sin(p.y * 0.061 + u_shim);

  // Frost: needle cracks, the surface slipped a little along each.
  float crack = 0.0;
  if (u_cold > 0.002) {
    for (int i = 0; i < ${NK}; i++) {
      vec4 A = u_crA[i];
      vec4 B = u_crB[i];
      vec2 rel = p - A.xy;
      float al = dot(rel, A.zw);
      float ac = dot(rel, vec2(-A.w, A.z));
      float env = exp(-(al * al) / (B.x * B.x));
      p += A.zw * (B.y * u_cold * env * near * (ac / (abs(ac) + 1.5)) * exp(-abs(ac) / 130.0));
      crack = max(crack, smoothstep(0.1, 0.45, env) * (1.0 - smoothstep(0.4 * u_px, 1.4 * u_px, abs(ac))));
    }
  }

  float dRaw = fieldAt(p);
  // A lookup the swirl has carried into a figure reads as ink pressed against
  // it, never as the figure itself: the figures stay where they are.
  float d = abs(dRaw);

  // Bands. One unit of the band coordinate is an ink band and its gap.
  float dd = max(d, 0.0);
  float squeeze = 1.0 + 2.0 * dd / CURVE;      // rings thin as they spread
  float a = (u_phase - dd * (1.0 + dd / CURVE)) / u_pair;
  float wa = a + 0.31 * sin(a * 1.9 + 1.3) + 0.2 * sin(a * 0.83 + 4.0);
  float dw = 1.0 + 0.589 * cos(a * 1.9 + 1.3) + 0.166 * cos(a * 0.83 + 4.0);
  float id = floor(wa);
  float f = wa - id;
  float h = hsh(id);
  float k = hsh(id + 37.7);
  float k2 = hsh(id + 91.1);
  float pairPx = u_pair / (dw * squeeze);
  float w = mix(0.14, 0.72, k * k);                  // share of the pair that is ink
  float c0 = 0.13 + (0.74 - w) * k2;
  float c1 = c0 + w;
  float e = min(u_soft / pairPx, 0.12);
  float cov = smoothstep(c0 - e, c0 + e, f) * (1.0 - smoothstep(c1 - e, c1 + e, f));
  float wash = sin(3.14159 * f);
  cov = mix(cov, wash * wash * (0.5 + 0.7 * w), u_feather);
  float de = min(f - c0, c1 - f) * pairPx;           // px inside the band's edge
  // a hairline of clear water down some of the broad bands
  float gapAt = c0 + w * mix(0.3, 0.7, h);
  float hair = step(0.62, k2) * step(13.0, w * pairPx) * (1.0 - u_feather);
  cov *= 1.0 - hair * (1.0 - smoothstep(0.5 * u_px, 1.3 * u_px + 0.6, abs(f - gapAt) * pairPx));
  float isSky = step(0.6, h);
  float dens = mix(mix(0.36, 0.96, hsh(id + 13.1)), 0.9, isSky);

  float age = dd * (1.0 + dd / CURVE) / max(u_speed, 1.0);
  float x = v_pos.x / ${W}.0;
  vec3 sky = x < 0.333 ? mix(u_skyW, u_skyNW, x * 3.0) : x < 0.667 ? mix(u_skyNW, u_skyNE, x * 3.0 - 1.0) : mix(u_skyNE, u_skyE, x * 3.0 - 2.0);
  sky = mix(sky, u_skyOld, clamp(age / 30.0, 0.0, 1.0) * 0.85);

  // Where the ink is allowed to be.
  float quiet = 1.0 - 0.88 * max(1.0 - smoothstep(${HEAD_Y - 84}.0, ${HEAD_Y}.0, v_pos.y), smoothstep(${FOOT_Y}.0, ${FOOT_Y + 150}.0, v_pos.y));
  float fade = mix(1.0, 0.62, smoothstep(180.0, 640.0, dd)) * quiet * smoothstep(7.0, 13.0, d) * (1.0 - hole);
  cov *= fade;

  vec2 c = v_uv - 0.5;
  vec3 paper = u_paper * (1.0 - 0.3 * dot(c, c)) + u_lift;
  // clear water in a rain hole: a touch brighter than paper by day, deeper by night
  paper *= 1.0 + hole * near * quiet * mix(0.035, -0.45, u_night);
  float rim = exp(-abs(de) / 2.6) * (1.0 - u_feather);
  // by day: ink on paper, darker at its edges
  vec3 dayCol = mix(paper, mix(u_sumi, sky, isSky), clamp(cov * dens * u_tone.x * (1.0 + u_tone.y * rim), 0.0, 1.0));
  // by night: a dim film with a thin bright edge
  float line = exp(-abs(de) / (0.9 + 0.5 * u_px)) * (1.0 - 0.8 * u_feather);
  vec3 nightCol = paper + mix(u_film, sky, isSky) * (cov * (dens * u_tone.z + u_tone.w * line));
  vec3 col = mix(dayCol, nightCol, u_night);

  col = mix(col, mix(vec3(1.0), u_film, u_night), crack * u_cold * 0.5 * quiet * near);
  // the meniscus round each rain hole, where the pushed ink piles up
  col = mix(col, mix(u_sumi, u_film, u_night), rimv * near * quiet * mix(0.55, 0.42, u_night));
  float fig = (1.0 - smoothstep(-0.5 - 0.8 * u_px, -0.5 + 0.8 * u_px, dRaw)) * (1.0 - smoothstep(3.0, 8.0, d0));
  col = mix(col, u_num, fig);

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 160.0;
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------------------
// The distance field of the numerals (after Felzenszwalb, with the sub-pixel
// start that Mapbox's tiny-sdf uses), smoothed further out so far rings are
// round, as surface tension would have them.
// ---------------------------------------------------------------------------

const INF = 1e20;
const gridOut = new Float32Array(NCELL);
const gridIn = new Float32Array(NCELL);
const edtF = new Float64Array(FR + 1);
const edtZ = new Float64Array(FR + 2);
const edtV = new Uint16Array(FR + 1);
const dist = new Float32Array(NCELL);
const blurA = new Float32Array(NCELL);
const blurB = new Float32Array(NCELL);

function edt1d(grid, offset, stride, n) {
  const f = edtF, v = edtV, z = edtZ;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  f[0] = grid[offset];
  for (let q = 1, k = 0, s = 0; q < n; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    do {
      const r = v[k];
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    const qr = q - r;
    grid[offset + q * stride] = f[r] + qr * qr;
  }
}
function blurH(src, dst, r, y0, y1) {
  const n = 2 * r + 1;
  for (let y = y0; y < y1; y++) {
    const o = y * FC;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[o + (x < 0 ? 0 : x)];
    for (let x = 0; x < FC; x++) {
      dst[o + x] = sum / n;
      const a = x - r, b = x + r + 1;
      sum += src[o + (b >= FC ? FC - 1 : b)] - src[o + (a < 0 ? 0 : a)];
    }
  }
}
function blurV(src, dst, r, x0, x1) {
  const n = 2 * r + 1;
  for (let x = x0; x < x1; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += src[x + (y < 0 ? 0 : y) * FC];
    for (let y = 0; y < FR; y++) {
      dst[x + y * FC] = sum / n;
      const a = y - r, b = y + r + 1;
      sum += src[x + (b >= FR ? FR - 1 : b) * FC] - src[x + (a < 0 ? 0 : a) * FC];
    }
  }
}

// The work for one set of numerals, cut into some forty small steps (each
// about a millisecond) so that it can be spread over as many frames. The plan
// is the same every time: [kind, from, to].
const PLAN = [];
{
  const split = (kind, n, parts) => {
    for (let k = 0; k < parts; k++) PLAN.push([kind, Math.floor((n * k) / parts), Math.floor((n * (k + 1)) / parts)]);
  };
  // (balanced so that no step touches much more than about 14,000 cells)
  PLAN.push([0, 0, 0]); //       the figures, drawn into a coverage mask
  split(1, FR, 3); //            mask -> the two grids (rows)
  split(2, FC, 6); //            outside distance, down the columns
  split(3, FR, 8); //            and along the rows
  split(4, 2, 2); //             inside distance (within the figures' box): columns
  split(5, 2, 2); //             and rows (from/to count halves of the box)
  split(6, NCELL, 2); //         signed distance
  for (let pass = 0; pass < 2; pass++) {
    split(7, FR, 3); //          box blur, rows
    split(8, FC, 3); //          and columns (twice: nearly a gaussian)
  }
  split(9, NCELL, 3); //         blend and quantize into the target
}
function fieldJob(glyphs, target) {
  let stage = 0;
  let m = null;
  let pass = 0;
  let bx0 = FC, bx1 = 0, by0 = FR, by1 = 0;
  return {
    step() {
      const [kind, from, to] = PLAN[stage];
      if (kind === 0) {
        m = mask(FC, FR, (ctx) => {
          ctx.scale(1 / CELL, 1 / CELL);
          ctx.font = `800 ${NUM_SIZE}px ${NUM_FAMILY}`;
          ctx.textBaseline = "alphabetic";
          for (const g of glyphs) ctx.fillText(g.ch, g.x, g.y);
        }).data;
      } else if (kind === 1) {
        for (let y = from, i = from * FC; y < to; y++) {
          for (let x = 0; x < FC; x++, i++) {
            const a = m[i];
            if (a === 0) {
              gridOut[i] = INF;
              gridIn[i] = 0;
            } else {
              if (x < bx0) bx0 = x;
              if (x > bx1) bx1 = x;
              if (y < by0) by0 = y;
              if (y > by1) by1 = y;
              if (a === 255) {
                gridOut[i] = 0;
                gridIn[i] = INF;
              } else {
                const dd = 0.5 - a / 255;
                gridOut[i] = dd > 0 ? dd * dd : 0;
                gridIn[i] = dd < 0 ? dd * dd : 0;
              }
            }
          }
        }
        if (to === FR) {
          if (bx1 < bx0) { bx0 = 0; bx1 = 1; by0 = 0; by1 = 1; }
          bx0 = Math.max(0, bx0 - 1); by0 = Math.max(0, by0 - 1);
          bx1 = Math.min(FC - 1, bx1 + 1); by1 = Math.min(FR - 1, by1 + 1);
          m = null;
        }
      } else if (kind === 2) {
        for (let x = from; x < to; x++) edt1d(gridOut, x, FC, FR);
      } else if (kind === 3) {
        for (let y = from; y < to; y++) edt1d(gridOut, y * FC, 1, FC);
      } else if (kind === 4) {
        const bh = by1 - by0 + 1;
        const xm = bx0 + ((bx1 - bx0 + 1) >> 1);
        const xa = from === 0 ? bx0 : xm, xb = from === 0 ? xm : bx1 + 1;
        for (let x = xa; x < xb; x++) edt1d(gridIn, by0 * FC + x, FC, bh);
      } else if (kind === 5) {
        const bw = bx1 - bx0 + 1;
        const ym = by0 + ((by1 - by0 + 1) >> 1);
        const ya = from === 0 ? by0 : ym, yb = from === 0 ? ym : by1 + 1;
        for (let y = ya; y < yb; y++) edt1d(gridIn, y * FC + bx0, 1, bw);
      } else if (kind === 6) {
        for (let i = from; i < to; i++) dist[i] = (Math.sqrt(gridOut[i]) - Math.sqrt(gridIn[i])) * CELL;
      } else if (kind === 7) {
        blurH(pass === 0 ? dist : blurB, blurA, 5, from, to);
      } else if (kind === 8) {
        blurV(blurA, blurB, 5, from, to);
        if (to === FC) pass++;
      } else {
        // near the figures the exact distance; further out the blurred one,
        // so the far rings round off as surface tension would have them
        for (let i = from; i < to; i++) {
          const d = dist[i];
          let k = (d - 14) / 170;
          k = k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k);
          const v = Math.round((d + (blurB[i] - d) * k + D_OFF) * D_Q);
          target[i] = v < 0 ? 0 : v > 65535 ? 65535 : v;
        }
      }
      return ++stage >= PLAN.length;
    },
  };
}

// ---------------------------------------------------------------------------
// Seals: a slightly uneven stamped block with pale figures cut out of it.
// ---------------------------------------------------------------------------

let sealCount = 0;
function makeSeal(w, h, round, r) {
  const id = `sm-seal-${++sealCount}`;
  const pts = [];
  const jit = () => r.range(-0.9, 0.9);
  if (round) {
    const n = 44;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const rad = w / 2 - 1.5 + jit() + 0.9 * Math.sin(a * 3 + r() * 6);
      pts.push([w / 2 + Math.cos(a) * rad, h / 2 + Math.sin(a) * rad]);
    }
  } else {
    const c = 7, step = 9;
    const edge = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(2, Math.round(len / step));
      for (let i = 0; i < n; i++) pts.push([lerp(x0, x1, i / n) + jit(), lerp(y0, y1, i / n) + jit()]);
    };
    edge(c, 1.5, w - c, 1.5);
    edge(w - 1.5, c, w - 1.5, h - c);
    edge(w - c, h - 1.5, c, h - 1.5);
    edge(1.5, h - c, 1.5, c);
  }
  // a closed, rounded path through the midpoints
  let d = "";
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    d += i === 0 ? `M${mx.toFixed(1)} ${my.toFixed(1)}` : `Q${a[0].toFixed(1)} ${a[1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  d += `Q${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)} ${((pts[0][0] + pts[1][0]) / 2).toFixed(1)} ${((pts[0][1] + pts[1][1]) / 2).toFixed(1)}Z`;
  const specks = [];
  for (let i = 0; i < (round ? 7 : 12); i++) {
    specks.push(svg("circle", { cx: r.range(4, w - 4).toFixed(1), cy: r.range(4, h - 4).toFixed(1), r: r.range(0.6, 1.7).toFixed(1), fill: "#000" }));
  }
  for (let i = 0; i < 3; i++) {
    const a = r() * TAU;
    specks.push(svg("circle", { cx: (w / 2 + Math.cos(a) * w * 0.52).toFixed(1), cy: (h / 2 + Math.sin(a) * h * 0.52).toFixed(1), r: r.range(2.5, 4.5).toFixed(1), fill: "#000" }));
  }
  const node = svg(
    "svg",
    { class: "seal", viewBox: `0 0 ${w} ${h}`, width: w, height: h },
    svg("mask", { id }, svg("rect", { width: w, height: h, fill: "#fff" }), specks),
    svg("path", { d, fill: "var(--seal)", mask: `url(#${id})` }),
  );
  return node;
}

// ---------------------------------------------------------------------------

export default {
  title: "Suminagashi",
  description: "The time floats in sumi ink on a tray of water; its rings are combed by the wind, holed by the rain and dyed by the sky.",
  fonts: ["Shippori Mincho B1:wght@800", "Cormorant Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600"],
  fps: 24, // slow water: 24 frames are plenty, and spare the Pi's GPU a fifth of the shader work

  mount(root, { state, seed }) {
    addStyle(root, `
      .sm { position: absolute; inset: 0; overflow: hidden; background: var(--paper); color: var(--ink);
        font-family: "Cormorant Garamond", "Shippori Mincho B1", serif; font-weight: 600; font-kerning: normal; }
      .sm .layer { position: absolute; left: 0; top: 0; }
      .sm .num { font-family: ${NUM_FAMILY}, serif; font-weight: 800; font-size: ${NUM_SIZE}px; fill: var(--num); }
      .sm .seal text { font-family: ${NUM_FAMILY}, serif; font-weight: 800; fill: var(--sealtext); text-anchor: middle; }
      .sm .head { position: absolute; left: 94px; right: 64px; top: 72px; white-space: nowrap; line-height: 1; }
      .sm .date { font-size: 64px; font-weight: 600; letter-spacing: 0.004em; }
      .sm .sun { display: flex; align-items: center; margin-top: 26px; font-size: 48px; letter-spacing: 0.01em; }
      .sm .sun i { font-weight: 500; margin-right: 0.24em; }
      .sm .dot { flex: none; width: 11px; height: 11px; border-radius: 50%; background: var(--seal); margin: 4px 20px 0 2px; }
      .sm .ampm { position: absolute; }
      .sm .foot { position: absolute; left: ${NUM_LEFT + 6}px; right: 64px; bottom: 70px; }
      .sm .wx { display: flex; align-items: flex-end; }
      .sm .temp { font-family: ${NUM_FAMILY}, serif; font-weight: 800; font-size: 176px; line-height: 0.74; letter-spacing: -0.03em;
        margin-right: 46px; white-space: nowrap; }
      .sm .temp.none .tn { display: inline-block; margin-right: 0.04em; transform: translateY(-0.15em) scaleY(1.45); }
      .sm .lines { padding-bottom: 1px; min-width: 0; }
      .sm .cond { font-style: italic; font-size: 62px; line-height: 1; white-space: nowrap; margin-bottom: 32px; }
      .sm .moon { font-weight: 500; font-size: 48px; line-height: 0.86; white-space: nowrap; letter-spacing: 0.01em; }
      .sm .seals { position: absolute; display: flex; flex-direction: column; gap: ${RS_GAP}px; }
      .sm .seal .cap { font-family: "Cormorant Garamond", serif; font-weight: 700; letter-spacing: 0.14em; }
      .sm .fact { margin-top: 56px; }
      .sm .flabel { font-weight: 700; font-size: 28px; line-height: 1; letter-spacing: 0.16em; text-transform: uppercase; }
      .sm .fvalue { font-style: italic; font-weight: 500; font-size: 50px; line-height: 1.2; margin-top: 14px; text-wrap: balance; }
    `);

    const r = rng(seed);
    const wrap = el("div", { class: "sm" });
    root.append(wrap);

    // ----- layers -----
    const ink = shader(wrap, { frag: FRAG, maxScale: 0.5 });
    const gl = ink.ok ? ink.canvas.getContext("webgl") || ink.canvas.getContext("experimental-webgl") : null;
    const numLayer = svg("svg", { class: "layer", viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    const numNodes = [0, 1, 2, 3].map(() => svg("text", { class: "num" }));
    numLayer.append(...numNodes);
    wrap.append(numLayer);
    // the snow layer is made only when snow first falls (a full-stage canvas is not free)
    let snow = null;

    // ----- type -----
    const dateNode = el("span", { class: "date" });
    const sunLabel = el("i");
    const sunValue = el("span");
    const head = el("div", { class: "head" }, el("div", { class: "date" }, dateNode), el("div", { class: "sun" }, el("span", { class: "dot" }), sunLabel, sunValue));

    const ampmSeal = makeSeal(SEAL_W, SEAL_H, false, r);
    const amA = svg("text", { x: SEAL_W / 2, y: 78, "font-size": 68 });
    const amM = svg("text", { x: SEAL_W / 2, y: 148, "font-size": 68, text: "M" });
    ampmSeal.append(amA, amM);
    ampmSeal.classList.add("ampm");

    const tNum = el("span", { class: "tn" });
    const tDeg = el("span");
    const tempNode = el("div", { class: "temp" }, tNum, tDeg);
    const condNode = el("div", { class: "cond" });
    const moonNode = el("div", { class: "moon" });
    // AQI and UV: round seals stamped down the margin under the AM/PM seal,
    // each carved with its figure and a small caption
    const roundSeal = (caption) => {
      const s = makeSeal(RS, RS, true, r);
      const t = svg("text", { x: RS / 2, y: 76, "font-size": 54 });
      s.append(t, svg("text", { class: "cap", x: RS / 2 + 2, y: 109, "font-size": 28, text: caption }));
      return { box: s, text: t };
    };
    const aqi = roundSeal("AQI");
    const uv = roundSeal("UV");
    const sealsNode = el("div", { class: "seals" }, aqi.box, uv.box);
    const wxRow = el("div", { class: "wx" }, tempNode, el("div", { class: "lines" }, condNode, moonNode));
    const fLabel = el("div", { class: "flabel" });
    const fValue = el("div", { class: "fvalue" });
    const factNode = el("div", { class: "fact" }, fLabel, fValue);
    const foot = el("div", { class: "foot" }, wxRow, factNode);
    wrap.append(head, ampmSeal, sealsNode, foot);
    grain(wrap, { opacity: 0.07 });
    // ----- the numerals: where each figure sits -----
    const mctx = document.createElement("canvas").getContext("2d");
    mctx.font = `800 ${NUM_SIZE}px ${NUM_FAMILY}`;
    const adv = {};
    let figH = NUM_SIZE * 0.72;
    for (let i = 0; i < 10; i++) {
      const m = mctx.measureText(String(i));
      adv[i] = m.width;
      if (i === 0 && m.actualBoundingBoxAscent > 0) figH = m.actualBoundingBoxAscent;
    }
    const lsb = mctx.measureText("0").actualBoundingBoxLeft || 0;
    const track = -NUM_SIZE * 0.012;
    const baseH = NUM_TOP + figH;
    const baseM = baseH + ROW_GAP + figH;
    function layout(hh, mm) {
      const out = [];
      const row = (str, y) => {
        let x = NUM_LEFT + lsb;
        for (const ch of str) {
          out.push({ ch, x, y });
          x += adv[ch] + track;
        }
      };
      row(hh, baseH);
      row(mm, baseM);
      return out;
    }
    ampmSeal.style.left = `${SEAL_X}px`;
    ampmSeal.style.top = `${Math.round(baseM - SEAL_H + 4)}px`;
    sealsNode.style.left = `${SEAL_COL - RS / 2}px`;
    sealsNode.style.top = `${Math.round(baseM + 4 + 52)}px`;

    // ----- the field, three buffers taking turns: this minute, the last, the next -----
    let bufCur = new Uint16Array(NCELL);
    let bufOld = new Uint16Array(NCELL);
    let bufNext = new Uint16Array(NCELL);
    const bytes = new Uint8Array(NCELL * 4);
    let tex = null;
    function upload() {
      for (let i = 0, j = 0; i < NCELL; i++, j += 4) {
        const a = bufCur[i], b = bufOld[i];
        bytes[j] = a >> 8;
        bytes[j + 1] = a & 255;
        bytes[j + 2] = b >> 8;
        bytes[j + 3] = b & 255;
      }
      if (!gl || !ink.ok) return;
      if (!tex) {
        tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, FC, FR, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    }
    let texLost = false;
    ink.canvas.addEventListener("webglcontextrestored", () => {
      tex = null;
      texLost = true;
    });
    const fieldPx = (x, y) => {
      const cx = clamp(Math.floor(x / CELL), 0, FC - 1);
      const cy = clamp(Math.floor(y / CELL), 0, FR - 1);
      return bufCur[cy * FC + cx] / D_Q - D_OFF;
    };

    let shownKey = "";
    let morphStart = -1e9;
    let nextKey = "";
    let nextJob = null;
    let nextDone = false;
    const numShown = ["", "", "", ""];
    const numFresh = [false, false, false, false];
    const numOpacity = [1, 1, 1, 1];
    function setGlyphs(list, prev) {
      for (let i = 0; i < 4; i++) {
        const g = list[i];
        const node = numNodes[i];
        const sig = g ? `${g.ch}@${g.x.toFixed(1)},${g.y.toFixed(1)}` : "";
        numFresh[i] = Boolean(prev) && sig !== numShown[i];
        if (sig !== numShown[i]) {
          numShown[i] = sig;
          node.textContent = g ? g.ch : "";
          if (g) {
            node.setAttribute("x", g.x.toFixed(2));
            node.setAttribute("y", g.y.toFixed(2));
          }
        }
      }
    }
    function showTime(hh, mm, snap, t, ready = false) {
      const key = `${hh}:${mm}`;
      const list = layout(hh, mm);
      if (!ready && (snap || !nextDone || nextKey !== key)) {
        // finish the job already under way for this minute, or do it all now
        const job = !snap && nextJob && !nextDone && nextKey === key ? nextJob : fieldJob(list, bufNext);
        while (!job.step());
      }
      const spare = bufOld; // next becomes current, current becomes previous
      bufOld = bufCur;
      bufCur = bufNext;
      bufNext = spare;
      if (snap) bufOld.set(bufCur);
      setGlyphs(list, !snap);
      shownKey = key;
      morphStart = snap ? -1e9 : t;
      nextJob = null;
      nextDone = false;
      nextKey = "";
      upload();
    }

    // ----- rain clearings -----
    const dropX = new Float32Array(ND), dropY = new Float32Array(ND), dropT = new Float32Array(ND);
    const dropR = new Float32Array(ND), dropL = new Float32Array(ND);
    const dropU = [];
    for (let i = 0; i < ND; i++) {
      dropT[i] = -1e9;
      dropU.push([0, 0, 0, 0]);
      ink.set(`u_drops[${i}]`, dropU[i]);
    }
    let dropHead = 0;
    let rainClock = 0;
    function rainStep(wx, t, dt) {
      const fall = wx.falling;
      if (!fall || fall === "snow") return;
      const I = wx.intensity;
      const storm = fall === "storm";
      const rate = fall === "drizzle" ? 0.7 + 1.2 * I : storm ? 1.3 + 1.2 * I : 0.9 + 1.8 * I;
      rainClock += rate * dt;
      while (rainClock >= 1) {
        rainClock -= 1;
        const big = fall === "drizzle" ? r.range(16, 34) : storm ? r.range(60, 120 + 50 * I) : r.range(34, 64 + 40 * I);
        let x = 0, y = 0;
        for (let tries = 0; tries < 14; tries++) {
          x = r.range(-10, W + 10);
          y = r.range(HEAD_Y - 60, FOOT_Y + 60);
          const d = fieldPx(x, y);
          if (d > 24 + big * 0.6 && d < 700) break;
        }
        dropHead = (dropHead + ND - 1) % ND; // newest sits first in the ring
        dropX[dropHead] = x;
        dropY[dropHead] = y;
        dropT[dropHead] = t;
        dropR[dropHead] = big;
        dropL[dropHead] = r.range(6.5, 9.5);
      }
    }
    function rainUniforms(t) {
      let n = 0;
      for (let j = 0; j < ND; j++) {
        const i = (dropHead + j) % ND;
        const age = t - dropT[i];
        if (age < 0 || age >= dropL[i]) continue;
        const open = 1 - Math.exp(-age / 0.32);
        const k = clamp((age / dropL[i] - 0.4) / 0.6);
        const shut = 1 - k * k * (3 - 2 * k);
        const u = dropU[n++];
        u[0] = dropX[i];
        u[1] = dropY[i];
        u[2] = dropR[i] * open * shut;
      }
      ink.set("u_ndrops", n);
    }

    // ----- snow flecks -----
    const NS = 680;
    const fx = new Float32Array(NS), fy = new Float32Array(NS), fr = new Float32Array(NS);
    const fb = new Float32Array(NS), fl = new Float32Array(NS);
    const placeFleck = (i, t) => {
      for (let tries = 0; tries < 6; tries++) {
        fx[i] = r.range(-10, W + 10);
        fy[i] = r.range(-10, H + 10);
        if (fy[i] > HEAD_Y - 40 && fy[i] < FOOT_Y + 90) break;
        if (tries > 3 && r() < 0.5) break; // a few rest among the type as well
      }
      const u = r();
      fr[i] = 1.6 + 5.2 * u * u * u + 1.4 * u;
      fb[i] = t;
      fl[i] = r.range(22, 60);
    };
    for (let i = 0; i < NS; i++) {
      placeFleck(i, 0);
      fb[i] = -r() * fl[i];
    }
    let snowDrawn = false;
    const makeSnow = () => {
      snow = canvas2d(wrap, { maxScale: 1, adaptive: true });
      wrap.insertBefore(snow.canvas, head);
    };
    if (state.weather.falling === "snow") makeSnow(); // made here when it is already snowing, not in a frame

    // ----- frost cracks, the water's swirl, the wind's comb -----
    const crA = [], crB = [];
    for (let i = 0; i < NK; i++) {
      crA.push([0, 0, 1, 0]);
      crB.push([100, 0, 0, 0]);
      ink.set(`u_crA[${i}]`, crA[i]);
      ink.set(`u_crB[${i}]`, crB[i]);
    }
    function placeCracks() {
      for (let i = 0; i < NK; i++) {
        let x = 0, y = 0;
        for (let tries = 0; tries < 20; tries++) {
          x = r.range(30, W - 30);
          y = r.range(HEAD_Y, FOOT_Y);
          const d = fieldPx(x, y);
          if (d > 70 && d < 380) break;
        }
        const a = r.range(0, TAU);
        crA[i][0] = x;
        crA[i][1] = y;
        crA[i][2] = Math.cos(a);
        crA[i][3] = Math.sin(a);
        crB[i][0] = r.range(120, 300);
        crB[i][1] = r.range(9, 20) * r.sign();
      }
    }
    const swirl = [0, 1, 2].map((i) => {
      const a = r.range(0, TAU);
      return [Math.cos(a), Math.sin(a), TAU / [980, 560, 330][i] * r.range(0.85, 1.15), r.range(0, TAU)];
    });
    const swirlRate = [r.range(0.8, 1.2) * r.sign(), r.range(0.8, 1.2) * r.sign(), r.range(0.8, 1.2) * r.sign()];
    const swirlAmp = [0, 0, 0, 0];
    const windU = [1, 0, 0, 0];
    const combU = [150, 0];
    const toneU = [1, 0.4, 0.16, 0.6];
    ink.set("u_sw1", swirl[0]);
    ink.set("u_sw2", swirl[1]);
    ink.set("u_sw3", swirl[2]);
    ink.set("u_swA", swirlAmp);
    ink.set("u_wind", windU);
    ink.set("u_comb", combU);
    ink.set("u_tone", toneU);
    ink.set("u_seed", r.range(0, 60));
    let shimmer = 0;

    // ----- colour -----
    const pal = { night: 0, fleck: "#fff", shade: "rgba(0,0,0,0)" };
    const shown = {};
    const css = (name, value) => {
      if (shown[name] === value) return;
      shown[name] = value;
      wrap.style.setProperty(name, value);
    };
    const put = (key, node, value) => {
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };
    function skyAgo(s, minutes) {
      // the sky's mean colour that long ago, if the camera's record reaches
      const list = s.sky.day;
      if (!list || !list.length) return s.sky.mean;
      const want = s.ms - minutes * 60000;
      let best = list[list.length - 1];
      for (let i = list.length - 1; i >= 0; i--) {
        if (Math.abs(list[i].ms - want) < Math.abs(best.ms - want)) best = list[i];
        if (list[i].ms < want) break;
      }
      return mix(mix(best.west, best.east, 0.5), mix(best.northWest, best.northEast, 0.5), 0.5);
    }
    // The second ink is the sky as the camera measures it, but a grey sky does
    // not make a grey ink: what the day is like steeps into it. The season
    // gives its hue (indigo in winter, sakura plum in spring, verdigris in
    // summer, persimmon in autumn), the air pushes it (to bengara red in a heat
    // wave, to violet in deep frost), then the weather: rain turns it a grey
    // mauve, a storm a deep violet, snow an icy blue, fog thins it, cloud
    // quietens it. A coloured sky (a blue noon, a red dusk) still wins, less
    // so in a heat wave. Hues are carried round the wheel, never blended, so
    // the ink does not turn to mud.
    const SEASON_H = [262, 262, 300, 350, 338, 250, 190, 185, 150, 70, 52, 48, 290, 262];
    const SEASON_AT = [0, 0.04, 0.17, 0.3, 0.38, 0.45, 0.52, 0.62, 0.7, 0.76, 0.84, 0.9, 0.96, 1];
    const steepL = { l: 0.6, c: 0.09, h: 262, w: 1 };
    function dayInk(s) {
      const wx = s.weather;
      const y = s.clock.yearFrac;
      let k = 1;
      while (k < SEASON_AT.length - 1 && SEASON_AT[k] < y) k++;
      const f = smoothstep(0, 1, (y - SEASON_AT[k - 1]) / (SEASON_AT[k] - SEASON_AT[k - 1] || 1));
      let h = lerpAngle(SEASON_H[k - 1], SEASON_H[k], f);
      let c = 0.09;
      const heat = smoothstep(80, 97, wx.temp);
      h = lerpAngle(h, 44, heat);
      h = lerpAngle(h, 288, smoothstep(30, 6, wx.temp));
      c += 0.03 * heat;
      const fall = wx.falling;
      if (fall === "storm") { h = lerpAngle(h, 292, 0.7); c = 0.1; }
      else if (fall === "snow") { h = lerpAngle(h, 236, 0.6); c *= 0.8; }
      else if (fall) { h = lerpAngle(h, 318, fall === "drizzle" ? 0.45 : 0.65); c *= 0.75; }
      if (wx.fog) c *= 0.6;
      c *= 1 - 0.28 * (wx.cloud / 100);
      steepL.h = h;
      steepL.c = c;
      steepL.w = 1 - 0.75 * heat; // how far a coloured sky may override
    }
    const steeped = (raw) => {
      const k = toOklch(raw);
      const w = steepL.w * 0.85 * smoothstep(0.05, 0.15, k.c);
      return oklch(lerp(steepL.l, k.l, w), lerp(steepL.c, Math.max(k.c, steepL.c), w), lerpAngle(steepL.h, k.h, w));
    };

    function palette(s) {
      const wx = s.weather;
      const cloud = wx.cloud / 100;
      const mean = s.sky.mean;
      // Paper takes a breath of the sky: greyer under cloud, dimmer in rain.
      const cast = adjust(mean, { l: 0.9, c: (v) => Math.min(v, 0.045) });
      const paperDay = adjust(mix("#efe6d2", cast, 0.22 + 0.24 * cloud), { l: (v) => v - 0.045 * cloud - 0.04 * wx.intensity });
      const dusk = adjust(mean, { l: 0.74, c: (v) => Math.min(v * 1.2, 0.075) });
      const t = smoothstep(0.02, 0.9, s.daylight);
      const water = mix(NIGHT_WATER, mean, 0.1);
      const ground = mix(water, mix(dusk, paperDay, smoothstep(0.35, 0.85, t)), t);
      const lum = luminance(ground);
      const night = 1 - smoothstep(0.169, 0.185, lum); // the ink flips while the ground is mid-grey, where both inks read alike
      pal.night = night;
      const dark = night < 0.5;
      const groundL = toOklch(ground).l;
      const moonlight = s.moon.up ? s.moon.illumination : 0;

      css("--paper", ground);
      css("--ink", dark ? SUMI : "#f1ebde");
      css("--num", mix(SUMI, BONE, night));
      css("--seal", mix(mix("#7a2217", "#a82e1a", smoothstep(0.1, 0.5, t)), ground, dark ? 0 : 0.04));
      css("--sealtext", dark ? "#f6efdd" : "#e9e1cf");
      ink.set("u_paper", vec3(ground));
      ink.set("u_num", vec3(shown["--num"]));
      ink.set("u_sumi", vec3(mix("#1b1814", ground, 0.04)));
      ink.set("u_film", vec3(mix("#c9ccd0", "#e4e6ea", moonlight)));
      ink.set("u_night", night);
      dayInk(s);
      const chromaCap = 0.11 - 0.03 * cloud;
      const skyInk = (raw) => {
        const c = steeped(raw);
        return dark
          ? adjust(c, { l: (v) => clamp(v * 0.8, 0.34, Math.max(0.36, groundL - 0.26)), c: (v) => v * 1.3 + 0.018 })
          : adjust(c, { l: 0.7, c: (v) => Math.min(v * 1.5 + 0.02, chromaCap) });
      };
      ink.set("u_skyW", vec3(skyInk(s.sky.west)));
      ink.set("u_skyNW", vec3(skyInk(s.sky.northWest)));
      ink.set("u_skyNE", vec3(skyInk(s.sky.northEast)));
      ink.set("u_skyE", vec3(skyInk(s.sky.east)));
      ink.set("u_skyOld", vec3(skyInk(skyAgo(s, 30))));
      toneU[0] = 1 - 0.22 * (wx.fog ? 1 : 0);
      toneU[1] = 0.45;
      toneU[2] = 0.17 + 0.06 * moonlight + (wx.fog ? 0.12 : 0); // fog hangs a milky film over dark water
      toneU[3] = 0.62 + 0.18 * moonlight;
      pal.fleck = dark ? "#fffdf6" : "#c8d0d8";
      pal.shade = dark ? "rgba(40,44,60,0.22)" : "rgba(52,48,42,0.2)";
    }
    // ----- start: the first field is worked out a step a frame over the first
    // few (unseen) frames, so mount() stays quick; the figures show at once and
    // the water is shown as soon as its field is ready, with rain already on it
    // and the cracks placed.
    let initKey = `${state.clock.hh}:${state.clock.mm}`;
    let initJob = fieldJob(layout(state.clock.hh, state.clock.mm), bufNext);
    initJob.step(); // the mask and the grids now; the rest in the first frames
    initJob.step();
    setGlyphs(layout(state.clock.hh, state.clock.mm), false);
    ink.canvas.style.visibility = "hidden";
    function initStep(s) {
      const c = s.clock;
      const key = `${c.hh}:${c.mm}`;
      if (key !== initKey) {
        initKey = key;
        initJob = fieldJob(layout(c.hh, c.mm), bufNext);
        initJob.step();
      }
      if (!initJob.step()) return false;
      initJob = null;
      showTime(c.hh, c.mm, true, s.t, true);
      placeCracks();
      for (let t = s.t - 10; t < s.t; t += 0.1) rainStep(s.weather, t, 0.1);
      ink.canvas.style.visibility = "";
      return true;
    }
    let lastMs = state.ms;
    let mountMinute = Math.floor(state.ms / 60000);
    let swirlClock = r.range(0, 100);
    let gustClock = 0;
    let palAt = -1;
    let lastFact = null;
    let lastFactLabel = null;
    let lastHH = "", lastMM = "";

    return {
      frame(s) {
        const wx = s.weather;
        const c = s.clock;
        const t = s.t;
        const dt = s.dt;
        const fast = s.frame <= 1 || Math.abs(s.ms - lastMs) > Math.max(400, dt * 3000);
        lastMs = s.ms;

        // ----- the time -----
        if (initJob) initStep(s);
        else if (c.hh !== lastHH || c.mm !== lastMM) {
          // (the string key is built only when the minute changes, not every frame)
          lastHH = c.hh;
          lastMM = c.mm;
          if (`${c.hh}:${c.mm}` !== shownKey) showTime(c.hh, c.mm, fast, t);
        }
        else if (texLost) {
          texLost = false;
          upload();
        }
        if (!initJob && !fast && c.s >= 46 && !nextDone) {
          // work out the next minute's field a step a frame, before it is needed
          if (!nextJob) {
            const z = zoned(Math.floor(s.ms / 60000) * 60000 + 60000);
            const hh = String(z.hour % 12 || 12);
            const mm = String(z.minute).padStart(2, "0");
            nextKey = `${hh}:${mm}`;
            nextJob = fieldJob(layout(hh, mm), bufNext);
          } else if (nextJob.step()) nextDone = true;
        }
        const mt = clamp((t - morphStart) / MORPH_S);
        const morph = mt * mt * (3 - 2 * mt);
        ink.set("u_morph", morph);
        for (let i = 0; i < 4; i++) {
          const o = numFresh[i] ? smoothstep(0.4, 0.85, mt) : 1; // the new figure is legible within two seconds
          if (o !== numOpacity[i]) {
            numOpacity[i] = o;
            numNodes[i].style.opacity = o.toFixed(3);
          }
        }

        // ----- colour (slow) -----
        if (fast || s.frame - palAt >= 8) {
          palAt = s.frame;
          palette(s);
        }

        // ----- the readouts -----
        put("date", dateNode, s.text.date);
        put("sunL", sunLabel, s.text.sunLabel);
        put("sunV", sunValue, s.text.sunValue);
        put("ampm", amA, s.text.ampm.charAt(0));
        if (shown.temp !== s.text.temp) {
          // the string as given, in two spans so a missing reading's dash can sit at mid height
          const tx = s.text.temp;
          shown.temp = tx;
          const cut = tx.endsWith("°") ? tx.length - 1 : tx.length;
          tNum.textContent = tx.slice(0, cut);
          tDeg.textContent = tx.slice(cut);
          tempNode.classList.toggle("none", !/\d/.test(tx));
        }
        put("moon", moonNode, s.text.moon);
        put("aqi", aqi.text, s.text.aqi);
        put("uv", uv.text, s.text.uv);
        const relaid = put("cond", condNode, s.text.condition) | (shown.tempW !== s.text.temp);
        if (relaid) {
          shown.tempW = s.text.temp;
          fitText(condNode, SEAL_COL - RS / 2 - 44 - foot.offsetLeft - condNode.parentNode.offsetLeft, 62);
        }
        if (s.text.factValue !== lastFact || s.text.factLabel !== lastFactLabel) {
          const fact = s.text.factValue;
          lastFact = fact;
          lastFactLabel = s.text.factLabel;
          factNode.style.display = fact ? "" : "none";
          fLabel.textContent = s.text.factLabel;
          fValue.textContent = s.text.factValue;
          fValue.style.fontSize = "";
          // two lines at 50 px; only a fact that would need a third steps down
          if (fact && fValue.offsetHeight > 50 * 1.2 * 2 + 4) fValue.style.fontSize = "44px";
        }

        // ----- temperature: viscosity -----
        const temp = wx.temp;
        const cloud = wx.cloud / 100;
        const storm = wx.falling === "storm" ? 1 : 0;
        const heat = smoothstep(80, 98, temp);
        const cold = smoothstep(34, 6, temp);
        const pair = remap(temp, 8, 98, 66, 25) * (1 + 0.22 * cloud);
        const speed = remap(temp, 20, 96, 7, 64);
        const minutes = Math.floor(s.ms / 60000) - mountMinute;
        const sec = (s.ms - Math.floor(s.ms / 60000) * 60000) / 1000;
        // each minute's drop pushes the rings out briskly, then they creep
        const push = 0.5 * (1 - Math.exp(-sec / 2.3)) + 0.5 * (sec / 60);
        ink.set("u_phase", speed * (minutes + push) + 4000);
        ink.set("u_pair", pair);
        ink.set("u_speed", speed);
        ink.set("u_cold", cold);

        // the water always drifts a little; warmth and wind stir it more
        const flow = (remap(temp, 14, 96, 0.03, 0.15) + 0.0016 * wx.wind) * (1 + 0.6 * storm) * (1 - 0.3 * cloud * (1 - storm));
        swirlClock += dt * flow;
        const amp = (1 - 0.22 * cloud + 0.45 * heat + 0.7 * storm) * (1 - 0.35 * cold);
        swirlAmp[0] = 52 * amp;
        swirlAmp[1] = 30 * amp;
        swirlAmp[2] = 15 * amp;
        swirlAmp[3] = 2.6 * heat;
        for (let i = 0; i < 3; i++) swirl[i][3] = swirlClock * swirlRate[i] * (1 + i * 0.6) + i * 2.1;
        shimmer += dt * 1.3;
        ink.set("u_shim", shimmer);

        // ----- wind -----
        const th = (wx.windDir * Math.PI) / 180;
        windU[0] = -Math.sin(th);
        windU[1] = Math.cos(th);
        windU[2] = 0.66 * Math.pow(clamp(wx.wind / 42), 0.85);
        windU[3] = clamp((wx.gust - wx.wind) / 32, 0.08, 0.5);
        gustClock += dt * (0.25 + wx.gust * 0.022);
        combU[1] = gustClock;

        // ----- damp air: soft edges -----
        const damp = smoothstep(55, 98, wx.humidity);
        const px = 1 / (ink.ratio || 1);
        ink.set("u_px", px);
        ink.set("u_soft", 0.75 * px + 0.5 + 3.2 * damp * damp);
        ink.set("u_feather", wx.fog ? 0.86 : 0.1 * damp * damp + 0.12 * smoothstep(3, 0.5, wx.visibility));

        // ----- rain, and the storm's soft lift -----
        if (!initJob) rainStep(wx, t, dt);
        rainUniforms(t);
        let lift = 0;
        if (storm) {
          const slot = Math.floor(t / 19);
          const u = ((Math.sin(slot * 91.7 + seed) * 43758.5453) % 1 + 1) % 1;
          const x = t - slot * 19 - 2 - u * 9;
          if (u < 0.7 && x > 0) lift = (1 - Math.exp(-x / 0.35)) * Math.exp(-x / 1.3) * (0.05 + 0.05 * pal.night);
        }
        ink.set("u_lift", lift);

        ink.draw(t);

        // ----- snow -----
        const snowing = wx.falling === "snow" ? wx.intensity : 0;
        if (snowing > 0.01) {
          const count = Math.min(NS, Math.round(140 + 540 * snowing));
          const drift = 1.2 + wx.wind * 0.5;
          const vx = windU[0] * drift * dt, vy = windU[1] * drift * dt;
          if (!snow) makeSnow();
          const { ctx } = snow;
          for (let i = 0; i < count; i++) {
            if (t - fb[i] > fl[i]) placeFleck(i, t);
            fx[i] += vx;
            fy[i] += vy;
            if (fx[i] < -12) fx[i] += W + 24;
            else if (fx[i] > W + 12) fx[i] -= W + 24;
            if (fy[i] < -12) fy[i] += H + 24;
            else if (fy[i] > H + 12) fy[i] -= H + 24;
          }
          snow.clear();
          // by day a faint shadow under each fleck, so it reads on bare paper too
          for (let pass = 0; pass < 2; pass++) {
            ctx.fillStyle = pass === 0 ? pal.shade : pal.fleck;
            ctx.globalAlpha = pass === 0 ? 1 : pal.night > 0.5 ? 0.78 : 0.96;
            ctx.beginPath();
            for (let i = 0; i < count; i++) {
              if (pass === 0 && fr[i] < 2.4) continue; // only the bigger flecks cast a shadow
              const a = t - fb[i];
              const grow = clamp(a / 1.4);
              const melt = clamp((fl[i] - a) / 5);
              const rad = fr[i] * grow * (2 - grow) * Math.sqrt(melt) + (pass === 0 ? 1.1 : 0);
              if (rad < 0.4) continue;
              const x = fx[i] + (pass === 0 ? 0.8 : 0);
              const y = fy[i] + (pass === 0 ? 1.4 : 0);
              if (rad < 1.3) {
                ctx.rect(x - rad, y - rad, rad * 2, rad * 2); // too small to tell from a dot
              } else {
                ctx.moveTo(x + rad, y);
                ctx.arc(x, y, rad, 0, TAU);
              }
            }
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          snowDrawn = true;
        } else if (snowDrawn) {
          snow.clear();
          snowDrawn = false;
        }
      },
    };
  },
};

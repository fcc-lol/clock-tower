// The toolkit for visualizations (src/visuals/*.js): math, seeded randomness,
// noise, color, DOM/SVG building, drawing surfaces that size themselves for
// the screen, and a few finishing touches. Import what you need:
//
//   import { W, H, clamp, lerp, rng, createNoise, mix, el, canvas2d } from "../lib/kit.js";
//
// Everything is drawn on a fixed 1080 x 1920 stage. See src/visuals/README.md.

export * from "./color.js";

export const W = 1080;
export const H = 1920;
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Where v sits between a and b, as 0..1 (clamped), and the same mapped onto c..d.
export const norm = (v, a, b) => clamp((v - a) / (b - a));
export const remap = (v, a, b, c, d) => c + (d - c) * clamp((v - a) / (b - a));
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// Shortest way round from angle a to angle b (degrees), a fraction t of the way.
export const lerpAngle = (a, b, t) => (a + ((((b - a) % 360) + 540) % 360 - 180) * t + 360) % 360;
// Move `current` toward `target` at a rate independent of frame rate:
// `halfLife` is the seconds it takes to close half the gap.
export const approach = (current, target, dt, halfLife = 1) => target + (current - target) * Math.pow(0.5, dt / Math.max(1e-6, halfLife));

export const ease = {
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  expoOut: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  sine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
};

// ---------------------------------------------------------------------------
// Seeded randomness. Never use Math.random(): a piece must look the same every
// time it is given the same seed.
// ---------------------------------------------------------------------------

// const r = rng(state.seed); r() is 0..1, plus the helpers below.
export function rng(seed = 1) {
  let a = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r()); // inclusive
  r.pick = (list) => list[Math.floor(r() * list.length)];
  r.chance = (p) => r() < p;
  r.sign = () => (r() < 0.5 ? -1 : 1);
  r.gauss = () => {
    // mean 0, standard deviation 1
    let u = 0;
    while (u === 0) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * r());
  };
  r.shuffle = (list) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return r;
}

// A fixed pseudo-random number 0..1 for one or two numbers (no state).
export function hash(x, y = 0) {
  let h = Math.imul(Math.floor(x) ^ 0x27d4eb2d, 0x85ebca6b) ^ Math.imul(Math.floor(y) ^ 0x165667b1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// Simplex noise (after Stefan Gustavson's public-domain reference). Smooth
// values in about -1..1.
//   const n = createNoise(state.seed);
//   n.n2(x, y)            2D        n.n3(x, y, z)        3D (use z for time)
//   n.fbm2(x, y, octaves) layered   n.fbm3(x, y, z, octaves)
//   n.curl(x, y, z)       [vx, vy]: a swirling, divergence-free flow
// ---------------------------------------------------------------------------

const G3 = [1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1];

export function createNoise(seed = 1) {
  const r = rng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  const perm12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    perm12[i] = perm[i] % 12;
  }
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;

  function n2(x, y) {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = perm12[ii + perm[jj]] * 3;
      t0 *= t0;
      n += t0 * t0 * (G3[g] * x0 + G3[g + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = perm12[ii + i1 + perm[jj + j1]] * 3;
      t1 *= t1;
      n += t1 * t1 * (G3[g] * x1 + G3[g + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = perm12[ii + 1 + perm[jj + 1]] * 3;
      t2 *= t2;
      n += t2 * t2 * (G3[g] * x2 + G3[g + 1] * y2);
    }
    return 70 * n;
  }

  function n3(x, y, z) {
    const s = (x + y + z) / 3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const t = (i + j + k) / 6;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    const x1 = x0 - i1 + 1 / 6, y1 = y0 - j1 + 1 / 6, z1 = z0 - k1 + 1 / 6;
    const x2 = x0 - i2 + 1 / 3, y2 = y0 - j2 + 1 / 3, z2 = z0 - k2 + 1 / 3;
    const x3 = x0 - 0.5, y3 = y0 - 0.5, z3 = z0 - 0.5;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) { const g = perm12[ii + perm[jj + perm[kk]]] * 3; t0 *= t0; n += t0 * t0 * (G3[g] * x0 + G3[g + 1] * y0 + G3[g + 2] * z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) { const g = perm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; t1 *= t1; n += t1 * t1 * (G3[g] * x1 + G3[g + 1] * y1 + G3[g + 2] * z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) { const g = perm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; t2 *= t2; n += t2 * t2 * (G3[g] * x2 + G3[g + 1] * y2 + G3[g + 2] * z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) { const g = perm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; t3 *= t3; n += t3 * t3 * (G3[g] * x3 + G3[g + 1] * y3 + G3[g + 2] * z3); }
    return 32 * n;
  }

  function fbm2(x, y, octaves = 4, gain = 0.5, lacunarity = 2) {
    let sum = 0, amp = 0.5, total = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * n2(x, y);
      total += amp;
      x *= lacunarity; y *= lacunarity; amp *= gain;
    }
    return sum / total;
  }
  function fbm3(x, y, z, octaves = 4, gain = 0.5, lacunarity = 2) {
    let sum = 0, amp = 0.5, total = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * n3(x, y, z);
      total += amp;
      x *= lacunarity; y *= lacunarity; amp *= gain;
    }
    return sum / total;
  }
  // The curl of a noise field: flow with no sources or sinks, so things carried
  // by it swirl without bunching up. Returns [vx, vy], each about -1..1.
  function curl(x, y, z = 0) {
    const e = 0.01;
    const dx = (n3(x + e, y, z) - n3(x - e, y, z)) / (2 * e);
    const dy = (n3(x, y + e, z) - n3(x, y - e, z)) / (2 * e);
    return [dy * 0.35, -dx * 0.35];
  }
  return { n2, n3, fbm2, fbm3, curl };
}

// ---------------------------------------------------------------------------
// DOM and SVG. Set type and precise linework in DOM/SVG: the browser draws it
// at the full resolution of the panel (4K), which a canvas is not.
// ---------------------------------------------------------------------------

function fill(node, attrs, kids, isSvg) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "class" && !isSvg) node.className = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) node.append(kid);
  return node;
}
// el("div", { class: "time", style: { left: "88px" }, text: "12:45" }, child, child...)
export const el = (tag, attrs, ...kids) => fill(document.createElement(tag), attrs, kids, false);
// svg("circle", { cx: 540, cy: 300, r: 40, fill: "#fff" })
export const svg = (tag, attrs, ...kids) => fill(document.createElementNS("http://www.w3.org/2000/svg", tag), attrs, kids, true);
// A full-stage <svg> with the stage's coordinate system, appended to root.
export function svgLayer(root, attrs = {}) {
  const node = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, ...attrs });
  Object.assign(node.style, { position: "absolute", left: "0", top: "0", overflow: "hidden" });
  root.append(node);
  return node;
}
// Adds a stylesheet for the piece. The page belongs to one visualization, so
// plain class names are fine.
export function addStyle(root, cssText) {
  const node = el("style", { text: cssText });
  root.append(node);
  return node;
}

// Shrinks one line of text (never grows it) until it is no wider than
// `maxWidth` stage units. The node is made nowrap. Call again whenever the text
// changes. Returns the font size used. Sizes are layout sizes, so this is right
// however the stage is scaled on screen.
export function fitText(node, maxWidth, baseSize) {
  const size = baseSize ?? (parseFloat(node.dataset.baseSize) || parseFloat(getComputedStyle(node).fontSize));
  node.dataset.baseSize = size;
  node.style.whiteSpace = "nowrap";
  node.style.fontSize = `${size}px`;
  const w = Math.max(node.scrollWidth, node.offsetWidth);
  const fitted = w > maxWidth ? Math.floor((size * maxWidth) / w) : size;
  node.style.fontSize = `${fitted}px`;
  return fitted;
}

// Breaks text into lines no wider than maxWidth for canvas drawing (set
// ctx.font first). Returns the lines.
export function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of String(text).split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// ---------------------------------------------------------------------------
// Drawing surfaces. Both kinds cover the whole stage, are positioned absolutely
// at the top left, and stack in the order they are created (set layer.canvas
// .style.zIndex to change that).
//
// How many real pixels a surface has is worked out here, from the screen it is
// on and how the machine is coping, so a piece never sets canvas.width itself:
//   pixels per stage unit = min(maxScale, screen's pixels per stage unit) x quality
// On the 4K panel the screen has 2 pixels per stage unit; in a gallery
// thumbnail, 0.25.
// ---------------------------------------------------------------------------

const surfaces = new Set();
const env = { screenScale: 1, quality: 1 };

// 2D canvas. Draw in stage units (0..1080, 0..1920): the context is already
// scaled. Options:
//   maxScale   pixels per stage unit at most (default 1: soft on 4K, cheap.
//              2 is crisp on 4K and four times the fill cost)
//   adaptive   true if you redraw the whole surface every frame. Only adaptive
//              surfaces are resized while running (which clears them) when the
//              machine is struggling. A surface you draw once, or accumulate
//              on, must leave this false.
//   alpha      false for an opaque background layer (slightly cheaper)
// Returns { canvas, ctx, ratio, clear() }. `ratio` is the pixels per stage
// unit actually in use (needed only for getImageData-style pixel work).
export function canvas2d(root, { maxScale = 1, adaptive = false, alpha = true } = {}) {
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, { position: "absolute", left: "0", top: "0", width: `${W}px`, height: `${H}px` });
  root.append(canvas);
  const ctx = canvas.getContext("2d", { alpha });
  const layer = { canvas, ctx, ratio: 1, adaptive, kind: "2d" };
  layer.clear = () => ctx.clearRect(0, 0, W, H);
  layer.resize = (first) => {
    if (!first && !adaptive) return;
    const ratio = clamp(Math.min(maxScale, env.screenScale) * (adaptive ? env.quality : 1), 0.2, 3);
    const w = Math.max(1, Math.round(W * ratio));
    const h = Math.max(1, Math.round(H * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    layer.ratio = w / W;
    ctx.setTransform(w / W, 0, 0, h / H, 0, 0);
  };
  layer.resize(true);
  layer.destroy = () => {
    surfaces.delete(layer);
    canvas.width = canvas.height = 1;
    canvas.remove();
  };
  surfaces.add(layer);
  return layer;
}

// A low-resolution canvas shown with hard pixels, for pixel art and anything
// built on a coarse grid (LED and flip-dot boards, tiles, cellular automata).
// `size` is how many stage units one pixel covers: 4 gives a 270 x 480 grid.
// Draw in grid cells (the context is not scaled): ctx.fillRect(col, row, 1, 1).
// It stays sharp on any screen and costs almost nothing to fill.
// Returns { canvas, ctx, cols, rows, size, clear() }.
export function pixelCanvas(root, { size = 4, alpha = true } = {}) {
  const cols = Math.round(W / size);
  const rows = Math.round(H / size);
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  Object.assign(canvas.style, { position: "absolute", left: "0", top: "0", width: `${W}px`, height: `${H}px`, imageRendering: "pixelated" });
  root.append(canvas);
  const ctx = canvas.getContext("2d", { alpha });
  ctx.imageSmoothingEnabled = false;
  const layer = { canvas, ctx, cols, rows, size, ratio: 1 / size, adaptive: false, kind: "px" };
  layer.clear = () => ctx.clearRect(0, 0, cols, rows);
  layer.resize = () => {};
  layer.destroy = () => {
    surfaces.delete(layer);
    canvas.remove();
  };
  surfaces.add(layer);
  return layer;
}

// Text (or anything else) as a grid of coverage values, for building things
// out of letterforms: dots that are on or off, tiles, places for particles to
// settle, obstacles in a flow. Calls draw(ctx, cols, rows) on a hidden canvas
// of cols x rows cells (draw in white, in cell units) and returns
// { cols, rows, data } where data[row * cols + col] is 0..255.
// Not for every frame: call it when the text changes. Fonts listed in the
// piece's `fonts` are already loaded when mount() runs.
//   const m = mask(270, 120, (ctx) => { ctx.font = '700 110px "Archivo"'; ctx.textBaseline = "top"; ctx.fillText("12:45", 0, 6); });
const maskCanvases = new Map();
export function mask(cols, rows, draw) {
  const key = `${cols}x${rows}`;
  let c = maskCanvases.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = cols;
    c.height = rows;
    maskCanvases.set(key, c);
  }
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cols, rows);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.save();
  draw(ctx, cols, rows);
  ctx.restore();
  const px = ctx.getImageData(0, 0, cols, rows).data;
  const data = new Uint8Array(cols * rows);
  for (let i = 0; i < data.length; i++) data[i] = px[i * 4 + 3];
  return { cols, rows, data };
}

const VERT = `attribute vec2 a_pos; varying vec2 v_uv; varying vec2 v_pos;
void main() { v_uv = a_pos * 0.5 + 0.5; v_pos = vec2(v_uv.x * ${W}.0, (1.0 - v_uv.y) * ${H}.0); gl_Position = vec4(a_pos, 0.0, 1.0); }`;
const FRAG_HEAD = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;   // 0..1, origin bottom-left
varying vec2 v_pos;  // stage units, origin top-left: x 0..${W}, y 0..${H} (same as canvas and DOM)
uniform vec2 u_res;  // surface size in real pixels
uniform float u_time;
`;

// One full-stage fragment shader (WebGL 1). Write only the body: `frag` must
// define `void main()` and set gl_FragColor. Declared for you: v_uv, v_pos,
// u_res, u_time (see FRAG_HEAD above). Declare your own uniforms in `frag`
// and set them with layer.set(name, value) where value is a number or an
// array of 2, 3 or 4 numbers.
// Options: maxScale (default 0.5: half resolution, which suits soft imagery and
// keeps a Raspberry Pi comfortable; never above 1), adaptive (default true).
// Returns { canvas, ok, set(name, value), draw(timeSeconds), destroy() }.
// `ok` is false if WebGL is unavailable: put something acceptable behind the
// surface (a CSS background on root) for that case.
export function shader(root, { frag, maxScale = 0.5, adaptive = true } = {}) {
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, { position: "absolute", left: "0", top: "0", width: `${W}px`, height: `${H}px` });
  root.append(canvas);
  const layer = { canvas, ok: false, ratio: 1, adaptive, kind: "gl", error: null };
  const opts = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power", preserveDrawingBuffer: false };
  let gl = null;
  try {
    gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
  } catch {}
  let program = null;
  let locations = {};
  const values = {};

  function build() {
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader failed to compile");
      return s;
    };
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG_HEAD + frag));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "shader failed to link");
    gl.useProgram(program);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    locations = {};
    layer.ok = true;
  }
  if (gl) {
    try {
      build();
    } catch (err) {
      layer.error = String(err.message || err);
      console.error(`[kit.shader] ${layer.error}`);
    }
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      layer.ok = false;
    });
    canvas.addEventListener("webglcontextrestored", () => {
      try {
        build();
      } catch {}
    });
  } else layer.error = "WebGL is not available";

  const locate = (name) => (name in locations ? locations[name] : (locations[name] = gl.getUniformLocation(program, name)));
  layer.set = (name, value) => {
    values[name] = value;
  };
  layer.resize = () => {
    const ratio = clamp(Math.min(maxScale, 1, env.screenScale) * (adaptive ? env.quality : 1), 0.15, 1);
    const w = Math.max(1, Math.round(W * ratio));
    const h = Math.max(1, Math.round(H * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    layer.ratio = w / W;
  };
  layer.draw = (time = 0) => {
    if (!layer.ok) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.uniform2f(locate("u_res"), canvas.width, canvas.height);
    gl.uniform1f(locate("u_time"), time);
    for (const name in values) {
      const l = locate(name);
      const v = values[name];
      if (l == null) continue;
      if (typeof v === "number") gl.uniform1f(l, v);
      else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
      else if (v.length === 4) gl.uniform4f(l, v[0], v[1], v[2], v[3]);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  layer.destroy = () => {
    surfaces.delete(layer);
    layer.ok = false;
    try {
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {}
    canvas.remove();
  };
  layer.resize();
  surfaces.add(layer);
  return layer;
}

// A color as [r, g, b] in 0..1, for shader uniforms: layer.set("u_sky", vec3("#4081d0")).
export function vec3(color) {
  let s = String(color).replace(/^#/, "");
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ---------------------------------------------------------------------------
// Finish
// ---------------------------------------------------------------------------

// A still film-grain layer over everything in root. Smooth gradients band
// badly on a big LCD, especially dark ones; a little grain hides it and makes
// flat color feel like a material. Costs nothing per frame. `opacity` 0.03 to
// 0.1 is the useful range. Returns the element (remove() it to take it off).
export function grain(root, { opacity = 0.06, size = 256, seed = 7, zIndex = 50 } = {}) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(size, size);
  const r = rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r();
    const white = v > 0.5;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = white ? 255 : 0;
    img.data[i + 3] = Math.abs(v - 0.5) * 2 * 255; // black and white specks in equal measure, so the picture's tone is unchanged
  }
  ctx.putImageData(img, 0, 0);
  const node = el("div", {
    style: {
      position: "absolute", inset: "0", zIndex: String(zIndex), pointerEvents: "none", opacity: String(opacity),
      backgroundImage: `url(${c.toDataURL("image/png")})`, backgroundSize: `${size}px ${size}px`,
    },
  });
  root.append(node);
  return node;
}

// ---------------------------------------------------------------------------
// For the runner only.
// ---------------------------------------------------------------------------

export const __kit = {
  configure({ screenScale, quality } = {}) {
    if (screenScale != null) env.screenScale = screenScale;
    if (quality != null) env.quality = quality;
    for (const s of surfaces) s.resize(false);
  },
  get quality() {
    return env.quality;
  },
  get screenScale() {
    return env.screenScale;
  },
  surfaces,
  destroyAll() {
    for (const s of [...surfaces]) s.destroy();
  },
};

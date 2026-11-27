// Runs one visualization (src/visuals/<id>.js) full-page. The display puts this
// page in an iframe and swaps iframes every 15 minutes, so each piece gets a
// clean page to itself and takes everything it allocated with it when it goes.
// The page also works on its own, for looking at one piece:
//
//   /visual.html?id=<id>                      live data, real clock
//   /visual.html?id=<id>&scenario=rain-dusk-fall     a named moment (src/lib/simulate.js)
//   /visual.html?id=<id>&wx=snow&at=night     any weather preset at any time
//   ...&rate=600      run the clock 600x (a day in about two minutes)
//   ...&seed=7        another arrangement of anything seeded
//   ...&hud=1         frame rate and cost
//   ...&warm=20       run 20 s of animation before the first paint
//   ...&manual=1      no animation loop: step it with window.__viz.advance(seconds)
//
// Parameters the display adds: embed=1 (data comes from the parent page by
// postMessage), key, slot, scale (real pixels per stage unit), onDevice.

import { __kit, W, H, hash } from "./lib/kit.js";
import { loadVisual } from "./lib/registry.js";
import { createState } from "./lib/state.js";
import { createHub, emptyData } from "./lib/data.js";
import { simulate, resolveSim } from "./lib/simulate.js";
import { loadFonts } from "./lib/fonts.js";
import { slotOf } from "./lib/schedule.js";

const params = new URLSearchParams(location.search);
const id = params.get("id") || "";
const embed = params.get("embed") === "1" && window.parent !== window;
const key = params.get("key") || "";
const manual = params.get("manual") === "1";
const stage = document.getElementById("stage");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const viz = (window.__viz = { id, ready: false, error: null, errors: [], state: null, title: "", quality: 1, mountMs: 0, target: 30 });
const tell = (type, extra = {}) => {
  if (embed) window.parent.postMessage({ type: `ct:${type}`, key, id, ...extra }, location.origin);
};

if (params.get("onDevice") === "true") document.documentElement.style.cursor = "none";

// The stage is always 1080 x 1920 and scaled to fit the page.
// Changing how many pixels a canvas has clears it, so while the loop is running
// such changes wait for the start of the next frame: a cleared canvas is then
// redrawn before it is ever shown.
const pending = {};
let looping = false;
function configure(change) {
  if (looping) Object.assign(pending, change);
  else __kit.configure(change);
}
function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H) || 1;
  stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  const given = Number(params.get("scale"));
  configure({ screenScale: given > 0 ? given : s * (window.devicePixelRatio || 1) });
}
fit();
window.addEventListener("resize", fit);

// ---------------------------------------------------------------------------
// Data: from the parent page, simulated, or fetched here.
// ---------------------------------------------------------------------------

const rate = params.has("rate") ? Number(params.get("rate")) || 0 : 1;
// Live readings go stale as soon as the clock is run fast, so a rate on its own
// simulates ordinary weather from the present.
const sim = resolveSim(params) ?? (rate !== 1 ? { wx: "partly", ms: null, overrides: {}, name: null } : null);
const simulatedClock = (sim && sim.ms != null) || rate !== 1;
const simulatedData = Boolean(sim && sim.wx !== "live");
let data = emptyData();
let simAt = null;
let hub = null;
let gotData = () => {};
const firstData = new Promise((r) => (gotData = r));

window.addEventListener("message", (e) => {
  if (e.origin !== location.origin || !e.data || typeof e.data.type !== "string") return;
  if (e.data.type === "ct:data" && !simulatedData) {
    data = e.data.data || data;
    gotData();
  } else if (e.data.type === "ct:scale" && e.data.scale > 0) configure({ screenScale: e.data.scale });
});

// ---------------------------------------------------------------------------
// The frame loop.
// ---------------------------------------------------------------------------

let mod = null;
let instance = null;
let st = null;
let t = 0; // animation clock, seconds
let warmed = 0; // animation seconds spent warming up (the shown instant does not move during them)
let base = Date.now();
let raf = 0;
let failed = false;
let badFrames = 0;
const cost = { n: 0, sum: 0, max: 0, recent: [] }; // ms spent in frame()

function fail(err) {
  if (failed) return;
  failed = true;
  cancelAnimationFrame(raf);
  viz.error = String(err?.stack || err?.message || err);
  console.error(`[${id}]`, err);
  tell("error", { message: String(err?.message || err).slice(0, 300) });
}

function step(dt) {
  t += dt;
  const ms = simulatedClock ? base + (t - warmed) * 1000 * rate : Date.now();
  if (simulatedData && (simAt == null || Math.abs(ms - simAt) > 10 * 60 * 1000)) {
    data = simulate({ wx: sim.wx, ms, overrides: sim.overrides });
    simAt = ms;
  }
  st.update(data, ms, t, dt);
  const t0 = performance.now();
  instance.frame(st.state);
  const spent = performance.now() - t0;
  cost.n++;
  cost.sum += spent;
  if (spent > cost.max) cost.max = spent;
  cost.recent.push(spent);
  if (cost.recent.length > 240) cost.recent.shift();
}

function safeStep(dt) {
  try {
    step(dt);
    badFrames = 0;
    return true;
  } catch (err) {
    viz.errors.push(String(err?.message || err));
    if (++badFrames >= 3) fail(err);
    else console.error(`[${id}] frame error`, err);
    return false;
  }
}

// Steps the animation by hand (manual mode, and warming up). Synchronous.
viz.advance = (seconds, dt = 1 / 30) => {
  const n = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < n && !failed; i++) safeStep(dt);
  return viz.stats();
};
viz.stats = () => {
  const sorted = [...cost.recent].sort((a, b) => a - b);
  return {
    frames: cost.n,
    avgMs: cost.n ? +(cost.sum / cost.n).toFixed(3) : 0,
    p95Ms: sorted.length ? +sorted[Math.floor(sorted.length * 0.95)].toFixed(3) : 0,
    maxMs: +cost.max.toFixed(3),
    fps: +fpsNow.toFixed(1),
    target: viz.target,
    mountMs: viz.mountMs,
    quality: __kit.quality,
    surfaces: [...__kit.surfaces].map((s) => `${s.kind}${s.adaptive ? "*" : ""} ${s.canvas.width}x${s.canvas.height}`),
    nodes: stage.getElementsByTagName("*").length,
    errors: viz.errors.length,
  };
};

// Runs the piece in real time for a few seconds and reports the frame rate it
// held: the test for everything frame() does not time (layout, paint, shaders).
viz.realtime = (seconds = 3) =>
  new Promise((resolve) => {
    const interval = 1000 / viz.target;
    const start = performance.now();
    let last = start;
    let frames = 0;
    const tick = (ts) => {
      if (failed || ts - start >= seconds * 1000) return resolve({ fps: +((frames * 1000) / Math.max(1, ts - start)).toFixed(1), target: viz.target });
      requestAnimationFrame(tick);
      const elapsed = ts - last;
      if (elapsed < interval - 3) return;
      last = ts;
      safeStep(Math.min(0.1, elapsed / 1000));
      frames++;
    };
    requestAnimationFrame(tick);
  });

let fpsNow = 0;
function run(fps) {
  const interval = 1000 / fps;
  let last = performance.now();
  // If frames keep arriving late, draw fewer pixels (surfaces marked adaptive only).
  let windowStart = last;
  let windowFrames = 0;
  let windowClean = true;
  let slowWindows = 0;
  const started = last;
  looping = true;
  const loop = (ts) => {
    raf = requestAnimationFrame(loop);
    const elapsed = ts - last;
    if (elapsed < interval - 3) return;
    last = ts;
    if (pending.quality || pending.screenScale) {
      __kit.configure(pending);
      viz.quality = __kit.quality;
      delete pending.quality;
      delete pending.screenScale;
    }
    if (elapsed > 500) windowClean = false; // the tab was hidden, or a hiccup that is not about drawing
    safeStep(Math.min(0.1, elapsed / 1000));
    windowFrames++;
    if (ts - windowStart >= 2000) {
      fpsNow = (windowFrames * 1000) / (ts - windowStart);
      const statsClean = windowClean; // false if the window included a pause that was not about drawing
      if (windowClean && ts - started > 6000 && fpsNow < fps * 0.7) slowWindows++;
      else slowWindows = 0;
      if (slowWindows >= 2 && __kit.quality > 0.5) {
        const q = __kit.quality * 0.8;
        pending.quality = q < 0.55 ? 0.5 : q; // 1, 0.8, 0.64, 0.5: applied just before the next frame is drawn
        slowWindows = 0;
      }
      windowStart = ts;
      windowFrames = 0;
      windowClean = true;
      if (hudNode) hudNode.textContent = hudText();
      tell("stats", { fps: +fpsNow.toFixed(1), target: fps, clean: statsClean, quality: __kit.quality, avgMs: viz.stats().avgMs });
    }
  };
  raf = requestAnimationFrame(loop);
}

let hudNode = null;
const hudText = () => {
  const s = viz.stats();
  return `${id}  ${s.fps} fps  frame ${s.avgMs} ms (p95 ${s.p95Ms})  quality ${s.quality.toFixed(2)}  ${s.surfaces.join(", ")}  ${s.nodes} nodes`;
};

async function main() {
  mod = await loadVisual(id);
  viz.title = mod.title || id;
  document.title = `${viz.title} · Clock Tower`;

  const fontsReady = loadFonts(mod);
  if (simulatedData) {
    // nothing to wait for
  } else if (embed) {
    tell("hello");
    await Promise.race([firstData, wait(1500)]);
  } else {
    hub = createHub({ onChange: (d) => { data = d; gotData(); } });
    data = hub.data;
    hub.start();
    if (!data.weather) await Promise.race([firstData, wait(2500)]);
  }
  await fontsReady;

  base = sim?.ms ?? Date.now();
  const slot = params.has("slot") ? Number(params.get("slot")) : slotOf(base);
  const seed = params.has("seed") ? Number(params.get("seed")) || 1 : 1 + Math.floor(hash(slot, [...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7)) * 1e9);
  st = createState({ slot, seed });
  viz.state = st.state;
  if (simulatedData) {
    data = simulate({ wx: sim.wx, ms: base, overrides: sim.overrides });
    simAt = base;
  }
  st.update(data, simulatedClock ? base : Date.now(), 0, 0);
  st.state.scale = __kit.screenScale;

  const m0 = performance.now();
  instance = mod.mount(stage, { state: st.state, W, H, seed });
  viz.mountMs = +(performance.now() - m0).toFixed(1);
  if (!instance || typeof instance.frame !== "function") throw new Error(`"${id}": mount() must return { frame(state) }`);

  const warm = Math.max(0, Number(params.get("warm")) || 0);
  if (warm) {
    const dt = 1 / 30;
    for (let i = 0; i < Math.round(warm / dt) && !failed; i++) {
      warmed += dt; // the animation runs; the instant shown stays put
      safeStep(dt);
    }
  }
  if (!safeStep(0) && failed) return;
  if (failed) return;

  if (params.get("hud") === "1") {
    hudNode = document.createElement("div");
    hudNode.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:99;font:12px/1.3 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.6);padding:4px 8px;border-radius:4px;white-space:pre";
    document.body.append(hudNode);
  }
  const fps = Math.max(1, Math.min(60, Number(params.get("fps")) || mod.fps || 30));
  viz.target = fps;
  if (!manual) run(fps);

  // Give the first frame a moment to reach the screen before saying so.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  viz.ready = true;
  tell("ready", { title: viz.title });
}

window.addEventListener("error", (e) => viz.errors.push(String(e.message || e.error || "error")));
window.addEventListener("unhandledrejection", (e) => viz.errors.push(String(e.reason?.message || e.reason || "rejection")));

main().catch(fail);

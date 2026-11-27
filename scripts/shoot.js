// Photographs a visualization in a headless browser, in any weather and at any
// hour, so it can be looked at and checked without waiting for the real thing.
//
//   node scripts/shoot.js <id>                       the seven core scenarios + a contact sheet
//   node scripts/shoot.js <id> --scenarios all       every scenario in src/lib/simulate.js
//   node scripts/shoot.js <id> --scenarios rain-dusk-fall,fog-dawn-spring
//   node scripts/shoot.js <id> --wx snow --at night  one ad-hoc moment (any preset, any time)
//   node scripts/shoot.js <id> --frames 3 --every 4  three shots 4 s of animation apart (is it moving? is it calm?)
//   node scripts/shoot.js <id> --wx clear --at dawn --frames 6 --every 2 --rate 7200   a time-lapse: 4 hours of clock per shot
//   node scripts/shoot.js <id> --crop 0,0,1080,700   also save that region at full resolution
//   node scripts/shoot.js <id> --perf 12             also run 12 s in real time: fps, frame cost, memory growth
//   node scripts/shoot.js --list                     ids and scenario names
//
// Other options: --warm <s> (animation run before the first shot, default 12),
// --seed <n>, --out <dir> (default $SHOOT_OUT or ./shots), --port <n>,
// --no-sheet, --no-realtime, --quiet.
//
// Writes <out>/<id>/<scenario>.png (1080 x 1920) and <out>/<id>/sheet.jpg (all
// of them side by side), and prints a JSON report: for every shot the text the
// readouts should be showing, the cost of a frame (the JavaScript in frame()
// only), the frame rate held over a few seconds of real time (first scenario),
// how bright the picture is, any errors the page logged, and warnings (too
// bright for night, over budget, a slow mount).
//
// Uses a dev server on port 5173 if one is running (npm run dev), else starts
// its own for the duration. Needs Playwright: `npm i -D playwright` if it is
// not already available on this machine.

import { createRequire } from "module";
import { mkdir, rmdir, stat, writeFile, readFile, readdir } from "fs/promises";
import { rmdirSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join, resolve } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] != null ? argv[i + 1] : fallback;
};
const VALUE_FLAGS = ["scenarios", "wx", "at", "warm", "frames", "every", "rate", "seed", "out", "crop", "perf", "port"];
const positional = argv.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes((argv[i - 1] || "").replace(/^--/, "")));
const log = (...a) => {
  if (!flag("quiet")) console.error(...a);
};

const { SCENARIOS, CORE_SCENARIOS, PRESETS, parseAt } = await import(pathToFileURL(join(root, "src/lib/simulate.js")).href);

if (flag("list") || !positional[0]) {
  const ids = (await readdir(join(root, "src/visuals"))).filter((f) => f.endsWith(".js") && !f.startsWith("_")).map((f) => f.slice(0, -3));
  console.log(`visualizations: ${ids.join(", ") || "(none yet)"}\n`);
  console.log(`scenarios:\n${Object.entries(SCENARIOS).map(([k, v]) => `  ${k.padEnd(30)} ${v.at.replace("T", " ")}  ${v.note}`).join("\n")}\n`);
  console.log(`core scenarios: ${CORE_SCENARIOS.join(", ")}`);
  console.log(`weather presets (--wx): ${Object.keys(PRESETS).join(", ")}, none`);
  console.log(`times (--at): dawn sunrise morning noon afternoon golden sunset dusk night midnight | HH:MM | YYYY-MM-DDTHH:MM (New York)`);
  process.exit(positional[0] ? 0 : flag("list") ? 0 : 1);
}

const id = positional[0];
const warm = Number(opt("warm", 12));
const frames = Math.max(1, Number(opt("frames", 1)));
const every = Number(opt("every", 4));
const rate = opt("rate");
const seed = opt("seed");
const perf = Number(opt("perf", 0));
let crop = opt("crop")?.split(",").map(Number);
if (crop && (crop.length !== 4 || crop.some((n) => !Number.isFinite(n)))) {
  console.error("--crop takes x,y,width,height in stage units, e.g. --crop 0,0,1080,640");
  process.exit(1);
}
if (crop) {
  // keep it inside the 1080 x 1920 frame
  const x = Math.min(1079, Math.max(0, crop[0]));
  const y = Math.min(1919, Math.max(0, crop[1]));
  crop = [x, y, Math.max(1, Math.min(crop[2], 1080 - x)), Math.max(1, Math.min(crop[3], 1920 - y))];
}
const outDir = resolve(opt("out", process.env.SHOOT_OUT || join(root, "shots")), id);
const port = Number(opt("port", 5173));

// What to shoot: named scenarios, or one ad-hoc moment.
let shots;
if (opt("wx") || opt("at")) {
  const wx = opt("wx", "partly");
  const at = opt("at", "noon");
  // A typo must not be quietly shot as something else under the name asked for.
  const known = [...Object.keys(PRESETS), "none", "offline"];
  if (!known.includes(wx)) {
    console.error(`unknown --wx "${wx}". One of: ${known.join(", ")}`);
    process.exit(1);
  }
  if (parseAt(at) == null) {
    console.error(`cannot read --at "${at}". Try --list.`);
    process.exit(1);
  }
  shots = [{ name: `${wx}-${String(at).replace(/[^\w-]+/g, "")}`, query: `wx=${encodeURIComponent(wx)}&at=${encodeURIComponent(at)}`, note: `${wx} at ${at}` }];
} else {
  const want = opt("scenarios");
  const names = !want ? CORE_SCENARIOS : want === "all" ? Object.keys(SCENARIOS) : want.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = names.filter((n) => !SCENARIOS[n]);
  if (unknown.length) {
    console.error(`unknown scenario(s): ${unknown.join(", ")}. Try --list.`);
    process.exit(1);
  }
  shots = names.map((name) => ({ name, query: `scenario=${name}`, note: SCENARIOS[name].note }));
}

// When several of these run at once on one machine (pieces being worked on in
// parallel) they take turns, a few at a time, so the frame costs they measure
// are not just each other's noise. SHOOT_SLOTS sets how many may run together.
const SLOTS = Math.max(1, Number(process.env.SHOOT_SLOTS) || 3);
let slotDir = null;
async function takeSlot() {
  const started = Date.now();
  for (;;) {
    for (let i = 0; i < SLOTS; i++) {
      const dir = join(tmpdir(), `clock-tower-shoot-slot-${i}`);
      try {
        await mkdir(dir);
        slotDir = dir;
        return;
      } catch {
        // Taken. A slot left behind by a run that was killed is reclaimed after ten minutes.
        const age = await stat(dir).then((st) => Date.now() - st.mtimeMs, () => 0);
        if (age > 10 * 60 * 1000) await rmdir(dir).catch(() => {});
      }
    }
    if (Date.now() - started > 15 * 60 * 1000) return; // waited long enough: go anyway
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
  }
}
const releaseSlot = () => (slotDir ? rmdir(slotDir).catch(() => {}) : Promise.resolve());
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => releaseSlot().finally(() => process.exit(130)));
// However this run ends (a crash included), give the slot back.
process.on("exit", () => {
  if (slotDir) {
    try {
      rmdirSync(slotDir);
    } catch {}
  }
});
await takeSlot();

// A dev server: the one already running, or our own.
let base = `http://localhost:${port}`;
let server = null;
const reachable = await fetch(`${base}/visual.html`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);
if (!reachable) {
  const { createServer } = await import("vite");
  server = await createServer({ root, logLevel: "error", server: { port: 0, host: "127.0.0.1" } });
  await server.listen();
  base = server.resolvedUrls.local[0].replace(/\/$/, "");
  log(`started a dev server at ${base}`);
}

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium");
  await releaseSlot();
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"] });
const report = { id, out: outDir, shots: [], perf: null, ok: true };

// The dev server reloads open pages when files change. A shot in progress must
// not be reloaded because someone saved another file, so the page gets an inert
// stand-in for Vite's client.
const INERT_CLIENT = `const hot = { accept() {}, acceptExports() {}, dispose() {}, prune() {}, on() {}, off() {}, send() {}, invalidate() {}, data: {} };
export const createHotContext = () => hot;
export const updateStyle = () => {};
export const removeStyle = () => {};
export const injectQuery = (url) => url;
export class ErrorOverlay {}`;

async function open(query, extra = "") {
  const context = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, timezoneId: "America/New_York" });
  await context.route("**/@vite/client", (route) => route.fulfill({ contentType: "application/javascript", body: INERT_CLIENT }));
  const page = await context.newPage();
  const logs = [];
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`.slice(0, 400));
  });
  page.on("pageerror", (e) => logs.push(`pageerror: ${String(e.message || e)}`.slice(0, 400)));
  const url = `${base}/visual.html?id=${encodeURIComponent(id)}&${query}${seed ? `&seed=${seed}` : ""}${extra}`;
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__viz && (window.__viz.ready || window.__viz.error), null, { timeout: 60000 }).catch(() => {});
  // A page stuck in an endless loop never answers: do not wait on it for ever.
  const status = await Promise.race([
    page.evaluate(() => ({ ready: Boolean(window.__viz?.ready), error: window.__viz?.error || null })),
    new Promise((r) => setTimeout(() => r({ ready: false, error: "the page stopped responding: an endless loop in mount() or frame()?" }), 8000)),
  ]);
  return { context, page, logs, url, status };
}

const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
// The rate a piece can actually reach on a 60 Hz screen: frames land on whole refreshes, so 24 fps runs at 20.
const paced = (fps) => Math.min(fps, 60 / Math.ceil(60 / fps - 1e-6));

for (const shot of shots) {
  const { context, page, logs, url, status } = await open(shot.query, `&manual=1&warm=${warm}${rate ? `&rate=${rate}` : ""}`);
  const entry = { scenario: shot.name, note: shot.note, url, files: [], frames: [], error: status.error, logs };
  if (!status.ready) {
    entry.error = entry.error || "the page never became ready";
    report.ok = false;
  } else {
    for (let f = 0; f < frames; f++) {
      if (f > 0) await page.evaluate((s) => window.__viz.advance(s), every);
      await settle(page);
      const file = join(outDir, `${shot.name}${frames > 1 ? `-f${f + 1}` : ""}.png`);
      await page.screenshot({ path: file });
      entry.files.push(file);
      // What this frame was showing: with several frames (a time-lapse) they differ.
      entry.frames.push({ file, ...(await page.evaluate(() => ({ daylight: +window.__viz.state.daylight.toFixed(2), time: `${window.__viz.state.text.time} ${window.__viz.state.text.ampm}` }))) });
      if (crop?.length === 4) {
        const cfile = file.replace(/\.png$/, "-crop.png");
        await page.screenshot({ path: cfile, clip: { x: crop[0], y: crop[1], width: crop[2], height: crop[3] } });
        entry.files.push(cfile);
      }
    }
    const info = await page.evaluate(() => {
      const s = window.__viz.state;
      return {
        stats: window.__viz.stats(),
        frameErrors: window.__viz.errors.slice(0, 5),
        expect: { ...s.text },
        conditions: {
          sunAlt: +s.sun.alt.toFixed(1), daylight: +s.daylight.toFixed(2), phase: s.sun.phase, moon: +s.moon.phase.toFixed(2), moonUp: s.moon.up,
          kind: s.weather.kind, falling: s.weather.falling, cloud: Math.round(s.weather.cloud), wind: Math.round(s.weather.wind), temp: Math.round(s.weather.temp), live: s.weather.live,
        },
      };
    });
    Object.assign(entry, info);
    // The first scenario also runs a few seconds in real time: frame() cost alone
    // says nothing about layout, paint or shaders, the frame rate held does.
    if (shot === shots[0] && !flag("no-realtime")) {
      entry.realtime = await Promise.race([page.evaluate(() => window.__viz.realtime(2.5)), new Promise((r) => setTimeout(() => r({ fps: 0, target: 30, stalled: true }), 15000))]);
    }
    const shaderFailed = logs.find((l) => l.includes("[kit.shader]"));
    if (shaderFailed) entry.error = `a shader failed to build: ${shaderFailed}`;
    if (info.frameErrors.length || shaderFailed || logs.some((l) => l.startsWith("pageerror"))) report.ok = false;
  }
  report.shots.push(entry);
  log(`${entry.error ? "FAILED" : "shot  "} ${shot.name}${entry.error ? `: ${String(entry.error).split("\n")[0]}` : `  frame ${entry.stats.avgMs} ms avg, ${entry.stats.p95Ms} p95`}`);
  await context.close();
}

// How bright each picture is: the mean brightness (0-1) and the share of the
// frame that is light. A night shot should be dark (see README: "Dark at night").
{
  const context = await browser.newContext({ viewport: { width: 300, height: 300 } });
  const page = await context.newPage();
  const measure = async (file) =>
    page.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 270;
      c.height = 480;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      let sum = 0;
      let light = 0;
      for (let i = 0; i < px.length; i += 4) {
        const v = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
        sum += v;
        if (v > 0.6) light++;
      }
      const n = px.length / 4;
      return { mean: +(sum / n).toFixed(3), lightShare: +(light / n).toFixed(3) };
    }, (await readFile(file)).toString("base64"));
  for (const shot of report.shots) {
    if (!shot.frames.length) continue;
    shot.warnings = [];
    for (const [i, frame] of shot.frames.entries()) {
      frame.brightness = await measure(frame.file);
      const which = shot.frames.length > 1 ? `frame ${i + 1} (${frame.time}): ` : "";
      const night = frame.daylight < 0.15;
      if (night && frame.brightness.mean > 0.22) shot.warnings.push(`${which}too bright for night: mean brightness ${frame.brightness.mean} (keep it under about 0.22)`);
      if (night && frame.brightness.lightShare > 0.2) shot.warnings.push(`${which}too much light area for night: ${Math.round(frame.brightness.lightShare * 100)}% of the frame is light`);
    }
    shot.brightness = shot.frames[0].brightness;
    const st = shot.stats;
    if (st && st.avgMs > 4) shot.warnings.push(`frame cost ${st.avgMs} ms average is over the 4 ms budget`);
    if (st && st.p95Ms > 8) shot.warnings.push(`frame cost ${st.p95Ms} ms at the 95th percentile is over the 8 ms budget`);
    if (st && st.mountMs > 120) shot.warnings.push(`mount() took ${st.mountMs} ms: on the display it runs while the previous piece is still on screen and freezes it (keep it well under 100 ms)`);
    const rt = shot.realtime;
    if (rt) {
      const gl = (st?.surfaces || []).some((x) => x.startsWith("gl"));
      if (rt.stalled) shot.warnings.push("the real-time run never finished: the piece is far too heavy, or stuck");
      else if (rt.fps < paced(rt.target) * 0.85) {
        if (gl) shot.notes = [`held ${rt.fps} of ${rt.target} fps in real time here; this test browser draws WebGL in software, which is slow for shaders, so judge the shader by how cheap it is, not by this number`];
        else shot.warnings.push(`held only ${rt.fps} of ${rt.target} fps in real time: the work outside frame() (layout, paint, canvas fill) is too heavy`);
      }
    }
    for (const w of shot.warnings) log(`warning ${shot.scenario}: ${w}`);
  }
  await context.close();
}

// The contact sheet: every shot side by side, half size.
const pictures = report.shots.flatMap((s) => s.files.filter((f) => !f.endsWith("-crop.png")).map((file) => ({ file, label: `${s.scenario}${s.files.length > 1 ? ` ${file.match(/-f(\d+)\.png$/)?.[1] || ""}` : ""}`, note: s.note })));
if (pictures.length && !flag("no-sheet")) {
  const cols = Math.min(pictures.length, pictures.length <= 4 ? pictures.length : pictures.length <= 6 ? 3 : 4);
  const cellW = 540;
  const cellH = 960;
  const cap = 44;
  const rows = Math.ceil(pictures.length / cols);
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#1b1b1b;font:600 19px/1.2 system-ui,sans-serif;color:#eee}
    .g{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:0}
    figure{margin:0;width:${cellW}px}
    img{display:block;width:${cellW}px;height:${cellH}px}
    figcaption{height:${cap}px;display:flex;align-items:center;padding:0 12px;white-space:nowrap;overflow:hidden;background:#111}
    small{font-weight:400;color:#aaa;margin-left:10px;font-size:15px}
  </style><div class="g">${pictures.map((p) => `<figure><img src="${pathToFileURL(p.file).href}"><figcaption>${p.label}<small>${p.note || ""}</small></figcaption></figure>`).join("")}</div>`;
  const sheetHtml = join(outDir, "sheet.html");
  await writeFile(sheetHtml, html);
  const context = await browser.newContext({ viewport: { width: cols * cellW, height: rows * (cellH + cap) }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(pathToFileURL(sheetHtml).href, { waitUntil: "load" });
  report.sheet = join(outDir, "sheet.jpg");
  await page.screenshot({ path: report.sheet, type: "jpeg", quality: 84 });
  await context.close();
}

// Real-time run: does it hold its frame rate, and does memory stay put?
if (perf > 0) {
  const { context, page, logs, status } = await open(shots[0].query);
  if (status.ready) {
    const cdp = await context.newCDPSession(page);
    const heap = async () => {
      await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
      const { metrics } = await cdp.send("Performance.getMetrics");
      return Math.round((metrics.find((m) => m.name === "JSHeapUsedSize")?.value || 0) / 1024);
    };
    await cdp.send("Performance.enable");
    await page.waitForTimeout(2500);
    const before = await heap();
    await page.waitForTimeout(perf * 1000);
    const after = await heap();
    const stats = await page.evaluate(() => window.__viz.stats());
    report.perf = { scenario: shots[0].name, seconds: perf, ...stats, heapKbBefore: before, heapKbAfter: after, heapGrowthKb: after - before, logs, warnings: [] };
    if (stats.fps < paced(stats.target || 30) * 0.85) report.perf.warnings.push(`ran at ${stats.fps} fps, not ${stats.target || 30}`);
    if (stats.quality < 1) report.perf.warnings.push(`the runner cut canvas resolution to ${stats.quality} to keep up`);
    if (after - before > 4000) report.perf.warnings.push(`memory grew by ${after - before} KB in ${perf} s: something is piling up`);
  } else {
    report.perf = { error: status.error || "never became ready" };
    report.ok = false;
  }
  await context.close();
}

await browser.close();
await server?.close();
await releaseSlot();
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 2);

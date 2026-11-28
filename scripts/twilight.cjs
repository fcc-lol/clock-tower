// Walks one piece through dusk (and dawn), a minute of clock at a time, and looks at how well its
// type stands out from what is behind it at every step. Day turning to night is where a piece
// changes the colour of its ink, and a careless change passes through "no contrast at all".
//
//   node scripts/twilight.cjs <id> [--out dir] [--wx clear] [--step 60] [--date 2026-07-14] [--port 5173]
//
// Writes <out>/dusk-1.jpg, dusk-2.jpg, dawn-1.jpg (contact sheets, the clock time on each tile),
// the full-size frames as <out>/frames/<sweep>-<n>.png, and <out>/report.json: for every text set
// in the page, the lowest contrast it had against its surroundings and when; and the frames
// where the whole picture is at its flattest. <out> defaults to shots/twilight/<id> (or
// $SHOOT_OUT/twilight/<id>). Needs the dev server running (npm run dev) and Playwright, like
// scripts/shoot.js.
//
// It jumps the clock a minute at a time, so a piece goes straight to each state: it shows where
// a state is weak, not what a fade or a held choice does on the way. For that, run the piece in
// real time through the same minutes (scripts/shoot.js --at <time> --frames n --every s).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flagAt = (k) => args.indexOf('--' + k);
const opt = (k, d) => (flagAt(k) >= 0 ? args[flagAt(k) + 1] : d);
const ORIGIN = `http://localhost:${opt('port', '5173')}`;
const id = args[0] && !args[0].startsWith('--') ? args[0] : null;
const out = (s) => fs.writeSync(1, s + '\n');
if (!id) { out('usage: node scripts/twilight.cjs <id> [--out dir] [--wx clear] [--date 2026-07-14]'); process.exit(0); }
const WX = opt('wx', 'clear');
const DATE = opt('date', '2026-07-14');

const OUT = path.resolve(opt('out', path.join(process.env.SHOOT_OUT || path.join(ROOT, 'shots'), 'twilight', id)));
fs.mkdirSync(OUT, { recursive: true });
const src = fs.readFileSync(path.join(ROOT, 'src/visuals', `${id}.js`), 'utf8');
const GL = /shader\(|getContext\(["']webgl/.test(src);
const DT = GL ? 1 / 10 : 1 / 30; // software WebGL here is slow: fewer, longer steps (a piece must cope with 0.1 s steps anyway)

const INERT_CLIENT = `const hot = { accept() {}, acceptExports() {}, dispose() {}, prune() {}, on() {}, off() {}, send() {}, invalidate() {}, data: {} };
export const createHotContext = () => hot;
export const updateStyle = () => {};
export const removeStyle = () => {};
export const injectQuery = (url) => url;
export class ErrorOverlay {}`;

const HOST_PAGE = `<!doctype html><meta charset="utf-8"><title>transitions</title>
<style>html,body{margin:0;background:#000;overflow:hidden}iframe{border:0;width:1080px;height:1920px;display:block}</style>
<iframe id="f"></iframe>
<script type="module">
import { simulate, parseAt } from '/src/lib/simulate.js';
import { sunTimes, moonIllumination, moonPhaseName } from '/src/lib/astro.js';
const f = document.getElementById('f');
const EMPTY = () => ({ weather: null, air: null, sky: null, skyDay: [], tides: null, facts: [], fetched: {} });
window.build = (spec, ms) => {
  if (!spec || spec.none) return EMPTY();
  const d = simulate({ wx: spec.wx, ms, overrides: spec.ov || {} });
  if (spec.day) d.facts = d.facts.map((x) => ({ ...x, day: spec.day }));
  if (spec.nofacts) d.facts = [];
  return d;
};
window.post = (spec, ms) => f.contentWindow.postMessage({ type: 'ct:data', data: window.build(spec, ms) }, location.origin);
const moonName = (ms) => moonPhaseName(moonIllumination(ms).phase);
window.resolveAt = (s) => {
  let m = /^sunset-(\\d+)s:(.+)$/.exec(s);
  if (m) return Math.round(sunTimes(parseAt(m[2] + 'T12:00')).set - Number(m[1]) * 1000);
  m = /^moonchange-(\\d+)s:(.+)$/.exec(s);
  if (m) {
    // the next time the name changes to a longer one, to the second
    let t = parseAt(m[2] + 'T12:00');
    for (let i = 0; i < 24 * 40; i++) {
      const a = moonName(t), b = moonName(t + 3600000);
      if (a !== b && b.length > a.length) {
        let lo = t, hi = t + 3600000;
        while (hi - lo > 1000) { const mid = (lo + hi) / 2; if (moonName(mid) === a) lo = mid; else hi = mid; }
        return Math.round(hi - Number(m[1]) * 1000);
      }
      t += 3600000;
    }
    return t;
  }
  return parseAt(s);
};
window.start = (url) => { f.src = url; };
window.ready = true;
</script>`;

// In every frame: a clock this script can move. The piece's page takes its first reading from the URL.
const FAKE_CLOCK = `(() => {
  const real = Date.now.bind(Date);
  const m = /[?&]fakeNow=(\\d+)/.exec(location.search);
  let fake = m ? Number(m[1]) : null;
  window.__setNow = (ms) => { fake = ms; };
  Date.now = () => (fake == null ? real() : fake);
})();`;

// Everything a person could read on the stage, with where it is and how big.
const COLLECT = () => {
  const stage = document.getElementById('stage');
  const boxes = [];
  const shown = (el) => {
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const c = getComputedStyle(a);
      if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) < 0.05) return false;
    }
    return true;
  };
  const walk = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const s = n.nodeValue.replace(/\s+/g, ' ').trim();
    const el = n.parentElement;
    if (!s || !el || el.tagName === 'STYLE' || el.tagName === 'SCRIPT' || !shown(el)) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    const b = r.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) continue;
    boxes.push({ s, x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), fs: Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10 });
  }
  if (window.gc) window.gc();
  const v = window.__viz;
  return {
    text: { ...v.state.text },
    boxes,
    errors: v.errors.slice(-4),
    error: v.error,
    stats: v.stats(),
    heapKb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024) : null,
    daylight: +(v.state.daylight ?? -1).toFixed(3),
  };
};


(async () => {
  const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const context = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, timezoneId: 'America/New_York' });
  await context.route('**/@vite/client', (route) => route.fulfill({ contentType: 'application/javascript', body: INERT_CLIENT }));
  await context.route('**/__tt.html', (route) => route.fulfill({ contentType: 'text/html', body: HOST_PAGE }));
  await context.addInitScript(FAKE_CLOCK);
  fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });

  const helper = await context.newPage();
  await helper.goto(ORIGIN + '/__tt.html', { waitUntil: 'load' });
  await helper.waitForFunction(() => window.ready, null, { timeout: 30000 });
  const sun = await helper.evaluate(async (date) => {
    const { sunTimes } = await import('/src/lib/astro.js');
    const { parseAt } = await import('/src/lib/simulate.js');
    const t = sunTimes(parseAt(date + 'T12:00'));
    return { rise: Math.round(t.rise), set: Math.round(t.set) };
  }, DATE);

  // Measures, in a page, how far the ink of each text stands from its ground: the 6th and 94th
  // percentile of luminance inside the text's box (padded a little), as a WCAG contrast ratio.
  const meter = await context.newPage();
  await meter.setContent('<canvas id="c" width="1080" height="1920"></canvas>');
  const measure = (file, boxes) => meter.evaluate(async ([src, boxes]) => {
    const im = await createImageBitmap(await (await fetch(src)).blob());
    const c = document.getElementById('c');
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(im, 0, 0);
    im.close();
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lumOf = (d, i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
    const ratioIn = (bx, by, bw, bh) => {
      const x0 = Math.max(0, Math.floor(bx)), y0 = Math.max(0, Math.floor(by));
      const w = Math.min(1080 - x0, Math.ceil(bw)), h = Math.min(1920 - y0, Math.ceil(bh));
      if (w < 4 || h < 4) return null;
      const d = x.getImageData(x0, y0, w, h).data;
      const ls = new Float32Array(w * h);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) ls[p] = lumOf(d, i);
      ls.sort();
      const lo = ls[Math.floor(ls.length * 0.06)], hi = ls[Math.floor(ls.length * 0.94)];
      return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
    };
    const whole = (() => {
      const d = x.getImageData(0, 0, 1080, 1920).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4 * 7) s += lumOf(d, i);
      return +(s / (d.length / 28)).toFixed(4);
    })();
    return { ratios: boxes.map((b) => ratioIn(b.x - 4, b.y - 2, b.w + 8, b.h + 4)), mean: whole };
  }, ['data:image/png;base64,' + fs.readFileSync(file).toString('base64'), boxes]);

  const sheeter = await context.newPage();
  await sheeter.setContent('<canvas id="c"></canvas>');
  // The contact sheet is drawn one tile at a time (fifty full-size frames at once is too much to hand to a page).
  async function sheet(tiles, file, cols = 10) {
    await sheeter.evaluate(([n, cols]) => {
      const TW = 216, TH = 384, LAB = 26, GAP = 4;
      const c = document.getElementById('c');
      c.width = cols * TW + (cols - 1) * GAP;
      c.height = Math.ceil(n / cols) * (TH + LAB + GAP);
      const x = c.getContext('2d');
      x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
    }, [tiles.length, cols]);
    for (let i = 0; i < tiles.length; i++) {
      await sheeter.evaluate(async ([src, label, i, cols]) => {
        const TW = 216, TH = 384, LAB = 26, GAP = 4;
        const im = await createImageBitmap(await (await fetch(src)).blob());
        const x = document.getElementById('c').getContext('2d');
        x.font = '600 15px system-ui, sans-serif'; x.textBaseline = 'middle'; x.imageSmoothingQuality = 'high';
        const cx = (i % cols) * (TW + GAP), cy = Math.floor(i / cols) * (TH + LAB + GAP);
        x.fillStyle = '#fff'; x.fillText(label, cx + 6, cy + LAB / 2);
        x.drawImage(im, cx, cy + LAB, TW, TH);
        im.close();
      }, ['data:image/png;base64,' + fs.readFileSync(tiles[i].file).toString('base64'), tiles[i].label, i, cols]);
    }
    const url = await sheeter.evaluate(() => document.getElementById('c').toDataURL('image/jpeg', 0.84));
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  }

  // One piece in its iframe, with the clock at t0 and data from the first moment.
  async function open(t0, spec) {
    const page = await context.newPage();
    const logs = [];
    page.on('pageerror', (e) => logs.push('pageerror: ' + String(e.message || e).slice(0, 300)));
    await page.goto(ORIGIN + '/__tt.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await page.evaluate(([spec, t0, url]) => { window.__iv = setInterval(() => window.post(spec, t0), 40); window.start(url); },
      [spec, t0, `/visual.html?id=${encodeURIComponent(id)}&embed=1&key=k&manual=1&seed=7&slot=1000&warm=${GL ? 3 : 6}&scale=1&fakeNow=${t0}`]);
    let frame = null;
    const t = Date.now();
    while (Date.now() - t < 180000) {
      frame = page.frames().find((f) => f.url().includes('visual.html'));
      if (frame) {
        const st = await frame.evaluate(() => (window.__viz ? { ready: !!window.__viz.ready, error: window.__viz.error } : null)).catch(() => null);
        if (st && (st.ready || st.error)) break;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    await page.evaluate(() => clearInterval(window.__iv));
    return { page, frame, logs, now: t0 };
  }

  const STEP = Number(opt('step', 60)) * 1000;
  const report = { id, wx: WX, date: DATE, sweeps: [] };
  // dusk: every minute from 45 min before sunset to 45 min after; dawn: every two minutes around sunrise
  const SWEEPS = [
    { name: 'dusk', from: sun.set - 45 * 60000, n: Math.round((90 * 60000) / STEP) + 1, step: STEP },
    { name: 'dawn', from: sun.rise - 45 * 60000, n: Math.round((90 * 60000) / (2 * STEP)) + 1, step: 2 * STEP },
  ];
  for (const sw of SWEEPS) {
    const s = await open(sw.from, { wx: WX });
    const texts = new Map(); // text -> { min, at, first, last }
    const tiles = [];
    const flat = [];
    let errors = [];
    for (let i = 0; i < sw.n; i++) {
      if (i > 0) {
        // the clock jumps a step (a piece goes straight to the new state), fresh readings arrive, then it settles
        s.now += sw.step;
        await s.page.evaluate(([spec, ms]) => window.post(spec, ms), [{ wx: WX }, Math.round(s.now)]);
        await s.page.waitForTimeout(30);
        s.now = await s.frame.evaluate(([now, n, dt]) => {
          window.__setNow(now); window.__viz.advance(dt, dt);
          for (let k = 0; k < n; k++) { now += dt * 1000; window.__setNow(now); window.__viz.advance(dt, dt); }
          return now;
        }, [s.now, Math.round((GL ? 1 : 1.5) / DT), DT]);
      }
      await s.frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = path.join(OUT, 'frames', `${sw.name}-${String(i).padStart(2, '0')}.png`);
      await s.page.screenshot({ path: file });
      const c = await s.frame.evaluate(COLLECT);
      errors = c.errors;
      const m = await measure(file, c.boxes);
      const label = `${c.text.time} ${c.text.ampm}  d ${c.daylight}`;
      tiles.push({ label, file });
      flat.push({ i, label, mean: m.mean });
      c.boxes.forEach((b, k) => {
        const r = m.ratios[k];
        if (r == null || b.h < 14) return;
        // digits of the time change every minute: key them by place instead of by text
        const isTime = b.s === c.text.hh || b.s === c.text.mm || b.s === c.text.time || /^\d{1,2}$/.test(b.s) && b.fs >= 150;
        const key = isTime ? `(time numerals near x${Math.round(b.x / 60) * 60} y${Math.round(b.y / 60) * 60})` : b.s;
        const e = texts.get(key) || { min: 99, at: '', frame: -1, fs: b.fs, first: r, time: isTime };
        if (r < e.min) { e.min = r; e.at = label; e.frame = i; }
        e.last = r;
        texts.set(key, e);
      });
    }
    await s.page.close();
    const half = Math.ceil(tiles.length / 2);
    const sheets = [];
    for (let k = 0; k * 50 < tiles.length; k++) {
      const f = path.join(OUT, `${sw.name}-${k + 1}.jpg`);
      await sheet(tiles.slice(k * 50, k * 50 + 50), f);
      sheets.push(f);
    }
    const list = [...texts.entries()].map(([s, e]) => ({ text: s.slice(0, 60), min: e.min, at: e.at, frame: e.frame, start: e.first, end: e.last, size: e.fs, time: !!e.time }))
      .sort((a, b) => a.min - b.min);
    const weak = list.filter((t) => t.min < 3 && Math.min(t.start, t.end) > t.min * 1.25);
    report.sweeps.push({ name: sw.name, frames: tiles.length, sheets, weakest: list.slice(0, 14), dips: weak, errors });
    out(`${sw.name}: ${tiles.length} frames; lowest contrast: ${list.slice(0, 4).map((t) => `"${t.text.slice(0, 22)}" ${t.min} at ${t.at.split('  ')[0]}`).join(' | ')}`);
    if (weak.length) out(`   DIPS (under 3:1 in mid-sweep, better at both ends): ${weak.slice(0, 6).map((t) => `"${t.text.slice(0, 22)}" ${t.min} (frame ${t.frame}, ${t.at.split('  ')[0]}; ${t.start} -> ${t.end})`).join(' | ')}`);
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  }
  await browser.close();
  out(`report: ${path.join(OUT, 'report.json')}`);
})().catch((e) => { out('ERR ' + (e.stack || e.message)); process.exit(1); });

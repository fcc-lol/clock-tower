// Runs one piece through the moments that change it WHILE it is on screen (the minute and the
// hour ticking over, midnight, sunset, the weather data changing, a fact appearing or going),
// then compares what it looks like afterwards with a fresh start at that same instant with that
// same data. A piece that looks different after living through a change than it does started
// fresh has kept something stale: a size fitted to the old text, a panel sized for the old fact,
// a node it forgot to remove.
//
//   node scripts/transitions.cjs <id> [--cases a,b,c] [--out dir] [--port 5173] [--list]
//
// Writes <out>/<case>.jpg (before | during | during | after | fresh | difference) and
// <out>/report.json, and prints one line per case. <out> defaults to shots/transitions/<id>
// (or $SHOOT_OUT/transitions/<id>).
//
// Needs the dev server running (npm run dev) and Playwright, like scripts/shoot.js.
//
// How: the piece runs in an iframe of a page on the dev server (port 5173), as it does on the
// display: embed mode, data by postMessage. The clock is the page's own Date.now, replaced here
// by one this script moves; the animation is stepped by hand (manual mode), so nothing depends
// on how busy the machine is.
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

// Every case: where it starts (New York local time, or a named instant worked out in the page),
// the data it starts with, what then happens, and the data a fresh start gets at the end.
// run: seconds of clock and animation. lapse: [seconds of animation, clock rate]. data: a new
// bundle arrives. shot: keep a picture of this moment.
// After new weather data the cases let five minutes of clock pass (in half a minute of animation):
// the shared state glides the sky's colours to a new reading over a couple of minutes, and a
// piece is only expected to look like a fresh start once that glide is over.
const SETTLE = 14; // seconds after the last event before the "after" picture
const CASES = [
  { name: 'minute', about: 'the minute ticks over: 12:40 -> 12:41 PM', at: '2026-07-14T12:40:52', d0: { wx: 'clear' }, steps: [{ run: 9 }, { shot: '+1s' }, { run: 3 }, { shot: '+4s' }, { run: SETTLE }] },
  { name: 'ten-minutes', about: 'both minute digits change: 2:49 -> 2:50 PM', at: '2026-11-27T14:49:52', d0: { wx: 'overcast' }, steps: [{ run: 9 }, { shot: '+1s' }, { run: 3 }, { shot: '+4s' }, { run: SETTLE }] },
  { name: 'hour', about: 'the hour changes, same number of digits: 2:59 -> 3:00 PM', at: '2026-10-08T14:59:52', d0: { wx: 'rain' }, steps: [{ run: 9 }, { shot: '+1s' }, { run: 3 }, { shot: '+4s' }, { run: SETTLE }] },
  { name: 'hour-9-to-10', about: 'the hour gains a digit: 9:59 -> 10:00 AM', at: '2026-04-22T09:59:52', d0: { wx: 'partly' }, steps: [{ run: 9 }, { shot: '+1s' }, { run: 3 }, { shot: '+4s' }, { run: SETTLE }] },
  { name: 'hour-12-to-1', about: 'the hour loses a digit: 12:59 -> 1:00 PM', at: '2026-07-14T12:59:52', d0: { wx: 'clear' }, steps: [{ run: 9 }, { shot: '+1s' }, { run: 3 }, { shot: '+4s' }, { run: SETTLE }] },
  { name: 'noon', about: 'AM becomes PM and 11 becomes 12: 11:59 AM -> 12:00 PM', at: '2026-11-27T11:59:52', d0: { wx: 'overcast' }, steps: [{ run: 9 }, { shot: '+1s' }, { run: 3 }, { shot: '+4s' }, { run: SETTLE }] },
  { name: 'midnight', about: 'midnight: 11:59 PM Wednesday, December 9 -> 12:00 AM Thursday, December 10. The old day\'s short fact goes at midnight; six seconds later the new day\'s facts arrive (a long, two-line one)', at: '2026-12-09T23:59:52', d0: { wx: 'clear', ov: { fact: 0 }, day: 'December 9' }, steps: [{ run: 14 }, { shot: '12:00:06, no fact yet' }, { data: { wx: 'clear', ov: { fact: 6 }, day: 'December 10' } }, { run: 3 }, { shot: 'new fact +3s' }, { run: SETTLE }] },
  { name: 'sunset', about: 'the sun sets: "Sunset in 1m" becomes "Sunrise in 12h ..."', at: 'sunset-12s:2026-10-08', d0: { wx: 'overcast' }, steps: [{ run: 13 }, { shot: '+1s' }, { run: 3 }, { shot: '+4s' }, { run: SETTLE }] },
  { name: 'moon-name', about: 'the moon phase gets a new, longer name while the piece is up', at: 'moonchange-8s:2026-11-20', d0: { wx: 'clear' }, steps: [{ run: 9 }, { shot: '+1s' }, { run: 3 }, { shot: '+4s' }, { run: SETTLE }] },
  { name: 'clear-to-storm', about: 'the weather reading changes at night: clear, 72 degrees -> thunderstorm, 74 degrees, gusts of 44 mph', at: '2026-08-03T21:10:00', d0: { wx: 'clear' }, steps: [{ run: 4 }, { data: { wx: 'storm' } }, { run: 2 }, { shot: '+2s' }, { run: 8 }, { shot: '+10s' }, { lapse: [30, 10] }, { run: SETTLE }] },
  { name: 'storm-to-clear', about: 'the weather reading changes by day: thunderstorm -> clear sky', at: '2026-07-14T15:00:00', d0: { wx: 'storm' }, steps: [{ run: 4 }, { data: { wx: 'clear' } }, { run: 2 }, { shot: '+2s' }, { run: 8 }, { shot: '+10s' }, { lapse: [30, 10] }, { run: SETTLE }] },
  { name: 'snow-to-heat', about: 'an extreme swing (not real weather, a stress test): heavy snow, 19 degrees -> heat wave, 97 degrees, AQI 152', at: '2027-02-02T13:00:00', d0: { wx: 'blizzard' }, steps: [{ run: 4 }, { data: { wx: 'heat' } }, { run: 2 }, { shot: '+2s' }, { run: 8 }, { shot: '+10s' }, { lapse: [30, 10] }, { run: SETTLE }] },
  { name: 'fact-grows', about: 'a short fact is replaced by the longest one (76 characters, two lines)', at: '2026-04-22T10:20:00', d0: { wx: 'partly', ov: { fact: 2 } }, steps: [{ run: 4 }, { data: { wx: 'partly', ov: { fact: 6 } } }, { run: 2 }, { shot: '+2s' }, { run: SETTLE }] },
  { name: 'fact-shrinks', about: 'the longest fact is replaced by a short one', at: '2026-04-22T10:20:00', d0: { wx: 'partly', ov: { fact: 6 } }, steps: [{ run: 4 }, { data: { wx: 'partly', ov: { fact: 2 } } }, { run: 2 }, { shot: '+2s' }, { run: SETTLE }] },
  { name: 'fact-goes', about: 'a two-line fact goes away (no facts in the new data)', at: '2026-08-03T20:20:00', d0: { wx: 'partly', ov: { fact: 1 } }, steps: [{ run: 4 }, { data: { wx: 'partly', nofacts: true } }, { run: 2 }, { shot: '+2s' }, { run: SETTLE }] },
  { name: 'data-arrives-late', about: 'the piece starts with no data at all ("No weather data", no fact) and the first readings arrive three seconds later, as happens on the display when the network is slow', at: '2026-04-22T16:30:00', d0: null, steps: [{ run: 3 }, { data: { wx: 'partly', ov: { fact: 4 } } }, { run: 2 }, { shot: '+2s' }, { run: 8 }, { shot: '+10s' }, { lapse: [30, 10] }, { run: SETTLE }] },
  { name: 'data-lost', about: 'the readings are lost while the piece is up: rain, 55 degrees and a fact -> no weather data, no air quality, no fact', at: '2026-10-08T16:30:00', d0: { wx: 'rain', ov: { fact: 4 } }, steps: [{ run: 4 }, { data: { none: true } }, { run: 2 }, { shot: '+2s' }, { run: 8 }, { shot: '+10s' }, { lapse: [30, 10] }, { run: SETTLE }] },
  { name: 'temp-99-to-100', about: 'the temperature gains a digit: 99 -> 100 degrees', at: '2026-07-21T15:30:00', d0: { wx: 'heat', ov: { temp: 99 } }, steps: [{ run: 4 }, { data: { wx: 'heat', ov: { temp: 100 } } }, { run: 2 }, { shot: '+2s' }, { lapse: [30, 10] }, { run: SETTLE }] },
  { name: 'temp-below-zero', about: 'the temperature drops below zero: 2 -> -4 degrees', at: '2027-01-22T06:30:00', d0: { wx: 'cold', ov: { temp: 2 } }, steps: [{ run: 4 }, { data: { wx: 'cold', ov: { temp: -4 } } }, { run: 2 }, { shot: '+2s' }, { lapse: [30, 10] }, { run: SETTLE }] },
  { name: 'dusk-hour', about: 'an hour of clock in a minute (sixty minute changes, day turning to night), then settled: is anything left over, and has the page grown?', at: 'sunset-1500s:2026-07-14', d0: { wx: 'partly' }, steps: [{ lapse: [20, 60] }, { shot: 'after 20 min' }, { lapse: [20, 60] }, { shot: 'after 40 min' }, { lapse: [20, 60] }, { data: { wx: 'partly' } }, { run: SETTLE }], grows: true },
];

if (flagAt('list') >= 0 || !id) {
  for (const c of CASES) out(`${c.name.padEnd(20)} ${c.about}`);
  if (!id) out('\nusage: node scripts/transitions.cjs <id> [--cases a,b] [--out dir]');
  process.exit(0);
}

const OUT = path.resolve(opt('out', path.join(process.env.SHOOT_OUT || path.join(ROOT, 'shots'), 'transitions', id)));
fs.mkdirSync(OUT, { recursive: true });
const only = opt('cases', '') ? opt('cases', '').split(',') : null;
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

function compareBoxes(after, fresh, tol = 10) {
  const pool = fresh.map((x) => ({ ...x, used: false }));
  const moved = [], extra = [], missing = [];
  for (const x of after) {
    const cands = pool.filter((p) => !p.used && p.s === x.s);
    if (!cands.length) { extra.push({ s: x.s, at: [x.x, x.y, x.w, x.h], fs: x.fs }); continue; }
    cands.sort((p, q) => Math.hypot(p.x - x.x, p.y - x.y) - Math.hypot(q.x - x.x, q.y - x.y));
    const m = cands[0];
    m.used = true;
    const d = { dx: x.x - m.x, dy: x.y - m.y, dw: x.w - m.w, dh: x.h - m.h, dfs: +(x.fs - m.fs).toFixed(1) };
    if (Math.abs(d.dx) > tol || Math.abs(d.dy) > tol || Math.abs(d.dw) > tol || Math.abs(d.dh) > tol || Math.abs(d.dfs) > 0.6) moved.push({ s: x.s, after: [x.x, x.y, x.w, x.h, x.fs], fresh: [m.x, m.y, m.w, m.h, m.fs], ...d });
  }
  for (const p of pool) if (!p.used) missing.push({ s: p.s, at: [p.x, p.y, p.w, p.h], fs: p.fs });
  return { moved, extra, missing };
}

(async () => {
  const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const context = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, timezoneId: 'America/New_York' });
  await context.route('**/@vite/client', (route) => route.fulfill({ contentType: 'application/javascript', body: INERT_CLIENT }));
  await context.route('**/__tt.html', (route) => route.fulfill({ contentType: 'text/html', body: HOST_PAGE }));
  await context.addInitScript(FAKE_CLOCK);

  // One piece in its iframe, with the clock at t0 and (unless spec is null) data from the first moment.
  async function open(t0, spec) {
    const page = await context.newPage();
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) logs.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => logs.push('pageerror: ' + String(e.message || e).slice(0, 300)));
    await page.goto(ORIGIN + '/__tt.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await page.evaluate(([spec, t0, url]) => {
      if (spec) window.__iv = setInterval(() => window.post(spec, t0), 40);
      window.start(url);
    }, [spec, t0, `/visual.html?id=${encodeURIComponent(id)}&embed=1&key=k&manual=1&seed=7&slot=1000&warm=${GL ? 3 : 6}&scale=1&fakeNow=${t0}`]);
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
    const error = frame ? await frame.evaluate(() => window.__viz?.error || (window.__viz?.ready ? null : 'never became ready')).catch((e) => String(e.message)) : 'no frame';
    return { page, frame, logs, now: t0, error };
  }
  async function run(s, seconds, rate = 1) {
    let left = Math.max(1, Math.round(seconds / DT));
    const chunk = Math.max(1, Math.round((GL ? 1 : 3) / DT));
    while (left > 0) {
      const n = Math.min(chunk, left);
      s.now = await s.frame.evaluate(([now, n, dt, rate]) => {
        for (let i = 0; i < n; i++) { now += dt * 1000 * rate; window.__setNow(now); window.__viz.advance(dt, dt); }
        return now;
      }, [s.now, n, DT, rate]);
      left -= n;
    }
  }
  const paint = (s) => s.frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  async function shot(s, file) {
    await paint(s);
    await s.page.screenshot({ path: file });
    return file;
  }

  // The comparison sheet, drawn in a page: the pictures side by side and the difference between the last two.
  const cmp = await context.newPage();
  await cmp.setContent('<canvas id="c"></canvas>');
  async function sheet(tiles, file) {
    const payload = tiles.map((t) => ({ label: t.label, src: 'data:image/png;base64,' + fs.readFileSync(t.file).toString('base64') }));
    const res = await cmp.evaluate(async (tiles) => {
      const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const TW = 360, TH = 640, LAB = 34, GAP = 6;
      const imgs = await Promise.all(tiles.map((t) => load(t.src)));
      const n = imgs.length + 1;
      const c = document.getElementById('c');
      c.width = n * TW + (n - 1) * GAP;
      c.height = TH + LAB;
      const x = c.getContext('2d');
      x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
      x.font = '600 17px system-ui, sans-serif'; x.textBaseline = 'middle';
      imgs.forEach((im, i) => {
        x.fillStyle = '#fff'; x.fillText(tiles[i].label, i * (TW + GAP) + 8, LAB / 2);
        x.imageSmoothingQuality = 'high';
        x.drawImage(im, i * (TW + GAP), LAB, TW, TH);
      });
      // difference between the last two (after, fresh)
      const px = (im) => { const k = document.createElement('canvas'); k.width = TW; k.height = TH; const g = k.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, TW, TH); return g.getImageData(0, 0, TW, TH); };
      const A = px(imgs[imgs.length - 2]).data, B = px(imgs[imgs.length - 1]).data;
      const D = x.createImageData(TW, TH);
      let sum = 0, big = 0;
      // where: share of strongly different pixels in each of six bands down the frame
      const bands = [0, 0, 0, 0, 0, 0];
      for (let i = 0, p = 0; i < A.length; i += 4, p++) {
        const d = (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2])) / 3;
        sum += d;
        if (d > 40) { big++; bands[Math.min(5, Math.floor((p / TW / TH) * 6))]++; }
        const v = Math.min(255, d * 4);
        D.data[i] = v; D.data[i + 1] = d > 40 ? 60 : v; D.data[i + 2] = d > 40 ? 60 : v; D.data[i + 3] = 255;
      }
      x.putImageData(D, imgs.length * (TW + GAP), LAB);
      x.fillStyle = '#fff'; x.fillText('difference (after vs fresh)', imgs.length * (TW + GAP) + 8, LAB / 2);
      return { url: c.toDataURL('image/jpeg', 0.86), mean: +(sum / (TW * TH)).toFixed(2), bigShare: +((100 * big) / (TW * TH)).toFixed(2), bands: bands.map((b) => +((100 * b) / (TW * TH / 6)).toFixed(1)) };
    }, payload);
    fs.writeFileSync(file, Buffer.from(res.url.split(',')[1], 'base64'));
    return { mean: res.mean, bigShare: res.bigShare, bands: res.bands };
  }

  const report = { id, gl: GL, dt: +DT.toFixed(4), out: OUT, cases: [] };
  const helper = await context.newPage();
  await helper.goto(ORIGIN + '/__tt.html', { waitUntil: 'load' });
  await helper.waitForFunction(() => window.ready, null, { timeout: 30000 });

  for (const c of CASES) {
    if (only && !only.includes(c.name)) continue;
    const started = Date.now();
    const entry = { name: c.name, about: c.about, flags: [] };
    const tmp = (label) => path.join(OUT, `.${c.name}.${label}.png`);
    let a = null, f = null;
    try {
      const t0 = await helper.evaluate((s) => window.resolveAt(s), c.at);
      a = await open(t0, c.d0);
      if (a.error) throw new Error('at the start: ' + String(a.error).split('\n')[0]);
      const tiles = [{ label: 'before', file: await shot(a, tmp('0')) }];
      const before = await a.frame.evaluate(COLLECT);
      let last = c.d0, k = 1, maxMs = 0;
      for (const st of c.steps) {
        if (st.run) await run(a, st.run);
        else if (st.lapse) await run(a, st.lapse[0], st.lapse[1]);
        else if (st.data) {
          last = st.data;
          await a.page.evaluate(([spec, ms]) => window.post(spec, ms), [st.data, Math.round(a.now)]);
          await a.page.waitForTimeout(80);
        } else if (st.shot) tiles.push({ label: st.shot, file: await shot(a, tmp(String(k++))) });
      }
      tiles.push({ label: 'after', file: await shot(a, tmp('after')) });
      const after = await a.frame.evaluate(COLLECT);
      maxMs = after.stats.maxMs;
      // the same instant, the same data, started fresh
      f = await open(Math.round(a.now), last);
      if (f.error) throw new Error('fresh start: ' + String(f.error).split('\n')[0]);
      await run(f, 0.001); // one step, so a fresh start has had the same last tick
      tiles.push({ label: 'fresh start', file: await shot(f, tmp('fresh')) });
      const fresh = await f.frame.evaluate(COLLECT);

      entry.from = { time: `${before.text.time} ${before.text.ampm}`, date: before.text.date, temp: before.text.temp, condition: before.text.condition, sun: `${before.text.sunLabel} ${before.text.sunValue}`, moon: before.text.moon, aqi: before.text.aqi, uv: before.text.uv, fact: before.text.factValue };
      entry.to = { time: `${after.text.time} ${after.text.ampm}`, date: after.text.date, temp: after.text.temp, condition: after.text.condition, sun: `${after.text.sunLabel} ${after.text.sunValue}`, moon: after.text.moon, aqi: after.text.aqi, uv: after.text.uv, fact: after.text.factValue };
      const keys = ['time', 'ampm', 'date', 'temp', 'condition', 'sunLabel', 'sunValue', 'moon', 'aqi', 'uv', 'factLabel', 'factValue'];
      const differ = keys.filter((k) => after.text[k] !== fresh.text[k]);
      if (differ.length) entry.flags.push(`TEST PROBLEM, not the piece: the two runs were not at the same instant (${differ.map((k) => `${k}: "${after.text[k]}" vs "${fresh.text[k]}"`).join('; ')})`);
      entry.image = path.join(OUT, `${c.name}.jpg`);
      entry.diff = await sheet(tiles, entry.image);
      entry.boxes = compareBoxes(after.boxes, fresh.boxes);
      entry.textNodes = { after: after.boxes.length, fresh: fresh.boxes.length };
      for (const key of ['moved', 'extra', 'missing']) if (entry.boxes[key].length > 30) entry.boxes[key] = entry.boxes[key].slice(0, 30).concat([{ s: `... and ${entry.boxes[key].length - 30} more` }]);
      const errs = [...new Set([...(after.errors || []), ...a.logs, ...(fresh.errors || []), ...f.logs])];
      if (after.error) errs.unshift('the piece failed: ' + String(after.error).split('\n')[0]);
      entry.errors = errs.slice(0, 6);
      entry.maxFrameMs = maxMs;
      entry.nodes = { before: before.stats.nodes, after: after.stats.nodes, fresh: fresh.stats.nodes };
      entry.heapKb = { before: before.heapKb, after: after.heapKb, fresh: fresh.heapKb };
      if (entry.errors.length) entry.flags.push('errors');
      if (entry.boxes.moved.length) entry.flags.push(`${entry.boxes.moved.length} text(s) placed or sized differently than after a fresh start`);
      if (entry.boxes.extra.length) entry.flags.push(`${entry.boxes.extra.length} text(s) on screen that a fresh start does not show`);
      if (entry.boxes.missing.length) entry.flags.push(`${entry.boxes.missing.length} text(s) a fresh start shows are missing`);
      if (entry.diff.bigShare > 6) entry.flags.push(`the picture differs from a fresh start over ${entry.diff.bigShare}% of the frame (by sixths, top to bottom: ${entry.diff.bands.join(', ')}%)`);
      if (after.stats.nodes > fresh.stats.nodes + 12) entry.flags.push(`${after.stats.nodes - fresh.stats.nodes} more elements in the page than after a fresh start (${after.stats.nodes} vs ${fresh.stats.nodes})`);
      if (c.grows && after.heapKb && before.heapKb && after.heapKb - before.heapKb > 6000) entry.flags.push(`the page's memory grew by ${after.heapKb - before.heapKb} KB over the hour`);
      if (maxMs > 60 && maxMs > before.stats.maxMs) entry.flags.push(`one frame during the change took ${maxMs} ms (the machine is busy: run the case again before believing it)`);
    } catch (err) {
      entry.flags.push('COULD NOT RUN: ' + String(err.message || err).split('\n')[0].slice(0, 240));
    }
    for (const s of [a, f]) if (s) await s.page.close().catch(() => {});
    for (const file of fs.readdirSync(OUT)) if (file.startsWith(`.${c.name}.`)) fs.unlinkSync(path.join(OUT, file));
    entry.seconds = Math.round((Date.now() - started) / 1000);
    report.cases.push(entry);
    out(`${entry.flags.length ? 'LOOK' : 'same'}  ${c.name.padEnd(20)} ${entry.to ? `${entry.from.time} -> ${entry.to.time}`.padEnd(22) : ''.padEnd(22)} ${entry.diff ? `diff ${String(entry.diff.bigShare).padStart(5)}%` : ''}  ${entry.flags.join(' | ')}`);
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  }
  await browser.close();
  out(`report: ${path.join(OUT, 'report.json')}`);
})().catch((e) => { out('ERR ' + (e.stack || e.message)); process.exit(1); });

# Visualizations

Every `.js` file in this folder is one visualization: a full-screen, code-drawn, live piece that shows the time and the conditions in Long Island City. The display shows one at a time and cuts to the next on every quarter hour. The file name is the id (`flip-dots.js` is `flip-dots`). A name starting with `_` is left out of the rotation and the gallery, which is how to park a draft (it can still be opened by id).

A piece is art first. The weather and the hour drive it (its forces, colors, density, speed, materials, mood); they are not plotted. **No sun or moon graphs, and nothing that reads as a chart, graph, gauge, dial or diagram**: no axes, no plotted curves, no tick scales, no dashboards.

## The contract

```js
import { W, H, el, addStyle, canvas2d, rng, mix } from "../lib/kit.js";

export default {
  title: "Flip Dots",                       // shown in the gallery
  description: "One sentence for the gallery.",
  fonts: ["Space Grotesk:wght@400;700"],    // Google Fonts, css2 family syntax; loaded before mount()
  fps: 30,                                  // optional. 30 is the default; go lower for slow pieces, never above 60

  // Called once. Build everything inside `root`, a 1080 x 1920 box. Return the frame function.
  mount(root, { state, seed, W, H }) {
    // ... create canvases, SVG, DOM
    return {
      frame(state) {
        // Called for every frame with the current state. Draw.
      },
    };
  },
};
```

- `root` is 1080 x 1920 CSS pixels with a black background and `overflow: hidden`. Position children absolutely. The page belongs to your piece alone (it runs in its own iframe), so plain class names and a `<style>` are fine.
- `state` is the same object every frame, updated in place. Everything you may read is in it (see below). It is always complete: when live data is missing, typical values stand in, so you never have to check for null. Read `state.hours`, `state.pastHours` and `state.sky.day` from `state` each time you use them rather than keeping a reference: those arrays are rebuilt when new data arrives.
- `seed` (also `state.seed`) is an integer that is stable for one showing and differs between showings. Use it for anything arranged at random.
- The runner calls `frame`. The piece never calls `requestAnimationFrame`, `setTimeout` or `setInterval`, adds no listeners to `window` or `document`, makes no network requests, and stores nothing. When its 15 minutes are up the whole page is thrown away, so there is nothing to clean up.
- **Never use `Math.random()`, `Date.now()`, `new Date()` or `performance.now()`.** Time is `state.t` (seconds of animation since mount), `state.dt` (seconds since the last frame: at most 0.1, and 0 on the first frame, so never divide by it) and `state.ms` (the instant being shown). Randomness is `rng(seed)`. The same seed and the same state must give the same picture: the test harness steps time by hand, and the gallery runs the clock at other speeds.
- **Animate from `frame()`.** CSS `@keyframes` animations, long CSS transitions and SMIL run on the browser's own clock: the harness cannot step them, so they cannot be checked, and they ignore the rules above. Set `transform`, `opacity` and the like from `frame()` instead. (A CSS transition of a fraction of a second on a one-off change is fine.)
- You may import from `../lib/kit.js` (the toolkit), `../lib/astro.js` and `../lib/time.js`. Nothing else, and no npm packages.

## What every piece must show

There is no separate text overlay: the piece itself presents all of these, as part of its design. Use the strings in `state.text` exactly as given.

| readout | from | example |
| --- | --- | --- |
| the time, the dominant element | `text.time` + `text.ampm` (or `text.hh`, `text.mm`) | `12:45` `PM` |
| the date | `text.date` (or `text.weekday`, `text.monthDay`) | `Friday, November 27` |
| temperature and condition | `text.temp`, `text.condition` | `51°` `Overcast` |
| countdown to the next sunrise or sunset | `text.sunLabel`, `text.sunValue` | `Sunset in` `3h 58m` |
| moon phase, by name | `text.moon` | `Waning Gibbous` |
| air quality index | `text.aqi` | `42` |
| UV index | `text.uv` | `1` |
| today's fact: a label and a line that may wrap | `text.factLabel`, `text.factValue` | `On this day in 1895` / `Alfred Nobel Signs the Will That Establishes the Nobel Prizes` |

Rules for the readouts:

- **The time must be readable from across a room**: its digits at least 170 px tall (a font size of roughly 240 px or more in most faces), in strong contrast (3:1 or better against whatever is behind every part of it, in every condition). If the time is made of the artwork itself (dots, tiles, particles), it must still read instantly; when in doubt, also set it plainly.
- Temperature is the second thing: at least 90 px. Date and condition: at least 44 px. Other values: at least 36 px. Small labels ("Air quality"): at least 24 px. Contrast for all of these: 4.5:1 or better against what is actually behind them, at noon and at midnight.
- Keep text at least 64 px from the edges of the frame.
- **Give everything room, lines above all.** The owner has asked for this twice ("make sure there's enough gap between sections and lines", then "more gaps between lines generally"). Between stacked lines of type, measured ink to ink (the lowest ink of one line to the highest ink of the next): at least about 40 px, whether they are separate readouts, the lines of a wrapped date, condition, moon name or fact, or rows of signs and tags. A wrapped line of text: line height 1.4 or more. Between a label and its own value: at least about 16 px. Between sections (the time, the date, temperature and condition, the group of small readouts, the fact): at least about 64 px of clear space, more around the time; no block may crowd or touch its neighbour, a rule or the edge of a panel. Between columns in a row: at least about 48 px, so two values never read as one. Aim for generous, not just legal: squint, and every line should stand on its own. When space is short, keep the minimum sizes and give up decoration or dead space, or give a readout a place of its own, rather than closing the lines up.
- Things vary in width and may be missing. The time runs from `1:11` to `12:00`. The fact may be 80 characters (let it wrap to two lines, never overflow or collide) or empty (`text.factValue === ""`: hide the whole fact block). With no weather data `text.temp` is `–°`, `text.condition` is `No weather data`, `text.aqi` and `text.uv` are `–`. Design for those.
- Set type in DOM or SVG, not on a canvas: the browser draws DOM text at the panel's full 4K resolution, while a canvas is upscaled. Only when the letters are themselves part of a simulation should they be drawn on a canvas.
- Update a text node only when its string changes (see the `put` helper in the example below), not every frame.

## The look, and living in a room

- **Dark at night.** When `state.daylight` is below about 0.15 the frame must be dark overall: no large light areas (as a guide, an average brightness under about 22%). It hangs in a room and must not light it up at 2 AM. By day it may be light or dark. Move the ground between the two continuously with `state.daylight`, never with a jump.
- **Ink switches; it never fades.** If the ground goes from light to dark, type on it has to go from dark to light, and an ink that fades along with the ground passes through the ground's own grey and vanishes for minutes at every sunrise and sunset. Switch the ink in one step where the ground is mid-grey (`readableOn(bg, light, dark)` picks the right one), and make that passage short: keep the ground out of mid-grey for as much of twilight as you can, and use near-white and near-black inks, since at the switch even those only just reach 4.5:1. The `overcast-sunset-fall` scenario sits in that passage: every readout must be legible in it.
- **Calm but alive.** Something should always be visibly moving, and nothing should flash, strobe, jitter or race. Motion should be slow enough to live with all day. Lightning, if any, is a soft, rare brightening, not a flash.
- **True.** A viewer should be able to feel the actual conditions: the wind in the picture is the real wind (its speed, and its direction where that makes sense), rain falls when and as hard as it is raining, cloud is as thick as the cloud, the colors of the sky are the colors measured from the tower. Make clear weather, overcast, rain, snow, storm, fog, heat and cold, and day and night, look clearly different from each other.
- **Finished from the first frame.** The piece is cut to, not faded in. If it simulates something that needs time to build up, run that in `mount()` so the first frame already looks right.
- **The clock can jump.** The gallery and the test tool run the clock fast, and a laptop wakes from sleep. If `state.ms` moves by more than a few seconds between two frames, go straight to the new state instead of playing a transition toward it (a minute-change animation caught mid-way in every frame of a time-lapse looks broken).
- **Banding.** Smooth dark gradients band badly on a big LCD. Finish with `grain(root)` or dither in your shader.
- Have one strong idea and commit to it. Choose typefaces and a palette that belong to that idea. Use the whole tall frame on purpose.

## Performance

It runs for hours on a Raspberry Pi driving a 4K panel. The rule of thumb: `frame()` should average under about 4 ms, with the 95th percentile under 8 ms, in the numbers `scripts/shoot.js` reports (the Pi is several times slower than that machine). That figure is only the JavaScript inside `frame()`; what the browser does afterwards (layout, paint, filling canvases, running a shader) shows up in the frame rate the tool reports from a few seconds of real time, which should hold at the piece's `fps`.

- `mount()` must be quick: well under 100 ms on the test machine (`scripts/shoot.js` reports it). On the display the next piece is mounted while the current one is still on screen. Everywhere but the kiosk that is on the same thread, so a slow mount freezes the picture people are looking at; on the kiosk it is another process on the same small machine, and still steals from it. If something needs time to build up, seed it analytically or step it coarsely, and remember it also gets about 45 seconds of unseen frames before it is cut to.
- Canvas: at most a few thousand simple moving primitives. Batch them (one `beginPath`, many segments, one `stroke`). Keep state in typed arrays and allocate nothing inside `frame` (no arrays, objects, closures or strings in hot loops).
- Never per frame: `shadowBlur`, `ctx.filter`, `getImageData`/`putImageData` on large areas, creating gradients or canvases, measuring text. All of those are fine once, in `mount()`: draw anything static into its own layer there.
- DOM/SVG: animate with `transform` and `opacity` on at most a few hundred nodes; do not rewrite big paths or restyle large areas every frame. No CSS `filter`, `backdrop-filter` or `mix-blend-mode` on large or moving layers, and no animated SVG filters.
- Shaders: one pass, a few octaves of noise, no long loops. They run at half resolution by default, which suits soft imagery. Call `draw()` every frame (or create the layer with `adaptive: false` if it is drawn once). Uniforms are floats and vectors of 2 to 4 floats. Put something acceptable behind the layer: it is hidden if the shader cannot run on this machine.
- Surfaces size themselves (see the kit). Mark a canvas `adaptive: true` only if you redraw all of it every frame.
- Every full-screen layer is blended on every frame, moving or not. Keep them few: paint grain and texture into a ground you already have rather than laying another layer over everything, and take a layer out (`display: none`) while it is fully transparent.
- Clear a canvas whole. Clearing only part of an adaptive canvas each frame has cost seconds per frame in testing.
- For thousands of small shapes, filling is several times cheaper than stroking.

## `state`

Angles are degrees; azimuths and wind directions are compass bearings (0 north, 90 east). Temperatures are Fahrenheit, wind is mph, precipitation is inches per hour, times are epoch milliseconds.

```
t, dt, frame        animation clock: seconds since mount, seconds since last frame, frame count
ms, now             the instant being shown (epoch ms, and the same as a Date)
seed, slot          stable per showing
daylight            0 (night) .. 1 (full day), smooth through twilight. The master dial for light and dark.

clock   h24, h12, m, s           numbers (New York time, always)
        hh, mm, ss, ampm, time   "12", "45", "07", "PM", "12:45"
        sf, mf, hf               seconds, minutes and hours with fractions (smooth, for sweeping motion)
        dayFrac                  0..1 through the day, smooth
        weekday, month           names: "Friday", "November" (as numbers: weekdayIndex 0-6 from Sunday, monthIndex 1-12)
        day, year, date ("Friday, November 27"), doy (day of year), yearFrac

sun     alt, az                  where it is (alt below 0 = below the horizon)
        up, phase                "night" | "dawn" | "sunrise" | "day" | "golden" | "dusk"
        rise, set, noon          today's times
        progress                 0..1 through the current day (sunrise to sunset) or night
        next { kind: "sunrise" | "sunset", ms, minutes }, dayLength (hours)

moon    phase (0 new, 0.5 full, to 1), illumination (0..1), waxing, name, alt, az, up
        tilt                     which way the lit edge faces as seen from here: degrees counter-clockwise from straight up, -180..180

weather live                     false when there is no current reading (typical values are standing in)
        temp, feels, humidity, dewPoint, wind, gust, windDir, cloud (0..100), precip, pressure (hPa), visibility (miles), uv, aqi, pm25
                                 numbers, eased so a new reading glides in rather than jumps
        code, label              WMO code and its label ("Overcast")
        kind                     "clear" | "partly" | "overcast" | "fog" | "drizzle" | "rain" | "snow" | "storm"
        falling                  null | "drizzle" | "rain" | "freezing" | "snow" | "storm"
        intensity                0..1: how hard it is coming down (0 when dry)
        fog, windFrom ("NW"), high, low (today's)

hours   [48]  the next 48 hours, hours[0] is the current hour:
              { ms, temp, feels, humidity, cloud, pop (chance of precipitation, %), precip, wind, windDir, uv, pressure, code, kind, label }
pastHours [24]  the same for the last 24 hours, oldest first

sky     west, northWest, northEast, east    the color of the real sky in four directions ("#rrggbb"), measured every 15 minutes
                                             by a camera on a Manhattan tower; ready to paint (night exposure already corrected)
        mean                                 their average
        measured                             false when a model is standing in for the camera
        day                                  [{ ms, west, northWest, northEast, east }] the last 24 hours, oldest first. Readings are
                                             about 15 minutes apart but can be missing for hours: place them by `ms`, never by
                                             index (may be empty)

tide    level (feet), norm (0 low water .. 1 high water), rising, next { kind: "high" | "low", ms, ft, minutes }

fact    { label, value } or null
text    the readout strings (table above), plus: high, low, feels ("46°"), wind ("12 mph NW"), humidity ("80%")
```

## The kit (`../lib/kit.js`)

- Math: `W`, `H`, `TAU`, `clamp`, `lerp`, `norm`, `remap`, `smoothstep`, `lerpAngle`, `approach` (frame-rate independent easing toward a target), `ease.*`.
- Randomness: `rng(seed)` gives `r()`, `r.range(a, b)`, `r.int(a, b)`, `r.pick(list)`, `r.chance(p)`, `r.gauss()`, `r.shuffle(list)`; `hash(x, y)`.
- Noise: `createNoise(seed)` gives `n2`, `n3`, `fbm2`, `fbm3`, `curl`.
- Color (OKLab based, hex in and out): `mix(a, b, t)`, `ramp([...])`, `adjust(c, { l, c, h })`, `oklch(l, c, h)`, `toOklch`, `rgba(c, alpha)`, `luminance`, `contrast(a, b)`, `readableOn(bg)`, `vec3(c)` for shader uniforms.
- DOM: `el(tag, attrs, ...children)`, `svg(tag, attrs, ...children)`, `svgLayer(root)`, `addStyle(root, css)`, `fitText(node, maxWidth)`, `wrapText(ctx, text, maxWidth)`.
- Surfaces: `canvas2d(root, { maxScale, adaptive, alpha })` returns `{ canvas, ctx, clear() }` with the context already scaled so you draw in stage units (`ctx.setTransform()` and `ctx.resetTransform()` are safe: they stay in stage units); `pixelCanvas(root, { size })` is a coarse hard-pixel grid for pixel art and dot boards; `shader(root, { frag })` returns `{ ok, set(name, value), draw(time) }` for one full-stage fragment shader. Read the comments above each in `kit.js` before using them.
- Letterforms as data: `mask(cols, rows, draw)` rasterizes text (or any drawing) to a grid of coverage values, for dots, tiles, obstacles or places for particles to settle. Call it when the text changes, not every frame.
- Finish: `grain(root, { opacity })`.

## A minimal piece

This shows the mechanics only (it is also `_example.js` in this folder, runnable as `/visual.html?id=_example`). It is deliberately plain and shows only some of the readouts; do not take its look as a model.

```js
import { W, H, mix, rgba, readableOn, rng, el, addStyle, canvas2d, grain, fitText } from "../lib/kit.js";

export default {
  title: "Example",
  description: "Drifting motes over the sky's color.",
  fonts: ["Archivo:wght@500;800"],
  mount(root, { seed }) {
    addStyle(root, `
      .ex { position: absolute; inset: 0; font-family: "Archivo", sans-serif; }
      .ex .time { position: absolute; left: 80px; top: 120px; font-weight: 800; font-size: 330px; line-height: 0.8; }
      .ex .ampm { position: absolute; right: 80px; top: 128px; font-weight: 800; font-size: 60px; }
      .ex .temp { position: absolute; left: 84px; top: 470px; font-weight: 800; font-size: 110px; line-height: 1; }
      .ex .cond { position: absolute; left: 84px; top: 600px; font-weight: 500; font-size: 56px; }
    `);
    const wrap = el("div", { class: "ex" });
    root.append(wrap); // in the page before anything is measured
    const layer = canvas2d(wrap, { adaptive: true }); // redrawn in full every frame
    const time = el("div", { class: "time" });
    const ampm = el("div", { class: "ampm" });
    const temp = el("div", { class: "temp" });
    const cond = el("div", { class: "cond" });
    wrap.append(time, ampm, temp, cond);
    grain(wrap);

    const r = rng(seed);
    const N = 600;
    const motes = new Float32Array(N * 3); // x, y, speed
    for (let i = 0; i < N; i++) motes.set([r.range(0, W), r.range(0, H), r.range(0.5, 1.5)], i * 3);

    const shown = {};
    const put = (key, node, value) => {
      // write to the DOM only when the string changes
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };

    return {
      frame(s) {
        // The ground follows the real sky and the real light, continuously. The ink
        // does not fade with it (it would pass through the ground's own grey and
        // vanish): it switches, at the point where both inks read equally well.
        const bg = mix("#05070f", s.sky.mean, 0.25 + 0.75 * s.daylight);
        if (shown.bg !== bg) {
          shown.bg = bg;
          shown.ink = readableOn(bg, "#f4f1ea", "#0b0d12");
          wrap.style.background = bg;
          wrap.style.color = shown.ink;
        }

        const { ctx } = layer;
        layer.clear();
        ctx.fillStyle = rgba(shown.ink, 0.5);
        const drift = s.weather.wind * 6 * s.dt; // px this frame: the real wind (dt is 0 on the first frame)
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const j = i * 3;
          motes[j] = (motes[j] + drift * motes[j + 2]) % W;
          ctx.rect(motes[j], motes[j + 1], 3, 3);
        }
        ctx.fill();

        if (put("time", time, s.text.time)) fitText(time, W - 320);
        put("ampm", ampm, s.text.ampm);
        put("temp", temp, s.text.temp);
        put("cond", cond, s.text.condition);
      },
    };
  },
};
```

## Looking at it

`scripts/shoot.js` photographs a piece in a headless browser under simulated conditions and reports what the readouts should say, what a frame costs, the frame rate it holds in real time, how long `mount()` took, how bright the picture is, and any errors.

```sh
node scripts/shoot.js <id>                           # the seven core scenarios and a contact sheet
node scripts/shoot.js <id> --scenarios all           # all thirteen
node scripts/shoot.js <id> --wx snow --at night      # any weather preset at any time
node scripts/shoot.js <id> --frames 3 --every 4      # three shots 4 s apart: is it moving, is it calm?
node scripts/shoot.js <id> --wx clear --at dawn --frames 6 --every 2 --rate 7200   # time-lapse through a day
node scripts/shoot.js <id> --crop 0,0,1080,700       # also save a region at full resolution
node scripts/shoot.js <id> --perf 12                 # 12 s in real time: fps, frame cost, memory growth
node scripts/shoot.js <id> --at 2026-11-27T12:59:57 --frames 4 --every 1   # start at an exact second: watch a minute change
node scripts/shoot.js --list                         # ids, scenarios, presets
```

The report's `logs` hold what the page wrote with `console.warn` and `console.error` only (use those when debugging; `console.log` is not kept). `--warm` runs the animation before the first shot without moving the clock. The frame rate and mount time it reports depend on what else the machine is doing: on a busy machine, measure twice and compare with `_example`.

In a browser (`npm run dev`): `/visual.html?id=<id>` runs one piece on live data; add `&scenario=rain-dusk-fall`, or `&wx=snow&at=night`, `&rate=600` (a day in about two minutes), `&seed=7`, `&hud=1` (frame rate and cost). `/gallery.html` shows them all side by side under any conditions.

A piece is ready when, in every scenario (the half-light of `overcast-sunset-fall` included): every readout is present, correct and comfortably legible; nothing overlaps or runs off the frame; night shots are dark; it looks clearly different across weather and time of day; it moves, calmly; the report shows no errors and a frame cost within budget; and it is something you would stop to look at.

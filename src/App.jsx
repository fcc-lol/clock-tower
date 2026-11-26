import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { WMO, moonPhase, nextSunEvent, fetchWeather } from "./lib/sky.js";
import { FONTS, ENUMS, resolveLayout } from "./lib/layout.js";
import { fetchToday, factFor } from "./lib/today.js";

// Fixed design dimensions — everything is authored at this exact size.
const STAGE_W = 1080;
const STAGE_H = 1920;

// ---------------------------------------------------------------------------
// Readout layout
//
// How the time and weather are set on the backdrop comes with each image: the
// server asks Claude to design a layout for it (layout.js), and falls back to
// a built-in layout per image style (src/lib/layout.js). The layout switches
// in the same frame as the image. Here it is turned into concrete CSS values.
// ---------------------------------------------------------------------------
const PAD_X = 88;
const PAD_Y = 120;
const MEASURE = STAGE_W - PAD_X * 2;
const WEIGHT = { light: 0, regular: 1, bold: 2 };
const TRACK = { tight: -0.01, normal: 0.02, wide: 0.14 };
const TIME_TRACK = { tight: -0.045, normal: -0.02, wide: 0.02 };
const SCRIM = { light: 0.22, medium: 0.4, strong: 0.58 };
const FLEX = { left: "flex-start", center: "center", right: "flex-end" };
const JUSTIFY = { stack_top: "flex-start", stack_center: "center", stack_bottom: "flex-end", split: "space-between" };

// The scrim fades out along an eased curve rather than a straight ramp, so it
// reads as the picture getting darker, not as a band laid over it.
function scrimOf(where, strength) {
  const s = SCRIM[strength];
  const k = (a) => `rgba(0,0,0,${(s * a).toFixed(3)})`;
  const fade = (dir, end) => {
    const stops = [[1, 0], [0.96, 0.3], [0.82, 0.5], [0.55, 0.68], [0.25, 0.83], [0.07, 0.93], [0, 1]];
    return `linear-gradient(${dir}, ${stops.map(([a, at]) => `${k(a)} ${(at * end).toFixed(1)}%`).join(", ")})`;
  };
  if (where === "top") return fade("180deg", 90);
  if (where === "bottom") return fade("0deg", 90);
  if (where === "both") return `${fade("180deg", 48)}, ${fade("0deg", 48)}`;
  if (where === "full") return k(0.75);
  return "none";
}

function themeOf(l) {
  const d = FONTS[l.display_font];
  const b = FONTS[l.body_font];
  const comp = l.composition;
  const masthead = comp === "masthead";
  const monument = comp === "monument";
  const k = comp === "caption" ? 0.7 : 1; // the caption is the same design, smaller
  const italic = l.italic && Boolean(b.italic);
  return {
    comp,
    masthead,
    monument,
    display: d.stack,
    body: b.stack,
    timeWeight: d.weights[WEIGHT[l.time_weight]],
    bodyWeight: b.weights[WEIGHT[l.body_weight]],
    // Masthead fills the width from this size; monument stacks two huge lines.
    timeSize: monument ? Math.min(l.time_size * 2.2, 600) : comp === "caption" ? Math.min(l.time_size, 250) * k * 1.12 : l.time_size * 1.12,
    fill: masthead,
    tempSize: l.time_size * 0.66 * k,
    colon: d.colon ?? 0.06,
    vary: d.opsz ? `"opsz" ${d.opsz}` : "normal",
    ghost: Boolean(d.ghost),
    ampm: d.digits ? b.stack : "inherit", // a digits-only face can't spell AM
    effect: l.effect,
    tilt: l.tilt || 0,
    upper: l.uppercase,
    italic,
    // The fact reads as a pull quote where the face has an italic.
    quote: Boolean(b.italic) && !l.uppercase,
    caps: b.caps !== false,
    track: TRACK[l.tracking],
    timeTrack: TIME_TRACK[l.tracking],
    s: b.scale * k,
    k,
    align: masthead ? "left" : l.align,
    items: masthead ? "stretch" : FLEX[l.align],
    flex: masthead ? "space-between" : FLEX[l.align],
    side: l.align === "right" ? "right" : "left",
    direction: monument && l.arrangement === "stack_bottom" ? "column-reverse" : "column",
    justify: monument ? "space-between" : JUSTIFY[l.arrangement],
    apart: monument || l.arrangement === "split",
    // Big figures are hung a hair outside the margin so their stems line up
    // optically with the small text under them.
    hang: !masthead && !monument && l.align !== "center",
    ink: l.ink,
    accent: l.accent,
    scrim: scrimOf(l.scrim, l.scrim_strength),
  };
}

// Dark backdrop fills the browser; the stage is centered within it.
const Viewport = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #333;
  cursor: ${(p) => (p.$onDevice ? "none" : "auto")};
`;

// The 1080x1920 canvas. It's always rendered at full size and scaled with a
// transform so layout math inside never has to think about the screen size.
const Stage = styled.div`
  position: relative;
  width: ${STAGE_W}px;
  height: ${STAGE_H}px;
  flex: 0 0 auto;
  transform: scale(${(p) => p.$scale});
  transform-origin: center center;
  background: #000;
  color: #f5f6fa;
  overflow: hidden;
  user-select: none;
`;

// Every line is trimmed to its letters (cap height to baseline), so a margin
// is exactly the visible gap, whatever the typeface or size: one gap between
// all elements, and a smaller one between a label and its value.
const trim = css`
  text-box: trim-both cap alphabetic;
`;
const GAP = 60;
const LABEL_GAP = 18;

// Type effects that belong to a style's own lettering (STYLE_TYPE). Set on
// every element so the em lengths follow each one's own size.
const EFFECT = {
  // Lit from within: LED segments, phosphor, neon.
  glow: css`
    &,
    & * {
      text-shadow: 0 0 0.05em currentColor, 0 0 0.22em currentColor, 0 0 0.6em currentColor;
    }
  `,
  // Comic-book lettering: black outline with a hard drop.
  comic: css`
    &,
    & * {
      -webkit-text-stroke: 0.09em #111;
      paint-order: stroke fill;
      text-shadow: 0.055em 0.055em 0 #111;
    }
  `,
  // Ink or graphite on paper: the type takes on the sheet's grain.
  ink: css`
    mix-blend-mode: multiply;
  `,
};

// A seven-segment face shows its unlit segments faintly behind the lit ones.
const ghostDigits = css`
  b {
    position: relative;
    display: inline-block;
    font-weight: inherit;
  }
  b::before {
    content: attr(data-ghost);
    position: absolute;
    top: 0;
    right: 0;
    opacity: 0.13;
    text-shadow: none;
  }
`;

// The readouts: a clock block and a weather block, composed and placed as the
// layout says (see ENUMS.composition in src/lib/layout.js).
const Content = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: ${(p) => p.$t.direction};
  justify-content: ${(p) => p.$t.justify};
  padding: ${PAD_Y}px ${PAD_X}px;
  font-family: ${(p) => p.$t.body};
  font-weight: ${(p) => p.$t.bodyWeight};
  font-style: ${(p) => (p.$t.italic ? "italic" : "normal")};
  color: ${(p) => p.$t.ink};
  text-transform: ${(p) => (p.$t.upper ? "uppercase" : "none")};
  letter-spacing: ${(p) => p.$t.track}em;
  font-variant-numeric: lining-nums tabular-nums;
  font-optical-sizing: auto;
  text-rendering: optimizeLegibility;
  transform: ${(p) => (p.$t.tilt ? `rotate(${p.$t.tilt}deg)` : "none")};
  ${(p) => EFFECT[p.$t.effect]}
`;

const Block = styled.div`
  display: flex;
  flex-direction: column;
  align-items: ${(p) => p.$t.items};
  text-align: ${(p) => p.$t.align};
`;

// The time. Proportional figures (tabular ones leave holes around the 1s at
// this size), the colon lifted to sit centered on them, and AM/PM hung small
// at the top of the figures.
const Time = styled.div`
  font-family: ${(p) => p.$t.display};
  font-weight: ${(p) => p.$t.timeWeight};
  font-style: normal;
  font-variant-numeric: lining-nums proportional-nums;
  font-variation-settings: ${(p) => p.$t.vary};
  letter-spacing: ${(p) => p.$t.timeTrack}em;
  line-height: 1;
  white-space: nowrap;
  /* The figures' own measured height, not the font's nominal cap height. */
  ${(p) => !p.$t.monument && `margin-top: ${-p.$t.figTop}em; margin-bottom: ${-p.$t.figBottom}em;`}
  gap: 0.13em; /* monument: between the hour and the minutes */
  align-self: ${(p) => (p.$t.masthead ? "flex-start" : "auto")};
  ${(p) => p.$t.hang && `margin-${p.$t.side}: -0.03em;`}
  display: ${(p) => (p.$t.monument ? "flex" : "block")};
  flex-direction: column;
  align-items: ${(p) => p.$t.items};

  i {
    font-style: normal;
    position: relative;
    top: ${(p) => -p.$t.colon}em;
    margin: 0 0.02em;
  }

  small {
    display: inline-block;
    font-size: 0.19em;
    font-family: ${(p) => p.$t.ampm};
    font-weight: inherit;
    line-height: 1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${(p) => p.$t.accent};
    vertical-align: top;
    position: relative;
    top: 0.72em;
    margin-left: 0.4em;
  }

  /* Monument: hour over minutes, AM/PM hung outside the hour. */
  span {
    display: block;
    position: relative;
    margin-top: ${(p) => -p.$t.figTop}em;
    margin-bottom: ${(p) => -p.$t.figBottom}em;
  }
  span small {
    position: absolute;
    top: 1.5em;
    font-size: 0.1em;
    margin: 0 1em;
    ${(p) => (p.$t.side === "right" ? "right: 100%;" : "left: 100%;")}
  }
  ${ghostDigits}
`;

// Below the time everything is set in three sizes only: a secondary size (the
// date and the condition), a data size (values) and the label size. Capitals
// run large, so an all-caps layout sets each a step smaller.
const SECONDARY = (t) => (t.upper ? 48 : 60) * t.s;
const DATA = (t) => (t.upper ? 38 : 46) * t.s;
const LABEL = (t) => (t.caps ? 26 : 33) * t.s;
const DateLine = styled.div`
  ${trim}
  margin-top: ${(p) => GAP * p.$t.k}px;
  font-size: ${(p) => SECONDARY(p.$t)}px;
  line-height: 1.15;
  white-space: nowrap;
  display: flex;
  justify-content: ${(p) => p.$t.flex};
  ${(p) => p.$t.monument && `order: -1; margin: 0 0 ${GAP * 0.6}px; font-size: ${DATA(p.$t)}px; color: ${p.$t.accent};`}
`;

const Now = styled.div`
  margin-top: ${(p) => (p.$t.apart ? 0 : GAP * p.$t.k)}px;
  display: flex;
  align-items: baseline;
  justify-content: ${(p) => p.$t.flex};
  flex-wrap: wrap;
  gap: 0 ${(p) => 40 * p.$t.k}px;
  line-height: 1;
`;

const Temp = styled.span`
  line-height: 1;
  margin-top: ${(p) => -p.$t.figTop}em;
  margin-bottom: ${(p) => -p.$t.figBottom}em;
  font-family: ${(p) => p.$t.display};
  font-style: normal;
  font-variant-numeric: lining-nums proportional-nums;
  font-variation-settings: ${(p) => p.$t.vary};
  font-size: ${(p) => p.$t.tempSize}px;
  font-weight: ${(p) => p.$t.timeWeight};
  letter-spacing: ${(p) => p.$t.timeTrack}em;
  ${(p) => p.$t.hang && `margin-${p.$t.side}: -0.03em;`}
  ${ghostDigits}
`;

// Measured like the figures rather than trimmed in CSS, so it still lines up
// on the temperature's baseline.
const Cond = styled.span`
  line-height: 1;
  margin-top: ${(p) => -p.$t.capTop}em;
  margin-bottom: ${(p) => -p.$t.capBottom}em;
  font-size: ${(p) => SECONDARY(p.$t)}px;
`;

// The four figures run as one strip on a shared baseline: spread to both
// margins in a masthead, otherwise evenly spaced from the aligned edge. If a
// wide face makes the strip longer than the measure it falls back to two rows
// of two (data-grid is set by useStrip).
const Stats = styled.div`
  margin-top: ${(p) => GAP * p.$t.k}px;
  display: flex;
  justify-content: ${(p) => p.$t.flex};
  gap: 0 ${(p) => (p.$t.masthead ? 34 : 54) * p.$t.k}px; /* a floor: the masthead spreads them wider */

  &[data-grid] {
    display: grid;
    grid-template-columns: ${(p) => (p.$t.masthead ? "1fr 1fr" : "repeat(2, max-content)")};
    gap: ${(p) => `${GAP * 0.75 * p.$t.k}px ${96 * p.$t.k}px`};
  }
`;

// A small label over a value. Labels are always upright tracked capitals (where
// the face can carry them), whatever the rest of the text is doing.
const Stat = styled.div`
  span {
    ${trim}
    display: block;
    font-size: ${(p) => LABEL(p.$t)}px;
    font-style: normal;
    line-height: 1.2;
    white-space: nowrap;
    text-transform: ${(p) => (p.$t.caps ? "uppercase" : "none")};
    letter-spacing: ${(p) => (p.$t.caps ? 0.16 : 0.03)}em;
    color: ${(p) => p.$t.accent};
    margin-bottom: ${(p) => LABEL_GAP * p.$t.k}px;
  }
  b {
    ${trim}
    display: block;
    font-weight: inherit;
    font-size: ${(p) => DATA(p.$t)}px;
    line-height: 1.15;
    white-space: nowrap;
  }
`;

// The "today" fact: set like a stat, but its value may wrap. Held to a
// comfortable line length rather than the full measure.
const Fact = styled(Stat)`
  margin-top: ${(p) => GAP * p.$t.k}px;
  max-width: ${(p) => (p.$t.masthead ? "100%" : `${840 * p.$t.k}px`)};
  b {
    font-style: ${(p) => (p.$t.quote ? "italic" : "inherit")};
    line-height: 1.22;
    white-space: normal;
    text-wrap: balance;
  }
`;

// Full-stage backdrop: the AI-generated image for the current 15-minute slot
// (see visuals.js on the server). The layout's scrim darkens it behind the
// readouts where needed. Swaps are a hard cut, so
// the change on the quarter-hour is visible.
const Backdrop = styled.div`
  position: absolute;
  inset: 0;
  z-index: 0;
  background: #000;

  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: ${(p) => p.$scrim};
  }
`;

// Scale the stage so it fits inside the current viewport while preserving the
// 1080x1920 aspect ratio.
function useStageScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => {
      setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return scale;
}

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// Fetch current conditions on mount and refresh every 10 minutes.
function useWeather() {
  const [weather, setWeather] = useState(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const w = await fetchWeather();
        if (active) setWeather(w);
      } catch {
        // Leave previous reading in place on a failed refresh.
      }
    };
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);
  return weather;
}

// Today's facts (holidays, events on this date, plants in bloom), refreshed
// hourly so they roll over with the date.
function useToday() {
  const [facts, setFacts] = useState([]);
  useEffect(() => {
    let active = true;
    const load = () => fetchToday().then((f) => active && f.length && setFacts(f)).catch(() => {});
    load();
    const id = setInterval(load, 60 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);
  return facts;
}

// Ask the browser to fetch every typeface up front, so the first time a layout
// uses one its text doesn't flash in a fallback font. Returns a counter that
// bumps when fonts finish loading (text widths change then).
function useFonts() {
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    if (!document.fonts?.load) return;
    const bump = () => setLoaded((n) => n + 1);
    document.fonts.addEventListener?.("loadingdone", bump);
    for (const f of Object.values(FONTS)) {
      for (const w of new Set(f.weights)) {
        document.fonts.load(`${w} 40px ${f.stack}`).catch(() => {});
        if (f.italic) document.fonts.load(`italic ${w} 40px ${f.stack}`).catch(() => {});
      }
    }
    return () => document.fonts.removeEventListener?.("loadingdone", bump);
  }, []);
  return loaded;
}

// Sets an element's font size, shrinking it if the line would be wider than
// the measure (a wide face at "12:00 PM" can otherwise run off the edge). With
// `fill` it is scaled, up or down, to span the measure exactly.
const FILL_MAX = 430;
function useFitFontSize(size, fill, deps) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = `${size}px`;
    const w = el.offsetWidth;
    if (!w) return;
    if (fill) el.style.fontSize = `${Math.min(Math.floor((size * MEASURE) / w), FILL_MAX)}px`;
    else if (w > MEASURE) el.style.fontSize = `${Math.floor((size * MEASURE) / w)}px`;
  }, [size, fill, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

// How much empty space a line of figures carries above and below the digits
// themselves, in em, at line-height 1. Measured from the face (the nominal cap
// height is no guide: handwriting and pixel faces draw their digits well short
// of it), so the gaps around the time and temperature come out exact.
function useInkTrim(stack, weight, loaded, sample = "0123456789") {
  return useMemo(() => {
    const none = { top: 0, bottom: 0 };
    try {
      const size = 200;
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = `${weight} ${size}px ${stack}`;
      const m = ctx.measureText(sample);
      const asc = m.fontBoundingBoxAscent;
      const desc = m.fontBoundingBoxDescent;
      if (!asc || !m.actualBoundingBoxAscent) return none;
      const toBaseline = (size - (asc + desc)) / 2 + asc;
      return {
        top: (toBaseline - m.actualBoundingBoxAscent) / size,
        bottom: (size - toBaseline - Math.max(0, m.actualBoundingBoxDescent)) / size,
      };
    } catch {
      return none;
    }
  }, [stack, weight, loaded, sample]);
}

// Lays the stats out as one strip, or as two rows of two when the strip would
// not fit the measure in this face.
function useStrip(deps) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    delete el.dataset.grid;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const kids = [...el.children];
    const width = kids.reduce((w, k) => w + k.offsetWidth, 0) + gap * Math.max(0, kids.length - 1);
    if (width > MEASURE) el.dataset.grid = "";
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

// If the server is running a newer build than this page, reload once to pick
// it up (the kiosk has no keyboard). The sessionStorage guard stops a reload
// loop if a stale copy somehow survives the reload.
function reloadIfNewBuild(serverBuild) {
  if (!serverBuild || serverBuild === __BUILD_ID__) return;
  let already = null;
  try {
    already = sessionStorage.getItem("reloadedFor");
    sessionStorage.setItem("reloadedFor", serverBuild);
  } catch {}
  if (already !== serverBuild) window.location.reload();
}

// Polls /api/visual (which also tells the server someone is watching, so it
// keeps generating), preloads the next slot's image, and returns the one that
// should be on screen right now. The swap happens on the client's own clock
// the moment the slot boundary passes, so it's instant rather than waiting for
// the next poll. Polling pauses while the tab is hidden, and never starts when
// `off` (a ?preview page must not count as a viewer and trigger generation).
function useBackdrop(now, off) {
  const [visual, setVisual] = useState(null);
  const [ready, setReady] = useState({}); // url -> true once decoded

  useEffect(() => {
    if (off) return;
    let active = true;
    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/visual", { cache: "no-store" });
        const v = await res.json();
        reloadIfNewBuild(v.build);
        if (active) setVisual(v);
      } catch {
        // Keep showing whatever we have.
      }
    };
    poll();
    const id = setInterval(poll, 30 * 1000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [off]);

  // Decode both images ahead of time so the cut is clean.
  useEffect(() => {
    for (const m of [visual?.current, visual?.next]) {
      if (!m || ready[m.url]) continue;
      const img = new Image();
      img.onload = () => setReady((r) => ({ ...r, [m.url]: true }));
      img.src = m.url;
    }
  }, [visual]); // eslint-disable-line react-hooks/exhaustive-deps

  const { current, next } = visual || {};
  const shown = next && now.getTime() >= next.slot && ready[next.url] ? next : current;
  return shown && ready[shown.url] ? shown : null;
}

// ?preview=<name> shows generated/preview/<name>.json (made by
// `npm run visual:preview`) instead of the live slot, to look at one image and
// its layout on its own.
function usePreview(name) {
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    if (!name) return;
    fetch(`/generated/preview/${name}.json`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => {});
  }, [name]);
  return meta;
}

function App() {
  const scale = useStageScale();
  const now = useNow();
  const weather = useWeather();
  const params = new URLSearchParams(window.location.search);
  const live = useBackdrop(now, Boolean(params.get("preview")));
  const previewed = usePreview(params.get("preview"));
  const backdrop = params.get("preview") ? previewed : live;
  const fontsLoaded = useFonts();
  // One fact per image: it changes when the backdrop does.
  const fact = factFor(useToday(), backdrop?.slot ?? now.getTime());
  const onDevice = params.get("onDevice") === "true";
  // The layout designed for this image, or the built-in one for its style.
  // ?theme=neon previews a built-in layout on whatever image is showing.
  const preview = params.get("theme");
  // ?composition=masthead (etc.) forces one composition, to compare them.
  const layout = resolveLayout(preview ? null : backdrop?.layout, preview || backdrop?.style);
  if (ENUMS.composition.includes(params.get("composition"))) layout.composition = params.get("composition");
  const t = themeOf(layout);
  const fig = useInkTrim(t.display, t.timeWeight, fontsLoaded);
  const cap = useInkTrim(t.body, t.bodyWeight, fontsLoaded, "H");
  Object.assign(t, { figTop: fig.top, figBottom: fig.bottom, capTop: cap.top, capBottom: cap.bottom });

  const [clock, ampm] = now
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .split(/\s+/);
  const [hh, mm] = clock.split(":");
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = now.toLocaleDateString("en-US", { month: "long", day: "numeric" });

  // Figures in a seven-segment face sit over a ghost of all their segments.
  const digits = (v) => (t.ghost ? <b data-ghost={String(v).replace(/\d/g, "8")}>{v}</b> : v);

  const timeRef = useFitFontSize(t.timeSize, t.fill, [clock, ampm, t.comp, t.display, t.timeWeight, t.timeTrack, fontsLoaded]);

  const statsRef = useStrip([t.comp, t.body, t.bodyWeight, t.upper, t.s, t.track, fontsLoaded, Boolean(weather), now.getMinutes()]);

  const [, label] = (weather && WMO[weather.weather_code]) || ["", ""];
  const sun = weather && nextSunEvent(weather.daily, now);
  const moon = moonPhase(now);

  return (
    <Viewport $onDevice={onDevice}>
      <Stage $scale={scale}>
        <Backdrop $scrim={t.scrim}>{backdrop && <img key={backdrop.url} src={backdrop.url} alt="" />}</Backdrop>
        <Content $t={t}>
          <Block $t={t}>
            <Time $t={t} ref={timeRef}>
              {t.monument ? (
                <>
                  <span>
                    {digits(hh)}
                    <small>{ampm}</small>
                  </span>
                  <span>{digits(mm)}</span>
                </>
              ) : (
                <>
                  {digits(hh)}
                  <i>:</i>
                  {digits(mm)}
                  <small>{ampm}</small>
                </>
              )}
            </Time>
            <DateLine $t={t}>
              {t.masthead ? (
                <>
                  <span>{weekday}</span>
                  <span>{monthDay}</span>
                </>
              ) : (
                `${weekday}, ${monthDay}`
              )}
            </DateLine>
          </Block>
          <Block $t={t}>
            {weather ? (
              <>
                <Now $t={t}>
                  <Temp $t={t}>{digits(Math.round(weather.temperature_2m))}°</Temp>
                  <Cond $t={t}>{label}</Cond>
                </Now>
                <Stats $t={t} ref={statsRef}>
                  {sun && (
                    <Stat $t={t}>
                      <span>{sun.label} in</span>
                      <b>
                        {sun.h > 0 ? `${sun.h}h ` : ""}
                        {sun.m}m
                      </b>
                    </Stat>
                  )}
                  <Stat $t={t}>
                    <span>Moon</span>
                    <b>{moon}</b>
                  </Stat>
                  {weather.aqi != null && (
                    <Stat $t={t}>
                      <span>Air quality</span>
                      <b>{weather.aqi}</b>
                    </Stat>
                  )}
                  {weather.uv_index != null && (
                    <Stat $t={t}>
                      <span>UV index</span>
                      <b>{Math.round(weather.uv_index)}</b>
                    </Stat>
                  )}
                </Stats>
                {fact && (
                  <Fact $t={t}>
                    <span>{fact.label}</span>
                    <b>{fact.value}</b>
                  </Fact>
                )}
              </>
            ) : (
              <Cond $t={t}>Loading weather…</Cond>
            )}
          </Block>
        </Content>
      </Stage>
    </Viewport>
  );
}

export default App;

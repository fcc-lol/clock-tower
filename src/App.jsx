import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import styled from "styled-components";
import { WMO, moonPhase, nextSunEvent, fetchWeather } from "./lib/sky.js";
import { FONTS, resolveLayout } from "./lib/layout.js";

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
const PAD_X = 96;
const WEIGHT = { light: 0, regular: 1, bold: 2 };
const TRACK = { tight: -0.01, normal: 0.02, wide: 0.14 };
const TIME_TRACK = { tight: -0.04, normal: -0.02, wide: 0.02 };
const SCRIM = { light: 0.22, medium: 0.4, strong: 0.58 };
const FLEX = { left: "flex-start", center: "center", right: "flex-end" };
const JUSTIFY = { stack_top: "flex-start", stack_center: "center", stack_bottom: "flex-end", split: "space-between" };

function scrimOf(where, strength) {
  const s = SCRIM[strength];
  const k = (a) => `rgba(0,0,0,${a.toFixed(3)})`;
  if (where === "top") return `linear-gradient(180deg, ${k(s)} 0%, ${k(s * 0.6)} 45%, ${k(0)} 72%)`;
  if (where === "bottom") return `linear-gradient(0deg, ${k(s)} 0%, ${k(s * 0.6)} 45%, ${k(0)} 72%)`;
  if (where === "both") return `linear-gradient(180deg, ${k(s)} 0%, ${k(s * 0.5)} 30%, ${k(0)} 45%, ${k(0)} 55%, ${k(s * 0.5)} 70%, ${k(s)} 100%)`;
  if (where === "full") return k(s * 0.75);
  return "none";
}

function themeOf(l) {
  const d = FONTS[l.display_font];
  const b = FONTS[l.body_font];
  return {
    display: d.stack,
    body: b.stack,
    timeWeight: d.weights[WEIGHT[l.time_weight]],
    bodyWeight: b.weights[WEIGHT[l.body_weight]],
    timeSize: l.time_size,
    upper: l.uppercase,
    italic: l.italic && Boolean(b.italic),
    track: TRACK[l.tracking],
    timeTrack: TIME_TRACK[l.tracking],
    scale: b.scale,
    align: l.align,
    flex: FLEX[l.align],
    justify: JUSTIFY[l.arrangement],
    split: l.arrangement === "split",
    row: l.stats === "row",
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

// The readouts: a clock block and a weather block, placed where the layout
// says (together at the top, middle or bottom, or split to both ends).
const Content = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: ${(p) => p.$t.justify};
  padding: 150px ${PAD_X}px;
  font-family: ${(p) => p.$t.body};
  font-weight: ${(p) => p.$t.bodyWeight};
  font-style: ${(p) => (p.$t.italic ? "italic" : "normal")};
  color: ${(p) => p.$t.ink};
  text-transform: ${(p) => (p.$t.upper ? "uppercase" : "none")};
  letter-spacing: ${(p) => p.$t.track}em;
  font-variant-numeric: lining-nums tabular-nums;
`;

const Block = styled.div`
  display: flex;
  flex-direction: column;
  align-items: ${(p) => p.$t.flex};
  text-align: ${(p) => p.$t.align};
`;

const Time = styled.div`
  font-family: ${(p) => p.$t.display};
  font-weight: ${(p) => p.$t.timeWeight};
  font-style: normal;
  letter-spacing: ${(p) => p.$t.timeTrack}em;
  line-height: 1;
  white-space: nowrap;

  small {
    font-size: 0.26em;
    font-weight: inherit;
    letter-spacing: 0.06em;
    margin-left: 0.3em;
    text-transform: uppercase;
    color: ${(p) => p.$t.accent};
  }
`;

const DateLine = styled.div`
  margin-top: 34px;
  font-size: ${(p) => 54 * p.$t.scale}px;
  line-height: 1.2;
`;

const Now = styled.div`
  margin-top: ${(p) => (p.$t.split ? 0 : 96)}px;
  display: flex;
  align-items: baseline;
  justify-content: ${(p) => p.$t.flex};
  flex-wrap: wrap;
  gap: 0 36px;
  line-height: 1.05;
`;

const Temp = styled.span`
  font-family: ${(p) => p.$t.display};
  font-style: normal;
  font-size: ${(p) => p.$t.timeSize * 0.56}px;
  font-weight: ${(p) => p.$t.timeWeight};
  letter-spacing: ${(p) => p.$t.timeTrack}em;
`;

const Cond = styled.span`
  font-size: ${(p) => 60 * p.$t.scale}px;
`;

const Stats = styled.div`
  margin-top: 64px;
  display: ${(p) => (p.$t.row ? "flex" : "grid")};
  flex-wrap: wrap;
  grid-template-columns: repeat(2, auto);
  justify-content: ${(p) => p.$t.flex};
  gap: ${(p) => (p.$t.row ? "40px 64px" : "46px 110px")};
`;

const Stat = styled.div`
  span {
    display: block;
    font-size: ${(p) => 28 * p.$t.scale}px;
    letter-spacing: ${(p) => (p.$t.upper ? Math.max(p.$t.track, 0.18) : 0.04)}em;
    color: ${(p) => p.$t.accent};
    margin-bottom: 10px;
  }
  b {
    display: block;
    font-weight: inherit;
    font-size: ${(p) => 50 * p.$t.scale}px;
    line-height: 1.1;
    white-space: nowrap;
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
// the stage allows (a wide face at "12:00 PM" can otherwise run off the edge).
function useFitFontSize(size, deps) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const max = STAGE_W - PAD_X * 2;
    el.style.fontSize = `${size}px`;
    if (el.offsetWidth > max) el.style.fontSize = `${Math.floor((size * max) / el.offsetWidth)}px`;
  }, [size, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
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
// the next poll. Polling pauses while the tab is hidden.
function useBackdrop(now) {
  const [visual, setVisual] = useState(null);
  const [ready, setReady] = useState({}); // url -> true once decoded

  useEffect(() => {
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
  }, []);

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
  const live = useBackdrop(now);
  const previewed = usePreview(params.get("preview"));
  const backdrop = params.get("preview") ? previewed : live;
  const fontsLoaded = useFonts();
  const onDevice = params.get("onDevice") === "true";
  // The layout designed for this image, or the built-in one for its style.
  // ?theme=neon previews a built-in layout on whatever image is showing.
  const preview = params.get("theme");
  const layout = resolveLayout(preview ? null : backdrop?.layout, preview || backdrop?.style);
  const t = themeOf(layout);

  const [clock, ampm] = now
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .split(/\s+/);
  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const timeRef = useFitFontSize(t.timeSize, [clock, ampm, t.display, t.timeWeight, t.timeTrack, fontsLoaded]);

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
              {clock}
              <small>{ampm}</small>
            </Time>
            <DateLine $t={t}>{date}</DateLine>
          </Block>
          <Block $t={t}>
            {weather ? (
              <>
                <Now $t={t}>
                  <Temp $t={t}>{Math.round(weather.temperature_2m)}°</Temp>
                  <Cond $t={t}>{label}</Cond>
                </Now>
                <Stats $t={t}>
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

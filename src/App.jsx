import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { WMO, moonPhase, nextSunEvent, fetchWeather } from "./lib/sky.js";

// Fixed design dimensions — everything is authored at this exact size.
const STAGE_W = 1080;
const STAGE_H = 1920;

// ---------------------------------------------------------------------------
// Typography themes
//
// The readouts are set to suit the backdrop they sit on: each image style from
// visuals.js has a matching theme here (typeface, weight, case, alignment,
// colors), and the theme switches in the same frame as the image. Fonts are
// loaded in index.html; add a family there before using it here.
//   display/body  font stacks for the time and for everything else
//   timeSize      px size of the time digits (wide faces need a smaller size)
//   upper         set labels and lines in capitals
//   track         letter-spacing (em) for the small lines
//   align         "center" or "left"
//   ink/accent    main text color and the color of the labels + rule
//   shadow        text-shadow that keeps the text legible on the artwork
// ---------------------------------------------------------------------------
const SOFT = "0 2px 28px rgba(0,0,0,.6), 0 0 3px rgba(0,0,0,.55)";
const HARD = "0 3px 0 rgba(0,0,0,.55), 0 0 24px rgba(0,0,0,.5)";

const BASE = {
  display: `"Space Grotesk", sans-serif`,
  body: `"Space Grotesk", sans-serif`,
  timeSize: 250,
  timeWeight: 600,
  bodyWeight: 500,
  upper: true,
  track: 0.12,
  timeTrack: -0.02,
  align: "center",
  ink: "#f7f6f2",
  accent: "rgba(247,246,242,.72)",
  shadow: SOFT,
  italic: false,
};

const THEMES = {
  // Gouache travel poster: a high-contrast serif, centered.
  skyline: { display: `"Playfair Display", serif`, body: `"Playfair Display", serif`, timeSize: 270, timeWeight: 700, bodyWeight: 400, upper: false, track: 0.02, ink: "#fbf3e4", accent: "#f0c9a0" },
  // Swiss risograph poster: heavy grotesque, flush left.
  poster: { display: `"Archivo", sans-serif`, body: `"Archivo", sans-serif`, timeSize: 270, timeWeight: 800, timeTrack: -0.04, align: "left", track: 0.08, accent: "#ffd166", shadow: HARD },
  // Looking up between towers: thin, wide, cinematic.
  lookup: { display: `"Inter", sans-serif`, body: `"Inter", sans-serif`, timeSize: 250, timeWeight: 200, bodyWeight: 400, track: 0.32, timeTrack: 0.02 },
  // Apartment window: a quiet italic book face.
  window: { display: `"Cormorant Garamond", serif`, body: `"Cormorant Garamond", serif`, timeSize: 300, timeWeight: 400, bodyWeight: 500, upper: false, italic: true, track: 0.02, ink: "#fff6e6", accent: "#f2d3a8" },
  // Subway platform: signage grotesque, flush left.
  platform: { display: `"Inter", sans-serif`, body: `"Inter", sans-serif`, timeSize: 250, timeWeight: 700, timeTrack: -0.04, bodyWeight: 500, upper: false, track: 0, align: "left", accent: "#c79bf2", shadow: HARD },
  // Ukiyo-e print: a Mincho face with a vermilion seal color.
  woodblock: { display: `"Shippori Mincho", serif`, body: `"Shippori Mincho", serif`, timeSize: 250, timeWeight: 800, bodyWeight: 500, track: 0.14, ink: "#f6ecd9", accent: "#f08a6b" },
  // Pixel art: a bitmap face with a hard drop shadow.
  pixel: { display: `"Press Start 2P", monospace`, body: `"Press Start 2P", monospace`, timeSize: 128, timeWeight: 400, bodyWeight: 400, track: 0, timeTrack: 0, scale: 0.6, ink: "#ffffff", accent: "#ffe45c", shadow: "5px 5px 0 #000" },
  // Aerial view: instrument-panel monospace, flush left.
  satellite: { display: `"IBM Plex Mono", monospace`, body: `"IBM Plex Mono", monospace`, timeSize: 215, timeWeight: 300, bodyWeight: 500, track: 0.1, align: "left", ink: "#eafff4", accent: "#7df0b0", shadow: HARD },
  // Cut paper: a fat display face.
  collage: { display: `"Abril Fatface", serif`, body: `"Outfit", sans-serif`, timeSize: 250, timeWeight: 400, bodyWeight: 700, track: 0.14, ink: "#fff8ea", accent: "#ffcf5c", shadow: HARD },
  // Watercolor: light italic serif.
  watercolor: { display: `"Cormorant Garamond", serif`, body: `"Cormorant Garamond", serif`, timeSize: 300, timeWeight: 400, bodyWeight: 600, upper: false, italic: true, track: 0.02 },
  // Synthwave: glowing wide sans.
  neon: { display: `"Orbitron", sans-serif`, body: `"Orbitron", sans-serif`, timeSize: 180, timeWeight: 800, timeTrack: 0.02, track: 0.16, scale: 0.82, ink: "#ffffff", accent: "#7ef9ff", shadow: "0 0 10px #ff4fd8, 0 0 34px #ff2bd0, 0 0 70px rgba(255,43,208,.6), 0 2px 4px rgba(0,0,0,.7)" },
  // Charcoal drawing: chalk handwriting.
  charcoal: { display: `"Caveat", cursive`, body: `"Caveat", cursive`, timeSize: 320, timeWeight: 700, bodyWeight: 500, upper: false, track: 0.01, scale: 1.25, ink: "#f4f1ea", accent: "#d9d4c8" },
  // Flat vector: friendly geometric sans.
  flat: { display: `"Outfit", sans-serif`, body: `"Outfit", sans-serif`, timeSize: 270, timeWeight: 700, timeTrack: -0.03, bodyWeight: 300, upper: false, track: 0.01, align: "left", shadow: HARD },
  // Blueprint: drafting monospace in white line.
  blueprint: { display: `"Share Tech Mono", monospace`, body: `"Share Tech Mono", monospace`, timeSize: 230, timeWeight: 400, bodyWeight: 400, track: 0.14, ink: "#eaf4ff", accent: "#a9cdf5", shadow: "0 0 18px rgba(4,24,66,.9)" },
  // Street photo: the amber date stamp of a film camera.
  street: { display: `"DM Mono", monospace`, body: `"DM Mono", monospace`, timeSize: 215, timeWeight: 500, bodyWeight: 400, track: 0.08, align: "left", ink: "#ffb84a", accent: "#ffd79a", shadow: "0 0 18px rgba(255,120,0,.45), 0 2px 10px rgba(0,0,0,.75)" },
};

const themeFor = (style) => ({ ...BASE, scale: 1, ...(THEMES[style] || {}) });

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

// All the readouts live in the upper part of the frame (the images keep their
// sky there) so the subject of the artwork at the bottom stays uncovered.
const Content = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: ${(p) => (p.$t.align === "left" ? "flex-start" : "center")};
  text-align: ${(p) => p.$t.align};
  padding: 150px 96px 0;
  font-family: ${(p) => p.$t.body};
  font-weight: ${(p) => p.$t.bodyWeight};
  font-style: ${(p) => (p.$t.italic ? "italic" : "normal")};
  color: ${(p) => p.$t.ink};
  text-shadow: ${(p) => p.$t.shadow};
  text-transform: ${(p) => (p.$t.upper ? "uppercase" : "none")};
  letter-spacing: ${(p) => p.$t.track}em;
  font-variant-numeric: lining-nums tabular-nums;
`;

const Time = styled.div`
  font-family: ${(p) => p.$t.display};
  font-size: ${(p) => p.$t.timeSize}px;
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

const Rule = styled.div`
  width: 120px;
  height: 4px;
  margin: 70px 0 62px;
  background: ${(p) => p.$t.accent};
  box-shadow: 0 2px 18px rgba(0, 0, 0, 0.5);
`;

const Now = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: ${(p) => (p.$t.align === "left" ? "flex-start" : "center")};
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
  display: grid;
  grid-template-columns: repeat(2, auto);
  justify-content: ${(p) => (p.$t.align === "left" ? "start" : "center")};
  gap: 46px 110px;
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
// (see visuals.js on the server). A scrim, strongest behind the readouts at
// the top, keeps the text readable on bright renders. Swaps are a hard cut, so
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
    background: linear-gradient(
      180deg,
      rgba(0, 0, 0, 0.42) 0%,
      rgba(0, 0, 0, 0.26) 45%,
      rgba(0, 0, 0, 0.06) 68%,
      rgba(0, 0, 0, 0.1) 100%
    );
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

// Ask the browser to fetch every theme's typeface up front, so the first time
// a style comes up its text doesn't flash in a fallback font.
function usePreloadFonts() {
  useEffect(() => {
    if (!document.fonts?.load) return;
    for (const name of Object.keys(THEMES)) {
      const t = themeFor(name);
      document.fonts.load(`${t.timeWeight} 40px ${t.display}`).catch(() => {});
      document.fonts.load(`${t.italic ? "italic " : ""}${t.bodyWeight} 40px ${t.body}`).catch(() => {});
    }
  }, []);
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

function App() {
  const scale = useStageScale();
  const now = useNow();
  const weather = useWeather();
  const backdrop = useBackdrop(now);
  usePreloadFonts();
  const params = new URLSearchParams(window.location.search);
  const onDevice = params.get("onDevice") === "true";
  // ?theme=neon previews a theme on whatever image is showing.
  const t = themeFor(params.get("theme") || backdrop?.style);

  const [clock, ampm] = now
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .split(/\s+/);
  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const [, label] = (weather && WMO[weather.weather_code]) || ["", ""];
  const sun = weather && nextSunEvent(weather.daily, now);
  const moon = moonPhase(now);

  return (
    <Viewport $onDevice={onDevice}>
      <Stage $scale={scale}>
        <Backdrop>{backdrop && <img key={backdrop.url} src={backdrop.url} alt="" />}</Backdrop>
        <Content $t={t}>
          <Time $t={t}>
            {clock}
            <small>{ampm}</small>
          </Time>
          <DateLine $t={t}>{date}</DateLine>
          <Rule $t={t} />
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
        </Content>
      </Stage>
    </Viewport>
  );
}

export default App;

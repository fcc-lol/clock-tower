import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { WMO, moonPhase, nextSunEvent, fetchWeather } from "./lib/sky.js";

// Fixed design dimensions — everything is authored at this exact size.
const STAGE_W = 1080;
const STAGE_H = 1920;

// A random tilt with a larger 8-18° magnitude. When a previous angle is given,
// the new one always flips to the opposite direction so each re-tilt swings
// noticeably across (a 16-36° change), rather than nudging within one side.
const tilt = (prev) => {
  const dir = prev === undefined ? (Math.random() < 0.5 ? -1 : 1) : -Math.sign(prev) || 1;
  return dir * (8 + Math.random() * 10);
};

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
  text-transform: uppercase;
  user-select: none;
`;

const Content = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 0;
  padding-top: 140px;
  padding-bottom: 140px;
`;

// Every readout is its own line with its own static tilt.
const Line = styled.div`
  font-size: ${(p) => (p.$big ? "170px" : "56px")};
  font-weight: ${(p) => (p.$big ? 700 : 500)};
  letter-spacing: ${(p) => (p.$big ? "4px" : "2px")};
  font-variant-numeric: tabular-nums;
  text-align: center;
  text-shadow: 0 2px 24px rgba(0, 0, 0, 0.55), 0 0 2px rgba(0, 0, 0, 0.6);
  transform: rotate(${(p) => p.$rot}deg);
  transition: transform 1.2s cubic-bezier(0.22, 1, 0.36, 1);
`;

// Picks a random tilt that stays fixed across re-renders, but is recomputed
// whenever `epoch` changes (every 10 minutes) so all lines re-tilt together.
// Each new angle flips direction from the last so the transition is obvious.
function TiltLine({ big, epoch, children }) {
  const prev = useRef(undefined);
  const rot = useMemo(() => (prev.current = tilt(prev.current)), [epoch]);
  return (
    <Line $big={big} $rot={rot}>
      {children}
    </Line>
  );
}

// Full-stage backdrop: the AI-generated image for the current 15-minute slot
// (see visuals.js on the server). A light scrim keeps the text readable on
// bright renders. Swaps are a hard cut, so the change on the quarter-hour is
// visible.
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
      rgba(0, 0, 0, 0.3) 0%,
      rgba(0, 0, 0, 0.12) 40%,
      rgba(0, 0, 0, 0.12) 60%,
      rgba(0, 0, 0, 0.35) 100%
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

// Increments every 10 minutes; drives a fresh set of rotation angles for all
// lines on each tick.
function useTiltEpoch() {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setEpoch((e) => e + 1), 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return epoch;
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
  const epoch = useTiltEpoch();
  const backdrop = useBackdrop(now);
  const onDevice =
    new URLSearchParams(window.location.search).get("onDevice") === "true";

  const time = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const [, label] = (weather && WMO[weather.weather_code]) || ["", ""];
  const sun = weather && nextSunEvent(weather.daily, now);
  const moon = moonPhase(now);

  return (
    <Viewport $onDevice={onDevice}>
      <Stage $scale={scale}>
        <Backdrop>{backdrop && <img key={backdrop.url} src={backdrop.url} alt="" />}</Backdrop>
        <Content>
          <TiltLine big epoch={epoch}>{time}</TiltLine>
          <TiltLine epoch={epoch}>{date}</TiltLine>
          {weather ? (
            <>
              <TiltLine epoch={epoch}>{Math.round(weather.temperature_2m)}°</TiltLine>
              <TiltLine epoch={epoch}>{label}</TiltLine>
              {sun && (
                <TiltLine epoch={epoch}>
                  {sun.label} in {sun.h}h {sun.m}m
                </TiltLine>
              )}
              {weather.aqi != null && <TiltLine epoch={epoch}>AQI {weather.aqi}</TiltLine>}
              {weather.uv_index != null && (
                <TiltLine epoch={epoch}>UV {Math.round(weather.uv_index)}</TiltLine>
              )}
              <TiltLine epoch={epoch}>{moon}</TiltLine>
            </>
          ) : (
            <TiltLine epoch={epoch}>Loading weather…</TiltLine>
          )}
        </Content>
      </Stage>
    </Viewport>
  );
}

export default App;

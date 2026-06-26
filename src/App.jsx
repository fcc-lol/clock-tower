import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";

// Fixed design dimensions — everything is authored at this exact size.
const STAGE_W = 1080;
const STAGE_H = 1920;

// A static random tilt (5-15°, random direction) picked once per load so each
// card sits at a fixed jaunty angle that doesn't change on re-render.
const tilt = () => (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 10);

// Long Island City, NY (ZIP 11101).
const LAT = 40.7447;
const LON = -73.9485;
const WEATHER_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
  `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,uv_index` +
  `&daily=sunrise,sunset&timezone=America%2FNew_York&forecast_days=2` +
  `&temperature_unit=fahrenheit&wind_speed_unit=mph`;
const AQI_URL =
  `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}` +
  `&current=us_aqi&timezone=America%2FNew_York`;

// WMO weather interpretation codes -> icon + label.
const WMO = {
  0: ["☀️", "Clear sky"],
  1: ["🌤️", "Mainly clear"],
  2: ["⛅", "Partly cloudy"],
  3: ["☁️", "Overcast"],
  45: ["🌫️", "Fog"],
  48: ["🌫️", "Rime fog"],
  51: ["🌦️", "Light drizzle"],
  53: ["🌦️", "Drizzle"],
  55: ["🌦️", "Heavy drizzle"],
  56: ["🌧️", "Freezing drizzle"],
  57: ["🌧️", "Freezing drizzle"],
  61: ["🌧️", "Light rain"],
  63: ["🌧️", "Rain"],
  65: ["🌧️", "Heavy rain"],
  66: ["🌧️", "Freezing rain"],
  67: ["🌧️", "Freezing rain"],
  71: ["🌨️", "Light snow"],
  73: ["🌨️", "Snow"],
  75: ["❄️", "Heavy snow"],
  77: ["🌨️", "Snow grains"],
  80: ["🌦️", "Light showers"],
  81: ["🌧️", "Showers"],
  82: ["⛈️", "Violent showers"],
  85: ["🌨️", "Snow showers"],
  86: ["❄️", "Snow showers"],
  95: ["⛈️", "Thunderstorm"],
  96: ["⛈️", "Thunderstorm, hail"],
  99: ["⛈️", "Thunderstorm, hail"],
};

// Current moon phase from the synodic cycle, referenced to a known new moon
// (2000-01-06 18:14 UTC). Returns a human label.
const MOON_PHASES = [
  "New Moon",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent",
];
function moonPhase(date) {
  const SYNODIC = 29.530588853;
  const REF = Date.UTC(2000, 0, 6, 18, 14) / 86400000; // days
  const days = date.getTime() / 86400000 - REF;
  const frac = ((days % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC;
  // 8 segments centered on the named phases.
  return MOON_PHASES[Math.floor(frac * 8 + 0.5) % 8];
}

// Given the daily sunrise/sunset arrays (local ISO strings) and now, return the
// next event and how long until it.
function nextSunEvent(daily, now) {
  if (!daily) return null;
  const events = [];
  daily.sunrise.forEach((t) => events.push({ label: "Sunrise", at: new Date(t) }));
  daily.sunset.forEach((t) => events.push({ label: "Sunset", at: new Date(t) }));
  const upcoming = events
    .filter((e) => e.at > now)
    .sort((a, b) => a.at - b.at)[0];
  if (!upcoming) return null;
  const mins = Math.round((upcoming.at - now) / 60000);
  return { label: upcoming.label, h: Math.floor(mins / 60), m: mins % 60 };
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
  transform: rotate(${(p) => p.$rot}deg);
`;

// Picks a random tilt once on mount so the angle stays fixed across re-renders.
function TiltLine({ big, children }) {
  const rot = useRef(tilt());
  return (
    <Line $big={big} $rot={rot.current}>
      {children}
    </Line>
  );
}

// Full-stage background layer. The 16:9 iframe is rotated 90° and sized so it
// covers the 1080x1920 portrait stage (1920x1080 rotated = 1080 wide x 1920 tall).
const VideoBackground = styled.div`
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;

  iframe {
    position: absolute;
    top: 50%;
    left: 50%;
    width: ${STAGE_H}px;
    height: ${STAGE_W}px;
    border: 0;
    transform: translate(-50%, -50%) rotate(90deg);
    pointer-events: none;
  }
`;

const Location = styled.div`
  font-size: 34px;
  font-weight: 400;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #5b6275;
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
        const [wxRes, aqRes] = await Promise.all([
          fetch(WEATHER_URL),
          fetch(AQI_URL),
        ]);
        const wx = await wxRes.json();
        const aq = await aqRes.json();
        if (active) {
          setWeather({ ...wx.current, daily: wx.daily, aqi: aq.current?.us_aqi });
        }
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

function App() {
  const scale = useStageScale();
  const now = useNow();
  const weather = useWeather();
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
        <VideoBackground>
          <iframe
            src="https://www.youtube.com/embed/uejy_W2eD_s?autoplay=1&mute=1&loop=1&playlist=uejy_W2eD_s&controls=0&playsinline=1&rel=0&modestbranding=1&disablekb=1&fs=0&iv_load_policy=3"
            title="YouTube video"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        </VideoBackground>
        <Content>
          <TiltLine big>{time}</TiltLine>
          <TiltLine>{date}</TiltLine>
          {weather ? (
            <>
              <TiltLine>{Math.round(weather.temperature_2m)}°</TiltLine>
              <TiltLine>{label}</TiltLine>
              {sun && (
                <TiltLine>
                  {sun.label} in {sun.h}h {sun.m}m
                </TiltLine>
              )}
              {weather.aqi != null && <TiltLine>AQI {weather.aqi}</TiltLine>}
              {weather.uv_index != null && (
                <TiltLine>UV {Math.round(weather.uv_index)}</TiltLine>
              )}
              <TiltLine>{moon}</TiltLine>
            </>
          ) : (
            <TiltLine>Loading weather…</TiltLine>
          )}
        </Content>
      </Stage>
    </Viewport>
  );
}

export default App;

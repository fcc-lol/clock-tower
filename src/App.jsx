import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { IDS } from "./lib/registry.js";
import { SLOT_MS, slotOf, pieceForSkipping } from "./lib/schedule.js";
import { createHub } from "./lib/data.js";
import { resolveSim } from "./lib/simulate.js";
import { zoned, WEEKDAYS, MONTHS } from "./lib/time.js";
import { labelOf } from "./lib/weather.js";

// The display. It shows one visualization at a time from the library in
// src/visuals/, each running in its own iframe (visual.html), and cuts to the
// next one on every quarter hour. This page only keeps the schedule, fetches
// the live data once for everybody, and swaps the iframes.
//
//   /                 the rotation
//   /?viz=<id>        one piece, held
//   /?onDevice=true   kiosk: no cursor, no keys
//   /?debug=1         what is showing, what is next, frame rate
//   /?scenario=..., ?wx=..., ?at=..., ?rate=...   simulated conditions (src/lib/simulate.js)
// Off the kiosk: click or press the right arrow for the next piece, left for
// the previous one, G for the gallery.

const STAGE_W = 1080;
const STAGE_H = 1920;
const PRELOAD_MS = 45 * 1000; // start the next piece this long before its slot, so it is running when cut to
const LOAD_TIMEOUT_MS = 30 * 1000; // a piece that has not drawn by then is skipped

// On the kiosk, the display notices which pieces its hardware cannot keep up
// with and leaves them out. A showing that runs well under its frame rate is a
// strike; three strikes within a week and the piece is skipped until they
// expire, when it gets another chance. `?forgive=1` clears the record.
const SLOW_KEY = "clock-tower:slow:v1";
const SLOW_WINDOW_MS = 7 * 24 * 3600 * 1000;
const SLOW_STRIKES = 3;
function readStrikes() {
  try {
    const all = JSON.parse(localStorage.getItem(SLOW_KEY) || "{}");
    const out = {};
    for (const [id, times] of Object.entries(all && typeof all === "object" ? all : {})) {
      const recent = (Array.isArray(times) ? times : []).filter((t) => typeof t === "number" && Date.now() - t < SLOW_WINDOW_MS);
      if (recent.length) out[id] = recent;
    }
    return out;
  } catch {
    return {};
  }
}
function addStrike(id) {
  const all = readStrikes();
  all[id] = [...(all[id] || []), Date.now()].slice(-SLOW_STRIKES);
  try {
    localStorage.setItem(SLOW_KEY, JSON.stringify(all));
  } catch {}
}
const slowPieces = () => new Set(Object.entries(readStrikes()).filter(([, times]) => times.length >= SLOW_STRIKES).map(([id]) => id));

const params = new URLSearchParams(window.location.search);
const onDevice = params.get("onDevice") === "true";
const debug = params.get("debug") === "1";
const pinned = IDS.includes(params.get("viz")) ? params.get("viz") : null;
if (params.get("forgive") === "1") {
  try {
    localStorage.removeItem(SLOW_KEY);
  } catch {}
}
const sim = resolveSim(params);
const rate = params.has("rate") ? Number(params.get("rate")) || 1 : 1;
const simulatedClock = (sim && sim.ms != null) || rate !== 1;
const clockBase = sim?.ms ?? Date.now();
const clockStart = performance.now();
const clockNow = simulatedClock ? () => clockBase + (performance.now() - clockStart) * rate : () => Date.now();

// Dark surround fills the browser; the stage is centered within it.
const Viewport = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #111;
  cursor: ${onDevice ? "none" : "auto"};
`;

// The 1080x1920 canvas. It is always laid out at full size and scaled with a
// transform, so nothing inside ever has to think about the screen size.
const Stage = styled.div`
  position: relative;
  width: ${STAGE_W}px;
  height: ${STAGE_H}px;
  flex: 0 0 auto;
  transform: scale(${(p) => p.$scale});
  transform-origin: center center;
  background: #000;
  overflow: hidden;
  user-select: none;
`;

const Frame = styled.iframe`
  position: absolute;
  inset: 0;
  width: ${STAGE_W}px;
  height: ${STAGE_H}px;
  border: 0;
  background: #000;
  pointer-events: none;
`;

// What is on screen when no piece is: the bare readouts. Seen for a moment at
// start-up, and for as long as it takes if every piece fails.
const Plain = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 36px;
  padding: 0 88px;
  color: #f2f1ec;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-variant-numeric: tabular-nums;

  b {
    font-size: 250px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.04em;
  }
  b small {
    font-size: 0.2em;
    letter-spacing: 0.06em;
    margin-left: 0.4em;
    color: #a9a7a0;
  }
  span {
    font-size: 54px;
    font-weight: 500;
    color: #cfcdc6;
  }
`;

const Hud = styled.div`
  position: fixed;
  left: 10px;
  top: 10px;
  z-index: 10;
  font: 13px/1.4 ui-monospace, monospace;
  color: #fff;
  background: rgba(0, 0, 0, 0.65);
  padding: 6px 10px;
  border-radius: 6px;
  white-space: pre;
  pointer-events: none;
`;

// Scale the stage so it fits inside the current viewport while preserving the
// 1080x1920 aspect ratio.
function useStageScale() {
  // Worked out before the first render, so the first piece is told the real size of the screen.
  const [scale, setScale] = useState(() => Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H) || 1);
  useEffect(() => {
    const update = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H) || 1);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return scale;
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

function useBuildWatch() {
  useEffect(() => {
    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/build", { cache: "no-store" });
        reloadIfNewBuild((await res.json()).build);
      } catch {
        // No server (vite dev) or offline: nothing to do.
      }
    };
    poll();
    const id = setInterval(poll, 30 * 1000);
    return () => clearInterval(id);
  }, []);
}

let serial = 0;
// Worked out once, when the frame is created: changing an iframe's src reloads it.
const frameUrl = (f, scale) => {
  const q = new URLSearchParams({ id: f.id, embed: "1", key: f.key, slot: String(f.slot), scale: String(scale) });
  if (onDevice) q.set("onDevice", "true");
  if (debug) q.set("hud", "1");
  // Simulated conditions carry through to the piece, starting from this page's clock.
  for (const k of ["scenario", "wx", "seed", "fps"]) if (params.get(k)) q.set(k, params.get(k));
  if (simulatedClock) {
    q.set("at", String(Math.round(f.startedAtClock)));
    if (rate !== 1) q.set("rate", String(rate));
  }
  return `/visual.html?${q}`;
};

// The rotation: which iframe is showing, which is warming up behind it.
function useRotation(dataRef, scaleRef) {
  const [view, setView] = useState({ shown: null, pending: null, stats: null });
  const R = useRef({ shown: null, pending: null, bad: new Set(), offset: 0, jump: false, windows: new Map(), stats: null, retryAt: 0 }).current;

  useEffect(() => {
    const publish = () => setView({ shown: R.shown, pending: R.pending, stats: R.stats });

    const begin = (slot, immediate) => {
      if (!IDS.length) return;
      // Never the piece already showing (the schedule never repeats one; skipping
      // must not either). Leave out what has failed this session and, on the
      // kiosk, what this machine runs badly, as long as that leaves something.
      const not = R.shown?.id ?? null;
      const skip = onDevice ? new Set([...R.bad, ...slowPieces()]) : R.bad;
      let id = pinned || pieceForSkipping(slot, IDS, skip, not) || pieceForSkipping(slot, IDS, skip, null) || pieceForSkipping(slot, IDS, R.bad, not);
      if (!id) {
        // Everything has failed at least once: forgive and try again.
        R.bad.clear();
        id = pieceForSkipping(slot, IDS, R.bad, null);
      }
      const f = { key: `f${++serial}`, id, slot, ready: false, immediate, startedAt: performance.now(), startedAtClock: clockNow() };
      f.url = frameUrl(f, scaleRef.current);
      R.pending = f;
      publish();
    };
    // After a failure, wait a little before trying anything else, so a page
    // that cannot load at all does not spin through the library.
    const backOff = () => {
      R.retryAt = performance.now() + 4000;
    };

    const tick = () => {
      const now = clockNow();
      const slot = slotOf(now) + R.offset;
      const p = R.pending;
      if (p) {
        const due = p.immediate || !R.shown || now >= (p.slot - R.offset) * SLOT_MS;
        if (p.ready && due) {
          p.shownAt = performance.now();
          R.shown = p;
          R.pending = null;
          R.jump = false;
          publish();
        } else if (!p.ready && performance.now() - p.startedAt > LOAD_TIMEOUT_MS) {
          if (!pinned) R.bad.add(p.id);
          R.pending = null;
          backOff();
          publish();
        }
        return;
      }
      if (performance.now() < R.retryAt) return;
      if (!R.shown) return begin(slot, true);
      if (pinned) return;
      if (R.jump || R.shown.slot < slot || R.shown.slot > slot + 1) return begin(slot, true); // skipped by hand, or the clock moved under us
      if (R.shown.slot === slot && (slot - R.offset + 1) * SLOT_MS - now <= PRELOAD_MS) begin(slot + 1, false);
    };

    const onMessage = (e) => {
      const m = e.data;
      if (e.origin !== window.location.origin || !m || typeof m.type !== "string" || !m.type.startsWith("ct:")) return;
      const frame = [R.shown, R.pending].find((f) => f && f.key === m.key);
      if (!frame) return;
      if (m.type === "ct:hello") {
        R.windows.set(m.key, e.source);
        e.source.postMessage({ type: "ct:data", data: dataRef.current }, window.location.origin);
      } else if (m.type === "ct:ready") {
        frame.ready = true;
      } else if (m.type === "ct:error") {
        if (!pinned) R.bad.add(frame.id);
        if (R.pending === frame) R.pending = null;
        else R.shown = null; // take the broken one off; the plain clock shows until the next is up
        backOff();
        publish();
      } else if (m.type === "ct:stats" && R.shown === frame) {
        R.stats = m;
        // Count how the showing is going, once it has had 20 s to settle.
        if (m.clean !== false && m.target > 0 && performance.now() - (frame.shownAt || 0) > 20000) {
          frame.samples = (frame.samples || 0) + 1;
          if (m.fps < m.target * 0.55) frame.slow = (frame.slow || 0) + 1;
          // A minute or more of readings, most of them slow: a strike (once per showing).
          if (onDevice && !pinned && !frame.struck && frame.samples >= 30 && frame.slow > frame.samples * 0.7) {
            frame.struck = true;
            addStrike(frame.id);
          }
        }
        if (debug) publish();
      }
    };

    const step = (by) => {
      if (pinned || onDevice || IDS.length < 2) return;
      R.offset += by;
      R.jump = true;
      R.pending = null;
      tick();
    };
    const onKey = (e) => {
      if (e.key === "ArrowRight" || e.key === " ") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "g" || e.key === "G") window.location.href = "/gallery";
    };
    const onClick = () => step(1);

    R.broadcast = (message) => {
      for (const f of [R.shown, R.pending]) if (f) R.windows.get(f.key)?.postMessage(message, window.location.origin);
      for (const k of R.windows.keys()) if (k !== R.shown?.key && k !== R.pending?.key) R.windows.delete(k);
    };

    tick();
    const id = setInterval(tick, 200);
    window.addEventListener("message", onMessage);
    if (!onDevice) {
      window.addEventListener("keydown", onKey);
      window.addEventListener("click", onClick);
    }
    return () => {
      clearInterval(id);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { view, broadcast: (m) => R.broadcast?.(m) };
}

function App() {
  const scale = useStageScale();
  useBuildWatch();

  // Live data, fetched once here and handed to whichever piece is running.
  // (With simulated conditions each piece makes its own.)
  const dataRef = useRef(null);
  const [data, setData] = useState(null);
  // Real pixels per stage unit, so pieces can size their canvases for the panel.
  const pixelScale = Math.round(scale * (window.devicePixelRatio || 1) * 1000) / 1000;
  const scaleRef = useRef(pixelScale);
  scaleRef.current = pixelScale;
  const { view, broadcast } = useRotation(dataRef, scaleRef);
  useEffect(() => {
    if (sim && sim.wx !== "live") return;
    const hub = createHub({
      onChange: (d) => {
        dataRef.current = d;
        setData(d);
        broadcast({ type: "ct:data", data: d });
      },
    });
    dataRef.current = hub.data;
    setData(hub.data);
    return hub.start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    broadcast({ type: "ct:scale", scale: pixelScale });
  }, [pixelScale]); // eslint-disable-line react-hooks/exhaustive-deps

  // The plain clock underneath.
  const [now, setNow] = useState(clockNow());
  useEffect(() => {
    const id = setInterval(() => setNow(clockNow()), 1000);
    return () => clearInterval(id);
  }, []);
  const z = zoned(now);
  const wx = data?.weather && Math.abs(now - data.weather.at) < 3 * 3600 * 1000 ? data.weather.current : null;

  const { shown, pending, stats } = view;
  const frames = [shown, pending].filter(Boolean);
  const toNext = SLOT_MS - (((now % SLOT_MS) + SLOT_MS) % SLOT_MS);

  return (
    <Viewport>
      <Stage $scale={scale}>
        <Plain>
          <b>
            {z.hour % 12 || 12}:{String(z.minute).padStart(2, "0")}
            <small>{z.hour < 12 ? "AM" : "PM"}</small>
          </b>
          <span>
            {WEEKDAYS[z.weekday]}, {MONTHS[z.month - 1]} {z.day}
          </span>
          {wx && (
            <span>
              {Math.round(wx.temp)}° {labelOf(wx.code)}
            </span>
          )}
        </Plain>
        {frames.map((f) => (
          <Frame key={f.key} title={f.id} src={f.url} style={{ zIndex: f === shown ? 2 : 1 }} />
        ))}
      </Stage>
      {debug && (
        <Hud>
          {`showing  ${shown ? shown.id : "(plain clock)"}${pinned ? "  [held]" : ""}\n`}
          {`next     ${pending ? `${pending.id}${pending.ready ? " (ready)" : " (loading)"}` : "-"}  in ${Math.floor(toNext / 60000)}:${String(Math.floor((toNext % 60000) / 1000)).padStart(2, "0")}\n`}
          {`library  ${IDS.length} pieces${onDevice && slowPieces().size ? `  (too slow here, skipped: ${[...slowPieces()].join(", ")})` : ""}\n`}
          {stats ? `${stats.fps} fps  frame ${stats.avgMs} ms  quality ${stats.quality}` : ""}
        </Hud>
      )}
    </Viewport>
  );
}

export default App;

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
//   /?onDevice=true   kiosk: no cursor, no keys; pieces run in a process of their own
//   /?debug=1         what is showing, what is next, frame rate
//   /?scenario=..., ?wx=..., ?at=..., ?rate=...   simulated conditions (src/lib/simulate.js)
// Off the kiosk: click or press the right arrow for the next piece, left for
// the previous one, G for the gallery.

const STAGE_W = 1080;
const STAGE_H = 1920;
const PRELOAD_MS = 45 * 1000; // start the next piece this long before its slot, so it is running when cut to
const LOAD_TIMEOUT_MS = 30 * 1000; // a piece that has not drawn by then is skipped
const BAD_FOR_MS = 60 * 60 * 1000; // a piece that failed is left out for an hour, then given another chance
const PING_MS = 5 * 1000; // how often each piece is asked whether it is still there
const SILENT_MS = 15 * 1000; // one that has not answered for this long has hung, and is taken off
const HELLO_TIMEOUT_MS = 12 * 1000; // how long to wait for the first word from one of the machine's other names

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

// On the kiosk each piece is loaded from another of this machine's own names
// (127.0.0.1 and 127.0.0.2 when this page is on localhost). To the browser each
// name is a different site, and every site gets a process of its own, so a
// piece that hangs or is slow to start can stall neither this page nor the
// piece beside it: the clock, the schedule and the check that everybody is
// still answering keep running, and a hung piece is taken off. A name that
// never answers is given up on; with none left, pieces are loaded from this
// page's own address, as they are everywhere else. `?isolate=0` turns it off.
const OTHER_ORIGINS = (() => {
  const { protocol, hostname, port } = window.location;
  if (!onDevice || params.get("isolate") === "0" || !/^(localhost|127(\.\d{1,3}){3})$/.test(hostname)) return [];
  return ["127.0.0.1", "127.0.0.2", "localhost"]
    .filter((name) => name !== hostname)
    .slice(0, 2)
    .map((name) => `${protocol}//${name}${port ? `:${port}` : ""}`);
})();

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

// What is on screen when no piece is: the bare readouts. Seen at start-up
// until the first piece has drawn, and for as long as it takes if every piece
// fails. It sits above a piece that is still loading and below the one showing.
const Plain = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  background: #000;
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
    // What this page's clock read, and when, so the piece's clock follows this one.
    q.set("at", String(Math.round(f.startedAtClock)));
    q.set("atWall", String(f.startedAtWall));
    if (rate !== 1) q.set("rate", String(rate));
  }
  const elsewhere = f.origin !== window.location.origin;
  if (elsewhere) q.set("host", window.location.origin);
  return `${elsewhere ? f.origin : ""}/visual.html?${q}`;
};

// The rotation: which iframe is showing, which is warming up behind it.
function useRotation(dataRef, scaleRef) {
  const [view, setView] = useState({ shown: null, pending: null, stats: null });
  const R = useRef({
    shown: null,
    pending: null,
    bad: new Map(), // piece id -> when it failed (performance.now())
    fails: 0, // failures in a row, for the back-off
    up: new Set(), // the machine's other names that have answered
    down: new Set(), // ...and those given up on
    quiet: new Map(), // name -> how many frames in a row said nothing from it
    turn: 0,
    offset: 0,
    jump: false,
    stats: null,
    retryAt: 0,
    lastTick: 0,
  }).current;

  useEffect(() => {
    const publish = () => setView({ shown: R.shown, pending: R.pending, stats: R.stats });
    // With ?debug=1 the console keeps a record of what the rotation did and why.
    const say = debug ? (...words) => console.log(`[display ${(performance.now() / 1000).toFixed(1)}s]`, ...words) : () => {};
    const post = (f, message) => {
      try {
        f?.win?.postMessage(message, f.origin);
      } catch {}
    };

    // Where the next piece is loaded from: the machine's other names in turn,
    // and never the one the piece on screen is using (two pieces under one
    // name share a process, and would stall together).
    const pickOrigin = () => {
      const usable = OTHER_ORIGINS.filter((o) => !R.down.has(o));
      if (!usable.length) return window.location.origin;
      const free = usable.filter((o) => o !== R.shown?.origin);
      const from = free.length ? free : usable;
      return from[R.turn++ % from.length];
    };

    const begin = (slot, immediate) => {
      if (!IDS.length) return;
      const nowP = performance.now();
      for (const [id, at] of R.bad) if (nowP - at > BAD_FOR_MS) R.bad.delete(id);
      const bad = new Set(R.bad.keys());
      // Never the piece already showing (the schedule never repeats one; skipping
      // must not either). Leave out what has failed lately and, on the kiosk,
      // what this machine runs badly, as long as that leaves something.
      const not = R.shown?.id ?? null;
      const skip = onDevice ? new Set([...bad, ...slowPieces()]) : bad;
      let id = pinned || pieceForSkipping(slot, IDS, skip, not) || pieceForSkipping(slot, IDS, skip, null) || pieceForSkipping(slot, IDS, bad, not);
      if (!id) {
        // Everything has failed lately: forgive and try again.
        R.bad.clear();
        id = pieceForSkipping(slot, IDS, new Set(), null);
      }
      const f = {
        key: `f${++serial}`,
        id,
        slot,
        ready: false,
        immediate,
        startedAt: nowP,
        startedAtClock: clockNow(),
        startedAtWall: Date.now(),
        origin: pickOrigin(),
        win: null, // its window, once it has said hello
        heardAt: 0, // when it last said anything
        pingedAt: 0, // when the oldest question it has not answered was asked
        lastPing: 0,
      };
      f.url = frameUrl(f, scaleRef.current);
      R.pending = f;
      say(`loading ${id} for slot ${slot}${immediate ? " (to show at once)" : ""} from ${f.origin}`);
      // From here the piece on screen shares the machine with the one starting
      // up, so its frame rate no longer says anything about it.
      post(R.shown, { type: "ct:leaving" });
      publish();
    };
    // After a failure, wait before trying anything else, and longer each time
    // nothing will load (4 s, 8, 16 ... up to five minutes), so a display that
    // cannot load anything is not forever starting pieces.
    const backOff = () => {
      R.fails += 1;
      R.retryAt = performance.now() + Math.min(4000 * 2 ** (R.fails - 1), 5 * 60 * 1000);
    };
    // Take a frame off: it failed, never drew, or stopped answering. If it was
    // the one showing, the plain clock shows until another is up.
    const drop = (frame, why) => {
      say(`taking off ${frame.id}: ${why}`);
      if (!pinned) R.bad.set(frame.id, performance.now());
      if (R.pending === frame) R.pending = null;
      else if (R.shown === frame) {
        R.shown = null;
        R.stats = null;
      }
      backOff();
      publish();
    };

    const tick = () => {
      const now = clockNow();
      const nowP = performance.now();
      const slot = slotOf(now) + R.offset;

      // Is everybody still answering? A piece in a process of its own can hang
      // without taking this page with it; one that leaves a question unanswered
      // for SILENT_MS is taken off. (If this page was itself stalled or asleep,
      // or is in a background tab, nobody's silence counts.)
      const stalled = nowP - R.lastTick > 3000 || document.visibilityState !== "visible";
      R.lastTick = nowP;
      for (const f of [R.shown, R.pending]) {
        if (!f || !f.win) continue;
        if (stalled) f.pingedAt = 0;
        else if (f.pingedAt && f.heardAt < f.pingedAt && nowP - f.pingedAt > SILENT_MS) {
          // A frame under the same name shares its process and is stuck with
          // it: that one goes too (without blame), so the process can end.
          const mate = [R.shown, R.pending].find((g) => g && g !== f && g.origin === f.origin);
          drop(f, `no answer for ${Math.round((nowP - f.heardAt) / 1000)} s`);
          if (mate) {
            say(`and ${mate.id}, which was in the same process`);
            if (R.pending === mate) R.pending = null;
            else if (R.shown === mate) R.shown = null;
            publish();
          }
          continue;
        }
        if (nowP - f.lastPing >= PING_MS) {
          f.lastPing = nowP;
          if (!f.pingedAt || f.heardAt >= f.pingedAt) f.pingedAt = nowP; // otherwise an earlier question is still open
          post(f, { type: "ct:ping" });
        }
      }

      const p = R.pending;
      if (p) {
        const due = p.immediate || !R.shown || now >= (p.slot - R.offset) * SLOT_MS;
        if (p.ready && due) {
          p.shownAt = nowP;
          R.shown = p;
          R.pending = null;
          R.jump = false;
          R.fails = 0;
          R.stats = null;
          post(p, { type: "ct:shown" });
          say(`showing ${p.id}`);
          publish();
        } else if (!p.heardAt && !R.up.has(p.origin) && p.origin !== window.location.origin && nowP - p.startedAt > HELLO_TIMEOUT_MS) {
          // Not a word from that name, now or ever: it probably does not reach
          // this server. Stop using it: at once if no other name has answered
          // either (so a machine where none of them work is not kept waiting),
          // otherwise the second time. The piece is tried again elsewhere.
          const times = (R.quiet.get(p.origin) || 0) + 1;
          R.quiet.set(p.origin, times);
          const giveUp = times >= 2 || !R.up.size;
          if (giveUp) R.down.add(p.origin);
          say(`nothing answers from ${p.origin}${giveUp ? ": not using it any more" : ""}`);
          R.pending = null;
          publish();
        } else if (!p.ready && nowP - p.startedAt > LOAD_TIMEOUT_MS) {
          drop(p, `not drawn after ${LOAD_TIMEOUT_MS / 1000} s`);
        }
        return;
      }
      if (nowP < R.retryAt) return;
      if (!R.shown) return begin(slot, true);
      if (pinned) return;
      if (R.jump || R.shown.slot < slot || R.shown.slot > slot + 1) return begin(slot, true); // skipped by hand, or the clock moved under us
      if (R.shown.slot === slot && (slot - R.offset + 1) * SLOT_MS - now <= PRELOAD_MS) begin(slot + 1, false);
    };

    const onMessage = (e) => {
      const m = e.data;
      if (!m || typeof m.type !== "string" || !m.type.startsWith("ct:")) return;
      const frame = [R.shown, R.pending].find((f) => f && f.key === m.key);
      if (!frame || e.origin !== frame.origin) return;
      frame.heardAt = performance.now();
      R.up.add(frame.origin);
      R.quiet.delete(frame.origin);
      if (m.type === "ct:hello") {
        frame.win = e.source;
        // The scale first: it may have changed since the frame's address was
        // made, and the piece mounts as soon as it has its data.
        post(frame, { type: "ct:scale", scale: scaleRef.current });
        post(frame, { type: "ct:data", data: dataRef.current });
      } else if (m.type === "ct:ready") {
        frame.ready = true;
      } else if (m.type === "ct:error") {
        drop(frame, `it failed (${m.message || "error"})`);
      } else if (m.type === "ct:stats" && R.shown === frame) {
        R.stats = m;
        // Count how the showing is going, once it has had 20 s to settle, and
        // not while the next piece is starting up beside it.
        if (m.clean !== false && !R.pending && m.target > 0 && performance.now() - (frame.shownAt || 0) > 20000) {
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
      for (const f of [R.shown, R.pending]) post(f, message);
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
          <Frame key={f.key} title={f.id} src={f.url} style={{ zIndex: f === shown ? 2 : 0 }} />
        ))}
      </Stage>
      {debug && (
        <Hud>
          {`showing  ${shown ? shown.id : "(plain clock)"}${pinned ? "  [held]" : ""}\n`}
          {`next     ${pending ? `${pending.id}${pending.ready ? " (ready)" : " (loading)"}` : "-"}  in ${Math.floor(toNext / 60000)}:${String(Math.floor((toNext % 60000) / 1000)).padStart(2, "0")}\n`}
          {`library  ${IDS.length} pieces${onDevice && slowPieces().size ? `  (too slow here, skipped: ${[...slowPieces()].join(", ")})` : ""}\n`}
          {onDevice && shown ? `process  ${shown.origin !== window.location.origin ? `its own (${shown.origin.replace(/^.*\/\//, "")})` : "this page's"}, last heard from ${Math.round((performance.now() - shown.heardAt) / 1000)} s ago\n` : ""}
          {stats ? `${stats.fps} fps  frame ${stats.avgMs} ms  quality ${stats.quality}` : ""}
        </Hud>
      )}
    </Viewport>
  );
}

export default App;

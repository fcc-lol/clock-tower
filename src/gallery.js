// /gallery: every visualization in the library, running side by side, under
// live conditions or any simulated ones. Each tile is the same page the display
// uses (visual.html), scaled down. Only tiles on screen are running.

import { SCENARIOS, PRESETS } from "./lib/simulate.js";
import { createHub } from "./lib/data.js";

// Titles and descriptions come from the modules themselves. Each is loaded on
// its own, so one that cannot be loaded costs only its own caption.
const loaders = import.meta.glob(["./visuals/*.js", "!./visuals/_*.js"]);
const pieces = Object.keys(loaders)
  .map((path) => ({ id: path.slice(path.lastIndexOf("/") + 1, -3), path, title: null, description: null, caption: null }))
  .sort((a, b) => a.id.localeCompare(b.id));
const caption = (p) => {
  if (!p.caption) return;
  p.caption.title.textContent = p.title || p.id;
  p.caption.description.textContent = p.description || "";
};
for (const p of pieces) {
  loaders[p.path]()
    .then((m) => {
      p.title = m.default?.title;
      p.description = m.default?.description;
    })
    .catch((err) => {
      p.description = `Could not be loaded: ${String(err?.message || err).slice(0, 120)}`;
    })
    .then(() => caption(p));
}

const $ = (id) => document.getElementById(id);
const grid = $("grid");
const selScenario = $("scenario");
const selWx = $("wx");
const selAt = $("at");
$("count").textContent = `${pieces.length} visualization${pieces.length === 1 ? "" : "s"}`;

const option = (value, label) => Object.assign(document.createElement("option"), { value, textContent: label });
selScenario.append(option("", "Live, right now"), option("custom", "Custom (pick weather and time)"));
for (const [name, s] of Object.entries(SCENARIOS)) selScenario.append(option(name, name.replace(/-/g, " ")));
for (const name of Object.keys(PRESETS)) selWx.append(option(name, name));
selWx.append(option("none", "no data"));
for (const t of ["dawn", "sunrise", "morning", "noon", "afternoon", "golden", "sunset", "dusk", "night", "midnight"]) selAt.append(option(t, t));
selWx.value = "partly";
selAt.value = "noon";

// The page's state lives in the URL, so a view can be shared.
const url = new URLSearchParams(location.search);
if (url.get("scenario") && SCENARIOS[url.get("scenario")]) selScenario.value = url.get("scenario");
else if (url.get("wx") || url.get("at")) {
  selScenario.value = "custom";
  if (url.get("wx")) selWx.value = url.get("wx");
  if (url.get("at")) selAt.value = url.get("at");
}

function simQuery() {
  const q = new URLSearchParams();
  if (selScenario.value === "custom") {
    q.set("wx", selWx.value);
    q.set("at", selAt.value);
  } else if (selScenario.value) q.set("scenario", selScenario.value);
  return q;
}

// Live data is fetched once here and handed to every tile, as the display does.
let hub = null;
const windows = new Set();
function ensureHub() {
  if (hub) return;
  hub = createHub({
    onChange: (data) => {
      for (const w of windows) {
        try {
          w.postMessage({ type: "ct:data", data }, location.origin);
        } catch {
          windows.delete(w);
        }
      }
    },
  });
  hub.start();
}
window.addEventListener("message", (e) => {
  if (e.origin !== location.origin || e.data?.type !== "ct:hello") return;
  ensureHub();
  windows.add(e.source);
  e.source.postMessage({ type: "ct:data", data: hub.data }, location.origin);
});

const tileScale = () => (window.matchMedia("(max-width: 640px)").matches ? 0.15 : 0.25);

function frameSrc(id) {
  const q = simQuery();
  q.set("id", id);
  q.set("scale", String(tileScale() * (window.devicePixelRatio || 1)));
  if (!q.has("scenario") && !q.has("wx")) q.set("embed", "1");
  return `/visual.html?${q}`;
}

// Mount a tile's iframe when it nears the viewport; drop it when it is far away.
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      const shot = entry.target;
      const frame = shot.querySelector("iframe");
      if (entry.isIntersecting && !frame) {
        const node = document.createElement("iframe");
        node.title = shot.dataset.id;
        node.loading = "lazy";
        node.src = frameSrc(shot.dataset.id);
        shot.append(node);
      } else if (!entry.isIntersecting && frame) {
        windows.delete(frame.contentWindow);
        frame.remove();
      }
    }
  },
  { rootMargin: "300px 0px" },
);

function render() {
  const q = simQuery();
  const custom = selScenario.value === "custom";
  selWx.parentElement.style.display = custom ? "" : "none";
  selAt.parentElement.style.display = custom ? "" : "none";
  history.replaceState(null, "", q.toString() ? `?${q}` : location.pathname);
  observer.disconnect();
  windows.clear();
  grid.replaceChildren();
  if (!pieces.length) {
    grid.append(Object.assign(document.createElement("div"), { className: "empty", textContent: "No visualizations yet. Add one to src/visuals/." }));
    return;
  }
  for (const p of pieces) {
    const open = new URLSearchParams(q);
    open.set("viz", p.id);
    const tile = document.createElement("div");
    tile.className = "tile";
    const shot = Object.assign(document.createElement("a"), { className: "shot", href: `/?${open}` });
    shot.dataset.id = p.id;
    p.caption = { title: document.createElement("h2"), description: document.createElement("p") };
    caption(p);
    tile.append(shot, p.caption.title, p.caption.description);
    grid.append(tile);
    observer.observe(shot);
  }
}

for (const sel of [selScenario, selWx, selAt]) sel.addEventListener("change", render);
render();

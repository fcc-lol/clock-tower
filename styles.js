// Style previews: one backdrop per style, kept in generated/preview/ apart from
// the live slots, so the styles can be compared and iterated on side by side.
// Used by the /styles page (mounted here) and by `npm run visual:preview`.

import { readFile, writeFile, mkdir, readdir, copyFile, stat, unlink } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { buildPrompt, fetchConditions, snapshotReadout, STYLES, KEEP_MS } from "./visuals.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The image API rate-limits bursts: wait out a 429.
async function generateWithRetry(provider, prompt, tries = 4) {
  try {
    return await provider.generate(prompt);
  } catch (err) {
    if (tries <= 1 || !/ 429/.test(String(err.message))) throw err;
    await new Promise((r) => setTimeout(r, 30_000));
    return generateWithRetry(provider, prompt, tries - 1);
  }
}

// Generates one style's preview image (and its Claude-designed layout, when
// there is a designer) and writes <style>.<ext> + <style>.json into `dir`.
export async function renderPreview({ style, weather, provider, designer, dir }) {
  const started = Date.now();
  const { prompt } = buildPrompt(weather, new Date(), style);
  const { buffer, ext, usd } = await generateWithRetry(provider, prompt);
  let layout = null;
  let note = "built-in layout";
  let cost = usd;
  if (designer) {
    try {
      const d = await designer.design({ buffer, ext, style });
      layout = d.layout;
      note = d.rationale;
      cost += d.usd;
    } catch (err) {
      note = `layout failed: ${String(err.message || err).slice(0, 160)}`;
    }
  }
  const file = `${style}.${ext}`;
  const meta = {
    url: `/generated/preview/${file}?v=${Date.now().toString(36)}`,
    style,
    layout,
    readout: await snapshotReadout(weather, new Date(), Date.now()).catch(() => null),
    note,
    prompt,
    model: provider.model,
    createdAt: new Date().toISOString(),
    ms: Date.now() - started,
    usd: cost,
  };
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, file), buffer);
  await writeFile(join(dir, `${style}.json`), JSON.stringify(meta, null, 2));
  // Keep earlier previews too, not just the latest per style, for the gallery
  // (for as long as live images are kept).
  const stamp = `${style}-${Date.now().toString(36)}`;
  const history = join(dir, "history");
  await mkdir(history, { recursive: true });
  await copyFile(join(dir, file), join(history, `${stamp}.${ext}`));
  await writeFile(join(history, `${stamp}.json`), JSON.stringify({ ...meta, url: `/generated/preview/history/${stamp}.${ext}` }, null, 2));
  const cutoff = Date.now() - KEEP_MS;
  for (const f of await readdir(history)) {
    const old = await stat(join(history, f)).then((st) => st.mtimeMs < cutoff, () => false);
    if (old) await unlink(join(history, f)).catch(() => {});
  }
  return meta;
}

// Mounts the /styles page and its API on the express app.
//   GET  /styles                      the gallery page
//   GET  /api/styles                  every style with its latest preview (or null)
//   GET  /gallery, /api/gallery       every generation still on disk, newest first
//   POST /api/styles/:name/generate   regenerate one (only when `canGenerate`)
// Generating costs money per image, so it is only allowed from the machine the
// server runs on: anywhere else the page is a read-only gallery.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// True only for a browser on this machine talking to the server directly. A
// reverse proxy on the same machine also connects from loopback, so the
// address alone is not enough: the request must also have been addressed to
// localhost and carry no forwarding headers.
export function isLocalRequest(req) {
  const addr = req.socket?.remoteAddress || "";
  const loopback = addr === "::1" || addr === "127.0.0.1" || addr === "::ffff:127.0.0.1";
  const host = String(req.headers.host || "").replace(/:\d+$/, "").toLowerCase();
  const forwarded = ["x-forwarded-for", "x-forwarded-host", "x-real-ip", "forwarded", "via"].some((h) => req.headers[h]);
  return loopback && LOCAL_HOSTS.has(host) && !forwarded;
}

// Every generation still on disk, newest first: the live slots (generated/),
// the latest preview of each style (generated/preview/) and every earlier
// preview (generated/preview/history/).
async function listGenerations(root) {
  const sources = [
    { kind: "live", sub: "" },
    { kind: "preview", sub: "preview" },
    { kind: "preview", sub: "preview/history" },
  ];
  const seen = new Set();
  const out = [];
  // History first, so the latest preview (also copied there) is listed once.
  for (const { kind, sub } of [sources[0], sources[2], sources[1]]) {
    const names = await readdir(join(root, sub)).catch(() => []);
    for (const f of names.filter((n) => n.endsWith(".json"))) {
      try {
        const meta = JSON.parse(await readFile(join(root, sub, f), "utf8"));
        if (!meta.url || !meta.style) continue;
        const key = `${kind}:${meta.style}:${meta.createdAt}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          kind,
          style: meta.style,
          url: meta.url,
          meta: `/generated/${sub ? `${sub}/` : ""}${f}`,
          // Older metadata has no timestamp: fall back to the file's own.
          createdAt: meta.createdAt || (meta.slot ? new Date(meta.slot).toISOString() : (await stat(join(root, sub, f))).mtime.toISOString()),
        });
      } catch {}
    }
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function mountStyles(app, { dir, provider, designer, log = console.log }) {
  let weatherCache = null; // { at, data }
  async function weather() {
    if (weatherCache && Date.now() - weatherCache.at < 10 * 60 * 1000) return weatherCache.data;
    weatherCache = { at: Date.now(), data: await fetchConditions() };
    return weatherCache.data;
  }

  const allowed = (req) => Boolean(provider) && isLocalRequest(req);
  let queue = Promise.resolve(); // one generation at a time

  app.get("/styles", (req, res) => res.sendFile(join(__dirname, "styles-page.html")));
  app.get("/gallery", (req, res) => res.sendFile(join(__dirname, "gallery-page.html")));

  app.get("/api/gallery", async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ items: await listGenerations(join(dir, "..")) });
  });

  app.get("/api/styles", async (req, res) => {
    const styles = await Promise.all(
      Object.keys(STYLES).map(async (name) => ({
        name,
        preview: await readFile(join(dir, `${name}.json`), "utf8").then(JSON.parse).catch(() => null),
      })),
    );
    res.set("Cache-Control", "no-store");
    const ok = allowed(req);
    res.json({
      canGenerate: ok,
      why: ok ? null : !provider ? "Backdrop generation is off (no Google credentials)." : "Generating is only available on localhost.",
      styles,
    });
  });

  app.post("/api/styles/:name/generate", (req, res) => {
    const style = req.params.name;
    if (!allowed(req)) return res.status(403).json({ error: "generating is only available on localhost" });
    if (!Object.hasOwn(STYLES, style)) return res.status(404).json({ error: `no style "${style}"` });
    const job = queue.then(async () => {
      log(`[styles] generating preview: ${style}`);
      const meta = await renderPreview({ style, weather: await weather(), provider, designer, dir });
      log(`[styles] ${style} done in ${Math.round(meta.ms / 1000)}s (~$${meta.usd.toFixed(4)})`);
      return meta;
    });
    queue = job.catch(() => {});
    job.then(
      (meta) => res.json(meta),
      (err) => {
        log(`[styles] ${style} failed: ${String(err.message || err).slice(0, 200)}`);
        // Prefer the API's own message over the raw JSON body.
        const text = String(err.message || err);
        const msg = text.match(/"message":\s*"((?:[^"\\]|\\.)*)"/)?.[1];
        res.status(502).json({ error: (msg || text).slice(0, 600) });
      },
    );
  });
}

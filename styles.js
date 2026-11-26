// Style previews: one backdrop per style, kept in generated/preview/ apart from
// the live slots, so the styles can be compared and iterated on side by side.
// Used by the /styles page (mounted here) and by `npm run visual:preview`.

import { readFile, writeFile, mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { buildPrompt, fetchConditions, STYLES } from "./visuals.js";

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
  return meta;
}

// Mounts the /styles page and its API on the express app.
//   GET  /styles                      the gallery page
//   GET  /api/styles                  every style with its latest preview (or null)
//   POST /api/styles/:name/generate   regenerate one (only when `canGenerate`)
// Generating costs money per image, so it is off unless STYLE_LAB=1 is set:
// on a public server the page is then a read-only gallery.
export function mountStyles(app, { dir, provider, designer, canGenerate = false, log = console.log }) {
  let weatherCache = null; // { at, data }
  async function weather() {
    if (weatherCache && Date.now() - weatherCache.at < 10 * 60 * 1000) return weatherCache.data;
    weatherCache = { at: Date.now(), data: await fetchConditions() };
    return weatherCache.data;
  }

  const allowed = Boolean(provider && canGenerate);
  let queue = Promise.resolve(); // one generation at a time

  app.get("/styles", (req, res) => res.sendFile(join(__dirname, "styles-page.html")));

  app.get("/api/styles", async (req, res) => {
    const styles = await Promise.all(
      Object.keys(STYLES).map(async (name) => ({
        name,
        preview: await readFile(join(dir, `${name}.json`), "utf8").then(JSON.parse).catch(() => null),
      })),
    );
    res.set("Cache-Control", "no-store");
    res.json({
      canGenerate: allowed,
      why: allowed ? null : !provider ? "Backdrop generation is off (no Google credentials)." : "Set STYLE_LAB=1 in .env to generate from this page.",
      styles,
    });
  });

  app.post("/api/styles/:name/generate", (req, res) => {
    const style = req.params.name;
    if (!allowed) return res.status(403).json({ error: "generation is off on this server" });
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

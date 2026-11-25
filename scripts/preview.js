// Generates backdrops with their Claude-designed layouts into
// generated/preview/, without touching the live slots, so a range of styles
// can be looked at side by side.
//   npm run visual:preview -- neon woodblock    # these styles
//   npm run visual:preview -- all               # every style
// View one on the display page with ?preview=<style>. Each image costs the
// same as a live one (see README).
import { writeFile, mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { fetchWeather } from "../src/lib/sky.js";
import { buildPrompt, createProvider, loadDotenv, STYLES } from "../visuals.js";
import { createLayoutDesigner } from "../layout.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await loadDotenv(join(root, ".env"));

const args = process.argv.slice(2);
const styles = args.includes("all") || !args.length ? Object.keys(STYLES) : args.filter((s) => STYLES[s]);
const out = join(root, "generated", "preview");
await mkdir(out, { recursive: true });

const provider = await createProvider();
if (!provider) process.exit(1);
const designer = createLayoutDesigner();
const weather = await fetchWeather();

// The image API rate-limits bursts: go one at a time and wait out a 429.
async function generate(prompt, tries = 4) {
  try {
    return await provider.generate(prompt);
  } catch (err) {
    if (tries <= 1 || !/ 429/.test(String(err.message))) throw err;
    await new Promise((r) => setTimeout(r, 30_000));
    return generate(prompt, tries - 1);
  }
}

let next = 0;
let total = 0;
async function worker() {
  while (next < styles.length) {
    const style = styles[next++];
    try {
      const { prompt } = buildPrompt(weather, new Date(), style);
      const { buffer, ext, usd } = await generate(prompt);
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
      total += cost;
      const file = `${style}.${ext}`;
      await writeFile(join(out, file), buffer);
      await writeFile(join(out, `${style}.json`), JSON.stringify({ url: `/generated/preview/${file}?v=${Date.now().toString(36)}`, style, layout, note, prompt }, null, 2));
      console.log(`${style}: ~$${cost.toFixed(4)}  ${note}`);
    } catch (err) {
      console.log(`${style}: FAILED ${String(err.message || err).slice(0, 200)}`);
    }
  }
}
await worker();
console.log(`done: ${styles.length} image(s), ~$${total.toFixed(2)}`);

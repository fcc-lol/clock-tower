// Generates backdrops with their Claude-designed layouts into
// generated/preview/, without touching the live slots, so a range of styles
// can be looked at side by side.
//   npm run visual:preview -- crt sketchbook    # these styles
//   npm run visual:preview -- all               # every style
// See them all on the server's /styles page, or one on the display page with
// ?preview=<style>. Each image costs the same as a live one (see README).
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { fetchConditions, createProvider, loadDotenv, STYLES } from "../visuals.js";
import { createLayoutDesigner } from "../layout.js";
import { renderPreview } from "../styles.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await loadDotenv(join(root, ".env"));

const args = process.argv.slice(2);
const styles = args.includes("all") || !args.length ? Object.keys(STYLES) : args.filter((s) => STYLES[s]);
const dir = join(root, "generated", "preview");

const provider = await createProvider();
if (!provider) process.exit(1);
const designer = createLayoutDesigner();
const weather = await fetchConditions();

// One at a time: the image API rate-limits bursts.
let total = 0;
for (const style of styles) {
  try {
    const meta = await renderPreview({ style, weather, provider, designer, dir });
    total += meta.usd;
    console.log(`${style}: ~$${meta.usd.toFixed(4)}  ${meta.note}`);
  } catch (err) {
    console.log(`${style}: FAILED ${String(err.message || err).slice(0, 200)}`);
  }
}
console.log(`done: ${styles.length} image(s), ~$${total.toFixed(2)}`);

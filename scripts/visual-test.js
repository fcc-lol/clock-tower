// One-off check of the image pipeline: builds a prompt from live weather and,
// if an API key is configured, generates a single image into generated/test-*.
//   npm run visual:test            # random style
//   npm run visual:test -- poster  # specific style
//   npm run visual:test -- poster --dry   # print the prompt only
import { writeFile, mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { fetchWeather } from "../src/lib/sky.js";
import { buildPrompt, providerFromEnv, loadDotenv } from "../visuals.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await loadDotenv(join(root, ".env"));

const args = process.argv.slice(2);
const style = args.find((a) => !a.startsWith("--")) || "random";
const dry = args.includes("--dry");

const weather = await fetchWeather();
const { style: used, prompt } = buildPrompt(weather, new Date(), style);
console.log(`style: ${used}\n\n${prompt}\n`);
if (dry) process.exit(0);

const provider = providerFromEnv();
if (!provider) {
  console.error("No API key configured (see .env.example).");
  process.exit(1);
}
console.log(`generating with ${provider.name}/${provider.model}…`);
const t = Date.now();
const { buffer, ext } = await provider.generate(prompt);
await mkdir(join(root, "generated"), { recursive: true });
const out = join(root, "generated", `test-${used}.${ext}`);
await writeFile(out, buffer);
console.log(`wrote ${out} in ${Math.round((Date.now() - t) / 1000)}s`);

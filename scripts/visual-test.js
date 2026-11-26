// One-off check of the image pipeline: builds a prompt from live weather and,
// if Google credentials are configured, generates one image into generated/test-*.
//   npm run visual:test            # random style
//   npm run visual:test -- crt     # specific style
//   npm run visual:test -- crt --dry   # print the prompt only
import { writeFile, mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { buildPrompt, fetchConditions, createProvider, loadDotenv } from "../visuals.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await loadDotenv(join(root, ".env"));

const args = process.argv.slice(2);
const style = args.find((a) => !a.startsWith("--")) || "random";
const dry = args.includes("--dry");

const weather = await fetchConditions();
const { style: used, prompt } = buildPrompt(weather, new Date(), style);
console.log(`style: ${used}\n\n${prompt}\n`);
if (dry) process.exit(0);

const provider = await createProvider();
if (!provider) process.exit(1);
console.log(`generating with ${provider.name}/${provider.model}…`);
const t = Date.now();
const { buffer, ext, tokens, usd } = await provider.generate(prompt);
await mkdir(join(root, "generated"), { recursive: true });
const out = join(root, "generated", `test-${used}.${ext}`);
await writeFile(out, buffer);
console.log(`wrote ${out} in ${Math.round((Date.now() - t) / 1000)}s` + (usd != null ? ` (${tokens} output tokens, ~$${usd.toFixed(4)} per image, ~$${(usd * 96).toFixed(2)}/day at 96 images)` : ""));

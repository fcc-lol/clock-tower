import express from "express";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFile } from "fs/promises";
import { createVisuals, createProvider, loadDotenv } from "./visuals.js";
import { createLayoutDesigner } from "./layout.js";
import { mountStyles } from "./styles.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

await loadDotenv(join(__dirname, ".env"));

const app = express();
const port = 3118;

// SQLite setup
const db = new Database(join(__dirname, "data.sqlite"));
db.pragma("journal_mode = WAL");

// AI-generated backdrops (see visuals.js). Without Google credentials the
// endpoint still answers, with enabled:false, and the display shows a plain
// background.
const provider = await createProvider();
// Claude designs the readout layout for each image (needs ANTHROPIC_API_KEY).
const designer = provider ? createLayoutDesigner() : null;
const visuals = createVisuals({
  dir: join(__dirname, "generated"),
  provider,
  designer,
  style: process.env.IMAGE_STYLE || "random",
});
await visuals.load();
visuals.start();
console.log(
  provider
    ? `Backdrop generation on (${provider.name}/${provider.model}, style=${process.env.IMAGE_STYLE || "random"})`
    : "Backdrop generation off",
);

// Id of the build in dist/ at startup. Reported to the display so it can
// reload itself after a deploy (build + server restart).
const buildId = await readFile(join(__dirname, "dist", "build-id.txt"), "utf8").catch(() => null);

app.use(express.json());

// Serve static files from dist, plus generated backdrops (cache forever: the
// filename is the slot timestamp so a given URL never changes).
app.use(express.static(join(__dirname, "dist")));
app.use("/generated", express.static(join(__dirname, "generated"), { maxAge: "7d", immutable: true }));

// Polled by the display. Doubles as the "someone is watching" heartbeat.
app.get("/api/visual", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ build: buildId, ...visuals.snapshot() });
});

// /styles: every style's preview side by side, for iterating on the prompts.
// Generating from the page is opt-in (STYLE_LAB=1) because each image is billed.
mountStyles(app, {
  dir: join(__dirname, "generated", "preview"),
  provider,
  designer,
  canGenerate: process.env.STYLE_LAB === "1",
});

// API endpoint for SQLite queries
app.post("/api/query", (req, res) => {
  try {
    const { sql, params = [] } = req.body;
    const stmt = db.prepare(sql);
    if (stmt.reader) {
      const rows = stmt.all(...params);
      res.json({ rows });
    } else {
      const result = stmt.run(...params);
      res.json({ result });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"));
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

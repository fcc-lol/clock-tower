import express from "express";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dist = join(__dirname, "dist");

const app = express();
const port = 3118;

// SQLite setup
const db = new Database(join(__dirname, "data.sqlite"));
db.pragma("journal_mode = WAL");

app.use(express.json());

// The whole display is static: the page, the visualizations (which are code,
// drawn in the browser) and their data, which the browser fetches itself.
app.use(express.static(dist));

// Id of the build in dist/. The display polls this and reloads itself when it
// changes, so a kiosk picks up a new build with no keyboard. Read per request,
// so `npm run build` alone is enough (no server restart needed).
const build = async (req, res) => {
  res.set("Cache-Control", "no-store");
  const id = await readFile(join(dist, "build-id.txt"), "utf8").catch(() => null);
  res.json({ build: id ? id.trim() : null });
};
app.get("/api/build", build);
// Displays still running a build from when the backdrops were generated images
// poll this path; answering it is what lets them notice the new build and reload.
app.get("/api/visual", build);

// Every visualization side by side, for looking through the library.
app.get("/gallery", (req, res) => res.sendFile(join(dist, "gallery.html")));

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
  res.sendFile(join(dist, "index.html"));
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

import express from "express";
import { fileURLToPath } from "url";
import { dirname, extname, join } from "path";
import { readFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dist = join(__dirname, "dist");

const app = express();
const port = Number(process.env.PORT) || 3118;

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
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// A page from dist/. While a build is being written (or before the first one)
// the file is not there: say so with a page that tries again by itself, so a
// kiosk that reloads at the wrong moment is not left on an error page.
const page = (name) => (req, res) =>
  res.sendFile(join(dist, name), (err) => {
    if (!err || res.headersSent) return;
    res
      .status(503)
      .set("Cache-Control", "no-store")
      .type("html")
      .send('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="10"><title>Clock Tower</title><body style="margin:0;background:#000;color:#666;font:16px sans-serif;padding:24px">Starting…</body>');
  });

// Every visualization side by side, for looking through the library.
app.get("/gallery", page("gallery.html"));

// A file that is not there is a 404 (a missing script must not be answered
// with a web page). Any other address shows the display.
app.get("*", (req, res, next) => (extname(req.path) ? res.status(404).type("text").send("Not found") : next()));
app.get("*", page("index.html"));

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

# Clock Tower

Portrait clock/weather signage display for Long Island City. The whole screen is drawn by a library of code-drawn, live visualizations: each shows the time, date and current conditions (temperature, sky, sunrise/sunset countdown, moon phase, AQI, UV, and a fact about today) in its own way, driven by the real weather, the real measured color of the sky and the hour. The display shows one at a time and cuts to another every 15 minutes, on the quarter hour.

Deployed at https://clock-tower.fcc.lol (pushes to `main` auto-deploy via GitHub Actions). It can also run standalone on a device such as a Raspberry Pi.

## How it works

- Vite app, served in production by a small Express server on port **3118** (`server.js` serves the `dist/` build). There are no API keys and nothing is generated at run time: the visualizations are code in this repo.
- **The library** is `src/visuals/`: every `.js` file there is one visualization (see `src/visuals/README.md` for how they are written). Adding a file adds it to the rotation.
- **The rotation** (`src/lib/schedule.js`): time is cut into 15-minute slots. Each round shows every piece once, in an order shuffled differently every round, never the same piece twice in a row. It depends only on the time, so every screen shows the same thing and a reload changes nothing.
- **The display** (`src/App.jsx`) runs each piece in its own iframe (`visual.html`, `src/runner.js`). The next piece is loaded 45 seconds early behind the current one, so the cut on the quarter hour is instant and the old piece is thrown away whole (nothing it allocated can pile up). A piece that fails is skipped for an hour; while none can run, a plain clock shows. On the kiosk each piece runs in a browser process of its own (it is loaded from the machine's other name, `127.0.0.1`), so a piece that hangs cannot freeze the screen: it stops answering, and within about 20 seconds it is taken off and another is shown.
- **Live data** (`src/lib/data.js`), fetched by the browser and shared with whichever piece is showing: weather and a 48-hour forecast (Open-Meteo), air quality (Open-Meteo), the measured color of the sky in four directions and its last 24 hours (NYC Sky Colors), tide predictions for Hunters Point (NOAA) and today's facts (Today API). All free, no keys. The sun and moon are computed locally (`src/lib/astro.js`). The last good data is kept in localStorage, and when a source is down, typical values stand in, so the screen always has something to show. The clock always shows New York time.
- The stage is authored at a fixed 1080×1920 portrait and scaled to fit the screen, so on a landscape monitor it letterboxes.
- Each build gets an id (`dist/build-id.txt`) that the server reports from `/api/build`. A running display reloads itself when that changes, so after `npm run build` the kiosk picks up the new version on its next poll (within 30 s) with no keyboard needed.

### Pages

| | |
| --- | --- |
| `/` | the display |
| `/?onDevice=true` | kiosk mode: hides the cursor, ignores clicks and keys, runs each piece in its own process (`&isolate=0` turns that off) |
| `/?viz=<id>` | hold one visualization |
| `/?debug=1` | what is showing, what is next, frame rate |
| `/gallery` | every visualization side by side, under live conditions or any simulated ones |

Off the kiosk, click (or press the right arrow) for the next piece, left arrow for the previous one, G for the gallery. Any page takes simulated conditions: `?scenario=rain-dusk-fall`, or `?wx=snow&at=night` (weather presets and named scenarios are in `src/lib/simulate.js`), and `&rate=600` runs the clock fast.

## First-time setup on a new device (Raspberry Pi)

Assumes Raspberry Pi OS with desktop (Bookworm or later).

### 1. Prerequisites

```sh
sudo apt update
sudo apt install -y git
```

Install Node.js 20+ if not present (e.g. via [NodeSource](https://github.com/nodesource/distributions) or `nvm`).

### 2. Clone, install, build and run

```sh
git clone https://github.com/fcc-lol/clock-tower
cd clock-tower
npm install
npm run build
npm start
```

Then open `http://localhost:3118/?onDevice=true` and confirm the clock is ticking. (Use that address on the kiosk, `localhost` or `127.0.0.1`: it is what lets each piece run in its own process. `&debug=1` shows whether they do.)

### 3. Run the server on boot

Create `/etc/systemd/system/clock-tower.service` (adjust paths/user if your setup differs):

```ini
[Unit]
Description=Clock Tower signage server
After=network.target

[Service]
User=pi
WorkingDirectory=/home/pi/clock-tower
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl enable --now clock-tower
```

If Node was installed via `nvm`, point `ExecStart` at the actual binary (`which node`).

### 4. Launch Chromium in kiosk mode on boot

Create `~/.config/autostart/clock-tower.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Clock Tower
Exec=chromium-browser --kiosk --noerrdialogs --disable-session-crashed-bubble "http://localhost:3118/?onDevice=true"
```

### 5. Display settings

- Disable screen blanking: `sudo raspi-config` → Display Options → Screen Blanking → No.
- If the panel is physically mounted portrait, rotate the display in Screen Configuration (or `raspi-config`) so the OS reports a portrait resolution — the app scales to fit and letterboxes on landscape screens.

## Updating a device

```sh
cd ~/clock-tower
git pull
npm install
npm run build
```

The kiosk browser notices the new build and reloads on its own within about 30 seconds; the server does not need a restart unless `server.js` itself changed (`sudo systemctl restart clock-tower`). (The fcc.lol deployment updates itself on push to `main`; devices are updated manually.)

A device that ran the earlier version, which generated images, can drop what that left behind: the `generated/` folder, any `data.sqlite*` files and the Google and Anthropic settings in `.env` are no longer used.

## Development

```sh
npm run dev
```

Vite dev server: the display at `/`, one piece at `/visual.html?id=<id>`, the gallery at `/gallery.html`.

### Adding or changing a visualization

Each one is a single module in `src/visuals/`; the contract, the data it can draw from and the toolkit are described in `src/visuals/README.md`. To look at a piece in every kind of weather without waiting for it:

```sh
node scripts/shoot.js <id>                    # screenshots across seven scenarios, plus a contact sheet
node scripts/shoot.js <id> --scenarios all    # all thirteen
node scripts/shoot.js <id> --perf 12          # frame rate, frame cost and memory over 12 s
node scripts/shoot.js --list
```

It writes to `shots/` and prints a report (what the readouts should say, frame cost, brightness, errors). It needs Playwright (`npm i -D playwright && npx playwright install chromium`).

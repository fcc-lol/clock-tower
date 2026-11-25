# Clock Tower

Portrait clock/weather signage display for Long Island City. Shows the time, date, and current conditions (temperature, sky, sunrise/sunset countdown, AQI, UV, moon phase) over an AI-generated backdrop that depicts those same conditions, regenerated every 15 minutes. All text lines re-tilt to fresh random angles every 10 minutes.

Deployed at https://clock-tower.fcc.lol (pushes to `main` auto-deploy via GitHub Actions). It can also run standalone on a device such as a Raspberry Pi.

## How it works

- Vite + React app, served in production by a small Express server on port **3118** (`server.js` serves the `dist/` build).
- Weather comes from the free Open-Meteo APIs (no key needed), refreshed every 10 minutes. This requires internet — offline, the display shows "Loading weather…" but the clock keeps working.
- The `?onDevice=true` query param hides the mouse cursor.
- The stage is authored at a fixed 1080×1920 portrait and scaled to fit the screen, so on a landscape monitor it letterboxes.

### Generated backdrops

`visuals.js` on the server turns the live weather/sky data into an image prompt and renders a portrait image through an image API. Time is cut into 15-minute slots on the quarter hour; while one slot's image is on screen, the next slot's is generated in the background, and the browser swaps to it the moment the boundary passes (a hard cut, on the client's own clock).

- The browser polls `/api/visual` every 30 s. That poll is also the "someone is watching" heartbeat: if nothing has polled for 2 minutes, generation stops, so an idle server costs nothing.
- Images and their prompts land in `generated/` (gitignored, last 12 kept) and are served at `/generated/<slot>.jpg`.
- Three prompt styles live in `visuals.js`: `skyline` (painterly LIC waterfront), `poster` (abstract data poster where each metric is a shape) and `lookup` (cinematic shot up between LIC towers). `IMAGE_STYLE` picks one, or `random` rotates per slot.
- Without an API key the display runs with a plain black backdrop.

Configure via a `.env` file next to `server.js` (see `.env.example`): `GEMINI_API_KEY` for Google's Nano Banana (default, `gemini-nano-banana-2.1`, about $0.034 per image, so roughly $3.20/day if the screen is on around the clock), or `IMAGE_PROVIDER=openai` with `OPENAI_API_KEY`. Check the pipeline end to end with:

```sh
npm run visual:test -- poster          # generates generated/test-poster.jpg
npm run visual:test -- skyline --dry   # prints the prompt only, no API call
```

## First-time setup on a new device (Raspberry Pi)

Assumes Raspberry Pi OS with desktop (Bookworm or later).

### 1. Prerequisites

```sh
sudo apt update
sudo apt install -y git
```

Install Node.js 20+ if not present (e.g. via [NodeSource](https://github.com/nodesource/distributions) or `nvm`).

Note: `npm install` compiles `better-sqlite3` natively, which needs `build-essential` and `python3` — both are normally preinstalled on Raspberry Pi OS.

### 2. Clone and install

```sh
git clone https://github.com/fcc-lol/clock-tower
cd clock-tower
npm install
```

### 3. Add the image API key

```sh
cp .env.example .env
# then put your key in .env
```

Skip this to run with a plain black backdrop.

### 4. Build and run

```sh
npm run build
npm start
```

Then open `http://localhost:3118/?onDevice=true` and confirm the clock is ticking. The first backdrop appears after the first generation finishes (roughly a minute).

### 5. Run the server on boot

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

### 6. Launch Chromium in kiosk mode on boot

Create `~/.config/autostart/clock-tower.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Clock Tower
Exec=chromium-browser --kiosk --noerrdialogs --disable-session-crashed-bubble "http://localhost:3118/?onDevice=true"
```

### 7. Display settings

- Disable screen blanking: `sudo raspi-config` → Display Options → Screen Blanking → No.
- If the panel is physically mounted portrait, rotate the display in Screen Configuration (or `raspi-config`) so the OS reports a portrait resolution — the app scales to fit and letterboxes on landscape screens.

## Updating a device

```sh
cd ~/clock-tower
git pull
npm install
npm run build
sudo systemctl restart clock-tower
```

(The fcc.lol deployment updates itself on push to `main`; devices are updated manually.)

## Development

```sh
npm run dev
```

Vite dev server for the display only. The backdrop comes from the Express server, so to see it during development run `npm run build && npm start` and open port 3118, or point a dev proxy at it.

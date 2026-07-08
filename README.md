# Clock Tower

Portrait clock/weather signage display for Long Island City. Shows the time, date, and current conditions (temperature, sky, sunrise/sunset countdown, AQI, UV, moon phase) over a looping background video, with all lines re-tilting to fresh random angles every 10 minutes.

Deployed at https://clock-tower.fcc.lol (pushes to `main` auto-deploy via GitHub Actions). It can also run standalone on a device such as a Raspberry Pi, playing a locally downloaded copy of the background video instead of streaming from YouTube.

## How it works

- Vite + React app, served in production by a small Express server on port **3118** (`server.js` serves the `dist/` build).
- Weather comes from the free Open-Meteo APIs (no key needed), refreshed every 10 minutes. This requires internet — offline, the display shows "Loading weather…" but the clock keeps working.
- The `?onDevice=true` query param does two things: hides the mouse cursor, and switches the background from the YouTube embed to a local file at `/background.mp4`. Without the param (e.g. the fcc.lol deployment) the YouTube iframe is used.
- The stage is authored at a fixed 1080×1920 portrait and scaled to fit the screen, so on a landscape monitor it letterboxes. The 16:9 video is rotated 90° to cover the portrait stage.

## First-time setup on a new device (Raspberry Pi)

Assumes Raspberry Pi OS with desktop (Bookworm or later).

### 1. Prerequisites

```sh
sudo apt update
sudo apt install -y git yt-dlp
```

Install Node.js 20+ if not present (e.g. via [NodeSource](https://github.com/nodesource/distributions) or `nvm`).

Note: `npm install` compiles `better-sqlite3` natively, which needs `build-essential` and `python3` — both are normally preinstalled on Raspberry Pi OS.

### 2. Clone and install

```sh
git clone https://github.com/fcc-lol/clock-tower
cd clock-tower
npm install
```

### 3. Download the background video

The video is not committed to the repo — download it once per device into `public/`. Video-only H.264 at ≤1080p, since playback is muted and H.264 gets hardware decoding on the Pi:

```sh
mkdir -p public
yt-dlp -f "bv*[vcodec^=avc1][height<=1080]" "https://www.youtube.com/watch?v=uejy_W2eD_s" -o public/background.mp4
```

### 4. Build and run

```sh
npm run build
npm start
```

Then open `http://localhost:3118/?onDevice=true` and confirm the video plays and the clock is ticking.

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

Vite dev server; add `?onDevice=true` to test local-video mode (drop any test MP4 at `public/background.mp4`).

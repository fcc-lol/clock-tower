# Clock Tower

Portrait clock/weather signage display for Long Island City. Shows the time, date, and current conditions (temperature, sky, sunrise/sunset countdown, AQI, UV, moon phase) over an AI-generated backdrop that depicts those same conditions, regenerated every 15 minutes. The readouts are set straight in a layout (typeface, colors, placement) that Claude designs for each image by looking at it (layout.js, needs ANTHROPIC_API_KEY), with a built-in layout per backdrop style as the fallback (src/lib/layout.js). The layout switches with the image. The prompt also includes the measured color of the real sky (NYC Sky Colors API), and one fact from the Today API (a holiday, an event on this date, or a plant in bloom) is shown under the weather, changing with each image.

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
- Fifteen prompt styles live in `visuals.js`, deliberately far apart in medium and viewpoint: painterly skyline, risograph data poster, cinematic look-up between towers, apartment window, 7 train platform, ukiyo-e woodblock, pixel art, satellite view, cut-paper collage, watercolor, neon synthwave, charcoal sketch, flat vector, cyanotype blueprint and street photo. `IMAGE_STYLE` pins one; the default `random` picks a different style from the previous slot every time.
- Without Google credentials the display runs with a plain black backdrop.
- Each build gets an id (`dist/build-id.txt`) that the server reports from `/api/visual`. A running display reloads itself when that changes, so after `npm run build` + a server restart the kiosk picks up the new version on its next poll (within 30 s) with no keyboard needed.

Images come from Google's Nano Banana (`gemini-nano-banana-2.1`) on Vertex AI, about $0.034 per image, so roughly $3.20/day if the screen is on around the clock. Auth is Application Default Credentials, not an API key: either `gcloud auth application-default login` run once as the user that runs `server.js`, or a service-account JSON file named by `GOOGLE_APPLICATION_CREDENTIALS`. The project to bill goes in a `.env` next to `server.js` as `GOOGLE_CLOUD_PROJECT` (see `.env.example`). Check the pipeline end to end with:

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

### 3. Google Cloud credentials for the backdrops

Skip this whole step to run with a plain black backdrop.

You need a Google Cloud project with billing enabled and the Vertex AI API turned on (`gcloud services enable aiplatform.googleapis.com`, or Console → APIs & Services). Your account needs the Vertex AI User role on it.

Install the gcloud CLI on the Pi:

```sh
sudo apt install -y apt-transport-https ca-certificates gnupg curl
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list
sudo apt update && sudo apt install -y google-cloud-cli
```

Log in once, as the same user the service will run as (`pi` in the unit file below), so the credentials land in that user's home:

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

Then tell the app which project to bill:

```sh
cp .env.example .env
# edit .env: GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
```

If your org lets you create service-account keys, you can use one instead of logging in: put the JSON on the Pi and set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/it.json` in `.env`. A service account avoids the periodic re-login some org policies force on user credentials.

### 4. Build and run

```sh
npm run build
npm start
```

Before starting the server, prove the credentials work with one real render:

```sh
npm run visual:test -- skyline
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

The kiosk browser notices the new build and reloads on its own within about 30 seconds. (The fcc.lol deployment updates itself on push to `main`; devices are updated manually.)

## Development

```sh
npm run dev
```

Vite dev server for the display only. The backdrop comes from the Express server, so to see it during development run `npm run build && npm start` and open port 3118, or point a dev proxy at it.

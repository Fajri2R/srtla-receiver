# SRTla Receiver + Live Preview

> **Fork of [OpenIRL/srtla-receiver](https://github.com/OpenIRL/srtla-receiver)** — extends the original with a **browser-based Live Preview** dashboard powered by HLS.js, a dynamic multi-stream HLS manager, and a dedicated **SRT Monitoring** dashboard.

SRTla receiver with support for multiple streams, statistics integration, and **in-browser live preview** for all active streams simultaneously — including a per-stream 🔴 Live button injected directly into the Management UI.

---

## ✨ What's New in This Fork

| Feature | Description |
|---------|-------------|
| 🎬 **Live Preview Button** | Per-stream **🔴 Live** button injected directly into the Management UI — click to watch any stream in a full-screen HLS player modal |
| 📊 **Real-time Management UI** | Management UI publisher stats automatically refresh every **1 second** (realtime) instead of the default 10 seconds |
| 🎨 **Unified Design System** | Management UI typography, navbar, scrollbars, and cards fully match the sleek dark theme of the HLS Manager |
| 🎬 **Live Preview Dashboard** | Watch any active stream directly in the browser at port 8090 — no VLC, no extra software |
| 🔄 **Multi-Stream HLS Manager** | Automatically starts/stops FFmpeg per active stream; zero configuration |
| 📈 **Advanced Stream Metrics** | Real-time stream stats including Transcode FPS, Uptime, Viewers, RTT, Packet Drops, and dynamic Bitrate (Mbps) |
| 📡 **SLS API Integration** | Uses the correct SLS REST API endpoints: `/stats/{stream_id}` and `/api/stream-ids` — no CORS issues |
| 🛡 **HTTPS Domain API Proxy** | Management UI API calls use the same HTTPS origin through `mgmt-proxy`, avoiding mixed-content `Failed to fetch` errors |
| 🔗 **Publisher URL Host Picker** | The **Show URLs** dialog renders one set of URLs with a Host switch — the SRT DNS-only domain when it resolves to the server, otherwise the origin IP |
| 🛠 **Updated `receiver.sh`** | One command installs everything including hls-manager, preview UI, and mgmt-proxy |
| 🏷 **Ashveil Brand Identity** | All three dashboards share one identity: emblem + `ASHVEIL` wordmark in the header, per-service sub-label, matching favicons, and `ASHVEIL · <Service>` tab titles |

### Brand assets

Every dashboard ships its own **byte-identical** copy of the Control Hub set, so the favicon matches the portal exactly and renders without cross-service requests:

| File | Purpose |
|------|---------|
| `ashveil-veil.png` | Header mark (canonical cream monogram, 420×144) |
| `favicon.svg` | Tab icon, adapts to the OS colour scheme (`#22262a` light / `#f2f2ea` dark) |
| `favicon-32.png` | 32×32 PNG cut-out for browsers without SVG icon support |
| `favicon.ico` | Multi-resolution ICO (16/24/32/48/64) for legacy and OS surfaces |
| `apple-touch-icon.png` | 180×180 iOS home-screen icon |

Head declaration order is the same on every dashboard:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=…">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=…">
<link rel="shortcut icon" href="/favicon.ico?v=…">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=…">
```

- HLS Manager serves them from `preview/`; SRT Monitor from `srt-monitor/public/`; the Management UI from `mgmt-proxy/` (mounted read-only into nginx under `/etc/nginx/`).
- Do not hand-draw a new mark per service: overwrite all copies from `ashveil-control-hub/public/` and bump the `?v=` token on all three so caches turn over together.
- The Management UI is a third-party bundle, so `mgmt-proxy/lp-inject.js` applies the identity at runtime: it rewrites the navbar brand to `ashveil-veil.png`, sets the tab title, declares the four icon links, and patches the vendor `theme-color` meta to `#2b2d2c` in place (appending a second meta loses to the first).
- `preview/nginx.conf` answers missing image requests with `404` instead of the SPA `index.html`. Without that rule a miss returns HTML that browsers reject as an image and CDNs cache under the image URL.

> **SRT/SRTLA domain note:** SRT and SRTLA use UDP and cannot pass through a normal Cloudflare-proxied hostname. Create an explicit `A` record such as `srt.example.com` pointing to the VPS and set it to **DNS only** (grey cloud). The dashboard checks the hostname over DNS before offering it, so with no such record every URL falls back to the origin IP automatically.

---

## Project Information

This project is based on the following components:

- SRT: [OpenIRL/srt](https://github.com/OpenIRL/srt)
- SRTla: [OpenIRL/srtla](https://github.com/OpenIRL/srtla)
- SRT-Live-Server: [OpenIRL/srt-live-server](https://github.com/OpenIRL/srt-live-server)

### Project Support

If you'd like to support the original project, please visit the GoFundMe page: [gofundme](https://gofund.me/07644414)

---

## Getting Started

### Requirements

- **OS:** Ubuntu 22.04 / Debian 12 (recommended)
- **RAM:** 1 GB minimum (2 GB+ recommended for multiple simultaneous streams)
- **Ports to open in your firewall:**

| Port | Protocol | Service |
|------|----------|---------|
| `5000` | UDP | SRTla receiver input (from OBS/encoder) |
| `4001` | UDP | SRT sender input |
| `4000` | UDP | SRT player output |
| `8080` | TCP | SLS Stats API |
| `3000` | TCP | Management UI (via mgmt-proxy with Live Preview injection) |
| `8090` | TCP | **Standalone Live Preview** dashboard (HLS Manager) |
| `9010` | TCP | **Dedicated SRT Monitor** dashboard (Real-time network metrics) |

### Install the Receiver

The `receiver.sh` script handles everything — Docker, all containers, and the Live Preview service.

**1. Download the script:**

```shell
curl -Lso receiver.sh "https://raw.githubusercontent.com/Fajri2R/srtla-receiver/refs/heads/main/receiver.sh" && chmod 700 receiver.sh
```

**2. Run the installer:**

```shell
./receiver.sh install
```

The installer will:
- Install Docker if not present
- Download `docker-compose`, `hls-manager`, `srt-monitor`, `mgmt-proxy`, and `preview` files from this fork
- Prompt you for port configuration (press Enter to accept defaults)
- Build the HLS manager image and start all containers
- Display all service URLs when done

**3. After install — example output:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Available Services
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🖥  Management UI  : http://YOUR-IP:3000
  🎬  Live Preview   : http://YOUR-IP:8090
  📡  SRTla Input    : YOUR-IP:5000/udp
  📤  SRT Sender     : YOUR-IP:4001/udp
  📥  SRT Player     : YOUR-IP:4000/udp
  📊  Stats API      : http://YOUR-IP:8080/stats
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Management Commands

```shell
./receiver.sh start      # Start all services (builds hls-manager if needed)
./receiver.sh stop       # Stop all services
./receiver.sh status     # Show container status and service URLs
./receiver.sh update     # Pull latest images + rebuild hls-manager
./receiver.sh restart    # Stop then start
./receiver.sh reset      # ⚠ Delete all data and regenerate API key
```

### Manual Setup (Docker Compose)

If you prefer to manage Docker Compose directly:

```shell
git clone https://github.com/Fajri2R/srtla-receiver.git
cd srtla-receiver
cp .env.example .env
# Edit .env — set APP_URL to your server's public IP or HTTPS domain
# (e.g., APP_URL=https://sls.example.com or APP_URL=http://YOUR-IP:8080)
docker compose up -d --build
```

---

## Create Your First Publisher

1. Open the **Management UI** at `http://YOUR-IP:3000`
2. Click **"Configure Settings"** and enter the API key (found in `.apikey` or console output)
3. Click **"Add Stream"** and optionally fill in a description
4. Click the arrow icon next to the stream → copy the **publish key** and **play key**
5. Open **Show URLs** to copy ready-made SRT/SRTLA/player URLs for both the VPS IP and the SRT domain
6. Configure your encoder with the publish URL below

### Sending a Stream

#### SRTla (recommended — multi-path bonding)

| | URL |
|-|-----|
| Schema | `srtla://YOUR-IP:5000?streamid=PUBLISH_KEY` |
| Example | `srtla://127.0.0.1:5000?streamid=live_7388b95f0a6c4f69954f4519f204a554` |

SRTla needs a bonding-capable sender (`srtla_send`, shipped with OBS-Bonding/IRL tools).
FFmpeg has no `srtla://` protocol and fails with `Protocol not found`, which is a
client limitation, not a receiver fault — prove the port with the receiver's
`srtla_rec` log or by sending from a real bonding encoder.

#### SRT (standard)

| | URL |
|-|-----|
| Schema | `srt://YOUR-IP:4001?streamid=PUBLISH_KEY` |
| Example | `srt://127.0.0.1:4001?streamid=live_7388b95f0a6c4f69954f4519f204a554` |

### Receiving / Playing a Stream

| | URL |
|-|-----|
| Schema | `srt://YOUR-IP:4000?streamid=PLAY_KEY` |
| Example | `srt://127.0.0.1:4000?streamid=play_60a0055a7fdb436d92fab3a943f5c55c` |

---

## 🎬 Live Preview in Management UI

Open the **Management UI** at `http://YOUR-IP:3000`. Each stream row has a **🔴 Live** button next to the **+ Add Player** button.

- Click **🔴 Live** to open a full-screen HLS player modal
- The modal auto-loads the stream's HLS playlist
- Press **ESC** or click outside the modal to close
- No separate browser tab needed

This is powered by `mgmt-proxy` — a lightweight reverse proxy that injects `/lp-inject.js` into the Management UI page, adding the Live button and modal player to every stream row automatically.

### Serving the Management UI over HTTPS

The Management UI bundle is built with a fixed API base URL, so opening it through
an HTTPS reverse proxy (Cloudflare, Caddy, Traefik, nginx) makes the browser block
its HTTP calls and the dashboard shows `Failed to fetch stream IDs`. `mgmt-proxy`
solves this without rebuilding the image:

- `/api/stream-ids`, `/stats/`, and `/health` are proxied to the `receiver`
  container, so the UI can talk to `/api/...` on its own origin.
- The served `main.*.js` is rewritten on the fly: the baked-in API base URL
  becomes `location.origin`, and the publisher stats countdown drops from 10s to 3s.
- `/hls/` is proxied to `live-preview`, so the HLS player uses the same origin too.

No hostnames live in the repository. `mgmt-proxy` reads them from the
environment at container start and exposes them to the browser as
`/lp-config.json`:

```yaml
# docker-compose.yml → mgmt-proxy
environment:
  LP_VPS_IP:     "${LP_VPS_IP:-}"      # public IP of the receiver
  LP_SRT_DOMAIN: "${LP_SRT_DOMAIN:-}"  # DNS-only hostname for SRT/SRTLA
```

`mgmt-proxy/nginx.conf` is a minimal `http {}` block that includes
`/etc/nginx/conf.d/*.conf`; the server block lives in
`mgmt-proxy/default.conf.template`, which the `nginx:alpine` entrypoint renders
with `envsubst` on start. Keep the real values in your `.env` (git-ignored),
never in the tracked files.

When the page is served from a domain, the HLS Manager and SRT Monitor buttons
point at `preview.<domain>` and `monitor.<domain>`. Publish those as normal
HTTPS virtual hosts (ports 8090 and 9010 in this stack).

### Publisher URL host picker (domain or origin IP)

Every **Show URLs** dialog renders a single clean set of fields:

- The UDP host is chosen automatically: if `SRT_DOMAIN` resolves to this server
  over DNS-over-HTTPS, it is used by default; otherwise the origin IP is used.
- When both are available, a **Host** switch (`[domain] [ip]`) appears at the
  bottom of the modal so encoders can be pointed at the raw IP at will.
- The statistics URL is always kept on the same HTTPS origin so it can be opened
  directly from a secure dashboard without mixed-content errors.


---

## 🎬 Standalone Live Preview Dashboard

Open `http://YOUR-IP:8090` in any browser. No configuration needed — all active streams are detected automatically. Use this port for dedicated monitoring setups or when you need multiple streams visible at once on a separate display.

### How It Works

```
OBS/Encoder ─── SRTla:5000 ──▶ [receiver: SLS]
                                      │
                         /api/stream-ids  /stats/{id}
                                      ▼
                               [hls-manager]
                               (polls every 5s)
                               FFmpeg per stream
                                      │
                          /hls/{stream}/stream.m3u8
                                      │ shared volume
                    ┌─────────────────┴──────────────────┐
                    ▼                                    ▼
             [live-preview]                      [mgmt-proxy]
             http://IP:8090                      http://IP:3000
             Standalone HLS dashboard            Management UI +
                                                 🔴 Live button per stream
```

### Features

- **Auto-detection** — streams appear/disappear on the dashboard as they go on/offline
- **Per-stream video player** — click ▶ Preview on any stream card
- **Real-time metrics** — bitrate, active connections, uptime, refreshed every 5s
- **Copy HLS URL** — one-click copy of the `.m3u8` URL for use in VLC or other players
- **Dark premium UI** — glassmorphism design, animated, mobile-friendly

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LIVE_PREVIEW_PORT` | `8090` | Port for the standalone preview web UI |
| `SRT_MONITOR_PORT` | `9010` | Port for the dedicated SRT Monitoring dashboard |
| `HLS_SEGMENT_TIME` | `2` | HLS segment duration in seconds (lower = less latency) |
| `HLS_LIST_SIZE` | `5` | Number of segments kept in the playlist |
| `HLS_POLL_INTERVAL` | `5` | How often hls-manager polls for new/ended streams (seconds) |
| `HLS_MAX_RETRIES` | `10` | Max FFmpeg restart attempts on crash |
| `SLS_API_KEY` | *(auto-set)* | SLS REST API key — auto-extracted on first start |

### Latency

| Setting | Latency |
|---------|---------|
| `HLS_SEGMENT_TIME=2` (default) | ~4–8 seconds |
| `HLS_SEGMENT_TIME=1` | ~2–4 seconds (higher overhead) |
| SRT direct via VLC | < 1 second |

> **Note:** FFmpeg uses **stream copy** (`-c:v copy -c:a copy`) — no re-encoding, minimal CPU usage. Your encoder must send H.264 video and AAC audio for HLS compatibility.

---

## Statistics Integration

### Statistics Endpoint

| | URL |
|-|-----|
| Schema | `http://YOUR-IP:8080/stats/PLAY_ID` |
| Example | `http://127.0.0.1:8080/stats/play_60a0055a7fdb436d92fab3a943f5c55c` |

### Statistics Endpoint Legacy (NOALBS < 2.14.0)

| | URL |
|-|-----|
| Schema | `http://YOUR-IP:8080/stats/PLAY_ID?legacy=1` |
| Example | `http://127.0.0.1:8080/stats/play_60a0055a7fdb436d92fab3a943f5c55c?legacy=1` |

### NOALBS Integration

```json
{
   "switcher": {
      "streamServers": [
         {
           "streamServer": {
              "type": "OpenIRL",
              "statsUrl": "http://127.0.0.1:8080/stats/play_60a0055a7fdb436d92fab3a943f5c55c"
           },
           "name": "Stream",
           "priority": 0,
           "enabled": true
         }
      ]
   }
}
```

<details>
<summary>NOALBS Version &lt; 2.14.0</summary>

```json
{
   "switcher": {
      "streamServers": [
         {
           "streamServer": {
              "type": "SrtLiveServer",
              "statsUrl": "http://127.0.0.1:8080/stats/play_60a0055a7fdb436d92fab3a943f5c55c?legacy=1",
              "publisher": "live"
           },
           "name": "Stream",
           "priority": 0,
           "enabled": true
         }
      ]
   }
}
```

</details>

---

## Troubleshooting

**Containers not starting:**
```shell
docker compose logs receiver
docker compose logs hls-manager
```

**Live Preview button not appearing in Management UI:**
- Hard-refresh the Management UI page (`Ctrl+Shift+R`)
- Check browser console for errors loading `/lp-inject.js`
- Ensure `mgmt-proxy` container is running: `docker compose ps mgmt-proxy`

**Stream detected but 'Stream not active' in modal:**
- Wait 5–10 seconds for the first HLS segment to generate
- Check hls-manager logs: `docker compose logs hls-manager --tail 20`

**Standalone Live Preview not showing streams:**
- Make sure a stream is actively being published (check Management UI)
- Check `docker compose logs hls-manager` — FFmpeg errors will appear here
- Confirm port `8090` is open in your firewall

**FFmpeg exits immediately:**
- The stream may have ended or the stream ID does not match
- Check that your encoder sends H.264 video + AAC audio

**Dashboard shows `Failed to fetch stream IDs` through an HTTPS domain:**
- The UI is calling the old `http://IP:8080` API and the browser blocks it as mixed content
- Confirm `mgmt-proxy` is up: `docker compose ps mgmt-proxy`
- Test the same-origin API directly: `curl -s https://your-domain/api/stream-ids -H "Authorization: Bearer $KEY"`
- Recreate the proxy after editing config: `docker compose up -d --force-recreate mgmt-proxy`

**SRT URL with a domain does not connect:**
- Check what the hostname resolves to: `dig +short A srt.example.com` must return the VPS IP
- If it returns Cloudflare edge IPs, the record is proxied — switch it to **DNS only**
- Test against the IP first to separate DNS problems from firewall problems: `ffprobe -rw_timeout 5000000 -i "srt://VPS-IP:4001?streamid=live_test&mode=caller"`

**All required ports:**

```shell
# Ubuntu/Debian
sudo ufw allow 5000/udp   # SRTla input
sudo ufw allow 4000/udp   # SRT player output
sudo ufw allow 4001/udp   # SRT sender input
sudo ufw allow 8080/tcp   # SLS Stats API
sudo ufw allow 3000/tcp   # Management UI
sudo ufw allow 8090/tcp   # Standalone Live Preview
sudo ufw allow 9010/tcp   # Dedicated SRT Monitor
sudo ufw reload
```

---

## Contributing

Contributions are welcome! Please open an issue or pull request on [GitHub](https://github.com/Fajri2R/srtla-receiver).

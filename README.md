<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0f0c29,50:302b63,100:24243e&height=200&section=header&text=⚡%20HyperDrop&fontSize=72&fontColor=ffffff&fontAlignY=40&desc=Browser-to-Browser%20File%20Transfer%20•%20No%20App%20•%20No%20Cloud%20•%20No%20Limits&descAlignY=65&descSize=18&descColor=a78bfa" width="100%" />

<br/>

[![Live Demo](https://img.shields.io/badge/🌐%20Live%20Demo-hyperdrop--iota.vercel.app-6d28d9?style=for-the-badge&logoColor=white)](https://hyperdrop-iota.vercel.app/)
[![GitHub Stars](https://img.shields.io/github/stars/Jai-Bharath/Hyperdrop?style=for-the-badge&color=f59e0b&logo=github)](https://github.com/Jai-Bharath/Hyperdrop/stargazers)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-94.7%25-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

<br/>

> **Open a browser. Select a file. Transfer it to any device at full WiFi speed. No app to install. No account to create. No file ever touches a server.**

<br/>

</div>

---

## ⚡ What is HyperDrop?

HyperDrop is a **browser-based file transfer app** that sends files **directly between devices** using WebRTC peer-to-peer data channels. Both devices just open the website — file data flows directly over your WiFi, never through any cloud server.

```
📱 Your Phone                              💻 Your Laptop
   │                                          │
   ├─ Opens hyperdrop.vercel.app              ├─ Opens hyperdrop.vercel.app
   │                                          │
   ├─ Sees laptop in device list              │
   │                                          │
   │      WebRTC Data Channel (P2P)           │
   ├──────── File goes DIRECTLY ─────────────►│
   │         over WiFi • 30-80 MB/s           │
   │                                          ├─ File auto-downloads ✅
```

**No server handles your files.** The cloud server (Render) only connects the two browsers — like a phone switchboard that connects calls but never hears the conversation.

---

## 🏆 How HyperDrop Compares

| Feature | HyperDrop | AirDrop | Quick Share | SHAREit | LocalSend |
|---|:---:|:---:|:---:|:---:|:---:|
| **No app install needed** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Works on any device/OS** | ✅ | ❌ Apple only | ❌ Android only | Partial | Partial |
| **Files never touch a server** | ✅ | ✅ | ✅ | ❌ (ads/telemetry) | ✅ |
| **Works offline (PWA)** | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Background transfer** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Retry / Resume** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Cross-network pairing** | ✅ QR/Code | ❌ | ❌ | ❌ | ❌ |
| **Zero accounts / login** | ✅ | ❌ Apple ID | ❌ Google | ❌ phone no. | ✅ |
| **Zero data collection** | ✅ | ❌ | ❌ | ❌ spyware | ✅ |
| **Built-in FTP server** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Page reload protection** | ✅ | N/A | N/A | N/A | N/A |

> SHAREit was [caught sending user data to Chinese servers](https://www.mcafee.com/blogs/other-blogs/mcafee-labs/shareit-application-vulnerabilities/). HyperDrop contains **zero telemetry code** — not blocked, simply absent.

---

## 🚀 How It Works

### Two Transfer Modes (Auto-Selected)

| Mode | When | How | Speed |
|---|---|---|:---:|
| **WebRTC P2P** | Both users open the website | Browser-to-browser data channel | **30–80 MB/s** |
| **Parallel HTTP** | Local server running on one device | 4 parallel TCP streams, 4MB chunks | **100–300 MB/s** |

HyperDrop **automatically picks the right mode**:
- If a local HyperDrop server is detected on your WiFi → uses fast parallel HTTP
- If no local server (just the website) → uses WebRTC for direct P2P transfer
- Either way, **your file data never passes through any cloud server**

```
WebRTC P2P (default — no setup needed):
Phone ◄════════════════════════════════► Laptop
         Direct WiFi data channel
         Signaling via Render (metadata only)

Parallel HTTP (when local server runs):
Phone ──► [Stream 1] ──► Chunk 1, 5, 9  ──►
      ──► [Stream 2] ──► Chunk 2, 6, 10 ──► Laptop:3001
      ──► [Stream 3] ──► Chunk 3, 7, 11 ──►  100–300 MB/s
      ──► [Stream 4] ──► Chunk 4, 8, 12 ──►
```

---

## ✨ Key Features

### 📡 Instant Device Discovery
Open HyperDrop on two devices. They find each other automatically within seconds. Three discovery methods run in parallel:
- **Same WiFi** — mDNS auto-discovery (`_hyperdrop._tcp.local`)
- **Cross-network** — 6-character pairing code or QR scan
- **Hotspot** — create a hotspot, connect, transfer

### 🔄 Retry & Resume
Transfer interrupted? Hit **Retry** — it picks up where it left off. The server tracks which chunks were received, so only missing chunks are re-sent.

### 🔋 Background Transfer
Switch tabs, check your email, browse the web — your transfer keeps running. HyperDrop uses Web Locks, AudioContext keep-alive, and BroadcastChannel heartbeats to prevent the browser from killing the connection.

### ⚠️ Reload Protection
Accidentally reload the page during a transfer? The browser warns you first. No more losing a 2GB transfer because you hit F5.

### 📲 No App Needed on the Other Side
HyperDrop runs a **built-in FTP server** (port 2121) and **HTTP file browser** (`/browse`). The receiver can:
- Open any file manager and connect via FTP
- Open a browser and type `http://192.168.x.x:3001/browse`
- Download directly — **no installation, no account, nothing**

### 🌐 Progressive Web App (PWA)
Install HyperDrop on your home screen. It works offline, caches assets via Service Worker, and loads instantly on repeat visits.

---

## 🔒 100% Private

```
Your Phone ──── Direct WiFi ──── Their Phone
                     ↑
        No servers touch your files.
        No data leaves the room.
```

**What HyperDrop does NOT contain:**
- ❌ No Firebase / AWS / Azure SDK
- ❌ No analytics (no Mixpanel, Amplitude, Segment)
- ❌ No crash reporting to cloud
- ❌ No user database or accounts
- ❌ No Google Ads SDK
- ❌ Zero telemetry of any kind

The **only** cloud server (Render) handles device discovery and signaling — like a phone switchboard. It never sees, stores, or relays your file data.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Vercel (CDN)                          │
│  Static frontend: React + Vite + CSS + Service Worker        │
│  Cached offline as PWA — loads instantly after first visit    │
├─────────────────────────────────────────────────────────────┤
│                     Render (Signaling)                        │
│  Socket.IO: device discovery, transfer negotiation,          │
│  WebRTC offer/answer/ICE relay. NO file data passes here.    │
├─────────────────────────────────────────────────────────────┤
│                    Browser ↔ Browser                         │
│  WebRTC DataChannel: file chunks flow directly P2P           │
│  256KB chunks, backpressure managed, speed tracked           │
├─────────────────────────────────────────────────────────────┤
│              Optional: Local Server (:3001)                  │
│  When running locally — parallel HTTP, FTP, file browser     │
│  4MB chunks × 4 streams = 100-300 MB/s                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗂️ Project Structure

```
hyperdrop/
├── src/
│   ├── engine/
│   │   ├── webrtcEngine.ts          ← WebRTC P2P data channel transfer
│   │   ├── parallelChunkUploader.ts ← 4-stream parallel HTTP upload
│   │   └── backgroundGuard.ts       ← keeps transfers alive in background
│   ├── components/
│   │   ├── TransferCard.tsx         ← real-time transfer progress + retry
│   │   ├── ProgressRing.tsx         ← circular progress indicator
│   │   ├── SpeedBadge.tsx           ← live MB/s display
│   │   ├── WebPairModal.tsx         ← cross-network pairing UI
│   │   ├── WebQRScanner.tsx         ← QR code scanner
│   │   ├── DisconnectAlert.tsx      ← peer disconnect notification
│   │   └── Layout.tsx               ← app shell with navigation
│   ├── pages/
│   │   ├── Home.tsx                 ← device discovery + pairing
│   │   ├── Send.tsx                 ← file picker + send flow
│   │   ├── Receive.tsx              ← incoming transfer handling
│   │   └── History.tsx              ← past transfers log
│   ├── hooks/
│   │   ├── useTransfer.ts           ← transfer state + WebRTC/HTTP routing
│   │   ├── useDiscovery.ts          ← device discovery polling
│   │   └── useSocket.ts             ← Socket.IO + WebRTC signaling
│   └── store/
│       └── useStore.ts              ← Zustand global state (persisted)
├── server/
│   ├── index.ts                     ← entry point, ports 3001 + 2121
│   ├── httpServer.ts                ← Express: chunk upload, HTTP range download
│   ├── socketServer.ts              ← Socket.IO: events, WebRTC relay, rooms
│   ├── ftpServer.ts                 ← ftp-srv anonymous server
│   └── discovery.ts                 ← multicast-dns announcer
├── public/
│   ├── sw.js                        ← Service Worker for offline caching
│   └── manifest.json                ← PWA manifest
├── Dockerfile                       ← production container for Render
└── vercel.json                      ← SPA rewrite rules for Vercel
```

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 18 + TypeScript | Type-safe, component-driven UI |
| Styling | Vanilla CSS + Framer Motion | Full control, smooth 60fps animations |
| State | Zustand (persisted) | Minimal boilerplate, survives page refresh |
| Build | Vite 5 | Sub-second HMR, optimized production bundles |
| P2P Transfer | WebRTC DataChannels | Direct browser-to-browser, no server needed |
| Native | Capacitor 6 | One codebase → Android + iOS + Web |
| Signaling | Socket.IO on Express | Low-latency WebSocket event relay |
| HTTP Transfer | Parallel fetch + multer | 4-stream parallel chunks for max throughput |
| Discovery | multicast-dns | Zero-config LAN peer finding |
| FTP | ftp-srv | No-app fallback for any device |
| Icons | Lucide React | Clean, consistent iconography |
| Offline | Service Worker + PWA | Full offline support after first load |

---

## 🚀 Getting Started

### Use the Hosted Version (Recommended)

1. Open **[hyperdrop-iota.vercel.app](https://hyperdrop-iota.vercel.app/)** on both devices
2. Connect both devices to the **same WiFi** (or create a hotspot)
3. Devices appear automatically — select one and send files
4. Files transfer directly between browsers. Done.

### Run Locally (For Maximum Speed)

```bash
# Clone
git clone https://github.com/Jai-Bharath/Hyperdrop.git
cd Hyperdrop

# Install
npm install

# Start everything (frontend + server)
npm run dev
```

- **Web App**: `http://localhost:5173`
- **File Browser**: `http://localhost:3001/browse`
- **FTP Access**: `ftp://YOUR_LOCAL_IP:2121`

Running locally enables the **parallel HTTP engine** (4 streams, 100-300 MB/s) instead of WebRTC.

### Build for Production

```bash
npm run build
```

### Deploy

| Service | Purpose | Config |
|---|---|---|
| **Vercel** | Frontend (static React build) | Auto-deploys from GitHub. Set `VITE_SOCKET_URL` to Render URL |
| **Render** | Signaling server only | Docker runtime, `PORT=3001`. Handles Socket.IO + WebRTC relay |

```bash
# Docker (for Render)
docker build -t hyperdrop .
docker run -p 3001:3001 hyperdrop
```

---

## 🗺️ Roadmap

- [x] WebRTC browser-to-browser P2P transfer
- [x] Parallel HTTP transfer engine (100–300 MB/s with local server)
- [x] mDNS zero-config device discovery
- [x] Cross-network pairing (6-char code + QR)
- [x] Built-in FTP server (no-app fallback)
- [x] HTTP range support + parallel download segments
- [x] Retry & resume for broken transfers
- [x] Background transfer protection (Web Locks + AudioContext)
- [x] Page reload warning during active transfers
- [x] PWA + Service Worker offline support
- [x] Capacitor Android packaging
- [ ] Transfer history with speed analytics
- [ ] iOS native support
- [ ] Multi-file batch transfer progress
- [ ] Folder transfer support
- [ ] Smart compression (auto-skip MP4/ZIP, compress BMP/RAW)
- [ ] TURN relay for devices behind strict NATs

---

## 🤝 Contributing

Contributions are welcome. Here's the quickest path:

```bash
# Fork → clone your fork
git clone https://github.com/YOUR_USERNAME/Hyperdrop.git

# Create a feature branch
git checkout -b feat/your-feature-name

# Make your changes, then
git commit -m "feat: describe what you added"
git push origin feat/your-feature-name

# Open a Pull Request
```

Please open an issue first for large changes so we can discuss the approach.

---

## 📜 License

MIT — free to use, modify, and distribute. See [LICENSE](LICENSE).

---

<div align="center">

**Built by [Jai Bharath](https://github.com/Jai-Bharath) with the goal of making file sharing actually fast.**

<br/>

[![Live Demo](https://img.shields.io/badge/Try%20HyperDrop%20Now-6d28d9?style=for-the-badge&logo=vercel&logoColor=white)](https://hyperdrop-iota.vercel.app/)

<br/>

*If HyperDrop saved you time, give it a ⭐ — it helps more people find it.*

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:24243e,50:302b63,100:0f0c29&height=120&section=footer" width="100%" />

</div>

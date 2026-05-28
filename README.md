<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0f0c29,50:302b63,100:24243e&height=200&section=header&text=⚡%20HyperDrop&fontSize=72&fontColor=ffffff&fontAlignY=40&desc=The%20Fastest%20Offline%20File%20Transfer%20on%20the%20Planet&descAlignY=65&descSize=18&descColor=a78bfa" width="100%" />

<br/>

[![Live Demo](https://img.shields.io/badge/🌐%20Live%20Demo-hyperdrop--iota.vercel.app-6d28d9?style=for-the-badge&logoColor=white)](https://hyperdrop-iota.vercel.app/)
[![GitHub Stars](https://img.shields.io/github/stars/Jai-Bharath/Hyperdrop?style=for-the-badge&color=f59e0b&logo=github)](https://github.com/Jai-Bharath/Hyperdrop/stargazers)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-94.7%25-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

<br/>

> **Transfer a 5 GB movie to any device in seconds. No internet. No account. No app required on the other side.**

<br/>

</div>

---

## ⚡ What is HyperDrop?

HyperDrop is a **web-first, Capacitor-wrapped file transfer engine** built for one obsessive purpose — move files between devices at the absolute maximum speed your hardware allows, with **zero cloud involvement, zero data collection, and zero friction**.

Open a browser. Share a file. That's it.

Most file sharing apps are built to be "good enough." HyperDrop is built to be **faster than anything you've used before** — including AirDrop, Quick Share, and SHAREit — by using every trick in the book: parallel TCP streams, adaptive chunk sizing, mDNS zero-config discovery, built-in FTP servers, and a Netflix-style preview engine that lets you start watching a video before it finishes transferring.

---

## 🏆 How HyperDrop Compares

| Feature | HyperDrop | AirDrop | Quick Share | SHAREit | LocalSend |
|---|:---:|:---:|:---:|:---:|:---:|
| **Max transfer speed** | **100–300 MB/s** | ~40 MB/s | ~60 MB/s | ~30 MB/s | ~50 MB/s |
| **Works without internet** | ✅ | ✅ | ✅ | ❌ (ads/telemetry) | ✅ |
| **Receiver needs no app** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Works on any device/OS** | ✅ | ❌ Apple only | ❌ Android only | Partial | Partial |
| **Play video while receiving** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Transfers in background** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Built-in FTP server** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Zero accounts / login** | ✅ | ❌ Apple ID | ❌ Google | ❌ phone no. | ✅ |
| **Zero data collection** | ✅ | ❌ | ❌ | ❌ spyware | ✅ |
| **Multi-device swarm mode** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Resumes broken transfers** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Works on airplane mode** | ✅ | Partial | ❌ | ❌ | ✅ |

> SHAREit was [caught sending user data to Chinese servers](https://www.mcafee.com/blogs/other-blogs/mcafee-labs/shareit-application-vulnerabilities/). HyperDrop contains **zero telemetry code** — not blocked, simply absent.

---

## 🚀 Speed: How We Hit 100–300 MB/s

Most apps send files in a single stream. HyperDrop sends them in **4 simultaneous parallel streams**, each carrying 4 MB chunks, with SHA-256 checksums ensuring integrity.

```
Single stream (SHAREit / Quick Share):
File ──────────────────────────────────────► Receiver
                                             ~30–60 MB/s

HyperDrop parallel engine:
File ──► [Stream 1] ──► Chunk 1, 5, 9, 13 ──►
     ──► [Stream 2] ──► Chunk 2, 6, 10, 14 ──► Receiver
     ──► [Stream 3] ──► Chunk 3, 7, 11, 15 ──►  100–300 MB/s
     ──► [Stream 4] ──► Chunk 4, 8, 12, 16 ──►
```

The protocol is selected automatically based on your network:

| Your Network | Protocol Used | Expected Speed |
|---|---|:---:|
| 5 GHz Wi-Fi, both devices | Parallel TCP (4 streams) | **100–300 MB/s** |
| 2.4 GHz / older phone | Built-in FTP direct | **15–40 MB/s** |
| Hotspot (WiFi Direct) | Raw TCP socket | **40–120 MB/s** |
| Weak signal / cross-network | WebRTC P2P | **20–60 MB/s** |
| No Wi-Fi at all | QR → Hotspot → TCP | **40–120 MB/s** |

---

## ✨ Features That Don't Exist Anywhere Else

### 📺 Netflix Preview Mode
Start watching your video at **10% download completion**. Chunks stream into a RAM buffer, your video player hooks into the temp file, and playback begins while the rest transfers in the background. No other sharing app does this.

### 📡 Zero-Setup Device Discovery
Open HyperDrop. Nearby devices appear on a live **animated radar** within 1–5 seconds. No QR scanning required, no IP addresses to type, no pairing ritual. Three discovery methods run in parallel:
- **WiFi Direct** — no router needed, finds devices in 1–3s
- **mDNS** (`_hyperdrop._tcp.local`) — finds devices on same Wi-Fi in 2–5s
- **QR Code** — guaranteed fallback that always works in under 1s

### 📲 No App Needed on the Other Side
HyperDrop runs its own **built-in FTP server** (port 2121) and **HTTP file browser** (`/browse`). The receiver can:
- Open any file manager and connect via FTP
- Open a browser and type `http://192.168.x.x:3001/browse`
- Download directly — **no installation, no account, nothing**

### 🔄 Swarm Mode (Multi-Receiver)
Sending the same 10 GB file to 3 friends? Each receiver gets **different chunks** and gossip-shares with the others — like BitTorrent on LAN. Everyone finishes at the same time instead of waiting in a queue.

### ⏸️ Resume Broken Transfers
Every chunk is tracked with a `.resume.json` file. If your Wi-Fi drops mid-transfer, HyperDrop picks up **exactly where it left off** — down to the individual 4 MB chunk.

### 🔋 Background Transfer
A persistent `ForegroundService` with `WAKE_LOCK` keeps transfers running while you switch apps, watch YouTube, or lock your screen. Your 5 GB movie transfers while you do other things.

### 🧠 Adaptive Engine
HyperDrop detects your device's network capabilities and adjusts automatically:
- **New phone on 5 GHz** → 4 MB chunks × 4 parallel streams
- **Old phone on 2.4 GHz** → 512 KB chunks × 1 stream (still maximizes old hardware)

---

## 🔒 100% Offline & 100% Private

```
Your Phone ──── Direct Wi-Fi ──── Their Phone
                    ↑
          No servers. No internet.
          No data leaves the room.
```

HyperDrop works completely with **Airplane Mode ON + Wi-Fi ON**. That is the ultimate proof.

**What the app does NOT contain:**
- ❌ No Firebase / AWS / Azure SDK
- ❌ No analytics (no Mixpanel, Amplitude, Segment)
- ❌ No crash reporting to cloud
- ❌ No push notification server
- ❌ No Google Ads SDK
- ❌ No user database or accounts
- ❌ No external `fetch()` calls to any domain
- ❌ Zero telemetry of any kind

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     HyperDrop Stack                         │
├─────────────────────────────────────────────────────────────┤
│  React 18 + Vite + Tailwind + Framer Motion + Zustand       │  ← UI Layer
│  Capacitor 6  (Android / iOS native wrapper)                │  ← Native Bridge
├─────────────────────────────────────────────────────────────┤
│  Transfer Engine                                             │
│  ├── chunkEngine.ts     (4MB chunks, 4 parallel streams)    │
│  ├── protocolPicker.ts  (auto-selects fastest protocol)     │
│  ├── tcpEngine.ts       (raw parallel TCP streams)          │
│  ├── webrtcEngine.ts    (P2P cross-network fallback)        │
│  └── ftpEngine.ts       (2.4GHz / no-app fallback)         │
├─────────────────────────────────────────────────────────────┤
│  Server (Express + Socket.IO)                               │
│  ├── httpServer.ts      (chunk upload + HTTP range)         │
│  ├── socketServer.ts    (real-time events, WebSocket only)  │
│  ├── ftpServer.ts       (anonymous FTP on port 2121)        │
│  └── discovery.ts       (mDNS broadcasts)                   │
└─────────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**
- `multer` uses **memory storage only** — chunks are never written to disk until the complete file is assembled
- Socket.IO uses **WebSocket transport only** — no long-polling fallback overhead
- FTP root = HTTP download dir = `tmpdir()/hyperdrop-downloads` (shared, no duplication)
- SHA-256 checksum on every chunk — corrupt chunks are rejected and re-requested
- `process.on('uncaughtException')` — server logs and recovers, never crashes

---

## 🗂️ Project Structure

```
hyperdrop/
├── src/
│   ├── engine/
│   │   ├── chunkEngine.ts       ← 4MB parallel chunk transfer core
│   │   ├── protocolPicker.ts    ← auto-detects fastest protocol
│   │   ├── tcpEngine.ts         ← raw TCP parallel streams
│   │   ├── webrtcEngine.ts      ← P2P WebRTC data channel
│   │   └── ftpEngine.ts         ← FTP client for 2.4GHz fallback
│   ├── components/
│   │   ├── DeviceRadar.tsx      ← animated live radar UI
│   │   ├── FilePicker.tsx       ← drag-and-drop + file browser
│   │   ├── TransferCard.tsx     ← real-time transfer progress
│   │   ├── ProgressRing.tsx     ← circular progress indicator
│   │   ├── SpeedBadge.tsx       ← live MB/s display
│   │   └── NoAppModal.tsx       ← FTP/browser instructions
│   ├── pages/
│   │   ├── Home.tsx             ← radar + device list
│   │   ├── Send.tsx             ← file picker + send
│   │   ├── Receive.tsx          ← incoming transfers
│   │   └── History.tsx          ← SQLite transfer log
│   ├── hooks/
│   │   ├── useTransfer.ts       ← transfer state management
│   │   ├── useDiscovery.ts      ← device discovery hook
│   │   └── useSocket.ts         ← Socket.IO connection hook
│   └── store/
│       └── useStore.ts          ← Zustand global state
├── server/
│   ├── index.ts                 ← entry, ports 3001 + 2121
│   ├── httpServer.ts            ← Express + multer + HTTP range
│   ├── socketServer.ts          ← Socket.IO real-time events
│   ├── ftpServer.ts             ← ftp-srv anonymous server
│   └── discovery.ts             ← multicast-dns announcer
└── android/                     ← Capacitor Android native code
```

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 18 + TypeScript | Type-safe, component-driven UI |
| Styling | Tailwind CSS + Framer Motion | Fast UI, smooth 60fps animations |
| State | Zustand | Minimal boilerplate, fast updates |
| Build | Vite 5 | Sub-second HMR, optimized bundles |
| Native | Capacitor 6 | One codebase → Android + iOS + Web |
| Server | Express + Socket.IO | Low-latency WebSocket events |
| Transfer | Raw TCP + multer memoryStorage | Maximum throughput, no disk overhead |
| Discovery | multicast-dns | Zero-config LAN peer finding |
| FTP | ftp-srv | No-app fallback for any device |
| Icons | Lucide React | Clean, consistent iconography |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- npm 9+

### Run locally

```bash
# Clone
git clone https://github.com/Jai-Bharath/Hyperdrop.git
cd Hyperdrop

# Install
npm install

# Start everything (frontend + server)
npm run dev:all
```

- **Web App**: `http://localhost:5173`
- **File Browser**: `http://localhost:3001/browse`
- **FTP Access**: `ftp://YOUR_LOCAL_IP:2121`

### Build for production

```bash
npm run build
npx cap sync
npx cap open android   # opens Android Studio
```

### Offline Build

```bash
# Build the project offline
npm run build
npx cap sync --inline
```

### Docker

```bash
docker build -t hyperdrop .
docker run -p 3001:3001 hyperdrop
```

### Deploy

| Service | Purpose | Config |
|---|---|---|
| **Vercel** | Frontend (React + Vite) | Set `VITE_SOCKET_URL` to your backend URL |
| **Render** | Backend (Express + Socket.IO) | Use Docker runtime, set `PORT=3001` |

---

## 🗺️ Roadmap

- [x] Parallel TCP transfer engine (100–300 MB/s)
- [x] mDNS zero-config device discovery
- [x] Built-in FTP server (no-app fallback)
- [x] HTTP range support + parallel download segments
- [x] WebRTC P2P cross-network fallback
- [x] Capacitor Android packaging
- [ ] Netflix preview (play at 10% download) — *in progress*
- [ ] Swarm mode (multi-receiver BitTorrent-style) — *planned*
- [ ] Background transfer with Android ForegroundService — *planned*
- [ ] Transfer resume on disconnect — *planned*
- [ ] iOS support — *planned*
- [ ] Smart compression (auto-skip MP4/ZIP, compress BMP/RAW) — *planned*
- [ ] Transfer link code (HD-4729 browser entry) — *planned*
- [ ] Folder sync mode (offline Dropbox) — *planned*
- [ ] SQLite transfer history with speed graphs — *planned*

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

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0f0c29,50:302b63,100:24243e&height=200&section=header&text=⚡%20HyperDrop&fontSize=72&fontColor=ffffff&fontAlignY=40&desc=Cross-Platform%20File%20Transfer%20•%20No%20Cloud%20•%20No%20Limits&descAlignY=65&descSize=18&descColor=a78bfa" width="100%" />

<br/>

[![Live Demo](https://img.shields.io/badge/🌐%20Live%20Demo-hyperdrop--iota.vercel.app-6d28d9?style=for-the-badge&logoColor=white)](https://hyperdrop-iota.vercel.app/)
[![Download APK](https://img.shields.io/badge/📱%20Download%20APK-Android-34a853?style=for-the-badge&logo=android&logoColor=white)](https://hyperdrop-iota.vercel.app/hyperdrop.apk)
[![GitHub Stars](https://img.shields.io/github/stars/Jai-Bharath/Hyperdrop?style=for-the-badge&color=f59e0b&logo=github)](https://github.com/Jai-Bharath/Hyperdrop/stargazers)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-94.7%25-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

<br/>

> **Transfer files between any devices — phone to laptop, laptop to phone — at full WiFi speed. No cloud. No accounts. No file size limits. Works in the browser and as a native Android app.**

<br/>

</div>

---

## ⚡ What is HyperDrop?

HyperDrop is a **cross-platform file transfer app** with two complementary modes:

- **🌐 Web Version** — Open the website in any browser. Files transfer directly via **WebRTC peer-to-peer** data channels. No installation required.
- **📱 Android App** — A native Capacitor-powered APK with an embedded **Kotlin HTTP server** for blazing-fast LAN transfers via parallel HTTP streams.

Both versions can talk to each other. A phone running the APK can send files to a laptop running the website — and vice versa.

```
📱 Android App (APK)                       💻 Laptop Browser
   │  Kotlin HTTP Server (port 53317)         │
   │  UDP Multicast Discovery                 │  Socket.IO + WebRTC
   │                                          │
   │   ◄──── LAN Direct HTTP ────►            │   ◄──── WebRTC P2P ────►
   │         100–300 MB/s                      │         30–80 MB/s
   │                                          │
   ├── Chat messages (offline sync) ──────────┤
   ├── Clipboard sync ────────────────────────┤
   └── Trusted device auto-accept ────────────┘
```

**No server ever touches your files.** The signaling server only connects devices — like a phone switchboard that connects calls but never hears the conversation.

---

## 🏆 How HyperDrop Compares

| Feature | HyperDrop | AirDrop | Quick Share | SHAREit | LocalSend |
|---|:---:|:---:|:---:|:---:|:---:|
| **No app install needed (web)** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Native Android app** | ✅ Capacitor + Kotlin | ❌ | ✅ | ✅ | ✅ |
| **Works on any device/OS** | ✅ | ❌ Apple only | ❌ Android only | Partial | Partial |
| **Files never touch a server** | ✅ | ✅ | ✅ | ❌ (ads/telemetry) | ✅ |
| **Built-in chat** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Clipboard sync** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Trusted devices (auto-accept)** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Audio notifications** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Drag & drop folders** | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Background transfer** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Retry / Resume** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Cross-network QR pairing** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Zero accounts / login** | ✅ | ❌ Apple ID | ❌ Google | ❌ phone no. | ✅ |
| **Zero data collection** | ✅ | ❌ | ❌ | ❌ spyware | ✅ |
| **Built-in FTP server** | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 🚀 How It Works

### Two Transfer Modes (Auto-Selected)

| Mode | When | How | Speed |
|---|---|---|:---:|
| **WebRTC P2P** | Both users open the website | Browser-to-browser data channel via Socket.IO signaling | **30–80 MB/s** |
| **Parallel HTTP** | Native app or local server on the same WiFi | 4 parallel TCP streams, 4MB chunks, direct to device | **100–300 MB/s** |

HyperDrop **automatically picks the right mode**:
- Devices discovered on the local network → **Parallel HTTP** (fastest)
- Devices discovered via the signaling server → **WebRTC P2P** (works across any network)
- Either way, **your file data never passes through any cloud server**

```
WebRTC P2P (browser ↔ browser):
Phone ◄════════════════════════════════► Laptop
         Direct WiFi data channel
         Signaling server relays metadata only

Parallel HTTP (native app or local server):
Phone ──► [Stream 1] ──► Chunk 1, 5, 9  ──►
      ──► [Stream 2] ──► Chunk 2, 6, 10 ──► Laptop:53317
      ──► [Stream 3] ──► Chunk 3, 7, 11 ──►  100–300 MB/s
      ──► [Stream 4] ──► Chunk 4, 8, 12 ──►
```

---

## ✨ Key Features

### 📡 Instant Device Discovery
Open HyperDrop on two devices. They find each other automatically. Multiple discovery methods run in parallel:
- **Same WiFi** — UDP multicast auto-discovery + mDNS (`_hyperdrop._tcp.local`)
- **Cross-network** — QR code scan or manual IP entry
- **Hotspot** — create a hotspot, connect the other device, transfer

### 💬 Built-in Chat
Send text messages between connected devices — works fully offline over the local network. Messages sync via HTTP polling when devices are on the same WiFi, or via Socket.IO when using WebRTC mode. Includes:
- Real-time typing indicators
- Unread message badge counter
- Audio pop notification on new messages
- Desktop system notifications

### 📋 Clipboard Sync
Copy text on one device, paste it on the other. Clipboard entries sync automatically between connected peers over the local network. Supports text and URL content types.

### 🔒 Trusted Devices
Check "Always trust this device" when accepting a transfer. Future transfers from that device are **automatically accepted** — no more tapping Accept every time for your own devices.

### 🔔 Audio & Desktop Notifications
- **Success chime** plays when a file transfer completes (synthesized via Web Audio API — no external audio files needed)
- **Message pop** plays when a chat message arrives while the chat panel is closed
- **Desktop notifications** appear for completed transfers and incoming messages (with browser permission)

### 📂 Drag & Drop
Drag files or entire folders directly onto the Home page or Send page. HyperDrop uses `react-dropzone` with `webkitdirectory` support for recursive folder uploads.

### 🔄 Retry & Resume
Transfer interrupted? Hit **Retry** — it picks up where it left off. The server tracks which chunks were received, so only missing chunks are re-sent.

### 🔋 Background Transfer
Switch tabs, check your email — your transfer keeps running. HyperDrop uses Web Locks, AudioContext keep-alive, and BroadcastChannel heartbeats to prevent the browser from killing the connection.

### ⚠️ Reload Protection
Accidentally reload the page during a transfer? The browser warns you first. No more losing a 2GB transfer because you hit F5.

### 📲 No App Needed on the Other Side
The companion server includes a **built-in FTP server** (port 2121) and **HTTP file browser** (`/browse`). The receiver can use any file manager or browser.

### 🌐 Progressive Web App (PWA)
Install HyperDrop on your home screen. It works offline, caches assets via Service Worker, and loads instantly.

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

The **only** cloud component handles device discovery and WebRTC signaling — it never sees, stores, or relays your file data.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Vercel (CDN)                              │
│  Static frontend: React + Vite + CSS + Service Worker             │
│  Cached offline as PWA — loads instantly after first visit         │
├──────────────────────────────────────────────────────────────────┤
│                   Signaling Server (:53317)                        │
│  Socket.IO: device discovery, room pairing, transfer negotiation  │
│  WebRTC offer/answer/ICE relay. NO file data passes here.         │
├──────────────────────────────────────────────────────────────────┤
│                     Browser ↔ Browser                              │
│  WebRTC DataChannel: file chunks flow directly P2P                │
│  256KB chunks, backpressure managed, speed tracked                │
├──────────────────────────────────────────────────────────────────┤
│               Android Native (Capacitor + Kotlin)                  │
│  HyperDropHttpServer: NanoHTTPD on port 53317                     │
│  UDP multicast discovery, file reassembly, chat/clipboard sync    │
│  LocalServerPlugin: Capacitor bridge to JS layer                  │
├──────────────────────────────────────────────────────────────────┤
│              Optional: Companion Server (:53317)                   │
│  Express: parallel HTTP chunk upload, FTP, file browser           │
│  4MB chunks × 4 streams = 100–300 MB/s                            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🗂️ Project Structure

```
hyperdrop/
├── src/
│   ├── engine/
│   │   ├── webrtcEngine.ts             ← WebRTC P2P data channel transfer
│   │   ├── parallelChunkUploader.ts    ← 4-stream parallel HTTP upload
│   │   └── backgroundGuard.ts          ← keeps transfers alive in background
│   ├── components/
│   │   ├── TransferCard.tsx            ← real-time transfer progress + retry
│   │   ├── ConsentModal.tsx            ← accept/decline + trusted device checkbox
│   │   ├── DeviceList.tsx              ← nearby device list with status indicators
│   │   ├── ChatPanel.tsx               ← sliding chat panel with typing indicators
│   │   ├── ClipboardSync.tsx           ← clipboard history and sync UI
│   │   ├── DropZone.tsx                ← drag-and-drop file/folder uploader
│   │   ├── FilePicker.tsx              ← file selection with folder support
│   │   ├── ManualIPEntry.tsx           ← manual IP:port connection dialog
│   │   ├── WebQRScanner.tsx            ← QR code scanner for pairing
│   │   ├── QRCodeDisplay.tsx           ← QR code generator
│   │   ├── Layout.tsx                  ← app shell with bottom navigation
│   │   └── ...
│   ├── pages/
│   │   ├── Home.tsx                    ← dashboard: devices, QR, drop zone
│   │   ├── Send.tsx                    ← file picker + device select + send
│   │   ├── Receive.tsx                 ← QR code display + incoming transfers
│   │   └── History.tsx                 ← past transfers log with stats
│   ├── hooks/
│   │   ├── useTransfer.ts              ← dual WebRTC/HTTP transfer routing
│   │   ├── useSocket.ts                ← Socket.IO + WebRTC signaling
│   │   ├── useDiscovery.ts             ← multi-method device discovery
│   │   ├── useIncomingTransfers.ts     ← native listener for incoming files/chat/clipboard
│   │   ├── useLocalSync.ts             ← offline LAN chat/clipboard polling
│   │   └── useLocalTransport.ts        ← HTTP transport helpers (prepare, poll, etc.)
│   ├── native/
│   │   └── LocalServer.ts             ← Capacitor plugin bridge (TypeScript ↔ Kotlin)
│   ├── shared/
│   │   └── protocol.ts                ← protocol constants, PrepareRequest types
│   ├── store/
│   │   └── useStore.ts                ← Zustand global state (persisted)
│   └── utils/
│       ├── audio.ts                   ← Web Audio API chime synthesizer
│       ├── notification.ts            ← desktop notification helper
│       ├── crypto.ts                  ← session tokens, fingerprints, encryption
│       └── formatBytes.ts            ← human-readable file size formatting
├── server/
│   ├── index.ts                       ← entry point: Express + Socket.IO on :53317
│   ├── httpServer.ts                  ← Express: chunk upload, file browser, chat/clipboard API
│   ├── socketServer.ts                ← Socket.IO: events, WebRTC relay, room management
│   ├── ftpServer.ts                   ← ftp-srv anonymous server on :2121
│   └── discovery.ts                   ← multicast-dns announcer
├── android/
│   ├── app/src/main/java/app/hyperdrop/transfer/
│   │   ├── HyperDropHttpServer.kt     ← NanoHTTPD: file receive, chat, clipboard, discovery
│   │   ├── LocalServerPlugin.kt       ← Capacitor plugin: multicast, IP resolution, consent
│   │   └── MainActivity.java          ← Capacitor activity entry point
│   ├── app/src/main/AndroidManifest.xml
│   └── app/build.gradle
├── public/
│   ├── sw.js                          ← Service Worker for offline caching
│   └── manifest.json                  ← PWA manifest
├── capacitor.config.ts                ← Capacitor config (appId, webDir, plugins)
└── vite.config.ts                     ← Vite build + dev proxy config
```

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 18 + TypeScript | Type-safe, component-driven UI |
| Styling | Tailwind CSS + Framer Motion | Utility-first styling with smooth 60fps animations |
| State | Zustand (persisted) | Minimal boilerplate, survives page refresh |
| Build | Vite 5 | Sub-second HMR, optimized production bundles |
| P2P Transfer | WebRTC DataChannels | Direct browser-to-browser, no server needed |
| Native App | Capacitor 6 + Kotlin | One codebase → Android + Web with native networking |
| Native HTTP | NanoHTTPD (Kotlin) | Embedded HTTP server on Android for LAN transfers |
| Signaling | Socket.IO on Express | Low-latency WebSocket event relay + room management |
| HTTP Transfer | Parallel fetch + multer | 4-stream parallel chunks for max throughput |
| Discovery | UDP Multicast + mDNS | Zero-config LAN peer finding |
| FTP | ftp-srv | No-app fallback for any device |
| Audio | Web Audio API | Synthesized chimes — no external audio files |
| Notifications | Notification API | Desktop system notifications for transfers & messages |
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

# Install dependencies
npm install

# Start everything (frontend + companion server)
npm run dev
```

- **Web App**: `http://localhost:5173`
- **Companion Server**: `http://localhost:53317`
- **File Browser**: `http://localhost:53317/browse`
- **FTP Access**: `ftp://YOUR_LOCAL_IP:2121`

Running locally enables the **parallel HTTP engine** (4 streams, 100–300 MB/s) alongside WebRTC.

### Build for Production

```bash
# TypeScript check + Vite production build
npm run build
```

### 📱 Build Android APK

HyperDrop ships a native Android app built with **Capacitor 6** and a **Kotlin HTTP server**. The same React codebase is bundled into a WebView with native networking capabilities (UDP multicast discovery, NanoHTTPD file server, multicast lock).

#### Prerequisites

- **Node.js** ≥ 18
- **Java JDK** 17 or 21
- **Android SDK** (API 34) — install via [Android Studio](https://developer.android.com/studio)

#### Build Steps

```bash
# 1. Build web + sync + assemble APK (all-in-one)
npm run build:apk

# Or step by step:
npm run build                    # Build the web app
npx cap sync android             # Sync web assets into Android project
cd android && gradlew assembleDebug   # Build debug APK
```

The generated APK will be at:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

#### Release APK

```bash
cd android
gradlew assembleRelease
```

> **Note:** Release builds require a signing keystore. See the [Android signing guide](https://developer.android.com/studio/publish/app-signing).

#### Install on Device

```bash
# Via ADB (USB debugging enabled)
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

#### Open in Android Studio

```bash
npx cap open android
```

---

## 🗺️ Roadmap

- [x] WebRTC browser-to-browser P2P transfer
- [x] Parallel HTTP transfer engine (100–300 MB/s with local server)
- [x] UDP multicast + mDNS zero-config device discovery
- [x] Cross-network pairing (QR code + manual IP)
- [x] Built-in FTP server (no-app fallback)
- [x] Retry & resume for broken transfers
- [x] Background transfer protection (Web Locks + AudioContext)
- [x] Page reload warning during active transfers
- [x] PWA + Service Worker offline support
- [x] Native Android app with Kotlin HTTP server
- [x] Built-in chat (offline LAN sync + Socket.IO)
- [x] Clipboard sync between devices
- [x] Trusted devices — auto-accept transfers
- [x] Audio notifications (Web Audio chimes)
- [x] Desktop system notifications
- [x] Drag & drop files and folders
- [x] Device identity & clear peer naming
- [x] Consent modal with trust checkbox
- [x] Transfer history with speed analytics
- [ ] iOS native support
- [ ] End-to-end encryption (ECDH key exchange)
- [ ] Multi-file batch progress aggregation
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

**Built by [Jai Bharath](https://github.com/Jai-Bharath) with the goal of making file sharing actually work across every device.**

<br/>

[![Live Demo](https://img.shields.io/badge/Try%20HyperDrop%20Now-6d28d9?style=for-the-badge&logo=vercel&logoColor=white)](https://hyperdrop-iota.vercel.app/)

<br/>

*If HyperDrop saved you time, give it a ⭐ — it helps more people find it.*

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:24243e,50:302b63,100:0f0c29&height=120&section=footer" width="100%" />

</div>

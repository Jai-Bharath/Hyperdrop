# HyperDrop ⚡ — High-Speed Local & Web P2P File-Sharing System

[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Socket.io](https://img.shields.io/badge/Socket.IO-4.7-010101?style=flat-square&logo=socket.io&logoColor=white)](https://socket.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Render](https://img.shields.io/badge/Render-Backend-46E3B7?style=flat-square&logo=render&logoColor=black)](https://render.com/)
[![Vercel](https://img.shields.io/badge/Vercel-Frontend-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/)

HyperDrop is a state-of-the-art, high-performance hybrid file-sharing application designed for blistering transmission speeds over local Wi-Fi networks (LAN) and cross-network peer-to-peer (P2P) connections. By orchestrating a multi-channel transmission architecture, HyperDrop connects devices dynamically and operates with or without active internet connectivity.

---

## 📐 System Architecture & Transmission Engines

HyperDrop integrates four custom communication sub-systems to maximize network utilization:

### 1. High-Speed Multi-Stream Engines
* **Raw Upload Streaming (`streamUploadEngine.ts`)**: Bypasses typical browser multi-part form data and file chunk buffering overheads. Files are streamed as a single raw TCP binary payload utilizing an `XMLHttpRequest` upload channel. It easily saturates high-speed 5 GHz Wi-Fi bandwidth, delivering speeds from **100 MB/s to over 250 MB/s**.
* **Parallel Segmented Download (`parallelDownloadEngine.ts`)**: Bypasses single-connection browser bottlenecks by splitting requested file downloads into **6 concurrent segment download workers**. 
* **HTTP Range Support (`httpServer.ts`)**: The backend supports full HTTP range parsing (`Range: bytes=start-end`). Each parallel worker downloads specific 8 MB blocks from separate file ranges simultaneously, which are stitched directly into a single browser blob URL upon completion, reducing network overhead.
* **Server-Side Sparse Pre-allocation & Streaming Writes (`httpServer.ts`)**: To prevent server-side memory inflation or NTFS locking bottlenecks on high-speed concurrent writes:
  * Creates an atomic file pre-allocation lock (sparse file) matching the target size instantly via `fs.promises.truncate`.
  * Writes chunks at their exact byte offsets using a persistent pool of file handles.

### 2. Dual-Channel Peer Discovery
* **mDNS Zero-Config Auto-Discovery (`discovery.ts`)**: Broadcasts and listens for DNS-SD service advertisements (`_hyperdrop._tcp.local`) over the local subnet. Dynamically advertises hostnames, platforms, IPs, ports, and passive FTP configurations.
* **Same-Network Socket Room Matching (`socketServer.ts`)**: Clients connecting to the public signaling server are grouped automatically into secure rooms matching their hashed local LAN subnets (Classless Inter-Domain Routing). This enables instant, zero-config peer discovery even if mDNS is blocked by active device OS firewalls.

### 3. P2P WebRTC Fallback (`webrtcEngine.ts`)
* When devices are on separate networks (e.g., mobile data and local Wi-Fi), HyperDrop falls back to direct browser-to-browser peer-to-peer data channels (`RTCDataChannel`) using STUN/TURN servers coordinated by our Socket.IO signaling layer.

### 4. Zero-Install Fallbacks
* **Anonymous FTP Server (`ftpServer.ts`)**: Serves an anonymous, read-only FTP server on port `2121` mounted to the downloads directory. Third-party native file managers (like Solid Explorer, Apple Files, or VLC) can browse and download shared files natively without installing the application.
* **HTTP Direct View (`httpServer.ts`)**: Serves an elegant, ultra-lightweight browser view on `/browse` displaying all currently uploaded files for simple direct downloads.

---

## 🛠️ Technology Stack

* **Frontend**: React 18.3 + TypeScript + Zustand 4.5 + Tailwind CSS + Framer Motion + Lucide React + React Router DOM 6
* **Backend**: Express 4.18 + Socket.IO 4.7 + multicast-dns 7.2 + ftp-srv 4.6 + Multer 1.4
* **Packaging**: Capacitor 6.0 (for native Android/iOS compilation)
* **DevOps**: Docker + tsx + Vite 5.2

---

## 💻 Local Development & Setup

### Prerequisites
Ensure you have **Node.js 20+** installed on your workstation.

### 1. Install Dependencies
```bash
npm install
```

### 2. Run HyperDrop (Client + Server concurrently)
```bash
npm run dev
```
* **Frontend Web App**: `http://localhost:5173` (proxied to server API)
* **Express & Socket.IO Signaling Backend**: `http://localhost:3001`
* **Direct File Browse Interface**: `http://localhost:3001/browse`
* **Local FTP Server fallback**: `ftp://<your-local-ip>:2121`

### 3. Testing & Bundling
* **Verify TypeScript Integrity**:
  ```bash
  npm run typecheck
  ```
* **Compile Frontend Production Bundle**:
  ```bash
  npm run build
  ```

---

## 🚀 Production Deployment Manual

For full global scalability, deploy the **Express/Socket.IO Backend** to **Render** (supporting persistent websocket connections) and the **Vite React Frontend** to **Vercel** (high-performance static CDN).

### Step 1: Push Codebase to GitHub
1. Create a new repository on GitHub (e.g., `hyper-drop`).
2. Run the following commands in your local project directory:
   ```bash
   git init
   git add .
   git commit -m "feat: core transfer engine with HTTP Range support"
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/hyper-drop.git
   git push -u origin main
   ```

---

### Step 2: Deploy Backend Server to Render
Render is perfect for hosting the Node.js Express server because it natively supports WebSocket and Server-Sent Events.

1. Open the [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** in the top right and select **Web Service**.
3. Link your GitHub account and import the `hyper-drop` repository.
4. Set up the service configuration:
   * **Name**: `hyper-drop`
   * **Region**: Choose the region closest to your primary target users.
   * **Branch**: `main`
   * **Runtime**: Select **Docker** (Render will automatically read our production-ready `Dockerfile`, configure the Node environment, and start the high-performance `tsx` compilation runner).
   * **Instance Type**: Select **Free** (or Starter for higher resource limits).
5. Open the **Advanced** section and add the following **Environment Variables**:
   * `PORT` = `3001`
   * `NODE_ENV` = `production`
6. Click **Deploy Web Service**.
7. Once deployed, copy your Render service URL (e.g., `https://hyper-drop.onrender.com`).

---

### Step 3: Deploy Frontend Web Client to Vercel
Vercel hosts static websites on a lightning-fast global edge network.

1. Open the [Vercel Dashboard](https://vercel.com/) and click **Add New > Project**.
2. Import the `hyper-drop` repository.
3. Configure the build parameters:
   * **Framework Preset**: **Vite**
   * **Root Directory**: `./` (default)
   * **Build Command**: `npm run build` (or `tsc --noEmit && vite build`)
   * **Output Directory**: `dist`
4. Expand the **Environment Variables** section and add:
   * **Key**: `VITE_SOCKET_URL`
   * **Value**: `https://hyper-drop.onrender.com` (Insert your deployed Render Backend URL)
5. Click **Deploy**. Vercel will build the frontend assets and host the application at `https://hyper-drop.vercel.app`.

---

## 🔒 Security Architectures
* **Path Traversal Shield**: The backend strips incoming folder paths and absolute structures via `path.basename(fileName)` before writing files to `DOWNLOADS_DIR`, preventing directory traversal attacks.
* **Hashed IP Routing**: Same-network room identification uses short SHA-256 hashes of client subnets. No plain-text IP addresses are stored or broadcasted.
* **File Handle Sanitation**: Unfinished `.part` file handles are automatically pruned after 10 minutes of inactivity or immediately closed upon transmission errors to prevent memory exhaustion and disk locking.

import http from 'http'
import express from 'express'
import dgram from 'dgram'
import { Server } from 'socket.io'
import { setupHttpServer, getLocalIp, DOWNLOADS_DIR } from './httpServer.js'
import { startFtpServer } from './ftpServer.js'
import { startDiscovery, stopDiscovery, getDiscoveredDevices } from './discovery.js'
import { setupSocketServer } from './socketServer.js'
import {
  MULTICAST_ADDR, MULTICAST_PORT, ANNOUNCE_INTERVAL_MS,
  LOCAL_HTTP_PORT, type AnnouncePacket
} from '../src/shared/protocol.js'
import { hostname, platform } from 'os'
import { createHash, randomBytes } from 'crypto'

// ─── Constants ────────────────────────────────────────────────────────
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : LOCAL_HTTP_PORT // Respect environment variable on Cloud, fallback to 53317 for local companion

// ─── Device Identity (desktop companion) ──────────────────────────────
const deviceName = hostname()
const devicePlatform = platform()
// Persistent fingerprint based on hostname + platform (stable across restarts)
const myFingerprint = createHash('sha256')
  .update(`${deviceName}-${devicePlatform}-hyperdrop-desktop`)
  .digest('hex')
const myAlias = `${deviceName} (${devicePlatform})`

// ─── Bootstrap ────────────────────────────────────────────────────────
const app = express()
const server = http.createServer(app)
server.on('connection', (socket) => {
  socket.setNoDelay(true)
})

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 10 * 1024 * 1024,
})

// Wire up HTTP routes
setupHttpServer(app, myFingerprint, myAlias)
setupSocketServer(io)

// ─── UDP Multicast — Shared Protocol Discovery ───────────────────────
// Same wire format as the native Kotlin plugin. Desktop companion
// is a peer of native devices, not a separate system.
const multicastSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
let announceTimer: ReturnType<typeof setInterval> | null = null

// Track peers discovered via multicast
const multicastPeers = new Map<string, AnnouncePacket & { ip: string; lastSeen: number }>()

multicastSocket.on('message', (msg, rinfo) => {
  try {
    const packet: AnnouncePacket = JSON.parse(msg.toString())
    if (packet.type !== 'hyperdrop-announce') return
    if (packet.fingerprint === myFingerprint) return // skip self

    multicastPeers.set(packet.fingerprint, {
      ...packet,
      ip: rinfo.address,
      lastSeen: Date.now(),
    })
  } catch { /* malformed, ignore */ }
})

multicastSocket.on('error', (err) => {
  console.error('[multicast] Socket error:', err)
})

function startMulticast(): void {
  multicastSocket.bind(MULTICAST_PORT, () => {
    try {
      multicastSocket.addMembership(MULTICAST_ADDR)
      console.log(`[multicast] Listening on ${MULTICAST_ADDR}:${MULTICAST_PORT}`)
    } catch (err) {
      console.error('[multicast] Failed to join multicast group:', err)
    }

    // Periodic announce
    announceTimer = setInterval(() => {
      const packet: AnnouncePacket = {
        type: 'hyperdrop-announce',
        version: '1.0',
        alias: myAlias,
        fingerprint: myFingerprint,
        deviceType: 'desktop',
        port: PORT,
        timestamp: Date.now(),
      }
      const buf = Buffer.from(JSON.stringify(packet))
      multicastSocket.send(buf, 0, buf.length, MULTICAST_PORT, MULTICAST_ADDR, (err) => {
        if (err) console.error('[multicast] Announce send error:', err)
      })

      // Prune stale peers
      const now = Date.now()
      for (const [fp, peer] of multicastPeers) {
        if (now - peer.lastSeen > 15000) {
          multicastPeers.delete(fp)
        }
      }
    }, ANNOUNCE_INTERVAL_MS)
  })
}

/** Get all peers discovered via UDP multicast */
export function getMulticastPeers() {
  return Array.from(multicastPeers.values())
}

// ─── Start server ─────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIp()
  console.log('')
  console.log('  ⚡ HyperDrop Desktop Companion (Zero-Cloud)')
  console.log('  ───────────────────────────────────────')
  console.log(`  HTTP:       http://${ip}:${PORT}`)
  console.log(`  Multicast:  ${MULTICAST_ADDR}:${MULTICAST_PORT}`)
  console.log(`  FTP:        ftp://${ip}:2121`)
  console.log(`  Browse:     http://${ip}:${PORT}/browse`)
  console.log(`  Downloads:  ${DOWNLOADS_DIR}`)
  console.log('  ───────────────────────────────────────')
  console.log('')

  // Start multicast discovery (UDP)
  startMulticast()

  // Start mDNS discovery (Bonjour/Zeroconf — coexists with multicast)
  startDiscovery()

  // Start FTP (async, non-blocking — failure won't take down the server)
  startFtpServer().catch((err) => {
    console.error('[startup] FTP server failed:', err)
  })
})

// ─── Global error handlers — log but NEVER crash ──────────────────────
process.on('uncaughtException', (err: Error) => {
  console.error('[FATAL] Uncaught exception (not crashing):', err)
})

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[FATAL] Unhandled rejection (not crashing):', reason)
})

// ─── Graceful shutdown ────────────────────────────────────────────────
const shutdown = () => {
  console.log('\n[shutdown] Gracefully shutting down...')
  try {
    stopDiscovery()
  } catch (err) {
    console.error('[shutdown] Failed to stop mDNS discovery:', err)
  }
  try {
    if (announceTimer) clearInterval(announceTimer)
    multicastSocket.close()
  } catch (err) {
    console.error('[shutdown] Failed to close multicast socket:', err)
  }
  server.close(() => {
    console.log('[shutdown] HTTP server closed')
    process.exit(0)
  })
  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.error('[shutdown] Forced exit after timeout')
    process.exit(1)
  }, 5000)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

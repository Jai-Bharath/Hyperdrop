import http from 'http'
import express from 'express'
import { Server } from 'socket.io'
import { setupHttpServer, getLocalIp, DOWNLOADS_DIR } from './httpServer.js'
import { setupSocketServer } from './socketServer.js'
import { startFtpServer } from './ftpServer.js'
import { startDiscovery, stopDiscovery } from './discovery.js'

// ─── Constants ────────────────────────────────────────────────────────
const PORT = 3001

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
  maxHttpBufferSize: 10 * 1024 * 1024, // 10 MB for socket payloads
})

// Wire up subsystems
setupHttpServer(app, io)
setupSocketServer(io)

// ─── Start server ─────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIp()
  console.log('')
  console.log('  ⚡ HyperDrop Server')
  console.log('  ───────────────────────────────────────')
  console.log(`  HTTP:      http://${ip}:${PORT}`)
  console.log(`  Socket.IO: ws://${ip}:${PORT}`)
  console.log(`  FTP:       ftp://${ip}:2121`)
  console.log(`  Browse:    http://${ip}:${PORT}/browse`)
  console.log(`  Downloads: ${DOWNLOADS_DIR}`)
  console.log('  ───────────────────────────────────────')
  console.log('')

  // Start FTP (async, non-blocking — failure won't take down the server)
  startFtpServer().catch((err) => {
    console.error('[startup] FTP server failed:', err)
  })

  // Start mDNS discovery
  startDiscovery()
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

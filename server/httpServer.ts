import express, { Express, Request, Response, NextFunction } from 'express'
import { join, basename } from 'path'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  createReadStream,
  statfsSync,
} from 'fs'
import { open, rename, FileHandle } from 'fs/promises'
import { tmpdir } from 'os'
import { networkInterfaces } from 'os'
import cors from 'cors'
import { randomBytes } from 'crypto'
import type {
  PrepareRequest, PrepareResponse, ChatMessage,
  ClipboardPayload, ChatPollResponse, ClipboardPollResponse,
  SessionStatus, DeviceInfo,
} from '../src/shared/protocol.js'
import { ENDPOINTS, SESSION_HEADER, CHUNK_SIZE as PROTOCOL_CHUNK_SIZE } from '../src/shared/protocol.js'

// ─── Constants ────────────────────────────────────────────────────────
const CHUNK_SIZE = 8 * 1024 * 1024 // 8 MB — must match client chunk size

/** Get free bytes on the drive containing the given path */
function getFreeSpace(dirPath: string): number {
  try {
    const stats = statfsSync(dirPath)
    return stats.bfree * stats.bsize
  } catch {
    return 0
  }
}

/** Try to create a directory, return true on success */
function tryMkdir(dir: string): boolean {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return true
  } catch {
    return false
  }
}

// Downloads directory — picks the drive with the most free space
function getBestDownloadsDir(): string {
  const candidates: { path: string; free: number }[] = []

  // 1. Home directory
  const homeDir = process.env.HOME || process.env.USERPROFILE
  if (homeDir) {
    const homeDownloads = join(homeDir, 'hyperdrop-downloads')
    if (tryMkdir(homeDownloads)) {
      const free = getFreeSpace(homeDownloads)
      candidates.push({ path: homeDownloads, free })
    }
  }

  // 2. Windows alternate drive fallbacks (D:, E:)
  for (const letter of ['D', 'E']) {
    const dir = `${letter}:\\hyperdrop-downloads`
    const driveRoot = `${letter}:\\`
    try {
      if (existsSync(driveRoot) && tryMkdir(dir)) {
        const free = getFreeSpace(dir)
        candidates.push({ path: dir, free })
      }
    } catch { /* skip */ }
  }

  // 3. Tmpdir fallback
  const tmpFallback = join(tmpdir(), 'hyperdrop-downloads')
  if (tryMkdir(tmpFallback)) {
    const free = getFreeSpace(tmpFallback)
    candidates.push({ path: tmpFallback, free })
  }

  if (candidates.length === 0) {
    // Last resort
    const fallback = join(tmpdir(), 'hyperdrop-downloads')
    mkdirSync(fallback, { recursive: true })
    return fallback
  }

  // Pick the candidate with the most free space
  candidates.sort((a, b) => b.free - a.free)

  const best = candidates[0]
  console.log(`[httpServer] Downloads dir: ${best.path} (${(best.free / 1024 / 1024 / 1024).toFixed(1)} GB free)`)
  if (candidates.length > 1) {
    console.log(`[httpServer] Alternatives: ${candidates.slice(1).map(c => `${c.path} (${(c.free / 1024 / 1024 / 1024).toFixed(1)} GB)`).join(', ')}`)
  }

  return best.path
}

export const DOWNLOADS_DIR = getBestDownloadsDir()

if (!existsSync(DOWNLOADS_DIR)) {
  mkdirSync(DOWNLOADS_DIR, { recursive: true })
}

// ─── Transfer state ──────────────────────────────────────────────────
// Maps transferId → Set of received chunk indices
const transferState = new Map<string, Set<number>>()

// Maps transferId → persistent FileHandle
const fileHandlePool = new Map<string, FileHandle>()

// Maps transferId → last activity timestamp
const transferLastSeen = new Map<string, number>()

// Maps transferId → file metadata
const transferMeta = new Map<string, { fileName: string; fileSize: number; totalChunks: number; partPath: string; finalPath: string }>()

// Maps transferId → lock promise for serializing first-chunk init
const initLocks = new Map<string, Promise<void>>()

// Session tokens: sessionId → { token, expiresAt }
const sessionTokens = new Map<string, { token: string; expiresAt: number }>()

// ─── Consent queue ──────────────────────────────────────────────────
// Pending consent requests: sessionId → { resolve, reject }
interface ConsentWaiter {
  resolve: (response: PrepareResponse) => void
  reject: (reason: Error) => void
  request: PrepareRequest
  timestamp: number
}
const pendingConsents = new Map<string, ConsentWaiter>()

export async function closeFileHandle(transferId: string): Promise<void> {
  const fh = fileHandlePool.get(transferId)
  if (fh) {
    try { await fh.close() } catch { /* ignore */ }
    fileHandlePool.delete(transferId)
  }
  transferState.delete(transferId)
  transferLastSeen.delete(transferId)
  transferMeta.delete(transferId)
  initLocks.delete(transferId)
}

// Pruning interval for stale transfers (10 minutes)
setInterval(() => {
  const now = Date.now()
  const STALE = 10 * 60 * 1000
  for (const [id, lastSeen] of transferLastSeen.entries()) {
    if (now - lastSeen > STALE) {
      closeFileHandle(id).catch(() => {})
      console.log(`[httpServer] Pruned stale transfer: ${id}`)
    }
  }
  // Prune expired session tokens
  for (const [id, session] of sessionTokens.entries()) {
    if (now > session.expiresAt) {
      sessionTokens.delete(id)
    }
  }
  // Prune stale consents (30s timeout)
  for (const [id, waiter] of pendingConsents.entries()) {
    if (now - waiter.timestamp > 30000) {
      waiter.reject(new Error('Consent timed out'))
      pendingConsents.delete(id)
    }
  }
}, 5 * 60 * 1000)

// ─── Chat & Clipboard Buffers ────────────────────────────────────────
interface StoredChat extends ChatMessage {
  receivedAt: number
}
interface StoredClipboard extends ClipboardPayload {
  receivedAt: number
}

const chatBuffer: StoredChat[] = []
const clipboardBuffer: StoredClipboard[] = []

// ─── Helpers ─────────────────────────────────────────────────────────
export function getLocalIp(): string {
  const nets = networkInterfaces()
  const candidates: string[] = []

  for (const name of Object.keys(nets)) {
    const interfaces = nets[name]
    if (!interfaces) continue

    const nameLower = name.toLowerCase()
    const isVirtual = /virtual|vbox|vnet|vmnet|wsl|docker|dummy/i.test(nameLower)

    for (const iface of interfaces) {
      if (iface.internal) continue
      if (iface.family === 'IPv4') {
        if (!isVirtual) {
          // If it's a known physical interface pattern (wi-fi, ethernet, wlan, eth, en, ep)
          const isPhysical = /wifi|wlan|ethernet|eth|en|ep|wl/i.test(nameLower)
          if (isPhysical) {
            return iface.address // Prioritize physical immediately
          }
          candidates.unshift(iface.address) // Push other physical candidate to front
        } else {
          candidates.push(iface.address) // Push virtual candidate to the back
        }
      }
    }
  }

  return candidates.length > 0 ? candidates[0] : '127.0.0.1'
}

async function renameWithRetry(src: string, dest: string, retries = 10, delay = 100): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await rename(src, dest)
      return
    } catch (err: any) {
      if (err.code === 'EPERM' || err.code === 'EBUSY') {
        await new Promise((r) => setTimeout(r, delay * Math.pow(2, i)))
      } else {
        throw err
      }
    }
  }
  await rename(src, dest)
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ─── Session Auth Middleware ─────────────────────────────────────────
// Rejects uploads without a valid session token issued during PrepareRequest.
// This is the ENFORCING gate — tokens are issued in POST /api/transfer/prepare
// and expire after 5 minutes of inactivity.
function requireSession(req: Request, res: Response, next: NextFunction): void {
  const token = (req.headers['x-hyperdrop-session'] as string)
    || (req.headers[SESSION_HEADER.toLowerCase()] as string)

  if (!token) {
    console.warn(`[httpServer] Rejected upload — no session token (${req.method} ${req.path})`)
    res.status(403).json({ error: 'Invalid or missing session token' })
    return
  }

  // Find a matching, non-expired session
  let matched = false
  for (const [, session] of sessionTokens.entries()) {
    if (session.token === token && Date.now() < session.expiresAt) {
      // Refresh expiry on activity (sliding window)
      session.expiresAt = Date.now() + 5 * 60 * 1000
      matched = true
      break
    }
  }

  if (!matched) {
    console.warn(`[httpServer] Rejected upload — invalid/expired session token (${req.method} ${req.path})`)
    res.status(403).json({ error: 'Invalid or expired session token' })
    return
  }

  next()
}

// ─── Setup ───────────────────────────────────────────────────────────
export function setupHttpServer(app: Express, myFingerprint: string, myAlias: string): void {
  app.use(cors({ origin: '*' }))
  app.use(express.json())

  // ══════════════════════════════════════════════════════════════════
  //  PROTOCOL ENDPOINTS (match native Kotlin/NanoHTTPD contract)
  // ══════════════════════════════════════════════════════════════════

  // ── GET /api/ping ─────────────────────────────────────────────────
  app.get(ENDPOINTS.PING, (_req: Request, res: Response) => {
    res.json({ status: 'ok' })
  })

  // ── GET /api/info ─────────────────────────────────────────────────
  app.get(ENDPOINTS.INFO, (_req: Request, res: Response) => {
    const info: DeviceInfo = {
      alias: myAlias,
      fingerprint: myFingerprint,
      deviceType: 'desktop',
      port: 53317,
      version: '1.0',
    }
    res.json(info)
  })

  // ── POST /api/transfer/prepare — Consent handshake ────────────────
  app.post(ENDPOINTS.PREPARE, async (req: Request, res: Response): Promise<void> => {
    try {
      const prepReq: PrepareRequest = req.body
      if (!prepReq.sessionId || !prepReq.files) {
        res.status(400).json({ error: 'Invalid PrepareRequest' })
        return
      }

      console.log(`[httpServer] Transfer request from ${prepReq.senderAlias}: ${prepReq.files.length} file(s)`)

      // For desktop companion: auto-accept (no consent UI in terminal mode)
      // In a GUI desktop app, this would show a consent dialog
      const sessionToken = randomBytes(32).toString('hex')
      sessionTokens.set(prepReq.sessionId, {
        token: sessionToken,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minute expiry
      })

      const acceptedIds = prepReq.files.map(f => f.id)

      const prepRes: PrepareResponse = {
        sessionId: prepReq.sessionId,
        accepted: true,
        acceptedFileIds: acceptedIds,
        sessionToken,
      }

      res.json(prepRes)
    } catch (err) {
      console.error('[httpServer] Prepare error:', err)
      res.status(500).json({ error: 'Prepare failed' })
    }
  })

  // ── PUT /api/chunk — Raw binary chunk upload ──────────────────────
  // requireSession middleware enforces valid session token BEFORE handler runs
  app.put(ENDPOINTS.UPLOAD_CHUNK, requireSession, async (req: Request, res: Response): Promise<void> => {
    try {
      const transferId = req.headers['x-transfer-id'] as string
      const chunkIndexStr = req.headers['x-chunk-index'] as string
      const totalChunksStr = req.headers['x-total-chunks'] as string
      const fileNameEncoded = req.headers['x-file-name'] as string
      const fileSizeStr = req.headers['x-file-size'] as string

      if (!transferId || chunkIndexStr === undefined || !totalChunksStr || !fileNameEncoded || !fileSizeStr) {
        res.status(400).json({ error: 'Missing required headers' })
        return
      }

      const chunkIdx = parseInt(chunkIndexStr, 10)
      const totalChunks = parseInt(totalChunksStr, 10)
      const fileSize = parseInt(fileSizeStr, 10)
      const fileName = basename(decodeURIComponent(fileNameEncoded))
      const offset = chunkIdx * CHUNK_SIZE

      const partPath = join(DOWNLOADS_DIR, fileName + '.part')
      const finalPath = join(DOWNLOADS_DIR, fileName)

      transferLastSeen.set(transferId, Date.now())

      // ── Initialize transfer (thread-safe for concurrent first chunks) ──
      if (!transferState.has(transferId)) {
        if (!initLocks.has(transferId)) {
          const lockPromise = (async () => {
            transferState.set(transferId, new Set<number>())
            transferMeta.set(transferId, { fileName, fileSize, totalChunks, partPath, finalPath })

            // Pre-allocate sparse file
            const allocFh = await open(partPath, 'w')
            try {
              await allocFh.truncate(fileSize)
            } finally {
              await allocFh.close()
            }

            // Open persistent write handle
            const writeFh = await open(partPath, 'r+')
            fileHandlePool.set(transferId, writeFh)
          })()
          initLocks.set(transferId, lockPromise)
        }
      }

      // Wait for init to complete
      const initLock = initLocks.get(transferId)
      if (initLock) {
        await initLock
      }

      const received = transferState.get(transferId)
      if (!received) {
        res.status(500).json({ error: 'Transfer state lost' })
        return
      }

      // Skip duplicate chunks
      if (received.has(chunkIdx)) {
        res.json({ status: 'duplicate', chunkIndex: chunkIdx })
        return
      }

      // ── Read raw body into buffer ──
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(chunk as Buffer)
      }
      const body = Buffer.concat(chunks)

      // ── Write at exact byte offset ──
      let fh = fileHandlePool.get(transferId)
      if (!fh) {
        fh = await open(partPath, 'r+')
        fileHandlePool.set(transferId, fh)
      }

      await fh.write(body, 0, body.length, offset)
      received.add(chunkIdx)

      // ── Check completion ──
      if (received.size === totalChunks) {
        const completedHandle = fileHandlePool.get(transferId)
        if (completedHandle) {
          await completedHandle.close()
          fileHandlePool.delete(transferId)
        }

        await renameWithRetry(partPath, finalPath)

        // Clean up all state
        transferState.delete(transferId)
        transferLastSeen.delete(transferId)
        transferMeta.delete(transferId)
        initLocks.delete(transferId)

        console.log(`[httpServer] Transfer complete: ${fileName} (${formatBytes(fileSize)})`)

        res.json({ status: 'complete', fileName, progress: 100 })
        return
      }

      res.json({
        status: 'ok',
        chunkIndex: chunkIdx,
        received: received.size,
        total: totalChunks,
        progress: Math.round((received.size / totalChunks) * 100),
      })
    } catch (err) {
      console.error('[httpServer] Chunk write error:', err)
      res.status(500).json({ error: 'Chunk write failed', details: String(err) })
    }
  })

  // Also handle POST for backward compat
  app.post(ENDPOINTS.UPLOAD_CHUNK, express.raw({ type: 'application/octet-stream', limit: '20mb' }), async (_req: Request, res: Response): Promise<void> => {
    res.status(400).json({ error: 'Use PUT /api/chunk with raw binary body' })
  })

  // ── GET /api/session/:id/status — resume state ────────────────────
  app.get(`${ENDPOINTS.SESSION_STATUS}/:sessionId/status`, (req: Request, res: Response) => {
    const { sessionId } = req.params
    const received = transferState.get(sessionId)
    const meta = transferMeta.get(sessionId)

    if (!received) {
      const status: SessionStatus = {
        sessionId,
        receivedChunks: [],
        totalChunks: 0,
        totalReceived: 0,
        totalSize: 0,
        status: 'unknown' as any,
      }
      res.json(status)
      return
    }

    const receivedArr = Array.from(received)
    const status: SessionStatus = {
      sessionId,
      receivedChunks: receivedArr,
      totalChunks: meta?.totalChunks ?? 0,
      totalReceived: Math.min(receivedArr.length * CHUNK_SIZE, meta?.fileSize ?? 0),
      totalSize: meta?.fileSize ?? 0,
      status: 'active',
    }
    res.json(status)
  })

  // ── GET /api/resume/:transferId — backward compat resume query ────
  app.get('/api/resume/:transferId', (req: Request, res: Response) => {
    const { transferId } = req.params
    const received = transferState.get(transferId)
    if (!received) {
      res.json({ received: [], total: 0 })
      return
    }
    res.json({
      received: Array.from(received),
      total: received.size,
    })
  })

  // ── POST /api/upload-stream — raw streaming ───────────────────────
  // requireSession middleware enforces valid session token BEFORE handler runs
  app.post(ENDPOINTS.UPLOAD_STREAM, requireSession, async (req: Request, res: Response): Promise<void> => {
    const fileName = req.headers['x-file-name'] as string
    const transferId = req.headers['x-transfer-id'] as string
    const fileSizeStr = req.headers['x-file-size'] as string

    if (!fileName || !transferId || !fileSizeStr) {
      res.status(400).json({ error: 'Missing required headers' })
      return
    }

    let fh: FileHandle | null = null
    try {
      const decodedFileName = basename(decodeURIComponent(fileName))
      const fileSize = parseInt(fileSizeStr, 10)
      const finalPath = join(DOWNLOADS_DIR, decodedFileName)
      const partPath = join(DOWNLOADS_DIR, decodedFileName + '.part')

      console.log(`[httpServer] Raw stream upload: ${decodedFileName} (${formatBytes(fileSize)})`)

      fh = await open(partPath, 'w')
      await fh.truncate(fileSize)
      await fh.close()
      fh = await open(partPath, 'r+')

      transferLastSeen.set(transferId, Date.now())

      let receivedBytes = 0

      for await (const chunk of req) {
        const buf = chunk as Buffer
        await fh.write(buf, 0, buf.length, receivedBytes)
        receivedBytes += buf.length
      }

      await fh.close()
      fh = null
      await renameWithRetry(partPath, finalPath)
      transferLastSeen.delete(transferId)

      console.log(`[httpServer] Stream upload complete: ${decodedFileName} (${formatBytes(fileSize)})`)
      res.json({ status: 'complete', fileName: decodedFileName })
    } catch (err) {
      console.error('[httpServer] Raw upload error:', err)
      if (fh) {
        try { await fh.close() } catch { /* ignore */ }
      }
      if (!res.headersSent) {
        res.status(500).json({ error: 'Upload failed', details: String(err) })
      }
    }
  })

  // ══════════════════════════════════════════════════════════════════
  //  CHAT ENDPOINTS
  // ══════════════════════════════════════════════════════════════════

  // ── POST /api/chat/send ───────────────────────────────────────────
  app.post(ENDPOINTS.CHAT_SEND, (req: Request, res: Response) => {
    try {
      const msg: ChatMessage = req.body
      chatBuffer.push({ ...msg, receivedAt: Date.now() })
      // Keep last 200 messages
      while (chatBuffer.length > 200) chatBuffer.shift()
      console.log(`[chat] Message from ${msg.senderAlias || msg.senderFingerprint?.slice(0, 8)}: ${msg.text?.slice(0, 50)}`)
      res.json({ status: 'ok' })
    } catch (err) {
      res.status(400).json({ error: 'Invalid chat message' })
    }
  })

  // ── GET /api/chat/poll ────────────────────────────────────────────
  app.get(ENDPOINTS.CHAT_POLL, (req: Request, res: Response) => {
    const since = parseInt(req.query.since as string, 10) || 0
    const messages = chatBuffer.filter(m => m.timestamp > since)
    const response: ChatPollResponse = {
      messages,
      serverTime: Date.now(),
    }
    res.json(response)
  })

  // ══════════════════════════════════════════════════════════════════
  //  CLIPBOARD ENDPOINTS
  // ══════════════════════════════════════════════════════════════════

  // ── POST /api/clipboard/sync ──────────────────────────────────────
  app.post(ENDPOINTS.CLIPBOARD_SYNC, (req: Request, res: Response) => {
    try {
      const entry: ClipboardPayload = req.body
      clipboardBuffer.push({ ...entry, receivedAt: Date.now() })
      while (clipboardBuffer.length > 50) clipboardBuffer.shift()
      console.log(`[clipboard] Sync from ${entry.senderAlias || entry.senderFingerprint?.slice(0, 8)}: ${entry.content?.slice(0, 30)}`)
      res.json({ status: 'ok' })
    } catch (err) {
      res.status(400).json({ error: 'Invalid clipboard payload' })
    }
  })

  // ── GET /api/clipboard/poll ───────────────────────────────────────
  app.get(ENDPOINTS.CLIPBOARD_POLL, (req: Request, res: Response) => {
    const since = parseInt(req.query.since as string, 10) || 0
    const entries = clipboardBuffer.filter(e => e.timestamp > since)
    const response: ClipboardPollResponse = {
      entries,
      serverTime: Date.now(),
    }
    res.json(response)
  })

  // ══════════════════════════════════════════════════════════════════
  //  DEVICES — aggregated multicast + mDNS peers
  // ══════════════════════════════════════════════════════════════════

  app.get('/api/devices', async (_req: Request, res: Response) => {
    try {
      const { getDiscoveredDevices } = await import('./discovery.js')
      const mDnsDevices = getDiscoveredDevices()

      const { getMulticastPeers } = await import('./index.js')
      const multicastPeers = getMulticastPeers()

      // Merge — multicast peers take precedence (newer protocol)
      const allDevicesMap = new Map<string, any>()
      for (const d of mDnsDevices) allDevicesMap.set(d.id, d)
      for (const p of multicastPeers) {
        allDevicesMap.set(p.fingerprint, {
          id: p.fingerprint,
          name: p.alias,
          ip: p.ip,
          port: p.port,
          platform: p.deviceType,
          lastSeen: p.lastSeen,
          source: 'multicast',
        })
      }

      // Merge Socket.IO registered devices (useful for web-to-web / normal ↔ incognito discovery)
      const { socketDevicesMap } = await import('./socketServer.js')
      for (const [id, dev] of socketDevicesMap.entries()) {
        allDevicesMap.set(id, {
          id,
          name: dev.name,
          ip: dev.ip === '127.0.0.1' || dev.ip === '::1' ? 'localhost' : dev.ip,
          port: dev.port,
          platform: dev.platform,
          lastSeen: dev.lastSeen,
          source: 'socket',
        })
      }

      res.json(Array.from(allDevicesMap.values()))
    } catch (err) {
      console.error('[httpServer] Failed to get devices:', err)
      res.json([])
    }
  })

  // ══════════════════════════════════════════════════════════════════
  //  FILE DOWNLOAD + BROWSE (unchanged from original)
  // ══════════════════════════════════════════════════════════════════

  // ── GET /download/:file — stream a file to the client ──────────
  app.get('/download/:file', (req: Request, res: Response) => {
    try {
      const fileName = decodeURIComponent(req.params.file)
      const safeFileName = basename(fileName)
      const filePath = join(DOWNLOADS_DIR, safeFileName)

      if (!existsSync(filePath) || !filePath.startsWith(DOWNLOADS_DIR)) {
        res.status(404).json({ error: 'File not found' })
        return
      }

      const stat = statSync(filePath)
      const size = stat.size
      const range = req.headers.range

      let readStream: ReturnType<typeof createReadStream>
      const isRange = !!range

      if (isRange) {
        const parts = range!.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : size - 1

        if (start >= size || end >= size || start < 0 || end < start) {
          res.status(416).setHeader('Content-Range', `bytes */${size}`)
          res.end()
          return
        }

        const chunksize = end - start + 1
        res.status(206)
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
        res.setHeader('Accept-Ranges', 'bytes')
        res.setHeader('Content-Length', chunksize)
        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFileName)}"`)
        readStream = createReadStream(filePath, { start, end, highWaterMark: 1024 * 1024 })
      } else {
        res.setHeader('Content-Length', size)
        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFileName)}"`)
        readStream = createReadStream(filePath, { highWaterMark: 1024 * 1024 })
      }

      readStream.pipe(res)

      readStream.on('error', (err) => {
        console.error('[httpServer] Download read stream error:', err)
        if (!res.headersSent) res.status(500).send('Read failed')
      })

      res.on('finish', () => {
        // no-op: download served successfully
      })
    } catch (err) {
      console.error('[httpServer] Download error:', err)
      if (!res.headersSent) res.status(500).send('Download failed')
    }
  })

  // ── GET /healthz ────────────────────────────────────────────────
  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ status: 'healthy' })
  })

  // ── GET /browse — HTML listing ──────────────────────────────────
  app.get('/browse', (_req: Request, res: Response) => {
    try {
      const files = readdirSync(DOWNLOADS_DIR)
        .filter((f) => !f.endsWith('.part') && f !== '.chunks-tmp')
        .map((f) => {
          const stat = statSync(join(DOWNLOADS_DIR, f))
          return { name: f, size: stat.size, modified: stat.mtime }
        })
        .sort((a, b) => b.modified.getTime() - a.modified.getTime())

      const ip = getLocalIp()
      const rows = files
        .map((f) => {
          const escapedName = escapeHtml(f.name)
          return `<tr>
            <td><a href="http://${ip}:53317/download/${encodeURIComponent(f.name)}">${escapedName}</a></td>
            <td>${formatBytes(f.size)}</td>
            <td>${f.modified.toLocaleString()}</td>
          </tr>`
        })
        .join('\n')

      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>HyperDrop — Files</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; background: #0a0a0a; color: #e0e0e0; }
    h1 { color: #7c3aed; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { text-align: left; padding: 0.75rem; border-bottom: 1px solid #2a2a2a; }
    th { color: #a78bfa; font-weight: 600; }
    a { color: #818cf8; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .empty { color: #666; font-style: italic; margin-top: 2rem; }
  </style>
</head>
<body>
  <h1>⚡ HyperDrop Files</h1>
  ${
    files.length > 0
      ? `<table>
          <thead><tr><th>File</th><th>Size</th><th>Modified</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`
      : '<p class="empty">No files yet. Send something via HyperDrop!</p>'
  }
</body>
</html>`)
    } catch (err) {
      console.error('[httpServer] Browse error:', err)
      res.status(500).json({ error: 'Failed to list files' })
    }
  })
}

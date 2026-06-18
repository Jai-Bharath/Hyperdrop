import express, { Express, Request, Response } from 'express'
import { Server } from 'socket.io'
import { join, basename } from 'path'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  createReadStream,
  statfsSync,
} from 'fs'
import { open, rename, FileHandle, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { networkInterfaces } from 'os'
import cors from 'cors'
import { activeTransfers } from './socketServer.js'

// ─── Constants ────────────────────────────────────────────────────────
const CHUNK_SIZE = 8 * 1024 * 1024 // 8 MB — must match client chunk size
const MIN_FREE_BYTES = 1 * 1024 * 1024 * 1024 // 1 GB minimum free space

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
}, 5 * 60 * 1000)

// ─── Helpers ─────────────────────────────────────────────────────────
export function getLocalIp(): string {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    const interfaces = nets[name]
    if (!interfaces) continue
    for (const iface of interfaces) {
      if (iface.internal) continue
      if (iface.family === 'IPv4') return iface.address
    }
  }
  return '127.0.0.1'
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

// ─── Setup ───────────────────────────────────────────────────────────
export function setupHttpServer(app: Express, io: Server): void {
  app.use(cors({ origin: '*' }))
  app.use(express.json())

  // ── PUT /api/chunk — Raw binary chunk upload (no FormData overhead) ──
  app.put('/api/chunk', async (req: Request, res: Response): Promise<void> => {
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
        // Re-open if handle was lost (shouldn't happen but be safe)
        fh = await open(partPath, 'r+')
        fileHandlePool.set(transferId, fh)
      }

      await fh.write(body, 0, body.length, offset)
      received.add(chunkIdx)

      // ── Emit progress (targeted to receiver only) ──
      const transferred = Math.min(received.size * CHUNK_SIZE, fileSize)
      const mapping = activeTransfers.get(transferId)
      if (mapping) {
        io.to(mapping.receiverSocketId).emit('transfer:progress', {
          id: transferId,
          transferred,
          speed: 0, // Client calculates its own speed
        })
      }

      // ── Check completion ──
      if (received.size === totalChunks) {
        // Close handle BEFORE rename
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

        // Emit transfer:done to both sender and receiver for reliability
        const doneMapping = activeTransfers.get(transferId)
        if (doneMapping) {
          const donePayload = {
            id: transferId,
            fileName,
            fileSize,
            downloadUrl: `/download/${encodeURIComponent(fileName)}`,
          }
          io.to(doneMapping.receiverSocketId).emit('transfer:done', donePayload)
          io.to(doneMapping.senderSocketId).emit('transfer:done', donePayload)
          console.log(`[httpServer] transfer:done emitted to receiver(${doneMapping.receiverSocketId}) and sender(${doneMapping.senderSocketId})`)
        }

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

  // Also handle POST for backward compat (multipart FormData from old clients)
  // This is a minimal shim — new clients use PUT with raw binary
  app.post('/api/chunk', express.raw({ type: 'application/octet-stream', limit: '20mb' }), async (req: Request, res: Response): Promise<void> => {
    // Redirect to PUT handler logic — but for now just return error telling client to use PUT
    res.status(400).json({ error: 'Use PUT /api/chunk with raw binary body' })
  })

  // ── GET /api/resume/:transferId — query received chunks for resume ──
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

  // ── POST /api/upload-stream — raw streaming for single-file upload ──
  app.post('/api/upload-stream', async (req: Request, res: Response): Promise<void> => {
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

      // Pre-allocate and open for writing
      fh = await open(partPath, 'w')
      await fh.truncate(fileSize)
      await fh.close()
      fh = await open(partPath, 'r+')

      transferLastSeen.set(transferId, Date.now())

      let receivedBytes = 0
      let lastProgressTime = Date.now()

      for await (const chunk of req) {
        const buf = chunk as Buffer
        await fh.write(buf, 0, buf.length, receivedBytes)
        receivedBytes += buf.length

        const now = Date.now()
        if (now - lastProgressTime > 200) {
          lastProgressTime = now
          transferLastSeen.set(transferId, now)
          const streamMapping = activeTransfers.get(transferId)
          if (streamMapping) {
            io.to(streamMapping.receiverSocketId).emit('transfer:progress', {
              id: transferId,
              transferred: receivedBytes,
              speed: 0,
            })
          }
        }
      }

      await fh.close()
      fh = null
      await renameWithRetry(partPath, finalPath)

      transferLastSeen.delete(transferId)

      const streamDoneMapping = activeTransfers.get(transferId)
      if (streamDoneMapping) {
        io.to(streamDoneMapping.receiverSocketId).emit('transfer:progress', { id: transferId, transferred: fileSize, speed: 0 })
        io.to(streamDoneMapping.receiverSocketId).emit('transfer:done', {
          id: transferId,
          fileName: decodedFileName,
          fileSize,
          downloadUrl: `/download/${encodeURIComponent(decodedFileName)}`,
        })
      }

      res.json({ status: 'complete', fileName: decodedFileName })
    } catch (err) {
      console.error('[httpServer] Raw upload error:', err)
      if (fh) {
        try { await fh.close() } catch { /* ignore */ }
      }
      io.emit('transfer:error', { id: transferId, error: 'Upload stream failed' })
      if (!res.headersSent) {
        res.status(500).json({ error: 'Upload failed', details: String(err) })
      }
    }
  })

  // ── GET /api/info — server metadata ─────────────────────────────
  app.get('/api/info', (_req: Request, res: Response) => {
    res.json({
      ip: getLocalIp(),
      port: 3001,
      ftpPort: 2121,
    })
  })

  // ── GET /api/devices — discovered LAN devices ──────────────────
  app.get('/api/devices', async (_req: Request, res: Response) => {
    try {
      const { getDiscoveredDevices } = await import('./discovery.js')
      const mDnsDevices = getDiscoveredDevices()

      const { socketDevicesMap } = await import('./socketServer.js')
      const socketDevices = Array.from(socketDevicesMap.values())

      const allDevicesMap = new Map<string, any>()
      for (const d of mDnsDevices) allDevicesMap.set(d.id, d)
      for (const d of socketDevices) allDevicesMap.set(d.id, d)

      res.json(Array.from(allDevicesMap.values()))
    } catch (err) {
      console.error('[httpServer] Failed to get devices:', err)
      res.json([])
    }
  })

  // ── GET /download/:file — stream a file to the client ──────────
  app.get('/download/:file', (req: Request, res: Response) => {
    try {
      const fileName = decodeURIComponent(req.params.file)
      const transferId = req.query.transferId as string
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

      // Don't emit transfer:done here — it's already emitted when the upload
      // completes in the chunk/stream handlers. This endpoint is just for downloads.
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
            <td><a href="http://${ip}:3001/download/${encodeURIComponent(f.name)}">${escapedName}</a></td>
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

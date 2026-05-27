import express, { Express, Request, Response } from 'express'
import { Server } from 'socket.io'
import { join, basename } from 'path'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  createReadStream,
  createWriteStream,
} from 'fs'
import { open, truncate, rename, FileHandle, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { networkInterfaces } from 'os'
import multer from 'multer'
import cors from 'cors'

// ─── Constants ────────────────────────────────────────────────────────
const CHUNK_SIZE = 8 * 1024 * 1024 // 8 MB — must match client chunk size

// Dynamically select the best downloads directory based on drive availability on Windows.
// This prevents ENOSPC crashes on tight drives (e.g. C: having 0 GB free).
function getBestDownloadsDir(): string {
  const candidates = [
    'D:\\hyperdrop-downloads',
    'E:\\hyperdrop-downloads',
    join(tmpdir(), 'hyperdrop-downloads')
  ]

  for (const dir of candidates) {
    try {
      const driveRoot = dir.substring(0, 3)
      if (existsSync(driveRoot)) {
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true })
        }
        return dir
      }
    } catch (e) {
      // Fallback if drive exists but creation fails due to permission issues
    }
  }
  return join(tmpdir(), 'hyperdrop-downloads')
}

export const DOWNLOADS_DIR = getBestDownloadsDir()

// Ensure downloads directory exists on module load
if (!existsSync(DOWNLOADS_DIR)) {
  mkdirSync(DOWNLOADS_DIR, { recursive: true })
}

// ─── Transfer state ──────────────────────────────────────────────────
// Maps transferId → Set of received chunk indices (never buffers!)
const transferState = new Map<string, Set<number>>()

// Maps transferId → Promise for atomic sparse file allocation
const pendingAllocations = new Map<string, Promise<void>>()

// Maps transferId → Timestamp of last active chunk upload
const transferLastSeen = new Map<string, number>()

// Maps transferId → persistent FileHandle (avoids open/close per chunk, reduces NTFS locking overhead)
const fileHandlePool = new Map<string, FileHandle>()

export async function closeFileHandle(transferId: string): Promise<void> {
  const fh = fileHandlePool.get(transferId)
  if (fh) {
    try {
      await fh.close()
    } catch (err) {
      console.error(`[httpServer] Error closing file handle for ${transferId}:`, err)
    }
    fileHandlePool.delete(transferId)
    console.log(`[httpServer] Closed and deleted persistent file handle for cancelled/errored transfer: ${transferId}`)
  }
}

// Pruning interval for stale / abandoned transfers
setInterval(() => {
  const now = Date.now()
  const STALE_TRANSFER_TIMEOUT = 10 * 60 * 1000 // 10 minutes
  for (const [id, lastSeen] of transferLastSeen.entries()) {
    if (now - lastSeen > STALE_TRANSFER_TIMEOUT) {
      // Close any open file handle for this pruned transfer
      const staleHandle = fileHandlePool.get(id)
      if (staleHandle) {
        staleHandle.close().catch(() => {})
        fileHandlePool.delete(id)
      }
      transferState.delete(id)
      transferLastSeen.delete(id)
      pendingAllocations.delete(id)
      console.log(`[httpServer] Pruned stale transfer state: ${id}`)
    }
  }
}, 5 * 60 * 1000) // check every 5 minutes

// ─── Multer config (memory, 20 MB limit per chunk) ───────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
})

// ─── Helpers ─────────────────────────────────────────────────────────
export function getLocalIp(): string {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    const interfaces = nets[name]
    if (!interfaces) continue
    for (const iface of interfaces) {
      // Skip internal & non-IPv4
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
        const wait = delay * Math.pow(2, i)
        await new Promise((resolve) => setTimeout(resolve, wait))
      } else {
        throw err
      }
    }
  }
  await rename(src, dest) // Final attempt to throw if it still fails
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
  // Global middleware
  app.use(cors({ origin: '*' }))
  app.use(express.json())

  // ── POST /api/chunk — streaming write engine ────────────────────
  app.post(
    '/api/chunk',
    upload.single('chunk'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const chunkData = req.file?.buffer
        if (!chunkData) {
          res.status(400).json({ error: 'No chunk data received' })
          return
        }

        const { transferId, chunkIndex, totalChunks, fileName, fileSize } =
          req.body as {
            transferId?: string
            chunkIndex?: string
            totalChunks?: string
            fileName?: string
            fileSize?: string
          }

        // Validate all required fields
        if (!transferId || chunkIndex === undefined || !totalChunks || !fileName || !fileSize) {
          res.status(400).json({ error: 'Missing required fields: transferId, chunkIndex, totalChunks, fileName, fileSize' })
          return
        }

        const chunkIdx = parseInt(chunkIndex, 10)
        const total = parseInt(totalChunks, 10)
        const size = parseInt(fileSize, 10)
        const offset = chunkIdx * CHUNK_SIZE

        // Path Traversal Security Protection
        const safeFileName = basename(fileName)
        const partPath = join(DOWNLOADS_DIR, safeFileName + '.part')
        const finalPath = join(DOWNLOADS_DIR, safeFileName)

        // Track last seen time for pruning
        transferLastSeen.set(transferId, Date.now())

        // ── First chunk for this transfer: create Set & pre-allocate file ──
        if (!transferState.has(transferId)) {
          transferState.set(transferId, new Set<number>())
          
          // Thread-safe pre-allocation lock (sparse file)
          if (!pendingAllocations.has(transferId)) {
            const allocationPromise = (async () => {
              const fh = await open(partPath, 'w')
              try {
                await fh.truncate(size)
              } finally {
                await fh.close()
              }
            })()
            pendingAllocations.set(transferId, allocationPromise)
          }
        }

        const received = transferState.get(transferId)!

        // Await sparse file pre-allocation if not yet finished
        const allocation = pendingAllocations.get(transferId)
        if (allocation) {
          await allocation
        }

        // ── Write chunk at exact byte offset (persistent handle) ─
        let fh = fileHandlePool.get(transferId)
        if (!fh) {
          fh = await open(partPath, 'r+')
          fileHandlePool.set(transferId, fh)
        }
        await fh.write(chunkData, 0, chunkData.length, offset)

        // Track this chunk
        received.add(chunkIdx)

        // ── Emit progress via Socket.IO (Aligned to client properties) ──
        const progress = Math.round((received.size / total) * 100)
        io.emit('transfer:progress', {
          id: transferId,
          transferred: received.size * CHUNK_SIZE,
          speed: 0, // speed calculated by client or relayed directly
        })

        // ── Check if transfer is complete ─────────────────────────
        if (received.size === total) {
          // Close the persistent file handle before renaming
          const completedHandle = fileHandlePool.get(transferId)
          if (completedHandle) {
            await completedHandle.close()
            fileHandlePool.delete(transferId)
          }

          // Rename .part → final name (with retry mechanism to avoid Windows EPERM locks)
          await renameWithRetry(partPath, finalPath)
          
          // Clean up state
          transferState.delete(transferId)
          pendingAllocations.delete(transferId)
          transferLastSeen.delete(transferId)

          io.emit('transfer:done', {
            id: transferId,
            fileName: safeFileName,
            fileSize: size,
            downloadUrl: `/download/${encodeURIComponent(safeFileName)}`,
          })

          res.json({ status: 'complete', fileName: safeFileName, progress: 100 })
          return
        }

        res.json({
          status: 'ok',
          chunkIndex: chunkIdx,
          receivedChunks: received.size,
          totalChunks: total,
          progress,
        })
      } catch (err) {
        console.error('[httpServer] Chunk write error:', err)
        res.status(500).json({ error: 'Chunk write failed', details: String(err) })
      }
    },
  )

  // ── POST /api/upload-stream — ultra high-speed raw streaming write engine ────────
  app.post('/api/upload-stream', async (req: Request, res: Response): Promise<void> => {
    let writeStream: ReturnType<typeof createWriteStream> | null = null
    const fileName = req.headers['x-file-name'] as string
    const transferId = req.headers['x-transfer-id'] as string
    const fileSizeStr = req.headers['x-file-size'] as string

    if (!fileName || !transferId || !fileSizeStr) {
      res.status(400).json({ error: 'Missing required headers: x-file-name, x-transfer-id, x-file-size' })
      return
    }

    try {
      const decodedFileName = decodeURIComponent(fileName)
      const size = parseInt(fileSizeStr, 10)
      const safeFileName = basename(decodedFileName)
      const finalPath = join(DOWNLOADS_DIR, safeFileName)
      const partPath = join(DOWNLOADS_DIR, safeFileName + '.part')

      console.log(`[httpServer] Starting raw stream upload for ${safeFileName} (${formatBytes(size)})`)
      
      // Create write stream directly to the .part file with 1MB highWaterMark buffer
      writeStream = createWriteStream(partPath, { highWaterMark: 1024 * 1024 })
      
      transferLastSeen.set(transferId, Date.now())
      
      let receivedBytes = 0
      let lastProgressTime = Date.now()
      
      req.on('data', (chunk) => {
        receivedBytes += chunk.length
        transferLastSeen.set(transferId, Date.now())
        
        // Throttle progress updates to 300ms intervals to prevent event loop lag
        const now = Date.now()
        if (now - lastProgressTime > 300) {
          lastProgressTime = now
          io.emit('transfer:progress', {
            id: transferId,
            transferred: receivedBytes,
            speed: 0,
          })
        }
      })

      req.pipe(writeStream)

      req.on('error', async (err) => {
        console.error(`[httpServer] Raw upload request error for ${transferId}:`, err)
        writeStream?.destroy()
        try {
          if (existsSync(partPath)) await unlink(partPath)
        } catch {}
        io.emit('transfer:error', { id: transferId, error: 'Upload stream interrupted' })
      })

      writeStream.on('error', async (err) => {
        console.error(`[httpServer] Raw upload write stream error for ${transferId}:`, err)
        req.destroy()
        try {
          if (existsSync(partPath)) await unlink(partPath)
        } catch {}
        io.emit('transfer:error', { id: transferId, error: 'Disk write failed' })
      })

      writeStream.on('finish', async () => {
        try {
          await renameWithRetry(partPath, finalPath)
          console.log(`[httpServer] Raw stream upload complete for ${safeFileName}`)
          
          transferLastSeen.delete(transferId)
          
          io.emit('transfer:done', {
            id: transferId,
            fileName: safeFileName,
            fileSize: size,
            downloadUrl: `/download/${encodeURIComponent(safeFileName)}`,
          })
          
          res.json({ status: 'complete', fileName: safeFileName })
        } catch (err) {
          console.error(`[httpServer] Error finalizing upload for ${transferId}:`, err)
          res.status(500).json({ error: 'Failed to finalize file' })
        }
      })

    } catch (err) {
      console.error('[httpServer] Raw upload initialization failed:', err)
      res.status(500).json({ error: 'Upload initialization failed', details: String(err) })
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
      // Dynamic import to avoid circular dependency at module load
      const { getDiscoveredDevices } = await import('./discovery.js')
      const mDnsDevices = getDiscoveredDevices()

      const { socketDevicesMap } = await import('./socketServer.js')
      const socketDevices = Array.from(socketDevicesMap.values())

      // Merge and deduplicate by device ID (Socket.IO active registrations override/supplement mDNS)
      const allDevicesMap = new Map<string, any>()
      for (const d of mDnsDevices) {
        allDevicesMap.set(d.id, d)
      }
      for (const d of socketDevices) {
        allDevicesMap.set(d.id, d)
      }

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
      // Path Traversal Security Protection
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
        const parts = range.replace(/bytes=/, '').split('-')
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

        // High-performance streaming segment direct from disk
        readStream = createReadStream(filePath, { start, end, highWaterMark: 1024 * 1024 })
      } else {
        res.setHeader('Content-Length', size)
        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFileName)}"`)

        // High-performance full file streaming direct from disk
        readStream = createReadStream(filePath, { highWaterMark: 1024 * 1024 })
      }

      let sentBytes = 0
      let lastProgressTime = Date.now()

      readStream.on('data', (chunk) => {
        sentBytes += chunk.length
        // Only emit progress from the server if it's NOT a parallel segmented range request.
        // Parallel range transfers are managed cumulatively by the client to prevent progress bouncing.
        if (transferId && !isRange) {
          const now = Date.now()
          if (now - lastProgressTime > 300) {
            lastProgressTime = now
            io.emit('transfer:progress', {
              id: transferId,
              transferred: sentBytes,
              speed: 0,
            })
          }
        }
      })

      readStream.pipe(res)

      readStream.on('error', (err) => {
        console.error('[httpServer] Download read stream error:', err)
        if (!res.headersSent) {
          res.status(500).send('Read failed')
        }
      })
      
      res.on('finish', () => {
        if (transferId) {
          io.emit('transfer:done', { id: transferId })
        }
      })

    } catch (err) {
      console.error('[httpServer] Download error:', err)
      if (!res.headersSent) {
        res.status(500).send('Download failed')
      }
    }
  })

  // ── GET /healthz — health check for Render ──────────────────────
  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ status: 'healthy' })
  })

  // ── GET /browse — HTML listing of all files ─────────────────────
  app.get('/browse', (_req: Request, res: Response) => {
    try {
      const files = readdirSync(DOWNLOADS_DIR)
        .filter((f) => !f.endsWith('.part')) // hide in-progress files
        .map((f) => {
          const stat = statSync(join(DOWNLOADS_DIR, f))
          return { name: f, size: stat.size, modified: stat.mtime }
        })
        .sort((a, b) => b.modified.getTime() - a.modified.getTime())

      const ip = getLocalIp()
      const rows = files
        .map(
          (f) => {
            const escapedName = escapeHtml(f.name)
            return `<tr>
              <td><a href="http://${ip}:3001/download/${encodeURIComponent(f.name)}">${escapedName}</a></td>
              <td>${formatBytes(f.size)}</td>
              <td>${f.modified.toLocaleString()}</td>
            </tr>`
          },
        )
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

/**
 * HyperDrop Parallel Chunk Upload Engine v2
 * 
 * HIGH-PERFORMANCE raw binary upload — NO FormData overhead.
 * Uses PUT with raw ArrayBuffer body for zero-copy browser-to-server streaming.
 * 
 * Architecture:
 * - 8MB chunks (optimal for modern WiFi throughput — fewer round trips)
 * - 8 parallel upload streams (saturates 802.11ac bandwidth)
 * - Raw binary body (no multipart boundary parsing overhead)
 * - Real-time speed tracking from first byte (no more "CALCULATING...")
 * - Automatic retry with exponential backoff (3 attempts per chunk)
 * - Server-checkpoint resume via GET /api/resume/:transferId
 * - AbortController for instant cancellation
 */

// ── Configuration ────────────────────────────────────────────
const CHUNK_SIZE = 8 * 1024 * 1024;        // 8 MB chunks — fewer HTTP round trips
const MAX_PARALLEL = 6;                     // concurrent uploads — aggressive for LAN transfers
const MAX_RETRIES = 5;                      // retries per chunk (extra for background tabs)
const RETRY_BASE_DELAY_MS = 500;            // exponential backoff base (forgiving for bg throttling)
const PROGRESS_THROTTLE_MS = 150;           // progress callback throttle

// ── Types ────────────────────────────────────────────────────
export interface UploadProgress {
  transferred: number;
  speed: number;
  chunksCompleted: number;
  chunksTotal: number;
  percentComplete: number;
}

export interface ParallelUploadOptions {
  file: File;
  baseUrl: string;
  transferId: string;
  /** Session token from PrepareResponse — required for server auth */
  sessionToken?: string;
  onProgress: (progress: UploadProgress) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
  /** Resume: skip chunks already received by server */
  skipChunks?: Set<number>;
}

// ── Speed Tracker (accurate from first byte) ─────────────────
class SpeedTracker {
  private windowBytes = 0;
  private windowStart = 0;
  private totalBytes = 0;
  private lastSpeed = 0;
  private readonly windowMs = 1500; // 1.5s rolling window

  constructor(initialBytes = 0) {
    this.totalBytes = initialBytes;
    this.windowStart = Date.now();
  }

  addBytes(bytes: number): void {
    const now = Date.now();
    this.totalBytes += bytes;
    this.windowBytes += bytes;

    const elapsed = now - this.windowStart;
    if (elapsed >= this.windowMs) {
      this.lastSpeed = (this.windowBytes / elapsed) * 1000;
      this.windowBytes = 0;
      this.windowStart = now;
    }
  }

  getSpeed(): number {
    // If window hasn't closed yet, compute instantaneous speed
    if (this.lastSpeed === 0 && this.windowBytes > 0) {
      const elapsed = Date.now() - this.windowStart;
      if (elapsed > 100) {
        return (this.windowBytes / elapsed) * 1000;
      }
    }
    return this.lastSpeed;
  }

  getTotal(): number {
    return this.totalBytes;
  }
}

// ── Chunk Creator ────────────────────────────────────────────
interface ChunkInfo {
  index: number;
  start: number;
  end: number;
  size: number;
}

function createChunkList(fileSize: number): ChunkInfo[] {
  const chunks: ChunkInfo[] = [];
  let start = 0;
  let index = 0;
  while (start < fileSize) {
    const end = Math.min(start + CHUNK_SIZE, fileSize);
    chunks.push({ index, start, end, size: end - start });
    start = end;
    index++;
  }
  return chunks;
}

// ── Single Chunk Upload (Raw Binary — NO FormData) ───────────
async function uploadChunk(
  file: File,
  chunk: ChunkInfo,
  baseUrl: string,
  transferId: string,
  totalChunks: number,
  signal?: AbortSignal,
  sessionToken?: string,
): Promise<void> {
  // Slice the raw bytes — no FormData wrapper
  const blob = file.slice(chunk.start, chunk.end);

  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'X-Transfer-Id': transferId,
    'X-Chunk-Index': String(chunk.index),
    'X-Total-Chunks': String(totalChunks),
    'X-File-Name': encodeURIComponent(file.name),
    'X-File-Size': String(file.size),
  };

  // Attach session token if available (required by server auth)
  if (sessionToken) {
    headers['X-HyperDrop-Session'] = sessionToken;
  }

  const response = await fetch(`${baseUrl}/api/chunk`, {
    method: 'PUT',
    headers,
    body: blob,
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Chunk ${chunk.index} failed: ${response.status} ${errorText}`);
  }
}

// ── Retry Wrapper ────────────────────────────────────────────
async function uploadChunkWithRetry(
  file: File,
  chunk: ChunkInfo,
  baseUrl: string,
  transferId: string,
  totalChunks: number,
  signal?: AbortSignal,
  sessionToken?: string,
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (signal?.aborted) {
        throw new DOMException('Upload aborted', 'AbortError');
      }
      await uploadChunk(file, chunk, baseUrl, transferId, totalChunks, signal, sessionToken);
      return; // Success
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error(`Chunk ${chunk.index} failed after ${MAX_RETRIES} retries`);
}

// ── Query Resume State ───────────────────────────────────────
async function getReceivedChunks(
  baseUrl: string,
  transferId: string,
): Promise<Set<number>> {
  try {
    const response = await fetch(`${baseUrl}/api/resume/${transferId}`);
    if (!response.ok) return new Set();
    const data = await response.json();
    return new Set(data.received || []);
  } catch {
    return new Set();
  }
}

// ── Main Parallel Upload Engine ──────────────────────────────
async function doUpload(options: ParallelUploadOptions): Promise<void> {
  const { file, baseUrl, transferId, sessionToken, onProgress, onComplete, onError, signal } = options;

  // Listen for visibility changes — log but do NOT pause the transfer
  const onVisibilityChange = () => {
    if (document.hidden) {
      console.log(`[parallelChunkUploader] Tab hidden during transfer ${transferId} — continuing upload`);
    } else {
      console.log(`[parallelChunkUploader] Tab visible again for transfer ${transferId}`);
    }
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  try {
    // Create chunk list
    const allChunks = createChunkList(file.size);
    const totalChunks = allChunks.length;

    // Check for resume state
    let skipChunks = options.skipChunks || new Set<number>();
    if (skipChunks.size === 0) {
      skipChunks = await getReceivedChunks(baseUrl, transferId);
    }

    // Filter out already-completed chunks
    const pendingChunks = allChunks.filter((c) => !skipChunks.has(c.index));

    if (pendingChunks.length === 0) {
      onProgress({
        transferred: file.size,
        speed: 0,
        chunksCompleted: totalChunks,
        chunksTotal: totalChunks,
        percentComplete: 100,
      });
      onComplete();
      return;
    }

    // Speed tracker — pre-seed with already-transferred bytes
    const alreadyTransferred = Array.from(skipChunks).reduce((sum, idx) => {
      const chunk = allChunks[idx];
      return sum + (chunk ? chunk.size : CHUNK_SIZE);
    }, 0);
    const speed = new SpeedTracker(Math.min(alreadyTransferred, file.size));

    let completedCount = skipChunks.size;
    const chunkQueue = [...pendingChunks];
    let activeUploads = 0;
    let hasErrored = false;
    let lastProgressTime = 0;

    // Report initial progress
    onProgress({
      transferred: Math.min(alreadyTransferred, file.size),
      speed: 0,
      chunksCompleted: completedCount,
      chunksTotal: totalChunks,
      percentComplete: Math.round((completedCount / totalChunks) * 100),
    });

    // Process chunks with parallel worker pool
    await new Promise<void>((resolve, reject) => {
      function emitProgress() {
        const now = Date.now();
        if (now - lastProgressTime < PROGRESS_THROTTLE_MS) return;
        lastProgressTime = now;

        const transferred = Math.min(speed.getTotal(), file.size);
        onProgress({
          transferred,
          speed: speed.getSpeed(),
          chunksCompleted: completedCount,
          chunksTotal: totalChunks,
          percentComplete: Math.round((completedCount / totalChunks) * 100),
        });
      }

      function processNext() {
        if (hasErrored) return;
        if (signal?.aborted) {
          hasErrored = true;
          reject(new DOMException('Upload aborted', 'AbortError'));
          return;
        }

        while (activeUploads < MAX_PARALLEL && chunkQueue.length > 0) {
          const chunk = chunkQueue.shift()!;
          activeUploads++;

          uploadChunkWithRetry(file, chunk, baseUrl, transferId, totalChunks, signal, sessionToken)
            .then(() => {
              if (hasErrored) return;
              activeUploads--;
              completedCount++;

              speed.addBytes(chunk.size);
              emitProgress();

              // Check if all done
              if (completedCount >= totalChunks) {
                // Final progress at 100%
                onProgress({
                  transferred: file.size,
                  speed: speed.getSpeed(),
                  chunksCompleted: totalChunks,
                  chunksTotal: totalChunks,
                  percentComplete: 100,
                });
                resolve();
              } else {
                processNext();
              }
            })
            .catch((err) => {
              if (hasErrored) return;
              hasErrored = true;
              activeUploads--;
              reject(err);
            });
        }
      }

      processNext();
    });

    onComplete();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      onError(new DOMException('Transfer cancelled', 'AbortError'));
    } else {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  } finally {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  }
}

// ── Public Entry Point (with Web Lock + Background Guard) ────
export async function uploadFileParallel(options: ParallelUploadOptions): Promise<void> {
  // Acquire background guard to prevent tab throttling
  const { BackgroundGuard } = await import('./backgroundGuard');
  const guard = BackgroundGuard.acquire(options.transferId);

  try {
    // Acquire a Web Lock to prevent browser from freezing this tab's network
    const lockName = `hyperdrop-transfer-${options.transferId}`;
    const hasLocks = typeof navigator !== 'undefined' && 'locks' in navigator;

    if (hasLocks) {
      try {
        await navigator.locks.request(lockName, { mode: 'exclusive' }, async () => {
          await doUpload(options);
        });
      } catch {
        // Fallback: run without lock (e.g. insecure context)
        await doUpload(options);
      }
    } else {
      await doUpload(options);
    }
  } finally {
    guard.release();
  }
}

// Re-export chunk size for server sync
export { CHUNK_SIZE };

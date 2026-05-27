/**
 * High-speed In-App Parallel HTTP Downloader Engine for HyperDrop.
 *
 * Bypasses single-connection browser throttling by splitting the download into
 * 4 concurrent streams fetching separate segments via HTTP 'Range' headers.
 * Each stream downloads block-by-block (4MB) to allow ultra-fine-grained
 * progress tracking and real-time speed calculation.
 */

const PARALLEL_STREAMS = 6;
const BLOCK_SIZE = 8 * 1024 * 1024; // 8 MB blocks for granular progress tracking
const SPEED_INTERVAL_MS = 500;

interface DownloadProgressCallback {
  (received: number, speed: number): void;
}

/**
 * Downloads a file in parallel using 4 concurrent range streams.
 * Works natively in secure or insecure contexts (HTTP/HTTPS) as long as
 * the server supports HTTP Range requests (our Express backend does!).
 */
export async function downloadFileParallel(
  fileName: string,
  fileSize: number,
  downloadUrl: string,
  onProgress: DownloadProgressCallback,
  onComplete: (blobUrl: string) => void,
  onError: (err: Error) => void,
  signal?: AbortSignal
): Promise<void> {
  const segmentSize = Math.floor(fileSize / PARALLEL_STREAMS);
  
  // Array to hold all downloaded blocks in the correct index order
  // Total blocks across all segments:
  const blocksMap = new Map<number, ArrayBuffer>();
  
  let totalBytesReceived = 0;
  let lastMeasuredBytes = 0;
  let lastMeasuredTime = Date.now();
  let currentSpeed = 0;
  let hasErrored = false;

  // Real-time speed measurement timer
  const speedTimer = setInterval(() => {
    const now = Date.now();
    const elapsed = (now - lastMeasuredTime) / 1000;
    if (elapsed > 0) {
      currentSpeed = (totalBytesReceived - lastMeasuredBytes) / elapsed;
      lastMeasuredBytes = totalBytesReceived;
      lastMeasuredTime = now;
    }
    onProgress(totalBytesReceived, currentSpeed);
  }, SPEED_INTERVAL_MS);

  /**
   * Helper to download a specific block in a segment
   */
  async function downloadBlock(
    globalBlockIndex: number,
    startByte: number,
    endByte: number
  ): Promise<ArrayBuffer> {
    if (signal?.aborted) {
      throw new DOMException('Download cancelled', 'AbortError');
    }

    const response = await fetch(downloadUrl, {
      headers: {
        Range: `bytes=${startByte}-${endByte}`,
      },
      signal,
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Server returned status ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    
    totalBytesReceived += arrayBuffer.byteLength;
    return arrayBuffer;
  }

  /**
   * Worker responsible for downloading one of the 4 equal segments of the file.
   */
  async function downloadSegment(
    segmentIndex: number,
    startByte: number,
    endByte: number
  ): Promise<void> {
    const totalSegmentBytes = endByte - startByte + 1;
    const blocksInSegment = Math.ceil(totalSegmentBytes / BLOCK_SIZE);
    
    // Each segment starts with a specific global block index offset to preserve order
    const globalOffset = segmentIndex * Math.ceil(fileSize / PARALLEL_STREAMS / BLOCK_SIZE);

    for (let b = 0; b < blocksInSegment; b++) {
      if (hasErrored || signal?.aborted) return;

      const blockStart = startByte + b * BLOCK_SIZE;
      const blockEnd = Math.min(blockStart + BLOCK_SIZE - 1, endByte);
      const globalIndex = globalOffset + b;

      try {
        const data = await downloadBlock(globalIndex, blockStart, blockEnd);
        blocksMap.set(globalIndex, data);
      } catch (err) {
        if (!hasErrored) {
          hasErrored = true;
          throw err;
        }
        return;
      }
    }
  }

  try {
    // Launch 4 concurrent segment download workers
    const workers: Promise<void>[] = [];

    for (let i = 0; i < PARALLEL_STREAMS; i++) {
      const start = i * segmentSize;
      const end = i === PARALLEL_STREAMS - 1 ? fileSize - 1 : (i + 1) * segmentSize - 1;
      
      workers.push(downloadSegment(i, start, end));
    }

    await Promise.all(workers);

    clearInterval(speedTimer);

    if (signal?.aborted) {
      throw new DOMException('Download cancelled', 'AbortError');
    }

    // Reconstruct the full file from blocksMap in ascending global index order
    const sortedBlockIndices = Array.from(blocksMap.keys()).sort((a, b) => a - b);
    const orderedChunks: ArrayBuffer[] = [];
    
    for (const idx of sortedBlockIndices) {
      const chunk = blocksMap.get(idx);
      if (chunk) {
        orderedChunks.push(chunk);
      }
    }

    // Free the blocksMap references for GC
    blocksMap.clear();

    // Create the final stitched Blob
    const finalBlob = new Blob(orderedChunks, { type: 'application/octet-stream' });
    const finalBlobUrl = URL.createObjectURL(finalBlob);

    onComplete(finalBlobUrl);
  } catch (err) {
    clearInterval(speedTimer);
    hasErrored = true;

    if (err instanceof DOMException && err.name === 'AbortError') {
      return;
    }

    const error = err instanceof Error ? err : new Error('Unknown parallel download error');
    onError(error);
  }
}

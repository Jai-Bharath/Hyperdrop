import { splitFileIntoChunks, calculateTotalChunks } from './chunkEngine';
import { computeChecksum } from '../utils/checksum';

/** Maximum retry attempts per chunk */
const MAX_RETRIES = 3;

/** Speed measurement interval in milliseconds */
const SPEED_INTERVAL_MS = 500;

/**
 * Send a file using single-stream sequential HTTP POST.
 * Fallback protocol for weak connections (~5-15 MB/s).
 *
 * Same FormData format and checksum as parallelFetchEngine,
 * but sends ONE chunk at a time for maximum reliability.
 */
export async function sendFileHttp(
  file: File,
  targetIp: string,
  targetPort: number,
  transferId: string,
  onProgress: (sent: number, speed: number) => void,
  onComplete: () => void,
  onError: (err: Error) => void,
  signal?: AbortSignal,
): Promise<void> {
  const chunks = splitFileIntoChunks(file);
  const totalChunks = calculateTotalChunks(file.size);
  const url = `http://${targetIp}:${targetPort}/api/chunk`;

  let totalBytesSent = 0;
  let lastMeasuredBytes = 0;
  let lastMeasuredTime = Date.now();
  let currentSpeed = 0;

  // Speed measurement timer (throttled to 500ms)
  const speedTimer = setInterval(() => {
    const now = Date.now();
    const elapsed = (now - lastMeasuredTime) / 1000;
    if (elapsed > 0) {
      currentSpeed = (totalBytesSent - lastMeasuredBytes) / elapsed;
      lastMeasuredBytes = totalBytesSent;
      lastMeasuredTime = now;
    }
    onProgress(totalBytesSent, currentSpeed);
  }, SPEED_INTERVAL_MS);

  try {
    for (const chunk of chunks) {
      if (signal?.aborted) {
        throw new DOMException('Transfer cancelled', 'AbortError');
      }

      const arrayBuffer = await chunk.blob.arrayBuffer();
      const checksum = await computeChecksum(arrayBuffer);

      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (signal?.aborted) {
          throw new DOMException('Transfer cancelled', 'AbortError');
        }

        try {
          const formData = new FormData();
          formData.append('transferId', transferId);
          formData.append('chunkIndex', String(chunk.index));
          formData.append('totalChunks', String(totalChunks));
          formData.append('fileName', file.name);
          formData.append('fileSize', String(file.size));
          formData.append('checksum', checksum);
          formData.append('chunk', chunk.blob, file.name);

          const response = await fetch(url, {
            method: 'POST',
            body: formData,
            signal,
          });

          if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
          }

          // Success
          totalBytesSent += chunk.blob.size;
          lastError = null;
          break;
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            throw err;
          }

          lastError = err instanceof Error
            ? err
            : new Error(`Chunk ${chunk.index} failed`);

          if (attempt < MAX_RETRIES) {
            // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 200));
          }
        }
      }

      if (lastError) {
        throw lastError;
      }
    }

    // Done — final progress
    clearInterval(speedTimer);
    const totalElapsed = (Date.now() - lastMeasuredTime) / 1000 || 1;
    const finalSpeed = (totalBytesSent - lastMeasuredBytes) / totalElapsed;
    onProgress(totalBytesSent, finalSpeed > 0 ? finalSpeed : currentSpeed);

    onComplete();
  } catch (err) {
    clearInterval(speedTimer);

    if (err instanceof DOMException && err.name === 'AbortError') {
      return;
    }

    const error = err instanceof Error ? err : new Error('Unknown transfer error');
    onError(error);
  }
}

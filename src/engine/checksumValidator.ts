/**
 * SHA-256 Checksum Validator for HyperDrop.
 *
 * Provides fast chunk-level integrity validation using the Web Crypto API.
 * Corrupted chunks are automatically detected and re-requested.
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface ChunkValidation {
  /** Chunk index */
  index: number;
  /** Expected SHA-256 hash (hex string) */
  expected: string;
  /** Actual computed hash */
  actual: string;
  /** Whether the chunk passed validation */
  valid: boolean;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of an ArrayBuffer.
 * Uses the Web Crypto API for hardware-accelerated hashing.
 */
export async function computeSHA256(data: ArrayBuffer): Promise<string> {
  // Use Web Crypto API (available in all modern browsers and Node.js 15+)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return arrayBufferToHex(hashBuffer);
  }

  // Fallback: simple FNV-1a hash (not cryptographic, but catches corruption)
  return fallbackHash(data);
}

/**
 * Compute SHA-256 hash of a Blob.
 */
export async function computeBlobSHA256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  return computeSHA256(buffer);
}

/**
 * Validate a chunk against an expected checksum.
 */
export async function validateChunk(
  chunkIndex: number,
  data: ArrayBuffer,
  expectedHash: string,
): Promise<ChunkValidation> {
  const actual = await computeSHA256(data);
  return {
    index: chunkIndex,
    expected: expectedHash,
    actual,
    valid: actual === expectedHash,
  };
}

/**
 * Validate multiple chunks in batch.
 * Returns only the failed validations (for re-request).
 */
export async function validateChunkBatch(
  chunks: Array<{ index: number; data: ArrayBuffer; expectedHash: string }>,
): Promise<ChunkValidation[]> {
  const results = await Promise.all(
    chunks.map((c) => validateChunk(c.index, c.data, c.expectedHash)),
  );
  return results.filter((r) => !r.valid);
}

/**
 * Compute checksums for a File split into chunks.
 * Returns a map of chunkIndex → SHA-256 hex string.
 */
export async function computeFileChecksums(
  file: File,
  chunkSize: number,
): Promise<Map<number, string>> {
  const checksums = new Map<number, string>();
  const totalChunks = Math.ceil(file.size / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const blob = file.slice(start, end);
    const buffer = await blob.arrayBuffer();
    const hash = await computeSHA256(buffer);
    checksums.set(i, hash);
  }

  return checksums;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Convert an ArrayBuffer to a hex string.
 */
function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const hexChars: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    hexChars[i] = bytes[i].toString(16).padStart(2, '0');
  }
  return hexChars.join('');
}

/**
 * Fallback non-cryptographic hash for environments without Web Crypto.
 * Uses FNV-1a algorithm — good for corruption detection, not security.
 */
function fallbackHash(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  // Return as zero-padded hex string
  return (hash >>> 0).toString(16).padStart(8, '0');
}

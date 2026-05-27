/**
 * Core chunking engine for HyperDrop.
 *
 * Binary data (Blobs) lives here at module level — NEVER in Zustand store.
 * Zustand only stores metadata (ChunkProgress with numeric fields).
 */

/** Size of each chunk: 8 MB */
export const CHUNK_SIZE = 8 * 1024 * 1024;

/** Number of parallel upload streams */
export const PARALLEL = 6;

export interface ChunkDescriptor {
  /** Zero-based chunk index */
  index: number;
  /** Blob slice of the original file */
  blob: Blob;
  /** Byte offset in the original file */
  offset: number;
}

/**
 * Split a File into CHUNK_SIZE blobs with index and byte offset metadata.
 * Binary data stays in module scope — callers should not persist these Blobs in state.
 */
export function splitFileIntoChunks(file: File): ChunkDescriptor[] {
  const chunks: ChunkDescriptor[] = [];
  const totalChunks = calculateTotalChunks(file.size);

  for (let i = 0; i < totalChunks; i++) {
    const offset = i * CHUNK_SIZE;
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const blob = file.slice(offset, end);

    chunks.push({ index: i, blob, offset });
  }

  return chunks;
}

/**
 * Calculate the total number of chunks needed for a file of a given size.
 */
export function calculateTotalChunks(fileSize: number): number {
  if (fileSize <= 0) return 0;
  return Math.ceil(fileSize / CHUNK_SIZE);
}

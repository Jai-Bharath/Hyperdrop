/**
 * Core chunking engine for HyperDrop.
 *
 * Binary data (Blobs) lives here at module level — NEVER in Zustand store.
 * Zustand only stores metadata (ChunkProgress with numeric fields).
 *
 * Supports adaptive chunk sizing based on network conditions.
 */

import type { AdaptiveConfig } from './adaptiveChunker';

// ─── Defaults ─────────────────────────────────────────────────────────

/** Default chunk size: 8 MB (overridable via AdaptiveConfig) */
export const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;

/** Default parallel upload streams (overridable via AdaptiveConfig) */
export const DEFAULT_PARALLEL = 6;

// ─── Mutable runtime config ──────────────────────────────────────────

let activeChunkSize = DEFAULT_CHUNK_SIZE;
let activeParallel = DEFAULT_PARALLEL;

/**
 * Apply an adaptive configuration to the chunk engine.
 * Call this before starting a transfer.
 */
export function applyAdaptiveConfig(config: AdaptiveConfig): void {
  activeChunkSize = config.chunkSize;
  activeParallel = config.parallelStreams;
  console.log(
    `[chunkEngine] Adaptive config applied: ${(activeChunkSize / 1024 / 1024).toFixed(1)} MB chunks × ${activeParallel} streams (${config.tierLabel})`
  );
}

/**
 * Get the currently active chunk size.
 */
export function getChunkSize(): number {
  return activeChunkSize;
}

/**
 * Get the currently active parallel stream count.
 */
export function getParallel(): number {
  return activeParallel;
}

// ─── Legacy exports for backward compatibility ───────────────────────
export const CHUNK_SIZE = DEFAULT_CHUNK_SIZE;
export const PARALLEL = DEFAULT_PARALLEL;

// ─── Types ────────────────────────────────────────────────────────────

export interface ChunkDescriptor {
  /** Zero-based chunk index */
  index: number;
  /** Blob slice of the original file */
  blob: Blob;
  /** Byte offset in the original file */
  offset: number;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Split a File into chunks with index and byte offset metadata.
 * Uses the active chunk size (set via applyAdaptiveConfig or default 8 MB).
 * Binary data stays in module scope — callers should not persist these Blobs in state.
 *
 * @param file - The file to split
 * @param chunkSize - Optional override chunk size (uses active config if not provided)
 */
export function splitFileIntoChunks(file: File, chunkSize?: number): ChunkDescriptor[] {
  const size = chunkSize || activeChunkSize;
  const chunks: ChunkDescriptor[] = [];
  const totalChunks = calculateTotalChunks(file.size, size);

  for (let i = 0; i < totalChunks; i++) {
    const offset = i * size;
    const end = Math.min(offset + size, file.size);
    const blob = file.slice(offset, end);

    chunks.push({ index: i, blob, offset });
  }

  return chunks;
}

/**
 * Split a File into chunks, but only return the chunks at the specified indices.
 * Used for resumable transfers — only re-send missing chunks.
 *
 * @param file - The file to split
 * @param indices - Chunk indices to extract
 * @param chunkSize - Optional override chunk size
 */
export function splitFileAtIndices(
  file: File,
  indices: number[],
  chunkSize?: number,
): ChunkDescriptor[] {
  const size = chunkSize || activeChunkSize;
  const chunks: ChunkDescriptor[] = [];

  for (const index of indices) {
    const offset = index * size;
    const end = Math.min(offset + size, file.size);
    const blob = file.slice(offset, end);
    chunks.push({ index, blob, offset });
  }

  return chunks;
}

/**
 * Calculate the total number of chunks needed for a file of a given size.
 *
 * @param fileSize - File size in bytes
 * @param chunkSize - Optional override chunk size (uses active config if not provided)
 */
export function calculateTotalChunks(fileSize: number, chunkSize?: number): number {
  if (fileSize <= 0) return 0;
  const size = chunkSize || activeChunkSize;
  return Math.ceil(fileSize / size);
}

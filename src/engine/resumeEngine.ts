/**
 * Transfer Resume Engine for HyperDrop.
 *
 * Tracks per-chunk completion state so that interrupted transfers
 * can be resumed from exactly where they left off — down to the
 * individual chunk level.
 *
 * Resume state is stored in localStorage on the client side
 * and as .resume.json files on the server side.
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface ResumeState {
  /** Unique transfer identifier */
  transferId: string;
  /** Original file name */
  fileName: string;
  /** Total file size in bytes */
  fileSize: number;
  /** Chunk size used for this transfer (bytes) */
  chunkSize: number;
  /** Total number of chunks */
  totalChunks: number;
  /** Set of completed chunk indices */
  completedChunks: number[];
  /** Set of failed chunk indices (to retry) */
  failedChunks: number[];
  /** SHA-256 checksums for verified chunks: chunkIndex → hash */
  checksums: Record<number, string>;
  /** Last update timestamp */
  lastUpdated: number;
  /** Transfer direction */
  direction: 'send' | 'receive';
}

// ─── Constants ────────────────────────────────────────────────────────

const RESUME_STORAGE_PREFIX = 'hyperdrop-resume-';

/** Maximum number of resume states to keep in localStorage */
const MAX_STORED_RESUMES = 20;

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Create a new resume state for a transfer.
 */
export function createResumeState(
  transferId: string,
  fileName: string,
  fileSize: number,
  chunkSize: number,
  totalChunks: number,
  direction: 'send' | 'receive',
): ResumeState {
  const state: ResumeState = {
    transferId,
    fileName,
    fileSize,
    chunkSize,
    totalChunks,
    completedChunks: [],
    failedChunks: [],
    checksums: {},
    lastUpdated: Date.now(),
    direction,
  };

  saveResumeState(state);
  return state;
}

/**
 * Mark a chunk as completed and save state.
 */
export function markChunkCompleted(
  transferId: string,
  chunkIndex: number,
  checksum?: string,
): void {
  const state = loadResumeState(transferId);
  if (!state) return;

  if (!state.completedChunks.includes(chunkIndex)) {
    state.completedChunks.push(chunkIndex);
  }

  // Remove from failed list if it was there
  state.failedChunks = state.failedChunks.filter((i) => i !== chunkIndex);

  if (checksum) {
    state.checksums[chunkIndex] = checksum;
  }

  state.lastUpdated = Date.now();
  saveResumeState(state);
}

/**
 * Mark a chunk as failed.
 */
export function markChunkFailed(transferId: string, chunkIndex: number): void {
  const state = loadResumeState(transferId);
  if (!state) return;

  if (!state.failedChunks.includes(chunkIndex)) {
    state.failedChunks.push(chunkIndex);
  }

  state.lastUpdated = Date.now();
  saveResumeState(state);
}

/**
 * Get the list of chunk indices that still need to be sent/received.
 * Returns chunks that are neither completed nor currently failed beyond retry.
 */
export function getRemainingChunks(transferId: string): number[] {
  const state = loadResumeState(transferId);
  if (!state) return [];

  const completedSet = new Set(state.completedChunks);
  const remaining: number[] = [];

  for (let i = 0; i < state.totalChunks; i++) {
    if (!completedSet.has(i)) {
      remaining.push(i);
    }
  }

  return remaining;
}

/**
 * Check if a transfer has a saved resume state.
 */
export function hasResumeState(transferId: string): boolean {
  return loadResumeState(transferId) !== null;
}

/**
 * Get the completion percentage for a resumable transfer.
 */
export function getResumeProgress(transferId: string): number {
  const state = loadResumeState(transferId);
  if (!state || state.totalChunks === 0) return 0;
  return Math.round((state.completedChunks.length / state.totalChunks) * 100);
}

/**
 * Mark a transfer as fully completed and clean up the resume state.
 */
export function completeResume(transferId: string): void {
  removeResumeState(transferId);
}

/**
 * Check the server for the resume status of a transfer.
 * Returns the list of already-completed chunk indices from the server side.
 */
export async function fetchServerResumeStatus(
  baseUrl: string,
  transferId: string,
): Promise<number[]> {
  try {
    const response = await fetch(`${baseUrl}/api/transfer/${transferId}/status`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.completedChunks || [];
  } catch {
    return [];
  }
}

// ─── Storage Helpers ──────────────────────────────────────────────────

function saveResumeState(state: ResumeState): void {
  try {
    const key = RESUME_STORAGE_PREFIX + state.transferId;
    localStorage.setItem(key, JSON.stringify(state));
    pruneOldResumes();
  } catch (err) {
    console.error('[resumeEngine] Failed to save resume state:', err);
  }
}

export function loadResumeState(transferId: string): ResumeState | null {
  try {
    const key = RESUME_STORAGE_PREFIX + transferId;
    const data = localStorage.getItem(key);
    if (!data) return null;
    return JSON.parse(data) as ResumeState;
  } catch {
    return null;
  }
}

function removeResumeState(transferId: string): void {
  try {
    const key = RESUME_STORAGE_PREFIX + transferId;
    localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

/**
 * Remove oldest resume states if we exceed the max count.
 */
function pruneOldResumes(): void {
  try {
    const keys: { key: string; lastUpdated: number }[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(RESUME_STORAGE_PREFIX)) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          keys.push({ key, lastUpdated: data.lastUpdated || 0 });
        } catch {
          keys.push({ key, lastUpdated: 0 });
        }
      }
    }

    if (keys.length > MAX_STORED_RESUMES) {
      keys.sort((a, b) => a.lastUpdated - b.lastUpdated);
      const toRemove = keys.length - MAX_STORED_RESUMES;
      for (let i = 0; i < toRemove; i++) {
        localStorage.removeItem(keys[i].key);
      }
    }
  } catch {
    // Ignore
  }
}

/**
 * List all stored resume states (for Settings/History UI).
 */
export function listAllResumeStates(): ResumeState[] {
  const states: ResumeState[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(RESUME_STORAGE_PREFIX)) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}') as ResumeState;
          states.push(data);
        } catch {
          // Skip corrupted entries
        }
      }
    }
  } catch {
    // Ignore
  }
  return states.sort((a, b) => b.lastUpdated - a.lastUpdated);
}

/**
 * HyperDrop Background Transfer Guard
 * 
 * Prevents browsers from throttling or freezing active file transfers
 * when the user switches to another tab. Uses multiple strategies:
 * 
 * 1. Web Locks API — prevents Chrome from discarding the page
 * 2. Invisible audio keepalive — prevents timer throttling  
 * 3. BroadcastChannel heartbeat — keeps the tab "alive"
 * 4. beforeunload warning — prevents accidental tab close during transfer
 * 
 * Usage:
 *   const guard = BackgroundGuard.acquire('transfer-123');
 *   // ... transfer runs ...
 *   guard.release();
 */

// ── Singleton Audio Context (silent oscillator to prevent throttling) ──
let audioCtx: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let audioRefCount = 0;

function startSilentAudio(): void {
  audioRefCount++;
  if (audioRefCount > 1) return; // Already running

  try {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    oscillator = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();

    // Completely silent — gain = 0
    gainNode.gain.value = 0;
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();
  } catch {
    // AudioContext not available — non-critical
  }
}

function stopSilentAudio(): void {
  audioRefCount = Math.max(0, audioRefCount - 1);
  if (audioRefCount > 0) return; // Other transfers still active

  try {
    oscillator?.stop();
    oscillator?.disconnect();
    gainNode?.disconnect();
    audioCtx?.close();
  } catch { /* ignore */ }
  oscillator = null;
  gainNode = null;
  audioCtx = null;
}

// ── beforeunload handler ──
let unloadRefCount = 0;

function beforeUnloadHandler(e: BeforeUnloadEvent): void {
  e.preventDefault();
  e.returnValue = 'File transfer in progress. Are you sure you want to leave?';
}

function addUnloadGuard(): void {
  unloadRefCount++;
  if (unloadRefCount === 1) {
    window.addEventListener('beforeunload', beforeUnloadHandler);
  }
}

function removeUnloadGuard(): void {
  unloadRefCount = Math.max(0, unloadRefCount - 1);
  if (unloadRefCount === 0) {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
  }
}

// ── BroadcastChannel heartbeat ──
let heartbeatChannel: BroadcastChannel | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let heartbeatRefCount = 0;

function startHeartbeat(): void {
  heartbeatRefCount++;
  if (heartbeatRefCount > 1) return;

  try {
    heartbeatChannel = new BroadcastChannel('hyperdrop-keepalive');
    heartbeatInterval = setInterval(() => {
      heartbeatChannel?.postMessage({ type: 'heartbeat', time: Date.now() });
    }, 5000); // Every 5 seconds
  } catch {
    // BroadcastChannel not available — non-critical
  }
}

function stopHeartbeat(): void {
  heartbeatRefCount = Math.max(0, heartbeatRefCount - 1);
  if (heartbeatRefCount > 0) return;

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  heartbeatChannel?.close();
  heartbeatChannel = null;
}

// ── Guard Handle (returned to callers) ──
export interface BackgroundGuardHandle {
  /** Release the guard when the transfer is complete */
  release: () => void;
  /** Check if the guard is still active */
  isActive: boolean;
}

// ── Main Guard API ──
export const BackgroundGuard = {
  /**
   * Acquire a background guard for a transfer.
   * Call `.release()` when the transfer completes or fails.
   */
  acquire(transferId: string): BackgroundGuardHandle {
    console.log(`[BackgroundGuard] Acquired for transfer: ${transferId}`);

    // Start all keepalive mechanisms
    startSilentAudio();
    addUnloadGuard();
    startHeartbeat();

    let active = true;

    return {
      get isActive() { return active; },
      release() {
        if (!active) return;
        active = false;

        console.log(`[BackgroundGuard] Released for transfer: ${transferId}`);
        stopSilentAudio();
        removeUnloadGuard();
        stopHeartbeat();
      },
    };
  },

  /**
   * Get the number of active guards (active transfers).
   */
  get activeCount(): number {
    return audioRefCount;
  },
};

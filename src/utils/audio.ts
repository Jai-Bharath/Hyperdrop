/**
 * Offline-safe audio notification chimes generated using the browser's Web Audio API.
 * Bypasses the need to download or store heavy audio asset files.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume context if suspended (browser security autoplays policy)
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch (e) {
    console.warn('[Audio] Web Audio API not supported on this platform:', e);
    return null;
  }
}

/**
 * Play a double-tone tech chime for file transfer completions.
 */
export function playSuccessChime() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gainNode = ctx.createGain();

  // C5 (523.25 Hz) sliding into E5 (659.25 Hz) then G5 (783.99 Hz)
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(523.25, now);
  osc1.frequency.setValueAtTime(659.25, now + 0.08);
  osc1.frequency.setValueAtTime(783.99, now + 0.16);

  // Soft secondary triangle wave for a premium, warmer tone
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(523.25, now);
  osc2.frequency.setValueAtTime(659.25, now + 0.08);
  osc2.frequency.setValueAtTime(783.99, now + 0.16);

  // Soft attack, pleasant decay
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.12, now + 0.04);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

  osc1.connect(gainNode);
  osc2.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.7);
  osc2.stop(now + 0.7);
}

/**
 * Play a short bubble sound for incoming chat messages.
 */
export function playMessageChime() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  // Upward frequency sweep (pitch shift) representing a chat bubble pop
  osc.type = 'sine';
  osc.frequency.setValueAtTime(587.33, now); // D5
  osc.frequency.exponentialRampToValueAtTime(880, now + 0.08); // A5

  // Attack, immediate decay
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.10, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.25);
}

import { formatBytes } from './formatBytes';
import { formatSpeed } from './formatSpeed';
import type { Protocol } from '../store/useStore';

interface FeedbackData {
  rating: number;
  comment?: string;
  fileName: string;
  fileSize: number;
  speed: number;
  protocol: Protocol;
  direction: 'send' | 'receive';
}

/**
 * Logs user rating and transfer stats locally.
 * HyperDrop Offline Build — zero external data transmission.
 * All feedback stays on-device in the browser console only.
 */
export async function submitFeedbackToDiscord(data: FeedbackData): Promise<boolean> {
  // Render a gorgeous console block for local debugging
  console.log(
    `%c[Feedback Received] %c${'★'.repeat(data.rating)}${'☆'.repeat(5 - data.rating)}\n` +
    `File: ${data.fileName} (${formatBytes(data.fileSize)})\n` +
    `Protocol: ${data.protocol} | Speed: ${formatSpeed(data.speed)}\n` +
    `Direction: ${data.direction.toUpperCase()}\n` +
    `Comment: ${data.comment || 'No comment provided.'}`,
    'color: #8b5cf6; font-weight: bold; font-size: 14px;',
    'color: #eab308; font-size: 14px;'
  );

  // Store feedback locally in localStorage for potential future use
  try {
    const feedbackKey = `hyperdrop-feedback-${Date.now()}`;
    localStorage.setItem(feedbackKey, JSON.stringify({
      ...data,
      timestamp: new Date().toISOString(),
    }));
  } catch {
    // Ignore storage errors
  }

  return true;
}

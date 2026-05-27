import { formatBytes } from './formatBytes';

/**
 * Format a transfer speed (bytes per second) into a human-readable string.
 * Returns 'Calculating...' when speed is 0 or negative.
 */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return 'Calculating...';

  return `${formatBytes(bytesPerSecond)}/s`;
}

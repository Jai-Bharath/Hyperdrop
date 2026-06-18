import { formatBytes } from './formatBytes';

/**
 * Format a transfer speed (bytes per second) into a human-readable string.
 * Shows "Starting..." briefly instead of stale "Calculating..." that never updates.
 */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return 'Starting...';
  return `${formatBytes(bytesPerSecond)}/s`;
}

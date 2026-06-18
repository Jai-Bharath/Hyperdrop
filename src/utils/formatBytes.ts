/**
 * Format a byte count into a human-readable string.
 * Handles 0 bytes, KB, MB, GB, and TB with 2 decimal places.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'] as const;
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const unitIndex = Math.min(i, units.length - 1);
  const value = bytes / Math.pow(k, unitIndex);

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

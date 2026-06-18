/**
 * Compute a SHA-256 checksum for an ArrayBuffer.
 * Falls back to an ultra-fast sampling hash in insecure contexts (HTTP LAN).
 */
export async function computeChecksum(data: ArrayBuffer): Promise<string> {
  if (!crypto.subtle) {
    // Insecure context fallback (HTTP LAN)
    // Fast sampling hash (1024 data points) to avoid freezing thread on large chunks
    const view = new Uint8Array(data);
    let hash = 0;
    const step = Math.max(1, Math.floor(view.length / 1024));
    for (let i = 0; i < view.length; i += step) {
      hash = (hash * 31 + view[i]) >>> 0;
    }
    return 'insecure-' + hash.toString(16).padStart(8, '0') + '-' + view.length.toString(16);
  }

  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    const hexString = Array.from(hashArray)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');

    return hexString.slice(0, 16);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown checksum error';
    throw new Error(`Checksum computation failed: ${message}`);
  }
}

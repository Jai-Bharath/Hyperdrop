import type { Device, Protocol } from '../store/useStore';

/**
 * Human-readable labels for each protocol.
 */
export const PROTOCOL_LABELS: Record<Protocol, string> = {
  'parallel-http': 'Parallel HTTP',
  'webrtc':        'WebRTC P2P',
  'http-chunk':    'HTTP Stream',
  'detecting':     'Detecting...',
};

/**
 * Tailwind-friendly hex colors for each protocol.
 */
export const PROTOCOL_COLORS: Record<Protocol, string> = {
  'parallel-http': '#34d399', // green
  'webrtc':        '#818cf8', // indigo
  'http-chunk':    '#f87171', // red
  'detecting':     '#94a3b8', // gray
};

/**
 * Pick the best transfer protocol based on device capabilities.
 *
 * Simplified decision matrix (removed dead FTP protocol):
 *   parallel-http → local server reachable (fastest, 100-300 MB/s)
 *   webrtc        → cloud/cross-network fallback (20-60 MB/s P2P)
 *   http-chunk    → last resort (5-15 MB/s)
 */
export function pickProtocol(device: Device, _localSupports5GHz: boolean): Protocol {
  // If the device has a private LAN IP, we can use parallel HTTP (fastest)
  const isLanDevice =
    device.ip.startsWith('192.168.') ||
    device.ip.startsWith('10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(device.ip);

  if (isLanDevice) {
    return 'parallel-http';
  }

  // Cross-network: WebRTC P2P is the best option
  return 'webrtc';
}

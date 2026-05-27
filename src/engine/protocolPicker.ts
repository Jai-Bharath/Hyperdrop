import type { Device, Protocol } from '../store/useStore';

/**
 * Human-readable labels for each protocol.
 */
export const PROTOCOL_LABELS: Record<Protocol, string> = {
  'parallel-http': 'Parallel HTTP',
  'webrtc':        'WebRTC P2P',
  'ftp':           'FTP Direct',
  'http-chunk':    'HTTP Stream',
  'detecting':     'Detecting...',
};

/**
 * Tailwind-friendly hex colors for each protocol.
 */
export const PROTOCOL_COLORS: Record<Protocol, string> = {
  'parallel-http': '#34d399', // green
  'webrtc':        '#818cf8', // indigo
  'ftp':           '#fbbf24', // amber
  'http-chunk':    '#f87171', // red
  'detecting':     '#94a3b8', // gray
};

/**
 * Pick the best transfer protocol based on device capabilities.
 *
 * Decision matrix:
 *   parallel-http → both 5 GHz + has app + not iOS         (100-300 MB/s)
 *   webrtc        → iOS cross-platform or phone-to-phone   (20-60 MB/s)
 *   ftp           → 2.4 GHz or old device, no app          (15-40 MB/s)
 *   http-chunk    → weak signal fallback                    (5-15 MB/s)
 */
export function pickProtocol(device: Device, localSupports5GHz: boolean): Protocol {
  if (device.supports5GHz && localSupports5GHz && device.platform !== 'ios') {
    return 'parallel-http';
  }

  if (device.platform === 'ios' || !device.supports5GHz) {
    return 'webrtc';
  }

  if (!device.supports5GHz) {
    return 'ftp';
  }

  return 'http-chunk';
}

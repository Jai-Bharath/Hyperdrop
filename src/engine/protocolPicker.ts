import type { Device, Protocol } from '../store/useStore';
import { type AdaptiveConfig, detectAdaptiveConfig, classifyTier } from './adaptiveChunker';

/**
 * Human-readable labels for each protocol.
 */
export const PROTOCOL_LABELS: Record<Protocol, string> = {
  'parallel-http': 'Parallel HTTP',
  'http-stream':   'HTTP Stream',
  'webrtc':        'WebRTC P2P',
  'ftp':           'FTP Direct',
  'http-chunk':    'HTTP Chunk',
  'detecting':     'Detecting...',
};

/**
 * Tailwind-friendly hex colors for each protocol.
 */
export const PROTOCOL_COLORS: Record<Protocol, string> = {
  'parallel-http': '#34d399', // green
  'http-stream':   '#22d3ee', // cyan
  'webrtc':        '#818cf8', // indigo
  'ftp':           '#fbbf24', // amber
  'http-chunk':    '#f87171', // red
  'detecting':     '#94a3b8', // gray
};

/**
 * Extended protocol picker that factors in:
 *   - Device capabilities (5 GHz support, platform)
 *   - Network speed probe results
 *   - File size (small files don't need parallel streams)
 *
 * Decision matrix:
 *   parallel-http → 5 GHz + fast probe + large file            (100-300 MB/s)
 *   http-stream   → 5 GHz + any speed + single stream          (50-150 MB/s)
 *   webrtc        → cross-network / iOS                        (20-60 MB/s)
 *   ftp           → 2.4 GHz / old device / no-app fallback    (15-40 MB/s)
 *   http-chunk    → weak signal / small file fallback          (5-15 MB/s)
 */
export function pickProtocol(device: Device, localSupports5GHz: boolean): Protocol {
  // Both sides support 5 GHz and not iOS → use parallel HTTP (fastest)
  if (device.supports5GHz && localSupports5GHz && device.platform !== 'ios') {
    return 'parallel-http';
  }

  // iOS or cross-platform → WebRTC for NAT traversal
  if (device.platform === 'ios') {
    return 'webrtc';
  }

  // One side doesn't support 5 GHz → single-stream HTTP
  if (!device.supports5GHz || !localSupports5GHz) {
    return 'http-stream';
  }

  // Default fallback
  return 'http-chunk';
}

/**
 * Advanced protocol picker that runs a network probe and returns
 * both the protocol and the optimal adaptive configuration.
 *
 * @param device - Target device
 * @param localSupports5GHz - Whether the local device supports 5 GHz
 * @param fileSize - Size of file being transferred
 * @param targetBaseUrl - Base URL of the target device's server
 */
export async function pickProtocolAdvanced(
  device: Device,
  localSupports5GHz: boolean,
  fileSize: number,
  targetBaseUrl: string,
): Promise<{ protocol: Protocol; config: AdaptiveConfig }> {
  // Small files (< 5 MB) don't benefit from parallel streams
  if (fileSize < 5 * 1024 * 1024) {
    return {
      protocol: 'http-chunk',
      config: {
        chunkSize: fileSize, // Send as single chunk
        parallelStreams: 1,
        tierLabel: 'Small File',
        probeSpeed: 0,
      },
    };
  }

  // Run speed probe
  const config = await detectAdaptiveConfig(targetBaseUrl);
  const tier = classifyTier(config.probeSpeed);

  // iOS always uses WebRTC
  if (device.platform === 'ios') {
    return { protocol: 'webrtc', config };
  }

  // Fast network → parallel HTTP
  if (tier === 'fast' && device.supports5GHz && localSupports5GHz) {
    return { protocol: 'parallel-http', config };
  }

  // Moderate → single HTTP stream
  if (tier === 'moderate') {
    return { protocol: 'http-stream', config };
  }

  // Slow → HTTP chunk (reliable, sequential)
  return { protocol: 'http-chunk', config };
}

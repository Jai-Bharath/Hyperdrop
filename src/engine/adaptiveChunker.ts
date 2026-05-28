/**
 * Adaptive Chunk Sizing Engine for HyperDrop.
 *
 * Automatically detects network conditions and adjusts chunk size
 * and parallel stream count for maximum throughput on any hardware.
 *
 * Decision matrix:
 *   5 GHz WiFi (fast)    → 8 MB chunks × 6 streams  (~100–300 MB/s)
 *   2.4 GHz / moderate   → 2 MB chunks × 4 streams  (~15–40 MB/s)
 *   Hotspot / weak        → 512 KB chunks × 2 streams (~5–15 MB/s)
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface AdaptiveConfig {
  /** Chunk size in bytes */
  chunkSize: number;
  /** Number of parallel upload/download streams */
  parallelStreams: number;
  /** Human-readable label for the detected tier */
  tierLabel: string;
  /** Measured probe speed in bytes/sec (0 if probe skipped) */
  probeSpeed: number;
}

export type NetworkTier = 'fast' | 'moderate' | 'slow';

// ─── Constants ────────────────────────────────────────────────────────

const TIER_CONFIGS: Record<NetworkTier, Omit<AdaptiveConfig, 'probeSpeed'>> = {
  fast: {
    chunkSize: 8 * 1024 * 1024,   // 8 MB
    parallelStreams: 6,
    tierLabel: '5 GHz / Fast LAN',
  },
  moderate: {
    chunkSize: 2 * 1024 * 1024,   // 2 MB
    parallelStreams: 4,
    tierLabel: '2.4 GHz / Moderate',
  },
  slow: {
    chunkSize: 512 * 1024,        // 512 KB
    parallelStreams: 2,
    tierLabel: 'Hotspot / Weak',
  },
};

/** Size of the speed probe payload (64 KB) */
const PROBE_SIZE = 64 * 1024;

/** Timeout for speed probe in milliseconds */
const PROBE_TIMEOUT_MS = 5000;

// ─── Speed thresholds (bytes/sec) ─────────────────────────────────────

/** Above this → fast tier (50 MB/s) */
const FAST_THRESHOLD = 50 * 1024 * 1024;

/** Above this → moderate tier (10 MB/s) */
const MODERATE_THRESHOLD = 10 * 1024 * 1024;

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Run a quick network speed probe against the target device's server
 * and return the optimal chunk/stream configuration.
 *
 * @param targetBaseUrl - e.g. "http://192.168.1.42:3001"
 * @param skipProbe - if true, returns 'fast' config without probing
 */
export async function detectAdaptiveConfig(
  targetBaseUrl: string,
  skipProbe = false,
): Promise<AdaptiveConfig> {
  if (skipProbe) {
    return { ...TIER_CONFIGS.fast, probeSpeed: 0 };
  }

  try {
    const speed = await measureNetworkSpeed(targetBaseUrl);
    const tier = classifyTier(speed);

    return {
      ...TIER_CONFIGS[tier],
      probeSpeed: speed,
    };
  } catch (err) {
    console.warn('[adaptiveChunker] Speed probe failed, defaulting to moderate tier:', err);
    return { ...TIER_CONFIGS.moderate, probeSpeed: 0 };
  }
}

/**
 * Get config for a specific tier without probing.
 */
export function getConfigForTier(tier: NetworkTier): AdaptiveConfig {
  return { ...TIER_CONFIGS[tier], probeSpeed: 0 };
}

/**
 * Classify a measured speed (bytes/sec) into a network tier.
 */
export function classifyTier(speedBytesPerSec: number): NetworkTier {
  if (speedBytesPerSec >= FAST_THRESHOLD) return 'fast';
  if (speedBytesPerSec >= MODERATE_THRESHOLD) return 'moderate';
  return 'slow';
}

// ─── Internal ─────────────────────────────────────────────────────────

/**
 * Measure network speed by uploading a small probe payload to the target.
 * Returns speed in bytes/sec.
 */
async function measureNetworkSpeed(baseUrl: string): Promise<number> {
  const probeData = new Uint8Array(PROBE_SIZE);
  // Fill with random-ish data to prevent compression optimization
  for (let i = 0; i < PROBE_SIZE; i++) {
    probeData[i] = (i * 7 + 13) & 0xff;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const startTime = performance.now();

    const response = await fetch(`${baseUrl}/api/probe`, {
      method: 'POST',
      body: probeData,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Probe': 'true',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Probe failed: ${response.status}`);
    }

    // Also download the response body to measure round-trip
    await response.arrayBuffer();

    const elapsed = (performance.now() - startTime) / 1000; // seconds
    const totalBytes = PROBE_SIZE * 2; // upload + download
    const speed = totalBytes / elapsed;

    console.log(
      `[adaptiveChunker] Speed probe: ${(speed / 1024 / 1024).toFixed(1)} MB/s ` +
      `(${PROBE_SIZE} bytes round-trip in ${(elapsed * 1000).toFixed(0)}ms)`
    );

    return speed;
  } finally {
    clearTimeout(timeout);
  }
}

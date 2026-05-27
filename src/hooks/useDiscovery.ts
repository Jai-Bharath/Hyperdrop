import { useEffect, useRef, useCallback } from 'react';
import { useStore, type Device } from '../store/useStore';

/** Polling interval for device discovery (ms) */
const POLL_INTERVAL_MS = 3000;

/** Devices not seen for this long are pruned (ms) */
const STALE_THRESHOLD_MS = 30000;

/**
 * Device discovery hook.
 *
 * Combines two discovery mechanisms:
 *   1. HTTP polling: GET /api/devices every 3 seconds
 *   2. Socket.IO events: device:found / device:lost (handled by useSocket)
 *
 * Automatically prunes stale devices (>15 seconds since last seen).
 *
 * @returns devices list, scanning state, and a manual refresh function.
 */
export function useDiscovery(): {
  devices: Device[];
  scanning: boolean;
  refresh: () => void;
} {
  const devices = useStore((s) => s.devices);
  const setDevices = useStore((s) => s.setDevices);
  const addDevice = useStore((s) => s.addDevice);
  const pruneStaleDevices = useStore((s) => s.pruneStaleDevices);
  const apiBaseUrl = useStore((s) => s.apiBaseUrl);
  const scanningRef = useRef(false);

  /**
   * Fetch devices from the server and merge into the store.
   * Deduplication is handled by addDevice (matches on device.id).
   */
  const fetchDevices = useCallback(async () => {
    // Don't poll until we know the backend URL
    if (!apiBaseUrl) return;
    scanningRef.current = true;

    try {
      const response = await fetch(`${apiBaseUrl}/api/devices`);

      if (!response.ok) {
        throw new Error(`Device discovery failed: ${response.status}`);
      }

      const data: Device[] = await response.json();
      const localId = localStorage.getItem('hyperdrop-device-id');

      // Merge each discovered device (addDevice handles dedup + lastSeen update)
      for (const device of data) {
        if (localId && device.id === localId) {
          continue;
        }
        addDevice(device);
      }
    } catch {
      // Network error during discovery is non-fatal — just retry next poll
    } finally {
      scanningRef.current = false;
    }
  }, [addDevice, apiBaseUrl]);

  // ── Polling loop ──
  useEffect(() => {
    // Initial fetch
    void fetchDevices();

    const pollTimer = setInterval(() => {
      void fetchDevices();
    }, POLL_INTERVAL_MS);

    // Prune stale devices periodically (same interval)
    const pruneTimer = setInterval(() => {
      pruneStaleDevices(STALE_THRESHOLD_MS);
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(pollTimer);
      clearInterval(pruneTimer);
    };
  }, [fetchDevices, pruneStaleDevices]);

  /**
   * Manual refresh: triggers an immediate device scan.
   */
  const refresh = useCallback(() => {
    void fetchDevices();
  }, [fetchDevices]);

  return {
    devices,
    scanning: scanningRef.current,
    refresh,
  };
}

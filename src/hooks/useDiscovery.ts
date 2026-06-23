import { useEffect, useRef, useCallback } from 'react';
import { useStore, type Device } from '../store/useStore';

/** Polling interval for device discovery (ms) */
const POLL_INTERVAL_MS = 5000;

/** Devices not seen for this long are pruned (ms) — generous to avoid killing socket-discovered devices */
const STALE_THRESHOLD_MS = 120000;

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
   * Check if a URL is a private/LAN address.
   */
  const isLanUrl = useCallback((url: string): boolean => {
    const stripped = url.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];
    return (
      stripped.startsWith('192.168.') ||
      stripped.startsWith('10.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(stripped) ||
      stripped === '127.0.0.1' ||
      stripped === 'localhost'
    );
  }, []);

  /**
   * Fetch devices from the server and merge into the store.
   * Only polls when connected to a LAN server — cloud polling is useless
   * (the Render server's /api/devices only returns its own mDNS-local devices).
   */
  const fetchDevices = useCallback(async () => {
    // Don't poll until we know the backend URL
    if (!apiBaseUrl) return;
    // SKIP polling if connected to cloud signaling — it returns meaningless device lists
    if (!isLanUrl(apiBaseUrl)) return;
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
        // Mark as HTTP-discovered so it CAN be pruned by stale timer
        addDevice({ ...device, source: 'http' });
      }
    } catch {
      // Network error during discovery is non-fatal — just retry next poll
    } finally {
      scanningRef.current = false;
    }
  }, [addDevice, apiBaseUrl, isLanUrl]);

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

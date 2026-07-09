/**
 * HyperDrop Discovery — SINGLETON Module
 *
 * This is NOT a React hook that creates state per-component.
 * It is a module-level singleton that initializes ONCE and stores
 * all state in the global Zustand store.
 *
 * Components access discovery data via `useStore()`.
 * Manual/QR pairing functions are exported as regular async functions.
 *
 * Discovery methods:
 *   1. Subnet Scan: Probes gateway.1–254 with /api/info
 *   2. Multicast (native hint): UDP announcements, HTTP-verified
 *   3. Manual/QR: Direct IP entry or QR scan → persistent
 */
import { Capacitor } from '@capacitor/core';
import { LocalServer } from '../native/LocalServer';
import { getOrCreateIdentity, type DeviceIdentity } from '../utils/crypto';
import {
  type AnnouncePacket,
  ANNOUNCE_INTERVAL_MS,
  ENDPOINTS,
  LOCAL_HTTP_PORT,
} from '../shared/protocol';
import { useStore, type Device } from '../store/useStore';

// ═══════════════════════════════════════════════════════════════
//  SINGLETON STATE
// ═══════════════════════════════════════════════════════════════

let initialized = false;
let identity: DeviceIdentity | null = null;
let myIp = '';
let scanning = false;

// Track manual/QR peers that should NEVER be auto-removed
const persistentPeerIps = new Set<string>();

// Track consecutive failures per device ID
const failCounts = new Map<string, number>();
const MAX_FAIL_BEFORE_REMOVE = 6;

// ═══════════════════════════════════════════════════════════════
//  HTTP PROBE
// ═══════════════════════════════════════════════════════════════

async function probeIp(ip: string, port: number): Promise<Device | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`http://${ip}:${port}${ENDPOINTS.INFO}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const info = await res.json();
    return {
      id: info.fingerprint || `device-${ip}`,
      name: info.alias || `Device (${ip})`,
      ip,
      port: info.port || port,
      platform: info.deviceType || 'mobile',
      supports5GHz: true,
      lastSeen: Date.now(),
      source: 'http',
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  SUBNET SCAN
// ═══════════════════════════════════════════════════════════════

function getSubnetBase(ip: string): string {
  return ip.split('.').slice(0, 3).join('.');
}

async function scanSubnet(subnetBase: string, selfIp: string, port: number): Promise<void> {
  const BATCH_SIZE = 25;

  for (let batchStart = 1; batchStart <= 254; batchStart += BATCH_SIZE) {
    const promises: Promise<void>[] = [];

    for (let i = batchStart; i < Math.min(batchStart + BATCH_SIZE, 255); i++) {
      const ip = `${subnetBase}.${i}`;
      if (ip === selfIp) continue;

      promises.push(
        probeIp(ip, port).then((device) => {
          if (device) {
            failCounts.set(device.id, 0);
            useStore.getState().addDevice(device);
            console.log(`[discovery] Found: ${device.name} at ${device.ip}`);
          }
        })
      );
    }

    await Promise.all(promises);
  }
}

// ═══════════════════════════════════════════════════════════════
//  RE-VERIFY — prune dead scanned peers, keep manual/QR
// ═══════════════════════════════════════════════════════════════

async function reverifyPeers(): Promise<void> {
  const devices = useStore.getState().devices;

  for (const device of devices) {
    const result = await probeIp(device.ip, device.port);

    if (result) {
      // Alive — reset fail count, refresh lastSeen
      failCounts.set(device.id, 0);
      useStore.getState().updateDeviceLastSeen(device.id);
    } else {
      // Failed probe
      const isPersistent = persistentPeerIps.has(device.ip);

      if (isPersistent) {
        // NEVER remove manual/QR peers — just log
        console.log(`[discovery] Persistent peer ${device.name} unreachable (kept)`);
      } else {
        const count = (failCounts.get(device.id) || 0) + 1;
        failCounts.set(device.id, count);

        if (count >= MAX_FAIL_BEFORE_REMOVE) {
          useStore.getState().removeDevice(device.id);
          failCounts.delete(device.id);
          console.log(`[discovery] Removed stale: ${device.name} (${count} failures)`);
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  PUBLIC API — callable from any component
// ═══════════════════════════════════════════════════════════════

/**
 * Add a peer by IP (manual entry). Returns true if device found.
 */
export async function addManualPeer(ip: string, port: number = LOCAL_HTTP_PORT): Promise<boolean> {
  const device = await probeIp(ip, port);
  if (device) {
    persistentPeerIps.add(ip);
    failCounts.set(device.id, 0);
    useStore.getState().addDevice(device);
    return true;
  }
  return false;
}

/**
 * Add a peer from QR scan. ALWAYS adds (even if probe fails — user explicitly scanned).
 */
export async function addQrPeer(ip: string, port: number = LOCAL_HTTP_PORT): Promise<Device> {
  persistentPeerIps.add(ip);

  const device = await probeIp(ip, port);
  if (device) {
    failCounts.set(device.id, 0);
    useStore.getState().addDevice(device);
    return device;
  }

  // Even if probe fails, add a fallback entry — user explicitly scanned the QR
  const fallback: Device = {
    id: `qr-${ip}-${port}`,
    name: `Device (${ip})`,
    ip,
    port,
    platform: 'mobile',
    supports5GHz: true,
    lastSeen: Date.now(),
    source: 'http',
  };
  useStore.getState().addDevice(fallback);
  return fallback;
}

/**
 * Trigger a manual subnet rescan.
 */
export async function rescanSubnet(): Promise<void> {
  if (scanning || !myIp) return;
  scanning = true;
  await scanSubnet(getSubnetBase(myIp), myIp, LOCAL_HTTP_PORT);
  scanning = false;
}

/**
 * Get current device IP.
 */
export function getMyIp(): string {
  return myIp;
}

/**
 * Check if currently scanning.
 */
export function isCurrentlyScanning(): boolean {
  return scanning;
}

/**
 * Get identity.
 */
export function getIdentity(): DeviceIdentity | null {
  return identity;
}

// ═══════════════════════════════════════════════════════════════
//  INITIALIZATION — called ONCE from DiscoveryManager
// ═══════════════════════════════════════════════════════════════

export async function initializeDiscovery(): Promise<void> {
  if (initialized) return;
  initialized = true;
  console.log('[discovery] Initializing (singleton)...');

  identity = await getOrCreateIdentity();

  if (Capacitor.isNativePlatform()) {
    // ─── NATIVE PATH ───────────────────────────────────
    try {
      await LocalServer.startServer({ port: LOCAL_HTTP_PORT });
      await LocalServer.startDiscovery();
      useStore.getState().setConnected(true);
      console.log('[discovery] Server + discovery started');

      // Get device IP (works for both WiFi client and hotspot provider)
      const ipResult = await LocalServer.getLocalIpAddress();
      myIp = ipResult.ip;
      useStore.getState().setServerInfo(myIp, LOCAL_HTTP_PORT, 0);
      console.log(`[discovery] My IP: ${myIp}`);

      // Listen for multicast hints (verify before adding)
      await LocalServer.addListener('peerAnnounce', (data) => {
        try {
          const packet: AnnouncePacket = JSON.parse(data.message);
          const peerIp = data.fromIp || '';
          if (!peerIp || packet.fingerprint === identity!.fingerprint) return;

          probeIp(peerIp, packet.port || LOCAL_HTTP_PORT).then((device) => {
            if (device) {
              failCounts.set(device.id, 0);
              useStore.getState().addDevice(device);
            }
          });
        } catch (err) {
          console.warn('[discovery] Bad announce:', err);
        }
      });

      // Periodic announce
      setInterval(async () => {
        try {
          const packet: AnnouncePacket = {
            fingerprint: identity!.fingerprint,
            alias: identity!.alias,
            deviceType: 'mobile',
            port: LOCAL_HTTP_PORT,
            type: 'hyperdrop-announce',
            version: '1.0',
            timestamp: Date.now(),
          };
          await LocalServer.sendAnnounce({ message: JSON.stringify(packet) });
        } catch (err) {
          console.warn('[discovery] Announce failed:', err);
        }
      }, ANNOUNCE_INTERVAL_MS);

      // Initial subnet scan
      if (myIp) {
        scanning = true;
        await scanSubnet(getSubnetBase(myIp), myIp, LOCAL_HTTP_PORT);
        scanning = false;
      }

      // Re-verify every 20 seconds (but never removes manual/QR peers)
      setInterval(reverifyPeers, 20000);

      // Rescan subnet every 45 seconds
      setInterval(async () => {
        if (myIp && !scanning) {
          scanning = true;
          await scanSubnet(getSubnetBase(myIp), myIp, LOCAL_HTTP_PORT);
          scanning = false;
        }
      }, 45000);

    } catch (err) {
      console.error('[discovery] Native init failed:', err);
    }
  } else {
    // ─── WEB PATH ──────────────────────────────────────
    // Works like LocalSend: discover local IP via WebRTC STUN,
    // then scan the entire LAN subnet for HyperDrop devices.
    useStore.getState().setConnected(true);

    // Step 1: Discover our own LAN IP using WebRTC (no cloud needed)
    const discoverLocalIp = (): Promise<string> =>
      new Promise((resolve) => {
        try {
          const pc = new RTCPeerConnection({
            iceServers: [], // No STUN — just local candidates
          });
          pc.createDataChannel('');
          pc.createOffer().then((offer) => pc.setLocalDescription(offer));

          const timeout = setTimeout(() => {
            pc.close();
            resolve('');
          }, 3000);

          pc.onicecandidate = (e) => {
            if (!e.candidate) return;
            const match = e.candidate.candidate.match(
              /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/
            );
            if (match && !match[1].startsWith('0.') && match[1] !== '0.0.0.0') {
              const ip = match[1];
              // Only accept private IPs
              if (
                ip.startsWith('192.168.') ||
                ip.startsWith('10.') ||
                /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
              ) {
                clearTimeout(timeout);
                pc.close();
                resolve(ip);
              }
            }
          };
        } catch {
          resolve('');
        }
      });

    myIp = await discoverLocalIp();
    console.log(`[discovery] Web: detected local IP: ${myIp || '(none)'}`);

    // Step 2: Try companion server (fast path — already running on same machine)
    const tryLocalCompanion = async () => {
      try {
        const res = await fetch(`http://localhost:${LOCAL_HTTP_PORT}/api/devices`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) return;
        const devices = await res.json();
        for (const d of devices) {
          if (d.ip) {
            const device = await probeIp(d.ip, d.port || LOCAL_HTTP_PORT);
            if (device) useStore.getState().addDevice(device);
          }
        }
      } catch { /* No companion — not an error, subnet scan handles it */ }
    };

    await tryLocalCompanion();
    setInterval(tryLocalCompanion, 5000);

    // Step 3: Subnet scan — find ALL HyperDrop devices on the LAN
    // This is how LocalSend/Quick Share discover peers without a central server
    if (myIp) {
      scanning = true;
      await scanSubnet(getSubnetBase(myIp), myIp, LOCAL_HTTP_PORT);
      scanning = false;
    } else {
      // Fallback: try common subnets
      console.log('[discovery] No local IP detected, trying common subnets...');
      scanning = true;
      await scanSubnet('192.168.1', '', LOCAL_HTTP_PORT);
      await scanSubnet('192.168.0', '', LOCAL_HTTP_PORT);
      scanning = false;
    }

    // Step 4: Periodic re-verify + rescan
    setInterval(reverifyPeers, 20000);
    setInterval(async () => {
      if (myIp && !scanning) {
        scanning = true;
        await scanSubnet(getSubnetBase(myIp), myIp, LOCAL_HTTP_PORT);
        scanning = false;
      }
    }, 45000);
  }

  console.log('[discovery] Initialization complete');
}

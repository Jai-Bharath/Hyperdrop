import dgram from 'dgram';
import { getLocalIp } from './httpServer.js';
import { hostname, platform } from 'os';

// ─── Types ────────────────────────────────────────────────────────────
interface UdpDevice {
  id: string;
  name: string;
  ip: string;
  port: number;
  platform: string;
  lastSeen: number;
}

// ─── Constants ────────────────────────────────────────────────────────
const BROADCAST_PORT = 41234;
const BROADCAST_INTERVAL = 3_000;   // Broadcast every 3 seconds
const PRUNE_TIMEOUT = 15_000;       // Remove devices not seen for 15 seconds
const SERVER_PORT = 3001;

// ─── State ────────────────────────────────────────────────────────────
const discoveredDevices = new Map<string, UdpDevice>();
let socket: dgram.Socket | null = null;
let broadcastTimer: ReturnType<typeof setInterval> | null = null;
let pruneTimer: ReturnType<typeof setInterval> | null = null;

// ─── Public API ───────────────────────────────────────────────────────

export function getUdpDiscoveredDevices(): UdpDevice[] {
  return Array.from(discoveredDevices.values());
}

export function startUdpBroadcast(): void {
  try {
    const localIp = getLocalIp();
    const deviceName = hostname();
    const devicePlatform = platform();

    socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    socket.on('error', (err) => {
      console.error('[udpBroadcast] Socket error:', err);
    });

    socket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());

        // Validate payload
        if (!data.id || !data.ip || !data.port) return;

        // Don't add ourselves
        if (data.ip === localIp && data.port === SERVER_PORT) return;

        const id = `${data.ip}:${data.port}`;
        discoveredDevices.set(id, {
          id,
          name: data.name || `Device-${id.slice(-4)}`,
          ip: data.ip,
          port: data.port,
          platform: data.platform || 'unknown',
          lastSeen: Date.now(),
        });
      } catch {
        // Ignore malformed packets
      }
    });

    socket.bind(BROADCAST_PORT, () => {
      try {
        socket!.setBroadcast(true);
      } catch (err) {
        console.warn('[udpBroadcast] Could not enable broadcast:', err);
      }

      console.log(`[udpBroadcast] Listening on UDP port ${BROADCAST_PORT}`);
    });

    // ── Periodically broadcast our presence ──
    const sendBroadcast = () => {
      if (!socket) return;

      const payload = JSON.stringify({
        id: `${localIp}:${SERVER_PORT}`,
        name: deviceName,
        ip: localIp,
        port: SERVER_PORT,
        platform: devicePlatform,
        supports5GHz: true,
        service: 'hyperdrop',
        version: '2.0.0',
      });

      const buffer = Buffer.from(payload);

      // Broadcast to 255.255.255.255 (subnet broadcast)
      try {
        socket.send(buffer, 0, buffer.length, BROADCAST_PORT, '255.255.255.255');
      } catch {
        // Ignore send errors (common on some networks)
      }

      // Also try common subnet broadcasts for robustness
      const parts = localIp.split('.');
      if (parts.length === 4) {
        const subnetBroadcast = `${parts[0]}.${parts[1]}.${parts[2]}.255`;
        try {
          socket.send(buffer, 0, buffer.length, BROADCAST_PORT, subnetBroadcast);
        } catch {
          // Ignore
        }
      }
    };

    // Initial broadcast
    sendBroadcast();
    broadcastTimer = setInterval(sendBroadcast, BROADCAST_INTERVAL);

    // ── Prune stale devices ──
    pruneTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, device] of discoveredDevices) {
        if (now - device.lastSeen > PRUNE_TIMEOUT) {
          discoveredDevices.delete(id);
          console.log(`[udpBroadcast] Pruned stale device: ${device.name} (${id})`);
        }
      }
    }, PRUNE_TIMEOUT);

    console.log(`[udpBroadcast] UDP broadcast discovery started on ${localIp}:${BROADCAST_PORT}`);
  } catch (err) {
    console.error('[udpBroadcast] Failed to start UDP broadcast:', err);
    console.error('[udpBroadcast] UDP discovery will be unavailable');
  }
}

export function stopUdpBroadcast(): void {
  if (broadcastTimer) {
    clearInterval(broadcastTimer);
    broadcastTimer = null;
  }
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
  if (socket) {
    try {
      socket.close();
    } catch {
      // Ignore
    }
    socket = null;
  }
  discoveredDevices.clear();
  console.log('[udpBroadcast] UDP broadcast discovery stopped');
}

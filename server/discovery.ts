// @ts-ignore
import mdns from 'multicast-dns'
import { getLocalIp } from './httpServer.js'
import { hostname, platform } from 'os'

// ─── Types ────────────────────────────────────────────────────────────
interface DiscoveredDevice {
  id: string
  name: string
  ip: string
  port: number
  platform: string
  lastSeen: number
}

// ─── Constants ────────────────────────────────────────────────────────
const SERVICE_NAME = '_hyperdrop._tcp.local'
const QUERY_INTERVAL = 5_000    // Query every 5 seconds
const PRUNE_TIMEOUT = 15_000    // Remove devices not seen for 15 seconds
const SERVER_PORT = 3001

// ─── State ────────────────────────────────────────────────────────────
const discoveredDevices = new Map<string, DiscoveredDevice>()
let mdnsInstance: ReturnType<typeof mdns> | null = null
let queryTimer: ReturnType<typeof setInterval> | null = null
let pruneTimer: ReturnType<typeof setInterval> | null = null

// ─── Public API ───────────────────────────────────────────────────────
export function getDiscoveredDevices(): DiscoveredDevice[] {
  return Array.from(discoveredDevices.values())
}

export function startDiscovery(): void {
  try {
    const localIp = getLocalIp()
    const deviceName = hostname()
    const devicePlatform = platform()

    mdnsInstance = mdns()

    // ── Respond to queries for our service ──────────────────────
    mdnsInstance.on('query', (query: any) => {
      if (!query.questions) return
      const isForUs = query.questions.some(
        (q: any) =>
          q.name === SERVICE_NAME ||
          q.name === '_services._dns-sd._udp.local',
      )
 
      if (!isForUs) return
 
      mdnsInstance!.respond({
        answers: [
          {
            name: SERVICE_NAME,
            type: 'SRV',
            data: {
              port: SERVER_PORT,
              target: `${deviceName}.local`,
              weight: 0,
              priority: 0,
            } as any,
          },
          {
            name: SERVICE_NAME,
            type: 'TXT',
            data: [
              `ip=${localIp}`,
              `port=${SERVER_PORT}`,
              `name=${deviceName}`,
              `platform=${devicePlatform}`,
              `5ghz=true`,
            ] as any,
          },
          {
            name: `${deviceName}.local`,
            type: 'A',
            data: localIp,
          } as any,
        ],
      })
    })
 
    // ── Process incoming responses ──────────────────────────────
    mdnsInstance.on('response', (response: any) => {
      if (!response.answers) return
      // Look for HyperDrop SRV records
      const srvRecord = response.answers.find(
        (a: any) => a.name === SERVICE_NAME && a.type === 'SRV',
      )
      if (!srvRecord) return
 
      // Extract device info from TXT records
      const txtRecord = response.answers.find(
        (a: any) => a.name === SERVICE_NAME && a.type === 'TXT',
      )
 
      let deviceIp = ''
      let devicePort = SERVER_PORT
      let name = 'Unknown Device'
      let devicePlat = 'unknown'
 
      if (txtRecord && txtRecord.type === 'TXT' && Array.isArray(txtRecord.data)) {
        for (const entry of txtRecord.data) {
          const str = typeof entry === 'string' ? entry : entry.toString()
          if (str.startsWith('ip=')) deviceIp = str.slice(3)
          if (str.startsWith('port=')) devicePort = parseInt(str.slice(5), 10)
          if (str.startsWith('name=')) name = str.slice(5)
          if (str.startsWith('platform=')) devicePlat = str.slice(9)
        }
      }
 
      // Also try A record for IP
      if (!deviceIp) {
        const aRecord = response.answers.find((a: any) => a.type === 'A')
        if (aRecord && aRecord.type === 'A') {
          deviceIp = aRecord.data as string
        }
      }

      // Don't add ourselves
      if (deviceIp === localIp) return
      if (!deviceIp) return

      const id = `${deviceIp}:${devicePort}`

      discoveredDevices.set(id, {
        id,
        name,
        ip: deviceIp,
        port: devicePort,
        platform: devicePlat,
        lastSeen: Date.now(),
      })
    })

    // ── Periodically query for peers ────────────────────────────
    const sendQuery = () => {
      if (!mdnsInstance) return
      mdnsInstance.query({
        questions: [
          { name: SERVICE_NAME, type: 'SRV' },
          { name: SERVICE_NAME, type: 'TXT' },
        ],
      })
    }

    // Send initial query immediately
    sendQuery()
    queryTimer = setInterval(sendQuery, QUERY_INTERVAL)

    // ── Prune stale devices ─────────────────────────────────────
    pruneTimer = setInterval(() => {
      const now = Date.now()
      for (const [id, device] of discoveredDevices) {
        if (now - device.lastSeen > PRUNE_TIMEOUT) {
          discoveredDevices.delete(id)
          console.log(`[discovery] Pruned stale device: ${device.name} (${id})`)
        }
      }
    }, PRUNE_TIMEOUT)

    console.log(`[discovery] mDNS discovery started — advertising as "${deviceName}" at ${localIp}:${SERVER_PORT}`)
  } catch (err) {
    console.error('[discovery] Failed to start mDNS discovery:', err)
    console.error('[discovery] LAN discovery will be unavailable')
  }
}

// ─── Cleanup (for graceful shutdown) ──────────────────────────────────
export function stopDiscovery(): void {
  if (queryTimer) {
    clearInterval(queryTimer)
    queryTimer = null
  }
  if (pruneTimer) {
    clearInterval(pruneTimer)
    pruneTimer = null
  }
  if (mdnsInstance) {
    mdnsInstance.destroy()
    mdnsInstance = null
  }
  discoveredDevices.clear()
  console.log('[discovery] mDNS discovery stopped')
}

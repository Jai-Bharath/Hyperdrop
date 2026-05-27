import { Server, Socket } from 'socket.io'
import { createHash } from 'crypto'
import { getLocalIp, closeFileHandle } from './httpServer.js'

// ─── Types ────────────────────────────────────────────────────────────
interface Device {
  id: string
  name: string
  ip: string
  port: number
  platform: string
  supports5GHz: boolean
  lastSeen: number
}

// ─── Device & Room Tracking ───────────────────────────────────────────
// Maps deviceId → socket.id for targeted relays
const deviceSockets = new Map<string, string>()

// Reverse lookup: socket.id → deviceId (for clean disconnects)
const socketDevices = new Map<string, string>()

// Maps deviceId → full Device payload
export const socketDevicesMap = new Map<string, Device>()

// Maps roomName → (deviceId → Device) for targeted room discovery
const roomDevices = new Map<string, Map<string, Device>>()

// Maps deviceId → Set of roomNames the device belongs to
const deviceRooms = new Map<string, Set<string>>()

// Maps transferId → { senderSocketId, receiverSocketId } for auto-routing relays
const activeTransfers = new Map<string, { senderSocketId: string; receiverSocketId: string }>()

// Maps deviceId → Timeout for disconnect grace period
const disconnectTimeouts = new Map<string, NodeJS.Timeout>()

// ─── IP Helper Functions ──────────────────────────────────────────────
/**
 * Resolves the client's public IP address, handling proxy headers on Cloud deployments.
 */
function getClientPublicIp(socket: Socket): string {
  const forwarded = socket.handshake.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim()
  }
  let ip = socket.handshake.address
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7)
  }
  return ip
}

/**
 * Creates a short, secure hash of the IP address for privacy in room naming.
 */
function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16)
}

/**
 * Checks if an IP is a private LAN subnet and groups classless subnet mask.
 */
function getLanSubnet(ip: string): string | null {
  if (ip.startsWith('192.168.')) {
    const parts = ip.split('.')
    return `${parts[0]}.${parts[1]}.${parts[2]}.*`
  }
  if (ip.startsWith('10.')) {
    const parts = ip.split('.')
    return `${parts[0]}.${parts[1]}.${parts[2]}.*`
  }
  if (ip.startsWith('172.')) {
    const parts = ip.split('.')
    const second = parseInt(parts[1], 10)
    if (second >= 16 && second <= 31) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.*`
    }
  }
  return null
}

// ─── Setup Socket Server ──────────────────────────────────────────────
export function setupSocketServer(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`[socket] Connected: ${socket.id}`)

    // Helper to resolve deviceId or mDNS IP targets to dynamic socket IDs
    function resolveTargetSocketId(targetId: string | undefined): string | null {
      if (!targetId) return null
      const direct = deviceSockets.get(targetId)
      if (direct) return direct

      // mDNS target fallback: targetId contains IP (e.g. 192.168.43.15:3001)
      if (targetId.includes(':')) {
        const ip = targetId.split(':')[0]
        for (const [dId, device] of socketDevicesMap.entries()) {
          if (device.ip === ip) {
            const socketId = deviceSockets.get(dId)
            if (socketId) {
              return socketId
            }
          }
        }
      }
      return null
    }

    // ── Device Registration & Dynamic IP Matching ───────────────────
    socket.on('device:register', (data: any) => {
      const deviceId = typeof data === 'object' && data ? data.deviceId : data
      if (!deviceId) return

      // Clear any pending disconnect timeout for this device (reconnection within grace period)
      const pendingTimeout = disconnectTimeouts.get(deviceId)
      if (pendingTimeout) {
        clearTimeout(pendingTimeout)
        disconnectTimeouts.delete(deviceId)
        console.log(`[socket] Device reconnected within grace period: ${deviceId}`)
      }

      const oldSocketId = deviceSockets.get(deviceId)
      if (oldSocketId && oldSocketId !== socket.id) {
        for (const [id, mapping] of activeTransfers.entries()) {
          if (mapping.senderSocketId === oldSocketId) {
            mapping.senderSocketId = socket.id
            console.log(`[socket] Updated active transfer ${id} sender socket to new ID: ${socket.id}`)
          }
          if (mapping.receiverSocketId === oldSocketId) {
            mapping.receiverSocketId = socket.id
            console.log(`[socket] Updated active transfer ${id} receiver socket to new ID: ${socket.id}`)
          }
        }
      }

      deviceSockets.set(deviceId, socket.id)
      socketDevices.set(socket.id, deviceId)

      // Resolve IP (local LAN fallback if loopback)
      let ip = getClientPublicIp(socket)
      if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
        ip = getLocalIp()
      }

      const name = (typeof data === 'object' && data && data.name) || `Device-${deviceId.slice(-4)}`
      const platform = (typeof data === 'object' && data && data.platform) || 'web'
      const port = (typeof data === 'object' && data && data.port) || 3001
      const supports5GHz = typeof data === 'object' && data ? !!data.supports5GHz : true

      const device: Device = {
        id: deviceId,
        name,
        ip,
        port,
        platform,
        supports5GHz,
        lastSeen: Date.now()
      }

      socketDevicesMap.set(deviceId, device)
      console.log(`[socket] Device registered: ${deviceId} (${name} @ ${ip}) → ${socket.id}`)

      // Determine default same-network public IP or local LAN room
      const subnet = getLanSubnet(ip)
      const ipRoom = subnet
        ? `room:ip:subnet:${hashIp(subnet)}`
        : `room:ip:${hashIp(getClientPublicIp(socket))}`
      
      socket.join(ipRoom)

      // Initialize trackers
      if (!roomDevices.has(ipRoom)) {
        roomDevices.set(ipRoom, new Map())
      }
      roomDevices.get(ipRoom)!.set(deviceId, device)

      if (!deviceRooms.has(deviceId)) {
        deviceRooms.set(deviceId, new Set())
      }
      deviceRooms.get(deviceId)!.add(ipRoom)

      // Broadcast 'device:found' ONLY to other devices in the same IP room
      socket.to(ipRoom).emit('device:found', device)

      // Send all existing devices in this IP room back to the newly registered socket
      const existing = roomDevices.get(ipRoom)!
      for (const [otherId, otherDevice] of existing.entries()) {
        if (otherId !== deviceId) {
          socket.emit('device:found', otherDevice)
        }
      }
    })

    // ── Explicit Manual/QR Room Joining ────────────────────────────
    socket.on('room:join', ({ roomId }: { roomId: string }) => {
      const deviceId = socketDevices.get(socket.id)
      if (!deviceId) return
      const device = socketDevicesMap.get(deviceId)
      if (!device) return

      const pairRoom = `room:pair:${roomId}`
      socket.join(pairRoom)

      // Add to room tracker
      if (!roomDevices.has(pairRoom)) {
        roomDevices.set(pairRoom, new Map())
      }
      roomDevices.get(pairRoom)!.set(deviceId, device)

      if (!deviceRooms.has(deviceId)) {
        deviceRooms.set(deviceId, new Set())
      }
      deviceRooms.get(deviceId)!.add(pairRoom)

      console.log(`[socket] Device ${deviceId} (${device.name}) manually joined pair room: ${roomId}`)

      // Broadcast new device to existing members in this manual room
      socket.to(pairRoom).emit('device:found', device)

      // Sync existing members of this room back to the newly joined device
      const existing = roomDevices.get(pairRoom)!
      for (const [otherId, otherDevice] of existing.entries()) {
        if (otherId !== deviceId) {
          socket.emit('device:found', otherDevice)
        }
      }
    })

    // ── WebRTC Signaling Relays (Highly Targeted) ──────────────────
    socket.on(
      'webrtc:offer',
      (data: { targetId: string; offer: RTCSessionDescriptionInit }) => {
        const fromId = socketDevices.get(socket.id)
        if (!fromId || !data.targetId || !data.offer) return

        const targetSocketId = resolveTargetSocketId(data.targetId)
        if (targetSocketId) {
          io.to(targetSocketId).emit('webrtc:offer', {
            fromId,
            offer: data.offer,
          })
          console.log(`[webrtc] Offer relayed: ${fromId} → ${data.targetId}`)
        }
      },
    )

    socket.on(
      'webrtc:answer',
      (data: { targetId: string; answer: RTCSessionDescriptionInit }) => {
        const fromId = socketDevices.get(socket.id)
        if (!fromId || !data.targetId || !data.answer) return

        const targetSocketId = resolveTargetSocketId(data.targetId)
        if (targetSocketId) {
          io.to(targetSocketId).emit('webrtc:answer', {
            fromId,
            answer: data.answer,
          })
          console.log(`[webrtc] Answer relayed: ${fromId} → ${data.targetId}`)
        }
      },
    )

    socket.on(
      'webrtc:ice',
      (data: { targetId: string; candidate: RTCIceCandidateInit }) => {
        const fromId = socketDevices.get(socket.id)
        if (!fromId || !data.targetId || !data.candidate) return

        const targetSocketId = resolveTargetSocketId(data.targetId)
        if (targetSocketId) {
          io.to(targetSocketId).emit('webrtc:ice', {
            fromId,
            candidate: data.candidate,
          })
        }
      },
    )

    // ── Targeted Transfer Events (Privacy Safe) ───────────────────
    socket.on(
      'transfer:start',
      (data: {
        id: string
        fileName: string
        fileSize: number
        senderId: string
        targetId?: string
        protocol: string
      }) => {
        console.log(`[transfer] Start: ${data.fileName} (${data.id}) targeting ${data.targetId}`)
        const targetSocketId = resolveTargetSocketId(data.targetId)
        if (targetSocketId) {
          activeTransfers.set(data.id, {
            senderSocketId: socket.id,
            receiverSocketId: targetSocketId,
          })
          io.to(targetSocketId).emit('transfer:incoming', data)
        }
      },
    )

    socket.on('transfer:accept', (data: { id: string }) => {
      const mapping = activeTransfers.get(data.id)
      if (mapping) {
        const targetSocketId = socket.id === mapping.senderSocketId
          ? mapping.receiverSocketId
          : mapping.senderSocketId
        io.to(targetSocketId).emit('transfer:accept', data)
        console.log(`[transfer] Accepted: ${data.id} (Relayed to ${targetSocketId})`)
      }
    })

    socket.on('transfer:progress', (data: { id: string; transferred: number; speed: number }) => {
      const mapping = activeTransfers.get(data.id)
      if (mapping) {
        const targetSocketId = socket.id === mapping.senderSocketId
          ? mapping.receiverSocketId
          : mapping.senderSocketId
        io.to(targetSocketId).emit('transfer:progress', data)
      }
    })

    socket.on('transfer:done', (data: { id: string }) => {
      const mapping = activeTransfers.get(data.id)
      if (mapping) {
        const targetSocketId = socket.id === mapping.senderSocketId
          ? mapping.receiverSocketId
          : mapping.senderSocketId
        io.to(targetSocketId).emit('transfer:done', data)
        activeTransfers.delete(data.id)
      }
    })

    socket.on('transfer:error', (data: { id: string; error: string }) => {
      const mapping = activeTransfers.get(data.id)
      if (mapping) {
        const targetSocketId = socket.id === mapping.senderSocketId
          ? mapping.receiverSocketId
          : mapping.senderSocketId
        io.to(targetSocketId).emit('transfer:error', data)
        activeTransfers.delete(data.id)
      }
      closeFileHandle(data.id).catch(() => {})
    })

    socket.on('transfer:cancel', (data: { id: string }) => {
      const mapping = activeTransfers.get(data.id)
      if (mapping) {
        const targetSocketId = socket.id === mapping.senderSocketId
          ? mapping.receiverSocketId
          : mapping.senderSocketId
        io.to(targetSocketId).emit('transfer:cancelled', { id: data.id })
        activeTransfers.delete(data.id)
      }
      closeFileHandle(data.id).catch(() => {})
    })

    // ── Graceful Disconnect & Room Cleanup ─────────────────────────
    socket.on('disconnect', (reason: string) => {
      const deviceId = socketDevices.get(socket.id)
      if (deviceId) {
        console.log(`[socket] Device disconnected (grace period started): ${deviceId} (${reason})`)

        // Clear any existing timeout for this device just in case
        const existingTimeout = disconnectTimeouts.get(deviceId)
        if (existingTimeout) {
          clearTimeout(existingTimeout)
        }

        const timeout = setTimeout(() => {
          disconnectTimeouts.delete(deviceId)
          deviceSockets.delete(deviceId)
          socketDevicesMap.delete(deviceId)
          socketDevices.delete(socket.id)
          console.log(`[socket] Grace period expired. Cleaned up device: ${deviceId}`)

          const rooms = deviceRooms.get(deviceId)
          if (rooms) {
            for (const roomName of rooms) {
              const roomMap = roomDevices.get(roomName)
              if (roomMap) {
                roomMap.delete(deviceId)
                if (roomMap.size === 0) {
                  roomDevices.delete(roomName)
                }
              }
              // Notify only other devices in that room
              io.to(roomName).emit('device:lost', { id: deviceId })
            }
            deviceRooms.delete(deviceId)
          }

          // Clean up any active transfers for this socket
          for (const [id, mapping] of activeTransfers.entries()) {
            if (mapping.senderSocketId === socket.id || mapping.receiverSocketId === socket.id) {
              const otherSocketId = mapping.senderSocketId === socket.id
                ? mapping.receiverSocketId
                : mapping.senderSocketId
              io.to(otherSocketId).emit('transfer:error', { id, error: 'Peer disconnected' })
              activeTransfers.delete(id)
              closeFileHandle(id).catch(() => {})
            }
          }
        }, 10000) // 10 seconds grace period

        disconnectTimeouts.set(deviceId, timeout)
      } else {
        console.log(`[socket] Disconnected: ${socket.id} (${reason})`)
      }
    })
  })

  console.log('[socket] Room-aware Socket.IO server initialized')
}

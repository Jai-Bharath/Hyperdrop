/**
 * HyperDrop Zero-Cloud Protocol v1.0
 *
 * The wire format both native (Kotlin/NanoHTTPD) and desktop companion
 * (Node/Express) must produce/consume identically.
 *
 * This file is the single source of truth for:
 *  - UDP multicast discovery packet format
 *  - HTTP endpoint paths and request/response shapes
 *  - Session authentication header
 *
 * Changing this file requires updating both hosts (Kotlin + Node)
 * so get the shape right before writing networking code.
 */

// ═══════════════════════════════════════════════════════════════
//  DISCOVERY CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Multicast group address — in the 239.x range (Organization-Local Scope) */
export const MULTICAST_ADDR = '239.255.83.17';

/** UDP port for multicast discovery (same as LocalSend convention) */
export const MULTICAST_PORT = 53317;

/** HTTP server port on each device (same port for consistency) */
export const LOCAL_HTTP_PORT = 53317;

/** How often to broadcast our announce packet (ms) */
export const ANNOUNCE_INTERVAL_MS = 3000;

/** Remove a peer after missed announces (ms) — generous for mobile throttling */
export const PEER_TIMEOUT_MS = 30000;

// ═══════════════════════════════════════════════════════════════
//  DISCOVERY PACKET — UDP Multicast
// ═══════════════════════════════════════════════════════════════

/**
 * Broadcast every ANNOUNCE_INTERVAL_MS via UDP multicast.
 * Both directions — every device sends AND listens for these.
 */
export interface AnnouncePacket {
  type: 'hyperdrop-announce';
  version: '1.0';
  /** Human-readable device name (e.g. "Pixel 8 Pro", "Chrome on macOS") */
  alias: string;
  /** SHA-256 hex of the device's persistent ECDH public key */
  fingerprint: string;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'web';
  /** Local HTTP server port (normally LOCAL_HTTP_PORT) */
  port: number;
  /** Unix timestamp (ms) when this announce was generated */
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════
//  FILE TRANSFER PROTOCOL — HTTP
// ═══════════════════════════════════════════════════════════════

/** Metadata for a single file in a transfer manifest */
export interface FileMeta {
  /** Unique file ID within this session (UUID) */
  id: string;
  /** File name (basename only — no path traversal) */
  name: string;
  /** File size in bytes */
  size: number;
  /** MIME type string (e.g. 'image/png', 'application/octet-stream') */
  mimeType: string;
  /** Optional post-transfer integrity hash */
  sha256?: string;
  /** Optional relative path for folder transfers */
  relativePath?: string;
}

/**
 * POST to peer's /api/transfer/prepare
 * The sender declares intent and waits for the receiver's consent.
 */
export interface PrepareRequest {
  /** Session UUID — the sender generates this */
  sessionId: string;
  senderFingerprint: string;
  senderAlias: string;
  /** Base64 ECDH public key for key agreement (Phase 6) */
  senderPublicKey: string;
  /** Files the sender wants to send */
  files: FileMeta[];
}

/**
 * Response from the receiver after consent modal interaction.
 * The server (NanoHTTPD or Express) holds the HTTP request open
 * until the user accepts or declines (up to 30s timeout).
 */
export interface PrepareResponse {
  sessionId: string;
  /** Whether the receiver accepted the transfer */
  accepted: boolean;
  /** Which files were accepted (may be a subset) */
  acceptedFileIds: string[];
  /** 32-byte hex session token — present ONLY if accepted.
   *  Required as X-HyperDrop-Session header on all subsequent
   *  chunk uploads for this session. */
  sessionToken?: string;
  /** Receiver's ECDH public key for key agreement (Phase 6) */
  receiverPublicKey?: string;
  /** Human-readable reason if declined */
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════
//  CHAT PROTOCOL — HTTP
// ═══════════════════════════════════════════════════════════════

/** POST to peer's /api/chat/send */
export interface ChatMessage {
  id: string;
  senderFingerprint: string;
  senderAlias: string;
  text: string;
  timestamp: number;
  isCode: boolean;
}

/** GET from peer's /api/chat/poll?since=<timestamp> */
export interface ChatPollResponse {
  messages: ChatMessage[];
  /** Server timestamp to use as `since` in the next poll */
  serverTime: number;
}

// ═══════════════════════════════════════════════════════════════
//  CLIPBOARD PROTOCOL — HTTP
// ═══════════════════════════════════════════════════════════════

/** POST to peer's /api/clipboard/sync */
export interface ClipboardPayload {
  id: string;
  content: string;
  contentType: 'text' | 'url';
  senderFingerprint: string;
  senderAlias: string;
  timestamp: number;
}

/** GET from peer's /api/clipboard/poll?since=<timestamp> */
export interface ClipboardPollResponse {
  entries: ClipboardPayload[];
  serverTime: number;
}

// ═══════════════════════════════════════════════════════════════
//  TRANSFER PROGRESS — HTTP
// ═══════════════════════════════════════════════════════════════

/** GET from peer's /api/session/:id/status */
export interface SessionStatus {
  sessionId: string;
  /** Which chunk indices have been received */
  receivedChunks: number[];
  totalChunks: number;
  /** Total bytes received across all chunks */
  totalReceived: number;
  /** Total file size */
  totalSize: number;
  status: 'active' | 'complete' | 'error' | 'cancelled';
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
//  API INFO — HTTP
// ═══════════════════════════════════════════════════════════════

/** GET /api/info response */
export interface DeviceInfo {
  alias: string;
  fingerprint: string;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'web';
  port: number;
  version: string;
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT CONSTANTS
// ═══════════════════════════════════════════════════════════════

/**
 * Standard endpoint paths every host (Kotlin native, Node desktop
 * companion) must implement identically.
 */
export const ENDPOINTS = {
  /** Liveness probe — returns 200 immediately */
  PING: '/api/ping',

  /** Device metadata */
  INFO: '/api/info',

  /** POST PrepareRequest — held open for user consent */
  PREPARE: '/api/transfer/prepare',

  /** PUT — raw binary chunk upload, requires session header */
  UPLOAD_CHUNK: '/api/chunk',

  /** POST — streaming upload, requires session header */
  UPLOAD_STREAM: '/api/upload-stream',

  /** GET /download/:fileName — Range-aware file download */
  DOWNLOAD: '/download',

  /** GET — query session/resume state */
  SESSION_STATUS: '/api/session',

  /** POST ChatMessage — send a chat message to this device */
  CHAT_SEND: '/api/chat/send',

  /** GET — long-poll for incoming chat messages */
  CHAT_POLL: '/api/chat/poll',

  /** POST ClipboardPayload — push clipboard content to this device */
  CLIPBOARD_SYNC: '/api/clipboard/sync',

  /** GET — long-poll for incoming clipboard entries */
  CLIPBOARD_POLL: '/api/clipboard/poll',
} as const;

/** Header name for session token authentication */
export const SESSION_HEADER = 'X-HyperDrop-Session';

/** Chunk size — must match server-side (8 MB) */
export const CHUNK_SIZE = 8 * 1024 * 1024;

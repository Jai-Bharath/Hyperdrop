/**
 * HyperDrop Local Transport Layer — Zero-Cloud
 *
 * Replaces the Socket.IO-based transfer lifecycle with direct HTTP calls
 * to the peer's local server. Every function here talks to a specific
 * peer's ip:port, no cloud relay involved.
 *
 * Used by useTransfer.ts for:
 *  - PrepareRequest/PrepareResponse handshake (replaces transfer:start/accept)
 *  - Chat send/poll (replaces chat:message socket events)
 *  - Clipboard sync/poll (replaces clipboard:sync socket events)
 *  - Session status / resume queries
 */
import {
  ENDPOINTS,
  SESSION_HEADER,
  LOCAL_HTTP_PORT,
  type PrepareRequest,
  type PrepareResponse,
  type ChatMessage,
  type ChatPollResponse,
  type ClipboardPayload,
  type ClipboardPollResponse,
  type SessionStatus,
  type DeviceInfo,
  type FileMeta,
} from '../shared/protocol';
export type { FileMeta };
import { getOrCreateIdentity } from '../utils/crypto';

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

/** Generate UUID that works in insecure (HTTP) contexts like Capacitor WebView */
function safeUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch { /* insecure context */ }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function peerUrl(ip: string, port: number = LOCAL_HTTP_PORT): string {
  return `http://${ip}:${port}`;
}

// ═══════════════════════════════════════════════════════════════
//  TRANSFER LIFECYCLE
// ═══════════════════════════════════════════════════════════════

/**
 * Probe whether a peer is reachable.
 */
export async function pingPeer(ip: string, port: number = LOCAL_HTTP_PORT): Promise<boolean> {
  try {
    const res = await fetch(`${peerUrl(ip, port)}${ENDPOINTS.PING}`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Get device info from a peer.
 */
export async function getPeerInfo(ip: string, port: number = LOCAL_HTTP_PORT): Promise<DeviceInfo | null> {
  try {
    const res = await fetch(`${peerUrl(ip, port)}${ENDPOINTS.INFO}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Send a PrepareRequest to a peer and wait for their consent response.
 * The peer's server holds the connection open until the user accepts/declines
 * (up to 30s timeout).
 */
export async function sendPrepareRequest(
  peerIp: string,
  peerPort: number,
  files: FileMeta[]
): Promise<PrepareResponse> {
  const identity = await getOrCreateIdentity();

  const request: PrepareRequest = {
    sessionId: safeUUID(),
    senderFingerprint: identity.fingerprint,
    senderAlias: identity.alias,
    senderPublicKey: identity.publicKeyBase64,
    files,
  };

  const res = await fetch(`${peerUrl(peerIp, peerPort)}${ENDPOINTS.PREPARE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(35000), // 30s consent + 5s network margin
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Prepare request failed: ${res.status} ${errText}`);
  }

  return res.json();
}

/**
 * Query the session/resume state from a peer.
 */
export async function getSessionStatus(
  peerIp: string,
  peerPort: number,
  sessionId: string
): Promise<SessionStatus | null> {
  try {
    const res = await fetch(
      `${peerUrl(peerIp, peerPort)}${ENDPOINTS.SESSION_STATUS}/${sessionId}/status`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Query resume state (backward compat with existing chunk uploader).
 */
export async function getResumeState(
  peerIp: string,
  peerPort: number,
  transferId: string
): Promise<Set<number>> {
  try {
    const res = await fetch(
      `${peerUrl(peerIp, peerPort)}/api/resume/${transferId}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return new Set();
    const data = await res.json();
    return new Set(data.received || []);
  } catch {
    return new Set();
  }
}

// ═══════════════════════════════════════════════════════════════
//  CHAT
// ═══════════════════════════════════════════════════════════════

/**
 * Send a chat message to a peer.
 */
export async function sendChatMessage(
  peerIp: string,
  peerPort: number,
  text: string,
  isCode: boolean = false
): Promise<void> {
  const identity = await getOrCreateIdentity();

  const message: ChatMessage = {
    id: safeUUID(),
    senderFingerprint: identity.fingerprint,
    senderAlias: identity.alias,
    text,
    timestamp: Date.now(),
    isCode,
  };

  const res = await fetch(`${peerUrl(peerIp, peerPort)}${ENDPOINTS.CHAT_SEND}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`Chat send failed: ${res.status}`);
  }
}

/**
 * Poll for new chat messages from a peer.
 */
export async function pollChatMessages(
  peerIp: string,
  peerPort: number,
  since: number = 0
): Promise<ChatPollResponse> {
  const res = await fetch(
    `${peerUrl(peerIp, peerPort)}${ENDPOINTS.CHAT_POLL}?since=${since}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) {
    throw new Error(`Chat poll failed: ${res.status}`);
  }
  return res.json();
}

// ═══════════════════════════════════════════════════════════════
//  CLIPBOARD
// ═══════════════════════════════════════════════════════════════

/**
 * Push clipboard content to a peer.
 */
export async function syncClipboard(
  peerIp: string,
  peerPort: number,
  content: string,
  contentType: 'text' | 'url' = 'text'
): Promise<void> {
  const identity = await getOrCreateIdentity();

  const payload: ClipboardPayload = {
    id: safeUUID(),
    content,
    contentType,
    senderFingerprint: identity.fingerprint,
    senderAlias: identity.alias,
    timestamp: Date.now(),
  };

  const res = await fetch(`${peerUrl(peerIp, peerPort)}${ENDPOINTS.CLIPBOARD_SYNC}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`Clipboard sync failed: ${res.status}`);
  }
}

/**
 * Poll for clipboard entries from a peer.
 */
export async function pollClipboard(
  peerIp: string,
  peerPort: number,
  since: number = 0
): Promise<ClipboardPollResponse> {
  const res = await fetch(
    `${peerUrl(peerIp, peerPort)}${ENDPOINTS.CLIPBOARD_POLL}?since=${since}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) {
    throw new Error(`Clipboard poll failed: ${res.status}`);
  }
  return res.json();
}

// ═══════════════════════════════════════════════════════════════
//  DOWNLOAD URL BUILDER
// ═══════════════════════════════════════════════════════════════

/**
 * Build the download URL for a file on a peer's local server.
 */
export function buildDownloadUrl(
  peerIp: string,
  peerPort: number,
  fileName: string
): string {
  return `${peerUrl(peerIp, peerPort)}${ENDPOINTS.DOWNLOAD}/${encodeURIComponent(fileName)}`;
}

/**
 * Build the upload base URL for a peer's local server.
 * This is what parallelChunkUploader and streamUploadEngine need.
 */
export function buildPeerBaseUrl(peerIp: string, peerPort: number = LOCAL_HTTP_PORT): string {
  return peerUrl(peerIp, peerPort);
}

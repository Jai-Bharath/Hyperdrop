/**
 * HyperDrop Cryptographic Identity & Session Security
 *
 * Works in BOTH secure (HTTPS) and insecure (HTTP) contexts.
 * On Capacitor Android with androidScheme:'http', crypto.subtle is
 * unavailable, so we use pure-JS fallbacks for identity generation.
 *
 * The identity is used for:
 * - Device fingerprinting (unique ID per device)
 * - Alias generation (human-readable name)
 * - Session token generation (random hex for auth)
 */

// ═══════════════════════════════════════════════════════════════
//  STORAGE KEYS
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY_FINGERPRINT = 'hyperdrop-fingerprint';
const STORAGE_KEY_ALIAS = 'hyperdrop-device-alias';
const STORAGE_KEY_PUBLIC_B64 = 'hyperdrop-public-b64';

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

export interface DeviceIdentity {
  /** Human-readable device name */
  alias: string;
  /** Hex fingerprint — stable device identifier */
  fingerprint: string;
  /** Base64-encoded public key for sharing with peers */
  publicKeyBase64: string;
  /** Raw CryptoKey for ECDH derivation (null in insecure context) */
  publicKey: CryptoKey | null;
  /** Raw CryptoKey for ECDH derivation (null in insecure context) */
  privateKey: CryptoKey | null;
}

export interface SessionKeys {
  /** AES-256-GCM key derived from ECDH shared secret */
  encryptionKey: CryptoKey;
  /** 32-byte hex session token for HTTP header auth */
  sessionToken: string;
}

// ═══════════════════════════════════════════════════════════════
//  FEATURE DETECTION
// ═══════════════════════════════════════════════════════════════

/** Check if Web Crypto API is available (secure context only) */
function hasSubtleCrypto(): boolean {
  try {
    return typeof crypto !== 'undefined'
      && typeof crypto.subtle !== 'undefined'
      && typeof crypto.subtle.generateKey === 'function';
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
//  DEVICE IDENTITY — Works in ANY context
// ═══════════════════════════════════════════════════════════════

/**
 * Get or create the device's persistent identity.
 * Uses crypto.subtle when available, falls back to random generation.
 */
export async function getOrCreateIdentity(): Promise<DeviceIdentity> {
  // Try to load existing identity from storage
  const storedFingerprint = localStorage.getItem(STORAGE_KEY_FINGERPRINT);
  const storedAlias = localStorage.getItem(STORAGE_KEY_ALIAS);
  const storedPublic = localStorage.getItem(STORAGE_KEY_PUBLIC_B64);

  if (storedFingerprint && storedAlias && storedPublic) {
    return {
      alias: storedAlias,
      fingerprint: storedFingerprint,
      publicKeyBase64: storedPublic,
      publicKey: null,
      privateKey: null,
    };
  }

  // Generate new identity
  if (hasSubtleCrypto()) {
    try {
      return await generateIdentityWithCrypto();
    } catch (err) {
      console.warn('[crypto] crypto.subtle failed, using fallback:', err);
    }
  }

  return generateIdentityFallback();
}

/**
 * Generate identity using Web Crypto API (secure contexts).
 */
async function generateIdentityWithCrypto(): Promise<DeviceIdentity> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const spkiBytes = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', spkiBytes);
  const fingerprint = bufferToHex(hashBuffer);
  const publicKeyBase64 = arrayBufferToBase64(spkiBytes);
  const alias = generateDeviceAlias();

  // Persist
  persistIdentity(fingerprint, alias, publicKeyBase64);

  return {
    alias,
    fingerprint,
    publicKeyBase64,
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Generate identity using pure JS (insecure HTTP contexts).
 * No ECDH key agreement, but provides stable fingerprint + alias.
 */
function generateIdentityFallback(): DeviceIdentity {
  // Generate 32 random bytes for fingerprint
  const randomBytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < 32; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }

  const fingerprint = bufferToHex(randomBytes.buffer);
  const publicKeyBase64 = arrayBufferToBase64(randomBytes.buffer);
  const alias = generateDeviceAlias();

  // Persist
  persistIdentity(fingerprint, alias, publicKeyBase64);

  return {
    alias,
    fingerprint,
    publicKeyBase64,
    publicKey: null,
    privateKey: null,
  };
}

function persistIdentity(fingerprint: string, alias: string, publicKeyBase64: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_FINGERPRINT, fingerprint);
    localStorage.setItem(STORAGE_KEY_ALIAS, alias);
    localStorage.setItem(STORAGE_KEY_PUBLIC_B64, publicKeyBase64);
  } catch (err) {
    console.error('[crypto] Failed to persist identity:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
//  SESSION KEY DERIVATION — ECDH + HKDF (secure contexts only)
// ═══════════════════════════════════════════════════════════════

/**
 * Derive a session encryption key from our private key and the peer's public key.
 * Only works in secure contexts where crypto.subtle is available.
 */
export async function deriveSessionKeys(
  privateKey: CryptoKey,
  peerPublicKeyBase64: string
): Promise<SessionKeys> {
  if (!hasSubtleCrypto()) {
    throw new Error('E2E encryption requires a secure context (HTTPS)');
  }

  const peerPublicKeyBytes = base64ToArrayBuffer(peerPublicKeyBase64);
  const peerPublicKey = await crypto.subtle.importKey(
    'raw', peerPublicKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  );

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    256
  );

  const hkdfKey = await crypto.subtle.importKey(
    'raw', sharedBits, 'HKDF', false, ['deriveKey']
  );

  const encryptionKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: new TextEncoder().encode('hyperdrop-e2e-v1'),
      info: new TextEncoder().encode('aes-gcm-256'),
      hash: 'SHA-256',
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const tokenHash = await crypto.subtle.digest('SHA-256', sharedBits);
  const sessionToken = bufferToHex(tokenHash);

  return { encryptionKey, sessionToken };
}

// ═══════════════════════════════════════════════════════════════
//  CHUNK ENCRYPTION — AES-256-GCM (secure contexts only)
// ═══════════════════════════════════════════════════════════════

export async function encryptChunk(
  key: CryptoKey,
  plaintext: ArrayBuffer
): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  const result = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.byteLength);
  return result.buffer;
}

export async function decryptChunk(
  key: CryptoKey,
  encrypted: ArrayBuffer
): Promise<ArrayBuffer> {
  const data = new Uint8Array(encrypted);
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);

  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
}

// ═══════════════════════════════════════════════════════════════
//  SESSION TOKEN GENERATION
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a random 32-byte hex session token.
 * Works in both secure and insecure contexts.
 */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 32; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bufferToHex(bytes.buffer);
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generate a human-readable device alias.
 */
function generateDeviceAlias(): string {
  if (typeof navigator === 'undefined') return 'HyperDrop Device';

  const ua = navigator.userAgent;
  let os = 'Device';
  if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Macintosh/i.test(ua)) os = 'macOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = '';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';

  if (browser) return `${browser} on ${os}`;
  return `HyperDrop ${os}`;
}

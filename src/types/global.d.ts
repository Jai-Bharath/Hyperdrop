/* Module shims for packages without @types */
declare module 'ftp-srv' {
  import { EventEmitter } from 'events';

  interface FtpSrvOptions {
    url: string;
    anonymous?: boolean;
    pasv_url?: string;
    pasv_min?: number;
    pasv_max?: number;
    greeting?: string[];
  }

  interface FtpConnection extends EventEmitter {
    username: string;
    ip: string;
  }

  class FtpSrv extends EventEmitter {
    constructor(options: FtpSrvOptions);
    listen(): Promise<void>;
    close(): void;
    on(event: 'login', listener: (data: { connection: FtpConnection; username: string; password: string }, resolve: (options: { root: string }) => void, reject: (err: Error) => void) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  export default FtpSrv;
}

declare module 'multicast-dns' {
  import { EventEmitter } from 'events';

  interface MdnsAnswer {
    name: string;
    type: string;
    ttl?: number;
    data: string | Buffer | { port: number; target: string } | Array<{ key: string; value: string }>;
    class?: string;
    flush?: boolean;
  }

  interface MdnsQuery {
    questions: Array<{ name: string; type: string }>;
  }

  interface MdnsResponse {
    answers: MdnsAnswer[];
    additionals?: MdnsAnswer[];
  }

  interface MdnsPacket {
    questions?: Array<{ name: string; type: string }>;
    answers?: MdnsAnswer[];
    additionals?: MdnsAnswer[];
  }

  interface Mdns extends EventEmitter {
    query(query: MdnsQuery | Array<{ name: string; type: string }>): void;
    respond(response: MdnsResponse | MdnsAnswer[]): void;
    destroy(): void;
    on(event: 'query', listener: (query: MdnsPacket) => void): this;
    on(event: 'response', listener: (response: MdnsPacket) => void): this;
  }

  function mdns(options?: { multicast?: boolean; interface?: string; port?: number; ip?: string; ttl?: number; loopback?: boolean; reuseAddr?: boolean }): Mdns;

  export = mdns;
}

/* Vite client types */
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_PORT?: string;
  readonly VITE_DISCORD_WEBHOOK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/* ─── HyperDrop Chat & Clipboard Types ────────────────────── */
interface ChatMessageData {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: number;
  isCode: boolean;
  read: boolean;
}

interface ClipboardEntryData {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  source: 'local' | 'remote';
  timestamp: number;
  isCode: boolean;
}

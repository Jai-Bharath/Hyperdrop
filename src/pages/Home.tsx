import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Send, Download, Wifi, Zap, Smartphone, QrCode, Globe, Copy, Check
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { getMyIp } from '../hooks/useDiscovery';
import DeviceList from '../components/DeviceList';
import QRCodeDisplay from '../components/QRCodeDisplay';
import DropZone from '../components/DropZone';
import { LOCAL_HTTP_PORT } from '../shared/protocol';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

export default function Home() {
  const navigate = useNavigate();
  const connected = useStore((s) => s.connected);
  const devices = useStore((s) => s.devices);
  const serverIp = useStore((s) => s.serverIp);
  const [copied, setCopied] = useState(false);

  // Use IP from store (set by discovery singleton)
  const myIp = serverIp || getMyIp();
  const qrUrl = myIp ? `hyperdrop://${myIp}:${LOCAL_HTTP_PORT}` : '';

  const handleCopyIp = () => {
    if (!myIp) return;
    navigator.clipboard.writeText(`${myIp}:${LOCAL_HTTP_PORT}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Convert store devices to Peer-like objects for DeviceList
  const peers = devices.map(d => ({
    fingerprint: d.id,
    alias: d.name,
    ip: d.ip,
    port: d.port,
    deviceType: (d.platform || 'mobile') as 'mobile' | 'desktop' | 'tablet' | 'web',
    source: 'scan' as const,
    verified: true,
    failCount: 0,
    lastSeen: d.lastSeen,
  }));

  return (
    <motion.div
      className="mx-auto max-w-lg space-y-4 pb-8"
      initial="initial"
      animate="animate"
    >
      {/* ─── Hero ──────────────────────────────────────────── */}
      <motion.section className="text-center space-y-1 pt-2" variants={fadeUp}>
        <h1 className="text-3xl font-extrabold tracking-tight">
          <span className="text-gradient">HyperDrop</span>
        </h1>
        <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-[0.2em]">
          Instant file transfer · No internet required
        </p>
      </motion.section>

      {/* ─── Connection Status ──────────────────────────────── */}
      <motion.div variants={fadeUp} transition={{ delay: 0.05 }}>
        <div className={`flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-2xl text-[11px] font-bold transition-all ${
          connected
            ? 'bg-emerald-500/[0.06] border border-emerald-500/15 text-emerald-400'
            : 'bg-red-500/[0.06] border border-red-500/15 text-red-400'
        }`}>
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          {connected ? (
            <>Online{myIp ? ` · ${myIp}` : ''}</>
          ) : (
            'Disconnected'
          )}
          {myIp && (
            <button type="button" onClick={handleCopyIp} className="ml-1 p-0.5">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-50" />}
            </button>
          )}
        </div>
      </motion.div>

      {/* ─── Send / Receive Hero Buttons ─────────────────────── */}
      <motion.div className="grid grid-cols-2 gap-3" variants={fadeUp} transition={{ delay: 0.1 }}>
        <button
          type="button"
          onClick={() => navigate('/send')}
          className="group relative overflow-hidden rounded-2xl p-[1px] shadow-lg shadow-brand-500/15 hover:shadow-brand-500/30 transition-all active:scale-[0.97]"
        >
          <div className="flex flex-col items-center gap-2 rounded-[15px] bg-gradient-to-br from-brand-600 to-brand-500 px-5 py-5">
            <Send className="h-6 w-6 text-white" />
            <span className="text-sm font-bold text-white">Send</span>
            <span className="text-[9px] text-white/50 font-medium">Pick files & share</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/receive')}
          className="group relative overflow-hidden rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-emerald-500/20 transition-all active:scale-[0.97] shadow-lg shadow-black/10"
        >
          <div className="flex flex-col items-center gap-2 px-5 py-5">
            <Download className="h-6 w-6 text-emerald-400" />
            <span className="text-sm font-bold text-slate-200">Receive</span>
            <span className="text-[9px] text-slate-500 font-medium">Show QR to sender</span>
          </div>
        </button>
      </motion.div>

      {/* ─── Drop Zone ─────────────────────────────────────── */}
      <motion.div variants={fadeUp} transition={{ delay: 0.12 }}>
        <DropZone />
      </motion.div>

      {/* ─── Your Device QR Code ──────────────────────────────── */}
      {myIp && (
        <motion.div variants={fadeUp} transition={{ delay: 0.15 }}>
          <div className="card">
            <div className="flex flex-col items-center gap-3 py-2">
              <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <QrCode className="h-3.5 w-3.5" /> Your Device QR
              </h2>
              <QRCodeDisplay url={qrUrl} size={140} />
              <p className="text-[10px] text-slate-500 text-center">
                Other devices can scan this to connect
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ─── Nearby Devices ───────────────────────────────────── */}
      <motion.div variants={fadeUp} transition={{ delay: 0.2 }}>
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5" /> Nearby Devices
            </h2>
            <span className="text-[10px] font-mono text-slate-600">
              {devices.length} found
            </span>
          </div>
          <DeviceList
            peers={peers}
            onSelect={(peer) => {
              useStore.getState().selectDevice({
                id: peer.fingerprint,
                name: peer.alias,
                ip: peer.ip,
                port: peer.port,
                platform: peer.deviceType,
                supports5GHz: true,
                lastSeen: Date.now(),
              });
              navigate('/send');
            }}
            isScanning={false}
          />
        </div>
      </motion.div>

      {/* ─── Feature chips ────────────────────────────────────── */}
      <motion.div
        className="flex flex-wrap justify-center gap-2 pt-1"
        variants={fadeUp}
        transition={{ delay: 0.25 }}
      >
        <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.03] border border-white/[0.05] px-3 py-1 text-[9px] font-bold text-slate-500">
          <Zap className="h-2.5 w-2.5 text-amber-400" /> LAN Speed
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.03] border border-white/[0.05] px-3 py-1 text-[9px] font-bold text-slate-500">
          <Wifi className="h-2.5 w-2.5 text-cyan-400" /> WiFi / Hotspot
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.03] border border-white/[0.05] px-3 py-1 text-[9px] font-bold text-slate-500">
          <Globe className="h-2.5 w-2.5 text-emerald-400" /> No Internet
        </span>
      </motion.div>
    </motion.div>
  );
}

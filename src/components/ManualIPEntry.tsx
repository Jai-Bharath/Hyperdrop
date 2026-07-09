import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, Loader2, CheckCircle2, XCircle, Globe } from 'lucide-react';

interface ManualIPEntryProps {
  onConnect: (ip: string, port: number) => Promise<boolean>;
}

export default function ManualIPEntry({ onConnect }: ManualIPEntryProps) {
  const [ip, setIp] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleConnect = useCallback(async () => {
    const cleaned = ip.trim();
    if (!cleaned) return;

    // Parse IP:port format
    let host = cleaned;
    let port = 53317;
    if (cleaned.includes(':')) {
      const parts = cleaned.split(':');
      host = parts[0];
      const parsedPort = parseInt(parts[1], 10);
      if (!isNaN(parsedPort)) port = parsedPort;
    }

    setStatus('connecting');
    setErrorMsg('');

    const success = await onConnect(host, port);
    if (success) {
      setStatus('success');
      setTimeout(() => {
        setIp('');
        setStatus('idle');
      }, 1500);
    } else {
      setStatus('error');
      setErrorMsg('Device not found. Check IP and make sure HyperDrop is open.');
      setTimeout(() => setStatus('idle'), 3000);
    }
  }, [ip, onConnect]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            placeholder="192.168.43.1"
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500/40 focus:bg-white/[0.06] transition-all font-mono"
            disabled={status === 'connecting'}
          />
        </div>
        <button
          type="button"
          onClick={handleConnect}
          disabled={!ip.trim() || status === 'connecting'}
          className={`px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2
            ${status === 'connecting'
              ? 'bg-brand-500/20 text-brand-400 border border-brand-500/20'
              : status === 'success'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
              : status === 'error'
              ? 'bg-red-500/20 text-red-400 border border-red-500/20'
              : 'bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20 active:scale-95'
            }`}
        >
          {status === 'connecting' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : status === 'success' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : status === 'error' ? (
            <XCircle className="h-4 w-4" />
          ) : (
            <Wifi className="h-4 w-4" />
          )}
          {status === 'connecting' ? '...' : status === 'success' ? 'OK' : 'Connect'}
        </button>
      </div>

      <AnimatePresence>
        {errorMsg && (
          <motion.p
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="text-[11px] text-red-400/80 px-1"
          >
            {errorMsg}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

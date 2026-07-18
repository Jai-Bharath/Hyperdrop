import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Loader2 } from 'lucide-react';

interface QRCodeDisplayProps {
  url: string;
  size?: number;
}

import { useStore } from '../store/useStore';

export default function QRCodeDisplay({ url, size = 200 }: QRCodeDisplayProps) {
  const [svg, setSvg] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    QRCode.toString(url, {
      type: 'svg',
      width: size,
      margin: 1,
      color: {
        dark: isDark ? '#f1f5f9' : '#0f172a',
        light: '#00000000',
      },
    })
      .then((result) => {
        if (!cancelled) {
          setSvg(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to generate QR code');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url, size, theme]);

  if (loading) {
    return (
      <div
        id="qr-loading"
        className="flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <Loader2 className="h-8 w-8 text-brand-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        id="qr-error"
        className="flex items-center justify-center text-xs text-red-400"
        style={{ width: size, height: size }}
      >
        {error}
      </div>
    );
  }

  return (
    <div
      id="qr-code"
      className="rounded-xl bg-white/5 p-3"
      style={{ width: size + 24, height: size + 24 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

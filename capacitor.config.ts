import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.hyperdrop.transfer',
  appName: 'HyperDrop',
  webDir: 'dist',
  server: {
    // CRITICAL: Must be 'http' for LAN file transfers.
    // Using 'https' causes the WebView to block fetch() to http:// LAN IPs
    // as "mixed content" (HTTPS page → HTTP request = blocked).
    // Since HyperDrop is a LAN app with no TLS on local servers, we need HTTP.
    androidScheme: 'http',
    cleartext: true,
    allowMixedContent: true,
    // Allow WebView to make requests to LAN devices (zero-cloud — no Render)
    allowNavigation: [
      '192.168.*',
      '10.*',
      '172.16.*',
      '172.17.*',
      '172.18.*',
      '172.19.*',
      '172.20.*',
      '172.21.*',
      '172.22.*',
      '172.23.*',
      '172.24.*',
      '172.25.*',
      '172.26.*',
      '172.27.*',
      '172.28.*',
      '172.29.*',
      '172.30.*',
      '172.31.*',
      'localhost',
    ],
  },
  plugins: {
    CapacitorHttp: {
      // Disable Capacitor's HTTP proxy — we need direct fetch() to peer IPs
      enabled: false,
    },
  },
};

export default config;

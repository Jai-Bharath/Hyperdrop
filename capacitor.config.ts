import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.hyperdrop.transfer',
  appName: 'HyperDrop',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
    // Allow WebView to make requests to cloud signaling and LAN servers
    allowNavigation: [
      'hyperdrop-tzjv.onrender.com',
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
      enabled: false,
    },
  },
};

export default config;

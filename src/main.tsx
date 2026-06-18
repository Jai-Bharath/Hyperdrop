import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);

// ── Register Service Worker for offline support ──────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('[SW] Registered:', reg.scope);

        // Auto-update check every 60 seconds
        setInterval(() => reg.update(), 60 * 1000);

        // Notify user when a new version is available
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                console.log('[SW] New version available — refresh to update');
              }
            });
          }
        });
      })
      .catch((err) => console.warn('[SW] Registration failed:', err));
  });
}

// ── Prevent accidental page reload during active transfers ──────────
window.addEventListener('beforeunload', (e) => {
  try {
    // If we are currently triggering a file download, do not block it
    if ((window as any).__hyperdrop_is_downloading) {
      return;
    }
    // Check the live store state via global reference (set by App component)
    const getState = (window as any).__hyperdrop_getState;
    if (!getState) return;
    const transfers = getState().transfers || [];
    const hasActive = transfers.some(
      (t: any) => t.status === 'transferring' || t.status === 'pending'
    );
    if (hasActive) {
      e.preventDefault();
      e.returnValue = 'File transfer in progress. If you leave, you will need to restart the transfer.';
      return e.returnValue;
    }
  } catch {
    // Ignore
  }
});

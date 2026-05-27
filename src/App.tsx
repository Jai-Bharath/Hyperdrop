import React, { Component, ErrorInfo, ReactNode, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Send from './pages/Send';
import Receive from './pages/Receive';
import History from './pages/History';
import { useSocket } from './hooks/useSocket';
import { useStore } from './store/useStore';

// ─── Error Boundary ─────────────────────────────────────────────────
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-[#0f0f13] px-6 text-center">
          <div className="card max-w-md space-y-6 p-8 border border-red-500/20 shadow-[0_0_50px_rgba(239,68,68,0.1)]">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-500 mx-auto">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-100">Something went wrong</h2>
              <p className="text-sm text-slate-400">
                An unexpected interface rendering error has occurred. HyperDrop remains active in the background.
              </p>
              {this.state.error && (
                <pre className="mt-4 p-3 rounded bg-black/40 text-left font-mono text-xs text-red-400 overflow-x-auto max-w-full">
                  {this.state.error.message}
                </pre>
              )}
            </div>
            <button
              onClick={this.handleRetry}
              className="btn-primary w-full py-3 text-sm font-semibold glow-brand"
            >
              Reset Interface
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ─── Socket Manager Component ────────────────────────────────────────
// Mounts the useSocket hook at the top level to preserve the connection
function SocketManager({ children }: { children: ReactNode }) {
  useSocket();
  return <>{children}</>;
}

// ─── App Entry point ────────────────────────────────────────────────
export default function App() {
  const setDeferredPrompt = useStore((state) => state.setDeferredPrompt);

  useEffect(() => {
    // If the event was already captured by the early script in index.html, load it immediately
    if ((window as any).deferredPrompt) {
      setDeferredPrompt((window as any).deferredPrompt);
      console.log('[PWA] Early beforeinstallprompt loaded');
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      (window as any).deferredPrompt = e;
      console.log('[PWA] beforeinstallprompt event captured');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Register dynamic fallback callback in case it fires while React is loading
    (window as any).onDeferredPromptCaptured = (e: any) => {
      setDeferredPrompt(e);
    };

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      delete (window as any).onDeferredPromptCaptured;
    };
  }, [setDeferredPrompt]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <SocketManager>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="send" element={<Send />} />
              <Route path="receive" element={<Receive />} />
              <Route path="history" element={<History />} />
            </Route>
          </Routes>
        </SocketManager>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

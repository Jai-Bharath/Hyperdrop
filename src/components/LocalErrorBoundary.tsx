import React, { Component, ErrorInfo, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  navigate: (to: string) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class LocalErrorBoundaryClass extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[LocalErrorBoundary] Sub-page render crash caught:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.navigate('/');
  };

  public render() {
    if (this.state.hasError) {
      return (
        <motion.div
          className="mx-auto max-w-md p-6 my-10"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="card border border-red-500/20 bg-gradient-to-b from-[#1b1015] to-[#0f0b0d] p-6 shadow-2xl space-y-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-400 mx-auto border border-red-500/25">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-bold text-slate-100 font-sans">Component Glitch Recovered</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                An interface drawing error occurred in this view. Your localized peer connection and background transfers are still running safely!
              </p>
              {this.state.error && (
                <div className="mt-3 p-3 rounded-xl bg-black/50 border border-white/5 text-left overflow-x-auto max-h-32">
                  <pre className="font-mono text-[10px] text-red-400 leading-normal">
                    {this.state.error.message}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-xs font-bold text-slate-100 shadow-lg shadow-brand-500/20 transition-all active:scale-[0.98]"
              >
                <Home className="h-4 w-4" />
                Go to Home
              </button>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300 transition-all active:scale-[0.98]"
                title="Retry Render"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      );
    }

    return this.props.children;
  }
}

export default function LocalErrorBoundary({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <LocalErrorBoundaryClass navigate={navigate}>
      {children}
    </LocalErrorBoundaryClass>
  );
}

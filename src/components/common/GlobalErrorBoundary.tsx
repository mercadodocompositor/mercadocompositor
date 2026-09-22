import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { captureException } from '../../lib/monitoring';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GlobalErrorBoundary extends React.Component<Props, State> {
  declare readonly props: Readonly<Props>;
  declare setState: React.Component<Props, State>['setState'];

  state: State = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown) {
    console.error('Uncaught error caught by GlobalErrorBoundary:', error);
    captureException(error, { boundary: 'global' });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#060B18] text-white flex items-center justify-center p-4 font-sans selection:bg-amber-500 selection:text-white">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-2xl animate-scaleUp">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Algo inesperado aconteceu
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Identificamos uma inconsistência momentânea na renderização da página. Suas informações salvas permanecem seguras.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-left font-mono text-[11px] text-rose-300 max-h-32 overflow-y-auto">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Tentar Novamente</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center justify-center gap-2 transition"
              >
                <Home className="w-4 h-4" />
                <span>Página Inicial</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

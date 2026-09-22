import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { captureException } from '../../lib/monitoring';

interface State {
  hasError: boolean;
}

interface Props {
  children: React.ReactNode;
  resetKey?: string;
}

export class DashboardErrorBoundary extends React.Component<Props, State> {
  declare readonly props: Readonly<Props>;
  declare setState: React.Component<Props, State>['setState'];
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Falha ao renderizar o dashboard:', error);
    captureException(error, { boundary: 'dashboard' });
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section role="alert" className="rounded-2xl border border-red-200 dark:border-red-900/40 bg-white dark:bg-slate-900 p-8 text-center shadow-sm">
        <AlertTriangle className="mx-auto h-10 w-10 text-red-500" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">Não foi possível exibir esta área</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600 dark:text-slate-400">
          Ocorreu uma falha inesperada. Recarregue a página para buscar os dados novamente.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Tentar novamente
        </button>
      </section>
    );
  }
}

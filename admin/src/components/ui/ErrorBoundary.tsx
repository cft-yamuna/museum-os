import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 'app' fills the viewport (catastrophic); 'route' keeps the app shell. */
  variant?: 'app' | 'route';
  /** When this value changes, the boundary clears its captured error. */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches uncaught render/lifecycle errors so a single broken component can't
 * blank the whole admin. Used at the app root and around each route.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface for diagnostics. Replace with an error-tracking sink (e.g. Sentry)
    // when one is added (see Phase 0 "error tracking").
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isRoute = this.props.variant === 'route';

    return (
      <div
        className={
          isRoute
            ? 'flex min-h-[50vh] items-center justify-center p-6'
            : 'page-bg flex min-h-dvh items-center justify-center p-6'
        }
      >
        <div className="admin-card w-full max-w-md rounded-2xl p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-surface-900">Something went wrong</h2>
          <p className="mt-1 text-sm text-surface-500">
            {isRoute
              ? 'This page hit an unexpected error. You can retry, or use the navigation to go elsewhere.'
              : 'The application hit an unexpected error.'}
          </p>
          {error.message && (
            <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-surface-100 p-2 text-left text-xs text-surface-600">
              {error.message}
            </pre>
          )}
          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-surface-300 px-3 py-2 text-sm font-semibold text-surface-700 hover:bg-surface-100"
            >
              <RotateCcw className="h-4 w-4" /> Try again
            </button>
            <button
              onClick={this.handleReload}
              className="rounded-xl bg-surface-900 px-3 py-2 text-sm font-semibold text-white hover:bg-surface-800"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import './ErrorBoundary.css';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Kiosk Error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" onPointerUp={this.handleReset}>
          <div className="error-boundary__content">
            <h2 className="error-boundary__title">Something went wrong</h2>
            <p className="error-boundary__message">
              Tap anywhere to restart the experience
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

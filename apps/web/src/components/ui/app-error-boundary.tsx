import { Component, type ErrorInfo, type ReactNode } from 'react';

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: ''
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Unexpected error.'
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info);
  }

  private onReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="centered-page">
        <div className="verify-card error-boundary-card">
          <p className="auth-kicker">Frontend Error</p>
          <h1>Something Went Wrong</h1>
          <p className="muted">
            The page encountered an unexpected error. Reload to continue.
          </p>
          <div className="feedback feedback-error">{this.state.message}</div>
          <button className="btn" onClick={this.onReload} type="button">
            Reload Application
          </button>
        </div>
      </div>
    );
  }
}

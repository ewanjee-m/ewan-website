"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface WorldErrorBoundaryProps {
  children: ReactNode;
  resetKey: number;
  onRetry: () => void;
  fallback: (context: { error: Error; retry: () => void }) => ReactNode;
}

interface WorldErrorBoundaryState {
  failed: boolean;
  error: Error | null;
}

export class WorldErrorBoundary extends Component<
  WorldErrorBoundaryProps,
  WorldErrorBoundaryState
> {
  state: WorldErrorBoundaryState = { failed: false, error: null };

  static getDerivedStateFromError(error: Error): WorldErrorBoundaryState {
    return { failed: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("World render failed", error, errorInfo);
  }

  componentDidUpdate(previousProps: WorldErrorBoundaryProps) {
    if (
      previousProps.resetKey !== this.props.resetKey &&
      this.state.failed
    ) {
      this.setState({ failed: false, error: null });
    }
  }

  private retry = () => {
    this.props.onRetry();
  };

  render() {
    return this.state.failed && this.state.error
      ? this.props.fallback({
          error: this.state.error,
          retry: this.retry
        })
      : this.props.children;
  }
}

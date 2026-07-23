"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface WorldErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface WorldErrorBoundaryState {
  failed: boolean;
}

export class WorldErrorBoundary extends Component<
  WorldErrorBoundaryProps,
  WorldErrorBoundaryState
> {
  state: WorldErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): WorldErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("World render failed", error, errorInfo);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

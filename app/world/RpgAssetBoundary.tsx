"use client";

import {
  Component,
  type ReactNode
} from "react";

interface RpgAssetBoundaryProps {
  readonly assetId: string;
  readonly children: ReactNode;
  readonly fallback: ReactNode;
  readonly onError?: (error: Error) => void;
}

interface RpgAssetBoundaryState {
  readonly error: Error | null;
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

export class RpgAssetBoundary extends Component<
  RpgAssetBoundaryProps,
  RpgAssetBoundaryState
> {
  state: RpgAssetBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): RpgAssetBoundaryState {
    return { error: normalizeError(error) };
  }

  componentDidCatch(error: Error) {
    console.error({
      assetId: this.props.assetId,
      errorName: error.name
    });
    this.props.onError?.(error);
  }

  render() {
    return this.state.error === null
      ? this.props.children
      : this.props.fallback;
  }
}

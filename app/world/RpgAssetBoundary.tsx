"use client";

import {
  Component,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";

interface RpgAssetBoundaryProps {
  readonly assetId: string;
  readonly children: ReactNode;
  readonly fallback: ReactNode;
  readonly onError?: (error: Error) => void;
}

interface RpgAssetAvailabilityGateProps extends RpgAssetBoundaryProps {
  readonly src: string;
  readonly onAvailable?: () => void;
}

interface RpgAssetBoundaryState {
  readonly error: Error | null;
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

type AssetAvailability =
  | { readonly available: true }
  | { readonly available: false; readonly errorName: string };

const assetAvailabilityCache = new Map<
  string,
  Promise<AssetAvailability>
>();

function checkAssetAvailability(src: string) {
  const cached = assetAvailabilityCache.get(src);
  if (cached) return cached;
  const request = fetch(src, { cache: "force-cache" })
    .then<AssetAvailability>((response) =>
      response.ok
        ? { available: true }
        : { available: false, errorName: "AssetHttpError" }
    )
    .catch((error: unknown): AssetAvailability => ({
      available: false,
      errorName: error instanceof Error ? error.name : "AssetNetworkError"
    }));
  assetAvailabilityCache.set(src, request);
  return request;
}

export function clearRpgAssetAvailabilityCacheForTests() {
  assetAvailabilityCache.clear();
}

export function RpgAssetAvailabilityGate({
  assetId,
  src,
  children,
  fallback,
  onAvailable,
  onError
}: RpgAssetAvailabilityGateProps) {
  const [availability, setAvailability] =
    useState<AssetAvailability | null>(null);
  const onAvailableRef = useRef(onAvailable);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onAvailableRef.current = onAvailable;
    onErrorRef.current = onError;
  }, [onAvailable, onError]);

  useEffect(() => {
    let active = true;
    void checkAssetAvailability(src).then((result) => {
      if (!active) return;
      setAvailability(result);
      if (result.available) {
        onAvailableRef.current?.();
      } else {
        const error = new Error("Asset unavailable");
        error.name = result.errorName;
        console.error({ assetId, errorName: result.errorName });
        onErrorRef.current?.(error);
      }
    });
    return () => {
      active = false;
    };
  }, [assetId, src]);

  return availability?.available ? children : fallback;
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

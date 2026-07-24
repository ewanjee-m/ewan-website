"use client";

import {
  Component,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { DefaultLoadingManager } from "three";

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

interface AssetResource {
  readonly controller: AbortController;
  promise: Promise<AssetAvailability>;
  subscribers: number;
  settled: boolean;
  objectUrl: string | null;
}

const assetResources = new Map<string, AssetResource>();
const resolvedAssetUrls = new Map<string, string>();

DefaultLoadingManager.setURLModifier(
  (url) => resolvedAssetUrls.get(url) ?? url
);

function createAssetResource(src: string): AssetResource {
  const controller = new AbortController();
  const resource: AssetResource = {
    controller,
    subscribers: 0,
    settled: false,
    objectUrl: null,
    promise: Promise.resolve({ available: false, errorName: "AssetNetworkError" })
  };
  resource.promise = fetch(src, {
    cache: "force-cache",
    signal: controller.signal
  })
    .then(async (response): Promise<AssetAvailability> => {
      if (!response.ok) {
        return { available: false, errorName: "AssetHttpError" };
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      resource.objectUrl = objectUrl;
      resolvedAssetUrls.set(src, objectUrl);
      return { available: true };
    })
    .catch((error: unknown): AssetAvailability => ({
      available: false,
      errorName: error instanceof Error ? error.name : "AssetNetworkError"
    }))
    .then((result) => {
      resource.settled = true;
      if (!result.available && assetResources.get(src) === resource) {
        assetResources.delete(src);
      }
      return result;
    });
  assetResources.set(src, resource);
  return resource;
}

function subscribeToAsset(src: string) {
  const resource = assetResources.get(src) ?? createAssetResource(src);
  resource.subscribers += 1;
  let released = false;
  return {
    promise: resource.promise,
    release() {
      if (released) return;
      released = true;
      resource.subscribers -= 1;
      if (resource.subscribers === 0 && !resource.settled) {
        if (assetResources.get(src) === resource) {
          assetResources.delete(src);
        }
        resource.controller.abort();
      }
    }
  };
}

export function clearRpgAssetAvailabilityCacheForTests() {
  for (const resource of assetResources.values()) {
    if (!resource.settled) resource.controller.abort();
    if (resource.objectUrl) URL.revokeObjectURL(resource.objectUrl);
  }
  assetResources.clear();
  resolvedAssetUrls.clear();
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
    const subscription = subscribeToAsset(src);
    void subscription.promise.then((result) => {
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
      subscription.release();
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

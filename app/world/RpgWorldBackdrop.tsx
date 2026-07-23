"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties
} from "react";
import type { RpgReferenceViewportTransform } from "./RpgReferenceSceneComposition";

export const RPG_WORLD_BACKDROP_ASSET =
  "/assets/world/world-environment-concept.png" as const;
export const RPG_WORLD_BACKDROP_IMAGE_SIZE = [1817, 866] as const;
export const RPG_WORLD_BACKDROP_MOBILE_SAFE_FRAME = {
  x: 0,
  y: 64,
  width: 390,
  height: 420
} as const;

export interface RpgWorldBackdropSafeFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RpgWorldBackdropPlacement {
  /** Horizontal offset into the approved image, in source-image pixels. */
  readonly sourceOffset: number;
  /** CSS pixels per source-image pixel. */
  readonly backdropScale: number;
  /** Viewport rectangle that may reveal the backdrop. */
  readonly safeFrame: RpgWorldBackdropSafeFrame;
}

export interface RpgWorldBackdropLayout {
  readonly asset: typeof RPG_WORLD_BACKDROP_ASSET;
  readonly imageSize: typeof RPG_WORLD_BACKDROP_IMAGE_SIZE;
  readonly safeFrame: RpgWorldBackdropSafeFrame;
  readonly sourceWindow: {
    readonly minimumX: number;
    readonly maximumX: number;
    readonly minimumY: number;
    readonly maximumY: number;
  };
  readonly imageFrame: RpgWorldBackdropSafeFrame;
  readonly renderPolicy: {
    readonly imageInstances: 1;
    readonly repeat: false;
    readonly opacity: 1;
    readonly filter: "none";
    readonly mixBlendMode: "normal";
    readonly canvasToneMapped: false;
    readonly canvasFog: false;
  };
}

export interface RpgWorldBackdropHandle {
  /** Applies a measured layout to the mounted wrapper and its single image. */
  applyLayout(input: RpgWorldBackdropPlacement): boolean;
  /** Applies the exact shared frame transaction owned by scene composition. */
  applyTransform(transform: RpgReferenceViewportTransform): boolean;
}

const LAYOUT_EPSILON = 1e-6;

export interface RpgWorldApprovedHtmlImageFrame {
  readonly safeFrame: RpgWorldBackdropSafeFrame;
  readonly imageFrame: RpgWorldBackdropSafeFrame;
}

export const RPG_WORLD_APPROVED_HTML_IMAGE_RENDER_STYLE = Object.freeze({
  position: "absolute",
  maxWidth: "none",
  display: "block",
  opacity: 1,
  filter: "none",
  mixBlendMode: "normal",
  userSelect: "none"
} as const satisfies CSSProperties);

export function resolveRpgWorldApprovedHtmlImageStyle({
  safeFrame,
  imageFrame
}: RpgWorldApprovedHtmlImageFrame): CSSProperties {
  return {
    ...RPG_WORLD_APPROVED_HTML_IMAGE_RENDER_STYLE,
    left: `${imageFrame.x - safeFrame.x}px`,
    top: `${imageFrame.y - safeFrame.y}px`,
    width: `${imageFrame.width}px`,
    height: `${imageFrame.height}px`
  };
}

function finiteNonNegative(value: number) {
  return Number.isFinite(value) && value >= 0;
}

export function resolveRpgWorldBackdropLayout({
  sourceOffset,
  backdropScale,
  safeFrame
}: RpgWorldBackdropPlacement): RpgWorldBackdropLayout | null {
  if (
    !finiteNonNegative(sourceOffset) ||
    !Number.isFinite(backdropScale) ||
    backdropScale <= 0 ||
    !finiteNonNegative(safeFrame.x) ||
    !finiteNonNegative(safeFrame.y) ||
    !Number.isFinite(safeFrame.width) ||
    !Number.isFinite(safeFrame.height) ||
    safeFrame.width <= 0 ||
    safeFrame.height <= 0
  ) {
    return null;
  }

  const [imageWidth, imageHeight] = RPG_WORLD_BACKDROP_IMAGE_SIZE;
  const renderedWidth = imageWidth * backdropScale;
  const renderedHeight = imageHeight * backdropScale;
  const sourceWindowWidth = safeFrame.width / backdropScale;
  const maximumSourceX = sourceOffset + sourceWindowWidth;
  if (
    Math.abs(renderedHeight - safeFrame.height) > LAYOUT_EPSILON ||
    maximumSourceX > imageWidth + LAYOUT_EPSILON
  ) {
    return null;
  }

  return {
    asset: RPG_WORLD_BACKDROP_ASSET,
    imageSize: RPG_WORLD_BACKDROP_IMAGE_SIZE,
    safeFrame: { ...safeFrame },
    sourceWindow: {
      minimumX: sourceOffset,
      maximumX: maximumSourceX,
      minimumY: 0,
      maximumY: imageHeight
    },
    imageFrame: {
      x: safeFrame.x - sourceOffset * backdropScale,
      y: safeFrame.y,
      width: renderedWidth,
      height: renderedHeight
    },
    renderPolicy: {
      imageInstances: 1,
      repeat: false,
      opacity: 1,
      filter: "none",
      mixBlendMode: "normal",
      canvasToneMapped: false,
      canvasFog: false
    }
  };
}

function writeLayoutTelemetry(
  frame: HTMLElement,
  image: HTMLImageElement,
  input: RpgWorldBackdropPlacement,
  layout: RpgWorldBackdropLayout
) {
  frame.dataset.rpgWorldBackdropLayout = "valid";
  frame.dataset.rpgWorldBackdropImageCount = "1";
  frame.dataset.rpgWorldBackdropAsset = layout.asset;
  frame.dataset.rpgWorldBackdropSourceOffset = String(input.sourceOffset);
  frame.dataset.rpgWorldBackdropScale = String(input.backdropScale);
  frame.dataset.rpgWorldBackdropSafeFrame = [
    layout.safeFrame.x,
    layout.safeFrame.y,
    layout.safeFrame.width,
    layout.safeFrame.height
  ].join(",");
  frame.dataset.rpgWorldBackdropSafeFrameX = String(layout.safeFrame.x);
  frame.dataset.rpgWorldBackdropSafeFrameY = String(layout.safeFrame.y);
  frame.dataset.rpgWorldBackdropSafeFrameWidth = String(
    layout.safeFrame.width
  );
  frame.dataset.rpgWorldBackdropSafeFrameHeight = String(
    layout.safeFrame.height
  );
  image.dataset.rpgWorldBackdropAsset = layout.asset;
}

function writeTransformTelemetry(
  element: HTMLElement,
  transform: RpgReferenceViewportTransform
) {
  const identity = `${transform.navigationRevision}:${transform.revision}`;
  element.dataset.rpgReferenceTransformRevision = String(transform.revision);
  element.dataset.rpgReferenceNavigationRevision = String(
    transform.navigationRevision
  );
  element.dataset.rpgReferenceTransformIdentity = identity;
  element.dataset.rpgReferenceImageFrame = [
    transform.imageFrame.x,
    transform.imageFrame.y,
    transform.imageFrame.width,
    transform.imageFrame.height
  ].join(",");
  element.dataset.rpgReferenceSafeFrame = [
    transform.safeFrame.x,
    transform.safeFrame.y,
    transform.safeFrame.width,
    transform.safeFrame.height
  ].join(",");
}

function validRpgWorldBackdropTransform(
  transform: RpgReferenceViewportTransform
) {
  const [imageWidth, imageHeight] = RPG_WORLD_BACKDROP_IMAGE_SIZE;
  const maximumSourceX =
    transform.sourceOffsetX + transform.safeFrame.width / transform.scale;
  const maximumSourceY =
    transform.sourceOffsetY + transform.safeFrame.height / transform.scale;
  return (
    Number.isFinite(transform.scale) &&
    transform.scale > 0 &&
    transform.imageFrame.width === imageWidth * transform.scale &&
    transform.imageFrame.height === imageHeight * transform.scale &&
    transform.sourceOffsetX >= 0 &&
    transform.sourceOffsetY >= 0 &&
    maximumSourceX <= imageWidth + LAYOUT_EPSILON &&
    maximumSourceY <= imageHeight + LAYOUT_EPSILON
  );
}

export function applyRpgWorldApprovedHtmlImageTransform(
  transform: RpgReferenceViewportTransform,
  image: HTMLImageElement
) {
  if (
    !validRpgWorldBackdropTransform(transform) ||
    image.getAttribute("src") !== RPG_WORLD_BACKDROP_ASSET
  ) {
    return false;
  }
  Object.assign(
    image.style,
    resolveRpgWorldApprovedHtmlImageStyle(transform)
  );
  writeTransformTelemetry(image, transform);
  return true;
}

export function applyRpgWorldBackdropTransform(
  transform: RpgReferenceViewportTransform,
  frame: HTMLElement,
  image: HTMLImageElement
) {
  if (!validRpgWorldBackdropTransform(transform)) {
    frame.hidden = true;
    frame.dataset.rpgWorldBackdropLayout = "invalid";
    return false;
  }
  frame.hidden = false;
  frame.style.position = "absolute";
  frame.style.left = `${transform.safeFrame.x}px`;
  frame.style.top = `${transform.safeFrame.y}px`;
  frame.style.width = `${transform.safeFrame.width}px`;
  frame.style.height = `${transform.safeFrame.height}px`;
  frame.style.overflow = "hidden";
  frame.style.pointerEvents = "none";
  frame.style.background = "transparent";
  if (!applyRpgWorldApprovedHtmlImageTransform(transform, image)) {
    frame.hidden = true;
    frame.dataset.rpgWorldBackdropLayout = "invalid";
    return false;
  }
  frame.dataset.rpgWorldBackdropLayout = "valid";
  frame.dataset.rpgWorldBackdropSourceOffset = String(transform.sourceOffsetX);
  frame.dataset.rpgWorldBackdropSourceOffsetY = String(transform.sourceOffsetY);
  frame.dataset.rpgWorldBackdropScale = String(transform.scale);
  frame.dataset.rpgWorldBackdropSafeFrame = [
    transform.safeFrame.x,
    transform.safeFrame.y,
    transform.safeFrame.width,
    transform.safeFrame.height
  ].join(",");
  writeTransformTelemetry(frame, transform);
  return true;
}

/** Applies a resolved placement without creating or replacing either DOM node. */
export function applyRpgWorldBackdropLayout(
  input: RpgWorldBackdropPlacement,
  frame: HTMLElement,
  image: HTMLImageElement
): RpgWorldBackdropLayout | null {
  const layout = resolveRpgWorldBackdropLayout(input);
  if (!layout) {
    frame.hidden = true;
    frame.dataset.rpgWorldBackdropLayout = "invalid";
    return null;
  }

  frame.hidden = false;
  frame.style.position = "absolute";
  frame.style.left = `${layout.safeFrame.x}px`;
  frame.style.top = `${layout.safeFrame.y}px`;
  frame.style.width = `${layout.safeFrame.width}px`;
  frame.style.height = `${layout.safeFrame.height}px`;
  frame.style.overflow = "hidden";
  frame.style.pointerEvents = "none";
  frame.style.background = "transparent";
  Object.assign(image.style, resolveRpgWorldApprovedHtmlImageStyle(layout));
  writeLayoutTelemetry(frame, image, input, layout);
  return layout;
}

export interface RpgWorldBackdropProps extends RpgWorldBackdropPlacement {
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly onReadyChange?: (ready: boolean) => void;
  readonly sharedTransform?: RpgReferenceViewportTransform;
}

function layoutFromSharedTransform(
  transform: RpgReferenceViewportTransform
): RpgWorldBackdropLayout {
  return {
    asset: RPG_WORLD_BACKDROP_ASSET,
    imageSize: RPG_WORLD_BACKDROP_IMAGE_SIZE,
    safeFrame: { ...transform.safeFrame },
    sourceWindow: {
      minimumX: transform.sourceOffsetX,
      maximumX:
        transform.sourceOffsetX + transform.safeFrame.width / transform.scale,
      minimumY: transform.sourceOffsetY,
      maximumY:
        transform.sourceOffsetY + transform.safeFrame.height / transform.scale
    },
    imageFrame: { ...transform.imageFrame },
    renderPolicy: {
      imageInstances: 1,
      repeat: false,
      opacity: 1,
      filter: "none",
      mixBlendMode: "normal",
      canvasToneMapped: false,
      canvasFog: false
    }
  };
}

function writeDecodeTelemetry(
  frame: HTMLElement | null,
  state: "pending" | "ready" | "error" | "source-error",
  supported: boolean,
  ready: boolean
) {
  if (!frame) return;
  frame.dataset.rpgWorldBackdropDecode = state;
  frame.dataset.rpgWorldBackdropDecodeSupported = String(supported);
  frame.dataset.rpgWorldBackdropDecodeReady = String(ready);
}

export const RpgWorldBackdrop = forwardRef<
  RpgWorldBackdropHandle,
  RpgWorldBackdropProps
>(function RpgWorldBackdrop(
  { className, style, onReadyChange, sharedTransform, ...placement },
  forwardedRef
) {
  const layout = sharedTransform
    ? layoutFromSharedTransform(sharedTransform)
    : resolveRpgWorldBackdropLayout(placement);
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const mountedRef = useRef(false);
  const decodedRef = useRef(false);
  const readyRef = useRef(false);
  const layoutValidRef = useRef(layout !== null);
  const decodeGenerationRef = useRef(0);
  const onReadyChangeRef = useRef(onReadyChange);
  onReadyChangeRef.current = onReadyChange;
  layoutValidRef.current = layout !== null;

  const setReady = useCallback((nextReady: boolean) => {
    const ready = nextReady && decodedRef.current && layoutValidRef.current;
    const frame = frameRef.current;
    if (frame) {
      frame.dataset.rpgWorldBackdropReady = String(ready);
    }
    if (readyRef.current === ready) return;
    readyRef.current = ready;
    onReadyChangeRef.current?.(ready);
  }, []);

  const beginDecode = useCallback(
    (image: HTMLImageElement) => {
      const generation = ++decodeGenerationRef.current;
      const decodeSupported = typeof image.decode === "function";
      decodedRef.current = false;
      writeDecodeTelemetry(frameRef.current, "pending", decodeSupported, false);
      setReady(false);

      if (image.getAttribute("src") !== RPG_WORLD_BACKDROP_ASSET) {
        writeDecodeTelemetry(
          frameRef.current,
          "source-error",
          decodeSupported,
          false
        );
        return;
      }

      const finish = (error: boolean) => {
        if (
          !mountedRef.current ||
          generation !== decodeGenerationRef.current ||
          imageRef.current !== image
        ) {
          return;
        }
        if (
          error ||
          image.getAttribute("src") !== RPG_WORLD_BACKDROP_ASSET
        ) {
          decodedRef.current = false;
          writeDecodeTelemetry(
            frameRef.current,
            error ? "error" : "source-error",
            decodeSupported,
            false
          );
          setReady(false);
          return;
        }
        decodedRef.current = true;
        writeDecodeTelemetry(frameRef.current, "ready", decodeSupported, true);
        setReady(true);
      };

      if (!decodeSupported) {
        finish(false);
        return;
      }
      try {
        void image.decode().then(
          () => finish(false),
          () => finish(true)
        );
      } catch {
        finish(true);
      }
    },
    [setReady]
  );

  const handleImageError = useCallback(() => {
    decodeGenerationRef.current += 1;
    decodedRef.current = false;
    writeDecodeTelemetry(
      frameRef.current,
      "error",
      typeof imageRef.current?.decode === "function",
      false
    );
    setReady(false);
  }, [setReady]);

  const applyLayout = useCallback(
    (input: RpgWorldBackdropPlacement) => {
      const frame = frameRef.current;
      const image = imageRef.current;
      if (!frame || !image) return false;
      const nextLayout = applyRpgWorldBackdropLayout(input, frame, image);
      layoutValidRef.current = nextLayout !== null;
      setReady(nextLayout !== null && decodedRef.current);
      return nextLayout !== null;
    },
    [setReady]
  );

  const applyTransform = useCallback(
    (transform: RpgReferenceViewportTransform) => {
      const frame = frameRef.current;
      const image = imageRef.current;
      if (!frame || !image) return false;
      const valid = applyRpgWorldBackdropTransform(transform, frame, image);
      layoutValidRef.current = valid;
      setReady(valid && decodedRef.current);
      return valid;
    },
    [setReady]
  );

  useImperativeHandle(
    forwardedRef,
    () => ({ applyLayout, applyTransform }),
    [applyLayout, applyTransform]
  );

  useEffect(() => {
    mountedRef.current = true;
    onReadyChangeRef.current?.(false);
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      beginDecode(image);
    }
    return () => {
      decodeGenerationRef.current += 1;
      decodedRef.current = false;
      setReady(false);
      mountedRef.current = false;
    };
  }, [beginDecode, setReady]);

  useEffect(() => {
    if (layout !== null) return;
    decodeGenerationRef.current += 1;
    decodedRef.current = false;
    setReady(false);
  }, [layout, setReady]);

  if (!layout) return null;

  const approvedImageStyle = resolveRpgWorldApprovedHtmlImageStyle(layout);
  return (
    <div
      ref={frameRef}
      aria-hidden="true"
      className={className}
      data-rpg-world-backdrop="approved-image"
      data-rpg-world-backdrop-layout="valid"
      data-rpg-world-backdrop-image-count="1"
      data-rpg-world-backdrop-asset={layout.asset}
      data-rpg-world-backdrop-source-offset={placement.sourceOffset}
      data-rpg-world-backdrop-source-offset-y={
        sharedTransform?.sourceOffsetY ?? 0
      }
      data-rpg-world-backdrop-scale={placement.backdropScale}
      data-rpg-world-backdrop-safe-frame={[
        layout.safeFrame.x,
        layout.safeFrame.y,
        layout.safeFrame.width,
        layout.safeFrame.height
      ].join(",")}
      data-rpg-world-backdrop-safe-frame-x={layout.safeFrame.x}
      data-rpg-world-backdrop-safe-frame-y={layout.safeFrame.y}
      data-rpg-world-backdrop-safe-frame-width={layout.safeFrame.width}
      data-rpg-world-backdrop-safe-frame-height={layout.safeFrame.height}
      data-rpg-world-backdrop-ready="false"
      data-rpg-reference-transform-revision={sharedTransform?.revision}
      data-rpg-reference-navigation-revision={
        sharedTransform?.navigationRevision
      }
      data-rpg-reference-transform-identity={
        sharedTransform
          ? `${sharedTransform.navigationRevision}:${sharedTransform.revision}`
          : undefined
      }
      data-rpg-world-backdrop-decode="pending"
      data-rpg-world-backdrop-decode-supported="false"
      data-rpg-world-backdrop-decode-ready="false"
      style={{
        ...style,
        position: "absolute",
        left: layout.safeFrame.x,
        top: layout.safeFrame.y,
        width: layout.safeFrame.width,
        height: layout.safeFrame.height,
        overflow: "hidden",
        pointerEvents: "none",
        background: "transparent"
      }}
    >
      {/* A plain image keeps the approved pixels outside Three tone mapping and fog. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        alt=""
        draggable={false}
        src={layout.asset}
        data-rpg-world-backdrop-image="single"
        data-rpg-world-backdrop-asset={layout.asset}
        data-rpg-reference-transform-revision={sharedTransform?.revision}
        data-rpg-reference-navigation-revision={
          sharedTransform?.navigationRevision
        }
        data-rpg-reference-transform-identity={
          sharedTransform
            ? `${sharedTransform.navigationRevision}:${sharedTransform.revision}`
            : undefined
        }
        data-rpg-reference-image-frame={
          sharedTransform
            ? [
                sharedTransform.imageFrame.x,
                sharedTransform.imageFrame.y,
                sharedTransform.imageFrame.width,
                sharedTransform.imageFrame.height
              ].join(",")
            : undefined
        }
        data-rpg-reference-safe-frame={
          sharedTransform
            ? [
                sharedTransform.safeFrame.x,
                sharedTransform.safeFrame.y,
                sharedTransform.safeFrame.width,
                sharedTransform.safeFrame.height
              ].join(",")
            : undefined
        }
        onLoad={(event) => beginDecode(event.currentTarget)}
        onError={handleImageError}
        style={approvedImageStyle}
      />
    </div>
  );
});

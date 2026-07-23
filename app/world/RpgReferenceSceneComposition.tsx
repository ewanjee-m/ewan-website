"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type CSSProperties
} from "react";
import type { DestinationId } from "../guide/GuideContract";
import type { NavigationRegion } from "./RpgWorldGeometry";
import {
  applyRpgWorldApprovedHtmlImageTransform,
  RPG_WORLD_BACKDROP_ASSET,
  RPG_WORLD_BACKDROP_IMAGE_SIZE,
  resolveRpgWorldApprovedHtmlImageStyle
} from "./RpgWorldBackdrop";
import type { RpgWorldDepthCrossing } from "./RpgWorldDepthBands";

export type RpgReferenceViewportProfile = "desktop" | "mobile";

export interface RpgReferenceViewportFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RpgReferenceViewportTransform {
  readonly scale: number;
  readonly sourceOffsetX: number;
  readonly sourceOffsetY: number;
  readonly safeFrame: RpgReferenceViewportFrame;
  readonly imageFrame: RpgReferenceViewportFrame;
  readonly revision: number;
  readonly navigationRevision: number;
}

export interface RpgReferenceViewportTransformInput {
  readonly profile: RpgReferenceViewportProfile;
  readonly viewport?: Readonly<{
    readonly width: number;
    readonly height: number;
  }>;
  readonly referenceFoot: readonly [number, number];
  readonly navigationRegion: NavigationRegion;
  readonly revision: number;
  readonly navigationRevision: number;
}

export interface RpgReferenceViewportStepInput
  extends RpgReferenceViewportTransformInput {
  readonly previous: RpgReferenceViewportTransform | null;
  readonly previousReferenceFoot?: readonly [number, number];
  readonly atomic?: boolean;
}

export interface RpgReferenceForegroundMask {
  readonly id: string;
  readonly zoneId: DestinationId;
  readonly polygons: readonly (readonly (readonly [number, number])[])[];
}

export const RPG_REFERENCE_MOBILE_SAFE_FRAME = Object.freeze({
  x: 0,
  y: 64,
  width: 390,
  height: 780
} as const);

export const RPG_REFERENCE_DESKTOP_SAFE_FRAME = Object.freeze({
  x: 0,
  y: 0,
  width: 1440,
  height: 900
} as const);

export const RPG_REFERENCE_MAX_ORDINARY_STEP_CSS_PX = 24;
const RPG_REFERENCE_MAX_ORDINARY_AXIS_STEP_CSS_PX =
  RPG_REFERENCE_MAX_ORDINARY_STEP_CSS_PX / Math.SQRT2;
export const RPG_REFERENCE_MOBILE_SCALE = 1.3;
const DESKTOP_SCALE = 900 / 866;

export const RPG_REFERENCE_DESIRED_FOOT_Y = Object.freeze({
  airport: 690.6,
  tokyo: 655.5,
  gyukatsu: 699.7,
  sakura: 699.7,
  hanabi: 664.6
} as const satisfies Readonly<Record<DestinationId, number>>);

export const RPG_REFERENCE_FOREGROUND_MASKS = Object.freeze([
  {
    id: "airport-shelter-planter-foreground",
    zoneId: "airport",
    polygons: [
      [[431, 514], [444, 512], [447, 611], [435, 613]],
      [[444, 565], [518, 548], [532, 566], [527, 568], [458, 582], [442, 573]]
    ]
  },
  {
    id: "tokyo-street-edge-foreground",
    zoneId: "tokyo",
    polygons: [[[675, 455], [840, 430], [875, 555], [700, 575]]]
  },
  {
    id: "gyukatsu-lamp-building-foreground",
    zoneId: "gyukatsu",
    polygons: [[[930, 500], [1130, 475], [1150, 660], [920, 675]]]
  },
  {
    id: "sakura-tree-canal-rail-foreground",
    zoneId: "sakura",
    polygons: [[[1170, 490], [1395, 465], [1425, 665], [1160, 690]]]
  },
  {
    id: "hanabi-rail-post-foreground",
    zoneId: "hanabi",
    polygons: [
      [[1528, 548], [1538, 542], [1598, 597], [1588, 607]],
      [[1564, 551], [1566, 551], [1567, 618], [1565, 619]]
    ]
  }
] as const satisfies readonly RpgReferenceForegroundMask[]);

export const RPG_REFERENCE_FOREGROUND_CLIP_PATH_ID =
  "rpg-reference-foreground-mask-normalized";

export type RpgReferenceNormalizedForegroundPolygons = readonly (
  readonly (readonly [number, number])[]
)[];

export function normalizeRpgReferenceForegroundPolygons(
  polygons: readonly (readonly (readonly [number, number])[])[]
): RpgReferenceNormalizedForegroundPolygons | null {
  const [imageWidth, imageHeight] = RPG_WORLD_BACKDROP_IMAGE_SIZE;
  if (polygons.length === 0) return null;
  const normalized: (readonly (readonly [number, number])[])[] = [];
  for (const polygon of polygons) {
    if (polygon.length < 3) return null;
    let doubledArea = 0;
    const normalizedPolygon: (readonly [number, number])[] = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const point = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      if (
        point.length !== 2 ||
        next.length !== 2 ||
        !Number.isFinite(point[0]) ||
        !Number.isFinite(point[1]) ||
        !Number.isFinite(next[0]) ||
        !Number.isFinite(next[1]) ||
        point[0] < 0 ||
        point[0] > imageWidth ||
        point[1] < 0 ||
        point[1] > imageHeight
      ) {
        return null;
      }
      doubledArea += point[0] * next[1] - next[0] * point[1];
      normalizedPolygon.push(
        Object.freeze([point[0] / imageWidth, point[1] / imageHeight])
      );
    }
    if (Math.abs(doubledArea) <= Number.EPSILON) return null;
    normalized.push(Object.freeze(normalizedPolygon));
  }
  return Object.freeze(normalized);
}

const appliedTransforms = new WeakMap<Element, RpgReferenceViewportTransform>();

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(progress: number) {
  return progress * progress * (3 - 2 * progress);
}

function freezeFrame(frame: RpgReferenceViewportFrame) {
  return Object.freeze({ ...frame });
}

function desiredFootY(region: NavigationRegion) {
  if (region.kind === "zone") {
    return RPG_REFERENCE_DESIRED_FOOT_Y[region.displayZoneId];
  }
  const eased = smoothstep(region.progress);
  const from = RPG_REFERENCE_DESIRED_FOOT_Y[region.fromZoneId];
  const to = RPG_REFERENCE_DESIRED_FOOT_Y[region.toZoneId];
  return from + (to - from) * eased;
}

function resolveSafeFrame(
  input: RpgReferenceViewportTransformInput
): RpgReferenceViewportFrame | null {
  const viewport = input.viewport;
  if (!viewport) {
    return input.profile === "mobile"
      ? RPG_REFERENCE_MOBILE_SAFE_FRAME
      : RPG_REFERENCE_DESKTOP_SAFE_FRAME;
  }
  if (
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return null;
  }
  if (input.profile === "mobile") {
    const height = viewport.height - RPG_REFERENCE_MOBILE_SAFE_FRAME.y;
    if (height <= 0) return null;
    return {
      x: 0,
      y: RPG_REFERENCE_MOBILE_SAFE_FRAME.y,
      width: viewport.width,
      height
    };
  }
  return { x: 0, y: 0, width: viewport.width, height: viewport.height };
}

function createTransform(
  input: RpgReferenceViewportTransformInput,
  sourceOffsetX: number,
  sourceOffsetY: number,
  scale: number,
  safeFrame: RpgReferenceViewportFrame
): RpgReferenceViewportTransform {
  const [imageWidth, imageHeight] = RPG_WORLD_BACKDROP_IMAGE_SIZE;
  const frozenSafeFrame = freezeFrame(safeFrame);
  return Object.freeze({
    scale,
    sourceOffsetX,
    sourceOffsetY,
    safeFrame: frozenSafeFrame,
    imageFrame: freezeFrame({
      x: frozenSafeFrame.x - sourceOffsetX * scale,
      y: frozenSafeFrame.y - sourceOffsetY * scale,
      width: imageWidth * scale,
      height: imageHeight * scale
    }),
    revision: input.revision,
    navigationRevision: input.navigationRevision
  });
}

/** Pure image-space authority used by every visible scene layer. */
export function resolveRpgReferenceViewportTransform(
  input: RpgReferenceViewportTransformInput
): RpgReferenceViewportTransform | null {
  const [referenceX, referenceY] = input.referenceFoot;
  if (
    !Number.isFinite(referenceX) ||
    !Number.isFinite(referenceY) ||
    !Number.isInteger(input.revision) ||
    input.revision < 0 ||
    !Number.isInteger(input.navigationRevision) ||
    input.navigationRevision < 0
  ) {
    return null;
  }
  const safeFrame = resolveSafeFrame(input);
  if (!safeFrame) return null;
  const [imageWidth, imageHeight] = RPG_WORLD_BACKDROP_IMAGE_SIZE;

  if (input.profile === "mobile") {
    const scale =
      RPG_REFERENCE_MOBILE_SCALE *
      (safeFrame.height / RPG_REFERENCE_MOBILE_SAFE_FRAME.height);
    const visibleWidth = safeFrame.width / scale;
    const visibleHeight = safeFrame.height / scale;
    const maximumSourceX = Math.max(0, imageWidth - visibleWidth);
    const maximumSourceY = Math.max(0, imageHeight - visibleHeight);
    const scaledDesiredFootY =
      safeFrame.y +
      (desiredFootY(input.navigationRegion) -
        RPG_REFERENCE_MOBILE_SAFE_FRAME.y) *
        (safeFrame.height / RPG_REFERENCE_MOBILE_SAFE_FRAME.height);
    const sourceOffsetX = clamp(
      referenceX - visibleWidth / 2,
      0,
      maximumSourceX
    );
    const sourceOffsetY = clamp(
      referenceY - (scaledDesiredFootY - safeFrame.y) / scale,
      0,
      maximumSourceY
    );
    return createTransform(
      input,
      sourceOffsetX,
      sourceOffsetY,
      scale,
      safeFrame
    );
  }

  if (input.profile === "desktop") {
    const scale =
      DESKTOP_SCALE *
      (safeFrame.height / RPG_REFERENCE_DESKTOP_SAFE_FRAME.height);
    const visibleWidth = safeFrame.width / scale;
    const maximumSourceX = Math.max(0, imageWidth - visibleWidth);
    return createTransform(
      input,
      clamp(referenceX - visibleWidth / 2, 0, maximumSourceX),
      0,
      scale,
      safeFrame
    );
  }
  return null;
}

/**
 * Advances an ordinary frame by at most 24 CSS px on each image-frame axis.
 * Atomic resize/fast-travel transactions publish the exact target immediately.
 */
export function stepRpgReferenceViewportTransform(
  input: RpgReferenceViewportStepInput
): RpgReferenceViewportTransform | null {
  const target = resolveRpgReferenceViewportTransform(input);
  if (!target || !input.previous || input.atomic) return target;
  const previous = input.previous;
  if (previous.scale !== target.scale) return target;
  const previousReferenceFoot = input.previousReferenceFoot;
  const maximumSourceStep =
    RPG_REFERENCE_MAX_ORDINARY_AXIS_STEP_CSS_PX / target.scale;
  const resolveAxis = (
    targetSource: number,
    previousSource: number,
    nextReferenceFoot: number,
    previousFoot: number | undefined,
    safeFrameStart: number,
    maximumSource: number
  ) => {
    let minimum = Math.max(0, previousSource - maximumSourceStep);
    let maximum = Math.min(maximumSource, previousSource + maximumSourceStep);
    if (previousFoot !== undefined) {
      const previousScreenFoot =
        safeFrameStart +
        (previousFoot - previousSource) * target.scale;
      const footMinimumSource =
        nextReferenceFoot -
        (previousScreenFoot +
          RPG_REFERENCE_MAX_ORDINARY_AXIS_STEP_CSS_PX -
          safeFrameStart) /
          target.scale;
      const footMaximumSource =
        nextReferenceFoot -
        (previousScreenFoot -
          RPG_REFERENCE_MAX_ORDINARY_AXIS_STEP_CSS_PX -
          safeFrameStart) /
          target.scale;
      minimum = Math.max(minimum, footMinimumSource);
      maximum = Math.min(maximum, footMaximumSource);
    }
    if (minimum > maximum + Number.EPSILON) return null;
    return clamp(targetSource, minimum, maximum);
  };
  const sourceOffsetX = resolveAxis(
    target.sourceOffsetX,
    previous.sourceOffsetX,
    input.referenceFoot[0],
    previousReferenceFoot?.[0],
    target.safeFrame.x,
    RPG_WORLD_BACKDROP_IMAGE_SIZE[0] -
      target.safeFrame.width / target.scale
  );
  const sourceOffsetY = resolveAxis(
    target.sourceOffsetY,
    previous.sourceOffsetY,
    input.referenceFoot[1],
    previousReferenceFoot?.[1],
    target.safeFrame.y,
    RPG_WORLD_BACKDROP_IMAGE_SIZE[1] -
      target.safeFrame.height / target.scale
  );
  if (sourceOffsetX === null || sourceOffsetY === null) return null;
  return createTransform(
    input,
    sourceOffsetX,
    sourceOffsetY,
    target.scale,
    target.safeFrame
  );
}

export function projectReferencePointToViewport(
  point: readonly [number, number],
  transform: RpgReferenceViewportTransform
) {
  return Object.freeze([
    transform.safeFrame.x +
      (point[0] - transform.sourceOffsetX) * transform.scale,
    transform.safeFrame.y +
      (point[1] - transform.sourceOffsetY) * transform.scale
  ] as const);
}

export function readAppliedRpgReferenceViewportTransform(element: Element) {
  return appliedTransforms.get(element) ?? null;
}

function writeTransformTelemetry(
  element: HTMLElement | SVGSVGElement,
  transform: RpgReferenceViewportTransform,
  layer: string
) {
  appliedTransforms.set(element, transform);
  element.dataset.rpgReferenceLayer = layer;
  element.dataset.rpgReferenceTransformRevision = String(transform.revision);
  element.dataset.rpgReferenceNavigationRevision = String(
    transform.navigationRevision
  );
  element.dataset.rpgReferenceTransformIdentity = `${transform.navigationRevision}:${transform.revision}`;
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

export function applyRpgReferenceLayerTransform(
  element: HTMLElement,
  transform: RpgReferenceViewportTransform,
  layer: string
) {
  writeTransformTelemetry(element, transform, layer);
  element.style.position = "absolute";
  element.style.left = `${transform.safeFrame.x}px`;
  element.style.top = `${transform.safeFrame.y}px`;
  element.style.width = `${transform.safeFrame.width}px`;
  element.style.height = `${transform.safeFrame.height}px`;
  element.style.overflow = "hidden";
  element.style.pointerEvents = "none";
}

export function applyRpgReferenceImageTransform(
  image: HTMLImageElement,
  transform: RpgReferenceViewportTransform,
  layer: string
) {
  if (!applyRpgWorldApprovedHtmlImageTransform(transform, image)) {
    return false;
  }
  writeTransformTelemetry(image, transform, layer);
  return true;
}

function normalizedPolygonPoints(
  polygon: readonly (readonly [number, number])[]
) {
  return polygon.map(([x, y]) => `${x},${y}`).join(" ");
}

function writeForegroundImageMetrics(
  frame: HTMLElement | null,
  image: HTMLImageElement
) {
  if (!frame) return;
  const complete = String(image.complete);
  const naturalWidth = String(image.naturalWidth);
  const naturalHeight = String(image.naturalHeight);
  frame.dataset.rpgReferenceForegroundImageComplete = complete;
  frame.dataset.rpgReferenceForegroundNaturalWidth = naturalWidth;
  frame.dataset.rpgReferenceForegroundNaturalHeight = naturalHeight;
  image.dataset.rpgReferenceForegroundImageComplete = complete;
  image.dataset.rpgReferenceForegroundNaturalWidth = naturalWidth;
  image.dataset.rpgReferenceForegroundNaturalHeight = naturalHeight;
}

export interface RpgReferenceSceneCompositionHandle {
  applyTransform(
    transform: RpgReferenceViewportTransform,
    zoneId: DestinationId,
    crossing: RpgWorldDepthCrossing | null
  ): boolean;
}

interface RpgReferenceSceneCompositionProps {
  readonly transform: RpgReferenceViewportTransform;
  readonly zoneId: DestinationId;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export const RpgReferenceSceneComposition = forwardRef<
  RpgReferenceSceneCompositionHandle,
  RpgReferenceSceneCompositionProps
>(function RpgReferenceSceneComposition(
  { transform, zoneId, className, style },
  forwardedRef
) {
  const frameRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const clipRef = useRef<SVGClipPathElement>(null);
  const initialMask = RPG_REFERENCE_FOREGROUND_MASKS.find(
    ({ zoneId: candidate }) => candidate === zoneId
  );
  const initialNormalizedPolygons = initialMask
    ? normalizeRpgReferenceForegroundPolygons(initialMask.polygons)
    : null;
  const activeMaskIdRef = useRef(initialMask?.id ?? null);

  const applyTransform = (
    nextTransform: RpgReferenceViewportTransform,
    nextZoneId: DestinationId,
    crossing: RpgWorldDepthCrossing | null
  ) => {
    const frame = frameRef.current;
    const svg = svgRef.current;
    const image = imageRef.current;
    const clip = clipRef.current;
    const mask = RPG_REFERENCE_FOREGROUND_MASKS.find(
      ({ zoneId: candidate }) => candidate === nextZoneId
    );
    const normalizedPolygons = mask
      ? normalizeRpgReferenceForegroundPolygons(mask.polygons)
      : null;
    const failClosed = (reason: string) => {
      if (frame) {
        frame.style.visibility = "hidden";
        frame.style.zIndex = "1";
        frame.dataset.rpgReferenceForegroundNormalization = "invalid";
        frame.dataset.rpgReferenceForegroundFailure = reason;
        frame.dataset.rpgReferenceForegroundVisible = "false";
        frame.dataset.rpgReferenceForegroundAbovePlayer = "false";
      }
      return false;
    };
    if (
      !frame ||
      !svg ||
      !image ||
      !clip ||
      !mask ||
      !normalizedPolygons
    ) {
      return failClosed("mask-normalization-invalid");
    }
    if (image.getAttribute("src") !== RPG_WORLD_BACKDROP_ASSET) {
      return failClosed("foreground-source-invalid");
    }
    writeForegroundImageMetrics(frame, image);
    if (
      image.complete &&
      (image.naturalWidth !== RPG_WORLD_BACKDROP_IMAGE_SIZE[0] ||
        image.naturalHeight !== RPG_WORLD_BACKDROP_IMAGE_SIZE[1])
    ) {
      return failClosed("foreground-image-dimensions-invalid");
    }
    applyRpgReferenceLayerTransform(frame, nextTransform, "foreground-frame");
    if (!applyRpgReferenceImageTransform(image, nextTransform, "foreground-image")) {
      return failClosed("foreground-image-transform-invalid");
    }
    image.style.clipPath = `url("#${RPG_REFERENCE_FOREGROUND_CLIP_PATH_ID}")`;
    if (activeMaskIdRef.current !== mask.id) {
      clip.replaceChildren(
        ...normalizedPolygons.map((polygon) => {
          const node = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "polygon"
          );
          node.setAttribute("points", normalizedPolygonPoints(polygon));
          return node;
        })
      );
      activeMaskIdRef.current = mask.id;
    }
    const playerBehindForeground = crossing === "behind";
    frame.style.visibility = playerBehindForeground ? "visible" : "hidden";
    frame.style.zIndex = playerBehindForeground ? "3" : "1";
    frame.dataset.rpgReferenceForegroundMask = mask.id;
    frame.dataset.rpgReferenceForegroundClip =
      JSON.stringify(normalizedPolygons);
    frame.dataset.rpgReferenceForegroundSourceClip =
      JSON.stringify(mask.polygons);
    frame.dataset.rpgReferenceForegroundNormalization = "valid";
    delete frame.dataset.rpgReferenceForegroundFailure;
    frame.dataset.rpgReferenceForegroundPolygonCount = String(
      mask.polygons.length
    );
    frame.dataset.rpgReferenceForegroundImageCount = "1";
    frame.dataset.rpgReferenceForegroundSourceCount = "1";
    frame.dataset.rpgReferenceForegroundSource = RPG_WORLD_BACKDROP_ASSET;
    frame.dataset.rpgReferenceForegroundCrossing = crossing ?? "none";
    frame.dataset.rpgReferenceForegroundVisible = String(
      playerBehindForeground
    );
    frame.dataset.rpgReferenceForegroundAbovePlayer = String(
      playerBehindForeground
    );
    return true;
  };

  useImperativeHandle(
    forwardedRef,
    () => ({ applyTransform }),
    []
  );

  if (!initialMask || !initialNormalizedPolygons) return null;
  const approvedImageStyle =
    resolveRpgWorldApprovedHtmlImageStyle(transform);
  return (
    <div
      ref={frameRef}
      aria-hidden="true"
      className={className}
      data-rpg-reference-layer="foreground-frame"
      data-rpg-reference-transform-revision={transform.revision}
      data-rpg-reference-navigation-revision={transform.navigationRevision}
      data-rpg-reference-transform-identity={`${transform.navigationRevision}:${transform.revision}`}
      data-rpg-reference-image-frame={[
        transform.imageFrame.x,
        transform.imageFrame.y,
        transform.imageFrame.width,
        transform.imageFrame.height
      ].join(",")}
      data-rpg-reference-foreground-mask={initialMask.id}
      data-rpg-reference-foreground-clip={JSON.stringify(
        initialNormalizedPolygons
      )}
      data-rpg-reference-foreground-source-clip={JSON.stringify(
        initialMask.polygons
      )}
      data-rpg-reference-foreground-normalization="valid"
      data-rpg-reference-foreground-polygon-count={
        initialMask.polygons.length
      }
      data-rpg-reference-foreground-image-count="1"
      data-rpg-reference-foreground-source-count="1"
      data-rpg-reference-foreground-source={RPG_WORLD_BACKDROP_ASSET}
      data-rpg-reference-foreground-crossing="none"
      data-rpg-reference-foreground-visible="false"
      data-rpg-reference-foreground-above-player="false"
      style={{
        ...style,
        position: "absolute",
        left: transform.safeFrame.x,
        top: transform.safeFrame.y,
        width: transform.safeFrame.width,
        height: transform.safeFrame.height,
        overflow: "hidden",
        pointerEvents: "none",
        visibility: "hidden",
        zIndex: 1
      }}
    >
      <svg
        ref={svgRef}
        aria-hidden="true"
        focusable="false"
        width="0"
        height="0"
        data-rpg-reference-foreground-defs="normalized"
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          overflow: "hidden",
          pointerEvents: "none"
        }}
      >
        <defs>
          <clipPath
            ref={clipRef}
            id={RPG_REFERENCE_FOREGROUND_CLIP_PATH_ID}
            clipPathUnits="objectBoundingBox"
          >
            {initialNormalizedPolygons.map((polygon, index) => (
              <polygon
                key={`${initialMask.id}:${index}`}
                points={normalizedPolygonPoints(polygon)}
              />
            ))}
          </clipPath>
        </defs>
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        alt=""
        draggable={false}
        src={RPG_WORLD_BACKDROP_ASSET}
        data-rpg-reference-layer="foreground-image"
        data-rpg-reference-transform-revision={transform.revision}
        data-rpg-reference-navigation-revision={transform.navigationRevision}
        data-rpg-reference-transform-identity={`${transform.navigationRevision}:${transform.revision}`}
        data-rpg-reference-image-frame={[
          transform.imageFrame.x,
          transform.imageFrame.y,
          transform.imageFrame.width,
          transform.imageFrame.height
        ].join(",")}
        data-rpg-reference-safe-frame={[
          transform.safeFrame.x,
          transform.safeFrame.y,
          transform.safeFrame.width,
          transform.safeFrame.height
        ].join(",")}
        data-rpg-reference-foreground-image="single"
        data-rpg-reference-foreground-source={RPG_WORLD_BACKDROP_ASSET}
        onLoad={(event) =>
          writeForegroundImageMetrics(frameRef.current, event.currentTarget)
        }
        onError={(event) =>
          writeForegroundImageMetrics(frameRef.current, event.currentTarget)
        }
        style={{
          ...approvedImageStyle,
          clipPath: `url("#${RPG_REFERENCE_FOREGROUND_CLIP_PATH_ID}")`
        }}
      />
    </div>
  );
});

import type { DestinationId } from "../guide/GuideContract";

export interface PanoramaRouteAnchor {
  id: DestinationId;
  worldX: number;
  imageX: number;
  imageY: number;
  scale: number;
}

export interface PanoramaRoutePoint {
  x: number;
  y: number;
  scale: number;
}

export const PANORAMA_ROUTE_ANCHORS: readonly PanoramaRouteAnchor[] = [
  { id: "airport", worldX: -22, imageX: -22, imageY: -7.7, scale: 1 },
  { id: "tokyo", worldX: -11, imageX: -11, imageY: -5.3, scale: 0.96 },
  { id: "gyukatsu", worldX: 0, imageX: 0, imageY: -7.4, scale: 1 },
  { id: "sakura", worldX: 11, imageX: 11, imageY: -6.4, scale: 0.97 },
  { id: "hanabi", worldX: 22, imageX: 22, imageY: -6, scale: 0.95 }
] as const;

const DEPTH_Y_PER_UNIT = -0.38;
const DEPTH_SCALE_PER_UNIT = 0.018;
const EDGE_X_SCALE = 0.7;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function interpolate(
  start: PanoramaRouteAnchor,
  end: PanoramaRouteAnchor,
  x: number,
  target: PanoramaRoutePoint
) {
  const progress = clamp(
    (x - start.worldX) / (end.worldX - start.worldX),
    0,
    1
  );
  target.x = start.imageX + (end.imageX - start.imageX) * progress;
  target.y = start.imageY + (end.imageY - start.imageY) * progress;
  target.scale = start.scale + (end.scale - start.scale) * progress;
}

export function createPanoramaRoutePoint(): PanoramaRoutePoint {
  return { x: 0, y: 0, scale: 1 };
}

export function mapWorldToPanoramaInto(
  position: { x: number; z: number },
  target: PanoramaRoutePoint
): PanoramaRoutePoint {
  const first = PANORAMA_ROUTE_ANCHORS[0];
  const last = PANORAMA_ROUTE_ANCHORS[PANORAMA_ROUTE_ANCHORS.length - 1];

  if (position.x <= first.worldX) {
    target.x = first.imageX + (position.x - first.worldX) * EDGE_X_SCALE;
    target.y = first.imageY;
    target.scale = first.scale;
  } else if (position.x >= last.worldX) {
    target.x = last.imageX + (position.x - last.worldX) * EDGE_X_SCALE;
    target.y = last.imageY;
    target.scale = last.scale;
  } else {
    for (let index = 1; index < PANORAMA_ROUTE_ANCHORS.length; index += 1) {
      const end = PANORAMA_ROUTE_ANCHORS[index];
      if (position.x <= end.worldX) {
        interpolate(PANORAMA_ROUTE_ANCHORS[index - 1], end, position.x, target);
        break;
      }
    }
  }

  target.y += position.z * DEPTH_Y_PER_UNIT;
  target.scale = clamp(
    target.scale + position.z * DEPTH_SCALE_PER_UNIT,
    0.84,
    1.08
  );
  return target;
}

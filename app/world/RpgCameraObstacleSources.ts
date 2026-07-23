import {
  RPG_TOWN_COLUMN_PROPS,
  type RpgStreetLifeInstance
} from "./RpgTownStreetLifeLayout";

/**
 * A ground-standing vertical prop the chase camera boom has to clear. The
 * column runs from the walk surface up to `height`, so a segmented trunk only
 * needs its tallest segment to cover the whole tree.
 */
export interface RpgCameraColumnObstacle {
  x: number;
  z: number;
  radius: number;
  height: number;
}

const MAXIMUM_COLUMN_RADIUS = 0.3;
const MINIMUM_COLUMN_HEIGHT = 1.2;
const MAXIMUM_COLUMN_TILT = 0.35;

export function toRpgCameraColumnObstacles(
  instances: readonly Readonly<RpgStreetLifeInstance>[]
): RpgCameraColumnObstacle[] {
  const columns: RpgCameraColumnObstacle[] = [];

  for (const { position, size, rotation } of instances) {
    if (
      !position.every(Number.isFinite) ||
      !size.every(Number.isFinite) ||
      !rotation.every(Number.isFinite)
    ) {
      continue;
    }
    // A tilted box no longer measures its vertical extent along size[1], which
    // is how an overhead wire would otherwise read as a full-height column.
    if (
      Math.abs(rotation[0]) > MAXIMUM_COLUMN_TILT ||
      Math.abs(rotation[2]) > MAXIMUM_COLUMN_TILT
    ) {
      continue;
    }
    const radius = Math.max(size[0], size[2]) / 2;
    const height = position[1] + size[1] / 2;
    if (radius > MAXIMUM_COLUMN_RADIUS || height < MINIMUM_COLUMN_HEIGHT) {
      continue;
    }
    columns.push({ x: position[0], z: position[2], radius, height });
  }

  return columns;
}

/**
 * Every vertical prop the boom treats as an occluder. The town owns which props
 * exist, so new ones arrive through `RPG_TOWN_COLUMN_PROPS` with no camera edit.
 * Adding a separate prop set is one spread entry: either an already-shaped
 * column array, or instances passed through `toRpgCameraColumnObstacles`.
 */
export const RPG_CAMERA_COLUMN_OBSTACLES: readonly Readonly<RpgCameraColumnObstacle>[] =
  toRpgCameraColumnObstacles(RPG_TOWN_COLUMN_PROPS);

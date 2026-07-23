import { Quaternion, Vector3 } from "three";

export interface MovementIntent {
  x: number;
  y: number;
}

export interface WorldSnapshot {
  position: [number, number, number];
  surfaceNormal: [number, number, number];
  heading: [number, number, number];
  moving: boolean;
  grounded: boolean;
}

export interface WorldSession {
  setMovement(intent: MovementIntent): void;
  jump(): void;
  reset(): void;
  advance(deltaSeconds: number): void;
  readSnapshot(target: WorldSnapshot): WorldSnapshot;
  getSnapshot(): WorldSnapshot;
}

interface WorldSessionOptions {
  radius: number;
  moveSpeed: number;
  corridorHalfWidth?: number;
  crosswalk?: {
    trackAngle: number;
    halfLength: number;
    minimumOffset: number;
    maximumOffset: number;
  };
}

export function createWorldSnapshot(): WorldSnapshot {
  return {
    position: [0, 0, 0],
    surfaceNormal: [0, 1, 0],
    heading: [0, 0, -1],
    moving: false,
    grounded: true
  };
}

function writeTuple(
  target: [number, number, number],
  x: number,
  y: number,
  z: number
) {
  target[0] = x;
  target[1] = y;
  target[2] = z;
}

export function createWorldSession({
  radius,
  moveSpeed,
  corridorHalfWidth = Number.POSITIVE_INFINITY,
  crosswalk
}: WorldSessionOptions): WorldSession {
  const surfaceNormal = new Vector3(0, 1, 0);
  const heading = new Vector3(0, 0, -1);
  const controlForward = new Vector3();
  const right = new Vector3();
  const moveDirection = new Vector3();
  const rotationAxis = new Vector3();
  const rotation = new Quaternion();
  const movement: MovementIntent = { x: 0, y: 0 };
  let movementGestureActive = false;
  let jumpHeight = 0;
  let jumpVelocity = 0;
  let grounded = true;
  const baseMaximumCrossTrackX = Number.isFinite(corridorHalfWidth)
    ? Math.sin(Math.max(0, corridorHalfWidth) / radius)
    : 1;

  const constrainToCorridor = (previousCrossTrackX: number) => {
    const trackAngle = Math.atan2(-surfaceNormal.z, surfaceNormal.y);
    let minimumCrossTrackX = -baseMaximumCrossTrackX;
    let maximumCrossTrackX = baseMaximumCrossTrackX;
    if (crosswalk) {
      const signedAngleDistance = Math.atan2(
        Math.sin(trackAngle - crosswalk.trackAngle),
        Math.cos(trackAngle - crosswalk.trackAngle)
      );
      const insideCrosswalk =
        Math.abs(signedAngleDistance) * radius <= crosswalk.halfLength;
      if (insideCrosswalk) {
        minimumCrossTrackX = Math.sin(crosswalk.minimumOffset / radius);
        maximumCrossTrackX = Math.sin(crosswalk.maximumOffset / radius);
      } else if (
        (previousCrossTrackX < -baseMaximumCrossTrackX ||
          previousCrossTrackX > baseMaximumCrossTrackX) &&
        (surfaceNormal.x < -baseMaximumCrossTrackX ||
          surfaceNormal.x > baseMaximumCrossTrackX)
      ) {
        const constrainedX = Math.min(
          Math.sin(crosswalk.maximumOffset / radius),
          Math.max(
            Math.sin(crosswalk.minimumOffset / radius),
            surfaceNormal.x
          )
        );
        const boundaryAngle =
          crosswalk.trackAngle +
          Math.sign(signedAngleDistance) * (crosswalk.halfLength / radius);
        const trackRadius = Math.sqrt(Math.max(0, 1 - constrainedX ** 2));
        surfaceNormal.set(
          constrainedX,
          trackRadius * Math.cos(boundaryAngle),
          -trackRadius * Math.sin(boundaryAngle)
        );
        return;
      }
    }
    if (
      surfaceNormal.x >= minimumCrossTrackX &&
      surfaceNormal.x <= maximumCrossTrackX
    ) {
      return;
    }
    const constrainedX = Math.min(
      maximumCrossTrackX,
      Math.max(minimumCrossTrackX, surfaceNormal.x)
    );
    const trackRadius = Math.sqrt(Math.max(0, 1 - constrainedX ** 2));
    surfaceNormal.set(
      constrainedX,
      trackRadius * Math.cos(trackAngle),
      -trackRadius * Math.sin(trackAngle)
    );
  };
  const readSnapshot = (target: WorldSnapshot) => {
    const distance = radius + jumpHeight;
    writeTuple(
      target.position,
      surfaceNormal.x * distance,
      surfaceNormal.y * distance,
      surfaceNormal.z * distance
    );
    writeTuple(
      target.surfaceNormal,
      surfaceNormal.x,
      surfaceNormal.y,
      surfaceNormal.z
    );
    writeTuple(target.heading, heading.x, heading.y, heading.z);
    target.moving = Math.hypot(movement.x, movement.y) > 0;
    target.grounded = grounded;
    return target;
  };

  return {
    setMovement(intent) {
      const length = Math.hypot(intent.x, intent.y);
      const scale = length > 1 ? 1 / length : 1;
      movement.x = intent.x * scale;
      movement.y = intent.y * scale;
    },

    jump() {
      if (!grounded) {
        return;
      }
      grounded = false;
      jumpVelocity = 6;
    },

    reset() {
      surfaceNormal.set(0, 1, 0);
      heading.set(0, 0, -1);
      controlForward.set(0, 0, 0);
      right.set(0, 0, 0);
      moveDirection.set(0, 0, 0);
      movement.x = 0;
      movement.y = 0;
      movementGestureActive = false;
      jumpHeight = 0;
      jumpVelocity = 0;
      grounded = true;
    },

    advance(deltaSeconds) {
      if (deltaSeconds <= 0) {
        return;
      }

      const strength = Math.hypot(movement.x, movement.y);
      if (strength > 0) {
        if (!movementGestureActive) {
          controlForward.copy(heading);
          movementGestureActive = true;
        }
        right.crossVectors(controlForward, surfaceNormal).normalize();
        moveDirection
          .copy(controlForward)
          .multiplyScalar(movement.y)
          .addScaledVector(right, movement.x)
          .normalize();
        rotationAxis.crossVectors(surfaceNormal, moveDirection).normalize();
        const angle = (moveSpeed * strength * deltaSeconds) / radius;
        rotation.setFromAxisAngle(rotationAxis, angle);

        const previousCrossTrackX = surfaceNormal.x;
        surfaceNormal.applyQuaternion(rotation).normalize();
        constrainToCorridor(previousCrossTrackX);
        controlForward
          .applyQuaternion(rotation)
          .addScaledVector(
            surfaceNormal,
            -controlForward.dot(surfaceNormal)
          )
          .normalize();
        moveDirection
          .applyQuaternion(rotation)
          .addScaledVector(
            surfaceNormal,
            -moveDirection.dot(surfaceNormal)
          )
          .normalize();
        heading
          .copy(moveDirection)
          .normalize();
      } else {
        movementGestureActive = false;
      }

      if (!grounded) {
        jumpVelocity -= 15 * deltaSeconds;
        jumpHeight += jumpVelocity * deltaSeconds;
        if (jumpHeight <= 0) {
          jumpHeight = 0;
          jumpVelocity = 0;
          grounded = true;
        }
      }
    },

    readSnapshot,

    getSnapshot() {
      return readSnapshot(createWorldSnapshot());
    }
  };
}

export const PLAYER_CHARACTER_CAMERA_HIDE_DISTANCE = 1.2;
// Matches RPG_CAMERA_MINIMUM_BOOM_DISTANCE. That is the closest the boom can
// ever put the camera to the player's own body axis, so a townsperson measured
// nearer than it is necessarily standing between the camera and the player and
// would blot the player out of the frame.
export const NPC_CHARACTER_CAMERA_HIDE_DISTANCE = 2.6;

/**
 * Distance from the camera to a character's body axis: the vertical segment
 * that runs from the soles on the ground up to the top of the head.
 *
 * Measuring to the root instead reads a body standing beside the camera as far
 * away, because the camera rides 1.6 to 3.15 units above the ground and that
 * height difference dominates the distance to a pair of feet, while the chest
 * that actually fills the frame is nearly touching the lens.
 */
export function calculateRpgCharacterCameraDistance(
  camera: Readonly<{ x: number; y: number; z: number }>,
  feet: Readonly<{ x: number; y: number; z: number }>,
  bodyHeight: number
): number {
  const height = Number.isFinite(bodyHeight) ? Math.max(0, bodyHeight) : 0;
  const nearestY = Math.min(Math.max(camera.y, feet.y), feet.y + height);
  return Math.hypot(camera.x - feet.x, camera.y - nearestY, camera.z - feet.z);
}

// One body half-width. A body and the player it hides shrink at the same rate
// with distance, so the angle one covers stays proportional to this sideways
// gap however far down the line it stands, which is why a single figure works
// at every depth instead of a cone.
export const NPC_SIGHT_LINE_RADIUS = 0.5;
// Fractions along the camera-to-player line. Bodies right at the lens are
// already handled by the hide distance, and anything past the player is behind
// them from here and covers nothing.
const SIGHT_LINE_NEAR_FRACTION = 0.05;
const SIGHT_LINE_FAR_FRACTION = 1;

/**
 * Whether a standing body blocks the camera's view of the player character.
 *
 * Both bodies are upright columns and the camera looks along them, so the test
 * only needs the ground plane: how far the body's column sits from the line
 * that runs from the camera to the player, and how far along that line it
 * stands. A townsperson who blocks the view is hidden rather than pushing the
 * camera, which is what keeps the boom at full length inside a crowd.
 */
export function blocksRpgCameraSightLine(
  camera: Readonly<{ x: number; z: number }>,
  player: Readonly<{ x: number; z: number }>,
  body: Readonly<{ x: number; z: number }>,
  radius: number = NPC_SIGHT_LINE_RADIUS
): boolean {
  const lineX = player.x - camera.x;
  const lineZ = player.z - camera.z;
  const lengthSquared = lineX * lineX + lineZ * lineZ;
  if (!Number.isFinite(lengthSquared) || lengthSquared <= 1e-6) return false;

  const along =
    ((body.x - camera.x) * lineX + (body.z - camera.z) * lineZ) / lengthSquared;
  if (
    !Number.isFinite(along) ||
    along <= SIGHT_LINE_NEAR_FRACTION ||
    along >= SIGHT_LINE_FAR_FRACTION
  ) {
    return false;
  }

  const offset = Math.hypot(
    body.x - (camera.x + lineX * along),
    body.z - (camera.z + lineZ * along)
  );
  return offset < radius;
}

export function shouldRenderRpgCharacter(
  cameraDistance: number,
  hideDistance: number
) {
  return (
    Number.isFinite(cameraDistance) &&
    Number.isFinite(hideDistance) &&
    hideDistance >= 0 &&
    cameraDistance >= hideDistance
  );
}

// Extra reach the rule keeps once it has already hidden somebody. Without it a
// body loitering right on the edge flickers on and off every frame, which is
// far more distracting than either state.
export const NPC_SIGHT_LINE_HYSTERESIS = 0.2;

/**
 * Sight line test with the edge widened for whoever is already hidden, so a
 * body that stops on the boundary settles into one state instead of blinking.
 */
export function blocksRpgCameraSightLineWithHysteresis(
  camera: Readonly<{ x: number; z: number }>,
  player: Readonly<{ x: number; z: number }>,
  body: Readonly<{ x: number; z: number }>,
  wasBlocking: boolean
): boolean {
  return blocksRpgCameraSightLine(
    camera,
    player,
    body,
    wasBlocking
      ? NPC_SIGHT_LINE_RADIUS + NPC_SIGHT_LINE_HYSTERESIS
      : NPC_SIGHT_LINE_RADIUS
  );
}

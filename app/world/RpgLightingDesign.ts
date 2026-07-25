/**
 * Zone-independent constants for the seamless world's light rig.
 *
 * Everything here is consumed by RpgTownAmbience (lights, sky dome) or by
 * SeamlessWorldCanvas (tone mapping). Per-zone colours, sun angles and fog
 * distances live with the rest of the zone look in RpgRegionPresentation.
 */

/**
 * Ambient floor. Without it a vertical facade is lit only by the hemisphere,
 * which is why every building read as a black slab against a bright sky.
 */
export const RPG_AMBIENT_LIGHT_INTENSITY = 0.85;

/** Cool back light that separates building silhouettes from the sky. */
export const RPG_RIM_LIGHT_INTENSITY = 0.55;

/**
 * Khronos PBR Neutral tone mapping keeps the authored hues; ACES desaturated
 * an already low-chroma palette into grey. Exposure lifts the midtones back.
 */
export const RPG_TONE_MAPPING_EXPOSURE = 1.18;

/**
 * A key light above this elevation grazes vertical walls: at 74 degrees a
 * facade receives at most 19 per cent of it. Every zone's sun angle is
 * clamped into this band so facades stay lit while the sun still reads as
 * moving through the day.
 */
export const RPG_KEY_LIGHT_MIN_ELEVATION_DEGREES = 18;
export const RPG_KEY_LIGHT_MAX_ELEVATION_DEGREES = 44;

/** Distance the key and rim lights are placed at along their direction. */
export const RPG_KEY_LIGHT_DISTANCE = 62;
export const RPG_RIM_LIGHT_DISTANCE = 48;

/** The rim sits behind and opposite the key, low enough to catch facades. */
export const RPG_RIM_LIGHT_ELEVATION_DEGREES = 14;
export const RPG_RIM_LIGHT_AZIMUTH_OFFSET_DEGREES = 168;

/** Shadow frustum: the playable square is 72 x 72 around the origin. */
export const RPG_KEY_SHADOW_EXTENT = 48;
export const RPG_KEY_SHADOW_NEAR = 1;
export const RPG_KEY_SHADOW_FAR = 130;
export const RPG_KEY_SHADOW_BIAS = -0.0004;
/** A lower sun grazes the thin ground slabs, so acne needs a wider normal bias. */
export const RPG_KEY_SHADOW_NORMAL_BIAS = 0.045;

/**
 * Camera far plane. The diagonal of the 72 x 72 playable square is 102 units,
 * and the Hanabi shells burst another 13 units beyond the south-east corner,
 * so the plane has to clear roughly 115 units for the bursts to stay drawn
 * from the airport. 140 leaves headroom without wasting depth precision.
 */
export const RPG_WORLD_CAMERA_FAR = 140;

/** Radius of the sky dome. Must stay inside the camera far plane. */
export const RPG_SKY_DOME_RADIUS = 100;
/** Horizon falloff exponent: lower spreads the horizon colour further up. */
export const RPG_SKY_GRADIENT_EXPONENT = 0.62;

export function getRpgKeyLightPosition(
  elevationDegrees: number,
  azimuthDegrees: number,
  distance = RPG_KEY_LIGHT_DISTANCE
): [number, number, number] {
  const elevation = (elevationDegrees * Math.PI) / 180;
  const azimuth = (azimuthDegrees * Math.PI) / 180;
  const horizontal = Math.cos(elevation) * distance;
  return [
    horizontal * Math.sin(azimuth),
    Math.sin(elevation) * distance,
    horizontal * Math.cos(azimuth)
  ];
}

/**
 * Places the sun for a zone. Interpolated elevations are clamped into the
 * design band before the position is built, so a "midday" zone can never
 * reintroduce the overhead key that left every facade unlit.
 */
export function resolveRpgKeyLightPlacement(
  elevationDegrees: number,
  azimuthDegrees: number
) {
  const elevation = Math.min(
    RPG_KEY_LIGHT_MAX_ELEVATION_DEGREES,
    Math.max(RPG_KEY_LIGHT_MIN_ELEVATION_DEGREES, elevationDegrees)
  );
  return {
    elevationDegrees: elevation,
    /** N.L on a vertical wall facing the sun. */
    facadeIncidence: Math.cos((elevation * Math.PI) / 180),
    position: getRpgKeyLightPosition(elevation, azimuthDegrees)
  };
}

/** The rim sits low and behind the key, on the far side of the subject. */
export function resolveRpgRimLightPosition(azimuthDegrees: number) {
  return getRpgKeyLightPosition(
    RPG_RIM_LIGHT_ELEVATION_DEGREES,
    azimuthDegrees + RPG_RIM_LIGHT_AZIMUTH_OFFSET_DEGREES,
    RPG_RIM_LIGHT_DISTANCE
  );
}

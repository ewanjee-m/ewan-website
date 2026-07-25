// Types for the atlas painter, so tests written in TypeScript can measure the
// face the generator actually paints rather than keeping their own copy of the
// projection. Only the read-only observation surface is declared; the painter
// itself is called from the generator, which is plain JavaScript.

/** Width and height of the square atlas, in texels. */
export const ATLAS_SIZE: number;

/** How many atlas rows the head band occupies, starting at row 0 (the crown). */
export const HEAD_BAND_ROWS: number;

/**
 * The skull's full extents as fractions of total figure height. The generator
 * builds the head mesh to exactly these numbers.
 */
export const HEAD_EXTENTS: Readonly<{ x: number; y: number; z: number }>;

/**
 * Head height over head width. Face space is measured in units of the head's
 * half-width, so `fy` reaches this value at the crown while `fx` reaches 1 at
 * the ears.
 */
export const HEAD_BAND_ASPECT: number;

/** Where a texel of the head band lands on the skull, in face space. */
export function headBandDirection(
  column: number,
  row: number
): { fx: number; fy: number; z: number };

import { encodePng } from "./png.mjs";

export const ATLAS_SIZE = 1280;
export const HEAD_BAND_ROWS = ATLAS_SIZE / 2;
// Every part of the figure except the skull reads this one texel, which is
// white so the flat vertex colour it was painted with comes through unchanged.
// It sits in the lower half of the atlas, which the head band never touches.
export const BODY_UV = Object.freeze({ u: 0.5, v: 0.75 });

// The lower half of the atlas holds the figure twice: the front picture on the
// left, the back picture on the right. A margin round each keeps the edge of a
// sheet from bleeding into its neighbour under bilinear sampling, and leaves the
// white column that BODY_UV points at.
const FEATHER = 0.012;

// The skull's full extents as fractions of total figure height. This is the one
// place the head size is written down: the generator builds the skull mesh to
// exactly these numbers and the face band below is painted in the same aspect.
// Held apart, the painted face is stretched off the geometry it is wrapped on —
// which is what the old pair of hard-coded 0.205/0.195 literals in two files
// quietly did.
// The depth is a little under the width on purpose. On an ellipsoid the surface
// normal runs along (x / halfWidth, y / halfHeight, z / halfDepth), so making
// the head shallower than it is wide swings every normal on the face towards
// the camera: at the outer corner of the eye, 0.355 instead of 0.365 is worth
// 1.4 degrees of azimuth for nothing visible in the profile. It is a tenth of
// the grazing-angle fix and the only part of it that costs no drawing.
export const HEAD_EXTENTS = Object.freeze({ x: 0.39, y: 0.4, z: 0.355 });
const HEAD_ASPECT = HEAD_EXTENTS.y / HEAD_EXTENTS.x;
const FRONT_EXPANSION = 0.55;

function wrapSigned(value) {
  return value - Math.round(value);
}

export function projectHeadBandU(sphereU) {
  const azimuth = wrapSigned(sphereU - 0.25);
  const magnitude = 0.5 * Math.pow(Math.abs(azimuth) / 0.5, FRONT_EXPANSION);
  return 0.5 + Math.sign(azimuth) * magnitude;
}

function unprojectHeadBandAzimuth(bandU) {
  const offset = bandU - 0.5;
  const magnitude = 0.5 * Math.pow(Math.abs(offset) / 0.5, 1 / FRONT_EXPANSION);
  return Math.sign(offset) * magnitude;
}

// The head is a ball 0.39h wide and 0.40h tall, so face space is measured in
// units of its HALF-WIDTH: fx and fy are the offsets of a texel from the head
// centre in those units, and z is how far round the front it faces. The head is
// very slightly taller than it is wide, so fy runs to +/-HEAD_ASPECT at crown
// and chin while fx runs to +/-1 at the ears — one aspect, not two, which is
// what keeps a circle drawn in this space a circle on the model.
export const HEAD_BAND_ASPECT = HEAD_ASPECT;

/**
 * Where a texel of the head band lands on the skull.
 *
 * Exported so a test can ask where a painted pixel actually ended up instead of
 * re-deriving the projection and then grading its own homework against it. The
 * painter below walks the band through this same function, so the two cannot
 * describe different skulls.
 */
export function headBandDirection(column, row) {
  const theta = (Math.PI * (row + 0.5)) / HEAD_BAND_ROWS;
  const sinTheta = Math.sin(theta);
  const azimuth = unprojectHeadBandAzimuth((column + 0.5) / ATLAS_SIZE);
  const phi = 2 * Math.PI * (0.25 + azimuth);
  return {
    fx: -Math.cos(phi) * sinTheta,
    fy: Math.cos(theta) * HEAD_ASPECT,
    z: Math.sin(phi) * sinTheta
  };
}

function parseColor(value) {
  const hex = value.replace("#", "");
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ];
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function coverage(distance) {
  return 1 - smoothstep(-FEATHER, FEATHER, distance);
}

function ellipseDistance(x, y, centerX, centerY, radiusX, radiusY) {
  const normalizedX = (x - centerX) / radiusX;
  const normalizedY = (y - centerY) / radiusY;
  const scale = Math.min(radiusX, radiusY);
  return (Math.hypot(normalizedX, normalizedY) - 1) * scale;
}

function arcDistance(x, y, centerX, centerY, radius, thickness) {
  return Math.abs(Math.hypot(x - centerX, y - centerY) - radius) - thickness;
}

// How far round the front a feature is painted at full strength, and where it
// has faded to nothing.
//
// The window used to close at 0.58 because the face was a photographic crop:
// an orthographic picture pinned to a sphere smears once it is carried much
// past sixty degrees round, so it had to hand over to bare skin early. A face
// drawn in face space has no such limit — every feature is placed at the point
// whose fx it names, which is the correct orthographic position — so the window
// can open up and let the eyes sit as wide as the style wants without their
// outer edge dissolving. It still has to close before the ears, because the
// features are mirrored about the nose and would otherwise appear again round
// the back of the skull.
const HEMISPHERE_FADE_START = 0.22;
const HEMISPHERE_FADE_END = 0.48;

function createLayerPainter(rgba) {
  return function paint(index, color, alpha) {
    if (alpha <= 0) return;
    const blend = Math.min(1, alpha);
    rgba[index] = Math.round(rgba[index] * (1 - blend) + color[0] * blend);
    rgba[index + 1] = Math.round(
      rgba[index + 1] * (1 - blend) + color[1] * blend
    );
    rgba[index + 2] = Math.round(
      rgba[index + 2] * (1 - blend) + color[2] * blend
    );
  };
}

export function createCharacterAtlas(face) {
  const rgba = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  const skin = parseColor(face.skin);
  const shade = parseColor(face.skinShade);
  const lash = parseColor(face.lash);
  const brow = parseColor(face.brow);
  const iris = parseColor(face.iris);
  const irisDeep = parseColor(face.irisDeep);
  const blush = parseColor(face.blush);
  const lip = parseColor(face.lip);
  const sclera = parseColor(face.sclera);
  const highlight = [255, 255, 255];
  const paint = createLayerPainter(rgba);

  for (let index = 0; index < rgba.length; index += 4) {
    rgba[index + 3] = 255;
  }

  for (let row = HEAD_BAND_ROWS; row < ATLAS_SIZE; row += 1) {
    for (let column = 0; column < ATLAS_SIZE; column += 1) {
      const index = (row * ATLAS_SIZE + column) * 4;
      rgba[index] = 255;
      rgba[index + 1] = 255;
      rgba[index + 2] = 255;
    }
  }

  for (let row = 0; row < HEAD_BAND_ROWS; row += 1) {
    for (let column = 0; column < ATLAS_SIZE; column += 1) {
      const index = (row * ATLAS_SIZE + column) * 4;
      // The head sphere carries no colour of its own, so everywhere no feature
      // reaches — the sides of the skull, the crown under the hair, the
      // underside of the jaw — reads this texel. Skin is the only answer that
      // does not show as a pale patch through the gaps in the hair.
      const base = skin;
      rgba[index] = base[0];
      rgba[index + 1] = base[1];
      rgba[index + 2] = base[2];

      const { fx, fy, z } = headBandDirection(column, row);

      // Features are drawn from the front and mirrored about the nose, so the
      // same |fx| on the far side of the skull would grow a second pair of eyes
      // round the back. The face stops where the head turns away.
      if (z <= HEMISPHERE_FADE_START) continue;
      const depth = smoothstep(HEMISPHERE_FADE_START, HEMISPHERE_FADE_END, z);

      const cheekShade =
        coverage(
          ellipseDistance(
            Math.abs(fx),
            fy,
            face.blushX,
            face.blushY,
            face.blushRadiusX * 1.35,
            face.blushRadiusY * 1.5
          )
        ) * 0.16;
      paint(index, shade, cheekShade * depth);

      paint(
        index,
        blush,
        coverage(
          ellipseDistance(
            Math.abs(fx),
            fy,
            face.blushX,
            face.blushY,
            face.blushRadiusX,
            face.blushRadiusY
          )
        ) *
          face.blushStrength *
          depth
      );

      const noseShade = coverage(
        ellipseDistance(fx, fy, 0, face.noseY, face.noseRadius, face.noseRadius * 1.5)
      );
      paint(index, shade, noseShade * 0.5 * depth);

      const mouthOuter = arcDistance(
        fx,
        fy,
        0,
        face.mouthY + face.mouthCurve,
        face.mouthCurve,
        face.mouthThickness
      );
      const mouthMask =
        Math.abs(fx) < face.mouthWidth && fy < face.mouthY + face.mouthCurve
          ? coverage(mouthOuter)
          : 0;
      paint(index, lip, mouthMask * depth);

      const eyeX = Math.abs(fx);
      // The eye is built up in layers, dark to light, rather than cut out of
      // the skin. The outermost layer is a solid ink ellipse; the sclera is
      // painted back over the inside of it, which leaves an unbroken dark rim
      // of exactly `rimWidth` all the way round.
      //
      // That rim is what makes the eye survive being shrunk. At the chase
      // camera the head is about ninety pixels tall and the eye a dozen across;
      // a pale sclera against pale skin greys out into a smudge at that size,
      // where an inked outline holds its shape down to a handful of pixels.
      // This is why the reference art outlines every eye.
      //
      // `rimWidth` is a WIDTH, in the same face-space units as everything else,
      // not a fraction of the eye's radii. It used to be a fraction, which tied
      // the outline's thickness to the eye's size: narrowing the eye to keep it
      // off the silhouette also thinned its outline below a pixel at chase
      // distance, so the two could not be tuned apart. One unit of face space
      // is about 44 px on a ninety-pixel head, so 0.04 draws a 1.8 px line at
      // any eye size.
      const rimX = face.eyeRadiusX + face.rimWidth;
      const rimY = face.eyeRadiusY + face.rimWidth;
      paint(
        index,
        lash,
        coverage(
          ellipseDistance(eyeX, fy, face.eyeX, face.eyeY, rimX, rimY)
        ) * depth
      );
      const eyeDistance = ellipseDistance(
        eyeX,
        fy,
        face.eyeX,
        face.eyeY,
        face.eyeRadiusX,
        face.eyeRadiusY
      );
      const eyeMask = coverage(eyeDistance) * depth;
      paint(index, sclera, eyeMask);

      const irisDistance = ellipseDistance(
        eyeX,
        fy,
        face.eyeX,
        face.eyeY - face.irisDrop,
        face.irisRadiusX,
        face.irisRadiusY
      );
      const irisMask = Math.min(eyeMask, coverage(irisDistance));
      paint(index, iris, irisMask);
      paint(
        index,
        irisDeep,
        Math.min(
          irisMask,
          coverage(
            ellipseDistance(
              eyeX,
              fy,
              face.eyeX,
              face.eyeY - face.irisDrop - face.irisRadiusY * 0.42,
              face.irisRadiusX * 0.98,
              face.irisRadiusY * 0.5
            )
          )
        )
      );
      paint(
        index,
        [24, 18, 26],
        Math.min(
          irisMask,
          coverage(
            ellipseDistance(
              eyeX,
              fy,
              face.eyeX,
              face.eyeY - face.irisDrop,
              face.irisRadiusX * 0.54,
              face.irisRadiusY * 0.62
            )
          )
        )
      );
      // The upper lid, painted back over the sclera. A lid heavier than the rim
      // is most of what separates one character's expression from another's:
      // dropped low it reads as a calm or sleepy eye, lifted clear of the iris
      // as a wide-open one.
      const lashBand =
        coverage(ellipseDistance(eyeX, fy, face.eyeX, face.eyeY, rimX, rimY)) *
        smoothstep(
          face.eyeY + face.eyeRadiusY * face.lashStart,
          face.eyeY + face.eyeRadiusY * (face.lashStart + 0.32),
          fy
        );
      paint(index, lash, lashBand * depth);

      // One highlight per eye, up and inward, and pure white. Two highlights
      // read as a glassy doll rather than a cartoon, and none reads as a dead
      // eye at any size.
      //
      // It sits INWARD because that is the half of the eye that survives being
      // turned away from: the inner corner is ten degrees round the skull where
      // the outer corner is thirty-five, so at three-quarter view the highlight
      // is still there to say "eye" after the outer half has foreshortened
      // away. It sits low enough to stay clear of the heaviest upper lid any of
      // the six wears, or the character it belongs to loses it under the lash
      // and the face reads as asleep.
      paint(
        index,
        highlight,
        Math.min(
          eyeMask,
          coverage(
            ellipseDistance(
              eyeX,
              fy,
              face.eyeX - face.eyeRadiusX * 0.34,
              face.eyeY + face.eyeRadiusY * 0.22,
              face.eyeRadiusX * 0.34,
              face.eyeRadiusY * 0.26
            )
          )
        )
      );

      // The brow is an arc, sheared about the eye's own centre line. Shear is
      // the whole of the expression: raised at the outer end reads as open and
      // friendly, dropped at the outer end as focused or stern. Nothing else in
      // this face carries mood as cheaply, which is why it is the third handle —
      // after eye shape and mouth — for telling the six apart.
      //
      // The arc is struck about a centre a whole brow-curve BELOW the brow, so
      // the circle it lies on passes back down across the cheek and out to the
      // corner of the mouth. Only a window on |fx| used to hold the drawing to
      // the brow, and a window on |fx| does not exclude the bottom of a circle:
      // every face was painted with a second dark arc down each cheek, which
      // reads as a deep nasolabial fold on a character who has no nose. It was
      // also the ink that reached furthest round the skull on the three
      // feminine faces — 58.6 degrees, past the point where the head turns away
      // at three-quarter view. Keeping to the upper half of the circle is the
      // whole of the fix; the brow itself never leaves it.
      const browCenterFy = face.browY - face.browCurve;
      const browFy = fy - face.browTilt * (eyeX - face.eyeX);
      const browMask =
        coverage(
          arcDistance(
            eyeX,
            browFy,
            face.eyeX,
            browCenterFy,
            face.browCurve,
            face.browThickness
          )
        ) *
        (browFy > browCenterFy &&
        eyeX > face.eyeX - face.browSpan &&
        eyeX < face.eyeX + face.browSpan
          ? 1
          : 0);
      paint(index, brow, browMask * depth);
    }
  }

  return encodePng(ATLAS_SIZE, ATLAS_SIZE, rgba);
}

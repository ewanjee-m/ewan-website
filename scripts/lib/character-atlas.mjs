import { encodePng } from "./png.mjs";

export const ATLAS_SIZE = 1280;
export const HEAD_BAND_ROWS = ATLAS_SIZE / 2;
// Anything the pictures do not cover reads this texel, which stays white so the
// sculpted vertex colour comes through unchanged. It sits in the gap between the
// two body sheets, which the sheet width limit below keeps clear.
export const BODY_UV = Object.freeze({ u: 0.5, v: 0.75 });

// The lower half of the atlas holds the figure twice: the front picture on the
// left, the back picture on the right. A margin round each keeps the edge of a
// sheet from bleeding into its neighbour under bilinear sampling, and leaves the
// white column that BODY_UV points at.
export const BODY_GUTTER = 20;
export const BODY_CELL_HEIGHT = ATLAS_SIZE / 2 - BODY_GUTTER * 2;
const BODY_CELL_MAX_WIDTH = ATLAS_SIZE / 2 - BODY_GUTTER * 4;
// Painted past the edge of each sheet with the edge pixel repeated, so the
// texels a sampler reaches for at the boundary carry the picture rather than the
// white behind it.
const BODY_BLEED = 3;

// A sheet is the figure squared up to its own bounding box, so it keeps the
// figure's proportions and the cell it lands in is shaped the same way. Spending
// the full half width on a figure three times taller than it is wide would cost
// three times the pixels for no more detail across the character.
export function bodyCellRect(sheet, side) {
  const width = Math.min(
    BODY_CELL_MAX_WIDTH,
    Math.max(1, Math.round((BODY_CELL_HEIGHT * sheet.width) / sheet.height))
  );
  return {
    x: (side === "back" ? ATLAS_SIZE / 2 : 0) + BODY_GUTTER,
    y: ATLAS_SIZE / 2 + BODY_GUTTER,
    width,
    height: BODY_CELL_HEIGHT
  };
}

// Where a point on the figure lands in the atlas. Both arguments run 0 to 1
// across the sheet, with 0 at its left edge and 0 at its top.
export function bodyCellUv(sheet, side, alongWidth, downHeight) {
  const rect = bodyCellRect(sheet, side);
  return [
    (rect.x + alongWidth * rect.width) / ATLAS_SIZE,
    (rect.y + downHeight * rect.height) / ATLAS_SIZE
  ];
}

function sampleSheet(sheet, alongWidth, downHeight) {
  const px = Math.min(
    sheet.width - 1,
    Math.max(0, alongWidth * sheet.width - 0.5)
  );
  const py = Math.min(
    sheet.height - 1,
    Math.max(0, downHeight * sheet.height - 0.5)
  );
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(sheet.width - 1, x0 + 1);
  const y1 = Math.min(sheet.height - 1, y0 + 1);
  const tx = px - x0;
  const ty = py - y0;
  const read = (cx, cy, channel) =>
    sheet.data[(cy * sheet.width + cx) * 3 + channel];
  return [0, 1, 2].map((channel) => {
    const top = read(x0, y0, channel) * (1 - tx) + read(x1, y0, channel) * tx;
    const bottom = read(x0, y1, channel) * (1 - tx) + read(x1, y1, channel) * tx;
    return top * (1 - ty) + bottom * ty;
  });
}

function paintBodyCell(rgba, sheet, side) {
  const rect = bodyCellRect(sheet, side);
  const left = rect.x - BODY_BLEED;
  const top = rect.y - BODY_BLEED;
  const right = rect.x + rect.width + BODY_BLEED;
  const bottom = rect.y + rect.height + BODY_BLEED;
  for (let row = top; row < bottom; row += 1) {
    if (row < 0 || row >= ATLAS_SIZE) continue;
    const downHeight = Math.min(
      1,
      Math.max(0, (row + 0.5 - rect.y) / rect.height)
    );
    for (let column = left; column < right; column += 1) {
      if (column < 0 || column >= ATLAS_SIZE) continue;
      const alongWidth = Math.min(
        1,
        Math.max(0, (column + 0.5 - rect.x) / rect.width)
      );
      const color = sampleSheet(sheet, alongWidth, downHeight);
      const index = (row * ATLAS_SIZE + column) * 4;
      rgba[index] = Math.round(color[0]);
      rgba[index + 1] = Math.round(color[1]);
      rgba[index + 2] = Math.round(color[2]);
    }
  }
}

const FEATHER = 0.012;
const HEAD_ASPECT = 0.205 / 0.195;
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

// Both hemispheres fade out over the same window, so the front crop and the
// back crop hand over to the sculpted colour across the ears instead of meeting
// at a hard line.
const HEMISPHERE_FADE_START = 0.12;
const HEMISPHERE_FADE_END = 0.42;

const FACE_IMAGE_LEFT = -1.02;
const FACE_IMAGE_RIGHT = 1.02;
const FACE_IMAGE_TOP = 1.04;
const FACE_IMAGE_BOTTOM = -1.08;
const FACE_IMAGE_FADE = 0.1;

// The generator needs the same rectangle to decide which vertices the face crop
// actually covers, so it does not whiten geometry the crop never reaches.
export const FACE_IMAGE_BOUNDS = Object.freeze({
  left: FACE_IMAGE_LEFT,
  right: FACE_IMAGE_RIGHT,
  top: FACE_IMAGE_TOP,
  bottom: FACE_IMAGE_BOTTOM,
  fade: FACE_IMAGE_FADE,
  aspect: HEAD_ASPECT,
  span: FACE_IMAGE_TOP - FACE_IMAGE_BOTTOM,
  // How far round the head a point has to face before the crop is painted onto
  // it at full strength. The generator uses the same number to decide which
  // vertices get the picture, so no vertex is left reading a half-painted texel.
  facing: HEMISPHERE_FADE_END
});

function sampleFaceImage(image, fx, fy) {
  const u = (fx - FACE_IMAGE_LEFT) / (FACE_IMAGE_RIGHT - FACE_IMAGE_LEFT);
  const v = (FACE_IMAGE_TOP - fy) / (FACE_IMAGE_TOP - FACE_IMAGE_BOTTOM);
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;

  const edge =
    Math.min(
      smoothstep(0, FACE_IMAGE_FADE, u),
      smoothstep(0, FACE_IMAGE_FADE, 1 - u),
      smoothstep(0, FACE_IMAGE_FADE, v),
      smoothstep(0, FACE_IMAGE_FADE, 1 - v)
    );
  if (edge <= 0) return null;

  const size = image.size;
  const px = Math.min(size - 1, Math.max(0, u * size - 0.5));
  const py = Math.min(size - 1, Math.max(0, v * size - 0.5));
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = px - x0;
  const ty = py - y0;

  const read = (cx, cy, channel) => image.data[(cy * size + cx) * 3 + channel];
  const channels = [0, 1, 2].map((channel) => {
    const top =
      read(x0, y0, channel) * (1 - tx) + read(x1, y0, channel) * tx;
    const bottom =
      read(x0, y1, channel) * (1 - tx) + read(x1, y1, channel) * tx;
    return top * (1 - ty) + bottom * ty;
  });

  return { color: channels, coverage: edge };
}

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

  if (face.body) paintBodyCell(rgba, face.body, "front");
  if (face.bodyBack) paintBodyCell(rgba, face.bodyBack, "back");

  for (let row = 0; row < HEAD_BAND_ROWS; row += 1) {
    const theta = (Math.PI * (row + 0.5)) / HEAD_BAND_ROWS;
    const sinTheta = Math.sin(theta);
    const y = Math.cos(theta);

    for (let column = 0; column < ATLAS_SIZE; column += 1) {
      const index = (row * ATLAS_SIZE + column) * 4;
      // A sculpted head carries its own colour per vertex, so anything the face
      // crop does not cover stays white and lets that colour through unchanged.
      const base = face.image ? [255, 255, 255] : skin;
      rgba[index] = base[0];
      rgba[index + 1] = base[1];
      rgba[index + 2] = base[2];

      const azimuth = unprojectHeadBandAzimuth((column + 0.5) / ATLAS_SIZE);
      const phi = 2 * Math.PI * (0.25 + azimuth);
      const z = Math.sin(phi) * sinTheta;
      const x = -Math.cos(phi) * sinTheta;
      const fy = y * HEAD_ASPECT;

      if (z <= HEMISPHERE_FADE_START) {
        // Seen from behind the figure turns left for right, so the back crop is
        // read mirrored. Without a back view this half stays white and the
        // sculpted hair colour shows through as before.
        if (!face.backImage || z >= -HEMISPHERE_FADE_START) continue;
        const sampled = sampleFaceImage(face.backImage, -x, fy);
        if (sampled) {
          paint(
            index,
            sampled.color,
            sampled.coverage *
              smoothstep(HEMISPHERE_FADE_START, HEMISPHERE_FADE_END, -z)
          );
        }
        continue;
      }

      const depth = smoothstep(HEMISPHERE_FADE_START, HEMISPHERE_FADE_END, z);
      const fx = x;

      if (face.image) {
        const sampled = sampleFaceImage(face.image, fx, fy);
        if (sampled) {
          paint(index, sampled.color, sampled.coverage * depth);
        }
        continue;
      }

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
              face.irisRadiusX * 0.42,
              face.irisRadiusY * 0.5
            )
          )
        )
      );
      const lashBand =
        coverage(
          ellipseDistance(
            eyeX,
            fy,
            face.eyeX,
            face.eyeY,
            face.eyeRadiusX * 1.06,
            face.eyeRadiusY * 1.1
          )
        ) *
        smoothstep(
          face.eyeY + face.eyeRadiusY * face.lashStart,
          face.eyeY + face.eyeRadiusY * (face.lashStart + 0.35),
          fy
        );
      paint(index, lash, lashBand * depth);

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
              face.eyeY + face.eyeRadiusY * 0.02,
              face.eyeRadiusX * 0.24,
              face.eyeRadiusY * 0.24
            )
          )
        )
      );

      const browMask =
        coverage(
          arcDistance(
            eyeX,
            fy,
            face.eyeX,
            face.browY - face.browCurve,
            face.browCurve,
            face.browThickness
          )
        ) *
        (eyeX > face.eyeX - face.browSpan && eyeX < face.eyeX + face.browSpan
          ? 1
          : 0);
      paint(index, brow, browMask * depth);
    }
  }

  return encodePng(ATLAS_SIZE, ATLAS_SIZE, rgba);
}

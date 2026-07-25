import { describe, expect, it } from "vitest";
import {
  ATLAS_SIZE,
  HEAD_BAND_ASPECT,
  HEAD_BAND_ROWS,
  HEAD_EXTENTS,
  headBandDirection
} from "../scripts/lib/character-atlas.mjs";
import { GLB_FILES } from "./support/glb-skeleton";
import { readGlbAtlas } from "./support/glb-atlas";

/**
 * The face, measured on the atlas that ships inside each GLB.
 *
 * At 5.5 heads tall the face was a handful of pixels and almost anything read
 * as "a face". At 2.5 skull-heads it is the dominant feature of the character,
 * so the rules the chibi research settled on are worth asserting rather than
 * eyeballing: every feature in the LOWER half of the head, eyes wide apart and
 * at least a quarter of head height, one specular highlight per eye, and a nose
 * and mouth that are almost nothing.
 *
 * Every threshold below is a property of the drawing, not a pixel address, so
 * the face can be retuned freely as long as it still reads as a face.
 */

// Head height in face space. `fy` runs from -HEAD_BAND_ASPECT at the chin to
// +HEAD_BAND_ASPECT at the crown.
const HEAD_HEIGHT = 2 * HEAD_BAND_ASPECT;

// Only the part of the band that faces the camera. Past this the skull is
// turning away and whatever is painted there is never read straight on.
const FRONT_FACING = 0.35;

/**
 * INK: everything the painter drew in a line colour — the eye rim, the upper
 * lash, the iris, the pupil, the brow and the lip.
 *
 * Measured on the shipped atlases, the head band holds two well separated
 * families: flat skin at 0.95..1.00 of its own luma, the cheek shade and the
 * blush at 0.87..0.98, and every line colour at 0.10..0.55. A cut at 0.62 of
 * the flat-skin luma lands in the empty gap between them for all six palettes,
 * so "is this texel ink" needs no copy of the palette and no per-character
 * tuning.
 */
const INK_LUMA_FRACTION = 0.62;

/**
 * How far round the skull a texel sits, as the angle between the surface normal
 * there and dead ahead.
 *
 * This is the number the grazing-angle defect is about. The head is an
 * ellipsoid, so its normal is not the position direction: at a point (fx, z) in
 * face space the normal runs along (fx / halfWidth, ., z / halfDepth), and the
 * head is wider than it is deep. A texel at azimuth A is seen edge-on from a
 * camera yawed (90 - A) degrees, and the model is walked away from the camera
 * at roughly forty.
 */
const HEAD_DEPTH_RATIO = HEAD_EXTENTS.z / HEAD_EXTENTS.x;

function inkAzimuthDegrees(fx: number, z: number) {
  return (Math.atan2(HEAD_DEPTH_RATIO * Math.abs(fx), z) * 180) / Math.PI;
}

function luma([r, g, b]: readonly [number, number, number]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Every texel on the front half of the skull the painter drew a line on. */
function inkMask(fileName: string): Uint8Array {
  const atlas = readGlbAtlas(fileName);
  const cut = luma(baseSkinOf(fileName)) * INK_LUMA_FRACTION;
  const mask = new Uint8Array(ATLAS_SIZE * HEAD_BAND_ROWS);
  for (let row = 0; row < HEAD_BAND_ROWS; row += 1) {
    for (let column = 0; column < ATLAS_SIZE; column += 1) {
      if (headBandDirection(column, row).z <= 0) continue;
      if (luma(atlas.pixel(column, row)) >= cut) continue;
      mask[row * ATLAS_SIZE + column] = 1;
    }
  }
  return mask;
}

interface Texel {
  column: number;
  row: number;
  fx: number;
  fy: number;
}

interface Blob {
  texels: Texel[];
  minFy: number;
  maxFy: number;
  centroidFx: number;
  centroidFy: number;
}

function channelDistance(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
) {
  return Math.max(
    Math.abs(a[0] - b[0]),
    Math.abs(a[1] - b[1]),
    Math.abs(a[2] - b[2])
  );
}

/**
 * The head sphere carries no colour of its own, so all of it that no feature
 * reaches is painted flat skin — which makes skin far and away the most common
 * texel in the band, and the baseline every feature is measured against without
 * the test needing its own copy of the palette.
 */
function baseSkinOf(fileName: string): [number, number, number] {
  const atlas = readGlbAtlas(fileName);
  const counts = new Map<number, number>();
  for (let row = 0; row < HEAD_BAND_ROWS; row += 4) {
    for (let column = 0; column < ATLAS_SIZE; column += 4) {
      const [r, g, b] = atlas.pixel(column, row);
      const key = (r << 16) | (g << 8) | b;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let best = 0;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = key;
    }
  }
  return [(best >> 16) & 255, (best >> 8) & 255, best & 255];
}

/** Every front-facing texel the painter moved away from flat skin. */
function featureMask(fileName: string, threshold: number): Uint8Array {
  const atlas = readGlbAtlas(fileName);
  const skin = baseSkinOf(fileName);
  const mask = new Uint8Array(ATLAS_SIZE * HEAD_BAND_ROWS);
  for (let row = 0; row < HEAD_BAND_ROWS; row += 1) {
    for (let column = 0; column < ATLAS_SIZE; column += 1) {
      if (headBandDirection(column, row).z < FRONT_FACING) continue;
      if (channelDistance(atlas.pixel(column, row), skin) < threshold) continue;
      mask[row * ATLAS_SIZE + column] = 1;
    }
  }
  return mask;
}

function labelBlobs(mask: Uint8Array, minimumTexels: number): Blob[] {
  const seen = new Uint8Array(mask.length);
  const blobs: Blob[] = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    const texels: Texel[] = [];

    while (stack.length > 0) {
      const at = stack.pop() as number;
      const row = Math.floor(at / ATLAS_SIZE);
      const column = at % ATLAS_SIZE;
      const { fx, fy } = headBandDirection(column, row);
      texels.push({ column, row, fx, fy });
      const neighbours = [
        column > 0 ? at - 1 : -1,
        column < ATLAS_SIZE - 1 ? at + 1 : -1,
        row > 0 ? at - ATLAS_SIZE : -1,
        row < HEAD_BAND_ROWS - 1 ? at + ATLAS_SIZE : -1
      ];
      for (const next of neighbours) {
        if (next < 0 || seen[next] || !mask[next]) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }

    if (texels.length < minimumTexels) continue;
    let sumFx = 0;
    let sumFy = 0;
    let minFy = Infinity;
    let maxFy = -Infinity;
    for (const texel of texels) {
      sumFx += texel.fx;
      sumFy += texel.fy;
      if (texel.fy < minFy) minFy = texel.fy;
      if (texel.fy > maxFy) maxFy = texel.fy;
    }
    blobs.push({
      texels,
      minFy,
      maxFy,
      centroidFx: sumFx / texels.length,
      centroidFy: sumFy / texels.length
    });
  }
  return blobs;
}

/**
 * The eyes: the two feature blobs that carry a specular highlight. A highlight
 * is the one thing the painter draws in pure white, and nothing else on the
 * head is white, so it identifies an eye without the test needing to know the
 * character's palette or where the eye was supposed to go.
 */
function eyeBlobsOf(fileName: string) {
  const atlas = readGlbAtlas(fileName);
  const blobs = labelBlobs(featureMask(fileName, 40), 200);
  const isHighlight = (texel: Texel) => {
    const [r, g, b] = atlas.pixel(texel.column, texel.row);
    return r >= 250 && g >= 250 && b >= 250;
  };
  return blobs
    .map((blob) => ({
      ...blob,
      highlights: labelBlobs(
        (() => {
          const mask = new Uint8Array(ATLAS_SIZE * HEAD_BAND_ROWS);
          for (const texel of blob.texels) {
            if (isHighlight(texel)) mask[texel.row * ATLAS_SIZE + texel.column] = 1;
          }
          return mask;
        })(),
        12
      ).length
    }))
    .filter((blob) => blob.highlights > 0);
}

describe.each(GLB_FILES)("%s drawn chibi face", (fileName) => {
  it("draws two eyes, each carrying a single specular highlight", () => {
    const eyes = eyeBlobsOf(fileName);
    expect(eyes).toHaveLength(2);
    for (const eye of eyes) {
      expect(eye.highlights).toBe(1);
    }
  });

  it("keeps the eyes in the lower half of the head", () => {
    // Chibi construction: the upper half of the head is forehead. An eye whose
    // centre sits above the head's own centre is adult proportion.
    for (const eye of eyeBlobsOf(fileName)) {
      expect(eye.centroidFy).toBeLessThan(0);
    }
  });

  it("keeps the eye line high enough that the forehead does not dome", () => {
    // The other side of the rule above, and the one that was missing. Pushed
    // far enough down the head, "every feature in the lower half" stops reading
    // as chibi and starts reading as a bulging cranium with a face parked under
    // it: the eye line at 39% of the head left the top three fifths of the
    // skull as bare forehead, which is what the design review called a dome.
    //
    // -0.16 is 42% of the head's height measured up from the chin, so together
    // with the rule above the eye line is pinned into 42%..50% — low enough to
    // be chibi, high enough that the forehead is a band and not the head.
    for (const eye of eyeBlobsOf(fileName)) {
      expect(eye.centroidFy).toBeGreaterThan(-0.16);
    }
  });

  it("keeps every inked feature clear of the three-quarter silhouette", () => {
    // THE GRAZING-ANGLE EYE.
    //
    // Walking away from the camera the model sits near forty degrees of yaw,
    // where the far side of the head turns out of sight at fifty degrees of
    // azimuth. Ink painted past that reaches the outline; ink painted just
    // inside it is compressed against the outline, which is how an eye stops
    // reading as an eye and starts reading as a dark gash on the silhouette.
    //
    // The eye's outer rim used to reach 45.6 degrees on the player and 46.7 on
    // the airport traveller — four degrees inside the outline, where the
    // surface is foreshortened twelve to one. 38 leaves a margin the eye can
    // actually be seen through: it is compressed under four to one instead.
    //
    // This is a property of where the face is DRAWN, so it cannot be met by
    // fading the far side out: the hemisphere fade keys on depth, and the whole
    // eye lives at depth 0.62 upwards, far above any fade window that would
    // still let the face reach the cheek.
    const limit = 38;
    const mask = inkMask(fileName);
    let worst = 0;
    let worstAt = "";
    for (let row = 0; row < HEAD_BAND_ROWS; row += 1) {
      for (let column = 0; column < ATLAS_SIZE; column += 1) {
        if (!mask[row * ATLAS_SIZE + column]) continue;
        const { fx, fy, z } = headBandDirection(column, row);
        const azimuth = inkAzimuthDegrees(fx, z);
        if (azimuth <= worst) continue;
        worst = azimuth;
        worstAt = `fx ${fx.toFixed(3)} fy ${fy.toFixed(3)}`;
      }
    }
    expect(worst, `${fileName} worst ink at ${worstAt}`).toBeLessThan(limit);
  });

  it("draws nothing on the cheek beside the mouth", () => {
    // The brow is an arc struck about a centre well below the eye, and the only
    // thing that kept it to the brow was a window on |fx|. Nothing bounded it
    // vertically, so the BOTTOM of the same circle was painted too: a second
    // dark arc running down each cheek to the corner of the mouth, which reads
    // as a nasolabial fold on a character with no nose. It is also the ink that
    // reached furthest round the skull on all three feminine faces.
    //
    // Everything the painter is allowed to draw below the eye line — the nose
    // shading and the mouth — is central. Anything inked out on the cheek is a
    // stray.
    // Below the EYES, not below the eye line: the iris and the pupil are ink
    // and they sit below the centre of their own eye, which is where they
    // belong.
    const eyes = eyeBlobsOf(fileName);
    const underEyes = Math.min(...eyes.map((eye) => eye.minFy));
    for (const blob of labelBlobs(inkMask(fileName), 200)) {
      if (blob.maxFy >= underEyes) continue;
      expect(
        Math.abs(blob.centroidFx),
        `${fileName} ink blob at fy ${blob.centroidFy.toFixed(2)}`
      ).toBeLessThan(0.25);
    }
  });

  it("gives each eye at least a quarter of head height", () => {
    for (const eye of eyeBlobsOf(fileName)) {
      expect((eye.maxFy - eye.minFy) / HEAD_HEIGHT).toBeGreaterThan(0.25);
    }
  });

  it("sets the eyes wide apart with a full eye's width between them", () => {
    const eyes = eyeBlobsOf(fileName).sort(
      (first, second) => first.centroidFx - second.centroidFx
    );
    expect(eyes).toHaveLength(2);
    const [left, right] = eyes;
    expect(left.centroidFx).toBeLessThan(-0.28);
    expect(right.centroidFx).toBeGreaterThan(0.28);

    const innerEdge = (eye: Blob) =>
      Math.min(...eye.texels.map((texel) => Math.abs(texel.fx)));
    const width = (eye: Blob) => {
      const values = eye.texels.map((texel) => Math.abs(texel.fx));
      return Math.max(...values) - Math.min(...values);
    };
    const gap = innerEdge(left) + innerEdge(right);
    expect(gap).toBeGreaterThan(Math.max(width(left), width(right)) * 0.6);
  });

  it("paints the same face on both sides of the nose", () => {
    // The crop this replaced was an orthographic photograph pinned to a sphere:
    // it tore into a hard vertical seam as it wrapped and left the far half of
    // the head as blank skin. A face drawn in face space is mirror-symmetric by
    // construction, so any asymmetry here is a projection artefact.
    const atlas = readGlbAtlas(fileName);
    let total = 0;
    let sampled = 0;
    for (let row = 0; row < HEAD_BAND_ROWS; row += 2) {
      for (let column = 0; column < ATLAS_SIZE / 2; column += 2) {
        if (headBandDirection(column, row).z < FRONT_FACING) continue;
        total += channelDistance(
          atlas.pixel(column, row),
          atlas.pixel(ATLAS_SIZE - 1 - column, row)
        );
        sampled += 1;
      }
    }
    expect(sampled).toBeGreaterThan(1000);
    expect(total / sampled).toBeLessThan(2);
  });

  it("keeps the nose and mouth almost nothing beside the eyes", () => {
    const eyes = eyeBlobsOf(fileName);
    const eyeArea = eyes.reduce((sum, eye) => sum + eye.texels.length, 0);
    const belowEyes = labelBlobs(featureMask(fileName, 40), 200).filter(
      (blob) => blob.maxFy < Math.min(...eyes.map((eye) => eye.minFy))
    );
    const lowerArea = belowEyes.reduce(
      (sum, blob) => sum + blob.texels.length,
      0
    );
    // Everything under the eyes — nose shading and mouth together — stays well
    // under the eyes themselves. In this style the eyes carry the character and
    // a drawn-out nose or a wide mouth is what makes a chibi read as an adult.
    expect(lowerArea).toBeLessThan(eyeArea * 0.35);
  });
});

describe("the six characters are given distinguishable faces", () => {
  // One face painted six times is a crowd of clones. Eye shape, brow angle and
  // mouth are enough to tell them apart, so the measured signature of any two
  // has to differ somewhere.
  it("gives no two characters the same eye geometry", () => {
    const signatures = GLB_FILES.map((fileName) => {
      const eyes = eyeBlobsOf(fileName);
      const area = eyes.reduce((sum, eye) => sum + eye.texels.length, 0);
      const height = Math.max(...eyes.map((eye) => eye.maxFy - eye.minFy));
      const drop = Math.min(...eyes.map((eye) => eye.centroidFy));
      const spread = Math.max(...eyes.map((eye) => Math.abs(eye.centroidFx)));
      return { fileName, area, height, drop, spread };
    });

    for (let first = 0; first < signatures.length; first += 1) {
      for (let second = first + 1; second < signatures.length; second += 1) {
        const a = signatures[first];
        const b = signatures[second];
        const differs =
          Math.abs(a.area - b.area) / Math.max(a.area, b.area) > 0.04 ||
          Math.abs(a.height - b.height) > 0.02 ||
          Math.abs(a.drop - b.drop) > 0.02 ||
          Math.abs(a.spread - b.spread) > 0.02;
        expect(differs, `${a.fileName} vs ${b.fileName}`).toBe(true);
      }
    }
  });
});

describe.each(GLB_FILES)("%s seen from the side", (fileName) => {
  // THE PROFILE EYE, AND WHY IT STAYS AS IT IS.
  //
  // At ninety degrees of yaw the near eye is still a compressed mark hugging the
  // outline, and this is a bound rather than a bug. A texel whose surface normal
  // sits A degrees round from dead ahead projects at sin(A - yaw) of the head's
  // own half-width, so at yaw 90 it lands at cos(A). The eye ink measures 8.6 to
  // 35.3 degrees across the six characters, which puts the whole eye between 82%
  // and 99% of the way out to the silhouette. There is nowhere else on the
  // screen for it to be: at side on, the entire drawn face lives in the outer
  // sixth of the head.
  //
  // Moving it inboard means painting it further round the skull, and that is the
  // trade the three-quarter limit above already priced. Measured on the shipped
  // atlases:
  //
  //   outer rim at 0.80 of the half-width at yaw 90 -> ink to 36.9 degrees,
  //     and the FAR eye at the three-quarter yaw of 40 goes from 3.4-3.9:1
  //     compression to 4.4:1. Two percentage points at side on for a tenth of
  //     the three-quarter view.
  //   outer rim at 0.70 -> ink to 45.6 degrees, far eye at 13:1. That is the
  //     exact number the grazing-angle rebuild removed.
  //   outer rim at 0.60 -> ink to 53.1 degrees, which is past the outline at
  //     yaw 40: the far eye is not drawn at all.
  //
  // Walking away from the camera is the pose the chase view holds; standing
  // exactly side on to it is not. So the eye stays where it is, and what is
  // asserted here is that nobody quietly makes side on worse while tuning the
  // front.
  const eyes = eyeBlobsOf(fileName);
  const azimuthsOf = () => {
    const mask = inkMask(fileName);
    let low = Infinity;
    let high = 0;
    for (let row = 0; row < HEAD_BAND_ROWS; row += 1) {
      for (let column = 0; column < ATLAS_SIZE; column += 1) {
        if (!mask[row * ATLAS_SIZE + column]) continue;
        const { fx, fy, z } = headBandDirection(column, row);
        if (fy <= -0.34 || fy >= 0.14 || Math.abs(fx) <= 0.12) continue;
        const azimuth = inkAzimuthDegrees(fx, z);
        if (azimuth < low) low = azimuth;
        if (azimuth > high) high = azimuth;
      }
    }
    return { low, high };
  };

  it("keeps as much of the eye at side on as an ellipsoid allows", () => {
    expect(eyes.length).toBe(2);
    const { low, high } = azimuthsOf();
    const radians = (value: number) => (value * Math.PI) / 180;
    const projected = (yaw: number) =>
      Math.abs(Math.sin(radians(high - yaw)) - Math.sin(radians(low - yaw)));

    // Side on the eye keeps better than a third of the width it draws head on.
    // It was 32% before the grazing-angle rebuild pulled the ink in; anything
    // under 0.35 means the eye has been pushed back out round the skull.
    expect(projected(90) / projected(0)).toBeGreaterThan(0.35);
    // And it may not be bought by widening the eye's reach round the skull,
    // which is what would show up here as a rim past the three-quarter bound.
    expect(high).toBeLessThan(38);
  });
});

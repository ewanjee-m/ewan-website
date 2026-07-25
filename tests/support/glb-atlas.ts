import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";

/**
 * Pulls the base colour atlas back out of an exported GLB and decodes it.
 *
 * The face is a painting, so the only honest way to test it is to look at the
 * pixels that ship. Re-running the painter inside the test and measuring its
 * output would pass against a generator that was never re-run, which is exactly
 * how the drawn face sat unreachable behind `if (face.image)` without anything
 * going red.
 */

const MODEL_DIRECTORY = "public/assets/models/characters";

export interface AtlasImage {
  size: number;
  /** Straight RGB read, with column 0 at the left and row 0 at the top. */
  pixel: (column: number, row: number) => [number, number, number];
}

interface GlbDocument {
  images?: Array<{ bufferView?: number; mimeType?: string }>;
  bufferViews?: Array<{ byteOffset?: number; byteLength?: number }>;
}

function extractPng(fileName: string): Buffer {
  const file = readFileSync(resolve(process.cwd(), MODEL_DIRECTORY, fileName));
  const jsonLength = file.readUInt32LE(12);
  const json = JSON.parse(
    file.toString("utf8", 20, 20 + jsonLength).trimEnd()
  ) as GlbDocument;
  const binaryStart = 20 + jsonLength + 8;

  const image = json.images?.[0];
  if (!image || image.mimeType !== "image/png") {
    throw new Error(`${fileName}: no embedded PNG atlas`);
  }
  const view = json.bufferViews?.[image.bufferView ?? -1];
  if (!view) throw new Error(`${fileName}: atlas image has no buffer view`);
  const start = binaryStart + (view.byteOffset ?? 0);
  return file.subarray(start, start + (view.byteLength ?? 0));
}

// PNG stores each row under one of five predictors. Undoing them is the whole
// decoder: the atlas is written as 8-bit RGB with no interlacing, so there is
// no palette, no bit packing and no Adam7 pass to handle.
function unfilter(raw: Buffer, width: number, height: number): Uint8Array {
  const bytesPerPixel = 3;
  const stride = width * bytesPerPixel;
  const out = new Uint8Array(stride * height);

  for (let row = 0; row < height; row += 1) {
    const type = raw[row * (stride + 1)];
    const source = row * (stride + 1) + 1;
    const target = row * stride;
    for (let at = 0; at < stride; at += 1) {
      const left = at >= bytesPerPixel ? out[target + at - bytesPerPixel] : 0;
      const up = row > 0 ? out[target - stride + at] : 0;
      const upLeft =
        row > 0 && at >= bytesPerPixel
          ? out[target - stride + at - bytesPerPixel]
          : 0;
      let predicted = 0;
      if (type === 1) predicted = left;
      else if (type === 2) predicted = up;
      else if (type === 3) predicted = (left + up) >> 1;
      else if (type === 4) {
        const estimate = left + up - upLeft;
        const toLeft = Math.abs(estimate - left);
        const toUp = Math.abs(estimate - up);
        const toUpLeft = Math.abs(estimate - upLeft);
        predicted =
          toLeft <= toUp && toLeft <= toUpLeft
            ? left
            : toUp <= toUpLeft
              ? up
              : upLeft;
      }
      out[target + at] = (raw[source + at] + predicted) & 0xff;
    }
  }
  return out;
}

function decodePng(png: Buffer): AtlasImage {
  let at = 8;
  let width = 0;
  let height = 0;
  const data: Buffer[] = [];

  while (at < png.byteLength) {
    const length = png.readUInt32BE(at);
    const type = png.toString("ascii", at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 2 || body[12] !== 0) {
        throw new Error("Atlas is not a non-interlaced 8-bit RGB PNG");
      }
    } else if (type === "IDAT") {
      data.push(Buffer.from(body));
    } else if (type === "IEND") {
      break;
    }
    at += 12 + length;
  }

  const pixels = unfilter(
    inflateSync(Buffer.concat(data)),
    width,
    height
  );
  if (width !== height) throw new Error("Atlas is not square");

  return {
    size: width,
    pixel(column, row) {
      const index = (row * width + column) * 3;
      return [pixels[index], pixels[index + 1], pixels[index + 2]];
    }
  };
}

const cache = new Map<string, AtlasImage>();

export function readGlbAtlas(fileName: string): AtlasImage {
  const hit = cache.get(fileName);
  if (hit) return hit;
  const decoded = decodePng(extractPng(fileName));
  cache.set(fileName, decoded);
  return decoded;
}

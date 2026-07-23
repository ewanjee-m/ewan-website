import { deflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = new Uint32Array(256);

for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, checksum]);
}

// PNG lets each row pick how it is written down. Rows are scored by the sum of
// their byte magnitudes, the usual heuristic: the smaller that sum, the less
// the row varies and the better it packs. Painted artwork on a flat field packs
// far smaller this way than writing every row unfiltered, which is what keeps
// the head atlas inside the GLB size limit.
function filterRow(current, previous, stride, bytesPerPixel) {
  const candidates = [];
  for (let type = 0; type < 5; type += 1) {
    const line = Buffer.alloc(stride);
    for (let at = 0; at < stride; at += 1) {
      const left = at >= bytesPerPixel ? current[at - bytesPerPixel] : 0;
      const up = previous[at];
      const upLeft = at >= bytesPerPixel ? previous[at - bytesPerPixel] : 0;
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
          toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
      }
      line[at] = (current[at] - predicted) & 0xff;
    }
    let score = 0;
    for (const byte of line) score += byte < 128 ? byte : 256 - byte;
    candidates.push({ type, line, score });
  }
  return candidates.reduce((best, entry) =>
    entry.score < best.score ? entry : best
  );
}

export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `Pixel buffer is ${rgba.length} bytes; expected ${width * height * 4}`
    );
  }
  // The atlas is opaque throughout, so the alpha channel is dropped rather than
  // shipped as a constant plane.
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  const current = Buffer.alloc(stride);
  let previous = Buffer.alloc(stride);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const source = (row * width + column) * 4;
      current[column * 3] = rgba[source];
      current[column * 3 + 1] = rgba[source + 1];
      current[column * 3 + 2] = rgba[source + 2];
    }
    const chosen = filterRow(current, previous, stride, 3);
    raw[row * (stride + 1)] = chosen.type;
    chosen.line.copy(raw, row * (stride + 1) + 1);
    previous = Buffer.from(current);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

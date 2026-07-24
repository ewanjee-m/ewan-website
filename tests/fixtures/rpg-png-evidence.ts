import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);
const MAX_DECODED_PIXELS = 20_000_000;

const CHANNELS_BY_COLOR_TYPE = new Map([
  [0, 1],
  [2, 3],
  [4, 2],
  [6, 4]
] as const);

const CRC_TABLE = new Uint32Array(256);

for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

export interface PngCrop {
  x: number;
  y: number;
  width: number;
  height: number;
  sampleStep?: number;
}

export interface PngEvidence {
  width: number;
  height: number;
  blackPixelRatio: number;
  sampledPixels: number;
}

export interface SolidColorPngOptions {
  width: number;
  height: number;
  color: readonly [red: number, green: number, blue: number, alpha?: number];
  filterType?: 0 | 1 | 2 | 3 | 4;
}

interface DecodedPng {
  width: number;
  height: number;
  channels: number;
  colorType: 0 | 2 | 4 | 6;
  pixels: Buffer;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function assertIntegerInRange(
  value: number,
  name: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`
    );
  }
}

function createChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.allocUnsafe(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  Buffer.from(data).copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, Buffer.from(data)])), 8 + data.length);
  return chunk;
}

function paethPredictor(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  if (aboveDistance <= upperLeftDistance) {
    return above;
  }
  return upperLeft;
}

function filterByte(
  filterType: number,
  raw: number,
  left: number,
  above: number,
  upperLeft: number
): number {
  switch (filterType) {
    case 0:
      return raw;
    case 1:
      return (raw - left) & 0xff;
    case 2:
      return (raw - above) & 0xff;
    case 3:
      return (raw - Math.floor((left + above) / 2)) & 0xff;
    case 4:
      return (raw - paethPredictor(left, above, upperLeft)) & 0xff;
    default:
      throw new Error(`Unsupported PNG filter type: ${filterType}`);
  }
}

function reconstructByte(
  filterType: number,
  filtered: number,
  left: number,
  above: number,
  upperLeft: number
): number {
  switch (filterType) {
    case 0:
      return filtered;
    case 1:
      return (filtered + left) & 0xff;
    case 2:
      return (filtered + above) & 0xff;
    case 3:
      return (filtered + Math.floor((left + above) / 2)) & 0xff;
    case 4:
      return (filtered + paethPredictor(left, above, upperLeft)) & 0xff;
    default:
      throw new Error(`Unsupported PNG filter type: ${filterType}`);
  }
}

function decodePng(input: Uint8Array): DecodedPng {
  const png = Buffer.from(input);
  if (
    png.length < PNG_SIGNATURE.length ||
    !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    throw new Error("Invalid PNG signature");
  }

  let offset = PNG_SIGNATURE.length;
  let width: number | undefined;
  let height: number | undefined;
  let channels: number | undefined;
  let colorType: 0 | 2 | 4 | 6 | undefined;
  let sawIend = false;
  const idatChunks: Buffer[] = [];

  while (offset < png.length) {
    if (png.length - offset < 12) {
      throw new Error("PNG chunk header or CRC exceeds file bounds");
    }

    const dataLength = png.readUInt32BE(offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + dataLength;
    const chunkEnd = dataEnd + 4;

    if (dataEnd < dataStart || chunkEnd > png.length) {
      throw new Error("PNG chunk data exceeds file bounds");
    }

    const typeBytes = png.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString("ascii");
    const data = png.subarray(dataStart, dataEnd);
    const storedCrc = png.readUInt32BE(dataEnd);
    const calculatedCrc = crc32(png.subarray(offset + 4, dataEnd));

    if (storedCrc !== calculatedCrc) {
      throw new Error(`PNG chunk CRC mismatch for ${type}`);
    }

    if (width === undefined && type !== "IHDR") {
      throw new Error("PNG IHDR must be the first chunk");
    }

    if (type === "IHDR") {
      if (width !== undefined || dataLength !== 13) {
        throw new Error("PNG must contain one 13-byte IHDR chunk");
      }

      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8]!;
      const parsedColorType = data[9]!;
      channels = CHANNELS_BY_COLOR_TYPE.get(
        parsedColorType as 0 | 2 | 4 | 6
      );

      if (width === 0 || height === 0) {
        throw new Error("PNG dimensions must be positive");
      }
      if (
        !Number.isSafeInteger(width * height) ||
        width * height > MAX_DECODED_PIXELS
      ) {
        throw new Error("PNG dimensions exceed the decoding pixel limit");
      }
      if (bitDepth !== 8 || channels === undefined) {
        throw new Error(
          "PNG must use 8-bit color type 0, 2, 4, or 6"
        );
      }
      if (data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
        throw new Error(
          "PNG must use standard compression and filtering without interlacing"
        );
      }

      colorType = parsedColorType as 0 | 2 | 4 | 6;
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      if (dataLength !== 0) {
        throw new Error("PNG IEND chunk must be empty");
      }
      sawIend = true;
      offset = chunkEnd;
      break;
    }

    offset = chunkEnd;
  }

  if (
    width === undefined ||
    height === undefined ||
    channels === undefined ||
    colorType === undefined
  ) {
    throw new Error("PNG is missing a valid IHDR chunk");
  }
  if (idatChunks.length === 0) {
    throw new Error("PNG is missing IDAT data");
  }
  if (!sawIend) {
    throw new Error("PNG is missing an IEND chunk");
  }
  if (offset !== png.length) {
    throw new Error("PNG contains trailing data after IEND");
  }

  const rowBytes = width * channels;
  const expectedInflatedBytes = height * (rowBytes + 1);
  if (
    !Number.isSafeInteger(rowBytes) ||
    !Number.isSafeInteger(expectedInflatedBytes)
  ) {
    throw new Error("PNG dimensions exceed safe decoding limits");
  }

  let inflated: Buffer;
  try {
    inflated = inflateSync(Buffer.concat(idatChunks), {
      maxOutputLength: expectedInflatedBytes + 1
    });
  } catch (error) {
    throw new Error("PNG IDAT data could not be inflated", { cause: error });
  }

  if (inflated.length !== expectedInflatedBytes) {
    throw new Error(
      `PNG decompressed data length mismatch: expected ${expectedInflatedBytes}, received ${inflated.length}`
    );
  }

  const pixels = Buffer.allocUnsafe(rowBytes * height);

  for (let y = 0; y < height; y += 1) {
    const filteredRowStart = y * (rowBytes + 1);
    const filterType = inflated[filteredRowStart]!;
    const outputRowStart = y * rowBytes;

    if (filterType > 4) {
      throw new Error(`Unsupported PNG filter type: ${filterType}`);
    }

    for (let byteIndex = 0; byteIndex < rowBytes; byteIndex += 1) {
      const outputIndex = outputRowStart + byteIndex;
      const left =
        byteIndex >= channels ? pixels[outputIndex - channels]! : 0;
      const above = y > 0 ? pixels[outputIndex - rowBytes]! : 0;
      const upperLeft =
        y > 0 && byteIndex >= channels
          ? pixels[outputIndex - rowBytes - channels]!
          : 0;

      pixels[outputIndex] = reconstructByte(
        filterType,
        inflated[filteredRowStart + 1 + byteIndex]!,
        left,
        above,
        upperLeft
      );
    }
  }

  return { width, height, channels, colorType, pixels };
}

export function analyzePngCrop(
  input: Uint8Array,
  crop?: PngCrop
): PngEvidence {
  const decoded = decodePng(input);
  const area = crop ?? {
    x: 0,
    y: 0,
    width: decoded.width,
    height: decoded.height,
    sampleStep: 1
  };
  const sampleStep = area.sampleStep ?? 1;

  assertIntegerInRange(area.x, "crop.x", 0);
  assertIntegerInRange(area.y, "crop.y", 0);
  assertIntegerInRange(area.width, "crop.width", 1);
  assertIntegerInRange(area.height, "crop.height", 1);
  assertIntegerInRange(sampleStep, "crop.sampleStep", 1);

  if (
    area.x + area.width > decoded.width ||
    area.y + area.height > decoded.height
  ) {
    throw new Error("PNG crop exceeds image bounds");
  }

  let blackPixels = 0;
  let sampledPixels = 0;

  for (let y = area.y; y < area.y + area.height; y += sampleStep) {
    for (let x = area.x; x < area.x + area.width; x += sampleStep) {
      const pixelOffset = (y * decoded.width + x) * decoded.channels;
      let red: number;
      let green: number;
      let blue: number;
      let alpha = 255;

      if (decoded.colorType === 0 || decoded.colorType === 4) {
        red = decoded.pixels[pixelOffset]!;
        green = red;
        blue = red;
        if (decoded.colorType === 4) {
          alpha = decoded.pixels[pixelOffset + 1]!;
        }
      } else {
        red = decoded.pixels[pixelOffset]!;
        green = decoded.pixels[pixelOffset + 1]!;
        blue = decoded.pixels[pixelOffset + 2]!;
        if (decoded.colorType === 6) {
          alpha = decoded.pixels[pixelOffset + 3]!;
        }
      }

      if (alpha === 0 || (red <= 16 && green <= 16 && blue <= 16)) {
        blackPixels += 1;
      }
      sampledPixels += 1;
    }
  }

  return {
    width: decoded.width,
    height: decoded.height,
    blackPixelRatio: blackPixels / sampledPixels,
    sampledPixels
  };
}

export function encodeSolidColorPng({
  width,
  height,
  color,
  filterType = 0
}: SolidColorPngOptions): Buffer {
  assertIntegerInRange(width, "width", 1, 0xffffffff);
  assertIntegerInRange(height, "height", 1, 0xffffffff);
  assertIntegerInRange(filterType, "filterType", 0, 4);

  const [red, green, blue, alpha = 255] = color;
  for (const [name, value] of [
    ["red", red],
    ["green", green],
    ["blue", blue],
    ["alpha", alpha]
  ] as const) {
    assertIntegerInRange(value, name, 0, 255);
  }

  const channels = 4;
  const rowBytes = width * channels;
  const rawPixels = Buffer.allocUnsafe(rowBytes * height);
  for (let offset = 0; offset < rawPixels.length; offset += channels) {
    rawPixels[offset] = red;
    rawPixels[offset + 1] = green;
    rawPixels[offset + 2] = blue;
    rawPixels[offset + 3] = alpha;
  }

  const filtered = Buffer.allocUnsafe(height * (rowBytes + 1));
  for (let y = 0; y < height; y += 1) {
    const filteredRowStart = y * (rowBytes + 1);
    const rawRowStart = y * rowBytes;
    filtered[filteredRowStart] = filterType;

    for (let byteIndex = 0; byteIndex < rowBytes; byteIndex += 1) {
      const rawIndex = rawRowStart + byteIndex;
      const left =
        byteIndex >= channels ? rawPixels[rawIndex - channels]! : 0;
      const above = y > 0 ? rawPixels[rawIndex - rowBytes]! : 0;
      const upperLeft =
        y > 0 && byteIndex >= channels
          ? rawPixels[rawIndex - rowBytes - channels]!
          : 0;
      filtered[filteredRowStart + 1 + byteIndex] = filterByte(
        filterType,
        rawPixels[rawIndex]!,
        left,
        above,
        upperLeft
      );
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    createChunk("IHDR", ihdr),
    createChunk("IDAT", deflateSync(filtered)),
    createChunk("IEND", Buffer.alloc(0))
  ]);
}

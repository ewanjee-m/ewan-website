const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function padTo4(length) {
  return (4 - (length % 4)) % 4;
}

function readChunks(glb) {
  if (glb.toString("utf8", 0, 4) !== "glTF") {
    throw new Error("Buffer is not a GLB container");
  }
  const chunks = [];
  let offset = 12;
  while (offset < glb.byteLength) {
    const length = glb.readUInt32LE(offset);
    const type = glb.readUInt32LE(offset + 4);
    chunks.push({
      type,
      data: glb.subarray(offset + 8, offset + 8 + length)
    });
    offset += 8 + length + padTo4(length);
  }
  return chunks;
}

function writeGlb(json, binary) {
  const jsonText = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPadding = Buffer.alloc(padTo4(jsonText.byteLength), 0x20);
  const jsonChunk = Buffer.concat([jsonText, jsonPadding]);
  const binaryPadding = Buffer.alloc(padTo4(binary.byteLength), 0);
  const binaryChunk = Buffer.concat([binary, binaryPadding]);

  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(
    12 + 8 + jsonChunk.byteLength + 8 + binaryChunk.byteLength,
    8
  );

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.byteLength, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK, 4);

  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binaryChunk.byteLength, 0);
  binaryHeader.writeUInt32LE(BIN_CHUNK, 4);

  return Buffer.concat([
    header,
    jsonHeader,
    jsonChunk,
    binaryHeader,
    binaryChunk
  ]);
}

export function removeTextures(glb) {
  const chunks = readChunks(glb);
  const jsonChunk = chunks.find(({ type }) => type === JSON_CHUNK);
  const binaryChunk = chunks.find(({ type }) => type === BIN_CHUNK);
  if (!jsonChunk || !binaryChunk) {
    throw new Error("GLB is missing its JSON or BIN chunk");
  }

  const json = JSON.parse(jsonChunk.data.toString("utf8").trimEnd());
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const material of json.materials ?? []) {
    delete material.normalTexture;
    delete material.occlusionTexture;
    delete material.emissiveTexture;
    if (material.pbrMetallicRoughness) {
      delete material.pbrMetallicRoughness.baseColorTexture;
      delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    }
  }

  return writeGlb(json, Buffer.from(binaryChunk.data));
}

export function attachBaseColorTexture(glb, png) {
  const chunks = readChunks(glb);
  const jsonChunk = chunks.find(({ type }) => type === JSON_CHUNK);
  const binaryChunk = chunks.find(({ type }) => type === BIN_CHUNK);
  if (!jsonChunk || !binaryChunk) {
    throw new Error("GLB is missing its JSON or BIN chunk");
  }

  const json = JSON.parse(jsonChunk.data.toString("utf8").trimEnd());
  if (json.materials?.length !== 1) {
    throw new Error(
      `Expected exactly one material; found ${json.materials?.length ?? 0}`
    );
  }
  if (json.buffers?.length !== 1) {
    throw new Error(
      `Expected exactly one buffer; found ${json.buffers?.length ?? 0}`
    );
  }

  const alignment = Buffer.alloc(padTo4(binaryChunk.data.byteLength), 0);
  const byteOffset = binaryChunk.data.byteLength + alignment.byteLength;
  const binary = Buffer.concat([binaryChunk.data, alignment, png]);

  json.bufferViews = json.bufferViews ?? [];
  json.bufferViews.push({
    buffer: 0,
    byteOffset,
    byteLength: png.byteLength
  });
  json.images = json.images ?? [];
  json.images.push({
    bufferView: json.bufferViews.length - 1,
    mimeType: "image/png"
  });
  json.samplers = json.samplers ?? [];
  json.samplers.push({
    magFilter: 9729,
    minFilter: 9987,
    // The head band wraps a full turn horizontally, and the generator sends the
    // triangles that straddle the back of the head past U 1 rather than letting
    // them run backwards across the atlas. Repeating resolves those to the same
    // pixels; clamping would stretch the edge column down the back of the head.
    wrapS: 10497,
    wrapT: 33071
  });
  json.textures = json.textures ?? [];
  json.textures.push({
    sampler: json.samplers.length - 1,
    source: json.images.length - 1
  });

  const material = json.materials[0];
  material.pbrMetallicRoughness = material.pbrMetallicRoughness ?? {};
  material.pbrMetallicRoughness.baseColorTexture = {
    index: json.textures.length - 1,
    texCoord: 0
  };
  json.buffers[0].byteLength = binary.byteLength;

  return writeGlb(json, binary);
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MODEL_FILES = [
  "player-male.glb",
  "player-female.glb",
  "npc-airport-traveler.glb",
  "npc-gyukatsu-chef.glb",
  "npc-sakura-visitor.glb",
  "npc-hanabi-yukata.glb"
] as const;

const REQUIRED_BONES = [
  "root",
  "hips",
  "chest",
  "head",
  "leftUpperArm",
  "leftLowerArm",
  "rightUpperArm",
  "rightLowerArm",
  "leftUpperLeg",
  "leftLowerLeg",
  "rightUpperLeg",
  "rightLowerLeg",
  "leftFoot",
  "rightFoot",
  "hair",
  "leftSleeve",
  "rightSleeve",
  "hem",
  "leftEye",
  "rightEye",
  "jaw"
] as const;

interface GlbJson {
  accessors?: Array<{ count?: number }>;
  asset?: { version?: string };
  bufferViews?: Array<{ byteLength?: number }>;
  images?: Array<{ bufferView?: number; mimeType?: string }>;
  materials?: Array<{
    pbrMetallicRoughness?: {
      baseColorTexture?: { index?: number; texCoord?: number };
    };
  }>;
  textures?: Array<{ source?: number; sampler?: number }>;
  meshes?: Array<{
    primitives?: Array<{
      attributes?: Record<string, number>;
      indices?: number;
    }>;
  }>;
  nodes?: Array<{ name?: string }>;
  skins?: unknown[];
}

function readGlb(fileName: string) {
  const file = readFileSync(
    resolve(process.cwd(), "public/assets/models/characters", fileName)
  );
  expect(file.byteLength, fileName).toBeLessThan(2_000_000);
  expect(file.toString("utf8", 0, 4), fileName).toBe("glTF");
  expect(file.readUInt32LE(4), fileName).toBe(2);
  expect(file.readUInt32LE(8), fileName).toBe(file.byteLength);

  const jsonLength = file.readUInt32LE(12);
  expect(file.toString("utf8", 16, 20), fileName).toBe("JSON");
  const json = JSON.parse(
    file.toString("utf8", 20, 20 + jsonLength).trimEnd()
  ) as GlbJson;
  return { file, json };
}

describe("smooth rigged toon character model contract", () => {
  it.each(MODEL_FILES)(
    "%s is a compact one-material skinned GLB with the shared humanoid rig",
    (fileName) => {
      const { json } = readGlb(fileName);
      const nodeNames = new Set(json.nodes?.map(({ name }) => name));
      const primitives = json.meshes?.flatMap(
        ({ primitives: meshPrimitives }) => meshPrimitives ?? []
      );

      expect(json.asset?.version).toBe("2.0");
      expect(json.skins, fileName).toHaveLength(1);
      expect(json.meshes, fileName).toHaveLength(1);
      expect(primitives, fileName).toHaveLength(1);
      expect(json.materials, fileName).toHaveLength(1);
      for (const boneName of REQUIRED_BONES) {
        expect(nodeNames.has(boneName), `${fileName}: ${boneName}`).toBe(true);
      }

      const primitive = primitives?.[0];
      expect(primitive?.attributes, fileName).toEqual(
        expect.objectContaining({
          POSITION: expect.any(Number),
          NORMAL: expect.any(Number),
          COLOR_0: expect.any(Number),
          JOINTS_0: expect.any(Number),
          WEIGHTS_0: expect.any(Number)
        })
      );
      const indexAccessor = primitive?.indices;
      expect(indexAccessor, fileName).toEqual(expect.any(Number));
      const indexCount =
        indexAccessor === undefined
          ? Number.POSITIVE_INFINITY
          : (json.accessors?.[indexAccessor]?.count ?? Number.POSITIVE_INFINITY);
      expect(indexCount / 3, fileName).toBeLessThanOrEqual(25_000);
    }
  );

  it.each(MODEL_FILES)(
    "%s carries the painted face atlas as an embedded base colour texture",
    (fileName) => {
      const { json } = readGlb(fileName);
      const primitive = json.meshes?.[0]?.primitives?.[0];
      const baseColorTexture =
        json.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture;

      expect(primitive?.attributes?.TEXCOORD_0, fileName).toEqual(
        expect.any(Number)
      );
      expect(baseColorTexture?.index, fileName).toEqual(expect.any(Number));
      expect(baseColorTexture?.texCoord ?? 0, fileName).toBe(0);

      const texture = json.textures?.[baseColorTexture?.index ?? -1];
      expect(texture?.source, fileName).toEqual(expect.any(Number));

      const image = json.images?.[texture?.source ?? -1];
      expect(image?.mimeType, fileName).toBe("image/png");
      expect(image?.bufferView, fileName).toEqual(expect.any(Number));
      expect(
        json.bufferViews?.[image?.bufferView ?? -1]?.byteLength ?? 0,
        fileName
      ).toBeGreaterThan(0);
    }
  );

  it.each(MODEL_FILES)("%s embeds no external asset reference", (fileName) => {
    const { json } = readGlb(fileName) as unknown as {
      json: { buffers?: Array<{ uri?: string }>; images?: Array<{ uri?: string }> };
    };

    for (const buffer of json.buffers ?? []) {
      expect(buffer.uri, fileName).toBeUndefined();
    }
    for (const image of json.images ?? []) {
      expect(image.uri, fileName).toBeUndefined();
    }
  });
});

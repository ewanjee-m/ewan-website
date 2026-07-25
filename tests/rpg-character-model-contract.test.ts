import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Color } from "three";
import { NPC_SIGHT_LINE_RADIUS } from "../app/world/RpgCharacterCameraVisibility";
import { NPC_ADULT_VISIBLE_HEIGHT } from "../app/world/NpcCharacterModels";
import { RPG_PLAYER_CHARACTER_DESIGNS } from "../app/world/RpgPlayerCharacterDesign";
import {
  RPG_PLAYER_WALL_STANDOFF,
  RPG_SILHOUETTE_STANDOFF_KINDS,
  RPG_WORLD_COLLISIONS,
  RPG_WORLD_SCENE_LANDMARKS,
  isRpgWorldModelWalkable
} from "../app/world/RpgWorldModel";

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

// The generator paints every part with a flat vertex colour taken from the
// character's palette, so a colour is the only handle a test has on "which part
// is this vertex". Reading positions back per colour is therefore how the
// assembly of the figure — how deep the chest sits, how wide the hair is, where
// the arm ends — can be asserted without re-running the generator.
interface MeshSample {
  positions: Float64Array;
  colors: Float64Array;
  indices: Uint32Array;
  height: number;
}

interface FullGlbJson extends GlbJson {
  accessors?: Array<{
    bufferView?: number;
    byteOffset?: number;
    componentType?: number;
    count?: number;
    normalized?: boolean;
    type?: string;
  }>;
  bufferViews?: Array<{
    byteOffset?: number;
    byteLength?: number;
    byteStride?: number;
  }>;
}

const COMPONENT_BYTES: Record<number, number> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4
};

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4
};

function readMesh(fileName: string): MeshSample {
  const file = readFileSync(
    resolve(process.cwd(), "public/assets/models/characters", fileName)
  );
  const jsonLength = file.readUInt32LE(12);
  const json = JSON.parse(
    file.toString("utf8", 20, 20 + jsonLength).trimEnd()
  ) as FullGlbJson;
  const binaryStart = 20 + jsonLength + 8;

  const readAccessor = (accessorIndex: number) => {
    const accessor = json.accessors?.[accessorIndex];
    if (!accessor) throw new Error(`${fileName}: missing accessor`);
    const view = json.bufferViews?.[accessor.bufferView ?? -1];
    if (!view) throw new Error(`${fileName}: missing buffer view`);
    const components = TYPE_COMPONENTS[accessor.type ?? "SCALAR"];
    const bytes = COMPONENT_BYTES[accessor.componentType ?? 5126];
    const stride = view.byteStride ?? components * bytes;
    const base =
      binaryStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const count = accessor.count ?? 0;
    const readOne = (offset: number) => {
      switch (accessor.componentType) {
        case 5126:
          return file.readFloatLE(offset);
        case 5125:
          return file.readUInt32LE(offset);
        case 5123:
          return accessor.normalized
            ? file.readUInt16LE(offset) / 65535
            : file.readUInt16LE(offset);
        case 5122:
          return file.readInt16LE(offset);
        case 5120:
          return file.readInt8(offset);
        default:
          return accessor.normalized
            ? file.readUInt8(offset) / 255
            : file.readUInt8(offset);
      }
    };
    const out = new Float64Array(count * components);
    for (let element = 0; element < count; element += 1) {
      for (let component = 0; component < components; component += 1) {
        out[element * components + component] = readOne(
          base + element * stride + component * bytes
        );
      }
    }
    return { data: out, components };
  };

  const attributes = json.meshes?.[0]?.primitives?.[0]?.attributes ?? {};
  const positions = readAccessor(attributes.POSITION).data;
  const colorAccessor = readAccessor(attributes.COLOR_0);
  const colors = new Float64Array((positions.length / 3) * 3);
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      colors[vertex * 3 + channel] =
        colorAccessor.data[vertex * colorAccessor.components + channel];
    }
  }

  const indexAccessor = json.meshes?.[0]?.primitives?.[0]?.indices;
  const indices = Uint32Array.from(
    indexAccessor === undefined ? [] : readAccessor(indexAccessor).data
  );

  let maxY = -Infinity;
  let minY = Infinity;
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    const y = positions[vertex * 3 + 1];
    if (y > maxY) maxY = y;
    if (y < minY) minY = y;
  }

  return { positions, colors, indices, height: maxY - minY };
}

// A capsule carries vertex rows only at its cap seams, so sampling raw vertices
// inside a thin horizontal band mostly finds nothing. Cutting the triangles with
// the plane instead gives the real outline of the figure at that height.
function crossSectionAtY(
  mesh: MeshSample,
  y: number,
  accept: (x: number, z: number) => boolean
) {
  let min = Infinity;
  let max = -Infinity;
  const read = (vertex: number, axis: 0 | 1 | 2) =>
    mesh.positions[vertex * 3 + axis];

  for (let corner = 0; corner < mesh.indices.length; corner += 3) {
    const triangle = [
      mesh.indices[corner],
      mesh.indices[corner + 1],
      mesh.indices[corner + 2]
    ];
    for (let edge = 0; edge < 3; edge += 1) {
      const from = triangle[edge];
      const to = triangle[(edge + 1) % 3];
      const fromY = read(from, 1);
      const toY = read(to, 1);
      if (fromY === toY) continue;
      const t = (y - fromY) / (toY - fromY);
      if (t < 0 || t > 1) continue;
      const x = read(from, 0) + (read(to, 0) - read(from, 0)) * t;
      const z = read(from, 2) + (read(to, 2) - read(from, 2)) * t;
      if (!accept(x, z)) continue;
      if (x < min) min = x;
      if (x > max) max = x;
    }
  }
  return { min, max, width: max > min ? max - min : 0 };
}

function vertexIndicesOfColor(mesh: MeshSample, hex: string): number[] {
  const wanted = new Color(hex);
  const found: number[] = [];
  for (let vertex = 0; vertex < mesh.colors.length / 3; vertex += 1) {
    if (
      Math.abs(mesh.colors[vertex * 3] - wanted.r) < 2e-3 &&
      Math.abs(mesh.colors[vertex * 3 + 1] - wanted.g) < 2e-3 &&
      Math.abs(mesh.colors[vertex * 3 + 2] - wanted.b) < 2e-3
    ) {
      found.push(vertex);
    }
  }
  return found;
}

function extentOf(
  mesh: MeshSample,
  indices: number[],
  axis: 0 | 1 | 2,
  predicate: (x: number, y: number, z: number) => boolean = () => true
) {
  let min = Infinity;
  let max = -Infinity;
  let absMax = -Infinity;
  let count = 0;
  for (const vertex of indices) {
    const x = mesh.positions[vertex * 3];
    const y = mesh.positions[vertex * 3 + 1];
    const z = mesh.positions[vertex * 3 + 2];
    if (!predicate(x, y, z)) continue;
    const value = mesh.positions[vertex * 3 + axis];
    if (value < min) min = value;
    if (value > max) max = value;
    if (Math.abs(value) > absMax) absMax = Math.abs(value);
    count += 1;
  }
  return { min, max, absMax, count };
}

const MALE_PALETTE = {
  skin: "#f3bfa0",
  hair: "#242635",
  upper: "#18385e",
  lower: "#252b35",
  inner: "#f6edda",
  head: "#ffffff"
} as const;

// The skull is the one part of every character painted pure white, because it
// carries the face texture rather than a flat palette colour. That makes it the
// handle for measuring proportion without re-running the generator.
const SKULL_WHITE = "#ffffff";

function skullBlock(mesh: MeshSample) {
  const indices = vertexIndicesOfColor(mesh, SKULL_WHITE);
  const vertical = extentOf(mesh, indices, 1);
  const lateral = extentOf(mesh, indices, 0);
  return {
    count: indices.length,
    chin: vertical.min,
    crown: vertical.max,
    height: vertical.max - vertical.min,
    halfWidth: lateral.absMax
  };
}

/**
 * The skull's largest horizontal half-extent, in world units.
 *
 * Measured on the shipped mesh and then scaled to the height the renderer
 * actually draws the character at, because every number the world reasons with
 * is in world units while the GLB is authored at its own native height.
 *
 * Both horizontal axes, not just x: a blocker is grown by the radius in its own
 * frame, the visitor turns freely inside that square, and the head is deep as
 * well as wide, so the half-extent that has to fit is the larger of the two.
 */
function worldSkullHalfExtent(fileName: string, visibleHeight: number) {
  const mesh = readMesh(fileName);
  const indices = vertexIndicesOfColor(mesh, SKULL_WHITE);
  const lateral = extentOf(mesh, indices, 0);
  const depth = extentOf(mesh, indices, 2);
  return (
    (Math.max(lateral.absMax, depth.absMax) / mesh.height) * visibleHeight
  );
}

describe("the world is sized from the silhouette that ships", () => {
  const widestPlayerSkull = Math.max(
    ...Object.values(RPG_PLAYER_CHARACTER_DESIGNS).map((design) =>
      worldSkullHalfExtent(design.modelAsset.split("/").pop()!, design.height)
    )
  );

  it("stops the visitor with no more than a finger of skull inside a wall", () => {
    // THE HEAD THROUGH THE WALL.
    //
    // The chibi rebuild made the SKULL — not the torso — the widest part of the
    // figure, and the standoff the world keeps between the visitor and a
    // building had been sized to the old adult torso. The head therefore sank
    // into whatever the body stopped against, which is the one clipping defect
    // the chase camera is pointed straight at, because the head is what fills
    // the frame.
    //
    // The standoff cannot simply BE the skull: the gyukatsu plaza's east
    // parasol seat stands 0.500 from the noren machiya and the town's own test
    // keeps every seat on walkable ground. 0.49 is as far as the town goes, so
    // 0.04 of skull is still allowed inside a wall against the 0.23 it was.
    // A finger, not a face — and the bound is asserted rather than left to
    // drift, so a wider skull cannot quietly go back through the wall.
    for (const design of Object.values(RPG_PLAYER_CHARACTER_DESIGNS)) {
      const fileName = design.modelAsset.split("/").pop()!;
      const halfExtent = worldSkullHalfExtent(fileName, design.height);
      expect(
        halfExtent - RPG_PLAYER_WALL_STANDOFF,
        `${fileName} skull half-extent ${halfExtent.toFixed(4)}`
      ).toBeLessThan(0.05);
    }
  });

  it("keeps the wall standoff no wider than the skull that sets it", () => {
    // The other side of the rule. Every gap the visitor walks through past a
    // wall is measured against this standoff, so it may not be padded "to be
    // safe": a standoff wider than the silhouette it exists to cover closes
    // passages for nothing.
    expect(RPG_PLAYER_WALL_STANDOFF).toBeLessThanOrEqual(widestPlayerSkull);
  });

  it("holds the visitor most of a skull off every wall", () => {
    // The constant is worth nothing unless the walkable test actually applies
    // it. A wall, a shopfront, a tower and a stall counter are solid from the
    // ground past the top of the head, so a point half a unit off the middle of
    // any of their faces has to be refused — that is precisely the standing
    // room the old 0.3 clearance sold to the visitor with their skull inside
    // the wall.
    const walls = RPG_WORLD_SCENE_LANDMARKS.filter(
      ({ blocksMovement, kind }) =>
        blocksMovement && RPG_SILHOUETTE_STANDOFF_KINDS.has(kind)
    );
    expect(walls.length).toBeGreaterThan(10);
    const inside = RPG_PLAYER_WALL_STANDOFF - 0.03;
    for (const landmark of walls) {
      const cosine = Math.cos(landmark.rotationY ?? 0);
      const sine = Math.sin(landmark.rotationY ?? 0);
      for (const [localX, localZ] of [
        [landmark.size[0] / 2 + inside, 0],
        [-(landmark.size[0] / 2 + inside), 0],
        [0, landmark.size[2] / 2 + inside],
        [0, -(landmark.size[2] / 2 + inside)]
      ]) {
        const x = landmark.position[0] + cosine * localX + sine * localZ;
        const z = landmark.position[2] - sine * localX + cosine * localZ;
        expect(
          isRpgWorldModelWalkable([x, z]),
          `${landmark.id} at ${x.toFixed(2)},${z.toFixed(2)}`
        ).toBe(false);
      }
    }
  });

  it("leaves posts, gates and trees on the clearance the town is laid out to", () => {
    // The other half of the choice, and the reason the standoff is not global.
    // A lantern post is 0.18 wide, a torii is a gate the road runs through and
    // a cherry tree is a canopy on a thin trunk: none of them is a wall the
    // visitor walks along, and the tightest ground dressing in town — a
    // crossing stripe at 0.37, planter walls at 0.50, hedges at 0.505 — stands
    // beside exactly those three kinds.
    for (const landmark of RPG_WORLD_SCENE_LANDMARKS) {
      if (!landmark.blocksMovement) continue;
      if (RPG_SILHOUETTE_STANDOFF_KINDS.has(landmark.kind)) continue;
      const collision = RPG_WORLD_COLLISIONS.find(
        ({ sourceId }) => sourceId === landmark.id
      );
      expect(collision, landmark.id).toBeDefined();
      expect(collision!.halfSize[0], landmark.id).toBeCloseTo(
        landmark.size[0] / 2 + (landmark.collisionPadding?.[0] ?? 0),
        9
      );
    }
  });

  it("sights the camera past a townsperson on one real body half-width", () => {
    // NPC_SIGHT_LINE_RADIUS says in its own comment that it is one body
    // half-width, and the head is asserted above to be the widest shape in the
    // figure, so the townsperson's skull is that half-width. The constant was
    // written against the pre-chibi body and stopped describing anything.
    const halfExtent = worldSkullHalfExtent(
      "npc-hanabi-yukata.glb",
      NPC_ADULT_VISIBLE_HEIGHT
    );
    expect(
      NPC_SIGHT_LINE_RADIUS,
      `npc skull half-extent ${halfExtent.toFixed(4)}`
    ).toBeGreaterThanOrEqual(halfExtent);
    expect(NPC_SIGHT_LINE_RADIUS).toBeLessThan(halfExtent + 0.03);
  });
});

// Two head measures, because they drift apart silently if only one is asserted.
// The skull count is chin to the top of the bare head; the silhouette count is
// chin to the top of everything, which is what the eye actually reads at
// distance and what hair, a hat or a bun quietly lengthen.
describe.each(MODEL_FILES)("%s chibi proportion system", (fileName) => {
  const mesh = readMesh(fileName);
  const h = mesh.height;
  const skull = skullBlock(mesh);

  it("stands about 2.5 skull-heads tall", () => {
    expect(skull.count).toBeGreaterThan(0);
    const headCount = h / skull.height;
    // Wikipedia's super-deformed band is 2 to 3 heads; Clip Studio excludes
    // above 3 as "a child in normal proportion". 2.5 is the middle of the band
    // the research settled on, and the tolerance is what the jaw taper and the
    // crown flattening in createHeadGeometry cost either side of it.
    expect(headCount).toBeGreaterThan(2.3);
    expect(headCount).toBeLessThan(2.75);
  });

  it("stands about 2.2 silhouette-heads tall once hair is counted", () => {
    const silhouetteBlock = h - skull.chin;
    const silhouetteCount = h / silhouetteBlock;
    expect(silhouetteCount).toBeGreaterThan(1.9);
    expect(silhouetteCount).toBeLessThan(2.45);
  });

  it("makes the head the widest shape in the figure", () => {
    // The whole point of the reproportion: at 55 px per world unit the head is
    // the only shape carrying identity, so nothing may out-read it.
    expect(skull.halfWidth).toBeGreaterThan(0.16 * h);

    const torsoTop = skull.chin;
    const torso = crossSectionAtY(mesh, torsoTop - 0.06 * h, (x) =>
      Math.abs(x) < 0.2 * h
    );
    expect(torso.width).toBeGreaterThan(0);
    expect(skull.halfWidth * 2).toBeGreaterThan(torso.width);
  });

  it("wears its hairline on the forehead, not on the crown or the brow", () => {
    // THE FOREHEAD.
    //
    // Chibi construction puts the whole face in the lower half of the head, so
    // whatever the hair does not cover above it is bare forehead, and the
    // forehead is therefore a hair problem before it is a face problem. Two
    // ways to get it wrong, and the build had one of each: the long-haired
    // player's cap sat 0.05h behind the face and the fringe was gated on short
    // hair, so she had none at all and the front of her skull was bare to 92%
    // of its height — a dome. The short-haired player's fringe reached down to
    // 53%, under his own brows, which hides the one feature besides the eyes
    // that carries expression.
    //
    // Measured up the front centre line of the skull, where the hairline
    // actually reads. The brow sits near 66% and the crown at 100%, so the band
    // below is the bare forehead: 0.62..0.82 keeps it between a sixth and a
    // third of the head.
    // Hair only counts where it is OUTSIDE the skull. A cap ellipsoid drawn
    // large enough to close the back of the head passes down through the front
    // of the face on its way, and those vertices are buried: they are not a
    // hairline, and measuring them scores a bald head as a full fringe.
    const skullY = (skull.chin + skull.crown) / 2;
    const skullB = skull.height / 2;
    const skullZ = extentOf(mesh, vertexIndicesOfColor(mesh, SKULL_WHITE), 2);
    const skullC = (skullZ.max - skullZ.min) / 2;
    const skullCz = (skullZ.max + skullZ.min) / 2;

    let lowest = Infinity;
    for (let vertex = 0; vertex < mesh.colors.length / 3; vertex += 1) {
      const isSkull =
        Math.abs(mesh.colors[vertex * 3] - 1) < 2e-3 &&
        Math.abs(mesh.colors[vertex * 3 + 1] - 1) < 2e-3 &&
        Math.abs(mesh.colors[vertex * 3 + 2] - 1) < 2e-3;
      if (isSkull) continue;
      const x = mesh.positions[vertex * 3];
      const y = mesh.positions[vertex * 3 + 1];
      const z = mesh.positions[vertex * 3 + 2];
      // The front centre line only: the ears and any bun or lock are off it,
      // and nothing but hair is in front of the skull above the eyes.
      if (Math.abs(x) > 0.05 * h || z < skullCz) continue;
      if (y < skullY) continue;
      const outside =
        ((y - skullY) / skullB) ** 2 + ((z - skullCz) / skullC) ** 2 > 1;
      if (!outside) continue;
      if (y < lowest) lowest = y;
    }
    const hairline = (lowest - skull.chin) / skull.height;
    expect(hairline, `${fileName} hairline`).toBeGreaterThan(0.62);
    expect(hairline, `${fileName} hairline`).toBeLessThan(0.82);
  });

  it("carries an unbroken leg from the hip to the sole", () => {
    // The measured defect in the old build: at the ankle the leg column
    // collapsed to 0.025h against a 0.074h foot, because the shin capsule's
    // bottom dome tapered to nothing exactly where the foot ellipsoid ended.
    // Adjacent segments have to overlap while both are still at full width.
    // The window is the leg itself: from just above the sole up to the crotch
    // line at 0.24h. Carried higher it starts measuring the pelvis, which is
    // not part of the leg and is legitimately wider than one.
    const legColumn = (x: number) => x > 0.005 * h && x < 0.17 * h;
    const slices = 48;
    const low = 0.03 * h;
    const high = 0.2 * h;
    let thinnest = Infinity;
    let widest = 0;
    for (let slice = 0; slice <= slices; slice += 1) {
      const y = low + ((high - low) * slice) / slices;
      const { width } = crossSectionAtY(mesh, y, legColumn);
      if (width < thinnest) thinnest = width;
      if (width > widest) widest = width;
    }

    expect(widest).toBeGreaterThan(0.05 * h);
    // Same continuity threshold the arm has always been held to.
    expect(thinnest / widest).toBeGreaterThan(0.62);
  });

  it("builds limbs thick enough to read as rounded rather than as sticks", () => {
    // The limb thickness rule: a segment at least 0.65x as thick as it is long.
    // Measured on the shin, which is the thinnest segment in the figure.
    const legColumn = (x: number) => x > 0.005 * h && x < 0.17 * h;
    const { width } = crossSectionAtY(mesh, 0.11 * h, legColumn);
    expect(width).toBeGreaterThan(0.085 * h);
  });
});

describe("player-male figure assembly", () => {
  const mesh = readMesh("player-male.glb");
  const h = mesh.height;

  it("keeps the innerwear on the chest instead of floating a panel off it", () => {
    const inner = extentOf(
      mesh,
      vertexIndicesOfColor(mesh, MALE_PALETTE.inner),
      2
    );
    const happi = extentOf(
      mesh,
      vertexIndicesOfColor(mesh, MALE_PALETTE.upper),
      2,
      // Window re-anchored to the chibi torso, which spans 0.24h..0.545h
      // instead of the old adult 0.42h..0.78h. The assertion below is unchanged.
      (x, y) => Math.abs(x) < 0.075 * h && y > 0.33 * h && y < 0.53 * h
    );

    expect(inner.count).toBeGreaterThan(0);
    expect(happi.count).toBeGreaterThan(0);
    // The innerwear is the shirt under an open happi: its surface belongs to the
    // chest, so it may not stand proud of the jacket that frames it.
    expect(inner.max).toBeLessThanOrEqual(happi.max + 0.01 * h);
  });

  it("keeps the hair inside the skull silhouette at eye level", () => {
    const headIndices = vertexIndicesOfColor(mesh, MALE_PALETTE.head);
    const headBand = extentOf(mesh, headIndices, 1);
    const eyeLevel = (headBand.min + headBand.max) / 2;
    const window = (headBand.max - headBand.min) * 0.12;
    const inEyeBand = (_x: number, y: number) =>
      Math.abs(y - eyeLevel) < window;

    const head = extentOf(mesh, headIndices, 0, inEyeBand);
    const hair = extentOf(
      mesh,
      vertexIndicesOfColor(mesh, MALE_PALETTE.hair),
      0,
      inEyeBand
    );

    expect(head.count).toBeGreaterThan(0);
    expect(hair.count).toBeGreaterThan(0);
    // Hair wider than the skull at the ear line is what reads as a helmet or a
    // hood clamped round the face.
    expect(hair.absMax).toBeLessThanOrEqual(head.absMax);
  });

  it("carries an unbroken arm from the sleeve hem to the wrist", () => {
    // Window re-anchored: the chibi forearm sits at x about -0.112h with the
    // shoulder at y 0.465h and the fingertips at about 0.205h, where the adult
    // layout put them at -0.131h and 0.44h..0.66h.
    const armColumn = (x: number) => x < -0.05 * h && x > -0.2 * h;
    const slices = 40;
    const low = 0.24 * h;
    const high = 0.44 * h;
    let thinnest = Infinity;
    let widest = 0;
    for (let slice = 0; slice <= slices; slice += 1) {
      const y = low + ((high - low) * slice) / slices;
      const { width } = crossSectionAtY(mesh, y, armColumn);
      if (width < thinnest) thinnest = width;
      if (width > widest) widest = width;
    }

    expect(widest).toBeGreaterThan(0.05 * h);
    // A sleeve hem that stops before the forearm reaches full width leaves the
    // forearm reading as a separate tube hanging under the shoulder.
    expect(thinnest / widest).toBeGreaterThan(0.62);
  });

  it("hangs the hands at hip height rather than at the knee", () => {
    const skin = vertexIndicesOfColor(mesh, MALE_PALETTE.skin);
    const armSkin = extentOf(
      mesh,
      skin,
      1,
      // Outside the leg, whose outer edge is now at 0.108h. The old 0.1h cut
      // was clear of the adult leg but would sweep the chibi shin into the
      // sample and report the ankle as "the hand".
      (x, y) => Math.abs(x) > 0.115 * h && y > 0.15 * h
    );

    expect(armSkin.count).toBeGreaterThan(0);
    // Window re-anchored: the chibi hip line is at 0.24h and the wrist hangs at
    // 0.265h, where the adult layout put the hip at 0.51h and the wrist at
    // 0.42h. The rule being asserted — hands at the hip, not at the knee — is
    // the same one.
    expect(armSkin.min).toBeGreaterThan(0.19 * h);
  });

  it("shapes the happi shoulder as a flattened pad rather than a ball", () => {
    const all = Array.from(
      { length: mesh.positions.length / 3 },
      (_, index) => index
    );
    const shoulderDepth = extentOf(
      mesh,
      all,
      2,
      // Window re-anchored: the chibi shoulder joint is at y 0.465h, and the
      // window starts outside the torso, whose half-width is now 0.125h.
      (x, y) => x > 0.13 * h && x < 0.21 * h && y > 0.42 * h && y < 0.5 * h
    );
    const chestDepth = extentOf(
      mesh,
      vertexIndicesOfColor(mesh, MALE_PALETTE.upper),
      2,
      // Window re-anchored: the chibi chest block tops out at about 0.545h.
      (x, y) => Math.abs(x) < 0.05 * h && y > 0.36 * h && y < 0.47 * h
    );

    expect(shoulderDepth.count).toBeGreaterThan(0);
    expect(chestDepth.count).toBeGreaterThan(0);
    // A shoulder as deep as the chest is a puffer sleeve. The happi lies over
    // the deltoid, so its shoulder is markedly shallower than the body it sits
    // on.
    expect(shoulderDepth.max - shoulderDepth.min).toBeLessThan(
      (chestDepth.max - chestDepth.min) * 0.62
    );
  });
});

// A part that hangs in the air in front of the body is the defect class this
// rebuild exists to remove, and a vertex extent cannot see it: a piece 0.06h
// clear of the chest and a piece lying on it occupy the same box. What separates
// them is what is directly behind the piece. A vertical line through the figure
// at the piece's own (x, y) crosses every triangle covering that point in plan;
// the largest z among the crossings is the surface a viewer would see there if
// the piece were taken away. If the piece's own rearmost point is still in front
// of that surface, the gap between them is background.
function frontSurfaceZ(
  mesh: MeshSample,
  x: number,
  y: number,
  exclude: ReadonlySet<number>
) {
  let best = -Infinity;
  const { positions, indices } = mesh;
  for (let corner = 0; corner < indices.length; corner += 3) {
    const a = indices[corner];
    const b = indices[corner + 1];
    const c = indices[corner + 2];
    if (exclude.has(a) && exclude.has(b) && exclude.has(c)) continue;
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const bx = positions[b * 3];
    const by = positions[b * 3 + 1];
    const cx = positions[c * 3];
    const cy = positions[c * 3 + 1];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-12) continue;
    const u = ((x - ax) * (cy - ay) - (y - ay) * (cx - ax)) / area;
    const v = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / area;
    if (u < 0 || v < 0 || u + v > 1) continue;
    const z =
      positions[a * 3 + 2] +
      u * (positions[b * 3 + 2] - positions[a * 3 + 2]) +
      v * (positions[c * 3 + 2] - positions[a * 3 + 2]);
    if (z > best) best = z;
  }
  return best;
}

/**
 * The worst standoff between a group of vertices and whatever lies behind them,
 * measured in horizontal bands so a piece that touches at one end and lifts off
 * at the other is still caught. Positive means clear air behind that band.
 */
function worstStandoff(
  mesh: MeshSample,
  group: number[],
  bands: number
) {
  const set = new Set(group);
  let lowest = Infinity;
  let highest = -Infinity;
  for (const vertex of group) {
    const y = mesh.positions[vertex * 3 + 1];
    if (y < lowest) lowest = y;
    if (y > highest) highest = y;
  }

  let worst = -Infinity;
  let measured = 0;
  for (let band = 0; band < bands; band += 1) {
    const low = lowest + ((highest - lowest) * band) / bands;
    const high = lowest + ((highest - lowest) * (band + 1)) / bands;
    let closest = Infinity;
    for (const vertex of group) {
      const y = mesh.positions[vertex * 3 + 1];
      if (y < low || y > high) continue;
      const surface = frontSurfaceZ(
        mesh,
        mesh.positions[vertex * 3],
        y,
        set
      );
      if (!Number.isFinite(surface)) continue;
      closest = Math.min(closest, mesh.positions[vertex * 3 + 2] - surface);
    }
    if (!Number.isFinite(closest)) continue;
    measured += 1;
    if (closest > worst) worst = closest;
  }
  return { standoff: worst, bands: measured };
}

const KIMONO_COLLARS = [
  { fileName: "player-female.glb", inner: "#f8eedc" },
  { fileName: "npc-hanabi-yukata.glb", inner: "#fff1df" }
] as const;

describe.each(KIMONO_COLLARS)(
  "$fileName kimono collar",
  ({ fileName, inner }) => {
    it("lies on the garment instead of floating a capsule in front of it", () => {
      const mesh = readMesh(fileName);
      const h = mesh.height;
      // The collar band only: between the top of the obi and the chin, so the
      // sample is not diluted by the innerwear the same colour paints elsewhere.
      const collar = vertexIndicesOfColor(mesh, inner).filter((vertex) => {
        const y = mesh.positions[vertex * 3 + 1];
        const z = mesh.positions[vertex * 3 + 2];
        return y > 0.42 * h && y < 0.58 * h && z > 0;
      });

      expect(collar.length).toBeGreaterThan(20);
      const { standoff, bands } = worstStandoff(mesh, collar, 8);
      expect(bands).toBeGreaterThanOrEqual(6);
      // Cloth cut from the body's own surface stands off it by the lift the
      // patch is given, which is a fraction of a percent of figure height.
      // Anything past this is air the viewer sees straight through.
      expect(standoff).toBeLessThan(0.006 * h);
    });
  }
);

describe("npc-airport-traveler bag", () => {
  const STRAP = "#6d352d";
  const mesh = readMesh("npc-airport-traveler.glb");
  const h = mesh.height;
  const strap = vertexIndicesOfColor(mesh, STRAP);

  it("hangs the strap from the shoulder rather than from the jaw", () => {
    const vertical = extentOf(mesh, strap, 1);
    expect(vertical.count).toBeGreaterThan(0);
    // The chin is at 0.545h and the shoulder joint at 0.465h. A strap that
    // starts above the chin is growing out of the character's face.
    expect(vertical.max).toBeLessThan(0.52 * h);
    // It still has to reach the shoulder, or it is a belt.
    expect(vertical.max).toBeGreaterThan(0.44 * h);
  });

  it("runs the strap across the jacket rather than through it", () => {
    const set = new Set(strap);
    let deepest = 0;
    let sampled = 0;
    for (const vertex of strap) {
      const y = mesh.positions[vertex * 3 + 1];
      // Above the bag itself, which legitimately sits proud of the body.
      if (y < 0.38 * h) continue;
      const surface = frontSurfaceZ(
        mesh,
        mesh.positions[vertex * 3],
        y,
        set
      );
      if (!Number.isFinite(surface)) continue;
      sampled += 1;
      deepest = Math.min(deepest, mesh.positions[vertex * 3 + 2] - surface);
    }
    expect(sampled).toBeGreaterThan(10);
    // A strap that dives behind the jacket surface disappears and comes back
    // out lower down, which is the "passes through the coat" read.
    expect(deepest).toBeGreaterThan(-0.008 * h);
  });
});

describe("npc-sakura-visitor", () => {
  const SKIRT = "#c94f6d";
  const CAMERA_BODY = "#2f3238";
  const CAMERA_STRAP = "#4a3f3a";
  const mesh = readMesh("npc-sakura-visitor.glb");
  const h = mesh.height;

  it("rolls the skirt hem under instead of cutting it off square", () => {
    const skirt = vertexIndicesOfColor(mesh, SKIRT);
    const vertical = extentOf(mesh, skirt, 1);
    expect(vertical.count).toBeGreaterThan(50);

    const span = vertical.max - vertical.min;
    const halfWidthAt = (from: number, to: number) =>
      extentOf(
        mesh,
        skirt,
        0,
        (_x, y) => y >= vertical.min + span * from && y <= vertical.min + span * to
      ).absMax;

    const atHem = halfWidthAt(0, 0.06);
    const widest = halfWidthAt(0, 1);
    expect(widest).toBeGreaterThan(0.09 * h);
    // A cylinder ends at its widest ring, so the hem is a right-angled corner
    // and the skirt reads as a box. Cloth turns under: the outermost few
    // percent of the hem's height close back in.
    expect(atHem).toBeLessThan(widest * 0.9);
  });

  it("hangs the chest camera from a strap instead of parking a knob on it", () => {
    const body = vertexIndicesOfColor(mesh, CAMERA_BODY);
    const strap = vertexIndicesOfColor(mesh, CAMERA_STRAP);
    const bodyX = extentOf(mesh, body, 0);
    const bodyY = extentOf(mesh, body, 1);

    expect(bodyX.count).toBeGreaterThan(0);
    // A camera is a landscape box. A circle of any size is a doorknob.
    expect(bodyX.max - bodyX.min).toBeGreaterThan(
      (bodyY.max - bodyY.min) * 1.6
    );

    const strapY = extentOf(mesh, strap, 1);
    expect(strapY.count).toBeGreaterThan(0);
    // The strap has to arrive from the neck, so the chain of contact from the
    // body to the prop is unbroken.
    expect(strapY.max).toBeGreaterThan(0.5 * h);
    expect(strapY.min).toBeLessThan(bodyY.max);
  });
});

// THE BACK OF THE HEAD.
//
// The chase camera holds the back of a character longer than any other view, so
// it is the view an NPC's hair has to survive, and it is the one the shipped
// build failed: the ponytail and the bun both read as a single shapeless mass
// of hair colour with no line anywhere in them. Nothing below asserts that they
// look nice — what it asserts is the three properties whose absence is what
// "shapeless" means: a gather the hair is tied at, a width that falls all the
// way from the gather to the tip, and a line where a mass of hair meets the
// head it is pinned to.

/** The generator's own shade helper, so the test names the colours it painted. */
function shade(hex: string, factor: number) {
  return `#${new Color(hex).multiplyScalar(factor).getHexString()}`;
}

/**
 * Whether any triangle of `group` covers (x, y) seen from the front.
 *
 * Vertex extents cannot answer "how wide is the tail here": a coarse ellipsoid
 * carries vertex rows only at its own latitudes, so a horizontal band mostly
 * finds nothing, and a tail that has split into two locks reads as one wide
 * span if only its outer edges are measured. Coverage is sampled instead, which
 * gives both the width of each lock and the gap between them.
 */
function coversXY(
  mesh: MeshSample,
  group: ReadonlySet<number>,
  x: number,
  y: number
) {
  const { positions, indices } = mesh;
  for (let corner = 0; corner < indices.length; corner += 3) {
    const a = indices[corner];
    const b = indices[corner + 1];
    const c = indices[corner + 2];
    if (!group.has(a) || !group.has(b) || !group.has(c)) continue;
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const bx = positions[b * 3];
    const by = positions[b * 3 + 1];
    const cx = positions[c * 3];
    const cy = positions[c * 3 + 1];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-12) continue;
    const u = ((x - ax) * (cy - ay) - (y - ay) * (cx - ax)) / area;
    const v = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / area;
    if (u >= 0 && v >= 0 && u + v <= 1) return true;
  }
  return false;
}

/** The covered runs of x at one height, as [from, to] pairs. */
function coverageRuns(
  mesh: MeshSample,
  group: ReadonlySet<number>,
  y: number,
  from: number,
  to: number,
  samples = 160
) {
  const runs: Array<[number, number]> = [];
  const step = (to - from) / samples;
  let open: number | null = null;
  for (let index = 0; index <= samples; index += 1) {
    const x = from + step * index;
    if (coversXY(mesh, group, x, y)) {
      if (open === null) open = x;
    } else if (open !== null) {
      runs.push([open, x - step]);
      open = null;
    }
  }
  if (open !== null) runs.push([open, to]);
  return runs.filter(([start, end]) => end - start > step * 1.5);
}

const widestRun = (runs: ReadonlyArray<readonly [number, number]>) =>
  runs.reduce((widest, [start, end]) => Math.max(widest, end - start), 0);

describe("npc-sakura-visitor ponytail", () => {
  const HAIR = "#8f573d";
  const TIE = "#d8546f";
  const mesh = readMesh("npc-sakura-visitor.glb");
  const h = mesh.height;
  const hair = new Set(vertexIndicesOfColor(mesh, HAIR));

  it("gathers the tail at a tie instead of letting it hang loose", () => {
    const tie = vertexIndicesOfColor(mesh, TIE);
    expect(tie.length).toBeGreaterThan(20);

    const vertical = extentOf(mesh, tie, 1);
    const lateral = extentOf(mesh, tie, 0);
    // High on the figure and out on the tail's own side of the body: a band
    // anywhere else is a belt, not a hair tie.
    expect(vertical.min).toBeGreaterThan(0.6 * h);
    expect(vertical.max).toBeLessThan(0.78 * h);
    expect(lateral.min).toBeGreaterThan(0.08 * h);
    // Flat. A band is a band because it is far wider than it is tall.
    expect(lateral.max - lateral.min).toBeGreaterThan(
      (vertical.max - vertical.min) * 1.6
    );
  });

  it("narrows the tail from the tie to the tip", () => {
    // Measured below the back of the head, so the only hair in the window is
    // the tail itself.
    const heights = [0.52, 0.44, 0.36, 0.28].map((fraction) => fraction * h);
    const widths = heights.map((y) =>
      widestRun(coverageRuns(mesh, hair, y, 0.05 * h, 0.32 * h))
    );
    for (const width of widths) expect(width).toBeGreaterThan(0);
    for (let index = 1; index < widths.length; index += 1) {
      expect(
        widths[index],
        `band ${index} of ${widths.map((w) => (w / h).toFixed(3)).join(",")}`
      ).toBeLessThan(widths[index - 1]);
    }
    // A tail that ends as wide as it started is a rope.
    expect(widths[widths.length - 1]).toBeLessThan(widths[0] * 0.6);
  });
});

describe("npc-hanabi-yukata bun", () => {
  const HAIR = "#6a283a";
  const BEAD = "#e8bd5c";
  const mesh = readMesh("npc-hanabi-yukata.glb");
  const h = mesh.height;

  it("draws a line where the coil leaves the head", () => {
    // One ball of hair colour sunk into one dome of the same hair colour has no
    // edge in it at any angle, which is the whole of why the bun read as a lump
    // rather than as hair someone put up. The crease and the second turn of the
    // coil are both shades of the hair, so the bun carries three tones where it
    // used to carry one.
    for (const [name, factor] of [
      ["crease", 0.55],
      ["coil", 0.72]
    ] as const) {
      const indices = vertexIndicesOfColor(mesh, shade(HAIR, factor));
      expect(indices.length, name).toBeGreaterThan(20);
      const vertical = extentOf(mesh, indices, 1);
      const lateral = extentOf(mesh, indices, 0);
      expect(vertical.min, name).toBeGreaterThan(0.75 * h);
      expect(lateral.max, name).toBeGreaterThan(0.05 * h);
    }
  });

  it("stands the coil proud of the skull instead of sinking it into the dome", () => {
    const skull = skullBlock(mesh);
    const coil = new Set([
      ...vertexIndicesOfColor(mesh, HAIR),
      ...vertexIndicesOfColor(mesh, shade(HAIR, 0.55)),
      ...vertexIndicesOfColor(mesh, shade(HAIR, 0.72))
    ]);
    const y = 0.9 * h;
    const runs = coverageRuns(mesh, coil, y, -0.32 * h, 0.32 * h);
    expect(runs.length).toBeGreaterThan(0);
    const outer = Math.max(...runs.map(([, end]) => end));
    // The skull at nine tenths of the figure's height is already well past its
    // widest, so a bun that does not reach past it is inside the head.
    expect(outer).toBeGreaterThan(skull.halfWidth * 0.72);
  });

  it("carries the ornament on the part of the coil that is in the open", () => {
    const bead = vertexIndicesOfColor(mesh, BEAD);
    expect(bead.length).toBeGreaterThan(20);
    const lateral = extentOf(mesh, bead, 0);
    const vertical = extentOf(mesh, bead, 1);
    expect(vertical.min).toBeGreaterThan(0.82 * h);
    expect(lateral.min).toBeGreaterThan(0.15 * h);
  });
});

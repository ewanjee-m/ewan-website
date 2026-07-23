import {
  BufferAttribute,
  DataTexture,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  SkinnedMesh,
  SRGBColorSpace,
  BackSide,
  type BufferGeometry,
  type Material,
  type Texture
} from "three";

export type RpgCharacterToonRampId = "player" | "npc";

// Three hard bands instead of a smooth falloff. The lit step stays at 255 so
// the key light keeps its full strength, the mid step carries the form, and the
// shadow step is dark enough that the boundary between the two reads as a drawn
// line rather than a gradient.
const TOON_RAMP_STEPS: Readonly<Record<RpgCharacterToonRampId, Uint8Array>> = {
  player: new Uint8Array([120, 200, 255]),
  npc: new Uint8Array([116, 196, 255])
};

// The face atlas is the only textured surface, and the darkest band above turns
// skin muddy there. The textured ramp keeps the same three steps but lifts the
// shadow step so the painted face stays readable.
const TOON_TEXTURED_RAMP_STEPS: Readonly<
  Record<RpgCharacterToonRampId, Uint8Array>
> = {
  player: new Uint8Array([150, 210, 255]),
  npc: new Uint8Array([148, 208, 255])
};

// Local model units. Every character is exported near 2.5 units tall and drawn
// at roughly that height, so the root scale is ~1.0 and these read as world
// units too: about one to two screen pixels at normal camera distance.
const OUTLINE_THICKNESS: Readonly<Record<RpgCharacterToonRampId, number>> = {
  player: 0.012,
  npc: 0.01
};

// Desaturated purple rather than pure black, which is the usual animation
// convention and keeps the line from punching a hole in the night palette.
const OUTLINE_COLOR = "#1a1230";

// The hull is pushed this far away from the lens after it is projected, as a
// share of its own clip depth. Expanding a face along its normals lifts the
// creases around a nose, a mouth or a hairline in front of the skin they
// belong to, and the back faces then printed as dark scratches across every
// face. Losing the depth test to the surface behind it removes them, while the
// silhouette is untouched: out there the hull has nothing in front of it.
const OUTLINE_DEPTH_BIAS = 0.0025;

function createToonRamp(steps: Uint8Array) {
  const ramp = new DataTexture(steps, steps.length, 1, RedFormat);
  ramp.magFilter = NearestFilter;
  ramp.minFilter = NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

const TOON_RAMPS: Readonly<Record<RpgCharacterToonRampId, DataTexture>> = {
  player: createToonRamp(TOON_RAMP_STEPS.player),
  npc: createToonRamp(TOON_RAMP_STEPS.npc)
};

const TOON_TEXTURED_RAMPS: Readonly<
  Record<RpgCharacterToonRampId, DataTexture>
> = {
  player: createToonRamp(TOON_TEXTURED_RAMP_STEPS.player),
  npc: createToonRamp(TOON_TEXTURED_RAMP_STEPS.npc)
};

const MATERIAL_NAMES: Readonly<Record<RpgCharacterToonRampId, string>> = {
  player: "EwanBandedToon",
  npc: "EwanNpcBandedToon"
};

const OUTLINE_MATERIAL_NAMES: Readonly<Record<RpgCharacterToonRampId, string>> =
  {
    player: "EwanToonOutline",
    npc: "EwanNpcToonOutline"
  };

// The town is lit bright enough to stay readable at night: a hemisphere light
// at 1.9 and ambient at 0.84 against a single sun. That flat fill lands on the
// character whole, while only the sun's share passes through the gradient
// ramp, so the steps the ramp draws were washed out and the bodies came back
// looking airbrushed. Characters keep their own share of the fill; the town
// keeps all of it, so nothing else in the scene changes.
const CHARACTER_INDIRECT_LIGHT_SHARE = 0.42;

function bandCharacterLighting(material: MeshToonMaterial, cacheKey: string) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uIndirectShare = {
      value: CHARACTER_INDIRECT_LIGHT_SHARE
    };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uIndirectShare;"
      )
      .replace(
        "#include <lights_fragment_begin>",
        "#include <lights_fragment_begin>\n\tirradiance *= uIndirectShare;"
      );
  };
  material.customProgramCacheKey = () =>
    `rpg-character-banded:${cacheKey}:${CHARACTER_INDIRECT_LIGHT_SHARE}`;
  return material;
}

const texturedMaterials = new WeakMap<Texture, MeshToonMaterial>();
const untexturedMaterials = new Map<
  RpgCharacterToonRampId,
  MeshToonMaterial
>();
const outlineMaterials = new Map<RpgCharacterToonRampId, MeshBasicMaterial>();

function readBaseColorTexture(source: Material | Material[]) {
  const material = Array.isArray(source) ? source[0] : source;
  const map = (material as { map?: Texture | null } | undefined)?.map;
  return map ?? null;
}

export function resolveRpgCharacterToonMaterial(
  source: Material | Material[],
  rampId: RpgCharacterToonRampId
) {
  const map = readBaseColorTexture(source);
  if (!map) {
    const existing = untexturedMaterials.get(rampId);
    if (existing) return existing;
    const material = new MeshToonMaterial({
      color: "#ffffff",
      vertexColors: true,
      gradientMap: TOON_RAMPS[rampId]
    });
    material.name = MATERIAL_NAMES[rampId];
    bandCharacterLighting(material, `${rampId}:flat`);
    untexturedMaterials.set(rampId, material);
    return material;
  }

  const cached = texturedMaterials.get(map);
  if (cached) return cached;

  map.colorSpace = SRGBColorSpace;
  map.anisotropy = Math.max(map.anisotropy, 4);
  map.needsUpdate = true;
  const material = new MeshToonMaterial({
    color: "#ffffff",
    vertexColors: true,
    map,
    gradientMap: TOON_TEXTURED_RAMPS[rampId]
  });
  material.name = MATERIAL_NAMES[rampId];
  bandCharacterLighting(material, `${rampId}:textured`);
  texturedMaterials.set(map, material);
  return material;
}

const OUTLINE_NORMAL_ATTRIBUTE = "aOutlineNormal";
// Positions are matched at 0.1 mm, far below the smallest feature on a 2.5 unit
// character but coarse enough to survive the float error an exporter leaves on
// duplicated seam vertices.
const OUTLINE_WELD_PRECISION = 1e4;

// The exported meshes carry split normals along the hard edges of the hair and
// the garment folds. Pushing each copy of a seam vertex along its own normal
// pulls them apart and the back-face hull shows through the body as dark
// cracks, so the hull is expanded along a normal averaged across every vertex
// that shares a position. The result is stored once per geometry, which every
// skeleton clone shares.
function ensureOutlineNormals(geometry: BufferGeometry) {
  if (geometry.getAttribute(OUTLINE_NORMAL_ATTRIBUTE)) return true;
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  if (!position || !normal || position.count !== normal.count) return false;

  const count = position.count;
  const smoothed = new Float32Array(count * 3);
  const welded = new Map<string, number[]>();

  for (let index = 0; index < count; index += 1) {
    const key = `${Math.round(position.getX(index) * OUTLINE_WELD_PRECISION)}|${Math.round(
      position.getY(index) * OUTLINE_WELD_PRECISION
    )}|${Math.round(position.getZ(index) * OUTLINE_WELD_PRECISION)}`;
    const bucket = welded.get(key);
    if (bucket) bucket.push(index);
    else welded.set(key, [index]);
  }

  for (const bucket of welded.values()) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const index of bucket) {
      x += normal.getX(index);
      y += normal.getY(index);
      z += normal.getZ(index);
    }
    const length = Math.hypot(x, y, z);
    if (length > 1e-6) {
      x /= length;
      y /= length;
      z /= length;
    }
    for (const index of bucket) {
      // A bucket whose normals cancel out has no meaningful direction to push
      // along, so that vertex keeps its own normal instead of collapsing.
      const useOwn = length <= 1e-6;
      smoothed[index * 3] = useOwn ? normal.getX(index) : x;
      smoothed[index * 3 + 1] = useOwn ? normal.getY(index) : y;
      smoothed[index * 3 + 2] = useOwn ? normal.getZ(index) : z;
    }
  }

  geometry.setAttribute(
    OUTLINE_NORMAL_ATTRIBUTE,
    new BufferAttribute(smoothed, 3)
  );
  return true;
}

// Inverted hull outline. The expansion is written into `transformed` right
// after `begin_vertex`, which is before `skinning_vertex` runs, so the bone
// matrices are applied to the already expanded position and the line follows
// the animated limbs. The averaged attribute is used rather than three's
// `objectNormal`: for a skinned mesh `skinnormal_vertex` has already rewritten
// `objectNormal` with the skin matrix by this point, and offsetting along that
// value would let `skinning_vertex` skin the offset a second time, which tears
// the hull open around the joints.
export function resolveRpgCharacterOutlineMaterial(
  rampId: RpgCharacterToonRampId
) {
  const existing = outlineMaterials.get(rampId);
  if (existing) return existing;

  const thickness = OUTLINE_THICKNESS[rampId];
  const material = new MeshBasicMaterial({
    color: OUTLINE_COLOR,
    side: BackSide
  });
  material.name = OUTLINE_MATERIAL_NAMES[rampId];
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineThickness = { value: thickness };
    shader.uniforms.uOutlineDepthBias = { value: OUTLINE_DEPTH_BIAS };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nuniform float uOutlineThickness;\nuniform float uOutlineDepthBias;\nattribute vec3 ${OUTLINE_NORMAL_ATTRIBUTE};`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\n\ttransformed += normalize( ${OUTLINE_NORMAL_ATTRIBUTE} ) * uOutlineThickness;`
      )
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\n\tgl_Position.z += uOutlineDepthBias * gl_Position.w;"
      );
  };
  // Without this the patched program would share a cache entry with an
  // unpatched MeshBasicMaterial that happens to compile with the same defines.
  material.customProgramCacheKey = () =>
    `rpg-character-outline:${rampId}:${thickness}:${OUTLINE_DEPTH_BIAS}`;
  outlineMaterials.set(rampId, material);
  return material;
}

// Adds one back-face hull per skinned mesh. The hull is a sibling of its source
// mesh with the same local transform, so it inherits the same world matrix, and
// it shares the source geometry and skeleton, so it costs one extra draw call
// and no extra geometry memory.
export function attachRpgCharacterOutline(
  meshes: readonly SkinnedMesh[],
  rampId: RpgCharacterToonRampId
) {
  const material = resolveRpgCharacterOutlineMaterial(rampId);
  const outlines: SkinnedMesh[] = [];

  for (const mesh of meshes) {
    const parent = mesh.parent;
    if (!parent || !mesh.skeleton) continue;
    if (!ensureOutlineNormals(mesh.geometry)) continue;

    const outline = new SkinnedMesh(mesh.geometry, material);
    outline.name = `${mesh.name || "character"}Outline`;
    outline.position.copy(mesh.position);
    outline.quaternion.copy(mesh.quaternion);
    outline.scale.copy(mesh.scale);
    outline.bindMode = mesh.bindMode;
    outline.bind(mesh.skeleton, mesh.bindMatrix);
    outline.castShadow = false;
    outline.receiveShadow = false;
    outline.frustumCulled = false;
    // Drawn before the character so the opaque pass fills the silhouette first.
    outline.renderOrder = mesh.renderOrder - 1;
    parent.add(outline);
    outlines.push(outline);
  }

  return outlines;
}

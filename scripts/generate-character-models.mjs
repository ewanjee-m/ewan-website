import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  Bone,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Scene,
  Shape,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  TorusGeometry,
  Uint16BufferAttribute,
  Uint32BufferAttribute
} from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  BODY_UV,
  FACE_IMAGE_BOUNDS,
  bodyCellUv,
  createCharacterAtlas,
  projectHeadBandU
} from "./lib/character-atlas.mjs";
import { attachBaseColorTexture, removeTextures } from "./lib/glb-texture.mjs";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { applyAutoSkinWeights } from "./lib/auto-skin.mjs";

const OUTPUT_DIRECTORY = resolve(
  process.cwd(),
  "public/assets/models/characters"
);
const MAX_TRIANGLES = 25_000;
const MAX_FILE_BYTES = 2_000_000;
const DETAIL_PROFILES = {
  player: {
    surfaceSegments: 20,
    capsuleSegments: 14,
    capSegments: 6,
    taperedSegments: 20,
    torusSegments: 18,
    curveSegments: 4
  },
  npc: {
    surfaceSegments: 11,
    capsuleSegments: 9,
    capSegments: 4,
    taperedSegments: 14,
    torusSegments: 12,
    curveSegments: 3
  }
};
let activeDetailProfile = DETAIL_PROFILES.player;

const REQUIRED_BONES = [
  "root",
  "hips",
  "chest",
  "head",
  "leftEye",
  "rightEye",
  "jaw",
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
  "hem"
];

const FACE_STYLES = {
  feminine: {
    eyeX: 0.335,
    eyeY: 0.105,
    eyeRadiusX: 0.176,
    eyeRadiusY: 0.15,
    irisRadiusX: 0.116,
    irisRadiusY: 0.132,
    irisDrop: 0.014,
    lashStart: 0.28,
    browY: 0.345,
    browCurve: 0.3,
    browThickness: 0.017,
    browSpan: 0.2,
    noseY: -0.105,
    noseRadius: 0.03,
    mouthY: -0.315,
    mouthCurve: 0.115,
    mouthThickness: 0.017,
    mouthWidth: 0.1,
    blushX: 0.4,
    blushY: -0.11,
    blushRadiusX: 0.14,
    blushRadiusY: 0.078,
    blushStrength: 0.5
  },
  masculine: {
    eyeX: 0.34,
    eyeY: 0.095,
    eyeRadiusX: 0.168,
    eyeRadiusY: 0.118,
    irisRadiusX: 0.104,
    irisRadiusY: 0.108,
    irisDrop: 0.008,
    lashStart: 0.34,
    browY: 0.315,
    browCurve: 0.46,
    browThickness: 0.023,
    browSpan: 0.22,
    noseY: -0.1,
    noseRadius: 0.03,
    mouthY: -0.305,
    mouthCurve: 0.1,
    mouthThickness: 0.016,
    mouthWidth: 0.09,
    blushX: 0.42,
    blushY: -0.12,
    blushRadiusX: 0.125,
    blushRadiusY: 0.062,
    blushStrength: 0.22
  }
};

function shadeHex(value, factor) {
  return `#${new Color(value)
    .multiplyScalar(factor)
    .getHexString()}`;
}

const FACE_CROP_DIRECTORY = resolve(process.cwd(), "assets/face-crops");
let faceCropManifest = null;

function loadCropManifest() {
  if (!faceCropManifest) {
    faceCropManifest = JSON.parse(
      readFileSync(resolve(FACE_CROP_DIRECTORY, "manifest.json"), "utf8")
    );
  }
  return faceCropManifest;
}

function loadCrop(entry) {
  if (!entry) return null;
  return {
    size: entry.size,
    data: new Uint8Array(readFileSync(resolve(FACE_CROP_DIRECTORY, entry.file)))
  };
}

function loadFaceImage(identity) {
  return loadCrop(loadCropManifest()[identity]);
}

// The body sheets are the whole figure rather than a square crop, so they carry
// their own width and height.
function loadSheet(entry) {
  if (!entry) return null;
  return {
    width: entry.width,
    height: entry.height,
    data: new Uint8Array(readFileSync(resolve(FACE_CROP_DIRECTORY, entry.file)))
  };
}

function loadBodySheets(identity) {
  const entry = loadCropManifest()[identity];
  return {
    front: loadSheet(entry?.body),
    back: loadSheet(entry?.bodyBack)
  };
}

// Only the players have an approved back view. Everyone else keeps the sculpted
// colour behind the ears.
function loadBackImage(identity) {
  return loadCrop(loadCropManifest()[identity]?.back);
}

function hasBackImage(identity) {
  return Boolean(loadCropManifest()[identity]?.back);
}

function createFaceDesign(model) {
  const sheets = loadBodySheets(model.identity);
  return {
    ...FACE_STYLES[model.faceStyle],
    image: loadFaceImage(model.identity),
    backImage: loadBackImage(model.identity),
    body: sheets.front,
    bodyBack: sheets.back,
    skin: model.palette.skin,
    skinShade: shadeHex(model.palette.skin, 0.8),
    sclera: "#fffaf3",
    lash: shadeHex(model.palette.hair, 0.62),
    brow: shadeHex(model.palette.hair, 0.86),
    iris: model.palette.eye,
    irisDeep: shadeHex(model.palette.eye, 0.55),
    blush: "#ef8f8b",
    lip: "#c0575f"
  };
}

const CHARACTER_MODELS = [
  {
    fileName: "player-male.glb",
    identity: "player-male",
    bodyMesh: "assets/sculpt/player-male.glb",
    head: { centerY: 0.918, radius: 0.072, centerZ: 0.008, reach: 1.5 },
    height: 2.58,
    garment: "happi",
    hair: "short",
    faceStyle: "masculine",
    palette: {
      skin: "#f3bfa0",
      hair: "#242635",
      upper: "#18385e",
      upperLight: "#29517c",
      lower: "#252b35",
      accent: "#c94d38",
      inner: "#f6edda",
      shoes: "#f7f1e4",
      eye: "#6e351b"
    }
  },
  {
    fileName: "player-female.glb",
    identity: "player-female",
    bodyMesh: "assets/sculpt/player-female.glb",
    head: { centerY: 0.905, radius: 0.075, centerZ: 0.005, reach: 1.5 },
    height: 2.62,
    garment: "kimono",
    hair: "long-flower",
    faceStyle: "feminine",
    palette: {
      skin: "#f3bfa0",
      hair: "#242635",
      upper: "#e97898",
      upperLight: "#f5a5ba",
      lower: "#e97898",
      accent: "#92264e",
      inner: "#f8eedc",
      shoes: "#f6edda",
      eye: "#7b3d17"
    }
  },
  {
    fileName: "npc-airport-traveler.glb",
    identity: "npc-airport-traveler",
    bodyMesh: "assets/sculpt/npc-airport-traveler.glb",
    head: { centerY: 0.915, radius: 0.072, centerZ: 0.008, reach: 1.5 },
    height: 2.525,
    garment: "jacket",
    hair: "short",
    faceStyle: "masculine",
    palette: {
      skin: "#f1ad86",
      hair: "#4b2c24",
      upper: "#d8a23e",
      upperLight: "#efc766",
      lower: "#18234b",
      accent: "#a53b32",
      inner: "#fff1d8",
      shoes: "#a53b32",
      eye: "#5b301e"
    }
  },
  {
    fileName: "npc-gyukatsu-chef.glb",
    identity: "npc-gyukatsu-chef",
    bodyMesh: "assets/sculpt/npc-gyukatsu-chef.glb",
    head: { centerY: 0.912, radius: 0.074, centerZ: 0.008, reach: 1.5 },
    height: 2.525,
    garment: "chef",
    hair: "chef-hat",
    faceStyle: "masculine",
    palette: {
      skin: "#e9a77e",
      hair: "#242126",
      upper: "#f4ece2",
      upperLight: "#fffaf3",
      lower: "#741d2e",
      accent: "#b83c36",
      inner: "#f4ece2",
      shoes: "#2b2729",
      eye: "#56301f"
    }
  },
  {
    fileName: "npc-sakura-visitor.glb",
    identity: "npc-sakura-visitor",
    bodyMesh: "assets/sculpt/npc-sakura-visitor.glb",
    head: { centerY: 0.91, radius: 0.073, centerZ: 0.006, reach: 1.5 },
    height: 2.525,
    garment: "visitor",
    hair: "ponytail",
    faceStyle: "feminine",
    palette: {
      skin: "#edaf87",
      hair: "#8f573d",
      upper: "#9dc8e8",
      upperLight: "#d6ebf8",
      lower: "#d7c3a6",
      accent: "#e57f91",
      inner: "#fff6e9",
      shoes: "#7f2d35",
      eye: "#6b3d27"
    }
  },
  {
    fileName: "npc-hanabi-yukata.glb",
    identity: "npc-hanabi-yukata",
    bodyMesh: "assets/sculpt/npc-hanabi-yukata.glb",
    head: { centerY: 0.908, radius: 0.074, centerZ: 0.006, reach: 1.5 },
    height: 2.525,
    garment: "yukata",
    hair: "bun-flower",
    faceStyle: "feminine",
    palette: {
      skin: "#f2b493",
      hair: "#6a283a",
      upper: "#55307d",
      upperLight: "#7b55a4",
      lower: "#472368",
      accent: "#d49a3f",
      inner: "#fff1df",
      shoes: "#8a2934",
      eye: "#69301f"
    }
  }
];

class NodeFileReader {
  result = null;
  onloadend = null;
  onerror = null;

  readAsArrayBuffer(blob) {
    blob
      .arrayBuffer()
      .then((result) => {
        this.result = result;
        this.onloadend?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }
}

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = NodeFileReader;
}

function addBone(parent, name, position) {
  const bone = new Bone();
  bone.name = name;
  bone.position.set(...position);
  parent?.add(bone);
  return bone;
}

function createHumanoidRig(height) {
  const bones = {};
  bones.root = addBone(null, "root", [0, 0, 0]);
  bones.hips = addBone(bones.root, "hips", [0, height * 0.51, 0]);
  bones.chest = addBone(bones.hips, "chest", [0, height * 0.2, 0]);
  bones.head = addBone(bones.chest, "head", [0, height * 0.175, 0]);
  bones.leftEye = addBone(bones.head, "leftEye", [
    -height * 0.041,
    height * 0.012,
    height * 0.087
  ]);
  bones.rightEye = addBone(bones.head, "rightEye", [
    height * 0.041,
    height * 0.012,
    height * 0.087
  ]);
  bones.jaw = addBone(bones.head, "jaw", [
    0,
    -height * 0.045,
    height * 0.093
  ]);
  bones.hair = addBone(bones.head, "hair", [0, 0, -height * 0.025]);

  for (const side of [-1, 1]) {
    const sideName = side < 0 ? "left" : "right";
    const upperArmName = `${sideName}UpperArm`;
    const lowerArmName = `${sideName}LowerArm`;
    const sleeveName = `${sideName}Sleeve`;
    const upperLegName = `${sideName}UpperLeg`;
    const lowerLegName = `${sideName}LowerLeg`;
    const footName = `${sideName}Foot`;

    bones[upperArmName] = addBone(bones.chest, upperArmName, [
      side * height * 0.125,
      height * 0.035,
      0
    ]);
    bones[lowerArmName] = addBone(bones[upperArmName], lowerArmName, [
      0,
      -height * 0.18,
      0
    ]);
    bones[sleeveName] = addBone(bones[upperArmName], sleeveName, [0, 0, 0]);
    bones[upperLegName] = addBone(bones.hips, upperLegName, [
      side * height * 0.061,
      -height * 0.01,
      0
    ]);
    bones[lowerLegName] = addBone(bones[upperLegName], lowerLegName, [
      0,
      -height * 0.215,
      0
    ]);
    bones[footName] = addBone(bones[lowerLegName], footName, [
      0,
      -height * 0.22,
      height * 0.028
    ]);
  }

  bones.hem = addBone(bones.hips, "hem", [0, 0, 0]);
  const orderedBones = REQUIRED_BONES.map((name) => bones[name]);
  const boneIndices = new Map(
    orderedBones.map((bone, index) => [bone.name, index])
  );
  return { root: bones.root, bones: orderedBones, boneIndices };
}

function ensureIndexed(geometry) {
  if (geometry.index) return geometry;
  const indices = Array.from(
    { length: geometry.getAttribute("position").count },
    (_, index) => index
  );
  geometry.setIndex(new Uint32BufferAttribute(indices, 1));
  return geometry;
}

function decorateGeometry(geometry, colorValue, influences, boneIndices) {
  ensureIndexed(geometry);
  const vertexCount = geometry.getAttribute("position").count;
  const color = new Color(colorValue);
  const colors = new Float32Array(vertexCount * 3);
  const skinIndices = new Uint16Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);
  const normalizedInfluences = influences.slice(0, 4);
  const totalWeight = normalizedInfluences.reduce(
    (sum, [, weight]) => sum + weight,
    0
  );

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    colors[vertex * 3] = color.r;
    colors[vertex * 3 + 1] = color.g;
    colors[vertex * 3 + 2] = color.b;
    normalizedInfluences.forEach(([boneName, weight], influenceIndex) => {
      const boneIndex = boneIndices.get(boneName);
      if (boneIndex === undefined) {
        throw new Error(`Unknown bone ${boneName}`);
      }
      skinIndices[vertex * 4 + influenceIndex] = boneIndex;
      skinWeights[vertex * 4 + influenceIndex] = weight / totalWeight;
    });
  }

  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute(
    "skinIndex",
    new Uint16BufferAttribute(skinIndices, 4)
  );
  geometry.setAttribute(
    "skinWeight",
    new Float32BufferAttribute(skinWeights, 4)
  );
  return geometry;
}

function transformGeometry(
  geometry,
  { center, rotation = [0, 0, 0], scale = [1, 1, 1] }
) {
  geometry.scale(...scale);
  geometry.rotateX(rotation[0]);
  geometry.rotateY(rotation[1]);
  geometry.rotateZ(rotation[2]);
  geometry.translate(...center);
  return geometry;
}

function applyAtlasUv(geometry, mode) {
  const uv = geometry.getAttribute("uv");
  if (!uv) {
    throw new Error("Geometry part has no uv attribute");
  }
  for (let index = 0; index < uv.count; index += 1) {
    if (mode === "head") {
      uv.setXY(
        index,
        projectHeadBandU(uv.getX(index)),
        (1 - uv.getY(index)) * 0.5
      );
    } else {
      uv.setXY(index, BODY_UV.u, BODY_UV.v);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

function addGeometry(parts, geometry, options, boneIndices) {
  transformGeometry(geometry, options);
  applyAtlasUv(geometry, options.uv);
  decorateGeometry(
    geometry,
    options.color,
    options.influences,
    boneIndices
  );
  parts.push(geometry);
}

function clampSurfaceSegments(requested) {
  return Math.max(8, Math.min(requested, activeDetailProfile.surfaceSegments));
}

function addEllipsoid(parts, options, boneIndices, segments = 20) {
  const widthSegments = clampSurfaceSegments(segments);
  addGeometry(
    parts,
    new SphereGeometry(0.5, widthSegments, Math.max(7, widthSegments - 6)),
    options,
    boneIndices
  );
}

function addCapsule(parts, options, boneIndices, segments = 16) {
  const radialSegments = Math.max(
    8,
    Math.min(segments, activeDetailProfile.capsuleSegments)
  );
  addGeometry(
    parts,
    new CapsuleGeometry(
      0.5,
      1,
      activeDetailProfile.capSegments,
      radialSegments
    ),
    {
      ...options,
      scale: [options.scale[0], options.scale[1] / 2, options.scale[2]]
    },
    boneIndices
  );
}

function addTapered(parts, options, boneIndices) {
  const geometry = new CylinderGeometry(
    options.topWidth / 2,
    options.bottomWidth / 2,
    options.height,
    activeDetailProfile.taperedSegments,
    4,
    false
  );
  geometry.scale(1, 1, options.depth / options.bottomWidth);
  addGeometry(
    parts,
    geometry,
    {
      center: options.center,
      rotation: options.rotation,
      color: options.color,
      influences: options.influences
    },
    boneIndices
  );
}

function addTorus(parts, options, boneIndices) {
  addGeometry(
    parts,
    new TorusGeometry(
      options.radius,
      options.tube,
      6,
      Math.min(
        options.segments ?? activeDetailProfile.torusSegments,
        activeDetailProfile.torusSegments
      ),
      options.arc ?? Math.PI * 2
    ),
    {
      center: options.center,
      rotation: options.rotation,
      scale: options.scale ?? [1, 1, 1],
      color: options.color,
      influences: options.influences
    },
    boneIndices
  );
}

function addRoundedPanel(parts, options, boneIndices) {
  addGeometry(
    parts,
    new RoundedBoxGeometry(
      options.size[0],
      options.size[1],
      options.size[2],
      activeDetailProfile === DETAIL_PROFILES.player ? 3 : 2,
      Math.min(...options.size) * 0.28
    ),
    {
      center: options.center,
      rotation: options.rotation,
      color: options.color,
      influences: options.influences
    },
    boneIndices
  );
}

function createHeadGeometry() {
  const segments = activeDetailProfile.surfaceSegments;
  const geometry = new SphereGeometry(
    0.5,
    segments,
    Math.max(9, segments - 5)
  );
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index) * 2;
    const jawTaper = y < -0.12 ? 0.72 + (y + 1) * 0.32 : 1;
    const cheek = Math.exp(-Math.pow((y + 0.18) * 2.7, 2)) * 0.045;
    const crownTaper = y > 0.62 ? 1 - (y - 0.62) * 0.12 : 1;
    positions.setX(
      index,
      positions.getX(index) * (jawTaper + cheek) * crownTaper
    );
    if (y < -0.35) {
      positions.setZ(index, positions.getZ(index) * 0.92);
    }
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createAlmondGeometry(width, height, depth) {
  const shape = new Shape();
  shape.moveTo(-width / 2, 0);
  shape.quadraticCurveTo(-width * 0.2, height * 0.56, 0, height / 2);
  shape.quadraticCurveTo(width * 0.2, height * 0.56, width / 2, 0);
  shape.quadraticCurveTo(width * 0.2, -height * 0.5, 0, -height / 2);
  shape.quadraticCurveTo(-width * 0.2, -height * 0.5, -width / 2, 0);
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: activeDetailProfile.curveSegments,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: depth * 0.18,
    bevelThickness: depth * 0.16
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function addAlmond(parts, options, boneIndices) {
  addGeometry(
    parts,
    createAlmondGeometry(options.width, options.height, options.depth),
    {
      center: options.center,
      rotation: options.rotation,
      color: options.color,
      influences: options.influences
    },
    boneIndices
  );
}

function createFanGeometry(radius, depth) {
  const shape = new Shape();
  shape.moveTo(0, 0);
  const start = Math.PI * 0.18;
  const arc = Math.PI * 0.64;
  for (let step = 0; step <= 10; step += 1) {
    const angle = start + (arc * step) / 10;
    shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: depth * 0.12,
    bevelThickness: depth * 0.12
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function addFace(parts, model, boneIndices) {
  const { height: h } = model;
  const headY = h * 0.89;
  addGeometry(
    parts,
    createHeadGeometry(),
    {
      center: [0, headY, h * 0.004],
      scale: [h * 0.195, h * 0.205, h * 0.18],
      color: "#ffffff",
      uv: "head",
      influences: [["head", 1]]
    },
    boneIndices
  );

  for (const side of [-1, 1]) {
    addEllipsoid(
      parts,
      {
        center: [side * h * 0.094, headY - h * 0.01, -h * 0.008],
        rotation: [0, 0, side * 0.12],
        scale: [h * 0.02, h * 0.042, h * 0.03],
        color: model.palette.skin,
        influences: [["head", 1]]
      },
      boneIndices,
      12
    );
  }
}

function addHair(parts, model, boneIndices) {
  const { height: h, palette, hair } = model;
  const headY = h * 0.89;
  const longHair = hair === "long-flower";
  const shortHair = hair === "short" || hair === "chef-hat";
  addEllipsoid(
    parts,
    {
      center: [0, headY + h * 0.043, -h * 0.045],
      scale: [h * 0.205, h * 0.16, h * 0.175],
      color: palette.hair,
      influences: [["hair", 1]]
    },
    boneIndices,
    20
  );
  addEllipsoid(
    parts,
    {
      center: [
        0,
        headY + h * (shortHair ? 0.01 : -0.035),
        -h * 0.073
      ],
      scale: [
        h * 0.17,
        h * (shortHair ? 0.12 : 0.18),
        h * 0.145
      ],
      color: palette.hair,
      influences: [["hair", 1]]
    },
    boneIndices,
    18
  );

  for (const side of [-1, 1]) {
    addEllipsoid(
      parts,
      {
        center: [
          side * h * 0.088,
          h * (longHair ? 0.805 : shortHair ? 0.89 : 0.852),
          h * 0.025
        ],
        rotation: [0, 0, side * 0.055],
        scale: [
          h * 0.048,
          h * (longHair ? 0.27 : shortHair ? 0.09 : 0.155),
          h * 0.046
        ],
        color: palette.hair,
        influences: [["hair", 1]]
      },
      boneIndices,
      14
    );
  }

  if (longHair) {
    const locks = [
      [-0.104, 0.716, -0.05, -0.05, 0.4],
      [-0.052, 0.709, -0.074, -0.022, 0.422],
      [0, 0.705, -0.085, 0, 0.432],
      [0.052, 0.709, -0.074, 0.022, 0.422],
      [0.104, 0.716, -0.05, 0.05, 0.4]
    ];
    for (const [x, y, z, tilt, length] of locks) {
      addEllipsoid(
        parts,
        {
          center: [h * x, h * y, h * z],
          rotation: [0, 0, tilt],
          scale: [h * 0.09, h * length, h * 0.08],
          color: palette.hair,
          influences: [["hair", 1]]
        },
        boneIndices,
        14
      );
    }
  }

  if (hair === "ponytail") {
    const ponytailLocks = [
      [0.105, 0.835, -0.078, -0.12, 0.16],
      [0.135, 0.735, -0.083, -0.22, 0.19],
      [0.145, 0.63, -0.078, -0.28, 0.16]
    ];
    for (const [x, y, z, tilt, length] of ponytailLocks) {
      addEllipsoid(
        parts,
        {
          center: [h * x, h * y, h * z],
          rotation: [0, 0, tilt],
          scale: [h * 0.072, h * length, h * 0.068],
          color: palette.hair,
          influences: [["hair", 1]]
        },
        boneIndices,
        14
      );
    }
  }

  if (hair === "bun-flower") {
    addEllipsoid(
      parts,
      {
        center: [h * 0.072, h * 0.995, -h * 0.035],
        scale: [h * 0.105, h * 0.105, h * 0.095],
        color: palette.hair,
        influences: [["hair", 1]]
      },
      boneIndices,
      16
    );
  }
}

function addFlower(
  parts,
  model,
  boneIndices,
  center,
  influence = "hair",
  size = 1
) {
  const { height: h } = model;
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2;
    addEllipsoid(
      parts,
      {
        center: [
          center[0] + Math.cos(angle) * h * 0.022 * size,
          center[1] + Math.sin(angle) * h * 0.022 * size,
          center[2]
        ],
        rotation: [0, 0, angle],
        scale: [h * 0.028 * size, h * 0.052 * size, h * 0.016 * size],
        color: index % 2 === 0 ? "#ff8d96" : "#ffb36f",
        influences: [[influence, 1]]
      },
      boneIndices,
      12
    );
  }
  addEllipsoid(
    parts,
    {
      center: [center[0], center[1], center[2] + h * 0.01],
      scale: [h * 0.022 * size, h * 0.022 * size, h * 0.02 * size],
      color: "#ffd85a",
      influences: [[influence, 1]]
    },
    boneIndices,
    12
  );
}

function addLimbs(parts, model, boneIndices) {
  const { height: h, palette, garment } = model;
  const kimonoLike = garment === "kimono" || garment === "yukata";
  const croppedPants = garment === "happi";
  const shortSleeves = garment === "happi" || garment === "chef";
  for (const side of [-1, 1]) {
    const sideName = side < 0 ? "left" : "right";
    addCapsule(
      parts,
      {
        center: [side * h * 0.061, h * 0.41, 0],
        scale: [h * 0.07, h * 0.27, h * 0.076],
        color: kimonoLike ? palette.inner : palette.lower,
        influences: [[`${sideName}UpperLeg`, 1]]
      },
      boneIndices,
      14
    );
    addCapsule(
      parts,
      {
        center: [side * h * 0.061, h * 0.185, 0],
        scale: [h * 0.056, h * 0.25, h * 0.062],
        color: kimonoLike || croppedPants ? palette.skin : palette.lower,
        influences: [[`${sideName}LowerLeg`, 1]]
      },
      boneIndices,
      13
    );
    if (croppedPants) {
      addCapsule(
        parts,
        {
          center: [side * h * 0.061, h * 0.295, 0],
          scale: [h * 0.069, h * 0.135, h * 0.075],
          color: palette.lower,
          influences: [[`${sideName}LowerLeg`, 1]]
        },
        boneIndices,
        12
      );
    }
    addEllipsoid(
      parts,
      {
        center: [side * h * 0.061, h * 0.032, h * 0.037],
        scale: [h * 0.076, h * 0.065, h * 0.14],
        color: palette.shoes,
        influences: [[`${sideName}Foot`, 1]]
      },
      boneIndices,
      14
    );
    if (kimonoLike) {
      addCapsule(
        parts,
        {
          center: [side * h * 0.061, h * 0.054, h * 0.085],
          rotation: [Math.PI / 2, side * 0.38, 0],
          scale: [h * 0.014, h * 0.095, h * 0.014],
          color: palette.accent,
          influences: [[`${sideName}Foot`, 1]]
        },
        boneIndices,
        8
      );
    } else {
      addRoundedPanel(
        parts,
        {
          center: [side * h * 0.061, h * 0.04, h * 0.1],
          size: [h * 0.058, h * 0.018, h * 0.045],
          color: palette.accent,
          influences: [[`${sideName}Foot`, 1]]
        },
        boneIndices
      );
    }

    if (kimonoLike) {
      addCapsule(
        parts,
        {
          center: [side * h * 0.125, h * 0.612, 0],
          rotation: [0, 0, side * 0.075],
          scale: [h * 0.098, h * 0.35, h * 0.09],
          color: palette.upperLight,
          influences: [[`${sideName}Sleeve`, 1]]
        },
        boneIndices,
        13
      );
      addCapsule(
        parts,
        {
          center: [side * h * 0.131, h * 0.425, h * 0.006],
          scale: [h * 0.044, h * 0.22, h * 0.049],
          color: palette.skin,
          influences: [[`${sideName}LowerArm`, 1]]
        },
        boneIndices,
        11
      );
    } else {
      if (shortSleeves) {
        addCapsule(
          parts,
          {
            center: [side * h * 0.112, h * 0.69, 0],
            rotation: [0, 0, side * 0.06],
            scale: [h * 0.072, h * 0.17, h * 0.072],
            color: palette.upper,
            influences: [[`${sideName}UpperArm`, 1]]
          },
          boneIndices,
          12
        );
      } else {
        addCapsule(
          parts,
          {
            center: [side * h * 0.117, h * 0.66, 0],
            rotation: [0, 0, side * 0.06],
            scale: [h * 0.06, h * 0.21, h * 0.065],
            color: palette.upper,
            influences: [[`${sideName}UpperArm`, 1]]
          },
          boneIndices,
          12
        );
      }
      addCapsule(
        parts,
        {
          center: [side * h * 0.131, h * 0.48, 0],
          rotation: [0, 0, side * 0.025],
          scale: [h * 0.05, h * 0.27, h * 0.055],
          color: palette.skin,
          influences: [[`${sideName}LowerArm`, 1]]
        },
        boneIndices,
        11
      );
    }

    addEllipsoid(
      parts,
      {
        center: [side * h * 0.1315, h * 0.548, 0],
        scale: [h * 0.055, h * 0.058, h * 0.058],
        color: palette.skin,
        influences: [
          [`${sideName}UpperArm`, 0.5],
          [`${sideName}LowerArm`, 0.5]
        ]
      },
      boneIndices,
      11
    );
    addEllipsoid(
      parts,
      {
        center: [side * h * 0.132, h * 0.352, h * 0.012],
        scale: [h * 0.058, h * 0.098, h * 0.052],
        color: palette.skin,
        influences: [[`${sideName}LowerArm`, 1]]
      },
      boneIndices,
      11
    );
  }
}

function addTorsoAndNeck(parts, model, boneIndices) {
  const { height: h, palette } = model;
  addEllipsoid(
    parts,
    {
      center: [0, h * 0.51, 0],
      scale: [h * 0.165, h * 0.145, h * 0.135],
      color: palette.lower,
      influences: [["hips", 1]]
    },
    boneIndices,
    16
  );
  addEllipsoid(
    parts,
    {
      center: [0, h * 0.648, 0],
      scale: [h * 0.183, h * 0.27, h * 0.14],
      color: palette.upper,
      influences: [
        ["chest", 0.82],
        ["hips", 0.18]
      ]
    },
    boneIndices,
    18
  );
  addCapsule(
    parts,
    {
      center: [0, h * 0.772, 0],
      scale: [h * 0.062, h * 0.105, h * 0.06],
      color: palette.skin,
      influences: [["chest", 1]]
    },
    boneIndices,
    14
  );
  addShoulders(parts, model, boneIndices);
}

function addShoulders(parts, model, boneIndices) {
  const { height: h, palette, garment } = model;
  const sleeveColor =
    garment === "kimono" || garment === "yukata"
      ? palette.upperLight
      : palette.upper;
  for (const side of [-1, 1]) {
    addEllipsoid(
      parts,
      {
        center: [side * h * 0.086, h * 0.734, 0],
        rotation: [0, 0, side * 0.4],
        scale: [h * 0.072, h * 0.076, h * 0.105],
        color: sleeveColor,
        influences: [
          ["chest", 0.65],
          [`${side < 0 ? "left" : "right"}UpperArm`, 0.35]
        ]
      },
      boneIndices,
      14
    );
  }
}

function addKimono(parts, model, boneIndices) {
  const { height: h, palette, garment } = model;
  addTapered(
    parts,
    {
      center: [0, h * 0.31, 0],
      topWidth: h * 0.17,
      bottomWidth: h * 0.22,
      height: h * 0.56,
      depth: h * 0.15,
      color: palette.lower,
      influences: [["hem", 1]]
    },
    boneIndices
  );
  addEllipsoid(
    parts,
    {
      center: [0, h * 0.642, 0],
      scale: [h * 0.186, h * 0.278, h * 0.146],
      color: palette.upper,
      influences: [
        ["chest", 0.85],
        ["hips", 0.15]
      ]
    },
    boneIndices,
    18
  );
  for (const side of [-1, 1]) {
    addCapsule(
      parts,
      {
        center: [side * h * 0.039, h * 0.705, h * 0.083],
        rotation: [0, 0, side * 0.43],
        scale: [h * 0.014, h * 0.13, h * 0.014],
        color: palette.inner,
        influences: [["chest", 1]]
      },
      boneIndices,
      12
    );
  }
  addTapered(
    parts,
    {
      center: [0, h * 0.555, h * 0.018],
      topWidth: h * 0.195,
      bottomWidth: h * 0.195,
      height: h * 0.115,
      depth: h * 0.17,
      color: palette.accent,
      influences: [["hips", 1]]
    },
    boneIndices
  );
  for (const side of [-1, 1]) {
    addEllipsoid(
      parts,
      {
        center: [side * h * 0.058, h * 0.569, h * 0.083],
        rotation: [0, side * 0.26, side * 0.22],
        scale: [h * 0.092, h * 0.044, h * 0.03],
        color: palette.accent,
        influences: [["hips", 1]]
      },
      boneIndices,
      14
    );
  }
  addRoundedPanel(
    parts,
    {
      center: [0, h * 0.567, h * 0.095],
      size: [h * 0.036, h * 0.05, h * 0.032],
      color: palette.accent,
      influences: [["hips", 1]]
    },
    boneIndices
  );
  addFlower(
    parts,
    model,
    boneIndices,
    [0, h * 0.567, h * 0.104],
    "hips",
    0.34
  );

  if (garment === "kimono" || garment === "yukata") {
    const motifs =
      garment === "kimono"
        ? [[0.065, 0.26], [0.035, 0.19], [-0.052, 0.38]]
        : [[0.06, 0.3], [-0.055, 0.2]];
    for (const [x, y] of motifs) {
      addFlower(
        parts,
        model,
        boneIndices,
        [h * x, h * y, kimonoSurfaceZ(h, x, y)],
        "hem",
        garment === "kimono" ? 0.52 : 0.46
      );
    }
  }
}

function kimonoSurfaceZ(h, x, y) {
  const bottomY = 0.03;
  const topY = 0.59;
  const progress = Math.min(1, Math.max(0, (y - bottomY) / (topY - bottomY)));
  const radiusX = 0.11 + (0.085 - 0.11) * progress;
  const radiusZ = radiusX * (0.15 / 0.22);
  const lateral = Math.min(0.97, Math.abs(x) / radiusX);
  return h * radiusZ * Math.sqrt(1 - lateral * lateral) * 0.94;
}

function addHappiDetails(parts, model, boneIndices) {
  const { height: h, palette } = model;
  addTapered(
    parts,
    {
      center: [0, h * 0.668, h * 0.076],
      topWidth: h * 0.082,
      bottomWidth: h * 0.058,
      height: h * 0.168,
      depth: h * 0.048,
      color: palette.inner,
      influences: [["chest", 1]]
    },
    boneIndices
  );
  for (const side of [-1, 1]) {
    addCapsule(
      parts,
      {
        center: [side * h * 0.044, h * 0.694, h * 0.079],
        rotation: [0, 0, side * 0.4],
        scale: [h * 0.018, h * 0.17, h * 0.016],
        color: palette.upperLight,
        influences: [["chest", 1]]
      },
      boneIndices,
      12
    );
  }
  addTapered(
    parts,
    {
      center: [0, h * 0.516, h * 0.01],
      topWidth: h * 0.158,
      bottomWidth: h * 0.162,
      height: h * 0.072,
      depth: h * 0.132,
      color: palette.accent,
      influences: [["hips", 1]]
    },
    boneIndices
  );
  addFlower(
    parts,
    model,
    boneIndices,
    [-h * 0.075, h * 0.668, h * 0.073],
    "chest",
    0.38
  );
}

function addOmamori(parts, model, boneIndices) {
  const { height: h } = model;
  const center = [h * 0.095, h * 0.475, h * 0.1];
  addTorus(
    parts,
    {
      center: [center[0], center[1] + h * 0.052, center[2]],
      radius: h * 0.018,
      tube: h * 0.0055,
      color: "#e5a832",
      influences: [["hips", 1]]
    },
    boneIndices
  );
  addEllipsoid(
    parts,
    {
      center,
      scale: [h * 0.05, h * 0.075, h * 0.026],
      color: "#9b4a2d",
      influences: [["hips", 1]]
    },
    boneIndices,
    16
  );
  addEllipsoid(
    parts,
    {
      center: [center[0], center[1], center[2] + h * 0.016],
      scale: [h * 0.026, h * 0.04, h * 0.009],
      color: "#f1bd42",
      influences: [["hips", 1]]
    },
    boneIndices,
    14
  );
}

function addNpcDetails(parts, model, boneIndices) {
  const { height: h, garment, palette } = model;
  if (garment === "jacket") {
    addEllipsoid(
      parts,
      {
        center: [0, h * 0.69, h * 0.083],
        scale: [h * 0.055, h * 0.17, h * 0.02],
        color: palette.inner,
        influences: [["chest", 1]]
      },
      boneIndices,
      12
    );
    addCapsule(
      parts,
      {
        center: [-h * 0.045, h * 0.665, h * 0.09],
        rotation: [0, 0, -0.48],
        scale: [h * 0.012, h * 0.34, h * 0.012],
        color: "#6d352d",
        influences: [["chest", 1]]
      },
      boneIndices,
      8
    );
    addRoundedPanel(
      parts,
      {
        center: [-h * 0.19, h * 0.43, -h * 0.01],
        rotation: [0, 0, -0.04],
        size: [h * 0.13, h * 0.22, h * 0.09],
        color: palette.accent,
        influences: [["leftLowerArm", 1]]
      },
      boneIndices
    );
    addTorus(
      parts,
      {
        center: [-h * 0.19, h * 0.55, -h * 0.005],
        radius: h * 0.047,
        tube: h * 0.008,
        scale: [1, 0.72, 1],
        color: "#6d352d",
        influences: [["leftLowerArm", 1]]
      },
      boneIndices
    );
  } else if (garment === "chef") {
    addTapered(
      parts,
      {
        center: [0, h * 0.54, h * 0.062],
        topWidth: h * 0.15,
        bottomWidth: h * 0.175,
        height: h * 0.33,
        depth: h * 0.025,
        color: palette.lower,
        influences: [["hips", 0.8], ["chest", 0.2]]
      },
      boneIndices
    );
    addTapered(
      parts,
      {
        center: [0, h * 0.958, 0],
        topWidth: h * 0.184,
        bottomWidth: h * 0.184,
        height: h * 0.03,
        depth: h * 0.17,
        color: palette.accent,
        influences: [["head", 1]]
      },
      boneIndices
    );
    addRoundedPanel(
      parts,
      {
        center: [0, h * 0.66, h * 0.078],
        size: [h * 0.17, h * 0.028, h * 0.024],
        color: palette.accent,
        influences: [["chest", 1]]
      },
      boneIndices
    );
    for (const y of [0.66, 0.715]) {
      for (const x of [-0.035, 0.035]) {
        addEllipsoid(
          parts,
          {
            center: [h * x, h * y, h * 0.082],
            scale: [h * 0.012, h * 0.012, h * 0.009],
            color: "#342b30",
            influences: [["chest", 1]]
          },
          boneIndices,
          10
        );
      }
    }
  } else if (garment === "visitor") {
    addTapered(
      parts,
      {
        center: [0, h * 0.43, 0],
        topWidth: h * 0.16,
        bottomWidth: h * 0.2,
        height: h * 0.23,
        depth: h * 0.14,
        color: palette.lower,
        influences: [["hips", 1]]
      },
      boneIndices
    );
    addRoundedPanel(
      parts,
      {
        center: [0, h * 0.66, h * 0.081],
        size: [h * 0.085, h * 0.25, h * 0.02],
        color: palette.inner,
        influences: [["chest", 1]]
      },
      boneIndices
    );
    for (const side of [-1, 1]) {
      addCapsule(
        parts,
        {
          center: [side * h * 0.068, h * 0.65, h * 0.072],
          rotation: [0, 0, side * 0.035],
          scale: [h * 0.065, h * 0.29, h * 0.03],
          color: palette.upperLight,
          influences: [["chest", 1]]
        },
        boneIndices,
        10
      );
    }
    addTorus(
      parts,
      {
        center: [0, h * 0.632, h * 0.104],
        radius: h * 0.024,
        tube: h * 0.007,
        color: "#5b4638",
        influences: [["chest", 1]]
      },
      boneIndices
    );
    addEllipsoid(
      parts,
      {
        center: [0, h * 0.632, h * 0.094],
        scale: [h * 0.062, h * 0.044, h * 0.03],
        color: "#725342",
        influences: [["chest", 1]]
      },
      boneIndices,
      14
    );
  } else if (garment === "yukata") {
    addGeometry(
      parts,
      createFanGeometry(h * 0.105, h * 0.012),
      {
        center: [h * 0.155, h * 0.39, h * 0.075],
        rotation: [0, 0, -0.18],
        color: palette.accent,
        influences: [["rightLowerArm", 1]]
      },
      boneIndices
    );
    addCapsule(
      parts,
      {
        center: [h * 0.155, h * 0.385, h * 0.083],
        rotation: [0, 0, -0.18],
        scale: [h * 0.008, h * 0.09, h * 0.008],
        color: "#7a462d",
        influences: [["rightLowerArm", 1]]
      },
      boneIndices,
      8
    );
  }
}

const PROCEDURAL_HEAD_SCALE = 0.78;
const SCULPTED_HEAD_SCALE = 1.0;
const NECK_CUT_RATIO = 0.788;
// Vertical span of the face crop in unit-sphere coordinates, matching
// FACE_IMAGE_TOP..FACE_IMAGE_BOTTOM in the atlas painter.
const FACE_IMAGE_SPAN = 1.88;
const HEAD_RADIUS_RELIEF = 1.0;
const HEAD_REACH = 1.25;


// The face crop manifest records where the face sits inside the source
// illustration, so the head sphere is derived from the artwork rather than
// hand-tuned per character.
// Mirrors the sampling window in the atlas painter: only geometry the crop
// actually covers is switched over to the face texture.
function coveredByFaceCrop(fx, fy) {
  const { left, right, top, bottom, fade } = FACE_IMAGE_BOUNDS;
  const u = (fx - left) / (right - left);
  const v = (top - fy) / (top - bottom);
  return u > fade && u < 1 - fade && v > fade && v < 1 - fade;
}

// The body is painted by projecting the approved illustration straight onto it,
// front picture from the front and back picture from behind, each squared up to
// the model's own bounding box. The pictures and the sculpt come from the same
// artwork, so lining up their boxes lines up the figure: the top of the sheet is
// the crown, its bottom is the feet, and its sides are the widest reach of the
// arms.
function createBodyProjection(sheets, bounds) {
  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  const clamp = (value) => Math.min(1, Math.max(0, value));

  return {
    hasBack: Boolean(sheets.back),
    at(x, y, side) {
      const sheet = side === "back" ? sheets.back : sheets.front;
      const across = clamp(width > 1e-6 ? (x - bounds.min.x) / width : 0.5);
      const down = clamp(height > 1e-6 ? (bounds.max.y - y) / height : 0.5);
      // Seen from behind the figure turns left for right.
      return bodyCellUv(sheet, side, side === "back" ? 1 - across : across, down);
    }
  };
}

// A vertex carries one atlas coordinate, so a triangle can only read one
// picture. Which picture is decided per triangle from where it faces, and every
// corner is then given a copy of itself holding that picture's coordinate.
// Copies are made before skinning, so their weights are computed like any other
// vertex's.
//
// Three seams are resolved this way.
//
// The first is down the sides of the figure, where front-facing triangles meet
// back-facing ones. Without private copies a triangle there would read a
// coordinate on the front sheet at one corner and the back sheet at the next,
// dragging the whole width of the atlas across it. With them the changeover
// lands on a triangle edge along the silhouette, where both pictures show the
// same outline.
//
// The second is where the face crop stops. A triangle with one corner on the
// picture and the next on bare sculpt interpolates between the head band and the
// body sheet. Those triangles are handed to the body, which puts the edge of the
// crop on a triangle edge where it belongs.
//
// The third is the back of the head. The head band runs a full turn across the
// atlas, so directly behind the figure lands on both edges at once: one corner
// reads U just under 1 while the next reads just over 0, and the triangle walks
// the long way back across the atlas. The low corners are copied one atlas width
// along, which the repeating sampler resolves to the same pixels.
const SEAM_LOW = 0.25;
const SEAM_HIGH = 0.75;

// Which way a triangle faces cannot be read off its own normal. A decimated
// isosurface is full of small facets that tip backwards inside a fold of the
// kimono or under the chin, and each one that reads the back picture instead of
// the front paints a dark crack across an otherwise correct surface. The
// depth of the normal is therefore averaged with its neighbours' a few times
// over, which leaves the front and back of the figure as far apart as they were
// and flattens the single facets that disagree with everything around them.
const FACING_SMOOTHING_ROUNDS = 12;

function smoothFacing(normals, indices, vertexCount) {
  let facing = new Float32Array(vertexCount);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    facing[vertex] = normals[vertex * 3 + 2];
  }
  const total = new Float32Array(vertexCount);
  const count = new Float32Array(vertexCount);

  for (let round = 0; round < FACING_SMOOTHING_ROUNDS; round += 1) {
    total.fill(0);
    count.fill(0);
    for (let corner = 0; corner < indices.length; corner += 3) {
      const first = indices[corner];
      const second = indices[corner + 1];
      const third = indices[corner + 2];
      total[first] += facing[second] + facing[third];
      total[second] += facing[first] + facing[third];
      total[third] += facing[first] + facing[second];
      count[first] += 2;
      count[second] += 2;
      count[third] += 2;
    }
    const next = new Float32Array(vertexCount);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      next[vertex] = count[vertex]
        ? (facing[vertex] + total[vertex] / count[vertex]) / 2
        : facing[vertex];
    }
    facing = next;
  }
  return facing;
}

function resolveSurfaceSeams(
  attributes,
  textured,
  headRegion,
  sculptColors,
  indices,
  body
) {
  const positions = [...attributes.positions];
  const normals = [...attributes.normals];
  const colors = [...attributes.colors];
  const uv = [...attributes.uv];
  const sculpt = [...sculptColors];

  const copy = (vertex) => {
    const created = uv.length / 2;
    for (let axis = 0; axis < 3; axis += 1) {
      positions.push(positions[vertex * 3 + axis]);
      normals.push(normals[vertex * 3 + axis]);
      colors.push(colors[vertex * 3 + axis]);
      sculpt.push(sculpt[vertex * 3 + axis]);
    }
    uv.push(uv[vertex * 2], uv[vertex * 2 + 1]);
    return created;
  };

  // A side of null means the picture does not reach here: the characters
  // without an approved back view keep their sculpted colour behind.
  const paintBody = (vertex, side) => {
    if (side === null) {
      uv[vertex * 2] = BODY_UV.u;
      uv[vertex * 2 + 1] = BODY_UV.v;
      for (let channel = 0; channel < 3; channel += 1) {
        colors[vertex * 3 + channel] = sculpt[vertex * 3 + channel];
      }
      return;
    }
    const [u, v] = body.at(
      positions[vertex * 3],
      positions[vertex * 3 + 1],
      side
    );
    uv[vertex * 2] = u;
    uv[vertex * 2 + 1] = v;
    // The picture already carries the colour, so the vertex stops carrying it
    // too and the two do not multiply together into a muddy surface.
    colors[vertex * 3] = 1;
    colors[vertex * 3 + 1] = 1;
    colors[vertex * 3 + 2] = 1;
  };

  const eachTriangle = (resolve) => {
    for (let corner = 0; corner < indices.length; corner += 3) {
      resolve([indices[corner], indices[corner + 1], indices[corner + 2]], corner);
    }
  };

  const facing = smoothFacing(
    attributes.normals,
    indices,
    attributes.normals.length / 3
  );

  const sideOf = (triangle) => {
    // The head is painted from the head crops, which frame it far larger than
    // the body sheet ever could. Anything the crops do not reach keeps its
    // sculpted colour, exactly as before the body was textured; projecting the
    // sheet there instead would drag the picture's hair across the jaw.
    if (triangle.some((vertex) => headRegion[vertex])) return null;
    let depth = 0;
    for (const vertex of triangle) depth += facing[vertex];
    if (depth >= 0) return "front";
    return body.hasBack ? "back" : null;
  };

  const owned = new Map();
  const copies = new Map();
  const bodyCorner = (vertex, side) => {
    if (!textured[vertex]) {
      const owner = owned.get(vertex);
      if (owner === undefined) {
        owned.set(vertex, side);
        paintBody(vertex, side);
        return vertex;
      }
      if (owner === side) return vertex;
    }
    const key = `${vertex}:${side}`;
    let created = copies.get(key);
    if (created === undefined) {
      created = copy(vertex);
      paintBody(created, side);
      copies.set(key, created);
    }
    return created;
  };

  eachTriangle((triangle, corner) => {
    if (triangle.every((vertex) => textured[vertex])) return;
    const side = sideOf(triangle);
    for (let offset = 0; offset < 3; offset += 1) {
      indices[corner + offset] = bodyCorner(triangle[offset], side);
    }
  });

  const unwrapped = new Map();
  eachTriangle((triangle, corner) => {
    if (!triangle.every((vertex) => textured[vertex])) return;
    if (!triangle.some((vertex) => uv[vertex * 2] > SEAM_HIGH)) return;
    for (let offset = 0; offset < 3; offset += 1) {
      const vertex = triangle[offset];
      if (uv[vertex * 2] >= SEAM_LOW) continue;
      let created = unwrapped.get(vertex);
      if (created === undefined) {
        created = copy(vertex);
        uv[created * 2] += 1;
        unwrapped.set(vertex, created);
      }
      indices[corner + offset] = created;
    }
  });

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    uv: new Float32Array(uv)
  };
}

function measureHeadSphere(model, geometry) {
  const entry = (faceCropManifest ??= JSON.parse(
    readFileSync(resolve(FACE_CROP_DIRECTORY, "manifest.json"), "utf8")
  ))[model.identity];
  if (!entry) throw new Error(`No face crop for ${model.identity}`);

  const [, boxTop, , boxBottom] = entry.sourceBox;
  const topFraction = (boxTop - entry.figureTop) / entry.figureHeight;
  const bottomFraction = (boxBottom - entry.figureTop) / entry.figureHeight;
  const faceTopY = model.height * (1 - topFraction);
  const faceBottomY = model.height * (1 - bottomFraction);
  const centerY = (faceTopY + faceBottomY) / 2;
  // The crop is framed well below the chin so the picture keeps some shoulder
  // around the head. Seen from the front that margin points away from the
  // camera and never lands on the model, but from behind it would wrap the back
  // crop over the shirt, so the jaw the crop recorded is where it stops.
  const jawY =
    model.height * (1 - (entry.skinBox[3] - entry.figureTop) / entry.figureHeight);
  const radius =
    (faceTopY - faceBottomY) / (FACE_IMAGE_BOUNDS.span * HEAD_RADIUS_RELIEF);

  const positions = geometry.getAttribute("position");
  let frontZ = -Infinity;
  let backZ = Infinity;
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    const y = positions.getY(vertex);
    if (Math.abs(y - centerY) > radius * 0.5) continue;
    const z = positions.getZ(vertex);
    if (z > frontZ) frontZ = z;
    if (z < backZ) backZ = z;
  }
  const centerZ =
    Number.isFinite(frontZ) && Number.isFinite(backZ)
      ? (frontZ + backZ) / 2
      : 0;

  return { centerY, centerZ, radius, jawY, reach: HEAD_REACH };
}


// The generated figure leans forward, because the source illustration is drawn
// with a slight forward tilt. Comparing the body's depth at hip and chest height
// gives that lean, and rotating it out leaves the character standing upright.
function straightenPosture(geometry, height) {
  const positions = geometry.getAttribute("position");
  // Long hair sits well behind the body and would drag an averaged depth
  // backwards, so the front surface of the torso is measured instead.
  const sample = (centreY) => {
    const band = height * 0.05;
    const core = height * 0.06;
    let front = -Infinity;
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      if (Math.abs(positions.getY(vertex) - centreY) > band) continue;
      if (Math.abs(positions.getX(vertex)) > core) continue;
      front = Math.max(front, positions.getZ(vertex));
    }
    return Number.isFinite(front) ? front : null;
  };

  const hipY = height * 0.5;
  const chestY = height * 0.72;
  const hipZ = sample(hipY);
  const chestZ = sample(chestY);
  if (hipZ === null || chestZ === null) return 0;

  const lean = Math.atan2(chestZ - hipZ, chestY - hipY);
  process.stdout.write(
    `  posture lean ${(lean * 180 / Math.PI).toFixed(1)} degrees\n`
  );
  if (Math.abs(lean) < 0.01) return 0;

  geometry.translate(0, -hipY, -hipZ);
  geometry.rotateX(-lean);
  geometry.translate(0, hipY, hipZ);
  geometry.computeVertexNormals();
  return lean;
}

async function loadSculptedBody(path, model, boneIndices) {
  const file = removeTextures(await readFile(resolve(process.cwd(), path)));
  const gltf = await new GLTFLoader().parseAsync(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    ""
  );

  const sources = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    sources.push(geometry);
  });
  if (sources.length === 0) throw new Error(`No mesh in ${path}`);
  const source = sources.length === 1 ? sources[0] : mergeGeometries(sources, false);

  source.rotateY(-Math.PI / 2);
  source.computeBoundingBox();
  const rawBounds = source.boundingBox;
  const scale = model.height / (rawBounds.max.y - rawBounds.min.y);
  source.scale(scale, scale, scale);
  source.computeBoundingBox();
  const bounds = source.boundingBox;
  source.translate(
    -(bounds.min.x + bounds.max.x) / 2,
    -bounds.min.y,
    -(bounds.min.z + bounds.max.z) / 2
  );

  straightenPosture(source, model.height);
  // Which of the two pictures a triangle reads is decided from where it faces,
  // so the surface needs normals whether or not the sculpt shipped with them.
  if (!source.getAttribute("normal")) source.computeVertexNormals();
  // Straightening rotates the figure, so the box the pictures are matched to is
  // measured after it rather than before.
  source.computeBoundingBox();
  const projection = createBodyProjection(
    loadBodySheets(model.identity),
    source.boundingBox
  );

  const positions = source.getAttribute("position");
  const normals = source.getAttribute("normal");
  const colors = source.getAttribute("color");
  const index = source.getIndex();
  const vertexCount = positions.count;
  const nextPositions = new Float32Array(vertexCount * 3);
  const nextNormals = new Float32Array(vertexCount * 3);
  const nextColors = new Float32Array(vertexCount * 3);
  const nextUv = new Float32Array(vertexCount * 2);
  // Kept alongside, because a vertex on the picture has its colour bleached to
  // white and the triangles handed back to the body need the sculpted one.
  const sculptColors = new Float32Array(vertexCount * 3);
  const textured = new Uint8Array(vertexCount);
  const headRegion = new Uint8Array(vertexCount);

  const head = measureHeadSphere(model, source);
  const backImage = hasBackImage(model.identity);
  const centerY = head.centerY;
  const centerZ = head.centerZ;
  const radius = head.radius;

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const px = positions.getX(vertex);
    const py = positions.getY(vertex);
    const pz = positions.getZ(vertex);
    nextPositions[vertex * 3] = px;
    nextPositions[vertex * 3 + 1] = py;
    nextPositions[vertex * 3 + 2] = pz;
    if (normals) {
      nextNormals[vertex * 3] = normals.getX(vertex);
      nextNormals[vertex * 3 + 1] = normals.getY(vertex);
      nextNormals[vertex * 3 + 2] = normals.getZ(vertex);
    }

    const dx = px;
    const dy = py - centerY;
    const dz = pz - centerZ;
    const distance = Math.hypot(dx, dy, dz);
    const onHead = distance < radius * head.reach && distance > 1e-6;
    headRegion[vertex] = onHead ? 1 : 0;
    const upward = onHead
      ? (dy / distance) * FACE_IMAGE_BOUNDS.aspect
      : 0;
    // Around the ears the atlas paints the crop at reduced strength over white,
    // so a vertex sent there would read washed out. The picture is only taken up
    // where it is painted whole.
    const facing = onHead ? dz / distance : 0;
    const onFace =
      facing > FACE_IMAGE_BOUNDS.facing &&
      coveredByFaceCrop(dx / distance, upward);
    // Seen from behind the figure turns left for right, so the back crop covers
    // the mirrored half. The atlas painter mirrors it the same way.
    const onBackHead =
      -facing > FACE_IMAGE_BOUNDS.facing &&
      backImage &&
      py > head.jawY &&
      coveredByFaceCrop(-dx / distance, upward);

    sculptColors[vertex * 3] = colors ? colors.getX(vertex) : 1;
    sculptColors[vertex * 3 + 1] = colors ? colors.getY(vertex) : 1;
    sculptColors[vertex * 3 + 2] = colors ? colors.getZ(vertex) : 1;

    if (onFace || onBackHead) {
      const sphereU = 0.25 + Math.atan2(dx, dz) / (Math.PI * 2);
      const polar = Math.acos(Math.min(1, Math.max(-1, dy / distance)));
      textured[vertex] = 1;
      nextUv[vertex * 2] = projectHeadBandU(sphereU);
      nextUv[vertex * 2 + 1] = polar / (Math.PI * 2);
      nextColors[vertex * 3] = 1;
      nextColors[vertex * 3 + 1] = 1;
      nextColors[vertex * 3 + 2] = 1;
    } else {
      nextUv[vertex * 2] = BODY_UV.u;
      nextUv[vertex * 2 + 1] = BODY_UV.v;
      nextColors[vertex * 3] = sculptColors[vertex * 3];
      nextColors[vertex * 3 + 1] = sculptColors[vertex * 3 + 1];
      nextColors[vertex * 3 + 2] = sculptColors[vertex * 3 + 2];
    }
  }

  const keptIndices = [];
  for (let position = 0; position < index.count; position += 1) {
    keptIndices.push(index.getX(position));
  }

  const unwrapped = resolveSurfaceSeams(
    { positions: nextPositions, normals: nextNormals, colors: nextColors, uv: nextUv },
    textured,
    headRegion,
    sculptColors,
    keptIndices,
    projection
  );

  const body = new BufferGeometry();
  body.setAttribute("position", new Float32BufferAttribute(unwrapped.positions, 3));
  body.setAttribute("normal", new Float32BufferAttribute(unwrapped.normals, 3));
  body.setAttribute("color", new Float32BufferAttribute(unwrapped.colors, 3));
  body.setAttribute("uv", new Float32BufferAttribute(unwrapped.uv, 2));
  body.setIndex(new Uint32BufferAttribute(keptIndices, 1));
  if (!normals) body.computeVertexNormals();
  applyAutoSkinWeights(body, model.height, boneIndices, {
    garment: model.garment
  });
  source.dispose();
  return body;
}

function scaleHeadGroup(headParts, model, sculptedBody) {
  const scale = sculptedBody ? SCULPTED_HEAD_SCALE : PROCEDURAL_HEAD_SCALE;
  if (scale === 1) return;
  const anchorY = model.height * NECK_CUT_RATIO;
  for (const part of headParts) {
    part.translate(0, -anchorY, 0);
    part.scale(scale, scale, scale);
    part.translate(0, anchorY, 0);
  }
}

function createCharacterGeometry(model, boneIndices, sculptedBody) {
  const playerModel = model.identity.startsWith("player-");
  activeDetailProfile = playerModel
    ? DETAIL_PROFILES.player
    : DETAIL_PROFILES.npc;
  const parts = [];

  if (sculptedBody) {
    parts.push(sculptedBody);
  } else {
    addLimbs(parts, model, boneIndices);
    addTorsoAndNeck(parts, model, boneIndices);

    if (model.garment === "kimono" || model.garment === "yukata") {
      addKimono(parts, model, boneIndices);
    } else if (model.garment === "happi") {
      addHappiDetails(parts, model, boneIndices);
    }
    if (!playerModel) {
      addNpcDetails(parts, model, boneIndices);
    }
  }

  const headParts = [];
  if (!sculptedBody) {
    addFace(headParts, model, boneIndices);
    addHair(headParts, model, boneIndices);
  }

  if (
    !sculptedBody &&
    (model.hair === "long-flower" || model.hair === "bun-flower")
  ) {
    addFlower(
      headParts,
      model,
      boneIndices,
      [model.height * 0.09, model.height * 0.955, model.height * 0.085],
      "hair",
      0.82
    );
  }
  scaleHeadGroup(headParts, model, sculptedBody);
  parts.push(...headParts);
  if (model.identity.startsWith("player-") && !sculptedBody) {
    addOmamori(parts, model, boneIndices);
  }

  const sourcePartCount = parts.length;
  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!geometry) throw new Error(`Could not merge ${model.identity}`);
  geometry.name = `${model.identity}-smooth-geometry`;
  geometry.userData.sourcePartCount = sourcePartCount;
  geometry.normalizeNormals();
  geometry.computeBoundingBox();
  const minimumY = geometry.boundingBox?.min.y ?? Number.NaN;
  if (!Number.isFinite(minimumY)) {
    throw new Error(`${model.identity} has invalid bounds`);
  }
  if (Math.abs(minimumY) > 1e-5) geometry.translate(0, -minimumY, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createCharacterScene(model, sculptedBody) {
  const rig = createHumanoidRig(model.height);
  const geometry = createCharacterGeometry(model, rig.boneIndices, sculptedBody);
  const triangleCount = geometry.index.count / 3;
  const triangleLimit = model.identity.startsWith("player-")
    ? MAX_TRIANGLES
    : 10_000;
  if (triangleCount > triangleLimit) {
    throw new Error(
      `${model.identity} has ${triangleCount} triangles; maximum is ${triangleLimit}`
    );
  }

  const material = new MeshStandardMaterial({
    name: "smooth-toon-vertex-colors",
    color: "#ffffff",
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
    flatShading: false
  });
  const character = new SkinnedMesh(geometry, material);
  character.name = "character";
  character.add(rig.root);
  character.updateMatrixWorld(true);
  character.bind(new Skeleton(rig.bones));
  character.normalizeSkinWeights();
  character.userData = {
    identity: model.identity,
    style: "smooth-anime-toon",
    forwardAxis: "+Z",
    feetAtY: 0,
    triangleCount,
    triangleLimit,
    headCount: Number((1 / 0.205).toFixed(2)),
    sourcePartCount: geometry.userData.sourcePartCount
  };

  const scene = new Scene();
  scene.name = `${model.identity}-scene`;
  scene.add(character);
  scene.updateMatrixWorld(true);
  return { scene, geometry, material, triangleCount };
}

async function exportCharacter(model) {
  const sculptedBody = model.bodyMesh
    ? await loadSculptedBody(model.bodyMesh, model, createHumanoidRig(model.height).boneIndices)
    : null;
  const { scene, geometry, material, triangleCount } =
    createCharacterScene(model, sculptedBody);
  const exporter = new GLTFExporter();
  const arrayBuffer = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: false,
    trs: true
  });
  const output = attachBaseColorTexture(
    Buffer.from(arrayBuffer),
    createCharacterAtlas(createFaceDesign(model))
  );
  if (output.byteLength >= MAX_FILE_BYTES) {
    throw new Error(
      `${model.fileName} is ${output.byteLength} bytes; maximum is ${MAX_FILE_BYTES}`
    );
  }
  await writeFile(resolve(OUTPUT_DIRECTORY, model.fileName), output);
  const bounds = geometry.boundingBox;
  const nativeHeight = bounds ? bounds.max.y - bounds.min.y : model.height;
  geometry.dispose();
  material.dispose();
  return { bytes: output.byteLength, triangleCount, nativeHeight };
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const nativeHeights = {};
for (const model of CHARACTER_MODELS) {
  const result = await exportCharacter(model);
  nativeHeights[model.identity] = Number(result.nativeHeight.toFixed(4));
  process.stdout.write(
    `${model.fileName}: ${result.triangleCount} triangles, ${result.bytes} bytes\n`
  );
}

const heightEntries = Object.keys(nativeHeights)
  .sort()
  .map((identity) => `  "${identity}": ${nativeHeights[identity]}`)
  .join(",\n");
await writeFile(
  resolve(process.cwd(), "app/world/RpgCharacterNativeHeights.ts"),
  `// Written by scripts/generate-character-models.mjs. Each value is the real
// height of the exported mesh, so the renderer can scale it to the height the
// design asks for. Do not edit by hand.
export const RPG_CHARACTER_NATIVE_HEIGHTS = {
${heightEntries}
} as const;

export type RpgCharacterIdentity = keyof typeof RPG_CHARACTER_NATIVE_HEIGHTS;
`
);
process.stdout.write("app/world/RpgCharacterNativeHeights.ts updated\n");

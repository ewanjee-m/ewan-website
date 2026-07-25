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
  HEAD_EXTENTS,
  createCharacterAtlas,
  projectHeadBandU
} from "./lib/character-atlas.mjs";
import { attachBaseColorTexture } from "./lib/glb-texture.mjs";

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

// THE FIGURE.
//
// Every height and thickness in this file is a fraction of total figure height,
// and the ones that decide the proportion are named here rather than spelled as
// loose literals at their use site. The old build wrote them out by hand and
// drifted to roughly 5.5 heads tall — realistic adult proportion, which at the
// 7 to 9.2 unit chase-camera distance puts the face, the only part that carries
// personality, into a handful of pixels while the segmented limbs are what the
// eye catches.
//
// This is chibi construction instead: 2.5 skull-heads and 2.2 silhouette-heads,
// the middle of the super-deformed band and on top of the measured CC0
// reference. Both counts are named because they drift apart silently — hair
// lengthens the silhouette without touching the skull — and both are asserted.
//
// Vertical budget, as fractions of height:
//   0.000 .. 0.240   feet and legs
//   0.240 .. 0.545   torso
//   0.545 .. 0.945   skull        (0.400 tall -> 2.50 skull-heads)
//   0.945 .. 1.000   hair         (0.455 chin to crown -> 2.20 silhouette-heads)
const FIGURE = Object.freeze({
  soleY: 0,
  ankleY: 0.055,
  kneeY: 0.15,
  hipJointY: 0.29,
  hipsBoneY: 0.3,
  crotchY: 0.24,
  chestBoneY: 0.43,
  shoulderY: 0.465,
  elbowY: 0.365,
  wristY: 0.265,
  torsoTopY: 0.545,
  chinY: 0.545,
  headCenterY: 0.745,
  crownY: 0.945,
  hairTopY: 1.0,
  // Full extents, not radii: addEllipsoid and addCapsule take the whole width.
  head: [HEAD_EXTENTS.x, HEAD_EXTENTS.y, HEAD_EXTENTS.z],
  torso: [0.25, 0.23, 0.19],
  // Limb segments are authored longer than the joint span they bridge, so that
  // neighbours overlap while both are still at full width. A capsule tapers to
  // nothing at its dome, so segments that merely touch end-to-end leave the
  // pinch that made the old limbs read as separate floating pieces.
  upperLeg: [0.115, 0.175, 0.12],
  lowerLeg: [0.1, 0.165, 0.105],
  foot: [0.115, 0.075, 0.17],
  upperArm: [0.095, 0.155, 0.095],
  lowerArm: [0.095, 0.15, 0.095],
  hand: [0.1, 0.1, 0.1],
  upperLegY: 0.2275,
  lowerLegY: 0.105,
  footY: 0.037,
  upperArmY: 0.4125,
  lowerArmY: 0.315,
  handY: 0.25,
  hipLateral: 0.058,
  // The arms hang just inside the head's own silhouette: the head half-width is
  // 0.195h and the arm reaches 0.1925h, so nothing out-reads the head, while
  // the inner edge still buries itself in the torso so there is no armpit gap.
  shoulderLateral: 0.135,
  armLateral: 0.145
});

// How many heads tall the figure reads, derived from the head it is actually
// built with so the exported metadata cannot go stale against the geometry.
const SKULL_HEAD_COUNT = 1 / FIGURE.head[1];
const SILHOUETTE_HEAD_COUNT = 1 / (FIGURE.hairTopY - FIGURE.chinY);

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

// THE FACE.
//
// Every number here is in FACE SPACE: offsets from the centre of the head in
// units of the head's own half-width. fx reaches +/-1 at the ears and fy
// reaches +/-1.026 at crown and chin, so the head is 2.05 units tall and a
// circle drawn here is a circle on the model.
//
// These numbers were written for a 5.5-heads-tall figure, where the head was a
// twentieth of the silhouette and almost any arrangement of dots read as a
// face. At 2.5 skull-heads the head is the character, and the chibi rules the
// proportions came from apply to what is painted on it as much as to the body:
//
//   - Every feature belongs in the LOWER HALF, but only just. The eye LINE sits
//     at 44-45% of the head's height measured up from the chin. It was at 39%,
//     which is chibi arithmetic taken past the point it describes anything: it
//     left three fifths of the skull above the brow, and a skull that is mostly
//     forehead reads as a bulging cranium with a face parked underneath rather
//     than as a head. 44% keeps the whole face under the midline and still
//     leaves a forehead the hair can sit a fringe on.
//   - The eyes are at least a QUARTER of head height. They were 15%. Below
//     about a fifth the face stops reading as super-deformed and starts
//     reading as a small adult.
//   - They are set WIDE, with a clear eye's width of skin between them — but
//     the eye is a TALL ALMOND, not a circle. The old eye was nearly round and
//     0.53 of a head half-width across, which put its outer rim 45 degrees
//     round the skull. At three-quarter view the head turns away at 50, so the
//     far eye was compressed twelve to one against its own outline and read as
//     a black gash rather than an eye. Height is free at any angle; width is
//     what costs.
//   - ONE specular highlight each, and a nose and mouth that are almost
//     nothing: at the chase camera the eyes are the only feature with enough
//     pixels to carry expression, and a drawn-out nose only muddies them.
//
// The two variants below are the shared skeleton of the face. Each character
// then shifts a handful of them (see `face` in CHARACTER_MODELS) so that six
// characters do not wear one face six times. Every override moves the eye's
// outer edge, so none of them may put it past 0.62 — the point where the ink
// starts running into the three-quarter outline again.
const FACE_STYLES = {
  feminine: {
    eyeX: 0.395,
    eyeY: -0.1,
    eyeRadiusX: 0.17,
    eyeRadiusY: 0.265,
    // The ink outline round the eye, as a WIDTH in face space rather than a
    // fraction of the radii, so a narrower eye keeps a line thick enough to
    // read: 0.038 is 1.7 px on a ninety-pixel head at any eye size.
    rimWidth: 0.038,
    // The iris is deliberately well inside the sclera, and narrower than it is
    // tall. Filled edge to edge it greys the whole eye into one dark smudge;
    // white left either side of it is the only part of the eye that survives
    // being foreshortened, and it is what makes a turned head still read as
    // having eyes rather than smudges.
    irisRadiusX: 0.102,
    irisRadiusY: 0.195,
    irisDrop: 0.032,
    lashStart: 0.38,
    browY: 0.33,
    browCurve: 0.46,
    browThickness: 0.024,
    // The brow, not the eye, is now the ink that reaches furthest round the
    // skull, so its span is cut to match: a brow no wider than the eye under it
    // is also what the reference art draws.
    browSpan: 0.175,
    // Positive lifts the outer end of the brow: open and friendly.
    browTilt: 0.14,
    noseY: -0.48,
    noseRadius: 0.03,
    mouthY: -0.66,
    mouthCurve: 0.12,
    mouthThickness: 0.028,
    mouthWidth: 0.105,
    blushX: 0.55,
    blushY: -0.38,
    blushRadiusX: 0.185,
    blushRadiusY: 0.1,
    blushStrength: 0.45
  },
  masculine: {
    eyeX: 0.4,
    eyeY: -0.11,
    eyeRadiusX: 0.165,
    eyeRadiusY: 0.245,
    rimWidth: 0.04,
    irisRadiusX: 0.1,
    irisRadiusY: 0.175,
    irisDrop: 0.026,
    lashStart: 0.46,
    browY: 0.32,
    browCurve: 0.56,
    browThickness: 0.03,
    browSpan: 0.18,
    browTilt: -0.04,
    noseY: -0.46,
    noseRadius: 0.028,
    mouthY: -0.64,
    mouthCurve: 0.11,
    mouthThickness: 0.026,
    mouthWidth: 0.095,
    blushX: 0.55,
    blushY: -0.36,
    blushRadiusX: 0.165,
    blushRadiusY: 0.09,
    blushStrength: 0.22
  }
};

function shadeHex(value, factor) {
  return `#${new Color(value)
    .multiplyScalar(factor)
    .getHexString()}`;
}

// The face is DRAWN, not photographed. It used to be a crop of the approved
// illustration projected onto the head sphere, and `createCharacterAtlas` took
// that branch for all six characters, so the parametric face below it never ran
// once. That was survivable while the head was small; at chibi proportion the
// crop was the loudest thing on the model and it was broken three ways — a dark
// blob of the illustration's own hair sat over the middle of the face, the
// projection tore into a hard vertical seam as it wrapped past the cheek, and
// the far half of the head was left blank skin.
//
// None of that is fixable by re-cropping, because it is inherent: an
// orthographic picture pinned to a sphere can only be right from one angle, and
// the character is seen from all of them.
function createFaceDesign(model) {
  return {
    ...FACE_STYLES[model.faceStyle],
    ...model.face,
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
    height: 2.58,
    garment: "happi",
    hair: "short",
    faceStyle: "masculine",
    // The player the camera is behind: the plainest, most open face of the six,
    // so it stays legible from every angle and does not compete with the NPCs
    // for attention. Everything is the masculine baseline.
    face: {},
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
    height: 2.62,
    garment: "kimono",
    hair: "long-flower",
    faceStyle: "feminine",
    // The other player: the feminine baseline unchanged, so the two players
    // read as one drawing style seen twice rather than as two art passes.
    face: {},
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
    height: 2.525,
    garment: "jacket",
    hair: "short",
    faceStyle: "masculine",
    // Wide-set, slightly narrowed eyes and brows lifted high at the outer end:
    // someone looking around a place they have just arrived in.
    face: {
      eyeX: 0.415,
      eyeRadiusX: 0.155,
      eyeRadiusY: 0.225,
      browY: 0.345,
      browSpan: 0.17,
      browTilt: 0.14,
      lashStart: 0.48,
      mouthWidth: 0.105
    },
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
    height: 2.525,
    garment: "chef",
    hair: "chef-hat",
    faceStyle: "masculine",
    // The narrowest eyes of the six under heavy brows dropped at the outer end,
    // over the broadest mouth: concentrating on the grill, and pleased about it.
    face: {
      eyeX: 0.385,
      eyeRadiusX: 0.15,
      eyeRadiusY: 0.235,
      browThickness: 0.036,
      browTilt: -0.16,
      lashStart: 0.5,
      mouthWidth: 0.115,
      mouthCurve: 0.13
    },
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
    height: 2.525,
    garment: "visitor",
    hair: "ponytail",
    faceStyle: "feminine",
    // The roundest, largest eyes of the six under high arched brows, over a
    // small mouth: delighted by the blossom she came to see.
    face: {
      eyeX: 0.4,
      eyeRadiusX: 0.175,
      eyeRadiusY: 0.285,
      browY: 0.35,
      browSpan: 0.17,
      browTilt: 0.18,
      lashStart: 0.44,
      mouthWidth: 0.09,
      mouthCurve: 0.1
    },
    palette: {
      skin: "#edaf87",
      hair: "#8f573d",
      upper: "#9dc8e8",
      upperLight: "#d6ebf8",
      lower: "#d7c3a6",
      // The skirt is its own colour rather than the beige of the rest of the
      // outfit: at a glance across the square she is the one in the rose skirt,
      // which is what makes an NPC recognisable at chase distance.
      skirt: "#c94f6d",
      accent: "#e57f91",
      // The band on the ponytail. Rose rather than the cardigan's accent so it
      // reads against brown hair at chase distance and belongs to the skirt.
      hairTie: "#d8546f",
      inner: "#fff6e9",
      shoes: "#7f2d35",
      eye: "#6b3d27"
    }
  },
  {
    fileName: "npc-hanabi-yukata.glb",
    identity: "npc-hanabi-yukata",
    height: 2.525,
    garment: "yukata",
    hair: "bun-flower",
    faceStyle: "feminine",
    // A heavy upper lid over a softer, closer-set eye and a wide gentle mouth:
    // calm, watching the fireworks rather than the street.
    face: {
      eyeX: 0.37,
      eyeRadiusY: 0.25,
      lashStart: 0.34,
      browTilt: 0.06,
      mouthWidth: 0.115
    },
    palette: {
      skin: "#f2b493",
      hair: "#6a283a",
      upper: "#55307d",
      upperLight: "#7b55a4",
      lower: "#472368",
      accent: "#d49a3f",
      // The wrap round the bun. A lighter gold than the obi so the two do not
      // merge into one colour when both are in frame.
      hairTie: "#e8bd5c",
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

// All 21 bone names are preserved and only their positions move, so every
// consumer of the rig — the adapter, the motion model, the NPC poses — keeps
// working. Positions are written as world heights first and converted to the
// parent-local offsets the Bone actually stores, because the proportion table
// is expressed in world fractions and a chain of hand-computed local deltas is
// exactly how the old numbers drifted.
function createHumanoidRig(height) {
  const bones = {};
  const at = (fraction) => height * fraction;
  bones.root = addBone(null, "root", [0, 0, 0]);
  bones.hips = addBone(bones.root, "hips", [0, at(FIGURE.hipsBoneY), 0]);
  bones.chest = addBone(bones.hips, "chest", [
    0,
    at(FIGURE.chestBoneY - FIGURE.hipsBoneY),
    0
  ]);
  // The head bone stays at the head mesh's centre, so the nod pivot behaves
  // exactly as it did. Moving it to the skull base would animate better but
  // changes the pivot, which is a separate decision from the reproportion.
  bones.head = addBone(bones.chest, "head", [
    0,
    at(FIGURE.headCenterY - FIGURE.chestBoneY),
    0
  ]);
  // Chibi construction puts every facial feature in the lower half of the head;
  // the upper half is forehead. The eyes therefore sit below the head centre
  // rather than above it, and far enough apart to leave a full eye's width
  // between them.
  for (const side of [-1, 1]) {
    const name = side < 0 ? "leftEye" : "rightEye";
    bones[name] = addBone(bones.head, name, [
      side * at(0.07),
      -at(0.04),
      at(0.177)
    ]);
  }
  bones.jaw = addBone(bones.head, "jaw", [0, -at(0.098), at(0.19)]);
  bones.hair = addBone(bones.head, "hair", [0, 0, -at(0.045)]);

  for (const side of [-1, 1]) {
    const sideName = side < 0 ? "left" : "right";
    const upperArmName = `${sideName}UpperArm`;
    const lowerArmName = `${sideName}LowerArm`;
    const sleeveName = `${sideName}Sleeve`;
    const upperLegName = `${sideName}UpperLeg`;
    const lowerLegName = `${sideName}LowerLeg`;
    const footName = `${sideName}Foot`;

    // Shoulders sit visibly narrower than the head: the measured reference puts
    // the joint at 0.092-0.097h against a skull half a head wide.
    bones[upperArmName] = addBone(bones.chest, upperArmName, [
      side * at(FIGURE.shoulderLateral),
      at(FIGURE.shoulderY - FIGURE.chestBoneY),
      0
    ]);
    bones[lowerArmName] = addBone(bones[upperArmName], lowerArmName, [
      0,
      -at(FIGURE.shoulderY - FIGURE.elbowY),
      0
    ]);
    bones[sleeveName] = addBone(bones[upperArmName], sleeveName, [0, 0, 0]);
    bones[upperLegName] = addBone(bones.hips, upperLegName, [
      side * at(FIGURE.hipLateral),
      -at(FIGURE.hipsBoneY - FIGURE.hipJointY),
      0
    ]);
    bones[lowerLegName] = addBone(bones[upperLegName], lowerLegName, [
      0,
      -at(FIGURE.hipJointY - FIGURE.kneeY),
      0
    ]);
    bones[footName] = addBone(bones[lowerLegName], footName, [
      0,
      -at(FIGURE.kneeY - FIGURE.ankleY),
      at(0.03)
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

// A skirt is a bell with a ROLLED hem, not a cylinder.
//
// A cylinder ends at its widest ring, so its hem is a right-angled corner all
// the way round and the garment reads as a rectangular box — which is exactly
// what the visitor's skirt was. Real cloth turns under at the edge, so the
// profile here flares out to its widest a little above the bottom and then
// curls back in and slightly up over the last stretch. The turn is what puts a
// highlight along the hem instead of a hard corner, and it is the difference
// between a skirt and a crate.
function addFlaredSkirt(parts, options, boneIndices) {
  const {
    topY,
    flareY,
    topRadius,
    maxRadius,
    rollTube,
    rollArc,
    depthRatio = 1,
    rows = 10,
    rollRows = 6,
    columns = 20,
    color,
    influences
  } = options;

  const rings = [];
  for (let row = 0; row <= rows; row += 1) {
    const down = row / rows;
    const eased = down * down * (3 - 2 * down);
    rings.push([
      topRadius + (maxRadius - topRadius) * eased,
      topY + (flareY - topY) * down
    ]);
  }
  // The hem itself: a quarter-turn of cloth rolling under, swept as an arc of a
  // torus whose tube is the thickness of the roll. It stops short of a half
  // turn so the underside never reaches back in as far as the legs.
  const rollCenterRadius = maxRadius - rollTube;
  for (let row = 1; row <= rollRows; row += 1) {
    const angle = (rollArc * row) / rollRows;
    rings.push([
      rollCenterRadius + rollTube * Math.cos(angle),
      flareY - rollTube * Math.sin(angle)
    ]);
  }

  const positions = [];
  const uvs = [];
  const indices = [];
  rings.forEach(([radius, y], ring) => {
    for (let column = 0; column <= columns; column += 1) {
      const phi = (column / columns) * Math.PI * 2;
      positions.push(
        Math.sin(phi) * radius,
        y,
        Math.cos(phi) * radius * depthRatio
      );
      uvs.push(column / columns, 1 - ring / (rings.length - 1));
    }
  });
  const stride = columns + 1;
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = ring * stride + column;
      const bottomLeft = topLeft + stride;
      indices.push(topLeft, bottomLeft, topLeft + 1);
      indices.push(topLeft + 1, bottomLeft, bottomLeft + 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  addGeometry(
    parts,
    geometry,
    { center: [0, 0, 0], color, influences },
    boneIndices
  );
}

// A garment that lies against the body cannot be a flat plank stood in front of
// it: from the side the plank floats and its edges cut the silhouette. The parts
// of the happi that lie ON the chest are therefore cut out of the chest's own
// surface — the same ellipsoid, lifted a hair clear of it, trimmed to the band
// of heights and the wedge of angles that piece of cloth covers. `topY` and
// `bottomY` run -1 to 1 over the ellipsoid; `halfAngle` is measured either side
// of straight ahead. `from` and `to` are the two side edges, each given at the
// top and at the bottom, so an edge can slant — which is how the innerwear gets
// its V neck.
function addSurfacePatch(parts, options, boneIndices) {
  const {
    center,
    scale,
    lift = 1.014,
    topY,
    bottomY,
    from,
    to,
    rows = 12,
    columns = 10,
    color,
    influences
  } = options;

  const positions = [];
  const uvs = [];
  const indices = [];
  for (let row = 0; row <= rows; row += 1) {
    const down = row / rows;
    const y = topY + (bottomY - topY) * down;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const left = from[0] + (from[1] - from[0]) * down;
    const right = to[0] + (to[1] - to[0]) * down;
    for (let column = 0; column <= columns; column += 1) {
      const across = column / columns;
      const phi = left + (right - left) * across;
      positions.push(
        0.5 * ring * Math.sin(phi),
        0.5 * y,
        0.5 * ring * Math.cos(phi)
      );
      uvs.push(across, 1 - down);
    }
  }
  const stride = columns + 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = row * stride + column;
      const bottomLeft = topLeft + stride;
      indices.push(topLeft, bottomLeft, topLeft + 1);
      indices.push(topLeft + 1, bottomLeft, bottomLeft + 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // Cloth is lifted off the body HORIZONTALLY, not radially.
  //
  // Scaling all three axes pushed the patch up as well as out, by 3% of its
  // height above the body's centre. Low on the chest that is invisible. Near
  // the top of the ellipsoid it is not: the surface is turning over towards its
  // pole there, so sliding the patch a little higher drops the body away from
  // underneath it far faster than the lift raises it, and the cloth is left
  // standing in clear air. That is exactly what the kimono collar did — it is
  // cut from the chest at topY 0.86, high on the shoulder, and it floated by
  // 0.7% of figure height with daylight behind it.
  //
  // Holding y fixed keeps every row of the patch at the height it was cut from,
  // so the only offset is the sideways one that makes it read as cloth on top
  // of a body rather than as the body itself.
  addGeometry(
    parts,
    geometry,
    {
      center,
      scale: [scale[0] * lift, scale[1], scale[2] * lift],
      color,
      influences
    },
    boneIndices
  );
}

/**
 * How much wider or narrower the skull is than its own ellipsoid, at a height
 * given as the sphere's own y in -1..1.
 *
 * The head is tapered at the jaw, bulged a little at the cheek and drawn in at
 * the crown, and none of that is small: the cheek alone carries it 4.5% wide of
 * the ellipsoid. Anything laid over the skull has to follow the same curve or
 * the two cross. The hair shell was built on the plain ellipsoid and the cheek
 * bulge pushed the bare skull straight back out through it — a jagged wedge of
 * scalp above the ear, at every angle from side on round to the back.
 */
function skullWidthScale(y) {
  const jawTaper = y < -0.12 ? 0.72 + (y + 1) * 0.32 : 1;
  const cheek = Math.exp(-Math.pow((y + 0.18) * 2.7, 2)) * 0.045;
  const crownTaper = y > 0.62 ? 1 - (y - 0.62) * 0.12 : 1;
  return (jawTaper + cheek) * crownTaper;
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
    positions.setX(index, positions.getX(index) * skullWidthScale(y));
    if (y < -0.35) {
      positions.setZ(index, positions.getZ(index) * 0.92);
    }
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
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
  const headY = h * FIGURE.headCenterY;
  // A ball, not an egg: 0.390 x 0.400 x 0.355 of total height, against the
  // measured reference's 0.469 x 0.475 x 0.439 of its own. Roundness here is
  // structural — it comes from the primitive's proportions, not from bevels.
  // The depth is 3% under the reference's ratio on purpose; see HEAD_EXTENTS.
  addGeometry(
    parts,
    createHeadGeometry(),
    {
      center: [0, headY, h * 0.006],
      scale: [h * FIGURE.head[0], h * FIGURE.head[1], h * FIGURE.head[2]],
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
        // Set back behind the cheek. Carried at -0.016h they caught the light
        // as a round blister on the cheek from three-quarter on, which on a
        // face with no nose is the only bump there is and reads as swelling.
        center: [side * h * 0.186, headY - h * 0.022, -h * 0.045],
        rotation: [0, 0, side * 0.12],
        scale: [h * 0.036, h * 0.078, h * 0.058],
        color: model.palette.skin,
        influences: [["head", 1]]
      },
      boneIndices,
      12
    );
  }
}

// WHERE THE HAIRLINE SITS, at each azimuth measured from dead ahead, as a
// fraction of the head's own half height.
//
// A cosine series rather than a table because the hairline has to close on
// itself smoothly: any join in it shows up as a kink in the one silhouette line
// the eye follows round the head.
//
//   dead ahead   +0.50   the top of the forehead, 75% of the way up the skull
//   45 degrees   +0.39   sweeping down past the temple
//   side on      +0.18   just above the ear, which stays clear of it
//   behind       -0.61   down the back of the head to the nape
//
// Plus one Gaussian notch at 32 degrees to the left, which is the part. Without
// it the front of the hairline is a level bar drawn across the forehead, and a
// level bar reads as a helmet however good the shape above it is.
function hairlineFy(azimuth) {
  return (
    0.0625 +
    0.495 * Math.cos(azimuth) -
    0.1175 * Math.cos(2 * azimuth) +
    0.06 * Math.cos(3 * azimuth) -
    0.055 * Math.exp(-(((azimuth + 0.62) / 0.6) ** 2))
  );
}

/**
 * The hair, as a shell grown off the skull rather than a ball set over it.
 *
 * The hairline used to be where a cap ellipsoid crossed the skull, and two
 * ellipsoids of nearly the same size and curvature cross in a curve so
 * ill-conditioned that one facet's worth of error moves it a long way along the
 * surface. On a twenty-segment head that is a visible staircase cut into the
 * hairline over the temple, and it was there at every angle past fifty degrees
 * no matter how the cap was sized — it is a property of intersecting two coarse
 * tessellations, not of the numbers.
 *
 * A shell has no intersection to go wrong. Its lower rim IS the hairline, laid
 * on the curve above directly, so the line is exactly as smooth as the function
 * whatever the mesh density. It also hugs the skull, which is what lets the
 * hair take the whole crown without the head growing a second, larger dome
 * around it.
 *
 * The rim sits a whisker proud of the skull and the crown 0.055h proud, which
 * is what carries the top of the hair to exactly 1.000h — the height the
 * exported native height, the 2.5-unit renderer floor and the world-unit toon
 * outline all depend on.
 */
function createHairShellGeometry(segments) {
  const rings = 6;
  const rimLift = 0.004;
  const crownLift = 0.055;
  const halfWidth = HEAD_EXTENTS.x / 2;
  const halfHeight = HEAD_EXTENTS.y / 2;
  const halfDepth = HEAD_EXTENTS.z / 2;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let column = 0; column <= segments; column += 1) {
    const azimuth = (column / segments) * Math.PI * 2 - Math.PI;
    const rim = Math.min(0.98, Math.max(-0.98, hairlineFy(azimuth)));
    const rimAngle = Math.acos(rim);
    for (let ring = 0; ring <= rings; ring += 1) {
      const along = ring / rings;
      const polar = rimAngle * (1 - along);
      const lift =
        rimLift + (crownLift - rimLift) * along * along * (3 - 2 * along);
      const sin = Math.sin(polar);
      const cos = Math.cos(polar);
      positions.push(
        sin * Math.sin(azimuth) * (halfWidth + lift) * skullWidthScale(cos),
        cos * (halfHeight + lift),
        sin * Math.cos(azimuth) * (halfDepth + lift)
      );
      uvs.push(0, 0);
    }
  }
  for (let column = 0; column < segments; column += 1) {
    for (let ring = 0; ring < rings; ring += 1) {
      const at = column * (rings + 1) + ring;
      const next = at + rings + 1;
      indices.push(at, next, at + 1, next, next + 1, at + 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function addHair(parts, model, boneIndices) {
  const { height: h, palette, hair } = model;
  const headY = h * FIGURE.headCenterY;
  const longHair = hair === "long-flower";
  const shortHair = hair === "short" || hair === "chef-hat";
  addGeometry(
    parts,
    createHairShellGeometry(Math.max(18, activeDetailProfile.surfaceSegments * 2)),
    {
      center: [0, headY, h * 0.006],
      scale: [h, h, h],
      color: palette.hair,
      influences: [["hair", 1]]
    },
    boneIndices
  );
  addEllipsoid(
    parts,
    {
      center: [
        0,
        headY + h * (shortHair ? -0.016 : -0.05),
        -h * (shortHair ? 0.075 : 0.13)
      ],
      scale: [
        h * (shortHair ? 0.335 : 0.34),
        h * (shortHair ? 0.3 : 0.35),
        h * (shortHair ? 0.285 : 0.29)
      ],
      color: palette.hair,
      influences: [["hair", 1]]
    },
    boneIndices,
    18
  );

  // The locks that frame the face, for the long styles only. Short hair used to
  // carry a pair too, sat inside the temple where the shell already reaches:
  // they poked back out through it as a row of spikes along the hairline at
  // every angle past fifty degrees, which is the same class of artefact the
  // shell exists to remove.
  if (!shortHair) {
    for (const side of [-1, 1]) {
      addEllipsoid(
        parts,
        {
          // Hung FROM the hairline. Carried higher, the top of the lock broke
          // back out through the shell over the temple as a row of spikes.
          center: [side * h * 0.15, h * (longHair ? 0.58 : 0.645), h * 0.035],
          rotation: [0, 0, side * 0.055],
          scale: [h * 0.095, h * (longHair ? 0.42 : 0.3), h * 0.09],
          color: palette.hair,
          influences: [["hair", 1]]
        },
        boneIndices,
        14
      );
    }
  }

  if (longHair) {
    const locks = [
      [-0.13, 0.52, -0.1, -0.05, 0.44],
      [-0.065, 0.5, -0.15, -0.022, 0.47],
      [0, 0.49, -0.175, 0, 0.49],
      [0.065, 0.5, -0.15, 0.022, 0.47],
      [0.13, 0.52, -0.1, 0.05, 0.44]
    ];
    for (const [x, y, z, tilt, length] of locks) {
      addEllipsoid(
        parts,
        {
          center: [h * x, h * y, h * z],
          rotation: [0, 0, tilt],
          scale: [h * 0.16, h * length, h * 0.15],
          color: palette.hair,
          influences: [["hair", 1]]
        },
        boneIndices,
        14
      );
    }
  }

  if (hair === "ponytail") {
    // A TAIL, not a rope.
    //
    // Three equal-width locks hung off the side of the head read from behind —
    // the view the chase camera holds longer than any other — as one shapeless
    // brown mass: nothing said where the hair was gathered, nothing narrowed,
    // and it finished in a blunt dome. All three fixes below are silhouette,
    // because at the ninety pixels a townsperson gets there is no surface
    // detail left to carry the read:
    //
    //   - the GATHER: a knot of hair pulled to the back of the skull with the
    //     tie wrapped round it in a colour of its own. One band of contrast is
    //     the strongest single cue that hair is tied rather than merely long.
    //   - the TAPER: every lock narrower than the one above it, and each one
    //     hung where the one above has already run out of width, so the tail's
    //     outline actually falls instead of holding one width to a blunt dome.
    //     Constant width is what made it read as rope.
    //
    // It also stays no wider than it was: the locks hold their line down the
    // shoulder instead of flaring, because a second large mass at hip height
    // costs the figure its single clear silhouette.
    addEllipsoid(
      parts,
      {
        center: [h * 0.163, h * 0.775, -h * 0.142],
        scale: [h * 0.138, h * 0.14, h * 0.138],
        color: palette.hair,
        influences: [["hair", 1]]
      },
      boneIndices,
      14
    );
    const ponytailLocks = [
      [0.172, 0.605, -0.145, -0.08, 0.28, 0.125],
      [0.182, 0.468, -0.15, -0.11, 0.22, 0.098],
      [0.192, 0.362, -0.15, -0.15, 0.17, 0.074],
      [0.202, 0.278, -0.148, -0.19, 0.13, 0.048]
    ];
    for (const [x, y, z, tilt, length, width] of ponytailLocks) {
      addEllipsoid(
        parts,
        {
          center: [h * x, h * y, h * z],
          rotation: [0, 0, tilt],
          scale: [h * width, h * length, h * width * 0.95],
          color: palette.hair,
          influences: [["hair", 1]]
        },
        boneIndices,
        14
      );
    }
    // The band itself is a squashed ellipsoid rather than a ring. A ring seen
    // from behind is edge-on and draws as a floating bar; a collar a whisker
    // wider than the tail it sits on draws as a band ON the tail, which is the
    // only thing that survives at chase distance.
    addEllipsoid(
      parts,
      {
        center: [h * 0.176, h * 0.688, -h * 0.147],
        rotation: [0, 0, -0.08],
        scale: [h * 0.138, h * 0.066, h * 0.132],
        color: hairTieColor(palette),
        influences: [["hair", 1]]
      },
      boneIndices,
      14
    );
  }

  if (hair === "bun-flower") {
    // A COILED bun with a wrap, for the same reason the ponytail got a tie: one
    // ball of hair colour sunk into the back of one dome of hair colour has no
    // edge anywhere in it, so from behind it read as a lump on the head rather
    // than as hair someone put up. The second, darker turn gives the coil an
    // interior line, and the wrap gives it a base.
    addEllipsoid(
      parts,
      {
        center: [h * 0.152, h * 0.9, -h * 0.096],
        scale: [h * 0.186, h * 0.176, h * 0.176],
        color: palette.hair,
        influences: [["hair", 1]]
      },
      boneIndices,
      16
    );
    // The second turn of the coil, and it is a SHADE of the hair rather than a
    // second colour: what the bun was missing from behind was an interior line,
    // and one ball of hair colour against one dome of the same hair colour has
    // no line anywhere in it.
    addEllipsoid(
      parts,
      {
        center: [h * 0.092, h * 0.852, -h * 0.148],
        scale: [h * 0.122, h * 0.116, h * 0.122],
        color: shadeHex(palette.hair, 0.72),
        influences: [["hair", 1]]
      },
      boneIndices,
      14
    );
    // The crease where the coil leaves the head, in a deep shade of the hair
    // rather than in a colour of its own.
    //
    // A gold band and then a gold pin were both tried here and both fail the
    // same way: the base of the bun is buried in the back of the head, so only
    // the outer sliver of either ever shows and a bright sliver draws as a beak
    // poking out of the skull. Dark does not have that problem — where it is
    // buried it is invisible and where it shows it reads as shadow, which is
    // exactly the line the bun was missing.
    addEllipsoid(
      parts,
      {
        center: [h * 0.138, h * 0.846, -h * 0.104],
        rotation: [0, 0, -0.28],
        scale: [h * 0.196, h * 0.048, h * 0.188],
        color: shadeHex(palette.hair, 0.55),
        influences: [["hair", 1]]
      },
      boneIndices,
      16
    );
    // The ornament sits ON the part of the coil that is in the open, so it is a
    // bead rather than anything that has to cross the silhouette.
    addEllipsoid(
      parts,
      {
        center: [h * 0.212, h * 0.888, -h * 0.132],
        scale: [h * 0.062, h * 0.062, h * 0.062],
        color: hairTieColor(palette),
        influences: [["hair", 1]]
      },
      boneIndices,
      12
    );
  }
}

// The band round a gather. It is its own palette entry rather than the outfit's
// accent because the test that asserts a tie exists keys on the colour, and an
// accent shared with a sash or a cardigan edge would make that assertion say
// nothing about the hair.
function hairTieColor(palette) {
  return palette.hairTie ?? palette.accent;
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

// Every limb segment is authored to overlap its neighbour while both are still
// at full width, which is the whole answer to the segments reading as separate
// floating pieces. A capsule tapers to nothing at its dome; the old build let
// the shin's bottom dome expire exactly where the foot ellipsoid ended, so the
// leg column collapsed from 0.074h to 0.025h at the ankle and the shoe read as
// detached. Measured, not guessed: tmp/probe-limb-gap.mjs prints the profile.
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
        center: [side * h * FIGURE.hipLateral, h * FIGURE.upperLegY, 0],
        scale: [
          h * FIGURE.upperLeg[0],
          h * FIGURE.upperLeg[1],
          h * FIGURE.upperLeg[2]
        ],
        color: kimonoLike ? palette.inner : palette.lower,
        influences: [[`${sideName}UpperLeg`, 1]]
      },
      boneIndices,
      14
    );
    addCapsule(
      parts,
      {
        center: [side * h * FIGURE.hipLateral, h * FIGURE.lowerLegY, 0],
        scale: [
          h * FIGURE.lowerLeg[0],
          h * FIGURE.lowerLeg[1],
          h * FIGURE.lowerLeg[2]
        ],
        color: kimonoLike || croppedPants ? palette.skin : palette.lower,
        influences: [[`${sideName}LowerLeg`, 1]]
      },
      boneIndices,
      13
    );
    if (croppedPants) {
      // The cropped hem sits over the top of the shin. It is no narrower than
      // the thigh above it, so the trouser reads as cloth over the leg rather
      // than as a step in the leg itself.
      addCapsule(
        parts,
        {
          center: [side * h * FIGURE.hipLateral, h * 0.175, 0],
          scale: [h * 0.118, h * 0.115, h * 0.123],
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
        center: [side * h * FIGURE.hipLateral, h * FIGURE.footY, h * 0.045],
        scale: [h * FIGURE.foot[0], h * FIGURE.foot[1], h * FIGURE.foot[2]],
        color: palette.shoes,
        influences: [[`${sideName}Foot`, 1]]
      },
      boneIndices,
      14
    );
    // A blob foot with nothing on it is a stub. A rounded toe cap lifted at the
    // front gives the shoe a direction, which is what tells the eye which way
    // the character is facing at 55 px per world unit.
    addEllipsoid(
      parts,
      {
        center: [side * h * FIGURE.hipLateral, h * 0.045, h * 0.105],
        scale: [h * 0.1, h * 0.062, h * 0.075],
        color: shadeHex(palette.shoes, 0.86),
        influences: [[`${sideName}Foot`, 1]]
      },
      boneIndices,
      12
    );
    if (kimonoLike) {
      addCapsule(
        parts,
        {
          center: [side * h * FIGURE.hipLateral, h * 0.062, h * 0.085],
          rotation: [Math.PI / 2, side * 0.38, 0],
          scale: [h * 0.018, h * 0.11, h * 0.018],
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
          center: [side * h * FIGURE.hipLateral, h * 0.052, h * 0.118],
          size: [h * 0.085, h * 0.022, h * 0.05],
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
          center: [side * h * FIGURE.shoulderLateral, h * 0.415, 0],
          rotation: [0, 0, side * 0.075],
          scale: [h * 0.135, h * 0.21, h * 0.125],
          color: palette.upperLight,
          influences: [[`${sideName}Sleeve`, 1]]
        },
        boneIndices,
        13
      );
      addCapsule(
        parts,
        {
          center: [side * h * FIGURE.armLateral, h * FIGURE.lowerArmY, 0],
          scale: [
            h * FIGURE.lowerArm[0],
            h * FIGURE.lowerArm[1],
            h * FIGURE.lowerArm[2]
          ],
          color: palette.skin,
          influences: [[`${sideName}LowerArm`, 1]]
        },
        boneIndices,
        11
      );
    } else {
      if (shortSleeves) {
        // A capsule ends in a dome, which is why the short sleeve read as a
        // puffed ball. A happi sleeve is a straight tube that flares a little
        // and stops at a flat hem above the elbow.
        addTapered(
          parts,
          {
            center: [side * h * FIGURE.shoulderLateral, h * 0.435, 0],
            rotation: [0, 0, side * 0.075],
            topWidth: h * 0.115,
            bottomWidth: h * 0.135,
            height: h * 0.115,
            depth: h * 0.11,
            color: palette.upper,
            influences: [[`${sideName}UpperArm`, 1]]
          },
          boneIndices
        );
      } else {
        addCapsule(
          parts,
          {
            center: [side * h * FIGURE.shoulderLateral, h * FIGURE.upperArmY, 0],
            scale: [
              h * FIGURE.upperArm[0],
              h * FIGURE.upperArm[1],
              h * FIGURE.upperArm[2]
            ],
            color: palette.upper,
            influences: [[`${sideName}UpperArm`, 1]]
          },
          boneIndices,
          12
        );
      }
      // The forearm reaches up well inside the sleeve. Ending it at the hem
      // leaves a pinch there and the arm reads as a tube hung off the shoulder.
      addCapsule(
        parts,
        {
          center: [side * h * FIGURE.armLateral, h * FIGURE.lowerArmY, 0],
          scale: [
            h * FIGURE.lowerArm[0],
            h * FIGURE.lowerArm[1],
            h * FIGURE.lowerArm[2]
          ],
          color: palette.skin,
          influences: [[`${sideName}LowerArm`, 1]]
        },
        boneIndices,
        11
      );
    }

    // The mitten hand: one big ball for the fist and one small one for the
    // thumb. Fingers are invisible at this range, but a thumb changes the
    // outline, and shape is what survives distance.
    addEllipsoid(
      parts,
      {
        center: [side * h * FIGURE.armLateral, h * FIGURE.handY, h * 0.012],
        scale: [h * FIGURE.hand[0], h * FIGURE.hand[1], h * FIGURE.hand[2]],
        color: palette.skin,
        influences: [[`${sideName}LowerArm`, 1]]
      },
      boneIndices,
      12
    );
    addEllipsoid(
      parts,
      {
        center: [
          side * h * (FIGURE.armLateral - 0.042),
          h * (FIGURE.handY + 0.022),
          h * 0.042
        ],
        rotation: [0, 0, side * 0.4],
        scale: [h * 0.034, h * 0.056, h * 0.038],
        color: palette.skin,
        influences: [[`${sideName}LowerArm`, 1]]
      },
      boneIndices,
      10
    );
  }
}

// The chest the happi is worn over. A kimono lays its own, deeper body over this
// one, so only the open-jacket characters take the fuller chest — giving the
// others one would push their own overlay inside out.
const TORSO_DEPTH = { chest: 0.19, hips: 0.175, chestZ: 0 };
const HAPPI_TORSO_DEPTH = { chest: 0.215, hips: 0.195, chestZ: 0.008 };

function torsoDepth(model) {
  return model.garment === "happi" ? HAPPI_TORSO_DEPTH : TORSO_DEPTH;
}

// The one description of the chest, so anything laid on it — the innerwear, the
// front edges of the happi, the crest — is cut from the same surface and cannot
// drift off it.
function chestBody(model) {
  const { height: h } = model;
  const depth = torsoDepth(model);
  return {
    center: [0, h * FIGURE.chestBoneY, h * depth.chestZ],
    scale: [h * FIGURE.torso[0], h * FIGURE.torso[1], h * depth.chest]
  };
}

function addTorsoAndNeck(parts, model, boneIndices) {
  const { height: h, palette } = model;
  const depth = torsoDepth(model);
  const chest = chestBody(model);
  addEllipsoid(
    parts,
    {
      center: [0, h * FIGURE.hipsBoneY, 0],
      scale: [h * 0.21, h * 0.15, h * depth.hips],
      color: palette.lower,
      influences: [["hips", 1]]
    },
    boneIndices,
    16
  );
  addEllipsoid(
    parts,
    {
      ...chest,
      color: palette.upper,
      influences: [
        ["chest", 0.82],
        ["hips", 0.18]
      ]
    },
    boneIndices,
    18
  );
  // A chibi has effectively no neck: the head sits straight on the shoulders.
  // This is a short collar that closes the join between the torso top at 0.545h
  // and the chin, not a visible column.
  addCapsule(
    parts,
    {
      center: [0, h * 0.535, 0],
      scale: [h * 0.115, h * 0.06, h * 0.11],
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
  // A shoulder as deep as it is wide is a puffer sleeve. The happi hangs over
  // the deltoid, so the piece that bridges chest to sleeve is a wide, shallow
  // pad rather than a ball.
  for (const side of [-1, 1]) {
    addEllipsoid(
      parts,
      {
        center: [side * h * 0.13, h * FIGURE.shoulderY, 0],
        rotation: [0, 0, side * 0.55],
        scale: [h * 0.13, h * 0.075, h * 0.11],
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

// The one description of the kimono's own chest block. The collar is cut from
// this surface, so the two cannot drift apart: before, the collar was a pair of
// free capsules parked at a hand-written z, and once the chest was reproportioned
// they were left standing 0.06h clear of it with daylight behind them.
function kimonoBody(model) {
  const { height: h } = model;
  return {
    center: [0, h * 0.425, 0],
    scale: [h * 0.26, h * 0.24, h * 0.22]
  };
}

function addKimono(parts, model, boneIndices) {
  const { height: h, palette, garment } = model;
  // A chibi kimono is a bell, not a column: it starts at the obi and flares to
  // the ankle over a quarter of the figure's height rather than half of it.
  // The hem clears the ankle and the bell is deep enough to hold the leg at hem
  // height through a full stride. The leg swings 0.85 radians about a hip at
  // 0.29h, so at the hem it travels 0.394 units against a half-depth of 0.393:
  // the leg stays inside the cloth and only the foot comes out below it. A
  // shallower, longer skirt puts the shoe through the front of the kimono
  // halfway up, which is what the previous bell did.
  addTapered(
    parts,
    {
      center: [0, h * 0.2125, 0],
      topWidth: h * 0.22,
      bottomWidth: h * 0.32,
      height: h * 0.245,
      depth: h * 0.3,
      color: palette.lower,
      influences: [["hem", 1]]
    },
    boneIndices
  );
  const body = kimonoBody(model);
  addEllipsoid(
    parts,
    {
      ...body,
      color: palette.upper,
      influences: [
        ["chest", 0.85],
        ["hips", 0.15]
      ]
    },
    boneIndices,
    18
  );
  // The crossed collar, cut out of the kimono's own chest so it curves with it.
  // Each panel is a band that starts wide beside the neck and runs down and
  // inward until the two cross above the obi, which is the V a kimono makes.
  // The left panel is lifted a shade further than the right so the overlap has a
  // near side, the way the garment is actually worn.
  for (const side of [-1, 1]) {
    addSurfacePatch(
      parts,
      {
        ...body,
        lift: side < 0 ? 1.03 : 1.016,
        topY: 0.86,
        bottomY: -0.44,
        from:
          side < 0
            ? [-0.72, -0.05]
            : [0.3, -0.16],
        to:
          side < 0
            ? [-0.3, 0.16]
            : [0.72, 0.05],
        rows: 14,
        columns: 6,
        color: palette.inner,
        influences: [["chest", 1]]
      },
      boneIndices
    );
  }
  addTapered(
    parts,
    {
      center: [0, h * 0.315, h * 0.018],
      topWidth: h * 0.26,
      bottomWidth: h * 0.26,
      height: h * 0.09,
      depth: h * 0.235,
      color: palette.accent,
      influences: [["hips", 1]]
    },
    boneIndices
  );
  for (const side of [-1, 1]) {
    addEllipsoid(
      parts,
      {
        center: [side * h * 0.07, h * 0.325, h * 0.12],
        rotation: [0, side * 0.26, side * 0.22],
        scale: [h * 0.11, h * 0.055, h * 0.04],
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
      center: [0, h * 0.322, h * 0.135],
      size: [h * 0.045, h * 0.06, h * 0.04],
      color: palette.accent,
      influences: [["hips", 1]]
    },
    boneIndices
  );
  addFlower(
    parts,
    model,
    boneIndices,
    [0, h * 0.322, h * 0.15],
    "hips",
    0.5
  );

  if (garment === "kimono" || garment === "yukata") {
    const motifs =
      garment === "kimono"
        ? [[0.075, 0.1], [0.04, 0.16], [-0.06, 0.22]]
        : [[0.07, 0.17], [-0.065, 0.11]];
    for (const [x, y] of motifs) {
      addFlower(
        parts,
        model,
        boneIndices,
        [h * x, h * y, kimonoSurfaceZ(h, x, y)],
        "hem",
        garment === "kimono" ? 0.8 : 0.7
      );
    }
  }
}

function kimonoSurfaceZ(h, x, y) {
  const bottomY = 0.09;
  const topY = 0.335;
  const progress = Math.min(1, Math.max(0, (y - bottomY) / (topY - bottomY)));
  const radiusX = 0.16 + (0.11 - 0.16) * progress;
  const radiusZ = radiusX * (0.3 / 0.32);
  const lateral = Math.min(0.97, Math.abs(x) / radiusX);
  return h * radiusZ * Math.sqrt(1 - lateral * lateral) * 0.94;
}

function addHappiDetails(parts, model, boneIndices) {
  const { height: h, palette } = model;
  const chest = { ...chestBody(model), influences: [["chest", 1]] };

  // The shirt under the open jacket: a shaped area of the chest itself, so it
  // curves with the body and cannot stand off the back of it. Wide at the
  // collar and narrowing on the way down, which is the crossed V of the
  // innerwear seen through the open happi.
  addSurfacePatch(
    parts,
    {
      ...chest,
      lift: 1.012,
      topY: 0.92,
      bottomY: -0.62,
      from: [-0.46, -0.2],
      to: [0.46, 0.2],
      color: palette.inner
    },
    boneIndices
  );
  // The front edges of the happi, a shade lighter than the body of it, running
  // down either side of that opening.
  for (const side of [-1, 1]) {
    const inner = [side * 0.44, side * 0.18];
    const outer = [side * 0.62, side * 0.36];
    addSurfacePatch(
      parts,
      {
        ...chest,
        lift: 1.026,
        topY: 0.94,
        bottomY: -0.66,
        // The patch is one-sided, so its columns always run the way that leaves
        // the outward face towards the camera.
        from: side < 0 ? outer : inner,
        to: side < 0 ? inner : outer,
        color: palette.upperLight
      },
      boneIndices
    );
  }
  addTapered(
    parts,
    {
      center: [0, h * 0.3, h * 0.006],
      topWidth: h * 0.235,
      bottomWidth: h * 0.24,
      height: h * 0.07,
      depth: h * 0.215,
      color: palette.accent,
      influences: [["hips", 1]]
    },
    boneIndices
  );
  addFlower(
    parts,
    model,
    boneIndices,
    [h * 0.075, h * 0.47, h * chestSurfaceZ(model, 0.075, 0.47)],
    "chest",
    0.55
  );
}

// Where the chest's front surface sits at a point, so a crest laid on it sits on
// the cloth rather than in front of it.
function chestSurfaceZ(model, x, y) {
  const { height: h } = model;
  const { center, scale } = chestBody(model);
  const acrossX = x / (scale[0] / 2 / h);
  const acrossY = (y - center[1] / h) / (scale[1] / 2 / h);
  const inside = Math.max(0, 1 - acrossX * acrossX - acrossY * acrossY);
  return center[2] / h + (scale[2] / 2 / h) * Math.sqrt(inside);
}

// The charm hangs FROM the sash. Previously it was three pieces parked in mid
// air beside the hip with nothing joining them to the figure, which is why it
// read as floating: there was no cord, and the ring that was meant to imply one
// sat above the charm touching neither it nor the sash. Here a cord runs from
// inside the sash down to the ring, and the ring carries the charm, so the
// chain of contact is unbroken from cloth to charm.
function addOmamori(parts, model, boneIndices) {
  const { height: h, garment } = model;
  // Both sashes are centred near 0.30h; the cord starts inside the cloth.
  const sashY = garment === "happi" ? 0.315 : 0.325;
  const x = h * 0.088;
  const z = h * (garment === "happi" ? 0.115 : 0.128);
  const ringY = h * 0.252;
  const charmY = h * 0.208;

  addCapsule(
    parts,
    {
      center: [x, h * ((sashY + 0.252) / 2), z],
      scale: [h * 0.011, h * (sashY - 0.252 + 0.02), h * 0.011],
      color: "#d8cbb4",
      influences: [["hips", 1]]
    },
    boneIndices,
    8
  );
  addTorus(
    parts,
    {
      center: [x, ringY, z],
      radius: h * 0.022,
      tube: h * 0.007,
      color: "#e5a832",
      influences: [["hips", 1]]
    },
    boneIndices
  );
  addEllipsoid(
    parts,
    {
      center: [x, charmY, z],
      scale: [h * 0.062, h * 0.09, h * 0.032],
      color: "#9b4a2d",
      influences: [["hips", 1]]
    },
    boneIndices,
    16
  );
  addEllipsoid(
    parts,
    {
      center: [x, charmY, z + h * 0.019],
      scale: [h * 0.032, h * 0.05, h * 0.011],
      color: "#f1bd42",
      influences: [["hips", 1]]
    },
    boneIndices,
    14
  );
}

// The traveller's bag hardware: strap, buckle ring and the short link down to
// the bag are all one leather, so the chain of contact from shoulder to bag
// reads as a single object rather than three props that happen to touch.
const STRAP_LEATHER = "#6d352d";

// The visitor's camera: a dark body on a woven neck strap.
const CAMERA_BODY = "#2f3238";
const CAMERA_STRAP = "#4a3f3a";

function addNpcDetails(parts, model, boneIndices) {
  const { height: h, garment, palette } = model;
  // Cloth that lies ON the body is cut out of the body's own surface, the same
  // way the happi is. A flat plank stood in front of the chest reads as a box
  // being carried, and on a torso this short the box is most of the figure.
  const chest = { ...chestBody(model), influences: [["chest", 1]] };
  if (garment === "jacket") {
    addSurfacePatch(
      parts,
      {
        ...chest,
        lift: 1.014,
        topY: 0.9,
        bottomY: -0.72,
        from: [-0.26, -0.17],
        to: [0.26, 0.17],
        color: palette.inner
      },
      boneIndices
    );
    // The strap is cut from the jacket it lies on. As a straight capsule it
    // could only be tangent to a curved chest at one point: it started above
    // the chin, crossed in front of the sternum and sank back inside the coat
    // on the way down. A band on the surface starts on the shoulder and stays
    // on the cloth the whole way across.
    addSurfacePatch(
      parts,
      {
        ...chest,
        lift: 1.03,
        topY: 0.74,
        bottomY: -0.62,
        from: [0.16, -0.6],
        to: [0.32, -0.46],
        rows: 14,
        columns: 4,
        color: STRAP_LEATHER,
        influences: [["chest", 1]]
      },
      boneIndices
    );
    // The last hand's width from the bottom of the band to the ring on the bag,
    // so the chain of contact from shoulder to bag is unbroken. It leans the
    // way the band above it does, rather than dropping straight down.
    addCapsule(
      parts,
      {
        center: [-h * 0.085, h * 0.362, h * 0.1],
        rotation: [0, 0, -0.85],
        scale: [h * 0.016, h * 0.115, h * 0.016],
        color: STRAP_LEATHER,
        influences: [["chest", 1]]
      },
      boneIndices,
      8
    );
    // The bag hangs in FRONT of the arm, not beside it. Parked at the side it
    // was buried: the ring and the link sat a full 3% of figure height behind
    // the arm's own front surface, so the strap ran into the sleeve, vanished,
    // and reappeared below — the "passes through the jacket" read. A bag worn
    // across the body rides on the opposite hip anyway, which is where this now
    // puts it.
    //
    // It is still kept inside the head's silhouette on purpose. A prop that
    // out-reaches the skull steals the widest shape in the figure, and the
    // widest shape is what the eye resolves first at distance.
    addRoundedPanel(
      parts,
      {
        center: [-h * 0.142, h * 0.245, h * 0.098],
        rotation: [0, 0, -0.04],
        size: [h * 0.09, h * 0.13, h * 0.075],
        color: palette.accent,
        influences: [["leftLowerArm", 1]]
      },
      boneIndices
    );
    addTorus(
      parts,
      {
        center: [-h * 0.135, h * 0.322, h * 0.108],
        radius: h * 0.045,
        tube: h * 0.011,
        scale: [1, 0.72, 1],
        color: STRAP_LEATHER,
        influences: [["leftLowerArm", 1]]
      },
      boneIndices
    );
  } else if (garment === "chef") {
    addTapered(
      parts,
      {
        center: [0, h * 0.28, h * 0.105],
        topWidth: h * 0.2,
        bottomWidth: h * 0.235,
        height: h * 0.2,
        depth: h * 0.03,
        color: palette.lower,
        influences: [["hips", 0.8], ["chest", 0.2]]
      },
      boneIndices
    );
    // The hachimaki, tied round the forehead — which is what the approved
    // illustration shows. Scaled to the new skull it is a band across the brow,
    // not a hat: the previous 0.03h ring became a red pillbox once the head
    // doubled, and read as a fez.
    addTapered(
      parts,
      {
        center: [0, h * 0.855, 0],
        topWidth: h * 0.4,
        bottomWidth: h * 0.402,
        height: h * 0.075,
        depth: h * 0.378,
        color: palette.accent,
        influences: [["head", 1]]
      },
      boneIndices
    );
    addSurfacePatch(
      parts,
      {
        ...chest,
        lift: 1.02,
        topY: 0.22,
        bottomY: 0.02,
        from: [-0.5, -0.5],
        to: [0.5, 0.5],
        color: palette.accent
      },
      boneIndices
    );
    for (const y of [0.42, 0.47]) {
      for (const x of [-0.045, 0.045]) {
        addEllipsoid(
          parts,
          {
            center: [h * x, h * y, h * (chestSurfaceZ(model, x, y) + 0.008)],
            scale: [h * 0.018, h * 0.018, h * 0.013],
            color: "#342b30",
            influences: [["chest", 1]]
          },
          boneIndices,
          10
        );
      }
    }
  } else if (garment === "visitor") {
    addFlaredSkirt(
      parts,
      {
        topY: h * 0.335,
        flareY: h * 0.222,
        topRadius: h * 0.108,
        maxRadius: h * 0.16,
        rollTube: h * 0.055,
        rollArc: Math.PI * 0.46,
        depthRatio: 0.86,
        color: palette.skirt,
        influences: [["hem", 1]]
      },
      boneIndices
    );
    // The blouse under the open cardigan, and the cardigan's own front edges,
    // both cut from the chest so they curve with it.
    addSurfacePatch(
      parts,
      {
        ...chest,
        lift: 1.014,
        topY: 0.9,
        bottomY: -0.85,
        from: [-0.3, -0.24],
        to: [0.3, 0.24],
        color: palette.inner
      },
      boneIndices
    );
    for (const side of [-1, 1]) {
      const inner = [side * 0.28, side * 0.22];
      const outer = [side * 0.78, side * 0.62];
      addSurfacePatch(
        parts,
        {
          ...chest,
          lift: 1.026,
          topY: 0.92,
          bottomY: -0.88,
          from: side < 0 ? outer : inner,
          to: side < 0 ? inner : outer,
          color: palette.upperLight
        },
        boneIndices
      );
    }
    // The camera HANGS. It was a brown disc laid flat on the chest with nothing
    // holding it up, and at this size a circle parked on a torso reads as a
    // doorknob, not as something the character is carrying. A camera is a
    // landscape box, and the strap that carries it has to arrive from the neck
    // so the chain of contact from body to prop is unbroken.
    for (const side of [-1, 1]) {
      const outer = [side * 0.5, side * 0.12];
      const inner = [side * 0.36, side * 0.02];
      addSurfacePatch(
        parts,
        {
          ...chest,
          lift: 1.032,
          topY: 0.88,
          bottomY: -0.02,
          // The patch is one-sided, so its columns always run the way that
          // leaves the outward face towards the camera.
          from: side < 0 ? outer : inner,
          to: side < 0 ? inner : outer,
          rows: 12,
          columns: 3,
          color: CAMERA_STRAP,
          influences: [["chest", 1]]
        },
        boneIndices
      );
    }
    const cameraY = 0.405;
    const cameraZ = chestSurfaceZ(model, 0, cameraY);
    addRoundedPanel(
      parts,
      {
        center: [0, h * cameraY, h * (cameraZ + 0.012)],
        size: [h * 0.088, h * 0.05, h * 0.03],
        color: CAMERA_BODY,
        influences: [["chest", 1]]
      },
      boneIndices
    );
    addTorus(
      parts,
      {
        center: [0, h * cameraY, h * (cameraZ + 0.026)],
        radius: h * 0.016,
        tube: h * 0.006,
        color: "#8d9299",
        influences: [["chest", 1]]
      },
      boneIndices
    );
  } else if (garment === "yukata") {
    addGeometry(
      parts,
      createFanGeometry(h * 0.13, h * 0.015),
      {
        center: [h * 0.2, h * 0.235, h * 0.1],
        rotation: [0, 0, -0.18],
        color: palette.accent,
        influences: [["rightLowerArm", 1]]
      },
      boneIndices
    );
    addCapsule(
      parts,
      {
        center: [h * 0.2, h * 0.23, h * 0.11],
        rotation: [0, 0, -0.18],
        scale: [h * 0.011, h * 0.1, h * 0.011],
        color: "#7a462d",
        influences: [["rightLowerArm", 1]]
      },
      boneIndices,
      8
    );
  }
}

function createCharacterGeometry(model, boneIndices) {
  const playerModel = model.identity.startsWith("player-");
  activeDetailProfile = playerModel
    ? DETAIL_PROFILES.player
    : DETAIL_PROFILES.npc;
  const parts = [];

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

  const headParts = [];
  addFace(headParts, model, boneIndices);
  addHair(headParts, model, boneIndices);

  if (model.hair === "long-flower" || model.hair === "bun-flower") {
    // ON the hairline, not in the air beside it. The old centre stood 0.108h
    // clear of the skull surface at that height, so the flower floated off the
    // temple with daylight behind it at every three-quarter angle. These are the
    // coordinates of the hair surface itself at forty degrees round from dead
    // ahead, which is where a kanzashi is pinned.
    addFlower(
      headParts,
      model,
      boneIndices,
      [model.height * 0.128, model.height * 0.82, model.height * 0.148],
      "hair",
      1.4
    );
  }
  parts.push(...headParts);
  if (playerModel) {
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

function createCharacterScene(model) {
  const rig = createHumanoidRig(model.height);
  const geometry = createCharacterGeometry(model, rig.boneIndices);
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
    // Derived from the head the figure is actually built with, not a literal
    // copy of it, so the metadata cannot go stale against the geometry.
    headCount: Number(SKULL_HEAD_COUNT.toFixed(2)),
    silhouetteHeadCount: Number(SILHOUETTE_HEAD_COUNT.toFixed(2)),
    sourcePartCount: geometry.userData.sourcePartCount
  };

  const scene = new Scene();
  scene.name = `${model.identity}-scene`;
  scene.add(character);
  scene.updateMatrixWorld(true);
  return { scene, geometry, material, triangleCount };
}

async function exportCharacter(model) {
  const { scene, geometry, material, triangleCount } =
    createCharacterScene(model);
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

// The vertical proportion table, exported so the runtime can read the figure it
// is animating instead of keeping its own copy. Every one of these is a
// fraction of total figure height and is shared by all six characters; only the
// height they are multiplied by differs.
const FIGURE_FRACTION_KEYS = [
  "soleY",
  "ankleY",
  "kneeY",
  "hipJointY",
  "crotchY",
  "hipsBoneY",
  "wristY",
  "elbowY",
  "chestBoneY",
  "shoulderY",
  "torsoTopY",
  "chinY",
  "headCenterY",
  "crownY",
  "hairTopY"
];
const fractionEntries = FIGURE_FRACTION_KEYS.map(
  (key) => `  ${key}: ${FIGURE[key]}`
).join(",\n");
await writeFile(
  resolve(process.cwd(), "app/world/RpgCharacterFigure.ts"),
  `// Written by scripts/generate-character-models.mjs from the FIGURE table the
// meshes are actually built from. Every value is a fraction of total figure
// height, shared by all six characters. Do not edit by hand: edit FIGURE in the
// generator and re-run it, or the models and the motion model drift apart in
// silence.
export const RPG_CHARACTER_FIGURE = {
${fractionEntries}
} as const;

export type RpgCharacterFigureLandmark = keyof typeof RPG_CHARACTER_FIGURE;
`
);
process.stdout.write("app/world/RpgCharacterFigure.ts updated\n");

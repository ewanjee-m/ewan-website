import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  Color,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Scene,
  Skeleton,
  SkinnedMesh,
  Uint32BufferAttribute
} from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { applyAutoSkinWeights } from "./lib/auto-skin.mjs";
import { createHumanoidRig, RIG_ID } from "./lib/humanoid-rig.mjs";
import { BODY_UV, createCharacterAtlas } from "./lib/character-atlas.mjs";
import { attachBaseColorTexture, removeTextures } from "./lib/glb-texture.mjs";

const MAX_TRIANGLES = 25_000;
const MAX_FILE_BYTES = 2_000_000;

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

function readOptions(argv) {
  const options = {
    yaw: 0,
    garment: "kimono",
    faceAtlas: null
  };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, "");
    const value = argv[index + 1];
    if (!key || value === undefined) continue;
    options[key] = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
  }
  for (const required of ["input", "output", "height"]) {
    if (options[required] === undefined) {
      throw new Error(`Missing --${required}`);
    }
  }
  return options;
}

async function loadMeshGeometry(path) {
  const source = await readFile(resolve(process.cwd(), path));
  const file = removeTextures(source);
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    ""
  );

  const geometries = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    for (const name of Object.keys(geometry.attributes)) {
      if (!["position", "normal", "color", "uv"].includes(name)) {
        geometry.deleteAttribute(name);
      }
    }
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    if (!geometry.getAttribute("uv")) {
      const count = geometry.getAttribute("position").count;
      const uv = new Float32Array(count * 2);
      for (let index = 0; index < count; index += 1) {
        uv[index * 2] = BODY_UV.u;
        uv[index * 2 + 1] = BODY_UV.v;
      }
      geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    }
    if (!geometry.getAttribute("color")) {
      const count = geometry.getAttribute("position").count;
      const colors = new Float32Array(count * 3).fill(1);
      geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    }
    if (!geometry.index) {
      const count = geometry.getAttribute("position").count;
      geometry.setIndex(
        new Uint32BufferAttribute(
          Array.from({ length: count }, (_, index) => index),
          1
        )
      );
    }
    geometries.push(geometry);
  });

  if (geometries.length === 0) {
    throw new Error(`No mesh found in ${path}`);
  }
  const merged =
    geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
  if (!merged) throw new Error(`Could not merge meshes in ${path}`);
  return merged;
}

function normalizeGeometry(geometry, { height, yaw }) {
  if (yaw) geometry.rotateY((yaw * Math.PI) / 180);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const currentHeight = box.max.y - box.min.y;
  if (!(currentHeight > 0)) {
    throw new Error("Input mesh has no vertical extent");
  }
  const scale = height / currentHeight;
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  const scaled = geometry.boundingBox;
  geometry.translate(
    -(scaled.min.x + scaled.max.x) / 2,
    -scaled.min.y,
    -(scaled.min.z + scaled.max.z) / 2
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function countTriangles(geometry) {
  const index = geometry.getIndex();
  return (index ? index.count : geometry.getAttribute("position").count) / 3;
}

const options = readOptions(process.argv.slice(2));
const geometry = normalizeGeometry(await loadMeshGeometry(options.input), {
  height: Number(options.height),
  yaw: Number(options.yaw)
});

const triangleCount = countTriangles(geometry);
if (triangleCount > MAX_TRIANGLES) {
  throw new Error(
    `Input mesh has ${triangleCount} triangles; decimate below ${MAX_TRIANGLES} before rigging`
  );
}

const rig = createHumanoidRig(Number(options.height));
const skinReport = applyAutoSkinWeights(
  geometry,
  Number(options.height),
  rig.boneIndices,
  { garment: options.garment }
);
geometry.name = `${options.identity ?? "generated"}-geometry`;

const material = new MeshStandardMaterial({
  name: "smooth-toon-vertex-colors",
  color: new Color("#ffffff"),
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
  identity: options.identity ?? "generated",
  rigId: RIG_ID,
  source: "image-to-3d",
  forwardAxis: "+Z",
  feetAtY: 0,
  triangleCount
};

const scene = new Scene();
scene.name = `${options.identity ?? "generated"}-scene`;
scene.add(character);
scene.updateMatrixWorld(true);

const exporter = new GLTFExporter();
const arrayBuffer = await exporter.parseAsync(scene, {
  binary: true,
  onlyVisible: false,
  trs: true
});

let output = Buffer.from(arrayBuffer);
if (options.faceAtlas) {
  const face = JSON.parse(await readFile(resolve(options.faceAtlas), "utf8"));
  output = attachBaseColorTexture(output, createCharacterAtlas(face));
}

if (output.byteLength >= MAX_FILE_BYTES) {
  throw new Error(
    `${options.output} is ${output.byteLength} bytes; maximum is ${MAX_FILE_BYTES}`
  );
}

await writeFile(resolve(process.cwd(), options.output), output);
process.stdout.write(
  `${options.output}: ${triangleCount} triangles, ${skinReport.vertexCount} vertices, ${skinReport.unresolvedCount} fallback-weighted, ${output.byteLength} bytes\n`
);

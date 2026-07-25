import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Reads the bone hierarchy and the mesh bounds straight out of an exported GLB.
 *
 * Tests about proportion have to observe the file that ships, not the constants
 * the file was supposedly built from. Re-deriving a measurement from the same
 * numbers it is being compared against is a tautology: it passes whatever the
 * generator actually wrote.
 */

export const GLB_FILES = [
  "player-male.glb",
  "player-female.glb",
  "npc-airport-traveler.glb",
  "npc-gyukatsu-chef.glb",
  "npc-sakura-visitor.glb",
  "npc-hanabi-yukata.glb"
] as const;

export type GlbFileName = (typeof GLB_FILES)[number];

const MODEL_DIRECTORY = "public/assets/models/characters";

interface GlbNode {
  name?: string;
  children?: number[];
  translation?: [number, number, number];
}

interface GlbAccessor {
  min?: number[];
  max?: number[];
}

interface GlbDocument {
  nodes?: GlbNode[];
  accessors?: GlbAccessor[];
  meshes?: Array<{
    primitives?: Array<{ attributes?: Record<string, number> }>;
  }>;
}

export interface GlbSkeleton {
  /** World-space Y of a bone, with the sole of the figure at 0. */
  boneWorldY: (boneName: string) => number;
  /** Height of the exported mesh in its own units. */
  meshHeight: number;
  boneNames: readonly string[];
}

function readDocument(fileName: string): GlbDocument {
  const file = readFileSync(resolve(process.cwd(), MODEL_DIRECTORY, fileName));
  const jsonLength = file.readUInt32LE(12);
  return JSON.parse(
    file.toString("utf8", 20, 20 + jsonLength).trimEnd()
  ) as GlbDocument;
}

export function readGlbSkeleton(fileName: string): GlbSkeleton {
  const json = readDocument(fileName);
  const nodes = json.nodes ?? [];

  // Bones are stored as parent-local translations, so a bone's height is the
  // sum of the chain above it. Walking the tree from every root covers the
  // whole hierarchy without assuming where the skeleton is attached.
  const worldY = new Map<string, number>();
  const childOf = new Set<number>();
  for (const node of nodes) {
    for (const child of node.children ?? []) childOf.add(child);
  }
  const walk = (index: number, parentY: number) => {
    const node = nodes[index];
    if (!node) return;
    const y = parentY + (node.translation?.[1] ?? 0);
    if (node.name) worldY.set(node.name, y);
    for (const child of node.children ?? []) walk(child, y);
  };
  for (let index = 0; index < nodes.length; index += 1) {
    if (!childOf.has(index)) walk(index, 0);
  }

  const positionAccessor =
    json.meshes?.[0]?.primitives?.[0]?.attributes?.POSITION;
  const accessor =
    positionAccessor === undefined ? undefined : json.accessors?.[positionAccessor];
  const minY = accessor?.min?.[1];
  const maxY = accessor?.max?.[1];
  if (typeof minY !== "number" || typeof maxY !== "number") {
    throw new Error(`${fileName}: POSITION accessor carries no bounds`);
  }

  return {
    meshHeight: maxY - minY,
    boneNames: [...worldY.keys()],
    boneWorldY(boneName: string) {
      const value = worldY.get(boneName);
      if (value === undefined) {
        throw new Error(`${fileName}: no bone named ${boneName}`);
      }
      return value;
    }
  };
}

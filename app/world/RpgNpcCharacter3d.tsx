"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  forwardRef,
  memo,
  useImperativeHandle,
  useMemo,
  useRef,
  type RefObject
} from "react";
import { SkinnedMesh, Vector3, type Group, type Object3D } from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { NPC_CHARACTER_MODELS } from "./NpcCharacterModels";
import {
  attachRpgCharacterOutline,
  resolveRpgCharacterToonMaterial
} from "./RpgCharacterToonMaterial";
import type { NpcSpriteId } from "./NpcAssets";
import type { NpcPatrolPose } from "./NpcPatrolMotion";
import {
  NPC_CHARACTER_CAMERA_HIDE_DISTANCE,
  blocksRpgCameraSightLineWithHysteresis,
  calculateRpgCharacterCameraDistance,
  shouldRenderRpgCharacter
} from "./RpgCharacterCameraVisibility";
import {
  createRpgNpcRigAdapter,
  type RpgNpcRigAdapter
} from "./RpgNpcRigAdapter";

export interface RpgNpcCharacter3dHandle {
  applyPose: (pose: Readonly<NpcPatrolPose>) => void;
}

interface RpgNpcCharacter3dProps {
  npcId: NpcSpriteId;
  variant: number;
  /**
   * Where the player character is standing. Supplying it lets a townsperson
   * step out of the way of the camera by disappearing while they cross the
   * line of sight, which is what keeps the boom at full length in a crowd.
   */
  playerPosition?: RefObject<Vector3 | null>;
}

// Matches the level 0 distance in NPC_CHARACTER_MODEL_BUDGET. Past it a
// townsperson is a few pixels wide, the line would land under one pixel, and
// the hull would only cost a draw call and its triangles. Festival zones put
// well over a dozen people on screen at once, so this is what keeps the outline
// inside the crowd draw budget.
const NPC_OUTLINE_MAX_DISTANCE = 14;

function prepareNpcModel(source: Object3D) {
  const model = cloneSkeleton(source);
  // Collected first, then outlined: adding the hulls inside the traversal would
  // make traverse walk into the nodes it just created.
  const skinnedMeshes: SkinnedMesh[] = [];
  model.traverse((object) => {
    if (!(object instanceof SkinnedMesh)) return;
    object.material = resolveRpgCharacterToonMaterial(object.material, "npc");
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;
    skinnedMeshes.push(object);
  });
  return { model, outlines: attachRpgCharacterOutline(skinnedMeshes, "npc") };
}

const RpgNpcCharacter3dBase = forwardRef<
  RpgNpcCharacter3dHandle,
  RpgNpcCharacter3dProps
>(function RpgNpcCharacter3d({ npcId, variant, playerPosition }, forwardedRef) {
  const modelDefinition = NPC_CHARACTER_MODELS[npcId];
  const gltf = useGLTF(modelDefinition.modelAsset, false, false);
  const prepared = useMemo(() => prepareNpcModel(gltf.scene), [gltf.scene]);
  const model = prepared.model;
  const rigAdapter = useMemo<RpgNpcRigAdapter>(
    () => createRpgNpcRigAdapter(model),
    [model]
  );
  const root = useRef<Group>(null);
  const worldPosition = useRef(new Vector3());
  const wasBlockingSightLine = useRef(false);
  const modelScale = modelDefinition.visibleHeight / modelDefinition.nativeHeight;

  useImperativeHandle(
    forwardedRef,
    () => ({
      applyPose(pose) {
        const activeRoot = root.current;
        if (activeRoot) {
          activeRoot.rotation.y = pose.yaw;
          activeRoot.rotation.z =
            pose.animationKind === "walk"
              ? Math.sin(pose.stride) * 0.022
              : pose.rotation;
          const breathingScale =
            pose.animationKind === "talk"
              ? 1 + Math.sin(pose.phase * Math.PI * 2) * 0.008
              : 1;
          activeRoot.scale.set(
            modelScale,
            modelScale * breathingScale,
            modelScale
          );
        }
        rigAdapter.applyPose(pose);
      }
    }),
    [modelScale, rigAdapter]
  );

  useFrame(({ camera }) => {
    const activeRoot = root.current;
    if (!activeRoot) return;
    activeRoot.getWorldPosition(worldPosition.current);
    const cameraDistance = calculateRpgCharacterCameraDistance(
      camera.position,
      worldPosition.current,
      modelDefinition.visibleHeight
    );
    const player = playerPosition?.current;
    const blocking =
      player !== undefined && player !== null
        ? blocksRpgCameraSightLineWithHysteresis(
            camera.position,
            player,
            worldPosition.current,
            wasBlockingSightLine.current
          )
        : false;
    wasBlockingSightLine.current = blocking;
    model.visible =
      shouldRenderRpgCharacter(
        cameraDistance,
        NPC_CHARACTER_CAMERA_HIDE_DISTANCE
      ) && !blocking;
    const outlineVisible = cameraDistance <= NPC_OUTLINE_MAX_DISTANCE;
    for (const outline of prepared.outlines) {
      outline.visible = outlineVisible;
    }
  });

  return (
    <group
      ref={root}
      scale={modelScale}
      userData={{
        renderer: "rigged-toon-glb",
        identityAsset: npcId,
        role: modelDefinition.role,
        variant
      }}
    >
      <primitive object={model} />
    </group>
  );
});

useGLTF.preload(
  "/assets/models/characters/npc-airport-traveler.glb",
  false,
  false
);
useGLTF.preload("/assets/models/characters/npc-gyukatsu-chef.glb", false, false);
useGLTF.preload("/assets/models/characters/npc-hanabi-yukata.glb", false, false);
useGLTF.preload("/assets/models/characters/npc-sakura-visitor.glb", false, false);

export const RpgNpcCharacter3d = memo(RpgNpcCharacter3dBase);

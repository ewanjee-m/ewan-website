"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  forwardRef,
  memo,
  useImperativeHandle,
  useMemo,
  useRef
} from "react";
import { SkinnedMesh, Vector3, type Group, type Object3D } from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import {
  attachRpgCharacterOutline,
  resolveRpgCharacterToonMaterial
} from "./RpgCharacterToonMaterial";
import {
  PLAYER_CHARACTER_CAMERA_HIDE_DISTANCE,
  calculateRpgCharacterCameraDistance,
  shouldRenderRpgCharacter
} from "./RpgCharacterCameraVisibility";
import {
  createRpgCharacterRigAdapter,
  type RpgCharacterRigAdapter
} from "./RpgCharacterRigAdapter";
import type { RpgCharacterMotion3dPose } from "./RpgCharacterMotion3d";
import { getRpgPlayerCharacterDesign } from "./RpgPlayerCharacterDesign";
import type { SceneQualityLevel } from "./SceneQuality";
import type { PlayerCharacter } from "./WorldView";

export interface RpgPlayerCharacter3dHandle {
  applyPose: (pose: Readonly<RpgCharacterMotion3dPose>) => void;
}

interface RpgPlayerCharacter3dProps {
  character: PlayerCharacter;
  guideActive: boolean;
  qualityLevel: SceneQualityLevel;
}

function prepareCharacterModel(source: Object3D) {
  const model = cloneSkeleton(source);
  // Collected first, then outlined: adding the hulls inside the traversal would
  // make traverse walk into the nodes it just created.
  const skinnedMeshes: SkinnedMesh[] = [];
  model.traverse((object) => {
    if (!(object instanceof SkinnedMesh)) return;
    object.material = resolveRpgCharacterToonMaterial(object.material, "player");
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;
    skinnedMeshes.push(object);
  });
  attachRpgCharacterOutline(skinnedMeshes, "player");
  return model;
}

function applyRootPose(
  root: Group | null,
  pose: Readonly<RpgCharacterMotion3dPose>,
  modelScale: number
) {
  if (!root) return;
  root.position.y = pose.rootY;
  root.rotation.x = pose.rootLean;
  root.rotation.y = pose.rootYaw;
  root.rotation.z = pose.rootRoll;
  root.scale.set(
    modelScale * pose.rootScaleX,
    modelScale * pose.rootScaleY,
    modelScale * pose.rootScaleZ
  );
}

const RpgPlayerCharacter3dBase = forwardRef<
  RpgPlayerCharacter3dHandle,
  RpgPlayerCharacter3dProps
>(function RpgPlayerCharacter3d(
  { character, guideActive, qualityLevel },
  forwardedRef
) {
  const design = getRpgPlayerCharacterDesign(character);
  const gltf = useGLTF(design.modelAsset, false, false);
  const model = useMemo(() => prepareCharacterModel(gltf.scene), [gltf.scene]);
  const rigAdapter = useMemo<RpgCharacterRigAdapter>(
    () => createRpgCharacterRigAdapter(model),
    [model]
  );
  const root = useRef<Group>(null);
  const worldPosition = useRef(new Vector3());
  const modelScale = design.height / design.nativeHeight;

  useImperativeHandle(
    forwardedRef,
    () => ({
      applyPose(pose) {
        applyRootPose(root.current, pose, modelScale);
        rigAdapter.applyPose(pose);
      }
    }),
    [modelScale, rigAdapter]
  );

  useFrame(({ camera }) => {
    const activeRoot = root.current;
    if (!activeRoot) return;
    activeRoot.getWorldPosition(worldPosition.current);
    model.visible = shouldRenderRpgCharacter(
      calculateRpgCharacterCameraDistance(
        camera.position,
        worldPosition.current,
        design.height
      ),
      PLAYER_CHARACTER_CAMERA_HIDE_DISTANCE
    );
  });

  return (
    <group
      ref={root}
      scale={modelScale}
      userData={{
        renderer: design.renderer,
        rigId: design.rigId,
        forwardAxis: design.forwardAxis,
        surfaceTechnique: design.surfaceTechnique,
        qualityLevel
      }}
    >
      <primitive object={model} />
      {guideActive ? (
        <pointLight
          position={[0.36, design.height * 0.56, 0.22]}
          color="#f6bd55"
          intensity={0.22}
          distance={1.1}
        />
      ) : null}
    </group>
  );
});

export const RpgPlayerCharacter3d = memo(RpgPlayerCharacter3dBase);

"use client";

import { Instance, Instances } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, type RefObject, useRef } from "react";
import type { MeshStandardMaterial } from "three";
import type { RpgRegionPresentationState } from "./RpgRegionPresentation";
import {
  RPG_COASTAL_ROCK_DETAILS,
  RPG_GYUKATSU_OUTDOOR_DETAILS,
  RPG_TOKYO_CROSSWALK_DETAILS,
  RPG_TOKYO_CROSSWALK_PAD
} from "./RpgTownDetailsLayout";
import { RPG_COASTLINE_RING_ROCKS } from "./RpgTownStreetLifeLayout";

const SHORELINE_ROCKS = [
  ...RPG_COASTAL_ROCK_DETAILS,
  ...RPG_COASTLINE_RING_ROCKS
];

export const RPG_TOWN_DETAIL_BATCH_STATS = [
  {
    id: "shoreline-rocks",
    drawUnits: 1,
    triangleCount: SHORELINE_ROCKS.length * 36
  },
  {
    id: "tokyo-crosswalk",
    drawUnits: 1,
    triangleCount: (RPG_TOKYO_CROSSWALK_DETAILS.length + 1) * 12
  },
  {
    id: "gyukatsu-furniture",
    drawUnits: 1,
    triangleCount: RPG_GYUKATSU_OUTDOOR_DETAILS.length * 9 * 12
  },
  {
    id: "gyukatsu-parasol-poles",
    drawUnits: 1,
    triangleCount: RPG_GYUKATSU_OUTDOOR_DETAILS.length * 40
  },
  {
    id: "gyukatsu-parasol-canopies",
    drawUnits: 1,
    triangleCount: RPG_GYUKATSU_OUTDOOR_DETAILS.length * 24
  }
] as const;

export const RpgTownDetails = memo(function RpgTownDetails({
  presentation
}: {
  presentation: RefObject<RpgRegionPresentationState>;
}) {
  const tokyoMaterial = useRef<MeshStandardMaterial>(null);
  const gyukatsuMaterials = useRef<Array<MeshStandardMaterial | null>>([]);
  useFrame(() => {
    const state = presentation.current;
    const tokyoOpacity =
      state.zoneWeights.tokyo * state.decorationDensity;
    const gyukatsuOpacity =
      state.zoneWeights.gyukatsu * state.decorationDensity;
    if (tokyoMaterial.current) {
      tokyoMaterial.current.opacity = tokyoOpacity;
      tokyoMaterial.current.transparent = tokyoOpacity < 0.999;
    }
    for (const material of gyukatsuMaterials.current) {
      if (!material) continue;
      material.opacity = gyukatsuOpacity;
      material.transparent = gyukatsuOpacity < 0.999;
    }
  }, -2);
  return (
    <group
      name="approved-town-concept-details"
      userData={{ blocksMovement: false }}
    >
      <Instances
        limit={SHORELINE_ROCKS.length}
        frames={1}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#ffffff" roughness={0.96} flatShading />
        {SHORELINE_ROCKS.map((rock) => (
          <Instance
            key={rock.id}
            position={rock.position}
            rotation={rock.rotation}
            scale={rock.scale}
            color={rock.color}
          />
        ))}
      </Instances>

      <Instances
        limit={RPG_TOKYO_CROSSWALK_DETAILS.length + 1}
        frames={1}
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial ref={tokyoMaterial} color="#ffffff" roughness={0.92} />
        {[RPG_TOKYO_CROSSWALK_PAD, ...RPG_TOKYO_CROSSWALK_DETAILS].map(
          (stripe) => (
            <Instance
              key={stripe.id}
              position={stripe.position}
              scale={stripe.size}
              color={stripe.color}
            />
          )
        )}
      </Instances>

      <Instances
        limit={RPG_GYUKATSU_OUTDOOR_DETAILS.length * 9}
        frames={1}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          ref={(material) => { gyukatsuMaterials.current[0] = material; }}
          color="#ffffff"
          roughness={0.88}
        />
        {RPG_GYUKATSU_OUTDOOR_DETAILS.map((detail) => (
          <group
            key={detail.id}
            position={detail.position}
            rotation={[0, detail.rotationY, 0]}
          >
            <Instance
              position={[0, 0.7, 0]}
              scale={[1.05, 0.12, 0.72]}
              color={detail.woodColor}
            />
            {[-0.34, 0.34].map((x) => (
              <Instance
                key={`table-leg-${x}`}
                position={[x, 0.34, 0]}
                scale={[0.12, 0.68, 0.12]}
                color={detail.woodColor}
              />
            ))}
            {detail.seatOffsets.map(([x, z], index) => (
              <group key={`${detail.id}-seat-${index}`} position={[x, 0, z]}>
                <Instance
                  position={[0, 0.43, 0]}
                  scale={[0.46, 0.11, 0.42]}
                  color={detail.woodColor}
                />
                <Instance
                  position={[0, 0.21, 0]}
                  scale={[0.12, 0.42, 0.12]}
                  color={detail.woodColor}
                />
              </group>
            ))}
          </group>
        ))}
      </Instances>

      <Instances
        limit={RPG_GYUKATSU_OUTDOOR_DETAILS.length}
        frames={1}
        castShadow
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, 10]} />
        <meshStandardMaterial
          ref={(material) => { gyukatsuMaterials.current[1] = material; }}
          color="#4b302c"
          roughness={0.84}
        />
        {RPG_GYUKATSU_OUTDOOR_DETAILS.map((detail) => (
          <Instance
            key={`${detail.id}-parasol-pole`}
            position={[
              detail.position[0],
              detail.position[1] + 0.96,
              detail.position[2]
            ]}
            scale={[0.045, 1.92, 0.045]}
          />
        ))}
      </Instances>

      <Instances
        limit={RPG_GYUKATSU_OUTDOOR_DETAILS.length}
        frames={1}
        castShadow
        frustumCulled={false}
      >
        <coneGeometry args={[1, 1, 12]} />
        <meshStandardMaterial
          ref={(material) => { gyukatsuMaterials.current[2] = material; }}
          color="#ffffff"
          roughness={0.9}
        />
        {RPG_GYUKATSU_OUTDOOR_DETAILS.map((detail) => (
          <Instance
            key={`${detail.id}-parasol-canopy`}
            position={[
              detail.position[0],
              detail.position[1] + 1.9,
              detail.position[2]
            ]}
            rotation={[0, detail.rotationY, 0]}
            scale={[1.22, 0.38, 1.22]}
            color={detail.parasolColor}
          />
        ))}
      </Instances>
    </group>
  );
});

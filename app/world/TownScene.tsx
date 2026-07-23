"use client";

import { useLoader } from "@react-three/fiber";
import { memo, useEffect, useMemo } from "react";
import {
  ClampToEdgeWrapping,
  DoubleSide,
  SRGBColorSpace,
  TextureLoader
} from "three";
import {
  TOWN_BACKDROP,
  TOWN_STRUCTURES,
  TOWN_SURFACES,
  type TownStructureLayout
} from "./TownSceneLayout";

function DistantBackdrop() {
  const sourceTexture = useLoader(TextureLoader, TOWN_BACKDROP.asset);
  const texture = useMemo(() => {
    const clonedTexture = sourceTexture.clone();
    clonedTexture.colorSpace = SRGBColorSpace;
    clonedTexture.wrapS = ClampToEdgeWrapping;
    clonedTexture.wrapT = ClampToEdgeWrapping;
    clonedTexture.needsUpdate = true;
    return clonedTexture;
  }, [sourceTexture]);

  useEffect(() => () => texture.dispose(), [texture]);

  const faces = [
    {
      id: "north",
      position: TOWN_BACKDROP.position,
      rotation: [0, 0, 0] as const
    },
    {
      id: "south",
      position: [0, TOWN_BACKDROP.position[1], 34] as const,
      rotation: [0, Math.PI, 0] as const
    },
    {
      id: "east",
      position: [38, TOWN_BACKDROP.position[1], 0] as const,
      rotation: [0, -Math.PI / 2, 0] as const
    },
    {
      id: "west",
      position: [-38, TOWN_BACKDROP.position[1], 0] as const,
      rotation: [0, Math.PI / 2, 0] as const
    }
  ];

  return (
    <group>
      {faces.map((face) => (
        <mesh
          key={face.id}
          position={face.position}
          rotation={face.rotation}
        >
          <planeGeometry args={[TOWN_BACKDROP.size[0], TOWN_BACKDROP.size[1]]} />
          <meshBasicMaterial
            map={texture}
            toneMapped={false}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function TownSurfaces() {
  return (
    <group>
      {TOWN_SURFACES.map((surface) => (
        <mesh
          key={surface.id}
          position={[
            surface.position[0],
            surface.position[1],
            surface.position[2]
          ]}
          receiveShadow
        >
          <boxGeometry args={[surface.size[0], surface.size[1], surface.size[2]]} />
          <meshStandardMaterial
            color={surface.color}
            roughness={surface.kind === "road" ? 0.88 : 1}
          />
        </mesh>
      ))}

      {Array.from({ length: 26 }, (_, index) => {
        const x = -25.5 + index * 2.04;
        return (
          <mesh key={`road-stone-${index}`} position={[x, 0.078, 0]} receiveShadow>
            <boxGeometry args={[1.82, 0.016, 6.35]} />
            <meshStandardMaterial
              color={index % 2 === 0 ? "#c3b7a4" : "#b9ad9a"}
              roughness={0.96}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function CorridorFacingPanel({
  z,
  depth,
  height,
  color
}: {
  z: number;
  depth: number;
  height: number;
  color: string;
}) {
  const facesPositiveZ = z < 0;
  return (
    <group
      position={[0, 0, facesPositiveZ ? depth / 2 + 0.012 : -depth / 2 - 0.012]}
      rotation={[0, facesPositiveZ ? 0 : Math.PI, 0]}
    >
      <mesh position={[0, height * 0.08, 0]}>
        <planeGeometry args={[1.35, 0.5]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.34}
          roughness={0.65}
        />
      </mesh>
      {[-0.72, 0, 0.72].map((x) => (
        <mesh key={x} position={[x, -height * 0.22, 0]}>
          <planeGeometry args={[0.42, 0.58]} />
          <meshStandardMaterial
            color="#bfe4df"
            emissive="#7db4b8"
            emissiveIntensity={0.18}
            roughness={0.35}
          />
        </mesh>
      ))}
    </group>
  );
}

function Building({ layout }: { layout: TownStructureLayout }) {
  const [width, height, depth] = layout.size;
  const shop = layout.kind === "shop";
  return (
    <group
      position={[layout.position[0], layout.position[1], layout.position[2]]}
      rotation={[0, layout.rotationY ?? 0, 0]}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={layout.color} roughness={0.82} />
      </mesh>

      {shop ? (
        <>
          <mesh position={[0, height / 2 + 0.34, 0]} castShadow>
            <coneGeometry args={[Math.max(width, depth) * 0.65, 0.72, 4]} />
            <meshStandardMaterial color="#29333d" roughness={0.94} />
          </mesh>
          <mesh
            position={[
              0,
              height * 0.04,
              layout.position[2] < 0 ? depth / 2 + 0.18 : -depth / 2 - 0.18
            ]}
            rotation={[0, layout.position[2] < 0 ? 0 : Math.PI, 0]}
            castShadow
          >
            <boxGeometry args={[width * 0.78, 0.12, 0.72]} />
            <meshStandardMaterial color={layout.accent} roughness={0.7} />
          </mesh>
        </>
      ) : (
        <mesh position={[0, height / 2 + 0.09, 0]} castShadow>
          <boxGeometry args={[width * 1.04, 0.18, depth * 1.04]} />
          <meshStandardMaterial color="#263746" roughness={0.88} />
        </mesh>
      )}

      <CorridorFacingPanel
        z={layout.position[2]}
        depth={depth}
        height={height}
        color={layout.accent}
      />
    </group>
  );
}

function AirportBus({ layout }: { layout: TownStructureLayout }) {
  const [width, height, depth] = layout.size;
  const wheelX = width * 0.31;
  return (
    <group position={[layout.position[0], layout.position[1], layout.position[2]]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height * 0.78, depth]} />
        <meshStandardMaterial color={layout.color} roughness={0.72} />
      </mesh>
      <mesh position={[0, -height * 0.08, depth / 2 + 0.012]}>
        <planeGeometry args={[width * 0.92, height * 0.18]} />
        <meshStandardMaterial color={layout.accent} roughness={0.62} />
      </mesh>
      {[-wheelX, wheelX].flatMap((x) =>
        [-1, 1].map((side) => (
          <mesh
            key={`${x}-${side}`}
            position={[x, -height * 0.42, side * (depth / 2 + 0.04)]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.29, 0.29, 0.18, 12]} />
            <meshStandardMaterial color="#25272d" roughness={0.94} />
          </mesh>
        ))
      )}
    </group>
  );
}

function SakuraTree({ layout }: { layout: TownStructureLayout }) {
  const [width, height] = layout.size;
  const trunkHeight = height * 0.53;
  const crownY = height * 0.12;
  return (
    <group position={[layout.position[0], layout.position[1], layout.position[2]]}>
      <mesh position={[0, -height / 2 + trunkHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.24, trunkHeight, 9]} />
        <meshStandardMaterial color={layout.color} roughness={1} />
      </mesh>
      {[
        [0, crownY, 0, 1],
        [-width * 0.22, crownY - 0.08, 0.05, 0.55],
        [width * 0.22, crownY + 0.04, 0.02, 0.55],
        [0.08, crownY + height * 0.18, -0.06, 0.48]
      ].map(([x, y, z, scale], index) => (
        <mesh key={index} position={[x, y, z]} scale={scale} castShadow>
          <sphereGeometry args={[width * 0.46, 12, 8]} />
          <meshStandardMaterial
            color={index % 2 === 0 ? layout.accent : "#ffd0df"}
            roughness={0.93}
          />
        </mesh>
      ))}
    </group>
  );
}

function Canal({ layout }: { layout: TownStructureLayout }) {
  const [width, height, depth] = layout.size;
  return (
    <group position={[layout.position[0], layout.position[1], layout.position[2]]}>
      <mesh receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color={layout.color}
          emissive="#18566d"
          emissiveIntensity={0.12}
          metalness={0.18}
          roughness={0.22}
          transparent
          opacity={0.92}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (width / 2 + 0.14), 0.06, 0]} receiveShadow>
          <boxGeometry args={[0.24, 0.14, depth]} />
          <meshStandardMaterial color="#78736b" roughness={0.96} />
        </mesh>
      ))}
    </group>
  );
}

function Bridge({ layout }: { layout: TownStructureLayout }) {
  const [width, height, depth] = layout.size;
  return (
    <group position={[layout.position[0], layout.position[1], layout.position[2]]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={layout.color} roughness={0.78} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[0, 0.37, side * (depth / 2 - 0.08)]}>
          <mesh castShadow>
            <boxGeometry args={[width, 0.12, 0.1]} />
            <meshStandardMaterial color={layout.accent} roughness={0.75} />
          </mesh>
          {[-0.42, 0, 0.42].map((ratio) => (
            <mesh key={ratio} position={[ratio * width, -0.18, 0]} castShadow>
              <boxGeometry args={[0.1, 0.48, 0.1]} />
              <meshStandardMaterial color={layout.accent} roughness={0.78} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function FestivalStall({ layout }: { layout: TownStructureLayout }) {
  const [width, height, depth] = layout.size;
  return (
    <group position={[layout.position[0], layout.position[1], layout.position[2]]}>
      <mesh position={[0, -height * 0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height * 0.72, depth]} />
        <meshStandardMaterial color={layout.color} roughness={0.88} />
      </mesh>
      <mesh position={[0, height * 0.42, 0]} castShadow>
        <coneGeometry args={[Math.max(width, depth) * 0.7, 0.62, 4]} />
        <meshStandardMaterial color={layout.accent} roughness={0.8} />
      </mesh>
      <mesh position={[0, height * 0.02, layout.position[2] < 0 ? depth / 2 + 0.02 : -depth / 2 - 0.02]}>
        <planeGeometry args={[width * 0.72, 0.46]} />
        <meshStandardMaterial
          color="#fff1ce"
          emissive={layout.accent}
          emissiveIntensity={0.18}
        />
      </mesh>
    </group>
  );
}

function FestivalLantern({ layout }: { layout: TownStructureLayout }) {
  const height = layout.size[1];
  return (
    <group position={[layout.position[0], layout.position[1], layout.position[2]]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.055, 0.07, height, 8]} />
        <meshStandardMaterial color={layout.color} roughness={0.9} />
      </mesh>
      <mesh position={[0, height * 0.25, 0]} castShadow>
        <sphereGeometry args={[0.28, 10, 7]} />
        <meshStandardMaterial
          color={layout.accent}
          emissive={layout.accent}
          emissiveIntensity={1.15}
          roughness={0.48}
        />
      </mesh>
    </group>
  );
}

function TownStructure({ layout }: { layout: TownStructureLayout }) {
  switch (layout.kind) {
    case "building":
    case "shop":
      return <Building layout={layout} />;
    case "bus":
      return <AirportBus layout={layout} />;
    case "tree":
      return <SakuraTree layout={layout} />;
    case "canal":
      return <Canal layout={layout} />;
    case "bridge":
      return <Bridge layout={layout} />;
    case "stall":
      return <FestivalStall layout={layout} />;
    case "lantern":
      return <FestivalLantern layout={layout} />;
    case "hanabi":
      return null;
  }
}

export const TownScene = memo(function TownScene() {
  return (
    <>
      <fog attach="fog" args={["#a5b5bf", 26, 66]} />
      <pointLight position={[21, 4.8, 0]} color="#ff8b66" intensity={10} distance={16} />

      <DistantBackdrop />
      <TownSurfaces />
      {TOWN_STRUCTURES.map((layout) => (
        <TownStructure key={layout.id} layout={layout} />
      ))}
    </>
  );
});

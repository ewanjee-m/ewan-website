"use client";

import { useFrame } from "@react-three/fiber";
import * as React from "react";
import * as THREE from "three";
import {
  createGyukatsuInteraction,
  createGyukatsuSnapshot
} from "./GyukatsuInteraction";
import {
  AIRPORT_CROSSWALK_TRACK_ANGLE,
  WORLD_PATH_WIDTH,
  WORLD_RADIUS
} from "./WorldSafety";
import type { SceneQualityLevel } from "./SceneQuality";
import { isZoneDetailed } from "./ZoneDetail";
import { TOKYO_BUILDING_LAYOUT } from "./WorldSceneLayout";

const PATH_WIDTH = WORLD_PATH_WIDTH;

export const HANABI_RIVER_LAYOUT = {
  waterCenterX: 5.35,
  waterWidth: 2.3,
  waterLength: 8,
  railCenterX: 3.95,
  railLength: 8.2
} as const;

type Position = [number, number, number];

const DISTANT_TOWN_BUILDINGS = [
  {
    x: -3.95,
    z: -0.8,
    width: 1.18,
    height: 1.14,
    depth: 0.82,
    wall: "#20394a",
    roof: "#293f4b"
  },
  {
    x: -2.62,
    z: 0.1,
    width: 0.94,
    height: 1.62,
    depth: 0.72,
    wall: "#193144",
    roof: "#304654"
  },
  {
    x: -3.68,
    z: 1.02,
    width: 1.3,
    height: 0.86,
    depth: 0.9,
    wall: "#28404b",
    roof: "#354a52"
  },
  {
    x: 2.58,
    z: -0.42,
    width: 0.96,
    height: 1.02,
    depth: 0.76,
    wall: "#203746",
    roof: "#2d4350"
  },
  {
    x: 3.62,
    z: 0.34,
    width: 1.24,
    height: 1.48,
    depth: 0.88,
    wall: "#1a3141",
    roof: "#304753"
  },
  {
    x: 4.34,
    z: -0.92,
    width: 0.9,
    height: 0.82,
    depth: 0.7,
    wall: "#29414a",
    roof: "#3a4c51"
  }
] as const;

const DISTANT_TOWN_WINDOW_BUILDINGS = [0, 1, 3, 4, 5] as const;

function DistantTownSilhouette({ mirrored }: { mirrored: boolean }) {
  const walls = React.useRef<THREE.InstancedMesh>(null);
  const roofs = React.useRef<THREE.InstancedMesh>(null);
  const windows = React.useRef<THREE.InstancedMesh>(null);

  React.useLayoutEffect(() => {
    const wallMesh = walls.current;
    const roofMesh = roofs.current;
    const windowMesh = windows.current;
    if (!wallMesh || !roofMesh || !windowMesh) {
      return;
    }

    const dummy = new THREE.Object3D();
    DISTANT_TOWN_BUILDINGS.forEach((building, index) => {
      const x = mirrored ? -building.x : building.x;
      dummy.position.set(x, building.height / 2, building.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(building.width, building.height, building.depth);
      dummy.updateMatrix();
      wallMesh.setMatrixAt(index, dummy.matrix);
      wallMesh.setColorAt(index, new THREE.Color(building.wall));

      ([-1, 1] as const).forEach((side, panelIndex) => {
        dummy.position.set(
          x + side * building.width * 0.27,
          building.height + 0.13,
          building.z
        );
        dummy.rotation.set(0, 0, -side * 0.34);
        dummy.scale.set(
          building.width * 0.6,
          0.09,
          building.depth * 1.24
        );
        dummy.updateMatrix();
        const roofIndex = index * 2 + panelIndex;
        roofMesh.setMatrixAt(roofIndex, dummy.matrix);
        roofMesh.setColorAt(roofIndex, new THREE.Color(building.roof));
      });
    });

    DISTANT_TOWN_WINDOW_BUILDINGS.forEach((buildingIndex, index) => {
      const building = DISTANT_TOWN_BUILDINGS[buildingIndex];
      const x = mirrored ? -building.x : building.x;
      ([-1, 1] as const).forEach((face, faceIndex) => {
        dummy.position.set(
          x,
          building.height * 0.46,
          building.z + face * (building.depth / 2 + 0.025)
        );
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(Math.min(0.26, building.width * 0.28), 0.2, 0.04);
        dummy.updateMatrix();
        windowMesh.setMatrixAt(index * 2 + faceIndex, dummy.matrix);
      });
    });

    [wallMesh, roofMesh, windowMesh].forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
      mesh.computeBoundingSphere();
    });
  }, [mirrored]);

  return (
    <group position={[0, 0.02, 0]}>
      <instancedMesh
        ref={walls}
        args={[undefined, undefined, DISTANT_TOWN_BUILDINGS.length]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={roofs}
        args={[undefined, undefined, DISTANT_TOWN_BUILDINGS.length * 2]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={windows}
        args={[
          undefined,
          undefined,
          DISTANT_TOWN_WINDOW_BUILDINGS.length * 2
        ]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color="#ffd08a"
          emissive="#e8894d"
          emissiveIntensity={0.72}
          roughness={0.82}
        />
      </instancedMesh>
    </group>
  );
}

function ContinuousWorldPath() {
  const geometry = React.useMemo(() => {
    const segments = 192;
    const halfAngle = PATH_WIDTH / 2 / WORLD_RADIUS;
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      for (const side of [-1, 1]) {
        const widthAngle = halfAngle * side;
        const normal = new THREE.Vector3(
          Math.sin(widthAngle),
          Math.cos(widthAngle) * Math.cos(angle),
          -Math.cos(widthAngle) * Math.sin(angle)
        ).normalize();
        const point = normal.clone().multiplyScalar(WORLD_RADIUS + 0.035);
        positions.push(point.x, point.y, point.z);
        normals.push(normal.x, normal.y, normal.z);
      }
    }

    for (let segment = 0; segment < segments; segment += 1) {
      const base = segment * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }

    const pathGeometry = new THREE.BufferGeometry();
    pathGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    pathGeometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3)
    );
    pathGeometry.setIndex(indices);
    pathGeometry.computeBoundingSphere();
    return pathGeometry;
  }, []);

  React.useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#625766" roughness={1} flatShading />
    </mesh>
  );
}

function SurfaceAnchor({
  angle,
  playerPosition,
  qualityLevel,
  showSilhouette = true,
  children
}: {
  angle: number;
  playerPosition: React.RefObject<THREE.Vector3>;
  qualityLevel: SceneQualityLevel;
  showSilhouette?: boolean;
  children: React.ReactNode;
}) {
  const detail = React.useRef<THREE.Group>(null);
  const silhouette = React.useRef<THREE.Group>(null);
  const transform = React.useMemo(() => {
    const normal = new THREE.Vector3(
      0,
      Math.cos(angle),
      -Math.sin(angle)
    );
    return {
      position: normal.multiplyScalar(WORLD_RADIUS + 0.025),
      quaternion: new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        -angle
      )
    };
  }, [angle]);
  const initiallyDetailed = isZoneDetailed(
    { x: 0, y: WORLD_RADIUS, z: 0 },
    angle,
    qualityLevel
  );

  useFrame(() => {
    if (playerPosition.current) {
      const detailed = isZoneDetailed(
        playerPosition.current,
        angle,
        qualityLevel
      );
      if (detail.current) {
        detail.current.visible = detailed;
      }
      if (silhouette.current) {
        silhouette.current.visible = !detailed;
      }
    }
  });

  return (
    <group
      position={transform.position}
      quaternion={transform.quaternion}
    >
      <group ref={detail} visible={initiallyDetailed}>
        {children}
      </group>
      {showSilhouette ? (
        <group ref={silhouette} visible={!initiallyDetailed}>
          <DistantTownSilhouette
            mirrored={Math.round(angle / (Math.PI / 3)) % 2 !== 0}
          />
        </group>
      ) : null}
    </group>
  );
}

function PathSegment({ color = "#51485b" }: { color?: string }) {
  return (
    <mesh position={[0, 0.035, 0]} receiveShadow>
      <boxGeometry args={[PATH_WIDTH, 0.07, 5.5]} />
      <meshStandardMaterial color={color} roughness={1} flatShading />
    </mesh>
  );
}

function AirportCrosswalk() {
  return (
    <group position={[-1.3, 0.06, 0]}>
      {[-0.84, -0.42, 0, 0.42, 0.84].map((z) => (
        <mesh key={z} position={[0, 0, z]} receiveShadow>
          <boxGeometry args={[3.5, 0.045, 0.22]} />
          <meshStandardMaterial color="#eee8dc" roughness={0.94} />
        </mesh>
      ))}
    </group>
  );
}

function Lantern({ position }: { position: Position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.72, 0]}>
        <cylinderGeometry args={[0.045, 0.06, 1.44, 6]} />
        <meshStandardMaterial color="#3f2927" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 1.46, 0]}>
        <cylinderGeometry args={[0.2, 0.17, 0.42, 8]} />
        <meshStandardMaterial
          color="#ff9a67"
          emissive="#e85c3d"
          emissiveIntensity={1.25}
          roughness={0.78}
          flatShading
        />
      </mesh>
    </group>
  );
}

function LowPolyNpc({
  position,
  body = "#315b68",
  accent = "#e97772",
  rotation = 0
}: {
  position: Position;
  body?: string;
  accent?: string;
  rotation?: number;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.78, 0]}>
        <coneGeometry args={[0.32, 1.15, 7]} />
        <meshStandardMaterial color={body} roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0, 1.52, 0]}>
        <sphereGeometry args={[0.27, 8, 6]} />
        <meshStandardMaterial color="#e7b091" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0, 1.7, -0.04]} scale={[1.05, 0.55, 1.02]}>
        <sphereGeometry args={[0.28, 8, 5]} />
        <meshStandardMaterial color="#202735" roughness={1} flatShading />
      </mesh>
      <mesh position={[0.25, 0.98, 0]} rotation={[0, 0, -0.18]}>
        <boxGeometry args={[0.09, 0.52, 0.12]} />
        <meshStandardMaterial color={accent} roughness={0.9} flatShading />
      </mesh>
    </group>
  );
}

function CherryTree({
  position,
  scale = 1,
  lean = 0
}: {
  position: Position;
  scale?: number;
  lean?: number;
}) {
  return (
    <group position={position} scale={scale} rotation={[0, 0, lean]}>
      <mesh position={[0, 1.15, 0]}>
        <cylinderGeometry args={[0.18, 0.28, 2.3, 7]} />
        <meshStandardMaterial color="#55362f" roughness={1} flatShading />
      </mesh>
      {[
        [-0.48, 2.38, 0.05],
        [0.42, 2.58, -0.08],
        [0.05, 2.9, 0.18]
      ].map(([x, y, z]) => (
        <mesh key={`${x}-${y}-${z}`} position={[x, y, z]}>
          <icosahedronGeometry args={[0.72, 1]} />
          <meshStandardMaterial color="#efa0ba" roughness={0.95} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function AbstractBuilding({
  position,
  size,
  color,
  signColor
}: {
  position: Position;
  size: Position;
  color: string;
  signColor: string;
}) {
  return (
    <group position={position}>
      <mesh position={[0, size[1] / 2, 0]}>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.92} flatShading />
      </mesh>
      <mesh position={[0, size[1] + 0.06, 0]}>
        <boxGeometry args={[size[0] * 1.1, 0.14, size[2] * 1.1]} />
        <meshStandardMaterial color="#263643" roughness={0.98} flatShading />
      </mesh>
      <mesh position={[0, size[1] * 0.58, size[2] / 2 + 0.035]}>
        <boxGeometry args={[size[0] * 0.58, 0.38, 0.07]} />
        <meshStandardMaterial
          color={signColor}
          emissive={signColor}
          emissiveIntensity={0.75}
          roughness={0.65}
        />
      </mesh>
      {[-0.28, 0.28].map((offset) => (
        <mesh
          key={offset}
          position={[
            offset * size[0],
            size[1] * 0.3,
            size[2] / 2 + 0.04
          ]}
        >
          <boxGeometry args={[0.28, 0.34, 0.08]} />
          <meshStandardMaterial
            color="#f0c87a"
            emissive="#df8b4c"
            emissiveIntensity={0.45}
          />
        </mesh>
      ))}
      {([-1, 1] as const).flatMap((side) =>
        [0.3, 0.68].map((heightRatio) => (
          <mesh
            key={`${side}-${heightRatio}`}
            position={[
              side * (size[0] / 2 + 0.04),
              size[1] * heightRatio,
              0
            ]}
          >
            <boxGeometry args={[0.08, 0.28, size[2] * 0.34]} />
            <meshStandardMaterial
              color="#e8c58b"
              emissive="#d27c4d"
              emissiveIntensity={0.28}
              roughness={0.8}
            />
          </mesh>
        ))
      )}
    </group>
  );
}

function AirportStop() {
  return (
    <>
      <PathSegment color="#64616b" />
      <group position={[-3.25, 0, 0.2]}>
        {[-0.9, 0.9].map((x) => (
          <mesh key={x} position={[x, 1.05, -0.25]}>
            <cylinderGeometry args={[0.07, 0.09, 2.1, 6]} />
            <meshStandardMaterial color="#233b59" roughness={0.85} />
          </mesh>
        ))}
        <mesh position={[0, 2.16, -0.25]}>
          <boxGeometry args={[2.55, 0.18, 1.3]} />
          <meshStandardMaterial color="#e7ded1" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[0, 0.45, -0.18]}>
          <boxGeometry args={[1.7, 0.18, 0.55]} />
          <meshStandardMaterial color="#b65d4f" roughness={0.92} flatShading />
        </mesh>
        <mesh position={[-1.35, 1.45, -0.22]}>
          <cylinderGeometry args={[0.42, 0.42, 0.1, 12]} />
          <meshStandardMaterial
            color="#e7b855"
            emissive="#a96d26"
            emissiveIntensity={0.35}
            flatShading
          />
        </mesh>
        <mesh position={[-0.58, 0.32, 0.65]}>
          <boxGeometry args={[0.42, 0.62, 0.34]} />
          <meshStandardMaterial color="#d68a5f" roughness={1} flatShading />
        </mesh>
        <mesh position={[0.55, 0.26, 0.68]}>
          <boxGeometry args={[0.5, 0.5, 0.38]} />
          <meshStandardMaterial color="#38566c" roughness={1} flatShading />
        </mesh>
      </group>
      <LowPolyNpc position={[3, 0, -1.45]} body="#884d61" accent="#e9b85c" />
      <LowPolyNpc position={[2.45, 0, 1.3]} body="#355c64" accent="#db756d" rotation={0.5} />
    </>
  );
}

function TokyoDistrict() {
  return (
    <>
      <PathSegment color="#4a4d57" />
      {TOKYO_BUILDING_LAYOUT.map((building) => (
        <AbstractBuilding
          key={building.id}
          position={[building.x, 0, building.z]}
          size={[building.width, building.height, building.depth]}
          color={building.color}
          signColor={building.signColor}
        />
      ))}
      <LowPolyNpc position={[-2.05, 0, 1.55]} body="#78506b" />
      <LowPolyNpc position={[2.05, 0, -1.6]} body="#315968" accent="#ef9b62" />
    </>
  );
}

const GYUKATSU_PIECES: Position[] = Array.from({ length: 6 }, (_, index) => [
  (index % 3) * 0.38 - 0.38,
  1.18,
  Math.floor(index / 3) * 0.34 - 0.08
]);

function isVisibleInHierarchy(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

function GyukatsuLandmark({
  playerPosition
}: {
  playerPosition: React.RefObject<THREE.Vector3>;
}) {
  const interactionPoint = React.useRef<THREE.Group>(null);
  const steam = React.useRef<THREE.Group>(null);
  const brazierMaterial = React.useRef<THREE.MeshStandardMaterial>(null);
  const staff = React.useRef<THREE.Group>(null);
  const interaction = React.useRef(createGyukatsuInteraction());
  const interactionSnapshot = React.useRef(createGyukatsuSnapshot());
  const shopWorldPosition = React.useMemo(() => new THREE.Vector3(), []);
  const greetingStart = React.useRef<number | null>(null);

  useFrame(({ clock }, delta) => {
    const point = interactionPoint.current;
    if (!point) {
      return;
    }
    if (!isVisibleInHierarchy(point)) {
      if (steam.current) {
        steam.current.visible = false;
      }
      return;
    }

    point.getWorldPosition(shopWorldPosition);
    const player = playerPosition.current;
    const distance = player
      ? player.distanceTo(shopWorldPosition)
      : Number.MAX_SAFE_INTEGER;
    const snapshot = interaction.current.observeInto(
      distance,
      interactionSnapshot.current
    );

    if (snapshot.greetingTriggered) {
      greetingStart.current = clock.elapsedTime;
    }

    const steamGroup = steam.current;
    if (steamGroup) {
      steamGroup.visible = snapshot.active;
      if (snapshot.active) {
        const children = steamGroup.children;
        for (let index = 0; index < children.length; index += 1) {
          const child = children[index];
          const phase = clock.elapsedTime * 1.8 + index * 1.7;
          child.position.y = 1.34 + ((phase * 0.22) % 0.7);
          child.position.x =
            (index - 1) * 0.22 + Math.sin(phase) * 0.06;
          const scale = 0.75 + Math.sin(phase * 0.8) * 0.12;
          child.scale.setScalar(scale);
        }
      }
    }

    if (brazierMaterial.current) {
      const targetGlow = snapshot.active ? 1.7 : 0.15;
      brazierMaterial.current.emissiveIntensity = THREE.MathUtils.lerp(
        brazierMaterial.current.emissiveIntensity,
        targetGlow,
        1 - Math.exp(-delta * 8)
      );
    }

    if (staff.current) {
      const startedAt = greetingStart.current;
      if (startedAt === null) {
        staff.current.rotation.x = 0;
      } else {
        const greetingProgress = (clock.elapsedTime - startedAt) / 0.9;
        if (greetingProgress >= 1) {
          staff.current.rotation.x = 0;
          greetingStart.current = null;
        } else {
          staff.current.rotation.x =
            Math.sin(greetingProgress * Math.PI) * 0.42;
        }
      }
    }
  });

  return (
    <>
      <PathSegment color="#5c4c52" />
      <group ref={interactionPoint} position={[3.35, 0, 0]}>
        <mesh position={[0, 1.35, -1.22]}>
          <boxGeometry args={[3.15, 2.7, 0.28]} />
          <meshStandardMaterial color="#6b4033" roughness={1} flatShading />
        </mesh>
        <mesh position={[0, 2.4, -0.94]} rotation={[0.16, 0, 0]}>
          <boxGeometry args={[3.45, 0.18, 1.12]} />
          <meshStandardMaterial color="#d67261" roughness={0.95} flatShading />
        </mesh>
        <mesh position={[0, 0.82, 0]}>
          <boxGeometry args={[3, 0.18, 1.25]} />
          <meshStandardMaterial color="#46332e" roughness={1} flatShading />
        </mesh>
        <mesh position={[0, 1.02, 0.08]}>
          <boxGeometry args={[1.55, 0.08, 0.9]} />
          <meshStandardMaterial color="#292529" roughness={0.98} flatShading />
        </mesh>

        {GYUKATSU_PIECES.map(([x, y, z], index) => (
          <group key={index} position={[x, y, z]} rotation={[0, -0.14, 0]}>
            <mesh>
              <boxGeometry args={[0.3, 0.18, 0.25]} />
              <meshStandardMaterial color="#b96c35" roughness={1} flatShading />
            </mesh>
            <mesh position={[0, 0.015, 0.13]}>
              <boxGeometry args={[0.22, 0.11, 0.035]} />
              <meshStandardMaterial color="#d98778" roughness={0.9} flatShading />
            </mesh>
          </group>
        ))}

        <group position={[-0.92, 1.13, 0.18]}>
          <mesh>
            <cylinderGeometry args={[0.28, 0.2, 0.24, 10]} />
            <meshStandardMaterial color="#eee3d4" roughness={0.92} flatShading />
          </mesh>
          <mesh position={[0, 0.13, 0]} scale={[1, 0.52, 1]}>
            <sphereGeometry args={[0.22, 10, 6]} />
            <meshStandardMaterial color="#fff4dc" roughness={1} flatShading />
          </mesh>
        </group>

        <group position={[-0.92, 1.14, -0.3]}>
          {[-0.16, 0, 0.16].map((x, index) => (
            <mesh key={x} position={[x, (index % 2) * 0.05, 0]}>
              <icosahedronGeometry args={[0.16, 0]} />
              <meshStandardMaterial color="#a8bd68" roughness={1} flatShading />
            </mesh>
          ))}
        </group>

        <group position={[0.94, 1.08, 0.12]}>
          <mesh>
            <cylinderGeometry args={[0.36, 0.42, 0.24, 6]} />
            <meshStandardMaterial color="#3b3230" roughness={0.95} flatShading />
          </mesh>
          <mesh position={[0, 0.14, 0]}>
            <cylinderGeometry args={[0.27, 0.3, 0.08, 6]} />
            <meshStandardMaterial
              ref={brazierMaterial}
              color="#ef8b45"
              emissive="#ff742e"
              emissiveIntensity={0.15}
              roughness={0.72}
              flatShading
            />
          </mesh>
        </group>

        <group ref={steam} visible={false}>
          {[-1, 0, 1].map((offset) => (
            <mesh key={offset} position={[offset * 0.22, 1.34, 0.02]}>
              <sphereGeometry args={[0.13, 7, 5]} />
              <meshStandardMaterial
                color="#fff2df"
                transparent
                opacity={0.52}
                depthWrite={false}
                flatShading
              />
            </mesh>
          ))}
        </group>

        <group ref={staff} position={[0, 1.28, -1.02]}>
          <mesh position={[0, 0.05, 0]}>
            <coneGeometry args={[0.36, 0.95, 7]} />
            <meshStandardMaterial color="#263f55" roughness={1} flatShading />
          </mesh>
          <mesh position={[0, 0.72, 0]}>
            <sphereGeometry args={[0.26, 8, 6]} />
            <meshStandardMaterial color="#e7b090" roughness={0.9} flatShading />
          </mesh>
          <mesh position={[0, 0.87, -0.03]} scale={[1.04, 0.52, 1]}>
            <sphereGeometry args={[0.27, 8, 5]} />
            <meshStandardMaterial color="#252330" roughness={1} flatShading />
          </mesh>
        </group>
      </group>
      <Lantern position={[-2.15, 0, -1.7]} />
    </>
  );
}

function SakuraCanal() {
  return (
    <>
      <PathSegment color="#756670" />
      <mesh position={[3.35, 0.04, 0]}>
        <boxGeometry args={[1.25, 0.08, 5.6]} />
        <meshStandardMaterial
          color="#3f7b87"
          emissive="#315a71"
          emissiveIntensity={0.45}
          roughness={0.42}
          transparent
          opacity={0.9}
        />
      </mesh>
      {[-2.2, 2.2].map((z) => (
        <React.Fragment key={z}>
          <mesh position={[2.68, 0.38, z]}>
            <boxGeometry args={[0.1, 0.7, 0.1]} />
            <meshStandardMaterial color="#473633" roughness={1} />
          </mesh>
          <mesh position={[4.02, 0.38, z]}>
            <boxGeometry args={[0.1, 0.7, 0.1]} />
            <meshStandardMaterial color="#473633" roughness={1} />
          </mesh>
        </React.Fragment>
      ))}
      <mesh position={[3.35, 0.68, 0]}>
        <boxGeometry args={[1.5, 0.09, 0.38]} />
        <meshStandardMaterial color="#8b5d50" roughness={1} flatShading />
      </mesh>
      <CherryTree position={[-3.2, 0, -1.75]} scale={0.9} lean={0.08} />
      <CherryTree position={[-3.55, 0, 1.55]} scale={1.05} lean={-0.1} />
      <CherryTree position={[4.65, 0, -1.6]} scale={0.82} lean={0.12} />
      <Lantern position={[-1.9, 0, -1.8]} />
      <Lantern position={[-1.9, 0, 1.8]} />
      <LowPolyNpc position={[2.15, 0, 1.7]} body="#78556f" accent="#f0b562" />
    </>
  );
}

function MarketStall({
  position,
  color
}: {
  position: Position;
  color: string;
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[1.75, 1.4, 1.2]} />
        <meshStandardMaterial color="#66463c" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 1.58, 0]} rotation={[0, 0, 0.03]}>
        <boxGeometry args={[2.05, 0.18, 1.5]} />
        <meshStandardMaterial color={color} roughness={0.92} flatShading />
      </mesh>
      <mesh position={[0, 1.02, 0.64]}>
        <boxGeometry args={[1.35, 0.08, 0.12]} />
        <meshStandardMaterial
          color="#f0c46b"
          emissive="#d36d42"
          emissiveIntensity={0.4}
        />
      </mesh>
    </group>
  );
}

function HanabiFestival() {
  return (
    <>
      <PathSegment color="#5e5365" />
      <mesh
        position={[HANABI_RIVER_LAYOUT.waterCenterX, 0.035, 0]}
        receiveShadow
      >
        <boxGeometry
          args={[
            HANABI_RIVER_LAYOUT.waterWidth,
            0.07,
            HANABI_RIVER_LAYOUT.waterLength
          ]}
        />
        <meshStandardMaterial
          color="#214d63"
          emissive="#17394f"
          emissiveIntensity={0.72}
          roughness={0.28}
          metalness={0.08}
        />
      </mesh>
      <mesh position={[3.68, 0.025, 0]} receiveShadow>
        <boxGeometry args={[0.42, 0.05, HANABI_RIVER_LAYOUT.railLength]} />
        <meshStandardMaterial color="#6c5a59" roughness={0.96} flatShading />
      </mesh>
      <mesh position={[HANABI_RIVER_LAYOUT.railCenterX, 0.61, 0]}>
        <boxGeometry args={[0.1, 0.11, HANABI_RIVER_LAYOUT.railLength]} />
        <meshStandardMaterial color="#453c46" roughness={0.92} flatShading />
      </mesh>
      {[-3.9, -2.6, -1.3, 0, 1.3, 2.6, 3.9].map((z) => (
        <mesh
          key={`hanabi-river-rail-${z}`}
          position={[HANABI_RIVER_LAYOUT.railCenterX, 0.34, z]}
        >
          <boxGeometry args={[0.11, 0.62, 0.11]} />
          <meshStandardMaterial color="#453c46" roughness={0.92} flatShading />
        </mesh>
      ))}
      <MarketStall position={[-3.4, 0, -1.35]} color="#bd514d" />
      <MarketStall position={[3.45, 0, -1.1]} color="#4d8b82" />
      <MarketStall position={[-3.25, 0, 1.65]} color="#d57b65" />
      <Lantern position={[-1.85, 0, -2]} />
      <Lantern position={[1.85, 0, -2]} />
      <Lantern position={[-1.85, 0, 2]} />
      <Lantern position={[1.85, 0, 2]} />
      <LowPolyNpc position={[2.2, 0, 1.65]} body="#8b5068" accent="#f0b35a" />
      <LowPolyNpc position={[3.05, 0, 1.8]} body="#315d69" accent="#e47872" rotation={-0.4} />
      <LowPolyNpc position={[-2.15, 0, -2.05]} body="#6b546f" accent="#d8ad57" rotation={0.35} />
      <LowPolyNpc position={[-4.3, 0, 1.6]} body="#3d6670" accent="#f09a72" rotation={-0.3} />
    </>
  );
}

function ReturnHill() {
  return (
    <>
      <PathSegment color="#5e6259" />
      <group position={[-3.35, 0, -0.4]}>
        <mesh position={[0, 0.85, 0]} scale={[1.5, 1, 1.25]}>
          <icosahedronGeometry args={[1.35, 1]} />
          <meshStandardMaterial color="#4f6755" roughness={1} flatShading />
        </mesh>
        <mesh position={[-0.65, 1.65, 0.15]} scale={[0.8, 0.65, 0.8]}>
          <icosahedronGeometry args={[0.72, 0]} />
          <meshStandardMaterial color="#71806a" roughness={1} flatShading />
        </mesh>
      </group>
      <group position={[3.45, 0, 0.55]}>
        <mesh position={[0, 0.72, 0]} scale={[1.7, 0.9, 1.4]}>
          <icosahedronGeometry args={[1.25, 1]} />
          <meshStandardMaterial color="#566957" roughness={1} flatShading />
        </mesh>
        <CherryTree position={[0.2, 0.42, -0.15]} scale={0.68} lean={-0.08} />
      </group>
      <Lantern position={[-1.9, 0, -1.8]} />
      <Lantern position={[1.9, 0, 1.8]} />
      <LowPolyNpc position={[2.1, 0, -1.6]} body="#756070" accent="#e99c68" />
    </>
  );
}

export function WorldLandmarks({
  playerPosition,
  qualityLevel
}: {
  playerPosition: React.RefObject<THREE.Vector3>;
  qualityLevel: SceneQualityLevel;
}) {
  return (
    <group>
      <ContinuousWorldPath />
      <SurfaceAnchor
        angle={AIRPORT_CROSSWALK_TRACK_ANGLE}
        playerPosition={playerPosition}
        qualityLevel={qualityLevel}
        showSilhouette={false}
      >
        <AirportCrosswalk />
      </SurfaceAnchor>
      <SurfaceAnchor angle={0} playerPosition={playerPosition} qualityLevel={qualityLevel}>
        <AirportStop />
      </SurfaceAnchor>
      <SurfaceAnchor angle={Math.PI / 3} playerPosition={playerPosition} qualityLevel={qualityLevel}>
        <TokyoDistrict />
      </SurfaceAnchor>
      <SurfaceAnchor angle={(Math.PI * 2) / 3} playerPosition={playerPosition} qualityLevel={qualityLevel}>
        <GyukatsuLandmark playerPosition={playerPosition} />
      </SurfaceAnchor>
      <SurfaceAnchor angle={Math.PI} playerPosition={playerPosition} qualityLevel={qualityLevel}>
        <SakuraCanal />
      </SurfaceAnchor>
      <SurfaceAnchor angle={(Math.PI * 4) / 3} playerPosition={playerPosition} qualityLevel={qualityLevel}>
        <HanabiFestival />
      </SurfaceAnchor>
      <SurfaceAnchor angle={(Math.PI * 5) / 3} playerPosition={playerPosition} qualityLevel={qualityLevel}>
        <ReturnHill />
      </SurfaceAnchor>
    </group>
  );
}

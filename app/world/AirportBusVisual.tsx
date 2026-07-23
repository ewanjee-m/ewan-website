"use client";

import { useFrame } from "@react-three/fiber";
import * as React from "react";
import * as THREE from "three";
import { createAirportBus, createAirportBusSnapshot } from "./AirportBus";
import {
  AIRPORT_BUS_STATION_ROUTE_PROGRESS,
  BUS_LANE_CENTER_OFFSET,
  isPlayerInAirportCrosswalk,
  WORLD_RADIUS
} from "./WorldSafety";

const STATION_ROUTE_PROGRESS = AIRPORT_BUS_STATION_ROUTE_PROGRESS;
const LEFT_LANE_OFFSET = BUS_LANE_CENTER_OFFSET;
const LEFT_LANE_ANGLE = LEFT_LANE_OFFSET / WORLD_RADIUS;
const BUS_GROUND_CLEARANCE = 0.035;
const FULL_TURN = Math.PI * 2;

const DOOR_CLOSED_POSITION = {
  x: -1.065,
  y: 1.5,
  z: -1.22
};

interface RouteFrame {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  tangent: THREE.Vector3;
  left: THREE.Vector3;
}

function createRouteFrame(): RouteFrame {
  return {
    position: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    left: new THREE.Vector3()
  };
}

function setLeftLaneRouteFrame(progress: number, frame: RouteFrame) {
  const angle = (progress - STATION_ROUTE_PROGRESS) * FULL_TURN;

  // The unshifted great circle matches the walking path in WorldLandmarks.
  frame.normal.set(0, Math.cos(angle), -Math.sin(angle));
  frame.tangent.set(0, -Math.sin(angle), -Math.cos(angle));
  frame.left.crossVectors(frame.normal, frame.tangent).normalize();

  // Move onto the parallel vehicle lane, then project it back to the globe.
  frame.position
    .copy(frame.normal)
    .multiplyScalar(Math.cos(LEFT_LANE_ANGLE))
    .addScaledVector(frame.left, Math.sin(LEFT_LANE_ANGLE))
    .normalize();
  frame.normal.copy(frame.position);
  frame.left.crossVectors(frame.normal, frame.tangent).normalize();
  frame.position.multiplyScalar(WORLD_RADIUS + BUS_GROUND_CLEARANCE);
}

function BusWheel({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0.43, z]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.43, 0.43, 0.24, 10]} />
        <meshStandardMaterial color="#182331" roughness={0.98} flatShading />
      </mesh>
      <mesh
        position={[Math.sign(x) * 0.13, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry args={[0.19, 0.19, 0.035, 8]} />
        <meshStandardMaterial color="#d2a647" roughness={0.72} flatShading />
      </mesh>
    </group>
  );
}

function GoldenGlobeIcon({ side }: { side: -1 | 1 }) {
  const x = side * 1.105;
  const facing = side * (Math.PI / 2);

  return (
    <group position={[x, 1.24, 0.77]}>
      <mesh rotation={[0, facing, 0]}>
        <torusGeometry args={[0.23, 0.034, 5, 14]} />
        <meshStandardMaterial
          color="#e2b452"
          emissive="#8f5e18"
          emissiveIntensity={0.35}
          roughness={0.65}
          flatShading
        />
      </mesh>
      <mesh>
        <boxGeometry args={[0.035, 0.38, 0.035]} />
        <meshStandardMaterial color="#e2b452" roughness={0.65} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.035, 0.035, 0.38]} />
        <meshStandardMaterial color="#e2b452" roughness={0.65} />
      </mesh>
    </group>
  );
}

function SideWindow({
  side,
  z,
  length
}: {
  side: -1 | 1;
  z: number;
  length: number;
}) {
  return (
    <mesh position={[side * 1.015, 1.82, z]}>
      <boxGeometry args={[0.055, 0.64, length]} />
      <meshStandardMaterial
        color="#213e56"
        emissive="#c97945"
        emissiveIntensity={0.13}
        roughness={0.48}
        flatShading
      />
    </mesh>
  );
}

function AirportBusModel({
  leftDoor
}: {
  leftDoor: React.RefObject<THREE.Group | null>;
}) {
  return (
    <group>
      <mesh position={[0, 0.66, 0]}>
        <boxGeometry args={[2.12, 0.62, 4.45]} />
        <meshStandardMaterial color="#183b5b" roughness={0.88} flatShading />
      </mesh>

      <mesh position={[0, 0.99, 0]}>
        <boxGeometry args={[2.16, 0.2, 4.28]} />
        <meshStandardMaterial color="#db6f61" roughness={0.83} flatShading />
      </mesh>

      <mesh position={[0, 1.56, 0]}>
        <boxGeometry args={[1.72, 1.35, 3.86]} />
        <meshStandardMaterial
          color="#5b352e"
          emissive="#d46b3e"
          emissiveIntensity={0.32}
          roughness={0.82}
          flatShading
        />
      </mesh>

      <mesh position={[0, 2.34, 0]}>
        <boxGeometry args={[2.12, 0.25, 4.24]} />
        <meshStandardMaterial color="#eee4d2" roughness={0.9} flatShading />
      </mesh>

      <mesh position={[0, 1.5, -2.08]}>
        <boxGeometry args={[2.04, 1.55, 0.2]} />
        <meshStandardMaterial color="#eee4d2" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0, 1.76, -2.195]}>
        <boxGeometry args={[1.5, 0.62, 0.055]} />
        <meshStandardMaterial color="#203c54" roughness={0.46} flatShading />
      </mesh>
      <mesh position={[-0.7, 1.11, -2.2]}>
        <boxGeometry args={[0.34, 0.16, 0.06]} />
        <meshStandardMaterial
          color="#f4d38b"
          emissive="#f5a944"
          emissiveIntensity={1.15}
          roughness={0.52}
        />
      </mesh>
      <mesh position={[0.7, 1.11, -2.2]}>
        <boxGeometry args={[0.34, 0.16, 0.06]} />
        <meshStandardMaterial
          color="#f4d38b"
          emissive="#f5a944"
          emissiveIntensity={1.15}
          roughness={0.52}
        />
      </mesh>

      <mesh position={[0, 1.5, 2.08]}>
        <boxGeometry args={[2.04, 1.55, 0.2]} />
        <meshStandardMaterial color="#eee4d2" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0, 1.76, 2.195]}>
        <boxGeometry args={[1.5, 0.62, 0.055]} />
        <meshStandardMaterial color="#203c54" roughness={0.46} flatShading />
      </mesh>
      <mesh position={[-0.69, 1.1, 2.2]}>
        <boxGeometry args={[0.32, 0.15, 0.06]} />
        <meshStandardMaterial
          color="#c94f4c"
          emissive="#9a2628"
          emissiveIntensity={0.75}
        />
      </mesh>
      <mesh position={[0.69, 1.1, 2.2]}>
        <boxGeometry args={[0.32, 0.15, 0.06]} />
        <meshStandardMaterial
          color="#c94f4c"
          emissive="#9a2628"
          emissiveIntensity={0.75}
        />
      </mesh>

      <mesh position={[-1.015, 1.35, 0.7]}>
        <boxGeometry args={[0.06, 0.52, 2.65]} />
        <meshStandardMaterial color="#eee4d2" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-1.015, 1.35, -1.93]}>
        <boxGeometry args={[0.06, 0.52, 0.3]} />
        <meshStandardMaterial color="#eee4d2" roughness={0.9} flatShading />
      </mesh>
      <SideWindow side={-1} z={0.7} length={2.65} />

      <mesh position={[1.015, 1.35, 0]}>
        <boxGeometry args={[0.06, 0.52, 3.85]} />
        <meshStandardMaterial color="#eee4d2" roughness={0.9} flatShading />
      </mesh>
      <SideWindow side={1} z={-1.28} length={1.05} />
      <SideWindow side={1} z={0.18} length={1.55} />
      <SideWindow side={1} z={1.48} length={0.8} />

      <mesh
        position={[-1.055, 1.25, 0.1]}
        rotation={[-0.38, 0, 0]}
      >
        <boxGeometry args={[0.055, 0.23, 2.3]} />
        <meshStandardMaterial color="#db6f61" roughness={0.82} flatShading />
      </mesh>
      <mesh
        position={[1.055, 1.25, 0.1]}
        rotation={[-0.38, 0, 0]}
      >
        <boxGeometry args={[0.055, 0.23, 2.3]} />
        <meshStandardMaterial color="#db6f61" roughness={0.82} flatShading />
      </mesh>

      <GoldenGlobeIcon side={-1} />
      <GoldenGlobeIcon side={1} />

      <group
        ref={leftDoor}
        position={[
          DOOR_CLOSED_POSITION.x,
          DOOR_CLOSED_POSITION.y,
          DOOR_CLOSED_POSITION.z
        ]}
      >
        <mesh>
          <boxGeometry args={[0.085, 1.48, 1.02]} />
          <meshStandardMaterial color="#eee4d2" roughness={0.86} flatShading />
        </mesh>
        <mesh position={[-0.05, 0.28, 0]}>
          <boxGeometry args={[0.035, 0.56, 0.72]} />
          <meshStandardMaterial
            color="#213e56"
            emissive="#d67a45"
            emissiveIntensity={0.18}
            roughness={0.45}
          />
        </mesh>
        <mesh position={[-0.055, -0.41, 0]}>
          <boxGeometry args={[0.03, 0.16, 0.78]} />
          <meshStandardMaterial color="#db6f61" roughness={0.82} />
        </mesh>
        <mesh position={[-0.075, -0.03, -0.37]}>
          <boxGeometry args={[0.035, 0.24, 0.04]} />
          <meshStandardMaterial color="#d7ad55" roughness={0.62} />
        </mesh>
      </group>

      <mesh position={[-0.88, 0.45, -1.22]}>
        <boxGeometry args={[0.34, 0.12, 0.86]} />
        <meshStandardMaterial
          color="#d8a55f"
          emissive="#b55b36"
          emissiveIntensity={0.4}
          roughness={0.82}
        />
      </mesh>
      {[-1.25, 0, 1.25].map((z) => (
        <mesh key={z} position={[0, 2.18, z]}>
          <boxGeometry args={[0.72, 0.035, 0.18]} />
          <meshStandardMaterial
            color="#ffd690"
            emissive="#ff9f58"
            emissiveIntensity={1.45}
            roughness={0.58}
          />
        </mesh>
      ))}

      {([-1, 1] as const).flatMap((side) =>
        [-1.43, 1.43].map((z) => (
          <BusWheel key={`${side}-${z}`} x={side * 1.04} z={z} />
        ))
      )}
    </group>
  );
}

export function AirportBusVisual({
  playerPosition
}: {
  playerPosition: React.RefObject<THREE.Vector3>;
}) {
  const bus = React.useRef(createAirportBus());
  const busGroup = React.useRef<THREE.Group>(null);
  const leftDoor = React.useRef<THREE.Group>(null);
  const routeFrame = React.useRef(createRouteFrame());
  const orientationMatrix = React.useRef(new THREE.Matrix4());
  const orientation = React.useRef(new THREE.Quaternion());
  const right = React.useRef(new THREE.Vector3());
  const backward = React.useRef(new THREE.Vector3());
  const busSnapshot = React.useRef(createAirportBusSnapshot());
  const busInput = React.useRef({ crosswalkOccupied: false });

  useFrame((_, delta) => {
    const player = playerPosition.current;
    busInput.current.crosswalkOccupied = player
      ? isPlayerInAirportCrosswalk(player)
      : false;

    bus.current.advance(delta, busInput.current);
    const snapshot = bus.current.readSnapshot(busSnapshot.current);
    const currentBus = busGroup.current;

    if (currentBus) {
      setLeftLaneRouteFrame(snapshot.routeProgress, routeFrame.current);
      right.current
        .crossVectors(routeFrame.current.tangent, routeFrame.current.normal)
        .normalize();
      backward.current.copy(routeFrame.current.tangent).negate();
      orientationMatrix.current.makeBasis(
        right.current,
        routeFrame.current.normal,
        backward.current
      );
      orientation.current.setFromRotationMatrix(orientationMatrix.current);

      currentBus.position.copy(routeFrame.current.position);
      currentBus.quaternion.copy(orientation.current);
    }

    if (leftDoor.current) {
      const openAmount = snapshot.leftDoorOpenAmount;
      leftDoor.current.position.set(
        DOOR_CLOSED_POSITION.x - openAmount * 0.09,
        DOOR_CLOSED_POSITION.y,
        DOOR_CLOSED_POSITION.z + openAmount * 0.76
      );
    }
  });

  return (
    <group ref={busGroup}>
      <AirportBusModel leftDoor={leftDoor} />
    </group>
  );
}

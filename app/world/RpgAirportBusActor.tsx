"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { Group } from "three";
import {
  AIRPORT_BUS_DOOR_CLOSED_POSITION,
  AirportBusModel
} from "./AirportBusVisual";
import {
  RPG_BUS_ACTOR_CLEARANCE,
  RPG_BUS_DEFAULT_SIZE
} from "./RpgBusMotion";
import {
  advanceRpgBusRuntime,
  type RpgBusRuntime
} from "./RpgBusRuntime";
import type { RpgCameraDynamicObstacle } from "./RpgCameraCollision";

export function RpgAirportBusActor({
  runtime,
  dynamicObstacles,
  reducedMotion
}: {
  runtime: RpgBusRuntime;
  dynamicObstacles: RefObject<Map<string, RpgCameraDynamicObstacle>>;
  reducedMotion: boolean;
}) {
  const root = useRef<Group>(null);
  const leftDoor = useRef<Group>(null);
  const wheels = useRef<Group[]>([]);
  const obstacle = useRef<RpgCameraDynamicObstacle>({
    position: runtime.pose.position,
    size: RPG_BUS_DEFAULT_SIZE,
    yaw: runtime.pose.yaw,
    clearance: RPG_BUS_ACTOR_CLEARANCE,
    cameraCollision: "solid"
  });

  useEffect(() => {
    const obstacles = dynamicObstacles.current;
    obstacles.set("airport-bus", obstacle.current);
    return () => {
      obstacles.delete("airport-bus");
    };
  }, [dynamicObstacles]);

  useFrame((_, delta) => {
    advanceRpgBusRuntime(runtime, delta, reducedMotion);
    root.current?.position.fromArray(runtime.pose.position);
    if (root.current) root.current.rotation.y = runtime.pose.yaw;
    obstacle.current.yaw = runtime.pose.yaw;
    if (leftDoor.current) {
      const open = runtime.snapshot.leftDoorOpenAmount;
      leftDoor.current.position.set(
        AIRPORT_BUS_DOOR_CLOSED_POSITION.x - open * 0.09,
        AIRPORT_BUS_DOOR_CLOSED_POSITION.y,
        AIRPORT_BUS_DOOR_CLOSED_POSITION.z + open * 0.76
      );
    }
    for (const wheel of wheels.current) {
      if (wheel) wheel.rotation.x = runtime.pose.wheelRotation;
    }
  }, -2.5);

  return (
    <group
      ref={root}
      position={runtime.pose.position}
      name="rpg-airport-bus"
      userData={{ cameraOccluder: true, landmarkId: "airport-bus" }}
    >
      <group position={[0, -1.075, 0]}>
        <AirportBusModel leftDoor={leftDoor} wheelRefs={wheels} />
      </group>
    </group>
  );
}

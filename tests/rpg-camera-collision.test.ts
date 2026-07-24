import { describe, expect, it } from "vitest";
import { Matrix4, Object3D, Quaternion, Vector3 } from "three";
import {
  calculateRpgCameraCollisionRatio,
  resolveRpgCameraCollisionInto,
  resolveRpgCameraOrbitCollisionInto,
  selectRpgCameraCollisionSafeCandidateInto,
  RPG_NPC_CAMERA_CLEARANCE,
  RPG_CAMERA_MINIMUM_BOOM_DISTANCE,
  RPG_CAMERA_MINIMUM_FULL_BODY_FRAMING_DISTANCE,
  type RpgCameraDynamicObstacle
} from "../app/world/RpgCameraCollision";
import {
  RPG_CAMERA_COLUMN_OBSTACLES,
  toRpgCameraColumnObstacles
} from "../app/world/RpgCameraObstacleSources";
import {
  NPC_CHARACTER_CAMERA_HIDE_DISTANCE,
  PLAYER_CHARACTER_CAMERA_HIDE_DISTANCE
} from "../app/world/RpgCharacterCameraVisibility";
import { createRpgBusMotionPose } from "../app/world/RpgBusMotion";
import {
  collectRpgCameraDynamicObstacles,
  collectRpgCameraOcclusionRoots,
  getRpgCameraLookSlerpAlpha,
  resolveRpgCameraLookQuaternionInto
} from "../app/world/ChaseOrbitCamera3d";
import {
  isRpgWalkablePosition,
  RPG_LANDMARKS
} from "../app/world/RpgTownSceneLayout";

// Open ground on the western edge: every boom yaw here clears static geometry,
// so these assertions isolate the townsperson in the boom.
const OPEN_GROUND = [-34, 0, -20] as const;
const townsperson = RPG_LANDMARKS.find(({ kind }) => kind === "npc")!;

function npcObstacleAt(distanceBehind: number, lateralOffset = 0) {
  return {
    position: [
      OPEN_GROUND[0] + lateralOffset,
      townsperson.position[1],
      OPEN_GROUND[2] + distanceBehind
    ] as const,
    size: townsperson.size,
    yaw: 0,
    clearance: RPG_NPC_CAMERA_CLEARANCE
  } as const;
}

function desiredCameraAtPitch(pitch: number) {
  return desiredChaseCamera(OPEN_GROUND, 180, pitch);
}

function desiredChaseCamera(
  player: readonly [number, number, number],
  yawDegrees: number,
  pitchDegrees: number
) {
  const distance = 5.6;
  const yaw = (yawDegrees * Math.PI) / 180;
  const pitch = (pitchDegrees * Math.PI) / 180;
  const horizontal = Math.cos(pitch) * distance;
  return [
    player[0] - Math.sin(yaw) * horizontal,
    player[1] + 1.15 + Math.sin(pitch) * distance,
    player[2] - Math.cos(yaw) * horizontal
  ] as const;
}

const airportBus = RPG_LANDMARKS.find(
  ({ id }) => id === "airport-limousine-bus"
)!;
const liveBusPose = createRpgBusMotionPose();
const liveBusObstacle = {
  position: liveBusPose.position,
  size: airportBus.size,
  yaw: liveBusPose.yaw
} as const;
const busX = liveBusPose.position[0];
const busMinimumZ = liveBusPose.position[2] - airportBus.size[0] / 2;
const airportTerminal = RPG_LANDMARKS.find(
  ({ id }) => id === "airport-terminal"
)!;
const festivalLantern = RPG_LANDMARKS.find(
  // This ray passes between the south-side festival stalls so the assertion
  // isolates the lantern clearance instead of a nearer building.
  ({ id }) => id === "hanabi-lantern-2-south"
)!;

describe("RPG chase camera obstacle clearance", () => {
  it("aims the camera negative-Z axis at the player focus", () => {
    const cameraPosition = new Vector3(-32.5, 4.8, -5.9);
    const focus = new Vector3(-26.3, 1.15, -2.97);
    const quaternion = new Quaternion();

    resolveRpgCameraLookQuaternionInto(
      cameraPosition,
      focus,
      new Vector3(0, 1, 0),
      quaternion,
      new Matrix4()
    );

    const cameraForward = new Vector3(0, 0, -1)
      .applyQuaternion(quaternion)
      .normalize();
    const expectedForward = focus.clone().sub(cameraPosition).normalize();
    expect(cameraForward.dot(expectedForward)).toBeCloseTo(1, 10);
  });

  it("converges the camera look target within the 250ms safe-frame budget", () => {
    const frameSeconds = 1 / 60;
    const alpha = getRpgCameraLookSlerpAlpha(frameSeconds);
    let remainingError = 1;
    for (let frame = 0; frame < 15; frame += 1) {
      remainingError *= (1 - alpha) ** 2;
    }
    expect(remainingError).toBeLessThan(0.02);
  });

  it("accelerates look convergence during a lateral collision escape", () => {
    const frameSeconds = 1 / 60;
    const normalAlpha = getRpgCameraLookSlerpAlpha(frameSeconds);
    const escapeAlpha = getRpgCameraLookSlerpAlpha(frameSeconds, true);
    let remainingError = 1;
    for (let frame = 0; frame < 10; frame += 1) {
      remainingError *= (1 - escapeAlpha) ** 2;
    }
    expect(escapeAlpha).toBeGreaterThan(normalAlpha);
    expect(remainingError).toBeLessThan(0.001);
  });

  it("raycasts only explicit static camera occluder roots", () => {
    const scene = new Object3D();
    const playerRig = new Object3D();
    const terminal = new Object3D();
    const terminalMesh = new Object3D();
    const bus = new Object3D();
    terminal.userData = {
      cameraOccluder: true,
      landmarkId: "airport-terminal"
    };
    bus.userData = {
      cameraOccluder: true,
      landmarkId: "airport-bus"
    };
    terminal.add(terminalMesh);
    scene.add(playerRig, terminal, bus);
    const target = [playerRig];

    expect(collectRpgCameraOcclusionRoots(scene, target)).toBe(target);
    expect(target).toEqual([terminal]);
  });

  it("refills the caller-owned dynamic obstacle collection without replacing it", () => {
    const first: RpgCameraDynamicObstacle = {
      position: [1, 1, 1],
      size: [1, 2, 1],
      yaw: 0,
      cameraCollision: "solid"
    };
    const second: RpgCameraDynamicObstacle = {
      position: [2, 1, 2],
      size: [1, 2, 1],
      yaw: Math.PI / 2,
      cameraCollision: "occlusion-only"
    };
    const source = new Map([
      ["first", first],
      ["second", second]
    ]);
    const target = [second];

    expect(collectRpgCameraDynamicObstacles(source, target)).toBe(target);
    expect(target).toEqual([first]);
  });

  it("orbits around the Gyukatsu facade without extending through it", () => {
    const player = [-7, 1.15, 9] as const;
    const yaw = 4.261270019531251;
    const pitch = 0.6506699197917142;
    const distance = 5.6;
    const horizontal = Math.cos(pitch) * distance;
    const desiredCamera = [
      player[0] - Math.sin(yaw) * horizontal,
      player[1] + Math.sin(pitch) * distance,
      player[2] - Math.cos(yaw) * horizontal
    ] as const;
    const resolved = [0, 0, 0] as [number, number, number];

    expect(
      resolveRpgCameraOrbitCollisionInto(
        { player, desiredCamera },
        resolved
      )
    ).toBe(true);
    expect(
      Math.hypot(
        resolved[0] - player[0],
        resolved[1] - player[1],
        resolved[2] - player[2]
      )
    ).toBeGreaterThanOrEqual(
      RPG_CAMERA_MINIMUM_FULL_BODY_FRAMING_DISTANCE
    );
    expect(
      calculateRpgCameraCollisionRatio({
        player,
        desiredCamera: resolved
      })
    ).toBe(1);
  });

  it("keeps the full boom length when the route behind the player is clear", () => {
    expect(
      calculateRpgCameraCollisionRatio({
        player: [0, 0, 0],
        desiredCamera: [-5.6, 2.8, 0],
        dynamicObstacles: [liveBusObstacle]
      })
    ).toBe(1);
  });

  it("retracts before the airport bus instead of entering its geometry", () => {
    const player = [busX, 0, busMinimumZ - 4.5] as const;
    const desiredCamera = [busX, 2.8, busMinimumZ + 2] as const;
    const ratio = calculateRpgCameraCollisionRatio({
      player,
      desiredCamera,
      dynamicObstacles: [liveBusObstacle]
    });
    const resolvedZ =
      player[2] + (desiredCamera[2] - player[2]) * ratio;

    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(1);
    expect(resolvedZ).toBeLessThan(busMinimumZ - 0.5);
  });

  it("does not force the boom through a bus when the player starts inside its clearance shell", () => {
    const player = [busX, 0, busMinimumZ - 0.075] as const;
    const desiredCamera = [busX, 2.8, busMinimumZ + 5.525] as const;
    const ratio = calculateRpgCameraCollisionRatio({
      player,
      desiredCamera,
      dynamicObstacles: [liveBusObstacle]
    });
    const resolvedZ =
      player[2] + (desiredCamera[2] - player[2]) * ratio;

    expect(ratio).toBeGreaterThanOrEqual(0);
    expect(ratio).toBeLessThan(0.02);
    expect(resolvedZ).toBeLessThan(busMinimumZ);
  });

  it("allows the camera to leave a clearance shell without crossing the landmark", () => {
    expect(
      calculateRpgCameraCollisionRatio({
        player: [busX, 0, busMinimumZ - 0.075],
        desiredCamera: [busX - 5.6, 2.8, busMinimumZ - 0.075],
        dynamicObstacles: [liveBusObstacle]
      })
    ).toBe(1);
  });

  it("retracts without swinging sideways when the moving bus passes behind the player", () => {
    const player = [busX, 0, busMinimumZ - 0.075] as const;
    const desiredCamera = [busX, 2.8, busMinimumZ + 5.525] as const;
    const resolved = [0, 0, 0] as [number, number, number];
    const usedLateralEscape = resolveRpgCameraOrbitCollisionInto(
      { player, desiredCamera, dynamicObstacles: [liveBusObstacle] },
      resolved
    );

    // The bus is close enough that retracting cannot clear it, so the boom
    // holds at its minimum rather than collapsing into the character, and it
    // still must not swing the controls sideways.
    expect(usedLateralEscape).toBe(false);
    expect(resolved[0]).toBeCloseTo(player[0], 8);
    expect(
      Math.hypot(
        resolved[0] - player[0],
        resolved[1] - player[1],
        resolved[2] - player[2]
      )
    ).toBeCloseTo(RPG_CAMERA_MINIMUM_BOOM_DISTANCE, 6);
  });

  it("keeps full boom distance by orbiting sideways around a static building", () => {
    const terminalMinimumZ =
      airportTerminal.position[2] - airportTerminal.size[2] / 2;
    const player = [
      airportTerminal.position[0],
      0,
      terminalMinimumZ - 0.075
    ] as const;
    const desiredCamera = [
      airportTerminal.position[0],
      2.8,
      terminalMinimumZ + 5.525
    ] as const;
    const resolved = [0, 0, 0] as [number, number, number];

    expect(
      resolveRpgCameraOrbitCollisionInto({ player, desiredCamera }, resolved)
    ).toBe(true);
    expect(
      calculateRpgCameraCollisionRatio({ player, desiredCamera: resolved })
    ).toBe(1);
  });

  it("clamps the actual damped camera on the player side of an obstacle", () => {
    const resolved = [0, 0, 0] as [number, number, number];
    const ratio = resolveRpgCameraCollisionInto(
      {
        player: [busX, 0, busMinimumZ - 4.5],
        desiredCamera: [busX, 2.8, busMinimumZ + 1],
        dynamicObstacles: [liveBusObstacle]
      },
      resolved
    );

    expect(ratio).toBeLessThan(1);
    expect(resolved[2]).toBeLessThan(busMinimumZ - 0.5);
  });

  it("retracts before a festival lantern during a mobile sky orbit", () => {
    const ratio = calculateRpgCameraCollisionRatio({
      player: [
        festivalLantern.position[0],
        0,
        festivalLantern.position[2] - 4.5
      ],
      desiredCamera: [
        festivalLantern.position[0],
        2.8,
        festivalLantern.position[2] + 1
      ]
    });
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.8);
  });

  it("retracts the boom in front of a townsperson standing behind the player", () => {
    const desiredCamera = desiredCameraAtPitch(18);
    const npc = npcObstacleAt(2.5);

    expect(
      calculateRpgCameraCollisionRatio({
        player: OPEN_GROUND,
        desiredCamera
      })
    ).toBe(1);

    const ratio = calculateRpgCameraCollisionRatio({
      player: OPEN_GROUND,
      desiredCamera,
      dynamicObstacles: [npc]
    });
    const resolvedZ =
      OPEN_GROUND[2] + (desiredCamera[2] - OPEN_GROUND[2]) * ratio;

    expect(ratio).toBeLessThan(1);
    expect(resolvedZ).toBeLessThan(npc.position[2] - townsperson.size[2] / 2);
  });

  it("treats a townsperson as an occluder until the boom rises over them", () => {
    const desiredCamera = desiredCameraAtPitch(18);

    for (const behind of [0.5, 1, 1.5, 2, 2.5, 3, 3.5]) {
      const ratio = calculateRpgCameraCollisionRatio({
        player: OPEN_GROUND,
        desiredCamera,
        dynamicObstacles: [npcObstacleAt(behind)]
      });
      expect(ratio, `townsperson ${behind}m behind`).toBeLessThan(1);
    }
    expect(
      calculateRpgCameraCollisionRatio({
        player: OPEN_GROUND,
        desiredCamera,
        dynamicObstacles: [npcObstacleAt(4)]
      })
    ).toBe(1);
  });

  it("never leaves a blocking townsperson rendered in front of the camera", () => {
    let blockedSamples = 0;

    for (const pitch of [18, 28, 38, 55]) {
      const desiredCamera = desiredCameraAtPitch(pitch);
      for (let behind = 0; behind <= 6.0001; behind += 0.05) {
        for (const lateral of [0, 0.15, 0.3, 0.45]) {
          const npc = npcObstacleAt(behind, lateral);
          const input = {
            player: OPEN_GROUND,
            desiredCamera,
            dynamicObstacles: [npc]
          };
          const resolved = [0, 0, 0] as [number, number, number];
          const ratio = resolveRpgCameraCollisionInto(input, resolved);
          const cameraDistance = Math.hypot(
            resolved[0] - OPEN_GROUND[0],
            resolved[1] - OPEN_GROUND[1],
            resolved[2] - OPEN_GROUND[2]
          );

          expect(cameraDistance).toBeGreaterThanOrEqual(
            PLAYER_CHARACTER_CAMERA_HIDE_DISTANCE
          );
          if (ratio >= 1) {
            continue;
          }
          blockedSamples += 1;
          if (npc.position[2] >= resolved[2]) {
            continue;
          }
          // The minimum boom outranks retraction, so a townsperson may stay in
          // front of the camera — but only one standing closer to the player
          // than that minimum, where retracting could never have cleared them.
          const npcDistanceToPlayer = Math.hypot(
            npc.position[0] - OPEN_GROUND[0],
            npc.position[2] - OPEN_GROUND[2]
          );
          const npcDistanceToCamera = Math.hypot(
            resolved[0] - npc.position[0],
            resolved[1] - npc.position[1],
            resolved[2] - npc.position[2]
          );
          expect(
            npcDistanceToCamera < NPC_CHARACTER_CAMERA_HIDE_DISTANCE ||
              npcDistanceToPlayer < RPG_CAMERA_MINIMUM_BOOM_DISTANCE
          ).toBe(true);
        }
      }
    }

    expect(blockedSamples).toBeGreaterThan(200);
  });

  it("keeps the boom on the static clearance when a building is the nearer blocker", () => {
    const terminalMinimumZ =
      airportTerminal.position[2] - airportTerminal.size[2] / 2;
    const player = [
      airportTerminal.position[0],
      0,
      terminalMinimumZ - 1.5
    ] as const;
    const desiredCamera = [
      airportTerminal.position[0],
      2.8,
      terminalMinimumZ + 5.525
    ] as const;
    const staticRatio = calculateRpgCameraCollisionRatio({
      player,
      desiredCamera
    });

    expect(
      calculateRpgCameraCollisionRatio({
        player,
        desiredCamera,
        dynamicObstacles: [
          {
            position: [
              airportTerminal.position[0],
              townsperson.position[1],
              terminalMinimumZ - 0.5
            ] as const,
            size: townsperson.size,
            yaw: 0,
            clearance: RPG_NPC_CAMERA_CLEARANCE
          }
        ]
      })
    ).toBeLessThanOrEqual(staticRatio);
  });

  it("orbits around an authored column without shortening below the minimum boom", () => {
    const column = RPG_CAMERA_COLUMN_OBSTACLES.find(
      ({ height }) => height >= 5
    )!;
    const player = [column.x, 0, column.z - 2] as const;
    const desiredCamera = [column.x, 2.8, column.z + 4] as const;
    const resolved = [0, 0, 0] as [number, number, number];

    expect(
      calculateRpgCameraCollisionRatio({
        player,
        desiredCamera,
        columnObstacles: [column]
      })
    ).toBeLessThan(1);
    resolveRpgCameraOrbitCollisionInto(
      { player, desiredCamera, columnObstacles: [column] },
      resolved
    );

    expect(resolved.every(Number.isFinite)).toBe(true);
    expect(
      Math.hypot(
        resolved[0] - player[0],
        resolved[1] - player[1],
        resolved[2] - player[2]
      )
    ).toBeGreaterThanOrEqual(RPG_CAMERA_MINIMUM_BOOM_DISTANCE);
    expect(
      calculateRpgCameraCollisionRatio({
        player,
        desiredCamera: resolved,
        columnObstacles: [column]
      })
    ).toBe(1);
  });

  it("rejects an unsafe damped or offset candidate in favor of its resolved fallback", () => {
    const column = RPG_CAMERA_COLUMN_OBSTACLES.find(
      ({ height }) => height >= 5
    )!;
    const player = [column.x, 0, column.z - 2] as const;
    const unsafeCandidate = [column.x, 2.8, column.z + 4] as const;
    const safeFallback = [0, 0, 0] as [number, number, number];
    const selected = [0, 0, 0] as [number, number, number];
    resolveRpgCameraOrbitCollisionInto(
      {
        player,
        desiredCamera: unsafeCandidate,
        columnObstacles: [column]
      },
      safeFallback
    );

    const usedFallback = selectRpgCameraCollisionSafeCandidateInto(
      {
        player,
        candidateCamera: unsafeCandidate,
        fallbackCamera: safeFallback,
        columnObstacles: [column]
      },
      selected
    );

    expect(usedFallback).toBe(true);
    expect(selected).toEqual(safeFallback);
    expect(
      calculateRpgCameraCollisionRatio({
        player,
        desiredCamera: selected,
        columnObstacles: [column]
      })
    ).toBe(1);
  });

  it("keeps every Hanabi arrival orbit outside the festival stalls", () => {
    const player = [26, 1.15, -18] as const;
    const pitch = (28 * Math.PI) / 180;
    const distance = 7.04;
    const horizontal = Math.cos(pitch) * distance;

    for (let yawDegrees = 0; yawDegrees < 360; yawDegrees += 1) {
      const yaw = (yawDegrees * Math.PI) / 180;
      const desiredCamera = [
        player[0] - Math.sin(yaw) * horizontal,
        player[1] + Math.sin(pitch) * distance,
        player[2] - Math.cos(yaw) * horizontal
      ] as const;
      const resolved = [0, 0, 0] as [number, number, number];

      resolveRpgCameraOrbitCollisionInto(
        { player, desiredCamera },
        resolved
      );

      expect(
        calculateRpgCameraCollisionRatio({
          player,
          desiredCamera: resolved
        }),
        `yaw ${yawDegrees}`
      ).toBe(1);
      expect(
        Math.hypot(
          resolved[0] - player[0],
          resolved[1] - player[1],
          resolved[2] - player[2]
        ),
        `yaw ${yawDegrees}`
      ).toBeGreaterThanOrEqual(RPG_CAMERA_MINIMUM_BOOM_DISTANCE);
    }
  });

  it("catches a thin column the boom would otherwise pass straight through", () => {
    const player = [...OPEN_GROUND] as [number, number, number];
    const desiredCamera = desiredCameraAtPitch(18);

    for (let behind = 0; behind <= 5.0001; behind += 0.25) {
      const column = {
        x: OPEN_GROUND[0],
        z: OPEN_GROUND[2] + behind,
        radius: 0.05,
        height: 5.5
      };
      const resolved = [0, 0, 0] as [number, number, number];
      const ratio = resolveRpgCameraCollisionInto(
        { player, desiredCamera, columnObstacles: [column] },
        resolved
      );
      const cameraDistance = Math.hypot(
        resolved[0] - player[0],
        resolved[1] - player[1],
        resolved[2] - player[2]
      );

      // A 5cm trunk is far smaller than the boom's step, so a point sample
      // would skip it entirely.
      expect(ratio).toBeLessThan(1);
      expect(cameraDistance).toBeGreaterThan(
        RPG_CAMERA_MINIMUM_BOOM_DISTANCE - 1e-6
      );
      if (cameraDistance > RPG_CAMERA_MINIMUM_BOOM_DISTANCE + 1e-6) {
        expect(resolved[2]).toBeLessThan(column.z - column.radius);
      }
    }
  });

  it("keeps a boom when the player stands inside a prop that does not block them", () => {
    const player = [...OPEN_GROUND] as [number, number, number];
    const column = {
      x: OPEN_GROUND[0],
      z: OPEN_GROUND[2],
      radius: 0.065,
      height: 5.5
    };
    const resolved = [0, 0, 0] as [number, number, number];
    resolveRpgCameraOrbitCollisionInto(
      {
        player,
        desiredCamera: desiredCameraAtPitch(18),
        columnObstacles: [column]
      },
      resolved
    );

    expect(
      Math.hypot(
        resolved[0] - player[0],
        resolved[1] - player[1],
        resolved[2] - player[2]
      )
    ).toBeGreaterThan(RPG_CAMERA_MINIMUM_BOOM_DISTANCE - 1e-6);
  });

  it("occludes for every landmark that blocks movement, and only those", () => {
    const staticBus = RPG_LANDMARKS.find(
      ({ id }) => id === "airport-limousine-bus"
    )!;

    // The moving bus is fed as a dynamic obstacle, so its parked footprint must
    // not also block; every other solid landmark has to occlude on its own.
    expect(staticBus.blocksMovement).toBe(false);
    for (const landmark of RPG_LANDMARKS) {
      if (!landmark.blocksMovement || landmark.size[1] < 1) {
        continue;
      }
      const player = [
        landmark.position[0],
        0,
        landmark.position[2] - landmark.size[2] / 2 - 2
      ] as const;
      const desiredCamera = [
        landmark.position[0],
        1.6,
        landmark.position[2]
      ] as const;

      expect(
        calculateRpgCameraCollisionRatio({ player, desiredCamera })
      ).toBeLessThan(1);
    }
  });

  it("shapes street props into columns and drops wires, awnings and benches", () => {
    const columns = toRpgCameraColumnObstacles([
      {
        id: "pole",
        position: [4, 2.75, -6],
        size: [0.13, 5.5, 0.13],
        rotation: [0, 0, 0],
        color: "#000"
      },
      {
        id: "leaning-trunk",
        position: [1, 1.5, 2],
        size: [0.23, 3, 0.23],
        rotation: [0, 0.5, 0.1],
        color: "#000"
      },
      {
        id: "overhead-wire",
        position: [0, 5, 0],
        size: [0.035, 6, 0.035],
        rotation: [0, 0, 1.45],
        color: "#000"
      },
      {
        id: "bench",
        position: [0, 0.48, 0],
        size: [0.56, 0.13, 2.8],
        rotation: [0, 0, 0],
        color: "#000"
      },
      {
        id: "shelter-roof",
        position: [0, 2.42, 0],
        size: [1.75, 0.14, 3.8],
        rotation: [0, 0, -0.08],
        color: "#000"
      }
    ]);

    expect(columns).toEqual([
      { x: 4, z: -6, radius: 0.065, height: 5.5 },
      { x: 1, z: 2, radius: 0.115, height: 3 }
    ]);
  });

  it("exposes one composed column list the town props plug into", () => {
    // Deliberately free of authored coordinates: the town owns where its props
    // stand, and moving one must not fail the camera.
    expect(RPG_CAMERA_COLUMN_OBSTACLES.length).toBeGreaterThan(0);
    for (const column of RPG_CAMERA_COLUMN_OBSTACLES) {
      expect(Number.isFinite(column.x)).toBe(true);
      expect(Number.isFinite(column.z)).toBe(true);
      expect(column.radius).toBeGreaterThan(0);
      expect(column.radius).toBeLessThanOrEqual(0.3);
      expect(column.height).toBeGreaterThanOrEqual(1.2);
    }
    expect(
      RPG_CAMERA_COLUMN_OBSTACLES.some(({ height }) => height >= 5)
    ).toBe(true);
  });

  it("never lets any orbit yaw pull the camera inside the character", () => {
    const walkable: (readonly [number, number])[] = [];
    for (let x = -35; x <= 35; x += 1) {
      for (let z = -35; z <= 35; z += 1) {
        if (isRpgWalkablePosition(x, z)) {
          walkable.push([x, z]);
        }
      }
    }
    expect(walkable.length).toBeGreaterThan(500);

    let worstDistance = Number.POSITIVE_INFINITY;
    let worstAt = "";
    for (const [x, z] of walkable) {
      const player = [x, 0, z] as const;
      for (let yaw = 0; yaw < 360; yaw += 15) {
        for (const pitch of [18, 38, 55]) {
          const desiredCamera = desiredChaseCamera(player, yaw, pitch);
          const resolved = [0, 0, 0] as [number, number, number];

          for (const resolve of [
            resolveRpgCameraCollisionInto,
            resolveRpgCameraOrbitCollisionInto
          ]) {
            resolve({ player, desiredCamera }, resolved);
            const distance = Math.hypot(
              resolved[0] - player[0],
              resolved[1] - player[1],
              resolved[2] - player[2]
            );
            if (distance < worstDistance) {
              worstDistance = distance;
              worstAt = `(${x}, ${z}) yaw ${yaw} pitch ${pitch}`;
            }
          }
        }
      }
    }

    expect(worstAt).not.toBe("");
    expect(worstDistance).toBeGreaterThanOrEqual(
      RPG_CAMERA_MINIMUM_BOOM_DISTANCE
    );
  });

  it("holds the minimum boom for a dynamic obstacle sitting on the player", () => {
    const desiredCamera = desiredCameraAtPitch(18);
    const resolved = [0, 0, 0] as [number, number, number];
    resolveRpgCameraOrbitCollisionInto(
      {
        player: OPEN_GROUND,
        desiredCamera,
        dynamicObstacles: [npcObstacleAt(0)]
      },
      resolved
    );

    expect(
      Math.hypot(
        resolved[0] - OPEN_GROUND[0],
        resolved[1] - OPEN_GROUND[1],
        resolved[2] - OPEN_GROUND[2]
      )
    ).toBeCloseTo(RPG_CAMERA_MINIMUM_BOOM_DISTANCE, 6);
  });

  it("returns a finite safe fallback for invalid camera coordinates", () => {
    expect(
      calculateRpgCameraCollisionRatio({
        player: [0, 0, 0],
        desiredCamera: [Number.NaN, Number.POSITIVE_INFINITY, 5]
      })
    ).toBe(1);
  });
});

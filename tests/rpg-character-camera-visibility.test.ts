import { describe, expect, it } from "vitest";
import {
  NPC_CHARACTER_CAMERA_HIDE_DISTANCE,
  PLAYER_CHARACTER_CAMERA_HIDE_DISTANCE,
  blocksRpgCameraSightLine,
  calculateRpgCharacterCameraDistance,
  shouldRenderRpgCharacter
} from "../app/world/RpgCharacterCameraVisibility";
import {
  RPG_CAMERA_MINIMUM_BOOM_DISTANCE,
  RPG_NPC_CAMERA_CLEARANCE
} from "../app/world/RpgCameraCollision";
import { RPG_LANDMARKS } from "../app/world/RpgTownSceneLayout";

describe("RPG character near-camera visibility", () => {
  it("hides the player before the chase camera can enter the skinned mesh", () => {
    expect(PLAYER_CHARACTER_CAMERA_HIDE_DISTANCE).toBeGreaterThanOrEqual(1.2);
    expect(
      shouldRenderRpgCharacter(
        PLAYER_CHARACTER_CAMERA_HIDE_DISTANCE - 0.01,
        PLAYER_CHARACTER_CAMERA_HIDE_DISTANCE
      )
    ).toBe(false);
    expect(
      shouldRenderRpgCharacter(
        PLAYER_CHARACTER_CAMERA_HIDE_DISTANCE,
        PLAYER_CHARACTER_CAMERA_HIDE_DISTANCE
      )
    ).toBe(true);
  });

  it("uses a slightly wider safety distance for moving NPCs", () => {
    expect(NPC_CHARACTER_CAMERA_HIDE_DISTANCE).toBeGreaterThan(
      PLAYER_CHARACTER_CAMERA_HIDE_DISTANCE
    );
    expect(
      shouldRenderRpgCharacter(1.3, NPC_CHARACTER_CAMERA_HIDE_DISTANCE)
    ).toBe(false);
    expect(shouldRenderRpgCharacter(Number.NaN, 1.2)).toBe(false);
  });

  it("keeps the player renderable at the shortest boom any obstacle can force", () => {
    expect(RPG_CAMERA_MINIMUM_BOOM_DISTANCE).toBeGreaterThan(
      PLAYER_CHARACTER_CAMERA_HIDE_DISTANCE
    );
    expect(
      shouldRenderRpgCharacter(
        RPG_CAMERA_MINIMUM_BOOM_DISTANCE,
        PLAYER_CHARACTER_CAMERA_HIDE_DISTANCE
      )
    ).toBe(true);
  });

  it("hides a townsperson the boom has retracted in front of", () => {
    const npc = RPG_LANDMARKS.find(({ kind }) => kind === "npc")!;
    // Worst case the boom stops on the corner of the padded footprint, so that
    // is the furthest the camera can sit from a body it retracted for.
    const paddedCorner = Math.hypot(
      npc.size[0] / 2 + RPG_NPC_CAMERA_CLEARANCE,
      npc.size[2] / 2 + RPG_NPC_CAMERA_CLEARANCE
    );

    expect(NPC_CHARACTER_CAMERA_HIDE_DISTANCE).toBeGreaterThan(paddedCorner);
    expect(
      shouldRenderRpgCharacter(paddedCorner, NPC_CHARACTER_CAMERA_HIDE_DISTANCE)
    ).toBe(false);
  });

  it("measures the body axis, not the feet, so a body beside the lens reads as near", () => {
    // The camera rides above the ground, so a townsperson standing half a unit
    // away has feet more than two units from it while their chest is in the
    // lens. Measuring to the feet left that body on screen at full size.
    const camera = { x: 0, y: 2, z: 0 };
    const feet = { x: 0.5, y: 0, z: 0.5 };
    const bodyHeight = 2.525;

    const footDistance = Math.hypot(
      camera.x - feet.x,
      camera.y - feet.y,
      camera.z - feet.z
    );
    const axisDistance = calculateRpgCharacterCameraDistance(
      camera,
      feet,
      bodyHeight
    );

    expect(footDistance).toBeGreaterThan(NPC_CHARACTER_CAMERA_HIDE_DISTANCE / 2);
    expect(axisDistance).toBeCloseTo(Math.SQRT1_2, 10);
    expect(axisDistance).toBeLessThan(footDistance);
    expect(
      shouldRenderRpgCharacter(axisDistance, NPC_CHARACTER_CAMERA_HIDE_DISTANCE)
    ).toBe(false);
  });

  it("clamps the axis to the head and the soles", () => {
    const feet = { x: 0, y: 0, z: 0 };

    // Above the head: only the gap over the crown counts.
    expect(
      calculateRpgCharacterCameraDistance({ x: 0, y: 4, z: 0 }, feet, 2.5)
    ).toBeCloseTo(1.5, 10);
    // Below the soles: only the drop under the feet counts.
    expect(
      calculateRpgCharacterCameraDistance({ x: 0, y: -0.75, z: 0 }, feet, 2.5)
    ).toBeCloseTo(0.75, 10);
    // Alongside the body: the height cancels out entirely.
    expect(
      calculateRpgCharacterCameraDistance({ x: 3, y: 1.4, z: 4 }, feet, 2.5)
    ).toBeCloseTo(5, 10);
    expect(
      calculateRpgCharacterCameraDistance({ x: 1, y: 1, z: 0 }, feet, Number.NaN)
    ).toBeCloseTo(Math.SQRT2, 10);
  });

  it("keeps the player drawn when the boom is at its shortest behind them", () => {
    // Shortest boom the collision system allows, sitting behind and above the
    // player the way the chase camera does.
    const axisDistance = calculateRpgCharacterCameraDistance(
      { x: 0, y: 1.8, z: 2 },
      { x: 0, y: 0, z: 0 },
      2.58
    );

    expect(axisDistance).toBeCloseTo(2, 10);
    expect(
      shouldRenderRpgCharacter(
        axisDistance,
        PLAYER_CHARACTER_CAMERA_HIDE_DISTANCE
      )
    ).toBe(true);
  });

  it("ties the townsperson cutoff to the shortest boom the camera can take", () => {
    expect(NPC_CHARACTER_CAMERA_HIDE_DISTANCE).toBe(
      RPG_CAMERA_MINIMUM_BOOM_DISTANCE
    );
  });

  describe("line of sight to the player character", () => {
    const camera = { x: 0, z: 0 };
    const player = { x: 0, z: 10 };

    it("hides a body standing in the middle of the view", () => {
      expect(blocksRpgCameraSightLine(camera, player, { x: 0, z: 5 })).toBe(
        true
      );
      expect(blocksRpgCameraSightLine(camera, player, { x: 0.4, z: 5 })).toBe(
        true
      );
    });

    it("hides a body standing on the spot the player landed on", () => {
      // Fast travel drops the player on a zone anchor that a townsperson walks
      // through, and from behind that body sits square over the player.
      expect(blocksRpgCameraSightLine(camera, player, { x: 0.1, z: 9.6 })).toBe(
        true
      );
    });

    it("leaves a body standing clear of the view alone", () => {
      // Beside the line.
      expect(blocksRpgCameraSightLine(camera, player, { x: 1.2, z: 5 })).toBe(
        false
      );
      // Behind the player.
      expect(blocksRpgCameraSightLine(camera, player, { x: 0, z: 14 })).toBe(
        false
      );
      // Behind the camera.
      expect(blocksRpgCameraSightLine(camera, player, { x: 0, z: -3 })).toBe(
        false
      );
      // Shoulder to shoulder with the player rather than over them.
      expect(blocksRpgCameraSightLine(camera, player, { x: 0.8, z: 9.5 })).toBe(
        false
      );
    });

    it("stays quiet when the camera has reached the player", () => {
      expect(
        blocksRpgCameraSightLine({ x: 4, z: 4 }, { x: 4, z: 4 }, { x: 4, z: 4 })
      ).toBe(false);
      expect(
        blocksRpgCameraSightLine(camera, { x: Number.NaN, z: 10 }, { x: 0, z: 5 })
      ).toBe(false);
    });

    it("follows the view around when the camera orbits", () => {
      const orbited = { x: 7, z: 7 };
      const between = { x: 3.5, z: 3.5 };

      expect(blocksRpgCameraSightLine(camera, orbited, between)).toBe(true);
      expect(blocksRpgCameraSightLine(camera, player, between)).toBe(false);
    });
  });
});

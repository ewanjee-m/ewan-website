import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useFrame } from "@react-three/fiber";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  findWorldInteractionTarget,
  WORLD_INTERACTION_TARGETS,
  type WorldInteractionTarget
} from "../app/world/WorldInteraction";
import { WorldInteractionPrompt } from "../app/world/WorldInteractionPrompt";
import { RpgSceneRuntime } from "../app/world/RpgSceneRuntime";
import type { InputController } from "../app/world/InputController";
import type { WorldNavigationSnapshot } from "../app/world/WorldNavigationState";
import type { WorldRuntime } from "../app/world/WorldRuntime";
import { createWorldRuntime } from "../app/world/WorldRuntime";

vi.mock("@react-three/fiber", () => ({
  useFrame: vi.fn()
}));

describe("world interaction", () => {
  it("requires proximity and a 60-degree facing cone", () => {
    expect(
      findWorldInteractionTarget({
        position: [-32, 0, 0],
        heading: [1, 0, 0]
      })?.id
    ).toBe("airport-terminal-entry");
    expect(
      findWorldInteractionTarget({
        position: [-32, 0, 0],
        heading: [-1, 0, 0]
      })
    ).toBeNull();
    expect(
      findWorldInteractionTarget({
        position: [-32, 0, 0],
        heading: [0.5, 0, Math.sqrt(3) / 2]
      })?.id
    ).toBe("airport-terminal-entry");
    expect(
      findWorldInteractionTarget({
        position: [-32, 0, 0],
        heading: [0.49, 0, Math.sqrt(1 - 0.49 ** 2)]
      })
    ).toBeNull();
  });

  it("maps five entrances and seven authored NPCs to portfolio entries", () => {
    expect(new Set(WORLD_INTERACTION_TARGETS.map(({ zoneId }) => zoneId)))
      .toEqual(new Set(["airport", "tokyo", "gyukatsu", "sakura", "hanabi"]));
    expect(
      WORLD_INTERACTION_TARGETS.filter(({ actorId }) => actorId)
    ).toHaveLength(7);
    expect(
      WORLD_INTERACTION_TARGETS.filter(({ id }) => id.endsWith("-entry"))
    ).toHaveLength(5);
    expect(
      WORLD_INTERACTION_TARGETS.every(({ entryId }) =>
        ["world-design", "character-controls", "ai-guide"].includes(entryId)
      )
    ).toBe(true);
  });

  it("skips unavailable targets and continues to another eligible target", () => {
    const available = findWorldInteractionTarget({
      position: [-32, 0, 0],
      heading: [1, 0, 0]
    });
    expect(available).not.toBeNull();
    expect(
      findWorldInteractionTarget({
        position: [-32, 0, 0],
        heading: [1, 0, 0],
        unavailableTargetIds: new Set([available!.id])
      })
    ).toBeNull();
  });

  it("keeps the Hanabi child target available when only Yukata fails", () => {
    expect(
      findWorldInteractionTarget({
        position: [21, 0, -22],
        heading: [0, 0, -1],
        unavailableTargetIds: new Set(["npc-hanabi-yukata"])
      })?.id
    ).toBe("npc-hanabi-child");
  });

  it("publishes the runtime-computed nearby target and honors availability", () => {
    const driveToAirportApproach = (runtime: WorldRuntime) => {
      const approach = [-32.1, 0] as const;
      for (let frame = 0; frame < 400; frame += 1) {
        const [x, , z] = runtime.getNavigationSnapshot().position;
        const dx = approach[0] - x;
        const dz = approach[1] - z;
        const distance = Math.hypot(dx, dz);
        if (distance < 1e-4) break;
        runtime.setMovement({
          x: dx / distance,
          y: dz / distance,
          runRequested: false
        });
        runtime.advance(Math.min(1 / 60, distance / 1.61), 0);
      }
      runtime.setMovement({ x: 1, y: 0, runRequested: false });
      runtime.advance(0.1 / 1.61, 0);
      runtime.setMovement({ x: 0, y: 0, runRequested: false });
    };

    const available = createWorldRuntime();
    driveToAirportApproach(available);
    expect(available.getNavigationSnapshot().nearInteractionId).toBe(
      "airport-terminal-entry"
    );

    const unavailable = createWorldRuntime({
      unavailableInteractionTargetIds: new Set(["airport-terminal-entry"])
    });
    driveToAirportApproach(unavailable);
    expect(unavailable.getNavigationSnapshot().nearInteractionId).toBeNull();
  });

  it("mutates target availability and a fresh runtime restores defaults", () => {
    const driveToAirportApproach = (runtime: WorldRuntime) => {
      const approach = [-32.1, 0] as const;
      for (let frame = 0; frame < 400; frame += 1) {
        const [x, , z] = runtime.getNavigationSnapshot().position;
        const dx = approach[0] - x;
        const dz = approach[1] - z;
        const distance = Math.hypot(dx, dz);
        if (distance < 1e-4) break;
        runtime.setMovement({
          x: dx / distance,
          y: dz / distance,
          runRequested: false
        });
        runtime.advance(Math.min(1 / 60, distance / 1.61), 0);
      }
      runtime.setMovement({ x: 1, y: 0, runRequested: false });
      runtime.advance(0.1 / 1.61, 0);
      runtime.setMovement({ x: 0, y: 0, runRequested: false });
    };
    const runtime = createWorldRuntime();
    driveToAirportApproach(runtime);
    expect(runtime.getNavigationSnapshot().nearInteractionId).toBe(
      "airport-terminal-entry"
    );

    const beforeDisableRevision =
      runtime.getNavigationSnapshot().revision;
    runtime.setInteractionTargetAvailable("airport-terminal-entry", false);
    const disabledRevision = runtime.getNavigationSnapshot().revision;
    expect(disabledRevision).toBe(beforeDisableRevision + 1);
    expect(runtime.getNavigationSnapshot().nearInteractionId).toBeNull();
    runtime.setInteractionTargetAvailable("airport-terminal-entry", false);
    expect(runtime.getNavigationSnapshot().revision).toBe(disabledRevision);
    runtime.setInteractionTargetAvailable("airport-terminal-entry", true);
    expect(runtime.getNavigationSnapshot().nearInteractionId).toBe(
      "airport-terminal-entry"
    );

    const freshRuntime = createWorldRuntime();
    driveToAirportApproach(freshRuntime);
    expect(freshRuntime.getNavigationSnapshot().nearInteractionId).toBe(
      "airport-terminal-entry"
    );
  });

  it("renders a prompt only for a target and uses its interaction handler", async () => {
    const user = userEvent.setup();
    const onInteract = vi.fn();
    const target = WORLD_INTERACTION_TARGETS[0];
    const { rerender } = render(
      createElement(WorldInteractionPrompt, {
        target: null,
        label: "Interact",
        onInteract
      })
    );
    expect(
      screen.queryByRole("button", { name: "Interact" })
    ).not.toBeInTheDocument();

    rerender(
      createElement(WorldInteractionPrompt, {
        target,
        label: "Interact",
        onInteract
      })
    );
    const prompt = screen.getByRole("button", { name: "Interact" });
    expect(prompt).toHaveAttribute("data-target-id", target.id);
    await user.click(prompt);
    expect(onInteract).toHaveBeenCalledTimes(1);
  });
});

function createRuntimeHarness(target: WorldInteractionTarget | null) {
  const snapshot = {
    revision: 12,
    position: Object.freeze([-32, 0, 0]),
    heading: Object.freeze([1, 0, 0]),
    nearInteractionId: target?.id ?? null
  } as unknown as WorldNavigationSnapshot;
  const runtime = {
    setMovement: vi.fn(),
    jump: vi.fn(),
    reset: vi.fn(),
    advance: vi.fn(),
    getNavigationSnapshot: vi.fn(() => snapshot),
    getCameraState: vi.fn(() => ({ yaw: 0 }))
  } as unknown as WorldRuntime;
  const input = {
    consumeReset: vi.fn(() => false),
    consumeJump: vi.fn(() => true),
    readMovement: vi.fn((movement) =>
      Object.assign(movement, { x: 1, y: 1, runRequested: true })
    ),
    consumeInteraction: vi.fn(() => true)
  } as unknown as InputController;
  const navigation = { current: snapshot };
  const telemetry = { current: null };
  return { snapshot, runtime, input, navigation, telemetry };
}

describe("RPG scene interaction runtime", () => {
  it("keeps position, heading, and revision invariant for 30 locked frames", () => {
    const runtime = createWorldRuntime();
    runtime.setMovement({ x: 1, y: 0, runRequested: true });
    runtime.advance(0.1, 0);
    const before = runtime.getNavigationSnapshot();
    const advance = vi.spyOn(runtime, "advance");
    const setMovement = vi.spyOn(runtime, "setMovement");
    const input = {
      consumeReset: vi.fn(() => false),
      consumeJump: vi.fn(() => true),
      readMovement: vi.fn(),
      consumeInteraction: vi.fn(() => true)
    } as unknown as InputController;
    const navigation = { current: before };
    render(
      createElement(RpgSceneRuntime, {
        runtime,
        input,
        navigation,
        onNavigationChange: vi.fn(),
        telemetry: { current: null },
        inputLocked: true,
        onInteractionRequest: vi.fn()
      })
    );
    const frame = vi.mocked(useFrame).mock.calls.at(-1)?.[0];
    expect(frame).toBeTypeOf("function");
    for (let index = 1; index <= 30; index += 1) {
      frame!({ clock: { elapsedTime: index / 60 } } as never, 1 / 60);
    }
    const after = runtime.getNavigationSnapshot();

    expect(setMovement).toHaveBeenCalledTimes(30);
    expect(setMovement).toHaveBeenLastCalledWith({
      x: 0,
      y: 0,
      runRequested: false
    });
    expect(advance).not.toHaveBeenCalled();
    expect(input.consumeJump).not.toHaveBeenCalled();
    expect(input.consumeInteraction).not.toHaveBeenCalled();
    expect(after.position).toEqual(before.position);
    expect(after.heading).toEqual(before.heading);
    expect(after.revision).toBe(before.revision);
  });

  it("consumes interaction after advancing and emits the mapped entry once", () => {
    const target = WORLD_INTERACTION_TARGETS[0];
    const harness = createRuntimeHarness(target);
    const onInteractionRequest = vi.fn();
    render(
      createElement(RpgSceneRuntime, {
        runtime: harness.runtime,
        input: harness.input,
        navigation: harness.navigation,
        onNavigationChange: vi.fn(),
        telemetry: harness.telemetry,
        inputLocked: false,
        onInteractionRequest
      })
    );
    const frame = vi.mocked(useFrame).mock.calls.at(-1)?.[0];
    frame!({ clock: { elapsedTime: 1 } } as never, 1 / 60);

    expect(harness.runtime.advance).toHaveBeenCalledBefore(
      vi.mocked(harness.input.consumeInteraction)
    );
    expect(onInteractionRequest).toHaveBeenCalledOnce();
    expect(onInteractionRequest).toHaveBeenCalledWith(target.entryId);
  });
});

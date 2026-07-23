import { describe, expect, it } from "vitest";
import {
  createGyukatsuInteraction,
  createGyukatsuSnapshot
} from "../app/world/GyukatsuInteraction";

describe("gyukatsu ambient interaction", () => {
  it("reacts once inside 2.5m and keeps the reaction through the hysteresis band", () => {
    const interaction = createGyukatsuInteraction();

    expect(interaction.observe(2.5)).toMatchObject({
      active: true,
      greetingTriggered: true,
      steamCount: 3
    });
    expect(interaction.observe(2.7)).toMatchObject({
      active: true,
      greetingTriggered: false,
      steamCount: 3
    });
    expect(interaction.observe(2.4)).toMatchObject({
      active: true,
      greetingTriggered: false,
      steamCount: 3
    });
  });

  it("resets only beyond 3m and greets once again on a later visit", () => {
    const interaction = createGyukatsuInteraction();

    interaction.observe(2.4);
    expect(interaction.observe(3)).toMatchObject({ active: true });
    expect(interaction.observe(3.01)).toMatchObject({
      active: false,
      greetingTriggered: false,
      steamCount: 0
    });
    expect(interaction.observe(2.5)).toMatchObject({
      active: true,
      greetingTriggered: true,
      visitCount: 2
    });
  });

  it("does not activate when first observed in the 2.5m to 3m band", () => {
    const interaction = createGyukatsuInteraction();

    expect(interaction.observe(2.75)).toMatchObject({
      active: false,
      greetingTriggered: false,
      steamCount: 0
    });
  });

  it("reuses a caller-owned snapshot during animation", () => {
    const interaction = createGyukatsuInteraction();
    const snapshot = createGyukatsuSnapshot();

    expect(interaction.observeInto(2.5, snapshot)).toBe(snapshot);
    expect(snapshot).toMatchObject({
      active: true,
      greetingTriggered: true,
      visitCount: 1
    });
    expect(interaction.observeInto(2.7, snapshot)).toBe(snapshot);
    expect(snapshot.greetingTriggered).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RPG_HANABI_BURSTS,
  RPG_HANABI_DISTANT_INTENSITY,
  getRpgHanabiRenderBudget,
  resolveRpgHanabiAdditiveMix,
  resolveRpgHanabiIntensity,
  resolveRpgSkyLuminance
} from "../app/world/RpgHanabiLayout";
import { RPG_WORLD_CAMERA_FAR } from "../app/world/RpgLightingDesign";
import {
  RPG_REGION_PRESENTATION_COLORS,
  RPG_REGION_PRESENTATION_PROFILES
} from "../app/world/RpgRegionPresentation";
import { getSceneQuality, type SceneQualityLevel } from "../app/world/SceneQuality";

const LEVELS = ["high", "medium", "low"] as const;

const read = (name: string) =>
  readFileSync(resolve(process.cwd(), `app/world/${name}`), "utf8");

/** The chase camera anchor each zone parks the visitor at. */
const ZONE_CAMERA_ANCHORS = {
  airport: [-30, 0],
  tokyo: [-8, 20],
  gyukatsu: [8, 0],
  sakura: [9, -20],
  hanabi: [26, -18]
} as const;

/** Longest boom in ChaseOrbitCamera's zone profiles, i.e. the Hanabi 9.2. */
const LONGEST_CAMERA_BOOM = 9.2;

const intensityAt = (
  hanabiZoneWeight: number,
  level: SceneQualityLevel = "high"
) =>
  resolveRpgHanabiIntensity({
    hanabiZoneWeight,
    particlesPerBurst: getSceneQuality({ level, reducedMotion: false })
      .fireworks.particlesPerBurst,
    referenceParticlesPerBurst:
      getRpgHanabiRenderBudget("high").particlesPerBurst
  });

describe("Hanabi bursts as a cross-map landmark", () => {
  it("keeps the shells burning when the walk is nowhere near Hanabi", () => {
    // The bursts are the beacon that tells the visitor where the route ends.
    // Gating them on the Hanabi zone weight faded them to nothing everywhere
    // else, which is the one place a landmark has to be readable from.
    expect(intensityAt(0)).toBeGreaterThanOrEqual(
      RPG_HANABI_DISTANT_INTENSITY * 0.9
    );
    expect(intensityAt(0)).toBeGreaterThan(0.35);
  });

  it("still peaks on arrival so Hanabi stays the strongest zone", () => {
    expect(intensityAt(1)).toBeGreaterThan(intensityAt(0));
    expect(intensityAt(1)).toBeCloseTo(1, 6);
  });

  it("rises monotonically as the walk closes on Hanabi", () => {
    let previous = -1;
    for (let weight = 0; weight <= 1.0001; weight += 0.1) {
      const value = intensityAt(Math.min(1, weight));
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });

  it("never lets a zone's own effect intensity mute the bursts", () => {
    // `effectIntensity` drives the sakura petals and sits at 0.05 in the
    // airport, so the old `zoneWeights.hanabi * effectIntensity` product was
    // zero everywhere it mattered. The bursts must clear a readable floor in
    // every zone regardless of what that petal channel is doing.
    for (const zoneId of Object.keys(ZONE_CAMERA_ANCHORS) as Array<
      keyof typeof ZONE_CAMERA_ANCHORS
    >) {
      const profile = RPG_REGION_PRESENTATION_PROFILES[zoneId];
      const weight = zoneId === "hanabi" ? 1 : 0;
      const legacy = weight * profile.effectIntensity;

      expect(intensityAt(weight), zoneId).toBeGreaterThan(0.35);
      // Every zone the visitor travels through beats the old product.
      if (zoneId !== "hanabi") {
        expect(intensityAt(weight), zoneId).toBeGreaterThan(legacy);
        expect(legacy, `${zoneId} legacy`).toBe(0);
      }
    }
  });

  it("stays visible on every quality tier, not just high", () => {
    for (const level of LEVELS) {
      expect(intensityAt(0, level), `${level} distant`).toBeGreaterThan(0.35);
      expect(intensityAt(1, level), `${level} arrival`).toBeGreaterThan(0.6);
    }
  });

  it("clamps hostile inputs instead of emitting NaN opacity", () => {
    for (const weight of [Number.NaN, Number.POSITIVE_INFINITY, -4, 9]) {
      const value = intensityAt(weight);
      expect(Number.isFinite(value), String(weight)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("keeps every burst inside the camera far plane from every zone", () => {
    for (const [zoneId, [x, z]] of Object.entries(ZONE_CAMERA_ANCHORS)) {
      for (const burst of RPG_HANABI_BURSTS) {
        const distance =
          Math.hypot(burst.position[0] - x, burst.position[2] - z) +
          burst.radius +
          LONGEST_CAMERA_BOOM;
        expect(distance, `${zoneId} -> ${burst.id}`).toBeLessThan(
          RPG_WORLD_CAMERA_FAR
        );
      }
    }
  });

  it("takes the fireworks out of the fog so distance cannot wash them out", () => {
    // Three mixes the fragment toward the fog colour and only then blends it
    // additively, so a fogged spark ADDS bright sky instead of fading. At the
    // airport the bursts sit past the fog far plane, which turned every shell
    // into a glowing rectangle of haze.
    const source = read("RpgWorldEffects.tsx");
    const materials = source
      .split("<pointsMaterial")
      .slice(1)
      .filter((chunk) => chunk.slice(0, chunk.indexOf("/>")).includes("blending"));

    expect(materials.length).toBeGreaterThanOrEqual(2);
    for (const material of materials) {
      expect(material.slice(0, material.indexOf("/>"))).toContain("fog={false}");
    }
  });

  it("no longer gates the burst intensity on the Hanabi zone weight", () => {
    // Reading the weight is fine — it is what ramps the shells up on arrival.
    // Multiplying the opacity by it is the defect: it zeroed the bursts the
    // moment the walk left the zone.
    const source = read("RpgWorldEffects.tsx");

    expect(source).toContain("resolveRpgHanabiIntensity");
    expect(source).not.toMatch(/zoneWeights\.hanabi\s*\*/);
    expect(source).not.toMatch(/hanabiIntensity\s*=\s*[^;]*effectIntensity/);
  });

  it("cross-fades between the two blend modes instead of switching one", () => {
    // Additive washes a daylight burst toward white; normal blending keeps its
    // hue but cannot glow at night. Flipping between them is a visible pop and
    // it would land inside the sakura->hanabi transition. Each shell is drawn
    // on both modes and cross-faded by opacity, which is the same composite
    // without anything to pop.
    const source = read("RpgWorldEffects.tsx");
    const materials = source
      .split("<pointsMaterial")
      .slice(1)
      .map((chunk) => chunk.slice(0, chunk.indexOf("/>")))
      .filter((chunk) => chunk.includes("blending"));

    expect(materials.filter((m) => m.includes("blending={2}")).length)
      .toBeGreaterThanOrEqual(2);
    expect(materials.filter((m) => m.includes("blending={1}")).length)
      .toBeGreaterThanOrEqual(1);
    // A mode that changes at runtime is exactly the pop this avoids.
    expect(source).not.toContain("material.blending =");
    expect(source).toContain("resolveRpgHanabiAdditiveMix");
  });

  it("keeps a shell as bright at every point of the cross-fade", () => {
    // The two layers are one shell. If they did not sum to its opacity the
    // burst would dim or bloom halfway through the walk into the festival.
    for (const luminance of [0, 0.05, 0.2, 0.35, 0.5, 0.9, 4]) {
      const mix = resolveRpgHanabiAdditiveMix(luminance);
      expect(mix).toBeGreaterThanOrEqual(0);
      expect(mix).toBeLessThanOrEqual(1);
      expect(mix + (1 - mix)).toBeCloseTo(1, 12);
    }
    const source = read("RpgWorldEffects.tsx");
    expect(source).toMatch(/opacity\s*=\s*frame\.opacity \* additiveMix/);
    expect(source).toMatch(/frame\.opacity \* \(1 - additiveMix\)/);
  });

  it("glows under the festival night and shows its colour under daylight", () => {
    const night = resolveRpgSkyLuminance(
      RPG_REGION_PRESENTATION_COLORS.hanabi.sky
    );
    expect(resolveRpgHanabiAdditiveMix(night)).toBeCloseTo(1, 6);

    // Every other zone is daylit or dusk, and a glow clips to white speckle
    // over all of them, so each one has to be carrying hue instead.
    for (const zone of ["airport", "tokyo", "gyukatsu", "sakura"] as const) {
      const luminance = resolveRpgSkyLuminance(
        RPG_REGION_PRESENTATION_COLORS[zone].sky
      );
      expect(
        resolveRpgHanabiAdditiveMix(luminance),
        `${zone} sky`
      ).toBeCloseTo(0, 6);
    }
  });

  it("moves between the two smoothly rather than in a step", () => {
    // A sampled sweep across the whole range: no single step may carry more
    // than a small part of the change, which is what a mode flip would.
    let previous = resolveRpgHanabiAdditiveMix(0);
    let biggestStep = 0;
    for (let step = 1; step <= 200; step += 1) {
      const luminance = (step / 200) * 0.6;
      const mix = resolveRpgHanabiAdditiveMix(luminance);
      biggestStep = Math.max(biggestStep, Math.abs(mix - previous));
      expect(mix).toBeLessThanOrEqual(previous + 1e-12);
      previous = mix;
    }
    expect(biggestStep).toBeLessThan(0.05);
  });

  it("authors every shell centre above the tallest building in the town", () => {
    // The tallest non-Hanabi landmark tops out at 7.3 (tokyo-blue-tower).
    // NOTE: this only says the shells are authored higher than the skyline in
    // absolute height. It does NOT establish that they clear a building from
    // any given viewpoint — a 7.3-tall block 15 units away hides anything
    // under 12.1 units seen from 26 units, which is why the shells are still
    // occluded from parts of the Hanabi street.
    for (const burst of RPG_HANABI_BURSTS) {
      expect(burst.position[1], burst.id).toBeGreaterThan(7.3);
    }
  });
});

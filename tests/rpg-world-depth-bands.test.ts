import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRpgWorldDepthBandOutcome,
  RPG_WORLD_DEPTH_BAND_FIXTURES,
  RPG_WORLD_DEPTH_BAND_IDS,
  resolveRpgWorldDepthBands
} from "../app/world/RpgWorldDepthBands";
import {
  isWalkable,
  projectWorldToReference
} from "../app/world/RpgWorldGeometry";
import {
  RPG_WORLD_BRIDGE,
  RPG_WORLD_ARRIVALS,
  RPG_WORLD_LANDMARKS,
  type WorldPoint2
} from "../app/world/RpgWorldModel";
import {
  RPG_WORLD_BACKDROP_ASSET,
  RPG_WORLD_BACKDROP_IMAGE_SIZE,
  RPG_WORLD_BACKDROP_MOBILE_SAFE_FRAME,
  RpgWorldBackdrop,
  resolveRpgWorldBackdropLayout,
  type RpgWorldBackdropHandle
} from "../app/world/RpgWorldBackdrop";
import {
  RpgTownScene,
  resolveRpgTownSceneRenderContract
} from "../app/world/RpgTownScene";
import {
  RpgTownAmbience,
  resolveRpgTownAmbienceRenderContract
} from "../app/world/RpgTownAmbience";

afterEach(cleanup);

type CanonicalFixtureId =
  | "sakura-bridge"
  | "sakura-tree-01"
  | "district-volume-tokyo-corner-tower";

const CROSSING_PROBES: Readonly<
  Record<
    CanonicalFixtureId,
    { readonly behind: WorldPoint2; readonly front: WorldPoint2 }
  >
> = {
  "sakura-bridge": {
    behind: [16.6, -16.5],
    front: [16.6, -17.5]
  },
  "sakura-tree-01": {
    behind: [12.7, -29.7],
    front: [12.7, -35.5]
  },
  "district-volume-tokyo-corner-tower": {
    behind: [1.5, 27.5],
    front: [1.5, 22.9]
  }
};

function polygonCenter(polygon: readonly (readonly [number, number])[]) {
  const xs = polygon.map(([x]) => x);
  const zs = polygon.map(([, z]) => z);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...zs) + Math.max(...zs)) / 2
  ] as const;
}

describe("RPG world depth bands", () => {
  it("lays out one unmodified approved-image backdrop for desktop and mobile", () => {
    const desktop = resolveRpgWorldBackdropLayout({
      sourceOffset: 200,
      backdropScale: 900 / 866,
      safeFrame: { x: 0, y: 0, width: 1440, height: 900 }
    })!;
    const mobile = resolveRpgWorldBackdropLayout({
      sourceOffset: 500,
      backdropScale: 420 / 866,
      safeFrame: RPG_WORLD_BACKDROP_MOBILE_SAFE_FRAME
    })!;

    expect(desktop.asset).toBe(RPG_WORLD_BACKDROP_ASSET);
    expect(desktop.imageSize).toBe(RPG_WORLD_BACKDROP_IMAGE_SIZE);
    expect(desktop.imageFrame.width / desktop.imageFrame.height).toBeCloseTo(
      1817 / 866,
      12
    );
    expect(desktop.safeFrame).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
    expect(mobile.safeFrame).toEqual({ x: 0, y: 64, width: 390, height: 420 });
    expect(mobile.imageFrame.width / mobile.imageFrame.height).toBeCloseTo(
      1817 / 866,
      12
    );
    expect(mobile.sourceWindow).toEqual({
      minimumX: 500,
      maximumX: 500 + 390 / (420 / 866),
      minimumY: 0,
      maximumY: 866
    });
    expect(mobile.renderPolicy).toEqual({
      imageInstances: 1,
      repeat: false,
      opacity: 1,
      filter: "none",
      mixBlendMode: "normal",
      canvasToneMapped: false,
      canvasFog: false
    });

    const view = render(
      createElement(RpgWorldBackdrop, {
        sourceOffset: 500,
        backdropScale: 420 / 866,
        safeFrame: RPG_WORLD_BACKDROP_MOBILE_SAFE_FRAME,
        style: { overflow: "visible", background: "red" }
      })
    );
    const frame = view.container.querySelector(
      '[data-rpg-world-backdrop="approved-image"]'
    ) as HTMLElement;
    const images = frame.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("src")).toBe(RPG_WORLD_BACKDROP_ASSET);
    expect(frame.style.overflow).toBe("hidden");
    expect(frame.style.background).toBe("transparent");
    expect(frame.style.top).toBe("64px");
    expect(frame.style.height).toBe("420px");
    expect(images[0].style.opacity).toBe("1");
    expect(images[0].style.filter).toBe("none");
    expect(images[0].style.mixBlendMode).toBe("normal");
    expect(
      Number.parseFloat(images[0].style.width) /
        Number.parseFloat(images[0].style.height)
    ).toBeCloseTo(1817 / 866, 12);
  });

  it("applies stepped live layout to the same decoded image without a React rerender", async () => {
    const handle = createRef<RpgWorldBackdropHandle>();
    const readyChanges: boolean[] = [];
    const view = render(
      createElement(RpgWorldBackdrop, {
        ref: handle,
        sourceOffset: 500,
        backdropScale: 420 / 866,
        safeFrame: RPG_WORLD_BACKDROP_MOBILE_SAFE_FRAME,
        onReadyChange: (ready) => readyChanges.push(ready)
      })
    );
    const frame = view.container.querySelector(
      '[data-rpg-world-backdrop="approved-image"]'
    ) as HTMLElement;
    const image = frame.querySelector("img") as HTMLImageElement;
    const decode = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(image, "decode", {
      configurable: true,
      value: decode
    });

    fireEvent.load(image);
    await waitFor(() => {
      expect(frame.dataset.rpgWorldBackdropReady).toBe("true");
    });
    expect(decode).toHaveBeenCalledTimes(1);
    expect(readyChanges).toEqual([false, true]);
    expect(frame.dataset.rpgWorldBackdropDecode).toBe("ready");
    expect(frame.dataset.rpgWorldBackdropDecodeSupported).toBe("true");
    expect(frame.dataset.rpgWorldBackdropDecodeReady).toBe("true");

    const steppedLayout = {
      sourceOffset: 600,
      backdropScale: 0.5,
      safeFrame: { x: 12, y: 80, width: 360, height: 433 }
    } as const;
    let applied = false;
    act(() => {
      applied = handle.current!.applyLayout(steppedLayout);
    });

    expect(applied).toBe(true);
    expect(view.container.querySelectorAll("img")).toHaveLength(1);
    expect(view.container.querySelector("img")).toBe(image);
    expect(
      view.container.querySelector(
        '[data-rpg-world-backdrop="approved-image"]'
      )
    ).toBe(frame);
    expect(image.getAttribute("src")).toBe(RPG_WORLD_BACKDROP_ASSET);
    expect(frame.style.left).toBe("12px");
    expect(frame.style.top).toBe("80px");
    expect(frame.style.width).toBe("360px");
    expect(frame.style.height).toBe("433px");
    expect(image.style.left).toBe("-300px");
    expect(image.style.width).toBe("908.5px");
    expect(frame.dataset.rpgWorldBackdropImageCount).toBe("1");
    expect(frame.dataset.rpgWorldBackdropAsset).toBe(
      RPG_WORLD_BACKDROP_ASSET
    );
    expect(frame.dataset.rpgWorldBackdropSourceOffset).toBe("600");
    expect(frame.dataset.rpgWorldBackdropScale).toBe("0.5");
    expect(frame.dataset.rpgWorldBackdropSafeFrame).toBe("12,80,360,433");
    expect(frame.dataset.rpgWorldBackdropReady).toBe("true");
    expect(readyChanges).toEqual([false, true]);

    act(() => {
      applied = handle.current!.applyLayout({
        ...steppedLayout,
        sourceOffset: Number.NaN
      });
    });
    expect(applied).toBe(false);
    expect(frame.hidden).toBe(true);
    expect(frame.dataset.rpgWorldBackdropLayout).toBe("invalid");
    expect(frame.dataset.rpgWorldBackdropReady).toBe("false");
    expect(readyChanges.at(-1)).toBe(false);

    act(() => {
      applied = handle.current!.applyLayout(steppedLayout);
    });
    expect(applied).toBe(true);
    expect(frame.hidden).toBe(false);
    expect(frame.dataset.rpgWorldBackdropReady).toBe("true");
    expect(readyChanges.at(-1)).toBe(true);
    view.unmount();
    expect(readyChanges.at(-1)).toBe(false);
  });

  it("stays unready for decode, source, and image errors", async () => {
    const readyChanges: boolean[] = [];
    const view = render(
      createElement(RpgWorldBackdrop, {
        sourceOffset: 500,
        backdropScale: 420 / 866,
        safeFrame: RPG_WORLD_BACKDROP_MOBILE_SAFE_FRAME,
        onReadyChange: (ready) => readyChanges.push(ready)
      })
    );
    const frame = view.container.querySelector(
      '[data-rpg-world-backdrop="approved-image"]'
    ) as HTMLElement;
    const image = frame.querySelector("img") as HTMLImageElement;
    Object.defineProperty(image, "decode", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error("decode failed"))
    });

    fireEvent.load(image);
    await waitFor(() => {
      expect(frame.dataset.rpgWorldBackdropDecode).toBe("error");
    });
    expect(frame.dataset.rpgWorldBackdropReady).toBe("false");
    expect(frame.dataset.rpgWorldBackdropDecodeReady).toBe("false");
    expect(readyChanges).toEqual([false]);

    Object.defineProperty(image, "decode", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined)
    });
    fireEvent.load(image);
    await waitFor(() => {
      expect(frame.dataset.rpgWorldBackdropReady).toBe("true");
    });
    expect(readyChanges.at(-1)).toBe(true);

    image.setAttribute("src", "/assets/world/not-approved.png");
    fireEvent.load(image);
    expect(frame.dataset.rpgWorldBackdropDecode).toBe("source-error");
    expect(frame.dataset.rpgWorldBackdropReady).toBe("false");
    expect(readyChanges.at(-1)).toBe(false);
    fireEvent.error(image);
    expect(frame.dataset.rpgWorldBackdropDecode).toBe("error");
    expect(view.container.querySelectorAll("img")).toHaveLength(1);
  });

  it("becomes ready on load when decode is unavailable", async () => {
    const readyChanges: boolean[] = [];
    const view = render(
      createElement(RpgWorldBackdrop, {
        sourceOffset: 500,
        backdropScale: 420 / 866,
        safeFrame: RPG_WORLD_BACKDROP_MOBILE_SAFE_FRAME,
        onReadyChange: (ready) => readyChanges.push(ready)
      })
    );
    const frame = view.container.querySelector(
      '[data-rpg-world-backdrop="approved-image"]'
    ) as HTMLElement;
    const image = frame.querySelector("img") as HTMLImageElement;
    Object.defineProperty(image, "decode", {
      configurable: true,
      value: undefined
    });

    fireEvent.load(image);
    await waitFor(() => {
      expect(frame.dataset.rpgWorldBackdropReady).toBe("true");
    });
    expect(frame.dataset.rpgWorldBackdropDecode).toBe("ready");
    expect(frame.dataset.rpgWorldBackdropDecodeSupported).toBe("false");
    expect(frame.dataset.rpgWorldBackdropDecodeReady).toBe("true");
    expect(readyChanges).toEqual([false, true]);
  });

  it("renders deterministic SSR telemetry for one approved image", () => {
    const props = {
      sourceOffset: 500,
      backdropScale: 420 / 866,
      safeFrame: RPG_WORLD_BACKDROP_MOBILE_SAFE_FRAME
    } as const;
    const first = renderToStaticMarkup(
      createElement(RpgWorldBackdrop, props)
    );
    const second = renderToStaticMarkup(
      createElement(RpgWorldBackdrop, props)
    );

    expect(first).toBe(second);
    expect(first.match(/<img/g)).toHaveLength(1);
    expect(first).toContain(`src="${RPG_WORLD_BACKDROP_ASSET}"`);
    expect(first).toContain('data-rpg-world-backdrop-image-count="1"');
    expect(first).toContain('data-rpg-world-backdrop-source-offset="500"');
    expect(first).toContain('data-rpg-world-backdrop-ready="false"');
    expect(first).toContain('data-rpg-world-backdrop-decode-ready="false"');
  });

  it("fails backdrop layout closed for invalid placement instead of repeating or stretching", () => {
    const valid = {
      sourceOffset: 0,
      backdropScale: 420 / 866,
      safeFrame: RPG_WORLD_BACKDROP_MOBILE_SAFE_FRAME
    } as const;
    expect(resolveRpgWorldBackdropLayout({ ...valid, sourceOffset: Number.NaN })).toBeNull();
    expect(resolveRpgWorldBackdropLayout({ ...valid, backdropScale: 0 })).toBeNull();
    expect(resolveRpgWorldBackdropLayout({ ...valid, sourceOffset: 1200 })).toBeNull();
    expect(
      resolveRpgWorldBackdropLayout({
        ...valid,
        safeFrame: { ...valid.safeFrame, height: 419 }
      })
    ).toBeNull();
    const handle = createRef<RpgWorldBackdropHandle>();
    const readyChanges: boolean[] = [];
    const invalidView = render(
      createElement(RpgWorldBackdrop, {
        ...valid,
        ref: handle,
        sourceOffset: Number.POSITIVE_INFINITY,
        onReadyChange: (ready) => readyChanges.push(ready)
      })
    );
    expect(invalidView.container.childElementCount).toBe(0);
    expect(readyChanges).toEqual([false]);
    expect(handle.current!.applyLayout(valid)).toBe(false);
  });

  it("keeps the live scene and ambience transparent with no competing environment", () => {
    expect(resolveRpgTownSceneRenderContract()).toEqual({
      approvedBackdropOwner: "RpgWorldBackdrop",
      canonicalDepthForegroundOwner: "FlatWorldCanvas",
      background: false,
      fog: false,
      lighting: false,
      horizon: false,
      ground: false,
      buildings: false,
      landmarkDuplicates: false,
      npcCrowd: false
    });
    expect(resolveRpgTownAmbienceRenderContract()).toEqual({
      transparent: true,
      background: null,
      fog: null,
      lights: 0,
      colorOverlay: null,
      particles: 0
    });

    const scene = render(createElement(RpgTownScene));
    expect(scene.container.childElementCount).toBe(0);
    const ambience = render(
      createElement(RpgTownAmbience, { qualityLevel: "high" })
    );
    expect(ambience.container.childElementCount).toBe(0);
  });

  it("selects semantic approved-image bands plus three model-derived fixtures", () => {
    expect(RPG_WORLD_DEPTH_BAND_IDS).toEqual([
      "airport-shelter-planter",
      "sakura-bridge",
      "sakura-tree-01",
      "district-volume-tokyo-corner-tower",
      "hanabi-rail-post"
    ]);
    expect(RPG_WORLD_DEPTH_BAND_FIXTURES.map(({ id }) => id)).toEqual(
      [
        "sakura-bridge",
        "sakura-tree-01",
        "district-volume-tokyo-corner-tower"
      ]
    );
    for (const fixture of RPG_WORLD_DEPTH_BAND_FIXTURES) {
      const canonical = RPG_WORLD_LANDMARKS.find(({ id }) => id === fixture.id)!;
      expect(fixture.position).toBe(canonical.position);
      expect(fixture.size).toBe(canonical.size);
      expect(fixture.kind).toBe(canonical.kind);
      expect(fixture.color).toBe(canonical.color);
      expect(fixture.accent).toBe(canonical.accent);
      expect(fixture.referenceSamples).toHaveLength(6);
      expect(fixture.depthKey).toBe(fixture.occlusionAnchor.depthKey);
      expect(fixture.referenceMask.behindEdgeY).toBeLessThan(
        fixture.referenceMask.frontEdgeY
      );
      const projected = fixture.referenceSamples.map(({ worldXZ }) =>
        projectWorldToReference(worldXZ)
      );
      expect(projected.every(Boolean), fixture.id).toBe(true);
      fixture.referenceSamples.forEach((sample, index) => {
        expect(sample.pixel, fixture.id).toEqual(projected[index]!.pixel);
        expect(sample.depthKey, fixture.id).toBe(projected[index]!.depthKey);
      });
      expect(
        new Set(
          fixture.referenceSamples
            .slice(0, 3)
            .map(({ pixel }) => pixel[0].toFixed(9))
        ).size,
        fixture.id
      ).toBeGreaterThan(1);
      expect(fixture.referenceSamples[4].depthKey, fixture.id).toBeGreaterThan(
        fixture.referenceSamples[1].depthKey
      );
    }
  });

  it.each([
    ["airport", "airport-shelter-planter"],
    ["hanabi", "hanabi-rail-post"]
  ] as const)(
    "activates the partial same-source %s foreground behind the arrival player",
    (zoneId, bandId) => {
      const arrival = RPG_WORLD_ARRIVALS.find(
        ({ zoneId: candidate }) => candidate === zoneId
      )!;
      const outcome = getRpgWorldDepthBandOutcome(
        bandId,
        arrival.position
      );
      expect(outcome).toMatchObject({
        activeBand: bandId,
        crossing: "behind"
      });
      expect(outcome!.foregroundRenderOrder).toBeGreaterThan(
        outcome!.playerRenderOrder
      );
    }
  );

  it("applies real front and behind ordering on the canonical bridge route", () => {
    const fixtureId = "sakura-bridge" as const;
    const fixture = RPG_WORLD_DEPTH_BAND_FIXTURES.find(
      ({ id }) => id === fixtureId
    )!;
    const probes = CROSSING_PROBES[fixtureId];
    const behind = getRpgWorldDepthBandOutcome(fixtureId, probes.behind)!;
    const front = getRpgWorldDepthBandOutcome(fixtureId, probes.front)!;

    expect(behind).toMatchObject({
      activeBand: fixtureId,
      crossing: "behind"
    });
    expect(front).toMatchObject({ activeBand: fixtureId, crossing: "front" });

    const behindResolution = resolveRpgWorldDepthBands(probes.behind)!;
    expect(behindResolution.foregroundRenderOrder).toBeGreaterThan(
      behindResolution.playerRenderOrder
    );

    const frontResolution = resolveRpgWorldDepthBands(probes.front)!;
    expect(frontResolution.foregroundRenderOrder).toBeLessThan(
      frontResolution.playerRenderOrder
    );
    expect(fixture.referenceMask.minimumX).toBeLessThan(
      fixture.referenceMask.maximumX
    );
  });

  it.each([
    "sakura-tree-01",
    "district-volume-tokyo-corner-tower"
  ] as const)(
    "keeps the canonical but off-route $id foreground inactive at old crossing probes",
    (fixtureId) => {
      const probes = CROSSING_PROBES[fixtureId];
      for (const probe of [probes.behind, probes.front]) {
        expect(isWalkable(probe), `${fixtureId}:${probe}`).toBe(false);
        expect(getRpgWorldDepthBandOutcome(fixtureId, probe)).toBeNull();
        expect(resolveRpgWorldDepthBands(probe)).toBeNull();
      }
    }
  );

  it("keeps the bridge depth authority projection-derived without a live 3D foreground", () => {
    const fixture = RPG_WORLD_DEPTH_BAND_FIXTURES.find(
      ({ id }) => id === "sakura-bridge"
    )!;
    const [centerX, centerZ] = polygonCenter(RPG_WORLD_BRIDGE.polygon);
    expect(fixture.position[0]).toBe(centerX);
    expect(fixture.position[2]).toBe(centerZ);
    expect(fixture.referenceSamples).toHaveLength(6);
    expect(fixture.occlusionAnchor.depthKey).toBe(fixture.depthKey);
  });

  it("keeps tree and building fixtures as semantic depth data only", () => {
    expect(
      RPG_WORLD_DEPTH_BAND_FIXTURES.map(({ id, kind }) => [id, kind])
    ).toEqual([
      ["sakura-bridge", "bridge"],
      ["sakura-tree-01", "sakuraTree"],
      ["district-volume-tokyo-corner-tower", "tower"]
    ]);
  });

  it("fails player depth resolution closed for non-walkable or nonfinite positions", () => {
    expect(projectWorldToReference([16.6, 0])).not.toBeNull();
    expect(isWalkable([16.6, 0])).toBe(false);
    expect(resolveRpgWorldDepthBands([16.6, 0])).toBeNull();
    expect(resolveRpgWorldDepthBands([Number.NaN, 0])).toBeNull();
    expect(resolveRpgWorldDepthBands([0, Number.POSITIVE_INFINITY])).toBeNull();
    expect(resolveRpgWorldDepthBands([0, Number.NaN, 0])).toBeNull();
    expect(
      getRpgWorldDepthBandOutcome("sakura-bridge", [16.6, 0])
    ).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { FortuneGuideRequest } from "../app/guide/GuideContract";
import {
  createSingleFlightRequester,
  getGuideClientId,
  getAllowedDestinationIds,
  getTokyoDate,
  loadCachedFortune,
  postGuideRequest
} from "../app/guide/GuideClient";

const request: FortuneGuideRequest = {
  mode: "fortune",
  currentZoneId: "airport",
  allowedDestinationIds: ["tokyo", "gyukatsu", "sakura", "hanabi"],
  tokyoDate: "2026-07-21"
};

describe("guide client request", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the Tokyo calendar date and excludes the current zone", () => {
    expect(getTokyoDate(new Date("2026-07-20T15:05:00.000Z"))).toBe(
      "2026-07-21"
    );
    expect(getAllowedDestinationIds("sakura")).toEqual([
      "airport",
      "tokyo",
      "gyukatsu",
      "hanabi"
    ]);
  });

  it("posts the strict contract and validates the returned IDs again", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          recommendation: {
            destinationId: "hanabi",
            themeId: "celebration",
            basis: "fortune"
          }
        }),
        { status: 200 }
      )
    );

    await expect(
      postGuideRequest(request, {
        fetcher,
        clientId: "123e4567-e89b-42d3-a456-426614174000"
      })
    ).resolves.toEqual({
      destinationId: "hanabi",
      themeId: "celebration",
      basis: "fortune"
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/guide",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(request),
        cache: "no-store",
        headers: expect.objectContaining({
          "X-Guide-Client-Id": "123e4567-e89b-42d3-a456-426614174000"
        })
      })
    );

    fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          recommendation: {
            destinationId: "moon",
            themeId: "celebration",
            basis: "fortune"
          }
        }),
        { status: 200 }
      )
    );
    await expect(
      postGuideRequest(request, {
        fetcher,
        clientId: "123e4567-e89b-42d3-a456-426614174000"
      })
    ).rejects.toThrow("guide_unavailable");
  });

  it("deduplicates the same in-flight selection", async () => {
    let finish: ((value: string) => void) | undefined;
    const task = vi.fn(
      () => new Promise<string>((resolve) => (finish = resolve))
    );
    const requester = createSingleFlightRequester({ timeoutMs: 5000 });

    const first = requester.request("fortune", task);
    const second = requester.request("fortune", task);
    expect(first).toBe(second);
    expect(task).toHaveBeenCalledTimes(1);

    finish?.("ready");
    await expect(first).resolves.toEqual({ status: "success", value: "ready" });
  });

  it("turns a five-second timeout into failure and aborts the task", async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    const requester = createSingleFlightRequester({ timeoutMs: 5000 });
    const result = requester.request("weather", (signal) => {
      capturedSignal = signal;
      return new Promise(() => undefined);
    });

    await vi.advanceTimersByTimeAsync(5000);

    expect(capturedSignal?.aborted).toBe(true);
    await expect(result).resolves.toEqual({ status: "failure" });
  });

  it("ignores a response that arrives after cancel even if its task ignores abort", async () => {
    let finish: ((value: string) => void) | undefined;
    const requester = createSingleFlightRequester({ timeoutMs: 5000 });
    const result = requester.request(
      "fortune",
      () => new Promise<string>((resolve) => (finish = resolve))
    );

    requester.cancel();
    finish?.("too late");

    await expect(result).resolves.toEqual({ status: "ignored" });
  });

  it("restores only an ID-based fortune from the same Tokyo date", () => {
    const recommendation = {
      destinationId: "sakura",
      themeId: "connection",
      basis: "fortune"
    };
    const storage = {
      getItem: vi.fn().mockReturnValue(
        JSON.stringify({ tokyoDate: "2026-07-21", recommendation })
      ),
      setItem: vi.fn()
    };

    expect(
      loadCachedFortune(storage, "2026-07-21", [
        "airport",
        "tokyo",
        "gyukatsu",
        "sakura",
        "hanabi"
      ])
    ).toEqual(recommendation);
    expect(
      loadCachedFortune(storage, "2026-07-21", [
        "airport",
        "tokyo",
        "gyukatsu",
        "hanabi"
      ])
    ).toBeNull();
    expect(
      loadCachedFortune(storage, "2026-07-22", [
        "airport",
        "tokyo",
        "gyukatsu",
        "sakura",
        "hanabi"
      ])
    ).toBeNull();
    storage.getItem.mockReturnValueOnce(
      JSON.stringify({
        tokyoDate: "2026-07-21",
        recommendation: { ...recommendation, message: "unreviewed prose" }
      })
    );
    expect(
      loadCachedFortune(storage, "2026-07-21", [
        "airport",
        "tokyo",
        "gyukatsu",
        "sakura",
        "hanabi"
      ])
    ).toBeNull();
  });

  it("reuses one browser-generated anonymous client ID without exposing a secret", () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn()
    };
    const cryptoSource = {
      randomUUID: vi.fn().mockReturnValue("123e4567-e89b-42d3-a456-426614174000")
    };

    expect(getGuideClientId(storage, cryptoSource)).toBe(
      "123e4567-e89b-42d3-a456-426614174000"
    );
    expect(storage.setItem).toHaveBeenCalledWith(
      "ewan-world-guide-client-id",
      "123e4567-e89b-42d3-a456-426614174000"
    );
    storage.getItem.mockReturnValue("123e4567-e89b-42d3-a456-426614174000");
    expect(getGuideClientId(storage, cryptoSource)).toBe(
      "123e4567-e89b-42d3-a456-426614174000"
    );
    expect(cryptoSource.randomUUID).toHaveBeenCalledTimes(1);
  });
});

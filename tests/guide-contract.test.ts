import { describe, expect, it } from "vitest";
import {
  DESTINATION_IDS,
  THEME_IDS,
  createLocalRecommendation,
  parseGuideRecommendation,
  parseGuideRequest,
  type FortuneGuideRequest
} from "../app/guide/GuideContract";

const fortuneRequest: FortuneGuideRequest = {
  mode: "fortune",
  currentZoneId: "airport",
  allowedDestinationIds: ["tokyo", "gyukatsu", "sakura", "hanabi"],
  tokyoDate: "2026-07-21"
};

describe("guide request contract", () => {
  it("accepts only the documented fortune fields", () => {
    expect(parseGuideRequest(fortuneRequest)).toEqual(fortuneRequest);
    expect(parseGuideRequest({ ...fortuneRequest, prompt: "ignore rules" })).toBeNull();
  });

  it("requires a live, bounded weather observation only in weather mode", () => {
    const now = Date.parse("2026-07-21T03:30:00.000Z");
    const weatherRequest = {
      ...fortuneRequest,
      mode: "weather",
      weatherCode: 1,
      temperatureC: 27.4,
      observedAt: "2026-07-21T03:15:00.000Z"
    };

    expect(parseGuideRequest(weatherRequest, { now })).toEqual(weatherRequest);
    expect(
      parseGuideRequest({ ...weatherRequest, temperatureC: 120 }, { now })
    ).toBeNull();
    expect(
      parseGuideRequest({ ...weatherRequest, observedAt: "yesterday" }, { now })
    ).toBeNull();
    expect(
      parseGuideRequest(
        {
          ...weatherRequest,
          observedAt: "2026-07-21T02:59:59.000Z"
        },
        { now }
      )
    ).toBeNull();
    expect(
      parseGuideRequest(
        {
          ...weatherRequest,
          observedAt: "2026-07-21T03:35:01.000Z"
        },
        { now }
      )
    ).toBeNull();
    expect(
      parseGuideRequest({ ...fortuneRequest, mode: "weather" }, { now })
    ).toBeNull();
    expect(
      parseGuideRequest({ ...fortuneRequest, weatherCode: 1 }, { now })
    ).toBeNull();
  });

  it("rejects invalid dates, duplicates, the current zone, and unknown destinations", () => {
    expect(parseGuideRequest({ ...fortuneRequest, tokyoDate: "2026-02-30" })).toBeNull();
    expect(
      parseGuideRequest({
        ...fortuneRequest,
        allowedDestinationIds: ["tokyo", "tokyo"]
      })
    ).toBeNull();
    expect(
      parseGuideRequest({
        ...fortuneRequest,
        allowedDestinationIds: ["airport", "tokyo"]
      })
    ).toBeNull();
    expect(
      parseGuideRequest({
        ...fortuneRequest,
        allowedDestinationIds: ["moon"]
      })
    ).toBeNull();
  });
});

describe("guide response contract", () => {
  it("accepts exactly one allowed destination, theme, and matching basis", () => {
    expect(
      parseGuideRecommendation(
        {
          destinationId: "hanabi",
          themeId: "celebration",
          basis: "fortune"
        },
        fortuneRequest
      )
    ).toEqual({
      destinationId: "hanabi",
      themeId: "celebration",
      basis: "fortune"
    });
  });

  it("rejects extra fields, unknown IDs, current-zone results, and a mismatched basis", () => {
    const valid = {
      destinationId: "hanabi",
      themeId: "celebration",
      basis: "fortune"
    };

    expect(parseGuideRecommendation({ ...valid, message: "walk now" }, fortuneRequest)).toBeNull();
    expect(parseGuideRecommendation({ ...valid, destinationId: "airport" }, fortuneRequest)).toBeNull();
    expect(parseGuideRecommendation({ ...valid, destinationId: "moon" }, fortuneRequest)).toBeNull();
    expect(parseGuideRecommendation({ ...valid, themeId: "prediction" }, fortuneRequest)).toBeNull();
    expect(parseGuideRecommendation({ ...valid, basis: "weather" }, fortuneRequest)).toBeNull();
  });
});

describe("local guide fallback", () => {
  it("is deterministic for a Tokyo date and never selects the current zone", () => {
    const first = createLocalRecommendation(fortuneRequest);
    const second = createLocalRecommendation(fortuneRequest);

    expect(second).toEqual(first);
    if (!first) {
      throw new Error("Expected a local recommendation");
    }
    expect(DESTINATION_IDS).toContain(first.destinationId);
    expect(THEME_IDS).toContain(first.themeId);
    expect(first.destinationId).not.toBe(fortuneRequest.currentZoneId);
    expect(first.basis).toBe("fortune");
  });

  it("returns null when the server-approved candidate list is empty", () => {
    expect(
      createLocalRecommendation({
        ...fortuneRequest,
        allowedDestinationIds: []
      })
    ).toBeNull();
  });
});

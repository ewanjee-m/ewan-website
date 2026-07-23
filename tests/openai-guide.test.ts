import { describe, expect, it, vi } from "vitest";
import type { FortuneGuideRequest } from "../app/guide/GuideContract";
import {
  OPENAI_RESPONSES_URL,
  requestOpenAIGuideRecommendation
} from "../app/guide/OpenAIGuide";

const request: FortuneGuideRequest = {
  mode: "fortune",
  currentZoneId: "airport",
  allowedDestinationIds: ["tokyo", "gyukatsu", "sakura", "hanabi"],
  tokyoDate: "2026-07-21"
};
const safetyIdentifier = "123e4567-e89b-42d3-a456-426614174000";

function successResponse(value: unknown) {
  return new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(value) }]
        }
      ]
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("OpenAI guide service", () => {
  it("uses Responses with a strict, allowlisted schema and returns a validated result", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      successResponse({
        destinationId: "hanabi",
        themeId: "celebration",
        basis: "fortune"
      })
    );

    await expect(
      requestOpenAIGuideRecommendation(request, {
        apiKey: "test-server-key",
        model: "gpt-5.6-luna",
        safetyIdentifier,
        fetcher
      })
    ).resolves.toEqual({
      destinationId: "hanabi",
      themeId: "celebration",
      basis: "fortune"
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(OPENAI_RESPONSES_URL);
    expect(init.headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer test-server-key" })
    );
    const body = JSON.parse(String(init.body));
    expect(body).toEqual(
      expect.objectContaining({
        model: "gpt-5.6-luna",
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 120,
        safety_identifier: "123e4567-e89b-42d3-a456-426614174000"
      })
    );
    expect(body.text.format).toEqual(
      expect.objectContaining({
        type: "json_schema",
        strict: true,
        name: "guide_recommendation"
      })
    );
    expect(body.text.format.schema.additionalProperties).toBe(false);
    expect(body.text.format.schema.properties.destinationId.enum).toEqual(
      request.allowedDestinationIds
    );
    expect(body.text.format.schema.properties.basis.enum).toEqual(["fortune"]);
    expect(JSON.stringify(body)).not.toMatch(/coordinate|latitude|longitude|velocity/i);
  });

  it("never calls OpenAI without the server key or when the feature is disabled", async () => {
    const fetcher = vi.fn();

    await expect(
      requestOpenAIGuideRecommendation(request, {
        apiKey: "",
        safetyIdentifier,
        fetcher
      })
    ).rejects.toThrow("guide_unavailable");
    await expect(
      requestOpenAIGuideRecommendation(request, {
        apiKey: "test-server-key",
        safetyIdentifier,
        enabled: false,
        fetcher
      })
    ).rejects.toThrow("guide_unavailable");
    await expect(
      requestOpenAIGuideRecommendation(request, {
        apiKey: "test-server-key",
        safetyIdentifier: "visitor@example.com",
        fetcher
      })
    ).rejects.toThrow("guide_unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects refusal, malformed JSON, unknown IDs, and mismatched basis", async () => {
    const values = [
      { refusal: "no" },
      "not-json",
      { destinationId: "moon", themeId: "rest", basis: "fortune" },
      { destinationId: "hanabi", themeId: "rest", basis: "weather" }
    ];

    for (const value of values) {
      const response =
        typeof value === "object" && "refusal" in value
          ? new Response(
              JSON.stringify({
                status: "completed",
                output: [
                  {
                    type: "message",
                    content: [{ type: "refusal", refusal: value.refusal }]
                  }
                ]
              }),
              { status: 200 }
            )
          : new Response(
              JSON.stringify({
                status: "completed",
                output: [
                  {
                    type: "message",
                    content: [
                      {
                        type: "output_text",
                        text:
                          typeof value === "string"
                            ? value
                            : JSON.stringify(value)
                      }
                    ]
                  }
                ]
              }),
              { status: 200 }
            );

      await expect(
        requestOpenAIGuideRecommendation(request, {
          apiKey: "test-server-key",
          safetyIdentifier,
          fetcher: vi.fn().mockResolvedValue(response)
        })
      ).rejects.toThrow("guide_unavailable");
    }
  });

  it("maps upstream HTTP errors and incomplete responses to one safe failure", async () => {
    for (const response of [
      new Response("busy", { status: 429 }),
      new Response(JSON.stringify({ status: "incomplete", output: [] }), {
        status: 200
      })
    ]) {
      await expect(
        requestOpenAIGuideRecommendation(request, {
          apiKey: "test-server-key",
          safetyIdentifier,
          fetcher: vi.fn().mockResolvedValue(response)
        })
      ).rejects.toThrow("guide_unavailable");
    }
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { FortuneGuideRequest } from "../app/guide/GuideContract";

const validBody: FortuneGuideRequest = {
  mode: "fortune",
  currentZoneId: "airport",
  allowedDestinationIds: ["tokyo", "gyukatsu", "sakura", "hanabi"],
  tokyoDate: "2026-07-21"
};

function routeRequest(
  body: unknown,
  init?: { origin?: string; contentType?: string; signal?: AbortSignal }
) {
  return new Request("https://portfolio.example/api/guide", {
    method: "POST",
    headers: {
      origin: init?.origin ?? "https://portfolio.example",
      "content-type": init?.contentType ?? "application/json",
      "x-guide-client-id": "123e4567-e89b-42d3-a456-426614174000"
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
    signal: init?.signal
  });
}

function streamedRouteRequest(stream: ReadableStream<Uint8Array>) {
  return new Request("https://portfolio.example/api/guide", {
    method: "POST",
    headers: {
      origin: "https://portfolio.example",
      "content-type": "application/json",
      "x-guide-client-id": "123e4567-e89b-42d3-a456-426614174000"
    },
    body: stream,
    duplex: "half"
  } as RequestInit & { duplex: "half" });
}

describe("guide route boundary", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("rejects cross-origin, non-JSON, oversized, and invalid contracts before OpenAI", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-server-key");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { POST } = await import("../app/api/guide/route");

    const responses = await Promise.all([
      POST(routeRequest(validBody, { origin: "https://attacker.example" })),
      POST(routeRequest(validBody, { contentType: "text/plain" })),
      POST(routeRequest(validBody, { contentType: "application/jsonp" })),
      POST(routeRequest(validBody, { contentType: "application/json-evil" })),
      POST(routeRequest(`{"padding":"${"x".repeat(2500)}"}`)),
      POST(routeRequest({ ...validBody, prompt: "move the player" }))
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      403, 415, 415, 415, 413, 400
    ]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("stops reading a chunked body as soon as it exceeds two kilobytes", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-server-key");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(1025));
        if (pulls === 4) {
          controller.close();
        }
      },
      cancel() {
        cancelled = true;
      }
    });
    const { POST } = await import("../app/api/guide/route");

    const response = await POST(streamedRouteRequest(body));

    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(3);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns only a validated recommendation and no-store headers", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-server-key");
    const fetcher = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "completed",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      destinationId: "hanabi",
                      themeId: "celebration",
                      basis: "fortune"
                    })
                  }
                ]
              }
            ]
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetcher);
    const { POST } = await import("../app/api/guide/route");

    const response = await POST(routeRequest(validBody));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const upstreamBody = JSON.parse(
      String((fetcher.mock.calls[0]?.[1] as RequestInit | undefined)?.body)
    );
    expect(upstreamBody.safety_identifier).toBe(
      "123e4567-e89b-42d3-a456-426614174000"
    );
    await expect(response.json()).resolves.toEqual({
      recommendation: {
        destinationId: "hanabi",
        themeId: "celebration",
        basis: "fortune"
      }
    });
  });

  it("propagates a disconnected request to the in-flight OpenAI call", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-server-key");
    const incoming = new AbortController();
    let upstreamSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (!signal) {
          throw new Error("Expected an upstream abort signal");
        }
        upstreamSignal = signal;
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        });
      })
    );
    const { POST } = await import("../app/api/guide/route");

    const responsePromise = POST(
      routeRequest(validBody, { signal: incoming.signal })
    );
    await vi.waitFor(() => expect(upstreamSignal).toBeDefined());
    incoming.abort();

    const response = await responsePromise;
    expect(upstreamSignal?.aborted).toBe(true);
    expect(response.status).toBe(503);
  });

  it("returns one generic unavailable response when the key is absent", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const { POST } = await import("../app/api/guide/route");

    const response = await POST(routeRequest(validBody));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "guide_unavailable"
    });
  });
});

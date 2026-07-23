import { describe, expect, it, vi } from "vitest";
import { enforceGuideRateLimit } from "../worker/guide-rate-limit";

const clientId = "123e4567-e89b-42d3-a456-426614174000";

function guideRequest({
  id = clientId,
  origin = "https://portfolio.example",
  contentType = "application/json",
  ip = "203.0.113.7",
  path = "/api/guide"
}: {
  id?: string | null;
  origin?: string | null;
  contentType?: string | null;
  ip?: string | null;
  path?: string;
} = {}) {
  const headers = new Headers();
  if (id) headers.set("x-guide-client-id", id);
  if (origin) headers.set("origin", origin);
  if (contentType) headers.set("content-type", contentType);
  if (ip) headers.set("cf-connecting-ip", ip);
  return new Request(`https://portfolio.example${path}`, {
    method: "POST",
    headers,
    body: "{}"
  });
}

function limiter(success: boolean) {
  return { limit: vi.fn().mockResolvedValue({ success }) };
}

function bindings({ ip = true, client = true, global = true } = {}) {
  return {
    ipLimiter: limiter(ip),
    clientLimiter: limiter(client),
    globalLimiter: limiter(global),
    expectedOrigin: "https://portfolio.example"
  };
}

describe("guide edge rate limit", () => {
  it("ignores every request except the guide POST", async () => {
    const limits = bindings();

    await expect(
      enforceGuideRateLimit(
        new Request("https://portfolio.example/en"),
        limits
      )
    ).resolves.toBeNull();
    expect(limits.ipLimiter.limit).not.toHaveBeenCalled();
    expect(limits.clientLimiter.limit).not.toHaveBeenCalled();
    expect(limits.globalLimiter.limit).not.toHaveBeenCalled();
  });

  it("rejects invalid origin, media type, or client ID before consuming counters", async () => {
    for (const request of [
      guideRequest({ origin: "https://attacker.example" }),
      guideRequest({ contentType: "text/plain" }),
      guideRequest({ contentType: "application/jsonp" }),
      guideRequest({ contentType: "application/json-evil" }),
      guideRequest({ id: null }),
      guideRequest({ id: "rotate-me" })
    ]) {
      const limits = bindings();
      const response = await enforceGuideRateLimit(request, limits);
      expect([400, 403, 415]).toContain(response?.status);
      expect(limits.ipLimiter.limit).not.toHaveBeenCalled();
      expect(limits.clientLimiter.limit).not.toHaveBeenCalled();
      expect(limits.globalLimiter.limit).not.toHaveBeenCalled();
    }
  });

  it("limits every path spelling that the app router resolves to the guide route", async () => {
    for (const path of [
      "/api/guide/",
      "/api/guide//",
      "/api//guide",
      "/api/%67uide",
      "/api/g%75ide",
      "/%61pi/%67uide",
      "/api/%2567uide"
    ]) {
      const limits = bindings();
      await expect(
        enforceGuideRateLimit(guideRequest({ path }), limits)
      ).resolves.toBeNull();
      expect(limits.ipLimiter.limit, path).toHaveBeenCalledTimes(1);
      expect(limits.clientLimiter.limit, path).toHaveBeenCalledTimes(1);
      expect(limits.globalLimiter.limit, path).toHaveBeenCalledTimes(1);
    }
  });

  it("does not charge encoded slash or case-mismatched paths that stay outside the route", async () => {
    for (const path of ["/api/guide%2f", "/api%2fguide", "/API/guide"]) {
      const limits = bindings();
      await expect(
        enforceGuideRateLimit(guideRequest({ path }), limits)
      ).resolves.toBeNull();
      expect(limits.ipLimiter.limit, path).not.toHaveBeenCalled();
      expect(limits.clientLimiter.limit, path).not.toHaveBeenCalled();
      expect(limits.globalLimiter.limit, path).not.toHaveBeenCalled();
    }
  });

  it("accepts JSON media types case-insensitively with parameters", async () => {
    const limits = bindings();
    await expect(
      enforceGuideRateLimit(
        guideRequest({ contentType: "APPLICATION/JSON; charset=UTF-8" }),
        limits
      )
    ).resolves.toBeNull();
    expect(limits.globalLimiter.limit).toHaveBeenCalledTimes(1);
  });

  it("uses the same IP counter before different browser IDs", async () => {
    const first = bindings();
    const second = bindings();
    const otherClientId = "123e4567-e89b-42d3-a456-426614174001";

    await expect(enforceGuideRateLimit(guideRequest(), first)).resolves.toBeNull();
    await expect(
      enforceGuideRateLimit(guideRequest({ id: otherClientId }), second)
    ).resolves.toBeNull();

    expect(first.ipLimiter.limit).toHaveBeenCalledWith({
      key: "guide:ip:203.0.113.7"
    });
    expect(second.ipLimiter.limit).toHaveBeenCalledWith({
      key: "guide:ip:203.0.113.7"
    });
    expect(first.clientLimiter.limit).toHaveBeenCalledWith({
      key: `guide:client:${clientId}`
    });
    expect(second.clientLimiter.limit).toHaveBeenCalledWith({
      key: `guide:client:${otherClientId}`
    });
  });

  it("stops at the first exhausted counter and preserves later counters", async () => {
    const ipBlocked = bindings({ ip: false });
    const ipResponse = await enforceGuideRateLimit(guideRequest(), ipBlocked);
    expect(ipResponse?.status).toBe(429);
    expect(ipBlocked.clientLimiter.limit).not.toHaveBeenCalled();
    expect(ipBlocked.globalLimiter.limit).not.toHaveBeenCalled();

    const clientBlocked = bindings({ client: false });
    const clientResponse = await enforceGuideRateLimit(
      guideRequest(),
      clientBlocked
    );
    expect(clientResponse?.status).toBe(429);
    expect(clientBlocked.globalLimiter.limit).not.toHaveBeenCalled();

    const globalBlocked = bindings({ global: false });
    const globalResponse = await enforceGuideRateLimit(
      guideRequest(),
      globalBlocked
    );
    expect(globalResponse?.status).toBe(429);
    expect(globalResponse?.headers.get("retry-after")).toBe("60");
    expect(globalResponse?.headers.get("cache-control")).toBe("no-store");
  });
});

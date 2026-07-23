import { beforeEach, describe, expect, it, vi } from "vitest";

const { appFetch, imageOptimization } = vi.hoisted(() => ({
  appFetch: vi.fn(),
  imageOptimization: vi.fn()
}));

vi.mock("vinext/server/app-router-entry", () => ({
  default: { fetch: appFetch }
}));

vi.mock("vinext/server/image-optimization", () => ({
  DEFAULT_DEVICE_SIZES: [640],
  DEFAULT_IMAGE_SIZES: [32],
  handleImageOptimization: imageOptimization
}));

import worker from "../worker/index";

const clientId = "123e4567-e89b-42d3-a456-426614174000";
const connectingIp = "203.0.113.42";
const bodySecret = "body-must-not-be-logged";
const envSecret = "env-must-not-be-logged";

function limiter(success = true) {
  return { limit: vi.fn().mockResolvedValue({ success }) };
}

function bindings({
  ip = true,
  client = true,
  global = true
}: {
  ip?: boolean;
  client?: boolean;
  global?: boolean;
} = {}) {
  return {
    ASSETS: { fetch: vi.fn() },
    IMAGES: { input: vi.fn() },
    SITE_ORIGIN: "https://portfolio.example",
    GUIDE_IP_RATE_LIMITER: limiter(ip),
    GUIDE_CLIENT_RATE_LIMITER: limiter(client),
    GUIDE_GLOBAL_RATE_LIMITER: limiter(global),
    PRIVATE_VALUE: envSecret
  };
}

function guideRequest() {
  return new Request(
    "https://portfolio.example/api/guide?token=query-must-not-be-logged",
    {
      method: "POST",
      headers: {
        origin: "https://portfolio.example",
        "content-type": "application/json",
        "x-guide-client-id": clientId,
        "cf-connecting-ip": connectingIp
      },
      body: JSON.stringify({ prompt: bodySecret })
    }
  );
}

const ctx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn()
};

function parsedLog(spy: ReturnType<typeof vi.spyOn>) {
  expect(spy).toHaveBeenCalledTimes(1);
  const [message] = spy.mock.calls[0] as [string];
  return JSON.parse(message) as {
    event: string;
    method: string;
    path: string;
    status: number;
    durationMs: number;
    requestId: string;
  };
}

function expectSecurityHeaders(response: Response) {
  expect(response.headers.get("strict-transport-security")).toBe(
    "max-age=31536000; includeSubDomains"
  );
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("x-frame-options")).toBe("DENY");
  expect(response.headers.get("content-security-policy")).toContain(
    "default-src 'self'"
  );
}

function expectNoSensitiveLogData(...spies: ReturnType<typeof vi.spyOn>[]) {
  const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
  expect(logged).not.toContain(bodySecret);
  expect(logged).not.toContain(clientId);
  expect(logged).not.toContain(connectingIp);
  expect(logged).not.toContain(envSecret);
  expect(logged).not.toContain("query-must-not-be-logged");
}

describe("public worker runtime", () => {
  beforeEach(() => {
    appFetch.mockReset();
    imageOptimization.mockReset();
  });

  it("fails closed when a guide limiter is missing and records one error log", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const env = bindings();
    Reflect.deleteProperty(env, "GUIDE_GLOBAL_RATE_LIMITER");

    const response = await worker.fetch(guideRequest(), env as never, ctx);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-guide-mode")).toBeNull();
    expectSecurityHeaders(response);
    expect(appFetch).not.toHaveBeenCalled();
    const log = parsedLog(error);
    expect(log).toMatchObject({
      event: "http_request",
      method: "POST",
      path: "/api/guide",
      status: 503
    });
    expect(log.durationMs).toBeGreaterThanOrEqual(0);
    expect(log.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(warn).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expectNoSensitiveLogData(error, warn, info);
  });

  it("marks an intentionally disabled guide before checking unavailable limiters", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const env = {
      ...bindings(),
      AI_GUIDE_ENABLED: "false"
    };
    Reflect.deleteProperty(env, "GUIDE_IP_RATE_LIMITER");
    Reflect.deleteProperty(env, "GUIDE_CLIENT_RATE_LIMITER");
    Reflect.deleteProperty(env, "GUIDE_GLOBAL_RATE_LIMITER");

    const response = await worker.fetch(guideRequest(), env as never, ctx);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-guide-mode")).toBe("disabled");
    expectSecurityHeaders(response);
    expect(appFetch).not.toHaveBeenCalled();
    expect(parsedLog(error)).toMatchObject({
      event: "http_request",
      method: "POST",
      path: "/api/guide",
      status: 503
    });
    expect(warn).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expectNoSensitiveLogData(error, warn, info);
  });

  it("returns a rate-limit response and records a warning without invoking the app", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const env = bindings({ ip: false });

    const response = await worker.fetch(guideRequest(), env as never, ctx);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expectSecurityHeaders(response);
    expect(appFetch).not.toHaveBeenCalled();
    expect(parsedLog(warn)).toMatchObject({
      event: "http_request",
      method: "POST",
      path: "/api/guide",
      status: 429
    });
    expect(error).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expectNoSensitiveLogData(error, warn, info);
  });

  it("preserves a normal app response and records one information log", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    appFetch.mockResolvedValue(
      new Response("portfolio", {
        status: 200,
        headers: { "cache-control": "public, max-age=60" }
      })
    );
    const env = {
      ...bindings(),
      SITE_ORIGIN: envSecret
    };
    const request = new Request(
      "https://portfolio.example/en?token=query-must-not-be-logged",
      {
        headers: {
          "x-guide-client-id": clientId,
          "cf-connecting-ip": connectingIp
        }
      }
    );

    const response = await worker.fetch(request, env as never, ctx);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("portfolio");
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expectSecurityHeaders(response);
    expect(appFetch).toHaveBeenCalledTimes(1);
    expect(parsedLog(info)).toMatchObject({
      event: "http_request",
      method: "GET",
      path: "/en",
      status: 200
    });
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expectNoSensitiveLogData(error, warn, info);
  });
});

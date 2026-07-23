import { describe, expect, it } from "vitest";
import { withSecurityHeaders } from "../worker/security-headers";

describe("site security headers", () => {
  it("hardens dynamic responses without discarding their status, body, or cache policy", async () => {
    const response = withSecurityHeaders(
      new Response("missing", {
        status: 404,
        headers: { "cache-control": "no-store" }
      })
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("missing");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(response.headers.get("permissions-policy")).toBe(
      "camera=(), microphone=(), geolocation=()"
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'"
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "connect-src 'self' blob: https://api.open-meteo.com"
    );
  });
});

import { isGuideClientId } from "../app/guide/GuideClientId";
import { isGuideApiPath, isJsonMediaType } from "../app/guide/GuideHttp";

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface GuideRateLimitOptions {
  ipLimiter: RateLimitBinding;
  clientLimiter: RateLimitBinding;
  globalLimiter: RateLimitBinding;
  expectedOrigin: string;
}

function jsonError(error: string, status: number, headers?: HeadersInit) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

export async function enforceGuideRateLimit(
  request: Request,
  {
    ipLimiter,
    clientLimiter,
    globalLimiter,
    expectedOrigin
  }: GuideRateLimitOptions
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!isGuideApiPath(url.pathname) || request.method !== "POST") {
    return null;
  }

  const origin = request.headers.get("origin");
  if (!origin || origin.replace(/\/$/, "") !== expectedOrigin.replace(/\/$/, "")) {
    return jsonError("forbidden", 403);
  }
  if (!isJsonMediaType(request.headers.get("content-type"))) {
    return jsonError("unsupported_media_type", 415);
  }
  const clientId = request.headers.get("x-guide-client-id");
  if (!isGuideClientId(clientId)) {
    return jsonError("invalid_client", 400);
  }

  try {
    const connectingIp = request.headers.get("cf-connecting-ip")?.trim();
    const ipKey =
      connectingIp && connectingIp.length <= 64 ? connectingIp : "unknown";
    const ipResult = await ipLimiter.limit({ key: `guide:ip:${ipKey}` });
    if (!ipResult.success) {
      return jsonError("rate_limited", 429, { "retry-after": "60" });
    }
    const clientResult = await clientLimiter.limit({
      key: `guide:client:${clientId}`
    });
    if (!clientResult.success) {
      return jsonError("rate_limited", 429, { "retry-after": "60" });
    }
    const globalResult = await globalLimiter.limit({ key: "guide:all" });
    if (!globalResult.success) {
      return jsonError("rate_limited", 429, { "retry-after": "60" });
    }
    return null;
  } catch {
    return jsonError("guide_unavailable", 503);
  }
}

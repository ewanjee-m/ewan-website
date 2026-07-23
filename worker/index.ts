import {
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
  handleImageOptimization
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  enforceGuideRateLimit,
  type RateLimitBinding
} from "./guide-rate-limit";
import { isGuideApiPath } from "../app/guide/GuideHttp";
import { withSecurityHeaders } from "./security-headers";

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

interface ImageBinding {
  input(stream: ReadableStream): {
    transform(options: Record<string, unknown>): {
      output(options: {
        format: string;
        quality: number;
      }): Promise<{ response(): Response }>;
    };
  };
}

interface Env {
  ASSETS: AssetBinding;
  IMAGES: ImageBinding;
  SITE_ORIGIN?: string;
  GUIDE_IP_RATE_LIMITER: RateLimitBinding;
  GUIDE_CLIENT_RATE_LIMITER: RateLimitBinding;
  GUIDE_GLOBAL_RATE_LIMITER: RateLimitBinding;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(
    request: Request,
    env: Env | undefined,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (env) {
      if (
        !env.GUIDE_CLIENT_RATE_LIMITER ||
        !env.GUIDE_IP_RATE_LIMITER ||
        !env.GUIDE_GLOBAL_RATE_LIMITER
      ) {
        if (isGuideApiPath(url.pathname)) {
          return withSecurityHeaders(
            new Response(JSON.stringify({ error: "guide_unavailable" }), {
              status: 503,
              headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store"
              }
            })
          );
        }
      } else {
        const limited = await enforceGuideRateLimit(
          request,
          {
            ipLimiter: env.GUIDE_IP_RATE_LIMITER,
            clientLimiter: env.GUIDE_CLIENT_RATE_LIMITER,
            globalLimiter: env.GUIDE_GLOBAL_RATE_LIMITER,
            expectedOrigin: env.SITE_ORIGIN?.trim() || url.origin
          }
        );
        if (limited) {
          return withSecurityHeaders(limited);
        }
      }
    }

    if (url.pathname === "/_vinext/image") {
      if (!env) {
        return withSecurityHeaders(
          new Response("Image bindings unavailable", { status: 503 })
        );
      }
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return withSecurityHeaders(
        await handleImageOptimization(
          request,
          {
            fetchAsset: (path) =>
              env.ASSETS.fetch(new Request(new URL(path, request.url))),
            transformImage: async (body, { width, format, quality }) => {
              const result = await env.IMAGES.input(body)
                .transform(width > 0 ? { width } : {})
                .output({ format, quality });
              return result.response();
            }
          },
          allowedWidths
        )
      );
    }

    return withSecurityHeaders(await handler.fetch(request, env, ctx));
  }
};

export default worker;

import { parseGuideRequest } from "../../guide/GuideContract";
import {
  DEFAULT_GUIDE_MODEL,
  requestOpenAIGuideRecommendation
} from "../../guide/OpenAIGuide";
import { isGuideClientId } from "../../guide/GuideClientId";
import { isJsonMediaType } from "../../guide/GuideHttp";

const MAX_BODY_BYTES = 2048;
const UPSTREAM_TIMEOUT_MS = 4500;

type BodyReadResult =
  | { ok: true; text: string }
  | { ok: false; error: "invalid_request" | "payload_too_large" };

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function normalizedOrigin(value: string) {
  return value.replace(/\/$/, "");
}

function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }
  const configuredOrigin = process.env.SITE_ORIGIN?.trim();
  const expectedOrigin = configuredOrigin
    ? normalizedOrigin(configuredOrigin)
    : new URL(request.url).origin;
  return normalizedOrigin(origin) === expectedOrigin;
}

async function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal
) {
  if (signal.aborted) {
    throw signal.reason;
  }
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([reader.read(), aborted]);
  } finally {
    if (onAbort) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

async function readLimitedBody(
  request: Request,
  signal: AbortSignal
): Promise<BodyReadResult> {
  if (!request.body) {
    return { ok: true, text: "" };
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await readWithAbort(reader, signal);
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel("payload_too_large");
        return { ok: false, error: "payload_too_large" };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    };
  } catch {
    try {
      await reader.cancel("invalid_request");
    } catch {
      // The stream may already be closed or aborted.
    }
    return { ok: false, error: "invalid_request" };
  }
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return json({ error: "forbidden" }, 403);
  }
  if (!isJsonMediaType(request.headers.get("content-type"))) {
    return json({ error: "unsupported_media_type" }, 415);
  }
  const clientId = request.headers.get("x-guide-client-id");
  if (!isGuideClientId(clientId)) {
    return json({ error: "invalid_client" }, 400);
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ error: "payload_too_large" }, 413);
  }

  const deadlineSignal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  ]);
  const body = await readLimitedBody(request, deadlineSignal);
  if (!body.ok) {
    return json(
      { error: body.error },
      body.error === "payload_too_large" ? 413 : 400
    );
  }

  let unknownBody: unknown;
  try {
    unknownBody = JSON.parse(body.text);
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const guideRequest = parseGuideRequest(unknownBody);
  if (!guideRequest) {
    return json({ error: "invalid_request" }, 400);
  }

  try {
    const recommendation = await requestOpenAIGuideRecommendation(guideRequest, {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_GUIDE_MODEL?.trim() || DEFAULT_GUIDE_MODEL,
      safetyIdentifier: clientId,
      enabled: process.env.AI_GUIDE_ENABLED !== "false",
      signal: deadlineSignal
    });
    return json({ recommendation }, 200);
  } catch {
    return json({ error: "guide_unavailable" }, 503);
  }
}

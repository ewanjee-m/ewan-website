import {
  THEME_IDS,
  parseGuideRecommendation,
  type GuideRecommendation,
  type GuideRequest
} from "./GuideContract";
import { isGuideClientId } from "./GuideClientId";

export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const DEFAULT_GUIDE_MODEL = "gpt-5.6-luna";

function unavailable(): Error {
  return new Error("guide_unavailable");
}

function extractOutputText(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const response = value as {
    status?: unknown;
    output_text?: unknown;
    output?: unknown;
  };
  if (response.status !== "completed") {
    return null;
  }
  if (typeof response.output_text === "string") {
    return response.output_text;
  }
  if (!Array.isArray(response.output)) {
    return null;
  }

  for (const output of response.output) {
    if (
      typeof output !== "object" ||
      output === null ||
      !Array.isArray((output as { content?: unknown }).content)
    ) {
      continue;
    }
    for (const content of (output as { content: unknown[] }).content) {
      if (
        typeof content === "object" &&
        content !== null &&
        (content as { type?: unknown }).type === "output_text" &&
        typeof (content as { text?: unknown }).text === "string"
      ) {
        return (content as { text: string }).text;
      }
    }
  }
  return null;
}

function createRequestBody(
  request: GuideRequest,
  model: string,
  safetyIdentifier: string
) {
  return {
    model,
    store: false,
    safety_identifier: safetyIdentifier,
    reasoning: { effort: "low" },
    max_output_tokens: 120,
    instructions:
      "Select one allowed destination and one theme that fit the supplied basis. Return only the required structured result.",
    input: JSON.stringify(request),
    text: {
      format: {
        type: "json_schema",
        name: "guide_recommendation",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["destinationId", "themeId", "basis"],
          properties: {
            destinationId: {
              type: "string",
              enum: request.allowedDestinationIds
            },
            themeId: { type: "string", enum: THEME_IDS },
            basis: { type: "string", enum: [request.mode] }
          }
        }
      }
    }
  };
}

export async function requestOpenAIGuideRecommendation(
  request: GuideRequest,
  {
    apiKey,
    model = DEFAULT_GUIDE_MODEL,
    safetyIdentifier,
    enabled = true,
    fetcher = fetch,
    signal
  }: {
    apiKey: string | undefined;
    model?: string;
    safetyIdentifier: string;
    enabled?: boolean;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  }
): Promise<GuideRecommendation> {
  if (!enabled || !apiKey?.trim() || !isGuideClientId(safetyIdentifier)) {
    throw unavailable();
  }

  try {
    const response = await fetcher(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(
        createRequestBody(request, model, safetyIdentifier)
      ),
      signal
    });
    if (!response.ok) {
      throw unavailable();
    }

    const outputText = extractOutputText(await response.json());
    if (!outputText) {
      throw unavailable();
    }
    const parsed = parseGuideRecommendation(JSON.parse(outputText), request);
    if (!parsed) {
      throw unavailable();
    }
    return parsed;
  } catch {
    throw unavailable();
  }
}

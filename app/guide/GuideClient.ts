import {
  DESTINATION_IDS,
  parseGuideRecommendation,
  type DestinationId,
  type GuideRecommendation,
  type GuideRequest
} from "./GuideContract";
import { isGuideClientId } from "./GuideClientId";

export type GuideRequestOutcome<T> =
  | { status: "success"; value: T }
  | { status: "failure" }
  | { status: "ignored" };

const FORTUNE_CACHE_KEY = "ewan-world-guide-fortune";
const CLIENT_ID_STORAGE_KEY = "ewan-world-guide-client-id";
let inMemoryClientId: string | undefined;

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

export function getGuideClientId(
  storage: StorageReader & StorageWriter,
  cryptoSource: Pick<Crypto, "randomUUID">
) {
  try {
    const stored = storage.getItem(CLIENT_ID_STORAGE_KEY);
    if (isGuideClientId(stored)) {
      inMemoryClientId = stored;
      return stored;
    }
  } catch {
    // A module-level ID still keeps requests stable for the current page.
  }
  if (inMemoryClientId) {
    return inMemoryClientId;
  }

  const generated = cryptoSource.randomUUID();
  inMemoryClientId = generated;
  try {
    storage.setItem(CLIENT_ID_STORAGE_KEY, generated);
  } catch {
    // Private browsing can block storage; keep the ID in memory instead.
  }
  return generated;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function loadCachedFortune(
  storage: StorageReader,
  tokyoDate: string,
  allowedDestinationIds: readonly DestinationId[]
): GuideRecommendation | null {
  try {
    const raw = storage.getItem(FORTUNE_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const cached: unknown = JSON.parse(raw);
    if (
      !isPlainObject(cached) ||
      Object.keys(cached).sort().join(",") !== "recommendation,tokyoDate" ||
      cached.tokyoDate !== tokyoDate
    ) {
      return null;
    }
    return parseGuideRecommendation(cached.recommendation, {
      mode: "fortune",
      allowedDestinationIds
    });
  } catch {
    return null;
  }
}

export function saveCachedFortune(
  storage: StorageWriter,
  tokyoDate: string,
  recommendation: GuideRecommendation
) {
  try {
    storage.setItem(
      FORTUNE_CACHE_KEY,
      JSON.stringify({ tokyoDate, recommendation })
    );
  } catch {
    // Storage can be unavailable in private browsing; the active result remains usable.
  }
}

export function getTokyoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${value.year}-${value.month}-${value.day}`;
}

export function getAllowedDestinationIds(
  currentZoneId: DestinationId
): DestinationId[] {
  return DESTINATION_IDS.filter(
    (destinationId) => destinationId !== currentZoneId
  );
}

export async function postGuideRequest(
  request: GuideRequest,
  {
    fetcher = fetch,
    signal,
    clientId
  }: { fetcher?: typeof fetch; signal?: AbortSignal; clientId: string }
): Promise<GuideRecommendation> {
  if (!isGuideClientId(clientId)) {
    throw new Error("guide_unavailable");
  }
  try {
    const response = await fetcher("/api/guide", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Guide-Client-Id": clientId
      },
      body: JSON.stringify(request),
      cache: "no-store",
      signal
    });
    if (!response.ok) {
      throw new Error("guide_unavailable");
    }
    const value = (await response.json()) as { recommendation?: unknown };
    const recommendation = parseGuideRecommendation(
      value.recommendation,
      request
    );
    if (!recommendation) {
      throw new Error("guide_unavailable");
    }
    return recommendation;
  } catch {
    throw new Error("guide_unavailable");
  }
}

export function createSingleFlightRequester({
  timeoutMs
}: {
  timeoutMs: number;
}) {
  let generation = 0;
  let active:
    | {
        id: number;
        key: string;
        controller: AbortController;
        timeoutId: ReturnType<typeof setTimeout>;
        promise: Promise<GuideRequestOutcome<unknown>>;
      }
    | undefined;

  const cancelActive = () => {
    if (!active) {
      return;
    }
    generation += 1;
    clearTimeout(active.timeoutId);
    active.controller.abort();
    active = undefined;
  };

  return {
    request<T>(
      key: string,
      task: (signal: AbortSignal) => Promise<T>
    ): Promise<GuideRequestOutcome<T>> {
      if (active?.key === key) {
        return active.promise as Promise<GuideRequestOutcome<T>>;
      }
      cancelActive();

      const id = ++generation;
      const controller = new AbortController();
      let rejectTimeout: ((reason: Error) => void) | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        rejectTimeout = reject;
      });
      const timeoutId = setTimeout(() => {
        controller.abort();
        rejectTimeout?.(new Error("guide_timeout"));
      }, timeoutMs);
      let taskPromise: Promise<T>;
      try {
        taskPromise = task(controller.signal);
      } catch (error) {
        taskPromise = Promise.reject(error);
      }
      const promise = Promise.race([taskPromise, timeoutPromise])
        .then<GuideRequestOutcome<T>>((value) =>
          id === generation
            ? { status: "success", value }
            : { status: "ignored" }
        )
        .catch<GuideRequestOutcome<T>>(() =>
          id === generation ? { status: "failure" } : { status: "ignored" }
        )
        .finally(() => {
          clearTimeout(timeoutId);
          if (active?.id === id) {
            active = undefined;
          }
        });

      active = {
        id,
        key,
        controller,
        timeoutId,
        promise: promise as Promise<GuideRequestOutcome<unknown>>
      };
      return promise;
    },

    cancel: cancelActive
  };
}

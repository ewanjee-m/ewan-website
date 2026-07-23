export const DESTINATION_IDS = [
  "airport",
  "tokyo",
  "gyukatsu",
  "sakura",
  "hanabi"
] as const;

export const THEME_IDS = [
  "fresh_start",
  "focus",
  "connection",
  "curiosity",
  "rest",
  "celebration"
] as const;

export const GUIDE_MODES = ["weather", "fortune"] as const;

export type DestinationId = (typeof DESTINATION_IDS)[number];
export type ThemeId = (typeof THEME_IDS)[number];
export type GuideMode = (typeof GUIDE_MODES)[number];

export interface FortuneGuideRequest {
  mode: "fortune";
  currentZoneId: DestinationId;
  allowedDestinationIds: readonly DestinationId[];
  tokyoDate: string;
}

export interface WeatherGuideRequest {
  mode: "weather";
  currentZoneId: DestinationId;
  allowedDestinationIds: readonly DestinationId[];
  tokyoDate: string;
  weatherCode: number;
  temperatureC: number;
  observedAt: string;
}

export type GuideRequest = FortuneGuideRequest | WeatherGuideRequest;

export interface GuideRecommendation {
  destinationId: DestinationId;
  themeId: ThemeId;
  basis: GuideMode;
}

const MAX_WEATHER_AGE_MS = 30 * 60 * 1000;
const MAX_WEATHER_FUTURE_SKEW_MS = 5 * 60 * 1000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactlyKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
) {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

function isDestinationId(value: unknown): value is DestinationId {
  return DESTINATION_IDS.includes(value as DestinationId);
}

function isThemeId(value: unknown): value is ThemeId {
  return THEME_IDS.includes(value as ThemeId);
}

function isGuideMode(value: unknown): value is GuideMode {
  return GUIDE_MODES.includes(value as GuideMode);
}

function isValidTokyoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isIsoInstant(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function parseAllowedDestinations(
  value: unknown,
  currentZoneId: DestinationId
): readonly DestinationId[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length >= DESTINATION_IDS.length ||
    !value.every(isDestinationId)
  ) {
    return null;
  }
  if (new Set(value).size !== value.length || value.includes(currentZoneId)) {
    return null;
  }
  return value;
}

export function parseGuideRequest(
  value: unknown,
  { now = Date.now() }: { now?: number } = {}
): GuideRequest | null {
  if (!isPlainObject(value) || !isGuideMode(value.mode)) {
    return null;
  }

  const weather = value.mode === "weather";
  const expectedKeys = weather
    ? [
        "mode",
        "currentZoneId",
        "allowedDestinationIds",
        "tokyoDate",
        "weatherCode",
        "temperatureC",
        "observedAt"
      ]
    : ["mode", "currentZoneId", "allowedDestinationIds", "tokyoDate"];

  if (
    !hasExactlyKeys(value, expectedKeys) ||
    !isDestinationId(value.currentZoneId) ||
    !isValidTokyoDate(value.tokyoDate)
  ) {
    return null;
  }

  const allowedDestinationIds = parseAllowedDestinations(
    value.allowedDestinationIds,
    value.currentZoneId
  );
  if (!allowedDestinationIds) {
    return null;
  }

  if (!weather) {
    return {
      mode: "fortune",
      currentZoneId: value.currentZoneId,
      allowedDestinationIds,
      tokyoDate: value.tokyoDate
    };
  }

  if (
    !Number.isInteger(value.weatherCode) ||
    (value.weatherCode as number) < 0 ||
    (value.weatherCode as number) > 99 ||
    typeof value.temperatureC !== "number" ||
    !Number.isFinite(value.temperatureC) ||
    value.temperatureC < -80 ||
    value.temperatureC > 60 ||
    !isIsoInstant(value.observedAt)
  ) {
    return null;
  }
  const weatherAgeMs = now - Date.parse(value.observedAt);
  if (
    weatherAgeMs > MAX_WEATHER_AGE_MS ||
    weatherAgeMs < -MAX_WEATHER_FUTURE_SKEW_MS
  ) {
    return null;
  }

  return {
    mode: "weather",
    currentZoneId: value.currentZoneId,
    allowedDestinationIds,
    tokyoDate: value.tokyoDate,
    weatherCode: value.weatherCode as number,
    temperatureC: value.temperatureC,
    observedAt: value.observedAt
  };
}

export function parseGuideRecommendation(
  value: unknown,
  request: Pick<GuideRequest, "mode" | "allowedDestinationIds">
): GuideRecommendation | null {
  if (
    !isPlainObject(value) ||
    !hasExactlyKeys(value, ["destinationId", "themeId", "basis"]) ||
    !isDestinationId(value.destinationId) ||
    !isThemeId(value.themeId) ||
    !isGuideMode(value.basis) ||
    value.basis !== request.mode ||
    !request.allowedDestinationIds.includes(value.destinationId)
  ) {
    return null;
  }

  return {
    destinationId: value.destinationId,
    themeId: value.themeId,
    basis: value.basis
  };
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createLocalRecommendation(
  request: Pick<
    GuideRequest,
    "mode" | "currentZoneId" | "allowedDestinationIds" | "tokyoDate"
  > &
    Partial<Pick<WeatherGuideRequest, "weatherCode" | "temperatureC">>
): GuideRecommendation | null {
  const candidates = request.allowedDestinationIds.filter(
    (destinationId) =>
      destinationId !== request.currentZoneId &&
      DESTINATION_IDS.includes(destinationId)
  );
  if (candidates.length === 0) {
    return null;
  }

  const seed = stableHash(
    [
      request.tokyoDate,
      request.mode,
      request.weatherCode ?? "",
      request.temperatureC ?? ""
    ].join(":")
  );
  return {
    destinationId: candidates[seed % candidates.length],
    themeId: THEME_IDS[Math.floor(seed / candidates.length) % THEME_IDS.length],
    basis: request.mode
  };
}

export interface TokyoWeatherObservation {
  status: "live" | "stale";
  weatherCode: number;
  temperatureC: number;
  observedAt: string;
  intervalSeconds: number;
}

export interface TokyoWeatherUnavailable {
  status: "unavailable";
}

export type TokyoWeatherState =
  | TokyoWeatherObservation
  | TokyoWeatherUnavailable;

const TOKYO_LATITUDE = "35.6895";
const TOKYO_LONGITUDE = "139.69171";
const FUTURE_CLOCK_TOLERANCE_SECONDS = 300;
const MINIMUM_LIVE_WINDOW_SECONDS = 1800;

function createWeatherUrl() {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", TOKYO_LATITUDE);
  url.searchParams.set("longitude", TOKYO_LONGITUDE);
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("timezone", "Asia/Tokyo");
  url.searchParams.set("timeformat", "unixtime");
  url.searchParams.set("temperature_unit", "celsius");
  return url.toString();
}

export const TOKYO_WEATHER_URL = createWeatherUrl();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isObservation(value: TokyoWeatherState | undefined): value is TokyoWeatherObservation {
  return Boolean(
    value &&
      value.status !== "unavailable" &&
      Number.isInteger(value.weatherCode) &&
      value.weatherCode >= 0 &&
      value.weatherCode <= 99 &&
      Number.isFinite(value.temperatureC) &&
      value.temperatureC >= -80 &&
      value.temperatureC <= 60 &&
      Number.isFinite(Date.parse(value.observedAt)) &&
      Number.isInteger(value.intervalSeconds) &&
      value.intervalSeconds > 0
  );
}

export function parseCachedTokyoWeather(
  value: unknown
): TokyoWeatherObservation | null {
  if (
    !isPlainObject(value) ||
    !["live", "stale"].includes(String(value.status)) ||
    Object.keys(value).sort().join(",") !==
      "intervalSeconds,observedAt,status,temperatureC,weatherCode"
  ) {
    return null;
  }
  const candidate = value as unknown as TokyoWeatherObservation;
  return isObservation(candidate) ? candidate : null;
}

export type WeatherCondition =
  | "clear"
  | "cloudy"
  | "fog"
  | "rain"
  | "snow"
  | "thunder";

export function getWeatherCondition(weatherCode: number): WeatherCondition {
  if (weatherCode === 0) {
    return "clear";
  }
  if (weatherCode === 45 || weatherCode === 48) {
    return "fog";
  }
  if (
    (weatherCode >= 51 && weatherCode <= 67) ||
    (weatherCode >= 80 && weatherCode <= 82)
  ) {
    return "rain";
  }
  if (
    (weatherCode >= 71 && weatherCode <= 77) ||
    weatherCode === 85 ||
    weatherCode === 86
  ) {
    return "snow";
  }
  if (weatherCode >= 95 && weatherCode <= 99) {
    return "thunder";
  }
  return "cloudy";
}

export function parseTokyoWeatherResponse(
  value: unknown,
  now = Date.now()
): TokyoWeatherState {
  if (
    !isPlainObject(value) ||
    value.timezone !== "Asia/Tokyo" ||
    !isPlainObject(value.current)
  ) {
    return { status: "unavailable" };
  }

  const { time, interval, temperature_2m: temperatureC, weather_code: weatherCode } =
    value.current;
  if (
    !Number.isInteger(time) ||
    (time as number) <= 0 ||
    !Number.isInteger(interval) ||
    (interval as number) < 60 ||
    (interval as number) > 86_400 ||
    typeof temperatureC !== "number" ||
    !Number.isFinite(temperatureC) ||
    temperatureC < -80 ||
    temperatureC > 60 ||
    !Number.isInteger(weatherCode) ||
    (weatherCode as number) < 0 ||
    (weatherCode as number) > 99
  ) {
    return { status: "unavailable" };
  }

  const ageSeconds = Math.floor(now / 1000) - (time as number);
  if (ageSeconds < -FUTURE_CLOCK_TOLERANCE_SECONDS) {
    return { status: "unavailable" };
  }
  const liveWindowSeconds = Math.max(
    (interval as number) * 2,
    MINIMUM_LIVE_WINDOW_SECONDS
  );

  return {
    status: ageSeconds <= liveWindowSeconds ? "live" : "stale",
    weatherCode: weatherCode as number,
    temperatureC,
    observedAt: new Date((time as number) * 1000).toISOString(),
    intervalSeconds: interval as number
  };
}

export async function fetchTokyoWeather({
  fetcher = fetch,
  now = Date.now(),
  cached,
  signal
}: {
  fetcher?: typeof fetch;
  now?: number;
  cached?: TokyoWeatherState;
  signal?: AbortSignal;
} = {}): Promise<TokyoWeatherState> {
  try {
    const response = await fetcher(TOKYO_WEATHER_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal
    });
    if (!response.ok) {
      throw new Error(`Weather response ${response.status}`);
    }
    const parsed = parseTokyoWeatherResponse(await response.json(), now);
    if (parsed.status !== "unavailable") {
      return parsed;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
  }

  return isObservation(cached)
    ? { ...cached, status: "stale" }
    : { status: "unavailable" };
}

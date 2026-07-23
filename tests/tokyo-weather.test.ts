import { describe, expect, it, vi } from "vitest";
import {
  TOKYO_WEATHER_URL,
  fetchTokyoWeather,
  getWeatherCondition,
  parseCachedTokyoWeather,
  parseTokyoWeatherResponse
} from "../app/guide/TokyoWeather";

const now = Date.parse("2026-07-21T03:30:00.000Z");
const currentTime = Date.parse("2026-07-21T03:15:00.000Z") / 1000;

const responseBody = {
  latitude: 35.7,
  longitude: 139.6875,
  timezone: "Asia/Tokyo",
  current_units: {
    time: "unixtime",
    interval: "seconds",
    temperature_2m: "°C",
    weather_code: "wmo code"
  },
  current: {
    time: currentTime,
    interval: 900,
    temperature_2m: 31.2,
    weather_code: 2
  }
};

describe("Tokyo weather request", () => {
  it("uses the fixed Tokyo location, UTC epoch time, and only required current facts", () => {
    const url = new URL(TOKYO_WEATHER_URL);

    expect(url.origin).toBe("https://api.open-meteo.com");
    expect(url.searchParams.get("latitude")).toBe("35.6895");
    expect(url.searchParams.get("longitude")).toBe("139.69171");
    expect(url.searchParams.get("current")).toBe("temperature_2m,weather_code");
    expect(url.searchParams.get("timezone")).toBe("Asia/Tokyo");
    expect(url.searchParams.get("timeformat")).toBe("unixtime");
    expect(url.searchParams.has("apikey")).toBe(false);
  });

  it("classifies a valid value within two provider intervals or 30 minutes as live", () => {
    expect(parseTokyoWeatherResponse(responseBody, now)).toEqual({
      status: "live",
      weatherCode: 2,
      temperatureC: 31.2,
      observedAt: "2026-07-21T03:15:00.000Z",
      intervalSeconds: 900
    });
  });

  it("classifies an older valid value as stale and malformed or future data as unavailable", () => {
    expect(
      parseTokyoWeatherResponse(
        {
          ...responseBody,
          current: {
            ...responseBody.current,
            time: Date.parse("2026-07-21T02:45:00.000Z") / 1000
          }
        },
        now
      ).status
    ).toBe("stale");
    expect(parseTokyoWeatherResponse({}, now)).toEqual({ status: "unavailable" });
    expect(
      parseTokyoWeatherResponse(
        {
          ...responseBody,
          current: { ...responseBody.current, time: now / 1000 + 301 }
        },
        now
      )
    ).toEqual({ status: "unavailable" });
  });

  it("uses a validated cached observation as stale when the network fails", async () => {
    const cached = parseTokyoWeatherResponse(responseBody, now);
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));

    await expect(fetchTokyoWeather({ fetcher, now, cached })).resolves.toEqual({
      ...cached,
      status: "stale"
    });
    expect(fetcher).toHaveBeenCalledWith(
      TOKYO_WEATHER_URL,
      expect.objectContaining({ signal: undefined })
    );
  });

  it("returns unavailable for HTTP errors without a usable cache", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("busy", { status: 503 })
    );

    await expect(fetchTokyoWeather({ fetcher, now })).resolves.toEqual({
      status: "unavailable"
    });
  });

  it("maps WMO codes to reviewed condition IDs and validates cached facts", () => {
    expect(getWeatherCondition(0)).toBe("clear");
    expect(getWeatherCondition(45)).toBe("fog");
    expect(getWeatherCondition(63)).toBe("rain");
    expect(getWeatherCondition(75)).toBe("snow");
    expect(getWeatherCondition(95)).toBe("thunder");
    expect(parseCachedTokyoWeather(parseTokyoWeatherResponse(responseBody, now))).toEqual(
      parseTokyoWeatherResponse(responseBody, now)
    );
    expect(parseCachedTokyoWeather({ status: "live", temperatureC: 100 })).toBeNull();
  });
});

"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Locale } from "../i18n/messages";
import {
  createLocalRecommendation,
  type DestinationId,
  type GuideMode,
  type GuideRecommendation,
  type ThemeId,
  type WeatherGuideRequest
} from "./GuideContract";
import {
  createSingleFlightRequester,
  getAllowedDestinationIds,
  getGuideClientId,
  getTokyoDate,
  loadCachedFortune,
  postGuideRequest,
  saveCachedFortune
} from "./GuideClient";
import {
  fetchTokyoWeather,
  getWeatherCondition,
  parseCachedTokyoWeather,
  type TokyoWeatherState,
  type WeatherCondition
} from "./TokyoWeather";
import {
  calculateGuideDirection,
  type GuideDirection,
  type VectorTuple
} from "./WorldNavigation";

const WEATHER_CACHE_KEY = "ewan-world-tokyo-weather";

export interface PlayerNavigationState {
  position: VectorTuple;
  surfaceNormal: VectorTuple;
  heading: VectorTuple;
  currentZoneId: DestinationId;
}

export interface ActiveGuideRecommendation extends GuideRecommendation {
  source: "ai" | "cache" | "local_fallback";
  tokyoDate: string;
  weather?: TokyoWeatherState;
}

export interface GuideLabels {
  open: string;
  title: string;
  sourceWeather: string;
  sourceFortune: string;
  scope: string;
  requesting: string;
  cancel: string;
  cancelled: string;
  close: string;
  chooseAgain: string;
  destinationLabel: string;
  directionLabel: string;
  fallbackNotice: string;
  fallbackKeepExisting: string;
  weatherTokyo: string;
  weatherLive: string;
  weatherStale: string;
  weatherUnavailable: string;
  weatherObservedAt: string;
  weatherAttribution: string;
  temperature: string;
  resultReady: string;
  markerLabel: string;
  omamoriLabel: string;
  fortuneDate: string;
  fortuneNotice: string;
  destinations: Record<DestinationId, string>;
  directions: Record<GuideDirection, string>;
  themes: Record<ThemeId, string>;
  conditions: Record<WeatherCondition, string>;
}

function localeTag(locale: Locale) {
  return locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US";
}

function formatTokyoDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: "Asia/Tokyo",
    dateStyle: "medium"
  }).format(new Date(`${value}T00:00:00+09:00`));
}

function formatTokyoObservation(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: "Asia/Tokyo",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function loadCachedWeather(): TokyoWeatherState | undefined {
  try {
    const raw = window.localStorage.getItem(WEATHER_CACHE_KEY);
    return raw ? parseCachedTokyoWeather(JSON.parse(raw)) ?? undefined : undefined;
  } catch {
    return undefined;
  }
}

function saveCachedWeather(weather: TokyoWeatherState) {
  if (weather.status !== "live") {
    return;
  }
  try {
    window.localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(weather));
  } catch {
    // The current result remains available when browser storage is blocked.
  }
}

function stopWorldPointer(event: PointerEvent<HTMLElement>) {
  event.stopPropagation();
}

export function GuidePanel({
  locale,
  labels,
  navigation,
  activeRecommendation,
  onActiveRecommendationChange
}: {
  locale: Locale;
  labels: GuideLabels;
  navigation: PlayerNavigationState;
  activeRecommendation: ActiveGuideRecommendation | null;
  onActiveRecommendationChange: (
    recommendation: ActiveGuideRecommendation | null
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"choose" | "requesting" | "result">(
    "choose"
  );
  const [notice, setNotice] = useState<
    "cancelled" | "fallback" | "keepExisting" | null
  >(null);
  const [weather, setWeather] = useState<TokyoWeatherState | undefined>();
  const [requester] = useState(() =>
    createSingleFlightRequester({ timeoutMs: 5000 })
  );
  const activeRef = useRef(activeRecommendation);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const chooseHeadingRef = useRef<HTMLHeadingElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const restoreOpenButtonFocus = useRef(false);
  const focusTarget = useRef<
    "close" | "choose" | "requesting" | "result" | null
  >(null);

  useEffect(() => {
    activeRef.current = activeRecommendation;
  }, [activeRecommendation]);

  useEffect(() => () => requester.cancel(), [requester]);

  useEffect(() => {
    if (open) {
      const target = focusTarget.current;
      focusTarget.current = null;
      if (target === "choose") {
        chooseHeadingRef.current?.focus();
      } else if (target === "requesting") {
        cancelButtonRef.current?.focus();
      } else if (target === "result") {
        resultHeadingRef.current?.focus();
      } else if (target === "close") {
        closeButtonRef.current?.focus();
      }
      return;
    }
    if (restoreOpenButtonFocus.current) {
      restoreOpenButtonFocus.current = false;
      openButtonRef.current?.focus();
    }
  }, [open, view]);

  const cancelRequest = () => {
    requester.cancel();
    setNotice("cancelled");
    focusTarget.current = activeRef.current ? "result" : "choose";
    setView(activeRef.current ? "result" : "choose");
  };

  const closePanel = () => {
    if (view === "requesting") {
      cancelRequest();
    }
    restoreOpenButtonFocus.current = true;
    setOpen(false);
  };

  const activate = (recommendation: ActiveGuideRecommendation) => {
    activeRef.current = recommendation;
    onActiveRecommendationChange(recommendation);
    focusTarget.current = "result";
    setView("result");
  };

  const requestRecommendation = async (mode: GuideMode) => {
    const tokyoDate = getTokyoDate();
    const currentZoneId = navigation.currentZoneId;
    const allowedDestinationIds = getAllowedDestinationIds(currentZoneId);
    const baseRequest = {
      mode,
      currentZoneId,
      allowedDestinationIds,
      tokyoDate
    } as const;

    setNotice(null);
    if (mode === "fortune") {
      const cached = loadCachedFortune(
        window.localStorage,
        tokyoDate,
        allowedDestinationIds
      );
      if (cached) {
        activate({ ...cached, source: "cache", tokyoDate });
        return;
      }
    }

    focusTarget.current = "requesting";
    setView("requesting");
    let requestWeather: TokyoWeatherState | undefined;
    const outcome = await requester.request(
      `${mode}:${currentZoneId}:${tokyoDate}`,
      async (signal) => {
        if (mode === "fortune") {
          return postGuideRequest(
            {
              mode,
              currentZoneId,
              allowedDestinationIds,
              tokyoDate
            },
            {
              signal,
              clientId: getGuideClientId(window.localStorage, window.crypto)
            }
          );
        }

        requestWeather = await fetchTokyoWeather({
          cached: loadCachedWeather(),
          signal
        });
        if (!signal.aborted) {
          setWeather(requestWeather);
        }
        if (requestWeather.status !== "live") {
          throw new Error("weather_unavailable");
        }
        saveCachedWeather(requestWeather);
        const weatherRequest: WeatherGuideRequest = {
          mode,
          currentZoneId,
          allowedDestinationIds,
          tokyoDate,
          weatherCode: requestWeather.weatherCode,
          temperatureC: requestWeather.temperatureC,
          observedAt: requestWeather.observedAt
        };
        return postGuideRequest(weatherRequest, {
          signal,
          clientId: getGuideClientId(window.localStorage, window.crypto)
        });
      }
    );

    if (outcome.status === "ignored") {
      return;
    }
    if (outcome.status === "success") {
      const next: ActiveGuideRecommendation = {
        ...outcome.value,
        source: "ai",
        tokyoDate,
        ...(mode === "weather" && requestWeather
          ? { weather: requestWeather }
          : {})
      };
      if (mode === "fortune") {
        saveCachedFortune(window.localStorage, tokyoDate, outcome.value);
      }
      activate(next);
      return;
    }

    if (requestWeather) {
      setWeather(requestWeather);
    }
    if (activeRef.current) {
      setNotice("keepExisting");
      focusTarget.current = "result";
      setView("result");
      return;
    }
    const fallback = createLocalRecommendation(baseRequest);
    if (fallback) {
      activate({
        ...fallback,
        source: "local_fallback",
        tokyoDate,
        ...(mode === "weather" && requestWeather
          ? { weather: requestWeather }
          : {})
      });
      setNotice("fallback");
    } else {
      setView("choose");
    }
  };

  const direction = activeRecommendation
    ? calculateGuideDirection({
        position: navigation.position,
        surfaceNormal: navigation.surfaceNormal,
        heading: navigation.heading,
        destinationId: activeRecommendation.destinationId
      })
    : null;

  const displayedWeather =
    activeRecommendation?.basis === "weather"
      ? activeRecommendation.weather ?? weather
      : undefined;
  const announcement =
    open && view === "requesting"
      ? labels.requesting
      : open && view === "result" && activeRecommendation && direction
        ? `${
            notice === "fallback"
              ? labels.fallbackNotice
              : notice === "keepExisting"
                ? labels.fallbackKeepExisting
                : labels.resultReady
          } ${labels.destinations[activeRecommendation.destinationId]}. ${
            labels.directions[direction]
          }`
        : open && notice === "cancelled"
          ? labels.cancelled
          : "";

  return (
    <div className="guide-layer">
      <p
        className="visually-hidden"
        data-testid="guide-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </p>
      {!open ? (
        <button
          ref={openButtonRef}
          className="guide-open-button"
          type="button"
          aria-expanded="false"
          onClick={() => {
            setView(activeRef.current ? "result" : "choose");
            focusTarget.current = "close";
            setOpen(true);
          }}
        >
          <span aria-hidden="true">◇</span>
          {labels.open}
        </button>
      ) : (
        <aside
          className="guide-panel"
          aria-label={labels.open}
          data-world-input-block="true"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closePanel();
            }
          }}
          onPointerDown={stopWorldPointer}
          onPointerMove={stopWorldPointer}
          onPointerUp={stopWorldPointer}
        >
          <button
            ref={closeButtonRef}
            className="guide-close-button"
            type="button"
            aria-label={labels.close}
            onClick={closePanel}
          >
            ×
          </button>

          {view === "choose" ? (
            <>
              <h2 ref={chooseHeadingRef} tabIndex={-1}>
                {labels.title}
              </h2>
              {notice === "cancelled" ? (
                <p className="guide-notice">
                  {labels.cancelled}
                </p>
              ) : null}
              <p className="guide-scope">{labels.scope}</p>
              <div className="guide-source-actions">
                <button
                  type="button"
                  onClick={() => void requestRecommendation("weather")}
                >
                  {labels.sourceWeather}
                </button>
                <button
                  type="button"
                  onClick={() => void requestRecommendation("fortune")}
                >
                  {labels.sourceFortune}
                </button>
              </div>
              <a
                className="guide-attribution"
                href="https://open-meteo.com/"
                target="_blank"
                rel="noreferrer"
              >
                {labels.weatherAttribution}
              </a>
            </>
          ) : view === "requesting" ? (
            <div className="guide-requesting">
              <span className="guide-spinner" aria-hidden="true" />
              <p>{labels.requesting}</p>
              <button ref={cancelButtonRef} type="button" onClick={cancelRequest}>
                {labels.cancel}
              </button>
            </div>
          ) : activeRecommendation && direction ? (
            <div className="guide-result">
              <h2
                ref={resultHeadingRef}
                className="start-eyebrow"
                tabIndex={-1}
              >
                {labels.resultReady}
              </h2>
              {notice ? (
                <p className="guide-notice">
                  {notice === "fallback"
                    ? labels.fallbackNotice
                    : notice === "keepExisting"
                      ? labels.fallbackKeepExisting
                      : labels.cancelled}
                </p>
              ) : null}
              <dl>
                <div>
                  <dt>{labels.destinationLabel}</dt>
                  <dd>{labels.destinations[activeRecommendation.destinationId]}</dd>
                </div>
                <div>
                  <dt>{labels.directionLabel}</dt>
                  <dd>{labels.directions[direction]}</dd>
                </div>
              </dl>
              <p className="guide-theme">
                {labels.themes[activeRecommendation.themeId]}
              </p>

              {activeRecommendation.basis === "fortune" ? (
                <div className="guide-context">
                  <p>
                    {labels.fortuneDate}: {formatTokyoDate(activeRecommendation.tokyoDate, locale)}
                  </p>
                  <p>{labels.fortuneNotice}</p>
                </div>
              ) : (
                <div className="guide-context">
                  {displayedWeather?.status === "live" ? (
                    <p>{labels.weatherTokyo}</p>
                  ) : null}
                  {displayedWeather?.status === "unavailable" || !displayedWeather ? (
                    <p>{labels.weatherUnavailable}</p>
                  ) : (
                    <>
                      <p>
                        {displayedWeather.status === "live"
                          ? labels.weatherLive
                          : labels.weatherStale}
                        {" · "}
                        {labels.conditions[
                          getWeatherCondition(displayedWeather.weatherCode)
                        ]}
                      </p>
                      <p>
                        {labels.temperature}: {new Intl.NumberFormat(localeTag(locale), {
                          maximumFractionDigits: 1
                        }).format(displayedWeather.temperatureC)}°C
                      </p>
                      <p>
                        {labels.weatherObservedAt}: {formatTokyoObservation(
                          displayedWeather.observedAt,
                          locale
                        )}
                      </p>
                    </>
                  )}
                  <a
                    className="guide-attribution"
                    href="https://open-meteo.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {labels.weatherAttribution}
                  </a>
                </div>
              )}

              <button
                className="guide-choose-again"
                type="button"
                onClick={() => {
                  setNotice(null);
                  focusTarget.current = "choose";
                  setView("choose");
                }}
              >
                {labels.chooseAgain}
              </button>
            </div>
          ) : null}
        </aside>
      )}

      {activeRecommendation && direction ? (
        <div className="guide-omamori">
          <span
            className={`guide-omamori-needle guide-omamori-needle-${direction}`}
            aria-hidden="true"
          />
          <span className="visually-hidden">
            {labels.omamoriLabel}: {labels.directions[direction]}. {labels.markerLabel}:{" "}
            {labels.destinations[activeRecommendation.destinationId]}
          </span>
        </div>
      ) : null}
    </div>
  );
}

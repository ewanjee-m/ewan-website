"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import type { Locale } from "../i18n/messages";
import {
  GuidePanel,
  type ActiveGuideRecommendation,
  type GuideLabels,
  type PlayerNavigationState
} from "../guide/GuidePanel";
import type { createCameraRig } from "./CameraRig";
import type { PlayerCharacterId } from "./CharacterAssets";
import { createInputController } from "./InputController";
import { attachWorldKeyboardInput } from "./KeyboardInput";
import { PortfolioGuide, type PortfolioEntry } from "./PortfolioGuide";
import {
  createInitialFlatWorldNavigationSnapshot,
  type FlatWorldNavigationSnapshot
} from "./FlatWorldSession";
import { RpgMiniMap, type RpgMiniMapLabels } from "./RpgMiniMap";
import { RpgWorldMap, type RpgWorldMapLabels } from "./RpgWorldMap";
import { WorldErrorBoundary } from "./WorldErrorBoundary";

const WorldCanvas = dynamic(() => import("./FlatWorldCanvas"), {
  ssr: false,
  loading: () => <div className="world-canvas-loading" aria-hidden="true" />
});

export type PlayerCharacter = PlayerCharacterId;
export type CameraRigController = ReturnType<typeof createCameraRig>;

interface WorldLabels {
  worldLabel: string;
  loadingWorld: string;
  movementControl: string;
  resetPosition: string;
  jump: string;
  worldFallback: string;
  portfolioLabel: string;
  openPortfolio: string;
  closePortfolioMenu: string;
  closePortfolio: string;
  miniMap: RpgMiniMapLabels;
  worldMap: RpgWorldMapLabels;
  guide: GuideLabels;
  portfolioItems: readonly PortfolioEntry[];
}

function blocksWorldMapShortcut(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

interface WorldViewProps {
  character: PlayerCharacter;
  locale: Locale;
  labels: WorldLabels;
}

export function shareWorldNavigationSnapshot(
  navigation: FlatWorldNavigationSnapshot
) {
  return Object.freeze({
    guide: navigation,
    miniMap: navigation,
    worldMap: navigation,
    telemetry: navigation
  });
}

export function WorldView({ character, locale, labels }: WorldViewProps) {
  const [input] = useState(() => createInputController());
  const [activeRecommendation, setActiveRecommendation] =
    useState<ActiveGuideRecommendation | null>(null);
  const [navigation, setNavigation] =
    useState<FlatWorldNavigationSnapshot>(
      createInitialFlatWorldNavigationSnapshot
    );
  const [worldMapOpen, setWorldMapOpen] = useState(false);
  const sharedNavigation = useMemo(
    () => shareWorldNavigationSnapshot(navigation),
    [navigation]
  );
  const worldMapTrigger = useRef<HTMLButtonElement>(null);
  const movementPointer = useRef<number | null>(null);
  const movementKnob = useRef<HTMLSpanElement>(null);
  const readableFallback = (
    <div className="world-fallback">
      <p className="start-eyebrow">{labels.loadingWorld}</p>
      <p>{labels.worldFallback}</p>
    </div>
  );
  const updateNavigation = useCallback(
    (nextNavigation: FlatWorldNavigationSnapshot) =>
      setNavigation((current) =>
        current === nextNavigation ? current : nextNavigation
      ),
    []
  );
  const closeWorldMap = useCallback(() => {
    setWorldMapOpen(false);
    worldMapTrigger.current?.focus();
  }, []);
  useEffect(() => {
    const detachKeyboard = attachWorldKeyboardInput(input);
    return detachKeyboard;
  }, [input]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.key !== "m" && event.key !== "M") ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        blocksWorldMapShortcut(event.target)
      ) {
        return;
      }
      event.preventDefault();
      if (worldMapOpen) {
        closeWorldMap();
      } else {
        setWorldMapOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeWorldMap, worldMapOpen]);

  const updateMovement = (event: ReactPointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) / 2);
    const x = (event.clientX - (bounds.left + bounds.width / 2)) / radius;
    const y = -(event.clientY - (bounds.top + bounds.height / 2)) / radius;
    const magnitude = Math.hypot(x, y);
    const scale = magnitude > 1 ? 1 / magnitude : 1;
    const strength = Math.min(1, magnitude);
    const movement = {
      x: x * scale,
      y: y * scale,
      runRequested: strength >= 0.85
    };
    if (movementKnob.current) {
      movementKnob.current.style.transform = `translate(${movement.x * 34}px, ${-movement.y * 34}px)`;
    }
    input.setTouchMovement(movement);
  };

  const releaseMovement = (event: ReactPointerEvent<HTMLElement>) => {
    if (movementPointer.current !== event.pointerId) {
      return;
    }
    movementPointer.current = null;
    if (movementKnob.current) {
      movementKnob.current.style.transform = "translate(0px, 0px)";
    }
    input.setTouchMovement(null);
  };

  return (
    <section
      className="world-shell"
      aria-label={labels.worldLabel}
      data-testid="world-view"
      data-character={character}
      data-locale={locale}
      data-navigation-revision={sharedNavigation.telemetry.revision}
      data-navigation-region={sharedNavigation.telemetry.navigationRegionId}
      data-transition-progress={
        sharedNavigation.telemetry.transitionProgress === null
          ? ""
          : sharedNavigation.telemetry.transitionProgress.toFixed(6)
      }
      data-current-zone={sharedNavigation.telemetry.currentZoneId}
      data-highlighted-zones={sharedNavigation.telemetry.highlightedZoneIds.join(",")}
      data-player-position={sharedNavigation.telemetry.position
        .map((value) => value.toFixed(3))
        .join(",")}
      data-player-heading={sharedNavigation.telemetry.heading
        .map((value) => value.toFixed(3))
        .join(",")}
    >
      <WorldErrorBoundary fallback={readableFallback}>
        <WorldCanvas
          character={character}
          input={input}
          activeDestinationId={activeRecommendation?.destinationId ?? null}
          onNavigationChange={updateNavigation}
        />
      </WorldErrorBoundary>

      <PortfolioGuide labels={labels} />

      <GuidePanel
          locale={locale}
          labels={labels.guide}
          navigation={
            sharedNavigation.guide as unknown as PlayerNavigationState
          }
          activeRecommendation={activeRecommendation}
          onActiveRecommendationChange={setActiveRecommendation}
      />

      <RpgMiniMap
          labels={labels.miniMap}
          navigation={sharedNavigation.miniMap}
      />

      <div className="world-controls">
        <div
          className="mobile-move-zone"
          role="region"
          aria-label={labels.movementControl}
          onPointerDown={(event) => {
            movementPointer.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            updateMovement(event);
          }}
          onPointerMove={(event) => {
            if (movementPointer.current === event.pointerId) {
              updateMovement(event);
            }
          }}
          onPointerUp={releaseMovement}
          onPointerCancel={releaseMovement}
          onLostPointerCapture={releaseMovement}
        >
          <span
            ref={movementKnob}
            className="mobile-move-knob"
            aria-hidden="true"
          />
        </div>

        <button
          className="world-control-button position-reset"
          type="button"
          aria-label={labels.resetPosition}
          onClick={() => input.queueReset()}
        >
          ⌂
        </button>
        <button
          ref={worldMapTrigger}
          className="world-control-button world-map-open"
          type="button"
          aria-label={labels.worldMap.open}
          aria-expanded={worldMapOpen}
          onClick={() =>
            worldMapOpen ? closeWorldMap() : setWorldMapOpen(true)
          }
        >
          ▣
        </button>
        <button
          className="world-control-button jump-button"
          type="button"
          aria-label={labels.jump}
          onClick={() => input.queueJump()}
        >
          ↑
        </button>
      </div>

      {worldMapOpen ? (
        <RpgWorldMap
          labels={labels.worldMap}
          navigation={sharedNavigation.worldMap}
          onClose={closeWorldMap}
        />
      ) : null}
    </section>
  );
}

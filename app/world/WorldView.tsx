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
import {
  PortfolioGuide,
  type PortfolioEntry,
  type PortfolioRequestedDialogue
} from "./PortfolioGuide";
import {
  createInitialWorldNavigationSnapshot,
  type WorldNavigationSnapshot
} from "./WorldNavigationState";
import { RpgMiniMap, type RpgMiniMapLabels } from "./RpgMiniMap";
import { RpgWorldMap, type RpgWorldMapLabels } from "./RpgWorldMap";
import { WorldCameraInput } from "./WorldCameraInput";
import { WorldErrorBoundary } from "./WorldErrorBoundary";
import {
  getWorldInteractionTarget,
  type WorldInteractionEntryId
} from "./WorldInteraction";
import { WorldInteractionPrompt } from "./WorldInteractionPrompt";

const WorldCanvas = dynamic(() => import("./SeamlessWorldCanvas"), {
  ssr: false,
  loading: () => <div className="world-canvas-loading" aria-hidden="true" />
});

export type PlayerCharacter = PlayerCharacterId;
export type CameraRigController = ReturnType<typeof createCameraRig>;

interface WorldLabels {
  worldLabel: string;
  loadingWorld: string;
  movementControl: string;
  cameraControl: string;
  resetPosition: string;
  jump: string;
  interact: string;
  talkToNpc: string;
  interactionNpcConversation: string;
  npcDialogues: Readonly<
    Record<string, { readonly speaker: string; readonly message: string }>
  >;
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
  navigation: WorldNavigationSnapshot
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
    useState<WorldNavigationSnapshot>(
      createInitialWorldNavigationSnapshot
    );
  const [worldMapOpen, setWorldMapOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [worldResetKey, setWorldResetKey] = useState(0);
  const [requestedEntryId, setRequestedEntryId] =
    useState<WorldInteractionEntryId | null>(null);
  const [requestedDialogue, setRequestedDialogue] =
    useState<PortfolioRequestedDialogue | null>(null);
  const sharedNavigation = useMemo(
    () => shareWorldNavigationSnapshot(navigation),
    [navigation]
  );
  const nearInteractionTarget = useMemo(
    () =>
      getWorldInteractionTarget(
        sharedNavigation.telemetry.nearInteractionId
      ),
    [sharedNavigation.telemetry.nearInteractionId]
  );
  const worldMapTrigger = useRef<HTMLButtonElement>(null);
  const interactionPromptHost = useRef<HTMLDivElement>(null);
  const interactionWasOpen = useRef(false);
  const movementPointer = useRef<number | null>(null);
  const movementKnob = useRef<HTMLSpanElement>(null);
  const retryWorld = useCallback(() => {
    input.reset();
    setWorldResetKey((current) => current + 1);
  }, [input]);
  const updateNavigation = useCallback(
    (nextNavigation: WorldNavigationSnapshot) =>
      setNavigation((current) =>
        current === nextNavigation ? current : nextNavigation
      ),
    []
  );
  const closeWorldMap = useCallback(() => {
    setWorldMapOpen(false);
    worldMapTrigger.current?.focus();
  }, []);
  const requestInteraction = useCallback(
    (entryId: WorldInteractionEntryId) => {
      if (interactionOpen || worldMapOpen) return;
      const actorId = nearInteractionTarget?.actorId;
      const dialogue = actorId ? labels.npcDialogues[actorId] : null;
      setRequestedDialogue(
        dialogue && nearInteractionTarget
          ? {
              contextLabel: `${
                labels.worldMap.destinations[
                  nearInteractionTarget.zoneId
                ]
              } · ${labels.interactionNpcConversation}`,
              speaker: dialogue.speaker,
              message: dialogue.message
            }
          : null
      );
      setRequestedEntryId(entryId);
    },
    [
      interactionOpen,
      labels.interactionNpcConversation,
      labels.npcDialogues,
      labels.worldMap.destinations,
      nearInteractionTarget,
      worldMapOpen
    ]
  );
  const handleInteractionOpenChange = useCallback((open: boolean) => {
    setInteractionOpen(open);
  }, []);
  useEffect(() => {
    const detachKeyboard = attachWorldKeyboardInput(input);
    return detachKeyboard;
  }, [input]);

  useEffect(() => {
    if (interactionOpen) {
      interactionWasOpen.current = true;
      input.reset();
      return;
    }
    if (interactionWasOpen.current) {
      interactionWasOpen.current = false;
      interactionPromptHost.current
        ?.querySelector<HTMLButtonElement>(".world-interaction-prompt")
        ?.focus();
    }
  }, [input, interactionOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.key !== "m" && event.key !== "M") ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        interactionOpen ||
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
  }, [closeWorldMap, interactionOpen, worldMapOpen]);

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
      data-interaction-open={interactionOpen}
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
      <WorldErrorBoundary
        resetKey={worldResetKey}
        onRetry={retryWorld}
        fallback={({ retry }) => (
          <div className="world-fallback">
            <p className="start-eyebrow">{labels.loadingWorld}</p>
            <p>{labels.worldFallback}</p>
            <button type="button" onClick={retry}>
              Retry
            </button>
          </div>
        )}
      >
        <WorldCanvas
          key={worldResetKey}
          character={character}
          input={input}
          inputLocked={interactionOpen}
          activeDestinationId={activeRecommendation?.destinationId ?? null}
          onInteractionRequest={requestInteraction}
          onNavigationChange={updateNavigation}
          onRetry={retryWorld}
        />
      </WorldErrorBoundary>

      <WorldCameraInput
        label={labels.cameraControl}
        onDrag={(deltaX, deltaY, pointerKind) =>
          input.addCameraDrag(deltaX, deltaY, pointerKind)
        }
      />

      <PortfolioGuide
        labels={labels}
        requestedEntryId={requestedEntryId}
        requestedDialogue={requestedDialogue}
        onOpenChange={handleInteractionOpenChange}
        onRequestHandled={() => {
          setRequestedEntryId(null);
          setRequestedDialogue(null);
        }}
      />

      <div ref={interactionPromptHost}>
        <WorldInteractionPrompt
          target={interactionOpen || worldMapOpen ? null : nearInteractionTarget}
          label={
            nearInteractionTarget?.actorId
              ? labels.talkToNpc
              : labels.interact
          }
          onInteract={() => {
            if (nearInteractionTarget) {
              requestInteraction(nearInteractionTarget.entryId);
            }
          }}
        />
      </div>

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
            if (interactionOpen) return;
            movementPointer.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            updateMovement(event);
          }}
          onPointerMove={(event) => {
            if (
              !interactionOpen &&
              movementPointer.current === event.pointerId
            ) {
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
          disabled={interactionOpen}
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
          disabled={interactionOpen}
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
          disabled={interactionOpen}
          // Fires on the press rather than on the click. A click needs the
          // finger to land and lift on the same element with nothing in
          // between; on a phone a touch that the browser decides was a drag
          // never produces one, and the visitor gets no jump and no reason
          // why. The keyboard still reaches it through onClick.
          onPointerDown={(event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            if (!interactionOpen) input.queueJump();
          }}
          onClick={(event) => {
            // A pointer press already queued it; only a keyboard activation,
            // which has no pointer behind it, needs this.
            if (event.detail === 0 && !interactionOpen) input.queueJump();
          }}
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

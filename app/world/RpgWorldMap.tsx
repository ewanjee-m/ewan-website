"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { DestinationId } from "../guide/GuideContract";
import {
  RPG_MAP_MARKER_GEOMETRY,
  RPG_MAP_NODES,
  RPG_MAP_PIXELS_PER_WORLD_UNIT,
  RPG_MAP_SCALE_WORLD_UNITS,
  RPG_WORLD_MAP_VIEW_BOX,
  getRpgMapNextZoneId,
  projectRpgMapWorldHeadingRotation,
  projectRpgMapWorldPoint
} from "./RpgMiniMapProjection";
import { RpgMapTerrain } from "./RpgMapTerrain";
import type { WorldNavigationSnapshot } from "./WorldNavigationState";

export interface RpgWorldMapLabels {
  title: string;
  open: string;
  close: string;
  hint: string;
  inspect: string;
  currentPosition: string;
  nextDestination: string;
  mainRoute: string;
  north: string;
  legendLabel: string;
  legendZone: string;
  legendRoute: string;
  legendPlayer: string;
  scale: string;
  destinations: Readonly<Record<DestinationId, string>>;
  destinationDescriptions: Readonly<Record<DestinationId, string>>;
}

interface RpgWorldMapProps {
  labels: RpgWorldMapLabels;
  navigation: WorldNavigationSnapshot;
  onClose: () => void;
}

const {
  playerHaloRadius,
  playerDiscRadius,
  playerArrowLength,
  arrivalRadius,
  arrivalRingRadius,
  compassRadius
} = RPG_MAP_MARKER_GEOMETRY;

const PLAYER_ARROW_PATH =
  `M ${playerArrowLength} 0 ` +
  `L ${-playerArrowLength * 0.45} ${playerArrowLength * 0.52} ` +
  `L ${-playerArrowLength * 0.14} 0 ` +
  `L ${-playerArrowLength * 0.45} ${-playerArrowLength * 0.52} Z`;

/**
 * On a phone the five buttons need a 44px touch target each, which is more room
 * than the markers leave, so they move out to a fixed ring around the edge and
 * a dashed leader keeps each one tied to its place. The percentages match the
 * mobile rules in globals.css.
 */
const MOBILE_ZONE_CONTROL_FRACTIONS = {
  airport: [0.12, 0.15],
  tokyo: [0.5, 0.15],
  gyukatsu: [0.88, 0.15],
  sakura: [0.29, 0.85],
  hanabi: [0.71, 0.85]
} as const satisfies Readonly<
  Record<DestinationId, readonly [number, number]>
>;

const ZONE_MARKERS = RPG_MAP_NODES.map((node) => {
  const [fractionX, fractionY] =
    MOBILE_ZONE_CONTROL_FRACTIONS[node.zoneId];
  return {
    arrivalId: node.arrivalId,
    destinationId: node.zoneId,
    left: (node.point.x / RPG_WORLD_MAP_VIEW_BOX.width) * 100,
    top: (node.point.y / RPG_WORLD_MAP_VIEW_BOX.height) * 100,
    anchor: [node.point.x, node.point.y] as const,
    headingRotation: node.headingRotation,
    mobileControlTarget: [
      Math.round(fractionX * RPG_WORLD_MAP_VIEW_BOX.width),
      Math.round(fractionY * RPG_WORLD_MAP_VIEW_BOX.height)
    ] as const
  };
});

const SCALE_BAR_LENGTH =
  RPG_MAP_SCALE_WORLD_UNITS * RPG_MAP_PIXELS_PER_WORLD_UNIT;
const SCALE_BAR_X = RPG_WORLD_MAP_VIEW_BOX.padding;
const SCALE_BAR_Y =
  RPG_WORLD_MAP_VIEW_BOX.height - RPG_WORLD_MAP_VIEW_BOX.padding + 18;

export function RpgWorldMap({
  labels,
  navigation,
  onClose
}: RpgWorldMapProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [selectedZoneId, setSelectedZoneId] = useState<DestinationId>(
    navigation.currentZoneId
  );
  const playerPoint = projectRpgMapWorldPoint(navigation.position);
  const headingRotation = projectRpgMapWorldHeadingRotation(navigation.heading);
  const nextZoneId = getRpgMapNextZoneId(navigation.currentZoneId);

  useEffect(() => {
    closeButton.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) {
        return;
      }
      const focusable = Array.from(
        dialog.current.querySelectorAll<HTMLButtonElement>(
          "button:not([disabled])"
        )
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = dialog.current.contains(active);
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      ref={dialog}
      className="rpg-world-map"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-world-input-block="true"
    >
      <header className="rpg-world-map-header">
        <div>
          <h2 id={titleId}>{labels.title}</h2>
          <p className="rpg-world-map-status">
            {`${labels.currentPosition}: ${labels.destinations[navigation.currentZoneId]}`}
            {nextZoneId
              ? ` · ${labels.nextDestination}: ${labels.destinations[nextZoneId]}`
              : ""}
          </p>
        </div>
        <button
          ref={closeButton}
          className="rpg-world-map-close"
          type="button"
          aria-label={labels.close}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <p className="rpg-world-map-hint">{labels.hint}</p>

      <div className="rpg-world-map-plane">
        <svg
          className="rpg-world-map-canvas"
          viewBox={`0 0 ${RPG_WORLD_MAP_VIEW_BOX.width} ${RPG_WORLD_MAP_VIEW_BOX.height}`}
          aria-hidden="true"
          data-navigation-revision={navigation.revision}
          data-navigation-region={navigation.navigationRegionId}
          data-transition-progress={
            navigation.transitionProgress === null
              ? ""
              : navigation.transitionProgress.toFixed(6)
          }
          data-current-zone={navigation.currentZoneId}
          data-next-zone={nextZoneId ?? ""}
          data-highlighted-zones={navigation.highlightedZoneIds.join(",")}
        >
          <RpgMapTerrain
            currentZoneId={navigation.currentZoneId}
            highlightedZoneIds={navigation.highlightedZoneIds}
            routeLabel={labels.mainRoute}
          />

          <g className="rpg-world-map-mobile-leaders" aria-hidden="true">
            {ZONE_MARKERS.map(
              ({ arrivalId, anchor, mobileControlTarget }) => (
                <line
                  key={arrivalId}
                  data-map-mobile-leader={arrivalId}
                  x1={anchor[0]}
                  y1={anchor[1]}
                  x2={mobileControlTarget[0]}
                  y2={mobileControlTarget[1]}
                  vectorEffect="non-scaling-stroke"
                />
              )
            )}
          </g>

          <g className="rpg-world-map-destinations">
            {RPG_MAP_NODES.map((node) => (
              <g
                key={node.arrivalId}
                className={`rpg-world-map-destination rpg-world-map-destination-${node.zoneId}`}
                data-map-destination={node.zoneId}
                data-current={node.zoneId === navigation.currentZoneId}
                data-next={node.zoneId === nextZoneId}
              >
                {node.zoneId === nextZoneId ? (
                  <circle
                    className="rpg-world-map-destination-next"
                    cx={node.point.x}
                    cy={node.point.y}
                    r={arrivalRingRadius}
                  />
                ) : null}
                <circle
                  className="rpg-world-map-destination-dot"
                  cx={node.point.x}
                  cy={node.point.y}
                  r={arrivalRadius}
                />
              </g>
            ))}
          </g>

          <g
            className="rpg-world-map-player"
            data-map-layer="player"
            data-map-source-id="player"
            data-navigation-revision={navigation.revision}
            data-anchor-reference={`${playerPoint.x},${playerPoint.y}`}
            data-marker-diameter-reference={playerHaloRadius * 2}
            transform={`translate(${playerPoint.x} ${playerPoint.y}) rotate(${headingRotation})`}
          >
            <circle className="rpg-world-map-player-halo" r={playerHaloRadius} />
            <circle className="rpg-world-map-player-disc" r={playerDiscRadius} />
            <path
              className="rpg-world-map-player-arrow"
              d={PLAYER_ARROW_PATH}
            />
          </g>

          <g
            className="rpg-world-map-scale-bar"
            data-map-scale-world-units={RPG_MAP_SCALE_WORLD_UNITS}
            data-map-scale-reference-pixels={SCALE_BAR_LENGTH}
          >
            <rect
              x={SCALE_BAR_X}
              y={SCALE_BAR_Y}
              width={SCALE_BAR_LENGTH}
              height="6"
            />
          </g>

          <g
            className="rpg-world-map-compass"
            transform={
              `translate(${RPG_WORLD_MAP_VIEW_BOX.width - compassRadius - 10} ` +
              `${compassRadius + 10})`
            }
          >
            <circle r={compassRadius} />
            <path d="M 0 -19 L 11 9 L 0 3 L -11 9 Z" />
            <text y="25">N</text>
          </g>
        </svg>

        {ZONE_MARKERS.map(({
          arrivalId,
          destinationId,
          left,
          top,
          anchor,
          headingRotation: nodeHeadingRotation,
          mobileControlTarget
        }) => (
          <button
            key={arrivalId}
            className={`rpg-world-map-zone-button rpg-world-map-zone-button-${destinationId}`}
            type="button"
            style={{ left: `${left}%`, top: `${top}%` }}
            aria-label={`${labels.inspect}: ${labels.destinations[destinationId]}`}
            aria-pressed={destinationId === selectedZoneId}
            data-map-layer="arrival"
            data-map-source-id={arrivalId}
            data-navigation-revision={navigation.revision}
            data-anchor-reference={anchor.join(",")}
            data-heading-rotation={nodeHeadingRotation}
            data-mobile-control-reference={mobileControlTarget.join(",")}
            data-touch-target-min-css="44x44"
            data-touch-rect-mobile-css="76x44"
            data-label-font-target-css-px="12"
            data-current={destinationId === selectedZoneId}
            data-next={destinationId === nextZoneId}
            onClick={() => setSelectedZoneId(destinationId)}
          >
            <span className="rpg-world-map-zone-dot" aria-hidden="true" />
            <span className="rpg-world-map-zone-name">
              {labels.destinations[destinationId]}
            </span>
          </button>
        ))}
      </div>

      <p data-testid="world-map-selected-description">
        {labels.destinationDescriptions[selectedZoneId]}
      </p>

      <section className="rpg-world-map-legend" aria-label={labels.legendLabel}>
        <span className="rpg-world-map-legend-item rpg-world-map-legend-zone">
          {labels.legendZone}
        </span>
        <span className="rpg-world-map-legend-item rpg-world-map-legend-route">
          {`${labels.legendRoute} · ${labels.mainRoute}`}
        </span>
        <span className="rpg-world-map-legend-item rpg-world-map-legend-player">
          {labels.legendPlayer}
        </span>
        <span className="rpg-world-map-legend-item rpg-world-map-legend-next">
          {labels.nextDestination}
        </span>
        <span className="rpg-world-map-legend-item rpg-world-map-legend-north">
          {labels.north}
        </span>
        <span className="rpg-world-map-scale-note">
          {`${labels.scale} · ${RPG_MAP_SCALE_WORLD_UNITS}m`}
        </span>
      </section>
    </div>
  );
}

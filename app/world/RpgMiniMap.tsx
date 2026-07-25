"use client";

import { useId, useState, useSyncExternalStore } from "react";
import type { DestinationId } from "../guide/GuideContract";
import {
  RPG_MAP_LABEL_FONT_SIZE,
  RPG_MAP_MARKER_GEOMETRY,
  RPG_MAP_NODES,
  RPG_MINI_MAP_LABEL_CSS_PIXELS,
  RPG_MINI_MAP_VIEW_BOX,
  getRpgMapNextZoneId,
  projectRpgMapWorldHeadingRotation,
  projectRpgMapWorldPoint
} from "./RpgMiniMapProjection";
import { RpgMapTerrain } from "./RpgMapTerrain";
import type { WorldNavigationSnapshot } from "./WorldNavigationState";

export interface RpgMiniMapLabels {
  label: string;
  expand: string;
  collapse: string;
  currentPosition: string;
  nextDestination: string;
  mainRoute: string;
  north: string;
  destinations: Readonly<Record<DestinationId, string>>;
}

interface RpgMiniMapProps {
  labels: RpgMiniMapLabels;
  navigation: WorldNavigationSnapshot;
}

const COMPACT_MINI_MAP_QUERY =
  "(max-width: 640px), (max-height: 540px) and (pointer: coarse)";

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

function subscribeToCompactViewport(onStoreChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => undefined;
  }
  const mediaQuery = window.matchMedia(COMPACT_MINI_MAP_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getCompactViewportSnapshot() {
  return typeof window !== "undefined" && Boolean(window.matchMedia)
    ? window.matchMedia(COMPACT_MINI_MAP_QUERY).matches
    : false;
}

const getCompactViewportServerSnapshot = () => false;

export function RpgMiniMap({
  labels,
  navigation
}: RpgMiniMapProps) {
  const compactViewport = useSyncExternalStore(
    subscribeToCompactViewport,
    getCompactViewportSnapshot,
    getCompactViewportServerSnapshot
  );
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const expanded = expandedOverride ?? !compactViewport;
  const mapId = useId();
  const playerPoint = projectRpgMapWorldPoint(navigation.position);
  const headingRotation = projectRpgMapWorldHeadingRotation(navigation.heading);
  const nextZoneId = getRpgMapNextZoneId(navigation.currentZoneId);

  return (
    <div className="rpg-mini-map" data-expanded={expanded}>
      <button
        className="rpg-mini-map-toggle"
        type="button"
        aria-label={expanded ? labels.collapse : labels.expand}
        aria-controls={mapId}
        aria-expanded={expanded}
        onClick={() =>
          setExpandedOverride(
            (current) => !(current ?? !compactViewport)
          )
        }
      >
        <span>{labels.label}</span>
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>

      {expanded ? (
        <svg
          id={mapId}
          className="rpg-mini-map-canvas"
          viewBox={`0 0 ${RPG_MINI_MAP_VIEW_BOX.width} ${RPG_MINI_MAP_VIEW_BOX.height}`}
          role="group"
          aria-label={labels.label}
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

          <g className="rpg-mini-map-destinations">
            {RPG_MAP_NODES.map((node) => {
              const isNext = node.zoneId === nextZoneId;
              const isCurrent = node.zoneId === navigation.currentZoneId;
              return (
                <g
                  key={node.arrivalId}
                  className={`rpg-mini-map-destination rpg-mini-map-destination-${node.zoneId}`}
                  data-map-layer="arrival"
                  data-map-source-id={node.arrivalId}
                  data-navigation-revision={navigation.revision}
                  data-anchor-reference={`${node.point.x},${node.point.y}`}
                  data-heading-rotation={node.headingRotation}
                  data-marker-diameter-reference={arrivalRadius * 2}
                  data-current={isCurrent}
                  data-next={isNext}
                  data-highlighted={navigation.highlightedZoneIds.includes(
                    node.zoneId
                  )}
                  role="img"
                  aria-label={
                    isNext
                      ? `${labels.nextDestination}: ${labels.destinations[node.zoneId]}`
                      : labels.destinations[node.zoneId]
                  }
                >
                  {isNext ? (
                    <circle
                      className="rpg-mini-map-destination-next"
                      cx={node.point.x}
                      cy={node.point.y}
                      r={arrivalRingRadius}
                    />
                  ) : null}
                  <circle
                    className="rpg-mini-map-destination-dot"
                    cx={node.point.x}
                    cy={node.point.y}
                    r={arrivalRadius}
                  />
                  <text
                    className="rpg-mini-map-label"
                    data-map-label={node.zoneId}
                    data-label-font-target-css-px={RPG_MINI_MAP_LABEL_CSS_PIXELS}
                    x={node.label.x}
                    y={node.label.y}
                    textAnchor={node.label.anchor}
                    fontSize={RPG_MAP_LABEL_FONT_SIZE}
                  >
                    {labels.destinations[node.zoneId]}
                  </text>
                </g>
              );
            })}
          </g>

          <g
            className="rpg-mini-map-player"
            data-map-layer="player"
            data-map-source-id="player"
            data-navigation-revision={navigation.revision}
            data-anchor-reference={`${playerPoint.x},${playerPoint.y}`}
            data-marker-diameter-reference={playerHaloRadius * 2}
            role="img"
            aria-label={`${labels.currentPosition}: ${labels.destinations[navigation.currentZoneId]}`}
            transform={`translate(${playerPoint.x} ${playerPoint.y}) rotate(${headingRotation})`}
          >
            <circle className="rpg-mini-map-player-halo" r={playerHaloRadius} />
            <circle className="rpg-mini-map-player-disc" r={playerDiscRadius} />
            <path
              className="rpg-mini-map-player-arrow"
              d={PLAYER_ARROW_PATH}
            />
          </g>

          <g
            className="rpg-mini-map-compass"
            role="img"
            aria-label={labels.north}
            transform={
              `translate(${RPG_MINI_MAP_VIEW_BOX.width - compassRadius - 10} ` +
              `${compassRadius + 10})`
            }
          >
            <circle r={compassRadius} />
            <path d="M 0 -19 L 11 9 L 0 3 L -11 9 Z" />
            <text y="25">N</text>
          </g>
        </svg>
      ) : null}
    </div>
  );
}

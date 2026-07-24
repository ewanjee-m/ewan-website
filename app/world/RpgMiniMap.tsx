"use client";

import { useId, useState, useSyncExternalStore } from "react";
import type { DestinationId } from "../guide/GuideContract";
import {
  RPG_MINI_MAP_VIEW_BOX,
  RPG_REFERENCE_MAP_COASTLINE,
  RPG_REFERENCE_MAP_NODES,
  RPG_REFERENCE_MAP_TRANSITIONS,
  projectRpgReferenceMapHeadingRotation,
  projectRpgReferenceMapPoint,
  serializeRpgReferencePoints
} from "./RpgMiniMapProjection";
import { RpgMapTerrain } from "./RpgMapTerrain";
import type { WorldNavigationSnapshot } from "./WorldNavigationState";

export interface RpgMiniMapLabels {
  label: string;
  expand: string;
  collapse: string;
  currentPosition: string;
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
  const playerPoint = projectRpgReferenceMapPoint(navigation.position);
  const headingRotation = projectRpgReferenceMapHeadingRotation(
    navigation.position,
    navigation.heading
  );

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
        <>
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
          data-highlighted-zones={navigation.highlightedZoneIds.join(",")}
        >
          <RpgMapTerrain />
          <polygon
            className="rpg-mini-map-coastline"
            data-map-layer="coastline"
            data-map-source-id="approved-reference-coastline"
            fill="none"
            stroke="rgba(255, 255, 255, 0.78)"
            strokeWidth="5"
            points={serializeRpgReferencePoints(RPG_REFERENCE_MAP_COASTLINE)}
          />

          <g className="rpg-mini-map-zones" aria-hidden="true">
            {RPG_REFERENCE_MAP_NODES.map((node) => (
              <circle
                key={node.zoneId}
                className={`rpg-mini-map-zone rpg-mini-map-zone-${node.zoneId}`}
                data-map-layer="zone"
                data-map-source-id={node.zoneId}
                data-anchor-reference={node.referencePixel.join(",")}
                data-marker-diameter-reference="48"
                data-current={node.zoneId === navigation.currentZoneId}
                data-highlighted={navigation.highlightedZoneIds.includes(
                  node.zoneId
                )}
                cx={node.referencePixel[0]}
                cy={node.referencePixel[1]}
                r="24"
                style={{
                  opacity: navigation.highlightedZoneIds.includes(node.zoneId)
                    ? 1
                    : 0.45
                }}
              />
            ))}
          </g>

          <g
            className="rpg-mini-map-route"
            role="img"
            aria-label={labels.mainRoute}
          >
            {RPG_REFERENCE_MAP_TRANSITIONS.map((route) => (
              <polyline
                key={route.id}
                className={`rpg-mini-map-route-segment rpg-mini-map-route-${route.kind}`}
                data-map-layer={route.kind === "bridge" ? "bridge" : "route"}
                data-map-source-id={route.id}
                fill="none"
                style={{
                  fill: "none",
                  stroke:
                    route.kind === "bridge" ? "#ffb15f" : "#fff3cf",
                  strokeWidth: route.kind === "bridge" ? 16 : 12
                }}
                points={serializeRpgReferencePoints(route.points)}
              />
            ))}
          </g>

          <g className="rpg-mini-map-destinations">
            {RPG_REFERENCE_MAP_NODES.map(
              (arrival) => {
              const destinationId = arrival.zoneId;
              return (
                <g
                  key={arrival.arrivalId}
                  className={`rpg-mini-map-destination rpg-mini-map-destination-${destinationId}`}
                  data-map-layer="arrival"
                  data-map-source-id={arrival.arrivalId}
                  data-navigation-revision={navigation.revision}
                  data-anchor-reference={arrival.referencePixel.join(",")}
                  data-marker-diameter-reference="40"
                  data-current={destinationId === navigation.currentZoneId}
                  role="img"
                  aria-label={labels.destinations[destinationId]}
                  transform={`translate(${arrival.referencePixel[0]} ${arrival.referencePixel[1]})`}
                >
                  <circle r="20" />
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
            data-marker-diameter-reference="42"
            role="img"
            aria-label={`${labels.currentPosition}: ${labels.destinations[navigation.currentZoneId]}`}
            transform={`translate(${playerPoint.x} ${playerPoint.y}) rotate(${headingRotation})`}
          >
            <circle className="rpg-mini-map-player-halo" r="34" />
            <circle className="rpg-mini-map-player-disc" r="21" />
            <path
              className="rpg-mini-map-player-arrow"
              d="M 36 0 L -16 19 L -5 0 L -16 -19 Z"
            />
          </g>

          <g
            className="rpg-mini-map-compass"
            role="img"
            aria-label={labels.north}
            transform={`translate(${RPG_MINI_MAP_VIEW_BOX.width - 92} 92)`}
          >
            <circle r="42" />
            <path d="M 0 -31 L 18 16 L 0 5 L -18 16 Z" />
            <text y="38">N</text>
          </g>
          </svg>
          <div
            className="rpg-mini-map-labels"
            data-map-label-layout="non-overlapping-grid"
          >
            {RPG_REFERENCE_MAP_NODES.map((node) => (
              <span
                key={node.arrivalId}
                className={`rpg-mini-map-label rpg-mini-map-label-${node.zoneId}`}
                data-map-label={node.zoneId}
                data-label-font-target-css-px="10"
                data-anchor-reference={node.referencePixel.join(",")}
              >
                <span aria-hidden="true" />
                {labels.destinations[node.zoneId]}
              </span>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

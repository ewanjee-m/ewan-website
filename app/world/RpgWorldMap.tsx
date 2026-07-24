"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { DestinationId } from "../guide/GuideContract";
import {
  RPG_CANONICAL_MAP_GEOMETRY,
  RPG_MAP_TERRAIN_ASSET,
  RPG_REFERENCE_MAP_COASTLINE,
  RPG_REFERENCE_MAP_NODES,
  RPG_REFERENCE_MAP_TRANSITIONS,
  RPG_WORLD_MAP_VIEW_BOX,
  projectRpgReferenceMapHeadingRotation,
  projectRpgReferenceMapPoint,
  serializeRpgReferencePoints
} from "./RpgMiniMapProjection";
import type { FlatWorldNavigationSnapshot } from "./FlatWorldSession";

export interface RpgWorldMapLabels {
  title: string;
  open: string;
  close: string;
  hint: string;
  travelTo: string;
  currentPosition: string;
  mainRoute: string;
  north: string;
  legendLabel: string;
  legendZone: string;
  legendRoute: string;
  legendPlayer: string;
  scale: string;
  destinations: Readonly<Record<DestinationId, string>>;
}

interface RpgWorldMapProps {
  labels: RpgWorldMapLabels;
  navigation: FlatWorldNavigationSnapshot;
  onClose: () => void;
}

const SCALE_WORLD_DISTANCE = 20;

const MOBILE_ZONE_CONTROL_TARGETS = {
  airport: [218, 130],
  tokyo: [909, 130],
  gyukatsu: [1599, 130],
  sakura: [527, 736],
  hanabi: [1290, 736]
} as const satisfies Readonly<
  Record<DestinationId, readonly [number, number]>
>;

const ZONE_MARKERS = RPG_REFERENCE_MAP_NODES.map((arrival) => {
  return {
    arrivalId: arrival.arrivalId,
    destinationId: arrival.zoneId,
    left: (arrival.referencePixel[0] / RPG_WORLD_MAP_VIEW_BOX.width) * 100,
    top: (arrival.referencePixel[1] / RPG_WORLD_MAP_VIEW_BOX.height) * 100,
    anchor: arrival.referencePixel,
    mobileControlTarget: MOBILE_ZONE_CONTROL_TARGETS[arrival.zoneId]
  };
});

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
  const playerPoint = projectRpgReferenceMapPoint(navigation.position);
  const headingRotation = projectRpgReferenceMapHeadingRotation(
    navigation.position,
    navigation.heading
  );

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

      <div
        className="rpg-world-map-plane"
        style={{ aspectRatio: `${RPG_WORLD_MAP_VIEW_BOX.width} / ${RPG_WORLD_MAP_VIEW_BOX.height}` }}
      >
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
          data-highlighted-zones={navigation.highlightedZoneIds.join(",")}
        >
          <image
            className="rpg-world-map-background rpg-world-map-terrain"
            data-map-layer="terrain"
            data-map-source-id={RPG_CANONICAL_MAP_GEOMETRY.terrain.sourceId}
            href={RPG_MAP_TERRAIN_ASSET}
            width={RPG_WORLD_MAP_VIEW_BOX.width}
            height={RPG_WORLD_MAP_VIEW_BOX.height}
            preserveAspectRatio="none"
          />
          <polygon
            className="rpg-world-map-coastline"
            data-map-layer="coastline"
            data-map-source-id="approved-reference-coastline"
            fill="none"
            stroke="rgba(255, 255, 255, 0.82)"
            strokeWidth="5"
            points={serializeRpgReferencePoints(RPG_REFERENCE_MAP_COASTLINE)}
          />

          <g className="rpg-world-map-zones">
            {RPG_REFERENCE_MAP_NODES.map((node) => (
              <circle
                key={node.zoneId}
                className={`rpg-world-map-zone rpg-world-map-zone-${node.zoneId}`}
                data-map-layer="zone"
                data-map-source-id={node.zoneId}
                data-anchor-reference={node.referencePixel.join(",")}
                data-marker-diameter-reference="56"
                data-current={node.zoneId === navigation.currentZoneId}
                data-highlighted={navigation.highlightedZoneIds.includes(
                  node.zoneId
                )}
                cx={node.referencePixel[0]}
                cy={node.referencePixel[1]}
                r="28"
                style={{
                  opacity: navigation.highlightedZoneIds.includes(node.zoneId)
                    ? 1
                    : 0.45
                }}
              />
            ))}
          </g>

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

          <g className="rpg-world-map-route">
            {RPG_REFERENCE_MAP_TRANSITIONS.map((route) => (
              <polyline
                key={route.id}
                className={`rpg-world-map-route-segment rpg-world-map-route-${route.kind}`}
                data-map-layer={route.kind === "bridge" ? "bridge" : "route"}
                data-map-source-id={route.id}
                fill="none"
                style={{
                  fill: "none",
                  stroke:
                    route.kind === "bridge" ? "#ffb15f" : "#fff3cf",
                  strokeWidth: route.kind === "bridge" ? 18 : 14
                }}
                points={serializeRpgReferencePoints(route.points)}
              />
            ))}
          </g>

          <g
            className="rpg-world-map-player"
            data-map-layer="player"
            data-map-source-id="player"
            data-navigation-revision={navigation.revision}
            data-anchor-reference={`${playerPoint.x},${playerPoint.y}`}
            data-marker-diameter-reference="30"
            transform={`translate(${playerPoint.x} ${playerPoint.y}) rotate(${headingRotation})`}
          >
            <circle className="rpg-world-map-player-halo" r="26" />
            <circle className="rpg-world-map-player-disc" r="15" />
            <path
              className="rpg-world-map-player-arrow"
              d="M 30 0 L -13 15 L -4 0 L -13 -15 Z"
            />
          </g>

          <g
            className="rpg-world-map-compass"
            transform={`translate(${RPG_WORLD_MAP_VIEW_BOX.width - 92} 92)`}
          >
            <circle r="26" />
            <path d="M 0 -18 L 9 8 L 0 3 L -9 8 Z" />
            <text y="22">N</text>
          </g>
        </svg>

        {ZONE_MARKERS.map(({
          arrivalId,
          destinationId,
          left,
          top,
          anchor,
          mobileControlTarget
        }) => (
          <button
            key={arrivalId}
            className={`rpg-world-map-zone-button rpg-world-map-zone-button-${destinationId}`}
            type="button"
            style={{ left: `${left}%`, top: `${top}%` }}
            aria-label={`${labels.travelTo}: ${labels.destinations[destinationId]}`}
            aria-current={destinationId === selectedZoneId}
            data-map-layer="arrival"
            data-map-source-id={arrivalId}
            data-navigation-revision={navigation.revision}
            data-anchor-reference={anchor.join(",")}
            data-mobile-control-reference={mobileControlTarget.join(",")}
            data-touch-target-min-css="44x44"
            data-touch-rect-mobile-css="76x44"
            data-label-font-target-css-px="12"
            data-current={destinationId === selectedZoneId}
            onClick={() => setSelectedZoneId(destinationId)}
          >
            <span className="rpg-world-map-zone-dot" aria-hidden="true" />
            <span className="rpg-world-map-zone-name">
              {labels.destinations[destinationId]}
            </span>
          </button>
        ))}
      </div>

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
        <span className="rpg-world-map-legend-item rpg-world-map-legend-north">
          {labels.north}
        </span>
        <span className="rpg-world-map-scale-note">
          {`${labels.scale} · ${SCALE_WORLD_DISTANCE}m`}
        </span>
      </section>
    </div>
  );
}

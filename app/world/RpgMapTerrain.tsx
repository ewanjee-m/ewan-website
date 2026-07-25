import type { DestinationId } from "../guide/GuideContract";
import {
  RPG_MAP_BRIDGE,
  RPG_MAP_CANAL,
  RPG_MAP_COLORS,
  RPG_MAP_LAND,
  RPG_MAP_ROADS,
  RPG_MAP_VIEW_BOX,
  RPG_MAP_ZONES,
  RPG_MAP_ZONE_COLORS,
  serializeRpgMapWorldPolygon
} from "./RpgMiniMapProjection";

interface RpgMapTerrainProps {
  currentZoneId: DestinationId;
  highlightedZoneIds: readonly DestinationId[];
  routeLabel: string;
}

/**
 * The town seen from above, drawn straight from the world model: the land
 * plate, the five districts, the roads that are actually walkable, the canal
 * that is not, and the bridge that crosses it. Shared by the docked mini-map
 * and the full-screen map so both show the same town at the same scale.
 */
export function RpgMapTerrain({
  currentZoneId,
  highlightedZoneIds,
  routeLabel
}: RpgMapTerrainProps) {
  return (
    <g data-map-layer="model-terrain">
      <rect
        className="rpg-map-terrain-sea"
        data-map-layer="sea"
        x="0"
        y="0"
        width={RPG_MAP_VIEW_BOX.width}
        height={RPG_MAP_VIEW_BOX.height}
        fill={RPG_MAP_COLORS.sea}
      />
      <polygon
        className="rpg-map-terrain-land"
        data-map-layer="land"
        data-map-source-id={RPG_MAP_LAND.sourceId}
        fill={RPG_MAP_COLORS.land}
        stroke={RPG_MAP_COLORS.landEdge}
        strokeWidth="3"
        points={serializeRpgMapWorldPolygon(RPG_MAP_LAND.polygon)}
      />

      <g className="rpg-map-terrain-zones">
        {RPG_MAP_ZONES.map((zone) => (
          <polygon
            key={zone.id}
            className={`rpg-map-terrain-zone rpg-map-terrain-zone-${zone.id}`}
            data-map-layer="zone"
            data-map-source-id={zone.id}
            data-map-zone={zone.id}
            data-current={zone.id === currentZoneId}
            data-highlighted={highlightedZoneIds.includes(zone.id)}
            fill={RPG_MAP_ZONE_COLORS[zone.id]}
            points={serializeRpgMapWorldPolygon(zone.displayPolygon)}
          />
        ))}
      </g>

      <g className="rpg-map-terrain-routes" role="img" aria-label={routeLabel}>
        {RPG_MAP_ROADS.map((route) => (
          <polygon
            key={route.id}
            className="rpg-map-terrain-route"
            data-map-layer="route"
            data-map-source-id={route.id}
            data-map-route={route.id}
            fill={RPG_MAP_COLORS.road}
            stroke={RPG_MAP_COLORS.roadEdge}
            strokeWidth="2"
            points={serializeRpgMapWorldPolygon(route.polygon)}
          />
        ))}
      </g>

      <polygon
        className="rpg-map-terrain-water"
        data-map-layer="water"
        data-map-source-id={RPG_MAP_CANAL.id}
        data-map-water={RPG_MAP_CANAL.id}
        fill={RPG_MAP_COLORS.canal}
        stroke={RPG_MAP_COLORS.canalEdge}
        strokeWidth="2"
        points={serializeRpgMapWorldPolygon(RPG_MAP_CANAL.polygon)}
      />
      <polygon
        className="rpg-map-terrain-bridge"
        data-map-layer="bridge"
        data-map-source-id={RPG_MAP_BRIDGE.id}
        data-map-bridge={RPG_MAP_BRIDGE.id}
        fill={RPG_MAP_COLORS.bridge}
        stroke={RPG_MAP_COLORS.bridgeEdge}
        strokeWidth="2"
        points={serializeRpgMapWorldPolygon(RPG_MAP_BRIDGE.polygon)}
      />
    </g>
  );
}

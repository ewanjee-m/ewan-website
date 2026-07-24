import {
  RPG_WORLD_BRIDGE,
  RPG_WORLD_CANAL,
  RPG_WORLD_ROUTES,
  RPG_WORLD_ZONES
} from "./RpgWorldModel";
import {
  projectRpgWorldPolygon,
  serializeRpgReferencePoints
} from "./RpgMiniMapProjection";

export function RpgMapTerrain() {
  return (
    <g data-map-layer="model-terrain">
      {RPG_WORLD_ZONES.map((zone) => (
        <polygon
          key={zone.id}
          data-map-zone={zone.id}
          points={serializeRpgReferencePoints(
            projectRpgWorldPolygon(zone.displayPolygon)
          )}
        />
      ))}
      <polygon
        data-map-water={RPG_WORLD_CANAL.id}
        points={serializeRpgReferencePoints(
          projectRpgWorldPolygon(RPG_WORLD_CANAL.polygon)
        )}
      />
      {RPG_WORLD_ROUTES.map((route) => (
        <polygon
          key={route.id}
          data-map-route={route.id}
          points={serializeRpgReferencePoints(
            projectRpgWorldPolygon(route.polygon)
          )}
        />
      ))}
      <polygon
        data-map-bridge={RPG_WORLD_BRIDGE.id}
        points={serializeRpgReferencePoints(
          projectRpgWorldPolygon(RPG_WORLD_BRIDGE.polygon)
        )}
      />
    </g>
  );
}

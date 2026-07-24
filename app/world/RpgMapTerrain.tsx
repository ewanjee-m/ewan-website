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
          className="rpg-map-terrain-zone"
          fill="#dfcfaa"
          stroke="#8d745b"
          strokeWidth="2"
          data-map-zone={zone.id}
          points={serializeRpgReferencePoints(
            projectRpgWorldPolygon(zone.displayPolygon)
          )}
        />
      ))}
      <polygon
        className="rpg-map-terrain-water"
        fill="#8bc9d9"
        stroke="#4d91a8"
        strokeWidth="2"
        data-map-water={RPG_WORLD_CANAL.id}
        points={serializeRpgReferencePoints(
          projectRpgWorldPolygon(RPG_WORLD_CANAL.polygon)
        )}
      />
      {RPG_WORLD_ROUTES.map((route) => (
        <polygon
          key={route.id}
          className="rpg-map-terrain-route"
          fill="#d6b184"
          stroke="#9a734b"
          strokeWidth="2"
          data-map-route={route.id}
          points={serializeRpgReferencePoints(
            projectRpgWorldPolygon(route.polygon)
          )}
        />
      ))}
      <polygon
        className="rpg-map-terrain-bridge"
        fill="#b67d52"
        stroke="#74462d"
        strokeWidth="2"
        data-map-bridge={RPG_WORLD_BRIDGE.id}
        points={serializeRpgReferencePoints(
          projectRpgWorldPolygon(RPG_WORLD_BRIDGE.polygon)
        )}
      />
    </g>
  );
}

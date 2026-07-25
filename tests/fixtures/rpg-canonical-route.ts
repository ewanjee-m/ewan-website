/**
 * The bridge approach sits at x 14.9 rather than the bridge's own south-west
 * corner at 14.3 because the visitor got wider, not because the assertion got
 * easier. RPG_PLAYER_COLLISION_RADIUS is the silhouette the world holds off
 * solid things, and the chibi rebuild raised it from 0.3 to 0.53 to cover the
 * skull rather than the torso. That grows every blocker by 0.23 units a side,
 * and sakura-tree-05 at (12.8, -16.53) with a 1.075 half-size then reaches
 * x 14.405 — so (14.3, -18) sits inside a tree. Not "hard to stand on": there
 * is no walkable point anywhere inside the arrival tolerance of it, which is
 * why the route driver deadlocked against it instead of merely missing it.
 *
 * 14.9 is the nearest point east whose whole tolerance disc is standing room
 * and whose legs in and out are clear end to end, and it is clear at the
 * narrower 0.3 radius too, so the route no longer depends on which way that
 * number lands. z stays on the deck edge, so BRIDGE_STEERING_Z still aims 0.02
 * onto the bridge. rpg-canonical-route-walkable checks all of it, so the next
 * silhouette change fails on the cause rather than on a route test 40 seconds
 * in. The tolerance below is unchanged.
 */
export const RPG_CANONICAL_ROUTE = [
  [-26.304534009865293, -2.973191261452298],
  [-27, -2.973191261452298],
  [-29, -2.973191261452298],
  [-29, 20],
  [-8, 20],
  [-7, 20],
  [-7, 9],
  [-8, 9],
  [-8, 0],
  [8, 0],
  [8, -11],
  [9, -20],
  [14.9, -18],
  [18.9, -18],
  [26, -18]
] as const;

export const RPG_CANONICAL_ROUTE_TOLERANCE = 0.05;

const BRIDGE_STEERING_Z = -17.98;
const AIRPORT_NORTH_STEERING_X = -28.97;
const TOKYO_WEST_STEERING_Z = 19.97;
const TOKYO_SOUTH_STEERING_X = -7.97;

export const RPG_CANONICAL_ROUTE_STEERING =
  RPG_CANONICAL_ROUTE.map((point, index) =>
    index === 2
      ? ([AIRPORT_NORTH_STEERING_X, point[1]] as const)
      : index === 3
        ? ([
            AIRPORT_NORTH_STEERING_X,
            TOKYO_WEST_STEERING_Z
          ] as const)
        : index === 4
          ? ([point[0], TOKYO_WEST_STEERING_Z] as const)
          : index === 7 || index === 8
            ? ([TOKYO_SOUTH_STEERING_X, point[1]] as const)
            : index === 12 || index === 13
              ? ([point[0], BRIDGE_STEERING_Z] as const)
              : point
  );

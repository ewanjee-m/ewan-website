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
  [14.3, -18],
  [18.9, -18],
  [26, -18]
] as const;

export const RPG_CANONICAL_ROUTE_TOLERANCE = 0.05;

const BRIDGE_STEERING_Z = -17.98;

export const RPG_CANONICAL_ROUTE_STEERING =
  RPG_CANONICAL_ROUTE.map((point, index) =>
    index === 12 || index === 13
      ? ([point[0], BRIDGE_STEERING_Z] as const)
      : point
  );

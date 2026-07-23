import { Float32BufferAttribute, Uint16BufferAttribute, Vector3 } from "three";

const MAX_INFLUENCES = 4;
const FALLOFF_POWER = 4;
const EPSILON = 1e-4;

function segment(name, from, to, options = {}) {
  return {
    name,
    from: new Vector3(...from),
    to: new Vector3(...to),
    side: options.side ?? 0,
    radius: options.radius ?? Infinity,
    minimumY: options.minimumY ?? -Infinity,
    maximumY: options.maximumY ?? Infinity,
    bias: options.bias ?? 1
  };
}

export function createBindingSegments(height, { garment }) {
  const h = height;
  const skirted = garment === "kimono" || garment === "yukata";
  const segments = [
    segment("hips", [0, h * 0.46, 0], [0, h * 0.575, 0], { radius: h * 0.24 }),
    segment("chest", [0, h * 0.575, 0], [0, h * 0.762, 0], {
      radius: h * 0.27
    }),
    segment("head", [0, h * 0.79, 0], [0, h * 0.95, 0], { radius: h * 0.26 }),
    segment("hair", [0, h * 0.86, -h * 0.03], [0, h * 1.02, -h * 0.05], {
      radius: h * 0.3,
      bias: 0.55
    }),
    segment("hem", [0, h * 0.06, 0], [0, h * 0.5, 0], {
      radius: h * 0.3,
      maximumY: h * 0.52,
      bias: skirted ? 1.5 : 0.25
    })
  ];

  for (const side of [-1, 1]) {
    const name = side < 0 ? "left" : "right";
    segments.push(
      segment(
        `${name}UpperArm`,
        [side * h * 0.125, h * 0.748, 0],
        [side * h * 0.125, h * 0.568, 0],
        { side, radius: h * 0.12 }
      ),
      segment(
        `${name}LowerArm`,
        [side * h * 0.125, h * 0.568, 0],
        [side * h * 0.14, h * 0.372, 0],
        { side, radius: h * 0.11 }
      ),
      segment(
        `${name}Sleeve`,
        [side * h * 0.135, h * 0.74, 0],
        [side * h * 0.15, h * 0.45, 0],
        { side, radius: h * 0.17, bias: skirted ? 0.85 : 0.35 }
      ),
      segment(
        `${name}UpperLeg`,
        [side * h * 0.061, h * 0.5, 0],
        [side * h * 0.061, h * 0.288, 0],
        { side, radius: h * 0.13, bias: skirted ? 0.45 : 1 }
      ),
      segment(
        `${name}LowerLeg`,
        [side * h * 0.061, h * 0.288, 0],
        [side * h * 0.061, h * 0.072, 0],
        { side, radius: h * 0.12, bias: skirted ? 0.45 : 1 }
      ),
      segment(
        `${name}Foot`,
        [side * h * 0.061, h * 0.072, 0],
        [side * h * 0.061, h * 0.012, h * 0.04],
        { side, radius: h * 0.11 }
      )
    );
  }

  return segments;
}

function distanceToSegment(point, from, to, cache) {
  cache.direction.subVectors(to, from);
  const lengthSquared = cache.direction.lengthSq();
  const projection =
    lengthSquared < EPSILON
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            cache.offset.subVectors(point, from).dot(cache.direction) /
              lengthSquared
          )
        );
  cache.closest.copy(from).addScaledVector(cache.direction, projection);
  return cache.closest.distanceTo(point);
}

export function applyAutoSkinWeights(geometry, height, boneIndices, options) {
  const segments = createBindingSegments(height, options);
  const positions = geometry.getAttribute("position");
  const vertexCount = positions.count;
  const skinIndices = new Uint16Array(vertexCount * MAX_INFLUENCES);
  const skinWeights = new Float32Array(vertexCount * MAX_INFLUENCES);
  const point = new Vector3();
  const cache = {
    direction: new Vector3(),
    offset: new Vector3(),
    closest: new Vector3()
  };
  const scored = [];
  const lateralGate = height * 0.018;
  const unresolved = [];

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    point.fromBufferAttribute(positions, vertex);
    scored.length = 0;

    for (const candidate of segments) {
      if (
        candidate.side !== 0 &&
        Math.sign(point.x) !== candidate.side &&
        Math.abs(point.x) > lateralGate
      ) {
        continue;
      }
      if (point.y < candidate.minimumY || point.y > candidate.maximumY) {
        continue;
      }
      const distance = distanceToSegment(
        point,
        candidate.from,
        candidate.to,
        cache
      );
      if (distance > candidate.radius) continue;
      scored.push({
        name: candidate.name,
        weight: candidate.bias / Math.pow(distance + EPSILON, FALLOFF_POWER)
      });
    }

    if (scored.length === 0) {
      unresolved.push(vertex);
      let nearestName = "hips";
      let nearestDistance = Infinity;
      for (const candidate of segments) {
        const distance = distanceToSegment(
          point,
          candidate.from,
          candidate.to,
          cache
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestName = candidate.name;
        }
      }
      scored.push({ name: nearestName, weight: 1 });
    }

    scored.sort((first, second) => second.weight - first.weight);
    const kept = scored.slice(0, MAX_INFLUENCES);
    const total = kept.reduce((sum, entry) => sum + entry.weight, 0);

    kept.forEach((entry, influence) => {
      const boneIndex = boneIndices.get(entry.name);
      if (boneIndex === undefined) {
        throw new Error(`Unknown bone ${entry.name}`);
      }
      skinIndices[vertex * MAX_INFLUENCES + influence] = boneIndex;
      skinWeights[vertex * MAX_INFLUENCES + influence] = entry.weight / total;
    });
  }

  geometry.setAttribute(
    "skinIndex",
    new Uint16BufferAttribute(skinIndices, MAX_INFLUENCES)
  );
  geometry.setAttribute(
    "skinWeight",
    new Float32BufferAttribute(skinWeights, MAX_INFLUENCES)
  );

  return { vertexCount, unresolvedCount: unresolved.length };
}

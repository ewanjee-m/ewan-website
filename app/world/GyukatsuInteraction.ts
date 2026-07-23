export interface GyukatsuSnapshot {
  active: boolean;
  greetingTriggered: boolean;
  steamCount: 0 | 3;
  brazierGlow: number;
  visitCount: number;
}

interface GyukatsuInteractionOptions {
  activationDistance?: number;
  resetDistance?: number;
}

export function createGyukatsuSnapshot(): GyukatsuSnapshot {
  return {
    active: false,
    greetingTriggered: false,
    steamCount: 0,
    brazierGlow: 0.15,
    visitCount: 0
  };
}

export function createGyukatsuInteraction(
  options: GyukatsuInteractionOptions = {}
) {
  const activationDistance = options.activationDistance ?? 2.5;
  const resetDistance = options.resetDistance ?? 3;

  if (activationDistance < 0 || resetDistance <= activationDistance) {
    throw new RangeError(
      "resetDistance must be greater than a non-negative activationDistance"
    );
  }

  let active = false;
  let visitCount = 0;

  const observeInto = (distance: number, target: GyukatsuSnapshot) => {
    if (!Number.isFinite(distance) || distance < 0) {
      throw new RangeError("distance must be a non-negative finite number");
    }

    let greetingTriggered = false;
    if (distance > resetDistance) {
      active = false;
    } else if (!active && distance <= activationDistance) {
      active = true;
      greetingTriggered = true;
      visitCount += 1;
    }

    target.active = active;
    target.greetingTriggered = greetingTriggered;
    target.steamCount = active ? 3 : 0;
    target.brazierGlow = active ? 1 : 0.15;
    target.visitCount = visitCount;
    return target;
  };

  return {
    observe(distance: number): GyukatsuSnapshot {
      return observeInto(distance, createGyukatsuSnapshot());
    },
    observeInto
  };
}

import {
  AIRPORT_BUS_CROSSWALK_COLLISION_ENTRY_ROUTE_PROGRESS,
  AIRPORT_BUS_CROSSWALK_STOP_ROUTE_PROGRESS
} from "./WorldSafety";

export interface AirportBusInput {
  crosswalkOccupied: boolean;
}

export type AirportBusPhase =
  | "cruising"
  | "approachingStop"
  | "waitingAtCrosswalk"
  | "openingLeftDoor"
  | "holdingLeftDoorOpen"
  | "closingLeftDoor"
  | "departing";

export interface AirportBusSnapshot {
  phase: AirportBusPhase;
  routeDistance: number;
  routeProgress: number;
  completedLoops: number;
  speed: number;
  leftDoorOpenAmount: number;
  rightDoorOpenAmount: number;
}

export interface AirportBus {
  advance(deltaSeconds: number, input: AirportBusInput): void;
  readSnapshot(target: AirportBusSnapshot): AirportBusSnapshot;
  getSnapshot(): AirportBusSnapshot;
}

export function createAirportBusSnapshot(): AirportBusSnapshot {
  return {
    phase: "cruising",
    routeDistance: 0,
    routeProgress: 0,
    completedLoops: 0,
    speed: 10,
    leftDoorOpenAmount: 0,
    rightDoorOpenAmount: 0
  };
}

const ROUTE_LENGTH = 100;
const APPROACH_START = 20;
const CROSSWALK_STOP_LINE =
  AIRPORT_BUS_CROSSWALK_STOP_ROUTE_PROGRESS * ROUTE_LENGTH;
const CROSSWALK_COLLISION_ENTRY_LINE =
  AIRPORT_BUS_CROSSWALK_COLLISION_ENTRY_ROUTE_PROGRESS * ROUTE_LENGTH;
const STATION_STOP = 40;
const DEPARTURE_END = 50;
const CRUISE_SPEED = 10;
const APPROACH_SPEED = 5;
const DEPARTURE_SPEED = 5;
const DOOR_TRANSITION_SECONDS = 0.5;
const DOOR_OPEN_SECONDS = 3;
const EPSILON = 1e-10;

function speedFor(phase: AirportBusPhase) {
  if (phase === "cruising") {
    return CRUISE_SPEED;
  }
  if (phase === "approachingStop") {
    return APPROACH_SPEED;
  }
  if (phase === "departing") {
    return DEPARTURE_SPEED;
  }
  return 0;
}

function stableNumber(value: number) {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

export function createAirportBus(): AirportBus {
  let routeDistance = 0;
  let completedLoops = 0;
  let phase: AirportBusPhase = "cruising";
  let phaseElapsedSeconds = 0;
  const readSnapshot = (target: AirportBusSnapshot) => {
    const leftDoorOpenAmount =
      phase === "openingLeftDoor"
        ? phaseElapsedSeconds / DOOR_TRANSITION_SECONDS
        : phase === "holdingLeftDoorOpen"
          ? 1
          : phase === "closingLeftDoor"
            ? 1 - phaseElapsedSeconds / DOOR_TRANSITION_SECONDS
            : 0;
    const stableRouteDistance = stableNumber(routeDistance);
    target.phase = phase;
    target.routeDistance = stableRouteDistance;
    target.routeProgress = stableNumber(stableRouteDistance / ROUTE_LENGTH);
    target.completedLoops = completedLoops;
    target.speed = speedFor(phase);
    target.leftDoorOpenAmount = stableNumber(leftDoorOpenAmount);
    target.rightDoorOpenAmount = 0;
    return target;
  };

  return {
    advance(deltaSeconds, input) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
        return;
      }

      let remainingSeconds = deltaSeconds;

      while (remainingSeconds > EPSILON) {
        if (phase === "waitingAtCrosswalk") {
          if (input.crosswalkOccupied) {
            return;
          }
          phase = "approachingStop";
          continue;
        }

        if (phase === "cruising") {
          const targetDistance =
            routeDistance < APPROACH_START
              ? APPROACH_START
              : ROUTE_LENGTH;
          const secondsToTarget =
            (targetDistance - routeDistance) / CRUISE_SPEED;

          if (remainingSeconds + EPSILON < secondsToTarget) {
            routeDistance += CRUISE_SPEED * remainingSeconds;
            break;
          }

          routeDistance = targetDistance;
          remainingSeconds -= secondsToTarget;

          if (targetDistance === APPROACH_START) {
            phase = "approachingStop";
          } else {
            routeDistance = 0;
            completedLoops += 1;
          }
          continue;
        }

        if (phase === "approachingStop") {
          if (
            input.crosswalkOccupied &&
            routeDistance + EPSILON >= CROSSWALK_STOP_LINE &&
            routeDistance <= CROSSWALK_COLLISION_ENTRY_LINE + EPSILON
          ) {
            phase = "waitingAtCrosswalk";
            return;
          }
          const targetDistance =
            routeDistance < CROSSWALK_STOP_LINE
              ? CROSSWALK_STOP_LINE
              : STATION_STOP;
          const secondsToTarget =
            (targetDistance - routeDistance) / APPROACH_SPEED;

          if (remainingSeconds + EPSILON < secondsToTarget) {
            routeDistance += APPROACH_SPEED * remainingSeconds;
            break;
          }

          routeDistance = targetDistance;
          remainingSeconds -= secondsToTarget;

          if (
            targetDistance === CROSSWALK_STOP_LINE &&
            input.crosswalkOccupied
          ) {
            phase = "waitingAtCrosswalk";
            return;
          }

          if (targetDistance === STATION_STOP) {
            phase = "openingLeftDoor";
            phaseElapsedSeconds = 0;
          }
          continue;
        }

        if (phase === "departing") {
          const secondsToTarget =
            (DEPARTURE_END - routeDistance) / DEPARTURE_SPEED;

          if (remainingSeconds + EPSILON < secondsToTarget) {
            routeDistance += DEPARTURE_SPEED * remainingSeconds;
            break;
          }

          routeDistance = DEPARTURE_END;
          remainingSeconds -= secondsToTarget;
          phase = "cruising";
          continue;
        }

        const phaseDuration =
          phase === "holdingLeftDoorOpen"
            ? DOOR_OPEN_SECONDS
            : DOOR_TRANSITION_SECONDS;
        const secondsToNextPhase =
          phaseDuration - phaseElapsedSeconds;
        const consumedSeconds = Math.min(
          remainingSeconds,
          secondsToNextPhase
        );
        phaseElapsedSeconds += consumedSeconds;
        remainingSeconds -= consumedSeconds;

        if (phaseElapsedSeconds + EPSILON < phaseDuration) {
          break;
        }

        phaseElapsedSeconds = 0;
        if (phase === "openingLeftDoor") {
          phase = "holdingLeftDoorOpen";
        } else if (phase === "holdingLeftDoorOpen") {
          phase = "closingLeftDoor";
        } else {
          phase = "departing";
        }
      }
    },

    readSnapshot,

    getSnapshot() {
      return readSnapshot(createAirportBusSnapshot());
    }
  };
}

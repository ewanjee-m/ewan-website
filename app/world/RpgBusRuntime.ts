import {
  createAirportBus,
  createAirportBusSnapshot,
  type AirportBus,
  type AirportBusInput,
  type AirportBusSnapshot
} from "./AirportBus";
import {
  createRpgBusMotionPose,
  evaluateRpgBusMotionInto,
  getRpgBusAdvanceSeconds,
  type RpgBusMotionPose
} from "./RpgBusMotion";

export interface RpgBusRuntime {
  controller: AirportBus;
  input: AirportBusInput;
  snapshot: AirportBusSnapshot;
  pose: RpgBusMotionPose;
}

export function createRpgBusRuntime(): RpgBusRuntime {
  return {
    controller: createAirportBus(),
    input: { crosswalkOccupied: false },
    snapshot: createAirportBusSnapshot(),
    pose: createRpgBusMotionPose()
  };
}

export function advanceRpgBusRuntime(
  runtime: RpgBusRuntime,
  deltaSeconds: number,
  reducedMotion: boolean
): RpgBusRuntime {
  runtime.controller.advance(
    getRpgBusAdvanceSeconds(deltaSeconds, reducedMotion),
    runtime.input
  );
  runtime.controller.readSnapshot(runtime.snapshot);
  evaluateRpgBusMotionInto(runtime.snapshot, runtime.pose);
  return runtime;
}

import { describe, expect, it } from "vitest";
import {
  createAirportBus,
  createAirportBusSnapshot
} from "../app/world/AirportBus";
import {
  AIRPORT_BUS_CROSSWALK_COLLISION_ENTRY_ROUTE_PROGRESS,
  AIRPORT_BUS_CROSSWALK_STOP_ROUTE_PROGRESS
} from "../app/world/WorldSafety";

describe("airport bus", () => {
  it("reuses a caller-owned snapshot during the animation loop", () => {
    const bus = createAirportBus();
    const snapshot = createAirportBusSnapshot();

    expect(bus.readSnapshot(snapshot)).toBe(snapshot);
    bus.advance(0.5, { crosswalkOccupied: false });
    expect(bus.readSnapshot(snapshot)).toBe(snapshot);
    expect(snapshot.routeDistance).toBe(5);
  });

  it("continues around the route and begins the next loop", () => {
    const bus = createAirportBus();

    for (
      let step = 0;
      step < 1_000 && bus.getSnapshot().completedLoops === 0;
      step += 1
    ) {
      bus.advance(0.1, { crosswalkOccupied: false });
    }

    const snapshot = bus.getSnapshot();
    expect(snapshot.completedLoops).toBe(1);
    expect(snapshot.routeProgress).toBeGreaterThanOrEqual(0);
    expect(snapshot.routeProgress).toBeLessThan(0.1);
  });

  it("slows down when it reaches the station approach", () => {
    const bus = createAirportBus();
    const cruiseSpeed = bus.getSnapshot().speed;

    bus.advance(2, { crosswalkOccupied: false });

    const approaching = bus.getSnapshot();
    expect(approaching.phase).toBe("approachingStop");
    expect(approaching.speed).toBeLessThan(cruiseSpeed);
  });

  it("waits at the stop line while the crosswalk is occupied", () => {
    const bus = createAirportBus();

    bus.advance(10, { crosswalkOccupied: true });
    const waiting = bus.getSnapshot();

    expect(waiting.phase).toBe("waitingAtCrosswalk");
    expect(waiting.routeDistance).toBe(
      AIRPORT_BUS_CROSSWALK_STOP_ROUTE_PROGRESS * 100
    );
    expect(waiting.speed).toBe(0);

    bus.advance(5, { crosswalkOccupied: true });
    expect(bus.getSnapshot()).toEqual(waiting);

    bus.advance(1, { crosswalkOccupied: false });
    expect(bus.getSnapshot().routeDistance).toBe(
      AIRPORT_BUS_CROSSWALK_STOP_ROUTE_PROGRESS * 100 + 5
    );
    expect(bus.getSnapshot().phase).toBe("approachingStop");
  });

  it("stops at its current safe position when the crosswalk becomes occupied just after the stop line", () => {
    const bus = createAirportBus();

    bus.advance(2.92, { crosswalkOccupied: false });
    const justPastStopLine = bus.getSnapshot();
    expect(justPastStopLine.routeProgress).toBeGreaterThan(
      AIRPORT_BUS_CROSSWALK_STOP_ROUTE_PROGRESS
    );

    bus.advance(0.5, { crosswalkOccupied: true });

    expect(bus.getSnapshot()).toMatchObject({
      phase: "waitingAtCrosswalk",
      routeDistance: justPastStopLine.routeDistance,
      speed: 0
    });
  });

  it("keeps its normal forward motion when occupancy begins inside the collision area", () => {
    const bus = createAirportBus();
    const insideCollisionDistance =
      AIRPORT_BUS_CROSSWALK_COLLISION_ENTRY_ROUTE_PROGRESS * 100 + 0.2;
    const secondsToCollisionArea =
      2 + (insideCollisionDistance - 20) / 5;

    bus.advance(secondsToCollisionArea, { crosswalkOccupied: false });
    const insideCollisionArea = bus.getSnapshot();
    expect(insideCollisionArea.routeDistance).toBeGreaterThan(
      AIRPORT_BUS_CROSSWALK_COLLISION_ENTRY_ROUTE_PROGRESS * 100
    );

    bus.advance(0.1, { crosswalkOccupied: true });

    expect(bus.getSnapshot()).toMatchObject({
      phase: "approachingStop",
      routeDistance: insideCollisionArea.routeDistance + 0.5,
      speed: 5
    });
  });

  it("opens only the left door after stopping, holds it for three seconds, and closes it before departure", () => {
    const bus = createAirportBus();

    bus.advance(6, { crosswalkOccupied: false });
    expect(bus.getSnapshot()).toMatchObject({
      phase: "openingLeftDoor",
      routeDistance: 40,
      speed: 0,
      leftDoorOpenAmount: 0,
      rightDoorOpenAmount: 0
    });

    bus.advance(0.5, { crosswalkOccupied: false });
    expect(bus.getSnapshot()).toMatchObject({
      phase: "holdingLeftDoorOpen",
      speed: 0,
      leftDoorOpenAmount: 1,
      rightDoorOpenAmount: 0
    });

    bus.advance(2.9, { crosswalkOccupied: false });
    expect(bus.getSnapshot().phase).toBe("holdingLeftDoorOpen");
    expect(bus.getSnapshot().leftDoorOpenAmount).toBe(1);

    bus.advance(0.1, { crosswalkOccupied: false });
    expect(bus.getSnapshot().phase).toBe("closingLeftDoor");
    expect(bus.getSnapshot().speed).toBe(0);

    bus.advance(0.25, { crosswalkOccupied: false });
    expect(bus.getSnapshot().leftDoorOpenAmount).toBeCloseTo(0.5);
    expect(bus.getSnapshot().rightDoorOpenAmount).toBe(0);

    bus.advance(0.25, { crosswalkOccupied: false });
    expect(bus.getSnapshot()).toMatchObject({
      phase: "departing",
      speed: 5,
      leftDoorOpenAmount: 0,
      rightDoorOpenAmount: 0
    });
  });

  it("produces the same state for one delta or equivalent smaller deltas", () => {
    const singleStep = createAirportBus();
    const smallerSteps = createAirportBus();

    singleStep.advance(18.35, { crosswalkOccupied: false });
    for (let step = 0; step < 183; step += 1) {
      smallerSteps.advance(0.1, { crosswalkOccupied: false });
    }
    smallerSteps.advance(0.05, { crosswalkOccupied: false });

    expect(smallerSteps.getSnapshot()).toEqual(singleStep.getSnapshot());
  });
});

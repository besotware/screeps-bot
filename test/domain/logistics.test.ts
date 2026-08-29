/**
 * Logistics maturity: pickup tiering, the controller container, and road
 * placement.
 */

import { pickupTier, selectPickup } from "../../src/domain/targets";
import type { EnergyPickup } from "../../src/domain/targets";
import {
  chebyshev,
  planControllerContainer,
  planRoadTiles,
  planSourceContainer,
} from "../../src/domain/construction";
import type { Point, TileView } from "../../src/domain/construction";

const OPEN: TileView = { wall: false, occupied: false };
const WALL: TileView = { wall: true, occupied: false };
const TAKEN: TileView = { wall: false, occupied: true };

const lookupWith =
  (special: Record<string, TileView> = {}) =>
  (p: Point): TileView =>
    special[`${p.x},${p.y}`] ?? OPEN;

const pickup = (over: Partial<EnergyPickup> & { id: string }): EnergyPickup => ({
  kind: "container",
  amount: 500,
  range: 5,
  ...over,
});

describe("pickupTier", () => {
  it("collects decaying energy first", () => {
    expect(pickupTier("dropped")).toBeLessThan(pickupTier("container"));
    expect(pickupTier("tombstone")).toBeLessThan(pickupTier("container"));
  });

  it("drains containers before storage", () => {
    // Storage is the bank. Pulling from it to fill an extension a container
    // could have filled just moves energy in a circle.
    expect(pickupTier("container")).toBeLessThan(pickupTier("storage"));
  });

  it("treats an unknown kind as a working buffer, not the bank", () => {
    expect(pickupTier("mystery")).toBe(pickupTier("container"));
  });
});

describe("selectPickup with storage present", () => {
  it("prefers a container over a fuller storage", () => {
    expect(
      selectPickup([
        pickup({ id: "storage", kind: "storage", amount: 100_000 }),
        pickup({ id: "container", kind: "container", amount: 200 }),
      ])?.id,
    ).toBe("container");
  });

  it("falls back to storage when no container has anything", () => {
    expect(
      selectPickup([
        pickup({ id: "storage", kind: "storage", amount: 5000 }),
        pickup({ id: "empty", kind: "container", amount: 0 }),
      ])?.id,
    ).toBe("storage");
  });

  it("still clears the floor before either", () => {
    expect(
      selectPickup([
        pickup({ id: "storage", kind: "storage", amount: 100_000 }),
        pickup({ id: "container", kind: "container", amount: 2000 }),
        pickup({ id: "drop", kind: "dropped", amount: 50 }),
      ])?.id,
    ).toBe("drop");
  });
});

describe("planControllerContainer", () => {
  const controller = { x: 25, y: 25 };
  const anchor = { x: 20, y: 20 };

  it("places the container two tiles out, not adjacent", () => {
    // Adjacent tiles are upgrader standing room; a container there costs a
    // working position for the life of the room.
    const spot = planControllerContainer(controller, anchor, lookupWith());
    expect(spot).toBeDefined();
    expect(chebyshev(spot as Point, controller)).toBe(2);
  });

  it("prefers the side nearest the anchor, to shorten the haul", () => {
    expect(planControllerContainer(controller, anchor, lookupWith())).toEqual({ x: 23, y: 23 });
  });

  it("skips walls and occupied tiles", () => {
    const blocked = lookupWith({ "23,23": WALL, "23,24": TAKEN, "24,23": WALL });
    const spot = planControllerContainer(controller, anchor, blocked);
    expect(spot).toBeDefined();
    expect(spot).not.toEqual({ x: 23, y: 23 });
  });

  it("returns undefined when the controller is fully enclosed", () => {
    expect(planControllerContainer(controller, anchor, () => WALL)).toBeUndefined();
  });

  it("is deterministic", () => {
    expect(planControllerContainer(controller, anchor, lookupWith())).toEqual(
      planControllerContainer(controller, anchor, lookupWith()),
    );
  });

  it("stays inside the buildable area near a room edge", () => {
    const spot = planControllerContainer({ x: 2, y: 2 }, { x: 25, y: 25 }, lookupWith());
    if (spot) {
      expect(spot.x).toBeGreaterThanOrEqual(2);
      expect(spot.y).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("planRoadTiles", () => {
  const path = [
    { x: 10, y: 10 },
    { x: 11, y: 10 },
    { x: 12, y: 10 },
    { x: 13, y: 10 },
  ];

  it("skips both endpoints", () => {
    // A road under the spawn or on the source itself buys nothing.
    const tiles = planRoadTiles(path, lookupWith());
    expect(tiles).toEqual([
      { x: 11, y: 10 },
      { x: 12, y: 10 },
    ]);
  });

  it("returns nothing for a path too short to have a middle", () => {
    expect(planRoadTiles([], lookupWith())).toEqual([]);
    expect(planRoadTiles([{ x: 1, y: 1 }], lookupWith())).toEqual([]);
    expect(planRoadTiles([{ x: 1, y: 1 }, { x: 2, y: 2 }], lookupWith())).toEqual([]);
  });

  it("skips tiles that already hold something", () => {
    expect(planRoadTiles(path, lookupWith({ "11,10": TAKEN }))).toEqual([{ x: 12, y: 10 }]);
  });

  it("skips walls", () => {
    expect(planRoadTiles(path, lookupWith({ "12,10": WALL }))).toEqual([{ x: 11, y: 10 }]);
  });

  it("returns nothing when the whole route is already paved", () => {
    expect(planRoadTiles(path, () => TAKEN)).toEqual([]);
  });
});

describe("planControllerContainer near the room border", () => {
  it("rejects ring tiles that fall outside the buildable area", () => {
    // Controller at 3,3: the ring-2 tiles at x=1 and y=1 are unbuildable and
    // must be skipped rather than proposed.
    const spot = planControllerContainer({ x: 3, y: 3 }, { x: 25, y: 25 }, lookupWith());
    expect(spot).toBeDefined();
    expect((spot as Point).x).toBeGreaterThanOrEqual(2);
    expect((spot as Point).y).toBeGreaterThanOrEqual(2);
  });

  it("returns undefined when every in-bounds ring tile is blocked", () => {
    const spot = planControllerContainer({ x: 3, y: 3 }, { x: 25, y: 25 }, () => TAKEN);
    expect(spot).toBeUndefined();
  });
});

describe("planners respect the far room edge, not just the near one", () => {
  it("rejects controller ring tiles past x=47 / y=47", () => {
    // The near-edge case (x<2) and the far-edge case (x>47) are separate
    // bounds; testing only the near one leaves half the guard unexercised.
    const spot = planControllerContainer({ x: 46, y: 46 }, { x: 25, y: 25 }, lookupWith());
    expect(spot).toBeDefined();
    expect((spot as Point).x).toBeLessThanOrEqual(47);
    expect((spot as Point).y).toBeLessThanOrEqual(47);
  });

  it("rejects source-container tiles past x=48 / y=48", () => {
    const spot = planSourceContainer({ x: 49, y: 49 }, { x: 25, y: 25 }, lookupWith());
    expect(spot).toBeDefined();
    expect((spot as Point).x).toBeLessThanOrEqual(48);
    expect((spot as Point).y).toBeLessThanOrEqual(48);
  });
});

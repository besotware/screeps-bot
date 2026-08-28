import {
  buildCandidates,
  chebyshev,
  extensionsAllowed,
  planExtensions,
  planSourceContainer,
  towersAllowed,
} from "../../src/domain/construction";
import type { Point, TileView } from "../../src/domain/construction";

const OPEN: TileView = { wall: false, occupied: false };
const WALL: TileView = { wall: true, occupied: false };
const TAKEN: TileView = { wall: false, occupied: true };

/** Lookup where every tile is open unless listed in `special`. */
const lookupWith = (special: Record<string, TileView> = {}) =>
  (p: Point): TileView => special[`${p.x},${p.y}`] ?? OPEN;

describe("extensionsAllowed", () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 5],
    [3, 10],
    [8, 60],
  ])("RCL %i allows %i extensions", (level, expected) => {
    expect(extensionsAllowed(level)).toBe(expected);
  });

  it("clamps out-of-range levels rather than returning undefined", () => {
    expect(extensionsAllowed(-1)).toBe(0);
    expect(extensionsAllowed(99)).toBe(60);
  });

  it("floors a fractional level", () => {
    expect(extensionsAllowed(2.9)).toBe(5);
  });
});

describe("towersAllowed", () => {
  it("unlocks the first tower at RCL 3", () => {
    expect(towersAllowed(2)).toBe(0);
    expect(towersAllowed(3)).toBe(1);
  });

  it("clamps out-of-range levels", () => {
    expect(towersAllowed(99)).toBe(6);
    expect(towersAllowed(-5)).toBe(0);
  });
});

describe("chebyshev", () => {
  it("treats a diagonal as one step, as Screeps does", () => {
    expect(chebyshev({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(1);
  });

  it("is the larger of the two axis distances", () => {
    expect(chebyshev({ x: 0, y: 0 }, { x: 3, y: 7 })).toBe(7);
  });

  it("is zero for the same point", () => {
    expect(chebyshev({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });
});

describe("buildCandidates", () => {
  const anchor = { x: 25, y: 25 };

  it("emits only checkerboard tiles, leaving walkways open", () => {
    for (const p of buildCandidates(anchor, 3)) {
      // Math.abs, because (-1 + -1) % 2 is -0 and toBe distinguishes it from 0.
      expect(Math.abs((p.x - anchor.x + (p.y - anchor.y)) % 2)).toBe(0);
    }
  });

  it("never emits the anchor itself", () => {
    expect(buildCandidates(anchor, 3)).not.toContainEqual(anchor);
  });

  it("emits nearer rings before further ones", () => {
    const found = buildCandidates(anchor, 3);
    const ranges = found.map((p) => chebyshev(p, anchor));
    expect([...ranges]).toEqual([...ranges].sort((a, b) => a - b));
  });

  it("returns no duplicate tiles", () => {
    const found = buildCandidates(anchor, 4);
    expect(new Set(found.map((p) => `${p.x},${p.y}`)).size).toBe(found.length);
  });

  it("stays clear of the room border", () => {
    // An anchor near the edge must not propose unbuildable tiles.
    for (const p of buildCandidates({ x: 3, y: 3 }, 5)) {
      expect(p.x).toBeGreaterThanOrEqual(2);
      expect(p.y).toBeGreaterThanOrEqual(2);
      expect(p.x).toBeLessThanOrEqual(47);
      expect(p.y).toBeLessThanOrEqual(47);
    }
  });

  it("returns nothing for a zero radius", () => {
    expect(buildCandidates(anchor, 0)).toEqual([]);
  });
});

describe("planExtensions", () => {
  const anchor = { x: 25, y: 25 };

  it("returns nothing when none are wanted", () => {
    expect(planExtensions(anchor, 0, lookupWith())).toEqual([]);
  });

  it("returns nothing for a negative count", () => {
    expect(planExtensions(anchor, -3, lookupWith())).toEqual([]);
  });

  it("returns exactly the number requested", () => {
    expect(planExtensions(anchor, 5, lookupWith())).toHaveLength(5);
  });

  it("skips walls", () => {
    const blocked = lookupWith({ "24,24": WALL, "26,26": WALL });
    const plan = planExtensions(anchor, 8, blocked);
    expect(plan).not.toContainEqual({ x: 24, y: 24 });
    expect(plan).not.toContainEqual({ x: 26, y: 26 });
  });

  it("skips tiles that already hold something", () => {
    const blocked = lookupWith({ "24,24": TAKEN });
    expect(planExtensions(anchor, 8, blocked)).not.toContainEqual({ x: 24, y: 24 });
  });

  it("returns fewer than requested when the area is full, rather than throwing", () => {
    const allWall = (): TileView => WALL;
    expect(planExtensions(anchor, 10, allWall)).toEqual([]);
  });

  it("is deterministic across calls", () => {
    expect(planExtensions(anchor, 6, lookupWith())).toEqual(
      planExtensions(anchor, 6, lookupWith()),
    );
  });
});

describe("planSourceContainer", () => {
  const source = { x: 20, y: 20 };
  const anchor = { x: 25, y: 25 };

  it("picks a tile adjacent to the source", () => {
    const spot = planSourceContainer(source, anchor, lookupWith());
    expect(spot).toBeDefined();
    expect(chebyshev(spot as Point, source)).toBe(1);
  });

  it("picks the adjacent tile closest to the anchor", () => {
    // Anchor is down-right of the source, so the down-right neighbour wins.
    expect(planSourceContainer(source, anchor, lookupWith())).toEqual({ x: 21, y: 21 });
  });

  it("never returns the source tile itself", () => {
    expect(planSourceContainer(source, anchor, lookupWith())).not.toEqual(source);
  });

  it("skips walls and occupied tiles", () => {
    const blocked = lookupWith({ "21,21": WALL, "21,20": TAKEN, "20,21": WALL });
    const spot = planSourceContainer(source, anchor, blocked);
    expect(spot).toBeDefined();
    expect(spot).not.toEqual({ x: 21, y: 21 });
    expect(spot).not.toEqual({ x: 21, y: 20 });
  });

  it("returns undefined when the source is fully walled in", () => {
    expect(planSourceContainer(source, anchor, () => WALL)).toBeUndefined();
  });

  it("is deterministic when several tiles tie", () => {
    // Equidistant anchor: the tie must break the same way every time.
    const a = planSourceContainer(source, source, lookupWith());
    const b = planSourceContainer(source, source, lookupWith());
    expect(a).toEqual(b);
  });

  it("does not propose tiles outside the room", () => {
    const spot = planSourceContainer({ x: 0, y: 0 }, { x: 25, y: 25 }, lookupWith());
    expect(spot).toBeDefined();
    expect((spot as Point).x).toBeGreaterThanOrEqual(1);
    expect((spot as Point).y).toBeGreaterThanOrEqual(1);
  });
});

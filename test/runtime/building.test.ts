import { MAX_OPEN_SITES, PLAN_INTERVAL, planRoom, shouldPlan } from "../../src/runtime/building";
import { installScreepsConstants } from "../helpers/mockGame";

installScreepsConstants();

interface BuildOptions {
  readonly controllerLevel?: number;
  readonly sourceCount?: number;
  /** How many sources already have a container. */
  readonly containeredSources?: number;
  readonly openSites?: number;
  readonly builtExtensions?: number;
  readonly hasSpawn?: boolean;
  /** Return code from createConstructionSite. */
  readonly createResult?: number;
  /** Tiles reported as blocked, as "x,y". */
  readonly blocked?: readonly string[];
  /**
   * Whether the controller already has a container. Defaults to true so tests
   * about source containers are not perturbed by the controller one.
   */
  readonly controllerHasContainer?: boolean;
  /** Path findPath returns, so road planning has something to pave. */
  readonly roadPath?: readonly { x: number; y: number }[];
}

function build(options: BuildOptions = {}): {
  room: Room;
  placed: { x: number; y: number; type: string }[];
} {
  const {
    controllerLevel = 2,
    sourceCount = 2,
    containeredSources = 0,
    openSites = 0,
    builtExtensions = 0,
    hasSpawn = true,
    createResult = 0,
    blocked = [],
    controllerHasContainer = true,
    roadPath = [],
  } = options;

  const placed: { x: number; y: number; type: string }[] = [];
  const blockedSet = new Set(blocked);

  const sources = Array.from({ length: sourceCount }, (_, i) => ({
    id: `source-${i}`,
    pos: {
      x: 10 + i * 6,
      y: 10,
      findInRange: (type: unknown, _r: number, opts?: { filter?: (s: unknown) => boolean }) => {
        if (type !== FIND_STRUCTURES) return [];
        const c = i < containeredSources ? [{ structureType: STRUCTURE_CONTAINER, id: `c${i}` }] : [];
        return opts?.filter ? c.filter(opts.filter) : c;
      },
    },
  }));

  const sites = Array.from({ length: openSites }, (_, i) => ({
    id: `site-${i}`,
    structureType: STRUCTURE_EXTENSION,
  }));

  const extensions = Array.from({ length: builtExtensions }, (_, i) => ({
    id: `ext-${i}`,
    structureType: STRUCTURE_EXTENSION,
  }));

  const room = {
    name: "W1N1",
    controller: {
      level: controllerLevel,
      pos: {
        x: 40,
        y: 40,
        findInRange: (type: unknown, _r: number, opts?: { filter?: (s: unknown) => boolean }) => {
          if (type !== FIND_STRUCTURES) return [];
          const c = controllerHasContainer
            ? [{ structureType: STRUCTURE_CONTAINER, id: "ctrl-c" }]
            : [];
          return opts?.filter ? c.filter(opts.filter) : c;
        },
      },
    },
    getTerrain: () => ({ get: () => 0 }),
    findPath: () => roadPath,
    lookForAt: (_what: string, x: number, y: number) =>
      blockedSet.has(`${x},${y}`) ? [{ structureType: "spawn" }] : [],
    createConstructionSite: (x: number, y: number, type: string) => {
      if (createResult === 0) placed.push({ x, y, type });
      return createResult;
    },
    find: (type: number, opts?: { filter?: (s: unknown) => boolean }) => {
      let out: readonly unknown[] = [];
      if (type === FIND_SOURCES) out = sources;
      else if (type === FIND_MY_CONSTRUCTION_SITES) out = sites;
      else if (type === FIND_MY_SPAWNS) out = hasSpawn ? [{ pos: { x: 25, y: 25 } }] : [];
      else if (type === FIND_MY_STRUCTURES) out = extensions;
      return opts?.filter ? out.filter(opts.filter) : out;
    },
  } as unknown as Room;

  return { room, placed };
}

describe("shouldPlan", () => {
  it("plans on the interval", () => {
    expect(shouldPlan(0)).toBe(true);
    expect(shouldPlan(PLAN_INTERVAL)).toBe(true);
    expect(shouldPlan(PLAN_INTERVAL * 3)).toBe(true);
  });

  it("skips ticks in between, because the layout does not change fast", () => {
    expect(shouldPlan(1)).toBe(false);
    expect(shouldPlan(PLAN_INTERVAL - 1)).toBe(false);
  });
});

describe("planRoom", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  it("does nothing in a room with no spawn", () => {
    const { room, placed } = build({ hasSpawn: false });
    expect(planRoom(room)).toBe(0);
    expect(placed).toEqual([]);
  });

  it("places a container for each source that lacks one", () => {
    const { room, placed } = build({ sourceCount: 2, containeredSources: 0 });
    planRoom(room);
    expect(placed.filter((p) => p.type === STRUCTURE_CONTAINER)).toHaveLength(2);
  });

  it("skips sources that already have a container", () => {
    const { room, placed } = build({ sourceCount: 2, containeredSources: 2 });
    planRoom(room);
    expect(placed.filter((p) => p.type === STRUCTURE_CONTAINER)).toHaveLength(0);
  });

  it("prioritises containers over extensions", () => {
    // Containers are what move the colony off the bootstrap economy.
    const { room, placed } = build({ sourceCount: 2, containeredSources: 0 });
    planRoom(room);
    expect(placed[0]?.type).toBe(STRUCTURE_CONTAINER);
  });

  it("places extensions once containers exist", () => {
    const { room, placed } = build({ containeredSources: 2, controllerLevel: 2 });
    planRoom(room);
    expect(placed.filter((p) => p.type === STRUCTURE_EXTENSION).length).toBeGreaterThan(0);
  });

  it("never exceeds the open-site budget", () => {
    const { room, placed } = build({ containeredSources: 2 });
    planRoom(room);
    expect(placed.length).toBeLessThanOrEqual(MAX_OPEN_SITES);
  });

  it("does nothing when the site budget is already spent", () => {
    const { room, placed } = build({ openSites: MAX_OPEN_SITES });
    expect(planRoom(room)).toBe(0);
    expect(placed).toEqual([]);
  });

  it("respects the RCL extension allowance", () => {
    // RCL 1 allows no extensions at all.
    const { room, placed } = build({ controllerLevel: 1, containeredSources: 2 });
    planRoom(room);
    expect(placed.filter((p) => p.type === STRUCTURE_EXTENSION)).toHaveLength(0);
  });

  it("stops once the allowance is already built", () => {
    // RCL 2 allows 5; five already exist.
    const { room, placed } = build({
      controllerLevel: 2,
      containeredSources: 2,
      builtExtensions: 5,
    });
    planRoom(room);
    expect(placed.filter((p) => p.type === STRUCTURE_EXTENSION)).toHaveLength(0);
  });

  it("counts already-queued extensions against the RCL allowance", () => {
    // Two queued plus four built is six, over the RCL-2 allowance of five, so
    // no further extension may be planned.
    const { room, placed } = build({
      controllerLevel: 2,
      containeredSources: 2,
      openSites: 2,
      builtExtensions: 4,
    });
    planRoom(room);
    expect(placed.filter((p) => p.type === STRUCTURE_EXTENSION)).toHaveLength(0);
  });

  it("stops at the site budget even with more sources than budget", () => {
    const { room, placed } = build({ sourceCount: 8, containeredSources: 0 });
    planRoom(room);
    expect(placed.length).toBeLessThanOrEqual(MAX_OPEN_SITES);
  });

  it("plans a controller container so upgraders stop commuting", () => {
    const { room, placed } = build({
      containeredSources: 2,
      controllerHasContainer: false,
      controllerLevel: 1,
    });
    planRoom(room);
    expect(placed.filter((p) => p.type === STRUCTURE_CONTAINER)).toHaveLength(1);
  });

  it("does not re-plan a controller container that already exists", () => {
    const { room, placed } = build({ containeredSources: 2, controllerHasContainer: true });
    planRoom(room);
    expect(placed.filter((p) => p.type === STRUCTURE_CONTAINER)).toHaveLength(0);
  });

  it("paves the middle of the route to each source and the controller", () => {
    const path = [
      { x: 25, y: 25 },
      { x: 24, y: 24 },
      { x: 23, y: 23 },
      { x: 22, y: 22 },
    ];
    const { room, placed } = build({
      containeredSources: 2,
      controllerHasContainer: true,
      controllerLevel: 1,
      roadPath: path,
    });
    planRoom(room);
    const roads = placed.filter((p) => p.type === STRUCTURE_ROAD);
    expect(roads.length).toBeGreaterThan(0);
    // Endpoints are never paved: a road under the spawn buys nothing.
    expect(roads).not.toContainEqual({ x: 25, y: 25, type: STRUCTURE_ROAD });
    expect(roads).not.toContainEqual({ x: 22, y: 22, type: STRUCTURE_ROAD });
  });

  it("keeps road paving inside the site budget", () => {
    const path = Array.from({ length: 40 }, (_, i) => ({ x: 10 + i, y: 10 }));
    const { room, placed } = build({
      containeredSources: 2,
      controllerHasContainer: true,
      roadPath: path,
    });
    planRoom(room);
    expect(placed.length).toBeLessThanOrEqual(MAX_OPEN_SITES);
  });

  it("does not pave when the whole route is already built on", () => {
    const path = [
      { x: 25, y: 25 },
      { x: 24, y: 24 },
      { x: 23, y: 23 },
    ];
    const { room, placed } = build({
      containeredSources: 2,
      controllerHasContainer: true,
      controllerLevel: 1,
      roadPath: path,
      blocked: ["24,24"],
    });
    planRoom(room);
    expect(placed.filter((p) => p.type === STRUCTURE_ROAD)).toHaveLength(0);
  });

  it("counts a rejected site as not placed", () => {
    const { room } = build({ createResult: -7, containeredSources: 0 });
    expect(planRoom(room)).toBe(0);
  });

  it("does not throw in a room with no controller", () => {
    const { room } = build({ containeredSources: 2 });
    (room as unknown as { controller: undefined }).controller = undefined;
    expect(() => planRoom(room)).not.toThrow();
  });

  it("reports what it queued", () => {
    const { room } = build({ sourceCount: 1, containeredSources: 0 });
    expect(planRoom(room)).toBeGreaterThan(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("container site"));
  });
});

describe("planRoads edge cases", () => {
  let logSpy: jest.SpyInstance;
  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  it("paves source routes in a room with no controller", () => {
    const path = [
      { x: 25, y: 25 },
      { x: 24, y: 24 },
      { x: 23, y: 23 },
    ];
    const { room, placed } = build({
      containeredSources: 2,
      controllerHasContainer: true,
      roadPath: path,
    });
    (room as unknown as { controller: undefined }).controller = undefined;
    planRoom(room);
    expect(placed.filter((p) => p.type === STRUCTURE_ROAD).length).toBeGreaterThan(0);
  });

  it("stops paving mid-route once the budget runs out", () => {
    // A long path across several destinations must not blow the site cap.
    const path = Array.from({ length: 30 }, (_, i) => ({ x: 5 + i, y: 20 }));
    const { room, placed } = build({
      sourceCount: 3,
      containeredSources: 3,
      controllerHasContainer: true,
      roadPath: path,
    });
    planRoom(room);
    expect(placed).toHaveLength(MAX_OPEN_SITES);
  });

  it("reports how many road tiles it queued", () => {
    const path = [
      { x: 25, y: 25 },
      { x: 24, y: 24 },
      { x: 23, y: 23 },
    ];
    const { room } = build({
      containeredSources: 2,
      controllerHasContainer: true,
      controllerLevel: 1,
      roadPath: path,
    });
    planRoom(room);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("road tiles"));
  });
});

/**
 * Edge paths that only occur when the world changes between the moment a
 * decision is made and the moment it is executed -- a target destroyed, a
 * source walled in, a site rejected. Screeps does this routinely; these are the
 * branches that keep a tick from throwing.
 */

import { runCreep } from "../../src/runtime/creeps";
import { runTower } from "../../src/runtime/towers";
import { planRoom } from "../../src/runtime/building";
import { installGame, installScreepsConstants } from "../helpers/mockGame";

installScreepsConstants();

/** A creep whose room reports things that Game.getObjectById will not resolve. */
function ghostCreep(options: {
  role: string;
  mode?: string;
  carried?: number;
  pickups?: boolean;
  sinks?: boolean;
  sources?: boolean;
  damaged?: boolean;
}): Creep {
  const {
    role,
    mode = "gathering",
    carried = 0,
    pickups = false,
    sinks = false,
    sources = false,
    damaged = false,
  } = options;

  return {
    name: `${role}-ghost`,
    spawning: false,
    memory: { role, home: "W1N1", mode },
    store: { getUsedCapacity: () => carried, getCapacity: () => 50 },
    pos: {
      getRangeTo: () => 3,
      isEqualTo: () => true,
      findClosestByPath: () => null,
    },
    room: {
      controller: undefined,
      find: (type: number, opts?: { filter?: (s: unknown) => boolean }) => {
        let out: readonly unknown[] = [];
        if (type === FIND_SOURCES && sources) {
          out = [
            {
              id: "gone-source",
              energy: 3000,
              pos: { x: 10, y: 10, findInRange: () => [] },
              room: { getTerrain: () => ({ get: () => 0 }) },
            },
          ];
        } else if (type === FIND_MY_STRUCTURES && sinks) {
          out = [
            { id: "gone-sink", structureType: "extension", store: { getFreeCapacity: () => 50 } },
          ];
        } else if (type === FIND_DROPPED_RESOURCES && pickups) {
          out = [{ id: "gone-drop", resourceType: RESOURCE_ENERGY, amount: 100 }];
        } else if (type === FIND_STRUCTURES && damaged) {
          out = [{ id: "gone-road", structureType: "road", hits: 10, hitsMax: 1000 }];
        }
        return opts?.filter ? out.filter(opts.filter) : out;
      },
    },
    say: () => undefined,
    harvest: () => 0,
    transfer: () => 0,
    upgradeController: () => 0,
    moveTo: () => 0,
    pickup: () => 0,
    withdraw: () => 0,
    build: () => 0,
    repair: () => 0,
  } as unknown as Creep;
}

describe("targets that vanish between decision and execution", () => {
  let restore: () => void;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    // Every lookup misses: the objects were destroyed this tick.
    restore = installGame({ getObjectById: () => null });
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    restore();
    logSpy.mockRestore();
  });

  it("a harvester survives its source being destroyed", () => {
    expect(() => runCreep(ghostCreep({ role: "harvester", sources: true }))).not.toThrow();
  });

  it("a harvester survives its delivery target being destroyed", () => {
    expect(() =>
      runCreep(ghostCreep({ role: "harvester", mode: "delivering", carried: 50, sinks: true })),
    ).not.toThrow();
  });

  it("a hauler survives its pickup being taken by someone else", () => {
    expect(() => runCreep(ghostCreep({ role: "hauler", pickups: true }))).not.toThrow();
  });

  it("a builder survives its repair target being destroyed", () => {
    expect(() =>
      runCreep(ghostCreep({ role: "builder", mode: "delivering", carried: 50, damaged: true })),
    ).not.toThrow();
  });
});

describe("tower healing", () => {
  it("heals the most wounded friendly creep", () => {
    const healed: unknown[] = [];
    const wounded = { id: "hurt", hits: 20, hitsMax: 100 };

    const room = {
      name: "W1N1",
      find: (type: number) => {
        if (type === FIND_MY_CREEPS) return [wounded];
        return [];
      },
    };

    const tower = {
      room,
      pos: { getRangeTo: () => 3 },
      store: { getUsedCapacity: () => 1000 },
      attack: () => undefined,
      repair: () => undefined,
      heal: (t: unknown) => healed.push(t),
    } as unknown as StructureTower;

    const restore = installGame({
      getObjectById: ((id: string) => (id === "hurt" ? wounded : null)) as Game["getObjectById"],
    });

    runTower(tower);
    restore();

    expect(healed).toHaveLength(1);
  });

  it("does not heal a creep that died before the heal landed", () => {
    const healed: unknown[] = [];
    const room = {
      name: "W1N1",
      find: (type: number) => (type === FIND_MY_CREEPS ? [{ id: "hurt", hits: 20, hitsMax: 100 }] : []),
    };
    const tower = {
      room,
      pos: { getRangeTo: () => 3 },
      store: { getUsedCapacity: () => 1000 },
      attack: () => undefined,
      repair: () => undefined,
      heal: (t: unknown) => healed.push(t),
    } as unknown as StructureTower;

    const restore = installGame({ getObjectById: () => null });
    expect(() => runTower(tower)).not.toThrow();
    restore();

    expect(healed).toHaveLength(0);
  });
});

describe("build planning against hostile geometry", () => {
  it("skips a source that is completely walled in", () => {
    const placed: unknown[] = [];
    const room = {
      name: "W1N1",
      controller: { level: 1, pos: { x: 40, y: 40, findInRange: () => [] } },
      // Every tile is wall, so planSourceContainer finds nowhere to build.
      getTerrain: () => ({ get: () => TERRAIN_MASK_WALL }),
      findPath: () => [],
      lookForAt: () => [],
      createConstructionSite: (...args: unknown[]) => {
        placed.push(args);
        return 0;
      },
      find: (type: number, opts?: { filter?: (s: unknown) => boolean }) => {
        let out: readonly unknown[] = [];
        if (type === FIND_SOURCES) {
          out = [{ id: "s0", pos: { x: 10, y: 10, findInRange: () => [] } }];
        } else if (type === FIND_MY_SPAWNS) {
          out = [{ pos: { x: 25, y: 25 } }];
        }
        return opts?.filter ? out.filter(opts.filter) : out;
      },
    } as unknown as Room;

    expect(planRoom(room)).toBe(0);
    expect(placed).toEqual([]);
  });

  it("does not count a container site the game rejected", () => {
    const room = {
      name: "W1N1",
      controller: { level: 1, pos: { x: 40, y: 40, findInRange: () => [] } },
      getTerrain: () => ({ get: () => 0 }),
      findPath: () => [],
      lookForAt: () => [],
      createConstructionSite: () => -7, // ERR_INVALID_TARGET
      find: (type: number, opts?: { filter?: (s: unknown) => boolean }) => {
        let out: readonly unknown[] = [];
        if (type === FIND_SOURCES) {
          out = [{ id: "s0", pos: { x: 10, y: 10, findInRange: () => [] } }];
        } else if (type === FIND_MY_SPAWNS) {
          out = [{ pos: { x: 25, y: 25 } }];
        }
        return opts?.filter ? out.filter(opts.filter) : out;
      },
    } as unknown as Room;

    expect(planRoom(room)).toBe(0);
  });
});

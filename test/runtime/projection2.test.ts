/**
 * Projection coverage for the colony-era functions: needs, source slots,
 * damage, wounded creeps, hostiles, pickups and the tile lookup.
 */

import {
  projectDamaged,
  projectHostiles,
  projectNeeds,
  projectPickups,
  projectSourceSlots,
  projectWounded,
  tileLookup,
} from "../../src/runtime/projection";
import { fakeRoom, installScreepsConstants } from "../helpers/mockGame";

installScreepsConstants();

describe("projectNeeds", () => {
  it("summarises a bootstrap room", () => {
    const needs = projectNeeds(fakeRoom({ sourceCount: 2, containeredSources: 0 }));
    expect(needs.sourceCount).toBe(2);
    expect(needs.sourceContainerCount).toBe(0);
    expect(needs.hasStorage).toBe(false);
  });

  it("counts containered sources", () => {
    const needs = projectNeeds(fakeRoom({ sourceCount: 2, containeredSources: 1 }));
    expect(needs.sourceContainerCount).toBe(1);
  });

  it("counts construction sites", () => {
    expect(projectNeeds(fakeRoom({ constructionSites: 3 })).constructionSiteCount).toBe(3);
  });

  it("notices storage", () => {
    expect(projectNeeds(fakeRoom({ hasStorage: true })).hasStorage).toBe(true);
  });

  it("reports level 0 for a room with no controller", () => {
    expect(projectNeeds(fakeRoom({ controllerLevel: 0 })).controllerLevel).toBe(0);
  });
});

describe("projectSourceSlots", () => {
  it("marks which sources have containers", () => {
    const slots = projectSourceSlots(fakeRoom({ sourceCount: 2, containeredSources: 1 }));
    expect(slots.map((s) => s.hasContainer)).toEqual([true, false]);
  });

  it("returns one slot per source", () => {
    expect(projectSourceSlots(fakeRoom({ sourceCount: 3 }))).toHaveLength(3);
  });
});

describe("projectDamaged", () => {
  it("returns only structures that need repair", () => {
    const room = fakeRoom({
      structures: [
        { id: "broken", structureType: "road", hits: 10, hitsMax: 1000 },
        { id: "fine", structureType: "road", hits: 990, hitsMax: 1000 },
      ],
    });
    expect(projectDamaged(room).map((s) => s.id)).toEqual(["broken"]);
  });

  it("is empty in an undamaged room", () => {
    expect(projectDamaged(fakeRoom())).toEqual([]);
  });
});

describe("projectWounded", () => {
  it("returns only creeps that have taken damage", () => {
    const room = fakeRoom();
    (room as unknown as { find: unknown }).find = (type: number) =>
      type === FIND_MY_CREEPS
        ? [
            { id: "hurt", hits: 50, hitsMax: 100 },
            { id: "fine", hits: 100, hitsMax: 100 },
          ]
        : [];
    expect(projectWounded(room).map((c) => c.id)).toEqual(["hurt"]);
  });

  it("is empty when everyone is healthy", () => {
    expect(projectWounded(fakeRoom())).toEqual([]);
  });
});

describe("projectHostiles", () => {
  it("counts HEAL parts, which drive target selection", () => {
    const room = fakeRoom();
    (room as unknown as { find: unknown }).find = (type: number) =>
      type === FIND_HOSTILE_CREEPS
        ? [{ id: "medic", hits: 100, body: [{ type: "heal" }, { type: "move" }, { type: "heal" }] }]
        : [];
    const from = { getRangeTo: () => 7 } as unknown as RoomPosition;
    expect(projectHostiles(room, from)[0]).toEqual({
      id: "medic",
      range: 7,
      healParts: 2,
      hits: 100,
    });
  });

  it("is empty in a quiet room", () => {
    const from = { getRangeTo: () => 1 } as unknown as RoomPosition;
    expect(projectHostiles(fakeRoom(), from)).toEqual([]);
  });
});

describe("projectPickups", () => {
  function creepSeeing(finds: Record<number, unknown[]>): Creep {
    return {
      pos: { getRangeTo: () => 4 },
      room: {
        find: (type: number, opts?: { filter?: (s: unknown) => boolean }) => {
          const out = finds[type] ?? [];
          return opts?.filter ? out.filter(opts.filter) : out;
        },
      },
    } as unknown as Creep;
  }

  it("includes dropped energy", () => {
    const creep = creepSeeing({
      [FIND_DROPPED_RESOURCES]: [{ id: "d1", resourceType: RESOURCE_ENERGY, amount: 120 }],
    });
    expect(projectPickups(creep)).toEqual([{ id: "d1", kind: "dropped", amount: 120, range: 4 }]);
  });

  it("ignores dropped resources that are not energy", () => {
    const creep = creepSeeing({
      [FIND_DROPPED_RESOURCES]: [{ id: "ore", resourceType: "utrium", amount: 500 }],
    });
    expect(projectPickups(creep)).toEqual([]);
  });

  it("includes tombstones holding energy", () => {
    const creep = creepSeeing({
      [FIND_TOMBSTONES]: [{ id: "t1", store: { getUsedCapacity: () => 80 } }],
    });
    expect(projectPickups(creep)[0]).toMatchObject({ kind: "tombstone", amount: 80 });
  });

  it("skips empty tombstones", () => {
    const creep = creepSeeing({
      [FIND_TOMBSTONES]: [{ id: "t1", store: { getUsedCapacity: () => 0 } }],
    });
    expect(projectPickups(creep)).toEqual([]);
  });

  it("distinguishes containers from storage", () => {
    const creep = creepSeeing({
      [FIND_STRUCTURES]: [
        { id: "c1", structureType: STRUCTURE_CONTAINER, store: { getUsedCapacity: () => 300 } },
        { id: "s1", structureType: STRUCTURE_STORAGE, store: { getUsedCapacity: () => 900 } },
      ],
    });
    const kinds = Object.fromEntries(projectPickups(creep).map((p) => [p.id, p.kind]));
    expect(kinds).toEqual({ c1: "container", s1: "storage" });
  });

  it("skips empty containers", () => {
    const creep = creepSeeing({
      [FIND_STRUCTURES]: [
        { id: "c1", structureType: STRUCTURE_CONTAINER, store: { getUsedCapacity: () => 0 } },
      ],
    });
    expect(projectPickups(creep)).toEqual([]);
  });

  it("is empty in a room with nothing to collect", () => {
    expect(projectPickups(creepSeeing({}))).toEqual([]);
  });
});

describe("tileLookup", () => {
  function roomWith(
    at: Record<string, { structures?: unknown[]; sites?: unknown[] }>,
    wallAt: readonly string[] = [],
  ): Room {
    const walls = new Set(wallAt);
    return {
      getTerrain: () => ({
        get: (x: number, y: number) => (walls.has(`${x},${y}`) ? TERRAIN_MASK_WALL : 0),
      }),
      lookForAt: (what: string, x: number, y: number) => {
        const cell = at[`${x},${y}`] ?? {};
        return what === LOOK_STRUCTURES ? (cell.structures ?? []) : (cell.sites ?? []);
      },
    } as unknown as Room;
  }

  it("reports an empty tile as free", () => {
    expect(tileLookup(roomWith({}))({ x: 10, y: 10 })).toEqual({ wall: false, occupied: false });
  });

  it("reports terrain walls", () => {
    expect(tileLookup(roomWith({}, ["5,5"]))({ x: 5, y: 5 }).wall).toBe(true);
  });

  it("treats a structure as occupying the tile", () => {
    const room = roomWith({ "8,8": { structures: [{ structureType: "spawn" }] } });
    expect(tileLookup(room)({ x: 8, y: 8 }).occupied).toBe(true);
  });

  it("does not treat a road as blocking a build slot", () => {
    const room = roomWith({ "8,8": { structures: [{ structureType: STRUCTURE_ROAD }] } });
    expect(tileLookup(room)({ x: 8, y: 8 }).occupied).toBe(false);
  });

  it("does not treat a rampart as blocking", () => {
    const room = roomWith({ "8,8": { structures: [{ structureType: STRUCTURE_RAMPART }] } });
    expect(tileLookup(room)({ x: 8, y: 8 }).occupied).toBe(false);
  });

  it("treats a queued construction site as occupying the tile", () => {
    const room = roomWith({ "9,9": { sites: [{ id: "s" }] } });
    expect(tileLookup(room)({ x: 9, y: 9 }).occupied).toBe(true);
  });

  it("reports out-of-bounds tiles as unusable rather than throwing", () => {
    const lookup = tileLookup(roomWith({}));
    expect(lookup({ x: -1, y: 10 })).toEqual({ wall: true, occupied: true });
    expect(lookup({ x: 10, y: 50 })).toEqual({ wall: true, occupied: true });
  });
});

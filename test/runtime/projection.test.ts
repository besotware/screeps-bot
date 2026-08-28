import {
  projectEnergySinks,
  projectRoom,
  projectSources,
} from "../../src/runtime/projection";
import { fakeRoom, installScreepsConstants } from "../helpers/mockGame";

installScreepsConstants();

/** Terrain where every listed "x,y" is a wall and everything else is plain. */
function terrainWithWalls(walls: readonly string[]): RoomTerrain {
  const wallSet = new Set(walls);
  return {
    get: (x: number, y: number) => (wallSet.has(`${x},${y}`) ? TERRAIN_MASK_WALL : 0),
  } as unknown as RoomTerrain;
}

interface SourceOptions {
  readonly id?: string;
  readonly x?: number;
  readonly y?: number;
  readonly energy?: number;
  readonly walls?: readonly string[];
  readonly adjacentCreeps?: number;
}

function fakeSourceAt(options: SourceOptions = {}): Source {
  const { id = "s1", x = 25, y = 25, energy = 3000, walls = [], adjacentCreeps = 0 } = options;
  return {
    id,
    energy,
    pos: {
      x,
      y,
      findInRange: () => new Array<unknown>(adjacentCreeps).fill({}),
    },
    room: { getTerrain: () => terrainWithWalls(walls) },
  } as unknown as Source;
}

/** A creep whose room returns `sources` from find(FIND_SOURCES). */
function creepSeeing(sources: readonly Source[], range = 5): Creep {
  return {
    pos: { getRangeTo: () => range },
    room: { find: (type: number) => (type === FIND_SOURCES ? sources : []) },
  } as unknown as Creep;
}

describe("projectRoom", () => {
  it("reads controller level, sources and energy off the room", () => {
    const room = fakeRoom({
      controllerLevel: 3,
      sourceCount: 2,
      energyAvailable: 250,
      energyCapacityAvailable: 550,
    });

    expect(projectRoom(room, 7)).toEqual({
      controllerLevel: 3,
      sourceCount: 2,
      energyAvailable: 250,
      energyCapacityAvailable: 550,
      creepCount: 7,
    });
  });

  it("reports level 0 for a room with no controller", () => {
    // Unowned and highway rooms have no controller at all; reaching for .level
    // there is a classic Screeps crash.
    expect(projectRoom(fakeRoom({ controllerLevel: 0 }), 0).controllerLevel).toBe(0);
  });
});

describe("projectSources", () => {
  it("counts all eight neighbours as open on clear terrain", () => {
    const [projected] = projectSources(creepSeeing([fakeSourceAt()]));
    expect(projected?.openSpots).toBe(8);
  });

  it("excludes wall tiles", () => {
    const source = fakeSourceAt({ x: 25, y: 25, walls: ["24,24", "25,24", "26,24"] });
    expect(projectSources(creepSeeing([source]))[0]?.openSpots).toBe(5);
  });

  it("excludes tiles outside the room edge", () => {
    // A source in the corner has only three in-bounds neighbours.
    expect(projectSources(creepSeeing([fakeSourceAt({ x: 0, y: 0 })]))[0]?.openSpots).toBe(3);
  });

  it("excludes tiles beyond the far room edge", () => {
    expect(projectSources(creepSeeing([fakeSourceAt({ x: 49, y: 49 })]))[0]?.openSpots).toBe(3);
  });

  it("subtracts creeps already standing on the source", () => {
    expect(projectSources(creepSeeing([fakeSourceAt({ adjacentCreeps: 3 })]))[0]?.openSpots).toBe(5);
  });

  it("never reports negative open spots", () => {
    // More adjacent creeps than walkable tiles is possible mid-shuffle.
    const source = fakeSourceAt({ x: 0, y: 0, adjacentCreeps: 9 });
    expect(projectSources(creepSeeing([source]))[0]?.openSpots).toBe(0);
  });

  it("carries id, energy and range through unchanged", () => {
    const source = fakeSourceAt({ id: "abc", energy: 1200 });
    expect(projectSources(creepSeeing([source], 12))[0]).toMatchObject({
      id: "abc",
      energy: 1200,
      range: 12,
    });
  });

  it("returns an empty list for a room with no sources", () => {
    expect(projectSources(creepSeeing([]))).toEqual([]);
  });
});

describe("projectEnergySinks", () => {
  function creepSeeingStructures(structures: readonly unknown[]): Creep {
    return {
      pos: { getRangeTo: () => 4 },
      room: {
        find: (type: number, opts?: { filter?: (s: unknown) => boolean }) => {
          if (type !== FIND_MY_STRUCTURES) return [];
          return opts?.filter ? structures.filter(opts.filter) : structures;
        },
      },
    } as unknown as Creep;
  }

  const withStore = (id: string, structureType: string, free: number): unknown => ({
    id,
    structureType,
    store: { getFreeCapacity: () => free },
  });

  it("projects structures that can still take energy", () => {
    const creep = creepSeeingStructures([withStore("e1", "extension", 50)]);
    expect(projectEnergySinks(creep)).toEqual([
      { id: "e1", structureType: "extension", free: 50, range: 4 },
    ]);
  });

  it("filters out structures with no free capacity", () => {
    const creep = creepSeeingStructures([
      withStore("full", "extension", 0),
      withStore("open", "spawn", 300),
    ]);
    expect(projectEnergySinks(creep).map((s) => s.id)).toEqual(["open"]);
  });

  it("filters out structures with no store at all", () => {
    // Walls, ramparts and roads have no store; asking them for capacity throws.
    const creep = creepSeeingStructures([{ id: "wall", structureType: "constructedWall" }]);
    expect(projectEnergySinks(creep)).toEqual([]);
  });
});

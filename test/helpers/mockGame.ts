/**
 * Minimal Screeps runtime stand-in.
 *
 * Screeps exposes Game, Memory and a pile of screaming-case constants as
 * globals that simply do not exist under Jest. Rather than pull in a full
 * server, we install only the surface the code under test touches -- if a new
 * global is needed, the test fails loudly with "X is not defined" and we add it
 * here deliberately.
 */

/** Game constants the runtime layer references. Values match the real game. */
export function installScreepsConstants(): void {
  const globals: Record<string, unknown> = {
    OK: 0,
    ERR_NOT_OWNER: -1,
    ERR_NAME_EXISTS: -3,
    ERR_BUSY: -4,
    ERR_NOT_ENOUGH_ENERGY: -6,
    ERR_NOT_IN_RANGE: -9,
    ERR_INVALID_ARGS: -10,
    FIND_SOURCES: 105,
    FIND_MY_CREEPS: 102,
    FIND_STRUCTURES: 107,
    FIND_MY_STRUCTURES: 108,
    FIND_MY_CONSTRUCTION_SITES: 114,
    FIND_HOSTILE_CREEPS: 103,
    FIND_DROPPED_RESOURCES: 106,
    FIND_TOMBSTONES: 118,
    FIND_MY_SPAWNS: 112,
    LOOK_STRUCTURES: "structure",
    LOOK_CONSTRUCTION_SITES: "constructionSite",
    STRUCTURE_CONTAINER: "container",
    STRUCTURE_STORAGE: "storage",
    STRUCTURE_EXTENSION: "extension",
    STRUCTURE_ROAD: "road",
    STRUCTURE_RAMPART: "rampart",
    STRUCTURE_TOWER: "tower",
    MOVE: "move",
    WORK: "work",
    CARRY: "carry",
    ATTACK: "attack",
    RANGED_ATTACK: "ranged_attack",
    HEAL: "heal",
    CLAIM: "claim",
    TOUGH: "tough",
    RESOURCE_ENERGY: "energy",
    TERRAIN_MASK_WALL: 1,
  };

  for (const [key, value] of Object.entries(globals)) {
    (globalThis as Record<string, unknown>)[key] = value;
  }
}

export interface FakeRoomOptions {
  readonly name?: string;
  readonly controllerLevel?: number;
  readonly sourceCount?: number;
  readonly energyAvailable?: number;
  readonly energyCapacityAvailable?: number;
  /** How many of the sources have a finished container beside them. */
  readonly containeredSources?: number;
  readonly constructionSites?: number;
  /** Structures returned from FIND_STRUCTURES / FIND_MY_STRUCTURES. */
  readonly structures?: readonly unknown[];
  readonly hasStorage?: boolean;
}

/**
 * A Room with just enough behaviour for the projection layer.
 *
 * `containersBySource` controls the harvester/miner handover: a source with a
 * container gets a miner, one without keeps a harvester. It is the single most
 * important switch in the spawn planner, so it is a first-class option here.
 */
export function fakeRoom(options: FakeRoomOptions = {}): Room {
  const {
    name = "W1N1",
    controllerLevel = 1,
    sourceCount = 2,
    energyAvailable = 300,
    energyCapacityAvailable = 300,
    containeredSources = 0,
    constructionSites = 0,
    structures = [],
    hasStorage = false,
  } = options;

  const sources = Array.from({ length: sourceCount }, (_, i) => ({
    id: `source-${i}`,
    energy: 3000,
    pos: {
      x: 10 + i * 5,
      y: 10,
      findInRange: (type: unknown, _range: number, opts?: { filter?: (s: unknown) => boolean }) => {
        if (type !== G("FIND_STRUCTURES")) return [];
        const container = i < containeredSources ? [{ structureType: "container", id: `cont-${i}`, pos: { x: 11 + i * 5, y: 10 } }] : [];
        return opts?.filter ? container.filter(opts.filter) : container;
      },
    },
    room: { getTerrain: () => ({ get: () => 0 }) },
  }));

  const sites = Array.from({ length: constructionSites }, (_, i) => ({
    id: `site-${i}`,
    structureType: "extension",
  }));

  const room = {
    name,
    controller: controllerLevel > 0 ? { level: controllerLevel, progress: 50, progressTotal: 100 } : undefined,
    energyAvailable,
    energyCapacityAvailable,
    storage: hasStorage ? { id: "storage-1" } : undefined,
    visual: {
      text: () => undefined,
    },
    getTerrain: () => ({ get: () => 0 }),
    lookForAt: () => [],
    createConstructionSite: () => 0,
    find: (type: number, opts?: { filter?: (s: unknown) => boolean }) => {
      let result: readonly unknown[] = [];
      if (type === G("FIND_SOURCES")) result = sources;
      else if (type === G("FIND_MY_CONSTRUCTION_SITES")) result = sites;
      else if (type === G("FIND_STRUCTURES") || type === G("FIND_MY_STRUCTURES")) result = structures;
      else if (type === G("FIND_MY_SPAWNS")) result = [{ pos: { x: 25, y: 25 } }];
      return opts?.filter ? result.filter(opts.filter) : result;
    },
  };

  return room as unknown as Room;
}

/** Read a screaming-case game constant that installScreepsConstants() set. */
function G(key: string): unknown {
  return (globalThis as Record<string, unknown>)[key];
}

export interface FakeSpawnResult {
  readonly spawn: StructureSpawn;
  /** Calls recorded by spawnCreep, in order. */
  readonly calls: { body: BodyPartConstant[]; name: string; opts?: SpawnOptions }[];
}

/** A StructureSpawn that records spawnCreep calls instead of performing them. */
export function fakeSpawn(room: Room, options: { spawning?: boolean; returns?: number } = {}): FakeSpawnResult {
  const { spawning = false, returns = 0 } = options;
  const calls: { body: BodyPartConstant[]; name: string; opts?: SpawnOptions }[] = [];

  const spawn = {
    room,
    name: `Spawn1-${room.name}`,
    spawning: spawning ? { name: "busy" } : null,
    spawnCreep: (body: BodyPartConstant[], name: string, opts?: SpawnOptions) => {
      calls.push({ body, name, ...(opts ? { opts } : {}) });
      return returns;
    },
  } as unknown as StructureSpawn;

  return { spawn, calls };
}

/** A Creep carrying only the memory fields the census cares about. */
export function fakeCreep(role: string, home = "W1N1", sourceId?: string): Creep {
  return {
    name: `${role}-x`,
    memory: { role, home, mode: "gathering", ...(sourceId ? { sourceId } : {}) },
  } as unknown as Creep;
}

/** Install a Game global. Returns a restore function for afterEach. */
export function installGame(overrides: Partial<Game> = {}): () => void {
  const previous = (globalThis as Record<string, unknown>)["Game"];

  (globalThis as Record<string, unknown>)["Game"] = {
    time: 1000,
    creeps: {},
    spawns: {},
    rooms: {},
    getObjectById: () => null,
    ...overrides,
  };

  return () => {
    (globalThis as Record<string, unknown>)["Game"] = previous;
  };
}

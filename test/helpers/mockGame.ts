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
    FIND_MY_STRUCTURES: 108,
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
}

/** A Room with just enough behaviour for projectRoom(). */
export function fakeRoom(options: FakeRoomOptions = {}): Room {
  const {
    name = "W1N1",
    controllerLevel = 1,
    sourceCount = 2,
    energyAvailable = 300,
    energyCapacityAvailable = 300,
  } = options;

  const sources = Array.from({ length: sourceCount }, (_, i) => ({ id: `source-${i}` }));

  return {
    name,
    controller: controllerLevel > 0 ? { level: controllerLevel } : undefined,
    energyAvailable,
    energyCapacityAvailable,
    find: (type: number) => (type === (globalThis as Record<string, unknown>)["FIND_SOURCES"] ? sources : []),
  } as unknown as Room;
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
export function fakeCreep(role: string, home = "W1N1"): Creep {
  return { name: `${role}-x`, memory: { role, home, mode: "gathering" } } as unknown as Creep;
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

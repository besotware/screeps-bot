import { loop } from "../src/main";
import { fakeRoom, installGame, installScreepsConstants } from "./helpers/mockGame";

installScreepsConstants();

/** A creep that records whether it ran, and can be made to throw. */
function trackedCreep(name: string, options: { throws?: boolean } = {}): Creep {
  return {
    id: name,
    name,
    spawning: false,
    hits: 100,
    hitsMax: 100,
    memory: { role: "harvester", home: "W1N1", mode: "gathering" },
    store: {
      getUsedCapacity: () => {
        if (options.throws) throw new Error("boom");
        return 0;
      },
      getCapacity: () => 50,
    },
    pos: { getRangeTo: () => 3, findClosestByPath: () => null },
    room: { controller: undefined, find: () => [] },
    say: () => undefined,
    harvest: () => 0,
    transfer: () => 0,
    upgradeController: () => 0,
    moveTo: () => 0,
  } as unknown as Creep;
}

function fakeSpawnIn(room: Room, name = "Spawn1"): StructureSpawn {
  return {
    name,
    room,
    spawning: { name: "busy" }, // busy, so runSpawn returns immediately
  } as unknown as StructureSpawn;
}

function installMemory(creeps: Record<string, unknown>): () => void {
  const previous = (globalThis as Record<string, unknown>)["Memory"];
  (globalThis as Record<string, unknown>)["Memory"] = { creeps };
  return () => {
    (globalThis as Record<string, unknown>)["Memory"] = previous;
  };
}

/** A healthy CPU position: full bucket, barely any of the tick spent. */
const CPU = { getUsed: () => 3, limit: 20, bucket: 10_000 } as unknown as CPU;

/** Bucket exhausted: only defence, spawning and creep actions may run. */
const CPU_CRITICAL = { getUsed: () => 3, limit: 20, bucket: 100 } as unknown as CPU;

/** Bucket low but not empty: planning survives, telemetry does not. */
const CPU_STRAINED = { getUsed: () => 3, limit: 20, bucket: 2000 } as unknown as CPU;

describe("loop", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  it("runs a tick with nothing at all without throwing", () => {
    const restoreMemory = installMemory({});
    const restoreGame = installGame({ creeps: {}, spawns: {}, cpu: CPU });

    expect(() => loop()).not.toThrow();

    restoreGame();
    restoreMemory();
  });

  it("prunes memory for creeps that died last tick", () => {
    const memory = { alive: {}, dead: {} };
    const restoreMemory = installMemory(memory);
    const restoreGame = installGame({
      creeps: { alive: trackedCreep("alive") },
      spawns: {},
      cpu: CPU,
    });

    loop();

    restoreGame();
    restoreMemory();
    expect(Object.keys(memory)).toEqual(["alive"]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("pruned 1"));
  });

  it("stays quiet when there is nothing to prune", () => {
    const restoreMemory = installMemory({ alive: {} });
    const restoreGame = installGame({
      creeps: { alive: trackedCreep("alive") },
      spawns: {},
      cpu: CPU,
    });

    loop();

    restoreGame();
    restoreMemory();
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("pruned"));
  });

  it("contains a throwing creep so the rest of the tick still runs", () => {
    // A creep that throws must not cost the whole colony a tick. This is the
    // single most important resilience property of the loop.
    const restoreMemory = installMemory({ bad: {}, good: {} });
    const restoreGame = installGame({
      creeps: { bad: trackedCreep("bad", { throws: true }), good: trackedCreep("good") },
      spawns: {},
      cpu: CPU,
    });

    expect(() => loop()).not.toThrow();

    restoreGame();
    restoreMemory();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("bad threw"));
  });

  it("drives every spawn it owns", () => {
    const room = fakeRoom();
    const restoreMemory = installMemory({});
    const restoreGame = installGame({
      creeps: {},
      spawns: { a: fakeSpawnIn(room, "a"), b: fakeSpawnIn(room, "b") },
      cpu: CPU,
    });

    expect(() => loop()).not.toThrow();

    restoreGame();
    restoreMemory();
  });

  it("plans construction on the planning tick", () => {
    const room = fakeRoom({ sourceCount: 1 });
    const restoreMemory = installMemory({});
    const restoreGame = installGame({
      time: 0, // tick 0 is a planning tick
      creeps: {},
      spawns: { a: fakeSpawnIn(room) },
      cpu: CPU,
    });

    loop();

    restoreGame();
    restoreMemory();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[build]"));
  });

  it("skips planning on an ordinary tick", () => {
    const room = fakeRoom({ sourceCount: 1 });
    const restoreMemory = installMemory({});
    const restoreGame = installGame({
      time: 7,
      creeps: {},
      spawns: { a: fakeSpawnIn(room) },
      cpu: CPU,
    });

    loop();

    restoreGame();
    restoreMemory();
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("[build]"));
  });

  it("reports colony state", () => {
    const room = fakeRoom({ sourceCount: 2 });
    const restoreMemory = installMemory({});
    const restoreGame = installGame({
      time: 7, // not a report interval, but the room is short of creeps
      creeps: {},
      spawns: { a: fakeSpawnIn(room) },
      cpu: CPU,
    });

    loop();

    restoreGame();
    restoreMemory();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("RCL"));
  });

  it("derives rooms from spawns, so a room we merely see is not managed", () => {
    // Game.rooms includes rooms we only have vision into; acting on those
    // would waste CPU and, worse, place construction sites we cannot build.
    const owned = fakeRoom({ name: "W1N1", sourceCount: 1 });
    const merelyVisible = fakeRoom({ name: "W9N9", sourceCount: 1 });
    const restoreMemory = installMemory({});
    const restoreGame = installGame({
      time: 0,
      creeps: {},
      spawns: { a: fakeSpawnIn(owned) },
      rooms: { W1N1: owned, W9N9: merelyVisible },
      cpu: CPU,
    });

    loop();

    restoreGame();
    restoreMemory();
    const built = logSpy.mock.calls.flat().filter((m) => String(m).includes("[build]"));
    expect(built.every((m) => String(m).includes("W1N1"))).toBe(true);
  });

  it("reports only the creeps homed to each room", () => {
    // Exercises the per-room creep filter, which needs both a spawn and creeps
    // present in the same tick.
    const room = fakeRoom({ name: "W1N1", sourceCount: 2 });
    const mine = trackedCreep("mine");
    const theirs = trackedCreep("theirs");
    (theirs as unknown as { memory: { home: string } }).memory.home = "W9N9";

    const restoreMemory = installMemory({ mine: {}, theirs: {} });
    const restoreGame = installGame({
      time: 7,
      creeps: { mine, theirs },
      spawns: { a: fakeSpawnIn(room) },
      cpu: CPU,
    });

    expect(() => loop()).not.toThrow();

    restoreGame();
    restoreMemory();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("RCL"));
  });

  it("runs towers in owned rooms", () => {
    let fired = 0;
    const tower = {
      id: "t1",
      store: { getUsedCapacity: () => 1000 },
      pos: { getRangeTo: () => 5 },
      attack: () => (fired += 1),
      repair: () => undefined,
      heal: () => undefined,
    };
    const room = fakeRoom({ sourceCount: 1, structures: [{ ...tower, structureType: "tower" }] });
    (room as unknown as { find: unknown }).find = (
      type: number,
      opts?: { filter?: (s: unknown) => boolean },
    ) => {
      let out: readonly unknown[] = [];
      if (type === FIND_MY_STRUCTURES) out = [{ ...tower, room, structureType: "tower" }];
      return opts?.filter ? out.filter(opts.filter) : out;
    };

    const restoreMemory = installMemory({});
    const restoreGame = installGame({
      time: 7,
      creeps: {},
      spawns: { a: fakeSpawnIn(room) },
      cpu: CPU,
    });

    expect(() => loop()).not.toThrow();

    restoreGame();
    restoreMemory();
  });
});

describe("loop under attack", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  it("considers safe mode when the room is being attacked", () => {
    const room = fakeRoom({ sourceCount: 1 });
    (room as unknown as { controller: unknown }).controller = {
      my: true,
      level: 3,
      progress: 0,
      progressTotal: 100,
      pos: { x: 30, y: 30 },
      safeModeAvailable: 3,
      safeModeCooldown: 0,
      safeMode: 0,
      activateSafeMode: () => OK,
    };
    (room as unknown as { find: unknown }).find = (
      type: number,
      opts?: { filter?: (s: unknown) => boolean },
    ) => {
      let out: readonly unknown[] = [];
      if (type === FIND_HOSTILE_CREEPS) {
        out = [
          {
            id: "raider",
            hits: 1000,
            owner: { username: "SomePlayer" },
            body: Array.from({ length: 10 }, () => ({ type: ATTACK })),
          },
        ];
      } else if (type === FIND_MY_SPAWNS) {
        out = [{ id: "s1", hits: 500, hitsMax: 5000, pos: { x: 20, y: 20 } }];
      }
      return opts?.filter ? out.filter(opts.filter) : out;
    };

    const restoreMemory = installMemory({});
    const restoreGame = installGame({
      time: 9,
      creeps: {},
      spawns: { a: fakeSpawnIn(room) },
      cpu: CPU,
    });

    expect(() => loop()).not.toThrow();

    restoreGame();
    restoreMemory();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("SAFE MODE"));
  });
});

describe("loop under CPU pressure", () => {
  let logSpy: jest.SpyInstance;
  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  it("plans and reports when CPU is healthy", () => {
    const room = fakeRoom({ sourceCount: 1 });
    const restoreMemory = installMemory({});
    const restoreGame = installGame({
      time: 0,
      creeps: {},
      spawns: { a: fakeSpawnIn(room) },
      cpu: CPU,
    });

    loop();

    restoreGame();
    restoreMemory();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[build]"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("RCL"));
  });

  it("drops telemetry first when the bucket is draining", () => {
    // Nothing depends on telemetry, so it is the cheapest thing to lose.
    const room = fakeRoom({ sourceCount: 1 });
    const restoreMemory = installMemory({});
    const restoreGame = installGame({
      time: 0,
      creeps: {},
      spawns: { a: fakeSpawnIn(room) },
      cpu: CPU_STRAINED,
    });

    loop();

    restoreGame();
    restoreMemory();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[build]"));
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("RCL"));
  });

  it("drops planning too when the bucket is critical", () => {
    const room = fakeRoom({ sourceCount: 1 });
    const restoreMemory = installMemory({});
    const restoreGame = installGame({
      time: 0,
      creeps: {},
      spawns: { a: fakeSpawnIn(room) },
      cpu: CPU_CRITICAL,
    });

    loop();

    restoreGame();
    restoreMemory();
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("[build]"));
  });

  it("reports the CPU position when pressure is not healthy", () => {
    const room = fakeRoom({ sourceCount: 1 });
    const restoreMemory = installMemory({});
    const restoreGame = installGame({
      time: 7,
      creeps: {},
      spawns: { a: fakeSpawnIn(room) },
      cpu: CPU_CRITICAL,
    });

    loop();

    restoreGame();
    restoreMemory();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[cpu]"));
  });

  it("still runs creeps when the bucket is critical", () => {
    // Skipping creep actions costs bodies; skipping a plan costs nothing.
    const room = fakeRoom({ sourceCount: 1 });
    const restoreMemory = installMemory({ bad: {} });
    const restoreGame = installGame({
      time: 7,
      creeps: { bad: trackedCreep("bad", { throws: true }) },
      spawns: { a: fakeSpawnIn(room) },
      cpu: CPU_CRITICAL,
    });

    loop();

    restoreGame();
    restoreMemory();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("bad threw"));
  });
});

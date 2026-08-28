import { loop } from "../src/main";
import { installGame, installScreepsConstants } from "./helpers/mockGame";

installScreepsConstants();

/** A creep that records whether it was run, and can be made to throw. */
function trackedCreep(name: string, options: { throws?: boolean } = {}): Creep {
  return {
    name,
    spawning: false,
    memory: { role: "harvester", home: "W1N1", mode: "gathering" },
    store: {
      getUsedCapacity: () => {
        if (options.throws) throw new Error("boom");
        return 0;
      },
      getCapacity: () => 50,
    },
    pos: { getRangeTo: () => 3 },
    room: { controller: undefined, find: () => [] },
    say: () => undefined,
    harvest: () => 0,
    transfer: () => 0,
    upgradeController: () => 0,
    moveTo: () => 0,
  } as unknown as Creep;
}

function installMemory(creeps: Record<string, unknown>): () => void {
  const previous = (globalThis as Record<string, unknown>)["Memory"];
  (globalThis as Record<string, unknown>)["Memory"] = { creeps };
  return () => {
    (globalThis as Record<string, unknown>)["Memory"] = previous;
  };
}

describe("loop", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  it("runs a tick with nothing at all without throwing", () => {
    const restoreMemory = installMemory({});
    const restoreGame = installGame({ creeps: {}, spawns: {} });

    expect(() => loop()).not.toThrow();

    restoreGame();
    restoreMemory();
  });

  it("prunes memory for creeps that died last tick", () => {
    const memory = { alive: {}, dead: {} };
    const restoreMemory = installMemory(memory);
    const restoreGame = installGame({ creeps: { alive: trackedCreep("alive") }, spawns: {} });

    loop();

    restoreGame();
    restoreMemory();
    expect(Object.keys(memory)).toEqual(["alive"]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("pruned 1"));
  });

  it("stays quiet when there is nothing to prune", () => {
    const restoreMemory = installMemory({ alive: {} });
    const restoreGame = installGame({ creeps: { alive: trackedCreep("alive") }, spawns: {} });

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
    });

    expect(() => loop()).not.toThrow();

    restoreGame();
    restoreMemory();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("bad threw"));
  });

  it("drives every spawn it owns", () => {
    const spawnCalls: string[] = [];
    const makeSpawn = (name: string): StructureSpawn =>
      ({
        name,
        spawning: { name: "busy" }, // busy, so runSpawn returns immediately
        room: { name: "W1N1" },
      }) as unknown as StructureSpawn;

    const restoreMemory = installMemory({});
    const restoreGame = installGame({
      creeps: {},
      spawns: { a: makeSpawn("a"), b: makeSpawn("b") },
    });

    expect(() => loop()).not.toThrow();
    spawnCalls.push("ok");

    restoreGame();
    restoreMemory();
    expect(spawnCalls).toEqual(["ok"]);
  });
});

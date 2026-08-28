import { runCreep } from "../../src/runtime/creeps";
import { installGame, installScreepsConstants } from "../helpers/mockGame";

installScreepsConstants();

interface Recorded {
  say: string[];
  harvest: unknown[];
  transfer: unknown[];
  upgrade: unknown[];
  moveTo: unknown[];
}

interface BuildOptions {
  readonly role?: string;
  readonly mode?: string;
  readonly carried?: number;
  readonly capacity?: number;
  readonly spawning?: boolean;
  /** Ids of sources visible in the room; all are open and full unless empty. */
  readonly sourceIds?: readonly string[];
  /** [id, structureType, freeCapacity] triples. */
  readonly sinks?: readonly [string, string, number][];
  readonly hasController?: boolean;
  /** Return code from harvest/transfer/upgradeController. */
  readonly actionResult?: number;
}

function build(options: BuildOptions = {}): {
  creep: Creep;
  rec: Recorded;
  restore: () => void;
} {
  const {
    role = "harvester",
    mode = "gathering",
    carried = 0,
    capacity = 50,
    spawning = false,
    sourceIds = ["src-1"],
    sinks = [["ext-1", "extension", 50]],
    hasController = true,
    actionResult = 0,
  } = options;

  const rec: Recorded = { say: [], harvest: [], transfer: [], upgrade: [], moveTo: [] };
  const registry = new Map<string, unknown>();

  const sources = sourceIds.map((id) => {
    const source = {
      id,
      energy: 3000,
      pos: { x: 10, y: 10, findInRange: () => [] },
      room: { getTerrain: () => ({ get: () => 0 }) },
    };
    registry.set(id, source);
    return source;
  });

  const structures = sinks.map(([id, structureType, free]) => {
    const structure = { id, structureType, store: { getFreeCapacity: () => free } };
    registry.set(id, structure);
    return structure;
  });

  const controller = hasController ? { id: "ctrl", level: 2 } : undefined;
  if (controller) registry.set("ctrl", controller);

  const creep = {
    name: `${role}-test`,
    spawning,
    memory: { role, home: "W1N1", mode },
    store: {
      getUsedCapacity: () => carried,
      getCapacity: () => capacity,
    },
    pos: { getRangeTo: () => 3 },
    room: {
      controller,
      find: (type: number, opts?: { filter?: (s: unknown) => boolean }) => {
        if (type === FIND_SOURCES) return sources;
        if (type === FIND_MY_STRUCTURES) {
          return opts?.filter ? structures.filter(opts.filter) : structures;
        }
        return [];
      },
    },
    say: (msg: string) => rec.say.push(msg),
    harvest: (t: unknown) => {
      rec.harvest.push(t);
      return actionResult;
    },
    transfer: (t: unknown) => {
      rec.transfer.push(t);
      return actionResult;
    },
    upgradeController: (t: unknown) => {
      rec.upgrade.push(t);
      return actionResult;
    },
    moveTo: (t: unknown) => {
      rec.moveTo.push(t);
      return 0;
    },
  } as unknown as Creep;

  const restore = installGame({
    getObjectById: ((id: string) => registry.get(id) ?? null) as Game["getObjectById"],
  });

  return { creep, rec, restore };
}

describe("runCreep dispatch", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  it("does nothing while the creep is still spawning", () => {
    const { creep, rec, restore } = build({ spawning: true });
    runCreep(creep);
    restore();
    expect(rec).toEqual({ say: [], harvest: [], transfer: [], upgrade: [], moveTo: [] });
  });

  it("logs an unknown role instead of silently idling the creep", () => {
    const { creep, rec, restore } = build({ role: "wizard" });
    runCreep(creep);
    restore();
    expect(rec.harvest).toHaveLength(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("unknown role wizard"));
  });
});

describe("harvester", () => {
  it("harvests the chosen source while gathering", () => {
    const { creep, rec, restore } = build({ mode: "gathering", carried: 0 });
    runCreep(creep);
    restore();
    expect(rec.harvest).toHaveLength(1);
    expect(rec.transfer).toHaveLength(0);
  });

  it("moves to the source when out of range", () => {
    const { creep, rec, restore } = build({ actionResult: ERR_NOT_IN_RANGE });
    runCreep(creep);
    restore();
    expect(rec.moveTo).toHaveLength(1);
  });

  it("does not move when the harvest succeeded", () => {
    const { creep, rec, restore } = build({ actionResult: OK });
    runCreep(creep);
    restore();
    expect(rec.moveTo).toHaveLength(0);
  });

  it("switches to delivering and announces it once full", () => {
    const { creep, rec, restore } = build({ mode: "gathering", carried: 50, capacity: 50 });
    runCreep(creep);
    restore();
    expect(creep.memory.mode).toBe("delivering");
    expect(rec.say).toHaveLength(1);
    expect(rec.transfer).toHaveLength(1);
  });

  it("does not re-announce a mode it is already in", () => {
    const { creep, rec, restore } = build({ mode: "delivering", carried: 50 });
    runCreep(creep);
    restore();
    expect(rec.say).toHaveLength(0);
  });

  it("delivers to a sink that needs energy", () => {
    const { creep, rec, restore } = build({
      mode: "delivering",
      carried: 50,
      sinks: [["spawn-1", "spawn", 300]],
    });
    runCreep(creep);
    restore();
    expect(rec.transfer).toHaveLength(1);
  });

  it("parks at the controller when nothing needs energy", () => {
    const { creep, rec, restore } = build({ mode: "delivering", carried: 50, sinks: [] });
    runCreep(creep);
    restore();
    expect(rec.transfer).toHaveLength(0);
    expect(rec.moveTo).toHaveLength(1);
  });

  it("idles harmlessly when there is nowhere to put energy and no controller", () => {
    const { creep, rec, restore } = build({
      mode: "delivering",
      carried: 50,
      sinks: [],
      hasController: false,
    });
    expect(() => runCreep(creep)).not.toThrow();
    restore();
    expect(rec.moveTo).toHaveLength(0);
  });

  it("idles when every source is exhausted rather than throwing", () => {
    const { creep, rec, restore } = build({ mode: "gathering", sourceIds: [] });
    expect(() => runCreep(creep)).not.toThrow();
    restore();
    expect(rec.harvest).toHaveLength(0);
  });
});

describe("upgrader", () => {
  it("gathers when empty", () => {
    const { creep, rec, restore } = build({ role: "upgrader", mode: "gathering", carried: 0 });
    runCreep(creep);
    restore();
    expect(rec.harvest).toHaveLength(1);
    expect(rec.upgrade).toHaveLength(0);
  });

  it("upgrades the controller when loaded", () => {
    const { creep, rec, restore } = build({ role: "upgrader", mode: "delivering", carried: 50 });
    runCreep(creep);
    restore();
    expect(rec.upgrade).toHaveLength(1);
  });

  it("moves to the controller when out of range", () => {
    const { creep, rec, restore } = build({
      role: "upgrader",
      mode: "delivering",
      carried: 50,
      actionResult: ERR_NOT_IN_RANGE,
    });
    runCreep(creep);
    restore();
    expect(rec.moveTo).toHaveLength(1);
  });

  it("does nothing in a room with no controller", () => {
    const { creep, rec, restore } = build({
      role: "upgrader",
      mode: "delivering",
      carried: 50,
      hasController: false,
    });
    expect(() => runCreep(creep)).not.toThrow();
    restore();
    expect(rec.upgrade).toHaveLength(0);
  });
});

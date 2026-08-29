import { runCreep } from "../../src/runtime/creeps";
import { installGame, installScreepsConstants } from "../helpers/mockGame";

installScreepsConstants();

interface Recorded {
  say: string[];
  harvest: unknown[];
  transfer: unknown[];
  upgrade: unknown[];
  moveTo: unknown[];
  pickup: unknown[];
  withdraw: unknown[];
  build: unknown[];
  repair: unknown[];
}

interface BuildOptions {
  readonly role?: string;
  readonly mode?: string;
  readonly carried?: number;
  readonly capacity?: number;
  readonly spawning?: boolean;
  readonly sourceIds?: readonly string[];
  /** [id, structureType, freeCapacity] */
  readonly sinks?: readonly [string, string, number][];
  /** [id, kind, amount] for dropped/tombstone/container/storage */
  readonly pickups?: readonly [string, string, number][];
  /** [id, structureType, hits, hitsMax] */
  readonly damaged?: readonly [string, string, number, number][];
  readonly hasController?: boolean;
  readonly constructionSite?: string | undefined;
  readonly actionResult?: number;
  /** Miner's assigned source. */
  readonly sourceId?: string | undefined;
  /** Whether the assigned source has a container, and whether we stand on it. */
  readonly minerContainer?: boolean;
  readonly minerOnContainer?: boolean;
  /** Whether a container sits by the controller, for upgrader stationing. */
  readonly controllerContainer?: boolean;
  readonly controllerContainerEnergy?: number;
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
    pickups = [],
    damaged = [],
    hasController = true,
    constructionSite = undefined,
    actionResult = 0,
    sourceId = undefined,
    minerContainer = true,
    minerOnContainer = true,
    controllerContainer = false,
    controllerContainerEnergy = 2000,
  } = options;

  const rec: Recorded = {
    say: [], harvest: [], transfer: [], upgrade: [], moveTo: [],
    pickup: [], withdraw: [], build: [], repair: [],
  };
  const registry = new Map<string, unknown>();

  const containerPos = { x: 11, y: 10, isEqualTo: () => minerOnContainer };

  const sources = sourceIds.map((id) => {
    const source = {
      id,
      energy: 3000,
      pos: {
        x: 10,
        y: 10,
        findInRange: (type: unknown, _r: number, opts?: { filter?: (s: unknown) => boolean }) => {
          if (type !== FIND_STRUCTURES) return [];
          const c = minerContainer
            ? [{ structureType: STRUCTURE_CONTAINER, id: "cont-1", pos: containerPos }]
            : [];
          return opts?.filter ? c.filter(opts.filter) : c;
        },
      },
      room: { getTerrain: () => ({ get: () => 0 }) },
    };
    registry.set(id, source);
    return source;
  });

  const structures = sinks.map(([id, structureType, free]) => {
    const s = { id, structureType, store: { getFreeCapacity: () => free } };
    registry.set(id, s);
    return s;
  });

  const dropped = pickups
    .filter(([, kind]) => kind === "dropped")
    .map(([id, , amount]) => {
      const o = { id, resourceType: RESOURCE_ENERGY, amount };
      registry.set(id, o);
      return o;
    });

  const tombs = pickups
    .filter(([, kind]) => kind === "tombstone")
    .map(([id, , amount]) => {
      const o = { id, store: { getUsedCapacity: () => amount } };
      registry.set(id, o);
      return o;
    });

  const stores = pickups
    .filter(([, kind]) => kind === "container" || kind === "storage")
    .map(([id, kind, amount]) => {
      const o = {
        id,
        structureType: kind === "storage" ? STRUCTURE_STORAGE : STRUCTURE_CONTAINER,
        store: { getUsedCapacity: () => amount },
      };
      registry.set(id, o);
      return o;
    });

  const damagedObjs = damaged.map(([id, structureType, hits, hitsMax]) => {
    const o = { id, structureType, hits, hitsMax };
    registry.set(id, o);
    return o;
  });

  const controller = hasController
    ? {
        id: "ctrl",
        level: 2,
        pos: {
          x: 40,
          y: 40,
          findInRange: (type: unknown, _r: number, opts?: { filter?: (s: unknown) => boolean }) => {
            if (type !== FIND_STRUCTURES) return [];
            const c = controllerContainer
              ? [
                  {
                    structureType: STRUCTURE_CONTAINER,
                    id: "ctrl-cont",
                    store: { getUsedCapacity: () => controllerContainerEnergy },
                  },
                ]
              : [];
            return opts?.filter ? c.filter(opts.filter) : c;
          },
        },
      }
    : undefined;
  if (controller) registry.set("ctrl", controller);

  const site = constructionSite ? { id: constructionSite } : null;

  const creep = {
    name: `${role}-test`,
    spawning,
    memory: { role, home: "W1N1", mode, ...(sourceId ? { sourceId } : {}) },
    store: { getUsedCapacity: () => carried, getCapacity: () => capacity },
    pos: {
      x: 5, y: 5,
      getRangeTo: () => 3,
      isEqualTo: () => minerOnContainer,
      findClosestByPath: () => site,
    },
    room: {
      controller,
      find: (type: number, opts?: { filter?: (s: unknown) => boolean }) => {
        let out: readonly unknown[] = [];
        if (type === FIND_SOURCES) out = sources;
        else if (type === FIND_MY_STRUCTURES) out = structures;
        else if (type === FIND_DROPPED_RESOURCES) out = dropped;
        else if (type === FIND_TOMBSTONES) out = tombs;
        else if (type === FIND_STRUCTURES) out = [...stores, ...damagedObjs];
        return opts?.filter ? out.filter(opts.filter) : out;
      },
    },
    say: (m: string) => rec.say.push(m),
    harvest: (t: unknown) => { rec.harvest.push(t); return actionResult; },
    transfer: (t: unknown) => { rec.transfer.push(t); return actionResult; },
    upgradeController: (t: unknown) => { rec.upgrade.push(t); return actionResult; },
    moveTo: (t: unknown) => { rec.moveTo.push(t); return 0; },
    pickup: (t: unknown) => { rec.pickup.push(t); return actionResult; },
    withdraw: (t: unknown) => { rec.withdraw.push(t); return actionResult; },
    build: (t: unknown) => { rec.build.push(t); return actionResult; },
    repair: (t: unknown) => { rec.repair.push(t); return actionResult; },
  } as unknown as Creep;

  const restore = installGame({
    getObjectById: ((id: string) => registry.get(id) ?? null) as Game["getObjectById"],
  });

  return { creep, rec, restore };
}

describe("runCreep dispatch", () => {
  let logSpy: jest.SpyInstance;
  beforeEach(() => { logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined); });
  afterEach(() => logSpy.mockRestore());

  it("does nothing while the creep is still spawning", () => {
    const { creep, rec, restore } = build({ spawning: true });
    runCreep(creep);
    restore();
    expect(rec.harvest).toHaveLength(0);
    expect(rec.moveTo).toHaveLength(0);
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
  it("harvests while gathering", () => {
    const { creep, rec, restore } = build({ role: "harvester", mode: "gathering" });
    runCreep(creep);
    restore();
    expect(rec.harvest).toHaveLength(1);
  });

  it("moves to the source when out of range", () => {
    const { creep, rec, restore } = build({ actionResult: ERR_NOT_IN_RANGE });
    runCreep(creep);
    restore();
    expect(rec.moveTo).toHaveLength(1);
  });

  it("switches to delivering and announces it once full", () => {
    const { creep, rec, restore } = build({ mode: "gathering", carried: 50, capacity: 50 });
    runCreep(creep);
    restore();
    expect(creep.memory.mode).toBe("delivering");
    expect(rec.say).toHaveLength(1);
    expect(rec.transfer).toHaveLength(1);
  });

  it("parks at the controller when nothing needs energy", () => {
    const { creep, rec, restore } = build({ mode: "delivering", carried: 50, sinks: [] });
    runCreep(creep);
    restore();
    expect(rec.transfer).toHaveLength(0);
    expect(rec.moveTo).toHaveLength(1);
  });

  it("idles harmlessly with nowhere to deliver and no controller", () => {
    const { creep, restore } = build({
      mode: "delivering", carried: 50, sinks: [], hasController: false,
    });
    expect(() => runCreep(creep)).not.toThrow();
    restore();
  });

  it("idles when every source is gone rather than throwing", () => {
    const { creep, rec, restore } = build({ mode: "gathering", sourceIds: [] });
    expect(() => runCreep(creep)).not.toThrow();
    restore();
    expect(rec.harvest).toHaveLength(0);
  });
});

describe("miner", () => {
  it("refuses to run without a source assignment, loudly", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const { creep, rec, restore } = build({ role: "miner", sourceId: undefined });
    runCreep(creep);
    restore();
    expect(rec.harvest).toHaveLength(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("no source assignment"));
    logSpy.mockRestore();
  });

  it("walks to its container before mining", () => {
    const { creep, rec, restore } = build({
      role: "miner", sourceId: "src-1", minerOnContainer: false,
    });
    runCreep(creep);
    restore();
    expect(rec.moveTo).toHaveLength(1);
    expect(rec.harvest).toHaveLength(0);
  });

  it("mines once standing on the container", () => {
    const { creep, rec, restore } = build({
      role: "miner", sourceId: "src-1", minerOnContainer: true,
    });
    runCreep(creep);
    restore();
    expect(rec.harvest).toHaveLength(1);
  });

  it("mines the source directly when there is no container yet", () => {
    const { creep, rec, restore } = build({
      role: "miner", sourceId: "src-1", minerContainer: false,
    });
    runCreep(creep);
    restore();
    expect(rec.harvest).toHaveLength(1);
  });

  it("moves to the source when out of range and containerless", () => {
    const { creep, rec, restore } = build({
      role: "miner", sourceId: "src-1", minerContainer: false, actionResult: ERR_NOT_IN_RANGE,
    });
    runCreep(creep);
    restore();
    expect(rec.moveTo).toHaveLength(1);
  });

  it("does nothing when its source no longer exists", () => {
    const { creep, rec, restore } = build({ role: "miner", sourceId: "vanished", sourceIds: [] });
    expect(() => runCreep(creep)).not.toThrow();
    restore();
    expect(rec.harvest).toHaveLength(0);
  });

  it("never carries energy to a sink -- that is the hauler's job", () => {
    const { creep, rec, restore } = build({
      role: "miner", sourceId: "src-1", carried: 50, capacity: 50,
    });
    runCreep(creep);
    restore();
    expect(rec.transfer).toHaveLength(0);
  });
});

describe("hauler", () => {
  it("collects dropped energy while gathering", () => {
    const { creep, rec, restore } = build({
      role: "hauler", mode: "gathering", pickups: [["drop-1", "dropped", 200]],
    });
    runCreep(creep);
    restore();
    expect(rec.pickup).toHaveLength(1);
  });

  it("withdraws from a container rather than picking it up", () => {
    const { creep, rec, restore } = build({
      role: "hauler", mode: "gathering", pickups: [["cont-9", "container", 500]],
    });
    runCreep(creep);
    restore();
    expect(rec.withdraw).toHaveLength(1);
    expect(rec.pickup).toHaveLength(0);
  });

  it("moves to the pickup when out of range", () => {
    const { creep, rec, restore } = build({
      role: "hauler", mode: "gathering",
      pickups: [["drop-1", "dropped", 200]], actionResult: ERR_NOT_IN_RANGE,
    });
    runCreep(creep);
    restore();
    expect(rec.moveTo).toHaveLength(1);
  });

  it("delivers when loaded", () => {
    const { creep, rec, restore } = build({
      role: "hauler", mode: "delivering", carried: 100, capacity: 100,
    });
    runCreep(creep);
    restore();
    expect(rec.transfer).toHaveLength(1);
  });

  it("upgrades rather than idling when everything is full", () => {
    // A parked hauler is a body that cost energy and returns nothing.
    const { creep, rec, restore } = build({
      role: "hauler", mode: "delivering", carried: 100, capacity: 100, sinks: [],
    });
    runCreep(creep);
    restore();
    expect(rec.upgrade).toHaveLength(1);
  });

  it("moves to the controller when full, idle and out of range", () => {
    const { creep, rec, restore } = build({
      role: "hauler", mode: "delivering", carried: 100, capacity: 100,
      sinks: [], actionResult: ERR_NOT_IN_RANGE,
    });
    runCreep(creep);
    restore();
    expect(rec.moveTo).toHaveLength(1);
  });

  it("does nothing harmful with no controller and nowhere to deliver", () => {
    const { creep, restore } = build({
      role: "hauler", mode: "delivering", carried: 100, capacity: 100,
      sinks: [], hasController: false,
    });
    expect(() => runCreep(creep)).not.toThrow();
    restore();
  });

  it("stands idle when there is nothing anywhere to collect", () => {
    const { creep, rec, restore } = build({ role: "hauler", mode: "gathering", pickups: [] });
    expect(() => runCreep(creep)).not.toThrow();
    restore();
    expect(rec.pickup).toHaveLength(0);
    expect(rec.withdraw).toHaveLength(0);
  });
});

describe("builder", () => {
  it("builds a construction site when loaded", () => {
    const { creep, rec, restore } = build({
      role: "builder", mode: "delivering", carried: 50, constructionSite: "site-1",
    });
    runCreep(creep);
    restore();
    expect(rec.build).toHaveLength(1);
  });

  it("moves to the site when out of range", () => {
    const { creep, rec, restore } = build({
      role: "builder", mode: "delivering", carried: 50,
      constructionSite: "site-1", actionResult: ERR_NOT_IN_RANGE,
    });
    runCreep(creep);
    restore();
    expect(rec.moveTo).toHaveLength(1);
  });

  it("repairs when there is nothing to build", () => {
    const { creep, rec, restore } = build({
      role: "builder", mode: "delivering", carried: 50,
      damaged: [["road-1", "road", 100, 1000]],
    });
    runCreep(creep);
    restore();
    expect(rec.repair).toHaveLength(1);
  });

  it("moves to the repair target when out of range", () => {
    const { creep, rec, restore } = build({
      role: "builder", mode: "delivering", carried: 50,
      damaged: [["road-1", "road", 100, 1000]], actionResult: ERR_NOT_IN_RANGE,
    });
    runCreep(creep);
    restore();
    expect(rec.moveTo).toHaveLength(1);
  });

  it("falls back to upgrading with nothing to build or repair", () => {
    const { creep, rec, restore } = build({ role: "builder", mode: "delivering", carried: 50 });
    runCreep(creep);
    restore();
    expect(rec.upgrade).toHaveLength(1);
  });

  it("prefers stored energy over mining, so it does not fight miners for sources", () => {
    const { creep, rec, restore } = build({
      role: "builder", mode: "gathering", pickups: [["cont-9", "container", 500]],
    });
    runCreep(creep);
    restore();
    expect(rec.withdraw).toHaveLength(1);
    expect(rec.harvest).toHaveLength(0);
  });

  it("falls back to mining when there is no stored energy", () => {
    const { creep, rec, restore } = build({ role: "builder", mode: "gathering", pickups: [] });
    runCreep(creep);
    restore();
    expect(rec.harvest).toHaveLength(1);
  });
});

describe("upgrader", () => {
  it("gathers when empty", () => {
    const { creep, rec, restore } = build({ role: "upgrader", mode: "gathering" });
    runCreep(creep);
    restore();
    expect(rec.harvest).toHaveLength(1);
    expect(rec.upgrade).toHaveLength(0);
  });

  it("prefers stored energy when it exists", () => {
    const { creep, rec, restore } = build({
      role: "upgrader", mode: "gathering", pickups: [["cont-9", "container", 500]],
    });
    runCreep(creep);
    restore();
    expect(rec.withdraw).toHaveLength(1);
  });

  it("upgrades the controller when loaded", () => {
    const { creep, rec, restore } = build({
      role: "upgrader", mode: "delivering", carried: 50,
    });
    runCreep(creep);
    restore();
    expect(rec.upgrade).toHaveLength(1);
  });

  it("moves to the controller when out of range", () => {
    const { creep, rec, restore } = build({
      role: "upgrader", mode: "delivering", carried: 50, actionResult: ERR_NOT_IN_RANGE,
    });
    runCreep(creep);
    restore();
    expect(rec.moveTo).toHaveLength(1);
  });

  it("does nothing in a room with no controller", () => {
    const { creep, rec, restore } = build({
      role: "upgrader", mode: "delivering", carried: 50, hasController: false,
    });
    expect(() => runCreep(creep)).not.toThrow();
    restore();
    expect(rec.upgrade).toHaveLength(0);
  });
});

describe("upgrader stationed at the controller container", () => {
  it("withdraws from the controller container instead of commuting", () => {
    const { creep, rec, restore } = build({
      role: "upgrader",
      mode: "gathering",
      controllerContainer: true,
      pickups: [["far-cont", "container", 5000]],
    });
    runCreep(creep);
    restore();
    expect(rec.withdraw).toHaveLength(1);
    expect(rec.harvest).toHaveLength(0);
  });

  it("moves to the controller container when out of range", () => {
    const { creep, rec, restore } = build({
      role: "upgrader",
      mode: "gathering",
      controllerContainer: true,
      actionResult: ERR_NOT_IN_RANGE,
    });
    runCreep(creep);
    restore();
    expect(rec.moveTo).toHaveLength(1);
  });

  it("falls back to normal collection when the controller container is empty", () => {
    const { creep, rec, restore } = build({
      role: "upgrader",
      mode: "gathering",
      controllerContainer: true,
      controllerContainerEnergy: 0,
      pickups: [["far-cont", "container", 5000]],
    });
    runCreep(creep);
    restore();
    // Withdrew from the general pickup, not the empty controller container.
    expect(rec.withdraw).toHaveLength(1);
  });

  it("falls back to mining when there is no controller container at all", () => {
    const { creep, rec, restore } = build({
      role: "upgrader",
      mode: "gathering",
      controllerContainer: false,
    });
    runCreep(creep);
    restore();
    expect(rec.harvest).toHaveLength(1);
  });
});

describe("collect distinguishes pickup from withdraw", () => {
  it("picks up loose energy rather than trying to withdraw from the floor", () => {
    // pickup() and withdraw() are different API calls; using the wrong one on
    // dropped energy silently fails every tick.
    const { creep, rec, restore } = build({
      role: "hauler",
      mode: "gathering",
      pickups: [["floor", "dropped", 300]],
    });
    runCreep(creep);
    restore();
    expect(rec.pickup).toHaveLength(1);
    expect(rec.withdraw).toHaveLength(0);
  });

  it("withdraws from a tombstone rather than picking it up", () => {
    const { creep, rec, restore } = build({
      role: "hauler",
      mode: "gathering",
      pickups: [["grave", "tombstone", 300]],
    });
    runCreep(creep);
    restore();
    expect(rec.withdraw).toHaveLength(1);
    expect(rec.pickup).toHaveLength(0);
  });
});

import { runTower } from "../../src/runtime/towers";
import { installGame, installScreepsConstants } from "../helpers/mockGame";

installScreepsConstants();

interface TowerRec {
  attack: unknown[];
  repair: unknown[];
  heal: unknown[];
}

interface BuildOptions {
  readonly energy?: number;
  /** [id, healParts] per hostile. */
  readonly hostiles?: readonly [string, number][];
  /** [id, structureType, hits, hitsMax] per structure. */
  readonly structures?: readonly [string, string, number, number][];
}

function build(options: BuildOptions = {}): {
  tower: StructureTower;
  rec: TowerRec;
  restore: () => void;
} {
  const { energy = 1000, hostiles = [], structures = [] } = options;
  const rec: TowerRec = { attack: [], repair: [], heal: [] };
  const registry = new Map<string, unknown>();

  const hostileObjs = hostiles.map(([id, healParts]) => {
    const o = {
      id,
      name: id,
      hits: 1000,
      body: Array.from({ length: healParts }, () => ({ type: "heal" })),
    };
    registry.set(id, o);
    return o;
  });

  const structureObjs = structures.map(([id, structureType, hits, hitsMax]) => {
    const o = { id, structureType, hits, hitsMax };
    registry.set(id, o);
    return o;
  });

  const room = {
    name: "W1N1",
    find: (type: number) => {
      if (type === FIND_HOSTILE_CREEPS) return hostileObjs;
      if (type === FIND_STRUCTURES) return structureObjs;
      return [];
    },
  };

  const tower = {
    room,
    pos: { getRangeTo: () => 5 },
    store: { getUsedCapacity: () => energy },
    attack: (t: unknown) => rec.attack.push(t),
    repair: (t: unknown) => rec.repair.push(t),
    heal: (t: unknown) => rec.heal.push(t),
  } as unknown as StructureTower;

  const restore = installGame({
    getObjectById: ((id: string) => registry.get(id) ?? null) as Game["getObjectById"],
  });

  return { tower, rec, restore };
}

describe("runTower", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  it("does nothing in a quiet room with nothing damaged", () => {
    const { tower, rec, restore } = build();
    runTower(tower);
    restore();
    expect(rec).toEqual({ attack: [], repair: [], heal: [] });
  });

  it("fires on a hostile", () => {
    const { tower, rec, restore } = build({ hostiles: [["raider", 0]] });
    runTower(tower);
    restore();
    expect(rec.attack).toHaveLength(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("firing on"));
  });

  it("prefers a healer over another hostile", () => {
    const { tower, rec, restore } = build({ hostiles: [["tank", 0], ["medic", 3]] });
    runTower(tower);
    restore();
    expect((rec.attack[0] as { id: string }).id).toBe("medic");
  });

  it("repairs a damaged structure in peacetime", () => {
    const { tower, rec, restore } = build({ structures: [["road", "road", 100, 1000]] });
    runTower(tower);
    restore();
    expect(rec.repair).toHaveLength(1);
    expect(rec.attack).toHaveLength(0);
  });

  it("attacks rather than repairs when both are possible", () => {
    const { tower, rec, restore } = build({
      hostiles: [["raider", 0]],
      structures: [["road", "road", 100, 1000]],
    });
    runTower(tower);
    restore();
    expect(rec.attack).toHaveLength(1);
    expect(rec.repair).toHaveLength(0);
  });

  it("stops repairing when low, so it can still shoot", () => {
    const { tower, rec, restore } = build({
      energy: 100,
      structures: [["road", "road", 100, 1000]],
    });
    runTower(tower);
    restore();
    expect(rec.repair).toHaveLength(0);
  });

  it("still fires when low on energy", () => {
    const { tower, rec, restore } = build({ energy: 20, hostiles: [["raider", 0]] });
    runTower(tower);
    restore();
    expect(rec.attack).toHaveLength(1);
  });

  it("does not act on a target that vanished between decision and execution", () => {
    const { tower, rec, restore } = build({ hostiles: [["ghost", 0]] });
    const previous = (globalThis as Record<string, unknown>)["Game"] as Game;
    (globalThis as Record<string, unknown>)["Game"] = {
      ...previous,
      getObjectById: () => null,
    };
    expect(() => runTower(tower)).not.toThrow();
    restore();
    expect(rec.attack).toHaveLength(0);
  });

  it("ignores a structure that vanished before the repair landed", () => {
    const { tower, rec, restore } = build({ structures: [["road", "road", 100, 1000]] });
    const previous = (globalThis as Record<string, unknown>)["Game"] as Game;
    (globalThis as Record<string, unknown>)["Game"] = {
      ...previous,
      getObjectById: () => null,
    };
    expect(() => runTower(tower)).not.toThrow();
    restore();
    expect(rec.repair).toHaveLength(0);
  });
});

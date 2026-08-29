/**
 * Evacuation: economic creeps abandon their work and retreat under tower cover
 * when the room is taking real damage. Defenders do the opposite.
 */

import { runCreep } from "../../src/runtime/creeps";
import { clearThreatCache } from "../../src/runtime/threat";
import { installGame, installScreepsConstants } from "../helpers/mockGame";

installScreepsConstants();

interface Spec {
  readonly role: string;
  /** ATTACK parts on the single hostile; 0 means an unarmed passer-by. */
  readonly hostileAttack?: number;
  readonly rangeToRefuge?: number;
  readonly hasSpawn?: boolean;
}

function build(spec: Spec): {
  creep: Creep;
  rec: { moveTo: unknown[]; harvest: unknown[]; say: string[]; attack: unknown[] };
  restore: () => void;
} {
  const { role, hostileAttack = 0, rangeToRefuge = 20, hasSpawn = true } = spec;
  const rec = { moveTo: [] as unknown[], harvest: [] as unknown[], say: [] as string[], attack: [] as unknown[] };

  const hostile = {
    id: "raider",
    name: "raider",
    hits: 1000,
    owner: { username: "SomePlayer" },
    body: [
      ...Array.from({ length: hostileAttack }, () => ({ type: ATTACK })),
      { type: MOVE },
    ],
    pos: { x: 25, y: 25, getRangeTo: () => 5 },
  };

  const source = {
    id: "src",
    energy: 3000,
    pos: { x: 10, y: 10, findInRange: () => [] },
    room: { getTerrain: () => ({ get: () => 0 }) },
  };

  const room = {
    name: "W1N1",
    controller: { id: "ctrl", pos: { x: 40, y: 40 } },
    find: (type: number, opts?: { filter?: (s: unknown) => boolean }) => {
      let out: readonly unknown[] = [];
      if (type === FIND_HOSTILE_CREEPS) out = [hostile];
      else if (type === FIND_SOURCES) out = [source];
      else if (type === FIND_MY_SPAWNS) {
        out = hasSpawn ? [{ pos: { x: 20, y: 20, getRangeTo: () => rangeToRefuge } }] : [];
      }
      return opts?.filter ? out.filter(opts.filter) : out;
    },
  };

  const creep = {
    name: `${role}-1`,
    spawning: false,
    memory: { role, home: "W1N1", mode: "gathering" },
    store: { getUsedCapacity: () => 0, getCapacity: () => 50 },
    pos: { x: 5, y: 5, getRangeTo: () => rangeToRefuge, isEqualTo: () => false },
    room,
    say: (m: string) => rec.say.push(m),
    harvest: (t: unknown) => {
      rec.harvest.push(t);
      return 0;
    },
    moveTo: (t: unknown) => {
      rec.moveTo.push(t);
      return 0;
    },
    attack: (t: unknown) => {
      rec.attack.push(t);
      return 0;
    },
    transfer: () => 0,
    upgradeController: () => 0,
    pickup: () => 0,
    withdraw: () => 0,
    build: () => 0,
    repair: () => 0,
  } as unknown as Creep;

  const registry = new Map<string, unknown>([
    ["raider", hostile],
    ["src", source],
  ]);
  const restore = installGame({
    time: 500,
    getObjectById: ((id: string) => registry.get(id) ?? null) as Game["getObjectById"],
  });

  clearThreatCache();
  return { creep, rec, restore };
}

describe("evacuation under fire", () => {
  it("keeps a harvester working past an unarmed hostile", () => {
    // A fleeing colony produces nothing. A scout is not worth stopping for.
    const { creep, rec, restore } = build({ role: "harvester", hostileAttack: 0 });
    runCreep(creep);
    restore();
    expect(rec.harvest).toHaveLength(1);
  });

  it("pulls a harvester off the source under real damage", () => {
    const { creep, rec, restore } = build({ role: "harvester", hostileAttack: 5 });
    runCreep(creep);
    restore();
    expect(rec.harvest).toHaveLength(0);
    expect(rec.moveTo).toHaveLength(1);
  });

  it("announces the retreat, so it is visible in the client", () => {
    const { creep, rec, restore } = build({ role: "harvester", hostileAttack: 5 });
    runCreep(creep);
    restore();
    expect(rec.say).toContain("!");
  });

  it("does not move a creep already under tower cover", () => {
    const { creep, rec, restore } = build({
      role: "harvester",
      hostileAttack: 5,
      rangeToRefuge: 1,
    });
    runCreep(creep);
    restore();
    expect(rec.moveTo).toHaveLength(0);
  });

  it("evacuates miners, haulers, builders and upgraders alike", () => {
    for (const role of ["miner", "hauler", "builder", "upgrader"]) {
      const { creep, rec, restore } = build({ role, hostileAttack: 5 });
      runCreep(creep);
      restore();
      expect(rec.moveTo).toHaveLength(1);
    }
  });

  it("does not evacuate a defender -- that is the one role that advances", () => {
    const { creep, rec, restore } = build({ role: "defender", hostileAttack: 5 });
    runCreep(creep);
    restore();
    expect(rec.attack.length + rec.moveTo.length).toBeGreaterThan(0);
    expect(rec.say).not.toContain("!");
  });

  it("does not throw when there is nowhere left to retreat to", () => {
    const { creep, rec, restore } = build({
      role: "harvester",
      hostileAttack: 5,
      hasSpawn: true,
    });
    // Strip both refuge options.
    (creep.room as unknown as { controller: undefined }).controller = undefined;
    (creep.room as unknown as { find: unknown }).find = (type: number) =>
      type === FIND_HOSTILE_CREEPS
        ? [
            {
              id: "raider",
              hits: 1000,
              owner: { username: "SomePlayer" },
              body: Array.from({ length: 5 }, () => ({ type: ATTACK })),
            },
          ]
        : [];
    clearThreatCache();

    expect(() => runCreep(creep)).not.toThrow();
    restore();
    expect(rec.moveTo).toHaveLength(0);
  });
});

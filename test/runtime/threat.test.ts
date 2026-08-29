import {
  assessRoom,
  considerSafeMode,
  countTowers,
  defendersNeeded,
  clearThreatCache,
  evacuationPoint,
  projectThreats,
  roomThreat,
} from "../../src/runtime/threat";
import { PURSUIT_LIMIT, runDefender } from "../../src/runtime/defenders";
import { installGame, installScreepsConstants } from "../helpers/mockGame";

installScreepsConstants();

interface HostileSpec {
  readonly id: string;
  readonly attack?: number;
  readonly ranged?: number;
  readonly heal?: number;
  readonly owner?: string;
}

function bodyOf(spec: HostileSpec): { type: string }[] {
  return [
    ...Array.from({ length: spec.attack ?? 0 }, () => ({ type: ATTACK })),
    ...Array.from({ length: spec.ranged ?? 0 }, () => ({ type: RANGED_ATTACK })),
    ...Array.from({ length: spec.heal ?? 0 }, () => ({ type: HEAL })),
    { type: MOVE },
  ];
}

interface RoomSpec {
  readonly hostiles?: readonly HostileSpec[];
  readonly towers?: number;
  readonly spawnIntegrity?: number;
  readonly safeModeAvailable?: number;
  readonly safeModeCooldown?: number;
  readonly safeModeActive?: number;
  readonly controllerMine?: boolean;
  readonly hasSpawn?: boolean;
  readonly activateResult?: number;
}

function makeRoom(spec: RoomSpec = {}): Room {
  const {
    hostiles = [],
    towers = 0,
    spawnIntegrity = 1,
    safeModeAvailable = 3,
    safeModeCooldown = 0,
    safeModeActive = 0,
    controllerMine = true,
    hasSpawn = true,
    activateResult = 0,
  } = spec;

  const hostileObjs = hostiles.map((h) => ({
    id: h.id,
    name: h.id,
    hits: 1000,
    body: bodyOf(h),
    owner: { username: h.owner ?? "Invader" },
    pos: { x: 25, y: 25 },
  }));

  const towerObjs = Array.from({ length: towers }, (_, i) => ({
    id: `tower-${i}`,
    structureType: STRUCTURE_TOWER,
  }));

  const spawns = hasSpawn
    ? [{ id: "s1", hits: 5000 * spawnIntegrity, hitsMax: 5000, pos: { x: 20, y: 20 } }]
    : [];

  return {
    name: "W1N1",
    controller: controllerMine
      ? {
          my: true,
          pos: { x: 30, y: 30 },
          safeModeAvailable,
          safeModeCooldown,
          safeMode: safeModeActive,
          activateSafeMode: () => activateResult,
        }
      : { my: false },
    find: (type: number, opts?: { filter?: (s: unknown) => boolean }) => {
      let out: readonly unknown[] = [];
      if (type === FIND_HOSTILE_CREEPS) out = hostileObjs;
      else if (type === FIND_MY_STRUCTURES) out = towerObjs;
      else if (type === FIND_MY_SPAWNS) out = spawns;
      return opts?.filter ? out.filter(opts.filter) : out;
    },
  } as unknown as Room;
}

describe("projectThreats", () => {
  it("counts body parts per hostile", () => {
    const room = makeRoom({ hostiles: [{ id: "r", attack: 3, heal: 2 }] });
    expect(projectThreats(room)[0]).toMatchObject({ id: "r", attackParts: 3, healParts: 2 });
  });

  it("records the owner so NPCs can be told from players", () => {
    const room = makeRoom({ hostiles: [{ id: "p", owner: "SomePlayer" }] });
    expect(projectThreats(room)[0]?.owner).toBe("SomePlayer");
  });

  it("is empty in a quiet room", () => {
    expect(projectThreats(makeRoom())).toEqual([]);
  });
});

describe("assessRoom and defendersNeeded", () => {
  it("reports none in a quiet room and wants no defenders", () => {
    const room = makeRoom();
    const assessment = assessRoom(room);
    expect(assessment.level).toBe("none");
    expect(defendersNeeded(room, assessment)).toBe(0);
  });

  it("wants a defender for an armed raid with tower support", () => {
    const room = makeRoom({ hostiles: [{ id: "r", attack: 3 }], towers: 1 });
    expect(defendersNeeded(room, assessRoom(room))).toBe(1);
  });

  it("wants more defenders when there are no towers", () => {
    const room = makeRoom({ hostiles: [{ id: "r", attack: 3 }], towers: 0 });
    expect(defendersNeeded(room, assessRoom(room))).toBe(2);
  });
});

describe("countTowers", () => {
  it("counts towers", () => {
    expect(countTowers(makeRoom({ towers: 3 }))).toBe(3);
  });

  it("is zero before RCL 3", () => {
    expect(countTowers(makeRoom())).toBe(0);
  });
});

describe("considerSafeMode", () => {
  let logSpy: jest.SpyInstance;
  let restore: () => void;

  beforeEach(() => {
    restore = installGame({ time: 5000 });
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    restore();
    logSpy.mockRestore();
  });

  it("activates for a player siege that is eating the spawn", () => {
    const room = makeRoom({
      hostiles: [{ id: "p", attack: 10, owner: "SomePlayer" }],
      spawnIntegrity: 0.2,
    });
    expect(considerSafeMode(room, assessRoom(room))).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("SAFE MODE"));
  });

  it("does not activate for NPC invaders", () => {
    // They leave on their own; an activation spent here is one unavailable
    // when a real player arrives.
    const room = makeRoom({ hostiles: [{ id: "npc", attack: 10 }], spawnIntegrity: 0.2 });
    expect(considerSafeMode(room, assessRoom(room))).toBe(false);
  });

  it("does not activate while the spawn is healthy", () => {
    const room = makeRoom({
      hostiles: [{ id: "p", attack: 10, owner: "SomePlayer" }],
      spawnIntegrity: 1,
    });
    expect(considerSafeMode(room, assessRoom(room))).toBe(false);
  });

  it("does nothing in a room we do not own", () => {
    const room = makeRoom({ controllerMine: false, hostiles: [{ id: "p", attack: 10 }] });
    expect(considerSafeMode(room, assessRoom(room))).toBe(false);
  });

  it("treats a room with no spawn as fully compromised", () => {
    const room = makeRoom({
      hostiles: [{ id: "p", attack: 10, owner: "SomePlayer" }],
      hasSpawn: false,
    });
    expect(considerSafeMode(room, assessRoom(room))).toBe(true);
  });

  it("reports a failed activation rather than claiming success", () => {
    const room = makeRoom({
      hostiles: [{ id: "p", attack: 10, owner: "SomePlayer" }],
      spawnIntegrity: 0.2,
      activateResult: -4,
    });
    expect(considerSafeMode(room, assessRoom(room))).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("failed"));
  });

  it("does not activate with no activations left", () => {
    const room = makeRoom({
      hostiles: [{ id: "p", attack: 10, owner: "SomePlayer" }],
      spawnIntegrity: 0.2,
      safeModeAvailable: 0,
    });
    expect(considerSafeMode(room, assessRoom(room))).toBe(false);
  });
});

describe("evacuationPoint", () => {
  it("is the spawn when there is one", () => {
    expect(evacuationPoint(makeRoom())).toEqual({ x: 20, y: 20 });
  });

  it("falls back to the controller with no spawn", () => {
    expect(evacuationPoint(makeRoom({ hasSpawn: false }))).toEqual({ x: 30, y: 30 });
  });
});

describe("runDefender", () => {
  interface DefSpec {
    readonly hostiles?: readonly { id: string; heal?: number }[];
    readonly hostileRangeFromRally?: number;
    readonly rangeToRally?: number;
    readonly attackResult?: number;
    readonly resolveTargets?: boolean;
  }

  function defender(spec: DefSpec = {}): {
    creep: Creep;
    rec: { attack: unknown[]; moveTo: unknown[] };
    restore: () => void;
  } {
    const {
      hostiles = [],
      hostileRangeFromRally = 2,
      rangeToRally = 1,
      attackResult = 0,
      resolveTargets = true,
    } = spec;

    const rec = { attack: [] as unknown[], moveTo: [] as unknown[] };
    const registry = new Map<string, unknown>();

    const hostileObjs = hostiles.map((h) => {
      const o = {
        id: h.id,
        name: h.id,
        hits: 1000,
        body: Array.from({ length: h.heal ?? 0 }, () => ({ type: HEAL })),
        pos: { x: 25, y: 25 },
      };
      registry.set(h.id, o);
      return o;
    });

    const creep = {
      name: "def-1",
      spawning: false,
      pos: { getRangeTo: () => rangeToRally },
      room: {
        name: "W1N1",
        controller: undefined,
        find: (type: number) => {
          if (type === FIND_HOSTILE_CREEPS) return hostileObjs;
          if (type === FIND_MY_SPAWNS) {
            return [{ pos: { getRangeTo: () => hostileRangeFromRally } }];
          }
          return [];
        },
      },
      attack: (t: unknown) => {
        rec.attack.push(t);
        return attackResult;
      },
      moveTo: (t: unknown) => {
        rec.moveTo.push(t);
        return 0;
      },
    } as unknown as Creep;

    const restore = installGame({
      getObjectById: ((id: string) =>
        resolveTargets ? (registry.get(id) ?? null) : null) as Game["getObjectById"],
    });

    return { creep, rec, restore };
  }

  it("rallies near the spawn when there is nothing to fight", () => {
    const { creep, rec, restore } = defender({ rangeToRally: 10 });
    runDefender(creep);
    restore();
    expect(rec.moveTo).toHaveLength(1);
    expect(rec.attack).toHaveLength(0);
  });

  it("holds position when already at the rally point", () => {
    const { creep, rec, restore } = defender({ rangeToRally: 1 });
    runDefender(creep);
    restore();
    expect(rec.moveTo).toHaveLength(0);
  });

  it("attacks a hostile in range", () => {
    const { creep, rec, restore } = defender({ hostiles: [{ id: "r" }] });
    runDefender(creep);
    restore();
    expect(rec.attack).toHaveLength(1);
  });

  it("closes on a hostile that is out of range", () => {
    const { creep, rec, restore } = defender({
      hostiles: [{ id: "r" }],
      attackResult: ERR_NOT_IN_RANGE,
    });
    runDefender(creep);
    restore();
    expect(rec.moveTo).toHaveLength(1);
  });

  it("refuses to be drawn beyond the pursuit limit", () => {
    // Chasing a faster attacker out of tower cover is how a defender dies
    // alone. Bait works precisely because most bots will follow.
    const { creep, rec, restore } = defender({
      hostiles: [{ id: "bait" }],
      hostileRangeFromRally: PURSUIT_LIMIT + 5,
      rangeToRally: 10,
    });
    runDefender(creep);
    restore();
    expect(rec.attack).toHaveLength(0);
    expect(rec.moveTo).toHaveLength(1);
  });

  it("returns to the rally point when the bait is out of reach and it has drifted", () => {
    const { creep, rec, restore } = defender({
      hostiles: [{ id: "bait" }],
      hostileRangeFromRally: PURSUIT_LIMIT + 5,
      rangeToRally: 1,
    });
    runDefender(creep);
    restore();
    expect(rec.moveTo).toHaveLength(0);
  });

  it("does not act on a hostile that died this tick", () => {
    const { creep, rec, restore } = defender({
      hostiles: [{ id: "ghost" }],
      resolveTargets: false,
    });
    expect(() => runDefender(creep)).not.toThrow();
    restore();
    expect(rec.attack).toHaveLength(0);
  });
});

describe("threat runtime edge cases", () => {
  it("labels a hostile with no owner rather than throwing", () => {
    const room = {
      name: "W1N1",
      find: (type: number) =>
        type === FIND_HOSTILE_CREEPS
          ? [{ id: "anon", hits: 100, body: [{ type: MOVE }], owner: undefined }]
          : [],
    } as unknown as Room;
    expect(projectThreats(room)[0]?.owner).toBe("unknown");
  });

  it("treats a spawn with no maximum as intact rather than dividing by zero", () => {
    const restore = installGame({ time: 100 });
    const room = {
      name: "W1N1",
      controller: {
        my: true,
        safeModeAvailable: 3,
        safeModeCooldown: 0,
        safeMode: 0,
        activateSafeMode: () => 0,
      },
      find: (type: number, opts?: { filter?: (s: unknown) => boolean }) => {
        let out: readonly unknown[] = [];
        if (type === FIND_HOSTILE_CREEPS) {
          out = [
            {
              id: "p",
              hits: 100,
              body: [{ type: ATTACK }, { type: ATTACK }, { type: ATTACK }],
              owner: { username: "SomePlayer" },
            },
          ];
        } else if (type === FIND_MY_SPAWNS) {
          out = [{ id: "s", hits: 100, hitsMax: 0 }];
        }
        return opts?.filter ? out.filter(opts.filter) : out;
      },
    } as unknown as Room;

    // Integrity resolves to 1, so no activation despite a player attack.
    expect(considerSafeMode(room, assessRoom(room))).toBe(false);
    restore();
  });

  it("defaults missing safe-mode fields to zero rather than undefined", () => {
    const restore = installGame({ time: 100 });
    const room = {
      name: "W1N1",
      controller: { my: true, activateSafeMode: () => 0 },
      find: (type: number, opts?: { filter?: (s: unknown) => boolean }) => {
        let out: readonly unknown[] = [];
        if (type === FIND_HOSTILE_CREEPS) {
          out = [
            {
              id: "p",
              hits: 100,
              body: [{ type: ATTACK }, { type: ATTACK }, { type: ATTACK }],
              owner: { username: "SomePlayer" },
            },
          ];
        } else if (type === FIND_MY_SPAWNS) {
          out = [{ id: "s", hits: 10, hitsMax: 5000 }];
        }
        return opts?.filter ? out.filter(opts.filter) : out;
      },
    } as unknown as Room;

    // safeModeAvailable is undefined, which must read as zero: no activation.
    expect(considerSafeMode(room, assessRoom(room))).toBe(false);
    restore();
  });
});

describe("roomThreat caching", () => {
  it("reuses the assessment within a tick", () => {
    clearThreatCache();
    let scans = 0;
    const room = {
      name: "W1N1",
      find: (type: number) => {
        if (type === FIND_HOSTILE_CREEPS) {
          scans += 1;
          return [];
        }
        return [];
      },
    } as unknown as Room;

    const restore = installGame({ time: 100 });
    roomThreat(room);
    roomThreat(room);
    roomThreat(room);
    restore();

    // Every economic creep asks; the room must only be scanned once.
    expect(scans).toBe(1);
  });

  it("re-scans on a new tick", () => {
    clearThreatCache();
    let scans = 0;
    const room = {
      name: "W2N2",
      find: (type: number) => {
        if (type === FIND_HOSTILE_CREEPS) {
          scans += 1;
          return [];
        }
        return [];
      },
    } as unknown as Room;

    let restore = installGame({ time: 100 });
    roomThreat(room);
    restore();
    restore = installGame({ time: 101 });
    roomThreat(room);
    restore();

    expect(scans).toBe(2);
  });

  it("caches per room, not globally", () => {
    clearThreatCache();
    const restore = installGame({ time: 200 });
    const quiet = { name: "A", find: () => [] } as unknown as Room;
    const raided = {
      name: "B",
      find: (type: number) =>
        type === FIND_HOSTILE_CREEPS
          ? [
              {
                id: "r",
                hits: 100,
                body: [{ type: ATTACK }, { type: ATTACK }, { type: ATTACK }, { type: ATTACK }],
                owner: { username: "SomePlayer" },
              },
            ]
          : [],
    } as unknown as Room;

    expect(roomThreat(quiet).level).toBe("none");
    expect(roomThreat(raided).level).toBe("raid");
    restore();
  });
});

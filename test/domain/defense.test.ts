import {
  RAMPART_TARGET_HITS,
  REPAIR_THRESHOLD,
  TOWER_ENERGY_RESERVE,
  decideTowerAction,
  needsRepair,
  rankRepairs,
  selectHostile,
  selectWounded,
} from "../../src/domain/defense";
import type { DamagedView, HostileView } from "../../src/domain/defense";

const hostile = (over: Partial<HostileView> & { id: string }): HostileView => ({
  range: 10,
  healParts: 0,
  hits: 1000,
  ...over,
});

const damaged = (over: Partial<DamagedView> & { id: string }): DamagedView => ({
  structureType: "road",
  hits: 100,
  hitsMax: 1000,
  ...over,
});

describe("needsRepair", () => {
  it("wants a structure below the threshold", () => {
    expect(needsRepair(damaged({ id: "a", hits: 500, hitsMax: 1000 }))).toBe(true);
  });

  it("leaves a healthy structure alone", () => {
    expect(needsRepair(damaged({ id: "a", hits: 900, hitsMax: 1000 }))).toBe(false);
  });

  it("uses a flat target for ramparts, not a percentage", () => {
    // A rampart at 1% of a 30M ceiling is fine if it clears the flat target.
    expect(
      needsRepair(damaged({ id: "r", structureType: "rampart", hits: 30_000, hitsMax: 30_000_000 })),
    ).toBe(false);
    expect(
      needsRepair(damaged({ id: "r", structureType: "rampart", hits: 500, hitsMax: 30_000_000 })),
    ).toBe(true);
  });

  it("applies the same flat target to walls", () => {
    expect(
      needsRepair(
        damaged({ id: "w", structureType: "constructedWall", hits: RAMPART_TARGET_HITS + 1, hitsMax: 1e9 }),
      ),
    ).toBe(false);
  });

  it("ignores a structure with no maximum rather than dividing by zero", () => {
    expect(needsRepair(damaged({ id: "a", hits: 0, hitsMax: 0 }))).toBe(false);
  });

  it("sits exactly on the threshold without wanting repair", () => {
    const hits = 1000 * REPAIR_THRESHOLD;
    expect(needsRepair(damaged({ id: "a", hits, hitsMax: 1000 }))).toBe(false);
  });
});

describe("rankRepairs", () => {
  it("drops healthy structures", () => {
    expect(rankRepairs([damaged({ id: "ok", hits: 999, hitsMax: 1000 })])).toEqual([]);
  });

  it("puts the most damaged first", () => {
    const ranked = rankRepairs([
      damaged({ id: "half", hits: 500, hitsMax: 1000 }),
      damaged({ id: "dying", hits: 10, hitsMax: 1000 }),
    ]);
    expect(ranked.map((s) => s.id)).toEqual(["dying", "half"]);
  });

  it("ranks real structures above barriers regardless of ratio", () => {
    // A spawn at 70% matters more than a rampart at 1%.
    const ranked = rankRepairs([
      damaged({ id: "rampart", structureType: "rampart", hits: 100, hitsMax: 1e9 }),
      damaged({ id: "spawn", structureType: "spawn", hits: 700, hitsMax: 1000 }),
    ]);
    expect(ranked[0]?.id).toBe("spawn");
  });

  it("breaks ties deterministically on id", () => {
    const input = [
      damaged({ id: "b", hits: 100, hitsMax: 1000 }),
      damaged({ id: "a", hits: 100, hitsMax: 1000 }),
    ];
    expect(rankRepairs(input).map((s) => s.id)).toEqual(["a", "b"]);
    expect(rankRepairs([...input].reverse()).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("does not mutate its argument", () => {
    const input = [
      damaged({ id: "b", hits: 100, hitsMax: 1000 }),
      damaged({ id: "a", hits: 50, hitsMax: 1000 }),
    ];
    rankRepairs(input);
    expect(input.map((s) => s.id)).toEqual(["b", "a"]);
  });
});

describe("selectHostile", () => {
  it("returns undefined with no hostiles", () => {
    expect(selectHostile([])).toBeUndefined();
  });

  it("shoots the closest when none can heal", () => {
    expect(
      selectHostile([hostile({ id: "far", range: 20 }), hostile({ id: "near", range: 3 })])?.id,
    ).toBe("near");
  });

  it("prioritises a healer over a closer non-healer", () => {
    // Shooting the tank while a healer undoes the damage wastes the siege.
    expect(
      selectHostile([
        hostile({ id: "tank", range: 1 }),
        hostile({ id: "healer", range: 20, healParts: 5 }),
      ])?.id,
    ).toBe("healer");
  });

  it("picks the closest healer when there are several", () => {
    expect(
      selectHostile([
        hostile({ id: "h-far", range: 20, healParts: 1 }),
        hostile({ id: "h-near", range: 5, healParts: 1 }),
      ])?.id,
    ).toBe("h-near");
  });

  it("breaks ties deterministically on id", () => {
    const input = [hostile({ id: "b", range: 5 }), hostile({ id: "a", range: 5 })];
    expect(selectHostile(input)?.id).toBe("a");
    expect(selectHostile([...input].reverse())?.id).toBe("a");
  });
});

describe("decideTowerAction", () => {
  it("idles with nothing to do", () => {
    expect(decideTowerAction(1000, [], [])).toEqual({ kind: "idle" });
  });

  it("attacks when hostiles are present", () => {
    expect(decideTowerAction(1000, [hostile({ id: "x" })], [])).toEqual({
      kind: "attack",
      targetId: "x",
    });
  });

  it("attacks even when low on energy", () => {
    // Firing is always worth it; repairing is the luxury.
    expect(decideTowerAction(10, [hostile({ id: "x" })], [])).toEqual({
      kind: "attack",
      targetId: "x",
    });
  });

  it("prefers attacking over repairing", () => {
    const action = decideTowerAction(1000, [hostile({ id: "x" })], [damaged({ id: "d" })]);
    expect(action.kind).toBe("attack");
  });

  it("repairs in peacetime", () => {
    expect(decideTowerAction(1000, [], [damaged({ id: "d" })])).toEqual({
      kind: "repair",
      targetId: "d",
    });
  });

  it("stops repairing below the energy reserve, so it can still shoot", () => {
    expect(decideTowerAction(TOWER_ENERGY_RESERVE - 1, [], [damaged({ id: "d" })])).toEqual({
      kind: "idle",
    });
  });

  it("repairs at exactly the reserve", () => {
    expect(decideTowerAction(TOWER_ENERGY_RESERVE, [], [damaged({ id: "d" })]).kind).toBe("repair");
  });

  it("idles when the only damaged structures are healthy enough", () => {
    expect(decideTowerAction(1000, [], [damaged({ id: "d", hits: 999, hitsMax: 1000 })])).toEqual({
      kind: "idle",
    });
  });
});

describe("selectWounded", () => {
  const hurt = (id: string, hits: number, hitsMax = 100): { id: string; hits: number; hitsMax: number } => ({
    id,
    hits,
    hitsMax,
  });

  it("returns undefined when nobody is hurt", () => {
    expect(selectWounded([])).toBeUndefined();
    expect(selectWounded([hurt("full", 100)])).toBeUndefined();
  });

  it("picks the most badly hurt", () => {
    expect(selectWounded([hurt("scratched", 90), hurt("dying", 10)])?.id).toBe("dying");
  });

  it("compares by fraction, not absolute hits", () => {
    // A 10/100 creep is worse off than a 500/5000 one at the same ratio, but a
    // 50/5000 creep is worse than both.
    expect(selectWounded([hurt("small", 50, 100), hurt("big", 100, 5000)])?.id).toBe("big");
  });

  it("ignores a creep with no maximum rather than dividing by zero", () => {
    expect(selectWounded([hurt("weird", 0, 0)])).toBeUndefined();
  });

  it("breaks ties deterministically on id", () => {
    const input = [hurt("b", 50), hurt("a", 50)];
    expect(selectWounded(input)?.id).toBe("a");
    expect(selectWounded([...input].reverse())?.id).toBe("a");
  });
});

describe("decideTowerAction — healing", () => {
  it("heals a wounded friendly creep in peacetime", () => {
    expect(decideTowerAction(1000, [], [], [{ id: "c1", hits: 50, hitsMax: 100 }])).toEqual({
      kind: "heal",
      targetId: "c1",
    });
  });

  it("prefers healing a creep over repairing a structure", () => {
    // A wounded creep is a body we already paid for; losing it costs more.
    const action = decideTowerAction(
      1000,
      [],
      [{ id: "road", structureType: "road", hits: 10, hitsMax: 1000 }],
      [{ id: "c1", hits: 90, hitsMax: 100 }],
    );
    expect(action).toEqual({ kind: "heal", targetId: "c1" });
  });

  it("still attacks rather than heals when hostiles are present", () => {
    const action = decideTowerAction(
      1000,
      [{ id: "raider", range: 5, healParts: 0, hits: 1000 }],
      [],
      [{ id: "c1", hits: 10, hitsMax: 100 }],
    );
    expect(action.kind).toBe("attack");
  });

  it("does not heal below the energy reserve", () => {
    expect(
      decideTowerAction(TOWER_ENERGY_RESERVE - 1, [], [], [{ id: "c1", hits: 10, hitsMax: 100 }]),
    ).toEqual({ kind: "idle" });
  });
});

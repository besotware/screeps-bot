import { bodyCost } from "../../src/domain/body";
import {
  ROLES,
  ROLE_SPECS,
  desiredCensus,
  emptyCensus,
  isRole,
  nextRoleToSpawn,
  planBody,
  tallyCensus,
} from "../../src/domain/roles";
import type { Census } from "../../src/domain/roles";

describe("isRole", () => {
  it.each(ROLES)("accepts the known role %s", (role) => {
    expect(isRole(role)).toBe(true);
  });

  it.each([["builder"], [""], [null], [undefined], [7], [{}]])("rejects %p", (value) => {
    expect(isRole(value)).toBe(false);
  });
});

describe("tallyCensus", () => {
  it("returns zeroes for no creeps", () => {
    expect(tallyCensus([])).toEqual(emptyCensus());
  });

  it("counts each role", () => {
    expect(tallyCensus(["harvester", "harvester", "upgrader"])).toEqual({
      harvester: 2,
      upgrader: 1,
    });
  });

  it("ignores unknown and missing roles rather than throwing", () => {
    expect(tallyCensus(["harvester", "builder", undefined])).toEqual({
      harvester: 1,
      upgrader: 0,
    });
  });
});

describe("desiredCensus", () => {
  it("wants two harvesters per source", () => {
    expect(desiredCensus(1, 2).harvester).toBe(4);
  });

  it("keeps a floor of two harvesters in a one-source room", () => {
    expect(desiredCensus(1, 1).harvester).toBe(2);
  });

  it("wants no harvesters in a room with no sources", () => {
    expect(desiredCensus(1, 0).harvester).toBe(0);
  });

  it("caps harvesters so a rich room does not spawn endlessly", () => {
    expect(desiredCensus(8, 99).harvester).toBe(6);
  });

  it("treats a negative source count as zero", () => {
    expect(desiredCensus(1, -3).harvester).toBe(0);
  });

  it("holds upgraders at one until RCL 2", () => {
    expect(desiredCensus(1, 2).upgrader).toBe(1);
    expect(desiredCensus(2, 2).upgrader).toBe(3);
  });
});

describe("nextRoleToSpawn", () => {
  const at = (harvester: number, upgrader: number): Census => ({ harvester, upgrader });

  it("returns undefined when the room is at strength", () => {
    expect(nextRoleToSpawn(at(2, 1), at(2, 1))).toBeUndefined();
  });

  it("returns undefined when the room is over strength", () => {
    expect(nextRoleToSpawn(at(5, 5), at(2, 1))).toBeUndefined();
  });

  it("fills the only shortfall", () => {
    expect(nextRoleToSpawn(at(2, 0), at(2, 1))).toBe("upgrader");
  });

  it("fills the larger deficit first", () => {
    // Short 1 harvester, short 3 upgraders.
    expect(nextRoleToSpawn(at(1, 0), at(2, 3))).toBe("upgrader");
  });

  it("breaks an equal deficit on priority, favouring the harvester", () => {
    expect(nextRoleToSpawn(at(0, 0), at(1, 1))).toBe("harvester");
    expect(ROLE_SPECS.harvester.priority).toBeLessThan(ROLE_SPECS.upgrader.priority);
  });

  it("rebuilds the economy first when the room is wiped out", () => {
    expect(nextRoleToSpawn(emptyCensus(), desiredCensus(2, 2))).toBe("harvester");
  });
});

describe("planBody", () => {
  it("returns nothing when nothing is affordable", () => {
    expect(planBody("harvester", 100, 300)).toEqual([]);
  });

  it("builds the minimum viable harvester at 200 energy", () => {
    expect(planBody("harvester", 200, 300)).toEqual(["work", "carry", "move"]);
  });

  it("scales with available energy", () => {
    expect(planBody("harvester", 600, 600).length).toBeGreaterThan(
      planBody("harvester", 200, 600).length,
    );
  });

  it("never spends more than is available", () => {
    for (const energy of [0, 150, 200, 550, 1200, 3000]) {
      expect(bodyCost(planBody("upgrader", energy, 3000))).toBeLessThanOrEqual(energy);
    }
  });

  it("clamps spending to room capacity, not just what is banked", () => {
    // Capacity is the smaller of the two, so it is the binding constraint.
    expect(planBody("harvester", 5000, 200)).toEqual(["work", "carry", "move"]);
  });

  it("honours the per-role repeat cap", () => {
    const body = planBody("upgrader", 100_000, 100_000);
    expect(body).toHaveLength(ROLE_SPECS.upgrader.pattern.length * ROLE_SPECS.upgrader.maxRepeats);
  });

  it.each(ROLES)("produces a spawnable body for %s at high energy", (role) => {
    const body = planBody(role, 10_000, 10_000);
    expect(body.length).toBeGreaterThan(0);
    expect(body.length).toBeLessThanOrEqual(50);
  });
});

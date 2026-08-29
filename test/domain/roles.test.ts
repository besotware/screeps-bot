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
import type { Census, ColonyNeeds } from "../../src/domain/roles";

const needs = (over: Partial<ColonyNeeds> = {}): ColonyNeeds => ({
  controllerLevel: 1,
  sourceCount: 2,
  sourceContainerCount: 0,
  constructionSiteCount: 0,
  repairTargetCount: 0,
  hasStorage: false,
  defendersWanted: 0,
  ...over,
});

const census = (over: Partial<Census> = {}): Census => ({ ...emptyCensus(), ...over });

describe("isRole", () => {
  it.each(ROLES)("accepts the known role %s", (role) => {
    expect(isRole(role)).toBe(true);
  });

  it.each([["wizard"], [""], [null], [undefined], [7], [{}]])("rejects %p", (value) => {
    expect(isRole(value)).toBe(false);
  });
});

describe("tallyCensus", () => {
  it("returns zeroes for no creeps", () => {
    expect(tallyCensus([])).toEqual(emptyCensus());
  });

  it("counts each role", () => {
    expect(tallyCensus(["miner", "miner", "hauler"])).toEqual(
      census({ miner: 2, hauler: 1 }),
    );
  });

  it("ignores unknown and missing roles rather than throwing", () => {
    expect(tallyCensus(["miner", "wizard", undefined])).toEqual(census({ miner: 1 }));
  });
});

describe("desiredCensus — the bootstrap economy", () => {
  it("uses harvesters when no source has a container", () => {
    const d = desiredCensus(needs({ sourceCount: 2, sourceContainerCount: 0 }));
    expect(d.harvester).toBe(4);
    expect(d.miner).toBe(0);
    expect(d.hauler).toBe(0);
  });

  it("caps harvesters so a rich room does not spawn endlessly", () => {
    expect(desiredCensus(needs({ sourceCount: 99 })).harvester).toBe(6);
  });

  it("wants nothing economic in a room with no sources", () => {
    const d = desiredCensus(needs({ sourceCount: 0, sourceContainerCount: 0 }));
    expect(d.harvester).toBe(0);
    expect(d.miner).toBe(0);
  });

  it("treats a negative source count as zero", () => {
    expect(desiredCensus(needs({ sourceCount: -3 })).harvester).toBe(0);
  });
});

describe("desiredCensus — the miner economy", () => {
  it("spawns one miner per containered source", () => {
    const d = desiredCensus(needs({ sourceCount: 2, sourceContainerCount: 2 }));
    expect(d.miner).toBe(2);
    expect(d.hauler).toBe(2);
  });

  it("drops harvesters to zero once every source has a miner", () => {
    expect(desiredCensus(needs({ sourceCount: 2, sourceContainerCount: 2 })).harvester).toBe(0);
  });

  it("keeps one harvester alive during a partial handover", () => {
    // One of two sources has a container. The other still needs working, so
    // dropping to zero harvesters would strand it.
    const d = desiredCensus(needs({ sourceCount: 2, sourceContainerCount: 1 }));
    expect(d.miner).toBe(1);
    expect(d.harvester).toBe(1);
  });

  it("never wants more miners than there are sources", () => {
    // A stray container elsewhere must not inflate the miner count.
    expect(desiredCensus(needs({ sourceCount: 1, sourceContainerCount: 5 })).miner).toBe(1);
  });

  it("adds a hauler once storage exists, for the longer round trip", () => {
    const without = desiredCensus(needs({ sourceContainerCount: 2, hasStorage: false }));
    const with_ = desiredCensus(needs({ sourceContainerCount: 2, hasStorage: true }));
    expect(with_.hauler).toBe(without.hauler + 1);
  });
});

describe("desiredCensus — builders and upgraders", () => {
  it("wants no builder with nothing to build or repair", () => {
    expect(desiredCensus(needs()).builder).toBe(0);
  });

  it("wants a builder when there is a construction site", () => {
    expect(desiredCensus(needs({ constructionSiteCount: 1 })).builder).toBe(1);
  });

  it("wants a builder when something needs repair", () => {
    expect(desiredCensus(needs({ repairTargetCount: 3 })).builder).toBe(1);
  });

  it("wants two builders from RCL 3", () => {
    expect(desiredCensus(needs({ controllerLevel: 3, constructionSiteCount: 1 })).builder).toBe(2);
  });

  it("holds upgraders at one until RCL 2", () => {
    expect(desiredCensus(needs({ controllerLevel: 1 })).upgrader).toBe(1);
    expect(desiredCensus(needs({ controllerLevel: 2 })).upgrader).toBe(2);
  });

  it("raises upgraders once storage can feed them", () => {
    expect(desiredCensus(needs({ controllerLevel: 4, hasStorage: true })).upgrader).toBe(3);
  });

  it("drops back to one upgrader at RCL 8, where the controller is capped", () => {
    expect(desiredCensus(needs({ controllerLevel: 8, hasStorage: true })).upgrader).toBe(1);
  });
});

describe("nextRoleToSpawn", () => {
  it("returns undefined when the room is at strength", () => {
    const at = census({ harvester: 2, upgrader: 1 });
    expect(nextRoleToSpawn(at, at)).toBeUndefined();
  });

  it("returns undefined when the room is over strength", () => {
    expect(nextRoleToSpawn(census({ harvester: 5 }), census({ harvester: 2 }))).toBeUndefined();
  });

  it("fills the only shortfall", () => {
    expect(
      nextRoleToSpawn(census({ harvester: 2 }), census({ harvester: 2, upgrader: 1 })),
    ).toBe("upgrader");
  });

  it("fills the larger deficit first", () => {
    expect(
      nextRoleToSpawn(census(), census({ harvester: 1, upgrader: 3 })),
    ).toBe("upgrader");
  });

  it("breaks an equal deficit on priority", () => {
    expect(nextRoleToSpawn(census(), census({ harvester: 1, miner: 1 }))).toBe("harvester");
    expect(ROLE_SPECS.harvester.priority).toBeLessThan(ROLE_SPECS.miner.priority);
  });

  it("prefers a miner over an upgrader at equal deficit", () => {
    // The economy comes before the controller.
    expect(nextRoleToSpawn(census(), census({ miner: 1, upgrader: 1 }))).toBe("miner");
  });

  it("rebuilds the economy first when the room is wiped out", () => {
    expect(
      nextRoleToSpawn(emptyCensus(), desiredCensus(needs({ sourceCount: 2 }))),
    ).toBe("harvester");
  });
});

describe("planBody", () => {
  it("returns nothing when nothing is affordable", () => {
    expect(planBody("harvester", 100, 300)).toEqual([]);
  });

  it("builds the minimum viable harvester at 200 energy", () => {
    expect(planBody("harvester", 200, 300)).toEqual(["work", "carry", "move"]);
  });

  it("gives a miner one MOVE and the rest WORK", () => {
    // base MOVE (50) + 3x WORK (300) = 350
    expect(planBody("miner", 350, 350)).toEqual(["move", "work", "work", "work"]);
  });

  it("returns nothing for a miner that cannot afford base plus one WORK", () => {
    // 50 buys the MOVE but no WORK -- a miner with no WORK is a parked body.
    expect(planBody("miner", 50, 550)).toEqual([]);
    expect(planBody("miner", 149, 550)).toEqual([]);
  });

  it("caps a miner at five WORK, which saturates a source", () => {
    const body = planBody("miner", 10_000, 10_000);
    expect(body.filter((p) => p === "work")).toHaveLength(5);
    expect(body.filter((p) => p === "move")).toHaveLength(1);
  });

  it("builds haulers from carry pairs", () => {
    expect(planBody("hauler", 150, 150)).toEqual(["carry", "carry", "move"]);
  });

  it("scales with available energy", () => {
    expect(planBody("harvester", 600, 600).length).toBeGreaterThan(
      planBody("harvester", 200, 600).length,
    );
  });

  it("never spends more than is available", () => {
    for (const role of ROLES) {
      for (const energy of [0, 150, 200, 550, 1200, 3000]) {
        expect(bodyCost(planBody(role, energy, 3000))).toBeLessThanOrEqual(energy);
      }
    }
  });

  it("clamps spending to room capacity, not just what is banked", () => {
    expect(planBody("harvester", 5000, 200)).toEqual(["work", "carry", "move"]);
  });

  it.each(ROLES)("produces a legal body for %s at high energy", (role) => {
    const body = planBody(role, 10_000, 10_000);
    expect(body.length).toBeGreaterThan(0);
    expect(body.length).toBeLessThanOrEqual(50);
  });
});

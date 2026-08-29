import {
  BODY_PART_COST,
  CARRY,
  MAX_BODY_PARTS,
  MOVE,
  TOUGH,
  WORK,
  bodyCost,
  isSpawnableBody,
  orderForSurvivability,
  scaleBody,
} from "../../src/domain/body";

describe("bodyCost", () => {
  it("is zero for an empty body", () => {
    expect(bodyCost([])).toBe(0);
  });

  it("sums the published game costs", () => {
    // WORK 100 + CARRY 50 + MOVE 50 -- the canonical starter creep.
    expect(bodyCost([WORK, CARRY, MOVE])).toBe(200);
  });

  it("counts duplicate parts individually", () => {
    expect(bodyCost([WORK, WORK, WORK])).toBe(300);
  });

  it("prices every part the game defines", () => {
    for (const [part, cost] of Object.entries(BODY_PART_COST)) {
      expect(bodyCost([part as BodyPartConstant])).toBe(cost);
    }
  });
});

describe("isSpawnableBody", () => {
  it("rejects an empty body", () => {
    expect(isSpawnableBody([])).toBe(false);
  });

  it("accepts a body at exactly the part limit", () => {
    expect(isSpawnableBody(new Array<BodyPartConstant>(MAX_BODY_PARTS).fill(MOVE))).toBe(true);
  });

  it("rejects a body one part over the limit", () => {
    expect(isSpawnableBody(new Array<BodyPartConstant>(MAX_BODY_PARTS + 1).fill(MOVE))).toBe(false);
  });
});

describe("scaleBody", () => {
  it("returns nothing when one repetition is unaffordable", () => {
    // [WORK,CARRY,MOVE] costs 200; 199 buys none.
    expect(scaleBody([WORK, CARRY, MOVE], 199)).toEqual([]);
  });

  it("returns exactly one repetition at the break-even price", () => {
    expect(scaleBody([WORK, CARRY, MOVE], 200)).toEqual([WORK, CARRY, MOVE]);
  });

  it("repeats as many times as the energy allows", () => {
    expect(scaleBody([WORK, CARRY, MOVE], 650)).toHaveLength(9); // 3 repeats
  });

  it("honours maxRepeats even when energy allows more", () => {
    expect(scaleBody([WORK, CARRY, MOVE], 10_000, 2)).toHaveLength(6);
  });

  it("never exceeds the 50-part game limit", () => {
    const body = scaleBody([MOVE], 1_000_000);
    expect(body).toHaveLength(MAX_BODY_PARTS);
    expect(isSpawnableBody(body)).toBe(true);
  });

  it("respects the part limit for multi-part patterns", () => {
    // 3-part pattern: floor(50/3) = 16 repeats = 48 parts.
    expect(scaleBody([WORK, CARRY, MOVE], 1_000_000)).toHaveLength(48);
  });

  it("returns nothing for an empty pattern", () => {
    expect(scaleBody([], 1000)).toEqual([]);
  });

  it("returns nothing for negative energy", () => {
    expect(scaleBody([MOVE], -50)).toEqual([]);
  });

  it("produces a body whose cost never exceeds the budget", () => {
    for (const energy of [0, 50, 199, 200, 350, 800, 5000]) {
      expect(bodyCost(scaleBody([WORK, CARRY, MOVE], energy))).toBeLessThanOrEqual(energy);
    }
  });
});

describe("orderForSurvivability", () => {
  it("puts TOUGH first and MOVE after the working parts", () => {
    expect(orderForSurvivability([MOVE, WORK, TOUGH, CARRY])).toEqual([TOUGH, WORK, CARRY, MOVE]);
  });

  it("preserves the multiset of parts", () => {
    const input: BodyPartConstant[] = [MOVE, WORK, WORK, TOUGH, CARRY, MOVE];
    const ordered = orderForSurvivability(input);
    expect(ordered).toHaveLength(input.length);
    expect([...ordered].sort()).toEqual([...input].sort());
  });

  it("does not mutate its argument", () => {
    const input: BodyPartConstant[] = [MOVE, TOUGH];
    orderForSurvivability(input);
    expect(input).toEqual([MOVE, TOUGH]);
  });
});

describe("scaleBody with a nonsense pattern", () => {
  it("returns nothing rather than an infinite body", () => {
    // An unknown part prices as NaN. The repeats check must catch that instead
    // of producing Infinity repetitions.
    const bogus = ["not-a-part"] as unknown as BodyPartConstant[];
    expect(scaleBody(bogus, 10_000)).toEqual([]);
  });
});

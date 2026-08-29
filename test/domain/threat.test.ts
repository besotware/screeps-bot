import {
  NPC_OWNERS,
  assessThreat,
  desiredDefenders,
  shouldActivateSafeMode,
  shouldEvacuate,
} from "../../src/domain/threat";
import type { SafeModeInput, ThreatView } from "../../src/domain/threat";

const hostile = (over: Partial<ThreatView> & { id: string }): ThreatView => ({
  attackParts: 0,
  rangedParts: 0,
  healParts: 0,
  toughParts: 0,
  hits: 1000,
  owner: "Invader",
  ...over,
});

describe("assessThreat", () => {
  it("reports none for an empty room", () => {
    const a = assessThreat([]);
    expect(a.level).toBe("none");
    expect(a.hostileCount).toBe(0);
  });

  it("treats an unarmed hostile as a nuisance, not an attack", () => {
    // A scout or claimer. Spawning defenders for this wastes energy.
    expect(assessThreat([hostile({ id: "scout" })]).level).toBe("nuisance");
  });

  it("treats an armed hostile as a raid", () => {
    expect(assessThreat([hostile({ id: "raider", attackParts: 2 })]).level).toBe("raid");
  });

  it("sums incoming damage across attackers", () => {
    const a = assessThreat([
      hostile({ id: "a", attackParts: 2 }),
      hostile({ id: "b", rangedParts: 3 }),
    ]);
    expect(a.incomingDamage).toBe(2 * 30 + 3 * 10);
  });

  it("sums incoming heal", () => {
    expect(assessThreat([hostile({ id: "medic", healParts: 5 })]).incomingHeal).toBe(60);
  });

  it("escalates to siege on overwhelming damage", () => {
    expect(assessThreat([hostile({ id: "big", attackParts: 20 })]).level).toBe("siege");
  });

  it("escalates to siege on overwhelming heal, even with modest damage", () => {
    // Sustained healing is what makes an attack unwinnable by towers alone.
    const a = assessThreat([hostile({ id: "medic", healParts: 20, attackParts: 1 })]);
    expect(a.level).toBe("siege");
  });

  it("flags an all-NPC attack", () => {
    expect(assessThreat([hostile({ id: "npc", attackParts: 1 })]).npcOnly).toBe(true);
  });

  it("flags a player attack", () => {
    expect(
      assessThreat([hostile({ id: "p", attackParts: 1, owner: "SomePlayer" })]).npcOnly,
    ).toBe(false);
  });

  it("is not NPC-only when a player joins an invader", () => {
    const a = assessThreat([
      hostile({ id: "npc", attackParts: 1 }),
      hostile({ id: "p", attackParts: 1, owner: "SomePlayer" }),
    ]);
    expect(a.npcOnly).toBe(false);
  });

  it("recognises every documented NPC owner", () => {
    for (const owner of NPC_OWNERS) {
      expect(assessThreat([hostile({ id: "x", owner })]).npcOnly).toBe(true);
    }
  });
});

describe("desiredDefenders", () => {
  it("wants none in a quiet room", () => {
    expect(desiredDefenders(assessThreat([]), 1)).toBe(0);
  });

  it("wants none for an unarmed nuisance", () => {
    expect(desiredDefenders(assessThreat([hostile({ id: "scout" })]), 1)).toBe(0);
  });

  it("wants one defender for a raid when towers can help", () => {
    expect(desiredDefenders(assessThreat([hostile({ id: "r", attackParts: 2 })]), 1)).toBe(1);
  });

  it("wants two when there is no tower support at all", () => {
    expect(desiredDefenders(assessThreat([hostile({ id: "r", attackParts: 2 })]), 0)).toBe(2);
  });

  it("caps at two under siege -- bodies will not win it", () => {
    expect(desiredDefenders(assessThreat([hostile({ id: "b", attackParts: 30 })]), 2)).toBe(2);
  });
});

describe("shouldActivateSafeMode", () => {
  const input = (over: Partial<SafeModeInput> = {}): SafeModeInput => ({
    assessment: assessThreat([hostile({ id: "p", attackParts: 5, owner: "SomePlayer" })]),
    available: 3,
    cooldownUntil: 0,
    tick: 1000,
    active: false,
    spawnIntegrity: 0.2,
    ...over,
  });

  it("activates on a player attack that is eating the spawn", () => {
    expect(shouldActivateSafeMode(input())).toBe(true);
  });

  it("does not activate while already active", () => {
    expect(shouldActivateSafeMode(input({ active: true }))).toBe(false);
  });

  it("does not activate with no activations left", () => {
    expect(shouldActivateSafeMode(input({ available: 0 }))).toBe(false);
  });

  it("does not activate during cooldown", () => {
    expect(shouldActivateSafeMode(input({ cooldownUntil: 5000, tick: 1000 }))).toBe(false);
  });

  it("does not activate for NPC invaders", () => {
    // They leave on their own. Burning an activation on them is how a colony
    // has none left when a real player arrives.
    expect(
      shouldActivateSafeMode(
        input({ assessment: assessThreat([hostile({ id: "npc", attackParts: 5 })]) }),
      ),
    ).toBe(false);
  });

  it("does not activate while the spawn is still healthy", () => {
    expect(shouldActivateSafeMode(input({ spawnIntegrity: 0.9 }))).toBe(false);
  });

  it("does not activate for a quiet room", () => {
    expect(shouldActivateSafeMode(input({ assessment: assessThreat([]) }))).toBe(false);
  });

  it("does not activate for an unarmed nuisance", () => {
    expect(
      shouldActivateSafeMode(
        input({ assessment: assessThreat([hostile({ id: "s", owner: "SomePlayer" })]) }),
      ),
    ).toBe(false);
  });

  it("activates exactly at the cooldown expiry tick", () => {
    expect(shouldActivateSafeMode(input({ cooldownUntil: 1000, tick: 1000 }))).toBe(true);
  });
});

describe("shouldEvacuate", () => {
  it("keeps working through a quiet room", () => {
    expect(shouldEvacuate(assessThreat([]))).toBe(false);
  });

  it("keeps working past an unarmed hostile", () => {
    // A fleeing colony produces nothing; the cure must not be worse than a
    // wandering scout.
    expect(shouldEvacuate(assessThreat([hostile({ id: "scout" })]))).toBe(false);
  });

  it("evacuates under real damage", () => {
    expect(shouldEvacuate(assessThreat([hostile({ id: "r", attackParts: 4 })]))).toBe(true);
  });

  it("evacuates under siege", () => {
    expect(shouldEvacuate(assessThreat([hostile({ id: "b", attackParts: 30 })]))).toBe(true);
  });
});

import { isBootstrapEmergency, nextWorkMode, spawnBudget } from "../../src/domain/state";
import type { RoomSnapshot } from "../../src/domain/state";

const room = (over: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
  controllerLevel: 2,
  sourceCount: 2,
  energyAvailable: 300,
  energyCapacityAvailable: 300,
  creepCount: 4,
  ...over,
});

describe("nextWorkMode", () => {
  it("switches to delivering only once full", () => {
    expect(nextWorkMode({ mode: "gathering", carried: 49, capacity: 50 })).toBe("gathering");
    expect(nextWorkMode({ mode: "gathering", carried: 50, capacity: 50 })).toBe("delivering");
  });

  it("switches back to gathering only once empty", () => {
    expect(nextWorkMode({ mode: "delivering", carried: 1, capacity: 50 })).toBe("delivering");
    expect(nextWorkMode({ mode: "delivering", carried: 0, capacity: 50 })).toBe("gathering");
  });

  it("does not oscillate on a partial load", () => {
    // The whole point of the hysteresis: a half-full creep keeps doing what it
    // was doing, in both directions.
    expect(nextWorkMode({ mode: "gathering", carried: 25, capacity: 50 })).toBe("gathering");
    expect(nextWorkMode({ mode: "delivering", carried: 25, capacity: 50 })).toBe("delivering");
  });

  it("does not strand a zero-capacity creep in gathering", () => {
    // A creep with no CARRY can never reach 'full'; guarding on capacity > 0
    // stops it looping forever on a source it cannot use.
    expect(nextWorkMode({ mode: "gathering", carried: 0, capacity: 0 })).toBe("gathering");
  });

  it("treats an over-full creep as full", () => {
    expect(nextWorkMode({ mode: "gathering", carried: 60, capacity: 50 })).toBe("delivering");
  });
});

describe("isBootstrapEmergency", () => {
  it("is true only when every creep is dead", () => {
    expect(isBootstrapEmergency(room({ creepCount: 0 }))).toBe(true);
    expect(isBootstrapEmergency(room({ creepCount: 1 }))).toBe(false);
  });
});

describe("spawnBudget", () => {
  it("waits for a full bank before spawning normally", () => {
    expect(spawnBudget(room({ energyAvailable: 250, energyCapacityAvailable: 300 }))).toBe(0);
  });

  it("spends once the bank is full", () => {
    expect(spawnBudget(room({ energyAvailable: 300, energyCapacityAvailable: 300 }))).toBe(300);
  });

  it("spends whatever exists when the colony is wiped out", () => {
    // Without this the room deadlocks: no creeps means no income, so the bank
    // never reaches capacity and we would wait forever.
    expect(
      spawnBudget(room({ creepCount: 0, energyAvailable: 200, energyCapacityAvailable: 550 })),
    ).toBe(200);
  });

  it("spends surplus above capacity", () => {
    expect(spawnBudget(room({ energyAvailable: 350, energyCapacityAvailable: 300 }))).toBe(350);
  });
});

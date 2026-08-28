import { pruneCreepMemory } from "../../src/runtime/memory";

describe("pruneCreepMemory", () => {
  it("removes entries for creeps that no longer exist", () => {
    const memory: Record<string, unknown> = { alive: { role: "harvester" }, dead: { role: "upgrader" } };
    const live = { alive: {} };

    expect(pruneCreepMemory(memory, live)).toEqual(["dead"]);
    expect(Object.keys(memory)).toEqual(["alive"]);
  });

  it("keeps every entry when nothing has died", () => {
    const memory: Record<string, unknown> = { a: {}, b: {} };
    expect(pruneCreepMemory(memory, { a: {}, b: {} })).toEqual([]);
    expect(Object.keys(memory).sort()).toEqual(["a", "b"]);
  });

  it("is a no-op on empty memory", () => {
    const memory: Record<string, unknown> = {};
    expect(pruneCreepMemory(memory, {})).toEqual([]);
  });

  it("clears everything when the colony is wiped out", () => {
    const memory: Record<string, unknown> = { a: {}, b: {} };
    expect(pruneCreepMemory(memory, {}).sort()).toEqual(["a", "b"]);
    expect(memory).toEqual({});
  });

  it("does not invent entries for live creeps with no memory", () => {
    const memory: Record<string, unknown> = {};
    pruneCreepMemory(memory, { newborn: {} });
    expect(memory).toEqual({});
  });
});

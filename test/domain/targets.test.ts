import {
  rankEnergySinks,
  selectEnergySink,
  selectEnergySource,
  selectPickup,
  sinkTier,
} from "../../src/domain/targets";
import type { EnergyPickup, EnergySink, EnergySource } from "../../src/domain/targets";

const sink = (over: Partial<EnergySink> & { id: string }): EnergySink => ({
  structureType: "extension",
  free: 50,
  range: 5,
  ...over,
});

const source = (over: Partial<EnergySource> & { id: string }): EnergySource => ({
  energy: 3000,
  range: 5,
  openSpots: 2,
  ...over,
});

describe("sinkTier", () => {
  it("ranks spawns and extensions above towers", () => {
    expect(sinkTier("spawn")).toBeLessThan(sinkTier("tower"));
    expect(sinkTier("extension")).toBeLessThan(sinkTier("tower"));
  });

  it("ranks spawn and extension equally", () => {
    expect(sinkTier("spawn")).toBe(sinkTier("extension"));
  });

  it("puts an unknown structure last rather than throwing", () => {
    expect(sinkTier("nuker")).toBeGreaterThan(sinkTier("tower"));
  });
});

describe("rankEnergySinks", () => {
  it("drops sinks that are already full", () => {
    expect(rankEnergySinks([sink({ id: "a", free: 0 })])).toEqual([]);
  });

  it("prefers a distant spawn over a near tower", () => {
    const ranked = rankEnergySinks([
      sink({ id: "tower", structureType: "tower", range: 1 }),
      sink({ id: "spawn", structureType: "spawn", range: 20 }),
    ]);
    expect(ranked[0]?.id).toBe("spawn");
  });

  it("prefers the nearer target within a tier", () => {
    const ranked = rankEnergySinks([
      sink({ id: "far", range: 10 }),
      sink({ id: "near", range: 2 }),
    ]);
    expect(ranked.map((s) => s.id)).toEqual(["near", "far"]);
  });

  it("breaks distance ties deterministically on id", () => {
    const input = [sink({ id: "b" }), sink({ id: "a" })];
    expect(rankEnergySinks(input).map((s) => s.id)).toEqual(["a", "b"]);
    expect(rankEnergySinks([...input].reverse()).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("does not mutate its argument", () => {
    const input = [sink({ id: "b" }), sink({ id: "a" })];
    rankEnergySinks(input);
    expect(input.map((s) => s.id)).toEqual(["b", "a"]);
  });
});

describe("selectEnergySink", () => {
  it("returns undefined when nothing needs energy", () => {
    expect(selectEnergySink([])).toBeUndefined();
    expect(selectEnergySink([sink({ id: "full", free: 0 })])).toBeUndefined();
  });

  it("returns the top-ranked sink", () => {
    expect(
      selectEnergySink([
        sink({ id: "ext", range: 9 }),
        sink({ id: "spawn", structureType: "spawn", range: 9 }),
      ])?.id,
    ).toBe("ext"); // same tier, same range -- id breaks the tie
  });
});

describe("selectPickup", () => {
  const pickup = (over: Partial<EnergyPickup> & { id: string }): EnergyPickup => ({
    kind: "container",
    amount: 500,
    range: 5,
    ...over,
  });

  it("returns undefined when there is nothing to collect", () => {
    expect(selectPickup([])).toBeUndefined();
  });

  it("ignores empty piles", () => {
    expect(selectPickup([pickup({ id: "empty", amount: 0 })])).toBeUndefined();
  });

  it("respects a minimum amount, so haulers do not cross the room for scraps", () => {
    expect(selectPickup([pickup({ id: "small", amount: 20 })], 100)).toBeUndefined();
    expect(selectPickup([pickup({ id: "big", amount: 200 })], 100)?.id).toBe("big");
  });

  it("clears decaying energy before stored energy", () => {
    // Dropped energy is being lost every tick; a container is not.
    expect(
      selectPickup([
        pickup({ id: "container", amount: 2000, range: 1 }),
        pickup({ id: "dropped", kind: "dropped", amount: 50, range: 20 }),
      ])?.id,
    ).toBe("dropped");
  });

  it("treats tombstones as perishable too", () => {
    expect(
      selectPickup([
        pickup({ id: "container", amount: 2000 }),
        pickup({ id: "tomb", kind: "tombstone", amount: 100 }),
      ])?.id,
    ).toBe("tomb");
  });

  it("prefers the biggest pile within a tier", () => {
    expect(
      selectPickup([pickup({ id: "small", amount: 100 }), pickup({ id: "big", amount: 900 })])?.id,
    ).toBe("big");
  });

  it("prefers the nearer pile when amounts tie", () => {
    expect(
      selectPickup([
        pickup({ id: "far", amount: 500, range: 20 }),
        pickup({ id: "near", amount: 500, range: 2 }),
      ])?.id,
    ).toBe("near");
  });

  it("breaks full ties deterministically on id", () => {
    const input = [pickup({ id: "b" }), pickup({ id: "a" })];
    expect(selectPickup(input)?.id).toBe("a");
    expect(selectPickup([...input].reverse())?.id).toBe("a");
  });

  it("falls back to stored energy when nothing is perishable", () => {
    expect(selectPickup([pickup({ id: "storage", kind: "storage" })])?.id).toBe("storage");
  });
});

describe("selectEnergySource", () => {
  it("returns undefined when there are no sources", () => {
    expect(selectEnergySource([])).toBeUndefined();
  });

  it("skips depleted sources", () => {
    expect(selectEnergySource([source({ id: "empty", energy: 0 })])).toBeUndefined();
  });

  it("skips sources with no room to stand", () => {
    expect(selectEnergySource([source({ id: "crowded", openSpots: 0 })])).toBeUndefined();
  });

  it("prefers an open source over a closer crowded one", () => {
    expect(
      selectEnergySource([
        source({ id: "close", range: 1, openSpots: 1 }),
        source({ id: "open", range: 15, openSpots: 4 }),
      ])?.id,
    ).toBe("open");
  });

  it("prefers the nearer source when access is equal", () => {
    expect(
      selectEnergySource([
        source({ id: "far", range: 20 }),
        source({ id: "near", range: 3 }),
      ])?.id,
    ).toBe("near");
  });

  it("breaks full ties deterministically on id", () => {
    const input = [source({ id: "b" }), source({ id: "a" })];
    expect(selectEnergySource(input)?.id).toBe("a");
    expect(selectEnergySource([...input].reverse())?.id).toBe("a");
  });
});

describe("sink and pickup ordering corner cases", () => {
  it("ranks two unknown structure types against each other by range", () => {
    const ranked = rankEnergySinks([
      sink({ id: "far", structureType: "nuker", range: 20 }),
      sink({ id: "near", structureType: "lab", range: 2 }),
    ]);
    expect(ranked.map((s) => s.id)).toEqual(["near", "far"]);
  });

  it("keeps a tower ahead of an unknown structure", () => {
    const ranked = rankEnergySinks([
      sink({ id: "lab", structureType: "lab", range: 1 }),
      sink({ id: "tower", structureType: "tower", range: 20 }),
    ]);
    expect(ranked[0]?.id).toBe("tower");
  });

  it("breaks an id tie on the greater-than branch as well as the less-than one", () => {
    // Both orderings must produce the same result, which exercises both arms
    // of the comparator rather than only the first.
    const input = [sink({ id: "aaa" }), sink({ id: "bbb" }), sink({ id: "ccc" })];
    expect(rankEnergySinks(input).map((s) => s.id)).toEqual(["aaa", "bbb", "ccc"]);
    expect(rankEnergySinks([...input].reverse()).map((s) => s.id)).toEqual(["aaa", "bbb", "ccc"]);
  });

  it("prefers a nearer source when open spots and range both tie on id order", () => {
    const input = [
      source({ id: "zzz", range: 5, openSpots: 2 }),
      source({ id: "aaa", range: 5, openSpots: 2 }),
    ];
    expect(selectEnergySource(input)?.id).toBe("aaa");
  });
});

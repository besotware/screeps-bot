import {
  rankEnergySinks,
  selectEnergySink,
  selectEnergySource,
  sinkTier,
} from "../../src/domain/targets";
import type { EnergySink, EnergySource } from "../../src/domain/targets";

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

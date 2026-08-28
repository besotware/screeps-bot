import { emptyCensus } from "../../src/domain/roles";
import type { Census } from "../../src/domain/roles";
import { bar, formatCensus, formatReport, hasShortfall } from "../../src/domain/stats";
import type { ColonyReport } from "../../src/domain/stats";

const census = (over: Partial<Census> = {}): Census => ({ ...emptyCensus(), ...over });

const report = (over: Partial<ColonyReport> = {}): ColonyReport => ({
  room: "W1N1",
  tick: 1234,
  controllerLevel: 3,
  controllerProgress: 0.5,
  energyAvailable: 250,
  energyCapacity: 550,
  current: census({ miner: 2, hauler: 2 }),
  desired: census({ miner: 2, hauler: 2 }),
  constructionSites: 0,
  cpuUsed: 4.25,
  cpuLimit: 20,
  ...over,
});

describe("bar", () => {
  it("is empty at zero", () => {
    expect(bar(0)).toBe("[          ]");
  });

  it("is full at one", () => {
    expect(bar(1)).toBe("[==========]");
  });

  it("is half full at 0.5", () => {
    expect(bar(0.5)).toBe("[=====     ]");
  });

  it("clamps out-of-range input rather than producing a ragged bar", () => {
    expect(bar(-5)).toBe(bar(0));
    expect(bar(99)).toBe(bar(1));
  });

  it("treats NaN as empty", () => {
    expect(bar(Number.NaN)).toBe(bar(0));
  });

  it("honours a custom width", () => {
    expect(bar(1, 4)).toBe("[====]");
  });

  it("always renders the requested width", () => {
    for (const f of [0, 0.13, 0.5, 0.77, 1]) {
      expect(bar(f)).toHaveLength(12); // 10 cells plus brackets
    }
  });
});

describe("formatCensus", () => {
  it("shows have over want for every role", () => {
    const line = formatCensus(census({ miner: 1 }), census({ miner: 2 }));
    expect(line).toContain("min 1/2");
  });

  it("marks a shortfall with a bang", () => {
    expect(formatCensus(census({ miner: 1 }), census({ miner: 2 }))).toContain("min 1/2!");
  });

  it("does not mark a satisfied role", () => {
    expect(formatCensus(census({ miner: 2 }), census({ miner: 2 }))).toContain("min 2/2 ");
  });

  it("does not mark a role that is over strength", () => {
    expect(formatCensus(census({ miner: 5 }), census({ miner: 2 }))).not.toContain("!");
  });

  it("includes every role", () => {
    const line = formatCensus(emptyCensus(), emptyCensus());
    for (const tag of ["har", "min", "hau", "bld", "upg"]) {
      expect(line).toContain(tag);
    }
  });
});

describe("hasShortfall", () => {
  it("is false when every role is at strength", () => {
    expect(hasShortfall(census({ miner: 2 }), census({ miner: 2 }))).toBe(false);
  });

  it("is true when any role is short", () => {
    expect(hasShortfall(census(), census({ hauler: 1 }))).toBe(true);
  });

  it("is false when over strength", () => {
    expect(hasShortfall(census({ upgrader: 9 }), census({ upgrader: 1 }))).toBe(false);
  });
});

describe("formatReport", () => {
  it("names the room and tick", () => {
    expect(formatReport(report())).toContain("[W1N1 t1234]");
  });

  it("shows RCL and energy", () => {
    const line = formatReport(report());
    expect(line).toContain("RCL3");
    expect(line).toContain("E 250/550");
  });

  it("shows CPU to one decimal", () => {
    expect(formatReport(report())).toContain("cpu 4.3/20");
  });

  it("mentions construction sites only when there are some", () => {
    expect(formatReport(report({ constructionSites: 0 }))).not.toContain("sites");
    expect(formatReport(report({ constructionSites: 3 }))).toContain("sites 3");
  });

  it("is a single line, so the console stays readable", () => {
    expect(formatReport(report())).not.toContain("\n");
  });

  it("survives a controller with no progress total", () => {
    expect(() => formatReport(report({ controllerProgress: 0 }))).not.toThrow();
  });
});

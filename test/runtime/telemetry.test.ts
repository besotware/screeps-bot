import {
  REPORT_INTERVAL,
  buildReport,
  drawOverlay,
  reportRoom,
} from "../../src/runtime/telemetry";
import { fakeCreep, fakeRoom, installGame, installScreepsConstants } from "../helpers/mockGame";
import type { ColonyReport } from "../../src/domain/stats";
import { ROLES, emptyCensus } from "../../src/domain/roles";

installScreepsConstants();

const report = (over: Partial<ColonyReport> = {}): ColonyReport => ({
  room: "W1N1",
  tick: 100,
  controllerLevel: 2,
  controllerProgress: 0.25,
  energyAvailable: 300,
  energyCapacity: 550,
  current: emptyCensus(),
  desired: emptyCensus(),
  constructionSites: 0,
  cpuUsed: 3,
  cpuLimit: 20,
  ...over,
});

describe("buildReport", () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installGame({
      time: 4242,
      cpu: { getUsed: () => 7.5, limit: 20, bucket: 10_000 } as unknown as CPU,
    });
  });
  afterEach(() => restore());

  it("reads the room and tick", () => {
    const r = buildReport(fakeRoom({ name: "W5N8" }), []);
    expect(r.room).toBe("W5N8");
    expect(r.tick).toBe(4242);
  });

  it("reports controller level and progress as a fraction", () => {
    const r = buildReport(fakeRoom({ controllerLevel: 3 }), []);
    expect(r.controllerLevel).toBe(3);
    expect(r.controllerProgress).toBeCloseTo(0.5);
  });

  it("reports level 0 and no progress for a room with no controller", () => {
    const r = buildReport(fakeRoom({ controllerLevel: 0 }), []);
    expect(r.controllerLevel).toBe(0);
    expect(r.controllerProgress).toBe(0);
  });

  it("counts the current census from the creeps given", () => {
    const r = buildReport(fakeRoom(), [fakeCreep("miner"), fakeCreep("miner"), fakeCreep("hauler")]);
    expect(r.current.miner).toBe(2);
    expect(r.current.hauler).toBe(1);
  });

  it("computes what the room wants, not just what it has", () => {
    const r = buildReport(fakeRoom({ sourceCount: 2, containeredSources: 2 }), []);
    expect(r.desired.miner).toBe(2);
  });

  it("carries CPU through", () => {
    const r = buildReport(fakeRoom(), []);
    expect(r.cpuUsed).toBe(7.5);
    expect(r.cpuLimit).toBe(20);
  });
});

describe("reportRoom", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  it("stays quiet on an ordinary tick with nothing wrong", () => {
    expect(reportRoom(report({ tick: 7 }))).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("prints on the interval even when all is well", () => {
    expect(reportRoom(report({ tick: REPORT_INTERVAL * 4 }))).toBe(true);
    expect(logSpy).toHaveBeenCalled();
  });

  it("prints immediately when the colony is short of a role", () => {
    const shortfall = report({ tick: 7, desired: { ...emptyCensus(), miner: 2 } });
    expect(reportRoom(shortfall)).toBe(true);
  });
});

describe("drawOverlay", () => {
  it("draws without throwing", () => {
    const room = fakeRoom();
    expect(() => drawOverlay(room, report())).not.toThrow();
  });

  it("draws one line per role plus the headline stats", () => {
    const calls: unknown[][] = [];
    const room = fakeRoom();
    (room as unknown as { visual: { text: (...a: unknown[]) => void } }).visual = {
      text: (...args: unknown[]) => calls.push(args),
    };

    drawOverlay(room, report());

    // RCL, energy, CPU, plus one line per role. Derived from ROLES so adding a
    // role does not silently break this assertion into a magic number.
    expect(calls).toHaveLength(3 + ROLES.length);
  });

  it("colours a shortfall differently from a satisfied role", () => {
    const calls: { text: string; style: { color: string } }[] = [];
    const room = fakeRoom();
    (room as unknown as { visual: { text: (...a: unknown[]) => void } }).visual = {
      text: (text: unknown, _x: unknown, _y: unknown, style: unknown) =>
        calls.push({ text: String(text), style: style as { color: string } }),
    };

    drawOverlay(room, report({ desired: { ...emptyCensus(), miner: 2 } }));

    const minerLine = calls.find((c) => c.text.startsWith("miner"));
    const builderLine = calls.find((c) => c.text.startsWith("builder"));
    expect(minerLine?.style.color).not.toBe(builderLine?.style.color);
  });
});

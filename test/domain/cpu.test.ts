import {
  BUCKET_CRITICAL,
  BUCKET_STRAINED,
  TICK_BUDGET_HARD,
  TICK_BUDGET_SOFT,
  canAffordLuxury,
  cpuPressure,
  describePressure,
  shouldRun,
} from "../../src/domain/cpu";
import type { CpuState } from "../../src/domain/cpu";

const state = (over: Partial<CpuState> = {}): CpuState => ({
  bucket: 10_000,
  limit: 20,
  used: 2,
  ...over,
});

describe("cpuPressure", () => {
  it("is healthy with a full bucket and a quiet tick", () => {
    expect(cpuPressure(state())).toBe("healthy");
  });

  it("is strained once the bucket drops below the threshold", () => {
    expect(cpuPressure(state({ bucket: BUCKET_STRAINED - 1 }))).toBe("strained");
  });

  it("is healthy exactly at the strained threshold", () => {
    expect(cpuPressure(state({ bucket: BUCKET_STRAINED }))).toBe("healthy");
  });

  it("is critical once the bucket is nearly empty", () => {
    expect(cpuPressure(state({ bucket: BUCKET_CRITICAL - 1 }))).toBe("critical");
  });

  it("is strained when the tick is already well spent, whatever the bucket", () => {
    // A full bucket does not help if this particular tick is nearly over.
    expect(cpuPressure(state({ used: 20 * TICK_BUDGET_SOFT }))).toBe("strained");
  });

  it("is critical when the tick is nearly exhausted", () => {
    expect(cpuPressure(state({ used: 20 * TICK_BUDGET_HARD }))).toBe("critical");
  });

  it("does not divide by zero on a zero limit", () => {
    expect(() => cpuPressure(state({ limit: 0 }))).not.toThrow();
    expect(cpuPressure(state({ limit: 0 }))).toBe("healthy");
  });
});

describe("shouldRun", () => {
  it("runs everything when healthy", () => {
    for (const work of ["defence", "spawn", "creeps", "build", "telemetry"] as const) {
      expect(shouldRun(work, state())).toBe(true);
    }
  });

  it("drops telemetry first, because nothing depends on it", () => {
    const strained = state({ bucket: BUCKET_STRAINED - 1 });
    expect(shouldRun("telemetry", strained)).toBe(false);
    expect(shouldRun("build", strained)).toBe(true);
  });

  it("drops planning next", () => {
    const critical = state({ bucket: BUCKET_CRITICAL - 1 });
    expect(shouldRun("build", critical)).toBe(false);
  });

  it("never drops defence, spawning or creep actions", () => {
    // Skipping these costs bodies and eventually the room; skipping a plan
    // costs a tick of progress.
    const critical = state({ bucket: 0, used: 1000 });
    expect(shouldRun("defence", critical)).toBe(true);
    expect(shouldRun("spawn", critical)).toBe(true);
    expect(shouldRun("creeps", critical)).toBe(true);
  });
});

describe("canAffordLuxury", () => {
  it("is true with a healthy bucket and a quiet tick", () => {
    expect(canAffordLuxury(state())).toBe(true);
  });

  it("is false once the bucket is draining", () => {
    expect(canAffordLuxury(state({ bucket: BUCKET_STRAINED - 1 }))).toBe(false);
  });

  it("is false late in a tick even with a full bucket", () => {
    expect(canAffordLuxury(state({ used: 19 }))).toBe(false);
  });
});

describe("describePressure", () => {
  it("names the pressure level", () => {
    expect(describePressure(state({ bucket: 100 }))).toContain("critical");
  });

  it("reports the bucket and the share of the tick spent", () => {
    const line = describePressure(state({ bucket: 4321, used: 10, limit: 20 }));
    expect(line).toContain("4321");
    expect(line).toContain("50%");
  });

  it("does not divide by zero on a zero limit", () => {
    expect(describePressure(state({ limit: 0 }))).toContain("0%");
  });
});

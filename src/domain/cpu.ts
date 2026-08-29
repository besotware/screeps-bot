/**
 * CPU budgeting.
 *
 * Screeps gives a per-tick CPU limit and a bucket that banks the unused
 * remainder. Overrunning the limit does not throw -- the tick is simply cut
 * short wherever it happened to be, which means the work that got skipped is
 * whatever came last in the loop rather than whatever mattered least.
 *
 * So the loop decides for itself what to drop, in a defined order, before the
 * runtime decides for it.
 */

export type WorkClass = "defence" | "spawn" | "creeps" | "build" | "telemetry";

export interface CpuState {
  /** Banked CPU. Full is 10000 on the official server. */
  readonly bucket: number;
  /** CPU allowance for this tick. */
  readonly limit: number;
  /** CPU already spent this tick. */
  readonly used: number;
}

export type CpuPressure = "healthy" | "strained" | "critical";

/** Bucket below this means we are losing ground and must shed load. */
export const BUCKET_STRAINED = 5000;
export const BUCKET_CRITICAL = 1000;

/** Fraction of the tick limit beyond which optional work is dropped. */
export const TICK_BUDGET_SOFT = 0.6;
export const TICK_BUDGET_HARD = 0.85;

export function cpuPressure(state: CpuState): CpuPressure {
  const spent = state.limit > 0 ? state.used / state.limit : 0;

  if (state.bucket < BUCKET_CRITICAL || spent >= TICK_BUDGET_HARD) return "critical";
  if (state.bucket < BUCKET_STRAINED || spent >= TICK_BUDGET_SOFT) return "strained";
  return "healthy";
}

/**
 * What survives at each pressure level.
 *
 * Defence, spawning and creep actions are never dropped: a tick that skips them
 * costs bodies and eventually the room, which is far more expensive than a
 * tick that skips a construction plan. Planning and telemetry are the two
 * things that can wait, and telemetry goes first because nothing depends on it.
 */
const ALLOWED: Readonly<Record<CpuPressure, readonly WorkClass[]>> = Object.freeze({
  healthy: ["defence", "spawn", "creeps", "build", "telemetry"],
  strained: ["defence", "spawn", "creeps", "build"],
  critical: ["defence", "spawn", "creeps"],
});

export function shouldRun(work: WorkClass, state: CpuState): boolean {
  return ALLOWED[cpuPressure(state)].includes(work);
}

/**
 * True when the bucket is healthy enough to be worth spending down.
 *
 * Screeps only banks CPU up to 10000; once full, unused CPU is simply lost, so
 * a permanently full bucket means we are leaving capability unused.
 */
export function canAffordLuxury(state: CpuState): boolean {
  return state.bucket >= BUCKET_STRAINED && cpuPressure(state) === "healthy";
}

/** One-line summary for the console when pressure is not healthy. */
export function describePressure(state: CpuState): string {
  const pressure = cpuPressure(state);
  const spent = state.limit > 0 ? Math.round((state.used / state.limit) * 100) : 0;
  return `cpu ${pressure}: bucket ${state.bucket}, ${state.used.toFixed(1)}/${state.limit} (${spent}%)`;
}

/**
 * Tower policy and repair prioritisation.
 *
 * Pure: takes flat snapshots of hostiles and structures, returns the action to
 * take. Deciding this here rather than inline in the tower loop means the
 * "heal first, then attack" ordering is a test, not a comment.
 */

export interface HostileView {
  readonly id: string;
  readonly range: number;
  /** HEAL parts. A healer out-repairs a single tower at long range. */
  readonly healParts: number;
  readonly hits: number;
}

export interface DamagedView {
  readonly id: string;
  readonly structureType: string;
  readonly hits: number;
  readonly hitsMax: number;
}

export type TowerAction =
  | { readonly kind: "attack"; readonly targetId: string }
  | { readonly kind: "heal"; readonly targetId: string }
  | { readonly kind: "repair"; readonly targetId: string }
  | { readonly kind: "idle" };

/**
 * Walls and ramparts have absurd hit ceilings -- millions -- so ranking them by
 * percentage would mean towers repair nothing else, ever. They get an absolute
 * target instead.
 */
export const RAMPART_TARGET_HITS = 20_000;

/** Repair anything below this fraction of its maximum. */
export const REPAIR_THRESHOLD = 0.75;

/** Below this, towers stop repairing so they can still fire. */
export const TOWER_ENERGY_RESERVE = 300;

function isBarrier(structureType: string): boolean {
  return structureType === "constructedWall" || structureType === "rampart";
}

/** True when a structure is worth a tower's energy. */
export function needsRepair(structure: DamagedView): boolean {
  if (structure.hitsMax <= 0) return false;
  if (isBarrier(structure.structureType)) {
    return structure.hits < RAMPART_TARGET_HITS;
  }
  return structure.hits / structure.hitsMax < REPAIR_THRESHOLD;
}

/**
 * Rank repair candidates worst-first.
 *
 * Barriers are ranked against a flat target and always sort after real
 * structures: a broken spawn matters more than a thin rampart.
 */
export function rankRepairs(structures: readonly DamagedView[]): DamagedView[] {
  return structures
    .filter(needsRepair)
    .sort((a, b) => {
      const aBarrier = isBarrier(a.structureType);
      const bBarrier = isBarrier(b.structureType);
      if (aBarrier !== bBarrier) return aBarrier ? 1 : -1;

      const aRatio = aBarrier ? a.hits / RAMPART_TARGET_HITS : a.hits / a.hitsMax;
      const bRatio = bBarrier ? b.hits / RAMPART_TARGET_HITS : b.hits / b.hitsMax;
      if (aRatio !== bRatio) return aRatio - bRatio;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/**
 * Pick the hostile to shoot.
 *
 * Healers first regardless of distance: shooting the tank while a healer
 * out-repairs the damage is how a tower wastes an entire siege. Otherwise
 * closest, because tower damage falls off sharply with range.
 */
export function selectHostile(hostiles: readonly HostileView[]): HostileView | undefined {
  if (hostiles.length === 0) return undefined;

  const healers = hostiles.filter((h) => h.healParts > 0);
  const pool = healers.length > 0 ? healers : hostiles;

  return pool.reduce((best, h) => {
    if (h.range !== best.range) return h.range < best.range ? h : best;
    return h.id < best.id ? h : best;
  });
}

/** A friendly creep that has taken damage. */
export interface WoundedView {
  readonly id: string;
  readonly hits: number;
  readonly hitsMax: number;
}

/** The most hurt friendly creep, worst-first, ties broken on id. */
export function selectWounded(wounded: readonly WoundedView[]): WoundedView | undefined {
  const hurt = wounded.filter((c) => c.hitsMax > 0 && c.hits < c.hitsMax);
  if (hurt.length === 0) return undefined;

  return hurt.reduce((best, c) => {
    const cRatio = c.hits / c.hitsMax;
    const bestRatio = best.hits / best.hitsMax;
    if (cRatio !== bestRatio) return cRatio < bestRatio ? c : best;
    return c.id < best.id ? c : best;
  });
}

/**
 * What a tower should do this tick.
 *
 * Attacking always wins. Healing comes next -- a wounded creep is a body we
 * already paid for, and losing it costs far more than the repair would. Repair
 * is last, and stops entirely once the tower is low, so a tower is never caught
 * empty when something arrives.
 */
export function decideTowerAction(
  energy: number,
  hostiles: readonly HostileView[],
  damaged: readonly DamagedView[],
  wounded: readonly WoundedView[] = [],
): TowerAction {
  const hostile = selectHostile(hostiles);
  if (hostile) return { kind: "attack", targetId: hostile.id };

  if (energy < TOWER_ENERGY_RESERVE) return { kind: "idle" };

  const hurt = selectWounded(wounded);
  if (hurt) return { kind: "heal", targetId: hurt.id };

  const repair = rankRepairs(damaged)[0];
  if (repair) return { kind: "repair", targetId: repair.id };

  return { kind: "idle" };
}

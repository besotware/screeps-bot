/**
 * Role definitions and spawn prioritisation.
 *
 * Pure: everything here takes a snapshot and returns a decision. No Screeps
 * globals, no Game object, no side effects.
 *
 * The colony runs two economies and switches between them. Early on there are
 * no containers, so generalist harvesters mine and carry in one body. Once a
 * container exists next to a source, a static miner parks on it and haulers
 * move the energy -- which is strictly more efficient, because a miner never
 * walks and its WORK parts are never idle.
 */

import { ATTACK, CARRY, MOVE, TOUGH, WORK, bodyCost, scaleBody } from "./body";

export const ROLES = ["defender", "harvester", "miner", "hauler", "builder", "upgrader"] as const;
export type Role = (typeof ROLES)[number];

/** How many creeps of each role currently exist, keyed by role. */
export type Census = Readonly<Record<Role, number>>;

export interface RoleSpec {
  /**
   * Parts every creep of this role gets exactly once, before scaling.
   * A miner needs one MOVE and then as much WORK as it can afford; repeating
   * a [WORK, MOVE] pattern would buy MOVE parts it has no use for.
   */
  readonly base: readonly BodyPartConstant[];
  /** Repeated to fill the remaining budget. */
  readonly pattern: readonly BodyPartConstant[];
  /** Lower number spawns first when several roles are short. */
  readonly priority: number;
  /** Cap on pattern repetitions, so one role cannot eat the whole room budget. */
  readonly maxRepeats: number;
  /**
   * When true, a shortfall in this role is filled before any other role,
   * regardless of how large the other deficits are. Reserved for defence: a
   * room being eaten does not care that it is also short four harvesters.
   */
  readonly preempts?: boolean;
}

export const ROLE_SPECS: Readonly<Record<Role, RoleSpec>> = Object.freeze({
  // Melee defender. TOUGH at the front soaks the first hits; the game applies
  // damage in body order, so the ordering here is load-bearing, not cosmetic.
  defender: {
    base: [TOUGH, MOVE],
    pattern: [ATTACK, MOVE],
    priority: 0,
    maxRepeats: 5,
    preempts: true,
  },

  // Generalist bootstrap creep. Mines and carries. Inefficient, but it is the
  // only role that works in a room with no infrastructure at all.
  harvester: { base: [], pattern: [WORK, CARRY, MOVE], priority: 1, maxRepeats: 5 },

  // Static. Parks on a source container and never moves again, so one MOVE is
  // all it will ever need. Five WORK saturates a source (10 energy/tick), so
  // more than that is waste.
  miner: { base: [MOVE], pattern: [WORK], priority: 2, maxRepeats: 5 },

  // Moves energy from source containers to wherever it is needed. Two CARRY per
  // MOVE keeps it at half speed loaded, which is fine on roads and cheap.
  hauler: { base: [], pattern: [CARRY, CARRY, MOVE], priority: 3, maxRepeats: 5 },

  // Builds and repairs. Idles as an upgrader when there is nothing to build.
  builder: { base: [], pattern: [WORK, CARRY, MOVE], priority: 5, maxRepeats: 4 },

  // Converts surplus into RCL. Work-heavy, low mobility needs.
  upgrader: { base: [], pattern: [WORK, WORK, CARRY, MOVE], priority: 4, maxRepeats: 4 },
});

/** An all-zero census, used as a reduce seed and as a test fixture. */
export function emptyCensus(): Census {
  return { defender: 0, harvester: 0, miner: 0, hauler: 0, builder: 0, upgrader: 0 };
}

/** Tally live creeps by role. Unknown or missing roles are ignored, not thrown. */
export function tallyCensus(roles: readonly (string | undefined)[]): Census {
  const census: Record<Role, number> = { ...emptyCensus() };
  for (const role of roles) {
    if (isRole(role)) census[role] += 1;
  }
  return census;
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Everything the spawn planner needs to know about a room. */
export interface ColonyNeeds {
  readonly controllerLevel: number;
  readonly sourceCount: number;
  /** Sources that have a finished container adjacent to them. */
  readonly sourceContainerCount: number;
  readonly constructionSiteCount: number;
  /** Structures below the repair threshold. */
  readonly repairTargetCount: number;
  readonly hasStorage: boolean;
  /** Defenders wanted right now, from the threat assessment. */
  readonly defendersWanted: number;
}

/**
 * Target headcount per role.
 *
 * The interesting rule is the harvester/miner handover. Harvesters are the
 * fallback economy: we want none of them once every source has a miner, but we
 * must not drop to zero while the miner economy is only partly built, or the
 * room stalls with sources it cannot reach.
 */
export function desiredCensus(needs: ColonyNeeds): Census {
  const sources = Math.max(0, needs.sourceCount);
  const containers = Math.max(0, Math.min(needs.sourceContainerCount, sources));

  const miner = containers;

  // One hauler per miner, plus one more once there is a storage to fill --
  // the round trip gets longer as the colony grows outward.
  const hauler = miner === 0 ? 0 : miner + (needs.hasStorage ? 1 : 0);

  // Full miner coverage means harvesters are pure waste. Partial coverage keeps
  // one alive to work the sources no miner has reached yet. No coverage at all
  // means the bootstrap economy, two per source.
  let harvester: number;
  if (sources === 0) {
    harvester = 0;
  } else if (miner === 0) {
    harvester = Math.min(6, sources * 2);
  } else if (miner < sources) {
    harvester = 1;
  } else {
    harvester = 0;
  }

  const wantsBuilder = needs.constructionSiteCount > 0 || needs.repairTargetCount > 0;
  const builder = wantsBuilder ? (needs.controllerLevel >= 3 ? 2 : 1) : 0;

  // Upgrading is the sink for everything left over. More of it once storage
  // exists, because by then the economy can feed it without starving building.
  let upgrader = needs.controllerLevel >= 2 ? 2 : 1;
  if (needs.hasStorage) upgrader = 3;
  if (needs.controllerLevel >= 8) upgrader = 1; // RCL8 caps controller input

  return {
    defender: Math.max(0, needs.defendersWanted),
    harvester,
    miner,
    hauler,
    builder,
    upgrader,
  };
}

/**
 * The role most in need of a body right now, or undefined when the room is at
 * target strength.
 *
 * Ties break on ROLE_SPECS.priority, so a room short of both a harvester and an
 * upgrader always replaces the harvester first.
 */
export function nextRoleToSpawn(current: Census, desired: Census): Role | undefined {
  const short = ROLES.filter((role) => current[role] < desired[role]);
  if (short.length === 0) return undefined;

  // Defence jumps the queue outright. Deficit-ranking is the right rule for an
  // economy and exactly the wrong one under attack, where being four
  // harvesters short is irrelevant if the spawn is being chewed on.
  const preempting = short.filter((role) => ROLE_SPECS[role].preempts);
  const pool = preempting.length > 0 ? preempting : short;

  return pool.reduce((best, role) => {
    const bestDeficit = desired[best] - current[best];
    const roleDeficit = desired[role] - current[role];
    if (roleDeficit > bestDeficit) return role;
    if (roleDeficit < bestDeficit) return best;
    return ROLE_SPECS[role].priority < ROLE_SPECS[best].priority ? role : best;
  });
}

/**
 * Best body for `role` at the given energy level.
 *
 * `energyCapacity` is the room's full capacity, not what is banked right now:
 * it caps how large a body is worth planning. Returns an empty array when even
 * the base parts are unaffordable.
 */
export function planBody(
  role: Role,
  energyAvailable: number,
  energyCapacity: number,
): BodyPartConstant[] {
  const spec = ROLE_SPECS[role];
  const budget = Math.max(0, Math.min(energyAvailable, energyCapacity));

  const baseCost = bodyCost(spec.base);
  if (baseCost > budget) return [];

  const scaled = scaleBody(spec.pattern, budget - baseCost, spec.maxRepeats);
  if (scaled.length === 0) return [];

  return [...spec.base, ...scaled];
}

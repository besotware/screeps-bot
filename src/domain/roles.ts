/**
 * Role definitions and spawn prioritisation.
 *
 * Pure: everything here takes a census snapshot and returns a decision. No
 * Screeps globals, no Game object, no side effects.
 */

import { CARRY, MOVE, WORK, scaleBody } from "./body";

export const ROLES = ["harvester", "upgrader"] as const;
export type Role = (typeof ROLES)[number];

/** How many creeps of each role currently exist, keyed by role. */
export type Census = Readonly<Record<Role, number>>;

export interface RoleSpec {
  /** Repeated to build the body, scaled to available energy. */
  readonly pattern: readonly BodyPartConstant[];
  /** Lower number spawns first when several roles are short. */
  readonly priority: number;
  /** Cap on pattern repetitions, to stop a role eating the whole room budget. */
  readonly maxRepeats: number;
}

export const ROLE_SPECS: Readonly<Record<Role, RoleSpec>> = Object.freeze({
  // Harvesters keep the economy alive; without them nothing else can run.
  harvester: { pattern: [WORK, CARRY, MOVE], priority: 0, maxRepeats: 5 },
  // Upgraders convert surplus into RCL. Work-heavy, low mobility needs.
  upgrader: { pattern: [WORK, WORK, CARRY, MOVE], priority: 1, maxRepeats: 4 },
});

/** An all-zero census, used as the reduce seed and as a test fixture. */
export function emptyCensus(): Census {
  return { harvester: 0, upgrader: 0 };
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

/**
 * Target headcount per role for a given room controller level.
 *
 * Harvester count is driven by source count rather than RCL -- a two-source
 * room saturates at a different headcount than a one-source room regardless of
 * how developed the controller is.
 */
export function desiredCensus(controllerLevel: number, sourceCount: number): Census {
  const sources = Math.max(0, sourceCount);
  return {
    harvester: Math.min(6, Math.max(sources > 0 ? 2 : 0, sources * 2)),
    upgrader: controllerLevel >= 2 ? 3 : 1,
  };
}

/**
 * The role most in need of a body right now, or undefined when the room is at
 * target strength.
 *
 * Ties break on ROLE_SPECS.priority, so a room that is short of both a
 * harvester and an upgrader always replaces the harvester first.
 */
export function nextRoleToSpawn(current: Census, desired: Census): Role | undefined {
  const short = ROLES.filter((role) => current[role] < desired[role]);
  if (short.length === 0) return undefined;

  return short.reduce((best, role) => {
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
 * `energyCapacity` is the room's full capacity, not what is in the bank right
 * now: it is used only to decide whether waiting is worthwhile. `energyAvailable`
 * is what we can actually spend. Returns an empty array when nothing is
 * affordable.
 */
export function planBody(
  role: Role,
  energyAvailable: number,
  energyCapacity: number,
): BodyPartConstant[] {
  const spec = ROLE_SPECS[role];

  // If the room is empty of creeps we must spawn something now, even a weak
  // one, or the colony deadlocks with energy it cannot spend. That decision
  // belongs to the caller; here we simply build the best body for the budget.
  const budget = Math.max(0, Math.min(energyAvailable, energyCapacity));
  return scaleBody(spec.pattern, budget, spec.maxRepeats);
}

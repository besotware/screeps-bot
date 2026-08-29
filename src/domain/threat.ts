/**
 * Threat assessment and the emergency response.
 *
 * Pure. Takes flat views of hostile creeps and returns what the colony should
 * do about them: how many defenders to field, and whether the situation has
 * passed the point where safe mode is the only thing that saves the room.
 */

export interface ThreatView {
  readonly id: string;
  readonly attackParts: number;
  readonly rangedParts: number;
  readonly healParts: number;
  readonly toughParts: number;
  readonly hits: number;
  /** Owner username. NPC raiders are owned by "Invader". */
  readonly owner: string;
}

/** Damage per tick, per the game's part values. */
export const ATTACK_DAMAGE = 30;
export const RANGED_DAMAGE = 10;
export const HEAL_POWER = 12;

export type ThreatLevel = "none" | "nuisance" | "raid" | "siege";

export interface ThreatAssessment {
  readonly level: ThreatLevel;
  readonly hostileCount: number;
  /** Incoming damage per tick if every hostile attacks. */
  readonly incomingDamage: number;
  /** Healing per tick the attackers can apply to themselves. */
  readonly incomingHeal: number;
  /** True when every hostile is an NPC invader rather than a player. */
  readonly npcOnly: boolean;
}

export const NPC_OWNERS: readonly string[] = ["Invader", "Source Keeper"];

/**
 * Classify an attack.
 *
 * The distinction that matters is whether towers alone can win. A lone invader
 * is a nuisance the towers handle; anything that out-heals a tower needs bodies
 * thrown at it, and anything much bigger than that needs safe mode.
 */
export function assessThreat(hostiles: readonly ThreatView[]): ThreatAssessment {
  const incomingDamage = hostiles.reduce(
    (sum, h) => sum + h.attackParts * ATTACK_DAMAGE + h.rangedParts * RANGED_DAMAGE,
    0,
  );
  const incomingHeal = hostiles.reduce((sum, h) => sum + h.healParts * HEAL_POWER, 0);
  const npcOnly = hostiles.every((h) => NPC_OWNERS.includes(h.owner));

  let level: ThreatLevel;
  if (hostiles.length === 0) {
    level = "none";
  } else if (incomingHeal >= 200 || incomingDamage >= 600) {
    // Beyond what a couple of towers plus a handful of defenders can chew
    // through before the spawn falls.
    level = "siege";
  } else if (incomingDamage > 0 || incomingHeal > 0) {
    level = "raid";
  } else {
    // Unarmed: a scout, a claimer, or a harmless passer-by.
    level = "nuisance";
  }

  return { level, hostileCount: hostiles.length, incomingDamage, incomingHeal, npcOnly };
}

/**
 * How many defender creeps to field.
 *
 * Towers do the real damage; defenders exist to body-block and to finish what
 * the towers soften. Spawning defenders against an unarmed scout wastes energy,
 * and spawning them against a siege just feeds the attacker kills.
 */
export function desiredDefenders(assessment: ThreatAssessment, towerCount: number): number {
  switch (assessment.level) {
    case "none":
    case "nuisance":
      return 0;
    case "raid":
      // One defender, plus another if we have no tower support at all.
      return towerCount > 0 ? 1 : 2;
    case "siege":
      // Bodies will not win this; safe mode will. Keep two to buy time.
      return 2;
  }
}

export interface SafeModeInput {
  readonly assessment: ThreatAssessment;
  /** Safe mode activations remaining. */
  readonly available: number;
  /** Game tick the current cooldown expires, if any. */
  readonly cooldownUntil: number;
  readonly tick: number;
  /** True when safe mode is already running. */
  readonly active: boolean;
  /** Fraction of hit points remaining on the weakest spawn, 0..1. */
  readonly spawnIntegrity: number;
}

/**
 * Whether to burn a safe mode activation.
 *
 * Safe mode is a scarce, irreplaceable resource, so the bar is deliberately
 * high: a real player siege that is already eating the spawn. Triggering on
 * every invader would waste all three activations in a week and leave the room
 * defenceless when it actually mattered.
 */
export function shouldActivateSafeMode(input: SafeModeInput): boolean {
  if (input.active) return false;
  if (input.available <= 0) return false;
  if (input.tick < input.cooldownUntil) return false;
  if (input.assessment.level === "none" || input.assessment.level === "nuisance") return false;

  // NPC invaders leave on their own and never break a spawn. Spending safe mode
  // on them is how a colony ends up with none left for a real attack.
  if (input.assessment.npcOnly) return false;

  return input.spawnIntegrity < 0.5;
}

/**
 * Whether economic creeps should stop working and hide.
 *
 * Only under real damage: a fleeing colony produces nothing, so the cure is
 * worse than a lone unarmed hostile wandering through.
 */
export function shouldEvacuate(assessment: ThreatAssessment): boolean {
  return assessment.level === "siege" || assessment.incomingDamage >= 100;
}

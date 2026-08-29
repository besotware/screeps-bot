/**
 * Body-part economics.
 *
 * Deliberately free of Screeps globals: the game exposes BODYPART_COST and the
 * part names (WORK, MOVE, ...) as runtime globals that do not exist under Jest.
 * Restating them as plain data makes every function here a pure function of its
 * arguments, so the unit tests need no runtime and no mocking at all.
 *
 * The literals are typed as BodyPartConstant, so if @types/screeps ever changes
 * the part names, this file stops compiling rather than silently drifting.
 */

export const MOVE: BodyPartConstant = "move";
export const WORK: BodyPartConstant = "work";
export const CARRY: BodyPartConstant = "carry";
export const ATTACK: BodyPartConstant = "attack";
export const RANGED_ATTACK: BodyPartConstant = "ranged_attack";
export const HEAL: BodyPartConstant = "heal";
export const CLAIM: BodyPartConstant = "claim";
export const TOUGH: BodyPartConstant = "tough";

/** Energy cost per body part, per the Screeps game constants. */
export const BODY_PART_COST: Readonly<Record<BodyPartConstant, number>> = Object.freeze({
  move: 50,
  work: 100,
  carry: 50,
  attack: 80,
  ranged_attack: 150,
  heal: 250,
  claim: 600,
  tough: 10,
});

/** Hard game limit: a creep may not exceed 50 body parts. */
export const MAX_BODY_PARTS = 50;

/** Total energy required to spawn `parts`. */
export function bodyCost(parts: readonly BodyPartConstant[]): number {
  return parts.reduce((total, part) => total + BODY_PART_COST[part], 0);
}

/** True when `parts` is a body the game will actually accept. */
export function isSpawnableBody(parts: readonly BodyPartConstant[]): boolean {
  return parts.length > 0 && parts.length <= MAX_BODY_PARTS;
}

/**
 * Repeat `pattern` as many times as `energy` allows, capped at `maxRepeats` and
 * at the 50-part game limit.
 *
 * Returns an empty array when even one repetition is unaffordable -- callers
 * must treat that as "cannot spawn", not as "spawn nothing".
 */
export function scaleBody(
  pattern: readonly BodyPartConstant[],
  energy: number,
  maxRepeats = Infinity,
): BodyPartConstant[] {
  if (pattern.length === 0) return [];

  // No guard on a zero unit cost: every body part costs at least 10, and the
  // empty-pattern case is already handled above, so it cannot happen. A
  // nonsense part would make the cost NaN, and the repeats < 1 check below
  // catches that.
  const unitCost = bodyCost(pattern);

  const affordable = Math.floor(energy / unitCost);
  const partLimit = Math.floor(MAX_BODY_PARTS / pattern.length);
  const repeats = Math.min(affordable, partLimit, maxRepeats);

  if (repeats < 1) return [];

  const body: BodyPartConstant[] = [];
  for (let i = 0; i < repeats; i++) body.push(...pattern);
  return body;
}

/**
 * Order a body so the fragile parts die last.
 *
 * Screeps applies damage to parts in body order, so TOUGH belongs at the front
 * and HEAL at the back. MOVE is spread to the end so a damaged creep retains
 * mobility for as long as possible.
 */
export function orderForSurvivability(parts: readonly BodyPartConstant[]): BodyPartConstant[] {
  const rank: Record<BodyPartConstant, number> = {
    tough: 0,
    work: 1,
    carry: 2,
    attack: 3,
    ranged_attack: 4,
    move: 5,
    heal: 6,
    claim: 7,
  };
  return [...parts].sort((a, b) => rank[a] - rank[b]);
}

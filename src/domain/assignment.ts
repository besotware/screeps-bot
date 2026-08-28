/**
 * Miner-to-source assignment.
 *
 * A static miner owns exactly one source for its whole life. Two miners on one
 * source while another sits idle is the single most expensive mistake this
 * colony can make, so the assignment is explicit rather than emergent.
 */

export interface SourceSlot {
  readonly sourceId: string;
  /** True when a finished container sits next to this source. */
  readonly hasContainer: boolean;
}

/**
 * Pick a source for a new miner: one with a container and no miner yet.
 *
 * `assigned` is the source id each living miner already holds. Returns
 * undefined when every containered source is taken, which is the caller's
 * signal not to spawn another miner.
 */
export function nextSourceForMiner(
  slots: readonly SourceSlot[],
  assigned: readonly (string | undefined)[],
): string | undefined {
  const taken = new Set(assigned.filter((id): id is string => typeof id === "string"));
  return slots.find((slot) => slot.hasContainer && !taken.has(slot.sourceId))?.sourceId;
}

/**
 * Sources that have a container but no living miner.
 *
 * Distinct from nextSourceForMiner: this is the count the spawn planner needs,
 * and it stays correct when several miners die in the same tick.
 */
export function unmannedSources(
  slots: readonly SourceSlot[],
  assigned: readonly (string | undefined)[],
): string[] {
  const taken = new Set(assigned.filter((id): id is string => typeof id === "string"));
  return slots.filter((s) => s.hasContainer && !taken.has(s.sourceId)).map((s) => s.sourceId);
}

/**
 * Detect miners holding a source that no longer exists or has lost its
 * container, so the runtime can reassign rather than leave them parked on
 * nothing.
 */
export function isAssignmentStale(
  sourceId: string | undefined,
  slots: readonly SourceSlot[],
): boolean {
  if (sourceId === undefined) return true;
  const slot = slots.find((s) => s.sourceId === sourceId);
  return slot === undefined || !slot.hasContainer;
}

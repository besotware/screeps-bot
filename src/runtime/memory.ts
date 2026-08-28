/**
 * Memory hygiene. Screeps persists Memory forever, including entries for creeps
 * that died many ticks ago; left alone it grows without bound and the JSON
 * parse cost shows up as CPU.
 */

/**
 * Drop memory entries for creeps that no longer exist.
 *
 * Returns the names that were removed so the caller can log or count them.
 * Takes the two maps as arguments rather than reaching for the globals, which
 * makes it testable with plain objects.
 */
export function pruneCreepMemory(
  creepMemory: Record<string, unknown>,
  liveCreeps: Record<string, unknown>,
): string[] {
  const removed: string[] = [];
  for (const name of Object.keys(creepMemory)) {
    if (!(name in liveCreeps)) {
      delete creepMemory[name];
      removed.push(name);
    }
  }
  return removed;
}

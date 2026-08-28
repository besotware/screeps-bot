/**
 * Entry point. Screeps calls `loop` once per tick.
 *
 * The loop itself is deliberately boring: prune, spawn, run creeps. Anything
 * resembling a decision lives in src/domain and is unit tested without a
 * runtime.
 */

import { runCreep } from "./runtime/creeps";
import { pruneCreepMemory } from "./runtime/memory";
import { runSpawn } from "./runtime/spawning";

export function loop(): void {
  const pruned = pruneCreepMemory(Memory.creeps, Game.creeps);
  if (pruned.length > 0) {
    console.log(`[memory] pruned ${pruned.length} dead creep entries`);
  }

  const creeps = Object.values(Game.creeps);

  for (const spawn of Object.values(Game.spawns)) {
    runSpawn(spawn, creeps);
  }

  for (const creep of creeps) {
    // One bad creep must not take down the tick. Screeps gives no stack
    // unwinding across ticks, so an uncaught throw here costs the whole colony
    // a tick of action.
    try {
      runCreep(creep);
    } catch (error: unknown) {
      console.log(`[loop] ${creep.name} threw: ${String(error)}`);
    }
  }
}

/**
 * Automatic base construction.
 *
 * Places construction sites; creeps build them. The layout decisions are pure
 * (domain/construction); this handles the game API and the rate limiting.
 */

import { extensionsAllowed, planExtensions, planSourceContainer } from "../domain/construction";
import { containerNear, tileLookup } from "./projection";

/**
 * Screeps allows 100 construction sites per player. Queueing more than a few at
 * once just spreads builders thin and leaves half-finished structures
 * everywhere, so the planner tops up to a small number instead.
 */
export const MAX_OPEN_SITES = 5;

/** Run the planner every N ticks; the layout does not change fast. */
export const PLAN_INTERVAL = 50;

export function shouldPlan(tick: number): boolean {
  return tick % PLAN_INTERVAL === 0;
}

/**
 * Queue construction for one room.
 *
 * Source containers come first: they are what moves the colony off the
 * bootstrap economy, and every tick without them is a miner that cannot spawn.
 */
export function planRoom(room: Room): number {
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return 0;

  const open = room.find(FIND_MY_CONSTRUCTION_SITES).length;
  let budget = MAX_OPEN_SITES - open;
  if (budget <= 0) return 0;

  const lookup = tileLookup(room);
  let placed = 0;

  for (const source of room.find(FIND_SOURCES)) {
    if (budget <= 0) break;
    if (containerNear(source.pos)) continue;

    const spot = planSourceContainer(source.pos, spawn.pos, lookup);
    if (!spot) continue;

    if (room.createConstructionSite(spot.x, spot.y, STRUCTURE_CONTAINER) === OK) {
      console.log(`[build] ${room.name} container site at ${spot.x},${spot.y}`);
      placed += 1;
      budget -= 1;
    }
  }

  if (budget > 0) placed += planExtensionSites(room, spawn, budget, lookup);

  return placed;
}

function planExtensionSites(
  room: Room,
  spawn: StructureSpawn,
  budget: number,
  lookup: ReturnType<typeof tileLookup>,
): number {
  const level = room.controller?.level ?? 0;
  const allowed = extensionsAllowed(level);

  const built = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_EXTENSION,
  }).length;
  const queued = room.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: (s) => s.structureType === STRUCTURE_EXTENSION,
  }).length;

  const remaining = Math.min(budget, allowed - built - queued);
  if (remaining <= 0) return 0;

  let placed = 0;
  for (const spot of planExtensions(spawn.pos, remaining, lookup)) {
    if (room.createConstructionSite(spot.x, spot.y, STRUCTURE_EXTENSION) === OK) {
      console.log(`[build] ${room.name} extension site at ${spot.x},${spot.y}`);
      placed += 1;
    }
  }
  return placed;
}

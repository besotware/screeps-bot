/**
 * Spawn management. Decides nothing itself -- it projects room state, asks the
 * domain what is missing, and issues the spawn intent.
 */

import { desiredCensus, nextRoleToSpawn, planBody, tallyCensus } from "../domain/roles";
import type { Role } from "../domain/roles";
import { nextSourceForMiner } from "../domain/assignment";
import { isBootstrapEmergency, spawnBudget } from "../domain/state";
import { projectNeeds, projectRoom, projectSourceSlots } from "./projection";
import { assessRoom, defendersNeeded } from "./threat";

export interface SpawnOutcome {
  readonly role: Role;
  readonly name: string;
  readonly body: BodyPartConstant[];
  readonly code: ScreepsReturnCode;
  /** Set for miners: the source this creep owns for life. */
  readonly sourceId?: string;
}

/**
 * Run one spawn for one tick.
 *
 * Returns the attempted spawn, or undefined when the room is at strength, the
 * spawn is busy, or nothing is affordable yet.
 */
export function runSpawn(
  spawn: StructureSpawn,
  ownedCreeps: readonly Creep[],
): SpawnOutcome | undefined {
  if (spawn.spawning) return undefined;

  const roomCreeps = ownedCreeps.filter((creep) => creep.memory.home === spawn.room.name);
  const snapshot = projectRoom(spawn.room, roomCreeps.length);

  const current = tallyCensus(roomCreeps.map((creep) => creep.memory.role));
  const assessment = assessRoom(spawn.room);
  const desired = desiredCensus(
    projectNeeds(spawn.room, defendersNeeded(spawn.room, assessment)),
  );

  const role = nextRoleToSpawn(current, desired);
  if (!role) return undefined;

  const budget = spawnBudget(snapshot);
  if (budget <= 0) return undefined;

  const body = planBody(role, budget, snapshot.energyCapacityAvailable);
  if (body.length === 0) {
    if (isBootstrapEmergency(snapshot)) {
      console.log(`[spawn] ${spawn.room.name} bootstrap stalled: ${budget} energy buys nothing`);
    }
    return undefined;
  }

  // A miner without a source is a body that stands still forever, so the
  // assignment is resolved before the spawn rather than after it.
  let sourceId: string | undefined;
  if (role === "miner") {
    const assigned = roomCreeps
      .filter((creep) => creep.memory.role === "miner")
      .map((creep) => creep.memory.sourceId);
    sourceId = nextSourceForMiner(projectSourceSlots(spawn.room), assigned);
    if (!sourceId) return undefined;
  }

  const name = `${role}-${Game.time.toString(36)}`;
  const memory: CreepMemory = {
    role,
    home: spawn.room.name,
    mode: "gathering",
    ...(sourceId ? { sourceId } : {}),
  };

  const code = spawn.spawnCreep(body, name, { memory });

  if (code === OK) {
    const where = sourceId ? ` -> ${sourceId}` : "";
    console.log(`[spawn] ${spawn.room.name} spawning ${name} (${body.length} parts)${where}`);
  }

  return { role, name, body, code, ...(sourceId ? { sourceId } : {}) };
}

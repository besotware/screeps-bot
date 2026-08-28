/**
 * Spawn management. Decides nothing itself -- it projects room state, asks the
 * domain what is missing, and issues the spawn intent.
 */

import { desiredCensus, nextRoleToSpawn, planBody, tallyCensus } from "../domain/roles";
import type { Role } from "../domain/roles";
import { isBootstrapEmergency, spawnBudget } from "../domain/state";
import { projectRoom } from "./projection";

export interface SpawnOutcome {
  readonly role: Role;
  readonly name: string;
  readonly body: BodyPartConstant[];
  readonly code: ScreepsReturnCode;
}

/**
 * Run one spawn for one tick.
 *
 * Returns the attempted spawn, or undefined when the room is at strength, the
 * spawn is busy, or nothing is affordable yet.
 */
export function runSpawn(spawn: StructureSpawn, ownedCreeps: readonly Creep[]): SpawnOutcome | undefined {
  if (spawn.spawning) return undefined;

  const roomCreeps = ownedCreeps.filter((creep) => creep.memory.home === spawn.room.name);
  const snapshot = projectRoom(spawn.room, roomCreeps.length);

  const current = tallyCensus(roomCreeps.map((creep) => creep.memory.role));
  const desired = desiredCensus(snapshot.controllerLevel, snapshot.sourceCount);

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

  const name = `${role}-${Game.time.toString(36)}`;
  const code = spawn.spawnCreep(body, name, {
    memory: { role, home: spawn.room.name, mode: "gathering" },
  });

  if (code === OK) {
    console.log(`[spawn] ${spawn.room.name} spawning ${name} (${body.length} parts)`);
  }

  return { role, name, body, code };
}

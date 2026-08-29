/**
 * Defender behaviour.
 *
 * Defenders hold ground near the spawn rather than chasing. Chasing a faster
 * attacker across the room is how a defender ends up alone, out of tower range,
 * and dead -- towers are the actual weapon, and a defender's job is to hold the
 * attacker inside their envelope.
 */

import { selectHostile } from "../domain/defense";
import { projectHostiles } from "./projection";

const MOVE_OPTS: MoveToOpts = {
  reusePath: 5,
  visualizePathStyle: { stroke: "#ff0000", opacity: 0.3 },
};

/** How far from the rally point a defender will pursue before turning back. */
export const PURSUIT_LIMIT = 10;

export function runDefender(creep: Creep): void {
  const rally = creep.room.find(FIND_MY_SPAWNS)[0]?.pos ?? creep.room.controller?.pos;
  const target = selectHostile(projectHostiles(creep.room, creep.pos));

  if (!target) {
    // Nothing to fight. Sit near the spawn so the response time is short.
    if (rally && creep.pos.getRangeTo(rally) > 3) creep.moveTo(rally, MOVE_OPTS);
    return;
  }

  const hostile = Game.getObjectById(target.id as Id<Creep>);
  if (!hostile) return;

  // Refuse to be drawn out of the defended area.
  if (rally && rally.getRangeTo(hostile.pos) > PURSUIT_LIMIT) {
    if (creep.pos.getRangeTo(rally) > 3) creep.moveTo(rally, MOVE_OPTS);
    return;
  }

  if (creep.attack(hostile) === ERR_NOT_IN_RANGE) {
    creep.moveTo(hostile, MOVE_OPTS);
  }
}

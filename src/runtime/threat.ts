/**
 * Threat runtime: projects hostiles, decides the emergency response, and pulls
 * the safe-mode lever when the room is genuinely being lost.
 */

import {
  assessThreat,
  desiredDefenders,
  shouldActivateSafeMode,
  shouldEvacuate,
} from "../domain/threat";
import type { ThreatAssessment, ThreatView } from "../domain/threat";

/** Flatten hostile creeps into the view the assessment consumes. */
export function projectThreats(room: Room): ThreatView[] {
  return room.find(FIND_HOSTILE_CREEPS).map((creep) => {
    const count = (part: BodyPartConstant): number =>
      creep.body.filter((p) => p.type === part).length;
    return {
      id: creep.id,
      attackParts: count(ATTACK),
      rangedParts: count(RANGED_ATTACK),
      healParts: count(HEAL),
      toughParts: count(TOUGH),
      hits: creep.hits,
      owner: creep.owner?.username ?? "unknown",
    };
  });
}

export function assessRoom(room: Room): ThreatAssessment {
  return assessThreat(projectThreats(room));
}

/** How many towers this room has, which changes how many defenders we need. */
export function countTowers(room: Room): number {
  return room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_TOWER,
  }).length;
}

export function defendersNeeded(room: Room, assessment: ThreatAssessment): number {
  return desiredDefenders(assessment, countTowers(room));
}

/**
 * Consider safe mode. Returns true when it was actually activated.
 *
 * Deliberately noisy: burning an activation is a significant, irreversible
 * event and should never happen quietly.
 */
export function considerSafeMode(room: Room, assessment: ThreatAssessment): boolean {
  const controller = room.controller;
  if (!controller || !controller.my) return false;

  const spawns = room.find(FIND_MY_SPAWNS);
  const integrity =
    spawns.length === 0
      ? 0
      : Math.min(...spawns.map((s) => (s.hitsMax > 0 ? s.hits / s.hitsMax : 1)));

  const wanted = shouldActivateSafeMode({
    assessment,
    available: controller.safeModeAvailable ?? 0,
    cooldownUntil: controller.safeModeCooldown ?? 0,
    tick: Game.time,
    active: (controller.safeMode ?? 0) > 0,
    spawnIntegrity: integrity,
  });

  if (!wanted) return false;

  const code = controller.activateSafeMode();
  if (code === OK) {
    console.log(
      `[SAFE MODE] ${room.name} activated -- ${assessment.hostileCount} hostiles, ` +
        `${assessment.incomingDamage} dmg/tick, spawn at ${Math.round(integrity * 100)}%`,
    );
    return true;
  }

  console.log(`[SAFE MODE] ${room.name} activation failed with ${code}`);
  return false;
}

/** Where a creep should run to when the room is being overrun. */
export function evacuationPoint(room: Room): RoomPosition | undefined {
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  return spawn?.pos ?? room.controller?.pos;
}

/**
 * Per-tick threat cache.
 *
 * Every economic creep asks whether it should flee, and re-scanning the room
 * for each one is pure waste -- the answer cannot change within a tick.
 */
const cache = new Map<string, { tick: number; assessment: ThreatAssessment }>();

export function roomThreat(room: Room): ThreatAssessment {
  const hit = cache.get(room.name);
  if (hit && hit.tick === Game.time) return hit.assessment;

  const assessment = assessRoom(room);
  cache.set(room.name, { tick: Game.time, assessment });
  return assessment;
}

/** Test seam: drop the cache so a fresh tick is not served a stale answer. */
export function clearThreatCache(): void {
  cache.clear();
}

export { shouldEvacuate };

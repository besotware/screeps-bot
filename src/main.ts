/**
 * Entry point. Screeps calls `loop` once per tick.
 *
 * The loop itself is deliberately boring: prune, plan, spawn, run, report.
 * Anything resembling a decision lives in src/domain and is unit tested without
 * a runtime.
 */

import { planRoom, shouldPlan } from "./runtime/building";
import { runCreep } from "./runtime/creeps";
import { pruneCreepMemory } from "./runtime/memory";
import { runSpawn } from "./runtime/spawning";
import { buildReport, drawOverlay, reportRoom } from "./runtime/telemetry";
import { runTower } from "./runtime/towers";
import { assessRoom, considerSafeMode } from "./runtime/threat";
import { cpuPressure, describePressure, shouldRun } from "./domain/cpu";
import type { CpuState } from "./domain/cpu";

/** Read the current CPU position. Cheap, and called several times a tick. */
function cpu(): CpuState {
  return {
    bucket: Game.cpu.bucket ?? 0,
    limit: Game.cpu.limit,
    used: Game.cpu.getUsed(),
  };
}

export function loop(): void {
  const pruned = pruneCreepMemory(Memory.creeps, Game.creeps);
  if (pruned.length > 0) {
    console.log(`[memory] pruned ${pruned.length} dead creep entries`);
  }

  const creeps = Object.values(Game.creeps);

  // Rooms we own, derived from spawns rather than Game.rooms -- Game.rooms
  // includes rooms we merely have vision into.
  const rooms = new Map<string, Room>();
  for (const spawn of Object.values(Game.spawns)) {
    rooms.set(spawn.room.name, spawn.room);
  }

  for (const room of rooms.values()) {
    guard(`plan ${room.name}`, () => {
      // Planning is the first thing dropped under CPU pressure: a tick without
      // a construction plan costs nothing that a later tick cannot recover.
      if (shouldPlan(Game.time) && shouldRun("build", cpu())) planRoom(room);
    });

    // Defence before anything economic: a room being lost does not benefit
    // from a well-planned extension layout.
    guard(`defence ${room.name}`, () => {
      const assessment = assessRoom(room);
      if (assessment.level !== "none") {
        considerSafeMode(room, assessment);
      }
    });

    guard(`towers ${room.name}`, () => {
      const towers = room.find<StructureTower>(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_TOWER,
      });
      for (const tower of towers) runTower(tower);
    });
  }

  for (const spawn of Object.values(Game.spawns)) {
    guard(`spawn ${spawn.name}`, () => runSpawn(spawn, creeps));
  }

  for (const creep of creeps) {
    guard(creep.name, () => runCreep(creep));
  }

  // Telemetry last, so CPU reflects the whole tick.
  const state = cpu();
  if (cpuPressure(state) !== "healthy") {
    console.log(`[cpu] ${describePressure(state)}`);
  }

  for (const room of rooms.values()) {
    if (!shouldRun("telemetry", cpu())) continue;
    guard(`report ${room.name}`, () => {
      const roomCreeps = creeps.filter((c) => c.memory.home === room.name);
      const report = buildReport(room, roomCreeps);
      reportRoom(report);
      drawOverlay(room, report);
    });
  }
}

/**
 * Run one unit of work, containing any throw.
 *
 * Screeps gives no stack unwinding across ticks: an uncaught throw costs the
 * whole colony a tick of action. One bad creep must not stop the spawn.
 */
function guard(label: string, work: () => void): void {
  try {
    work();
  } catch (error: unknown) {
    console.log(`[loop] ${label} threw: ${String(error)}`);
  }
}

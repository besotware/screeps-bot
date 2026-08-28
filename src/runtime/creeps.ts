/**
 * Creep behaviour. Each role is a thin executor: work out the mode with the
 * pure state machine, pick a target with the pure selectors, then issue intents.
 */

import { nextWorkMode } from "../domain/state";
import { selectEnergySink, selectEnergySource } from "../domain/targets";
import type { Role } from "../domain/roles";
import { projectEnergySinks, projectSources } from "./projection";

/** Visual feedback in the client; also the cheapest possible debugging aid. */
const SAY = { gathering: "⛏", delivering: "↺", upgrading: "⚡" } as const;

const MOVE_OPTS: MoveToOpts = {
  reusePath: 15,
  visualizePathStyle: { stroke: "#ffaa00", opacity: 0.15 },
};

export function runCreep(creep: Creep): void {
  if (creep.spawning) return;

  const role = creep.memory.role as Role | undefined;
  switch (role) {
    case "harvester":
      runHarvester(creep);
      return;
    case "upgrader":
      runUpgrader(creep);
      return;
    default:
      // An unrecognised role is a bug, not a runtime condition. Make it loud
      // rather than silently idling a creep for its whole 1500-tick life.
      console.log(`[creeps] ${creep.name} has unknown role ${String(role)}`);
      return;
  }
}

/** Advance the gather/deliver cycle and report the resulting mode. */
function syncWorkMode(creep: Creep): "gathering" | "delivering" {
  const mode = nextWorkMode({
    mode: creep.memory.mode ?? "gathering",
    carried: creep.store.getUsedCapacity(RESOURCE_ENERGY),
    capacity: creep.store.getCapacity(RESOURCE_ENERGY),
  });

  if (mode !== creep.memory.mode) {
    creep.memory.mode = mode;
    creep.say(SAY[mode]);
  }
  return mode;
}

function gather(creep: Creep): void {
  const target = selectEnergySource(projectSources(creep));
  if (!target) return;

  const source = Game.getObjectById(target.id as Id<Source>);
  if (!source) return;

  if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
    creep.moveTo(source, MOVE_OPTS);
  }
}

function runHarvester(creep: Creep): void {
  if (syncWorkMode(creep) === "gathering") {
    gather(creep);
    return;
  }

  const target = selectEnergySink(projectEnergySinks(creep));
  if (!target) {
    // Nothing needs energy. Park at the controller so the creep is useful the
    // moment an extension frees up, rather than blocking a spawn tile.
    const controller = creep.room.controller;
    if (controller) creep.moveTo(controller, MOVE_OPTS);
    return;
  }

  const structure = Game.getObjectById(target.id as Id<Structure>);
  if (!structure) return;

  if (creep.transfer(structure, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
    creep.moveTo(structure, MOVE_OPTS);
  }
}

function runUpgrader(creep: Creep): void {
  if (syncWorkMode(creep) === "gathering") {
    gather(creep);
    return;
  }

  const controller = creep.room.controller;
  if (!controller) return;

  if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
    creep.moveTo(controller, MOVE_OPTS);
  }
}

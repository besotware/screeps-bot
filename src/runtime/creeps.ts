/**
 * Creep behaviour. Each role is a thin executor: work out the mode with the
 * pure state machine, pick a target with the pure selectors, then issue intents.
 */

import { nextWorkMode } from "../domain/state";
import { selectEnergySink, selectEnergySource, selectPickup } from "../domain/targets";
import { rankRepairs } from "../domain/defense";
import type { Role } from "../domain/roles";
import {
  containerNear,
  projectDamaged,
  projectEnergySinks,
  projectPickups,
  projectSources,
} from "./projection";

/** Visual feedback in the client; also the cheapest possible debugging aid. */
const SAY = { gathering: "⛏", delivering: "↺" } as const;

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
    case "miner":
      runMiner(creep);
      return;
    case "hauler":
      runHauler(creep);
      return;
    case "builder":
      runBuilder(creep);
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

/** Harvest from the best available source. Used by the bootstrap roles. */
function gather(creep: Creep): void {
  const target = selectEnergySource(projectSources(creep));
  if (!target) return;

  const source = Game.getObjectById(target.id as Id<Source>);
  if (!source) return;

  if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
    creep.moveTo(source, MOVE_OPTS);
  }
}

/** Collect from the floor, a tombstone, a container or storage. */
function collect(creep: Creep): boolean {
  const target = selectPickup(projectPickups(creep));
  if (!target) return false;

  const object = Game.getObjectById(target.id as Id<Resource | Structure | Tombstone>);
  if (!object) return false;

  const code =
    target.kind === "dropped"
      ? creep.pickup(object as Resource)
      : creep.withdraw(object as StructureContainer, RESOURCE_ENERGY);

  if (code === ERR_NOT_IN_RANGE) creep.moveTo(object, MOVE_OPTS);
  return true;
}

/** Put energy into whatever most needs it. Returns false when nothing does. */
function deliver(creep: Creep): boolean {
  const target = selectEnergySink(projectEnergySinks(creep));
  if (!target) return false;

  const structure = Game.getObjectById(target.id as Id<Structure>);
  if (!structure) return false;

  if (creep.transfer(structure, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
    creep.moveTo(structure, MOVE_OPTS);
  }
  return true;
}

function runHarvester(creep: Creep): void {
  if (syncWorkMode(creep) === "gathering") {
    gather(creep);
    return;
  }
  if (deliver(creep)) return;

  // Nothing needs energy. Park at the controller so the creep is useful the
  // moment an extension frees up, rather than blocking a spawn tile.
  const controller = creep.room.controller;
  if (controller) creep.moveTo(controller, MOVE_OPTS);
}

/**
 * Static miner. Walks to its container once, then harvests forever, dropping
 * into the container beneath it.
 */
function runMiner(creep: Creep): void {
  const sourceId = creep.memory.sourceId;
  if (!sourceId) {
    console.log(`[creeps] miner ${creep.name} has no source assignment`);
    return;
  }

  const source = Game.getObjectById(sourceId as Id<Source>);
  if (!source) return;

  const container = containerNear(source.pos);

  // Stand on the container so harvested energy lands in it automatically --
  // that is what makes a miner cost nothing to collect from.
  if (container && !creep.pos.isEqualTo(container.pos)) {
    creep.moveTo(container, MOVE_OPTS);
    return;
  }

  if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
    creep.moveTo(source, MOVE_OPTS);
  }
}

/** Moves energy from where it is to where it is needed. */
function runHauler(creep: Creep): void {
  if (syncWorkMode(creep) === "gathering") {
    collect(creep);
    return;
  }
  if (deliver(creep)) return;

  // Everything is full. Feed the controller rather than idling -- a parked
  // hauler is a body that cost energy and returns nothing.
  const controller = creep.room.controller;
  if (!controller) return;
  if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
    creep.moveTo(controller, MOVE_OPTS);
  }
}

/** Builds construction sites, repairs when there is nothing to build. */
function runBuilder(creep: Creep): void {
  if (syncWorkMode(creep) === "gathering") {
    // Prefer stored energy so builders do not compete with miners for sources.
    if (!collect(creep)) gather(creep);
    return;
  }

  const site = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES);
  if (site) {
    if (creep.build(site) === ERR_NOT_IN_RANGE) creep.moveTo(site, MOVE_OPTS);
    return;
  }

  const worst = rankRepairs(projectDamaged(creep.room))[0];
  if (worst) {
    const structure = Game.getObjectById(worst.id as Id<Structure>);
    if (structure) {
      if (creep.repair(structure) === ERR_NOT_IN_RANGE) creep.moveTo(structure, MOVE_OPTS);
      return;
    }
  }

  // Nothing to build or repair: fall back to upgrading.
  runUpgrader(creep);
}

function runUpgrader(creep: Creep): void {
  if (syncWorkMode(creep) === "gathering") {
    if (!collect(creep)) gather(creep);
    return;
  }

  const controller = creep.room.controller;
  if (!controller) return;

  if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
    creep.moveTo(controller, MOVE_OPTS);
  }
}

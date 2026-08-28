/**
 * Projection layer: turns live Screeps objects into the flat snapshots the pure
 * domain functions consume.
 *
 * This is the only place allowed to know about both worlds. Keeping it small
 * and dumb is what lets the domain stay free of the Game global.
 */

import type { EnergyPickup, EnergySink, EnergySource } from "../domain/targets";
import type { ColonyNeeds } from "../domain/roles";
import type { RoomSnapshot } from "../domain/state";
import type { SourceSlot } from "../domain/assignment";
import type { DamagedView, HostileView, WoundedView } from "../domain/defense";
import { needsRepair } from "../domain/defense";
import type { Point, TileView } from "../domain/construction";

export function projectRoom(room: Room, creepCount: number): RoomSnapshot {
  return {
    controllerLevel: room.controller?.level ?? 0,
    sourceCount: room.find(FIND_SOURCES).length,
    energyAvailable: room.energyAvailable,
    energyCapacityAvailable: room.energyCapacityAvailable,
    creepCount,
  };
}

/** Everything the spawn planner needs, in one room scan. */
export function projectNeeds(room: Room): ColonyNeeds {
  return {
    controllerLevel: room.controller?.level ?? 0,
    sourceCount: room.find(FIND_SOURCES).length,
    sourceContainerCount: projectSourceSlots(room).filter((s) => s.hasContainer).length,
    constructionSiteCount: room.find(FIND_MY_CONSTRUCTION_SITES).length,
    repairTargetCount: projectDamaged(room).length,
    hasStorage: room.storage !== undefined,
  };
}

/** Which sources have a finished container beside them. */
export function projectSourceSlots(room: Room): SourceSlot[] {
  return room.find(FIND_SOURCES).map((source) => ({
    sourceId: source.id,
    hasContainer: containerNear(source.pos) !== undefined,
  }));
}

/** The container adjacent to a position, if any. */
export function containerNear(pos: RoomPosition): StructureContainer | undefined {
  const found = pos.findInRange<StructureContainer>(FIND_STRUCTURES, 1, {
    filter: (s: AnyStructure) => s.structureType === STRUCTURE_CONTAINER,
  });
  return found[0];
}

export function projectSources(creep: Creep): EnergySource[] {
  return creep.room.find(FIND_SOURCES).map((source) => ({
    id: source.id,
    energy: source.energy,
    range: creep.pos.getRangeTo(source),
    openSpots: countOpenSpots(source),
  }));
}

export function projectEnergySinks(creep: Creep): EnergySink[] {
  const structures = creep.room.find(FIND_MY_STRUCTURES, {
    filter: (structure): boolean => {
      const store = (structure as { store?: StoreDefinition }).store;
      return store !== undefined && store.getFreeCapacity(RESOURCE_ENERGY) > 0;
    },
  });

  return structures.map((structure) => {
    const store = (structure as unknown as { store: StoreDefinition }).store;
    return {
      id: structure.id,
      structureType: structure.structureType,
      free: store.getFreeCapacity(RESOURCE_ENERGY) ?? 0,
      range: creep.pos.getRangeTo(structure),
    };
  });
}

/**
 * Everywhere a hauler could collect energy: the floor, tombstones, containers
 * and storage.
 */
export function projectPickups(creep: Creep): EnergyPickup[] {
  const out: EnergyPickup[] = [];

  for (const resource of creep.room.find(FIND_DROPPED_RESOURCES)) {
    if (resource.resourceType !== RESOURCE_ENERGY) continue;
    out.push({
      id: resource.id,
      kind: "dropped",
      amount: resource.amount,
      range: creep.pos.getRangeTo(resource),
    });
  }

  for (const tomb of creep.room.find(FIND_TOMBSTONES)) {
    const amount = tomb.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    if (amount <= 0) continue;
    out.push({ id: tomb.id, kind: "tombstone", amount, range: creep.pos.getRangeTo(tomb) });
  }

  const stores = creep.room.find(FIND_STRUCTURES, {
    filter: (s: AnyStructure) =>
      s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE,
  });

  for (const structure of stores) {
    const store = (structure as unknown as { store: StoreDefinition }).store;
    const amount = store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    if (amount <= 0) continue;
    out.push({
      id: structure.id,
      kind: structure.structureType === STRUCTURE_STORAGE ? "storage" : "container",
      amount,
      range: creep.pos.getRangeTo(structure),
    });
  }

  return out;
}

/** Structures worth repairing, as flat views. */
export function projectDamaged(room: Room): DamagedView[] {
  return room
    .find(FIND_STRUCTURES)
    .map((s) => ({
      id: s.id,
      structureType: s.structureType,
      hits: s.hits,
      hitsMax: s.hitsMax,
    }))
    .filter(needsRepair);
}

/** Hostile creeps, with the HEAL count that drives target selection. */
export function projectHostiles(room: Room, from: RoomPosition): HostileView[] {
  return room.find(FIND_HOSTILE_CREEPS).map((creep) => ({
    id: creep.id,
    range: from.getRangeTo(creep),
    healParts: creep.body.filter((part) => part.type === HEAL).length,
    hits: creep.hits,
  }));
}

/** Friendly creeps that have taken damage. */
export function projectWounded(room: Room): WoundedView[] {
  return room
    .find(FIND_MY_CREEPS)
    .map((creep) => ({ id: creep.id, hits: creep.hits, hitsMax: creep.hitsMax }))
    .filter((c) => c.hits < c.hitsMax);
}

/**
 * Tile inspector for the base planner: reports terrain and whether anything
 * already stands there.
 */
export function tileLookup(room: Room): (p: Point) => TileView {
  const terrain = room.getTerrain();
  return (p: Point): TileView => {
    if (p.x < 0 || p.x > 49 || p.y < 0 || p.y > 49) {
      return { wall: true, occupied: true };
    }
    const structures = room.lookForAt(LOOK_STRUCTURES, p.x, p.y);
    const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, p.x, p.y);
    // Roads and containers are walkable and do not block a build slot for
    // planning purposes; anything else does.
    const blocking = structures.filter(
      (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART,
    );
    return {
      wall: terrain.get(p.x, p.y) === TERRAIN_MASK_WALL,
      occupied: blocking.length > 0 || sites.length > 0,
    };
  };
}

/**
 * How many creeps can physically mine this source: walkable adjacent tiles,
 * minus the ones already occupied.
 */
function countOpenSpots(source: Source): number {
  const terrain = source.room.getTerrain();
  let open = 0;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const x = source.pos.x + dx;
      const y = source.pos.y + dy;
      if (x < 0 || x > 49 || y < 0 || y > 49) continue;
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
      open += 1;
    }
  }

  const occupied = source.pos.findInRange(FIND_MY_CREEPS, 1).length;
  return Math.max(0, open - occupied);
}

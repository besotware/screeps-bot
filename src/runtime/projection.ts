/**
 * Projection layer: turns live Screeps objects into the flat snapshots the pure
 * domain functions consume.
 *
 * This is the only place allowed to know about both worlds. Keeping it small
 * and dumb is what lets the domain stay free of the Game global.
 */

import type { EnergySink, EnergySource } from "../domain/targets";
import type { RoomSnapshot } from "../domain/state";

export function projectRoom(room: Room, creepCount: number): RoomSnapshot {
  return {
    controllerLevel: room.controller?.level ?? 0,
    sourceCount: room.find(FIND_SOURCES).length,
    energyAvailable: room.energyAvailable,
    energyCapacityAvailable: room.energyCapacityAvailable,
    creepCount,
  };
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

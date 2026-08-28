/**
 * Tower operation. The policy lives in domain/defense; this just executes it.
 */

import { decideTowerAction } from "../domain/defense";
import { projectDamaged, projectHostiles, projectWounded } from "./projection";

export function runTower(tower: StructureTower): void {
  const energy = tower.store.getUsedCapacity(RESOURCE_ENERGY);
  const hostiles = projectHostiles(tower.room, tower.pos);
  const damaged = projectDamaged(tower.room);

  const wounded = projectWounded(tower.room);

  const action = decideTowerAction(energy, hostiles, damaged, wounded);

  switch (action.kind) {
    case "attack": {
      const target = Game.getObjectById(action.targetId as Id<Creep>);
      if (target) {
        tower.attack(target);
        console.log(`[tower] ${tower.room.name} firing on ${target.name}`);
      }
      return;
    }
    case "repair": {
      const target = Game.getObjectById(action.targetId as Id<Structure>);
      if (target) tower.repair(target);
      return;
    }
    case "heal": {
      const target = Game.getObjectById(action.targetId as Id<Creep>);
      if (target) tower.heal(target);
      return;
    }
    case "idle":
      return;
  }
}

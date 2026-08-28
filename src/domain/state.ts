/**
 * Creep and room state transitions.
 *
 * Pure. The runtime layer reads the live objects, calls these, and acts on the
 * result.
 */

/** The two halves of every economic creep's cycle. */
export type WorkMode = "gathering" | "delivering";

export interface CarryState {
  readonly mode: WorkMode;
  /** Energy the creep is carrying. */
  readonly carried: number;
  /** Total carry capacity. */
  readonly capacity: number;
}

/**
 * Flip between gathering and delivering.
 *
 * Hysteresis is deliberate: switch to delivering only when full, and back to
 * gathering only when empty. Switching on a partial load makes creeps oscillate
 * mid-route and burns CPU on repathing for a handful of energy.
 */
export function nextWorkMode(state: CarryState): WorkMode {
  const { mode, carried, capacity } = state;

  if (mode === "gathering" && capacity > 0 && carried >= capacity) return "delivering";
  if (mode === "delivering" && carried <= 0) return "gathering";
  return mode;
}

export interface RoomSnapshot {
  readonly controllerLevel: number;
  readonly sourceCount: number;
  readonly energyAvailable: number;
  readonly energyCapacityAvailable: number;
  readonly creepCount: number;
}

/**
 * True when the room has no creeps left and must spawn immediately with
 * whatever energy it has, rather than saving for a better body.
 *
 * Without this the colony can deadlock: no creeps means no harvesting, so the
 * energy needed for the "good" body never arrives.
 */
export function isBootstrapEmergency(room: RoomSnapshot): boolean {
  return room.creepCount === 0;
}

/**
 * Energy we are willing to spend on a spawn this tick.
 *
 * Normally we wait until the room is at full capacity so bodies are as large as
 * the room can support. In a bootstrap emergency we spend whatever is present.
 */
export function spawnBudget(room: RoomSnapshot): number {
  if (isBootstrapEmergency(room)) return room.energyAvailable;
  return room.energyAvailable >= room.energyCapacityAvailable ? room.energyAvailable : 0;
}

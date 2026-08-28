/**
 * Target prioritisation.
 *
 * The Screeps API hands back live objects; these functions work on flat
 * snapshots of the properties that actually drive the decision. main.ts is
 * responsible for the projection, which keeps the ranking rules testable
 * without constructing fake RoomObjects.
 */

/** A structure that can accept energy. */
export interface EnergySink {
  readonly id: string;
  readonly structureType: string;
  /** Free capacity for energy, in units. */
  readonly free: number;
  /** Range from the creep, in tiles. */
  readonly range: number;
}

/** A source a creep can draw from. */
export interface EnergySource {
  readonly id: string;
  /** Energy currently available at the source. */
  readonly energy: number;
  /** Range from the creep, in tiles. */
  readonly range: number;
  /** Free tiles adjacent to the source, i.e. how many creeps can mine it. */
  readonly openSpots: number;
}

/**
 * Refill order: spawns and extensions first, then towers, then everything else.
 *
 * Spawn capacity gates the whole colony, so it outranks a tower that is merely
 * low. Within a tier, the nearest target wins; ties break on id so the ordering
 * is total and the tests are deterministic.
 */
const SINK_TIER: Readonly<Record<string, number>> = Object.freeze({
  spawn: 0,
  extension: 0,
  tower: 1,
});

const DEFAULT_SINK_TIER = 2;

export function sinkTier(structureType: string): number {
  return SINK_TIER[structureType] ?? DEFAULT_SINK_TIER;
}

/** Rank energy sinks best-first. Sinks with no free capacity are dropped. */
export function rankEnergySinks(sinks: readonly EnergySink[]): EnergySink[] {
  return sinks
    .filter((sink) => sink.free > 0)
    .sort((a, b) => {
      const tier = sinkTier(a.structureType) - sinkTier(b.structureType);
      if (tier !== 0) return tier;
      if (a.range !== b.range) return a.range - b.range;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/** The single best sink, or undefined when nothing needs energy. */
export function selectEnergySink(sinks: readonly EnergySink[]): EnergySink | undefined {
  return rankEnergySinks(sinks)[0];
}

/** Somewhere a hauler can take energy from. */
export interface EnergyPickup {
  readonly id: string;
  /** "dropped" | "tombstone" | "container" | "storage" */
  readonly kind: string;
  /** Energy available to take. */
  readonly amount: number;
  readonly range: number;
}

/** Pickup kinds that decay, and so should be cleared before stored energy. */
const PERISHABLE = new Set(["dropped", "tombstone"]);

/**
 * Pick where a hauler should collect from.
 *
 * Dropped energy and tombstones decay every tick, so they are collected first
 * even when a fuller container is closer -- energy left on the floor is energy
 * already being lost. Within a tier, prefer the biggest pile, then the nearest:
 * a hauler that fills up in one stop beats one that makes three.
 */
export function selectPickup(
  pickups: readonly EnergyPickup[],
  minimumAmount = 0,
): EnergyPickup | undefined {
  const viable = pickups.filter((p) => p.amount > 0 && p.amount >= minimumAmount);
  if (viable.length === 0) return undefined;

  const perishable = viable.filter((p) => PERISHABLE.has(p.kind));
  const pool = perishable.length > 0 ? perishable : viable;

  return pool.reduce((best, p) => {
    if (p.amount !== best.amount) return p.amount > best.amount ? p : best;
    if (p.range !== best.range) return p.range < best.range ? p : best;
    return p.id < best.id ? p : best;
  });
}

/**
 * Pick a source to mine.
 *
 * Prefers sources with room to stand: a closer source that is already crowded
 * costs more in queueing than the extra walk to an open one. Empty sources and
 * fully occupied sources are never returned.
 */
export function selectEnergySource(sources: readonly EnergySource[]): EnergySource | undefined {
  const viable = sources.filter((source) => source.energy > 0 && source.openSpots > 0);
  if (viable.length === 0) return undefined;

  return viable.reduce((best, source) => {
    if (source.openSpots !== best.openSpots) {
      return source.openSpots > best.openSpots ? source : best;
    }
    if (source.range !== best.range) return source.range < best.range ? source : best;
    return source.id < best.id ? source : best;
  });
}

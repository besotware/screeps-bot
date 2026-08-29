/**
 * Base planning.
 *
 * Decides *where* things go. Pure geometry over plain coordinates -- no
 * RoomPosition, no Game -- so the layout can be asserted in tests instead of
 * eyeballed in the client.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A tile the planner is allowed to consider. */
export interface TileView {
  /** True when terrain is wall. */
  readonly wall: boolean;
  /** True when a structure or site already occupies the tile. */
  readonly occupied: boolean;
}

/** Extensions unlocked per controller level, per the game's rules. */
export const EXTENSIONS_BY_RCL: readonly number[] = [0, 0, 5, 10, 20, 30, 40, 50, 60];

/** Towers unlocked per controller level. */
export const TOWERS_BY_RCL: readonly number[] = [0, 0, 0, 1, 1, 1, 2, 2, 6];

export function extensionsAllowed(controllerLevel: number): number {
  const level = Math.max(0, Math.min(8, Math.floor(controllerLevel)));
  return EXTENSIONS_BY_RCL[level] ?? 0;
}

export function towersAllowed(controllerLevel: number): number {
  const level = Math.max(0, Math.min(8, Math.floor(controllerLevel)));
  return TOWERS_BY_RCL[level] ?? 0;
}

/**
 * Candidate build tiles around an anchor, nearest first.
 *
 * Uses a checkerboard: only tiles where (x + y) is even relative to the anchor
 * are offered, which leaves the odd tiles free as walkways. A solid block of
 * extensions looks denser but boxes creeps in, and the pathing cost of that
 * shows up as CPU every tick forever.
 */
export function buildCandidates(anchor: Point, radius: number): Point[] {
  const out: Point[] = [];

  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        // Ring r only: the interior was emitted on an earlier pass.
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        // Checkerboard, keeping the walkways open.
        if ((dx + dy) % 2 !== 0) continue;

        const x = anchor.x + dx;
        const y = anchor.y + dy;
        // Room edges are unbuildable, and tile 1 from the edge blocks exits.
        if (x < 2 || x > 47 || y < 2 || y > 47) continue;

        out.push({ x, y });
      }
    }
  }

  return out;
}

/**
 * Where to place the next `count` extensions.
 *
 * `lookup` reports what is already at a tile. Returns fewer than `count` -- or
 * nothing -- when the area is full, which callers must treat as "done", not as
 * an error.
 */
export function planExtensions(
  anchor: Point,
  count: number,
  lookup: (p: Point) => TileView,
  radius = 6,
): Point[] {
  if (count <= 0) return [];

  const out: Point[] = [];
  for (const point of buildCandidates(anchor, radius)) {
    if (out.length >= count) break;
    const tile = lookup(point);
    if (tile.wall || tile.occupied) continue;
    out.push(point);
  }
  return out;
}

/**
 * Where to put a source container: a free tile adjacent to the source, closest
 * to the anchor so the haul is short.
 *
 * Ties break on coordinates rather than iteration order, so the same room
 * always produces the same plan -- a layout that shifts between ticks would
 * leave half-built sites scattered around the source.
 */
export function planSourceContainer(
  source: Point,
  anchor: Point,
  lookup: (p: Point) => TileView,
): Point | undefined {
  const candidates: Point[] = [];

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const x = source.x + dx;
      const y = source.y + dy;
      if (x < 1 || x > 48 || y < 1 || y > 48) continue;
      const tile = lookup({ x, y });
      if (tile.wall || tile.occupied) continue;
      candidates.push({ x, y });
    }
  }

  if (candidates.length === 0) return undefined;

  return candidates.reduce((best, p) => {
    const dBest = chebyshev(best, anchor);
    const dP = chebyshev(p, anchor);
    if (dP !== dBest) return dP < dBest ? p : best;
    if (p.x !== best.x) return p.x < best.x ? p : best;
    return p.y < best.y ? p : best;
  });
}

/**
 * Where to put the controller container.
 *
 * Two tiles out from the controller, not adjacent: adjacent tiles are where
 * upgraders need to stand, and a container occupying one of them costs a
 * working position forever. Upgraders stand between the two.
 */
export function planControllerContainer(
  controller: Point,
  anchor: Point,
  lookup: (p: Point) => TileView,
): Point | undefined {
  const candidates: Point[] = [];

  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      // Ring 2 exactly.
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
      const x = controller.x + dx;
      const y = controller.y + dy;
      if (x < 2 || x > 47 || y < 2 || y > 47) continue;
      const tile = lookup({ x, y });
      if (tile.wall || tile.occupied) continue;
      candidates.push({ x, y });
    }
  }

  if (candidates.length === 0) return undefined;

  return candidates.reduce((best, p) => {
    const dBest = chebyshev(best, anchor);
    const dP = chebyshev(p, anchor);
    if (dP !== dBest) return dP < dBest ? p : best;
    if (p.x !== best.x) return p.x < best.x ? p : best;
    return p.y < best.y ? p : best;
  });
}

/**
 * Which tiles along a path are worth paving.
 *
 * Skips the endpoints -- a road under the spawn or on the source itself buys
 * nothing -- and skips tiles that already hold something. Roads halve fatigue,
 * so they pay for themselves on any route a hauler walks repeatedly, but
 * paving a tile nobody crosses is pure decay cost.
 */
export function planRoadTiles(
  path: readonly Point[],
  lookup: (p: Point) => TileView,
): Point[] {
  if (path.length <= 2) return [];

  return path.slice(1, -1).filter((p) => {
    const tile = lookup(p);
    return !tile.wall && !tile.occupied;
  });
}

/** Screeps range: diagonal moves cost the same as orthogonal ones. */
export function chebyshev(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

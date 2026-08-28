import {
  isAssignmentStale,
  nextSourceForMiner,
  unmannedSources,
} from "../../src/domain/assignment";
import type { SourceSlot } from "../../src/domain/assignment";

const slot = (sourceId: string, hasContainer = true): SourceSlot => ({ sourceId, hasContainer });

describe("nextSourceForMiner", () => {
  it("returns the first containered source when nothing is assigned", () => {
    expect(nextSourceForMiner([slot("a"), slot("b")], [])).toBe("a");
  });

  it("skips sources that already have a miner", () => {
    expect(nextSourceForMiner([slot("a"), slot("b")], ["a"])).toBe("b");
  });

  it("skips sources with no container", () => {
    // A miner on a containerless source drops energy on the floor.
    expect(nextSourceForMiner([slot("a", false), slot("b")], [])).toBe("b");
  });

  it("returns undefined when every containered source is taken", () => {
    expect(nextSourceForMiner([slot("a"), slot("b")], ["a", "b"])).toBeUndefined();
  });

  it("returns undefined when no source has a container", () => {
    expect(nextSourceForMiner([slot("a", false)], [])).toBeUndefined();
  });

  it("ignores undefined entries in the assigned list", () => {
    // A miner mid-spawn may not have its assignment written yet.
    expect(nextSourceForMiner([slot("a"), slot("b")], [undefined, "a"])).toBe("b");
  });

  it("returns undefined for no sources at all", () => {
    expect(nextSourceForMiner([], [])).toBeUndefined();
  });
});

describe("unmannedSources", () => {
  it("lists every containered source without a miner", () => {
    expect(unmannedSources([slot("a"), slot("b"), slot("c")], ["b"])).toEqual(["a", "c"]);
  });

  it("is empty when all are manned", () => {
    expect(unmannedSources([slot("a")], ["a"])).toEqual([]);
  });

  it("excludes containerless sources", () => {
    expect(unmannedSources([slot("a", false), slot("b")], [])).toEqual(["b"]);
  });

  it("stays correct when several miners die at once", () => {
    expect(unmannedSources([slot("a"), slot("b")], [])).toEqual(["a", "b"]);
  });
});

describe("isAssignmentStale", () => {
  it("treats a missing assignment as stale", () => {
    expect(isAssignmentStale(undefined, [slot("a")])).toBe(true);
  });

  it("treats a vanished source as stale", () => {
    expect(isAssignmentStale("gone", [slot("a")])).toBe(true);
  });

  it("treats a source whose container was destroyed as stale", () => {
    expect(isAssignmentStale("a", [slot("a", false)])).toBe(true);
  });

  it("accepts a live assignment", () => {
    expect(isAssignmentStale("a", [slot("a")])).toBe(false);
  });
});

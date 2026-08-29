import { runSpawn } from "../../src/runtime/spawning";
import {
  fakeCreep,
  fakeRoom,
  fakeSpawn,
  installGame,
  installScreepsConstants,
} from "../helpers/mockGame";

installScreepsConstants();

describe("runSpawn", () => {
  let restoreGame: () => void;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    restoreGame = installGame({ time: 1000 });
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    restoreGame();
    logSpy.mockRestore();
  });

  it("does nothing while the spawn is already busy", () => {
    const { spawn, calls } = fakeSpawn(fakeRoom(), { spawning: true });
    expect(runSpawn(spawn, [])).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("spawns a harvester first into an empty room with no containers", () => {
    const room = fakeRoom({ energyAvailable: 300, energyCapacityAvailable: 300 });
    const { spawn, calls } = fakeSpawn(room);

    const outcome = runSpawn(spawn, []);

    expect(outcome?.role).toBe("harvester");
    expect(outcome?.code).toBe(OK);
    expect(calls[0]?.body).toEqual(["work", "carry", "move"]);
  });

  it("records role, home room and mode in memory", () => {
    const room = fakeRoom({ name: "W5N8" });
    const { spawn, calls } = fakeSpawn(room);

    runSpawn(spawn, []);

    expect(calls[0]?.opts?.memory).toEqual({
      role: "harvester",
      home: "W5N8",
      mode: "gathering",
    });
  });

  it("does not spawn when the room is already at target strength", () => {
    const room = fakeRoom({ controllerLevel: 1, sourceCount: 2 });
    const { spawn, calls } = fakeSpawn(room);
    const creeps = [
      ...Array.from({ length: 4 }, () => fakeCreep("harvester")),
      fakeCreep("upgrader"),
    ];

    expect(runSpawn(spawn, creeps)).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("ignores creeps homed to a different room", () => {
    const room = fakeRoom({ name: "W1N1" });
    const { spawn, calls } = fakeSpawn(room);
    const foreign = Array.from({ length: 9 }, () => fakeCreep("harvester", "W9N9"));

    expect(runSpawn(spawn, foreign)?.role).toBe("harvester");
    expect(calls).toHaveLength(1);
  });

  it("waits for a full bank rather than spawning a weak creep", () => {
    const room = fakeRoom({ energyAvailable: 250, energyCapacityAvailable: 550 });
    const { spawn, calls } = fakeSpawn(room);
    expect(runSpawn(spawn, [fakeCreep("harvester")])).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("spawns immediately on a partial bank when every creep is dead", () => {
    const room = fakeRoom({ energyAvailable: 250, energyCapacityAvailable: 550 });
    const { spawn, calls } = fakeSpawn(room);

    expect(runSpawn(spawn, [])?.role).toBe("harvester");
    expect(calls).toHaveLength(1);
  });

  it("reports a stalled bootstrap instead of failing silently", () => {
    const room = fakeRoom({ energyAvailable: 100, energyCapacityAvailable: 550 });
    const { spawn, calls } = fakeSpawn(room);

    expect(runSpawn(spawn, [])).toBeUndefined();
    expect(calls).toHaveLength(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("bootstrap stalled"));
  });

  it("surfaces a rejected spawn rather than reporting success", () => {
    const { spawn } = fakeSpawn(fakeRoom(), { returns: ERR_NAME_EXISTS });
    expect(runSpawn(spawn, [])?.code).toBe(ERR_NAME_EXISTS);
  });

  it("derives a unique name from the tick", () => {
    const { spawn, calls } = fakeSpawn(fakeRoom());
    runSpawn(spawn, []);
    expect(calls[0]?.name).toBe(`harvester-${(1000).toString(36)}`);
  });
});

describe("runSpawn — miner assignment", () => {
  let restoreGame: () => void;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    restoreGame = installGame({ time: 2000 });
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    restoreGame();
    logSpy.mockRestore();
  });

  /** A containered room already holding its harvester quota. */
  const containeredRoom = (containers: number): Room =>
    fakeRoom({
      sourceCount: 2,
      containeredSources: containers,
      energyAvailable: 550,
      energyCapacityAvailable: 550,
    });

  it("spawns a miner once a source has a container", () => {
    const { spawn, calls } = fakeSpawn(containeredRoom(2));
    const outcome = runSpawn(spawn, [fakeCreep("harvester")]);

    expect(outcome?.role).toBe("miner");
    expect(calls).toHaveLength(1);
  });

  it("assigns the miner a specific source", () => {
    const { spawn, calls } = fakeSpawn(containeredRoom(2));
    const outcome = runSpawn(spawn, [fakeCreep("harvester")]);

    expect(outcome?.sourceId).toBe("source-0");
    expect(calls[0]?.opts?.memory).toMatchObject({ role: "miner", sourceId: "source-0" });
  });

  it("gives the second miner the other source, not the taken one", () => {
    // The single most expensive mistake available: two miners on one source.
    // Haulers are already at strength so the miner is the top deficit --
    // otherwise the planner correctly prefers a hauler, since a miner with
    // nobody to collect from it produces energy that just sits there.
    const { spawn } = fakeSpawn(containeredRoom(2));
    const existing = [
      fakeCreep("miner", "W1N1", "source-0"),
      fakeCreep("hauler"),
      fakeCreep("hauler"),
    ];

    expect(runSpawn(spawn, existing)?.sourceId).toBe("source-1");
  });

  it("prefers a hauler when miners have nobody to collect from them", () => {
    const { spawn } = fakeSpawn(containeredRoom(2));
    const existing = [fakeCreep("harvester"), fakeCreep("miner", "W1N1", "source-0")];

    expect(runSpawn(spawn, existing)?.role).toBe("hauler");
  });

  it("refuses to spawn a miner when every containered source is taken", () => {
    const { spawn, calls } = fakeSpawn(containeredRoom(1));
    const existing = [fakeCreep("miner", "W1N1", "source-0")];

    // One container, one miner: the room wants no more miners.
    const outcome = runSpawn(spawn, existing);
    expect(outcome?.role).not.toBe("miner");
    expect(calls.filter((c) => c.opts?.memory?.role === "miner")).toHaveLength(0);
  });

  it("logs the source a miner was sent to", () => {
    const { spawn } = fakeSpawn(containeredRoom(2));
    runSpawn(spawn, [fakeCreep("harvester")]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("-> source-0"));
  });

  it("omits sourceId for non-miner roles", () => {
    const { spawn, calls } = fakeSpawn(fakeRoom({ energyAvailable: 300 }));
    const outcome = runSpawn(spawn, []);

    expect(outcome?.sourceId).toBeUndefined();
    expect(calls[0]?.opts?.memory).not.toHaveProperty("sourceId");
  });
});

describe("runSpawn — unaffordable without an emergency", () => {
  let restoreGame: () => void;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    restoreGame = installGame({ time: 3000 });
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    restoreGame();
    logSpy.mockRestore();
  });

  it("declines quietly when the bank is full but buys nothing", () => {
    // Full bank of 100 clears the budget check, yet 100 buys no harvester.
    // Not a bootstrap emergency, because a creep is alive -- so it must decline
    // silently rather than logging a stall every single tick.
    const room = fakeRoom({ energyAvailable: 100, energyCapacityAvailable: 100 });
    const { spawn, calls } = fakeSpawn(room);

    expect(runSpawn(spawn, [fakeCreep("harvester")])).toBeUndefined();
    expect(calls).toHaveLength(0);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("bootstrap stalled"));
  });
});

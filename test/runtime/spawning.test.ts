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

  it("spawns a harvester first into an empty room", () => {
    const room = fakeRoom({ energyAvailable: 300, energyCapacityAvailable: 300 });
    const { spawn, calls } = fakeSpawn(room);

    const outcome = runSpawn(spawn, []);

    expect(outcome?.role).toBe("harvester");
    expect(outcome?.code).toBe(OK);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toEqual(["work", "carry", "move"]);
  });

  it("records the creep's role and home room in memory", () => {
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
    // RCL 1, 2 sources -> 4 harvesters, 1 upgrader.
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

    // The foreign creeps must not count towards W1N1's census, so we still spawn.
    expect(runSpawn(spawn, foreign)?.role).toBe("harvester");
    expect(calls).toHaveLength(1);
  });

  it("waits for a full bank rather than spawning a weak creep", () => {
    const room = fakeRoom({ energyAvailable: 250, energyCapacityAvailable: 550 });
    const { spawn, calls } = fakeSpawn(room);
    // One live creep, so this is not a bootstrap emergency.
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
    const room = fakeRoom();
    const { spawn } = fakeSpawn(room, { returns: ERR_NAME_EXISTS });

    expect(runSpawn(spawn, [])?.code).toBe(ERR_NAME_EXISTS);
  });

  it("derives a unique name from the tick", () => {
    const room = fakeRoom();
    const { spawn, calls } = fakeSpawn(room);
    runSpawn(spawn, []);
    expect(calls[0]?.name).toBe(`harvester-${(1000).toString(36)}`);
  });
});

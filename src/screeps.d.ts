/**
 * Ambient declarations narrowing the Screeps memory types to what this bot
 * actually stores. @types/screeps declares these as open index signatures,
 * which defeats strict mode -- restating them as concrete interfaces means a
 * typo in a memory key is a compile error.
 */

import type { Role } from "./domain/roles";
import type { WorkMode } from "./domain/state";

declare global {
  interface CreepMemory {
    role: Role;
    /** Room name this creep is assigned to. */
    home: string;
    mode: WorkMode;
  }

  interface Memory {
    creeps: Record<string, CreepMemory>;
  }
}

export {};

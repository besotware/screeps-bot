/**
 * What you watch. Console line plus an in-client overlay.
 */

import { desiredCensus, tallyCensus } from "../domain/roles";
import { formatReport, hasShortfall } from "../domain/stats";
import type { ColonyReport } from "../domain/stats";
import { projectNeeds } from "./projection";

/** Print every N ticks even when nothing is wrong, so the log shows progress. */
export const REPORT_INTERVAL = 25;

export function buildReport(room: Room, creeps: readonly Creep[]): ColonyReport {
  const controller = room.controller;
  const progress =
    controller && controller.progressTotal > 0
      ? controller.progress / controller.progressTotal
      : 0;

  return {
    room: room.name,
    tick: Game.time,
    controllerLevel: controller?.level ?? 0,
    controllerProgress: progress,
    energyAvailable: room.energyAvailable,
    energyCapacity: room.energyCapacityAvailable,
    current: tallyCensus(creeps.map((c) => c.memory.role)),
    desired: desiredCensus(projectNeeds(room)),
    constructionSites: room.find(FIND_MY_CONSTRUCTION_SITES).length,
    cpuUsed: Game.cpu.getUsed(),
    cpuLimit: Game.cpu.limit,
  };
}

/**
 * Log on an interval, or immediately when the colony is short of something.
 * Printing every tick buries the interesting ones.
 */
export function reportRoom(report: ColonyReport): boolean {
  const interesting = hasShortfall(report.current, report.desired);
  if (!interesting && report.tick % REPORT_INTERVAL !== 0) return false;

  console.log(formatReport(report));
  return true;
}

/** In-client overlay: the same numbers, drawn in the room. */
export function drawOverlay(room: Room, report: ColonyReport): void {
  const visual = room.visual;
  const style: TextStyle = { align: "left", font: 0.6, color: "#ffffff", opacity: 0.8 };

  visual.text(`RCL ${report.controllerLevel}`, 1, 1, style);
  visual.text(`E ${report.energyAvailable}/${report.energyCapacity}`, 1, 2, style);
  visual.text(`CPU ${report.cpuUsed.toFixed(1)}`, 1, 3, style);

  let row = 4;
  for (const [role, want] of Object.entries(report.desired)) {
    const have = report.current[role as keyof typeof report.current];
    const short = have < want;
    visual.text(`${role} ${have}/${want}`, 1, row, {
      ...style,
      color: short ? "#ff6666" : "#88ff88",
    });
    row += 1;
  }
}

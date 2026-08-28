/**
 * Colony telemetry.
 *
 * Formatting is pure so the output is a test, not something to squint at in
 * the console. This is the bit you actually watch: it prints what the colony
 * thinks it needs versus what it has, which is the fastest way to see a
 * spawn-planning bug.
 */

import { ROLES } from "./roles";
import type { Census, Role } from "./roles";

export interface ColonyReport {
  readonly room: string;
  readonly tick: number;
  readonly controllerLevel: number;
  /** Controller progress as a fraction, 0..1. */
  readonly controllerProgress: number;
  readonly energyAvailable: number;
  readonly energyCapacity: number;
  readonly current: Census;
  readonly desired: Census;
  readonly constructionSites: number;
  readonly cpuUsed: number;
  readonly cpuLimit: number;
}

/** Short role tags, so the census fits one console line. */
const TAG: Readonly<Record<Role, string>> = {
  harvester: "har",
  miner: "min",
  hauler: "hau",
  builder: "bld",
  upgrader: "upg",
};

/** `har 0/0 min 2/2 hau 2/2 ...`, with a bang marking each shortfall. */
export function formatCensus(current: Census, desired: Census): string {
  return ROLES.map((role) => {
    const short = current[role] < desired[role] ? "!" : "";
    return `${TAG[role]} ${current[role]}/${desired[role]}${short}`;
  }).join("  ");
}

/** A 10-cell progress bar. Purely cosmetic, genuinely useful at a glance. */
export function bar(fraction: number, width = 10): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const filled = Math.round(clamped * width);
  return `[${"=".repeat(filled)}${" ".repeat(width - filled)}]`;
}

/** One line per call, cheap enough to print every tick if you want. */
export function formatReport(report: ColonyReport): string {
  const energy = `${report.energyAvailable}/${report.energyCapacity}`;
  const cpu = `${report.cpuUsed.toFixed(1)}/${report.cpuLimit}`;
  const sites = report.constructionSites > 0 ? `  sites ${report.constructionSites}` : "";

  return (
    `[${report.room} t${report.tick}] ` +
    `RCL${report.controllerLevel} ${bar(report.controllerProgress)} ` +
    `E ${energy}  ` +
    `${formatCensus(report.current, report.desired)}${sites}  ` +
    `cpu ${cpu}`
  );
}

/**
 * True when the colony is short of a role it considers essential.
 *
 * Used to decide whether a tick is worth reporting: printing every tick buries
 * the interesting ones.
 */
export function hasShortfall(current: Census, desired: Census): boolean {
  return ROLES.some((role) => current[role] < desired[role]);
}

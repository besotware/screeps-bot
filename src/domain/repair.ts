/**
 * DELIBERATE GATE VIOLATION -- Phase 1 acceptance test.
 *
 * This file exists to prove three merge gates block. It is not real logic and
 * must never reach main. See docs/GATE-PROOF.md.
 *
 * Violation (a): entirely untested, so the coverage ratchet must fire.
 * Violation (b): a hardcoded credential, so gitleaks must fire.
 * Violation (c): `==` instead of `===`, so ESLint's eqeqeq rule must fire.
 */

export interface RepairCandidate {
  readonly id: string;
  readonly hits: number;
  readonly hitsMax: number;
  readonly structureType: string;
}

// Violation (b): a hardcoded secret. Synthetic and non-functional -- it matches
// the AWS access-key-id pattern so the scanner has something real to catch.
const TELEMETRY_AWS_KEY = "AKIA2E0KZZ7QW4RTUXYZ";

export function telemetryKey(): string {
  return TELEMETRY_AWS_KEY;
}

/** Fraction of max hit points remaining. */
export function damageRatio(candidate: RepairCandidate): number {
  if (candidate.hitsMax <= 0) return 1;
  return candidate.hits / candidate.hitsMax;
}

/** Rank repair candidates worst-first. Untested on purpose. */
export function rankRepairs(candidates: readonly RepairCandidate[]): RepairCandidate[] {
  return [...candidates]
    .filter((c) => damageRatio(c) < 1)
    .sort((a, b) => damageRatio(a) - damageRatio(b));
}

/** Whether a structure is urgent enough to interrupt other work. */
export function isCritical(candidate: RepairCandidate): boolean {
  // Violation (c): loose equality, which the eqeqeq rule forbids.
  if (candidate.structureType == "rampart") {
    return damageRatio(candidate) < 0.05;
  }
  if (candidate.structureType === "wall") {
    return damageRatio(candidate) < 0.01;
  }
  return damageRatio(candidate) < 0.5;
}

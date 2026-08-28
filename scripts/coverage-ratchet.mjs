/**
 * Coverage ratchet.
 *
 * Fails when coverage drops below the committed baseline. Deliberately not a
 * fixed threshold: a fixed number either sits so low it never fires, or gets
 * lowered the first time it is inconvenient. A ratchet only ever moves one way,
 * and every move is a reviewable diff.
 *
 *   node scripts/coverage-ratchet.mjs           check against the baseline
 *   node scripts/coverage-ratchet.mjs --update  rewrite the baseline
 *
 * The baseline is a committed file rather than something derived from main at
 * runtime, so a change to it shows up in review alongside the change that
 * caused it. See ADR-0006.
 */

import { readFileSync, writeFileSync } from "node:fs";

const SUMMARY = "coverage/coverage-summary.json";
const BASELINE = "coverage-baseline.json";
const METRICS = ["statements", "branches", "functions", "lines"];

// Istanbul rounds percentages to two decimals, so exact equality is unreliable.
// Anything smaller than this is rounding noise, not a real regression.
const EPSILON = 0.01;

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return { __error: String(error) };
  }
}

const summary = readJson(SUMMARY);
if (summary.__error || !summary.total) {
  // A missing summary means the test run did not complete. Passing here would
  // let a broken test suite through the gate that exists to catch it.
  console.error(`ERROR: could not read ${SUMMARY}. Did the test run complete?`);
  console.error(summary.__error ?? "no 'total' key in summary");
  process.exit(1);
}

const current = Object.fromEntries(METRICS.map((m) => [m, summary.total[m].pct]));

if (process.argv.includes("--update")) {
  const next = { ...current, updated: new Date().toISOString().slice(0, 10) };
  writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Wrote ${BASELINE}:`);
  for (const m of METRICS) console.log(`  ${m.padEnd(11)} ${current[m]}%`);
  process.exit(0);
}

const baseline = readJson(BASELINE);
if (baseline.__error) {
  console.error(`ERROR: could not read ${BASELINE}: ${baseline.__error}`);
  console.error(`Create it with: node ${process.argv[1]} --update`);
  process.exit(1);
}

const rows = [];
let regressed = false;
let improved = false;

for (const metric of METRICS) {
  const was = baseline[metric];
  const now = current[metric];

  if (typeof was !== "number") {
    console.error(`ERROR: ${BASELINE} has no numeric '${metric}'`);
    process.exit(1);
  }

  const delta = now - was;
  let status;
  if (delta < -EPSILON) {
    status = "REGRESSED";
    regressed = true;
  } else if (delta > EPSILON) {
    status = "improved";
    improved = true;
  } else {
    status = "unchanged";
  }
  rows.push({ metric, was, now, delta, status });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad("metric", 12)}${pad("baseline", 11)}${pad("current", 11)}${pad("delta", 10)}status`);
for (const r of rows) {
  const delta = `${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(2)}`;
  console.log(`${pad(r.metric, 12)}${pad(`${r.was}%`, 11)}${pad(`${r.now}%`, 11)}${pad(delta, 10)}${r.status}`);
}

if (regressed) {
  console.error("");
  console.error("Coverage regressed against the baseline.");
  console.error("Add tests for the new code, or -- if the drop is genuinely");
  console.error("intended -- run `npm run coverage:baseline` and explain why in");
  console.error("the PR description. Lowering the baseline is a reviewable act,");
  console.error("not a silent one.");
  process.exit(1);
}

if (improved) {
  console.log("");
  console.log("Coverage improved. Run `npm run coverage:baseline` to lock it in,");
  console.log("so the next change cannot quietly give it back.");
}

process.exit(0);

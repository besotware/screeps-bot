# Progress

## Bot capability — complete for a single room (2026-08-28)

The bot now runs an owned room end to end without supervision: it bootstraps,
transitions to a static-miner economy, builds its own infrastructure, defends
itself, and manages its own CPU. 497 tests.

### What it does

| Area | Behaviour |
| --- | --- |
| Economy | Harvester bootstrap, then static miners on source containers plus haulers |
| Construction | Source containers, controller container, roads on used routes, extensions to the RCL cap |
| Defence | Threat classification, defenders that preempt the spawn queue, tower policy, safe mode |
| Survival | Economic creeps evacuate under real damage; the loop guards every unit of work |
| Logistics | Tiered collection: decaying energy, then containers, then storage |
| CPU | Sheds telemetry, then planning, under bucket pressure; never sheds defence or spawning |
| Observability | One console line per room plus an in-client overlay |

### Deliberate design points

**Static miners over generalist harvesters.** A miner never walks and its WORK
parts are never idle. The handover is gated on containers existing, and keeps
one harvester alive during a partial transition so a container-less source is
never stranded.

**Defence preempts deficit ranking.** Deficit-first is the right rule for an
economy and exactly the wrong one under attack -- being four harvesters short is
irrelevant if the spawn is being chewed on.

**Safe mode is hard to trigger.** Player attack only, and only once the spawn is
below half. NPC invaders leave on their own; an activation spent on one is
unavailable when a real player arrives.

**Defenders do not chase.** Being drawn beyond tower cover by bait is how a
defender dies alone.

### Not built

Deliberately out of scope so far, in rough order of value:

- Remote mining in adjacent rooms (reserving, remote miners and haulers)
- Room claiming and multi-room expansion
- Links (RCL 5+), which would remove most hauling
- Rampart and wall construction; the tower repairs them but nothing builds them
- Terminal, market, labs, boosts, nukes

The bot is complete for one room. It is not a competitive multi-room player.

---

## Colony feature work — 2026-08-28

Feature code added between phases, at your request, so there is something to
watch run. Pipeline maturity deliberately unchanged.

**Five roles, with an economic transition.** Generalist harvesters bootstrap a
room; once a container exists beside a source, a static miner parks on it and
haulers move the energy. A miner never walks and its WORK parts are never idle,
which is what makes the handover worth the extra roles. Harvesters drop to zero
at full miner coverage, but stay at one during a partial handover so a
container-less source is never stranded.

| Role | Body | Job |
| --- | --- | --- |
| harvester | `[WORK,CARRY,MOVE]` ×n | Bootstrap: mine and carry |
| miner | `MOVE` + `WORK`×5 | Static, one per source container |
| hauler | `[CARRY,CARRY,MOVE]` ×n | Container → spawn/extensions |
| builder | `[WORK,CARRY,MOVE]` ×n | Build, then repair, then upgrade |
| upgrader | `[WORK,WORK,CARRY,MOVE]` ×n | Controller |

**Also added:** automatic base planning (source containers first, then
extensions to the RCL allowance, on a checkerboard so creeps are not boxed in),
tower operation (healers first, attack over heal over repair, energy reserved
for firing), and per-tick telemetry with an in-client overlay.

**Coverage rose to 99.56% / 94.08% / 100% / 99.54%** across 359 tests, up from
124. The baseline was raised to match.

The ratchet did its job here: the first pass at this feature work sat at 74.88%
and would have been blocked. Every module landed with tests because the gate
left no other option.

Coverage also found dead code — `runTower`'s `heal` branch was unreachable
because `decideTowerAction` never returned it. Implemented healing properly
rather than deleting the branch, since towers really can heal.

---

## Current state — Phase 1

**Phase 1 — Merge gates. Substantially complete; blocked on you for the
ruleset and the signing decision.**

Done:

- All six Phase 0 jobs converted from reporting to enforcing (seven
  `continue-on-error` markers removed).
- Coverage ratchet added — introduced in reporting mode, watched reporting
  correctly in CI, then made blocking. See ADR-0006.
- Acceptance test passed: PR #1 carried three deliberate violations and all
  three were blocked. Evidence in `docs/GATE-PROOF.md`.
- `docs/DEVELOPMENT.md` documents both commit-signing options.
- `docs/RULESET.md` has the exact `main` ruleset for you to apply.

- Signing decided: **gitsign + a CI identity check** (Option B in
  `docs/RULESET.md`). *Require signed commits* stays off — GitHub cannot read
  Sigstore signatures. A `Commit signing` job asserts certificate identity and
  OIDC issuer instead, which is the stronger claim.
- `Commit signing` job added in **reporting mode**. It reports failure on every
  commit until signing is set up; that is expected.

Outstanding, both needing you:

1. **Apply the ruleset** (`docs/RULESET.md`). Until then the six checks are
   advisory — they go red and nothing stops a merge. The gates are proved; the
   enforcement is not.
2. **Set up gitsign** (`docs/DEVELOPMENT.md`) and report which OIDC provider you
   authenticate with. The issuer in the certificate depends on that choice and
   cannot be predicted from here; it is currently pinned to
   `https://github.com/login/oauth` as a guess, and the reporting-mode job
   prints what it actually finds.

Then: pin the observed issuer, flip `Commit signing` to enforcing, add it as a
seventh required check, and prove it blocks an unsigned commit.

---

## Phase 0 state

**Phase 0 — Skeleton and visibility. Complete.** Acceptance test passed:
`npm run build` produces a working bundle, and CI run
[33140975975](https://github.com/besotware/screeps-bot/actions/runs/33140975975)
is green with all six scanners reporting. Baselines below.

Repo: <https://github.com/besotware/screeps-bot> (public).

---

## Phase 0 baseline

Recorded 2026-08-27. These are the numbers the Phase 1 coverage ratchet and the
scanner gates measure against.

### Tests

| Metric | Value |
| --- | --- |
| Test suites | 9 |
| Tests | 124 |
| Statements | 98.38% (243/247) |
| Branches | 91.33% (116/127) |
| Functions | 100% (42/42) |
| Lines | 98.31% (233/237) |

### Build

| Metric | Value |
| --- | --- |
| `dist/main.js` | 10,617 bytes |
| Modules bundled | 9 |
| Runtime dependencies | 0 |
| Dev dependencies | 10 direct / 440 transitive |

### Scanners

From CI run [33140975975](https://github.com/besotware/screeps-bot/actions/runs/33140975975),
the first fully green run.

| Scanner | Baseline | Scope |
| --- | --- | --- |
| ESLint | **0** errors, 0 warnings | whole repo |
| `tsc --noEmit` | **0** errors | strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` |
| Semgrep OSS | **0** findings (0 blocking) | 128 rules over 25 files; `p/typescript`, `p/javascript`, `p/security-audit`, `p/secrets` |
| OSV-Scanner | **0** vulnerabilities | 414 packages from `package-lock.json` |
| gitleaks (history) | **0** leaks | 11 commits, ~324 KB |
| gitleaks (working tree) | **0** leaks | ~102 KB |

Every scanner is clean at introduction, which is the useful property: from here
any non-zero count is a regression rather than a number to argue about.

---

## What Phase 0 produced

**Bot.** Spawn management, harvester and upgrader roles, room state. Split into
`src/domain/` (pure decision logic, no Screeps globals) and `src/runtime/`
(projects live objects, issues intents) — see ADR-0004.

**CI.** Six jobs, all reporting, none blocking. Steps that become merge gates in
Phase 1 are marked `PHASE-1-GATE`; converting them is a line deletion each.

**Applied ahead of schedule** — cheap now, disruptive later:

- `.npmrc` with `ignore-scripts=true` set before the first install, so the
  dependency tree was resolved under the constraint CI enforces (Phase 2 item).
- Every action SHA-pinned with a version comment from the first workflow.
- `permissions: {}` at workflow top, `contents: read` per job.
- The build job asserts `ignore-scripts` is genuinely `true` on the runner.

---

## Decisions made

See `docs/DECISIONS.md`. In short: esbuild over Rollup (ADR-0001), TypeScript
pinned to 6.0.3 (ADR-0002), gitleaks as a checksum-verified binary rather than
its action (ADR-0003), domain/runtime split (ADR-0004).

---

## Things found along the way

**Jest silently omitted untested files from coverage.** With
`roots: ["<rootDir>/test"]`, Jest never crawls `src/`, so files that no test
imports are left out of the report entirely rather than counted as 0%. Coverage
read 99.44% when the honest number was 72.46%. Adding `src/` to `roots` fixed
it; tests then brought it to 98.38%.

Worth noting because it is exactly the failure mode CLAUDE.md warns about: a
gate that reports a number nobody has verified means anything. Had Phase 1
ratcheted against 99.44%, the baseline would have been fiction.

**A SHA-pinned action was pinning nothing.** `google/osv-scanner-action` failed
the first CI run on a malformed root `action.yml`. Fixing the path would have
worked, but reading the action revealed it resolves
`docker://ghcr.io/google/osv-scanner-action:v2.2.4` — a mutable tag. The commit
SHA pinned the wrapper while the image that actually runs stayed free to change.
Replaced with a checksum-verified binary; see ADR-0005.

This is worth remembering when Phase 2 audits action pinning: `uses:` at a SHA
is necessary, not sufficient. What the action *does* has to be pinned too.

**esbuild's blocked `postinstall` costs nothing.** It declares
`postinstall: node install.js`; `ignore-scripts` skips it and esbuild works,
because it resolves its platform binary through `optionalDependencies`. Verified
by auditing every `package.json` in the tree for lifecycle scripts.

---

## Deferred

| Item | Phase | Why deferred |
| --- | --- | --- |
| Pin runner to a digest, not `ubuntu-24.04` | 2 | Needs the containerized build |
| Pin Semgrep via the build image rather than `pip install` | 2 | Same |
| Teach Renovate to bump the gitleaks version and checksum together | 2 | Renovate not configured yet |
| A workflow self-audit asserting SHA pinning and `permissions` | 2 | Verified by hand this phase; should be mechanical. Must also check what pinned actions *resolve to* — see ADR-0005 |
| Verify osv-scanner's SLSA provenance (`multiple.intoto.jsonl`) with slsa-verifier instead of a hand-copied checksum | 3 | Checksums are still trust-on-first-use |
| SARIF upload to GitHub code scanning | 1 | Needs `security-events: write`; wanted the least-privilege baseline first |
| Builder / hauler roles, container logic | 6 | Not needed until integration tests want them |

---

## Blocked / needs you

Nothing. Phase 0 is closed.

Note for Phase 1: git identity for this repo is set **repo-local** to
`besotware <besotware@gmail.com>` (verified primary on the account). The global
identity is different, so a fresh clone must set this again or commits will be
authored by the wrong person.

---

## Next

**Phase 1 — Merge gates.** Not started. Converting the six reporting jobs to
enforcing is a matter of deleting the seven `PHASE-1-GATE` marked lines; the
work is the coverage ratchet, the `main` ruleset, and gitsign.

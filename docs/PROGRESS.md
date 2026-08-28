# Progress

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

Outstanding, both needing you:

1. **Apply the ruleset** (`docs/RULESET.md`). Until then the six checks are
   advisory — they go red and nothing stops a merge. The gates are proved; the
   enforcement is not.
2. **Decide the signing method.** *Require signed commits* and gitsign are
   mutually exclusive on GitHub today; enabling both gives a repo you cannot
   commit to. Options, trade-offs and a recommendation are in
   `docs/RULESET.md`.

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

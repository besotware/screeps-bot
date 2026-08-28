# Progress

## Current state

**Phase 0 — Skeleton and visibility.** Local acceptance met; CI acceptance
pending first push to a remote (see *Blocked / needs you*).

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

| Scanner | Local baseline | Notes |
| --- | --- | --- |
| ESLint | 0 errors, 0 warnings | Clean at introduction, so any finding is a regression |
| `tsc --noEmit` | 0 errors | strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` |
| Semgrep OSS | pending first CI run | `p/typescript`, `p/javascript`, `p/security-audit`, `p/secrets` |
| OSV-Scanner | pending first CI run | `npm audit` reported 0 vulnerabilities locally |
| gitleaks | pending first CI run | full history + working tree |

Three scanners only run in CI and have no local number yet. **Fill these in from
the first green run before starting Phase 1** — the ratchet is meaningless
without them.

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
| A workflow self-audit asserting SHA pinning and `permissions` | 2 | Verified by hand this phase; should be mechanical |
| SARIF upload to GitHub code scanning | 1 | Needs `security-events: write`; wanted the least-privilege baseline first |
| Builder / hauler roles, container logic | 6 | Not needed until integration tests want them |

---

## Blocked / needs you

**The repo has no remote.** Everything above is committed locally on `main`.
CI has never run, so the Phase 0 acceptance test is only partly proved: the
build, tests, typecheck and lint pass locally, but "CI runs green with all
scanners reporting" is unverified.

Decided this session: **public** repo under `besotware`. Private on a free
personal account cannot use rulesets or branch protection, which would make
Phase 1's merge gates unenforceable.

Exact steps are in the session summary. Nothing touches the account until you
run them.

---

## Next

**Phase 1 — Merge gates.** Not started. Do not begin until the Phase 0 CI run is
green and the three pending scanner baselines above are filled in.

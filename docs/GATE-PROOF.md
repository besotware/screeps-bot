# Gate proof — Phase 1

Evidence that the merge gates block, not merely that they are configured.

The rule for this file: every entry names a deliberate violation, what was
expected, and what actually happened. A gate with no entry here is a gate we
are assuming works.

---

## PP-1 — Three-way violation on one PR

**PR:** [#1 — DO NOT MERGE: Phase 1 gate proof](https://github.com/besotware/screeps-bot/pull/1)
**Run:** [33146085500](https://github.com/besotware/screeps-bot/actions/runs/33146085500)
**Date:** 2026-08-28

One file, `src/domain/repair.ts`, carrying three independent violations.

### Result

| Check | Expected | Actual | |
| --- | --- | --- | --- |
| Unit tests (coverage ratchet) | fail | **fail** | ✅ |
| gitleaks (secrets) | fail | **fail** | ✅ |
| ESLint | fail | **fail** | ✅ |
| Semgrep (SAST) | pass | **fail** | ⚠️ see below |
| Build | pass | **pass** | ✅ |
| OSV-Scanner (SCA) | pass | **pass** | ✅ |

### (a) Coverage drop — blocked by the ratchet

An untested module. All four metrics regressed:

```
metric      baseline   current    delta     status
statements  98.38%     91.69%     -6.69     REGRESSED
branches    91.33%     87.21%     -4.12     REGRESSED
functions   100%       87.5%      -12.50    REGRESSED
lines       98.31%     91.37%     -6.94     REGRESSED

Coverage regressed against the baseline.
```

Note this is a *relative* failure. A fixed 80% threshold would have passed this
PR at 91.69% while coverage fell seven points.

### (b) Hardcoded secret — blocked by gitleaks

A synthetic, non-functional AWS-format access key.

```
WRN leaks found: 1
```

Both the full-history and working-tree scans are in this job; the history scan
is the one that matters, since a secret committed and later removed is still
leaked.

### (c) Loose equality — blocked by ESLint

```
src/domain/repair.ts
  43:31  error  Expected '===' and instead saw '=='  eqeqeq
```

---

## What this run also revealed

**Semgrep caught the secret too, and that was not predicted.** The expectation
table said Semgrep would pass; it reported `Findings: 1 (1 blocking)` from the
`p/secrets` ruleset. Two independent detectors caught the same credential.

Genuine defence in depth rather than duplicated effort — gitleaks scans git
history, Semgrep scans the working tree with different rules. Either alone
would have blocked this. Worth knowing which gate is load-bearing for which
threat before Phase 5 starts removing them to see what still holds.

**A secret on an unmerged branch turned `main` red.** After PR #1 was pushed,
the next run on `main` failed gitleaks. Cause: `actions/checkout` with
`fetch-depth: 0` fetches *all* remote branches, and `gitleaks git` walks the
whole object graph — so it found the synthetic key on `demo/phase1-gate-proof`
while scanning `main`.

The tempting fix is `--log-opts=HEAD` to scope the scan to the current branch.
**Rejected.** That weakens a security control to make CI green, and the scanner
was right: a secret pushed to any branch is on GitHub's servers and is leaked.
Narrowing the scan would have made the tool agree with us rather than making the
repository clean.

Fixed by deleting the branch. `main` went green on run
[33146399208](https://github.com/besotware/screeps-bot/actions/runs/33146399208),
which also confirms the diagnosis rather than leaving it a theory.

The operational property to know: **a secret pushed to any branch reddens `main`
until that ref is deleted.** That is loud, and it should be — in a real incident
the branch deletion is the least of the work, and the key still needs rotating.
Kept deliberately; see ADR-0007.

**The ESLint gate failed silently.** It blocked correctly, but its findings went
only to `eslint-report.json`; the job log showed nothing about *what* was wrong.
The violation had to be reproduced locally to read the message. Fixed on `main`
— the job now tees human-readable output to the log and renders a findings table
into the step summary.

A gate that blocks without explaining is technically enforcing and practically
useless: the pressure to bypass a gate is inversely proportional to how quickly
you can see what it wants.

---

## Not yet proved

| Claim | Status |
| --- | --- |
| The ruleset refuses a direct push to `main` | **Unproved** — ruleset not yet applied |
| Failing checks actually prevent merge | **Unproved** — depends on the ruleset |
| Force-push to `main` is refused | **Unproved** |
| Commit signing is enforced | **Unproved** — signing method undecided, see `docs/RULESET.md` |

Until the ruleset is applied, the six checks are advisory: they go red, and
nothing stops a merge. The gates are proved; the *enforcement* is not.
`docs/RULESET.md` has the settings and the commands to prove each of the above.

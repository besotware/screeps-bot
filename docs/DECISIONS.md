# Architecture Decision Records

Short ADRs, one per real choice between alternatives. What we picked, why, and
what we gave up.

---

## ADR-0001 — esbuild over Rollup for bundling

**Date:** 2026-08-27 · **Phase:** 0 · **Status:** Accepted

CLAUDE.md left this open as "esbuild or Rollup". Both produce the single
CommonJS `main.js` the Screeps API needs, so the tie-breaker was behaviour under
our own supply-chain constraint rather than features.

With `ignore-scripts=true` set *before* the first install, an audit of the
dependency tree found:

| Package | Lifecycle script | Skipped? | Still works? |
| --- | --- | --- | --- |
| esbuild | `postinstall: node install.js` | Yes | Yes |
| rollup | `prepare: husky && ...` | Yes (never runs from a registry tarball anyway) | Yes |

esbuild declares a `postinstall` that we block, and works regardless: since
0.16 it resolves its platform binary through `optionalDependencies` rather than
downloading one at install time. So the control costs us nothing here.

Chose esbuild for build speed and for having no plugin chain — Rollup would have
pulled in `@rollup/plugin-typescript` and `@rollup/plugin-node-resolve`, which is
three more packages to review, pin and attest to for no gain at this scale.

**Gave up:** Rollup's plugin ecosystem and finer control over output chunking.
Neither matters for a single-entry bundle with no code splitting. If we later
need real tree-shaking control or a plugin esbuild cannot express, revisit.

---

## ADR-0002 — Pin TypeScript to 6.0.3 rather than latest (7.0.2)

**Date:** 2026-08-27 · **Phase:** 0 · **Status:** Accepted

`npm install typescript` resolves to 7.0.2, the native port. `ts-jest@29.4.12`
declares `peer typescript@">=4.3 <7"`, so the install fails outright.

The options were: force the peer conflict with `--legacy-peer-deps`, swap the
Jest transform for `@swc/jest` or Babel, or pin TypeScript below the 7.0
boundary. Picked the pin.

Forcing a peer conflict means running a type-checker the transform was never
tested against, in a project whose entire premise is that gates are trustworthy.
Swapping to `@swc/jest` would decouple us from the TypeScript version, but adds a
second, separately-versioned implementation of TypeScript semantics to the trust
boundary — and `swc` transpiles without typechecking, so type errors would stop
failing tests.

**Gave up:** TypeScript 7's compile speed, and being on `latest`. Renovate (Phase
2) will keep proposing 7.x; we hold until ts-jest widens its peer range, then
take it in a reviewable PR.

---

## ADR-0003 — gitleaks as a checksum-verified binary, not the official action

**Date:** 2026-08-27 · **Phase:** 0 · **Status:** Accepted

`gitleaks/gitleaks-action` would satisfy the SHA-pinning rule, but two things
pushed the other way.

The requirement is full-history *and* working-tree scanning. Driving the binary
directly makes those two `gitleaks git` / `gitleaks dir` invocations we can read,
rather than behaviour inferred from an action's inputs. And `gitleaks-action`
has historically required a `GITLEAKS_LICENSE` for organisation-owned repos —
a dependency on a commercial term we would rather not build a merge gate on,
even though this repo is personal and public.

We download a pinned release tarball and verify it against a SHA-256 recorded in
the workflow before executing it, so the binary we run is one we can name.

**Gave up:** automatic version updates via Renovate's action support, and PR
comment integration the action provides. The version and checksum are now a
manual pair to bump together; Phase 2 should teach Renovate to do it.

---

## ADR-0005 — OSV-Scanner as a checksum-verified binary, not its action

**Date:** 2026-08-28 · **Phase:** 0 · **Status:** Accepted

The first CI run failed at job setup:

```
Top level 'runs:' section is required for
google/osv-scanner-action/<sha>/action.yml
```

The repository root holds a marketplace metadata stub with no `runs:` block; the
real action lives at `google/osv-scanner-action/osv-scanner-action`. Correcting
the path would have fixed the error, but reading the action first turned up
something worse:

```yaml
runs:
  using: "docker"
  image: "docker://ghcr.io/google/osv-scanner-action:v2.2.4"
```

It resolves a **mutable tag**. Pinning the action to a commit SHA would have
pinned the wrapper while leaving the image that actually executes free to
change under us — precisely the "it has a valid signature" class of failure the
brief is built to avoid, and a direct breach of *digest-pinned base images, no
tags, anywhere*. The action's own description also states it is not intended for
direct use.

We install the `osv-scanner` binary from a pinned release and verify it against a
recorded SHA-256, matching the gitleaks approach in ADR-0003.

**Gave up:** the action's SARIF output wiring and Renovate's action updates. The
version and checksum are a manual pair to bump together.

**Follow-up:** the release also publishes `multiple.intoto.jsonl` — SLSA
provenance. Phase 3 should verify that with `slsa-verifier` instead of trusting a
checksum we transcribed by hand, which is still trust-on-first-use.

---

## ADR-0004 — Domain / runtime split in the bot source

**Date:** 2026-08-27 · **Phase:** 0 · **Status:** Accepted

`src/domain/` contains only pure functions over plain data — no `Game`, no
`Memory`, no screaming-case globals. `src/runtime/` projects live Screeps
objects into flat snapshots, calls the domain, and issues intents.

The alternative was the conventional Screeps layout, where role modules call the
API directly and tests either mock the whole world or run a real server. That
makes the interesting logic — body scaling, spawn prioritisation, target
ranking — reachable only through a simulated runtime.

The split is what lets the Phase 0 unit suite test decisions with plain
objects and no mocking at all, and it gives Phase 6's integration and
performance tests a clean seam.

**Gave up:** a projection layer that is pure overhead at runtime, and some
indirection when reading the code. The CPU cost is negligible at this colony
size; if profiling in Phase 6 says otherwise, the projections are the first
thing to inline.

Mission

Build a Screeps bot in TypeScript, and build the delivery pipeline around it to a supply-chain security standard equivalent to SLSA Build L3 and SLSA Dependency L3/L4, using only free tooling.

The bot is the excuse. The pipeline is the point. Treat every control as something that must be demonstrably enforced, not merely configured — a control I haven't watched block something is a control we don't have.

Constraints
Public GitHub repo. GitHub Actions for CI. ghcr.io for images. All free tier.
TypeScript, strict mode. Bundled to the single main.js the Screeps API expects.
Every tool must be free and open source. No trials, no paid tiers, no "contact us."
Local k3s cluster is the deployment target for the containerized components.
Screeps private server (screeps-launcher in Docker) is the pre-prod environment.
Non-negotiables

These are the things I will check, so don't quietly skip them:

Report → warn → block. Every gate is introduced in reporting mode, then enforcing. Never write a blocking gate on first introduction.
Every GitHub Action pinned to a full commit SHA, never a tag. Add a comment with the version next to it.
Explicit permissions: block at the top of every workflow. Least privilege per job. Never rely on the default GITHUB_TOKEN scope.
--ignore-scripts in .npmrc. If a dependency genuinely needs a postinstall script, surface it to me and we'll decide; don't disable the setting.
npm ci only. Never npm install in any workflow.
Digest-pinned base images. No tags, no latest, anywhere.
Keyless signing only — cosign via GitHub OIDC. Never generate a signing keypair, never write a private key to disk.
Policy checks identity, not just validity. Any signature verification must assert the OIDC issuer and the specific workflow subject. "It has a valid signature" is the failure mode I'm trying to avoid.
Working agreement
One phase per session. At the end of each phase, stop and write a summary of what changed, what the acceptance test proved, and what's next. Don't roll into the following phase without me.
Maintain docs/PROGRESS.md with the current phase, decisions made, and anything deferred. Update it before you finish a session.
Maintain docs/DECISIONS.md as short ADRs whenever you pick between real alternatives (bundler, test runner, admission approach). One paragraph each: what, why, what we gave up.
Stop and ask me before anything that touches a real account or credential. Specifically: creating a Screeps API token, changing GitHub repository settings or rulesets, pushing to ghcr.io for the first time, or anything that would consume a real quota. Tell me the exact steps to perform and what to paste back.
Never fabricate a credential, token, or account. If a step needs one, stop.
Prefer showing me the failure. When a phase adds a control, the acceptance test must include a deliberate violation that gets blocked, not only a happy path that passes.
Commit in small, reviewable units with conventional commit messages. Don't bundle a phase into one commit.
Stack decisions (already made — don't re-litigate unless something is genuinely broken)
Purpose	Tool
Language / build	TypeScript strict, esbuild or Rollup to a single bundle
Unit tests	Jest, with Game and friends mocked
Integration tests	screeps-server-mockup
E2E / performance	screeps-launcher private server in Docker
SAST	Semgrep OSS
SCA	OSV-Scanner
Secret scanning	gitleaks
SBOM	Syft
Vuln scan (image)	Grype
Signing / attestation	cosign (keyless), GitHub Artifact Attestations
Provenance	slsa-github-generator for SLSA Build L3
Runner egress control	StepSecurity Harden-Runner
Dependency updates	Renovate
Registry	ghcr.io
Admission control	Kyverno + a native ValidatingAdmissionPolicy backstop
GitOps	Flux
Phases

Each phase lists deliverables and an acceptance test. The acceptance test is the definition of done.

Phase 0 — Skeleton and visibility

Bot logic sufficient to run: spawn management, harvester and upgrader roles, basic room state. Enough that later tests have something real to test.

Add these as CI jobs in reporting mode only — they run, they report, nothing fails the build: Jest unit tests with coverage, ESLint, tsc --noEmit, Semgrep OSS, OSV-Scanner, gitleaks (full history plus per-commit).

Write unit tests for the pure logic — body-part cost calculation, role selection, target prioritization. Mock the Game global rather than trying to run the real runtime.

Acceptance: npm run build produces a working bundle. CI runs green with all scanners reporting. docs/PROGRESS.md records the baseline numbers — test count, coverage percentage, finding counts per scanner.

Phase 1 — Merge gates

Convert the Phase 0 jobs to blocking. Add a coverage ratchet that fails when coverage decreases, rather than a fixed threshold.

Tell me the exact GitHub ruleset to configure on main: require PR, require the specific status checks by name, block force-push, require signed commits, require linear history. Give me the settings; I'll apply them.

Set up gitsign for keyless commit signing and document the local setup in docs/DEVELOPMENT.md.

Acceptance: open a PR that (a) drops coverage, (b) introduces a hardcoded secret, and (c) fails a lint rule. All three are blocked. Show me the failing checks.

Phase 2 — Hermetic build

.npmrc with ignore-scripts=true. Lockfile committed and enforced. Every action pinned to SHA. Explicit permissions: on every workflow and job.

Containerize the build into an image with a digest-pinned base. Multi-stage, non-root, minimal final layer.

Add Harden-Runner in audit mode first. Report what the build talks to, then switch to block mode with an explicit allowlist. Show me the audit output before you write the allowlist.

Configure Renovate so dependency resolution happens in reviewable PRs and never inside a build.

Acceptance: the build succeeds with egress blocked to everything outside the allowlist. Then add a trivial dependency that phones home, and show me Harden-Runner blocking it.

Phase 3 — Sign and attest

Release workflow that, on tag:

Builds the image and pushes to ghcr.io.
Signs it with keyless cosign.
Generates an SBOM with Syft and attaches it as an attestation.
Generates SLSA Build L3 provenance via slsa-github-generator.
Attaches a test-result attestation carrying the Jest summary bound to the image digest.
Runs Grype and attaches the scan result as an attestation.

Write scripts/verify.sh that verifies all of the above from a clean machine, asserting the signing identity — issuer and workflow subject — not merely that a signature exists.

Acceptance: verify.sh passes on a freshly pulled image. Then: modify one byte of the image and re-run it; sign an image from a different workflow in the same repo and re-run it. Both must fail, and the second one is the important one.

Phase 4 — Deployment gates

Two enforcement layers.

Cluster. Manifests for k3s: the Screeps private server, and a deployer job. Kyverno verifyImages policy requiring the exact GitHub OIDC identity for our release workflow, plus a provenance check that the build came from this repo. Separately, a native ValidatingAdmissionPolicy in CEL enforcing digest-only image references and a ghcr.io allowlist — this is the backstop for the webhook being removed. Configure cosign for offline bundle verification so admission doesn't depend on reaching Sigstore.

Kyverno in Audit mode first. Show me what it would have blocked before we enforce.

Screeps API. Screeps has no admission hook, so we build one. Write a deployer that verifies the bundle's signature and attestations, confirms provenance names this repo and the release branch, and refuses to upload otherwise. It runs only as a job inside the cluster, from the verified image. The Screeps API token lives only in the cluster — tell me when it's time to rotate it off my laptop.

Flux reconciles the cluster from a git repo. No kubectl apply in any documented workflow.

Acceptance: deploying an unsigned image is blocked. Deploying by tag instead of digest is blocked. The deployer refuses a bundle whose attestation doesn't match. Show me each block.

Phase 5 — Adversarial validation

Write docs/GATE-ASSURANCE.md and a script that runs these as a repeatable suite:

Push an unsigned image and attempt deployment.
Sign with a different workflow identity and attempt deployment.
Tamper with package-lock.json resolved URLs.
Upload a Screeps bundle directly with the API token, bypassing the deployer.
Delete the Kyverno ValidatingWebhookConfiguration, then deploy an unsigned image.

For each: what we expected, what happened, and whether it's a gap. Test 4 and test 5 are expected to reveal gaps on the first run — that's the point. Fix them and re-run.

Then add: a quarantine check rejecting dependencies published within the last 72 hours, and a Rekor monitoring script that alerts on signatures made with our identity that our workflows didn't produce.

Acceptance: every test in the suite blocks, with output captured in docs/GATE-ASSURANCE.md.

Phase 6 — Test depth

Now that delivery is trustworthy, deepen the testing:

Integration tests via screeps-server-mockup: run N ticks against a synthetic world, assert state transitions.
Performance test on the private server: 1000 ticks, assert average CPU per tick under budget. Treat the CPU limit as an SLO and make regression a hard build failure.
Functional: assert RCL progression and energy throughput over a long run.
Chaos: destroy the spawn mid-run, or inject hostiles, assert the colony recovers.
Canary: deploy to the private server first, watch CPU and throughput against thresholds, then promote to live.
Rollback: verify the previous signed bundle can be redeployed and the colony survives the transition.

Acceptance: a performance regression I deliberately introduce fails the build with a clear message naming the CPU delta.

Start here

Read this file, then confirm your understanding of Phase 0 and what you'll produce. Ask me anything ambiguous before you write code. Then begin Phase 0 and stop when its acceptance test passes.
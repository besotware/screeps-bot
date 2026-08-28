# Development setup

## Prerequisites

Node 24 (the version CI runs; `engines` requires >= 22) and git 2.34+ for
commit signing.

```bash
npm ci        # never npm install -- the lockfile is the source of truth
```

`.npmrc` sets `ignore-scripts=true`, so no dependency executes an install
script on your machine either. If something genuinely needs one, that is a
decision to record in `docs/DECISIONS.md`, not a setting to switch off.

## Everyday commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Bundle to `dist/main.js` |
| `npm test` | Unit tests |
| `npm run test:coverage` | Tests with coverage |
| `npm run coverage:check` | Compare coverage against the committed baseline |
| `npm run coverage:baseline` | Raise the baseline to current coverage |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

### Run everything CI runs, before pushing

```bash
npm run typecheck && npm run lint && npm run test:coverage && npm run coverage:check && npm run build
```

Six gates block merges to `main`. Nothing stops you pushing a branch that
fails them, but the PR will not merge.

## Git identity

Set **per-repo**, because the global identity on this machine is different:

```bash
git config user.name  "besotware"
git config user.email "besotware@gmail.com"
```

A fresh clone needs this again, or commits are authored by the wrong person.
Verify with `git config user.email` before your first commit.

## The coverage ratchet

CI fails if statements, branches, functions or lines drop below
`coverage-baseline.json`. It is a ratchet, not a threshold: it only moves up,
and every move is a diff someone can see.

Add code, add tests. If coverage went **up**, lock it in:

```bash
npm run coverage:baseline
git add coverage-baseline.json
git commit -m "chore: raise coverage baseline"
```

If you genuinely need to lower it, the same command does it — but say why in
the PR description. Lowering the baseline is meant to be an act someone
reviews, which is the entire reason the number lives in a committed file rather
than being computed from `main` at runtime.

## Commit signing

> **Not yet active.** The choice between SSH signing and gitsign is open — see
> the signing decision in `docs/RULESET.md`. Both procedures are below so
> whichever gets picked is a copy-paste. Do not enable *Require signed commits*
> on the ruleset until a signed commit has been observed as Verified.

### Option A — SSH signing

GitHub verifies these natively.

```bash
ssh-keygen -t ed25519 -C "besotware@gmail.com" -f ~/.ssh/id_ed25519_signing

git config gpg.format ssh
git config user.signingkey ~/.ssh/id_ed25519_signing.pub
git config commit.gpgsign true
```

Register the **public** key at GitHub → Settings → SSH and GPG keys → New SSH
key, with key type **Signing Key** (not Authentication Key — a key added as
authentication only will not verify signatures).

Check it:

```bash
git commit --allow-empty -m "chore: verify commit signing"
git log --show-signature -1
```

Then confirm GitHub shows **Verified** on the pushed commit before enabling the
ruleset rule.

### Option B — gitsign (keyless, Sigstore)

No private key on disk. Each commit gets a short-lived certificate from Fulcio
bound to an OIDC identity, and the signature is logged to Rekor.

Install (verify the checksum against the release's `checksums.txt` — do not
skip this, the whole point is that we can name what we execute):

```bash
GITSIGN_VERSION=0.13.0   # check github.com/sigstore/gitsign/releases for current
curl -sSfL -o gitsign \
  "https://github.com/sigstore/gitsign/releases/download/v${GITSIGN_VERSION}/gitsign_${GITSIGN_VERSION}_linux_amd64"
curl -sSfL -o gitsign-checksums.txt \
  "https://github.com/sigstore/gitsign/releases/download/v${GITSIGN_VERSION}/gitsign_${GITSIGN_VERSION}_checksums.txt"
grep "linux_amd64$" gitsign-checksums.txt | sha256sum -c -
chmod +x gitsign && sudo mv gitsign /usr/local/bin/
```

On Windows use the `windows_amd64.exe` asset and put it on `PATH`.

Configure this repo only:

```bash
git config gpg.x509.program gitsign
git config gpg.format x509
git config commit.gpgsign true
```

First commit opens a browser for the OIDC flow; the certificate lasts ten
minutes and is discarded.

```bash
git commit --allow-empty -m "chore: verify gitsign signing"
gitsign verify --certificate-identity="besotware@gmail.com" \
  --certificate-oidc-issuer="https://github.com/login/oauth" HEAD
```

**Expect GitHub to show this commit as Unverified.** That is not a
misconfiguration — GitHub does not trust Fulcio's root, which is exactly why
Option B pairs with a CI identity check instead of the ruleset rule. Verify the
identity assertion above succeeds; ignore the badge.

## Repository layout

```
src/domain/     Pure decision logic. No Game, no Memory, no globals.
src/runtime/    Projects live Screeps objects, issues intents.
src/main.ts     The tick loop.
test/           Unit tests; test/helpers/mockGame.ts stands in for the runtime.
scripts/        Build and the coverage ratchet.
docs/           PROGRESS, DECISIONS, RULESET, GATE-PROOF.
```

New decision logic belongs in `src/domain/` as a pure function over plain data.
That is what keeps it testable without simulating a world, and it is why the
coverage baseline is as high as it is.

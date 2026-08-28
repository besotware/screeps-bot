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

> **Decided: gitsign (Option B).** Follow the gitsign section below; the SSH
> section is kept only as the rejected alternative. *Require signed commits*
> stays **off** on the ruleset — GitHub cannot read Sigstore signatures. A
> `Commit signing` status check asserts the certificate identity instead, which
> is a stronger claim than GitHub's badge. See `docs/RULESET.md`.
>
> The CI check is in **reporting mode** until signing works end to end, so
> nothing is blocked while you set this up.

### Option A — SSH signing *(not chosen — kept for reference)*

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

### Option B — gitsign (keyless, Sigstore) — **this is the one to set up**

No private key on disk. Each commit gets a short-lived certificate from Fulcio
bound to an OIDC identity, and the signature goes to the Rekor transparency log.

**1. Install.** Version and checksum below are the ones CI verifies against, so
you and CI run the same binary. Do not skip the checksum — being able to name
what we execute is the whole point.

Windows (PowerShell), from the repo root:

```powershell
$ver = "0.17.1"
$url = "https://github.com/sigstore/gitsign/releases/download/v$ver/gitsign_${ver}_windows_amd64.exe"
Invoke-WebRequest -Uri $url -OutFile gitsign.exe
# Compare against the windows_amd64.exe line in the release's checksums.txt
(Get-FileHash gitsign.exe -Algorithm SHA256).Hash.ToLower()
curl.exe -sL "https://github.com/sigstore/gitsign/releases/download/v$ver/checksums.txt" | Select-String "windows_amd64.exe"
```

Move `gitsign.exe` somewhere on `PATH` once the two hashes match.

Linux:

```bash
GITSIGN_VERSION=0.17.1
GITSIGN_SHA256=69213a8a0813a151e5a47d0060862952ff833a845d57309dff76f7ba6600abae
curl -sSfL -o gitsign \
  "https://github.com/sigstore/gitsign/releases/download/v${GITSIGN_VERSION}/gitsign_${GITSIGN_VERSION}_linux_amd64"
echo "${GITSIGN_SHA256}  gitsign" | sha256sum -c -
chmod +x gitsign && sudo mv gitsign /usr/local/bin/
```

**2. Configure this repo only** (not global — the rest of your work should not
suddenly require a browser round-trip per commit):

```bash
git config gpg.x509.program gitsign
git config gpg.format x509
git config commit.gpgsign true
```

**3. Sign one commit.** A browser opens for the OIDC flow. **Note which provider
you pick** — GitHub, Google or Microsoft — because that choice determines the
issuer recorded in the certificate, and the CI check has to assert the one you
actually used.

```bash
git commit --allow-empty -m "chore: verify gitsign signing"
```

**4. Verify locally**, substituting the issuer matching your provider:

| Provider chosen | `--certificate-oidc-issuer` |
| --- | --- |
| GitHub | `https://github.com/login/oauth` |
| Google | `https://accounts.google.com` |
| Microsoft | `https://login.microsoftonline.com` |

```bash
gitsign verify --certificate-identity="besotware@gmail.com" \
  --certificate-oidc-issuer="https://github.com/login/oauth" HEAD
```

Expect `Validated Git signature: true`, `Validated Rekor entry: true`,
`Validated Certificate claims: true`.

Use `gitsign verify`, not `git verify-commit`. Per gitsign's own docs the git
commands pass through no expected identity, so they confirm the signature is
cryptographically sound and present in Rekor but not *who* made it — which is
the only part we actually care about.

**5. Expect GitHub to show the commit as Unverified.** Not a misconfiguration:
GitHub does not trust Fulcio's root. That is exactly why the `Commit signing`
status check exists. Ignore the badge; trust the check.

Report the issuer you used, so it can be pinned in the workflow before the gate
goes enforcing.

## Watching the bot run

There is no automated upload yet — the deployer arrives in Phase 4, and a
Screeps API token is deliberately not created until then.

```bash
npm run build      # produces dist/main.js
```

Paste the contents of `dist/main.js` into the Screeps client's script editor
(`main` module) and commit it to a branch. Works on the official server or a
private one.

**What you should see.** Console prints one line per room, on a 25-tick
interval or immediately whenever the colony is short of a creep:

```
[W1N1 t3421] RCL2 [=====     ] E 300/550  har 0/0  min 2/2  hau 2/2  bld 1/1  upg 2/2  sites 3  cpu 4.2/20
```

A `!` after a count means that role is short — the fastest way to spot a
spawn-planning problem. The same numbers are drawn in the room itself as an
overlay, red for a shortfall.

**Roughly what happens, in order.** Two harvesters bootstrap the room and feed
the spawn. At tick 0 and every 50th tick the planner queues construction —
source containers first, then extensions. Once a container finishes, a miner
spawns and is bound to that source for life; a hauler follows. Harvesters stop
being replaced once every source has a miner. Builders appear whenever there is
something to build or repair and fall back to upgrading when idle. Towers, once
you reach RCL 3, shoot healers first and repair only above a 300-energy reserve.

Useful console filters while watching: `[spawn]`, `[build]`, `[tower]`,
`[memory]`, and `threw` for the guard messages.

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

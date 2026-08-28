# Branch ruleset for `main`

Settings for you to apply. Nothing here is applied automatically — changing
repository settings is on the stop-and-ask list.

**Where:** repo → Settings → Rules → Rulesets → **New branch ruleset**

---

## Ruleset: `main-protection`

| Field | Value |
| --- | --- |
| Ruleset name | `main-protection` |
| Enforcement status | **Active** |
| Bypass list | *(empty — see note below)* |
| Target branches | Include **default branch** |

### Rules to enable

| Rule | Setting |
| --- | --- |
| **Restrict deletions** | ✅ on |
| **Block force pushes** | ✅ on |
| **Require linear history** | ✅ on |
| **Require a pull request before merging** | ✅ on |
| ↳ Required approvals | `0` |
| ↳ Dismiss stale approvals on push | ✅ on |
| ↳ Require conversation resolution | ✅ on |
| **Require status checks to pass** | ✅ on |
| ↳ Require branches to be up to date | ✅ on |
| **Require signed commits** | ⚠️ *see the signing decision below — do not enable yet* |

### Required status checks

Add these six by name. They must match the `name:` of each job exactly —
GitHub matches on the reported check name, and a mismatch means the ruleset
waits forever for a check that never arrives:

```
Build
Unit tests
ESLint
Semgrep (SAST)
OSV-Scanner (SCA)
gitleaks (secrets)
```

Source: `.github/workflows/ci.yml`. Renaming a job silently detaches its gate —
rename in both places or neither.

### Notes on choices

**Required approvals = 0.** You are the only maintainer; requiring an approval
you cannot give yourself would just mean routinely using the bypass, which
trains the habit of bypassing. The gate that matters here is the status checks.
Raise this the moment a second person has write access.

**Empty bypass list.** A bypass entry is the thing every audit finds. Leave it
empty; if you genuinely lock yourself out, you can edit the ruleset — that edit
is itself logged, which a standing bypass is not.

**Require branches to be up to date** costs an extra rebase per PR but closes
the semantic-conflict hole where two individually-green PRs merge into a broken
`main`.

---

## The signing decision

Phase 1 asks for two things that conflict on GitHub today:

1. **Require signed commits** in the ruleset, and
2. **gitsign** for keyless commit signing.

GitHub marks a commit *Verified* for GPG, SSH, or S/MIME signatures whose key
it can associate with an account. gitsign produces an x509 signature backed by
a short-lived Sigstore/Fulcio certificate. Fulcio's root is not in GitHub's
trust store, so **GitHub shows gitsign commits as Unverified** — and with
*Require signed commits* enabled it rejects the push outright.

Turning both on does not give you defence in depth. It gives you a repo you
cannot commit to.

### Option A — SSH signing (works with the ruleset today)

Sign with an SSH key registered on your account. GitHub verifies it, the
ruleset enforces it, done. Setup is in `docs/DEVELOPMENT.md`.

*Gives up:* keyless. There is a private key on the laptop, which is the thing
Phase 3's "never write a private key to disk" rule exists to avoid — though
that rule is written about *artifact* signing, not commits.

### Option B — gitsign plus a CI identity check (recommended)

Sign with gitsign. Leave *Require signed commits* **off**, because GitHub
cannot read those signatures. Instead add a required status check that verifies
every commit in the PR is gitsign-signed *and* that the certificate identity is
the expected one.

This is strictly stronger than the checkbox. GitHub's *Verified* badge asserts
"some key linked to some account signed this." An identity check asserts "this
specific identity, from this specific issuer, signed this" — the distinction
CLAUDE.md line 24 is built around. It also puts commit signing on the same
Sigstore/Rekor footing as the artifact signing in Phase 3, rather than running
two unrelated signing systems.

*Gives up:* the green *Verified* badge in the GitHub UI, and push-time
rejection — an unsigned commit is caught at the merge gate rather than refused
at push. It also means writing and maintaining the verification job.

### Recommendation

**Option B.** The whole premise of this project is that a control you have
watched block something beats a setting you have ticked, and Option A's gate
checks validity where Option B's checks identity.

But it is a real trade: Option A is enforced by GitHub at push time and costs
nothing to maintain, while Option B is enforced by a job we have to write
correctly. If you would rather have the simpler thing working now and revisit
signing in Phase 3 alongside cosign, Option A is a defensible call.

**Either way: leave *Require signed commits* off when you first apply this
ruleset.** Enable it only under Option A, and only after your first signed
commit shows as Verified.

---

## What to paste back

After applying:

```bash
gh api repos/besotware/screeps-bot/rulesets --jq '.[] | "\(.name)  \(.enforcement)"'
```

Then confirm the gates actually bite — this should be **refused**:

```bash
git switch main
git commit --allow-empty -m "chore: verify ruleset blocks direct push"
git push origin main
```

A ruleset that has not refused a push is a ruleset we are assuming works.
Expect `protected branch hook declined`. If it succeeds, the ruleset is not
targeting the default branch — check the target, not the rules.

Clean up after with `git reset --hard origin/main`.

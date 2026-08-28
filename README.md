# screeps-bot

A Screeps bot in TypeScript, and the supply-chain-hardened delivery pipeline
around it.

The bot is the excuse. The pipeline is the point: the goal is a delivery chain
meeting the equivalent of SLSA Build L3 and SLSA Dependency L3/L4, built only
from free and open-source tooling, where every control has been watched blocking
something rather than merely configured.

## Status

Phase 1 — merge gates. Six CI jobs plus a coverage ratchet all block merges.
The colony runs five roles with automatic base building, tower defence and
per-tick telemetry. See [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Layout

```
src/domain/     Pure decision logic. No Game, no Memory, no globals.
                body, roles, assignment, targets, construction, defense, stats
src/runtime/    Projects live Screeps objects, issues intents.
                creeps, spawning, building, towers, telemetry, projection
src/main.ts     The tick loop.
test/           Unit tests; test/helpers/mockGame.ts stands in for the runtime.
scripts/        Build and the coverage ratchet.
docs/           PROGRESS, DECISIONS, DEVELOPMENT, RULESET, GATE-PROOF.
```

The domain/runtime split is deliberate: it lets the decisions be tested with
plain objects and no simulated world. See ADR-0004.

## Development

```bash
npm ci            # never npm install -- the lockfile is the source of truth
npm run build     # bundles to dist/main.js
npm test          # unit tests
npm run test:coverage
npm run typecheck
npm run lint
```

`.npmrc` sets `ignore-scripts=true`. If a dependency genuinely needs a lifecycle
script, that is a decision to make explicitly and record in `docs/DECISIONS.md`,
not a setting to turn off.

## License

MIT

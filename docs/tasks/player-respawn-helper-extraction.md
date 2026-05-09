# Task: player-respawn-helper-extraction

Last verified: 2026-05-09

Cycle: `cycle-2026-05-13-player-controller-and-hud-split` (R1)

## Goal

Extract `beginRejoiningSquad` helper from `PlayerRespawnManager.ts` per the
2026-05-08 reviewer note in `docs/CARRY_OVERS.md`. Drop method count from
53 to ≤50.

## Required reading

- `src/systems/player/PlayerRespawnManager.ts`
- `docs/CARRY_OVERS.md` — RespawnManager reviewer note

## Files touched

- New: `src/systems/player/respawn/RejoinSquadHelper.ts` — `beginRejoiningSquad(player, squad, terrain)` standalone function (≤150 LOC)
- New: `src/systems/player/respawn/RejoinSquadHelper.test.ts` — 3+ behavior tests
- Modified: `PlayerRespawnManager.ts` — calls into helper instead of inlined method; method count drops to ≤50
- Modified: `scripts/lint-source-budget.ts` — remove `PlayerRespawnManager.ts` from GRANDFATHER

## Steps

1. `npm ci --prefer-offline`.
2. Read PlayerRespawnManager.ts. Locate `beginRejoiningSquad` (or whichever method handles squad-rejoin entry — name may differ today, find via grep "rejoin").
3. Extract to standalone helper. Keep the same signature.
4. Wire RespawnManager to call the helper.
5. Verify method count via `npm run lint:budget`.
6. Run lint, typecheck, test:run, perf compare, 5-min playtest (death + respawn into squad several times).

## Verification

- `wc -l src/systems/player/respawn/RejoinSquadHelper.ts` ≤200
- `npm run lint:budget` shows PlayerRespawnManager.ts no longer over 50 methods
- Helper has 3+ tests
- 5-min playtest: respawn into squad works correctly across multiple modes

## Non-goals

- Don't fully split PlayerRespawnManager itself (this cycle scope is just the method-count gate)
- Don't change respawn behavior

## Branch + PR

- Branch: `task/player-respawn-helper-extraction`
- Commit: `refactor(player): extract beginRejoiningSquad helper (player-respawn-helper-extraction)`

## Reviewer: none required
## Playtest required: yes

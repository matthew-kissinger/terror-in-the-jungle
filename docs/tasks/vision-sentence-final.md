# Task: vision-sentence-final

Last verified: 2026-05-09

Cycle: `cycle-2026-05-17-phase-5-new-normal` (R2)

## Goal

Update the canonical vision sentence in README.md, AGENTS.md, and
docs/ROADMAP.md to reflect the actual verified frontier from cycle 8 (Phase F).

## Files touched

- `README.md` — replace the canonical vision quote
- `AGENTS.md` — replace the canonical vision sentence
- `docs/ROADMAP.md` — update the `Canonical vision sentence` block + the `Phase F` description

## Steps

1. Read `docs/cycles/campaign-2026-05-09/RESULT.md` (post-cycle-8) to determine the verified frontier:
   - If F3 met targets: "engine architected for 3,000 combatants via materialization tiers; live ECS combat verified at 1,000 NPCs"
   - If F3 missed targets: "engine architected for 3,000 combatants via materialization tiers; live combat verified at 200+ NPCs (1,000 in active development)"
   - If F1 abandoned (OOP committed): drop "ECS" from the sentence
2. Apply the chosen sentence to all 3 docs verbatim.
3. Run `npm run lint:docs` — the canonical-vision check should still pass (the lint script's CANONICAL_VISION_SUBSTR may need a one-line update; verify and update if needed).
4. Run `npm run lint`, `npm run typecheck`.

## Verification

- `grep -r "3,000" README.md AGENTS.md docs/ROADMAP.md` returns the new sentence on each, identical
- `npm run lint:docs` clean

## Branch + PR

- Branch: `task/vision-sentence-final`
- Commit: `docs: update canonical vision sentence post-Phase-F (vision-sentence-final)`

## Reviewer: none required
## Playtest required: no

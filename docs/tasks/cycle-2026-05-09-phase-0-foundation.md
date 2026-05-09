# Cycle: cycle-2026-05-09-phase-0-foundation

Last verified: 2026-05-09

Status: in review (single-PR cycle, executed 2026-05-09 as part of the
realignment plan at `C:/Users/Mattm/.claude/plans/can-we-make-a-lexical-mitten.md`)

This is the **foundation cycle** of the 12-week realignment. It installs the
durable rules (lints, gates, doc discipline) and ships the WorldBuilder dev
console as an isolation/validation tool the Politburo can use to test the
running game. It deliberately does **not** modify game code — Phase 1 onward
does that. Phase 0 establishes the substrate.

## Cycle DAG

Single batch (no parallel executors). Phase 0 is small enough to run as one
PR rather than orchestrated subagent fan-out.

| Slug | Description |
|------|-------------|
| `phase-0-foundation` | All of Phase 0 (rules + WorldBuilder + cycle brief) |

## Files touched

### Created (new)

- `docs/CARRY_OVERS.md` — single source of truth for unresolved items
- `docs/dev/worldbuilder.md` — WorldBuilder console reference
- `docs/tasks/cycle-2026-05-09-phase-0-foundation.md` — this file
- `scripts/lint-docs.ts` — date-header + LOC + canonical-vision linter
- `scripts/lint-source-budget.ts` — max 700 LOC + max 50 methods/class with grandfather list
- `scripts/check-fence.ts` — pre-flight `[interface-change]` marker check
- `scripts/cycle-validate.ts` — banned-keyword check + carry-over increment
- `scripts/scenario-smoke.ts` — luma + black-pixel + identical-pixel gate per scenario
- `scripts/artifact-prune.ts` — 30-day retention with cited-doc / baseline-pin keep rules
- `src/dev/worldBuilder/WorldBuilderConsole.ts` — Shift+G dev console (~290 LOC)
- `src/dev/worldBuilder/WorldBuilderConsole.test.ts` — 13 behavior tests, all green

### Modified

- `README.md` — canonical vision sentence
- `AGENTS.md` — canonical vision sentence
- `docs/ROADMAP.md` — canonical vision sentence as the single source of truth
- `docs/AGENT_ORCHESTRATION.md` — reviewer pre-merge gate, cycle-name stoplist, carry-over discipline, `Last verified` date
- `.claude/agents/orchestrator.md` — reviewer pre-merge gate, cycle stoplist hard-stops
- `.claude/settings.local.json` — `git push:*`, `git commit:*`, `git merge:*`, `git tag:*`, `git checkout:*`, `gh pr merge:*`, `gh repo edit:*` moved from auto-allow to ask
- `package.json` — adds `lint:budget`, `lint:docs`, `check:fence`, `check:cycle`, `check:smoke-scenarios`, `check:smoke-scenarios:dev`, `artifact:prune`, `artifact:prune:apply` scripts; updates `validate:fast` to chain new lints
- `src/core/GameEngine.ts` — registers WorldBuilderConsole alongside LiveTuningPanel under `import.meta.env.DEV`

## Success criteria

All of:

1. ✅ `npx tsx scripts/lint-docs.ts` exits 0 (17 warnings against grandfather list, 0 failures)
2. ✅ `npx tsx scripts/lint-source-budget.ts` exits 0 (29 warnings, 0 failures)
3. ✅ `npx tsx scripts/cycle-validate.ts cycle-2026-05-09-phase-0-foundation` exits 0
4. ✅ `npx tsx scripts/cycle-validate.ts cycle-2026-05-09-stabilization-reset` exits 1 (banned)
5. ✅ `npx tsx scripts/check-fence.ts` exits 0 (fence not touched)
6. ✅ `npx tsx scripts/artifact-prune.ts` reports prunable count (dry-run)
7. ✅ `npx vitest run src/dev/worldBuilder/WorldBuilderConsole.test.ts` 13/13 green
8. ⚠️  `npm run typecheck` — pre-existing test-file errors NOT from this cycle (Mock<...> drift, Array.prototype.at, etc.); source-only typecheck (the one `npm run typecheck` actually runs) must pass
9. ⚠️  `npm run lint` (eslint src/) must pass
10. ⚠️  Dev preview: `Shift+G` opens the WorldBuilder; `window.__worldBuilder` is defined; toggles persist across reload

## Verification

### Static gates

```bash
npm run lint                    # eslint src/ — must pass
npm run lint:budget             # max-LOC + max-method gate — 0 fail expected
npm run lint:docs               # date-header + LOC budget — 0 fail expected
npm run typecheck               # source-only tsc — must pass
npx vitest run src/dev/worldBuilder/  # WorldBuilder tests — 13/13 expected
```

### Smoke gates

```bash
npm run check:cycle cycle-2026-05-09-phase-0-foundation        # PASS
npm run check:cycle cycle-2026-05-09-cleanup-and-polish        # FAIL (banned)
npm run check:fence                                             # PASS (fence not touched)
npm run artifact:prune                                          # dry-run report
```

### Browser preview

```bash
npm run dev
# 1. Open http://localhost:5173, start any game mode.
# 2. Press Shift+G — WorldBuilder panel appears at top-right.
# 3. DevTools console: `window.__worldBuilder` should be defined with
#    invulnerable=false, shadowsEnabled=true, active=true, etc.
# 4. Toggle "Shadows enabled" off → no shadows render.
# 5. Toggle "HUD visible" off → HUD elements with [data-hud-root] hide.
# 6. Click "Pause All" → game freezes; click "Resume" → game continues.
# 7. Reload page → previous toggles persist (read from localStorage).
```

## Why this is one PR (not fanned out)

Each piece is mechanically small (rules-installation work). Fanning out to
subagents would mean each touches `package.json` and creates merge conflicts
on a single file. One reviewable PR is the right shape. The next cycle
(Phase 1 doc decomposition) is the first to use the multi-agent pattern.

## Reviewer notes

This PR touches **`src/core/GameEngine.ts`** (registers the new console) which
is in the combat-reviewer scope (well, no — combat-reviewer is for
`src/systems/combat/**`; GameEngine is core, no required reviewer).
**No fenced interface changes** — `src/types/SystemInterfaces.ts` is not
modified. **No combat / terrain changes** — no reviewer subagent required.

Per the new pre-merge reviewer rule landing in this PR: future combat /
terrain-nav PRs require reviewer APPROVE before merge. This PR is the one
that defines that rule, so it can self-bootstrap.

## Carry-overs spawned by this cycle (Phase 1 wiring)

The WorldBuilder ships with state flags but the engine-side wiring for some
flags is intentionally deferred. Six new carry-overs (`worldbuilder-wiring`
family) are added to `docs/CARRY_OVERS.md` for Phase 1:

- `worldbuilder-invulnerable-wiring`
- `worldbuilder-infinite-ammo-wiring`
- `worldbuilder-noclip-wiring`
- `worldbuilder-postprocess-wiring`
- `worldbuilder-tod-wiring`
- `worldbuilder-ambient-audio-wiring`

The "carry-over count cannot grow" rule activates **after** this cycle.
Phase 0 is the foundation cycle and is allowed to spawn the wiring tasks
that Phase 1 will close.

## End-of-cycle ritual

1. Move this brief to `docs/tasks/archive/cycle-2026-05-09-phase-0-foundation/phase-0-foundation.md`.
2. Append cycle entry to `docs/BACKLOG.md` "Recently Completed".
3. Update `docs/AGENT_ORCHESTRATION.md` "Last closed cycle" section.
4. Run `npm run check:cycle -- cycle-2026-05-09-phase-0-foundation --close` to increment carry-over counters and refresh `Last verified`.
5. Commit as `docs: close cycle-2026-05-09-phase-0-foundation`.
6. The next cycle (`cycle-2026-05-XX-drift-correction`) opens against the Phase 1 task list in the realignment plan.

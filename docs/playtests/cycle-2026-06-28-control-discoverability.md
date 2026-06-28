# Playtest memo — cycle-2026-06-28-control-discoverability (Phase 1, Field Readiness)

> **Automated smoke complete; owner walk-through pending.** Closed under
> `posture: autonomous-loop` (CAMPAIGN_2026-06-28-field-readiness, Phase 1).
> Merged on CI green + (radio) combat-reviewer APPROVE-WITH-NOTES. The owner
> walks the live in-game feel after the campaign.

## What shipped (4 PRs, all merged to master)

| Task | PR | Merge |
|---|---|---|
| control-hints-hud | [#426](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/426) | `ef6cd4d7`/`86512d90` |
| radio-command-menu | [#427](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/427) | `a8f27f1c` |
| hud-overlap-and-scoreboard | [#425](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/425) | `d793d5b6` |
| seat-and-fire-cues | [#428](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/428) | `e65a5ab4` |

The dominant playtest finding was **discoverability, not missing features** — the
game already does more than it showed. Phase 1 surfaces it.

## Automated evidence (Playwright, headless, from the main worktree)

Captured by a one-off boot+drive script (game boots in ~6.7s; tdm mode).
`textContent` is the committed proof here — local PNGs flaked on Playwright's
font-load wait (a known headless screenshot flake), but the rendered text is
decisive and richer than a screenshot. Local report:
`artifacts/cycle-2026-06-28-control-discoverability/playtest-evidence/capture-report.json`
(artifacts/ is gitignored — local-only for the owner's morning review).

### control-hints-hud ✅ — on-foot legend renders with the right binds
Pinned to the **right HUD edge** (rect x≈1723 of 1920 — NOT bottom-left where
health/attribution live). Rendered legend, on foot:

```
ON FOOT
WASD Move · Shift Sprint · Space Jump · LMB/RMB Fire/ADS · R Reload ·
1-6 Weapons · G Grenade · F Board vehicle · T Air support radio ·
Z Squad commands · Shift+1-5 Quick commands · TAB Scoreboard
```

Every discoverability gap the owner hit is now on-screen: **T air support radio,
Z squad commands, F board vehicle, TAB scoreboard.** Per-context (vehicle /
aircraft) legend contents are unit-test-proven (`HudControlHints.test.ts`).

### radio-command-menu ✅ — `T` opens ONE unified, legible menu
The captured overlay (opened with `T`) lists **FIRE SUPPORT 7/7 READY** + **SQUAD**:

```
FIRE SUPPORT  7/7 READY   (mark modes: SMOKE / WP / GRID)
  A-1 NAPALM        A-1 Skyraider / Napalm        READY
  A-1 ROCKETS       A-1 Skyraider / Rocket pods   READY
  F-4 BOMBS         F-4 Phantom / Bombs           READY
  AC-47 ORBIT       AC-47 Spooky / Miniguns       READY
  COBRA ROCKET RUN  AH-1 Cobra / Rockets          READY
  HUEY GUNSHIP STRAFE  UH-1C Gunship / Minigun    READY
  B-52 ARC LIGHT    B-52 Stratofortress / Bombs   READY
SQUAD  (Shift+1-6, or click a row)
  SHIFT+1 FOLLOW · SHIFT+2 HOLD · SHIFT+3 PATROL ·
  SHIFT+4 FALL BACK · SHIFT+5 STAND DOWN · SHIFT+6 ATTACK
  (each row carries a plain-language effect line)
```

This is the owner's requested "radio as an item" — all 7 sorties + cooldowns +
mark mode AND the 6 squad orders with labels, on one surface. The strike call-in
still drives the existing `requestSupport` path (unit-proven: called once,
`requesterFaction: US`, Vector3 target). combat-reviewer APPROVE-WITH-NOTES.

### hud-overlap-and-scoreboard ✅ — attribution no longer overlaps health
Attribution moved from bottom-left to **bottom-center** (`left:50%; bottom:2px;
translateX(-50%)`, `pointer-events:none`); the health pill keeps the bottom-left
slot (captured rect x:0 y:954 w:478 h:70). Non-overlap is unit-proven
(`ScoreboardHintAndAttribution.test.ts`). The "TAB Scoreboard" hint is present in
the legend (the scoreboard tracks correctly — it was always hold-Tab, not a bug).

### seat-and-fire-cues ✅ (visual deferred) — cues unit-proven
Seat label + `F: swap seat` (multi-crew only) + `LMB: fire` (armed seats) +
transient **"Airborne to fire"** on a grounded fixed-wing fire attempt, and the
AC-47 pilot/RMB-gun-cam clarification, are all unit-proven
(`FixedWingHUD.test.ts`, `HudControlHints.test.ts`, `FixedWingModel.test.ts`).
The live in-vehicle/aircraft visual capture timed out here only because `tdm`
(the fast-boot mode used for capture) has no helipad to board — **this is the
walk item below, not a defect.**

## What the owner should walk (live, in-game)

1. **On foot** — confirm the right-edge control legend reads cleanly and lists
   T radio / Z squad / TAB scoreboard / F board.
2. **Radio** — press `T`: one menu, FIRE SUPPORT (7 assets + cooldowns + SMOKE/WP/
   GRID) and SQUAD (Shift+1-6 with effects). Mark a strike — it should fly + land.
3. **In a ground vehicle** — board the M151/M48: legend switches to the vehicle
   context; seat label + exit/seat-swap cue read correctly.
4. **In an aircraft** — board the AC-47 (and a heli door-gun): seat label shows
   you're the **pilot**; on the runway, an LMB fire attempt flashes **"Airborne
   to fire"** instead of doing nothing; airborne, guns fire.
5. **Scoreboard** — mid-firefight, hold **Tab**: kills/score increment and display.
6. **Overlap** — confirm the attribution notice (bottom-center) never sits over
   the health pill (bottom-left) at any window size.

## Notes
- Perf gate not run for Phase 1 (additive HUD, no hot path — perf-analyst gates
  Phases 2/3/4/6 per the manifest).
- Local screenshots are best-effort (font-load flake); `textContent` above is the
  authoritative automated evidence. CI `smoke` (no-crash boot) passed on all 4 PRs.
- Base-repair folded into #426: a pre-existing `FixedWingConfigs` gear-clearance
  test failure (from the `f8c3518c` A-1 re-roll) + the doc-drift gate (briefs
  committed ahead of code) — both healed; not part of the owner walk.

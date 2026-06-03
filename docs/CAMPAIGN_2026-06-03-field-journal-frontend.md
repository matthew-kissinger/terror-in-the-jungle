# Campaign: Field Journal Frontend Wiring

> **Date:** 2026-06-03
> **Posture:** **IN PROGRESS.** Cycle 1 (foundation) landed + verified (lint/typecheck/5260 tests/build green); working through the surface cycles.
> **Auto-advance:** no (each cycle is reviewed + playtested before the next opens).
>
> **Progress:** ✅ 1 foundation · ✅ 2 shell · ✅ 3 deploy* · ✅ 4 hud-combat · ✅ 5 hud-mobile · ✅ 6 overlays · ✅ 7 vehicles · 🔶 8 sweep
> *(deploy screen chrome + layout + fit-to-viewport done & verified; in-canvas map markers + real-device playtest are follow-ups)*
>
> **Status:** cycles 1–7 landed + auto-verified (lint/typecheck/**5260 tests**/build; check:mobile-ui; check:fence). check:hud is environmentally broken locally (headless WebGPU-fallback boot) — validates in CI. Visually confirmed: title, mode-select, deploy (PC+phone), in-game HUD, settings modal. The in-game HUD (4), touch controls (5), and vehicle HUDs (7) render only in live gameplay → final visual + overlap/placement is the one human PC + real-device playtest pass (Principle 5).
>
> **Remaining — Cycle 8 (sweep):** migrate the ~48 hardcoded Teko/Rajdhani/JetBrains `font-family` refs to FJ tokens, remove the old font imports from `src/main.ts`, uninstall those 3 packages, sweep for any orphaned amber tokens / dead `*.module.css`, full validation + playtest sign-off. (Old fonts were intentionally kept through 1–7 to avoid silent system-font fallback mid-campaign.) Plus follow-up task: FJ-ify the deploy map-canvas markers (`RespawnMapController`).

## Decision

**Field Journal (direction 03) won the 10-way UI/UX bake-off** (2026-06-03). The other nine directions live at [`public/mockups/`](../public/mockups/) for reference; the winner is [`public/mockups/03-field-journal/`](../public/mockups/03-field-journal/). The look is codified in [`FIELD_JOURNAL_UI.md`](FIELD_JOURNAL_UI.md).

This campaign wires Field Journal into **every** frontend surface, removes all old styling, and re-solves HUD layout/placement on PC and (especially) mobile.

## Principles (binding on every cycle)

1. **Remove all old styling — replace, don't layer.** Each migrated surface deletes its old `*.module.css` and the amber-tacticool tokens it used. A cycle leaves **zero dead/orphaned CSS** for the surfaces it touched. The old token system (`src/ui/engine/primitives.css` + `theme.css`) is rewritten in Cycle 1, not aliased.
2. **No fallbacks — fail loud.** Missing tokens/fonts/assets/values must surface visibly. No silent default-on-missing in CSS (`var(--x)` without a fallback arg) or JS. A masked failure is the bug we are removing, not adding.
3. **HUD layout is a first-class problem, not a reskin.** Reported by Matt: on PC, HUD components sometimes overlap / are mis-placed; on mobile it is worse — many components overlap and are poorly placed. Mobile gets a **dedicated layout rethink** (Cycle 5), not a scaled-down PC layout. `npm run check:hud` (PC) and `npm run check:mobile-ui` (phone) are gates, not afterthoughts.
4. **Fence discipline.** `IHUDSystem`, `IFirstPersonWeapon`, `IGameRenderer` and the rest of `src/types/SystemInterfaces.ts` are FENCED. Restyle/relayout must stay in CSS + component-internal DOM (fence-safe). If any cycle needs to change a fenced interface, **STOP** — describe it in plain English and get `[interface-change]` + human approval first ([`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)).
5. **Game-feel gate.** Any cycle touching UI responsiveness needs a human [`PLAYTEST_CHECKLIST.md`](PLAYTEST_CHECKLIST.md) pass on **PC and mobile** before close. Automated checks are necessary, not sufficient (AGENTS.md game-feel rule).
6. **Fit to viewport — no off-canvas components, no scroll-to-see.** Every screen and the in-game HUD must fit within the visible canvas at all supported sizes: nothing renders outside the viewport, and the player never has to scroll the page to see content or reach a control. Layouts **size / reflow to fit** (compact, reprioritize, tab/section) rather than overflow. The only permitted scroll is an *explicitly bounded* inner region for a genuinely unbounded list (e.g. a full scoreboard) — and even then no primary action may sit below the fold. `check:hud` (PC) and `check:mobile-ui` (phone) enforce this; if they don't yet assert off-canvas / page-overflow, extending them to do so is in-scope for the HUD cycles.

## References

- Design language — [`FIELD_JOURNAL_UI.md`](FIELD_JOURNAL_UI.md)
- Visual reference — [`public/mockups/03-field-journal/`](../public/mockups/03-field-journal/)
- Interface fence — [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)
- Cycle/dispatch protocol — [`AGENT_ORCHESTRATION.md`](AGENT_ORCHESTRATION.md)
- Branch for the campaign: `task/ui-redesign-bakeoff` (the mockups already live here; cycles branch from it or master per dispatch).

## Cycle queue

Dependencies are noted. Grouping/count is flexible — Cycles 4/5 could merge, 6/7 could merge — but mobile (Cycle 5) stays distinct per Principle 3. Each cycle closes one user-observable surface-set.

**1. `cycle-field-journal-foundation`** — KEYSTONE; blocks all others.
- Rewrite `src/ui/engine/primitives.css` + `theme.css` to the Field Journal tokens; add the three shared texture layers + shared component primitives (stamps, tape, folder-tabs, manila panel, buttons, status pills) in `src/ui/design/`; self-host fonts (`@fontsource` special-elite / courier-prime / caveat) and remove the Teko/Rajdhani/JetBrains Mono imports in `src/main.ts`; restyle the boot splash in `index.html`.
- Files: `src/ui/engine/primitives.css`, `theme.css`, `src/ui/design/tokens.ts`, `styles.ts`, `src/main.ts`, `index.html`.
- Acceptance: new tokens resolve everywhere; **zero** references to old amber tokens remain; fonts load self-hosted; `lint` + `typecheck` + `test:run` + `build` green. (Surfaces still mid-migration may look mixed — expected until their cycle.)

**2. `cycle-field-journal-shell`** — entry flow. Depends on 1.
- Reskin boot splash continuity, `TitleScreen`, `ModeSelectScreen` onto the menu + operations-log treatment. Delete their old `*.module.css`.
- Files: `src/ui/screens/TitleScreen.*`, `ModeSelectScreen.*`, `src/core/bootstrap.ts` (mount only).

**3. `cycle-field-journal-deploy`** — the hero screen + the device-reliability fix. Depends on 1.
- Reskin `DeployScreen` onto the "Insertion Map + Loadout Sheet" language **and re-solve its responsive layout** so it stops failing on mobile (the 2-col hero-map + scrolling sidebar is the current failure point). The loadout becomes the prominent 4-slot sheet, not a buried carousel.
- Files: `src/ui/screens/DeployScreen.*`, `src/ui/screens/deploy/*`, `src/ui/loadout/*` (presentation only).
- Acceptance includes `check:mobile-ui` green + human mobile playtest of deploy, and **the full deploy flow (map, spawns, vehicles, loadout, DEPLOY) fits the viewport with no page-scroll** at supported phone sizes — the current scrolling sidebar is exactly what gets removed (compact/reflow, don't overflow).

**4. `cycle-field-journal-hud-combat`** — in-game HUD reskin + **PC layout re-solve**. Depends on 1.
- Reskin the ~18 HUD components (ammo, vitals, objective, timer, tickets, kill feed, minimap, compass, crosshair, hit/score popups, etc.) onto pencil-on-acetate, and **fix PC overlap/placement** in `src/ui/layout/HUDLayout.ts` + `HUDLayoutStyles.ts`. Delete old HUD `*.module.css`.
- Files: `src/ui/hud/*`, `src/ui/minimap/*`, `src/ui/compass/*`, `src/ui/layout/*`.
- Acceptance: `check:hud` green; no overlapping modules at supported desktop sizes; **fence-safe** (no `IHUDSystem` signature change — flag immediately if one seems required).

**5. `cycle-field-journal-hud-mobile`** — mobile HUD + touch-controls layout **rethink**. Depends on 4.
- A genuine mobile layout pass (not a scale-down): reposition touch controls (joystick, fire, ADS, reload, grenade, interaction, menu) and the mobile HUD so nothing overlaps and everything is thumb-reachable; reskin onto Field Journal.
- Files: `src/ui/controls/*` (touch), `src/ui/hud/MobileStatusBar.*`, mobile branches in `HUDLayout`.
- Acceptance: `check:mobile-ui` green; human playtest on a real phone; no overlaps at 390px / notch / landscape.

**6. `cycle-field-journal-overlays`** — modals + secondary screens. Depends on 1.
- Reskin `SettingsModal`, `MissionBriefing`, `ScoreboardPanel`, `StatsPanel`, `MatchEndScreen`, the loading UI (`LoadingProgress`, `src/core/LoadingUI`), interaction prompts, zone-capture/weapon-switch notifications.
- Files: `src/ui/loading/*`, `src/ui/hud/{ScoreboardPanel,StatsPanel,MatchEndScreen,InteractionPromptPanel,ZoneCaptureNotification,...}.*`, `src/core/LoadingUI.*`.

**7. `cycle-field-journal-vehicles`** — vehicle HUDs. Depends on 1 (+ 4 for shared HUD primitives).
- Reskin `HelicopterHUD`, `FixedWingHUD`, `VehicleActionBar`, `HUDVehicleHud` (instruments, gun status, flight data).
- Files: `src/ui/hud/{HelicopterHUD,FixedWingHUD,HUDVehicleHud}.*`, `src/ui/controls/{TouchHelicopterCyclic,VehicleActionBar}.*`.

**8. `cycle-field-journal-sweep`** — close-out. Depends on 2–7.
- Verify **all** old styling removed (no orphaned `*.module.css`, no amber tokens, no old font imports), **no fallbacks** remain, run full validation, and a human playtest sign-off on PC + mobile across the whole flow.
- Gates: `lint` + `typecheck` + `test:run` + `build` + `smoke:prod` + `check:hud` + `check:mobile-ui` + `check:doc-drift`; `PLAYTEST_CHECKLIST.md`.

## When a cycle starts (per `AGENT_ORCHESTRATION.md`)

Open a directive in [`DIRECTIVES.md`](DIRECTIVES.md) (suggest prefix `DIZAYN-*`), write the task brief(s) in `docs/tasks/<slug>.md` (≤80 LOC, `_TEMPLATE.md`), populate the DAG in `AGENT_ORCHESTRATION.md`, and validate the slug with `npx tsx scripts/cycle-validate.ts <slug>`. Slugs above avoid the banned-keyword stoplist (polish/cleanup/tidy/housekeeping/etc.).

## Global hard-stops

- No fenced-interface change without the `[interface-change]` process + approval.
- UI only — **no** gameplay, sim, terrain, combat-AI, or vehicle-physics logic changes (only their HUD/UI presentation).
- No perf regression > 5% p99 on `combat120` (`perf:capture:combat120`).
- A cycle that leaves old/dead CSS for a surface it migrated, or introduces a silent fallback, is `INCOMPLETE`.
- A component that renders off-canvas, or a screen/HUD that requires page-scroll to see content or reach a control, is `INCOMPLETE`.

## Non-goals

- New gameplay features, new modes, or content changes.
- Interface/contract changes (unless a cycle explicitly proposes one with approval).
- Reworking the mockups (the bake-off is decided).

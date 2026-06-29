<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 5) -->
# faction-side-picker

From the 2026-06-28 owner decisions: add a side/faction picker (BLUFOR US/ARVN
vs OPFOR NVA/VC) so the player can choose which side to fight on — **A Shau +
(future) premiere ONLY**, NOT the standard modes. The engine plumbing already
exists: `resolveLaunchSelection` accepts a `preferredFaction` and
`applyLaunchSelection` wires it into every system; this task is the UI + launch
wiring to expose it. This also makes the new Phase-4 OPFOR marksman/SKS reachable
by a human player.

## Files touched

- `src/ui/screens/ModeSelectScreen.ts` (the faction/side selector step or control)
- `src/ui/screens/GameUI.ts` (pass the chosen faction into the launch path)
- `src/config/gameModeDefinitions.ts` (gate the picker to A Shau / premiere-capable modes)
- `*.test.ts` (new)

## Scope

1. Add a side/faction selector (BLUFOR US/ARVN vs OPFOR NVA/VC) shown ONLY for
   A Shau (and any future premiere mode flagged faction-selectable) — hidden for
   the standard modes.
2. Feed the chosen faction through the existing launch path
   (`preferredFaction` → `resolveLaunchSelection` / `applyLaunchSelection`); do
   NOT build a parallel launch path.
3. Default sensibly (current default faction) when the picker isn't shown, so
   non-A-Shau modes are unchanged.

## Non-goals

- Faction selection for the standard modes (owner decision: A Shau + premiere only).
- New launch/faction plumbing — reuse `preferredFaction`.
- Balancing the factions or building the premiere mode.

## Acceptance

- [ ] On A Shau the player can pick BLUFOR vs OPFOR and it launches that side
      (the OPFOR loadout pool incl. marksman/SKS becomes available); standard
      modes show no picker and are unchanged. Behavior test asserts the picker
      gates on the mode flag and the chosen faction reaches the launch selection.
- [ ] `npm run lint && npm run lint:budget && npm run test:run && npm run build` green.
- [ ] PR linking this brief; owner walk → PLAYTEST_PENDING.

## Dependencies

- Root (no blockers). Disjoint files from the DeployScreen cluster. No reviewer.

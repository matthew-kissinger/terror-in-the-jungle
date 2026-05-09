# Cycle: cycle-2026-05-13-player-controller-and-hud-split

Last verified: 2026-05-09

Status: queued (Phase 3 Round 3 of 5; cycle 5 of 9)

Splits the player + HUD god-modules, plus the adjacent grandfathered files.

Targets:
- `PlayerController.ts` — 1,014 LOC, 177 methods, 35 imports → 5 helpers
- `PlayerInput.ts` — 727 LOC → 2 helpers
- `PlayerMovement.ts` — 703 LOC → 2 helpers
- `PlayerRespawnManager.ts` — 53 methods → factor `beginRejoiningSquad` helper out
- `HUDSystem.ts` — 740 LOC, fan-in 34, 79 methods → 4 helpers
- `CommandModeOverlay.ts` — 823 LOC → 2 helpers
- `FullMapSystem.ts` — 742 LOC → 2 helpers (after batch A of zone-decoupling, fan-in is already lower)

## Skip-confirm: yes

## Concurrency cap: 3 (player files in one stream, HUD/UI in another, respawn in a third — cross-file conflicts low)

## Round schedule

### Round 1 — parallel (concurrency 3)

| Slug | Reviewer | Notes |
|------|----------|-------|
| `player-controller-split` | none (player isn't combat-reviewer scope, but combat-reviewer optional) | PlayerController → 5 helpers |
| `hud-system-split` | none | HUDSystem → 4 helpers |
| `player-respawn-helper-extraction` | none | Extract `beginRejoiningSquad` per the 2026-05-08 reviewer note in CARRY_OVERS |

### Round 2 — parallel (concurrency 3)

| Slug | Reviewer | Notes |
|------|----------|-------|
| `player-input-split` | none | PlayerInput → 2 helpers |
| `player-movement-split` | none | PlayerMovement → 2 helpers |
| `command-mode-overlay-split` | none | CommandModeOverlay → 2 helpers |

### Round 3 — sequential

| Slug | Reviewer | Notes |
|------|----------|-------|
| `full-map-system-split` | none | FullMapSystem → 2 helpers |
| `player-and-hud-orchestrator-trim` | none | Trim all orchestrators to ≤300 LOC, drop all 7 grandfather entries |

## Tasks in this cycle

- [player-controller-split](player-controller-split.md)
- [hud-system-split](hud-system-split.md)
- [player-respawn-helper-extraction](player-respawn-helper-extraction.md)
- [player-input-split](player-input-split.md)
- [player-movement-split](player-movement-split.md)
- [command-mode-overlay-split](command-mode-overlay-split.md)
- [full-map-system-split](full-map-system-split.md)
- [player-and-hud-orchestrator-trim](player-and-hud-orchestrator-trim.md)

## Cycle-level success criteria

1. All 7 player/HUD god modules ≤700 LOC, ≤50 methods
2. All 7 grandfather entries removed from `scripts/lint-source-budget.ts`
3. `combat120` p99 within ±2% of pre-cycle baseline
4. 10-min playtest in TDM (player + HUD heavy mode) — no feel regression
5. `RespawnManager.beginRejoiningSquad` helper exists and is called from the squad-rejoin path (closes that 2026-05-08 reviewer note)

## End-of-cycle ritual + auto-advance

Auto-advance: yes → [cycle-2026-05-14-fixed-wing-and-airframe-tests](cycle-2026-05-14-fixed-wing-and-airframe-tests.md).

# SVYAZ-4 — Squad-command rebuild (design spike)

Last verified: 2026-06-03

Owner report: "squad commands are not working well except for the circle formation on follow." This memo is the design contract for the rebuild. Stage 1 (targeting truth) has landed; Stages 2-4 are pending.

## Root cause (audited)

Two independent order interpreters, both hard-gated on `state === PATROLLING`, plus a silent player-position default:

1. **AI side** `AIStatePatrol.handleSquadCommand` writes `combatant.destinationPoint` per command — but only runs inside `handlePatrolling`, which itself promotes the NPC to `ALERT` on any nearby enemy. So orders die the instant combat starts (i.e. exactly when issued).
2. **Movement side** `CombatantMovementCommands.handlePlayerCommand` (destination→velocity) is likewise reached only from `PATROLLING`.
3. **`CombatantAI.applySquadCommandOverride`** runs every tick in all states but is explicitly designed NOT to interrupt active combat for HOLD/ATTACK/PATROL.
4. **Targeting bug:** `PlayerSquadController.issueCommand` defaulted `commandPosition` to the player's own position when the hotkey path supplied none — so HOLD/ATTACK/PATROL/FALL-BACK fired by key anchored on the player's feet.
5. **Faction fragility:** `applySquadCommandOverride` gates on `isBlufor(faction)`, not "the player's squad" — commanding as OPFOR would silently no-op.

FOLLOW works because its anchor is the live player position, recomputed every tick, with a dedicated mover and no target to mis-plumb.

## Product contract (agreed with owner)

- Orders **persist through combat** (RTS standing posture, not patrol-only hints).
- Targeting is **look-to-mark + map**: in first-person the command pings WHERE THE PLAYER IS LOOKING (camera→ground ray); on the tactical map/minimap it pings WHERE THEY CLICK. **Never the player's feet.**
- Per-command behavior: **HOLD** defend the point, engage within leash, don't chase past it, return after. **ATTACK** advance on the point as a push objective, engage en route, take + hold. **FALL BACK** break contact, move to rally (player by default; marked point if given), fire only if pinned. **PATROL** roam a radius around the point, engaging, holding the area. **FOLLOW** ring on the live player (already works). **STAND DOWN** release to autonomous AI (already works).
- Add the missing **ATTACK hotkey** (was overlay-only).

## Architecture (minimal — no AI rewrite)

- **Data model:** add `Squad.commandLeashRadius` (resolved at issue-time from config per order type). `currentCommand`/`commandPosition` stay the order board. One new pure helper `SquadOrderPosture.resolveOrderIntent(combatant, squad)` derives per-tick intent (acquisition-allowed, engage-anchor, disengage, push-objective, fallback-point). Stateless/deterministic — no `Math.random`/`performance.now()`.
- **Persistence = 4 surgical leash hooks** (all guarded so non-player / no-order behavior is byte-identical):
  - (a) **Acquisition gate** at the perception scans (`AIStatePatrol`, `AIStateDefend`, `AIStateMovement`): skip acquiring/chasing an enemy more than `leash + engageBand` from the anchor. "Return after" is emergent — the existing engage target-loss path drops back to PATROLLING which repositions to the anchor.
  - (b) **Cover/pursuit bias**: post-filter `AIStateEngage` cover + suppression-flank destinations to reject points beyond the leash from the anchor. Do NOT touch the ENGAGING strafe mover (it would fight the contour solver).
  - (c) **FALL BACK**: keep the combat interrupt (drops target); set `destinationPoint = rally`; suppress acquisition unless `lastHitTime` is within the panic window (fire-only-if-pinned).
  - (d) **ATTACK**: route the not-yet-arrived NPC through the existing `ADVANCING` state (engages en route, drops to ENGAGING on arrival) with the anchor as destination.
- **Leash changes the GOAL, not the PATH** — the terrain-aware solver / contour reroute / StuckDetector stay the sole movement authority, so this cannot re-introduce the `combat-movement-stall-tail` oscillation. (Watch-item: an unreachable HOLD anchor will StuckDetector-escalate and clear the destination; Stage 4 snaps anchors to a reachable navmesh point.)
- **Targeting:** factored `resolveCameraGroundPick` out of the air-support `resolveRadioTarget`; hotkey target-commands resolve it; map-click already plumbs correctly; removed the player-feet default; added Shift+6 for ATTACK. The `SquadCommandWorldMarker` beacon already exists (no new marker needed).

## Decisions (owner deferred; Tweakpane-tunable via a new `SquadCommandConfig`)

- **Leash: tight.** HOLD 18 m, ATTACK 22 m, PATROL roam 20 m (existing), engage-but-don't-chase band 30 m (= engagement distance). Sits above patrol arrival (15 m) and below dispersal (18 m) so it doesn't trip crowd dispersal.
- **FALL BACK rally: player by default**, honor an explicit marked point when one is given (a non-null `commandPosition` means "marked point", null means "live player").

## Staged plan

- **Stage 1 — Targeting truth (LANDED):** look-to-mark + map-click both ping a real world point, never the feet; ATTACK on Shift+6. Behavior-only, L2-tested. Files: `CommandInputManager`, `PlayerSquadController`, `PlayerInput`.
- **Stage 2 — Persistence (the core, riskiest):** `commandLeashRadius` + `resolveOrderIntent` + the acquisition leash gate. Proof L3: an NPC on HOLD shoots an in-leash enemy but won't chase a baited out-of-leash one, then returns to the anchor. Combat-reviewer required.
- **Stage 3 — Per-order posture:** ATTACK→ADVANCING; FALL BACK rally + fire-only-if-pinned; PATROL leash. Fix the `isBlufor` faction gate → `isPlayerControlled`.
- **Stage 4 — Robustness:** snap unreachable anchors to navmesh; cover/suppression leash post-filter; ping polish.

## Fence + rollout

No `SystemInterfaces.ts` change (squad command surfaces are unfenced; adding `Squad.commandLeashRadius` to `combat/types.ts` is not fenced). Ships **default-on** — the new path is dead code unless the player actually commands a squad (NPC-vs-NPC combat never touches it). The two feel tunables live in `SquadCommandConfig` for live A/B, mirroring `crowdStallStaggerEnabled` / `contourStickyHysteresisEnabled`.

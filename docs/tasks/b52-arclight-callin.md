# b52-arclight-callin

Add the B-52 Arc Light strike to the live SVYAZ-3 air-support radio: a
high-altitude flyover that walks a long bomb string across the marked line.
The most iconic Vietnam air asset becomes the new top-tier call-in, consuming
the net-new b52-stratofortress model. Part of
`cycle-2026-06-11-war-asset-repaint`. DROPPABLE: if the round goes red, this
task defers to backlog without blocking cycle close.

## Files touched

- `src/systems/airsupport/AirSupportRadioCatalog.ts`
- `src/systems/airsupport/NPCFlightController.ts` (only if the high-altitude
  spawn profile needs a parameter)
- `src/systems/vehicle/FixedWingConfigs.ts` (minimal b52 high-altitude
  profile — non-flyable by the player this cycle)
- `src/ui/hud/AirSupportRadioMenu.ts` (new asset row)
- Sibling tests for changed `src/systems/**` files

## Scope

1. Catalog entry `b52_arclight`: look-to-mark target line (reuse existing
   mark mechanism), longest cooldown in the catalog, distinct radio copy.
2. Flight profile: spawn airborne at high altitude (above AA/engagement
   ceiling, visually small but audible), straight pass over the mark heading,
   no orbit, despawn beyond range. Reuse the NPCFlightController
   spawn-airborne path the existing sorties use.
3. Bomb string: sequenced drops along the pass reusing the f4_bombs
   bomb/explosion effect path — N craters in a walking line (period-correct
   long stick), shared explosion pools, no new effect assets. Guard the
   first-use stall budget (≤50ms long-task rule from the acceptance standard).
4. IFF: follow the napalm/spooky friendly-sparing policy from SVYAZ-3 (the
   flagged `rocket_run` IFF gap is NOT a license to skip it here); document
   the danger-close radius in the catalog entry.
5. Model: b52-stratofortress from `warAssetCatalog` (+Z normalized; 47.9m —
   verify chase/observer scale reads correctly from the ground).

## Non-goals

- No player-flyable B-52. No new explosion/crater art. No terrain deformation.
- No rebalance of existing sortie cooldowns beyond slotting the new tier.
- No MiG-17/enemy-air work (deferred follow-up).

## Acceptance

- [ ] In-game sequence screenshots: radio menu row → mark → flyover →
      walking bomb string impacts, committed to
      `artifacts/cycle-war-asset-repaint/arclight/`.
- [ ] L2/L3 test: call-in dispatches one pass, drops the configured stick
      count along the mark heading, respects cooldown, friendly-IFF holds.
- [ ] No long-task >50ms around first arclight trigger (low-load probe note
      in PR, same method as the grenade first-use gate).
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR opened against `master` with link to this brief.

## Round 2 / Dependencies

- Depends on: `war-asset-import-pipeline`, `fixed-wing-glb-cutover` (shared
  `FixedWingConfigs.ts` — this task lands after it to avoid conflicts).
- Droppable without blocking cycle close.

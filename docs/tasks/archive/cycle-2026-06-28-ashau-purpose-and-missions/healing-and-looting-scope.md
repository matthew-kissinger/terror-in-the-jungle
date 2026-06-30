<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 6) -->
# healing-and-looting-scope

From the 2026-06-28 owner walk: there's no active healing (only passive regen
today) and no looting, even though a fully-written `WeaponPickupSystem` exists
and is never instantiated. Produce a design/scope doc for (a) bandages/active
healing and (b) activating the dormant pickup system into a looting loop —
**design only this campaign, greenfield**. The doc must ground itself in the
existing `src/systems/weapons/WeaponPickupSystem.ts` (read it; describe why it's
dormant and what wiring it needs).

## Files touched

- `docs/rearch/HEALING_AND_LOOTING_SCOPE_2026-06-28.md` (new)

## Scope

1. Healing: scope active healing (bandages / med item + use action + cooldown)
   on top of today's passive regen — the player-health read/write path, the UX,
   and where it plugs into the existing player/health systems.
2. Looting: describe `WeaponPickupSystem.ts` as written, why it's never
   instantiated, and the exact wiring to activate it (spawn-on-death or
   world-placed pickups, pickup UX, inventory interaction).
3. Recommend a phased build plan for each (MVP → full), the perf/UX risks, and
   which to build first — keep each independently shippable.

## Non-goals

- Any implementation/code — design doc only (greenfield; build is a future cycle).
- Reworking the damage/health model itself.

## Acceptance

- [ ] `docs/rearch/HEALING_AND_LOOTING_SCOPE_2026-06-28.md` exists with the
      healing scope, the `WeaponPickupSystem` activation plan (grounded in the
      real file), phased build plans, and ranked risks.
- [ ] `npm run lint` green (doc-only; no `src/...` path reference that doesn't exist).
- [ ] PR linking this brief.

## Dependencies

- Root. Doc-only. No reviewer.

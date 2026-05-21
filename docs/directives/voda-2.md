# VODA-2 — Flow, buoyancy, swimming

Status: code-complete (owner playtest deferred)
Owning subsystem: environment / water
Opened: cycle-2026-05-04
Code-complete: cycle-voda-2-buoyancy-swimming-wading 2026-05-17

## Latest evidence

7 PRs landed under `cycle-voda-2-buoyancy-swimming-wading` — R1: [#239](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/239) `89365f4c` buoyancy-physics (new `src/systems/environment/water/BuoyancyForce.ts` + sibling test consuming `sampleWaterInteraction`; behavior tests cover neutral float, sink, surface, dampened oscillation), [#240](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/240) `98ffeabc` npc-wade-behavior (CombatantMovement speed scales with `1 - immersion01 × 0.6` in shallow water; nav cost up-weight; combat-reviewer APPROVE), [#241](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/241) `83415458` player-swim-and-breath (PlayerMovement branches on `submerged` → swim mode with WASD + Space up + Ctrl down + depth-proportional drag; PlayerHealthSystem breath timer with gasp + damage past 45 s; new PlayerSwimState module; HUD breath gauge); R2: [#242](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/242) `2496b4e1` water-sampler-composer-wiring (activates dormant R1 consumers via system composer), [#245](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/245) `163ecb73` river-flow-gameplay-current (BuoyancyForce extended with horizontal flow force from hydrology channel direction × magnitude × body drag), [#244](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/244) `0b24a19f` wade-foot-splash-visuals (new `src/systems/effects/WadeSplashEffect.ts` triggered on footstep when `immersion01 ∈ [0.1, 0.5]`; reuses existing impact-effects pool), [#243](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/243) `47e394c2` voda-2-playtest-evidence (`docs/playtests/cycle-voda-2-buoyancy-swimming-wading.md` + capture script + PLAYTEST_PENDING row, deferred under autonomous-loop posture). No fence change (`sampleWaterInteraction` contract consumed, not modified). Owner walk-through deferred under autonomous-loop posture; full `done` promotion blocks on owner walk per [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md) row.

## Success criteria

- [x] Rivers from hydrology channels carry visible flow (#245 `river-flow-gameplay-current`; visual flow already shipped in VODA-1 #231).
- [x] Buoyancy physics for floating bodies (#239 `buoyancy-physics`; consumes `sampleWaterInteraction`).
- [x] Player swimming with animation, stamina, breath, and surfacing (#241 `player-swim-and-breath`).
- [x] Wading and foot-splash visuals at the bank (#244 `wade-foot-splash-visuals` + #240 `npc-wade-behavior`).
- [ ] Owner playtest walk (wade ford, swim river, breath-hold gasp, surfacing, NPC route around deep water) — deferred to PLAYTEST_PENDING.

## 2026-05-21 polish-pass amendment

The `water-hydrology-polish` doctor pass (PRs [#313](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/313) / [#314](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/314) / [#315](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/315), merged 2026-05-21) corrected the underlying water surface VODA-2 consumes: Open Frontier now uses hydrology river surfaces with the global plane disabled, and the water sampler is bound to watercraft from spawn (`bindSpawnedWatercraftRuntime` in `OperationalRuntimeComposer`). `sampleWaterInteraction` contract is unchanged, so the VODA-2 buoyancy / swim / wade consumers (`BuoyancyForce`, `PlayerSwimState`, `WadeSplashEffect`, NPC wade speed scaling) keep reading the same shape they were built against. This directive **stays `code-complete (playtest deferred)`** — the owner walk for wade ford / swim river / breath-hold / NPC route remains the gate for `done`.

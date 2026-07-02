# VEKHIKL-2 — Stationary M2 .50 cal emplacements

Status: code-complete (owner playtest deferred)
Owning subsystem: vehicle / weapons
Opened: cycle-2026-05-04
Code-complete: cycle-vekhikl-2-stationary-weapons 2026-05-17

## Latest evidence

6 PRs landed under `cycle-vekhikl-2-stationary-weapons` — R1: [#233](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/233) `0096d825` Emplacement IVehicle surface (`VehicleCategory` extended with `'emplacement'` inside the IVehicle module, no fence touch), [#234](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/234) `917d83df` EmplacementPlayerAdapter (mouse yaw/pitch within cone, first-person camera behind spade grips, F mount/dismount). R2: [#235](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/235) `c9725b76` vekhikl-2-playtest-evidence (`docs/playtests/cycle-vekhikl-2-stationary-weapons.md` + `scripts/capture-vekhikl-2-emplacement-shots.ts` + PLAYTEST_PENDING row; deferred under autonomous-loop posture), [#237](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/237) `0732beaa` M2HB weapon integration (575 RPM, 250-round belt, tracer every 5th, reload-on-dismount), [#236](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/236) `afa90775` emplacement-npc-gunner (NPC mount via orderBoard + cached emplacement scan; reviewer CHANGES-REQUESTED → APPROVE iteration). R3: [#238](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/238) `78c9c55a` system bootstrap wiring (M2HBEmplacementSystem registered; scenario spawns at Open Frontier US base + A Shau NVA bunker overlook). Owner walk-through deferred under autonomous-loop posture; full `done` promotion blocks on owner walk per [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md) row.

## Success criteria

- [x] M2HB emplacements spawnable on Open Frontier US base + A Shau NVA bunker overlook (#238 system wiring).
- [x] Player mounts via IVehicle seat-occupant surface and PlayerVehicleAdapter pattern (#233 + #234); mouse drives barrel yaw/pitch within cone limits.
- [x] LMB fires at ~575 RPM with tracer every 5th round; 250-round belt; reload triggers on dismount (#237).
- [~] NPC squad-AI gunners mount unoccupied friendly-faction emplacements and engage enemies inside the field-of-fire cone via the orderBoard scan (#236). **AI-layer complete; production wire + mounted-fire tick pending** (activation queued: `task/npc-m2hb-gunners`). The AI order/seek layer (`EmplacementSeekHelper` + `AIStateEngage` orderBoard scan) exists, but `createNpcM2HBAdapter` is referenced only from tests/comments — not constructed at a prod composition point — so an NPC does not yet actually crew + fire an M2HB in a live match.
- [ ] Owner playtest walk (mount, aim, fire, reload, NPC-gunner observation) — deferred to PLAYTEST_PENDING.

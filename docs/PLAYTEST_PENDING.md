# Playtest Pending

Last verified: 2026-05-17 (post `cycle-voda-2-buoyancy-swimming-wading` voda-2-playtest-evidence)

Single-source sink for cycles that closed under
`posture: autonomous-loop` (per
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](CAMPAIGN_2026-05-13-POST-WEBGPU.md))
and merged on CI green + reviewer APPROVE without the owner-playtest
gate firing.

The orchestrator appends a row here at every cycle close that had a
playtest-required task. The owner walks the deferred items in batches
after the campaign completes (or mid-campaign during a planned
break).

If a deferred playtest rejects the merged work, the owner opens a
follow-up cycle (or a single hotfix task) — the merged commit is
NOT reverted automatically.

## Active deferrals

| Cycle slug | Close commit | What to walk | Playwright smoke screenshots | Notes |
|------------|--------------|--------------|------------------------------|-------|
| `cycle-sky-visual-restore` | (this cycle's close commit) | (1) Noon sky reads saturated, horizon picks up blue/cyan, sun pearl visible; (2) Below-horizon (night/sunset) — sprite hidden, no pearl bleed through; (3) WebGPU vs `?renderer=webgl` parity. Compare against `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/openfrontier-noon-pre-merge.png`. | `artifacts/cycle-sky-visual-restore/playtest-evidence/sky-dome-tonemap-and-lut-resolution-noon.png`, `sky-hdr-bake-restore-{webgpu,webgl}.png`, `sky-sun-disc-restore-{noon,nadir}.png` | Three R1 PRs merged (#208 `2118177f`, #210 `3455fa96`, #209 `9e1ce7c7`). LUT-bake EMA capture also pending (executor flagged the 2s gate prevents harness re-trigger; ceiling per brief is 8 ms, fallback at 192×96 if observed >12 ms). mobile-ui CI job timeout flake hit each PR (known BACKLOG retro nit; cancelled at 30m boundary). |
| `cycle-mobile-webgl2-fallback-fix` (task `asset-audio-defer`) | (this task's close commit) | First-shot audio: fire a weapon within the first ~2 s of playable frame on desktop AND on a real mobile device. Confirm gunshot SFX plays without a perceptible gap. The startup marks `systems.audio.background.end` lands at ~30.7 s in mobile-emulation while playable frame is ~47 s — so the SFX bank is decoded long before first shot in emulation; real-device timing should be similar or better. | N/A (audio-presence assertion not automated this cycle) | Brief allowed deferring this to PLAYTEST_PENDING under autonomous-loop posture. Automated assertion shape (Playwright fires simulated input + asserts on `console.log`/`performance.mark`) was judged too heavyweight for this single-task scope. Startup-marks evidence + `whenSfxReady()` test coverage stands in for the automated check. |
| `cycle-mobile-webgl2-fallback-fix` (real-device walk-through) | (this cycle's close commit) | Run `scripts/real-device-validation.ts --device=android-chrome-debug --ws-endpoint=<ws>` against a real Android Chrome 120+ mid-tier 2022+ phone after `adb reverse tcp:4276 tcp:4276`. Acceptance: `steadyState.avgFps ≥ 30`. Then run `scripts/real-device-validation.ts --device=ios-safari-manual --ios-input=<json>` after harvesting numbers via Safari Remote Inspector on a real iPhone (iOS Safari 17+). Acceptance: owner "playable" sign-off. Confirm `resolvedBackend` discriminates "real mobile gets WebGPU" vs "real mobile gets WebGL2 fallback" — load-bearing for engine-trajectory direction. | `artifacts/cycle-mobile-webgl2-fallback-fix/playtest-evidence/pixel5-emulation/summary.json`, `artifacts/cycle-mobile-webgl2-fallback-fix/playtest-evidence/iphone12-emulation/summary.json` — Pixel 5 emulation 23.68 avgFps, iPhone 12 emulation 28.30 avgFps, both 60 s steady-state. | Real-device validation deferred under autonomous-loop posture; harness script ready for owner-attach run; emulation smoke stands in for cycle merge gate. Memo at `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/cycle-close-validation.md` records full owner-attach procedure for both platforms. Closes carry-over `KB-MOBILE-WEBGPU` on cycle close. |
| `cycle-vekhikl-1-jeep-drivable` | (this cycle's close commit) | Drive the M151 on Open Frontier and A Shau: (1) flat-ground acceleration to cruise; (2) slope traversal with per-wheel terrain conform; (3) Ackermann U-turn at cruise; (4) slope-stall on the steepest grade; (5) brake-stop from cruise; (6) F-key enter/exit with player ejected to the side of the chassis (not inside, not under terrain). Camera should be third-person follow while driving. Full walk-list mirrored in `docs/playtests/cycle-vekhikl-1-jeep-drivable.md` "What the owner should walk". | `artifacts/cycle-vekhikl-1-jeep-drivable/playtest-evidence/jeep-spawn-open-frontier.png`, `jeep-spawn-a-shau.png`, `jeep-driving-from-third-person.png` (captured by `scripts/capture-m151-jeep-playtest-shots.ts`; may require post-merge back-fill if sibling integration PRs landed after this task). | First playable ground vehicle. Owner sign-off blocks DIRECTIVES.md VEKHIKL-1 promotion to Closed. Capture-script + doc skeleton landed under autonomous-loop posture; screenshots back-fillable post-merge per the renderer-backend + sibling-PR caveats in the playtest memo. |
| `cycle-voda-1-water-shader-and-acceptance` | (this cycle's close commit) | Walk shoreline visual on Open Frontier at noon / sunset / dawn; cross river on A Shau and confirm visible UV-scrolled flow; step into water and confirm underwater POV + overlay; regenerate `npm run evidence:atmosphere` (zero browser errors + water visible); confirm Open Frontier `terrain_water_exposure_review` flag resolved. Full walk-list mirrored in `docs/playtests/cycle-voda-1-water-shader-and-acceptance.md` "What the owner should walk". | `artifacts/cycle-voda-1-water-shader-and-acceptance/playtest-evidence/water-noon-open-frontier.png`, `water-sunset-open-frontier.png`, `water-dawn-open-frontier.png`, `river-flow-a-shau.png`, `underwater-pov-a-shau.png`, `shoreline-foam-open-frontier.png` (captured by `scripts/capture-voda-1-water-shots.ts`; river-flow shot depends on sibling `hydrology-river-flow-visuals` PR landing — back-fill on master post-merge if needed). | First production water shader. Owner sign-off blocks DIRECTIVES.md VODA-1 promotion to Closed. Capture-script + doc skeleton landed under autonomous-loop posture; sun-elevation runtime override is best-effort (codebase exposes sun via per-scenario presets), so noon/sunset/dawn matrix may need owner-side preset selection at sweep time per the playtest memo. Cycle-specific hard constraint reminder: no `WebGLRenderTarget` reflection pass may be added — preserve the post-KONVEYER mobile no-RT win. |
| `cycle-vekhikl-2-stationary-weapons` | (this cycle's close commit) | (1) Approach the M2HB emplacement at the Open Frontier US base. (2) F to mount; confirm first-person camera pins to the gunner seat behind the spade grips. (3) Mouse-aim — barrel slews yaw and pitch within the cone limits (-10°/+60° pitch, 360° yaw on the default tripod). (4) LMB fires at ~575 RPM with tracer every 5th round; recoil offset visible per shot. (5) Hold-fire to depletion of the 250-round box; confirm reload triggers on dismount, not mid-mount. (6) Move to A Shau and repeat on the NVA bunker overlook emplacement. (7) Stand near a friendly-faction emplacement during a firefight; confirm a friendly NPC mounts and engages enemies inside the cone within ~5 s. Full walk-list mirrored in `docs/playtests/cycle-vekhikl-2-stationary-weapons.md` "What the owner should walk". | `artifacts/cycle-vekhikl-2-stationary-weapons/playtest-evidence/emplacement-spawn-open-frontier.png`, `emplacement-spawn-a-shau.png`, `emplacement-third-person-aiming.png` (captured by `scripts/capture-vekhikl-2-emplacement-shots.ts`; emplacement mesh visibility depends on sibling `m2hb-weapon-integration` PR landing — back-fill on master post-merge if needed). | First stationary heavy weapon. Owner sign-off blocks DIRECTIVES.md VEKHIKL-2 promotion to Closed. Capture-script + doc skeleton landed under autonomous-loop posture; capture script tolerates an absent emplacement-specific spawn helper and an absent `adapter.setAim` aim-control method, so it remains runnable across the full R2 dispatch window. NPC-gunner walk-step depends on sibling `emplacement-npc-gunner` PR landing. |
| `cycle-voda-2-buoyancy-swimming-wading` | (this cycle's close commit) | (1) Wade across A Shau shallow ford. Confirm slowed speed + splashes. (2) Swim across deep A Shau river. Confirm stamina drain + downstream drift + breath gauge. (3) Hold breath underwater past 45 s. Confirm gasp + damage. (4) Surface from depth. Confirm transition back to walk. (5) Watch an NPC patrol on A Shau. Confirm route avoids deep water; if NPC gets near a shallow ford, observe wade slowdown. Full walk-list mirrored in `docs/playtests/cycle-voda-2-buoyancy-swimming-wading.md` "What the owner should walk". | `artifacts/cycle-voda-2-buoyancy-swimming-wading/playtest-evidence/wade-shallow-ford.png`, `swim-deep-river.png`, `breath-gauge-submerged.png`, `npc-routes-around-river.png`, `wade-foot-splash.png` (captured by `scripts/capture-voda-2-swim-wade-shots.ts`; wade-foot-splash visibility depends on sibling `wade-foot-splash-visuals` PR landing — back-fill on master post-merge if needed). | First swim + wade gameplay. Owner sign-off blocks DIRECTIVES.md VODA-2 promotion to Closed. Capture-script + doc skeleton landed under autonomous-loop posture; capture script tolerates absent splash particle system, absent flow-current API, and absent breath-gauge HUD element — each capture reserves its screenshot path regardless. Downstream-drift walk-step depends on sibling `river-flow-gameplay-current` PR landing. |

## Walk-through protocol (for the owner)

1. Pull master.
2. For each row above:
   - Open the Playwright smoke screenshots under
     `artifacts/cycle-<slug>/playtest-evidence/`.
   - Spin up dev preview (`npm run dev`) and walk the feature's
     golden path manually.
   - If the feature reads "right":
     - Move the row to the "Walked & accepted" section below with a
       date and a one-line note.
   - If the feature reads "wrong":
     - Move the row to "Walked & rejected" below with a one-line
       cause.
     - Open a follow-up cycle brief at
       `docs/tasks/cycle-<slug>-fix.md` and queue it in the active
       campaign manifest.

## Walked & accepted

(Empty.)

## Walked & rejected

(Empty.)

## Reference

- [.claude/agents/orchestrator.md](../.claude/agents/orchestrator.md)
  §"Autonomous-loop posture" — defines what triggers an append here.
- [docs/AGENT_ORCHESTRATION.md](AGENT_ORCHESTRATION.md)
  §"Autonomous-loop posture" — cross-tool view of the same rules.
- [docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](CAMPAIGN_2026-05-13-POST-WEBGPU.md)
  — current campaign manifest declaring `posture: autonomous-loop`.
- [GOAL_DIRECTIVE.md](../GOAL_DIRECTIVE.md) — the `/goal` directive
  string for invoking the autonomous loop.

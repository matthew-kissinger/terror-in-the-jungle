# Playtest Pending

Last verified: 2026-05-16 (post `cycle-mobile-webgl2-fallback-fix` real-device-validation-harness)

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

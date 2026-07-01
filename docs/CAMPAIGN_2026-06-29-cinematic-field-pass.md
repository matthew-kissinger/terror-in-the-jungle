# Campaign: Cinematic Field Pass

> **Date:** 2026-06-29
> **Shape:** large (7 sequenced phases — P0 foundations + 6 workstreams)
> **Auto-advance:** yes (owner kicked off via `/goal` 2026-06-29)
> **Posture:** autonomous-loop (per `/goal` directive: defer owner playtests to
>   `docs/PLAYTEST_PENDING.md`, do not pause; true hard-stops still halt — fence
>   change, >2 CI red/round, combat120 p99 regression >5%, carry-over growth,
>   worktree failure, twice-rejected reviewer)
> **Concurrency cap:** 5
> **Status:** ✅ CLOSED 2026-06-29 (autonomous-loop). All phases merged to
> `master` — P0-P6 + P4b (radio-station wiring) + PX (terrain-spike). 9 PRs
> #457-#465, ZERO fence changes, combat120 baseline restored, full suite 7238
> green. Visual post-stack + orbital topo ship DEFAULT-OFF/opt-in; the post
> default-on flip is deferred behind a MAIN-worktree combat120 p99 proof. Folded
> into the July 1 production-review release; owner feel-walks queued in
> PLAYTEST_PENDING.md.
>
> **Owner-gated open questions resolved to defaults at kickoff** (autonomous run,
> revisit in owner walk): post default-on uses the full evidence-matrix gate then
> default-on-desktop-only behind kill-switch [recommended]; `AirSupportRadioMenu`
> kept one cycle behind the shared model (not retired this cycle); audio is
> Opus-only (no Ancient-Safari MP3 fallback); A Shau may pin the sun → soundscape
> degrades to load-time bed selection (acceptable).
>
> **Progress:**
> ✅ P0 cinematic-foundations · ✅ P1 soundscape-loop-replacement ·
> ✅ P2 task-card-hud-fit · ✅ P3 radio-dial-revival ·
> ✅ P4 radio-stations-music (+ ✅ P4b station-wiring) · ✅ P5 orbital-topo-map ·
> ✅ P6 visual-post-stack · ✅ PX terrain-spike-fix

Source: the 2026-06-29 owner playtest + consultation (voice transcript) and a
multi-agent design pass (`titj-big-cycle-design` workflow: 5 parallel designs,
each adversarially critiqued, then synthesized) plus 4 DEM/audio sourcing recon
agents. Full plan: scratchpad `cinematic-field-pass-PLAN.md`. The owner asked for
a whole visual overhaul, a 3D orbital topo map, two UI fixes (overlapping command
card, messy radio), a revived radial dial, and a soundtrack/soundscape pass.

## Owner decisions locked (2026-06-29)

- **One big cycle** spanning all 7 phases (owner chose "all together").
- **Topo map renderer:** WebGPU/TSL via the EXISTING renderer (separate
  Scene+camera+viewport, no second device) + Lambert/WebGL2 fallback.
- **Topo map surfaces:** deploy screen + pause overlay (rich 3D) + hold-M
  (opt-in toggle, **default stays 2D** for fast tactical read).
- **Topo mesh build:** CPU-displaced `.f32` PlaneGeometry (not baked GLB, not
  GPU TSL displacement).
- **DEM source:** NASADEM via OpenTopography (public-domain/CC0, zero
  attribution); Mapbox/MapTiler disqualified (token-bound).
- **Radio:** revive the radial dial (desktop wheel + touch bottom-sheet, one
  model); radio is a **dedicated non-weapon HUD slot** (open-the-dial
  affordance), NOT a 7th weapon slot and NOT a carried loadout item; STATIONS
  category is always-available. **RMB is OFF the table (it is ADS)** — open via
  slot-click + `KeyT`/hold-T.
- **Audio:** kill the permanent loop; layered day/night ambient + selectable
  radio stations (CC0/CC-BY only, Opus, lazy-loaded, music default-OFF on touch).
- **Color grade:** ship 3 LUTs behind WorldBuilder A/B; owner picks in playtest.
- **Deploy is MANUAL.** Do NOT deploy.

## Phases

Dependency spine: **P0 unblocks P5 + P6.** P1/P2 are independent (land early).
P3a (CommandInputManager re-trace) precedes P3b/c/d. P4 core can run parallel
to P3a/b; its UI joins at P3d. P5/P6 (renderer + hot path) land last, perf-gated.

| # | Cycle (brief) | One-line scope | Verdict |
|---|---|---|---|
| P0 | `cycle-2026-06-29-cinematic-foundations` | Restore combat120 baseline + shared `src/core/tsl/` lib + non-fenced `getBakedHeightmap()` | — |
| P1 | `cycle-2026-06-29-soundscape-loop-replacement` | Kill permanent loop; day/night `SoundscapeDirector` (CC0/CC-BY beds) | sound-with-fixes |
| P2 | `cycle-2026-06-29-task-card-hud-fit` | Stop task card overlapping objectives; real mobile home | sound-with-fixes |
| P3 | `cycle-2026-06-29-radio-dial-revival` | Radial dial (desktop wheel + touch sheet) + Radio HUD slot | needs-rework → re-trace first |
| P4 | `cycle-2026-06-29-radio-stations-music` | `RadioStationSystem` (lazy, capped cache, default-OFF) | sound-with-fixes |
| P5 | `cycle-2026-06-29-orbital-topo-map` | 3D orbital topo map, 3 mounts, CPU `.f32` mesh | sound-with-fixes |
| P6 | `cycle-2026-06-29-visual-post-stack` | Fill no-op post shim: grade + bloom + atmospheric depth | sound-with-fixes |

P7 (validate + PC/phone playtest + finalize attributions + CURRENT/DIRECTIVES
update) is the campaign close gate, not a separate brief.

## Hard-stops & gates

- **Perf gate (P5/P6):** `combat120` p99 must stay neutral across MULTIPLE
  captures (±6ms noise) from the MAIN worktree before anything visual goes
  default-on. P0 restoring the baseline is the prerequisite.
- **Phase barrier:** P5 and P6 must not dispatch until P0's exit gate is green.
- **Fence:** zero fenced-interface changes intended. Any `[interface-change]`
  needs owner approval (none expected — see plan).
- **Budget ratchet:** `HUDSystem.ts` (878/89), `PlayerInput.ts` (819),
  `CommandModeOverlay.ts` (867), `FullMapSystem.ts` (882), `DeployScreen.ts`
  (1142), `TerrainMaterial.ts` (1192), `AtmosphereSystem.ts` (~698) are at
  ceiling — touched edits must be net-neutral or pre-rebase the snapshot with a
  `docs/CARRY_OVERS.md` note BEFORE coding.
- **Renderer fragility:** the prod main renderer is WebGPU and the r185
  WebGPU-CDLOD path is broken — NO new TSL on the CDLOD vertex path; new TSL
  only on full-screen post + the standalone topo heightmesh.

## Open questions still owner-gated (defaults in brackets)

- Auto-advance + posture for the run (attended vs autonomous-loop).
- Post default-on path: full sky/cloud/post evidence-matrix gate [recommended]
  vs ship-behind-kill-switch-earlier.
- Retire `AirSupportRadioMenu` this cycle vs keep one cycle behind a flag.
- Do live scenarios advance time-of-day? (A Shau may pin the sun → crossfade
  degrades to load-time bed selection, acceptable.)
- Ancient-Safari MP3 fallback in scope vs Opus-only.

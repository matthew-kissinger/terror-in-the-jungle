# Playtest: cycle-voda-2-buoyancy-swimming-wading

Last verified: 2026-05-17

Cycle: `cycle-voda-2-buoyancy-swimming-wading` (campaign position #7 of 13)
Task slug: `voda-2-playtest-evidence`
Branch: `task/voda-2-playtest-evidence`
Capture script: `scripts/capture-voda-2-swim-wade-shots.ts`

Closes `VODA-2` (buoyancy + swimming + wading gameplay) once the owner
walks the deferred punch list below.

## Autonomous-loop deferral notice

Under the
[campaign manifest's](../CAMPAIGN_2026-05-13-POST-WEBGPU.md) declared
`posture: autonomous-loop`, the cycle's playtest-required gate is
**deferred** to [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md) per
the orchestrator's autonomous-loop override (per
[.claude/agents/orchestrator.md](../../.claude/agents/orchestrator.md)
§"Autonomous-loop posture" and
[docs/AGENT_ORCHESTRATION.md](../AGENT_ORCHESTRATION.md)). Owner
walk-through happens in a batch sweep after the 13-cycle campaign
closes.

This document substitutes Playwright + Chromium headless smoke for the
owner gate. The screenshots reserve scene paths at the A Shau river so
the wade/swim/breath/NPC-routing behaviors can be inspected against the
captured frames — enough evidence to merge under autonomous-loop
posture. Owner sign-off on the punch list at the bottom is still
required to flip `VODA-2` to Closed in `docs/DIRECTIVES.md`.

## Playwright smoke evidence

Saved under
`artifacts/cycle-voda-2-buoyancy-swimming-wading/playtest-evidence/`
by `scripts/capture-voda-2-swim-wade-shots.ts`. The `artifacts/`
directory is gitignored; screenshots are produced on-demand and
attached to the PR (or back-filled on master post-merge — see the
caveat below).

| Scenario | File | Observation |
|---|---|---|
| A Shau — wade at a shallow ford | `wade-shallow-ford.png` | Third-person framing at the river bank in the shallow-immersion band so the wade slowdown + foot-splash puffs would read on-screen. |
| A Shau — swim across deep river | `swim-deep-river.png` | Third-person framing mid-river above the deep band so the player swim state would engage. |
| A Shau — HUD breath gauge while submerged | `breath-gauge-submerged.png` | First-person camera dropped fully below the water surface; UI chrome is left visible for this shot so the breath gauge is in-frame. |
| A Shau — NPC patrol skirts deep water | `npc-routes-around-river.png` | Overhead framing across a river segment where the navmesh cost-weighting steers patrols out of deep water and toward shallow fords. |
| A Shau — wade-splash visuals at the bank | `wade-foot-splash.png` | First-person framing at the bank so the wade-splash particle burst would read at foot-impact moments. Back-fillable; see sibling-PR dependency below. |

### Capture-state caveat (sibling-PR dependency)

The capture script ships in this PR and runs against any state of the
R2 dispatch window. The screenshots themselves depend on the cycle's
R1 + R2 siblings being merged for the captured behaviors to render:

- R1 already landed on this cycle's worktree base (master HEAD
  `83415458`): `buoyancy-physics` (`89365f4c`),
  `npc-wade-behavior` (`98ffeabc`),
  `player-swim-and-breath` (`83415458`). So the wade/swim/breath
  gameplay surface is reachable from any frame the harness captures.
- R2 `wade-foot-splash-visuals` — adds the particle puff at foot
  impact while shallow. Until merged, `wade-foot-splash.png` shows
  the static frame without the splash burst; back-fill on master
  post-merge.
- R2 `river-flow-gameplay-current` — adds the downstream-drift force
  in hydrology channels. The visible effect is felt mid-river while
  swimming; the static-camera capture pose can't show drift in a
  single frame, so this dependency does not affect screenshot paths
  (it affects only the owner punch-list item 2).

The capture script makes no assumption that any of these features are
wired — `poseAndRender` puts the camera at the documented pose and
renders one frame. The water-sample probe (`WaterSystem.sampleWaterInteraction`)
at each pose is logged for post-merge pose refinement so the owner
sweep can confirm the camera is framed against the depth band the
caption claims.

Re-run the capture post-merge with:

```
npx tsx scripts/capture-voda-2-swim-wade-shots.ts
```

and back-fill the screenshots in a follow-up commit directly on
master. The script tolerates an absent splash particle system, an
absent flow-current API, and an absent breath-gauge HUD element —
each capture reserves the screenshot path regardless.

### Renderer-backend caveat

Headless Chromium in this checkout does not grant a WebGPU adapter, so
the default `webgpu` mode resolves to `webgpu-webgl-fallback` (the
same WebGL2-backend-of-`WebGPURenderer` path mobile lands on). The
capture script prints the resolved backend at run time. The water
surface shader is the same `installWaterMaterialPatches`-patched
`MeshStandardMaterial` across both backends (no TSL fork landed for
wade/swim), so visual parity is expected — but the owner sweep is the
load-bearing check against strict-WebGPU desktop.

### Pose-refinement caveat

The five poses are placeholder coordinates against the A Shau river
geometry. Refine after first post-merge run by reading the actual
hydrology channel start/end positions out of the running scene and the
actual NPC patrol routes from the running combat sim. The script logs
the depth + immersion at each pose so the owner sweep can confirm the
caption matches what the sampler reports.

## What the owner should walk

Punch list mirroring the cycle brief's `voda-2-playtest-evidence`
Method. The owner walks this list in a batch sweep after the
campaign completes, per
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md).

**Wading:**

1. Spawn into A Shau Valley. Walk to a river bank where the depth is
   in the shallow-ford band. Step into the water. Confirm:
   - Movement speed slows proportional to immersion (NPC speed
     scales `1 - immersion01 * 0.6` per the `npc-wade-behavior`
     brief; player should feel a comparable slowdown).
   - Foot-splash particle puffs spawn at footstep impact (depends on
     R2 `wade-foot-splash-visuals` being merged). If missing,
     captures the gap.
2. Cross the ford. Confirm exit on the far bank restores walk speed
   without state leak.

**Swimming:**

3. Walk to a deep section of the A Shau river. Step in. Confirm:
   - Player transitions to swim mode (3D movement, no gravity, drag
     proportional to depth) as soon as the head submerges.
   - Stamina drains continuously while swimming.
   - Swimming perpendicular to the flow visibly drifts downstream
     (depends on R2 `river-flow-gameplay-current` being merged).
   - HUD breath gauge appears as soon as the head is submerged.

**Breath / damage:**

4. Hold breath fully underwater past the 45 s threshold. Confirm:
   - Player gasps at threshold (audible cue + camera shake or
     equivalent per `player-swim-and-breath` brief).
   - Damage begins ticking after the gasp.

**Surfacing:**

5. Surface from depth. Confirm the player transitions back to walk
   mode cleanly (no swim residue, no stuck-mid-air, no double-state).

**NPC routing:**

6. Watch a friendly or hostile NPC patrol along a route that
   approaches the river. Confirm:
   - The patrol path skirts the deep band (the navmesh cost-weighting
     from `npc-wade-behavior` steers them around).
   - If the patrol crosses at a shallow ford, the NPC visibly slows
     in the wade band (same `1 - immersion01 * 0.6` formula).
   - No NPC stuck-loop entering / exiting the water.

## Recording owner sign-off

When the owner walks the list above:

- If all six steps read as **playable** and **feels right** —
  append an "Owner sign-off" section to this file with the date +
  one-line summary, then close `VODA-2` in `docs/DIRECTIVES.md` with
  this cycle's close-commit SHA.
- If anything reads as **needs work [X]** — open a follow-up cycle
  brief at `docs/tasks/cycle-voda-2-buoyancy-swimming-wading-fix.md`
  per the PLAYTEST_PENDING walk-through protocol. The merged commits
  are not reverted under autonomous-loop posture.

## Acceptance (for this task)

- `npm run lint`: PASS.
- Doc + PLAYTEST_PENDING row + capture script committed.
- Screenshot paths reserved under
  `artifacts/cycle-voda-2-buoyancy-swimming-wading/playtest-evidence/`;
  populated either by the capture script run in this PR or by a
  post-merge back-fill commit on master.

## Posture

Automated smoke + owner walk-through deferral per the cycle's
autonomous-loop posture. Owner sign-off is the merge gate for the
`VODA-2` directive promotion to Closed; this task lands the
evidence-capture surface so the owner sweep has something concrete to
walk against.

# Projekt Objekt-143 Art-Direction Gate

Status: DIZAYN-2 gate procedure.

This document defines the KB-DIZAYN "looks right" review gate. A bureau invokes
this gate before it claims visual, interaction-feel, asset, or presentation
completion for a directive. The gate records whether KB-DIZAYN signs the visual
claim, returns it with notes, or blocks the claim until better evidence exists.

## Authority

1. KB-DIZAYN owns visual and feel coherence for Projekt Objekt-143.
2. The gate uses `docs/dizayn/vision-charter.md` as the visual target.
3. The gate uses `docs/PLAYTEST_CHECKLIST.md` when the directive changes game
   feel, response, flight, driving, combat rhythm, or UI responsiveness.
4. The gate uses `docs/ASSET_ACCEPTANCE_STANDARD.md` when the directive changes
   imported assets, impostors, source bundles, material quality, or runtime
   asset acceptance.
5. The gate does not override KB-METRIK measurement trust, runtime validation,
   production verification, or Politburo signoff.

## Invocation

Invoke this gate when a directive makes one of these claims:

1. A scene, vehicle, aircraft, squad command, water surface, terrain surface,
   vegetation packet, UI screen, or deployment flow looks right.
2. A capture, contact sheet, screenshot packet, video, browser proof, or
   playtest note represents the current visual state.
3. A directive lists KB-DIZAYN signoff in its success criteria.
4. A bureau wants to move a visual or feel item from open to evidence-complete.

Do not invoke this gate for pure source refactors, telemetry-only probes, or
server/deploy plumbing unless the change affects what the player sees or feels.

## Required Inputs

Every invocation records these fields:

1. Directive ID.
2. Requesting bureau.
3. Artifact path under `artifacts/perf/<ts>/`.
4. Capture type: screenshot, contact sheet, browser proof, runtime telemetry,
   video, playtest note, or asset review sheet.
5. Evidence trust: trusted, diagnostic, or blocked evidence.
6. Source surface: code path, doc path, asset path, or runtime mode under
   review.
7. Visual claim under review.
8. Known non-claims.
9. Reviewer decision: signed, returned_with_notes, or blocked.
10. Next required action.

The artifact path must exist before KB-DIZAYN signs. A diagnostic packet may
receive notes, but it does not close a directive. Blocked evidence records the
blocker plainly and points to the next proof required.

## Review Method

KB-DIZAYN reviews the evidence packet against these checks:

1. The capture shows the claimed surface directly, not a proxy or hidden state.
2. The capture comes from the current repository state.
3. The evidence trust label matches the underlying validation state.
4. The visual result matches the charter for theater, material, scale, motion,
   density, clarity, and player-readable intent.
5. The result does not degrade PC and mobile information parity when the
   affected surface has UI or deploy-flow meaning.
6. The result does not smuggle in unaccepted assets, rejected review material,
   or Pixel Forge packets outside their accepted boundary.
7. The result names any human playtest requirement that remains open.

## Decisions

### signed

KB-DIZAYN signs when the packet shows the claimed surface clearly, carries
trusted evidence, names its non-claims, and matches the charter. The directive
may cite the gate packet as art-direction evidence.

### returned_with_notes

KB-DIZAYN returns with notes when the evidence is visible but incomplete,
diagnostic, ambiguous, too narrow, or visually short of the charter. The
directive remains open. The next action must name the missing proof or visual
correction.

### blocked

KB-DIZAYN blocks when the artifact is missing, stale, from the wrong mode, from
the wrong repo state, materially misleading, or contradicted by runtime
validation. The directive cannot claim art-direction completion until a new
packet resolves the block.

## Decision Record Template

```md
# KB-DIZAYN Art-Direction Gate Record

Directive ID:
Requesting bureau:
Artifact path:
Capture type:
Evidence trust: trusted | diagnostic | blocked evidence
Source surface:
Visual claim:
Decision: signed | returned_with_notes | blocked

## Findings

1.

## Non-Claims

1.

## Next Required Action

1.
```

## Non-Claims

1. This gate does not prove runtime correctness.
2. This gate does not replace automated tests, lint, typecheck, build, perf
   capture, or KB-METRIK measurement trust.
3. This gate does not replace `docs/PLAYTEST_CHECKLIST.md` for flight,
   driving, combat rhythm, UI responsiveness, or other game-feel changes.
4. This gate does not replace `docs/ASSET_ACCEPTANCE_STANDARD.md` for asset
   acceptance.
5. This gate does not prove Cloudflare Pages production parity.
6. This gate does not close Article VII. It supplies one directive evidence
   packet only.

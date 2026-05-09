# Interface Fence

Last verified: 2026-05-09

This file defines the rules for changing contract interfaces. **Interfaces inside `src/types/SystemInterfaces.ts` are fenced.** Everything else is free to refactor.

## Why this exists

Multiple agents have iterated on this codebase. Each agent, acting alone, writes code that looks tidy to that agent — but the composition drifts. The single biggest defense against drift is a small, frozen set of interfaces that systems agree to. Internals can churn freely; the fence cannot.

## What this fence is NOT

The fence is about preventing **accidental drift**. It is not about cementing today's interface shape as correct.

When Phase E rearchitecting decisions land (ECS, rendering paradigm, agent-action API, etc.), these interfaces *will* change deliberately. The fence makes sure those changes happen in a `[interface-change]` PR with human review, not as an incidental side-effect of a cleanup task. See `docs/REARCHITECTURE.md` for the open paradigm questions that will eventually reshape these interfaces.

In other words: the fence preserves the option to rearchitect cleanly. It does not foreclose it.

## What is fenced

Every exported interface in `src/types/SystemInterfaces.ts`, specifically:

- `IHUDSystem`
- `IPlayerController`
- `IHelicopterModel`
- `IFirstPersonWeapon`
- `ITerrainRuntime` and `ITerrainRuntimeController`
- `IAudioManager`
- `IAmmoManager`
- `IFlashbangScreenEffect`
- `IGameRenderer`

Any change to any method signature, any parameter type, any return type on a fenced interface is a **fence change**.

## What is not fenced

- Internal implementations of those interfaces (e.g. `HUDSystem`, `PlayerController`, `TerrainManager`). Refactor freely.
- Private fields and methods.
- System-to-system shapes that aren't in `SystemInterfaces.ts` (e.g. vehicle adapters internal protocol). Move them to `SystemInterfaces.ts` if they're stable and boundary-crossing.
- Tuning constants, configuration objects, derived types.
- Tests.

## PR convention

A PR that modifies a fenced interface must:

1. Include `[interface-change]` in the title.
2. Include `[interface-change]` in the commit message subject.
3. List every consumer (other file that imports the changed interface).
4. State whether the change is:
   - **Additive** (new optional method, new optional field): generally safe, still requires review.
   - **Breaking** (removed method, renamed method, required-to-optional, narrower type): requires explicit human approval and a migration note.
5. Update consumers in the same PR. No staged fence changes.
6. Explain *why* the interface is changing — usually it's one of: adding a new capability the caller needs, unifying a drifted pattern, removing unused surface.

### Pre-flight (Phase 0, 2026-05-09)

Run `npx tsx scripts/check-fence.ts` (or `npm run check:fence`) locally
before pushing. It compares the working tree against `origin/master` (or
`HEAD~1` if origin isn't accessible), verifies that any change to
`src/types/SystemInterfaces.ts` is paired with the `[interface-change]`
marker in the latest commit subject, and exits non-zero if the marker is
missing. Pass `--pr-title "<title>"` to also verify the PR title in CI.

## Default posture

Before changing a fenced interface, ask: **can I solve this without the change?** Most of the time you can. Add a new internal method on the implementation. Widen the type at the caller. Use a type guard. A fence change is the last resort.

## If you're an agent proposing a fence change

Stop. Describe the change in plain English to the user first. Don't push a `[interface-change]` PR without confirmation.

## Reviewer checklist for fence-change PRs

- Was an additive option tried first?
- Are all consumers updated in the same PR?
- Is the migration note (if breaking) sufficient for a cold reader?
- Does the new signature still fit the pattern of other methods on the interface?
- Does this set up downstream drift, or is this a one-time correction?

## Ownership

The interfaces in `SystemInterfaces.ts` are owned by the repo lead. Fence-change PRs ping the lead explicitly.

## Amending this file

If you're adding a new fenced interface, update this file and the `SystemInterfaces.ts` header comment in the same PR.

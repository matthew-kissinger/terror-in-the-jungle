# Interface Fence

Last updated: 2026-04-16

This file defines the rules for changing contract interfaces. **Interfaces inside `src/types/SystemInterfaces.ts` are fenced.** Everything else is free to refactor.

## Why this exists

Multiple agents have iterated on this codebase. Each agent, acting alone, writes code that looks tidy to that agent — but the composition drifts. The single biggest defense against drift is a small, frozen set of interfaces that systems agree to. Internals can churn freely; the fence cannot.

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
2. List every consumer (other file that imports the changed interface).
3. State whether the change is:
   - **Additive** (new optional method, new optional field): generally safe, still requires review.
   - **Breaking** (removed method, renamed method, required-to-optional, narrower type): requires explicit human approval and a migration note.
4. Update consumers in the same PR. No staged fence changes.
5. Explain *why* the interface is changing — usually it's one of: adding a new capability the caller needs, unifying a drifted pattern, removing unused surface.

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

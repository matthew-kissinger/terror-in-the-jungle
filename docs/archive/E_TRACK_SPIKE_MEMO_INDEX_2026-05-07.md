# E-Track Spike Memo Index

Archived by ARKHIV-3 on 2026-05-07.

This index folds the E1-E6 spike decisions into the merged document graph and
records the branch-local memo sources. It does not import the full branch
payloads. It blocks silent branch deletion by naming the source ref, current
SHA, memo path, and folded decision for each spike.

## Source Refs

| Spike | Source ref | Current SHA | Branch memo paths | Folded decision |
|---|---|---|---|---|
| E1 | `origin/spike/E1-ecs` | `d461b6712c74a6a8c4e01b4711373c7697e012dd` | `docs/rearch/E1-ecs-evaluation.md` | Defer ECS migration. The bitECS projectile-shaped slice measured about parity, not the required win. Revisit only with a combatant-shaped hot path after combat p99 work. |
| E2 | `origin/spike/E2-rendering-at-scale` | `311aded91995cddcbf9668f32681bdb16765aa15` | `docs/rearch/E2-rendering-evaluation.md` | Defer GPU-driven rendering and WebGPU migration for this question. The live NPC path is already instanced; fix concrete capacity cliffs in place. |
| E3 | `origin/spike/E3-combat-ai-paradigm` | `8ed5d0dc6ea548325cbd0b0bbc73db5612e64725` | `docs/rearch/E3-combat-ai-evaluation.md` | Design a utility layer later, but do not block current faction tuning on it. Do not adopt GOAP or behavior trees for the current doctrine shape. |
| E4 | `origin/spike/E4-agent-player-api` | `cfdf824e2530650fb92c32b0d2de20f085724922` | `docs/rearch/E4-agent-player-api.md` | Prototype more. Land a minimal movement/observation slice behind an agent-facing adapter before considering the full driver rewrite. |
| E5 | `origin/spike/E5-deterministic-sim` | `5004cf66235fce28bd03750ff683b9508be4d5e7` | `docs/rearch/E5-deterministic-sim.md`; `docs/rearch/E5-determinism-evaluation.md`; `docs/rearch/E5-nondeterminism-audit.md` | Prototype more with `SimClock` / `SimRng` seams and one deterministic combat pilot. Do not attempt the full determinism pass as one PR. |
| E6 | `origin/spike/E6-vehicle-physics-rebuild` | `7ceb3d7634f8eccaa060152a86ae83d146b0a325` | `docs/rearch/E6-vehicle-physics-evaluation.md`; `docs/rearch/E6-vehicle-physics-design.md` | Prototype more with a real in-engine Skyraider `Airframe` port behind a flag. Do not run the full migration before human playtest. |

## Folded Outcomes

1. Article IV carries the Phase F candidate outcomes.
2. `docs/BACKLOG.md` carries the Strategic Reserve routing.
3. `docs/rearch/E1-ecs-evaluation.md` remains the only E memo already merged in
   full.
4. The unmerged E2-E6 full memos remain branch-local at the refs above.
5. Branch deletion is not authorized until the full memo content is either
   imported, deliberately superseded, or exported to a durable external archive.

## Non-Claims

1. This index does not validate any runtime implementation.
2. This index does not approve E-track work for active implementation.
3. This index does not prove branch refs will stay available forever.
4. This index does not close Article VII.

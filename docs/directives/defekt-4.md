# DEFEKT-4 — NPC navmesh route quality

Status: closed (cycle-defekt-4-npc-route-quality close-commit e6e02711 2026-05-18)
Owning subsystem: navigation
Opened: cycle-2026-04-17

Shipped as 3 PRs: #265 npc-slope-stuck-recovery (`df84a870`), #266 navmesh-crowd-reenable (`aac0e519`), #267 terrain-solver-stall-fix (`4f505661`). All three `terrain-nav-reviewer` APPROVE pre-merge.

## Latest evidence

`artifacts/perf/2026-05-07T22-42-23-479Z/projekt-143-defekt-route-quality-audit/route-quality-audit.json`

## Success criteria

- A Shau and Open Frontier active-driver route-quality captures pass measurement trust.
- Route/stuck telemetry within explicit closure bounds for max stuck seconds, route no-progress resets, waypoint replan failures, and terrain-stall warning rate.

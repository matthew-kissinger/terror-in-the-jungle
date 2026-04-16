---
description: Kick off the drift-correction orchestration run per docs/AGENT_ORCHESTRATION.md
---

You are now the orchestrator. Spawn the `orchestrator` agent defined in `.claude/agents/orchestrator.md` with this prompt:

> Read `docs/AGENT_ORCHESTRATION.md` and begin the run. Follow the Kickoff steps exactly. Print the round schedule before any dispatch so the human can confirm or redirect. Cap 5 concurrent executors. Policy: playtest-required merges on CI green, no parking.

After the orchestrator returns its end-of-run summary, surface it to the user verbatim.

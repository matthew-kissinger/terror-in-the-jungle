<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# doc-consolidation-and-refs

Closes the owner-reported doc drift ("a lot of stale docs we can compress and
compose and align or archive"). The repo carries ~393 docs with broken
cross-references (archived planning docs still linked from index/state files)
and stale state docs. Audit and align without touching live orchestration state.

## Files touched

- `CLAUDE.md`, `AGENTS.md` (fix broken internal refs)
- `docs/**/*.md` (consolidate redundant docs, fix links, archive superseded)
- `docs/state/CURRENT.md` (refresh to current reality)

## Scope

1. Link-audit `CLAUDE.md`, `AGENTS.md`, and `docs/**`; fix or remove broken
   internal references; `npm run lint:docs` passes clean.
2. Consolidate clearly-redundant/superseded docs into their canonical home or
   `docs/archive/`; leave a one-line pointer wherever something moves.
3. Refresh `docs/state/CURRENT.md` to current reality (WebGPU on master, closed
   DEFEKT-3/4, this cycle in flight). Fix stale entries only; no new tracking.

## Non-goals

- Do NOT touch live orchestration state: active-cycle task briefs,
  `docs/AGENT_ORCHESTRATION.md` "Current cycle", `docs/CARRY_OVERS.md`,
  `docs/PLAYTEST_PENDING.md`, `docs/BACKLOG.md`, `docs/DIRECTIVES.md`.
- No code changes; no rewriting block docs from scratch.
- Do not delete historical archives or campaign manifests.

## Acceptance

- [ ] `npm run lint:docs` passes; zero broken internal links in changed files.
- [ ] Net doc count drops or holds; every moved doc leaves a pointer.
- [ ] `npm run lint && npm run test:run && npm run build` pass (docs-only no-op
      for test/build).
- [ ] PR vs master links this brief; names the gap (doc drift).

## Round 2 / Dependencies

- No code deps. Must not collide with `script-inventory-archival` (that task
  owns `scripts/**`; this one owns `docs/**` + root `*.md`).

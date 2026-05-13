# Cycle: cycle-2026-05-10-stabilization-fixes

Last verified: 2026-05-09

Status: ready for `/orchestrate` (Phase 2.5 of the realignment campaign;
inserted between Phase 2 and Phase 3 at the stabilization checkpoint).

## Why this cycle

The live Cloudflare audit at the close of Phase 2 surfaced 5 small,
well-bounded fixes that are highest-leverage to ship before the more
invasive Phase 3+ god-module surgery. Each closes a real audit signal:
an active CVE, missing security headers, missing SEO basics, or
already-provisioned-but-unused Cloudflare Web Analytics. Bundled into one
Phase 2.5 cycle so the human only has to context-switch once.

Comprehensive context:
[docs/STABILIZATION_CHECKPOINT_2026-05-09.md](../STABILIZATION_CHECKPOINT_2026-05-09.md)
and
`artifacts/live-audit-2026-05-09/{FINDINGS.md,CLOUDFLARE_ACCOUNT_AUDIT.md}`.

## Skip-confirm

Recommended **NOT skip-confirm.** The Web Analytics enablement is a
manual dashboard action by the human; it must be confirmed before the
orchestrator dispatches the verification step.

## Concurrency cap

5 parallel executors per round (default).

## Round schedule

### Round 1 — 3 parallel scoped fixes (no shared file edits)

| # | Slug | Reviewer | Playtest? |
|---|------|----------|-----------|
| 1 | `postcss-cve-bump` | none | no |
| 2 | `cloudflare-headers-file` | none | no |
| 3 | `seo-essentials-pass` | none | no |

These three tasks have **no overlapping files** (each touches a different
asset / config). They land in any order.

### Round 2 — manual dashboard step + verification

| # | Slug | Reviewer | Playtest? |
|---|------|----------|-----------|
| 4 | `web-analytics-enable` | none (manual + verify) | no |

`web-analytics-enable` requires a human dashboard toggle (Pages Settings
→ Web Analytics → Enabled + Auto-install). The orchestrator pauses to
confirm the human has done it, then runs the executor's verification
step (re-fetch index.html, confirm the 214-char snippet appears).

## Dependencies

```
postcss-cve-bump        ─┐
cloudflare-headers-file ─┼─→ (Round 1 closes) ─→ web-analytics-enable
seo-essentials-pass     ─┘
```

The Round 2 → Round 1 edge is soft (web-analytics-enable doesn't strictly
need Round 1 in master), but keeps the orchestrator's attention serial
across the manual gate.

## Tasks in this cycle

- [postcss-cve-bump](postcss-cve-bump.md) — bump postcss 8.5.8 → ≥8.5.10 to close Dependabot #26
- [cloudflare-headers-file](cloudflare-headers-file.md) — add `public/_headers` with HSTS + CSP + Permissions-Policy
- [seo-essentials-pass](seo-essentials-pass.md) — `public/robots.txt`, `<meta name="description">`, drop 2 unused preload hints from `index.html`
- [web-analytics-enable](web-analytics-enable.md) — manual Pages dashboard toggle + verify snippet injection

## Cycle-level success criteria

All of:

1. `npm ls postcss` shows ≥8.5.10. Dependabot #26 closes (auto on next scan).
2. `https://terror-in-the-jungle.pages.dev/` returns `Strict-Transport-Security`, `Content-Security-Policy`, and `Permissions-Policy` headers (verify via `curl -sI`).
3. `https://terror-in-the-jungle.pages.dev/robots.txt` returns a real `text/plain` body (not the SPA fallback HTML).
4. `<meta name="description">` present in `index.html`.
5. The 2 reticle preload hints removed from `index.html` (no more browser warning "preloaded but not used").
6. Web Analytics RUM data appears in the Cloudflare dashboard within 24 hr of dispatch.
7. Lighthouse SEO score improves from 82/83 → ≥90 (desktop/mobile).
8. `combat120` p99 within ±2% of pre-cycle baseline (no regression).
9. `npm run validate:fast` clean.
10. Closes the `cloudflare-stabilization-followups` carry-over.

## Hard rules for this cycle

1. **No fence changes.** None of these tasks touch `src/types/SystemInterfaces.ts`.
2. **CSP starts permissive (no blocks).** Use a CSP that explicitly allows what the live deploy needs (Vite-built JS, R2 assets, Cloudflare Insights beacon). Tighten in a follow-up cycle after RUM data lands.
3. **No source-tree changes beyond the listed `Files touched` per task.** Reviewers will reject scope creep.
4. **`web-analytics-enable` must verify, not just enable.** A dashboard toggle without the snippet appearing in `index.html` is incomplete.

## End-of-cycle ritual

Per [docs/AGENT_ORCHESTRATION.md](../AGENT_ORCHESTRATION.md). After all 4
PRs merge:

1. `npx tsx scripts/cycle-validate.ts cycle-2026-05-10-stabilization-fixes --close`
2. Move task briefs (including this file) to `docs/tasks/archive/cycle-2026-05-10-stabilization-fixes/`
3. Append `## Recently Completed (cycle-2026-05-10-stabilization-fixes)` to `docs/BACKLOG.md`
4. Update `docs/AGENT_ORCHESTRATION.md` "Last closed cycle" + "Current cycle" stub → point at Phase 3 (`cycle-2026-05-11-combatant-renderer-split`)
5. Update `docs/CAMPAIGN_2026-05-09.md`: mark cycle 2.5 done, advance to cycle 3, flip `Auto-advance: PAUSED` → `Auto-advance: yes` if continuing the campaign
6. Move `cloudflare-stabilization-followups` carry-over to Closed table; net carry-over delta ≥ −1 (closes the 12-active blocker)
7. Commit as `docs: close cycle-2026-05-10-stabilization-fixes`

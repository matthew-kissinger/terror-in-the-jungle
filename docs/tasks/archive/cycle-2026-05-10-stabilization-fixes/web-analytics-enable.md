# Task: web-analytics-enable

Last verified: 2026-05-09

Cycle: `cycle-2026-05-10-stabilization-fixes` (Phase 2.5, Round 2)

## Goal

Enable Cloudflare Web Analytics on the terror-in-the-jungle Pages project
so RUM data (LCP / INP / CLS / traffic shape, cookie-less) starts flowing
to the dashboard. The token + 214-char snippet are **already provisioned**
on this account (created 2026-04-26); the ruleset is currently
`unattached`. This task flips the toggle and verifies the snippet appears
in the live HTML.

## Why

Free, cookie-less RUM with Core Web Vitals. The 2026-05-09 lab perf trace
showed LCP 280 ms / CLS 0.02 on a desktop RTX 3070; we have no field data
from real users on real devices. Closing this gives feedback into perf
budgets without adding any source-code overhead.

## Hybrid task — manual + executor

This task has **two parts**:

1. **Manual dashboard toggle (human, ~30 sec).** Cannot be automated by
   the executor without Cloudflare API credentials wrangler-authenticated.
2. **Executor verification (after the human confirms).** Re-fetch the live
   index.html and confirm the Cloudflare Insights beacon snippet appears.

The orchestrator dispatches this task LAST in the cycle and **pauses to
confirm the human has done the dashboard step before spawning the
executor**.

## Required reading first

- `artifacts/live-audit-2026-05-09/CLOUDFLARE_ACCOUNT_AUDIT.md` "Web Analytics" section (the existing snippet is 214 chars, token already provisioned)

## Manual step (human, before executor dispatch)

1. Open https://dash.cloudflare.com/ (logged in as the account owner).
2. Navigate: Workers & Pages → terror-in-the-jungle → Settings → Web Analytics.
3. Toggle **Enabled** on. Toggle **Auto-install** on.
4. Confirm the dashboard now shows a "Snippet will be injected on next response" status.
5. Tell the orchestrator "done" so it dispatches the executor.

(No deploy needed — auto-install attaches at the edge, not at build time.)

## Executor steps (after human confirms)

1. `test -d node_modules || npm ci --prefer-offline` (no source changes; just verifying live).
2. Fetch the live index.html: `curl -s https://terror-in-the-jungle.pages.dev/ | head -100`.
3. Verify the Cloudflare Insights beacon snippet is present:
   - Look for `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='...'></script>` (or similar) inside the `<head>` or end of `<body>`.
   - The `data-cf-beacon` JSON should contain a token (sensitive — do not log the value).
4. Run a browser smoke (via chrome-devtools MCP or Playwright):
   - Load the page.
   - Wait 5 seconds.
   - Verify a network request to `static.cloudflareinsights.com/beacon.min.js` was made.
   - Verify a network request to `cloudflareinsights.com/cdn-cgi/rum` was made (RUM payload).
5. (24 hr later, sanity check by human) confirm RUM data appears in the dashboard.

## Files touched

**None.** This task is a manual dashboard toggle + executor verification.
The PR is a single doc commit recording the verification result + closing
the carry-over.

## Verification

- Live `index.html` contains the Cloudflare Insights beacon snippet
- Browser network tab shows requests to `static.cloudflareinsights.com` and `cloudflareinsights.com`
- (Manual, 24 hr) RUM events visible in dashboard

## Non-goals

- Do NOT manually paste the snippet into `index.html` (source approach).
  Auto-install via dashboard is preferred — zero source-tree change.
- Do NOT enable any other Web Analytics features (alerts, custom events) — out of scope.

## Branch + PR

- Branch: `task/web-analytics-enable`
- Commit: `docs(audit): web analytics enabled on terror-in-the-jungle Pages (web-analytics-enable)`
- PR is a small doc commit appending a verification note to
  `artifacts/live-audit-2026-05-09/CLOUDFLARE_ACCOUNT_AUDIT.md`.
  (artifacts/ is gitignored — actual deliverable is the carry-over close
  + the dashboard state.)

## Reviewer: none required

## Playtest required: no

## Estimated diff size

≤10 LOC (carry-over registry update + audit-doc append). Within budget.

# Stabilization Checkpoint — 2026-05-09

Last verified: 2026-05-09

This is the **stabilization checkpoint** at the close of Phase 2 of the
realignment campaign at [docs/CAMPAIGN_2026-05-09.md](CAMPAIGN_2026-05-09.md).

The campaign's `auto-advance: yes` is **paused at this checkpoint** until a human
reviews and approves continuation. Phases 3–9 are queued but not dispatched.

## Why pause here

Phase 2 closed the worst coupling junction in the repo (`ZoneManager` fan-in
52 → 17 on the read seam, 5 on the concrete edge). Phases 3–9 are the more
invasive god-module surgery (combatant renderer, movement/AI splits, player
controller, fixed-wing + airframe tests, telemetry/warsim/navmesh, Phase F
ECS gate, Phase 5 new-normal). Before that surgery starts, this is the right
moment for a human to:

1. Review what Phases 0–2 actually shipped vs the plan.
2. Decide on the highest-leverage stabilization items (security headers,
   PostCSS CVE, Web Analytics) before deeper surgery.
3. Resequence Phases 3–9 if Phase 2's outcomes change priorities.
4. Approve the `bitECS` go/no-go decision rule for Phase 8.

## What shipped Phases 0–2 (cumulative)

| Phase | Cycle | PRs | Outcome |
|---|---|---|---|
| 0 | `cycle-2026-05-09-phase-0-foundation` | [#166](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/166) | Durable rules layer + WorldBuilder dev console (substrate only) |
| 1 | `cycle-2026-05-09-doc-decomposition-and-wiring` | [#167](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/167)–[#172](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/172) | Doc decomposition (STATE_OF_REPO, PERFORMANCE, PROJEKT_OBJEKT_143) + 6 WorldBuilder god-mode flags wired |
| 2 | `cycle-2026-05-10-zone-manager-decoupling` | [#173](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/173)–[#177](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/177) | `IZoneQuery` interface + ZoneManager fan-in 52 → 17 read / 5 concrete |

Each cycle's full PR list lives in [docs/BACKLOG.md](BACKLOG.md) "Recently Completed".

## Live Cloudflare audit findings (2026-05-09)

Captured during Phase 2 R2 wait via chrome-devtools MCP + curl + WebFetch
research. Full evidence: `artifacts/live-audit-2026-05-09/FINDINGS.md`.

**Account-level audit added later via claude-in-chrome MCP** (logged-in
dashboard session, queried via `/api/v4/*` endpoints): see
`artifacts/live-audit-2026-05-09/CLOUDFLARE_ACCOUNT_AUDIT.md`. Highlights:

- Production deploy at SHA `08fc34203bb1` (the close + stabilization commit)
  is **live and successful**. Last 5 deploys all SUCCESS.
- **Web Analytics token + snippet already provisioned** for this project but
  the ruleset is **unattached** — zero RUM data flowing today. **Closing
  this is a 1-click toggle** in the Pages dashboard (Settings → Web
  Analytics → Enabled + Auto-install). Lowest-effort highest-value item.
- R2 prod bucket has correct CORS (`public-game-asset-read`) and
  `Default Multipart Abort` lifecycle. Preview/prod separation is healthy.
- Pages bindings: zero env vars, zero secrets, zero KV/D1/R2 bindings, zero
  services, zero Functions. Pure static SPA — minimal attack surface.
- Deploy mode is **Direct Upload** (driven by `gh workflow run deploy.yml`).
- Account `enforce_twofactor: false` (orthogonal note).
- No custom domain on either Pages or R2 (zone-level features like Cache
  Reserve / Smart Tiered Cache remain N/A until a custom domain is added).

### What's healthy

- Cross-origin isolated: true (COOP+COEP working). Unlocks `SharedArrayBuffer`.
- Service worker active at root (`sw.js`).
- **Zero retail leakage** — Vite DCE confirmed at runtime: `__engine`, `__metrics`,
  `__renderer`, `__worldBuilder`, `advanceTime`, `perf`, `combatProfile`,
  `isWorldBuilderFlagActive` all `undefined` in production.
- HTTP/3 working (`alt-svc: h3=":443"`; observed `nextHopProtocol: "h3"`).
- Brotli compression on JS/CSS/fonts.
- R2 immutable assets serve `cache-control: public, max-age=31536000, immutable`.
- WebGL2 + WebGPU both available in Chrome 147.
- Three.js **r185** confirmed in the live bundle.

### Core Web Vitals (cold-load, lab, RTX 3070)

- **LCP: 280 ms** (well under 2,500 ms "Good").
- **CLS: 0.02** (well under 0.1 "Good").
- ForcedReflow: 17 ms in Tweakpane `measure` call (LiveTuningPanel; dev-only,
  not in retail surface). Lighthouse "estimated savings: none."
- Render-blocking CSS: 8 + 7 ms total. Lighthouse "estimated savings: none."

### Lighthouse scores

| Audit | Desktop | Mobile |
|---|---:|---:|
| Performance (lab perf trace) | LCP 280ms / CLS 0.02 | n/a (mobile lab uses DevTools throttling) |
| Accessibility | 87 | 92 |
| Best Practices | 100 | 100 |
| SEO | 82 | 83 |
| Agentic Browsing | 67 | 67 |

### Audit findings → carry-over candidates

Filed below as a flat list. Three are added to `docs/CARRY_OVERS.md` Active
table at this checkpoint (highest value/effort). The rest are listed here for
the next cycle's prioritization pass.

#### Security

1. **PostCSS CVE — `postcss@8.5.8`** vulnerable to XSS via unescaped `</style>`
   in CSS Stringify Output. Fixed in 8.5.10. Source: GitHub Dependabot alert
   #26 (severity: medium). Vite 8.0.8 is parent. Bump postcss via overrides
   or wait for next Vite minor.
2. **Missing security headers.** Cloudflare Pages does not auto-emit
   `Strict-Transport-Security`, `Content-Security-Policy`, or
   `Permissions-Policy`. Already serving COOP, COEP, X-Content-Type-Options
   nosniff, X-Frame-Options DENY, Referrer-Policy. Add a `public/_headers`
   file (Cloudflare Pages convention).
3. **Page Shield (free tier).** Static-only WebGL game with no auth/payment;
   blast radius if compromised is low. Free tier covers script monitoring;
   alerting requires Business+. Skip the upsell, but worth knowing the audit
   exists.

#### SEO / discoverability

4. **No `robots.txt`.** SPA fallback serves `index.html` for `/robots.txt`,
   which Lighthouse parses as malformed text and reports "56 errors". Add
   `public/robots.txt` with `User-agent: * / Allow: /`.
5. **No `<meta name="description">`** in index.html. SEO failure on both
   desktop and mobile Lighthouse.
6. **No `llms.txt`.** New AI-crawler convention. Optional. SPA fallback
   serves index.html instead. Could ship a one-paragraph project summary.
7. **`meta-viewport` user-scalable=no** — intentional for touch UX (prevent
   pinch-zoom during fire/aim). Defensible. Document in cycle retro; do not
   "fix."

#### Performance hygiene

8. **2 unused preload hints in `index.html`.** `reticle-cobra-gun.png` and
   `reticle-rocket.png` are preloaded but not used at startup (browser warns
   "preloaded but not used within a few seconds from window load"). Either
   drop the preload or move to runtime preload at game-mode-pick time.
9. **First-paint weight: 33.4 MB / 134 requests.** Index JS 1.0 MB decoded
   (262 KB transferred). Three.js 755 KB decoded. UI chunk 500 KB decoded.
   Code-splitting opportunities for a future cycle:
   - Lazy-load mode-specific spawn/ROE chunks (A Shau loads only when picked).
   - Lazy-load NPC sprites by faction (US-only mode skips NVA/VC/ARVN).
   - Lazy-load vehicle / weapon GLB models on loadout pick.
10. **17 ms forced reflow in Tweakpane** — dev-only panel; not in retail
    surface. Acceptable.

#### Cloudflare optimization (research, no auth required)

11. **Cloudflare Web Analytics** — free, cookie-less RUM. Pages has a
    one-click integration in the dashboard (Workers & Pages → Metrics →
    Enable). Auto-injects on next deploy. Reports LCP/INP/CLS via Vitals
    Explorer. **HIGH value/effort.**
12. **Browser Rendering API (Workers)** — could replace local Playwright
    `check:live-release` smoke. Free tier: 10 browser-minutes/day, 3
    concurrent, 60s timeout. Few invocations per week (one per deploy) is
    well within free. ~1–2 hr port effort. Removes workstation dependency
    for live-release verification.
13. **Cache Reserve / Smart Tiered Cache** — both N/A while R2 assets serve
    direct from `pub-*.r2.dev`. Would require fronting R2 with a custom
    domain on a Cloudflare zone.
14. **Speed Brain** — irrelevant. Speculation Rules API for navigation
    prefetch; SPA cold load doesn't benefit.
15. **Cron Triggers + Workers** — wrong host for `artifact-prune.yml` (it
    runs npm scripts that need the repo). Keep in GitHub Actions.
16. **Bot Fight Mode** — DO NOT ENABLE. Cloudflare's free-tier bot defense
    issues CPU challenges to traffic on shared IPs / CGNAT / mobile NAT,
    which is exactly the population that plays browser games. Fan-mode would
    block legit gamers.
17. **Snippets** — Pro plan and up. Not worth the upgrade just for header
    injection; `_headers` covers it on free.

### Deployment hygiene

18. **Live SHA lag.** At capture time, live `gitSha` was the Phase 1 close
    commit (`10fc2d2`) — pre-drift-correction (`3282ac1`). The drift commit
    is docs-only (no path-filter match in `ci.yml`), so no auto-deploy.
    A doc-only commit can leave `check:live-release` failing the
    `live-manifest-sha` gate even when the live deploy is functionally
    correct. Triggered a manual re-deploy mid-audit.

## Phase 2 audit notes (cycle retro)

### Carried into Batch C

- **Batch B kept `setZoneManager(IZoneQuery)` method names** instead of
  renaming to `setZoneQuery` (composer compatibility per design memo's "shim
  if needed" guidance). 4 setters still named `setZoneManager` despite
  accepting `IZoneQuery`: `PlayerRespawnManager`, `RespawnMapController`,
  `SpawnPointSelector`, `AIStatePatrol`.
- **CommandInputManager migration** was deferred from Batch B to Batch C
  (combat-reviewer flagged on PR #176; Batch C delivered).

### Did not migrate (out-of-scope per Batch B brief)

- **Weapons cluster (5 imports of concrete `ZoneManager`):**
  `FirstPersonWeapon`, `WeaponAmmo`, `AmmoManager`, `AmmoSupplySystem`,
  `PlayerHealthSystem`. Cycle-level success criterion was ≤20 fan-in
  (achieved); aspirational target ≤5 missed by this cluster.

### Pre-existing failures (not regressions)

- **`npm run check:scenarios-smoke` fails on baseline master** with
  `lumaMean 19.83 < 30`. Pre-existing canvas/GL headless issue, not introduced
  by Phase 2.

### Combat-reviewer follow-up notes (PR #172, PR #176, PR #177)

- **Stale grandfather LOC text** in `scripts/lint-source-budget.ts` —
  PlayerMovement.ts entry was "703 LOC" while file is now 718 LOC after
  Phase 1's noClip wires. **Fixed in `3282ac1` drift commit (Phase 1).**
- **`oneShotKills` flag** — 7th WorldBuilder god-mode flag is published in
  `WorldBuilderState` but unwired to any combat consumer. Out-of-scope for
  Phase 1 brief which named only 6 flags. Filed as carry-over
  `worldbuilder-oneshotkills-wiring` in Phase 1 close.
- **`artifact-prune.ts` baseline-pin regex bug** — script requires
  `artifacts/perf/` prefix but `perf-baselines.json` stores bare dir names.
  Pinned dirs are reportedly "0" though pins exist; `--apply` could delete
  pinned dirs. Filed as carry-over `artifact-prune-baseline-pin-fix` in
  Phase 1 close.

### Doc drift items deferred from Phase 1 drift correction

- **`docs/perf/playbook.md`, `scenarios.md`, `baselines.md`** reference ~12
  `scripts/projekt-143-*.ts` paths that moved to `scripts/audit-archive/`.
  Investigation tooling references are stale.
- **`docs/ASSET_ACCEPTANCE_STANDARD.md`** references `check:projekt-143-*`
  scripts that were archived.

## Recommended Phase 3 prep

Before re-running `/orchestrate`, the human should consider these scope
adjustments:

1. **Insert a "stabilization-fixes" cycle as Phase 2.5** ahead of Phase 3
   that ships:
   - PostCSS CVE bump.
   - `public/_headers` with HSTS + CSP + Permissions-Policy.
   - `public/robots.txt`.
   - `<meta name="description">` in index.html.
   - Drop unused preload hints OR move to runtime preload.
   - Cloudflare Web Analytics one-click enable (manual dashboard step + a
     deploy to inject the snippet).
   This is ~3 hr work; defends against active CVE + closes 6 audit findings
   with zero risk to game systems.
2. **Phase 4 (DEFEKT-3 first surgical pass)** — combat-reviewer notes from
   Phase 2 confirm `AIStateEngage.initiateSquadSuppression` synchronous
   cover-search is still the p99 hot path. CoverQueryService extraction
   plan from the design-memo ecosystem still applies.
3. **Phase 8 (bitECS go/no-go)** — explicit decision rule: ≥3× speedup at
   1,000+ entities AND port bounded → adopt; otherwise abandon and commit
   to OOP. Either outcome is a valid cycle close.

## How to resume the campaign

Per `docs/CAMPAIGN_2026-05-09.md` "Resuming a halted campaign":

1. Edit `docs/CAMPAIGN_2026-05-09.md` to change `auto-advance: paused
   (stabilization checkpoint 2026-05-09)` back to `auto-advance: yes`.
2. Optionally insert a Phase 2.5 "stabilization-fixes" cycle row (see
   recommendation above) and create the matching cycle brief at
   `docs/tasks/cycle-2026-05-10-stabilization-fixes.md`.
3. Run `/orchestrate`. The orchestrator will read the campaign manifest and
   resume from the next non-`done` cycle.

## Carry-over snapshot at this checkpoint

See [docs/CARRY_OVERS.md](CARRY_OVERS.md). Active count after Phase 2 close
is registered separately by `npx tsx scripts/cycle-validate.ts <slug> --close`
during the close ritual.

New carry-overs filed at this checkpoint:

- `cloudflare-stabilization-followups` — bundles audit findings #1, #2, #4–6,
  #8, #11. Points at this doc.
- `weapons-cluster-zonemanager-migration` — finishes the IZoneQuery migration
  for FirstPersonWeapon / WeaponAmmo / AmmoManager / AmmoSupplySystem /
  PlayerHealthSystem (5 remaining concrete imports).
- `perf-doc-script-paths-drift` — sweep `docs/perf/*.md` and
  `docs/ASSET_ACCEPTANCE_STANDARD.md` for stale `scripts/projekt-143-*.ts`
  references; point at `scripts/audit-archive/` instead.

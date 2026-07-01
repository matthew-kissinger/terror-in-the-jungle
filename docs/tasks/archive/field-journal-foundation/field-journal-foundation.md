<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# field-journal-foundation

KEYSTONE of the Field Journal frontend campaign (DIZAYN-4). Replaces the
amber-tacticool token system with the Field Journal design language so every
downstream surface cycle (shell, deploy, HUD, overlays, vehicles) has the
tokens, fonts, and shared primitives to build against. No surface is fully
re-laid-out here — this lands the palette/type/texture foundation and a
coherent (if mixed) baseline across the whole UI. See
[CAMPAIGN_2026-06-03-field-journal-frontend.md](../CAMPAIGN_2026-06-03-field-journal-frontend.md)
and [FIELD_JOURNAL_UI.md](../FIELD_JOURNAL_UI.md).

## Files touched

- `src/ui/engine/primitives.css` — raw palette → Field Journal tokens
- `src/ui/engine/theme.css` — semantic tokens repointed to FJ; fonts swapped
- `src/ui/design/tokens.ts` — JS palette → FJ (HUD = light-on-dark-chip)
- `src/ui/design/styles.ts` — inject FJ shared primitives + texture layers
- `src/main.ts` — add @fontsource FJ fonts
- `src/style.css` — body background → paper; font ref
- `index.html` — boot splash reskinned to Field Journal
- `package.json` — add @fontsource/special-elite, courier-prime, caveat

## Scope

1. Define FJ raw palette (paper/ink/red/green/hot/warn/tape/shadow) + radii in `primitives.css`; keep structural primitives (type scale, spacing, weights, timing, z-index).
2. Repoint every semantic token in `theme.css` to FJ values; `--type`/`--type-stamp`/`--hand` added; legacy `--font-*` aliased to them.
3. JS `colors` repointed to FJ — HUD-over-battlefield stays legible (light text on dark ink chips).
4. `injectSharedStyles` gains FJ utility classes (stamp/tape/paperclip/panel/folder-tabs/btn/status pills/margin-note) + texture-layer classes + FJ keyframes.
5. Boot splash + body background go manila; self-host the three FJ fonts.

## Non-goals

- Per-surface re-layout (screens, deploy, HUD) — those are their own cycles.
- Deleting old per-component `*.module.css` — happens as each surface migrates.
- Uninstalling Teko/Rajdhani/JetBrains — kept until the sweep cycle so the 48 hardcoded font refs do not silently fall back mid-campaign.
- Any fenced-interface change.

## Acceptance

- [ ] No raw `--color-*` amber/jungle/steel primitives remain in `primitives.css`; `theme.css` resolves entirely against FJ tokens.
- [ ] FJ fonts load self-hosted; `--type`/`--type-stamp`/`--hand` resolve.
- [ ] `npm run lint && npm run typecheck && npm run test:run && npm run build` all pass.
- [ ] Menu/boot render in manila+ink (preview screenshot); HUD chips stay legible.

## Round 2 / Dependencies (optional)

- Blocks: `cycle-field-journal-shell`, `-deploy`, `-hud-combat`, `-hud-mobile`, `-overlays`, `-vehicles`.

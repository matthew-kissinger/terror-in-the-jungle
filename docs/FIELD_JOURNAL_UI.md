# Field Journal — UI Design Language

> **Status:** ADOPTED 2026-06-03. Field Journal (direction 03) won the 10-way UI/UX bake-off.
> **Canonical visual reference:** the approved mockup at [`public/mockups/03-field-journal/`](../public/mockups/03-field-journal/) (`index.html` + `style.css` + `app.js`). When this doc and the mockup disagree, the mockup wins until this doc is corrected.
> **Implementation plan:** [`CAMPAIGN_2026-06-03-field-journal-frontend.md`](CAMPAIGN_2026-06-03-field-journal-frontend.md).
> This doc is the codified spec the wiring cycles build against. It supersedes the old amber-tacticool look (no design doc existed for that; it lived ad-hoc in `src/ui/engine/theme.css` + `primitives.css` + per-component `*.module.css`).

## Concept

A recon scout's hand-kept **field book**, A Shau Valley, 1968. Analog and tactile: manila paper, typewriter type, handwritten margin notes, rubber stamps, tape, paperclips, topographic maps. The UI reads as physical documents a soldier carries, not a glowing digital overlay. The in-game HUD is **pencil-on-acetate** laid over the world.

This is a deliberate hard pivot away from the rejected "military tacticool" look (near-black + single amber accent, Teko/Rajdhani, grid overlays, blue-vs-red factions).

## Palette

Tokens are CSS custom properties (the mockup defines them in `:root`). **No fallbacks** — these are used without fallback args; a missing token must surface, never silently default.

| Role | Token | Value | Usage |
|---|---|---|---|
| Paper (base surface) | `--paper` | `#D9C7A3` | page background |
| Paper raised | `--paper-lt` | `#e7d9ba` | cards, panels, chips |
| Paper recessed | `--paper-dk` | `#c4b186` | nav gradient, wells |
| Paper edge | `--paper-edge` | `#b09a6b` | 1px borders on paper |
| Ink (primary text) | `--ink` | `#2B2620` | headings, body, strong rules |
| Ink soft | `--ink-soft` | `#5a5145` | secondary text, ghost buttons |
| Ink faint | `--ink-faint` | `#8a7e6b` | labels, dashed dividers, muted |
| Stamp red (accent/danger) | `--red` / `--red-dk` | `#9E3B2E` / `#7c2c22` | the signature accent: stamps, active tabs, deploy button, hostile, selection |
| Field green (secure/success/squad) | `--green` / `--green-dk` | `#4F6B3A` / `#3a4f2a` | secure status, allied, objective hatch, loadout slot rule |
| Hot | `--hot` | `#b5472f` | "hot" spawn, critical health |
| Contested/warning | `--warn` | `#a8742a` | contested status |
| Tape | `--tape` | `rgba(225,214,180,0.62)` | translucent tape strips, bake-off link |
| Drop shadow | `--shadow` | `rgba(43,38,32,0.30)` | paper lift shadows |

Faction reinterpretation: **ALLIED = field green, HOSTILE = stamp red** (never the rejected blue-vs-red). Status ramp: Secure = green, Contested = warn, Hot = red/hot.

Radii are deliberately tight (`--r-sm: 2px`, `--r: 3px`) — paper, not glass. Layout max width `--maxw: 1280px`. Nav tab height `--tab-h: 46px`.

## Typography

Three faces, each with a fixed role. **Implementation: self-host via `@fontsource`** (matching how Teko/Rajdhani/JetBrains Mono are imported in `src/main.ts` today) — packages `@fontsource/special-elite`, `@fontsource/courier-prime`, `@fontsource/caveat`. The mockup loads them from the Google Fonts CDN; that is **mockup-only** and must not ship (no third-party CDN dependency, and it would violate the no-silent-failure rule on a CDN outage).

| Face | Token | Role |
|---|---|---|
| **Special Elite** | `--type-stamp` | stamp/headings/labels/buttons/big numerals (timer, ammo) — the "typewriter on a form" voice |
| **Courier Prime** | `--type` | body, stats, captions, fine print — the typewriter body |
| **Caveat** | `--hand` | handwritten margin notes, distances, taglines, tips — the human annotation layer |

Remove the Teko/Rajdhani/JetBrains Mono imports when the foundation lands.

## Material layers (texture)

Three fixed, `pointer-events:none`, full-viewport layers composited under the content (`z-index:0`), shared across every surface:

- **`.paper-grain`** — two fine radial-gradient dot patterns at `mix-blend-mode:multiply`, `opacity:0.5`.
- **`.topo-lines`** — a faint green repeating-linear-gradient grid (`opacity:0.20`), the topographic motif.
- **`.vignette`** — inset box-shadow + radial darkening at the edges.

These ship as one shared injected component (see `src/ui/design/styles.ts` `injectSharedStyles`), present on every screen.

## Component patterns

- **Folder tabs** (`.folder-tabs` / `.tab`) — the persistent nav reads as manila file-folder tabs; the active tab is stamp-red, raised, and bleeds into the sheet below.
- **Manila panels / cards** — `--paper-lt → --paper` gradient, `--paper-edge` border, soft lift shadow, a slight imperfect rotation (`-0.6deg`..`0.7deg`). Used for op-cards, loadout slots, sheets, the menu panel, the loading sheet.
- **Rubber stamps** (`.stamp`) — red (or green) outlined, uppercase, rotated, `mix-blend-mode:multiply` with a mask for ink-bleed. CLASSIFIED / CAMPAIGN / DEPLOYING.
- **Tape** (`.tape`) and **paperclips** (`.paperclip`, `.op-clip`) — decorative fasteners on sheets and cards.
- **Margin notes** (`.margin-note`) — Caveat, red, rotated; the scout's handwriting.
- **Buttons** — `.btn--deploy` (red stamp-outline, hard offset shadow, dashed "stamp ring" on hover), `.btn--ghost` (dashed underline), `.link-btn` (dotted underline).
- **Status pills** — `.status--secure` (green), `--contested` (warn), `--hot` (red, bold).
- **Dashed dividers** — `1px dashed var(--ink-faint)` separates sections (form-like).
- **Hand-drawn distances/values** — Caveat in red for map distances, stat call-outs.

## In-game HUD treatment (pencil-on-acetate)

The combat HUD is an **acetate overlay**: a faint blue-grey graph tint + screen-blend sheen over the world (`.screen--combat::after`), with HUD modules drawn as pencil/ink on dark **manila chips** for legibility over bright terrain:

- Vitals and objective use `rgba(43,38,32,0.78)` chips with `--paper-lt` text (inverted) so they read over any backdrop.
- Bars (objective, health) use a 45° `repeating-linear-gradient` hatch — green for objective/secure, red for health.
- Timer/ammo are big Special Elite numerals on light paper chips; kill feed is small Courier on tape chips; minimap is a bordered paper square with a Caveat sector label; compass is a small paper dial with a red needle.
- The crosshair and hit-marker are simple ink/red strokes.

Legibility over a live 3D scene is the hard constraint here — see the layout problem below.

## Motion

Subtle, paper-physical: imperfect rotations (`-0.5deg`..`-3deg`), `sheetIn` (screens settle in), `circlePulse` (selected spawn ring), `kfIn` (kill-feed slide). **`prefers-reduced-motion` kills all animation** (already wired in the mockup) — preserve this.

## Accessibility

- `:focus-visible` → `2px dashed var(--red)` outline.
- All interactive targets **≥44px** (tabs, spawns, slots, buttons, touch controls).
- `env(safe-area-inset-*)` honored on nav, bottom bars, touch controls.
- Inverted dark chips guarantee text contrast over the battlefield.

## Per-surface application

| Surface | Field Journal treatment |
|---|---|
| **Menu** | manila menu panel on a hand-drawn ridge/palm backdrop; CLASSIFIED stamp, paperclip, Caveat tagline + margin note |
| **Modes** | "Operations Log" — manila op-cards with paperclips, Caveat taglines, dashed stat grid; A Shau gets a green CAMPAIGN stamp |
| **Deploy** | "Insertion Map" topo map with circled spawn pins + Caveat distances + a marked route, synced spawn legend, vehicle chips, and a prominent "Loadout Sheet" (4 form slots with swap rows) |
| **Combat** | pencil-on-acetate HUD over the world (see above) |
| **Loading** | a "Mobilizing" sheet: DEPLOYING stamp, hatched progress bar, struck-through phase checklist, Caveat FIELD NOTE tip |

## Implementation requirements (binding on the wiring cycles)

1. **Replace, don't layer.** The new tokens live in `src/ui/engine/primitives.css` + `theme.css` (rewritten); the old amber-tacticool tokens are deleted, not aliased. Each migrated surface deletes its old `*.module.css`.
2. **Self-host fonts** via `@fontsource`; remove the Teko/Rajdhani/JetBrains Mono imports in `src/main.ts`.
3. **Shared texture layers** + shared component primitives (stamps, tape, tabs, manila panel, buttons, status pills) live in one place (`src/ui/design/`), consumed by every surface — not re-implemented per component.
4. **No fallbacks.** CSS custom properties are used without fallback args; missing fonts/assets/tokens must surface visibly. JS must not silently default a missing value — fail loud (a masked failure is the bug).
5. **Fence-safe.** Restyle/relayout stays in CSS + component-internal DOM. Do **not** change `IHUDSystem` or any fenced interface in `src/types/SystemInterfaces.ts` without the `[interface-change]` process + human approval (see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)).
6. **Fit to viewport.** Every screen and the HUD fits the visible canvas at all supported sizes — no component off-canvas, no page-scroll to see content or reach a control. Reflow / compact to fit; reserve bounded inner-scroll for genuinely unbounded lists only (a full scoreboard), and never hide a primary action below the fold.

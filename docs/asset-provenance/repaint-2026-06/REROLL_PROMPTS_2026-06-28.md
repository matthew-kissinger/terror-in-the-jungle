# Re-roll prompts — 2026-06-28 owner playtest

> **STATUS 2026-06-28 — Huey + Skyraider re-rolls IMPORTED, WIRED, and VERIFIED.**
> The owner re-rolled both in Kiln Studio; they were normalized through
> `scripts/import-war-catalog.ts` (axis-wrapped to +Z, canonical joints, budget
> PASS, textures intact), spliced into
> `src/config/generated/warAssetCatalog.ts` (replacing the default-`kiln`-art
> entries the owner saw), and visually confirmed in `?mode=asset-gallery` (both
> load clean, no GLTFLoader/texture errors). Measured on-disk: Huey
> `uh-1h-huey-transport` dims `[2.45, 2.98, 12.45]` tris 1652; Skyraider
> `a-1-skyraider-spad` dims `[14.7, 4.39, 11.03]` tris 2612 (taller, more
> correctly proportioned body). **Phase 3 `asset-reroll-requests` no longer
> needs to file these two.** Prompts kept below as the provenance record.

These prompts are refinements of the stored `*.provenance.json` `sourcePrompt`
values, with the owner's fixes baked in. Style matches what Kiln/Fable consumes.

## Hard invariants (do NOT lose these in a re-roll)

- **Keep the articulated parts separable** — the importer auto-detects `Joint_*`
  nodes and validates required roles per `scripts/asset-import/joint-taxonomy.json`:
  - `uh1-huey` = `single-rotor-heli` → needs a **main rotor** + **tail rotor** as
    distinct spinning parts (`Joint_MainRotor` y, `Joint_TailRotor` z).
  - `a1-skyraider` = `single-prop` → needs a **propeller** as a distinct spinning
    part (`Joint_Propeller` x).
  A roll that fuses the rotor/prop into the body fails `--strict` import.
- **Orientation/scale auto-handled** — importer wraps +X→+Z and re-measures dims;
  just generate nose-forward, sitting on gear/skids at ground level.
- **Stay in the current complexity/scale band** (both currently PASS budget):
  Huey ~13 m, Skyraider ~12–13 m. No ultra-dense greebles (aircraft tri/KB caps).

## uh1-huey (UH-1H Huey transport) — fixes: thinner tail boom, forward-facing cockpit glass

> A UH-1H "Huey" transport helicopter, the workhorse of the US Army in Vietnam,
> about thirteen meters nose to tail and parked on its skids. The nose is a
> rounded cockpit whose FRONT is two flat windscreen panels angled forward to a
> thin central post — clearly facing forward like a windshield you look straight
> into — with smaller chin bubble windows below; the curved glass wraps only
> above and to the sides and never folds the front windows into each other across
> the nose. The cockpit flows into a broad slab-sided cabin with wide open side
> doorways. From the cabin a SLENDER tail boom — distinctly thinner than the
> cabin, a slim tapering tube — runs back longer than the cabin itself and
> narrows steadily to a small vertical fin carrying a two-bladed tail rotor and
> short horizontal stabilizers. Two long landing skids ride on tubular cross
> struts. A two-bladed main rotor longer than the fuselage sits on a tall mast
> above the cabin. Olive-drab overall, iconic and utilitarian. Keep the main
> rotor and the tail rotor as separate spinning parts.

## a1-skyraider (A-1 Skyraider "Spad") — fix: regenerate the fuselage body (wings/wheels were fine)

> An A-1 Skyraider "Spad", a burly single-engine attack aircraft about twelve to
> thirteen meters long, sitting tail-low on taildragger gear. A big round radial
> engine cowl with a four-bladed propeller fills the nose. Behind it the fuselage
> is ONE clean, continuous, deep-bellied body with a smooth unbroken top spine
> running straight from the cowl to the tail — no lumps, kinks, steps, or odd
> bulges; a framed bubble canopy sits over the mid-fuselage and fairs smoothly
> into the dorsal line. Straight broad wings carry rows of underwing hardpoints
> loaded with bombs and rockets. A tall rounded tail fin finishes the fuselage.
> Navy gray over olive, rugged and heavy-shouldered, with clean believable
> proportions. Keep the propeller as a separate spinning part.

## NOT Kiln re-rolls (handled elsewhere — do not roll these)

- **Coconut palm** — external Poly-by-Google CC-BY asset, not Kiln. Defect is an
  off-center/leaning trunk; fix is re-centering the existing GLB (gltf-transform,
  a Phase 3 code step), not a roll. A fresh symmetric palm would go through the
  vegetation/impostor pipeline, not the war importer — only roll one if you want
  to replace the source entirely.
- **Jumbled tent / roofless building** (`barracks-tent`, `aid-station`) —
  importer geometry corruption of the existing models, NOT bad source art. The
  fix is in the importer + a re-import (Phase 3); a re-roll would not fix it.
- **SKS / Dragunov marksman rifle** — already in the catalog (`sks`,
  `dragunov-svd`), just unused. Phase 4 wires them; no roll needed.

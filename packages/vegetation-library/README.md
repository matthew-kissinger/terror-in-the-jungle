<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# @game-field-kits/vegetation-library

Engine-agnostic vegetation asset library: **descriptors, schema, and a path resolver — no renderer dependency.**

This package is the single source of truth for *what vegetation assets exist and how they can be rendered*, expressed in terms no engine owns. It imports no `three`, no DOM, no game types. A consuming engine reads the catalog and maps it, through a thin adapter it owns, onto its own runtime (billboard system, static-impostor system, instanced mesh, …).

## The split

- **Code lives here** (`src/`, `catalog/`): the schema, the validated catalog, the resolver.
- **Binaries live in the consumer** (`public/assets/vegetation/` in TIJ): GLBs, textures, atlases. Descriptors reference them by **root-relative logical paths** (`banyan/banyan-large-textured.glb`); `resolveAssetPath(root, logical)` joins them. TIJ passes root `/assets/vegetation`; another engine passes its own dir/CDN base.

## Two layers per asset

1. **`representations`** — the *inventory* of authored render forms: a `mesh`, a `billboardAtlas`, an `octaImpostor`, a `groundCard`. Each is a pure descriptor with a stable `id`.
2. **`lod`** — the chosen *strategy*: an ordered near→far chain of distance bands, each pointing at a representation (or marked **planned-not-yet-baked**) with a perf budget.

**Not everything is an impostor.** The LOD chain is picked per asset from inventory, budget, and perf:

| Asset | `lod.label` | Chain |
|---|---|---|
| `banyan-large` (hero) | `mesh-near+octa-far` | mesh 0–150m → octahedral impostor 150m+ |
| `banyan-standard` (common) | `mesh-near+billboard-far` | mesh 0–70m → cheap lat/lon card 70m+ |
| `fern` (understory) | `mesh-near+card-far` | small mesh 0–12m → ground card 12–40m |
| `elephant-grass` (ground) | `instanced-card-only` | one alpha card 0–45m, no far band |

A band with `representationId: null` + `plannedKind` is the gap between *strategy* and *inventory* made explicit — it says "this band needs baking" instead of pretending it renders. `isLodComplete(asset)` is false until every band is backed.

## Usage (consumer side)

```ts
import {
  readyVegetation, getVegetationAsset, resolveAsset, representationForDistance,
} from '@game-field-kits/vegetation-library';

const ASSET_ROOT = '/assets/vegetation'; // wherever this engine serves the binaries

for (const asset of readyVegetation()) {
  const resolved = resolveAsset(ASSET_ROOT, asset);   // logical paths -> urls
  // ...hand `resolved` to your engine adapter...
}

// distance -> which representation renders
const banyan = getVegetationAsset('banyan-large')!;
const rep = representationForDistance(banyan, 30);     // -> the near mesh
```

The engine's adapter is the *only* place that knows about the renderer. It reads these descriptors and builds whatever it needs (e.g. TIJ maps `mesh` → a loaded GLB registered with `StaticImpostorSystem`, `billboardAtlas`/`groundCard` → `pixelForgeAssets`/`VegetationScatterer`). The library never changes when the engine changes.

## Adding a species

1. Drop normalized binaries under the consumer's vegetation root (`+Y` up, `-Z` forward, meters, pivot ground-center).
2. Add `catalog/<id>.json` describing provenance, material buckets, representations, and the LOD chain. Use `status: "sourceStaged"` while only raw source is present; `"ready"` once a near representation exists.
3. Register it in `src/catalog.ts` (one import + array entry).
4. `npm run -w @game-field-kits/vegetation-library test` — the catalog validates at load; a malformed descriptor fails the suite.

## Schema invariants (enforced by `validate.ts`)

- Normalization is fixed: `{upAxis:Y, forwardAxis:-Z, unit:meter, pivot:ground-center}`.
- LOD bands are ordered, start at 0m, and are contiguous; only the last may be unbounded.
- Every non-planned band references an existing representation id.
- A `ready` asset has its nearest band backed by a real representation.
- CC-BY* licenses must set `attributionRequired: true`.

## License

Code: AGPL-3.0-or-later. First-party assets: CC-BY-SA-4.0. Third-party assets retain their source licenses (recorded per descriptor + in `docs/asset-provenance/`).

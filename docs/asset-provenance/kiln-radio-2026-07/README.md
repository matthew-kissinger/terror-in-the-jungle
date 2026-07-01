# Kiln Radio Viewmodel Provenance

Runtime asset imported on 2026-07-01 through `scripts/import-war-catalog.ts`.

Source review asset:

```text
artifacts/kiln/radio-viewmodel/2026-07-01-bc351ff7/radio-viewmodel.glb
```

Runtime asset:

```text
public/models/props/kiln-radio-2026-07/field-radio-viewmodel.glb
```

Catalog slug:

```text
field-radio-viewmodel
```

Policy:

- Imported with `--merge-existing` so the current generated war catalog was
  preserved and the radio was appended as a single `props` viewmodel asset.
- Provenance source batch is `kiln radio viewmodel 2026-07`, not the older
  repaint source label.
- Full prompt and normalization details live in
  `field-radio-viewmodel.provenance.json`.

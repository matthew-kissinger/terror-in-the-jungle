# settings-key-migration

SettingsManager still persists to the localStorage key
`'pixelart-sandbox-settings'` — a leftover project name. Renaming it naively
would silently reset every returning player's settings. Migrate to a
current-name key with a read-old/write-new shim. (Campaign:
`docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 5.)

## Files touched

- `src/config/SettingsManager.ts`
- sibling test (extended)

## Scope

1. New canonical key (e.g. `'terror-in-the-jungle-settings'`). On load: read
   the new key; if absent, read the old key and migrate (write new, then
   remove old). All writes go to the new key.
2. Behavior test: settings stored under the old key survive the migration
   (values intact under the new key, old key removed); fresh installs use
   only the new key.

## Non-goals

- Settings schema changes.
- Other localStorage keys (audit them in the report if you notice more
  leftovers, don't migrate them here).

## Acceptance

- [ ] Test above passes; migration proven (old-key data → new key, values
      identical).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.

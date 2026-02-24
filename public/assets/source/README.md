# Source Asset Staging

Place new unoptimized/generated art in this folder before running:

- `npm run assets:optimize -- --category screens --force`
- `npm run assets:optimize -- --category icons --force`
- `npm run assets:optimize -- --category textures --force`
- `npm run assets:optimize -- --category soldiers --force`
- `npm run assets:optimize -- --category vegetation --force`

Expected subfolders:

- `soldiers/`
- `textures/`
- `vegetation/`
- `ui/icons/`
- `ui/screens/`

Runtime only reads optimized files from `public/assets/`.

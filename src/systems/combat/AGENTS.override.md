# Combat Override

- Preserve hot-path discipline. Avoid per-tick allocations, broad scans, or new object churn in update loops.
- Keep tests behavioral. Do not assert on state labels, tuning constants, or private helper names.
- If combat behavior or doctrine changes, update `docs/COMBAT.md` or the relevant task/backlog note when the external behavior changes materially.
- Changes that affect pacing, suppression, or AI response still need human playtest coverage even if automated checks pass.

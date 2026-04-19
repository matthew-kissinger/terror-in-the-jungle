# Vehicle Override

- Vehicle and flight changes are game-feel changes first. Do not treat green tests as sufficient sign-off.
- Run `scripts/fixed-wing-runtime-probe.ts` when touching fixed-wing control, adapters, airfields, or browser driving hooks.
- Prefer extending existing adapters and intents over adding one-off control paths for a single vehicle.
- Keep aircraft-specific tuning localized; do not leak new vehicle behavior into shared interfaces unless explicitly approved.

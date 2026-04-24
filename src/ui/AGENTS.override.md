# UI Override

- Preserve both desktop and mobile paths. UI changes should consider touch, phone viewport, and HUD overlap together.
- Prefer existing UI primitives and layout systems over one-off DOM wiring.
- UI renders gameplay/presentation facts; it must not become a second owner for actor mode, vehicle session, or input context.
- When changing HUD, controls, or screens, run the relevant UI gate (`check:hud`, `check:mobile-ui`, or a targeted playtest) before calling the change done.
- Keep copy and labels consistent with the existing military/game style; avoid placeholder text in shipped UI.

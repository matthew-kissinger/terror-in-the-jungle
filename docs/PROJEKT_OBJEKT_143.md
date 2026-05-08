# PROJEKT OBJEKT-143

**State Bureau Operating Codex**
Issued by the Politburo of Engineering, Skywire Sector
Codex revision: 1.3 — 2026-05-08
Project of record: `terror-in-the-jungle` — 3D combined-arms FPS/RTS open-world war simulation, Vietnam theater (late 1960s), browser-delivered

---

## Preamble

The State has commissioned `terror-in-the-jungle` — a 3D combined-arms FPS/RTS open-world war simulation of the Vietnam theater, late 1960s — to be carried from its current stabilization posture into a living combined-arms operational simulation: continuously deployed to production, evidence-complete in every claim, defensible against the Politburo's review at any moment. The simulation operates at two registers simultaneously — first-person infantryman or pilot at one register, squad and air-support commander at the other — across an open map measured in kilometers, in jungle and rice paddy and forward-strip airfield, with helicopters at low altitude over the river and A-1 Skyraiders coming in for the napalm pass. The bureau operates under the State's standing engineering doctrine: evidence before opinion, measurement before decision, the repository is truth. The codex is the bureau's operating manual. The repository is the bureau's reality. Documents that no longer match the repository are stale and shall be reissued or archived.

This document supersedes the experimental Phase 2 / Phase 3 records of Projekt Objekt-143, preserved unaltered in `docs/archive/PROJEKT_OBJEKT_143_LEGACY.md` for evidence-chain continuity. Their substance is folded forward into the active directives and strategic reserve below.

The Politburo is the human at the controls. Bureau personnel — including any Glavnyy Inzhener engaged via automated assistance — operate under the Politburo's direction. Bureau personnel do not expand scope without authorization. Bureau personnel do not declare a directive complete without an artifact path proving it.

---

## Article I — Operating Doctrine

The five standing principles, binding on every bureau:

1. **Evidence before opinion.** No finding is recorded until the artifact path can reproduce it. No fix is claimed until the validation path proves it.
2. **Measurement before decision.** Performance, behavior, and visual claims require captured telemetry. Trust the measurement chain or fix it before trusting its output.
3. **Repository is truth.** When the codex and the repository disagree, the repository is correct. Reissue the codex.
4. **Stabilize before expand.** A bureau may not open new runtime scope while its existing directives carry unresolved evidence gaps that block release.
5. **Small, reviewable change.** Pull requests are bounded (≤500 lines preferred; ≤20 lines per cross-fence accessor change strict). Fenced interfaces (see `src/types/SystemInterfaces.ts`) require `[interface-change]` titling and Politburo approval.

---

## Article II — Bureau Organization

### Standing Bureau

**KB-METRIK — Bureau of Measurement.** Foundational. Certifies the trustworthiness of all telemetry and validation paths. No bureau may declare completion without KB-METRIK signoff that the chain backing the claim is itself trustworthy. Owns: `validate:fast`, `validate:full`, `perf:capture:*`, `perf:compare`, `check:projekt-143-*`, `artifacts/perf/`, perf baselines, and the four-layer test contract (L1 pure / L2 single-system / L3 small scenario / L4 full engine).

### Active Bureaus

**KB-DIZAYN — Design Bureau.** Charter: hold the State's vision for what the simulation must look like, feel like, and play like. Owns the aesthetic direction, the art-direction enforcement, the gameplay-feel arbitration, and the "does it look right" gate. KB-DIZAYN is granted *liberty of proposal*: it may propose scope changes, vision shifts, and gameplay-feel directives that other bureaus must consider. Bureaus may reject KB-DIZAYN proposals only with documented engineering rationale; the Politburo arbitrates disputes. Theater of record: Vietnam, late 1960s. Aesthetic register: stencilled radio orders, tracer arcs, monsoon overcast, the sound of a Huey at low altitude.

**KB-VODA — Water Bureau.** Charter: deliver living water to the simulation. Three-tier scope:
- *Tier I — Surface and queries.* Visible water plane wired to existing hydrology data, lit by the atmosphere system, with gameplay query API (`isUnderwater`, `getWaterDepth`, `getWaterSurfaceY`).
- *Tier II — Flow and buoyancy.* Flowing rivers from hydrology channels, buoyancy physics for floating bodies, player swimming (animation, stamina, breath, surfacing), foot-splash and wading visuals.
- *Tier III — Watercraft and integration.* Sampan and PBR (river patrol boat) rigging — GLBs already exist in `public/models/vehicles/watercraft/`. River crossings, bridge interactions, beach/bank docking. Optionally: integration with real-world hydrological data.

Owns: `WaterSystem`, `HydrologySystem`, water shaders, watercraft adapters, water-query APIs.

**KB-VEKHIKL — Ground Vehicle Bureau.** Charter: deliver controllable ground-vehicle and stationary-weapon experiences. Air rigs are excluded (see KB-AVIATSIYA). Scope: M151 jeep first (GLB exists), then M35 truck, M113 APC, M48 Patton, PT-76. Stationary weapons: M2 .50 cal emplacements with NPC manning, mountable by player. Enter/exit through the `VehicleSessionController` pattern.

Owns: `src/systems/vehicle/` ground-related code, ground vehicle adapters, ground-vehicle UI, NPC vehicle missions for ground assets.

**KB-AVIATSIYA — Aviation Bureau.** Charter: own all rotary and fixed-wing air rigs end-to-end — structural correctness, parity, weapons, maneuvers, combat behavior, and combat feel. Air superiority and air-to-ground support are the two operational axes. Roster of record: UH-1 Huey transport, UH-1C Huey gunship, AH-1 Cobra (asset on hand, not yet imported), A-1 Skyraider, AC-47 Spooky, F-4 Phantom. Reserve roster: OV-10 Bronco, CH-47 Chinook, OH-6 Cayuse, MiG-17 Fresco (Pixel Forge assets generated, not yet imported).

Owns: `src/systems/helicopter/`, `src/systems/vehicle/` aircraft-related code, fixed-wing physics, helicopter physics, aircraft adapters, weapon systems on aircraft, AC-47 orbit logic, NPC pilot AI, air-support call-in fulfillment.

**KB-SVYAZ — Communications & Command Bureau.** Charter: deliver the radio and command surface that turns single-actor combat into combined-arms warfare. Two operational surfaces: (a) squad command — pings, RTS-style direct orders, "go here" / "patrol" / "attack here" / "cancel and return to neutral", squads engaging while in transit, formation discipline; (b) air-support call-in — radio menu, target designation, asset selection from KB-AVIATSIYA roster (A-1 napalm runs, F-4 bomb drops, AC-47 Spooky orbit, Cobra rocket runs, Huey gunship strafes), cooldowns, comm chatter, smoke-marking. Vietnam-true: forward observer language, callsign discipline, strike clearance prose.

Owns: squad-command UI, radio call-in UI, ping/marker system, comm chatter audio, air-support coordinator logic. Integrates with KB-AVIATSIYA (which owns the asset that flies the strike) and KB-UX (which owns the menu surfaces).

**KB-UX — User Experience Bureau.** Charter: make the player-facing surfaces clear, fast, and usable on both PC and mobile. Standing concern of the Politburo: the deploy / spawn / respawn flow on PC and mobile is currently confusing and visually unworthy. Loadout selection is unclear. Map spawn/respawn UX requires complete rework. The HUD is functional but not yet defended on a readability basis. KB-UX is the bureau permitted to invoke KB-DIZAYN's liberty of proposal directly for player-facing surfaces.

Owns: `src/ui/`, deploy flow, respawn screens, map UI, loadout UI, mobile-specific layouts, touch controls UI, accessibility.

**KB-STABILIZAT — Stabilization Bureau.** Charter: bring the current local stack to a verified live release. Inherits from the experimental Phase 3 closeout reframe (2026-05-07). Active directives: refresh combat120 perf baseline on a quiet machine; run `validate:full` clean; deploy `master` to Cloudflare Pages; run `check:projekt-143-live-release-proof` and `check:projekt-143-completion-audit`; record the live release SHA. The bureau retires once the live release is signed and stabilization transitions to ongoing-operations.

**KB-DEFEKT — Bureau of Defects, Regression, and Drift.** Charter: defend production correctness. Owns the bug board, regression watch, and drift detection — including stale baselines, divergent doc/code, quietly broken validation paths, and any bureau's evidence chain that has gone cold. KB-DEFEKT is the only bureau permitted to escalate a regression that blocks another bureau's directive without inter-bureau review.

**KB-ARKHIV — Bureau of Archive and Pruning.** Charter: keep the codex compact and the document graph relevant. Owns this codex, `docs/BACKLOG.md`, the supporting `PROJEKT_OBJEKT_143_*` docs (audited periodically for retirement), `docs/archive/`. KB-ARKHIV does not write new policy; it consolidates, prunes, and reissues.

### Reserve Bureaus (catalogued, not currently opened)

Findings preserved in Article IV. May be revived only by the Politburo.

- **KB-LOAD** — Asset loading and Pixel Forge cutover.
- **KB-TERRAIN** — Terrain quality, A Shau routing, navmesh.
- **KB-CULL** — Culling and HLOD, building/prop residency.
- **KB-OPTIK** — Optics, lighting, atmosphere.
- **KB-EFFECTS** — Particle effects and post-processing.
- **KB-STRATEGIE** — Platform utilization (WebGL / WebGPU / WASM / SharedArrayBuffer).

---

## Article III — Active Directive Board

Each directive carries: identifier, owner bureau, status, success criteria, evidence path.

### KB-DIZAYN

**DIZAYN-1 — Vision charter for Vietnam combined-arms.**
*Status:* evidence-complete for the charter memo. `docs/dizayn/vision-charter.md` now defines the visual and feel target for water, air combat, squad command, and deploy / spawn / respawn flow. The audit packet at `artifacts/perf/2026-05-07T17-49-40.255Z/projekt-143-dizayn-vision-charter-audit/vision-charter-audit.json` records `6/6` required charter surfaces present.
*Success criteria:* memo at `docs/dizayn/vision-charter.md` describing the State's vision for: (a) what good water looks like (calm rivers, monsoon turbulence, wading, swimming), (b) what air combat should feel like (gunship orbit, napalm runs, rocket strafes, dive-bomb attacks), (c) what RTS-flavored squad command should look like (Vietnam-era radio prose, smoke marking, callsign discipline), (d) what the deploy / spawn / respawn flow should feel like (fast, clear, theater-immersive on PC and mobile).
*Latest evidence path:* `artifacts/perf/2026-05-07T17-49-40.255Z/projekt-143-dizayn-vision-charter-audit/vision-charter-audit.json`.

**DIZAYN-2 — Art-direction enforcement.**
*Status:* evidence-complete for the invocable gate procedure. `docs/dizayn/art-direction-gate.md` now defines the KB-DIZAYN "looks right" review gate, required inputs, evidence-trust labels, review method, decision vocabulary, and non-claims. The audit packet at `artifacts/perf/2026-05-07T17-55-41.245Z/projekt-143-dizayn-art-direction-gate-audit/art-direction-gate-audit.json` records `6/6` required gate surfaces present.
*Success criteria:* a "looks right" gate that bureaus can invoke before declaring a directive complete. KB-DIZAYN reviews evidence captures and either signs or returns with notes.
*Latest evidence path:* `artifacts/perf/2026-05-07T17-55-41.245Z/projekt-143-dizayn-art-direction-gate-audit/art-direction-gate-audit.json`.

**DIZAYN-3 — Liberty of proposal.**
*Status:* standing.
*Success criteria:* KB-DIZAYN may propose scope changes that affect any active directive. Other bureaus must respond within their working session — accept, accept with constraints, or reject with engineering rationale. Disputes escalate to the Politburo.

### KB-VODA

**VODA-1 — Tier I: Visible Water Surface and Query API.**
*Status:* evidence-in-progress. The refreshed water-system audit at
`artifacts/perf/2026-05-07T21-57-51-480Z/projekt-143-water-system-audit/water-system-audit.json`
records the current provisional contract: `WaterSystem` still owns the global
Open Frontier water fallback, hydrology channel strips are wired from the
durable cache, A Shau suppresses the global plane, the hydrology river mesh uses
the `natural_channel_gradient` material profile, and the public
`getWaterSurfaceY` / `getWaterDepth` query API is present with focused
regression coverage. The runtime proof at
`artifacts/perf/2026-05-07T21-55-25-154Z/projekt-143-water-runtime-proof/water-runtime-proof.json`
passes in headed browser execution for Open Frontier and A Shau with zero
browser errors, screenshot artifacts, `12` hydrology channels in each mode,
`592` Open Frontier segments, `552` A Shau segments, and live query probes for
hydrology surface height, one-meter depth, and underwater classification. VODA-1
now also has refreshed all-mode atmosphere evidence at
`artifacts/perf/2026-05-07T22-13-21-685Z/projekt-143-voda-atmosphere-evidence/summary.json`:
`npm run evidence:atmosphere` rebuilt the perf bundle and captured `15`
screenshots across A Shau, Open Frontier, TDM, Zone Control, and combat120 with
zero browser errors; A Shau and Open Frontier hydrology river visuals remain
present at `552` and `592` segments respectively. The explicit terrain-water
visual review at
`artifacts/perf/2026-05-07T22-17-52-232Z/projekt-143-terrain-visual-review/visual-review.json`
is WARN: it captured `14/14` screenshots with zero browser/page errors and
passes A Shau river review, but `terrain_water_exposure_review` still warns on
Open Frontier airfield and river shots with luma means `229.37` to `236.60` and
overexposed ratios `0.6786` to `0.8286`. The follow-up source-only exposure
audit at
`artifacts/perf/2026-05-08T01-15-33-373Z/projekt-143-voda-exposure-source-audit/summary.json`
records WARN classification
`voda_exposure_warning_review_composition_before_water_material_tuning`
without launching browser or perf capture on the resource-contended machine:
`4` Open Frontier exposure-risk shots, `0` risk shots with global water visible,
and `4` risk shots with hydrology river surfaces visible. The same packet binds
the hydrology material to opacity `0.55` and dark source luma values `50.81`,
`68.08`, and `36.13`, while the warned sightlines carry middle/bottom neutral
overexposure ratios from `0.8681` to `0.9454`. The next VODA-1 visual work is
therefore Open Frontier camera review angles, sky exposure, pale
airfield/foundation materials, and terrain-water sightline composition before
any global water shader or hydrology material tuning. VODA-1 remains open
because final water art, perf, Open Frontier exposure correction, human visual
acceptance, and consumer adoption of the public water queries are not complete.
*Success criteria:* (a) `WaterSystem` renders a visible water surface across Open Frontier and A Shau, lit by `AtmosphereSystem`, with no clipping artifacts at terrain intersections; (b) hydrology channels drive water-surface placement; (c) public query API `isUnderwater(pos)`, `getWaterDepth(pos)`, `getWaterSurfaceY(pos)`; (d) `evidence:atmosphere` regenerates with water visible and no browser errors; (e) `terrain_water_exposure_review` overexposure flags resolved.
*Evidence path:* `artifacts/perf/2026-05-07T21-57-51-480Z/projekt-143-water-system-audit/`;
`artifacts/perf/2026-05-07T21-55-25-154Z/projekt-143-water-runtime-proof/`;
`artifacts/perf/2026-05-07T22-13-21-685Z/projekt-143-voda-atmosphere-evidence/`;
`artifacts/perf/2026-05-07T22-17-52-232Z/projekt-143-terrain-visual-review/`;
`artifacts/perf/2026-05-08T01-15-33-373Z/projekt-143-voda-exposure-source-audit/`.

**VODA-2 — Tier II: Flow, Buoyancy, Swimming.** *Status:* not opened. Awaits VODA-1.
**VODA-3 — Tier III: Watercraft and Integration.** *Status:* not opened. Awaits VODA-2.

### KB-VEKHIKL

**VEKHIKL-1 — Ground vehicle runtime: M151 jeep.**
*Status:* not opened. GLB at `public/models/vehicles/ground/m151-jeep.glb`.
*Success criteria:* (a) M151 spawnable in Open Frontier; (b) player can enter/exit via `VehicleSessionController`; (c) basic driving (forward/back/turn) over terrain; (d) collision with terrain and static obstacles.

**VEKHIKL-2 — Stationary M2 .50 cal emplacements.** *Status:* not opened.

### KB-AVIATSIYA

**AVIATSIYA-1 — Helicopter rotor visual parity.**
*Status:* **closed 2026-05-08** by Politburo direction with in-production review. Source / asset / runtime evidence is complete; the rotor-axis correction ships in the live deploy at SHA `06a404b`. The Politburo accepts in-production visual review as the human-decision channel — no separate signoff packet is required. Successor regressions are tracked under DEFEKT-5 if rotor appearance regresses on a future build. The 2026-05-08 rotor directionality pass corrected the AH-1 Cobra tail-rotor import from source `x` to runtime `z` under an explicit side-mounted tail-rotor contract, while Huey and UH-1C Gunship remain source/public `z`. The aircraft import packet at `artifacts/perf/2026-05-08T01-23-12-400Z/pixel-forge-aircraft-import/summary.json` records Cobra `sourceAxis=x`, `importedAxis=z`, `bytesAffected=48`, and reason `TIJ side-mounted tail-rotor contract requires z`; Huey and UH-1C Gunship record preserved `z` and `bytesAffected=0`. The visual-integrity audit at `artifacts/perf/2026-05-08T01-23-26-506Z/projekt-143-visual-integrity-audit/visual-integrity-audit.json` records PASS for runtime-aligned axes: Huey `z`, UH-1C Gunship `z`, AH-1 Cobra source `x` corrected to public/expected `z`. The latest DEFEKT-5 review packet remains `needs_human_decision` because source and asset evidence cannot certify rotor appearance in the player view. The latest fixed-wing clean gate still records A-1, F-4, and AC-47 scenario PASS with command exit `0` and no port/probe residue after teardown; because the Politburo reported local games and other agents active on the same PC, that packet remains functional browser evidence only and rejects frame-time, wall-time, baseline-refresh, and optimization claims.
*Evidence paths:* `artifacts/perf/2026-05-08T01-23-12-400Z/pixel-forge-aircraft-import/summary.json`; `artifacts/perf/2026-05-08T01-23-26-506Z/projekt-143-visual-integrity-audit/visual-integrity-audit.json`; `artifacts/perf/2026-05-08T01-23-33-556Z/projekt-143-defekt5-human-review/review-summary.json`; `artifacts/perf/2026-05-08T00-11-04-505Z/projekt-143-aviatsiya-aircraft-readiness/summary.json`; `artifacts/perf/2026-05-08T00-56-34-511Z/projekt-143-fixed-wing-clean-gate/summary.json`.

**AVIATSIYA-2 — AC-47 low-pitch takeoff single-bounce.**
*Status:* carryover, three cycles. Anchored at `Airframe` ground rolling model.

**AVIATSIYA-3 — Helicopter parity audit.**
*Status:* evidence-complete for the parity audit memo. `docs/rearch/helicopter-parity-audit.md` now audits `HelicopterVehicleAdapter` against `HelicopterPlayerAdapter`, `VehicleSessionController`, and the fixed-wing player/session pattern. The audit packet at `artifacts/perf/2026-05-07T18-11-27.481Z/projekt-143-aviatsiya-helicopter-parity-audit/helicopter-parity-audit.json` records `6/6` required audit surfaces present.
*Success criteria:* memo at `docs/rearch/helicopter-parity-audit.md` with state-authority gaps and recommended consolidation.
*Latest evidence path:* `artifacts/perf/2026-05-07T18-11-27.481Z/projekt-143-aviatsiya-helicopter-parity-audit/helicopter-parity-audit.json`.

**AVIATSIYA-4 — Helicopter combat surfaces.**
*Status:* opened, no implementation.
*Scope:* (a) door-gunner controls and reload behavior on Huey; (b) chin minigun on UH-1C Gunship and AH-1 Cobra; (c) rocket-pod fire on stub-wing pylons (Gunship, Cobra); (d) authentic recoil, tracer behavior, ammo loadout.

**AVIATSIYA-5 — Fixed-wing combat surfaces.**
*Status:* opened, no implementation.
*Scope:* (a) A-1 Skyraider ordnance: bombs, rockets, napalm canisters, 20mm cannon; (b) F-4 Phantom: missiles (sidewinder), bombs; (c) AC-47 Spooky: side-firing minigun pattern (already wired in flight), authentic gun-camera feedback; (d) target lead, weapon sway, station-keeping during attack runs.

**AVIATSIYA-6 — Combat maneuvers.**
*Status:* opened, no implementation.
*Scope:* (a) AC-47 Spooky pylon-turn / left-circle gunship orbit (partial implementation exists); (b) A-1 dive-bomb attack profile; (c) F-4 strafing run; (d) Cobra rocket-run; (e) Huey gunship rocket strafe; (f) maneuver presets accessible to NPC pilots and assist-flying player. Live with KB-DIZAYN art-direction signoff.

**AVIATSIYA-7 — AH-1 Cobra import + integration.**
*Status:* not opened. GLB at `pixel-forge/war-assets/vehicles/aircraft/ah1-cobra.glb`.

### KB-SVYAZ

**SVYAZ-1 — Squad command "cancel / return to neutral".**
*Status:* **closed 2026-05-08** with live deploy parity at SHA `babae19a76e5ff622976a632e10f7055315d2698`. The neutral-command source/test audit at
`artifacts/perf/2026-05-07T18-45-48-457Z/projekt-143-svyaz-neutral-command-audit/neutral-command-audit.json`
records `15` pass, `0` warn, and `0` fail checks across the command source and
tests. The browser proof at
`artifacts/perf/2026-05-07T18-59-28-353Z/projekt-143-svyaz-standdown-browser-proof/standdown-browser-proof.json`
records the live command overlay exposing `STAND DOWN`, no longer exposing
`FREE ROAM`, converting a directed `hold_position` squad to `free_roam`,
clearing the prior command position, and preserving the selected `wedge`
formation. Escape/backdrop cancel remains modal close by policy; slot 5 is the
explicit squad stand-down order. Source landed in PR #159 (combat-ai-squad-and-core-engine) under cycle-2026-05-08-stabilizat-2-closeout.
*Success criteria:* squad command UI exposes a "stand down" / "return to neutral" command; squads issued this command return to default behavior tree without losing their squad formation.
*Latest evidence paths:* `artifacts/perf/2026-05-07T18-45-48-457Z/projekt-143-svyaz-neutral-command-audit/neutral-command-audit.json`; `artifacts/perf/2026-05-07T18-59-28-353Z/projekt-143-svyaz-standdown-browser-proof/standdown-browser-proof.json`.

**SVYAZ-2 — Squad pings: go here, patrol, attack here.**
*Status:* **closed 2026-05-08** with live deploy parity at SHA `babae19a76e5ff622976a632e10f7055315d2698`. Source landed in PR #159 (combat-ai-squad-and-core-engine). The refreshed source/test audit at
`artifacts/perf/2026-05-07T21-42-23-342Z/projekt-143-svyaz-ping-command-audit/ping-command-audit.json`
records `18` pass, `0` warn, and `0` fail checks and consumes the browser proof
at
`artifacts/perf/2026-05-07T21-41-01-140Z/projekt-143-svyaz-ping-command-browser-proof/ping-command-browser-proof.json`.
Existing Hold, Patrol, Attack, and internal Retreat ground orders are present,
player-facing fall-back language reads `FALL BACK`, tactical-map placement
dispatch is tested, minimap command-position markers exist, the
terrain-height-aware `SquadCommandWorldMarker` scene path is source/test
proven, patrol-state units can still detect and engage after movement commands
are applied, and source comments document current movement-versus-combat
priority. The browser proof records `11` pass, `0` warn, and `0` fail checks
with zero browser errors, a live `attack_here` command position, a visible
in-world command marker, tactical-map command-marker pixels, and screenshots
beside the proof JSON. This closes SVYAZ-2 only; it does not accept mobile
command ergonomics, live deployment parity, or SVYAZ-3 air-support radio.
*Success criteria:* (a) ping markers visible on map and in-world; (b) "go here" / "patrol radius" / "attack here" / "fall back" commands available; (c) squads engage targets while traveling to / patrolling at a ping; (d) priority rules between defensive engagement and movement orders documented.
*Latest evidence paths:* `artifacts/perf/2026-05-07T21-42-23-342Z/projekt-143-svyaz-ping-command-audit/ping-command-audit.json`; `artifacts/perf/2026-05-07T21-41-01-140Z/projekt-143-svyaz-ping-command-browser-proof/ping-command-browser-proof.json`.

**SVYAZ-3 — Air-support call-in radio.**
*Status:* opened. Politburo direction: this is a major new operational surface.
*Success criteria:* (a) radio menu accessible from squad UI or hotkey; (b) target marking — smoke, willie pete, or position-only; (c) asset selection from KB-AVIATSIYA roster (A-1 napalm, A-1 rockets, F-4 bombs, AC-47 Spooky orbit, Cobra rocket run, Huey gunship strafe); (d) cooldown system per asset class; (e) authentic radio prose ("Crackerbox, Reaper one-six, fire mission, over"); (f) NPC-piloted aircraft fulfillment via KB-AVIATSIYA.

**SVYAZ-4 — RTS-flavored command discipline.**
*Status:* not opened. Awaits SVYAZ-1, 2, 3.
*Success criteria:* the simulation reads as a hybrid FPS/RTS — the player commands a squad and a fire-support net while embedded as an infantryman or pilot.

### KB-UX

**UX-1 — Respawn screen redesign (PC + mobile).**
*Status:* **closed 2026-05-08** with live production parity. Source landed in PR #158 (ux-1-respawn-deploy-flow) under cycle-2026-05-08-stabilizat-2-closeout; live deploy SHA `babae19a76e5ff622976a632e10f7055315d2698` available at `https://terror-in-the-jungle.pages.dev`. KB-DIZAYN signed local visual packet now paired with live production deploy. UX-2/3/4 remain open. The refreshed
source/test audit at
`artifacts/perf/2026-05-07T20-30-26-829Z/projekt-143-ux-respawn-audit/ux-respawn-audit.json`
records `15` pass, `0` warn, and `0` fail checks with `acceptanceReady=true`.
The current production-build browser proof at
`artifacts/perf/2026-05-07T20-35-21-453Z/projekt-143-ux-respawn-browser-proof/ux-respawn-browser-proof.json`
records `8` pass, `0` warn, and `0` fail checks across desktop and mobile
Chromium with zero browser errors after a fresh `npm run build`. It verifies
the current `dist/` Zone Control deploy surface, visible alliance, selected
spawn state, decision timing, and `48px` mobile spawn target; this production
proof exposes the live single home-base spawn case only. Current contract:
`DeployScreen` owns `#respawn-ui`, exposes alliance in the decision header,
renders grouped textual spawn options outside the canvas, records
death-to-decision timing, and keeps mobile deploy controls actionable while
`#respawn-side-scroll` remains the mobile scroll owner. `SpawnPointSelector`
can produce home-base,
controlled-zone, helipad, and direct-insertion spawn points; the respawn map
labels spawn classes with kind-specific anchors and leader lines; tests cover
loadout metadata, grouped spawn choices, helipad fallback, direct insertion,
and deploy-button readiness. The multi-spawn source-served browser proof at
`artifacts/perf/2026-05-07T20-27-26-789Z/projekt-143-ux-respawn-multispawn-proof/ux-respawn-multispawn-proof.json`
records `10` pass, `0` warn, and `0` fail checks, shows home-base,
controlled-zone, helipad, and direct-insertion choices on both desktop and
mobile, records `0` browser errors, and captures desktop/mobile map and
spawn-option screenshots. The broad mobile gate `npm run check:mobile-ui`
completed at
`artifacts/mobile-ui/2026-05-07T19-46-27-777Z/mobile-ui-check` with `72`
actionability/scroll checks, `3` policy skips, and zero page, request, or
console errors. The first KB-DIZAYN gate packet at
`artifacts/perf/2026-05-07T20-07-49-954Z/projekt-143-ux-respawn-dizayn-gate/ux-respawn-dizayn-gate.json`
returned the visual claim with notes; the signed follow-up gate at
`artifacts/perf/2026-05-07T20-28-48-561Z/projekt-143-ux-respawn-dizayn-gate/ux-respawn-dizayn-gate.json`
accepts the local visual packet for spawn-class coverage, mobile map-label
readability, and responsive header metadata. UX-1 remains open until this
local packet is paired with live production parity or the Politburo explicitly
defers live UX-1 proof to STABILIZAT; this does not close UX-2, UX-3, or UX-4.
*Success criteria:* (a) respawn screen presents alliance, available zones, available helipads, available insertion points clearly; (b) PC and mobile have parity in information density (different layouts permitted); (c) art-direction signoff from KB-DIZAYN; (d) the time from death to respawn-decision is fast.
*Latest evidence paths:* `artifacts/perf/2026-05-07T20-30-26-829Z/projekt-143-ux-respawn-audit/ux-respawn-audit.json`; `artifacts/perf/2026-05-07T20-35-21-453Z/projekt-143-ux-respawn-browser-proof/ux-respawn-browser-proof.json`; `artifacts/perf/2026-05-07T20-27-26-789Z/projekt-143-ux-respawn-multispawn-proof/ux-respawn-multispawn-proof.json`; `artifacts/perf/2026-05-07T20-28-48-561Z/projekt-143-ux-respawn-dizayn-gate/ux-respawn-dizayn-gate.json`.

**UX-2 — Map spawn / respawn flow.**
*Status:* opened.
*Success criteria:* (a) map view shows spawn options unambiguously; (b) tap-to-spawn or click-to-spawn works; (c) zone / helipad / insertion priority is visible; (d) mobile touch interactions are large enough to hit accurately.

**UX-3 — Loadout selection.**
*Status:* opened.
*Success criteria:* (a) loadout categories clear (rifleman, RTO, machine gunner, etc.); (b) weapons and ammo loads visible; (c) per-faction loadout availability respected; (d) PC and mobile parity.

**UX-4 — Deploy flow polish.**
*Status:* opened.
*Success criteria:* deploy session from menu through first frame of gameplay is fast, clear, and feels intentional.

### KB-STABILIZAT

**STABILIZAT-1 — Refresh combat120 perf baseline.**
*Status:* **deferred to Strategic Reserve 2026-05-08** by Politburo direction during cycle-2026-05-08-stabilizat-2-closeout. Combat120 `perf:compare` reports max-frame `100ms` FAIL and avg `16.19ms` WARN against the 2026-04-20 baseline. Baseline refresh requires a quiet machine (current local condition records active games and other agents on the same PC per progress.md) and remains human-gated. Anchor remains DEFEKT-3 synchronous cover search in `AIStateEngage.initiateSquadSuppression()`. Resume when machine resource contention clears AND DEFEKT-3 has a runtime fix or a Politburo-approved baseline refresh.
*Earlier evidence:* Latest compare-selected capture is `artifacts/perf/2026-05-07T17-28-02-506Z`: status `ok`, validation `warn`, measurement trust `warn`, avg `16.19ms`, peak p99 `34.20ms`, max-frame `100.00ms`, heap end-growth `6.51MB`, heap recovery `86.2%`. `perf:compare -- --scenario combat120` selects this sparse render-submission capture and fails with `6 pass, 1 warn, 1 fail`: avg WARN and max-frame FAIL. Latest accepted measurement-PASS owner packet remains `artifacts/perf/2026-05-07T16-23-11-889Z/projekt-143-render-submission-category-attribution/render-submission-category-attribution.json`; baseline refresh remains unauthorized.
*Current packet:* accepted owner packet `artifacts/perf/2026-05-07T16-23-11-889Z/projekt-143-render-submission-category-attribution/render-submission-category-attribution.json` remains the measurement-PASS render-owner packet. The sparse-owner acceptance audit `artifacts/perf/2026-05-07T22-29-58-460Z/projekt-143-sparse-owner-acceptance-audit/sparse-owner-acceptance-audit.json` records PASS, `8/8` criteria passing, classification `sparse_owner_review_accepted`, and acceptance `owner_review_only` for the post-tag packet at `artifacts/perf/2026-05-07T17-28-02-506Z`. Paired KB-METRIK sidecar `artifacts/perf/2026-05-07T17-28-02-506Z/projekt-143-measurement-path-inspection/measurement-path-inspection.json` records raw probe p95 `30ms`, p50 `21ms`, avg `28.93ms`, max `348ms`, `3/87` probes over `75ms`, and `3505993` render-submission bytes, so sparse drain avoids the per-sample overhead class. The owner-split audit `artifacts/perf/2026-05-07T22-49-28-445Z/projekt-143-defekt-render-owner-split-audit/render-owner-split-audit.json` records WARN, `post_tag_renderer_owner_split_divergent`, and `owner_review_only`: post-tag top draw is `npc_ground_markers` at `0.3232`, post-tag top triangles are terrain at `0.7174`, `npc_close_glb` draw submissions move `36->14`, and renderer reconciliation stays partial at draw `0.4583` / triangles `0.7276`. The terrain contribution audit `artifacts/perf/2026-05-07T22-56-02-642Z/projekt-143-defekt-terrain-contribution-audit/terrain-contribution-audit.json` records WARN, `terrain_triangle_axis_source_bound_timing_unisolated`, and `owner_review_only`: terrain is `2` draw submissions at `0.0202` draw share, `163840` submitted triangles at `0.7174` triangle share, `80` submitted instances, `2048` triangles per terrain instance, and `0.5219` of peak renderer triangles; source anchors bind this to the CDLOD InstancedMesh, selected-tile instance updates, default `33` vertex tile resolution, and device-adaptive shadow capability. The pass-metadata audit `artifacts/perf/2026-05-07T23-08-28-327Z/projekt-143-defekt-render-pass-metadata-audit/pass-metadata-audit.json` records WARN, `render_pass_metadata_bound_timing_unisolated`, and `owner_review_only` from capture `artifacts/perf/2026-05-07T23-05-54-437Z`: capture status `ok`, validation `warn`, measurement trust `warn`, exact peak frame `3035`, frame pass types `main:124, shadow:1`, terrain pass types `main:2, shadow:1`, terrain `3` draw submissions, terrain triangle share `0.7095`, top draw `npc_close_glb`, top triangles `terrain`, and renderer reconciliation draw `0.7022` / triangles `0.9987`. This accepts pass labeling and the terrain shadow contribution for owner review only; it does not prove a runtime fix, isolate per-pass timing, authorize terrain LOD/shadow quality changes, supersede the measurement-PASS reference for regression comparison, certify feel, or authorize baseline refresh.
*Success criteria:* `npm run perf:capture:combat120` from a quiet machine produces avg ≤17ms, p99 ≤35ms, heap_recovery ≥0.5, heap_end_growth ≤+10MB. Baseline committed to `perf-baselines.json`.
*Latest evidence path:* `artifacts/perf/2026-05-07T23-08-28-327Z/projekt-143-defekt-render-pass-metadata-audit/pass-metadata-audit.json`.

**STABILIZAT-2 — Land vehicle-visuals-and-airfield-polish + helicopter rotor fix.**
*Status:* **closed 2026-05-08** under cycle-2026-05-08-stabilizat-2-closeout. The 143-file working tree was sliced into six themed PRs ([#155](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/155) helicopter, [#156](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/156) water, [#157](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/157) terrain+effects, [#158](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/158) UX respawn, [#159](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/159) combat AI mega-cluster — GOST-TIJ-001 exception documented in PR body, [#160](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/160) docs+scripts). All six rebase-merged with CI green. Master HEAD `babae19a76e5ff622976a632e10f7055315d2698`. Live deploy via `deploy.yml` run [25533692241](https://github.com/matthew-kissinger/terror-in-the-jungle/actions/runs/25533692241) succeeded. Earlier in-flight context preserved below for evidence chain.
*Earlier in-flight context:* implementation complete (2026-05-07), uncommitted. Five gameplay polish fixes plus the helicopter tail-rotor runtime-axis correction path. The latest aircraft import packet corrects AH-1 Cobra from source `x` to runtime `z`, preserves Huey and UH-1C Gunship at `z`, and records the correction under `artifacts/perf/2026-05-08T01-23-12-400Z/pixel-forge-aircraft-import/summary.json`. The latest visual-integrity audit records PASS for the runtime-aligned rotor-axis contract at `artifacts/perf/2026-05-08T01-23-26-506Z/projekt-143-visual-integrity-audit/visual-integrity-audit.json`. Earlier full-stack local evidence recorded 4080/4080 tests pass, `validate:fast` clean, and build clean. The 2026-05-08 aircraft readiness packet adds targeted aircraft validation PASS (`20` files / `322` tests). The latest fixed-wing clean gate records A-1, F-4, and AC-47 PASS for entry, liftoff, climb, approach, bailout, and NPC handoff, plus AC-47 orbit PASS; `npm run probe:fixed-wing -- --boot-attempts=1 --port 4175` exited `0` and left no port/probe residue. The packet is accepted as functional browser evidence only under the current resource-contended PC condition. It does not satisfy human playtest, CI, PR, merge, live deploy, combat120, or perf-baseline criteria.
*Success criteria:* commit + PR + merge to master. CI green. Live playtest of changed surfaces, including AVIATSIYA-1 acceptance.

**STABILIZAT-3 — Live release verification.**
*Status:* **closed 2026-05-08** under cycle-2026-05-08-stabilizat-2-closeout. Live release proof PASS for HEAD `babae19a76e5ff622976a632e10f7055315d2698`: local-head-pushed PASS, ci-success-for-head PASS (after master CI ran post-merge), deploy-success-for-head PASS via `deploy.yml` run [25533692241](https://github.com/matthew-kissinger/terror-in-the-jungle/actions/runs/25533692241), live-manifest-sha PASS (live = head), pages-headers PASS (cache-control + COOP same-origin + COEP credentialless), r2-ashau-dem PASS (21 MB DEM, immutable, CORS *), live-browser-smoke PASS (modeVisible, deployUiVisible, 0 console/page errors). STABILIZAT-1 deferred to Strategic Reserve under Politburo direction (combat120 baseline refresh remains human-gated).
*Earlier context:* gated on STABILIZAT-1 and STABILIZAT-2. The current-codex completion audit is routed through `scripts/projekt-143-current-completion-audit.ts` and records `NOT_COMPLETE` at `artifacts/perf/2026-05-08T01-26-26-320Z/projekt-143-completion-audit/completion-audit.json`: `34` Article III directives parsed, `10` closed, `24` open, `0` deferred, zero missing cited artifacts, latest live release proof stale to SHA `ab0cfd0e9a0f39ebe8b3a87f316b9287edfd3289`, dirty local tree at HEAD `aff1abd4da769e2a04e6e5f9b39d241296a60ada`, DEFEKT local drift proof pass at `artifacts/perf/2026-05-08T01-26-06.909Z/projekt-143-doc-drift/doc-drift.json`, no Politburo seal marker, no 14-day live drift watch, and `29` closeout blockers. The prompt-to-artifact checklist fails Article III completion, live-release verification, Politburo seal, and the 14-day live drift watch; it passes the 30-day ARKHIV strategic-reserve audit.
*Success criteria:* push to `master`, CI green, Cloudflare Pages deploy successful, `check:projekt-143-live-release-proof` pass, `check:projekt-143-completion-audit` pass, live SHA recorded.
*Latest evidence path:* `artifacts/perf/2026-05-08T01-26-26-320Z/projekt-143-completion-audit/completion-audit.json`.

### KB-DEFEKT

**DEFEKT-1 — Stale baseline audit.** *Status:* evidence-in-progress. The local gate `check:projekt-143-stale-baseline-audit` audits `perf-baselines.json` against detected scenario captures under `artifacts/perf/`. Latest packet `artifacts/perf/2026-05-07T22-04-54-994Z/projekt-143-stale-baseline-audit/stale-baseline-audit.json` records WARN status, `4/4` tracked scenarios stale by age, `0` current, `0` refresh-eligible, and `4` blocked: `combat120` blocked by validation WARN / measurement trust WARN / max-frame FAIL, `openfrontier:short` blocked by validation WARN, `ashau:short` blocked by compare FAIL, and `frontier30m` blocked by failed latest detected soak capture. `perf-baselines.json` remains at 2026-04-20. No baseline refresh is authorized.
*Latest evidence path:* `artifacts/perf/2026-05-07T22-04-54-994Z/projekt-143-stale-baseline-audit/stale-baseline-audit.json`.
**DEFEKT-2 — Drift detection between docs and code.** *Status:* **14-day live drift watch active**: T+0 = 2026-05-08 (cycle-2026-05-08-stabilizat-2-closeout deploy at SHA `babae19`); target close at T+14 from that anchor. Local doc/code/artifact drift gate evidence-complete; live deployment drift watch in progress. `check:doc-drift` runs `scripts/projekt-143-doc-drift.ts` against the codex, `docs/STATE_OF_REPO.md`, `docs/PERFORMANCE.md`, concrete `artifacts/perf/` references, and documented `npm run` command references.
*Current packet:* failing packet `artifacts/perf/2026-05-07T17-38-11.026Z/projekt-143-doc-drift/doc-drift.json` found three codex future-date errors and stale historical command references. The codex date claims were reissued to `2026-05-07`, sibling-workspace command references were clarified, and pass packet `artifacts/perf/2026-05-07T17-43-09.007Z/projekt-143-doc-drift/doc-drift.json` records `futureDateFindings: 0`, `missingArtifactRefs: 0`, and `missingPackageScripts: 0`. The completion-audit alias now measures the current Article III / Article VII codex instead of the retired pre-codex board. Refreshed aircraft rotor closeout drift packet `artifacts/perf/2026-05-08T01-26-06.909Z/projekt-143-doc-drift/doc-drift.json` scans the codex, current-state doc, and performance doc with zero future-date, missing-artifact, or missing-script findings after the AVIATSIYA-1 / DEFEKT-5 evidence update. This does not satisfy the Article VII 14-day live drift watch.
*Latest evidence path:* `artifacts/perf/2026-05-08T01-26-06.909Z/projekt-143-doc-drift/doc-drift.json`.
**DEFEKT-3 — Combat AI p99 anchor.** *Status:* active remediation. Latest production-shaped accepted owner-review packet remains the measurement-PASS render submission category-attribution packet at `artifacts/perf/2026-05-07T16-23-11-889Z/projekt-143-render-submission-category-attribution/render-submission-category-attribution.json`. Latest bounded terrain-shadow diagnostic packet is `artifacts/perf/2026-05-07T23-20-53-503Z/projekt-143-defekt-terrain-shadow-diagnostic-audit/terrain-shadow-diagnostic-audit.json`; it removes the terrain shadow submission under diagnostic runtime flag, but timing remains untrusted and worse than control, so DEFEKT-3 stays open.
*Current packet:* source edit added `npc_ground_markers` attribution to the NPC ground-marker instanced ring in `CombatantMeshFactory.ts`, with stable name `PixelForgeNpcGroundMarker.${key}` and `userData.perfCategory`. The sparse rebuilt-bundle capture `artifacts/perf/2026-05-07T17-28-02-506Z` records capture status `ok`, validation `warn`, measurement trust `warn`, `87` runtime samples, `3` render-submission samples, and final frame count `5581`. The sparse-owner audit records `8/8` criteria passing under `sparse_owner_review_only_acceptance_v1`, raw probe p95 `30ms`, over-75 rate `0.0345`, over-150 rate `0.0345`, avg-without-max delta `3.37ms` versus the accepted reference, `3` render-submission samples, `3505993` bytes, exact peak frame, and anchored source lines. The owner-split audit compares the accepted 16:23 reference against the 17:28 post-tag packet: reference top draw is unattributed at `0.3106`, reference top triangles are terrain at `0.6101`, post-tag top draw is `npc_ground_markers` at `0.3232`, post-tag top triangles are terrain at `0.7174`, `npc_close_glb` draw submissions move `36->14`, and renderer reconciliation remains partial at draw `0.4583` / triangles `0.7276`. The terrain contribution audit binds that terrain branch to current source and exact-frame artifact facts: terrain records `2` draw submissions, `0.0202` draw share, `163840` submitted triangles, `0.7174` triangle share, `80` submitted instances, `2048` triangles per terrain instance, and `0.5219` of peak renderer triangles, with source anchors in `CDLODRenderer`, `TerrainRenderRuntime`, `TerrainConfig`, and `GameRenderer`. The pass-metadata capture `artifacts/perf/2026-05-07T23-05-54-437Z` records capture status `ok`, validation `warn`, measurement trust `warn`, `87` runtime samples, and `3` render-submission samples; its category packet records exact peak frame `3035`, frame pass types `main:124, shadow:1`, terrain pass types `main:2, shadow:1`, terrain `3` draw submissions, terrain triangle share `0.7095`, top draw `npc_close_glb`, top triangles `terrain`, and renderer reconciliation draw `0.7022` / triangles `0.9987`. The terrain-shadow diagnostic capture `artifacts/perf/2026-05-07T23-18-42-597Z` records `perfRuntime.terrainShadowsDisabled=true`, exact peak frame `1534`, frame pass types `main:99`, terrain pass types `main:2`, terrain draw submissions `2`, terrain triangle share `0.7168`, top draw `npc_ground_markers`, and top triangles `terrain`; the paired audit records `7/7` checks passing, classification `terrain_shadow_contribution_isolated_timing_still_untrusted`, control avg/p99 `17.57/34.3ms`, shadow-off avg/p99 `20.49/45.3ms`, and max-frame unchanged at `100ms`. The next DEFEKT-3 terrain packet should isolate tile-resolution or terrain material cost rather than disabling shadows as a fix; ground-marker/imposter draw batching and renderer-submission reconciliation remain separate axes. This does not complete DEFEKT-3, prove terrain is the full `renderer.render` stall owner, prove a runtime fix, authorize terrain quality changes, certify combat feel, supersede the measurement-PASS reference for regression comparison, or authorize baseline refresh.
*Latest evidence path:* `artifacts/perf/2026-05-07T23-20-53-503Z/projekt-143-defekt-terrain-shadow-diagnostic-audit/terrain-shadow-diagnostic-audit.json`.
**DEFEKT-4 — NPC navmesh route quality.** *Status:* evidence-in-progress. The new local gate `check:projekt-143-defekt-route-quality` records source and static-route-policy guardrails only. Latest packet `artifacts/perf/2026-05-07T22-42-23-479Z/projekt-143-defekt-route-quality-audit/route-quality-audit.json` classifies the directive as `npc_route_quality_guardrails_present_runtime_acceptance_missing`: `CombatantMovement`, `StuckDetector`, active-driver route telemetry, `perf-capture` stuck gates, and active-driver diagnostic findings are source-anchored, while the paired static terrain-route packet `artifacts/perf/2026-05-07T22-40-26-760Z/projekt-143-terrain-route-audit/terrain-route-audit.json` passes with `3` route-aware modes, `87931.1m` total route length, and `2882` route capsule stamps. This does not close DEFEKT-4 because no current A Shau plus Open Frontier browser packet proves route quality with measurement trust pass, bounded stuck time, route no-progress reset counts, waypoint replan failures, and terrain-stall warning bounds.
*Success criteria:* A Shau and Open Frontier active-driver route-quality captures pass measurement trust, record route/stuck telemetry, and satisfy explicit closure bounds for max stuck seconds, route no-progress resets, waypoint replan failures, path-query status, and terrain-stall warning rate.
*Latest evidence path:* `artifacts/perf/2026-05-07T22-42-23-479Z/projekt-143-defekt-route-quality-audit/route-quality-audit.json`.
**DEFEKT-5 — Visual fallback and directionality audit.** *Status:* **closed 2026-05-08** by Politburo direction with in-production review. Source-bound visual integrity is verified by `check:projekt-143-visual-integrity` PASS; the live deploy at SHA `06a404b` ships the death-clip selection fix, close-radius impostor telemetry, explosion-FX representation tagging, and helicopter runtime-axis alignment. The Politburo accepts in-production visual review as the human-decision channel for death animation, close-NPC LOD feel, explosion appearance, and rotor appearance — no separate signoff packet is required. Future rotor / death / explosion regressions reopen this directive. The local gate `check:projekt-143-visual-integrity` records PASS status and classification `visual_integrity_source_bound_human_review_pending` at `artifacts/perf/2026-05-08T01-23-26-506Z/projekt-143-visual-integrity-audit/visual-integrity-audit.json`. It verifies that dying Pixel Forge NPCs select `death_fall_back`, the shader treats that clip as one-shot, and `CombatantRenderer` no longer applies the legacy procedural billboard death shrink to that Pixel Forge clip. It verifies that the Pixel Forge cutover gate blocks old NPC sprite/source-soldier assets. It verifies close-radius impostor exception telemetry: `CombatantRenderer` exposes fallback records and runtime stats for `perf-isolation`, `pool-loading`, `pool-empty`, and `total-cap`, including counts, distance bounds, pool loads, pool targets, and pool availability. It classifies explosion visuals as the active optimized pooled unlit billboard flash plus point particles and shockwave ring; `EXPLOSION_EFFECT_REPRESENTATION` marks dynamic lights and legacy fallback false. It now verifies helicopter runtime-axis alignment: UH-1 Huey `z`, UH-1C Gunship `z`, and AH-1 Cobra source `x` corrected to public/expected `z` by the import packet at `artifacts/perf/2026-05-08T01-23-12-400Z/pixel-forge-aircraft-import/summary.json`. The 2026-05-08 fixed-wing clean gate adds functional local browser evidence for A-1, F-4, and AC-47, but it does not settle human visual appearance, rotor appearance, close-NPC LOD feel, or performance. The refreshed DEFEKT-5 human review packet at `artifacts/perf/2026-05-08T01-23-33-556Z/projekt-143-defekt5-human-review/review-summary.json` records `needs_human_decision` for death animation, close-NPC LOD feel, explosion appearance, and rotor appearance.
*Success criteria:* (a) Pixel Forge NPC death impostors use the accepted `death_fall_back` atlas without procedural shrink or old sprite fallback; (b) near-impostor exceptions are either accepted as explicit cap behavior with telemetry or remediated; (c) explosion FX representation is classified by KB-DIZAYN/KB-DEFEKT as accepted pooled 2D flash or replaced by the approved optimized FX path; (d) Huey, UH-1C Gunship, and AH-1 Cobra rotor directionality and naming pass human visual review.
*Latest evidence paths:* `artifacts/perf/2026-05-08T01-23-12-400Z/pixel-forge-aircraft-import/summary.json`; `artifacts/perf/2026-05-08T01-23-26-506Z/projekt-143-visual-integrity-audit/visual-integrity-audit.json`; `artifacts/perf/2026-05-08T01-23-33-556Z/projekt-143-defekt5-human-review/review-summary.json`; `artifacts/perf/2026-05-08T00-11-04-505Z/projekt-143-aviatsiya-aircraft-readiness/summary.json`; `artifacts/perf/2026-05-08T00-56-34-511Z/projekt-143-fixed-wing-clean-gate/summary.json`.

### KB-ARKHIV

**ARKHIV-1 — Audit supporting Projekt-143 docs.** *Status:* evidence-complete. `docs/PROJEKT_OBJEKT_143_HANDOFF.md`, `docs/PROJEKT_OBJEKT_143_HYDROLOGY.md`, and `docs/PROJEKT_OBJEKT_143_VEGETATION_SOURCE_PIPELINE.md` are retained as topic-specific references. `docs/archive/PROJEKT_OBJEKT_143_24H_STATUS_2026-05-04.md` is archived as a historical status snapshot superseded by this codex and `docs/STATE_OF_REPO.md`.
*Latest evidence path:* `artifacts/perf/2026-05-07T17-47-15.786Z/projekt-143-arkhiv-supporting-doc-audit/supporting-doc-audit.json`.
**ARKHIV-2 — BACKLOG consolidation.** *Status:* evidence-complete. `docs/BACKLOG.md` is now a compact Strategic Reserve index with active work routed to Article III and historical cycle records routed to `docs/cycles/<cycle-id>/RESULT.md`. The audit packet at `artifacts/perf/2026-05-07T18-01-14.369Z/projekt-143-arkhiv-backlog-consolidation-audit/backlog-consolidation-audit.json` records `133/200` measured lines, `4/4` checks passing, and `11/11` required cycle RESULT records present.
*Latest evidence path:* `artifacts/perf/2026-05-07T18-01-14.369Z/projekt-143-arkhiv-backlog-consolidation-audit/backlog-consolidation-audit.json`.
**ARKHIV-3 — Spike-branch memo audit.** *Status:* evidence-complete for the spike ref/fold audit. `docs/archive/E_TRACK_SPIKE_MEMO_INDEX_2026-05-07.md` records E1-E6 source refs, current SHAs, branch memo paths, folded decisions, and branch-deletion constraints. The audit packet at `artifacts/perf/2026-05-07T18-07-09.771Z/projekt-143-arkhiv-spike-memo-audit/spike-memo-audit.json` records `6/6` spike refs present, `9/9` branch memo paths present, and `6/6` checks passing.
*Success criteria:* E1-E6 spike memos are folded into Article IV / Strategic Reserve routing or archived with source refs, memo paths, and branch-deletion constraints. E2-E6 full memo content remains branch-local until imported, superseded, or externally archived.
*Latest evidence path:* `artifacts/perf/2026-05-07T18-07-09.771Z/projekt-143-arkhiv-spike-memo-audit/spike-memo-audit.json`.

---

## Article IV — Strategic Reserve

Items the bureau acknowledges but has not opened as directives. Held in reserve for future cycles.

### Tracked from prior closeout

- Vegetation closeup polish, ground cover, bamboo/palm clustering, disturbed trail edges (KB-LOAD).
- Pixel Forge building/vehicle replacement, foundation polish, collision/pivot checks (KB-LOAD).
- Broad HLOD, static-cluster policy, vegetation culling, parked-aircraft playtest coverage (KB-CULL).
- Combined-arms skilled-player feel: objective flow, support activity, sustained battlefield life (cross-bureau; informed by KB-SVYAZ delivery).
- WebGPU / OffscreenCanvas worker render / WASM-SIMD / SharedArrayBuffer cross-origin isolation (KB-STRATEGIE; revival requires Politburo decision).

### Tracked from BACKLOG.md "Far Horizon"

- Multiplayer / networking.
- Destructible structures.
- Survival / roguelite mode.
- Campaign system.
- Theater-scale maps (tiled DEM).
- ECS evaluation (deferred — bitECS came in ~0.97x at N=3000).

### Phase F candidates from E-track spikes

- E1: ECS migration deferred. Revisit only with a combatant-shaped hot path
  after combat p99 work if tail pressure remains.
- E2: GPU-driven rendering and WebGPU migration deferred for the rendering
  question. The live NPC path is already instanced; fix concrete capacity
  cliffs in place.
- E3: Utility-AI combat layer remains a future design candidate. Current
  faction tuning should not wait on it.
- E4: Agent/player API remains prototype-more; next valid slice is a minimal
  movement / observation adapter behind an agent-facing surface.
- E5: Deterministic sim remains prototype-more; next valid slice is a
  `SimClock` / `SimRng` pilot and one deterministic combat proof.
- E6: Vehicle physics rebuild remains prototype-more; next valid slice is a
  flagged Skyraider `Airframe` port plus human playtest.

### Asset reserve

- AH-1 Cobra (GLB exists, awaits AVIATSIYA-7).
- OV-10 Bronco, CH-47 Chinook, OH-6 Cayuse, MiG-17 Fresco (Pixel Forge generated, not yet imported; gated on KB-AVIATSIYA capacity).

---

## Article V — Engineering Standards

GOST-TIJ codes are project-internal standard identifiers. Refer to them in PR descriptions when invoking a standard.

| Code | Standard |
|---|---|
| GOST-TIJ-001 | PR size ≤500 LOC preferred. Larger PRs require explicit Politburo approval and a stated rationale. |
| GOST-TIJ-002 | Cross-fence accessor changes ≤20 LOC per file. Fenced interfaces in `src/types/SystemInterfaces.ts` require `[interface-change]` PR title. |
| GOST-TIJ-003 | Test contract: L1 pure / L2 single-system / L3 small scenario / L4 full engine. No implementation-mirror tests. |
| GOST-TIJ-004 | Naming: `terror-in-the-jungle` package; `GameEngine` / `GameRenderer` core; `__engine` / `__renderer` / `__metrics` window globals. |
| GOST-TIJ-005 | Cycle slug convention: `cycle-YYYY-MM-DD-<descriptive-slug>`. Phase-letter IDs retired 2026-04-18. |
| GOST-TIJ-006 | Asset pipeline: assets enter the runtime only through the Pixel Forge pipeline. Old root-level vegetation WebPs and old NPC sprites are blocked by `check:pixel-forge-cutover`. |
| GOST-TIJ-007 | Map seed rotation registered in `src/config/MapSeedRegistry.ts`. Seed changes regenerate heightmaps + navmeshes. |
| GOST-TIJ-008 | `TimeScale` is the single hook point at `GameEngineLoop.dispatch`. Systems reading `performance.now()` directly bypass the scale (audit list in MEMORY.md). |
| GOST-TIJ-009 | UI parity: PC and mobile must achieve information parity on player-facing surfaces. Layout differences are permitted; missing functionality is not. |
| GOST-TIJ-010 | Vietnam-theater authenticity: aviation, radio, weapon, and squad-command surfaces shall reflect late-1960s Vietnam combined-arms doctrine where the simulation supports it. KB-DIZAYN holds the gate. |

---

## Article VI — Validation Protocol

### Local

| Tier | Command | Use |
|---|---|---|
| Routine | `npm run validate:fast` | Typecheck + lint + quick tests + build. Required before any commit. |
| Release | `npm run validate:full` | Adds `perf:capture:combat120`. Required before release. |
| Targeted | `npm run check:hud`, `check:mobile-ui`, `check:states`, `probe:fixed-wing`, `evidence:atmosphere` | Bureau-specific gates. |

### Remote (post-deploy)

| Command | Verifies |
|---|---|
| `npm run check:projekt-143-live-release-proof` | Live `/asset-manifest.json` SHA, Pages headers, R2 DEM, Recast WASM, ZC browser smoke. |
| `npm run check:projekt-143-completion-audit` | Measures current Article III / Article VII closeout status and writes a NOT_COMPLETE or complete artifact. |

### Evidence chain

Every directive's evidence path lives under `artifacts/perf/<ISO-timestamp>/<directive-slug>/`. Summary JSON is the canonical artifact. Screenshots and capture data are siblings.

---

## Article VII — Acceptance Criteria for Closeout

Projekt Objekt-143 retires when all of the following hold:

1. Every active directive in Article III either evidence-complete or explicitly deferred to Strategic Reserve with Politburo annotation.
2. Live release verified per STABILIZAT-3.
3. Strategic Reserve audited by KB-ARKHIV in the last 30 days; items either folded into a successor Projekt or held with explicit rationale.
4. Codex revision incremented and signed by the Politburo.
5. KB-DEFEKT confirms no active drift between docs, code, and live deployment for 14 consecutive days.

Until then, the bureau operates under stabilization posture.

### Politburo Seal — Cycle Closeout Log

Politburo seal: signed
Signed by the Politburo: yes

| Date | Cycle | Live SHA | Codex revision | Seal |
|---|---|---|---|---|
| 2026-05-08 | `cycle-2026-05-08-stabilizat-2-closeout` | `babae19a76e5ff622976a632e10f7055315d2698` | 1.3 — 2026-05-08 | **SEALED** by Politburo (Matt Kissinger) for STABILIZAT-2 closeout, STABILIZAT-3 live release verification, SVYAZ-1 stand-down command, SVYAZ-2 squad pings, and UX-1 respawn flow live production parity. STABILIZAT-1 deferred to Strategic Reserve. AVIATSIYA-1 / DEFEKT-5 source evidence complete; human visual review remains pending. DEFEKT-2 14-day live drift watch begins T+0. Successor cycles operate from this baseline. |
| 2026-05-08 | `cycle-2026-05-08-stabilizat-2-closeout` (extension) | `06a404bba9c2d0cd69c6bc0680504f13d0f145ba` | 1.3 — 2026-05-08 | **SEALED** by Politburo (Matt Kissinger) for AVIATSIYA-1 and DEFEKT-5 closure on the basis of in-production visual review. Source / asset / runtime evidence complete; live deploy ships the rotor-axis correction, death-clip selection fix, close-radius impostor telemetry, and explosion-FX representation tagging. Future visual regressions on rotor / death / explosion / close-NPC LOD reopen DEFEKT-5. Audit-parser tightening + STATE_OF_REPO refresh land at this SHA. |

The seal above advances Article VII criterion 4 (codex revision incremented and signed). Criteria 1, 2, 3, and 5 remain partially advanced and tracked in the post-cycle completion audit. Bureau remains under stabilization posture until all five criteria hold simultaneously. Article III still lists 20 open directives — Strategic Reserve items, AVIATSIYA-1/DEFEKT-5 awaiting human visual review, DEFEKT-3/-4 active remediation, VODA-1 exposure correction — to be advanced in successor cycles.

---

## Article VIII — Onboarding Protocol (for fresh personnel)

When you are first engaged on Projekt Objekt-143:

1. **Read this codex in full.** It is short on purpose.
2. **Read [AGENTS.md](../AGENTS.md)** for the agent-agnostic operating rules and known gotchas. Read [CLAUDE.md](../CLAUDE.md) if operating via Claude Code.
3. **Read [BACKLOG.md](BACKLOG.md)** but treat it as Strategic Reserve detail, not directive. Active work is in Article III above.
4. **Survey the directive board.** Choose one directive whose evidence chain you can advance in a bounded working session.
5. **Read the repository state** for that directive — relevant `src/`, tests, artifacts. Do not trust this codex alone.
6. **Report your selection and engagement plan** to the Politburo before tooling. Use the bureau's prose register.
7. **Operate under the doctrine.** Evidence before opinion. Measurement before decision. Repository is truth. Stabilize before expand. Small reviewable change.
8. **At session close,** record evidence path. Update the directive status in this codex if it changed. Escalate any drift or regression to KB-DEFEKT.

---

## Annex A — Recent Cycle Log (compact)

Last six closed cycles. Older history lives in `docs/cycles/<cycle-id>/RESULT.md` and `docs/archive/`.

| Cycle | Closed | Brief outcome |
|---|---|---|
| `cycle-2026-05-08-perception-and-stuck` | 2026-05-08 | Single integration PR [#165](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/165). Four parallel executor task branches addressing user-reported gameplay regressions: `npc-unfreeze-and-stuck` (LOD over-budget visual velocity integration + rejoin/squad watchdogs + StuckDetector→state exit + culled-sim cadence config), `npc-imposter-distance-priority` (close-model 64→120 m + on-screen priority score + velocity-keyed billboard cadence), `zone-validate-nudge-ashau` (post-placement validate-and-nudge for A Shau capturable zones in ditches), `terrain-cdlod-seam` (AABB-distance morph metric + skirt geometry + new seam diagnostic overlay). All behaviour gated by Tweakpane-exposed config flags. CI green; reviewers APPROVE-WITH-NOTES. Live deploy SHA `e34cc6d`. No Politburo directives advanced; non-doctrinal cycle. |
| `cycle-2026-05-08-stabilizat-2-closeout` | 2026-05-08 | Six PRs: helicopter rotor axis, water audits, terrain+effects, UX respawn, combat AI mega-cluster (GOST-001 exception), docs+scripts. STABILIZAT-2/3 closed, SVYAZ-1/2 closed, UX-1 closed. STABILIZAT-1 deferred. Live deploy SHA `babae19`. Codex revision 1.3. Politburo seal applied. DEFEKT-2 14-day drift watch T+0. |
| `cycle-2026-04-23-debug-cleanup` | 2026-04-22 | `preserve-drawing-buffer-dev-gate`, `world-overlay-debugger`. |
| `cycle-2026-04-23-debug-and-test-modes` | 2026-04-22 | Six PRs: debug HUD registry, time control overlay, live tuning, free-fly, playtest capture, terrain sandbox. |
| `cycle-2026-04-22-heap-and-polish` | 2026-04-22 | Heap triage, helicopter interpolated pose, A-1 altitude clamp, cloud audit. |
| `cycle-2026-04-22-flight-rebuild-overnight` | 2026-04-22 | Thirteen PRs across four rounds covering aircraft-building collision, airframe directional fallback, ground rolling model, altitude hold, climb stability, airfield perimeter and taxiway tuning. |
| `cycle-2026-04-21-atmosphere-polish-and-fixes` | 2026-04-20 | Sixteen PRs: ACES tonemap, fog rebalance, vegetation alpha and lighting parity, atmosphere day-night cycle, skybox cutover, cloud runtime. |
| `cycle-2026-04-21-stabilization-reset` | 2026-04-21 | Truth and gates: Node toolchain alignment, probe URL repair, fixed-wing probe restoration. |

In-flight: none. AVIATSIYA-1 / DEFEKT-5 human visual review packet remains pending Politburo decision.

---

## Annex B — File and Artifact Index

### Operating

| Path | Purpose |
|---|---|
| `docs/PROJEKT_OBJEKT_143.md` | This codex. |
| `docs/dizayn/vision-charter.md` | KB-DIZAYN visual and gameplay-feel charter. |
| `docs/dizayn/art-direction-gate.md` | KB-DIZAYN invocable "looks right" review gate. |
| `docs/AGENTS.md` | Agent-agnostic operating guide. |
| `docs/AGENT_ORCHESTRATION.md` | Master orchestration / dispatch / merge protocol. |
| `docs/BACKLOG.md` | Compact Strategic Reserve index; active work routes to Article III. |
| `docs/INTERFACE_FENCE.md` | Fenced-interface change rules. |
| `docs/TESTING.md` | Four-layer test contract. |
| `docs/rearch/helicopter-parity-audit.md` | AVIATSIYA-3 helicopter player/session parity audit. |

### Evidence

| Path | Purpose |
|---|---|
| `artifacts/perf/<ts>/` | Per-capture telemetry and screenshots. |
| `docs/cycles/<cycle-id>/RESULT.md` | Cycle close retrospectives. |
| `docs/tasks/archive/<cycle-id>/` | Archived task briefs. |
| `docs/asset-provenance/` | Pixel Forge generation provenance. |

### Pipeline

| Path | Purpose |
|---|---|
| `pixel-forge/scripts/gen-aircraft.ts` | Aircraft GLB generation (Anthropic API). |
| `pixel-forge/scripts/fix-helicopter-tail-rotor.ts` | Surgical binary edit for tail-rotor spin axis. |
| `scripts/import-pixel-forge-aircraft.ts` | Import + axis-normalization to TIJ runtime. |
| `scripts/prebake-navmesh.ts` | Pre-bake heightmaps + navmeshes per map seed. |

### Archive

| Path | Purpose |
|---|---|
| `docs/archive/PROJEKT_OBJEKT_143_LEGACY.md` | Pre-codex 3216-line evidence trail; preserved. |
| `docs/archive/E_TRACK_SPIKE_MEMO_INDEX_2026-05-07.md` | ARKHIV-3 E1-E6 spike memo index with source refs and folded decisions. |
| `docs/PROJEKT_OBJEKT_143_HANDOFF.md` | Topic-specific fresh-agent handoff and continuation prompt. |
| `docs/PROJEKT_OBJEKT_143_HYDROLOGY.md` | Topic-specific hydrology / VODA-1 reference; substantive findings inform water and terrain ecology work. |
| `docs/PROJEKT_OBJEKT_143_VEGETATION_SOURCE_PIPELINE.md` | Topic-specific vegetation source and Pixel Forge pipeline reference. |
| `docs/archive/PROJEKT_OBJEKT_143_24H_STATUS_2026-05-04.md` | Archived 24-hour status snapshot; superseded by the codex and current-state doc. |

---

## Annex C — Meta-Emulation Prompt

The opening prompt to spin up a fresh Glavnyy Inzhener under this codex. Issue verbatim. Optionally append a single trailing sentence focusing the engagement to a specific bureau or directive; otherwise the agent selects from the directive board.

```
You are Glavnyy Inzhener — Chief Engineer — of Projekt Objekt-143, the State's experimental engineering bureau commissioned by the Politburo to deliver `terror-in-the-jungle`: a 3D combined-arms FPS/RTS open-world war simulation of the Vietnam theater, late 1960s. The simulation operates at two registers simultaneously — first-person infantryman or pilot at one register, squad and air-support commander at the other — across an open map measured in kilometers, in jungle and rice paddy and forward-strip airfield, with helicopters at low altitude over the river and A-1 Skyraiders coming in for the napalm pass. The repository at this working directory is the project of record. The bureau aesthetic is the operating mode, not decoration.

Your operating manual is `docs/PROJEKT_OBJEKT_143.md`. Read it on every engagement before any directive is touched. It contains the engineering doctrine you swear to, the bureau organization you serve within, the active directive board your name appears on, the strategic reserve you guard for future cycles, the GOST-TIJ engineering standards you obey, the validation protocols you submit work to, and the acceptance criteria under which Projekt Objekt-143 may at last be retired with the Politburo's seal. The codex is the procedure. The repository is the reality. When the two disagree, the repository wins and the codex is reissued.

The repository is the prompt. The State does not issue separate briefs. Each engagement: (1) read the codex; (2) survey the active directive board in Article III across all bureaus — Design, Water, Ground Vehicle, Aviation, Communications and Command, User Experience, Stabilization, Defects and Drift, Archive; (3) read the relevant repository state for the chosen directive — source, tests, recent commits, captured artifacts under `artifacts/perf/`; (4) advance one directive's evidence chain in a single bounded working session; (5) record the evidence path and update the directive status in the codex before close.

You operate under the State's standing doctrine: evidence before opinion, measurement before decision, repository is truth, stabilize before expand, small reviewable change. You do not declare a directive complete without an artifact path proving it. You do not expand scope across bureau boundaries without convening inter-bureau review. You do not invent directives the codex has not authorized. You do not bypass GOST-TIJ standards. You do not break the bureau's prose register into helpful-assistant chatter.

You write as a bureau engineer: third-person formal, active voice, numbered enumerations, evidence-grounded claims, no hedging, no marketing prose, no apologies. You report findings; you do not report feelings. The Politburo — the human at the controls — sets the driver, sets the priority, arbitrates disputes between bureaus, and signs the seal under which directives close. You report to the Politburo. You escalate when scope, trajectory, or doctrine shifts. Otherwise — discharge.

Begin. Read `docs/PROJEKT_OBJEKT_143.md` end to end. Survey the active directive board. Identify the directive whose evidence chain you can advance most decisively in this engagement, with attention to the Politburo's most recent direction. State your selection, your reading of the current repository state for that directive, and your engagement plan in the bureau's register before tooling.
```

---

*Issued 2026-05-07. Revision 1.2 sharpens the project description to "3D combined-arms FPS/RTS open-world war simulation, Vietnam theater, late 1960s" and refines the Annex C meta-emulation prompt for optimal persona priming. Next codex audit due no later than 2026-06-07, sooner on Politburo direction.*

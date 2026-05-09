# KB-DIZAYN Vision Charter

Last updated: 2026-05-07

Status: Projekt Objekt-143 DIZAYN-1 charter. This document defines the
player-facing target for water, air combat, squad command, and deploy flow. It
is an art-direction and gameplay-feel standard, not implementation approval.

## Operating Frame

`terror-in-the-jungle` must read as a late-1960s Vietnam combined-arms
simulation before it reads as a generic sandbox. The player must understand two
truths at the same time: he is an infantryman or pilot inside the fight, and he
is also the commander of a squad and a fire-support net.

The design target is restrained, legible, and tactical. The game should not
hide weak systems behind cinematic haze, oversized UI, or decorative military
language. Every bureau must keep the same test: the player should be able to
look at the world, understand the tactical situation, and act without fighting
the interface.

## Water Standard

Good water has three visible regimes:

1. calm lowland water: slow reflective surface, readable banks, no white
   overexposure, no full-screen washout when viewed from ordinary ground and
   river-oblique angles.
2. Monsoon turbulence: rougher normal motion, darker sky reflection, stronger
   edge foam or disturbed surface only where weather and channel shape justify
   it.
3. Human contact: wading, swimming, breath, stamina, surfacing, splash, and
   wet-bank foot contact must be visible enough to explain the gameplay state.

VODA-1 may ship only when the visible surface and query API agree. A player
standing at the bank must see the same water that `isUnderwater`,
`getWaterDepth`, and `getWaterSurfaceY` describe. A Shau streams and Open
Frontier water may use different mesh policies, but both must be lit by the
atmosphere system and pass screenshot review without terrain-intersection
artifacts.

Design rejection criteria:

1. The water reads as a flat global plane when the terrain evidence says a
   stream, bank, or channel should be visible.
2. The water hides terrain, airfield, vehicle, or infantry readability.
3. A clipping bug is confused with water quality. Terrain/camera collision and
   water acceptance are separate findings.

## Air Combat Feel

Air combat must read by role.

1. Huey transport: vulnerable lift, low-altitude approach, clear landing and
   squad-deploy state, no fantasy gunship behavior on the transport variant.
2. Huey gunship and Cobra: rocket strafes and minigun passes with visible
   recoil, tracers, ammunition state, and a readable attack line.
3. A-1 Skyraider: heavy, deliberate dive-bomb or napalm attack profile, slow
   recovery, and ordnance that feels like a close-air-support event rather than
   a particle effect.
4. AC-47 Spooky: left-circle gunship orbit with side-firing pattern, stable
   pylon turn, and visible target-area commitment.
5. F-4 Phantom: high-speed strike or bomb run with limited loiter feel and
   strong separation from prop aircraft.

The player must never receive an aircraft that passes a probe but feels
unflyable. Fixed-wing and helicopter changes require the playtest checklist.
The automated probes may prove takeoff, control state, and browser execution;
they do not sign the feel seal.

Design rejection criteria:

1. Pitch, cyclic, yaw, or camera response feels stiff, stepped, or detached from
   the visible aircraft.
2. Rotor, propeller, gun, or weapon visuals contradict the aircraft state.
3. Strike effects obscure whether the target, attack line, or friendly squad is
   safe.

## Squad Command Surface

The command layer must feel like a field radio and squad-leader surface, not a
desktop strategy overlay pasted on top of an FPS.

Required command language:

1. Movement: go here, patrol, fall back, return to neutral.
2. Contact: attack here, suppress, hold, stand down.
3. Fire support: smoke or position marking, asset selection, cooldown state,
   strike clearance, and readable denial reasons.

Radio prose should be short, repeated only when useful, and grounded in
late-1960s command language. Smoke marking, callsign discipline, and strike
clearance are functional UI signals first and flavor second. The squad must be
allowed to engage while in transit when the tactical state demands it; movement
orders cannot turn soldiers into unresponsive path followers.

Design rejection criteria:

1. Pings are invisible in world or map view.
2. A squad command hides whether the squad is moving, engaging, suppressed, or
   returning to neutral.
3. Radio text is decorative and does not explain command state, target state,
   or denial state.

## Deploy Spawn Respawn Flow

Deploy flow must be fast, clear, and theater-immersive on PC and mobile. The
player should understand alliance, loadout, insertion type, zone state, helipad
state, and the consequence of the selected spawn without reading a manual.

Required flow properties:

1. PC and mobile information parity. Layouts may differ; missing decisions may
   not.
2. Spawn options must distinguish zone, helipad, tactical insertion, and
   unavailable choices.
3. Loadout categories must show role, weapon, ammunition, and faction limits.
4. Death-to-respawn must prioritize a quick valid decision over a decorated
   screen.
5. The first frame after deploy must make orientation and immediate danger
   understandable.

Design rejection criteria:

1. A player cannot tell which spawn option is selected.
2. The map view requires precision clicking or tiny mobile taps.
3. Loadout choice is visually secondary to decoration.
4. The respawn screen reads as a menu break rather than return to the battlefield.

## Art-Direction Gate

KB-DIZAYN signs with evidence, not taste alone. A bureau asking for a visual or
feel acceptance must provide:

1. Artifact path under `artifacts/perf/`.
2. Screenshot, contact sheet, browser proof, or playtest note appropriate to
   the surface.
3. Statement of trusted, diagnostic, or blocked evidence.
4. Explicit non-claims.

The standard phrase "looks right" means the evidence supports the tactical and
theater target defined here. It does not mean the screenshot is attractive in
isolation.

## Bureau Interfaces

1. KB-VODA owns water implementation. KB-DIZAYN owns water readability and
   contact-state acceptance.
2. KB-AVIATSIYA owns aircraft implementation. KB-DIZAYN owns aircraft feel and
   strike readability acceptance.
3. KB-SVYAZ owns command implementation. KB-DIZAYN owns command language and
   battlefield readability acceptance.
4. KB-UX owns deploy and respawn implementation. KB-DIZAYN owns flow clarity and
   theater fit acceptance.
5. KB-METRIK may reject any visual or feel claim when its evidence chain is not
   trustworthy.

## Non-Claims

1. This charter does not implement water, vehicles, command UI, deploy UI, or
   aircraft weapons.
2. This charter does not accept any current screenshot, playtest result, or
   runtime branch.
3. This charter does not override automated validation, performance gates, or
   human playtest requirements.
4. This charter does not authorize WebGPU migration, new asset imports, or new
   vehicle types.

# Healing & Looting — Scope / Design Doc

> **Date:** 2026-06-28
> **Campaign:** [Field Readiness](../CAMPAIGN_2026-06-28-field-readiness.md), Phase 6
> (`ashau-purpose-and-missions`)
> **Brief:** [`docs/tasks/healing-and-looting-scope.md`](../tasks/healing-and-looting-scope.md)
> **Status:** DESIGN ONLY — greenfield. No code ships this campaign. A future
> cycle acts on this doc.

## TL;DR

Two independent, independently-shippable features the 2026-06-28 owner walk asked
for:

1. **Active healing** — a bandage/med item with a use action and cooldown,
   layered *on top of* today's passive regen. The health read/write path already
   exists and is clean: `PlayerHealthSystem` owns `playerState.health` and already
   exposes `getHealth()` / `getMaxHealth()`. We add a `heal(amount)` write method
   and a small consumable-inventory + use-action front end. ~no hot-path risk.
2. **Looting** — `src/systems/weapons/WeaponPickupSystem.ts` is **fully written
   but never instantiated**. It has spawn, despawn, bob/rotate animation, an `[E]`
   prompt, a 30%-on-death drop roll, and a weapon-swap callback. It is dormant
   purely because it was never added to the six registration sites every other
   system goes through. Activating it is wiring + reconciling its placeholder
   weapon-swap path with the real loadout-driven swap surface.

**Build healing first** (see [§5](#5-sequencing--which-to-build-first)): it is
smaller, lower-risk, has zero open design questions, and directly serves the A
Shau "stay alive longer between fights" loop. Looting is a bigger UX +
inventory-model surface with one real architectural reconciliation (the dormant
system's placeholder swap vs. the real loadout swap path).

---

## 1. Healing

### 1.1 Today: passive regen only

`src/systems/player/PlayerHealthSystem.ts` is the single owner of player health.
Relevant facts grounded in the file:

- `PlayerState` (`PlayerHealthSystem.ts`) holds `health`, `maxHealth`, `isAlive`,
  `isDead`, `deathTime`, `respawnTime`, `invulnerabilityTime`.
- Constants: `PLAYER_MAX_HEALTH = 150`, `HEALTH_REGEN_DELAY = 5.0` (seconds),
  `HEALTH_REGEN_RATE = 20` (HP/s), `LOW_HEALTH_THRESHOLD = 30`.
- **Passive regen** lives in `update(deltaTime)`: if `health < maxHealth` *and*
  `(Date.now() - lastDamageTime) / 1000 > healthRegenDelay`, it adds
  `healthRegenRate * deltaTime`, clamped to `maxHealth`, then calls
  `updateHealthDisplay()`.
- **Damage** flows through `takeDamage(amount, sourcePosition?, playerPosition?)`,
  which clamps `health = max(0, health - amount)`, stamps `lastDamageTime =
  Date.now()`, runs damage indicators / camera shake, and calls `onPlayerDeath()`
  at `health <= 0`. This is the canonical write-down path; **active healing is its
  symmetric write-up.**
- **Reads** are already public: `getHealth()`, `getMaxHealth()`, `isAlive()`,
  `isDead()`, `hasSpawnProtection()`.
- **UI** is owned by `src/systems/player/PlayerHealthUI.ts` via
  `updateHealthDisplay(health, maxHealth)` — a health pill (`%` + fill bar) that
  recolors green/amber/red by percentage, plus `setLowHealthEffect()` /
  `setSpawnProtection()` class toggles. `PlayerHealthEffects` owns the damage
  vignette + heartbeat.

So the read/write path is already a tidy choke point. We do **not** touch the
damage/health *model* (per the brief's non-goal) — we add a heal write and an
item/use front end.

### 1.2 The health write path for healing

Add one method to `PlayerHealthSystem` (the only system allowed to mutate
`playerState.health`):

```
heal(amount: number): number   // returns HP actually restored
```

Behavior (mirrors `takeDamage`'s discipline, inverted):

- No-op if `isDead`, if `amount <= 0`, or if already at `maxHealth`.
- `playerState.health = min(maxHealth, health + amount)`.
- **Does NOT** reset `lastDamageTime` — healing must not also restart the passive
  regen clock or it would interfere with the regen-delay semantics. (Active heal
  and passive regen stack: you can bandage *and* still be inside the 5s regen
  delay.)
- Calls `updateHealthDisplay()` and re-evaluates `updateLowHealthEffects()` so the
  heartbeat/red-pulse clears the instant a bandage crosses `LOW_HEALTH_THRESHOLD`.
- Returns the delta so the caller can show "+N HP" feedback and decide whether the
  item was "used" (don't consume a bandage at full health).

This keeps `PlayerHealthSystem` the sole health mutator — combat damage, drowning
(`applyDrowningDamage`, currently dormant), respawn reset, and now healing all go
through it. No fence change: `PlayerHealthSystem` is a concrete class wired by
`GameplayRuntimeComposer`, **not** part of fenced `IHUDSystem`/`IPlayerController`
surfaces in `src/types/SystemInterfaces.ts`.

### 1.3 Consumable inventory: where med items live

There are two viable homes; recommendation is **(A)**.

**(A) Extend `InventoryManager` (recommended).**
`src/systems/player/InventoryManager.ts` already owns the player's count-based
consumables (`grenades`, `mortarRounds`, `sandbags`) with the exact
`canUseX()`/`useX()`/`addX()`/`getState()` shape we want, plus an
`onInventoryChange` callback the HUD already subscribes to. Add a parallel
`bandages` / `maxBandages` pair (e.g. start 2, max 2) with:

- `canUseBandage(): boolean` → `bandages > 0`
- `useBandage(): boolean` → decrement + `notifyInventoryChange()`
- `addBandages(count)` → clamp to `maxBandages` (so med crates / loot can refill)
- include `bandages` / `maxBandages` in `InventoryState`

This reuses the resupply plumbing for free: `AmmoSupplySystem.tryResupply()`
already restocks grenades + sandbags at friendly zone crates and could refill
bandages in the same pass (one line: `if (needsBandages) inv.addBandages(...)`).

**(B) A standalone `HealingItemSystem`.** More isolated, but duplicates the
count/refill/HUD-callback machinery `InventoryManager` already has. Only pick this
if healing grows beyond a single bandage type (med kit + bandage + morphine, with
different cast times) — not warranted for the MVP.

Loadout note: `LEGACY_SLOT_DEFINITIONS` / `createConfiguredSlotDefinitions` define
six weapon/equipment hotbar slots and are already full. **Do not** put the bandage
on the 1-6 hotbar — keep it a dedicated key (see UX). The slot enum should stay a
weapon/throwable/deployable concern.

### 1.4 Use action (input) + cooldown

- **Bind a dedicated key** for "use bandage" — `H` is free and mnemonic (the
  `1-6` hotbar, `Q` weapon-cycle, `R` reload, `B` deploy, `F` fire/interact, `E`
  interact, `T`/`Z` radio are all taken). Wire it the same way
  `InventoryManager.onKeyDown` handles its keys, or in `PlayerInput`. A
  hold-to-bandage (short cast, ~1.5s) reads better than an instant tap but the MVP
  can be a tap.
- **Cooldown / cast** is owned by whatever fires the heal (the new use-action
  glue, not `PlayerHealthSystem`). Two timers:
  - a *cast time* (optional MVP, ~1.5s "applying bandage" during which a
    re-press is ignored and damage can interrupt — interrupt = forfeit or refund,
    a design pick for the owner walk), then
  - the actual `inv.useBandage()` + `playerHealthSystem.heal(BANDAGE_AMOUNT)`.
- Suggested numbers (owner-tunable): `BANDAGE_AMOUNT = 50` (1/3 of 150 max),
  2 bandages carried, ~1.5s cast. This makes a bandage a meaningful but
  non-trivial mid-fight commitment that complements (not replaces) passive regen.

### 1.5 Healing UX

- **Count chip:** the HUD already renders inventory counts via
  `InventoryManager.onInventoryChange` → the unified weapon bar (`setSuppressUI(true)`
  is set in `SystemInitializer.ts:211` because `UnifiedWeaponBar` replaces the
  built-in hotbar). Add a small bandage pip (icon + count) next to the health pill
  rendered by `PlayerHealthUI`. Health pill markup/styles live in
  `PlayerHealthUI.ts` (`.health-display`).
- **Cast feedback:** a thin radial/linear progress on the crosshair or over the
  health pill during the cast; a "+50" float (reuse the popup pattern in
  `AmmoSupplySystem.showResupplyPopup`).
- **Audio:** a bandage/wrap SFX through `AudioManager` (a positional or 2D cue).
- **Affordance / discoverability:** per the campaign's dominant finding (~40% of
  complaints are discoverability), surface the `H: Bandage` hint in the Phase-1
  `control-hints-hud` legend when `bandages > 0` and `health < maxHealth`.

### 1.6 Match reset

`PlayerHealthSystem.resetForNewMatch()` already resets health/state on match
restart (wired via `TicketSystem.setMatchRestartCallback` in
`GameplayRuntimeComposer.ts`). `InventoryManager.reset()` already restocks
consumables — extend it to refill `bandages` to `maxBandages` so a new match / a
respawn starts kitted.

### 1.7 Healing integration points (summary)

| Concern | Owner | Change |
|---|---|---|
| Health write | `PlayerHealthSystem` | add `heal(amount): number` |
| Item count + refill | `InventoryManager` | add `bandages`, `canUseBandage`, `useBandage`, `addBandages`, extend `InventoryState` + `reset()` |
| Use key + cast/cooldown | new glue (or `PlayerInput`) | bind `H`; own the cast timer; call `useBandage()` then `heal()` |
| Count chip + cast UI | `PlayerHealthUI` / unified bar | bandage pip + cast progress + "+N" float |
| Refill at crates | `AmmoSupplySystem.tryResupply` | optional one-liner |
| Discoverability | `control-hints-hud` (Phase 1) | `H: Bandage` hint |
| Match reset | `resetForNewMatch` / `reset` | refill bandages |

---

## 2. Looting — activating `WeaponPickupSystem`

### 2.1 What `WeaponPickupSystem.ts` already does (as written)

`src/systems/weapons/WeaponPickupSystem.ts` is a complete `GameSystem`
implementation. It already has:

- A local `WeaponType` enum (`RIFLE` / `SHOTGUN` / `SMG`) and a `WeaponPickup`
  record (`id`, `type`, world `position`, `spawnTime`, `billboard` mesh,
  `rotation`).
- Constants: `PICKUP_RADIUS = 2.0` m, `PICKUP_LIFETIME = 60000` ms, `DROP_CHANCE =
  0.30`, plus bob (`BOB_SPEED`/`BOB_AMOUNT`) and `ROTATION_SPEED` animation tuning.
- `init()` builds per-type colored billboard materials (green/red/blue), a
  centered DOM prompt element, and registers a `window` `keydown` listener for
  `KeyE`.
- `update(deltaTime)`: requires `playerController` (early-returns without it),
  copies player position from `playerController.getPosition()`, expires pickups
  past `PICKUP_LIFETIME`, animates bob + rotation, finds the nearest pickup within
  `PICKUP_RADIUS_SQ`, and toggles the `[E] Pick up <WEAPON>` prompt.
- `onKeyDown` → on `KeyE` with a `nearestPickup`, calls `pickupWeapon(pickup)`.
- `pickupWeapon` fires the `onWeaponPickedUp(type, oldType)` callback, plays a
  green `PointLight` flash (`spawnPickupEffect`), and removes the pickup.
- `spawnPickup(type, position)` — public; creates the billboard, registers it,
  returns an id.
- `onCombatantDeath(position)` — public; rolls `DROP_CHANCE` (30%), picks a random
  weapon type, offsets `+0.5` y, and spawns a pickup. **This is the spawn-on-death
  entry point.**
- `setPlayerController(controller)`, `onWeaponPickup(callback)`, and a `dispose()`
  that tears down meshes/materials/prompt/listener.

It depends only on `THREE`, `Logger`, `AssetLoader`, and
`IPlayerController` — all already available at composition time.

### 2.2 Why it is dormant (the wiring gap)

**`WeaponPickupSystem` is fully written but is never constructed, never registered,
and never updated.** It appears only in its own file, its `.test.ts`, and docs —
confirmed by a repo-wide search. Every live `GameSystem` flows through six
registration sites; `WeaponPickupSystem` is absent from all of them. Compare with
its sibling `AmmoSupplySystem`, which *is* present at every site:

| Site (file) | What it does | `AmmoSupplySystem` | `WeaponPickupSystem` |
|---|---|---|---|
| `src/core/SystemRegistry.ts` | type-map entry + key list | present (`ammoSupplySystem`) | **absent** |
| `src/core/SystemManager.ts` | typed getter | present | **absent** |
| `src/core/SystemInitializer.ts` | `new …()` + add to `allSystems[]` | present (`SystemInitializer.ts:219`, listed `:267`) | **absent** |
| `src/core/SystemUpdater.ts` | per-frame `.update()` call | present | **absent** |
| `src/core/SystemUpdateSchedule.ts` | schedule entry | present | **absent** |
| `src/core/GameplayRuntimeComposer.ts` | cross-system `set…` wiring | present (`:317-319`) | **absent** |

Because nothing constructs it, nothing calls `setPlayerController()` (so `update()`
would early-return anyway), nothing calls `onWeaponPickup()` (so `pickupWeapon`'s
`if (!this.onWeaponPickedUp) return;` makes pickup a no-op), and crucially
**nothing calls `onCombatantDeath()`** — the death pipeline never knows the system
exists. The combatant death path (`CombatantDamage.handleDeath`,
`CombatantDeathPipeline.handleCombatantDeath`) does squad bookkeeping, effects,
audio, kill feed, tickets, and emits the typed `npc_killed` event on
`GameEventBus`, but there is no loot hook. **That missing call is the looting
loop's actual gap**, on top of the registration gap.

It is best read as a half-built prototype that predates the loadout/inventory
system and the unified death pipeline, left on the shelf.

### 2.3 The reconciliation problem (the one real design decision)

The system's `pickupWeapon` is honest about being a stub:

```ts
// Determine current weapon (simplified - would normally check inventory)
const currentWeapon = WeaponType.RIFLE; // Placeholder
this.onWeaponPickedUp(pickup.type, currentWeapon);
```

But the real weapon model has **moved on** since this was written. Today the
player's equipped weapon is **loadout/slot-driven**, not a single mutable
"current weapon":

- `InventoryManager` owns slots (`WeaponSlot`, `LoadoutWeapon`) and fires
  `onSlotChange`.
- `FirstPersonWeapon.setInventoryManager` subscribes to `onSlotChange`, maps the
  slot to a `LoadoutWeapon` via `getWeaponTypeForSlot`, and calls
  `this.switching.switchWeapon(weaponType, …)` — that is the real swap surface.
- `WeaponPickupSystem`'s local `WeaponType` (`rifle`/`shotgun`/`smg`) is a
  **different, older enum** than `LoadoutWeapon` (rifle/shotgun/smg/pistol/…).

So "pick up a weapon" must be reframed against the loadout model. Three options for
the owner walk:

- **Option L1 — pickups grant ammo/equipment, not weapon swaps (recommended MVP).**
  Reuse the dormant system's spawn/animation/prompt/proximity machinery, but make
  loot drops grant a *resupply* (ammo, a grenade, or a bandage) rather than swap
  the equipped weapon. This sidesteps the enum/loadout mismatch entirely, plugs
  straight into `InventoryManager.addX()` / the ammo path, and is genuinely useful
  on A Shau (loot the dead to stay topped up). Lowest risk, fully shippable.
- **Option L2 — pickups swap a *secondary* slot.** Map the pickup to a
  `LoadoutWeapon`, fill the currently-unused `WeaponSlot.SMG`/`PISTOL` (the slot
  comments literally say *"reserved for future pickups"*), enable that slot, and
  let `InventoryManager` drive the existing `FirstPersonWeapon` swap. More work
  (enum bridge + slot enable/disable + viewmodel for every lootable type) and more
  UX (what happens when you already have one).
- **Option L3 — full battlefield-pickup loadout swap.** The owner's richest read
  of "looting," but the largest: any weapon replaces your primary, requires every
  weapon's viewmodel/animations to be pickup-ready, and interacts with the deploy
  armory. Defer.

The dormant code's `onWeaponPickedUp(type, oldType)` callback shape fits L2/L3; L1
ignores it and calls inventory/ammo directly.

### 2.4 Exact wiring to activate it

Independent of which loot-grant option above, activation is the same mechanical
six-site registration plus two hookups:

1. **Register the system** at the six sites in §2.2 (construct in
   `SystemInitializer` with `(scene, camera, assetLoader)`, add to `allSystems[]`,
   add registry key + type-map entry + `SystemManager` getter + `SystemUpdater`
   update call + `SystemUpdateSchedule` entry). Pattern-match `AmmoSupplySystem`
   exactly.
2. **Wire dependencies** in `GameplayRuntimeComposer` (a new `set…` block like
   `wireGameModeRuntime`'s ammo block): call
   `weaponPickupSystem.setPlayerController(playerController)` and, for L1,
   `setInventoryManager(...)` (a new setter); for L2/L3,
   `onWeaponPickup(callback)` bridging to `InventoryManager` + `FirstPersonWeapon`.
3. **Hook spawn-on-death.** Two clean options:
   - **(a) Event-driven (recommended).** Subscribe to `GameEventBus` `npc_killed`
     (payload already carries `position: THREE.Vector3`) and call
     `weaponPickupSystem.onCombatantDeath(event.position)`. This is decoupled —
     no change to `CombatantDamage`/the death pipeline — and the event already
     fires for every AI death. (Note: `npc_killed` is *not* emitted for the
     player-proxy kill path; if loot should drop from player kills too, also wire
     the `player_kill` event, which carries no position, so prefer the
     `npc_killed` path or pass position another way.)
   - **(b) Direct call** from `CombatantDamage.handleDeath` (it already has
     `target.position`). Tighter coupling; only choose if event timing/position
     fidelity is an issue.
4. **World-placed pickups (optional).** Call `spawnPickup(type, position)` at
   objective/crate locations at match start for guaranteed loot independent of
   kills (e.g. near zones via `ZoneManager`). Not required for MVP.

### 2.5 Pickup UX (as written + gaps to close)

- **Proximity prompt** already exists: a centered `[E] Pick up <WEAPON>` DOM
  element shown within 2 m. The `KeyE` interact key is consistent with vehicle/heli
  board interactions. Gaps: the prompt is a raw fixed DOM element (it already uses
  `var(--font-primary)` and the parchment palette, good) and there is no
  controller/touch affordance.
- **Billboards** are flat colored planes (`PlaneGeometry`, `MeshBasicMaterial`).
  For ship quality, swap to a small weapon/loot icon or a low-poly GLB via
  `AssetLoader` (the constructor already takes one but it is unused today).
- **Despawn:** 60 s lifetime is reasonable; consider a fade-out in the last few
  seconds (the bob/rotate already telegraphs "lootable").
- **Discoverability:** add the `E: Loot` hint to the Phase-1 `control-hints-hud`
  legend when a pickup is in range.

---

## 3. Phased build plans

### 3.1 Healing

| Phase | Scope | Files |
|---|---|---|
| **MVP** | `PlayerHealthSystem.heal(amount)`; `InventoryManager` bandage count + `useBandage`/`addBandages`; bind `H` (instant); "+N" float + count pip; refill on reset. | `PlayerHealthSystem.ts`, `InventoryManager.ts`, `PlayerHealthUI.ts`, input glue |
| **Full** | hold-to-bandage cast (~1.5s) with interrupt rule; cast progress UI; bandage SFX; crate/zone + loot refill; `control-hints-hud` hint; tune amount/count/cast at the owner walk. | + `AudioManager`, `AmmoSupplySystem`, `control-hints-hud` |

### 3.2 Looting

| Phase | Scope | Files |
|---|---|---|
| **MVP** | Register `WeaponPickupSystem` at all six sites; `setPlayerController`; subscribe `npc_killed` → `onCombatantDeath`; **Option L1** (drops grant ammo/grenade/bandage via `InventoryManager`); existing `[E]` prompt + billboard. | `SystemRegistry.ts`, `SystemManager.ts`, `SystemInitializer.ts`, `SystemUpdater.ts`, `SystemUpdateSchedule.ts`, `GameplayRuntimeComposer.ts`, `WeaponPickupSystem.ts` (inventory setter), `GameEventBus` subscriber |
| **Full** | Option L2 secondary-slot weapon pickups (enum bridge `WeaponType`↔`LoadoutWeapon`, enable `SMG`/`PISTOL` slot, viewmodels); GLB/icon billboards via `AssetLoader`; world-placed pickups at zones; fade-out despawn; `control-hints-hud` hint. Defer L3. | + `LoadoutTypes.ts`, `FirstPersonWeapon` swap bridge, `AssetLoader`, `ZoneManager` |

---

## 4. Perf / UX risks (ranked)

1. **[Looting] Per-frame proximity scan as drops accumulate.** `update()` iterates
   every pickup twice per frame (expire sweep + nearest search) plus animates each.
   At 120 NPCs × 30% drop × 60 s lifetime that is up to ~tens of live billboards —
   cheap, but cap total pickups (e.g. evict oldest past N, or shorten lifetime) and
   give each `userData.perfCategory = 'weapons'` (the code already does) so it's
   attributable in telemetry. **Mitigation:** hard cap + the existing 60 s expiry.
2. **[Looting] `window` keydown listener + raw DOM prompt.** The system attaches
   its own global `keydown` and creates a fixed DOM node in `init()`. Fine, but it
   must be torn down on mode-end (`dispose()` already does) and the `E` binding
   must not collide with vehicle-board `E`/`F` interactions — verify no
   double-trigger when standing next to both a pickup and a vehicle.
3. **[Healing] Cast-time interrupt semantics** are a real UX decision (interrupt =
   forfeit vs. refund vs. uninterruptible). Wrong call feels either cheap or
   frustrating. **Mitigation:** ship MVP instant-heal; add cast in Full behind the
   owner's pick at the walk.
4. **[Healing] Regen-clock interaction.** If `heal()` accidentally stamps
   `lastDamageTime`, it would *restart* the passive regen delay and feel like
   healing is "slower." **Mitigation:** explicitly do **not** touch
   `lastDamageTime` in `heal()` (called out in §1.2).
5. **[Both] Discoverability.** A bandage you never learn you have, or loot you
   don't know is lootable, is invisible value — exactly the campaign's dominant
   complaint. **Mitigation:** the Phase-1 `control-hints-hud` hints + the count
   pip + the proximity prompt.
6. **[Looting] Enum/loadout mismatch (L2/L3 only).** `WeaponType` ≠
   `LoadoutWeapon`; a naive bridge could desync the equipped-weapon truth that
   `FirstPersonWeapon`/`InventoryManager` jointly own. **Mitigation:** MVP is
   Option L1 (no weapon swap); only cross this bridge in Full.

---

## 5. Sequencing — which to build first

**Build healing first.** Rationale:

- **Smaller + lower-risk.** One new health write method + a count on an existing
  inventory + a key bind. No new registered system, no death-pipeline hook, no
  enum reconciliation.
- **Zero open design questions** at MVP (instant heal). Looting carries the real
  L1/L2/L3 decision and the `WeaponType`↔`LoadoutWeapon` reconciliation.
- **Directly serves A Shau's "purpose" goal.** Active healing extends time-on-foot
  between fights — it makes solo exploration of the 21 km valley survivable, which
  is the Phase-6 theme.
- **Clean choke point already exists.** `PlayerHealthSystem` is the sole health
  mutator; healing is the mirror of the already-clean `takeDamage` path.

Looting is the higher-ceiling feature but should follow: do the mechanical
six-site registration + the `npc_killed` hook + **Option L1** (resupply drops) as
its MVP — that activates the dormant system and delivers a loot loop without the
weapon-swap reconciliation — then revisit L2 weapon pickups once the owner has
chosen a direction at the walk.

**The two are independently shippable** — healing touches
`PlayerHealthSystem`/`InventoryManager`/`PlayerHealthUI`; looting touches the
`core/` registration files + `WeaponPickupSystem` + a `GameEventBus` subscriber.
No shared file forces them to serialize.

---

## 6. Fence check

No `src/types/SystemInterfaces.ts` change is required for either feature.
`PlayerHealthSystem`, `InventoryManager`, and `WeaponPickupSystem` are concrete
classes wired through `SystemInitializer` / `GameplayRuntimeComposer`, not part of
the fenced interface surface. `WeaponPickupSystem` already imports the existing
fenced `IPlayerController` read-only and needs no new methods on it.
**`fence_change: no`.**

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * CrosshairSystem - Context-sensitive crosshair overlay.
 *
 * Extends UIComponent with mode-driven rendering:
 *   infantry           - tactical crosshair (4 lines, dot, brackets, spread ring)
 *   helicopter_transport - hidden (no pilot weapons)
 *   helicopter_gunship   - hidden (door guns are crew-operated)
 *   helicopter_attack    - forward pipper reticle (circle + center dot)
 *   tank_gunner          - gunner sight: aim cross + horizontal stadia rangefinder + mil drop ticks
 *   emplacement_mg       - open MG cross (M2HB tripod / vehicle mount)
 *   door_gun             - open MG cross for the helicopter door gun (M60); a
 *                          lighter sibling of emplacement_mg with the same
 *                          arc-stop edge ticks (the door mount has hard arc stops)
 *   fixed_wing           - reflector gunsight: outer ring + center pipper + short cross ticks
 *
 * The door_gun reticle reuses the emplacement_mg arc-stop signal (`setTraverseStop`)
 * so the player sees the door gun running out of traverse/elevation travel, but
 * draws a lighter open cross (M60 door gun, not a heavy .50-cal tripod sight).
 *
 * The fixed_wing reticle is a static reflector (gyro-less) sight boresighted to
 * the nose-cannon convergence direction — outer ring, a bright center pipper,
 * and four short cross ticks. No lead computation is drawn (R2 fixedwing-gunsight).
 *
 * The tank_gunner reticle is a real stadia sight (R2 tank-gunner-sight); the
 * emplacement_mg reticle is a real heavy-MG sight (R2 m2hb-gun-experience):
 * an open-center cross with wide horizontal wings (the classic ladder-less
 * .50-cal sight picture) plus four edge ticks that light when the barrel pins
 * against a traverse stop. The stadia / drop ticks are static markings — no
 * live ballistic computation is drawn into them.
 */

import { UIComponent } from '../engine/UIComponent';
import { icon } from '../icons/IconRegistry';
import styles from './CrosshairSystem.module.css';

export type CrosshairMode =
  | 'infantry'
  | 'helicopter_transport'
  | 'helicopter_gunship'
  | 'helicopter_attack'
  | 'tank_gunner'
  | 'emplacement_mg'
  | 'door_gun'
  | 'fixed_wing';

/**
 * Which mechanical traverse stop the emplacement barrel is pinned against, or
 * `null` when it has travel in every direction. Drives the MG reticle's edge
 * ticks so the gunner sees the swing weight running out of travel.
 */
export type TraverseStopDir = 'left' | 'right' | 'up' | 'down' | null;

/**
 * Which pilot weapon the attack-helicopter sight is showing prominently:
 * `'gun'` raises the gun pipper, `'rockets'` raises the rocket pipper + drops
 * the CCIP rocket-fall cue. Driven by the in-cockpit weapon-cycle input.
 */
export type HeliReticleWeapon = 'gun' | 'rockets';

export class CrosshairSystem extends UIComponent {
  private mode = this.signal<CrosshairMode>('infantry');
  private spreadRadius = this.signal(15);
  private isVisible = this.signal(true);
  private pipperIconsLoaded = false;
  /** Active traverse stop for the emplacement_mg reticle (null = no stop). */
  private traverseStop = this.signal<TraverseStopDir>(null);
  /** Which attack-sight weapon reticle is prominent (gun pipper vs rocket cue). */
  private heliWeapon = this.signal<HeliReticleWeapon>('gun');
  /**
   * Vertical pixel offset (≥ 0) the CCIP rocket-fall cue sits BELOW the
   * boresight pipper. Pushed per-frame by the attack-helicopter adapter.
   */
  private rocketCueOffset = this.signal(0);
  private infantryEl: HTMLElement | null = null;
  private pipperEl: HTMLElement | null = null;
  private tankGunnerEl: HTMLElement | null = null;
  private emplacementMgEl: HTMLElement | null = null;
  private doorGunEl: HTMLElement | null = null;
  private fixedWingEl: HTMLElement | null = null;
  private spreadRingEl: HTMLElement | null = null;
  private mgStopUpEl: HTMLElement | null = null;
  private mgStopDownEl: HTMLElement | null = null;
  private mgStopLeftEl: HTMLElement | null = null;
  private mgStopRightEl: HTMLElement | null = null;
  private dgStopUpEl: HTMLElement | null = null;
  private dgStopDownEl: HTMLElement | null = null;
  private dgStopLeftEl: HTMLElement | null = null;
  private dgStopRightEl: HTMLElement | null = null;
  private pipperGunEl: HTMLElement | null = null;
  private pipperRocketEl: HTMLElement | null = null;
  private rocketCueEl: HTMLElement | null = null;
  private pipperIconImgs: HTMLImageElement[] = [];

  protected build(): void {
    this.root.className = styles.container;
    this.root.innerHTML = `
      <div data-ref="infantry" class="${styles.tacticalCrosshair}">
        <div class="${styles.dot}"></div>
        <div class="${styles.line} ${styles.lineTop}"></div>
        <div class="${styles.line} ${styles.lineBottom}"></div>
        <div class="${styles.line} ${styles.lineLeft}"></div>
        <div class="${styles.line} ${styles.lineRight}"></div>
        <div class="${styles.bracket} ${styles.bracketTL}"></div>
        <div class="${styles.bracket} ${styles.bracketTR}"></div>
        <div class="${styles.bracket} ${styles.bracketBL}"></div>
        <div class="${styles.bracket} ${styles.bracketBR}"></div>
        <div data-ref="spreadRing" class="${styles.spreadRing}"></div>
      </div>
      <div data-ref="pipper" class="${styles.pipperReticle}" style="display:none">
        <img data-ref="pipperGun" data-icon="reticle-cobra-gun" alt="Gun reticle" width="48" height="48" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);object-fit:contain;image-rendering:pixelated;pointer-events:none;" draggable="false">
        <img data-ref="pipperRocket" data-icon="reticle-rocket" alt="Rocket reticle" width="48" height="48" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);object-fit:contain;image-rendering:pixelated;pointer-events:none;display:none;" draggable="false">
        <div class="${styles.pipperDot}"></div>
        <!-- CCIP rocket-fall cue: a caret the renderer drops below the boresight
             pipper by the computed rocket lead. Shown only with rockets selected. -->
        <div data-ref="rocketCue" class="${styles.rocketCue}" style="display:none"></div>
      </div>
      <div data-ref="tankGunner" class="${styles.tankGunnerReticle}" style="display:none">
        <!-- Center aim cross (short open arms, gap at the bore). -->
        <div class="${styles.gunnerArm} ${styles.gunnerArmUp}"></div>
        <div class="${styles.gunnerArm} ${styles.gunnerArmDown}"></div>
        <div class="${styles.gunnerArm} ${styles.gunnerArmLeft}"></div>
        <div class="${styles.gunnerArm} ${styles.gunnerArmRight}"></div>
        <div class="${styles.gunnerDot}"></div>
        <!-- Horizontal stadia rangefinder: graduated ticks each side of the
             bore for bracketing a target's width (static markings). -->
        <div class="${styles.stadiaTick} ${styles.stadiaL1}"></div>
        <div class="${styles.stadiaTick} ${styles.stadiaL2}"></div>
        <div class="${styles.stadiaTick} ${styles.stadiaL3}"></div>
        <div class="${styles.stadiaTick} ${styles.stadiaR1}"></div>
        <div class="${styles.stadiaTick} ${styles.stadiaR2}"></div>
        <div class="${styles.stadiaTick} ${styles.stadiaR3}"></div>
        <!-- Mil-style drop ticks below the bore (range holdover marks). -->
        <div class="${styles.dropTick} ${styles.drop1}"></div>
        <div class="${styles.dropTick} ${styles.drop2}"></div>
        <div class="${styles.dropTick} ${styles.drop3}"></div>
      </div>
      <div data-ref="emplacementMg" class="${styles.mgReticle}" style="display:none">
        <!-- Open-center cross: short vertical posts above/below the bore. -->
        <div class="${styles.mgLine} ${styles.mgLineTop}"></div>
        <div class="${styles.mgLine} ${styles.mgLineBottom}"></div>
        <!-- Wide horizontal wings — the classic ladder-less .50-cal sight: two
             long bars reaching out to either side, with a gap at the bore. -->
        <div class="${styles.mgWing} ${styles.mgWingLeft}"></div>
        <div class="${styles.mgWing} ${styles.mgWingRight}"></div>
        <div class="${styles.mgDot}"></div>
        <!-- Edge ticks: light when the barrel pins against a traverse stop. -->
        <div data-ref="mgStopUp" class="${styles.mgStop} ${styles.mgStopUp}"></div>
        <div data-ref="mgStopDown" class="${styles.mgStop} ${styles.mgStopDown}"></div>
        <div data-ref="mgStopLeft" class="${styles.mgStop} ${styles.mgStopLeft}"></div>
        <div data-ref="mgStopRight" class="${styles.mgStop} ${styles.mgStopRight}"></div>
      </div>
      <div data-ref="doorGun" class="${styles.doorGunReticle}" style="display:none">
        <!-- Lighter open cross for the M60 door gun (no heavy wings). -->
        <div class="${styles.dgArm} ${styles.dgArmTop}"></div>
        <div class="${styles.dgArm} ${styles.dgArmBottom}"></div>
        <div class="${styles.dgArm} ${styles.dgArmLeft}"></div>
        <div class="${styles.dgArm} ${styles.dgArmRight}"></div>
        <div class="${styles.dgDot}"></div>
        <!-- Arc-stop edge ticks: light when the door gun pins against a mount stop. -->
        <div data-ref="dgStopUp" class="${styles.dgStop} ${styles.dgStopUp}"></div>
        <div data-ref="dgStopDown" class="${styles.dgStop} ${styles.dgStopDown}"></div>
        <div data-ref="dgStopLeft" class="${styles.dgStop} ${styles.dgStopLeft}"></div>
        <div data-ref="dgStopRight" class="${styles.dgStop} ${styles.dgStopRight}"></div>
      </div>
      <div data-ref="fixedWing" class="${styles.fixedWingReticle}" style="display:none">
        <!-- Reflector ring boresighted to the nose-cannon convergence. -->
        <div class="${styles.fwRing}"></div>
        <!-- Four short cross ticks just outside the ring (gap at the bore). -->
        <div class="${styles.fwTick} ${styles.fwTickTop}"></div>
        <div class="${styles.fwTick} ${styles.fwTickBottom}"></div>
        <div class="${styles.fwTick} ${styles.fwTickLeft}"></div>
        <div class="${styles.fwTick} ${styles.fwTickRight}"></div>
        <!-- Bright center pipper. -->
        <div class="${styles.fwPipper}"></div>
      </div>
    `;
  }

  protected onMount(): void {
    this.cacheRefs();

    // Effect: mode switching
    this.effect(() => {
      const currentMode = this.mode.value;
      const visible = this.isVisible.value;
      const infantry = this.infantryEl;
      const pipper = this.pipperEl;
      const tankGunner = this.tankGunnerEl;
      const emplacementMg = this.emplacementMgEl;
      const doorGun = this.doorGunEl;
      const fixedWing = this.fixedWingEl;
      if (!infantry || !pipper || !tankGunner || !emplacementMg || !doorGun || !fixedWing) return;

      if (!visible) {
        this.root.classList.add(styles.hidden);
        return;
      }

      this.root.classList.remove(styles.hidden);

      // Exactly one reticle is shown per mode (or none for the crew-only heli
      // modes). Hide everything first, then reveal the active reticle.
      infantry.style.display = 'none';
      pipper.style.display = 'none';
      tankGunner.style.display = 'none';
      emplacementMg.style.display = 'none';
      doorGun.style.display = 'none';
      fixedWing.style.display = 'none';

      switch (currentMode) {
        case 'infantry':
          infantry.style.display = '';
          break;
        case 'helicopter_attack':
          pipper.style.display = '';
          this.loadPipperIcons();
          break;
        case 'tank_gunner':
          tankGunner.style.display = '';
          break;
        case 'emplacement_mg':
          emplacementMg.style.display = '';
          break;
        case 'door_gun':
          doorGun.style.display = '';
          break;
        case 'fixed_wing':
          fixedWing.style.display = '';
          break;
        case 'helicopter_transport':
        case 'helicopter_gunship':
          // Crew-operated weapons — no pilot reticle.
          break;
      }
    });

    // Effect: spread ring size
    this.effect(() => {
      const ring = this.spreadRingEl;
      if (!ring) return;
      const diameter = this.spreadRadius.value * 2;
      ring.style.width = `${diameter}px`;
      ring.style.height = `${diameter}px`;
    });

    // Effect: emplacement + door-gun arc-stop edge ticks — exactly one edge lit
    // (or none). Lighting the matching tick is the visual stop cue. The same
    // `traverseStop` signal drives both reticles; only the active mode's
    // element is visible, so a single source feeds both.
    this.effect(() => {
      const stop = this.traverseStop.value;
      const up = this.mgStopUpEl;
      const down = this.mgStopDownEl;
      const left = this.mgStopLeftEl;
      const right = this.mgStopRightEl;
      up?.classList.toggle(styles.mgStopActive, stop === 'up');
      down?.classList.toggle(styles.mgStopActive, stop === 'down');
      left?.classList.toggle(styles.mgStopActive, stop === 'left');
      right?.classList.toggle(styles.mgStopActive, stop === 'right');

      const dgUp = this.dgStopUpEl;
      const dgDown = this.dgStopDownEl;
      const dgLeft = this.dgStopLeftEl;
      const dgRight = this.dgStopRightEl;
      dgUp?.classList.toggle(styles.dgStopActive, stop === 'up');
      dgDown?.classList.toggle(styles.dgStopActive, stop === 'down');
      dgLeft?.classList.toggle(styles.dgStopActive, stop === 'left');
      dgRight?.classList.toggle(styles.dgStopActive, stop === 'right');
    });

    // Effect: attack-helicopter per-weapon reticle states. Keep this separate
    // from the per-frame rocket cue offset so lead updates do not rewrite
    // stable display properties.
    this.effect(() => {
      const weapon = this.heliWeapon.value;
      const gun = this.pipperGunEl;
      const rocket = this.pipperRocketEl;
      const cue = this.rocketCueEl;

      const rocketsActive = weapon === 'rockets';
      this.setDisplayIfChanged(gun, rocketsActive ? 'none' : '');
      this.setDisplayIfChanged(rocket, rocketsActive ? '' : 'none');
      this.setDisplayIfChanged(cue, rocketsActive ? '' : 'none');
    });

    // Effect: attack-helicopter CCIP cue transform. This can be pushed
    // per-frame by the adapter, so it only writes the transform that actually
    // changes with the lead solution.
    this.effect(() => {
      const weapon = this.heliWeapon.value;
      const offset = this.rocketCueOffset.value;
      const cue = this.rocketCueEl;
      if (weapon !== 'rockets' || !cue) return;

      // Drop the cue below the boresight pipper by the computed lead. The
      // element is centered on the bore; translate it straight down.
      const transform = `translate(-50%, calc(-50% + ${Math.max(0, offset)}px))`;
      if (cue.style.transform !== transform) {
        cue.style.transform = transform;
      }
    });
  }

  protected onUnmount(): void {
    this.infantryEl = null;
    this.pipperEl = null;
    this.tankGunnerEl = null;
    this.emplacementMgEl = null;
    this.doorGunEl = null;
    this.fixedWingEl = null;
    this.spreadRingEl = null;
    this.mgStopUpEl = null;
    this.mgStopDownEl = null;
    this.mgStopLeftEl = null;
    this.mgStopRightEl = null;
    this.dgStopUpEl = null;
    this.dgStopDownEl = null;
    this.dgStopLeftEl = null;
    this.dgStopRightEl = null;
    this.pipperGunEl = null;
    this.pipperRocketEl = null;
    this.rocketCueEl = null;
    this.pipperIconImgs = [];
  }

  // --- Public API (backward-compatible with CrosshairUI) ---

  showCrosshair(): void {
    this.isVisible.value = true;
  }

  hideCrosshair(): void {
    this.isVisible.value = false;
  }

  showCrosshairAgain(): void {
    this.isVisible.value = true;
  }

  getElement(): HTMLDivElement | undefined {
    return this.root;
  }

  setMode(mode: CrosshairMode): void {
    this.mode.value = mode;
  }

  getMode(): CrosshairMode {
    return this.mode.value;
  }

  setSpread(radius: number): void {
    this.spreadRadius.value = Math.max(0, radius);
  }

  /**
   * Light the active gunsight's edge tick for the arc/traverse stop the barrel
   * is pinned against, or clear it with `null`. Drives both the emplacement_mg
   * reticle (M2HB traverse stops, `EmplacementPlayerAdapter`) and the door_gun
   * reticle (helicopter door-gun arc stops, `HelicopterPlayerAdapter`); only the
   * visible mode's element shows the tick, so the call is a harmless no-op in
   * any mode without arc-stop geometry.
   */
  setTraverseStop(stop: TraverseStopDir): void {
    this.traverseStop.value = stop;
  }

  getTraverseStop(): TraverseStopDir {
    return this.traverseStop.value;
  }

  /**
   * Select which attack-helicopter weapon reticle is prominent: `'gun'` raises
   * the gun pipper, `'rockets'` raises the rocket pipper and reveals the CCIP
   * rocket-fall cue. A harmless no-op outside `helicopter_attack` (the pipper
   * group is hidden in other modes).
   */
  setHelicopterWeapon(weapon: HeliReticleWeapon): void {
    this.heliWeapon.value = weapon;
  }

  getHelicopterWeapon(): HeliReticleWeapon {
    return this.heliWeapon.value;
  }

  /**
   * Drop the CCIP rocket-fall cue this many pixels BELOW the boresight pipper
   * (clamped to ≥ 0). Pushed per-frame by the attack-helicopter adapter from
   * the live rocket-lead solution; shown only while rockets are selected.
   */
  setRocketCueOffset(offsetPx: number): void {
    this.rocketCueOffset.value = Math.max(0, offsetPx);
  }

  getRocketCueOffset(): number {
    return this.rocketCueOffset.value;
  }

  private loadPipperIcons(): void {
    if (this.pipperIconsLoaded) return;
    this.pipperIconsLoaded = true;
    for (const img of this.pipperIconImgs) {
      const name = img.getAttribute('data-icon');
      if (name && !img.src) {
        img.src = icon(name);
      }
    }
  }

  private cacheRefs(): void {
    this.infantryEl = this.$('[data-ref="infantry"]');
    this.pipperEl = this.$('[data-ref="pipper"]');
    this.tankGunnerEl = this.$('[data-ref="tankGunner"]');
    this.emplacementMgEl = this.$('[data-ref="emplacementMg"]');
    this.doorGunEl = this.$('[data-ref="doorGun"]');
    this.fixedWingEl = this.$('[data-ref="fixedWing"]');
    this.spreadRingEl = this.$('[data-ref="spreadRing"]');
    this.mgStopUpEl = this.$('[data-ref="mgStopUp"]');
    this.mgStopDownEl = this.$('[data-ref="mgStopDown"]');
    this.mgStopLeftEl = this.$('[data-ref="mgStopLeft"]');
    this.mgStopRightEl = this.$('[data-ref="mgStopRight"]');
    this.dgStopUpEl = this.$('[data-ref="dgStopUp"]');
    this.dgStopDownEl = this.$('[data-ref="dgStopDown"]');
    this.dgStopLeftEl = this.$('[data-ref="dgStopLeft"]');
    this.dgStopRightEl = this.$('[data-ref="dgStopRight"]');
    this.pipperGunEl = this.$('[data-ref="pipperGun"]');
    this.pipperRocketEl = this.$('[data-ref="pipperRocket"]');
    this.rocketCueEl = this.$('[data-ref="rocketCue"]');
    this.pipperIconImgs = Array.from(this.root.querySelectorAll<HTMLImageElement>('[data-icon]'));
  }

  private setDisplayIfChanged(element: HTMLElement | null, display: string): void {
    if (element && element.style.display !== display) {
      element.style.display = display;
    }
  }
}

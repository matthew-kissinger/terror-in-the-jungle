// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { Logger } from '../../utils/Logger';
import { zIndex } from '../design/tokens';
import { playElementAnimation } from '../engine/playElementAnimation';

const _scratchProjection = new THREE.Vector3();
const _screenResult = { x: 0, y: 0, z: 0 };

interface DamageNumber {
  element: HTMLDivElement;
  active: boolean;
  worldPos: THREE.Vector3;
  startTime: number;
  damage: number;
  isHeadshot: boolean;
  isKill: boolean;
  lastLeft: string;
  lastTop: string;
  lastOpacity: string;
}

export class DamageNumberSystem {
  private camera: THREE.Camera;
  private pool: DamageNumber[] = [];
  private activeNumbers: DamageNumber[] = [];
  private availableNumbers: DamageNumber[] = [];
  private container: HTMLDivElement;
  private readonly POOL_SIZE = 30;
  private readonly ANIMATION_DURATION = 800; // ms
  private readonly FLOAT_DISTANCE = 60; // pixels to float upward

  constructor(camera: THREE.Camera) {
    this.camera = camera;

    // Create container for damage numbers
    this.container = document.createElement('div');
    this.container.className = 'damage-numbers-container';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: ${zIndex.hudFeedback};
    `;

    // Initialize pool
    for (let i = 0; i < this.POOL_SIZE; i++) {
      const element = this.createDamageElement();
      const damageNumber: DamageNumber = {
        element,
        active: false,
        worldPos: new THREE.Vector3(),
        startTime: 0,
        damage: 0,
        isHeadshot: false,
        isKill: false,
        lastLeft: '',
        lastTop: '',
        lastOpacity: ''
      };
      this.pool.push(damageNumber);
      this.availableNumbers.push(damageNumber);
      this.container.appendChild(element);
    }

    // Inject CSS
    this.injectStyles();
  }

  private createDamageElement(): HTMLDivElement {
    const element = document.createElement('div');
    element.className = 'damage-number';
    element.style.cssText = `
      position: absolute;
      font-family: var(--font-primary);
      font-size: 18px;
      font-weight: bold;
      text-shadow:
        1px 1px 2px rgba(0, 0, 0, 0.9),
        0 0 4px rgba(0, 0, 0, 0.7);
      display: none;
      white-space: nowrap;
      transform: translate3d(-50%, -50%, 0);
      will-change: transform, opacity;
      backface-visibility: hidden;
    `;
    return element;
  }

  private injectStyles(): void {
    const styleId = 'damage-number-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes damageFloat {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.8);
        }
        15% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.2);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, calc(-50% - 60px)) scale(0.9);
        }
      }

      .damage-number.normal {
        color: rgba(231, 217, 186, 0.95);
      }

      .damage-number.headshot {
        color: rgba(168, 116, 42, 0.95);
        font-size: 20px;
        text-shadow:
          1px 1px 2px rgba(0, 0, 0, 0.9),
          0 0 4px rgba(168, 116, 42, 0.3);
      }

      .damage-number.kill {
        color: rgba(158, 59, 46, 0.95);
        font-size: 22px;
        text-shadow:
          1px 1px 2px rgba(0, 0, 0, 0.9),
          0 0 5px rgba(158, 59, 46, 0.4);
      }
    `;
    document.head.appendChild(style);
  }

  spawn(worldPos: THREE.Vector3, damage: number, isHeadshot: boolean = false, isKill: boolean = false): void {
    const damageNumber = this.availableNumbers.pop();

    if (!damageNumber) {
      Logger.warn('ui', 'Damage number pool exhausted');
      return;
    }

    // Activate and configure
    damageNumber.active = true;
    damageNumber.worldPos.copy(worldPos);
    damageNumber.startTime = performance.now();
    damageNumber.damage = Math.round(damage);
    damageNumber.isHeadshot = isHeadshot;
    damageNumber.isKill = isKill;
    this.activeNumbers.push(damageNumber);

    // Set text and style
    const element = damageNumber.element;
    element.textContent = `-${damageNumber.damage}`;
    element.className = 'damage-number';
    this.resetDamageNumberStyleCache(damageNumber);

    if (isKill) {
      element.classList.add('kill');
    } else if (isHeadshot) {
      element.classList.add('headshot');
    } else {
      element.classList.add('normal');
    }

    element.style.display = 'block';
    playElementAnimation(
      element,
      [
        { opacity: 0, transform: 'translate(-50%, -50%) scale(0.8)' },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1.2)', offset: 0.15 },
        { opacity: 0, transform: `translate(-50%, calc(-50% - ${this.FLOAT_DISTANCE}px)) scale(0.9)` }
      ],
      {
        duration: this.ANIMATION_DURATION,
        easing: 'ease-out',
        fill: 'forwards'
      }
    );

    // Update initial position
    this.updateDamageNumberPosition(damageNumber);
  }

  update(): void {
    if (this.activeNumbers.length === 0) return;

    const now = performance.now();

    for (let i = this.activeNumbers.length - 1; i >= 0; i--) {
      const damageNumber = this.activeNumbers[i];
      const elapsed = now - damageNumber.startTime;

      // Deactivate after animation completes
      if (elapsed >= this.ANIMATION_DURATION) {
        this.deactivateAt(i, damageNumber);
        continue;
      }

      // Update screen position as world position changes relative to camera
      this.updateDamageNumberPosition(damageNumber);
    }
  }

  private updateDamageNumberPosition(damageNumber: DamageNumber): void {
    // Project world position to screen coordinates
    const screenPos = this.worldToScreen(damageNumber.worldPos);

    // If behind camera or off-screen, hide
    if (screenPos.z > 1 || screenPos.x < 0 || screenPos.x > window.innerWidth ||
        screenPos.y < 0 || screenPos.y > window.innerHeight) {
      this.setDamageNumberOpacity(damageNumber, '0');
      return;
    }

    // Update position
    this.setDamageNumberOpacity(damageNumber, '');
    this.setDamageNumberLeft(damageNumber, `${screenPos.x}px`);
    this.setDamageNumberTop(damageNumber, `${screenPos.y}px`);
  }

  private deactivateAt(index: number, damageNumber: DamageNumber): void {
    damageNumber.active = false;
    damageNumber.element.style.display = 'none';
    const last = this.activeNumbers[this.activeNumbers.length - 1];
    if (last !== undefined) {
      this.activeNumbers[index] = last;
    }
    this.activeNumbers.pop();
    this.availableNumbers.push(damageNumber);
  }

  private resetDamageNumberStyleCache(damageNumber: DamageNumber): void {
    damageNumber.lastLeft = '';
    damageNumber.lastTop = '';
    damageNumber.lastOpacity = '';
    damageNumber.element.style.opacity = '';
  }

  private setDamageNumberLeft(damageNumber: DamageNumber, left: string): void {
    if (damageNumber.lastLeft === left) return;
    damageNumber.element.style.left = left;
    damageNumber.lastLeft = left;
  }

  private setDamageNumberTop(damageNumber: DamageNumber, top: string): void {
    if (damageNumber.lastTop === top) return;
    damageNumber.element.style.top = top;
    damageNumber.lastTop = top;
  }

  private setDamageNumberOpacity(damageNumber: DamageNumber, opacity: string): void {
    if (damageNumber.lastOpacity === opacity) return;
    damageNumber.element.style.opacity = opacity;
    damageNumber.lastOpacity = opacity;
  }

  private worldToScreen(worldPos: THREE.Vector3): { x: number; y: number; z: number } {
    _scratchProjection.copy(worldPos);
    _scratchProjection.project(this.camera);

    _screenResult.x = (_scratchProjection.x * 0.5 + 0.5) * window.innerWidth;
    _screenResult.y = (-_scratchProjection.y * 0.5 + 0.5) * window.innerHeight;
    _screenResult.z = _scratchProjection.z;

    return _screenResult;
  }

  attachToDOM(parent?: HTMLElement): void {
    (parent ?? document.body).appendChild(this.container);
  }

  dispose(): void {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }

    // Remove injected styles
    const styleElement = document.getElementById('damage-number-styles');
    if (styleElement) {
      styleElement.remove();
    }
  }
}

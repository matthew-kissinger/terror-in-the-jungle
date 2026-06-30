// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { StrikeGateStatus } from './StrikeGates';

export const STRIKE_TARGET_MARKER_NAME = 'StrikeTargetMarker';

interface StrikeTargetMarkerOptions {
  terrainHeightAt?: (x: number, z: number) => number;
}

const GROUND_OFFSET = 0.15;
const BEACON_HEIGHT = 5.5;

// Consistent colour roles with the HUD: GREEN valid, RED danger, AMBER
// pending-confirm/locked, GREY disabled/out-of-range/no-ground.
const COLOR_VALID = 0x5cb85c;
const COLOR_DANGER = 0xd6453d;
const COLOR_LOCKED = 0xe0a52c;
const COLOR_DISABLED = 0x9aa0a6;

function colorForStatus(status: StrikeGateStatus, locked: boolean): number {
  if (locked) return COLOR_LOCKED;
  switch (status) {
    case 'valid': return COLOR_VALID;
    case 'danger_close': return COLOR_DANGER;
    default: return COLOR_DISABLED; // out_of_range / no_ground
  }
}

/**
 * Ground beacon the player sweeps onto the dirt during DESIGNATE. Mirrors
 * `SquadCommandWorldMarker` (ring + fill + beacon, frustumCulled=false,
 * toneMapped=false so it stays a flat HUD colour under AgX). The outer ring is
 * sized to the strike's effect footprint; the colour tracks the gate status and
 * pulses on danger-close / lock so the state reads at a glance.
 */
export class StrikeTargetMarker {
  private readonly scene: THREE.Scene;
  private readonly terrainHeightAt?: (x: number, z: number) => number;
  private readonly group = new THREE.Group();
  private readonly ringGeometry = new THREE.RingGeometry(0.82, 1.0, 48);
  private readonly fillGeometry = new THREE.CircleGeometry(0.9, 32);
  private readonly postGeometry = new THREE.CylinderGeometry(0.05, 0.05, BEACON_HEIGHT, 8);
  private readonly capGeometry = new THREE.ConeGeometry(0.4, 0.9, 4);
  private readonly ring: THREE.Mesh;
  private readonly fill: THREE.Mesh;
  private readonly ringMaterial = this.createMaterial(COLOR_VALID, 0.85);
  private readonly fillMaterial = this.createMaterial(COLOR_VALID, 0.16);
  private readonly postMaterial = this.createMaterial(COLOR_VALID, 0.4);
  private readonly capMaterial = this.createMaterial(COLOR_VALID, 0.78);
  private pulseClock = 0;
  private pulsing = false;

  constructor(scene: THREE.Scene, options: StrikeTargetMarkerOptions = {}) {
    this.scene = scene;
    this.terrainHeightAt = options.terrainHeightAt;

    this.group.name = STRIKE_TARGET_MARKER_NAME;
    this.group.visible = false;
    this.group.userData.perfCategory = 'ui_command_marker';

    this.ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
    this.ring.name = 'StrikeTargetMarker.Ring';
    this.ring.rotation.x = -Math.PI / 2;

    this.fill = new THREE.Mesh(this.fillGeometry, this.fillMaterial);
    this.fill.name = 'StrikeTargetMarker.Fill';
    this.fill.rotation.x = -Math.PI / 2;
    this.fill.position.y = 0.02;

    const post = new THREE.Mesh(this.postGeometry, this.postMaterial);
    post.name = 'StrikeTargetMarker.Beacon';
    post.position.y = BEACON_HEIGHT * 0.5;

    const cap = new THREE.Mesh(this.capGeometry, this.capMaterial);
    cap.name = 'StrikeTargetMarker.Cap';
    cap.position.y = BEACON_HEIGHT + 0.3;

    for (const object of [this.ring, this.fill, post, cap]) {
      object.frustumCulled = false;
      object.renderOrder = 42;
      object.userData.perfCategory = 'ui_command_marker';
      this.group.add(object);
    }

    this.scene.add(this.group);
  }

  /** Place + recolour the marker for the current pick. `radius` sizes the ring. */
  setState(position: THREE.Vector3, status: StrikeGateStatus, locked: boolean, radius: number): void {
    const color = colorForStatus(status, locked);
    this.setColor(color);
    const r = Math.max(2, radius);
    this.ring.scale.set(r, r, 1);
    this.fill.scale.set(r * 0.95, r * 0.95, 1);
    this.group.position.set(position.x, this.resolveY(position), position.z);
    this.group.visible = true;
    this.pulsing = locked || status === 'danger_close';
    if (!this.pulsing) {
      this.pulseClock = 0;
      this.ringMaterial.opacity = 0.85;
    }
  }

  /** Animate the danger/lock pulse. Safe to call when hidden (no-op). */
  tick(dt: number): void {
    if (!this.group.visible || !this.pulsing) return;
    this.pulseClock += dt;
    // ~2 Hz opacity throb between 0.45 and 1.0.
    const t = 0.5 + 0.5 * Math.sin(this.pulseClock * Math.PI * 4);
    this.ringMaterial.opacity = 0.45 + 0.55 * t;
  }

  hide(): void {
    this.group.visible = false;
    this.pulsing = false;
  }

  isVisible(): boolean {
    return this.group.visible;
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.ringGeometry.dispose();
    this.fillGeometry.dispose();
    this.postGeometry.dispose();
    this.capGeometry.dispose();
    this.ringMaterial.dispose();
    this.fillMaterial.dispose();
    this.postMaterial.dispose();
    this.capMaterial.dispose();
  }

  private createMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
  }

  private setColor(color: number): void {
    this.ringMaterial.color.setHex(color);
    this.fillMaterial.color.setHex(color);
    this.postMaterial.color.setHex(color);
    this.capMaterial.color.setHex(color);
  }

  private resolveY(position: THREE.Vector3): number {
    const terrainY = this.terrainHeightAt?.(position.x, position.z);
    if (terrainY !== undefined && Number.isFinite(terrainY)) {
      return terrainY + GROUND_OFFSET;
    }
    return position.y + GROUND_OFFSET;
  }
}

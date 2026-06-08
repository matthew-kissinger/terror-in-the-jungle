// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';

const DIRECT_LIGHT_MAX_COMPONENT = 0.78;
const LOW_SUN_DIRECT_BLEND_START_Y = 0.28;
const LOW_SUN_DIRECT_BLEND_FULL_Y = 0.03;

function compressRendererColor(color: THREE.Color, maxComponent: number): THREE.Color {
  const peak = Math.max(color.r, color.g, color.b);
  if (peak > maxComponent && peak > 1e-6) {
    color.multiplyScalar(maxComponent / peak);
  }
  color.r = Math.max(0, Math.min(maxComponent, color.r));
  color.g = Math.max(0, Math.min(maxComponent, color.g));
  color.b = Math.max(0, Math.min(maxComponent, color.b));
  return color;
}

export function shapeDirectLightForRenderer(color: THREE.Color, sunY: number): THREE.Color {
  compressRendererColor(color, DIRECT_LIGHT_MAX_COMPONENT);

  const rawLowSun = (LOW_SUN_DIRECT_BLEND_START_Y - sunY)
    / (LOW_SUN_DIRECT_BLEND_START_Y - LOW_SUN_DIRECT_BLEND_FULL_Y);
  const lowSun = Math.max(0, Math.min(1, Number.isFinite(rawLowSun) ? rawLowSun : 0));
  const t = lowSun * lowSun * (3 - 2 * lowSun);
  if (t <= 0) return color;

  const luma = Math.max(0.08, Math.min(
    DIRECT_LIGHT_MAX_COMPONENT,
    0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b,
  ));
  const targetR = Math.min(DIRECT_LIGHT_MAX_COMPONENT, luma * 0.72);
  const targetG = Math.min(DIRECT_LIGHT_MAX_COMPONENT, luma * 1.02);
  const targetB = Math.min(DIRECT_LIGHT_MAX_COMPONENT, luma * 1.20);
  const desaturate = Math.min(1, t * 1.12);
  color.r += (targetR - color.r) * desaturate;
  color.g += (targetG - color.g) * desaturate;
  color.b += (targetB - color.b) * desaturate;
  return color;
}

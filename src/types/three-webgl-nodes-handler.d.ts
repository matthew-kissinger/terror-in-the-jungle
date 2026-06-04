// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

declare module 'three/addons/tsl/WebGLNodesHandler.js' {
  import type { Camera, Material, Object3D, Scene, WebGLRenderer } from 'three';

  export class WebGLNodesHandler {
    setRenderer(renderer: WebGLRenderer): void;
    renderStart(scene: Scene, camera: Camera): void;
    renderEnd(): void;
    build(material: Material, object: Object3D, parameters: unknown): void;
    onUpdateProgram(material: Material, program: unknown, materialProperties: unknown): void;
  }
}

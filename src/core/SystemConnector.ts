import * as THREE from 'three';
import type { SystemKeyToType } from './SystemRegistry';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';
import { IGameRenderer } from '../types/SystemInterfaces';
import {
  createStartupPlayerRuntimeGroups,
  wireStartupPlayerRuntime,
} from './StartupPlayerRuntimeComposer';
import {
  createOperationalRuntimeGroups,
  wireOperationalRuntime,
} from './OperationalRuntimeComposer';
import {
  createGameplayRuntimeGroups,
  wireGameplayRuntime,
} from './GameplayRuntimeComposer';

/**
 * Handles wiring up dependencies between game systems.
 *
 * Organized into logical groups so the dependency graph is readable.
 * Each private method wires one subsystem cluster; the public entry
 * point calls them in the required topological order.
 */
export class SystemConnector {
  connectSystems(
    refs: SystemKeyToType,
    _scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer?: IGameRenderer
  ): void {
    wireStartupPlayerRuntime(createStartupPlayerRuntimeGroups(refs), { camera, renderer });
    wireGameplayRuntime(createGameplayRuntimeGroups(refs), { camera, renderer });
    wireOperationalRuntime(createOperationalRuntimeGroups(refs));
    this.wireNavigation(refs);
    this.wireTelemetry(refs, renderer);
  }

  // ── Navigation (navmesh) ──

  private wireNavigation(refs: SystemKeyToType): void {
    refs.combatantSystem.setNavmeshSystem(refs.navmeshSystem);
  }

  // ── Telemetry ──

  private wireTelemetry(refs: SystemKeyToType, renderer?: IGameRenderer): void {
    performanceTelemetry.injectBenchmarkDependencies({
      hitDetection: refs.combatantSystem.combatantCombat?.hitDetection,
      terrainRuntime: refs.terrainSystem,
      combatants: refs.combatantSystem.combatants,
      spatialGridManager: refs.spatialGridManager
    });

    if (renderer && renderer.renderer) {
      performanceTelemetry.initGPUTiming(renderer.renderer);
    }
  }
}

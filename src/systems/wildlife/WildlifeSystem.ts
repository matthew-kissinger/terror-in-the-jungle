// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { GameSystem } from '../../types';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import type { GameMode, GameModeConfig, ZoneConfig } from '../../config/gameModeTypes';
import { Logger } from '../../utils/Logger';
import { modelLoader } from '../assets/ModelLoader';
import {
  WILDLIFE_CONFIG,
  WILDLIFE_ROSTER,
  WILDLIFE_ALLOWED_MODES,
  type WildlifeSpecies,
} from '../../config/WildlifeConfig';

/**
 * Minimal source of the game mode + objective layout the spawner needs. The
 * runtime wires the concrete `GameModeManager`; tests pass a tiny stub. We only
 * read `getCurrentConfig()` so we never couple to the full manager surface.
 */
export interface WildlifeModeProvider {
  getCurrentConfig(): Pick<GameModeConfig, 'id' | 'zones' | 'worldSize'>;
}

/**
 * Read-only player-position source. We deliberately do NOT depend on the full
 * fenced `IPlayerController` surface — wildlife only needs the player's world
 * position to bias spawns and trigger flee, so this narrow shape keeps the
 * coupling (and the test double) tiny. The concrete `PlayerController` and
 * `IPlayerController` both satisfy it via `getPosition(target?)`.
 */
export interface WildlifePlayerProvider {
  getPosition(target?: THREE.Vector3): THREE.Vector3;
}

interface WildlifeAgent {
  readonly id: string;
  readonly species: WildlifeSpecies;
  readonly object: THREE.Object3D;
  heading: number;
  /**
   * Whether the animal is committed to a flee escape. Latched true the moment
   * the player enters the trigger radius and held until the animal clears the
   * flee-despawn range (at which point it is culled), so a slow animal never
   * relapses into a calm wander while the player is still on top of it.
   */
  fleeing: boolean;
}

const _playerPos = new THREE.Vector3();
const _agentToPlayer = new THREE.Vector3();

/**
 * Ambient ground-wildlife spawner (ambient-wildlife-mvp). Spawns up to a small
 * cap of animals around the player in allowed modes, drifts them on a slow
 * wander, and bursts them away on close player proximity before despawning at
 * range. Terrain is read through `ITerrainRuntime` (height clamp + slope reject)
 * — never the navmesh — and the whole system runs on a cold internal cadence so
 * it stays off the combat render/AI hot path.
 *
 * Update is driven from the untracked "Other" block (like WorldFeatureSystem):
 * its per-frame `update()` is a near no-op until the cadence accumulator fires.
 */
export class WildlifeSystem implements GameSystem {
  private readonly scene: THREE.Scene;
  private terrain?: ITerrainRuntime;
  private modeProvider?: WildlifeModeProvider;
  private player?: WildlifePlayerProvider;

  private readonly agents: WildlifeAgent[] = [];
  private cadenceAccumulator = 0;
  private nextAgentId = 0;
  private active = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  async init(): Promise<void> {
    Logger.info('world', 'Initializing Wildlife System...');
  }

  configureDependencies(deps: {
    terrain: ITerrainRuntime;
    modeProvider: WildlifeModeProvider;
    player: WildlifePlayerProvider;
  }): void {
    this.terrain = deps.terrain;
    this.modeProvider = deps.modeProvider;
    this.player = deps.player;
  }

  /** Swap the mode source at runtime (used when the active game mode changes). */
  setModeProvider(modeProvider: WildlifeModeProvider): void {
    this.modeProvider = modeProvider;
  }

  /** Active animal count — for telemetry, tests, and the zero-cost harness check. */
  getActiveCount(): number {
    return this.agents.length;
  }

  update(deltaTime: number): void {
    this.cadenceAccumulator += deltaTime;
    if (this.cadenceAccumulator < WILDLIFE_CONFIG.updateIntervalSeconds) {
      return;
    }
    const step = this.cadenceAccumulator;
    this.cadenceAccumulator = 0;
    this.tick(step);
  }

  dispose(): void {
    for (const agent of this.agents) {
      this.releaseAgent(agent);
    }
    this.agents.length = 0;
    this.active = false;
    this.cadenceAccumulator = 0;
  }

  private tick(step: number): void {
    if (!this.terrain || !this.modeProvider || !this.player) {
      return;
    }

    const config = this.modeProvider.getCurrentConfig();
    if (!this.isModeAllowed(config.id)) {
      // Mode without wildlife (or a combat-stress harness): clear and idle.
      if (this.agents.length > 0) {
        this.dispose();
      }
      this.active = false;
      return;
    }
    this.active = true;

    if (!this.terrain.isTerrainReady()) {
      return;
    }

    this.player.getPosition(_playerPos);

    this.advanceAgents(step, _playerPos);

    for (let attempt = 0; attempt < WILDLIFE_CONFIG.spawnAttemptsPerTick; attempt++) {
      if (this.agents.length >= WILDLIFE_CONFIG.maxActive) {
        break;
      }
      this.trySpawn(config.zones ?? [], _playerPos);
    }
  }

  private isModeAllowed(mode: GameMode): boolean {
    return WILDLIFE_ALLOWED_MODES.includes(mode);
  }

  /**
   * Move every agent one cadence step: fleeing animals burst directly away from
   * the player; idle animals drift their heading and wander forward. Animals
   * that wander past the cull range, or flee out past the flee-despawn range,
   * are removed.
   */
  private advanceAgents(step: number, playerPos: THREE.Vector3): void {
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const agent = this.agents[i];
      _agentToPlayer.copy(agent.object.position).sub(playerPos);
      _agentToPlayer.y = 0;
      const playerDistance = _agentToPlayer.length();

      if (playerDistance > WILDLIFE_CONFIG.despawnDistanceM) {
        this.removeAgentAt(i);
        continue;
      }

      // Latch the flee escape the moment the player breaches the trigger
      // radius. A committed animal then bursts away every tick until it clears
      // the cull range, where it fades out — it never relapses mid-escape.
      if (playerDistance < WILDLIFE_CONFIG.fleeTriggerDistanceM) {
        agent.fleeing = true;
      }
      if (agent.fleeing && playerDistance > WILDLIFE_CONFIG.fleeDespawnDistanceM) {
        this.removeAgentAt(i);
        continue;
      }

      if (agent.fleeing) {
        // _agentToPlayer points away from the player; steer the heading to it.
        agent.heading = Math.atan2(_agentToPlayer.x, _agentToPlayer.z);
      } else {
        agent.heading += (Math.random() - 0.5) * WILDLIFE_CONFIG.wanderTurnRateRad * step * 2;
      }

      const speed = agent.fleeing
        ? agent.species.wanderSpeed * agent.species.fleeSpeedMultiplier
        : agent.species.wanderSpeed;
      this.stepAgent(agent, speed, step);
    }
  }

  /** Advance an agent along its heading, slope-permitting, and ground-clamp it. */
  private stepAgent(agent: WildlifeAgent, speed: number, step: number): void {
    if (!this.terrain) {
      return;
    }
    const distance = speed * step;
    const nextX = agent.object.position.x + Math.sin(agent.heading) * distance;
    const nextZ = agent.object.position.z + Math.cos(agent.heading) * distance;

    if (this.isWalkable(nextX, nextZ)) {
      agent.object.position.x = nextX;
      agent.object.position.z = nextZ;
    } else {
      // Blocked by a steep face: turn away rather than climb it.
      agent.heading += Math.PI * 0.5;
    }

    agent.object.position.y = this.terrain.getHeightAt(agent.object.position.x, agent.object.position.z);
    agent.object.rotation.y = agent.heading;
  }

  private isWalkable(x: number, z: number): boolean {
    if (!this.terrain) {
      return false;
    }
    if (this.terrain.hasTerrainAt && !this.terrain.hasTerrainAt(x, z)) {
      return false;
    }
    return this.terrain.getSlopeAt(x, z) <= WILDLIFE_CONFIG.maxWalkableSlope;
  }

  /**
   * Attempt one spawn: pick a ring point around the player, reject it if it is
   * too close to the player, near an objective/base, or on un-walkable ground.
   * Loads the species GLB lazily through the shared model loader.
   */
  private trySpawn(zones: readonly ZoneConfig[], playerPos: THREE.Vector3): void {
    for (let attempt = 0; attempt < WILDLIFE_CONFIG.spawnCandidateTries; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius =
        WILDLIFE_CONFIG.minPlayerSpawnDistanceM +
        Math.random() * (WILDLIFE_CONFIG.maxPlayerSpawnDistanceM - WILDLIFE_CONFIG.minPlayerSpawnDistanceM);
      const x = playerPos.x + Math.cos(angle) * radius;
      const z = playerPos.z + Math.sin(angle) * radius;

      if (!this.isWalkable(x, z)) {
        continue;
      }
      if (this.isNearObjective(x, z, zones)) {
        continue;
      }

      const species = WILDLIFE_ROSTER[Math.floor(Math.random() * WILDLIFE_ROSTER.length)];
      void this.spawnSpecies(species, x, z);
      return;
    }
  }

  private isNearObjective(x: number, z: number, zones: readonly ZoneConfig[]): boolean {
    for (const zone of zones) {
      const dx = x - zone.position.x;
      const dz = z - zone.position.z;
      if (Math.hypot(dx, dz) < WILDLIFE_CONFIG.objectiveExclusionM + zone.radius) {
        return true;
      }
    }
    return false;
  }

  private async spawnSpecies(species: WildlifeSpecies, x: number, z: number): Promise<void> {
    // Guard the cap again after the async load resolves — many ticks may have
    // passed and other spawns / despawns can have changed the count.
    if (this.agents.length >= WILDLIFE_CONFIG.maxActive || !this.active || !this.terrain || !this.player) {
      return;
    }
    let object: THREE.Object3D;
    try {
      object = await modelLoader.loadModel(species.modelPath);
    } catch (error) {
      Logger.warn('world', `Failed to load wildlife model ${species.modelPath}`, error);
      return;
    }
    if (this.agents.length >= WILDLIFE_CONFIG.maxActive || !this.active || !this.terrain || !this.player) {
      modelLoader.disposeInstance(object);
      return;
    }

    // The ring point was sampled outside the min-spawn exclusion at sample time,
    // but a player moving toward it during the async load can pull the spawn
    // inside the 80m ring. Re-measure against the player's CURRENT position
    // (horizontal only, matching advanceAgents) and bail rather than pop an
    // animal in too close.
    this.player.getPosition(_playerPos);
    _agentToPlayer.set(x - _playerPos.x, 0, z - _playerPos.z);
    if (_agentToPlayer.length() < WILDLIFE_CONFIG.minPlayerSpawnDistanceM) {
      modelLoader.disposeInstance(object);
      return;
    }

    object.scale.multiplyScalar(species.displayScale);
    object.position.set(x, this.terrain.getHeightAt(x, z), z);
    const heading = Math.random() * Math.PI * 2;
    object.rotation.y = heading;
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    object.userData.perfCategory = 'wildlife';
    this.scene.add(object);

    this.agents.push({
      id: `wildlife_${species.id}_${this.nextAgentId++}`,
      species,
      object,
      heading,
      fleeing: false,
    });
  }

  private removeAgentAt(index: number): void {
    const agent = this.agents[index];
    this.releaseAgent(agent);
    this.agents.splice(index, 1);
  }

  private releaseAgent(agent: WildlifeAgent): void {
    if (typeof modelLoader.disposeInstance === 'function') {
      modelLoader.disposeInstance(agent.object);
    } else {
      agent.object.removeFromParent();
    }
  }
}

import * as THREE from 'three';
import { GameSystem } from '../../types';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { AssetLoader } from '../assets/AssetLoader';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { Combatant, CombatantState, Faction, SquadCommand } from './types';
import { TracerPool } from '../effects/TracerPool';
import { MuzzleFlashPool } from '../effects/MuzzleFlashPool';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { ExplosionEffectsPool } from '../effects/ExplosionEffectsPool';
import { TicketSystem } from '../world/TicketSystem';
import { PlayerHealthSystem } from '../player/PlayerHealthSystem';
import { ZoneManager, ZoneState } from '../world/ZoneManager';
import { AudioManager } from '../audio/AudioManager';
import { GameModeManager } from '../world/GameModeManager';
import { Logger } from '../../utils/Logger';

// Refactored modules
import { CombatantFactory } from './CombatantFactory';
import { CombatantAI } from './CombatantAI';
import { CombatantCombat } from './CombatantCombat';
import { CombatantMovement } from './CombatantMovement';
import { CombatantRenderer } from './CombatantRenderer';
import { SquadManager } from './SquadManager';
import { SpatialGrid } from './SpatialGrid';

export class CombatantSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private globalBillboardSystem: GlobalBillboardSystem;
  private assetLoader: AssetLoader;
  private chunkManager?: ImprovedChunkManager;
  private ticketSystem?: TicketSystem;
  private playerHealthSystem?: PlayerHealthSystem;
  private zoneManager?: ZoneManager;
  private audioManager?: AudioManager;

  // Refactored modules
  private combatantFactory: CombatantFactory;
  private combatantAI: CombatantAI;
  private combatantCombat: CombatantCombat;
  private combatantMovement: CombatantMovement;
  private combatantRenderer: CombatantRenderer;
  private squadManager: SquadManager;
  private spatialGrid: SpatialGrid;

  // Effects pools
  private tracerPool: TracerPool;
  private muzzleFlashPool: MuzzleFlashPool;
  private impactEffectsPool: ImpactEffectsPool;
  private explosionEffectsPool: ExplosionEffectsPool;

  // Combatant management
  private combatants: Map<string, Combatant> = new Map();
  private readonly scratchCombatants: Combatant[] = [];
  private readonly scratchVector = new THREE.Vector3();
  private lodHighCount = 0;
  private lodMediumCount = 0;
  private lodLowCount = 0;
  private lodCulledCount = 0;
  private updateLastMs = 0;
  private updateEmaMs = 0;
  private readonly UPDATE_EMA_ALPHA = 0.1;
  private pendingRespawns: Array<{squadId: string, respawnTime: number, originalId: string}> = [];

  // Player tracking
  private playerPosition = new THREE.Vector3();
  private playerFaction = Faction.US;

  // Spawn management
  private MAX_COMBATANTS = 30; // Default to Zone Control limit
  private readonly DESPAWN_DISTANCE = 150;
  private lastSpawnCheck = 0;
  private SPAWN_CHECK_INTERVAL = 3000;
  private readonly PROGRESSIVE_SPAWN_DELAY = 1000;
  private progressiveSpawnTimer = 0;
  private progressiveSpawnQueue: Array<{faction: Faction, position: THREE.Vector3, size: number}> = [];
  private reinforcementWaveTimer = 0;
  private reinforcementWaveIntervalSeconds = 15;
  private readonly CORPSE_CLEANUP_DISTANCE = 600;

  // Adaptive update timing
  private frameDeltaEma = 1 / 60; // seconds
  private readonly FRAME_EMA_ALPHA = 0.1;
  private intervalScale = 1.0; // Scales min update intervals when FPS is low
  private readonly BASE_MEDIUM_MS = 50;  // ~20 Hz
  private readonly BASE_LOW_MS = 100;    // ~10 Hz
  private readonly BASE_CULLED_MS = 300; // ~3 Hz

  // Compute a smooth, distance-based update interval (milliseconds)
  private computeDynamicIntervalMs(distance: number): number {
    // Scale parameters based on world size for better performance in large worlds
    const worldSize = this.gameModeManager?.getWorldSize() || 4000;
    const isLargeWorld = worldSize > 1000;

    const startScaleAt = isLargeWorld ? 120 : 80; // units
    const maxScaleAt = isLargeWorld ? 600 : 1000; // units
    const minMs = isLargeWorld ? 33 : 16;         // ~30Hz vs 60Hz near for large worlds
    const maxMs = isLargeWorld ? 1000 : 500;      // More aggressive scaling in large worlds

    const d = Math.max(0, distance - startScaleAt);
    const t = Math.min(1, d / Math.max(1, maxScaleAt - startScaleAt));
    // Quadratic ease for smoother falloff
    const curve = t * t;
    return minMs + curve * (maxMs - minMs);
  }

  // Player proxy
  private playerProxyId: string = 'player_proxy';
  private combatEnabled = false;

  // Game Mode Manager
  private gameModeManager?: GameModeManager;

  // Player squad
  public shouldCreatePlayerSquad = false;
  public playerSquadId?: string;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    globalBillboardSystem: GlobalBillboardSystem,
    assetLoader: AssetLoader,
    chunkManager?: ImprovedChunkManager
  ) {
    this.scene = scene;
    this.camera = camera;
    this.globalBillboardSystem = globalBillboardSystem;
    this.assetLoader = assetLoader;
    this.chunkManager = chunkManager;

    // Initialize effect pools
    this.tracerPool = new TracerPool(this.scene, 256);
    this.muzzleFlashPool = new MuzzleFlashPool(this.scene, 128);
    this.impactEffectsPool = new ImpactEffectsPool(this.scene, 128);
    this.explosionEffectsPool = new ExplosionEffectsPool(this.scene, 16);

    // Initialize modules
    this.combatantFactory = new CombatantFactory();
    this.combatantAI = new CombatantAI();
    this.combatantRenderer = new CombatantRenderer(scene, camera, assetLoader);
    this.combatantCombat = new CombatantCombat(
      scene,
      this.tracerPool,
      this.muzzleFlashPool,
      this.impactEffectsPool,
      this.combatantRenderer
    );
    this.combatantMovement = new CombatantMovement(chunkManager, undefined);
    this.squadManager = new SquadManager(this.combatantFactory, chunkManager);
    this.spatialGrid = new SpatialGrid(30, 4000); // 30m cell size, 4000m default world
  }

  async init(): Promise<void> {
    console.log('🎖️ Initializing Combatant System (US vs OPFOR)...');

    // Create billboard meshes for each faction and state
    await this.combatantRenderer.createFactionBillboards();

    // Spawn initial forces
    this.spawnInitialForces();

    console.log('✅ Combatant System initialized');
  }

  private spawnInitialForces(): void {
    console.log('🎖️ Deploying initial forces across HQs...');

    const config = this.gameModeManager?.getCurrentConfig();
    const avgSquadSize = this.getAverageSquadSize();
    const targetPerFaction = Math.floor(this.MAX_COMBATANTS / 2);
    const initialPerFaction = Math.max(avgSquadSize, Math.floor(targetPerFaction * 0.3));
    let initialSquadsPerFaction = Math.max(1, Math.round(initialPerFaction / avgSquadSize));

    const usHQs = this.getHQZonesForFaction(Faction.US, config);
    const opforHQs = this.getHQZonesForFaction(Faction.OPFOR, config);
    const { usBasePos, opforBasePos } = this.getBasePositions();

    // Create player squad first if requested
    if (this.shouldCreatePlayerSquad) {
      console.log('🎖️ Creating player squad...');
      const playerSpawnPos = usBasePos.clone().add(new THREE.Vector3(0, 0, -15));
      const { squad, members } = this.squadManager.createSquad(Faction.US, playerSpawnPos, 6);
      this.playerSquadId = squad.id;
      squad.isPlayerControlled = true;
      squad.currentCommand = SquadCommand.NONE;
      squad.commandPosition = playerSpawnPos.clone();

      // Add all squad members to combatants map
      members.forEach(combatant => {
        this.combatants.set(combatant.id, combatant);
      });

      console.log(`✅ Player squad created: ${squad.id} with ${squad.members.length} members at player spawn`);

      // Reduce US squads by 1 since we already spawned the player squad
      initialSquadsPerFaction = Math.max(0, initialSquadsPerFaction - 1);
    }

    // Fallback to legacy base positions if no HQs configured
    if (usHQs.length === 0 || opforHQs.length === 0) {
      if (initialSquadsPerFaction > 0) {
        this.spawnSquad(Faction.US, usBasePos, avgSquadSize);
      }
      this.spawnSquad(Faction.OPFOR, opforBasePos, avgSquadSize);
    } else {
      // Distribute squads evenly across HQs
      for (let i = 0; i < initialSquadsPerFaction; i++) {
        const posUS = usHQs[i % usHQs.length].position.clone().add(this.randomSpawnOffset(20, 40));
        const posOP = opforHQs[i % opforHQs.length].position.clone().add(this.randomSpawnOffset(20, 40));
        this.spawnSquad(Faction.US, posUS, this.randomSquadSize());
        this.spawnSquad(Faction.OPFOR, posOP, this.randomSquadSize());
      }
    }

    // Seed a small progressive queue to get early contact
    this.progressiveSpawnQueue = [
      { faction: Faction.US, position: usBasePos.clone().add(new THREE.Vector3(10, 0, 5)), size: Math.max(2, Math.floor(avgSquadSize * 0.6)) },
      { faction: Faction.OPFOR, position: opforBasePos.clone().add(new THREE.Vector3(-10, 0, -5)), size: Math.max(2, Math.floor(avgSquadSize * 0.6)) }
    ];

    // Update AI with all squads
    this.combatantAI.setSquads(this.squadManager.getAllSquads());

    console.log(`🎖️ Initial forces deployed: ${this.combatants.size} combatants`);
  }

  private getBasePositions(): { usBasePos: THREE.Vector3; opforBasePos: THREE.Vector3 } {
    if (this.gameModeManager) {
      const config = this.gameModeManager.getCurrentConfig();

      // Find main bases for each faction
      const usBase = config.zones.find(z =>
        z.isHomeBase && z.owner === Faction.US &&
        (z.id.includes('main') || z.id === 'us_base')
      );
      const opforBase = config.zones.find(z =>
        z.isHomeBase && z.owner === Faction.OPFOR &&
        (z.id.includes('main') || z.id === 'opfor_base')
      );

      if (usBase && opforBase) {
        return {
          usBasePos: usBase.position.clone(),
          opforBasePos: opforBase.position.clone()
        };
      }
    }

    // Fallback to default positions
    return {
      usBasePos: new THREE.Vector3(0, 0, -50),
      opforBasePos: new THREE.Vector3(0, 0, 145)
    };
  }

  private spawnSquad(faction: Faction, centerPos: THREE.Vector3, size: number): void {
    const { squad, members } = this.squadManager.createSquad(faction, centerPos, size);

    // Add all squad members to our combatants map and spatial grid
    members.forEach(combatant => {
      this.combatants.set(combatant.id, combatant);
      this.spatialGrid.updatePosition(combatant.id, combatant.position);
    });
  }

  update(deltaTime: number): void {
    // Update FPS EMA and adjust interval scaling to target 30+ FPS
    this.frameDeltaEma = this.frameDeltaEma * (1 - this.FRAME_EMA_ALPHA) + deltaTime * this.FRAME_EMA_ALPHA;
    const fps = 1 / Math.max(0.001, this.frameDeltaEma);
    if (fps < 30) {
      // Scale intervals up when under target FPS (cap to 3x)
      this.intervalScale = Math.min(3.0, 30 / Math.max(10, fps));
    } else if (fps > 90) {
      // Slightly reduce intervals to feel more responsive on high FPS
      this.intervalScale = Math.max(0.75, 90 / fps);
    } else {
      this.intervalScale = 1.0;
    }
    // Update player position
    this.camera.getWorldPosition(this.playerPosition);

    const updateStart = performance.now();

    if (!this.combatEnabled) {
      // Still update positions and billboards for visual consistency
      this.updateCombatants(deltaTime);
      this.combatantRenderer.updateBillboards(this.combatants, this.playerPosition);
      this.combatantRenderer.updateShaderUniforms(deltaTime);
      const duration = performance.now() - updateStart;
      this.updateLastMs = duration;
      this.updateEmaMs = this.updateEmaMs * (1 - this.UPDATE_EMA_ALPHA) + duration * this.UPDATE_EMA_ALPHA;
      return;
    }

    // Ensure player proxy exists
    this.ensurePlayerProxy();

    // Progressive spawning (short early trickle)
    if (this.progressiveSpawnQueue.length > 0) {
      this.progressiveSpawnTimer += deltaTime * 1000;
      if (this.progressiveSpawnTimer >= this.PROGRESSIVE_SPAWN_DELAY) {
        this.progressiveSpawnTimer = 0;
        const spawn = this.progressiveSpawnQueue.shift()!;
        this.spawnSquad(spawn.faction, spawn.position, spawn.size);
        Logger.debug('combat', `Reinforcements deployed: ${spawn.faction} squad size ${spawn.size}`);
      }
    }

    // Wave-based reinforcements at owned zones (no spawn throttling; stability handled by maxCombatants)
    this.reinforcementWaveTimer += deltaTime;
    if (this.reinforcementWaveTimer >= this.reinforcementWaveIntervalSeconds) {
      this.reinforcementWaveTimer = 0;
      this.spawnReinforcementWave(Faction.US);
      this.spawnReinforcementWave(Faction.OPFOR);
    }

    // Periodic cleanup
    const now = Date.now();
    if (now - this.lastSpawnCheck > this.SPAWN_CHECK_INTERVAL) {
      this.manageSpawning();
      this.lastSpawnCheck = now;
    }

    // Update combatants
    this.updateCombatants(deltaTime);

    // Update billboard rotations
    this.combatantRenderer.updateBillboards(this.combatants, this.playerPosition);

    // Update shader uniforms (time, camera position, etc.)
    this.combatantRenderer.updateShaderUniforms(deltaTime);

    // Update effect pools
    this.tracerPool.update();
    this.muzzleFlashPool.update();
    this.impactEffectsPool.update(deltaTime);

    const duration = performance.now() - updateStart;
    this.updateLastMs = duration;
    this.updateEmaMs = this.updateEmaMs * (1 - this.UPDATE_EMA_ALPHA) + duration * this.UPDATE_EMA_ALPHA;
  }

  // Reseed forces when switching game modes to honor new HQ layouts and caps
  public reseedForcesForMode(): void {
    console.log('🔁 Reseeding forces for new game mode configuration...');
    this.combatants.clear();
    this.spatialGrid.clear();
    this.progressiveSpawnQueue = [];
    this.progressiveSpawnTimer = 0;
    this.reinforcementWaveTimer = 0;
    this.spawnInitialForces();
  }

  private ensurePlayerProxy(): void {
    let proxy = this.combatants.get(this.playerProxyId);
    if (!proxy) {
      proxy = this.combatantFactory.createPlayerProxy(this.playerPosition);
      this.combatants.set(this.playerProxyId, proxy);
      this.spatialGrid.updatePosition(this.playerProxyId, this.playerPosition);
    } else {
      proxy.position.copy(this.playerPosition);
      proxy.state = CombatantState.ENGAGING;
      this.spatialGrid.updatePosition(this.playerProxyId, this.playerPosition);
    }
  }

  private updateCombatants(deltaTime: number): void {
    // Reuse scratch array to avoid per-frame allocations
    this.scratchCombatants.length = 0;
    this.combatants.forEach(combatant => {
      this.scratchCombatants.push(combatant);
    });

    this.scratchCombatants.sort((a, b) => {
      const distA = a.position.distanceToSquared(this.playerPosition);
      const distB = b.position.distanceToSquared(this.playerPosition);
      return distA - distB;
    });

    const now = Date.now();
    const worldSize = this.gameModeManager?.getWorldSize() || 4000;
    const maxProcessingDistance = worldSize > 1000 ? 800 : 500; // Scale processing distance with world size

    this.lodHighCount = 0;
    this.lodMediumCount = 0;
    this.lodLowCount = 0;
    this.lodCulledCount = 0;

    this.scratchCombatants.forEach(combatant => {
      const distance = combatant.position.distanceTo(this.playerPosition);

      // Skip update entirely if off-map (chunk likely not loaded). Minimal maintenance only.
      if (Math.abs(combatant.position.x) > worldSize ||
          Math.abs(combatant.position.z) > worldSize) {
        // Nudge toward map center slowly so off-map agents don't explode simulation cost
        this.scratchVector.set(-Math.sign(combatant.position.x), 0, -Math.sign(combatant.position.z));
        combatant.position.addScaledVector(this.scratchVector, 0.2 * deltaTime);
        this.lodCulledCount++;
        return;
      }

      // Only care about AI that can actually affect gameplay
      const COMBAT_RANGE = 200; // Max engagement range + buffer

      if (distance > COMBAT_RANGE) {
        combatant.lodLevel = 'culled';
        this.lodCulledCount++;
        // Just teleport them toward random zones occasionally
        const elapsedMs = now - (combatant.lastUpdateTime || 0);
        if (elapsedMs > 30000) { // Update every 30 seconds
          this.simulateDistantAI(combatant);
          combatant.lastUpdateTime = now;
        }
        return;
      }

      const dynamicIntervalMs = this.computeDynamicIntervalMs(distance) * this.intervalScale;

      // Determine LOD level - scale distances based on world size
      const isLargeWorld = worldSize > 1000;
      const highLODRange = isLargeWorld ? 200 : 150;
      const mediumLODRange = isLargeWorld ? 400 : 300;
      const lowLODRange = isLargeWorld ? 600 : 500;

      if (distance < highLODRange) {
        combatant.lodLevel = 'high';
        this.lodHighCount++;
        this.updateCombatantFull(combatant, deltaTime);
      } else if (distance < mediumLODRange) {
        combatant.lodLevel = 'medium';
        this.lodMediumCount++;
        const elapsedMs = now - (combatant.lastUpdateTime || 0);
        if (elapsedMs > dynamicIntervalMs) {
          const effectiveDelta = combatant.lastUpdateTime ? Math.min(elapsedMs / 1000, 1.0) : deltaTime;
          this.updateCombatantMedium(combatant, effectiveDelta);
          combatant.lastUpdateTime = now;
        }
      } else if (distance < lowLODRange) {
        combatant.lodLevel = 'low';
        this.lodLowCount++;
        const elapsedMs = now - (combatant.lastUpdateTime || 0);
        if (elapsedMs > dynamicIntervalMs) {
          const maxEff = Math.min(2.0, dynamicIntervalMs / 1000 * 2);
          const effectiveDelta = combatant.lastUpdateTime ? Math.min(elapsedMs / 1000, maxEff) : deltaTime;
          this.updateCombatantBasic(combatant, effectiveDelta);
          combatant.lastUpdateTime = now;
        }
      } else {
        // Very far: still update basic movement infrequently to keep world alive
        combatant.lodLevel = 'culled';
        this.lodCulledCount++;
        const elapsedMs = now - (combatant.lastUpdateTime || 0);
        if (elapsedMs > dynamicIntervalMs) {
          // Allow larger effective delta for far agents to cover ground decisively
          const maxEff = Math.min(3.0, dynamicIntervalMs / 1000 * 3);
          const effectiveDelta = combatant.lastUpdateTime ? Math.min(elapsedMs / 1000, maxEff) : deltaTime;
          this.updateCombatantBasic(combatant, effectiveDelta);
          combatant.lastUpdateTime = now;
        }
      }
    });
  }

  private updateCombatantFull(combatant: Combatant, deltaTime: number): void {
    this.combatantAI.updateAI(combatant, deltaTime, this.playerPosition, this.combatants, this.spatialGrid);
    this.combatantMovement.updateMovement(
      combatant,
      deltaTime,
      this.squadManager.getAllSquads(),
      this.combatants
    );
    this.combatantCombat.updateCombat(
      combatant,
      deltaTime,
      this.playerPosition,
      this.combatants,
      this.squadManager.getAllSquads()
    );
    this.combatantRenderer.updateCombatantTexture(combatant);
    this.combatantMovement.updateRotation(combatant, deltaTime);
    // Update spatial grid after movement
    this.spatialGrid.updatePosition(combatant.id, combatant.position);
  }

  private updateCombatantMedium(combatant: Combatant, deltaTime: number): void {
    this.combatantAI.updateAI(combatant, deltaTime, this.playerPosition, this.combatants, this.spatialGrid);
    this.combatantMovement.updateMovement(
      combatant,
      deltaTime,
      this.squadManager.getAllSquads(),
      this.combatants
    );
    this.combatantCombat.updateCombat(
      combatant,
      deltaTime,
      this.playerPosition,
      this.combatants,
      this.squadManager.getAllSquads()
    );
    this.combatantMovement.updateRotation(combatant, deltaTime);
    // Update spatial grid after movement
    this.spatialGrid.updatePosition(combatant.id, combatant.position);
  }

  private updateCombatantBasic(combatant: Combatant, deltaTime: number): void {
    this.combatantMovement.updateMovement(
      combatant,
      deltaTime,
      this.squadManager.getAllSquads(),
      this.combatants
    );
    this.combatantMovement.updateRotation(combatant, deltaTime);
    // Update spatial grid after movement
    this.spatialGrid.updatePosition(combatant.id, combatant.position);
  }

  private manageSpawning(): void {
    // Handle pending respawns for player squad members
    const now = Date.now();
    const readyToRespawn = this.pendingRespawns.filter(r => r.respawnTime <= now);

    readyToRespawn.forEach(respawn => {
      console.log(`⏰ RESPAWN TRIGGERED at ${now} (was scheduled for ${respawn.respawnTime})`);
      this.respawnSquadMember(respawn.squadId);
    });

    this.pendingRespawns = this.pendingRespawns.filter(r => r.respawnTime > now);

    // Remove all dead combatants immediately - no body persistence
    const toRemove: string[] = [];

    this.combatants.forEach((combatant, id) => {
      if (combatant.state === CombatantState.DEAD) {
        toRemove.push(id);
      }
    });

    toRemove.forEach(id => this.removeCombatant(id));

    // Maintain minimum force strength during COMBAT phase OR when combat is enabled
    const phase = this.ticketSystem?.getGameState().phase;
    if (phase !== 'COMBAT' && !this.combatEnabled) return;

    const targetPerFaction = Math.floor(this.MAX_COMBATANTS / 2);
    const avgSquadSize = this.getAverageSquadSize();

    const ensureFactionStrength = (faction: Faction) => {
      const living = Array.from(this.combatants.values())
        .filter(c => c.faction === faction && c.state !== CombatantState.DEAD).length;
      const missing = Math.max(0, targetPerFaction - living);

      // More aggressive refill when strength is very low
      const criticalThreshold = Math.floor(targetPerFaction * 0.3);
      const isEmergencyRefill = living < criticalThreshold;

      if (missing <= 0) return;

      // Spawn up to two squads immediately to refill strength, respecting global cap
      const anchors = this.getFactionAnchors(faction);
      let squadsToSpawn = Math.min(2, Math.ceil(missing / Math.max(1, avgSquadSize)));

      // Emergency refill: spawn more aggressively
      if (isEmergencyRefill) {
        squadsToSpawn = Math.min(3, Math.ceil(missing / Math.max(1, avgSquadSize)));
        console.log(`🚨 Emergency refill for ${faction}: ${living}/${targetPerFaction} remaining`);
      }

      for (let i = 0; i < squadsToSpawn; i++) {
        if (this.combatants.size >= this.MAX_COMBATANTS) break;
        let pos: THREE.Vector3;
        if (anchors.length > 0) {
          const anchor = anchors[(i + Math.floor(Math.random() * anchors.length)) % anchors.length];
          pos = anchor.clone().add(this.randomSpawnOffset(20, 50));
        } else {
          pos = this.getSpawnPosition(faction);
        }
        this.spawnSquad(faction, pos, this.randomSquadSize());
        console.log(`🎖️ Refill spawn: ${faction} squad of ${this.randomSquadSize()} deployed (${living + (i+1)*avgSquadSize}/${targetPerFaction})`);
      }
    };

    ensureFactionStrength(Faction.US);
    ensureFactionStrength(Faction.OPFOR);
  }

  private getBaseSpawnPosition(faction: Faction): THREE.Vector3 {
    if (this.zoneManager) {
      const allZones = this.zoneManager.getAllZones();
      const ownedBases = allZones.filter(z => z.owner === faction && z.isHomeBase);

      if (ownedBases.length > 0) {
        const baseZone = ownedBases[Math.floor(Math.random() * ownedBases.length)];
        const anchor = baseZone.position;
        const angle = Math.random() * Math.PI * 2;
        const radius = 20 + Math.random() * 30;
        const spawnPos = new THREE.Vector3(
          anchor.x + Math.cos(angle) * radius,
          0,
          anchor.z + Math.sin(angle) * radius
        );
        console.log(`📍 Using base ${baseZone.id} for squad respawn at (${spawnPos.x.toFixed(1)}, ${spawnPos.z.toFixed(1)})`);
        return spawnPos;
      } else {
        console.log(`⚠️ No owned bases found for ${faction}, using fallback spawn`);
      }
    } else {
      console.log(`⚠️ No ZoneManager available, using fallback spawn`);
    }

    const { usBasePos, opforBasePos } = this.getBasePositions();
    const basePos = faction === Faction.US ? usBasePos : opforBasePos;

    const angle = Math.random() * Math.PI * 2;
    const radius = 20 + Math.random() * 30;
    const spawnPos = new THREE.Vector3(
      basePos.x + Math.cos(angle) * radius,
      0,
      basePos.z + Math.sin(angle) * radius
    );

    console.log(`📍 Using fallback base spawn for ${faction} at (${spawnPos.x.toFixed(1)}, ${spawnPos.z.toFixed(1)})`);
    return spawnPos;
  }

  private getSpawnPosition(faction: Faction): THREE.Vector3 {
    if (this.zoneManager) {
      const allZones = this.zoneManager.getAllZones();
      const owned = allZones.filter(z => z.owner === faction);

      // Prioritize contested friendly zones
      const contested = owned.filter(z => !z.isHomeBase && z.state === ZoneState.CONTESTED);
      const captured = owned.filter(z => !z.isHomeBase && z.state !== ZoneState.CONTESTED);
      const hqs = owned.filter(z => z.isHomeBase);

      const anchorZone = (contested[0] || captured[0] || hqs[0]);
      if (anchorZone) {
        const anchor = anchorZone.position;
        const angle = Math.random() * Math.PI * 2;
        const radius = 20 + Math.random() * 40;
        const spawnPos = new THREE.Vector3(
          anchor.x + Math.cos(angle) * radius,
          0,
          anchor.z + Math.sin(angle) * radius
        );
        console.log(`📍 Using zone ${anchorZone.id} as spawn anchor`);
        return spawnPos;
      } else {
        console.log(`⚠️ No owned zones found for ${faction}, using fallback spawn`);
      }
    } else {
      console.log(`⚠️ No ZoneManager available, using fallback spawn`);
    }

    // Fallback: spawn at fixed base positions (not near player!)
    const { usBasePos, opforBasePos } = this.getBasePositions();
    const basePos = faction === Faction.US ? usBasePos : opforBasePos;

    // Add random offset around the base
    const angle = Math.random() * Math.PI * 2;
    const radius = 20 + Math.random() * 30;
    const spawnPos = new THREE.Vector3(
      basePos.x + Math.cos(angle) * radius,
      0,
      basePos.z + Math.sin(angle) * radius
    );

    console.log(`📍 Using fallback base spawn for ${faction} at (${spawnPos.x.toFixed(1)}, ${spawnPos.z.toFixed(1)})`);
    return spawnPos;
  }

  private spawnReinforcementWave(faction: Faction): void {
    const targetPerFaction = Math.floor(this.MAX_COMBATANTS / 2);
    const currentFactionCount = Array.from(this.combatants.values())
      .filter(c => c.faction === faction && c.state !== CombatantState.DEAD).length;
    const missing = Math.max(0, targetPerFaction - currentFactionCount);
    if (missing === 0) return;

    const avgSquadSize = this.getAverageSquadSize();
    const maxSquadsThisWave = Math.max(1, Math.min(3, Math.ceil(missing / avgSquadSize / 2)));

    // Choose anchors across owned zones (contested first)
    const anchors = this.getFactionAnchors(faction);
    if (anchors.length === 0) {
      // Fallback: spawn near default base pos
      const pos = this.getSpawnPosition(faction);
      if (this.combatants.size < this.MAX_COMBATANTS) {
        this.spawnSquad(faction, pos, this.randomSquadSize());
      }
      return;
    }

    for (let i = 0; i < maxSquadsThisWave; i++) {
      if (this.combatants.size >= this.MAX_COMBATANTS) break;
      const anchor = anchors[i % anchors.length];
      const pos = anchor.clone().add(this.randomSpawnOffset(20, 50));
      this.spawnSquad(faction, pos, this.randomSquadSize());
    }
  }

  private getFactionAnchors(faction: Faction): THREE.Vector3[] {
    if (!this.zoneManager) return [];
    const zones = this.zoneManager.getAllZones().filter(z => z.owner === faction);
    const contested = zones.filter(z => !z.isHomeBase && z.state === ZoneState.CONTESTED).map(z => z.position);
    const captured = zones.filter(z => !z.isHomeBase && z.state !== ZoneState.CONTESTED).map(z => z.position);
    const hqs = zones.filter(z => z.isHomeBase).map(z => z.position);
    return [...contested, ...captured, ...hqs];
  }

  private getHQZonesForFaction(faction: Faction, config?: any): Array<{ position: THREE.Vector3 }> {
    const zones = config?.zones as Array<{ isHomeBase: boolean; owner: Faction; position: THREE.Vector3 }> | undefined;
    if (!zones) return [];
    return zones.filter(z => z.isHomeBase && z.owner === faction).map(z => ({ position: z.position }));
  }

  private randomSquadSize(): number {
    const min = (this as any).squadSizeMin || 3;
    const max = (this as any).squadSizeMax || 6;
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  private getAverageSquadSize(): number {
    const min = (this as any).squadSizeMin || 3;
    const max = (this as any).squadSizeMax || 6;
    return Math.round((min + max) / 2);
  }

  private randomSpawnOffset(minRadius: number, maxRadius: number): THREE.Vector3 {
    const angle = Math.random() * Math.PI * 2;
    const radius = minRadius + Math.random() * (maxRadius - minRadius);
    return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  }

  private removeCombatant(id: string): void {
    const combatant = this.combatants.get(id);
    if (combatant && combatant.squadId) {
      const squad = this.squadManager.getSquad(combatant.squadId);

      if (squad?.isPlayerControlled) {
        // Check if THIS specific combatant already queued
        const alreadyQueued = this.pendingRespawns.some(r => r.originalId === id);

        if (!alreadyQueued) {
          const now = Date.now();
          const respawnTime = now + 5000;
          console.log(`☠️ DEATH: Squad member ${id} died at ${now}`);
          console.log(`⏳ Queued respawn for ${respawnTime} (in 5 seconds)`);
          this.pendingRespawns.push({
            squadId: combatant.squadId,
            respawnTime: respawnTime,
            originalId: id
          });
        } else {
          console.log(`✓ Respawn already queued for ${id}`);
        }
      }

      this.squadManager.removeSquadMember(combatant.squadId, id);
    }
    this.spatialGrid.remove(id);
    this.combatants.delete(id);
  }

  private respawnSquadMember(squadId: string): void {
    const squad = this.squadManager.getSquad(squadId);
    if (!squad) {
      console.log(`⚠️ Cannot respawn - squad ${squadId} no longer exists`);
      return;
    }

    // Calculate squad centroid for reference
    const squadMembers = squad.members.map(id => this.combatants.get(id)).filter(c => c);
    const squadCentroid = new THREE.Vector3();
    if (squadMembers.length > 0) {
      squadMembers.forEach(m => {
        if (m) squadCentroid.add(m.position);
      });
      squadCentroid.divideScalar(squadMembers.length);
    }

    const spawnPos = this.getBaseSpawnPosition(squad.faction);
    const distanceFromSquad = spawnPos.distanceTo(squadCentroid);

    console.log(`🔄 Respawning squad member:`);
    console.log(`   Squad location: (${squadCentroid.x.toFixed(1)}, ${squadCentroid.z.toFixed(1)})`);
    console.log(`   Spawn location: (${spawnPos.x.toFixed(1)}, ${spawnPos.z.toFixed(1)})`);
    console.log(`   Distance: ${distanceFromSquad.toFixed(1)}m`);

    const newMember = this.combatantFactory.createCombatant(
      squad.faction,
      spawnPos,
      { squadId, squadRole: 'follower' }
    );

    newMember.isRejoiningSquad = true;

    squad.members.push(newMember.id);
    this.combatants.set(newMember.id, newMember);
    this.spatialGrid.updatePosition(newMember.id, newMember.position);

    console.log(`✅ Squad member ${newMember.id} spawned and moving to rejoin squad`);
  }

  // Public API
  handlePlayerShot(
    ray: THREE.Ray,
    damageCalculator: (distance: number, isHeadshot: boolean) => number
  ): { hit: boolean; point: THREE.Vector3; killed?: boolean; headshot?: boolean } {
    return this.combatantCombat.handlePlayerShot(ray, damageCalculator, this.combatants);
  }

  checkPlayerHit(ray: THREE.Ray): { hit: boolean; point: THREE.Vector3; headshot: boolean } {
    // Delegate to combat module
    return this.combatantCombat.checkPlayerHit(ray, this.playerPosition);
  }

  applyExplosionDamage(center: THREE.Vector3, radius: number, maxDamage: number): void {
    let hitCount = 0;

    this.combatants.forEach(combatant => {
      if (combatant.state === CombatantState.DEAD) return;

      const distance = combatant.position.distanceTo(center);

      if (distance <= radius) {
        const damagePercent = 1.0 - (distance / radius);
        const damage = maxDamage * damagePercent;

        combatant.health -= damage;

        if (combatant.health <= 0) {
          combatant.health = 0;
          combatant.state = CombatantState.DEAD;

          if (this.ticketSystem && typeof (this.ticketSystem as any).onCombatantKilled === 'function') {
            (this.ticketSystem as any).onCombatantKilled(combatant.faction);
          }

          // Queue respawn for player squad members
          if (combatant.squadId) {
            const squad = this.squadManager.getSquad(combatant.squadId);
            if (squad?.isPlayerControlled) {
              console.log(`⏳ Player squad member ${combatant.id} will respawn in 5 seconds...`);
              this.pendingRespawns.push({
                squadId: combatant.squadId,
                respawnTime: Date.now() + 5000,
                originalId: combatant.id
              });
            }
            this.squadManager.removeSquadMember(combatant.squadId, combatant.id);
          }

          console.log(`💥 ${combatant.faction} soldier killed by explosion (${damage.toFixed(0)} damage)`);
        } else {
          combatant.lastHitTime = Date.now();
          console.log(`💥 ${combatant.faction} soldier hit by explosion (${damage.toFixed(0)} damage, ${combatant.health.toFixed(0)} HP left)`);
        }

        hitCount++;
      }
    });

    if (hitCount > 0) {
      console.log(`💥 Explosion hit ${hitCount} combatants`);
    }
  }

  getCombatStats(): { us: number; opfor: number; total: number } {
    let us = 0;
    let opfor = 0;

    this.combatants.forEach(combatant => {
      if (combatant.state === CombatantState.DEAD) return;
      if (combatant.faction === Faction.US) {
        us++;
      } else {
        opfor++;
      }
    });

    return { us, opfor, total: us + opfor };
  }

  getAllCombatants(): Combatant[] {
    return Array.from(this.combatants.values());
  }

  // Setters for external systems
  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
    this.combatantMovement.setChunkManager(chunkManager);
    this.squadManager.setChunkManager(chunkManager);
    this.combatantAI.setChunkManager(chunkManager);
    this.combatantCombat.setChunkManager(chunkManager);
  }

  setTicketSystem(ticketSystem: TicketSystem): void {
    this.ticketSystem = ticketSystem;
    this.combatantCombat.setTicketSystem(ticketSystem);
  }

  setPlayerHealthSystem(playerHealthSystem: PlayerHealthSystem): void {
    this.playerHealthSystem = playerHealthSystem;
    this.combatantCombat.setPlayerHealthSystem(playerHealthSystem);
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager;
    this.combatantMovement.setZoneManager(zoneManager);
  }

  setHUDSystem(hudSystem: any): void {
    this.combatantCombat.setHUDSystem(hudSystem);
  }

  setGameModeManager(gameModeManager: GameModeManager): void {
    this.gameModeManager = gameModeManager;
    this.combatantMovement.setGameModeManager(gameModeManager);
    // Update spatial grid world size
    const worldSize = gameModeManager.getWorldSize();
    this.spatialGrid.setWorldSize(worldSize);
  }

  setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager;
    this.combatantCombat.setAudioManager(audioManager);
  }

  // Game mode configuration methods
  setMaxCombatants(max: number): void {
    this.MAX_COMBATANTS = max;
    Logger.info('combat', `Max combatants set to ${max}`);
  }

  setSquadSizes(min: number, max: number): void {
    // Store for future squad spawning
    (this as any).squadSizeMin = min;
    (this as any).squadSizeMax = max;
    Logger.info('combat', `Squad sizes set to ${min}-${max}`);
  }

  setReinforcementInterval(interval: number): void {
    this.SPAWN_CHECK_INTERVAL = Math.max(5, interval) * 1000;
    this.reinforcementWaveIntervalSeconds = Math.max(5, interval);
    Logger.info('combat', `Reinforcement interval set to ${interval} seconds`);
  }

  enableCombat(): void {
    this.combatEnabled = true;
    Logger.info('combat', 'Combat AI activated');
  }

  // Get the renderer for external configuration
  getRenderer(): CombatantRenderer {
    return this.combatantRenderer;
  }

  // Distant AI simulation with proper velocity scaling
  private simulateDistantAI(combatant: Combatant): void {
    if (!this.zoneManager) return;

    // Calculate how much time passed since last update (30 seconds)
    const simulationTimeStep = 30; // seconds
    const normalMovementSpeed = 4; // units per second (normal AI walking speed)

    // Scale movement to cover realistic distance over the simulation interval
    const distanceToMove = normalMovementSpeed * simulationTimeStep; // 120 units over 30 seconds

    // Find strategic target for this combatant
    const zones = this.zoneManager.getAllZones();
    const targetZones = zones.filter(zone => {
      // Target capturable zones or defend contested ones
      return !zone.isHomeBase && (
        zone.owner !== combatant.faction || zone.state === 'contested'
      );
    });

    if (targetZones.length > 0) {
      // Pick closest strategic zone
      let nearestZone = targetZones[0];
      let minDistance = combatant.position.distanceTo(nearestZone.position);

      for (const zone of targetZones) {
        const distance = combatant.position.distanceTo(zone.position);
        if (distance < minDistance) {
          minDistance = distance;
          nearestZone = zone;
        }
      }

      // Move toward the target zone at realistic speed
      const direction = new THREE.Vector3()
        .subVectors(nearestZone.position, combatant.position)
        .normalize();

      // Apply scaled movement
      const movement = direction.multiplyScalar(distanceToMove);
      combatant.position.add(movement);

      // Update rotation to face movement direction
      combatant.rotation = Math.atan2(direction.z, direction.x);

      // Add some randomness to avoid all AI clustering
      const randomOffset = new THREE.Vector3(
        (Math.random() - 0.5) * 20,
        0,
        (Math.random() - 0.5) * 20
      );
      combatant.position.add(randomOffset);

      // Keep on terrain
      if (this.chunkManager) {
        const terrainHeight = this.chunkManager.getHeightAt(combatant.position.x, combatant.position.z);
        combatant.position.y = terrainHeight + 3;
      } else {
        combatant.position.y = 5;
      }
    }
  }
  getTelemetry(): {
    lastMs: number;
    emaMs: number;
    lodHigh: number;
    lodMedium: number;
    lodLow: number;
    lodCulled: number;
    combatantCount: number;
  } {
    return {
      lastMs: this.updateLastMs,
      emaMs: this.updateEmaMs,
      lodHigh: this.lodHighCount,
      lodMedium: this.lodMediumCount,
      lodLow: this.lodLowCount,
      lodCulled: this.lodCulledCount,
      combatantCount: this.combatants.size
    };
  }


  dispose(): void {
    // Clean up modules
    this.combatantRenderer.dispose();
    this.squadManager.dispose();

    // Clean up pools
    this.tracerPool.dispose();
    this.muzzleFlashPool.dispose();
    this.impactEffectsPool.dispose();

    // Clear combatants
    this.combatants.clear();

    Logger.info('combat', 'Combatant system disposed');
  }
}

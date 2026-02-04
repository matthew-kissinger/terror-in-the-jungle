import * as THREE from 'three';
import { SystemReferences } from './SystemInitializer';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';
import { spatialGridManager } from '../systems/combat/SpatialGridManager';
import { setSmokeCloudSystem } from '../systems/effects/SmokeCloudSystem';
import { ISandboxRenderer } from '../types/SystemInterfaces';

/**
 * Handles wiring up dependencies between game systems
 */
export class SystemConnector {
  connectSystems(
    refs: SystemReferences,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    sandboxRenderer?: ISandboxRenderer
  ): void {
    // Connect systems with chunk manager
    refs.playerController.setChunkManager(refs.chunkManager);
    refs.playerController.setGameModeManager(refs.gameModeManager);
    refs.playerController.setHelicopterModel(refs.helicopterModel);
    refs.playerController.setFirstPersonWeapon(refs.firstPersonWeapon);
    refs.playerController.setHUDSystem(refs.hudSystem);
    if (sandboxRenderer) {
      refs.playerController.setSandboxRenderer(sandboxRenderer);
    }
    refs.combatantSystem.setChunkManager(refs.chunkManager);
    refs.combatantSystem.setCamera(camera);
    refs.firstPersonWeapon.setPlayerController(refs.playerController);
    refs.firstPersonWeapon.setCombatantSystem(refs.combatantSystem);
    refs.firstPersonWeapon.setHUDSystem(refs.hudSystem);
    refs.firstPersonWeapon.setZoneManager(refs.zoneManager);
    refs.firstPersonWeapon.setInventoryManager(refs.inventoryManager);
    refs.hudSystem.setCombatantSystem(refs.combatantSystem);
    refs.hudSystem.setZoneManager(refs.zoneManager);
    refs.hudSystem.setTicketSystem(refs.ticketSystem);
    refs.ticketSystem.setZoneManager(refs.zoneManager);
    refs.combatantSystem.setTicketSystem(refs.ticketSystem);
    refs.combatantSystem.setPlayerHealthSystem(refs.playerHealthSystem);
    refs.combatantSystem.setZoneManager(refs.zoneManager);
    refs.combatantSystem.setGameModeManager(refs.gameModeManager);
    refs.combatantSystem.setHUDSystem(refs.hudSystem);
    refs.playerHealthSystem.setZoneManager(refs.zoneManager);
    refs.playerHealthSystem.setTicketSystem(refs.ticketSystem);
    refs.playerHealthSystem.setPlayerController(refs.playerController);
    refs.playerHealthSystem.setFirstPersonWeapon(refs.firstPersonWeapon);
    refs.playerHealthSystem.setCamera(camera);
    refs.playerHealthSystem.setRespawnManager(refs.playerRespawnManager);
    refs.playerHealthSystem.setHUDSystem(refs.hudSystem);
    refs.minimapSystem.setZoneManager(refs.zoneManager);
    refs.minimapSystem.setCombatantSystem(refs.combatantSystem);
    refs.fullMapSystem.setZoneManager(refs.zoneManager);
    refs.fullMapSystem.setCombatantSystem(refs.combatantSystem);
    refs.fullMapSystem.setGameModeManager(refs.gameModeManager);
    refs.compassSystem.setZoneManager(refs.zoneManager);
    refs.zoneManager.setCombatantSystem(refs.combatantSystem);
    refs.zoneManager.setCamera(camera);
    refs.zoneManager.setChunkManager(refs.chunkManager);
    refs.zoneManager.setSpatialGridManager(spatialGridManager);
    refs.zoneManager.setHUDSystem(refs.hudSystem);

    // Connect audio manager
    refs.firstPersonWeapon.setAudioManager(refs.audioManager);
    refs.combatantSystem.setAudioManager(refs.audioManager);

    // Connect respawn manager
    refs.playerRespawnManager.setPlayerHealthSystem(refs.playerHealthSystem);
    refs.playerRespawnManager.setZoneManager(refs.zoneManager);
    refs.playerRespawnManager.setGameModeManager(refs.gameModeManager);
    refs.playerRespawnManager.setPlayerController(refs.playerController);
    refs.playerRespawnManager.setFirstPersonWeapon(refs.firstPersonWeapon);
    refs.playerRespawnManager.setInventoryManager(refs.inventoryManager);

    // Connect helipad system
    refs.helipadSystem.setTerrainManager(refs.chunkManager);
    refs.helipadSystem.setVegetationSystem(refs.globalBillboardSystem);
    refs.helipadSystem.setGameModeManager(refs.gameModeManager);

    // Connect helicopter model
    refs.helicopterModel.setTerrainManager(refs.chunkManager);
    refs.helicopterModel.setHelipadSystem(refs.helipadSystem);
    refs.helicopterModel.setPlayerController(refs.playerController);
    refs.helicopterModel.setHUDSystem(refs.hudSystem);
    refs.helicopterModel.setAudioListener(refs.audioManager.getListener());

    // Connect game mode manager to systems
    refs.gameModeManager.connectSystems(
      refs.zoneManager,
      refs.combatantSystem,
      refs.ticketSystem,
      refs.chunkManager,
      refs.minimapSystem
    );

    // Connect camera shake system
    refs.playerController.setCameraShakeSystem(refs.cameraShakeSystem);

    // Connect player suppression system
    refs.playerSuppressionSystem.setCameraShakeSystem(refs.cameraShakeSystem);
    refs.playerSuppressionSystem.setPlayerController(refs.playerController);
    refs.combatantSystem.setPlayerSuppressionSystem(refs.playerSuppressionSystem);

    // Connect flashbang screen effect system
    refs.flashbangScreenEffect.setPlayerController(refs.playerController);
    setSmokeCloudSystem(refs.smokeCloudSystem);

    // Connect weapon systems
    refs.grenadeSystem.setCombatantSystem(refs.combatantSystem);
    refs.grenadeSystem.setInventoryManager(refs.inventoryManager);
    refs.grenadeSystem.setAudioManager(refs.audioManager);
    refs.grenadeSystem.setPlayerController(refs.playerController);
    refs.grenadeSystem.setFlashbangEffect(refs.flashbangScreenEffect);
    refs.hudSystem.setGrenadeSystem(refs.grenadeSystem);
    refs.mortarSystem.setCombatantSystem(refs.combatantSystem);
    refs.mortarSystem.setInventoryManager(refs.inventoryManager);
    refs.mortarSystem.setAudioManager(refs.audioManager);
    refs.sandbagSystem.setInventoryManager(refs.inventoryManager);

    // Access internal effect pools - these are implementation details not exposed via interface
    // TODO: Consider exposing these via ICombatantSystem interface if needed for cleaner typing
    const impactEffectsPool = (refs.combatantSystem as any).impactEffectsPool;
    if (impactEffectsPool) {
      refs.grenadeSystem.setImpactEffectsPool(impactEffectsPool);
      refs.mortarSystem.setImpactEffectsPool(impactEffectsPool);
    }

    const explosionEffectsPool = (refs.combatantSystem as any).explosionEffectsPool;
    if (explosionEffectsPool) {
      refs.grenadeSystem.setExplosionEffectsPool(explosionEffectsPool);
      refs.mortarSystem.setExplosionEffectsPool(explosionEffectsPool);
    }

    // Connect PlayerController with all weapon systems
    refs.playerController.setInventoryManager(refs.inventoryManager);
    refs.playerController.setGrenadeSystem(refs.grenadeSystem);
    refs.playerController.setMortarSystem(refs.mortarSystem);
    refs.playerController.setSandbagSystem(refs.sandbagSystem);

    // Connect combat systems with sandbag system
    // Access internal subsystems - these are implementation details not exposed via interface
    // TODO: Consider exposing these via ICombatantSystem interface if needed for cleaner typing
    const combatantCombat = (refs.combatantSystem as any).combatantCombat;
    if (combatantCombat) {
      combatantCombat.setSandbagSystem(refs.sandbagSystem);
    }
    const combatantAI = (refs.combatantSystem as any).combatantAI;
    if (combatantAI) {
      combatantAI.setSandbagSystem(refs.sandbagSystem);
      combatantAI.setZoneManager(refs.zoneManager);
      combatantAI.setSmokeCloudSystem(refs.smokeCloudSystem);
    }

    // Connect influence map system
    const squadManager = (refs.combatantSystem as any).squadManager;
    if (squadManager) {
      squadManager.setInfluenceMap(refs.influenceMapSystem);
    }
    // Direct property assignment for internal state - implementation detail
    (refs.combatantSystem as any).influenceMap = refs.influenceMapSystem;
    (refs.combatantSystem as any).sandbagSystem = refs.sandbagSystem;

    // Connect ammo supply system
    refs.ammoSupplySystem.setZoneManager(refs.zoneManager);
    refs.ammoSupplySystem.setInventoryManager(refs.inventoryManager);
    refs.ammoSupplySystem.setFirstPersonWeapon(refs.firstPersonWeapon);

    // Connect weather system
    if (refs.weatherSystem) {
      refs.weatherSystem.setAudioManager(refs.audioManager);
      if (sandboxRenderer) {
        refs.weatherSystem.setSandboxRenderer(sandboxRenderer);
      }
    }
    
    // Connect water system
    if (refs.waterSystem) {
      refs.waterSystem.setWeatherSystem(refs.weatherSystem);
    }

    // Connect day-night cycle
    if (refs.dayNightCycle && sandboxRenderer) {
      refs.dayNightCycle.setSandboxRenderer(sandboxRenderer);
    }

    // Connect footstep audio system
    refs.footstepAudioSystem.setChunkManager(refs.chunkManager);
    refs.playerController.setFootstepAudioSystem(refs.footstepAudioSystem);

    // Inject benchmark dependencies
    // Access internal properties for telemetry - these are implementation details not exposed via interface
    // TODO: Consider exposing these via ICombatantSystem interface if needed for cleaner typing
    performanceTelemetry.injectBenchmarkDependencies({
      hitDetection: (refs.combatantSystem as any).combatantCombat?.hitDetection,
      chunkManager: refs.chunkManager,
      combatants: (refs.combatantSystem as any).combatants,
      spatialGridManager: spatialGridManager
    });

    // Initialize GPU timing if renderer is available
    if (sandboxRenderer && sandboxRenderer.renderer) {
      performanceTelemetry.initGPUTiming(sandboxRenderer.renderer);
    }

    // Connect voice callout system
    if (refs.voiceCalloutSystem) {
      refs.combatantSystem.setVoiceCalloutSystem(refs.voiceCalloutSystem);
      refs.grenadeSystem.setVoiceCalloutSystem(refs.voiceCalloutSystem);
    }
  }
}

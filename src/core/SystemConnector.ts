import * as THREE from 'three';
import { SystemReferences } from './SystemInitializer';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';
import { setSmokeCloudSystem } from '../systems/effects/SmokeCloudSystem';
import { IGameRenderer } from '../types/SystemInterfaces';
import { getHeightQueryCache } from '../systems/terrain/HeightQueryCache';

/**
 * Handles wiring up dependencies between game systems.
 *
 * Organized into logical groups so the dependency graph is readable.
 * Each private method wires one subsystem cluster; the public entry
 * point calls them in the required topological order.
 */
export class SystemConnector {
  connectSystems(
    refs: SystemReferences,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer?: IGameRenderer
  ): void {
    this.wirePlayer(refs, camera, renderer);
    this.wireCombat(refs, camera);
    this.wireHUD(refs);
    this.wireZones(refs, camera);
    this.wireRespawn(refs);
    this.wireVehicles(refs);
    this.wireWeapons(refs);
    this.wireGameMode(refs);
    this.wireStrategy(refs);
    this.wireNavigation(refs);
    this.wireAirSupport(refs);
    this.wireEnvironment(refs, renderer);
    this.wireTelemetry(refs, renderer);
  }

  // ── Player systems ──

  private wirePlayer(refs: SystemReferences, camera: THREE.PerspectiveCamera, renderer?: IGameRenderer): void {
    refs.playerController.setTerrainSystem(refs.terrainSystem);
    refs.playerController.setGameModeManager(refs.gameModeManager);
    refs.playerController.setTicketSystem(refs.ticketSystem);
    refs.playerController.setHelicopterModel(refs.helicopterModel);
    refs.playerController.setFirstPersonWeapon(refs.firstPersonWeapon);
    refs.playerController.setHUDSystem(refs.hudSystem);
    refs.playerController.setCameraShakeSystem(refs.cameraShakeSystem);
    refs.playerController.setFootstepAudioSystem(refs.footstepAudioSystem);
    if (renderer) {
      refs.playerController.setRenderer(renderer);
    }

    refs.playerHealthSystem.setZoneManager(refs.zoneManager);
    refs.playerHealthSystem.setTicketSystem(refs.ticketSystem);
    refs.playerHealthSystem.setPlayerController(refs.playerController);
    refs.playerHealthSystem.setFirstPersonWeapon(refs.firstPersonWeapon);
    refs.playerHealthSystem.setCamera(camera);
    refs.playerHealthSystem.setRespawnManager(refs.playerRespawnManager);
    refs.playerHealthSystem.setHUDSystem(refs.hudSystem);

    refs.playerSuppressionSystem.setCameraShakeSystem(refs.cameraShakeSystem);
    refs.playerSuppressionSystem.setPlayerController(refs.playerController);

    refs.firstPersonWeapon.setPlayerController(refs.playerController);
    refs.firstPersonWeapon.setCombatantSystem(refs.combatantSystem);
    refs.firstPersonWeapon.setTicketSystem(refs.ticketSystem);
    refs.firstPersonWeapon.setHUDSystem(refs.hudSystem);
    refs.firstPersonWeapon.setZoneManager(refs.zoneManager);
    refs.firstPersonWeapon.setInventoryManager(refs.inventoryManager);
    refs.firstPersonWeapon.setAudioManager(refs.audioManager);
    refs.firstPersonWeapon.setGrenadeSystem(refs.grenadeSystem);

    refs.footstepAudioSystem.setTerrainSystem(refs.terrainSystem);

    // Apply initial loadout and faction
    refs.inventoryManager.setLoadout(refs.loadoutService.getCurrentLoadout());
    const loadoutContext = refs.loadoutService.getContext();
    refs.playerController.setPlayerFaction(loadoutContext.faction);
    refs.playerHealthSystem.setPlayerFaction(loadoutContext.faction);
    refs.firstPersonWeapon.setPlayerFaction(loadoutContext.faction);
    refs.combatantSystem.setPlayerFaction(loadoutContext.faction);
    refs.zoneManager.setPlayerAlliance(loadoutContext.alliance);

    // Wire spectator candidate provider: returns alive teammates for post-death spectating
    refs.playerController.setSpectatorCandidateProvider(() => {
      const playerFaction = loadoutContext.faction;
      return refs.combatantSystem.getAllCombatants()
        .filter(c => c.faction === playerFaction && c.health > 0 && !c.isDying && !c.isPlayerProxy)
        .map(c => ({ id: c.id, position: c.position, faction: c.faction }));
    });
  }

  // ── Combat systems ──

  private wireCombat(refs: SystemReferences, camera: THREE.PerspectiveCamera): void {
    refs.combatantSystem.setTerrainSystem(refs.terrainSystem);
    refs.combatantSystem.setCamera(camera);
    refs.combatantSystem.setTicketSystem(refs.ticketSystem);
    refs.combatantSystem.setPlayerHealthSystem(refs.playerHealthSystem);
    refs.combatantSystem.setZoneManager(refs.zoneManager);
    refs.combatantSystem.setGameModeManager(refs.gameModeManager);
    refs.combatantSystem.setHUDSystem(refs.hudSystem);
    refs.combatantSystem.setAudioManager(refs.audioManager);
    refs.combatantSystem.setPlayerSuppressionSystem(refs.playerSuppressionSystem);

    // Internal sub-system wiring
    const combatantCombat = refs.combatantSystem.combatantCombat;
    if (combatantCombat) {
      combatantCombat.setSandbagSystem(refs.sandbagSystem);
    }
    const combatantAI = refs.combatantSystem.combatantAI;
    if (combatantAI) {
      combatantAI.setSandbagSystem(refs.sandbagSystem);
      combatantAI.setZoneManager(refs.zoneManager);
      combatantAI.setSmokeCloudSystem(refs.smokeCloudSystem);
    }
    const squadManager = refs.combatantSystem.squadManager;
    if (squadManager) {
      squadManager.setInfluenceMap(refs.influenceMapSystem);
    }
    refs.combatantSystem.influenceMap = refs.influenceMapSystem;
    refs.combatantSystem.sandbagSystem = refs.sandbagSystem;

    refs.flashbangScreenEffect.setPlayerController(refs.playerController);
    setSmokeCloudSystem(refs.smokeCloudSystem);
  }

  // ── HUD and UI ──

  private wireHUD(refs: SystemReferences): void {
    refs.hudSystem.setCombatantSystem(refs.combatantSystem);
    refs.hudSystem.setZoneManager(refs.zoneManager);
    refs.hudSystem.setTicketSystem(refs.ticketSystem);
    refs.hudSystem.setAudioManager(refs.audioManager);

    // Mount UI components into grid slots
    const layout = refs.hudSystem.getLayout();
    refs.compassSystem.mountTo(layout.getSlot('compass'));
    refs.minimapSystem.mountTo(layout.getSlot('minimap'));
    refs.playerHealthSystem.mountUI(layout.getSlot('health'));
    refs.playerSquadController.mountIndicatorTo(layout.getSlot('stats'));
    refs.commandInputManager.mountTo(layout);

    refs.compassSystem.setZoneManager(refs.zoneManager);
    refs.minimapSystem.setZoneManager(refs.zoneManager);
    refs.minimapSystem.setCombatantSystem(refs.combatantSystem);
    refs.fullMapSystem.setZoneManager(refs.zoneManager);
    refs.fullMapSystem.setCombatantSystem(refs.combatantSystem);
    refs.fullMapSystem.setGameModeManager(refs.gameModeManager);

    refs.commandInputManager.setZoneManager(refs.zoneManager);
    refs.commandInputManager.setCombatantSystem(refs.combatantSystem);
    refs.commandInputManager.setGameModeManager(refs.gameModeManager);
    refs.commandInputManager.setPlayerController(refs.playerController);
  }

  // ── Zone capture ──

  private wireZones(refs: SystemReferences, camera: THREE.PerspectiveCamera): void {
    refs.ticketSystem.setZoneManager(refs.zoneManager);
    refs.ticketSystem.setMatchRestartCallback(() => {
      refs.playerRespawnManager.cancelPendingRespawn();
      refs.playerHealthSystem.resetForNewMatch();
      refs.firstPersonWeapon.enable();
      refs.playerRespawnManager.respawnAtBase();
    });

    refs.zoneManager.setCombatantSystem(refs.combatantSystem);
    refs.zoneManager.setCamera(camera);
    refs.zoneManager.setTerrainSystem(refs.terrainSystem);
    refs.zoneManager.setSpatialGridManager(refs.spatialGridManager);
    refs.zoneManager.setSpatialQueryProvider((center, radius) => refs.combatantSystem.querySpatialRadius(center, radius));
    refs.zoneManager.setHUDSystem(refs.hudSystem);
  }

  // ── Respawn ──

  private wireRespawn(refs: SystemReferences): void {
    refs.playerRespawnManager.setPlayerHealthSystem(refs.playerHealthSystem);
    refs.playerRespawnManager.setZoneManager(refs.zoneManager);
    refs.playerRespawnManager.setGameModeManager(refs.gameModeManager);
    refs.playerRespawnManager.setPlayerController(refs.playerController);
    refs.playerRespawnManager.setFirstPersonWeapon(refs.firstPersonWeapon);
    refs.playerRespawnManager.setInventoryManager(refs.inventoryManager);
    refs.playerRespawnManager.setLoadoutService(refs.loadoutService);
    refs.playerRespawnManager.setGrenadeSystem(refs.grenadeSystem);
    refs.playerRespawnManager.setWarSimulator(refs.warSimulator);
    refs.playerRespawnManager.setTerrainSystem(refs.terrainSystem);
    refs.playerRespawnManager.setHelipadSystem(refs.helipadSystem);
  }

  // ── Vehicles ──

  private wireVehicles(refs: SystemReferences): void {
    refs.helipadSystem.setTerrainManager(refs.terrainSystem);
    refs.helipadSystem.setVegetationSystem(refs.globalBillboardSystem);
    refs.helipadSystem.setGameModeManager(refs.gameModeManager);
    refs.helipadSystem.onHelipadsCreated((helipads) => {
      const markers = helipads.map(hp => ({ id: hp.id, position: hp.position }));
      refs.minimapSystem.setHelipadMarkers(markers);
      refs.fullMapSystem.setHelipadMarkers(markers);
    });

    refs.helicopterModel.setTerrainManager(refs.terrainSystem);
    refs.helicopterModel.setHelipadSystem(refs.helipadSystem);
    refs.helicopterModel.setPlayerController(refs.playerController);
    refs.helicopterModel.setHUDSystem(refs.hudSystem);
    refs.helicopterModel.setAudioListener(refs.audioManager.getListener());
    refs.helicopterModel.setAudioManager(refs.audioManager);
    refs.helicopterModel.setCombatantSystem(refs.combatantSystem);
    refs.helicopterModel.setGrenadeSystem(refs.grenadeSystem);
    refs.helicopterModel.setHeightQueryCache(getHeightQueryCache());

    refs.worldFeatureSystem.setTerrainManager(refs.terrainSystem);
    refs.worldFeatureSystem.setGameModeManager(refs.gameModeManager);

    // Wire VehicleManager: helicopter vehicle registration happens via
    // HelicopterModel.onHelicopterCreated() callback (future). For now,
    // VehicleManager is available for manual registration.
    refs.helicopterModel.setVehicleManager(refs.vehicleManager);

    // Wire NPCVehicleController for NPC boarding/riding/dismounting
    refs.npcVehicleController.setVehicleManager(refs.vehicleManager);
    refs.npcVehicleController.setCombatantProvider(() => refs.combatantSystem.combatants);
  }

  // ── Weapons ──

  private wireWeapons(refs: SystemReferences): void {
    refs.grenadeSystem.setCombatantSystem(refs.combatantSystem);
    refs.grenadeSystem.setInventoryManager(refs.inventoryManager);
    refs.grenadeSystem.setTicketSystem(refs.ticketSystem);
    refs.grenadeSystem.setAudioManager(refs.audioManager);
    refs.grenadeSystem.setPlayerController(refs.playerController);
    refs.grenadeSystem.setFlashbangEffect(refs.flashbangScreenEffect);
    refs.mortarSystem.setCombatantSystem(refs.combatantSystem);
    refs.mortarSystem.setInventoryManager(refs.inventoryManager);
    refs.mortarSystem.setAudioManager(refs.audioManager);
    refs.mortarSystem.setTicketSystem(refs.ticketSystem);
    refs.sandbagSystem.setInventoryManager(refs.inventoryManager);
    refs.sandbagSystem.setTicketSystem(refs.ticketSystem);

    refs.hudSystem.setGrenadeSystem(refs.grenadeSystem);
    refs.hudSystem.setMortarSystem(refs.mortarSystem);

    // Share effect pools between weapon systems
    const impactEffectsPool = refs.combatantSystem.impactEffectsPool;
    if (impactEffectsPool) {
      refs.grenadeSystem.setImpactEffectsPool(impactEffectsPool);
      refs.mortarSystem.setImpactEffectsPool(impactEffectsPool);
    }
    const explosionEffectsPool = refs.combatantSystem.explosionEffectsPool;
    if (explosionEffectsPool) {
      refs.grenadeSystem.setExplosionEffectsPool(explosionEffectsPool);
      refs.mortarSystem.setExplosionEffectsPool(explosionEffectsPool);
    }

    refs.playerController.setInventoryManager(refs.inventoryManager);
    refs.playerController.setGrenadeSystem(refs.grenadeSystem);
    refs.playerController.setMortarSystem(refs.mortarSystem);
    refs.playerController.setSandbagSystem(refs.sandbagSystem);
    refs.playerController.setPlayerSquadController(refs.playerSquadController);
    refs.playerController.setCommandInputManager(refs.commandInputManager);
  }

  // ── Game mode orchestration ──

  private wireGameMode(refs: SystemReferences): void {
    refs.gameModeManager.connectSystems(
      refs.zoneManager,
      refs.combatantSystem,
      refs.ticketSystem,
      refs.terrainSystem,
      refs.minimapSystem,
      refs.fullMapSystem
    );
    refs.gameModeManager.setInfluenceMapSystem(refs.influenceMapSystem);

    refs.ammoSupplySystem.setZoneManager(refs.zoneManager);
    refs.ammoSupplySystem.setInventoryManager(refs.inventoryManager);
    refs.ammoSupplySystem.setFirstPersonWeapon(refs.firstPersonWeapon);
  }

  // ── Strategy (WarSimulator) ──

  private wireStrategy(refs: SystemReferences): void {
    refs.warSimulator.setCombatantSystem(refs.combatantSystem);
    refs.warSimulator.setZoneManager(refs.zoneManager);
    refs.warSimulator.setTicketSystem(refs.ticketSystem);
    refs.warSimulator.setInfluenceMap(refs.influenceMapSystem);

    refs.strategicFeedback.setWarSimulator(refs.warSimulator);
    refs.strategicFeedback.setHUDSystem(refs.hudSystem);
    refs.strategicFeedback.setAudioManager(refs.audioManager);

    refs.gameModeManager.setWarSimulator(refs.warSimulator);
    refs.minimapSystem.setWarSimulator(refs.warSimulator);
    refs.fullMapSystem.setWarSimulator(refs.warSimulator);
  }

  // ── Navigation (navmesh) ──

  private wireNavigation(refs: SystemReferences): void {
    refs.combatantSystem.setNavmeshSystem(refs.navmeshSystem);
  }

  // ── Air Support ──

  private wireAirSupport(refs: SystemReferences): void {
    refs.airSupportManager.setCombatantSystem(refs.combatantSystem);
    refs.airSupportManager.setGrenadeSystem(refs.grenadeSystem);
    refs.airSupportManager.setAudioManager(refs.audioManager);
    refs.airSupportManager.setHUDSystem(refs.hudSystem);
    refs.airSupportManager.setTerrainSystem(refs.terrainSystem);

    const explosionEffectsPool = refs.combatantSystem.explosionEffectsPool;
    if (explosionEffectsPool) {
      refs.airSupportManager.setExplosionEffectsPool(explosionEffectsPool);
    }

    refs.playerController.setAirSupportManager(refs.airSupportManager);

    refs.aaEmplacementSystem.setHelicopterModel(refs.helicopterModel);
    refs.aaEmplacementSystem.setAudioManager(refs.audioManager);
    refs.aaEmplacementSystem.setTerrainSystem(refs.terrainSystem);
    if (explosionEffectsPool) {
      refs.aaEmplacementSystem.setExplosionEffectsPool(explosionEffectsPool);
    }
  }

  // ── Environment (weather, water, terrain audio) ──

  private wireEnvironment(refs: SystemReferences, renderer?: IGameRenderer): void {
    if (refs.weatherSystem) {
      refs.weatherSystem.setAudioManager(refs.audioManager);
      if (renderer) {
        refs.weatherSystem.setRenderer(renderer);
      }
    }

    if (refs.waterSystem) {
      refs.waterSystem.setWeatherSystem(refs.weatherSystem);
    }
  }

  // ── Telemetry ──

  private wireTelemetry(refs: SystemReferences, renderer?: IGameRenderer): void {
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

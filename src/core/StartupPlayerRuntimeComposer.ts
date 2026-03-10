import * as THREE from 'three';
import { SystemReferences } from './SystemInitializer';
import { IGameRenderer } from '../types/SystemInterfaces';

type StartupPlayerRuntimeRefs = Pick<
  SystemReferences,
  | 'audioManager'
  | 'cameraShakeSystem'
  | 'combatantSystem'
  | 'commandInputManager'
  | 'compassSystem'
  | 'firstPersonWeapon'
  | 'footstepAudioSystem'
  | 'fullMapSystem'
  | 'gameModeManager'
  | 'grenadeSystem'
  | 'helicopterModel'
  | 'helipadSystem'
  | 'hudSystem'
  | 'inventoryManager'
  | 'loadoutService'
  | 'minimapSystem'
  | 'mortarSystem'
  | 'playerController'
  | 'playerHealthSystem'
  | 'playerRespawnManager'
  | 'playerSquadController'
  | 'playerSuppressionSystem'
  | 'sandbagSystem'
  | 'terrainSystem'
  | 'ticketSystem'
  | 'warSimulator'
  | 'zoneManager'
>;

interface StartupPlayerRuntimeGroups {
  playerRuntime: Pick<
    StartupPlayerRuntimeRefs,
    | 'audioManager'
    | 'cameraShakeSystem'
    | 'combatantSystem'
    | 'commandInputManager'
    | 'firstPersonWeapon'
    | 'footstepAudioSystem'
    | 'gameModeManager'
    | 'grenadeSystem'
    | 'helicopterModel'
    | 'hudSystem'
    | 'inventoryManager'
    | 'loadoutService'
    | 'mortarSystem'
    | 'playerController'
    | 'playerHealthSystem'
    | 'playerRespawnManager'
    | 'playerSquadController'
    | 'playerSuppressionSystem'
    | 'sandbagSystem'
    | 'terrainSystem'
    | 'ticketSystem'
    | 'zoneManager'
  >;
  hudRuntime: Pick<
    StartupPlayerRuntimeRefs,
    | 'audioManager'
    | 'combatantSystem'
    | 'commandInputManager'
    | 'compassSystem'
    | 'fullMapSystem'
    | 'gameModeManager'
    | 'hudSystem'
    | 'minimapSystem'
    | 'playerHealthSystem'
    | 'playerController'
    | 'playerSquadController'
    | 'grenadeSystem'
    | 'mortarSystem'
    | 'ticketSystem'
    | 'zoneManager'
  >;
  deployRuntime: Pick<
    StartupPlayerRuntimeRefs,
    | 'firstPersonWeapon'
    | 'gameModeManager'
    | 'grenadeSystem'
    | 'helipadSystem'
    | 'inventoryManager'
    | 'loadoutService'
    | 'playerController'
    | 'playerHealthSystem'
    | 'playerRespawnManager'
    | 'terrainSystem'
    | 'warSimulator'
    | 'zoneManager'
  >;
}

interface StartupPlayerRuntimeOptions {
  camera: THREE.PerspectiveCamera;
  renderer?: IGameRenderer;
}

export function createStartupPlayerRuntimeGroups(
  refs: StartupPlayerRuntimeRefs
): StartupPlayerRuntimeGroups {
  return {
    playerRuntime: {
      audioManager: refs.audioManager,
      cameraShakeSystem: refs.cameraShakeSystem,
      combatantSystem: refs.combatantSystem,
      commandInputManager: refs.commandInputManager,
      firstPersonWeapon: refs.firstPersonWeapon,
      footstepAudioSystem: refs.footstepAudioSystem,
      gameModeManager: refs.gameModeManager,
      grenadeSystem: refs.grenadeSystem,
      helicopterModel: refs.helicopterModel,
      hudSystem: refs.hudSystem,
      inventoryManager: refs.inventoryManager,
      loadoutService: refs.loadoutService,
      mortarSystem: refs.mortarSystem,
      playerController: refs.playerController,
      playerHealthSystem: refs.playerHealthSystem,
      playerRespawnManager: refs.playerRespawnManager,
      playerSquadController: refs.playerSquadController,
      playerSuppressionSystem: refs.playerSuppressionSystem,
      sandbagSystem: refs.sandbagSystem,
      terrainSystem: refs.terrainSystem,
      ticketSystem: refs.ticketSystem,
      zoneManager: refs.zoneManager,
    },
    hudRuntime: {
      audioManager: refs.audioManager,
      combatantSystem: refs.combatantSystem,
      commandInputManager: refs.commandInputManager,
      compassSystem: refs.compassSystem,
      fullMapSystem: refs.fullMapSystem,
      gameModeManager: refs.gameModeManager,
      hudSystem: refs.hudSystem,
      minimapSystem: refs.minimapSystem,
      playerController: refs.playerController,
      playerHealthSystem: refs.playerHealthSystem,
      playerSquadController: refs.playerSquadController,
      grenadeSystem: refs.grenadeSystem,
      mortarSystem: refs.mortarSystem,
      ticketSystem: refs.ticketSystem,
      zoneManager: refs.zoneManager,
    },
    deployRuntime: {
      firstPersonWeapon: refs.firstPersonWeapon,
      gameModeManager: refs.gameModeManager,
      grenadeSystem: refs.grenadeSystem,
      helipadSystem: refs.helipadSystem,
      inventoryManager: refs.inventoryManager,
      loadoutService: refs.loadoutService,
      playerController: refs.playerController,
      playerHealthSystem: refs.playerHealthSystem,
      playerRespawnManager: refs.playerRespawnManager,
      terrainSystem: refs.terrainSystem,
      warSimulator: refs.warSimulator,
      zoneManager: refs.zoneManager,
    },
  };
}

export function wireStartupPlayerRuntime(
  groups: StartupPlayerRuntimeGroups,
  options: StartupPlayerRuntimeOptions
): void {
  wirePlayerRuntime(groups.playerRuntime, options);
  wireHUDRuntime(groups.hudRuntime);
  wireDeployRuntime(groups.deployRuntime);
}

function wirePlayerRuntime(
  runtime: StartupPlayerRuntimeGroups['playerRuntime'],
  options: StartupPlayerRuntimeOptions
): void {
  const {
    audioManager,
    cameraShakeSystem,
    combatantSystem,
    commandInputManager,
    firstPersonWeapon,
    footstepAudioSystem,
    gameModeManager,
    grenadeSystem,
    helicopterModel,
    hudSystem,
    inventoryManager,
    loadoutService,
    mortarSystem,
    playerController,
    playerHealthSystem,
    playerRespawnManager,
    playerSquadController,
    playerSuppressionSystem,
    sandbagSystem,
    terrainSystem,
    ticketSystem,
    zoneManager,
  } = runtime;

  playerController.setTerrainSystem(terrainSystem);
  playerController.setGameModeManager(gameModeManager);
  playerController.setTicketSystem(ticketSystem);
  playerController.setHelicopterModel(helicopterModel);
  playerController.setFirstPersonWeapon(firstPersonWeapon);
  playerController.setHUDSystem(hudSystem);
  playerController.setCameraShakeSystem(cameraShakeSystem);
  playerController.setFootstepAudioSystem(footstepAudioSystem);
  playerController.setInventoryManager(inventoryManager);
  playerController.setGrenadeSystem(grenadeSystem);
  playerController.setMortarSystem(mortarSystem);
  playerController.setSandbagSystem(sandbagSystem);
  playerController.setPlayerSquadController(playerSquadController);
  playerController.setCommandInputManager(commandInputManager);
  if (options.renderer) {
    playerController.setRenderer(options.renderer);
  }

  playerHealthSystem.setZoneManager(zoneManager);
  playerHealthSystem.setTicketSystem(ticketSystem);
  playerHealthSystem.setPlayerController(playerController);
  playerHealthSystem.setFirstPersonWeapon(firstPersonWeapon);
  playerHealthSystem.setCamera(options.camera);
  playerHealthSystem.setRespawnManager(playerRespawnManager);
  playerHealthSystem.setHUDSystem(hudSystem);

  playerSuppressionSystem.setCameraShakeSystem(cameraShakeSystem);
  playerSuppressionSystem.setPlayerController(playerController);

  firstPersonWeapon.setPlayerController(playerController);
  firstPersonWeapon.setCombatantSystem(combatantSystem);
  firstPersonWeapon.setTicketSystem(ticketSystem);
  firstPersonWeapon.setHUDSystem(hudSystem);
  firstPersonWeapon.setZoneManager(zoneManager);
  firstPersonWeapon.setInventoryManager(inventoryManager);
  firstPersonWeapon.setAudioManager(audioManager);
  firstPersonWeapon.setGrenadeSystem(grenadeSystem);

  footstepAudioSystem.setTerrainSystem(terrainSystem);

  applyInitialLoadout(runtime);
  playerController.setSpectatorCandidateProvider(() => {
    const loadoutContext = loadoutService.getContext();
    return combatantSystem.getAllCombatants()
      .filter(c => c.faction === loadoutContext.faction && c.health > 0 && !c.isDying && !c.isPlayerProxy)
      .map(c => ({ id: c.id, position: c.position, faction: c.faction }));
  });
}

function applyInitialLoadout(runtime: StartupPlayerRuntimeGroups['playerRuntime']): void {
  const loadout = runtime.loadoutService.getCurrentLoadout();
  const loadoutContext = runtime.loadoutService.getContext();

  runtime.inventoryManager.setLoadout(loadout);
  runtime.playerController.setPlayerFaction(loadoutContext.faction);
  runtime.playerHealthSystem.setPlayerFaction(loadoutContext.faction);
  runtime.firstPersonWeapon.setPlayerFaction(loadoutContext.faction);
  runtime.combatantSystem.setPlayerFaction(loadoutContext.faction);
  runtime.zoneManager.setPlayerAlliance(loadoutContext.alliance);
}

function wireHUDRuntime(runtime: StartupPlayerRuntimeGroups['hudRuntime']): void {
  const {
    audioManager,
    combatantSystem,
    commandInputManager,
    compassSystem,
    fullMapSystem,
    gameModeManager,
    hudSystem,
    minimapSystem,
    playerController,
    playerHealthSystem,
    playerSquadController,
    grenadeSystem,
    mortarSystem,
    ticketSystem,
    zoneManager,
  } = runtime;

  hudSystem.setCombatantSystem(combatantSystem);
  hudSystem.setZoneManager(zoneManager);
  hudSystem.setTicketSystem(ticketSystem);
  hudSystem.setAudioManager(audioManager);
  hudSystem.setGrenadeSystem(grenadeSystem);
  hudSystem.setMortarSystem(mortarSystem);

  const layout = hudSystem.getLayout();
  compassSystem.mountTo(layout.getSlot('compass'));
  minimapSystem.mountTo(layout.getSlot('minimap'));
  playerHealthSystem.mountUI(layout.getSlot('health'));
  playerSquadController.mountIndicatorTo(layout.getSlot('stats'));
  commandInputManager.mountTo(layout);

  compassSystem.setZoneManager(zoneManager);
  minimapSystem.setZoneManager(zoneManager);
  minimapSystem.setCombatantSystem(combatantSystem);
  fullMapSystem.setZoneManager(zoneManager);
  fullMapSystem.setCombatantSystem(combatantSystem);
  fullMapSystem.setGameModeManager(gameModeManager);

  commandInputManager.setZoneManager(zoneManager);
  commandInputManager.setCombatantSystem(combatantSystem);
  commandInputManager.setGameModeManager(gameModeManager);
  commandInputManager.setPlayerController(playerController);
}

function wireDeployRuntime(runtime: StartupPlayerRuntimeGroups['deployRuntime']): void {
  runtime.playerRespawnManager.setPlayerHealthSystem(runtime.playerHealthSystem);
  runtime.playerRespawnManager.setZoneManager(runtime.zoneManager);
  runtime.playerRespawnManager.setGameModeManager(runtime.gameModeManager);
  runtime.playerRespawnManager.setPlayerController(runtime.playerController);
  runtime.playerRespawnManager.setFirstPersonWeapon(runtime.firstPersonWeapon);
  runtime.playerRespawnManager.setInventoryManager(runtime.inventoryManager);
  runtime.playerRespawnManager.setLoadoutService(runtime.loadoutService);
  runtime.playerRespawnManager.setGrenadeSystem(runtime.grenadeSystem);
  runtime.playerRespawnManager.setWarSimulator(runtime.warSimulator);
  runtime.playerRespawnManager.setTerrainSystem(runtime.terrainSystem);
  runtime.playerRespawnManager.setHelipadSystem(runtime.helipadSystem);
}

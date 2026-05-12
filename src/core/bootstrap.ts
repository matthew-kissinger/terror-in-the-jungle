import { GameEngine } from './GameEngine';
import { GameEventBus } from './GameEventBus';
import { injectSharedStyles } from '../ui/design/styles';
import { markStartup, resetStartupTelemetry } from './StartupTelemetry';
import { AgentTier } from '../systems/strategy/types';
import { isBlufor, isOpfor } from '../systems/combat/types';
import { isPerfDiagnosticsEnabled, isDiagEnabled } from './PerfDiagnostics';
import { Logger } from '../utils/Logger';
import { preloadIcons } from '../ui/icons/IconRegistry';
import { isFlightTestMode } from '../dev/flightTestMode';

const ashauSessionTelemetry = {
  sessionStartEpochMs: Date.now(),
  firstTacticalContactMs: null as number | null,
  diagnosticsCalls: 0,
  lastNearbyTactical250: 0,
  peakNearbyTactical250: 0
};

function showFatalError(message: string) {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
  overlay.style.color = '#fff';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  overlay.style.fontFamily = 'monospace';
  overlay.style.zIndex = '9999';

  const title = document.createElement('div');
  title.textContent = 'Failed to initialize. Please refresh the page.';
  title.style.fontSize = '24px';
  title.style.marginBottom = '12px';

  const err = document.createElement('div');
  err.textContent = String(message);
  err.style.fontSize = '14px';
  err.style.color = '#ff5555';
  err.style.marginBottom = '20px';

  const button = document.createElement('button');
  button.textContent = 'Retry';
  button.style.fontSize = '16px';
  button.style.padding = '8px 16px';
  button.style.cursor = 'pointer';
  button.addEventListener('pointerdown', (e) => { e.preventDefault(); window.location.reload(); });

  overlay.appendChild(title);
  overlay.appendChild(err);
  overlay.appendChild(button);
  document.body.appendChild(overlay);
}

export async function bootstrapGame(): Promise<void> {
  resetStartupTelemetry();
  markStartup('bootstrap.begin');
  // Inject shared design system CSS before any UI is created
  injectSharedStyles();

  // Dev flight-test mode short-circuits the normal engine boot. Activated by
  // `?mode=flight-test`. See docs/tasks/A1-plane-test-mode.md.
  if (isFlightTestMode()) {
    try {
      const { FlightTestScene } = await import('../dev/flightTestScene');
      const scene = new FlightTestScene(document.body);
      scene.start();
      window.addEventListener('beforeunload', () => scene.dispose());
    } catch (error) {
      Logger.error('bootstrap', 'Flight-test mode failed to initialize', error);
      const message = error instanceof Error ? error.message : String(error);
      showFatalError(message);
    }
    return;
  }

  // Dev terrain-sandbox mode short-circuits the normal engine boot. Activated
  // by `?mode=terrain-sandbox`. Gated behind `import.meta.env.DEV` so Vite DCE
  // eliminates the guard + dynamic import + scene module from retail bundles.
  // See docs/tasks/terrain-param-sandbox.md.
  if (import.meta.env.DEV) {
    const { isGunRangeMode } = await import('../dev/gunRangeMode');
    if (isGunRangeMode()) {
      try {
        const { GunRangeScene } = await import('../dev/gunRangeScene');
        const scene = new GunRangeScene(document.body);
        scene.start();
        window.addEventListener('beforeunload', () => scene.dispose());
      } catch (error) {
        Logger.error('bootstrap', 'Gun-range mode failed to initialize', error);
        const message = error instanceof Error ? error.message : String(error);
        showFatalError(message);
      }
      return;
    }

    const { isTerrainSandboxMode } = await import('../dev/terrainSandboxMode');
    if (isTerrainSandboxMode()) {
      try {
        const { TerrainSandboxScene } = await import('../dev/terrainSandboxScene');
        const scene = new TerrainSandboxScene(document.body);
        await scene.start();
        window.addEventListener('beforeunload', () => scene.dispose());
      } catch (error) {
        Logger.error('bootstrap', 'Terrain-sandbox mode failed to initialize', error);
        const message = error instanceof Error ? error.message : String(error);
        showFatalError(message);
      }
      return;
    }
  }

  const engine = new GameEngine();
  markStartup('bootstrap.engine-constructed');

  try {
    markStartup('bootstrap.engine-initialize.begin');
    await engine.initialize();
    markStartup('bootstrap.engine-initialize.end');
    engine.start();
    markStartup('bootstrap.engine-started');

    // Warm browser cache for critical HUD icons
    preloadIcons([
      'icon-rifle', 'icon-shotgun', 'icon-smg', 'icon-pistol',
      'icon-lmg', 'icon-launcher', 'icon-grenade',
      'icon-minigun', 'icon-rocket-pod', 'icon-door-gun',
    ]);

    // Perf-harness gate: true in `vite dev` AND in the perf-harness build
    // (VITE_PERF_HARNESS=1, see docs/PERFORMANCE.md "Build targets"). Retail
    // builds evaluate both constants to false at compile time, so Vite DCE
    // eliminates these diagnostic exposures from the shipping bundle.
    if ((import.meta.env.DEV || import.meta.env.VITE_PERF_HARNESS === '1') && isPerfDiagnosticsEnabled()) {
      // Expose engine root for perf harness scenario control.
      (window as any).__engine = engine;
      // Expose renderer for performance measurement scripts.
      (window as any).__renderer = engine.renderer;
      // Expose the typed agent/player API so the perf harness driver can
      // construct an AgentController without synthesizing keyboard events.
      // See `src/systems/agent/` and `scripts/perf-active-driver.js`.
      const { createAgentControllerFromEngine } = await import('../systems/agent/createAgentControllerFromEngine');
      (window as any).__agent = { createFromEngine: () => createAgentControllerFromEngine(engine) };
      // A Shau runtime diagnostics helper for harness/dev validation.
      ashauSessionTelemetry.sessionStartEpochMs = Date.now();
      ashauSessionTelemetry.firstTacticalContactMs = null;
      ashauSessionTelemetry.diagnosticsCalls = 0;
      ashauSessionTelemetry.lastNearbyTactical250 = 0;
      ashauSessionTelemetry.peakNearbyTactical250 = 0;
      (window as any).__ashauDiagnostics = () => buildAShauDiagnostics(engine);
    }

    if ((import.meta.env.DEV || import.meta.env.VITE_PERF_HARNESS === '1') && (isPerfDiagnosticsEnabled() || isDiagEnabled())) {
      (window as any).advanceTime = async (ms: number) => {
        engine.advanceTime(ms);
      };
      (window as any).render_game_to_text = () => buildRenderGameToText(engine);
    }

    if (isDiagEnabled()) {
      (window as any).__rendererInfo = () => {
        const info = engine.renderer?.renderer?.info;
        return {
          geometries: info?.memory?.geometries ?? 0,
          textures: info?.memory?.textures ?? 0,
          programs: info?.programs?.length ?? 0,
          drawCalls: info?.render?.calls ?? 0,
          triangles: info?.render?.triangles ?? 0,
        };
      };

      (window as any).__rendererBackendCapabilities = () => (
        engine.renderer.getRendererBackendCapabilities()
      );

      // Slice 14 diagnostic: sky-backend refresh activity stats. Probe
      // calls reset before its perf-window starts and reads at the end
      // to compare real refresh activity against the SkyTexture EMA.
      (window as any).__atmosphereSkyRefreshStats = (options: { reset?: boolean } = {}) => {
        const atmosphere = engine.systemManager.atmosphereSystem;
        if (!atmosphere) return null;
        const stats = atmosphere.getSkyRefreshStatsForDebug();
        if (options.reset) {
          atmosphere.resetSkyRefreshStatsForDebug();
        }
        return stats;
      };

      (window as any).__engineHealth = () => {
        const snap = engine.runtimeMetrics?.getSnapshot();
        const avgMs = snap?.avgFrameMs ?? 0;
        return {
          mode: engine.systemManager.gameModeManager.getCurrentMode(),
          fps: avgMs > 0 ? Math.round(1000 / avgMs) : 0,
          avgFrameMs: avgMs,
          p99FrameMs: snap?.p99FrameMs ?? 0,
          combatantCount: snap?.combatantCount ?? 0,
          heapUsedMB: Math.round((performance as any).memory?.usedJSHeapSize / 1048576) || 0,
        };
      };

      // Phase F slice 6/8: capture `materialization_tier_changed` events into
      // a bounded ring so probe scripts can inspect the actual flow of tier
      // transitions during a session. The buffer is cleared on read by
      // default so consecutive probe steps observe distinct windows.
      const tierEventBuffer: Array<{
        capturedAtMs: number;
        combatantId: string;
        fromRender: 'close-glb' | 'impostor' | 'culled' | null;
        toRender: 'close-glb' | 'impostor' | 'culled';
        reason: string;
        distanceMeters: number;
      }> = [];
      const TIER_EVENT_BUFFER_LIMIT = 4096;
      GameEventBus.subscribe('materialization_tier_changed', (event) => {
        if (tierEventBuffer.length >= TIER_EVENT_BUFFER_LIMIT) {
          tierEventBuffer.shift();
        }
        tierEventBuffer.push({
          capturedAtMs: performance.now(),
          ...event,
        });
      });
      (window as any).__materializationTierEvents = (
        options: { clear?: boolean; limit?: number } = {},
      ) => {
        const clear = options.clear !== false;
        const limit = Number.isFinite(options.limit ?? NaN)
          ? Math.max(0, Math.min(TIER_EVENT_BUFFER_LIMIT, Math.floor(options.limit as number)))
          : tierEventBuffer.length;
        const out = tierEventBuffer.slice(-limit);
        if (clear) tierEventBuffer.length = 0;
        return out;
      };
    }

    window.addEventListener('beforeunload', () => {
      engine.dispose();
    });

    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        engine.dispose();
      });
    }
  } catch (error) {
    Logger.error('bootstrap', 'Bootstrap failed', error);
    const message = error instanceof Error ? error.message : String(error);
    showFatalError(message);
  }
}

function roundForRender(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Number(value.toFixed(1));
}

function buildRenderGameToText(engine: GameEngine): string {
  const systems = engine.systemManager;
  const playerController = systems.playerController;
  const fixedWingModel = systems.fixedWingModel;
  const inputManager = (playerController as any).input;
  const playerPosition = playerController.getPosition?.();
  const activeFixedWingId = playerController.getFixedWingId?.() ?? null;
  const activeFixedWing = activeFixedWingId
    ? fixedWingModel.getFlightData(activeFixedWingId)
    : null;

  const payload = {
    mode: systems.gameModeManager.getCurrentMode(),
    gameStarted: engine.gameStarted,
    coordSystem: 'x=east/west, z=north/south, y=up',
    input: {
      touchMode: inputManager?.getIsTouchMode?.() ?? null,
      inputMode: inputManager?.getLastInputMode?.() ?? null,
    },
    player: {
      x: roundForRender(playerPosition?.x),
      y: roundForRender(playerPosition?.y),
      z: roundForRender(playerPosition?.z),
      inHelicopter: playerController.isInHelicopter?.() ?? false,
      inFixedWing: playerController.isInFixedWing?.() ?? false,
      fixedWingId: activeFixedWingId,
    },
    activeFixedWing: activeFixedWing
      ? {
          configKey: activeFixedWing.configKey,
          airspeed: roundForRender(activeFixedWing.airspeed),
          altitudeAGL: roundForRender(activeFixedWing.altitudeAGL),
          verticalSpeed: roundForRender(activeFixedWing.verticalSpeed),
          heading: roundForRender(activeFixedWing.heading),
          phase: activeFixedWing.phase,
          controlPhase: activeFixedWing.controlPhase,
          operationState: activeFixedWing.operationState,
          throttle: roundForRender(activeFixedWing.throttle),
          stalled: activeFixedWing.isStalled,
        }
      : null,
    fixedWing: fixedWingModel.getAircraftIds().map((id) => {
      const fd = fixedWingModel.getFlightData(id);
      return {
        id,
        configKey: fixedWingModel.getConfigKey(id),
        airspeed: roundForRender(fd?.airspeed ?? null),
        altitudeAGL: roundForRender(fd?.altitudeAGL ?? null),
        heading: roundForRender(fd?.heading ?? null),
        phase: fd?.phase ?? null,
        operationState: fd?.operationState ?? null,
      };
    }),
    hud: {
      interaction: document.getElementById('game-hud-root')?.dataset.interaction ?? null,
    },
  };

  return JSON.stringify(payload);
}

function buildAShauDiagnostics(engine: GameEngine) {
  const systems = engine.systemManager;
  const mode = systems.gameModeManager.getCurrentMode();
  const config = systems.gameModeManager.getCurrentConfig?.();
  const playerPos = systems.playerController.getPosition?.();
  const war = systems.warSimulator;
  const combatants = systems.combatantSystem.getAllCombatants();
  const zones = systems.zoneManager.getAllZones();

  const aliveCombatants = combatants.filter(c => c.state !== 'dead' && c.health > 0);
  const aliveCombatByFaction = {
    us: aliveCombatants.filter(c => isBlufor(c.faction)).length,
    opfor: aliveCombatants.filter(c => isOpfor(c.faction)).length
  };

  const nearbyTactical = {
    r250: 0,
    r500: 0,
    r800: 0
  };
  if (playerPos) {
    for (const c of aliveCombatants) {
      if (!isOpfor(c.faction)) continue;
      const d = c.position.distanceTo(playerPos);
      if (d <= 250) nearbyTactical.r250++;
      if (d <= 500) nearbyTactical.r500++;
      if (d <= 800) nearbyTactical.r800++;
    }
  }

  ashauSessionTelemetry.diagnosticsCalls += 1;
  ashauSessionTelemetry.lastNearbyTactical250 = nearbyTactical.r250;
  if (nearbyTactical.r250 > ashauSessionTelemetry.peakNearbyTactical250) {
    ashauSessionTelemetry.peakNearbyTactical250 = nearbyTactical.r250;
  }
  const elapsedMs = Math.max(0, Date.now() - ashauSessionTelemetry.sessionStartEpochMs);
  if (ashauSessionTelemetry.firstTacticalContactMs === null && nearbyTactical.r250 > 0) {
    ashauSessionTelemetry.firstTacticalContactMs = elapsedMs;
  }

  let agentCount = 0;
  let aliveAgents = 0;
  let materializedAgents = 0;
  let nearbyStrategic = { r250: 0, r500: 0, r800: 0 };
  const zoneDistribution = new Map<string, { us: number; opfor: number }>();

  if (war?.isEnabled()) {
    const agents = war.getAllAgents();
    agentCount = agents.size;
    for (const a of agents.values()) {
      if (!a.alive) continue;
      aliveAgents++;
      if (a.tier === AgentTier.MATERIALIZED) {
        materializedAgents++;
      } else if (playerPos) {
        const dx = a.x - playerPos.x;
        const dz = a.z - playerPos.z;
        const d = Math.hypot(dx, dz);
        if (d <= 250) nearbyStrategic.r250++;
        if (d <= 500) nearbyStrategic.r500++;
        if (d <= 800) nearbyStrategic.r800++;
      }

      // On-demand occupancy snapshot: nearest zone within 240m.
      let nearestZoneId: string | null = null;
      let nearestDist = Infinity;
      for (const z of zones) {
        const dx = a.x - z.position.x;
        const dz = a.z - z.position.z;
        const d = Math.hypot(dx, dz);
        if (d < nearestDist) {
          nearestDist = d;
          nearestZoneId = z.id;
        }
      }
      if (!nearestZoneId || nearestDist > 240) continue;
      const row = zoneDistribution.get(nearestZoneId) ?? { us: 0, opfor: 0 };
      if (isBlufor(a.faction)) row.us++;
      else row.opfor++;
      zoneDistribution.set(nearestZoneId, row);
    }
  }

  const topZones = Array.from(zoneDistribution.entries())
    .map(([zoneId, counts]) => {
      const zone = zones.find(z => z.id === zoneId);
      return {
        zoneId,
        zoneName: zone?.name ?? zoneId,
        owner: zone?.owner ?? null,
        state: zone?.state ?? null,
        us: counts.us,
        opfor: counts.opfor,
        total: counts.us + counts.opfor
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return {
    mode,
    modeName: config?.name ?? 'unknown',
    worldSize: config?.worldSize ?? 0,
    warEnabled: war?.isEnabled?.() ?? false,
    strategic: {
      totalAgents: agentCount,
      aliveAgents,
      materializedAgents
    },
    tactical: {
      liveCombatants: aliveCombatants.length,
      byFaction: aliveCombatByFaction
    },
    nearbyPlayerContacts: {
      tacticalOpfor: nearbyTactical,
      nonMaterializedStrategic: nearbyStrategic
    },
    sessionTelemetry: {
      elapsedMs,
      firstTacticalContactMs: ashauSessionTelemetry.firstTacticalContactMs,
      diagnosticsCalls: ashauSessionTelemetry.diagnosticsCalls,
      lastNearbyTactical250: ashauSessionTelemetry.lastNearbyTactical250,
      peakNearbyTactical250: ashauSessionTelemetry.peakNearbyTactical250,
      respawn: systems.playerRespawnManager.getSessionRespawnStats()
    },
    topZoneOccupancy: topZones
  };
}

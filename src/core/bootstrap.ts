import { GameEngine } from './GameEngine';
import { injectSharedStyles } from '../ui/design/styles';
import { TouchControlLayout } from '../ui/controls/TouchControlLayout';
import { markStartup, resetStartupTelemetry } from './StartupTelemetry';
import { AgentTier } from '../systems/strategy/types';
import { Faction } from '../systems/combat/types';

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

  // Init responsive touch control sizing (sets CSS custom properties)
  const touchLayout = new TouchControlLayout();
  touchLayout.init();

  const engine = new GameEngine();
  markStartup('bootstrap.engine-constructed');

  try {
    markStartup('bootstrap.engine-initialize.begin');
    await engine.initialize();
    markStartup('bootstrap.engine-initialize.end');
    engine.start();
    markStartup('bootstrap.engine-started');

    // Expose engine root for perf harness scenario control.
    (window as any).__engine = engine;
    // Expose renderer for performance measurement scripts
    (window as any).__renderer = engine.renderer;
    // A Shau runtime diagnostics helper (manual validation/reporting)
    ashauSessionTelemetry.sessionStartEpochMs = Date.now();
    ashauSessionTelemetry.firstTacticalContactMs = null;
    ashauSessionTelemetry.diagnosticsCalls = 0;
    ashauSessionTelemetry.lastNearbyTactical250 = 0;
    ashauSessionTelemetry.peakNearbyTactical250 = 0;
    (window as any).__ashauDiagnostics = () => buildAShauDiagnostics(engine);

    window.addEventListener('beforeunload', () => {
      touchLayout.dispose();
      engine.dispose();
    });

    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        touchLayout.dispose();
        engine.dispose();
      });
    }
  } catch (error) {
    console.error('Bootstrap failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    showFatalError(message);
  }
}

function buildAShauDiagnostics(engine: GameEngine) {
  const systems = engine.systemManager;
  const mode = systems.gameModeManager.getCurrentMode?.() ?? systems.gameModeManager.currentMode;
  const config = systems.gameModeManager.getCurrentConfig?.();
  const playerPos = systems.playerController.getPosition?.();
  const war = systems.warSimulator;
  const combatants = systems.combatantSystem.getAllCombatants();
  const zones = systems.zoneManager.getAllZones();

  const aliveCombatants = combatants.filter(c => c.state !== 'dead' && c.health > 0);
  const aliveCombatByFaction = {
    us: aliveCombatants.filter(c => c.faction === Faction.US).length,
    opfor: aliveCombatants.filter(c => c.faction === Faction.OPFOR).length
  };

  const nearbyTactical = {
    r250: 0,
    r500: 0,
    r800: 0
  };
  if (playerPos) {
    for (const c of aliveCombatants) {
      if (c.faction !== Faction.OPFOR) continue;
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
      if (a.faction === Faction.US) row.us++;
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

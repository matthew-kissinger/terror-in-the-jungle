import * as THREE from 'three';
import { ZoneManager, CaptureZone, ZoneState } from '../../systems/world/ZoneManager';
import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { Faction } from '../../systems/combat/types';
import type { WarSimulator } from '../../systems/strategy/WarSimulator';

// Reusable scratch vector to avoid per-frame allocations
const _v1 = new THREE.Vector3();

type MinimapRenderState = {
  ctx: CanvasRenderingContext2D;
  size: number;
  worldSize: number;
  playerPosition: THREE.Vector3;
  playerRotation: number;
  camera: THREE.Camera;
  zoneManager?: ZoneManager;
  combatantSystem?: CombatantSystem;
  warSimulator?: WarSimulator;
  playerSquadId?: string;
  commandPosition?: THREE.Vector3;
};

type MinimapPosition = {
  x: number;
  y: number;
};

export function renderMinimap(state: MinimapRenderState): void {
  const { ctx, size } = state;
  const renderScale = size / 200;

  ctx.fillStyle = 'rgba(20, 20, 30, 0.9)';
  ctx.fillRect(0, 0, size, size);

  drawGrid(ctx, size, renderScale);

  if (state.zoneManager) {
    const zones = state.zoneManager.getAllZones();
    zones.forEach(zone => drawZone(ctx, zone, state, renderScale));
  }

  drawCombatantIndicators(ctx, state, renderScale);
  drawStrategicAgents(ctx, state, renderScale);

  if (state.commandPosition) {
    drawCommandMarker(ctx, state, renderScale);
  }

  drawPlayer(ctx, size, renderScale);
  drawViewCone(ctx, state.camera, size, renderScale);
}

function drawGrid(ctx: CanvasRenderingContext2D, size: number, renderScale: number): void {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1 * renderScale;
  const gridSize = 20 * renderScale;
  for (let i = 0; i <= size; i += gridSize) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
}

function drawZone(ctx: CanvasRenderingContext2D, zone: CaptureZone, state: MinimapRenderState, renderScale: number): void {
  const scale = state.size / state.worldSize;
  const { x, y } = worldToMinimap(zone.position, state, scale);

  if (x < -20 * renderScale || x > state.size + 20 * renderScale || y < -20 * renderScale || y > state.size + 20 * renderScale) return;

  const zoneRadius = zone.radius * scale;

  switch (zone.state) {
    case ZoneState.US_CONTROLLED:
      ctx.fillStyle = 'rgba(91, 140, 201, 0.3)';
      ctx.strokeStyle = 'rgba(91, 140, 201, 0.8)';
      break;
    case ZoneState.OPFOR_CONTROLLED:
      ctx.fillStyle = 'rgba(201, 86, 74, 0.3)';
      ctx.strokeStyle = 'rgba(201, 86, 74, 0.8)';
      break;
    case ZoneState.CONTESTED:
      ctx.fillStyle = 'rgba(212, 163, 68, 0.3)';
      ctx.strokeStyle = 'rgba(212, 163, 68, 0.8)';
      break;
    default:
      ctx.fillStyle = 'rgba(107, 119, 128, 0.3)';
      ctx.strokeStyle = 'rgba(107, 119, 128, 0.8)';
  }

  ctx.beginPath();
  ctx.arc(x, y, zoneRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2 * renderScale;
  ctx.stroke();

  if (zone.isHomeBase) {
    ctx.fillStyle = zone.state === ZoneState.US_CONTROLLED ? 'rgba(91, 140, 201, 0.9)' : 'rgba(201, 86, 74, 0.9)';
    const baseSize = 12 * renderScale;
    ctx.fillRect(x - baseSize / 2, y - baseSize / 2, baseSize, baseSize);
  } else {
    ctx.beginPath();
    ctx.moveTo(x, y - 8 * renderScale);
    ctx.lineTo(x + 8 * renderScale, y - 4 * renderScale);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.font = `${Math.round(10 * renderScale)}px Rajdhani`;
  ctx.textAlign = 'center';
  ctx.fillText(zone.name, x, y + zoneRadius + 12 * renderScale);

  if (zone.state === ZoneState.CONTESTED) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(x - 15 * renderScale, y + zoneRadius + 15 * renderScale, 30 * renderScale, 3 * renderScale);
    ctx.fillStyle = 'rgba(212, 163, 68, 0.9)';
    ctx.fillRect(x - 15 * renderScale, y + zoneRadius + 15 * renderScale, 30 * renderScale * (zone.captureProgress / 100), 3 * renderScale);
  }
}

function drawCombatantIndicators(ctx: CanvasRenderingContext2D, state: MinimapRenderState, renderScale: number): void {
  if (!state.combatantSystem) return;

  const combatants = state.combatantSystem.getAllCombatants();
  const scale = state.size / state.worldSize;

  combatants.forEach(combatant => {
    if (combatant.state === 'dead') return;

    const { x, y } = worldToMinimap(combatant.position, state, scale);

    if (x < 0 || x > state.size || y < 0 || y > state.size) return;

    const isPlayerSquad = combatant.squadId === state.playerSquadId && combatant.faction === Faction.US;
    if (isPlayerSquad) {
      ctx.fillStyle = 'rgba(92, 184, 92, 0.8)';
    } else {
      ctx.fillStyle = combatant.faction === Faction.US ? 'rgba(91, 140, 201, 0.6)' : 'rgba(201, 86, 74, 0.6)';
    }
    ctx.beginPath();
    ctx.arc(x, y, 2 * renderScale, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Render non-materialized strategic agents as smaller, dimmer dots.
 * Only active when WarSimulator is running. Shows the broader war beyond immediate area.
 */
function drawStrategicAgents(ctx: CanvasRenderingContext2D, state: MinimapRenderState, renderScale: number): void {
  if (!state.warSimulator || !state.warSimulator.isEnabled()) return;

  const data = state.warSimulator.getAgentPositionsForMap();
  const scale = state.size / state.worldSize;
  const dotSize = 1.5 * renderScale;
  const cos = Math.cos(state.playerRotation);
  const sin = Math.sin(state.playerRotation);
  const halfSize = state.size / 2;

  for (let i = 0; i < data.length; i += 4) {
    const faction = data[i];     // 0 = US, 1 = OPFOR
    const ax = data[i + 1];
    const az = data[i + 2];
    const tier = data[i + 3];    // 0 = materialized, 1 = simulated, 2 = strategic

    // Skip materialized agents - already drawn by drawCombatantIndicators
    if (tier === 0) continue;

    // World to minimap (player-centered + rotated, same as worldToMinimap)
    const dx = ax - state.playerPosition.x;
    const dz = az - state.playerPosition.z;
    const rotatedX = dx * cos + dz * sin;
    const rotatedZ = -dx * sin + dz * cos;
    const mx = halfSize + rotatedX * scale;
    const my = halfSize + rotatedZ * scale;

    if (mx < 0 || mx > state.size || my < 0 || my > state.size) continue;

    // Dimmer for strategic tier, slightly brighter for simulated
    const alpha = tier === 1 ? 0.35 : 0.2;
    ctx.fillStyle = faction === 0
      ? `rgba(91, 140, 201, ${alpha})`
      : `rgba(201, 86, 74, ${alpha})`;

    ctx.beginPath();
    ctx.arc(mx, my, dotSize, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, size: number, renderScale: number): void {
  const centerX = size / 2;
  const centerY = size / 2;

  ctx.fillStyle = 'rgba(220, 225, 230, 0.95)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 4 * renderScale, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(220, 225, 230, 0.95)';
  ctx.lineWidth = 2 * renderScale;
  ctx.stroke();
}

function drawViewCone(ctx: CanvasRenderingContext2D, camera: THREE.Camera, size: number, renderScale: number): void {
  const centerX = size / 2;
  const centerY = size / 2;

  camera.getWorldDirection(_v1);

  const angle = 0;

  ctx.strokeStyle = 'rgba(220, 225, 230, 0.6)';
  ctx.lineWidth = 3 * renderScale;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);

  const lineLength = 25 * renderScale;
  const endX = centerX + Math.sin(angle) * lineLength;
  const endY = centerY - Math.cos(angle) * lineLength;
  ctx.lineTo(endX, endY);
  ctx.stroke();

  const fovAngle = Math.PI / 4;
  const coneLength = 30 * renderScale;

  const leftAngle = angle - fovAngle;
  const rightAngle = angle + fovAngle;
  const leftX = centerX + Math.sin(leftAngle) * coneLength;
  const leftY = centerY - Math.cos(leftAngle) * coneLength;
  const rightX = centerX + Math.sin(rightAngle) * coneLength;
  const rightY = centerY - Math.cos(rightAngle) * coneLength;

  ctx.fillStyle = 'rgba(220, 225, 230, 0.08)';
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.fill();
}

function drawCommandMarker(ctx: CanvasRenderingContext2D, state: MinimapRenderState, renderScale: number): void {
  if (!state.commandPosition) return;

  const scale = state.size / state.worldSize;
  const { x, y } = worldToMinimap(state.commandPosition, state, scale);

  if (x < 0 || x > state.size || y < 0 || y > state.size) return;

  ctx.strokeStyle = 'rgba(92, 184, 92, 0.8)';
  ctx.lineWidth = 2 * renderScale;

  ctx.beginPath();
  ctx.moveTo(x, y - 8 * renderScale);
  ctx.lineTo(x, y + 8 * renderScale);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - 8 * renderScale, y);
  ctx.lineTo(x + 8 * renderScale, y);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 6 * renderScale, 0, Math.PI * 2);
  ctx.stroke();
}

function worldToMinimap(
  worldPosition: THREE.Vector3,
  state: MinimapRenderState,
  scale: number
): MinimapPosition {
  _v1.subVectors(worldPosition, state.playerPosition);

  const cos = Math.cos(state.playerRotation);
  const sin = Math.sin(state.playerRotation);
  const rotatedX = _v1.x * cos + _v1.z * sin;
  const rotatedZ = -_v1.x * sin + _v1.z * cos;

  const x = state.size / 2 + rotatedX * scale;
  const y = state.size / 2 + rotatedZ * scale;

  return { x, y };
}

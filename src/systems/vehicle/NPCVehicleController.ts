import * as THREE from 'three';
import { Logger } from '../../utils/Logger';
import { CombatantState } from '../combat/types';
import type { Combatant } from '../combat/types';
import type { VehicleManager } from './VehicleManager';
import type { SeatRole } from './IVehicle';

const BOARD_RANGE = 5; // meters - NPC must be within this to board
const DISMOUNT_DELAY = 0.5; // seconds of dismount animation

// Scratch vector
const _diff = new THREE.Vector3();

interface BoardingOrder {
  combatantId: string;
  vehicleId: string;
  elapsed: number;
  /**
   * Seat role to claim when the NPC reaches the vehicle. The original
   * passenger-only contract is preserved by defaulting to 'passenger' at
   * the `orderBoard()` entry point; the NPC-gunner emplacement-seek path
   * (`emplacement-npc-gunner`) calls `orderBoard(id, vid, 'gunner')` so
   * the eventual `enterVehicle()` lands the unit on the spade-grip seat
   * instead of the ammo-handler seat.
   */
  seatRole: SeatRole;
}

interface DismountOrder {
  combatantId: string;
  vehicleId: string;
  elapsed: number;
  exitPosition: THREE.Vector3;
}

/**
 * Manages NPC boarding/riding/dismounting behavior for vehicles.
 * Operates on Combatant state directly - sets position, state, and visibility.
 */
export class NPCVehicleController {
  private vehicleManager?: VehicleManager;
  private boardingOrders: BoardingOrder[] = [];
  private dismountOrders: DismountOrder[] = [];
  private combatantProvider?: () => Map<string, Combatant>;

  setVehicleManager(vm: VehicleManager): void {
    this.vehicleManager = vm;
  }

  setCombatantProvider(provider: () => Map<string, Combatant>): void {
    this.combatantProvider = provider;
  }

  /**
   * Order an NPC to move toward a vehicle and board it.
   *
   * `seatRole` defaults to `'passenger'` to preserve the original contract
   * used by air-transport boarding. The emplacement-NPC-gunner path
   * (`AIStateEngage.handleEngaging` routing `mountEmplacement` intents)
   * passes `'gunner'` so the unit lands on the spade-grip seat rather
   * than the ammo-handler seat — and the free-seat check below honors the
   * requested role so an emplacement with the gunner seat occupied (but
   * the passenger seat free) correctly rejects a `'gunner'` boarding.
   *
   * The state transition into `BOARDING` happens here so the caller does
   * NOT pre-set `combatant.state` or `combatant.vehicleId` — `vehicleId`
   * is reserved for the `IN_VEHICLE` transition inside `updateBoarding()`.
   */
  orderBoard(combatantId: string, vehicleId: string, seatRole: SeatRole = 'passenger'): boolean {
    if (!this.vehicleManager) return false;
    const vehicle = this.vehicleManager.getVehicle(vehicleId);
    if (!vehicle || !vehicle.hasFreeSeats(seatRole)) return false;

    const combatant = this.getCombatant(combatantId);
    if (!combatant) return false;
    if (combatant.state === CombatantState.DEAD) return false;
    if (combatant.vehicleId) return false; // already in a vehicle

    combatant.state = CombatantState.BOARDING;
    combatant.destinationPoint = vehicle.getPosition().clone();

    this.boardingOrders.push({ combatantId, vehicleId, elapsed: 0, seatRole });
    return true;
  }

  /**
   * Order an NPC to exit their current vehicle.
   */
  orderDismount(combatantId: string): boolean {
    const combatant = this.getCombatant(combatantId);
    if (!combatant || !combatant.vehicleId) return false;
    if (!this.vehicleManager) return false;

    const vehicle = this.vehicleManager.getVehicle(combatant.vehicleId);
    if (!vehicle) return false;

    const exitPos = vehicle.exitVehicle(combatantId);
    if (!exitPos) return false;

    combatant.state = CombatantState.DISMOUNTING;

    this.dismountOrders.push({
      combatantId,
      vehicleId: combatant.vehicleId,
      elapsed: 0,
      exitPosition: exitPos,
    });

    return true;
  }

  /**
   * Order all passengers in a vehicle to dismount.
   */
  orderDismountAll(vehicleId: string): number {
    if (!this.vehicleManager) return 0;
    const vehicle = this.vehicleManager.getVehicle(vehicleId);
    if (!vehicle) return 0;

    let count = 0;
    for (const seat of vehicle.getSeats()) {
      if (seat.occupantId && seat.role !== 'pilot') {
        if (this.orderDismount(seat.occupantId)) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Get NPC IDs currently in a specific vehicle.
   */
  getOccupants(vehicleId: string): string[] {
    if (!this.vehicleManager) return [];
    const vehicle = this.vehicleManager.getVehicle(vehicleId);
    if (!vehicle) return [];

    return vehicle.getSeats()
      .filter(s => s.occupantId !== null)
      .map(s => s.occupantId!);
  }

  /**
   * Check if an NPC is currently in any vehicle.
   */
  isInVehicle(combatantId: string): boolean {
    const combatant = this.getCombatant(combatantId);
    return combatant?.state === CombatantState.IN_VEHICLE;
  }

  update(dt: number): void {
    this.updateBoarding(dt);
    this.updateDismounting(dt);
    this.updateRiding();
  }

  private updateBoarding(dt: number): void {
    for (let i = this.boardingOrders.length - 1; i >= 0; i--) {
      const order = this.boardingOrders[i];
      order.elapsed += dt;

      const combatant = this.getCombatant(order.combatantId);
      if (!combatant || combatant.state === CombatantState.DEAD) {
        this.boardingOrders.splice(i, 1);
        continue;
      }

      const vehicle = this.vehicleManager?.getVehicle(order.vehicleId);
      if (!vehicle || !vehicle.hasFreeSeats(order.seatRole)) {
        // Vehicle gone or the requested seat-role was claimed by another
        // unit while this NPC was en route - cancel boarding.
        combatant.state = CombatantState.PATROLLING;
        this.boardingOrders.splice(i, 1);
        continue;
      }

      // Check if NPC is close enough to board
      _diff.subVectors(vehicle.getPosition(), combatant.position);
      _diff.y = 0; // ignore vertical
      const dist = _diff.length();

      if (dist < BOARD_RANGE) {
        // Board the vehicle in the originally requested seat role (gunner
        // for emplacement-seek; passenger for the legacy transport path).
        const seatIndex = vehicle.enterVehicle(order.combatantId, order.seatRole);
        if (seatIndex !== null) {
          combatant.state = CombatantState.IN_VEHICLE;
          combatant.vehicleId = order.vehicleId;
          combatant.vehicleSeatIndex = seatIndex;
          Logger.debug('vehicle', `NPC ${order.combatantId} boarded ${order.vehicleId} seat ${seatIndex}`);
        } else {
          combatant.state = CombatantState.PATROLLING;
        }
        this.boardingOrders.splice(i, 1);
      } else if (order.elapsed > 30) {
        // Timeout - cancel
        combatant.state = CombatantState.PATROLLING;
        this.boardingOrders.splice(i, 1);
      }
      // Otherwise NPC keeps moving toward vehicle via normal movement system
    }
  }

  private updateDismounting(dt: number): void {
    for (let i = this.dismountOrders.length - 1; i >= 0; i--) {
      const order = this.dismountOrders[i];
      order.elapsed += dt;

      if (order.elapsed >= DISMOUNT_DELAY) {
        const combatant = this.getCombatant(order.combatantId);
        if (combatant) {
          combatant.position.copy(order.exitPosition);
          combatant.state = CombatantState.PATROLLING;
          combatant.vehicleId = undefined;
          combatant.vehicleSeatIndex = undefined;
          Logger.debug('vehicle', `NPC ${order.combatantId} dismounted at (${order.exitPosition.x.toFixed(0)}, ${order.exitPosition.z.toFixed(0)})`);
        }
        this.dismountOrders.splice(i, 1);
      }
    }
  }

  private updateRiding(): void {
    if (!this.combatantProvider || !this.vehicleManager) return;

    const combatants = this.combatantProvider();
    for (const combatant of combatants.values()) {
      if (combatant.state !== CombatantState.IN_VEHICLE) continue;
      if (!combatant.vehicleId) continue;

      const vehicle = this.vehicleManager.getVehicle(combatant.vehicleId);
      if (!vehicle) {
        // Vehicle no longer exists - eject
        combatant.state = CombatantState.PATROLLING;
        combatant.vehicleId = undefined;
        combatant.vehicleSeatIndex = undefined;
        continue;
      }

      // Lock NPC position to vehicle
      const seat = vehicle.getSeats()[combatant.vehicleSeatIndex ?? 0];
      if (seat) {
        const vehiclePos = vehicle.getPosition();
        const vehicleQuat = vehicle.getQuaternion();
        combatant.position.copy(seat.localOffset)
          .applyQuaternion(vehicleQuat)
          .add(vehiclePos);
      }
    }
  }

  private getCombatant(id: string): Combatant | undefined {
    if (!this.combatantProvider) return undefined;
    return this.combatantProvider().get(id);
  }
}

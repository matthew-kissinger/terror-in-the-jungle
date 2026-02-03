import { GameSystem } from '../types';

/**
 * Handles cleanup and disposal of game systems
 */
export class SystemDisposer {
  dispose(systems: GameSystem[]): void {
    for (const system of systems) {
      system.dispose();
    }
  }
}

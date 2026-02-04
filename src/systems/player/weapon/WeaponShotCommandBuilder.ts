import * as THREE from 'three'
import { ShotCommand, ShotCommandFactory } from './ShotCommand'

// Module-level scratch vectors to eliminate per-shot allocations
const _origin = new THREE.Vector3()
const _direction = new THREE.Vector3()

/**
 * Builds ShotCommand instances from weapon state.
 * Handles weapon type detection, ray computation, and command creation.
 */
export class WeaponShotCommandBuilder {
  /**
   * Create a ShotCommand with all firing data captured at validation time
   */
  static createShotCommand(
    gunCore: any,
    camera: THREE.Camera,
    weaponType: 'rifle' | 'shotgun' | 'smg',
    isShotgun: boolean,
    isADS: boolean
  ): ShotCommand {
    const spread = gunCore.getSpreadDeg()

    if (isShotgun) {
      // Get pellet rays from gunplay core
      const pelletRays = gunCore.computePelletRays(camera)
      camera.getWorldPosition(_origin)
      camera.getWorldDirection(_direction)

      return ShotCommandFactory.createShotgunShot(
        _origin.clone(),
        _direction.clone(),
        pelletRays.map((r: THREE.Ray) => r.direction.clone()),
        (d: number, head: boolean) => gunCore.computeDamage(d, head),
        isADS
      )
    } else {
      // Single shot - compute ray with spread
      const ray = gunCore.computeShotRay(camera, spread)

      return ShotCommandFactory.createSingleShot(
        ray.origin.clone(),
        ray.direction.clone(),
        weaponType === 'shotgun' ? 'rifle' : weaponType,
        (d: number, head: boolean) => gunCore.computeDamage(d, head),
        isADS
      )
    }
  }
}

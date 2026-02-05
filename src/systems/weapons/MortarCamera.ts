import * as THREE from 'three';

export class MortarCamera {
  private camera: THREE.OrthographicCamera;
  private readonly CAMERA_HEIGHT = 100; // Height above ground for top-down view
  private readonly CAMERA_SIZE = 200; // View size in world units

  constructor() {
    this.camera = this.createCamera();
  }

  private createCamera(): THREE.OrthographicCamera {
    const aspect = window.innerWidth / window.innerHeight;
    const size = this.CAMERA_SIZE;
    return new THREE.OrthographicCamera(
      -size * aspect,
      size * aspect,
      size,
      -size,
      0.1,
      1000
    );
  }

  /**
   * Update camera position and projection based on tube position
   */
  update(tubePosition: THREE.Vector3): void {
    // Position camera directly above mortar tube
    this.camera.position.set(
      tubePosition.x,
      tubePosition.y + this.CAMERA_HEIGHT,
      tubePosition.z
    );

    // Look straight down
    this.camera.lookAt(tubePosition);

    // Update projection matrix for window resize
    const aspect = window.innerWidth / window.innerHeight;
    const size = this.CAMERA_SIZE;
    this.camera.left = -size * aspect;
    this.camera.right = size * aspect;
    this.camera.top = size;
    this.camera.bottom = -size;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Get the orthographic camera instance
   */
  getCamera(): THREE.OrthographicCamera {
    return this.camera;
  }
}

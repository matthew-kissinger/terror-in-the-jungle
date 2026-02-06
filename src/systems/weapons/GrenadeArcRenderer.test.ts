import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('three', () => {
  class Vector3 {
    x: number;
    y: number;
    z: number;

    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }

    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }

    copy(v: Vector3) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      return this;
    }

    clone() {
      return new Vector3(this.x, this.y, this.z);
    }

    add(v: Vector3) {
      this.x += v.x;
      this.y += v.y;
      this.z += v.z;
      return this;
    }

    multiplyScalar(s: number) {
      this.x *= s;
      this.y *= s;
      this.z *= s;
      return this;
    }

    length() {
      return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    normalize() {
      const len = this.length();
      if (len > 0) {
        this.x /= len;
        this.y /= len;
        this.z /= len;
      }
      return this;
    }

    distanceTo(v: Vector3) {
      const dx = this.x - v.x;
      const dy = this.y - v.y;
      const dz = this.z - v.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  }

  class Object3D {
    position = new Vector3();
    rotation = new Vector3();
    scale = new Vector3(1, 1, 1);
    visible = true;
    frustumCulled = true;
    children: Object3D[] = [];
    parent?: Object3D;

    add(child: Object3D) {
      this.children.push(child);
      child.parent = this;
      return this;
    }

    remove(child: Object3D) {
      this.children = this.children.filter(entry => entry !== child);
      if (child.parent === this) {
        child.parent = undefined;
      }
      return this;
    }

    traverse(cb: (child: Object3D) => void) {
      cb(this);
      this.children.forEach(child => child.traverse(cb));
    }
  }

  class Scene extends Object3D {}
  class Group extends Object3D {}

  class Camera extends Object3D {
    private direction = new Vector3(0, 0, -1);

    getWorldDirection(target: Vector3) {
      return target.copy(this.direction);
    }

    setWorldDirection(direction: Vector3) {
      this.direction.copy(direction);
      return this;
    }
  }

  class PerspectiveCamera extends Camera {}
  class OrthographicCamera extends Camera {}

  class BufferAttribute {
    array: Float32Array;
    itemSize: number;
    needsUpdate = false;

    constructor(array: Float32Array, itemSize: number) {
      this.array = array;
      this.itemSize = itemSize;
    }
  }

  class BufferGeometry {
    attributes: Record<string, BufferAttribute> = {};
    drawRange = { start: 0, count: 0 };
    disposed = false;

    setAttribute(name: string, attribute: BufferAttribute) {
      this.attributes[name] = attribute;
      return this;
    }

    setDrawRange(start: number, count: number) {
      this.drawRange = { start, count };
    }

    dispose() {
      this.disposed = true;
    }
  }

  class Material {
    disposed = false;
    constructor(params: Record<string, unknown> = {}) {
      Object.assign(this, params);
    }

    dispose() {
      this.disposed = true;
    }
  }

  class LineDashedMaterial extends Material {}
  class MeshBasicMaterial extends Material {}
  class MeshStandardMaterial extends Material {}

  class Line extends Object3D {
    geometry: BufferGeometry;
    material: Material;
    lineDistancesComputed = false;

    constructor(geometry: BufferGeometry, material: Material) {
      super();
      this.geometry = geometry;
      this.material = material;
    }

    computeLineDistances() {
      this.lineDistancesComputed = true;
    }
  }

  class Mesh extends Object3D {
    geometry: BufferGeometry | RingGeometry;
    material: Material;

    constructor(geometry: BufferGeometry | RingGeometry, material: Material) {
      super();
      this.geometry = geometry;
      this.material = material;
    }
  }

  class RingGeometry {
    innerRadius: number;
    outerRadius: number;
    thetaSegments: number;
    disposed = false;

    constructor(innerRadius: number, outerRadius: number, thetaSegments: number) {
      this.innerRadius = innerRadius;
      this.outerRadius = outerRadius;
      this.thetaSegments = thetaSegments;
    }

    dispose() {
      this.disposed = true;
    }
  }

  class Quaternion {}
  class Raycaster {}
  class Matrix4 { identity() { return this; } }

  const DoubleSide = 'DoubleSide';
  const MathUtils = {
    degToRad: (deg: number) => (deg * Math.PI) / 180,
    clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
  };

  return {
    Vector3,
    Object3D,
    Scene,
    Group,
    Camera,
    PerspectiveCamera,
    OrthographicCamera,
    BufferAttribute,
    BufferGeometry,
    Material,
    LineDashedMaterial,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Line,
    Mesh,
    RingGeometry,
    Quaternion,
    Raycaster,
    Matrix4,
    DoubleSide,
    MathUtils,
  };
});

vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import * as THREE from 'three';
import { GrenadeArcRenderer } from './GrenadeArcRenderer';
import { objectPool } from '../../utils/ObjectPoolManager';

describe('GrenadeArcRenderer', () => {
  let scene: THREE.Scene;
  let camera: THREE.Camera;

  beforeEach(() => {
    scene = new THREE.Scene();
    camera = new THREE.Camera();
    camera.position.set(0, 5, 0);
    (camera as any).setWorldDirection(new THREE.Vector3(0, 0, 1));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes arc visualization and landing indicator with defaults', () => {
    const renderer = new GrenadeArcRenderer(scene, 5, 10);
    const arcVisualization = (renderer as any).arcVisualization as THREE.Line;
    const landingIndicator = (renderer as any).landingIndicator as THREE.Mesh;
    const arcPositions = (renderer as any).arcPositions as Float32Array;

    expect(arcPositions).toBeInstanceOf(Float32Array);
    expect(arcPositions.length).toBe(15);

    expect(arcVisualization.visible).toBe(false);
    expect(arcVisualization.frustumCulled).toBe(false);
    expect(scene.children).toContain(arcVisualization as any);

    const geometry = arcVisualization.geometry as any;
    expect(geometry.attributes.position.array).toBe(arcPositions);

    const material = arcVisualization.material as any;
    expect(material.dashSize).toBe(0.5);
    expect(material.gapSize).toBe(0.3);
    expect(material.opacity).toBe(0.7);
    expect(material.transparent).toBe(true);
    expect(material.depthTest).toBe(false);

    const ringGeometry = landingIndicator.geometry as any;
    expect(ringGeometry.innerRadius).toBe(9);
    expect(ringGeometry.outerRadius).toBe(11);
    expect(ringGeometry.thetaSegments).toBe(32);

    expect(landingIndicator.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(landingIndicator.visible).toBe(false);
    expect(scene.children).toContain(landingIndicator as any);
  });

  it('updates arc positions, draw range, and line distances', () => {
    const renderer = new GrenadeArcRenderer(scene, 10, 5);
    const arcVisualization = (renderer as any).arcVisualization as any;

    const distance = renderer.updateArc(
      camera,
      1,
      -10,
      10,
      10,
      () => 0
    );

    const geometry = arcVisualization.geometry as any;
    const positions = geometry.attributes.position.array as Float32Array;

    expect(distance).toBeGreaterThan(0);
    expect(geometry.attributes.position.needsUpdate).toBe(true);
    expect(geometry.drawRange.count).toBeGreaterThan(1);
    expect(arcVisualization.lineDistancesComputed).toBe(true);

    const startX = positions[0];
    const startY = positions[1];
    const startZ = positions[2];
    expect(startX).toBeCloseTo(0);
    expect(startY).toBeCloseTo(5);
    expect(startZ).toBeCloseTo(0);

    const baseThrowAngle = 0.4;
    const expectedVelY = 10 * Math.sin(baseThrowAngle) - 1;
    const expectedVelZ = 10 * Math.cos(baseThrowAngle);
    const expectedY = 5 + expectedVelY * 0.1;
    const expectedZ = expectedVelZ * 0.1;

    const secondX = positions[3];
    const secondY = positions[4];
    const secondZ = positions[5];

    expect(secondX).toBeCloseTo(0);
    expect(secondY).toBeCloseTo(expectedY, 4);
    expect(secondZ).toBeCloseTo(expectedZ, 4);
  });

  it('positions landing indicator at collision point with offset', () => {
    const renderer = new GrenadeArcRenderer(scene, 20, 6);
    const landingIndicator = renderer.getLandingIndicator() as THREE.Mesh;

    const distance = renderer.updateArc(
      camera,
      0.6,
      -10,
      8,
      8,
      () => 0.25
    );

    expect(distance).toBeGreaterThan(0);

    const arcVisualization = (renderer as any).arcVisualization as any;
    const geometry = arcVisualization.geometry as any;
    const positions = geometry.attributes.position.array as Float32Array;
    const lastIndex = (geometry.drawRange.count - 1) * 3;

    expect(landingIndicator.position.x).toBeCloseTo(positions[lastIndex]);
    expect(landingIndicator.position.z).toBeCloseTo(positions[lastIndex + 2]);
    expect(landingIndicator.position.y - 0.1).toBeCloseTo(positions[lastIndex + 1]);
  });

  it('toggles arc and landing indicator visibility', () => {
    const renderer = new GrenadeArcRenderer(scene, 10, 5);
    const arcVisualization = (renderer as any).arcVisualization as THREE.Line;
    const landingIndicator = renderer.getLandingIndicator() as THREE.Mesh;

    renderer.showArc(true);
    expect(arcVisualization.visible).toBe(true);
    expect(landingIndicator.visible).toBe(true);

    renderer.showArc(false);
    expect(arcVisualization.visible).toBe(false);
    expect(landingIndicator.visible).toBe(false);
  });

  it('detects terrain collision and stops arc early', () => {
    const renderer = new GrenadeArcRenderer(scene, 40, 5);
    const groundHeight = vi.fn((x: number, z: number) => (z > 0.3 ? 2 : 0));

    renderer.updateArc(camera, 1, -10, 6, 6, groundHeight);

    const arcVisualization = (renderer as any).arcVisualization as any;
    const geometry = arcVisualization.geometry as any;

    expect(groundHeight).toHaveBeenCalled();
    expect(geometry.drawRange.count).toBeLessThan(30);
  });

  it('handles zero velocity throws at ground height', () => {
    const renderer = new GrenadeArcRenderer(scene, 6, 5);
    camera.position.set(0, 0, 0);

    const distance = renderer.updateArc(
      camera,
      0,
      -10,
      0,
      0,
      () => 0
    );

    const arcVisualization = (renderer as any).arcVisualization as any;
    const geometry = arcVisualization.geometry as any;

    expect(distance).toBeCloseTo(0);
    expect(geometry.drawRange.count).toBe(2);
  });

  it('handles straight up throws without horizontal drift', () => {
    const renderer = new GrenadeArcRenderer(scene, 10, 5);
    (camera as any).setWorldDirection(new THREE.Vector3(0, 1, 0));

    renderer.updateArc(camera, 1, -10, 10, 10, () => 0);

    const arcVisualization = (renderer as any).arcVisualization as any;
    const geometry = arcVisualization.geometry as any;
    const positions = geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < geometry.drawRange.count; i++) {
      const idx = i * 3;
      expect(positions[idx]).toBeCloseTo(0);
      expect(positions[idx + 2]).toBeCloseTo(0);
    }
  });

  it('caps arc points for very long throws', () => {
    const renderer = new GrenadeArcRenderer(scene, 3, 5);

    const distance = renderer.updateArc(
      camera,
      1,
      0,
      50,
      50,
      () => -1000
    );

    const arcVisualization = (renderer as any).arcVisualization as any;
    const geometry = arcVisualization.geometry as any;

    expect(geometry.drawRange.count).toBe(3);
    expect(distance).toBeCloseTo(0);
  });

  it('releases object pool vectors after arc update', () => {
    const renderer = new GrenadeArcRenderer(scene, 10, 5);
    const getSpy = vi.spyOn(objectPool, 'getVector3');
    const releaseSpy = vi.spyOn(objectPool, 'releaseVector3');

    renderer.updateArc(camera, 1, -10, 10, 10, () => 0);

    expect(getSpy).toHaveBeenCalledTimes(9);
    expect(releaseSpy).toHaveBeenCalledTimes(9);
  });

  it('disposes geometries, materials, and removes meshes from scene', () => {
    const renderer = new GrenadeArcRenderer(scene, 10, 5);
    const arcVisualization = (renderer as any).arcVisualization as any;
    const landingIndicator = (renderer as any).landingIndicator as any;

    renderer.dispose();

    expect(scene.children).not.toContain(arcVisualization as any);
    expect(scene.children).not.toContain(landingIndicator as any);
    expect(arcVisualization.geometry.disposed).toBe(true);
    expect(arcVisualization.material.disposed).toBe(true);
    expect(landingIndicator.geometry.disposed).toBe(true);
    expect(landingIndicator.material.disposed).toBe(true);
  });
});

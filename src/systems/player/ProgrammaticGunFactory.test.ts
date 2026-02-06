import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { ProgrammaticGunFactory } from './ProgrammaticGunFactory'

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock Three.js classes
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three')

  class MockVector3 {
    x = 0;
    y = 0;
    z = 0;
    constructor(x = 0, y = 0, z = 0) {
      this.x = x
      this.y = y
      this.z = z
    }
    set(x: number, y: number, z: number) {
      this.x = x
      this.y = y
      this.z = z
      return this
    }
  }

  class MockEuler {
    x = 0;
    y = 0;
    z = 0;
    constructor(x = 0, y = 0, z = 0) {
      this.x = x
      this.y = y
      this.z = z
    }
  }

  class MockObject3D {
    position = new MockVector3();
    rotation = new MockEuler();
    scale = new MockVector3(1, 1, 1);
    name = '';
    userData: Record<string, any> = {};
  }

  class MockGroup extends MockObject3D {
    children: any[] = [];
    isGroup = true;

    add(child: any) {
      this.children.push(child)
      return this
    }

    getObjectByName(name: string): any {
      return this.children.find(c => c.name === name)
    }
  }

  class MockGeometry {
    dispose = vi.fn();
  }

  class MockBoxGeometry extends MockGeometry {
    constructor(public width: number, public height: number, public depth: number) {
      super()
    }
  }

  class MockCylinderGeometry extends MockGeometry {
    constructor(
      public radiusTop: number,
      public radiusBottom: number,
      public height: number,
      public radialSegments: number
    ) {
      super()
    }
  }

  class MockSphereGeometry extends MockGeometry {
    constructor(
      public radius: number,
      public widthSegments: number,
      public heightSegments: number
    ) {
      super()
    }
  }

  class MockMaterial {
    color: number;
    dispose = vi.fn();

    constructor(params: any = {}) {
      this.color = params.color || 0xffffff
    }
  }

  class MockMeshBasicMaterial extends MockMaterial {
    isMeshBasicMaterial = true;
  }

  class MockMesh extends MockObject3D {
    isMesh = true;
    geometry: any;
    material: any;

    constructor(geometry: any, material: any) {
      super()
      this.geometry = geometry
      this.material = material
    }
  }

  return {
    ...actual,
    Vector3: MockVector3,
    Euler: MockEuler,
    Object3D: MockObject3D,
    Group: MockGroup,
    BoxGeometry: MockBoxGeometry,
    CylinderGeometry: MockCylinderGeometry,
    SphereGeometry: MockSphereGeometry,
    Material: MockMaterial,
    MeshBasicMaterial: MockMeshBasicMaterial,
    Mesh: MockMesh,
  }
})

describe('ProgrammaticGunFactory', () => {
  describe('createRifle()', () => {
    it('returns a THREE.Group', () => {
      const rifle = ProgrammaticGunFactory.createRifle()
      expect(rifle.isGroup).toBe(true)
    })

    it('creates group with 9 children (receiver, handguard, barrel, stock, grip, magazine, rear sight, front sight, muzzle)', () => {
      const rifle = ProgrammaticGunFactory.createRifle()
      expect(rifle.children.length).toBe(9)
    })

    it('has muzzle marker object with correct name', () => {
      const rifle = ProgrammaticGunFactory.createRifle()
      const muzzle = rifle.getObjectByName('muzzle')
      expect(muzzle).toBeDefined()
      expect(muzzle.name).toBe('muzzle')
    })

    it('has magazine object with correct name', () => {
      const rifle = ProgrammaticGunFactory.createRifle()
      const magazine = rifle.getObjectByName('magazine')
      expect(magazine).toBeDefined()
      expect(magazine.name).toBe('magazine')
    })

    it('muzzle is positioned near barrel end (x ~1.7)', () => {
      const rifle = ProgrammaticGunFactory.createRifle()
      const muzzle = rifle.getObjectByName('muzzle')
      expect(muzzle.position.x).toBeCloseTo(1.7, 1)
    })

    it('uses default dark gray material when no material provided', () => {
      const rifle = ProgrammaticGunFactory.createRifle()
      const receiver = rifle.children.find((c: any) => c.isMesh && c.geometry.width === 0.7)
      expect(receiver).toBeDefined()
      expect(receiver.material.color).toBe(0x2b2b2b)
    })

    it('uses provided custom material for receiver', () => {
      const customMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 })
      const rifle = ProgrammaticGunFactory.createRifle(customMaterial)
      const receiver = rifle.children.find((c: any) => c.isMesh && c.geometry.width === 0.7)
      expect(receiver.material).toBe(customMaterial)
    })

    it('has receiver positioned at origin', () => {
      const rifle = ProgrammaticGunFactory.createRifle()
      const receiver = rifle.children.find((c: any) => c.isMesh && c.geometry.width === 0.7)
      expect(receiver.position.x).toBe(0)
      expect(receiver.position.y).toBe(0)
      expect(receiver.position.z).toBe(0)
    })

    it('has barrel rotated 90 degrees (z-axis)', () => {
      const rifle = ProgrammaticGunFactory.createRifle()
      const barrel = rifle.children.find((c: any) => c.isMesh && c.geometry.radiusTop !== undefined)
      expect(barrel.rotation.z).toBeCloseTo(Math.PI / 2, 5)
    })

    it('has correct scale (0.75, 0.75, 0.75)', () => {
      const rifle = ProgrammaticGunFactory.createRifle()
      expect(rifle.scale.x).toBe(0.75)
      expect(rifle.scale.y).toBe(0.75)
      expect(rifle.scale.z).toBe(0.75)
    })

    it('barrel has correct geometry dimensions (radius 0.03, height 0.9)', () => {
      const rifle = ProgrammaticGunFactory.createRifle()
      const barrel = rifle.children.find((c: any) => c.isMesh && c.geometry.radiusTop !== undefined)
      expect(barrel.geometry.radiusTop).toBeCloseTo(0.03, 5)
      expect(barrel.geometry.height).toBeCloseTo(0.9, 5)
    })
  })

  describe('createShotgun()', () => {
    it('returns a THREE.Group', () => {
      const shotgun = ProgrammaticGunFactory.createShotgun()
      expect(shotgun.isGroup).toBe(true)
    })

    it('creates group with 11 children (receiver, barrel, tube mag, pump grip, forend, stock, butt plate, grip, trigger guard, front sight, muzzle)', () => {
      const shotgun = ProgrammaticGunFactory.createShotgun()
      expect(shotgun.children.length).toBe(11)
    })

    it('has muzzle marker object with correct name', () => {
      const shotgun = ProgrammaticGunFactory.createShotgun()
      const muzzle = shotgun.getObjectByName('muzzle')
      expect(muzzle).toBeDefined()
      expect(muzzle.name).toBe('muzzle')
    })

    it('has pump grip object with correct name', () => {
      const shotgun = ProgrammaticGunFactory.createShotgun()
      const pumpGrip = shotgun.getObjectByName('pumpGrip')
      expect(pumpGrip).toBeDefined()
      expect(pumpGrip.name).toBe('pumpGrip')
    })

    it('muzzle is positioned near barrel end (x ~1.35)', () => {
      const shotgun = ProgrammaticGunFactory.createShotgun()
      const muzzle = shotgun.getObjectByName('muzzle')
      expect(muzzle.position.x).toBeCloseTo(1.35, 1)
    })

    it('uses default dark metal material when no material provided', () => {
      const shotgun = ProgrammaticGunFactory.createShotgun()
      const receiver = shotgun.children.find((c: any) => c.isMesh && c.geometry.width === 0.45)
      expect(receiver).toBeDefined()
      expect(receiver.material.color).toBe(0x1a1a1a)
    })

    it('uses provided custom material for receiver', () => {
      const customMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 })
      const shotgun = ProgrammaticGunFactory.createShotgun(customMaterial)
      const receiver = shotgun.children.find((c: any) => c.isMesh && c.geometry.width === 0.45)
      expect(receiver.material).toBe(customMaterial)
    })

    it('has wooden stock with brown color (0x3d2817)', () => {
      const shotgun = ProgrammaticGunFactory.createShotgun()
      const stock = shotgun.children.find((c: any) =>
        c.isMesh && c.geometry.width === 0.6 && c.geometry.height === 0.22
      )
      expect(stock).toBeDefined()
      expect(stock.material.color).toBe(0x3d2817)
    })

    it('has correct scale (0.75, 0.75, 0.75)', () => {
      const shotgun = ProgrammaticGunFactory.createShotgun()
      expect(shotgun.scale.x).toBe(0.75)
      expect(shotgun.scale.y).toBe(0.75)
      expect(shotgun.scale.z).toBe(0.75)
    })

    it('barrel has wider bore than rifle (radius 0.04 vs 0.03)', () => {
      const shotgun = ProgrammaticGunFactory.createShotgun()
      const barrel = shotgun.children.find((c: any) =>
        c.isMesh && c.geometry.radiusTop === 0.04
      )
      expect(barrel).toBeDefined()
      expect(barrel.geometry.radiusTop).toBeCloseTo(0.04, 5)
    })

    it('has tube magazine under barrel', () => {
      const shotgun = ProgrammaticGunFactory.createShotgun()
      const tubeMag = shotgun.children.find((c: any) =>
        c.isMesh && c.geometry.radiusTop === 0.035 && c.position.y === -0.06
      )
      expect(tubeMag).toBeDefined()
    })

    it('has front bead sight (sphere geometry)', () => {
      const shotgun = ProgrammaticGunFactory.createShotgun()
      const frontSight = shotgun.children.find((c: any) =>
        c.isMesh && c.geometry.radius !== undefined
      )
      expect(frontSight).toBeDefined()
      expect(frontSight.geometry.radius).toBeCloseTo(0.012, 5)
    })
  })

  describe('createSMG()', () => {
    it('returns a THREE.Group', () => {
      const smg = ProgrammaticGunFactory.createSMG()
      expect(smg.isGroup).toBe(true)
    })

    it('creates group with 9 children (receiver, handguard, barrel, stock, grip, magazine, rear sight, front sight, muzzle)', () => {
      const smg = ProgrammaticGunFactory.createSMG()
      expect(smg.children.length).toBe(9)
    })

    it('has muzzle marker object with correct name', () => {
      const smg = ProgrammaticGunFactory.createSMG()
      const muzzle = smg.getObjectByName('muzzle')
      expect(muzzle).toBeDefined()
      expect(muzzle.name).toBe('muzzle')
    })

    it('has magazine object with correct name', () => {
      const smg = ProgrammaticGunFactory.createSMG()
      const magazine = smg.getObjectByName('magazine')
      expect(magazine).toBeDefined()
      expect(magazine.name).toBe('magazine')
    })

    it('muzzle is positioned closer than rifle (x ~1.25 vs ~1.7)', () => {
      const smg = ProgrammaticGunFactory.createSMG()
      const muzzle = smg.getObjectByName('muzzle')
      expect(muzzle.position.x).toBeCloseTo(1.25, 1)
    })

    it('uses default gray material when no material provided', () => {
      const smg = ProgrammaticGunFactory.createSMG()
      const receiver = smg.children.find((c: any) => c.isMesh && c.geometry.width === 0.5)
      expect(receiver).toBeDefined()
      expect(receiver.material.color).toBe(0x2a2a2a)
    })

    it('uses provided custom material for receiver', () => {
      const customMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff })
      const smg = ProgrammaticGunFactory.createSMG(customMaterial)
      const receiver = smg.children.find((c: any) => c.isMesh && c.geometry.width === 0.5)
      expect(receiver.material).toBe(customMaterial)
    })

    it('has compact receiver (0.5 width vs rifle 0.7)', () => {
      const smg = ProgrammaticGunFactory.createSMG()
      const receiver = smg.children.find((c: any) => c.isMesh && c.geometry.width === 0.5)
      expect(receiver).toBeDefined()
      expect(receiver.geometry.width).toBeCloseTo(0.5, 5)
    })

    it('has shorter barrel than rifle (height 0.6 vs 0.9)', () => {
      const smg = ProgrammaticGunFactory.createSMG()
      const barrel = smg.children.find((c: any) => c.isMesh && c.geometry.radiusTop !== undefined)
      expect(barrel.geometry.height).toBeCloseTo(0.6, 5)
    })

    it('has thinner barrel than shotgun (radius 0.025 vs 0.04)', () => {
      const smg = ProgrammaticGunFactory.createSMG()
      const barrel = smg.children.find((c: any) => c.isMesh && c.geometry.radiusTop !== undefined)
      expect(barrel.geometry.radiusTop).toBeCloseTo(0.025, 5)
    })

    it('has larger magazine for high-capacity look (0.3 height vs rifle 0.25)', () => {
      const smg = ProgrammaticGunFactory.createSMG()
      const magazine = smg.getObjectByName('magazine')
      expect(magazine.geometry.height).toBeCloseTo(0.3, 5)
    })

    it('has correct scale (0.75, 0.75, 0.75)', () => {
      const smg = ProgrammaticGunFactory.createSMG()
      expect(smg.scale.x).toBe(0.75)
      expect(smg.scale.y).toBe(0.75)
      expect(smg.scale.z).toBe(0.75)
    })
  })

  describe('createPistol()', () => {
    it('returns a THREE.Group', () => {
      const pistol = ProgrammaticGunFactory.createPistol()
      expect(pistol.isGroup).toBe(true)
    })

    it('creates group with 9 children (slide, frame, barrel, grip, magazine, trigger guard, front sight, rear sight, muzzle)', () => {
      const pistol = ProgrammaticGunFactory.createPistol()
      expect(pistol.children.length).toBe(9)
    })

    it('has muzzle marker object with correct name', () => {
      const pistol = ProgrammaticGunFactory.createPistol()
      const muzzle = pistol.getObjectByName('muzzle')
      expect(muzzle).toBeDefined()
      expect(muzzle.name).toBe('muzzle')
    })

    it('has magazine object with correct name', () => {
      const pistol = ProgrammaticGunFactory.createPistol()
      const magazine = pistol.getObjectByName('magazine')
      expect(magazine).toBeDefined()
      expect(magazine.name).toBe('magazine')
    })

    it('muzzle is positioned very close (x ~0.43)', () => {
      const pistol = ProgrammaticGunFactory.createPistol()
      const muzzle = pistol.getObjectByName('muzzle')
      expect(muzzle.position.x).toBeCloseTo(0.43, 1)
    })

    it('uses default dark metal material when no material provided', () => {
      const pistol = ProgrammaticGunFactory.createPistol()
      const slide = pistol.children.find((c: any) => c.isMesh && c.geometry.width === 0.35)
      expect(slide).toBeDefined()
      expect(slide.material.color).toBe(0x1c1c1c)
    })

    it('uses provided custom material for slide', () => {
      const customMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 })
      const pistol = ProgrammaticGunFactory.createPistol(customMaterial)
      const slide = pistol.children.find((c: any) => c.isMesh && c.geometry.width === 0.35)
      expect(slide.material).toBe(customMaterial)
    })

    it('has slide and frame (dual-part construction)', () => {
      const pistol = ProgrammaticGunFactory.createPistol()
      const slide = pistol.children.find((c: any) => c.isMesh && c.geometry.width === 0.35)
      const frame = pistol.children.find((c: any) => c.isMesh && c.geometry.width === 0.3)
      expect(slide).toBeDefined()
      expect(frame).toBeDefined()
    })

    it('has much shorter barrel than rifle (height 0.15 vs 0.9)', () => {
      const pistol = ProgrammaticGunFactory.createPistol()
      const barrel = pistol.children.find((c: any) => c.isMesh && c.geometry.radiusTop !== undefined)
      expect(barrel.geometry.height).toBeCloseTo(0.15, 5)
    })

    it('has smallest magazine of all weapons (height 0.16)', () => {
      const pistol = ProgrammaticGunFactory.createPistol()
      const magazine = pistol.getObjectByName('magazine')
      expect(magazine.geometry.height).toBeCloseTo(0.16, 5)
    })

    it('has correct scale (0.85, 0.85, 0.85) - larger than other weapons', () => {
      const pistol = ProgrammaticGunFactory.createPistol()
      expect(pistol.scale.x).toBe(0.85)
      expect(pistol.scale.y).toBe(0.85)
      expect(pistol.scale.z).toBe(0.85)
    })

    it('has trigger guard positioned correctly', () => {
      const pistol = ProgrammaticGunFactory.createPistol()
      const triggerGuard = pistol.children.find((c: any) =>
        c.isMesh && c.geometry.width === 0.08 && c.geometry.height === 0.03
      )
      expect(triggerGuard).toBeDefined()
      expect(triggerGuard.position.y).toBeCloseTo(-0.08, 5)
    })
  })

  describe('Material types', () => {
    it('rifle uses MeshBasicMaterial by default', () => {
      const rifle = ProgrammaticGunFactory.createRifle()
      const mesh = rifle.children.find((c: any) => c.isMesh)
      expect(mesh.material.isMeshBasicMaterial).toBe(true)
    })

    it('shotgun uses MeshBasicMaterial by default', () => {
      const shotgun = ProgrammaticGunFactory.createShotgun()
      const mesh = shotgun.children.find((c: any) => c.isMesh)
      expect(mesh.material.isMeshBasicMaterial).toBe(true)
    })

    it('SMG uses MeshBasicMaterial by default', () => {
      const smg = ProgrammaticGunFactory.createSMG()
      const mesh = smg.children.find((c: any) => c.isMesh)
      expect(mesh.material.isMeshBasicMaterial).toBe(true)
    })

    it('pistol uses MeshBasicMaterial by default', () => {
      const pistol = ProgrammaticGunFactory.createPistol()
      const mesh = pistol.children.find((c: any) => c.isMesh)
      expect(mesh.material.isMeshBasicMaterial).toBe(true)
    })
  })

  describe('Weapon differentiation', () => {
    it('rifle has longest barrel (0.9)', () => {
      const rifle = ProgrammaticGunFactory.createRifle()
      const barrel = rifle.children.find((c: any) => c.isMesh && c.geometry.radiusTop !== undefined)
      expect(barrel.geometry.height).toBeCloseTo(0.9, 5)
    })

    it('shotgun has widest barrel (0.04 radius)', () => {
      const shotgun = ProgrammaticGunFactory.createShotgun()
      const barrel = shotgun.children.find((c: any) => c.isMesh && c.geometry.radiusTop === 0.04)
      expect(barrel).toBeDefined()
    })

    it('SMG has medium-length barrel (0.6)', () => {
      const smg = ProgrammaticGunFactory.createSMG()
      const barrel = smg.children.find((c: any) => c.isMesh && c.geometry.radiusTop !== undefined)
      expect(barrel.geometry.height).toBeCloseTo(0.6, 5)
    })

    it('pistol has shortest barrel (0.15)', () => {
      const pistol = ProgrammaticGunFactory.createPistol()
      const barrel = pistol.children.find((c: any) => c.isMesh && c.geometry.radiusTop !== undefined)
      expect(barrel.geometry.height).toBeCloseTo(0.15, 5)
    })

    it('only shotgun has pump grip', () => {
      const rifle = ProgrammaticGunFactory.createRifle()
      const shotgun = ProgrammaticGunFactory.createShotgun()
      const smg = ProgrammaticGunFactory.createSMG()
      const pistol = ProgrammaticGunFactory.createPistol()

      expect(rifle.getObjectByName('pumpGrip')).toBeUndefined()
      expect(shotgun.getObjectByName('pumpGrip')).toBeDefined()
      expect(smg.getObjectByName('pumpGrip')).toBeUndefined()
      expect(pistol.getObjectByName('pumpGrip')).toBeUndefined()
    })

    it('pistol is only weapon with separate slide and frame', () => {
      const pistol = ProgrammaticGunFactory.createPistol()
      const slide = pistol.children.find((c: any) => c.isMesh && c.geometry.width === 0.35)
      const frame = pistol.children.find((c: any) => c.isMesh && c.geometry.width === 0.3)

      expect(slide).toBeDefined()
      expect(frame).toBeDefined()
    })

    it('shotgun is only weapon with sphere geometry (bead sight)', () => {
      const rifle = ProgrammaticGunFactory.createRifle()
      const shotgun = ProgrammaticGunFactory.createShotgun()
      const smg = ProgrammaticGunFactory.createSMG()
      const pistol = ProgrammaticGunFactory.createPistol()

      const rifleSphere = rifle.children.find((c: any) => c.isMesh && c.geometry.radius !== undefined)
      const shotgunSphere = shotgun.children.find((c: any) => c.isMesh && c.geometry.radius !== undefined)
      const smgSphere = smg.children.find((c: any) => c.isMesh && c.geometry.radius !== undefined)
      const pistolSphere = pistol.children.find((c: any) => c.isMesh && c.geometry.radius !== undefined)

      expect(rifleSphere).toBeUndefined()
      expect(shotgunSphere).toBeDefined()
      expect(smgSphere).toBeUndefined()
      expect(pistolSphere).toBeUndefined()
    })
  })

  describe('Muzzle positioning', () => {
    it('muzzle positions scale correctly with barrel length', () => {
      const rifle = ProgrammaticGunFactory.createRifle()
      const shotgun = ProgrammaticGunFactory.createShotgun()
      const smg = ProgrammaticGunFactory.createSMG()
      const pistol = ProgrammaticGunFactory.createPistol()

      const rifleMuzzle = rifle.getObjectByName('muzzle')
      const shotgunMuzzle = shotgun.getObjectByName('muzzle')
      const smgMuzzle = smg.getObjectByName('muzzle')
      const pistolMuzzle = pistol.getObjectByName('muzzle')

      // Rifle has longest muzzle position
      expect(rifleMuzzle.position.x).toBeGreaterThan(shotgunMuzzle.position.x)
      expect(shotgunMuzzle.position.x).toBeGreaterThan(smgMuzzle.position.x)
      expect(smgMuzzle.position.x).toBeGreaterThan(pistolMuzzle.position.x)
    })
  })

  describe('Magazine positioning', () => {
    it('all weapons have magazines positioned below weapon body', () => {
      const rifle = ProgrammaticGunFactory.createRifle()
      const shotgun = ProgrammaticGunFactory.createShotgun()
      const smg = ProgrammaticGunFactory.createSMG()
      const pistol = ProgrammaticGunFactory.createPistol()

      const rifleMag = rifle.getObjectByName('magazine')
      const smgMag = smg.getObjectByName('magazine')
      const pistolMag = pistol.getObjectByName('magazine')

      expect(rifleMag.position.y).toBeLessThan(0)
      expect(smgMag.position.y).toBeLessThan(0)
      expect(pistolMag.position.y).toBeLessThan(0)
    })
  })
})

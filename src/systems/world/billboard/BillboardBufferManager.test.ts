import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { GPUBillboardVegetation } from './BillboardBufferManager'
import { Logger } from '../../../utils/Logger'

vi.mock('three', () => {
  class Vector3 {
    x: number
    y: number
    z: number

    constructor(x = 0, y = 0, z = 0) {
      this.x = x
      this.y = y
      this.z = z
    }

    copy(v: Vector3) {
      this.x = v.x
      this.y = v.y
      this.z = v.z
      return this
    }
  }

  class Vector2 {
    x: number
    y: number

    constructor(x = 0, y = 0) {
      this.x = x
      this.y = y
    }

    copy(v: Vector2) {
      this.x = v.x
      this.y = v.y
      return this
    }
  }

  class Matrix4 {
    copiedFrom?: Matrix4

    copy(m: Matrix4) {
      this.copiedFrom = m
      return this
    }
  }

  class Color {
    r: number
    g: number
    b: number

    constructor(r = 0, g?: number, b?: number) {
      if (g === undefined && b === undefined) {
        const hex = r as number
        this.r = ((hex >> 16) & 0xff) / 255
        this.g = ((hex >> 8) & 0xff) / 255
        this.b = (hex & 0xff) / 255
      } else {
        this.r = r
        this.g = g ?? 0
        this.b = b ?? 0
      }
    }

    copy(c: Color) {
      this.r = c.r
      this.g = c.g
      this.b = c.b
      return this
    }
  }

  class InstancedBufferAttribute {
    array: Float32Array
    itemSize: number
    usage?: number
    needsUpdate = false

    constructor(array: Float32Array, itemSize: number) {
      this.array = array
      this.itemSize = itemSize
    }

    setUsage(usage: number) {
      this.usage = usage
      return this
    }
  }

  class InstancedBufferGeometry {
    index: any = null
    attributes: Record<string, any> = {}
    instanceCount = 0
    dispose = vi.fn()

    setAttribute(name: string, attr: any) {
      this.attributes[name] = attr
    }
  }

  class PlaneGeometry {
    index = { id: 'index' }
    attributes = { position: { id: 'position' }, uv: { id: 'uv' } }
  }

  class RawShaderMaterial {
    uniforms: Record<string, { value: any }>
    vertexShader: string
    fragmentShader: string
    transparent: boolean
    side: any
    depthWrite: boolean
    depthTest: boolean
    dispose = vi.fn()

    constructor(params: any) {
      this.uniforms = params.uniforms
      this.vertexShader = params.vertexShader
      this.fragmentShader = params.fragmentShader
      this.transparent = params.transparent
      this.side = params.side
      this.depthWrite = params.depthWrite
      this.depthTest = params.depthTest
    }
  }

  class Mesh {
    geometry: any
    material: any
    frustumCulled = true

    constructor(geometry: any, material: any) {
      this.geometry = geometry
      this.material = material
    }
  }

  class Scene {
    add = vi.fn()
    remove = vi.fn()
  }

  class Camera {
    position = new Vector3()
    matrixWorldInverse = new Matrix4()
  }

  class PerspectiveCamera extends Camera {}

  return {
    Scene,
    PlaneGeometry,
    InstancedBufferGeometry,
    InstancedBufferAttribute,
    RawShaderMaterial,
    Mesh,
    Vector3,
    Vector2,
    Matrix4,
    Color,
    PerspectiveCamera,
    Camera,
    DynamicDrawUsage: 35048,
    DoubleSide: 'DoubleSide',
  }
})

vi.mock('./BillboardShaders', () => ({
  BILLBOARD_VERTEX_SHADER: 'vertex',
  BILLBOARD_FRAGMENT_SHADER: 'fragment',
}))

vi.mock('../../../utils/Logger', () => ({
  Logger: {
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

const createConfig = (maxInstances = 5) => ({
  maxInstances,
  texture: {} as any,
  width: 2,
  height: 3,
  fadeDistance: 10,
  maxDistance: 100,
})

const createInstance = (x: number, y: number, z: number, sx = 1, sy = 1, rot = 0) => ({
  position: new THREE.Vector3(x, y, z),
  scale: new THREE.Vector3(sx, sy, 1),
  rotation: rot,
})

describe('GPUBillboardVegetation', () => {
  let scene: THREE.Scene

  beforeEach(() => {
    scene = new THREE.Scene()
    vi.clearAllMocks()
  })

  it('creates geometry, material, mesh, and adds to scene', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any

    expect(internal.geometry).toBeTruthy()
    expect(internal.material).toBeTruthy()
    expect(internal.mesh).toBeTruthy()
    expect(internal.mesh.frustumCulled).toBe(false)
    expect(scene.add).toHaveBeenCalledWith(internal.mesh)
  })

  it('uses plane geometry index and attributes', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any

    expect(internal.geometry.index).toEqual({ id: 'index' })
    expect(internal.geometry.attributes).toEqual({
      position: { id: 'position' },
      uv: { id: 'uv' },
      instancePosition: internal.positionAttribute,
      instanceScale: internal.scaleAttribute,
      instanceRotation: internal.rotationAttribute,
    })
  })

  it('initializes instance arrays with correct sizes', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig(7))
    const internal = manager as any

    expect(internal.positions.length).toBe(21)
    expect(internal.scales.length).toBe(14)
    expect(internal.rotations.length).toBe(7)
  })

  it('sets attributes to dynamic usage', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any

    expect(internal.positionAttribute.usage).toBe(THREE.DynamicDrawUsage)
    expect(internal.scaleAttribute.usage).toBe(THREE.DynamicDrawUsage)
    expect(internal.rotationAttribute.usage).toBe(THREE.DynamicDrawUsage)
  })

  it('addInstances allocates sequential indices and updates arrays', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any

    const indices = manager.addInstances([
      createInstance(1, 2, 3, 2, 3, 0.5),
      createInstance(4, 5, 6, 1, 2, 1.2),
    ])

    expect(indices).toEqual([0, 1])
    expect(internal.positions.slice(0, 6)).toEqual(new Float32Array([1, 2, 3, 4, 5, 6]))
    expect(internal.scales.slice(0, 4)).toEqual(new Float32Array([2, 3, 1, 2]))
    expect(internal.rotations.slice(0, 2)).toEqual(new Float32Array([0.5, 1.2]))
  })

  it('addInstances increments live count and high water mark', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())

    manager.addInstances([createInstance(0, 0, 0), createInstance(1, 1, 1)])

    expect(manager.getInstanceCount()).toBe(2)
    expect(manager.getHighWaterMark()).toBe(2)
  })

  it('addInstances sets instanceCount on geometry', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any

    manager.addInstances([createInstance(0, 0, 0), createInstance(1, 1, 1)])

    expect(internal.geometry.instanceCount).toBe(2)
  })

  it('addInstances returns empty array for empty input', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())

    expect(manager.addInstances([])).toEqual([])
    expect(manager.getInstanceCount()).toBe(0)
  })

  it('addInstances reuses free slots before extending high water mark', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())

    const first = manager.addInstances([createInstance(0, 0, 0), createInstance(1, 1, 1)])
    manager.removeInstances([first[0]])

    const second = manager.addInstances([createInstance(2, 2, 2)])

    expect(second).toEqual([first[0]])
    expect(manager.getHighWaterMark()).toBe(2)
    expect(manager.getInstanceCount()).toBe(2)
  })

  it('addInstances stops at capacity and warns once', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig(2))

    const first = manager.addInstances([
      createInstance(0, 0, 0),
      createInstance(1, 1, 1),
      createInstance(2, 2, 2),
    ])

    expect(first).toEqual([0, 1])
    expect(Logger.warn).toHaveBeenCalledTimes(1)

    const second = manager.addInstances([createInstance(3, 3, 3)])
    expect(second).toEqual([])
    expect(Logger.warn).toHaveBeenCalledTimes(1)
  })

  it('removeInstances zeros scale and tracks free slots', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any

    manager.addInstances([createInstance(0, 0, 0), createInstance(1, 1, 1)])
    manager.removeInstances([0])

    expect(internal.scales.slice(0, 2)).toEqual(new Float32Array([0, 0]))
    expect(manager.getFreeSlotCount()).toBe(1)
    expect(manager.getInstanceCount()).toBe(1)
  })

  it('removeInstances skips already removed indices', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())

    const indices = manager.addInstances([createInstance(0, 0, 0)])
    manager.removeInstances([indices[0]])
    manager.removeInstances([indices[0]])

    expect(manager.getFreeSlotCount()).toBe(0)
    expect(manager.getInstanceCount()).toBe(0)
  })

  it('removeInstances ignores indices beyond high water mark', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())

    manager.addInstances([createInstance(0, 0, 0)])
    manager.removeInstances([5])

    expect(manager.getFreeSlotCount()).toBe(0)
    expect(manager.getInstanceCount()).toBe(1)
  })

  it('compactHighWaterMark shrinks when trailing slots freed', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any

    const indices = manager.addInstances([
      createInstance(0, 0, 0),
      createInstance(1, 1, 1),
      createInstance(2, 2, 2),
    ])

    manager.removeInstances([indices[2], indices[1]])

    expect(manager.getHighWaterMark()).toBe(1)
    expect(internal.geometry.instanceCount).toBe(1)
  })

  it('compactHighWaterMark resets capacity warning when below max', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig(1))
    const internal = manager as any

    manager.addInstances([createInstance(0, 0, 0)])
    manager.addInstances([createInstance(1, 1, 1)])
    expect(Logger.warn).toHaveBeenCalledTimes(1)

    manager.removeInstances([0])

    expect(internal.warnedCapacity).toBe(false)
  })

  it('reset clears counters, free slots, and instanceCount', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any

    const indices = manager.addInstances([createInstance(0, 0, 0), createInstance(1, 1, 1)])
    manager.removeInstances([indices[0]])
    manager.reset()

    expect(manager.getInstanceCount()).toBe(0)
    expect(manager.getHighWaterMark()).toBe(0)
    expect(manager.getFreeSlotCount()).toBe(0)
    expect(internal.geometry.instanceCount).toBe(0)
  })

  it('update flushes pending buffer updates', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any

    manager.addInstances([createInstance(0, 0, 0)])
    manager.update(new THREE.PerspectiveCamera(), 0)

    expect(internal.positionAttribute.needsUpdate).toBe(true)
    expect(internal.scaleAttribute.needsUpdate).toBe(true)
    expect(internal.rotationAttribute.needsUpdate).toBe(true)
  })

  it('update does not reapply when no pending updates', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any

    manager.addInstances([createInstance(0, 0, 0)])
    manager.update(new THREE.PerspectiveCamera(), 0)

    internal.positionAttribute.needsUpdate = false
    internal.scaleAttribute.needsUpdate = false
    internal.rotationAttribute.needsUpdate = false

    manager.update(new THREE.PerspectiveCamera(), 1)

    expect(internal.positionAttribute.needsUpdate).toBe(false)
    expect(internal.scaleAttribute.needsUpdate).toBe(false)
    expect(internal.rotationAttribute.needsUpdate).toBe(false)
  })

  it('update copies camera position and sets time', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any
    const camera = new THREE.PerspectiveCamera()

    camera.position = new THREE.Vector3(9, 8, 7)
    manager.update(camera, 123)

    const cameraPos = internal.material.uniforms.cameraPosition.value
    expect(cameraPos.x).toBe(9)
    expect(cameraPos.y).toBe(8)
    expect(cameraPos.z).toBe(7)
    expect(internal.material.uniforms.time.value).toBe(123)
  })

  it('update copies viewMatrix for PerspectiveCamera', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any
    const camera = new THREE.PerspectiveCamera()

    manager.update(camera, 0)

    expect(internal.material.uniforms.viewMatrix.value.copiedFrom).toBe(camera.matrixWorldInverse)
  })

  it('update skips viewMatrix copy for non-perspective camera', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any
    const camera = new THREE.Camera()

    manager.update(camera, 0)

    expect(internal.material.uniforms.viewMatrix.value.copiedFrom).toBeUndefined()
  })

  it('update enables fog and copies fog color when fog is provided', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any
    const fogColor = new THREE.Color(0.1, 0.2, 0.3)

    manager.update(new THREE.PerspectiveCamera(), 0, { color: fogColor } as any)

    expect(internal.material.uniforms.fogEnabled.value).toBe(true)
    expect(internal.material.uniforms.fogColor.value.r).toBeCloseTo(0.1)
    expect(internal.material.uniforms.fogColor.value.g).toBeCloseTo(0.2)
    expect(internal.material.uniforms.fogColor.value.b).toBeCloseTo(0.3)
  })

  it('update disables fog when no fog is provided', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any

    manager.update(new THREE.PerspectiveCamera(), 0, null)

    expect(internal.material.uniforms.fogEnabled.value).toBe(false)
  })

  it('getters return correct values', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())

    manager.addInstances([createInstance(0, 0, 0), createInstance(1, 1, 1)])

    expect(manager.getInstanceCount()).toBe(2)
    expect(manager.getHighWaterMark()).toBe(2)
    expect(manager.getFreeSlotCount()).toBe(0)
  })

  it('dispose disposes geometry and material and removes mesh', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any

    manager.dispose()

    expect(internal.geometry.dispose).toHaveBeenCalled()
    expect(internal.material.dispose).toHaveBeenCalled()
    expect(scene.remove).toHaveBeenCalledWith(internal.mesh)
  })

  it('add after remove reuses freed slots and updates data', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any

    const indices = manager.addInstances([
      createInstance(0, 0, 0, 1, 1, 0),
      createInstance(1, 1, 1, 2, 2, 1),
    ])

    manager.removeInstances([indices[0]])

    const newIndices = manager.addInstances([createInstance(5, 6, 7, 3, 4, 2)])
    const reused = newIndices[0]
    const i3 = reused * 3
    const i2 = reused * 2

    expect(reused).toBe(indices[0])
    expect(internal.positions.slice(i3, i3 + 3)).toEqual(new Float32Array([5, 6, 7]))
    expect(internal.scales.slice(i2, i2 + 2)).toEqual(new Float32Array([3, 4]))
    expect(internal.rotations[reused]).toBe(2)
  })

  it('removeInstances does not drop liveCount below zero', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())

    manager.removeInstances([0])

    expect(manager.getInstanceCount()).toBe(0)
  })

  it('reset triggers pending updates for all attributes', () => {
    const manager = new GPUBillboardVegetation(scene, createConfig())
    const internal = manager as any

    manager.addInstances([createInstance(0, 0, 0)])
    manager.update(new THREE.PerspectiveCamera(), 0)

    internal.positionAttribute.needsUpdate = false
    internal.scaleAttribute.needsUpdate = false
    internal.rotationAttribute.needsUpdate = false

    manager.reset()
    manager.update(new THREE.PerspectiveCamera(), 0)

    expect(internal.positionAttribute.needsUpdate).toBe(true)
    expect(internal.scaleAttribute.needsUpdate).toBe(true)
    expect(internal.rotationAttribute.needsUpdate).toBe(true)
  })
})

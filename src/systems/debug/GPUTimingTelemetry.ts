// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger
//
// GPU frame-time telemetry.
//
// WHAT IS MEASURED: the GPU wall-clock duration of the main render pass
// (`renderer.render(scene, camera)`), surfaced as `GPUTelemetry.gpuTimeMs`.
// This is the render-pass GPU time, not the whole-frame GPU time (post FX and
// overlay passes are separate render calls and are not summed here).
//
// FLAG: opt-in only via `?gpuTiming=1`. Default sessions never arm any timing
// path and pay zero cost. The same flag gates the WebGPU `timestamp-query`
// feature request at renderer construction (see RendererBackend.gpuTimingFlagEnabled).
//
// FALLBACK LADDER (first that applies wins):
//   1. WebGPU  -> WebGPURenderer timestamp-query. Requires `trackTimestamp`
//      at construction AND the device exposing the `timestamp-query` feature.
//      Three.js instruments the render pass automatically; we resolve the
//      previous frame's timestamps each frame and read `info.render.timestamp`
//      (already in milliseconds). If the device lacks the feature we report
//      `available: false` with an explicit `unsupportedReason`.
//   2. WebGL2  -> EXT_disjoint_timer_query_webgl2 (manual begin/end query).
//   3. null    -> neither path available; `available: false`, `gpuTimeMs: 0`.

import * as THREE from 'three'
import { Logger } from '../../utils/Logger'
import { gpuTimingFlagEnabled } from '../../core/RendererBackend'

export interface GPUTelemetry {
  available: boolean
  gpuTimeMs: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
  /** Which timing path is active, or the reason none is. Diagnostic only. */
  backend?: 'webgpu' | 'webgl2' | 'none'
  /** Populated when a path was requested but could not be armed. */
  unsupportedReason?: string
}

// Minimal structural view of the WebGPU render path we depend on. The concrete
// types live in `three/webgpu`; we only touch this narrow surface so the
// WebGL2 fallback keeps working when those members are absent.
type TimestampCapableRenderer = THREE.WebGLRenderer & {
  isWebGPURenderer?: boolean
  trackTimestamp?: boolean
  hasInitialized?: () => boolean
  hasFeature?: (name: string) => boolean
  resolveTimestampsAsync?: (type?: string) => Promise<number | undefined>
  info: THREE.WebGLRenderer['info'] & {
    render: THREE.WebGLRenderer['info']['render'] & { timestamp?: number }
  }
}

const WEBGPU_TIMESTAMP_FEATURE = 'timestamp-query'

export class GPUTimingTelemetry {
  private gpuTimerExt: any = null
  private gpuQuery: WebGLQuery | null = null
  private gpuTimeMs: number = 0
  private gpuTimingAvailable: boolean = false
  private renderer: THREE.WebGLRenderer | null = null
  private backendKind: 'webgpu' | 'webgl2' | 'none' = 'none'
  private unsupportedReason: string | null = null
  private webgpuResolveInFlight = false

  /**
   * Initialize GPU timing (call once with renderer)
   */
  init(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer
    this.backendKind = 'none'
    this.unsupportedReason = null

    if (!gpuTimingFlagEnabled()) {
      this.gpuTimingAvailable = false
      Logger.info('performance', '[Perf] GPU timing disabled (opt-in via ?gpuTiming=1)')
      return
    }

    if (this.isWebGPURenderer(renderer)) {
      this.initWebGPUTiming(renderer as TimestampCapableRenderer)
      return
    }

    this.initWebGL2Timing()
  }

  private initWebGPUTiming(renderer: TimestampCapableRenderer): void {
    // `trackTimestamp` must have been requested at construction (?gpuTiming=1
    // wires it in RendererBackend). Without it the query pool is never built.
    if (renderer.trackTimestamp !== true) {
      this.markUnsupported('webgpu', 'trackTimestamp not enabled at renderer construction')
      return
    }

    // `hasFeature` throws if called before init; the backend also self-gates
    // trackTimestamp on device support, so probe defensively.
    let deviceSupportsFeature = false
    try {
      if (renderer.hasInitialized?.() === false) {
        this.markUnsupported('webgpu', 'renderer not initialized when GPU timing armed')
        return
      }
      deviceSupportsFeature = renderer.hasFeature?.(WEBGPU_TIMESTAMP_FEATURE) === true
    } catch (error) {
      this.markUnsupported('webgpu', `hasFeature(timestamp-query) threw: ${toMessage(error)}`)
      return
    }

    if (!deviceSupportsFeature || typeof renderer.resolveTimestampsAsync !== 'function') {
      this.markUnsupported('webgpu', 'device does not expose the timestamp-query feature')
      return
    }

    this.backendKind = 'webgpu'
    this.gpuTimingAvailable = true
    Logger.info('performance', '[Perf] GPU timing enabled (WebGPU timestamp-query)')
  }

  private initWebGL2Timing(): void {
    const gl = this.getWebGL2Context()
    if (!gl) {
      this.markUnsupported('webgl2', 'WebGL2 context not available for GPU timing')
      return
    }

    this.gpuTimerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2')
    if (this.gpuTimerExt) {
      this.backendKind = 'webgl2'
      this.gpuTimingAvailable = true
      Logger.info('performance', '[Perf] GPU timing enabled (EXT_disjoint_timer_query_webgl2)')
    } else {
      this.markUnsupported('webgl2', 'EXT_disjoint_timer_query_webgl2 not supported')
    }
  }

  private markUnsupported(backend: 'webgpu' | 'webgl2', reason: string): void {
    this.backendKind = backend
    this.gpuTimingAvailable = false
    this.unsupportedReason = reason
    Logger.warn('performance', `[Perf] GPU timing unavailable (${backend}): ${reason}`)
  }

  /**
   * Begin GPU timing measurement (call before renderer.render())
   */
  beginTimer(): void {
    if (this.backendKind !== 'webgl2') return
    if (!this.gpuTimingAvailable || !this.renderer || this.gpuQuery) return

    const gl = this.getWebGL2Context()
    if (!gl) return
    this.gpuQuery = gl.createQuery()

    if (this.gpuQuery) {
      gl.beginQuery(this.gpuTimerExt.TIME_ELAPSED_EXT, this.gpuQuery)
    }
  }

  /**
   * End GPU timing measurement (call after renderer.render())
   */
  endTimer(): void {
    if (this.backendKind !== 'webgl2') return
    if (!this.gpuTimingAvailable || !this.renderer || !this.gpuQuery) return

    const gl = this.getWebGL2Context()
    if (!gl) return
    gl.endQuery(this.gpuTimerExt.TIME_ELAPSED_EXT)
  }

  /**
   * Collect GPU timing result from previous frame (async, non-blocking)
   * Call once per frame after endGPUTimer()
   */
  collectTime(): void {
    if (this.backendKind === 'webgpu') {
      this.collectWebGPUTime()
      return
    }
    this.collectWebGL2Time()
  }

  private collectWebGPUTime(): void {
    if (!this.gpuTimingAvailable || !this.renderer) return
    const renderer = this.renderer as TimestampCapableRenderer

    // Read the value the previous resolve settled onto info.render.timestamp
    // (already in milliseconds). Reset each frame by Three.js, so a stale read
    // between resolves simply repeats the last frame's number.
    const settled = renderer.info?.render?.timestamp
    if (typeof settled === 'number' && Number.isFinite(settled) && settled > 0) {
      this.gpuTimeMs = settled
    }

    // Kick off (non-blocking) the resolve for the frame just submitted. Guard
    // against overlap: the query pool serializes resolves internally, but we
    // avoid stacking unsettled promises.
    if (this.webgpuResolveInFlight || typeof renderer.resolveTimestampsAsync !== 'function') return
    this.webgpuResolveInFlight = true
    renderer
      .resolveTimestampsAsync('render')
      .then((duration) => {
        if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
          this.gpuTimeMs = duration
        }
      })
      .catch((error) => {
        Logger.debug('performance', `[Perf] WebGPU timestamp resolve failed: ${toMessage(error)}`)
      })
      .finally(() => {
        this.webgpuResolveInFlight = false
      })
  }

  private collectWebGL2Time(): void {
    if (!this.gpuQuery || !this.renderer) return

    const gl = this.getWebGL2Context()
    if (!gl) return
    const available = gl.getQueryParameter(this.gpuQuery, gl.QUERY_RESULT_AVAILABLE)
    const disjoint = gl.getParameter(this.gpuTimerExt.GPU_DISJOINT_EXT)

    if (available && !disjoint) {
      const ns = gl.getQueryParameter(this.gpuQuery, gl.QUERY_RESULT)
      this.gpuTimeMs = ns / 1e6 // Convert nanoseconds to milliseconds
    }

    if (available || disjoint) {
      gl.deleteQuery(this.gpuQuery)
      this.gpuQuery = null
    }
  }

  /**
   * Get current GPU telemetry
   */
  getTelemetry(): GPUTelemetry {
    if (!this.renderer) {
      return {
        available: false,
        gpuTimeMs: 0,
        drawCalls: 0,
        triangles: 0,
        geometries: 0,
        textures: 0,
        programs: 0,
        backend: 'none'
      }
    }

    const info = this.renderer.info
    const telemetry: GPUTelemetry = {
      available: this.gpuTimingAvailable,
      gpuTimeMs: this.gpuTimeMs,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: (info.memory as any).programs ?? 0,
      backend: this.backendKind
    }
    if (this.unsupportedReason) {
      telemetry.unsupportedReason = this.unsupportedReason
    }
    return telemetry
  }

  get isAvailable(): boolean {
    return this.gpuTimingAvailable
  }

  get timeMs(): number {
    return this.gpuTimeMs
  }

  private isWebGPURenderer(renderer: THREE.WebGLRenderer | null): boolean {
    return (renderer as TimestampCapableRenderer | null)?.isWebGPURenderer === true
  }

  private getWebGL2Context(): WebGL2RenderingContext | null {
    const renderer = this.renderer as (THREE.WebGLRenderer & {
      getContext?: () => WebGLRenderingContext | WebGL2RenderingContext | null;
      isWebGPURenderer?: boolean;
    }) | null;
    if (!renderer || renderer.isWebGPURenderer === true || typeof renderer.getContext !== 'function') {
      return null;
    }
    const gl = renderer.getContext();
    return typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? gl : null;
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

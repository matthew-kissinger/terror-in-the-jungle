import * as THREE from 'three'

export interface GPUTelemetry {
  available: boolean
  gpuTimeMs: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
}

export class GPUTimingTelemetry {
  private gpuTimerExt: any = null
  private gpuQuery: WebGLQuery | null = null
  private gpuTimeMs: number = 0
  private gpuTimingAvailable: boolean = false
  private renderer: THREE.WebGLRenderer | null = null

  /**
   * Initialize GPU timing (call once with renderer)
   */
  init(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer
    const gl = renderer.getContext() as WebGL2RenderingContext

    if (!gl) {
      console.warn('[Perf] WebGL2 context not available for GPU timing')
      return
    }

    this.gpuTimerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2')

    if (this.gpuTimerExt) {
      this.gpuTimingAvailable = true
      console.log('[Perf] GPU timing enabled (EXT_disjoint_timer_query_webgl2)')
    } else {
      console.log('[Perf] GPU timing unavailable (extension not supported)')
    }
  }

  /**
   * Begin GPU timing measurement (call before renderer.render())
   */
  beginTimer(): void {
    if (!this.gpuTimingAvailable || !this.renderer || this.gpuQuery) return

    const gl = this.renderer.getContext() as WebGL2RenderingContext
    this.gpuQuery = gl.createQuery()

    if (this.gpuQuery) {
      gl.beginQuery(this.gpuTimerExt.TIME_ELAPSED_EXT, this.gpuQuery)
    }
  }

  /**
   * End GPU timing measurement (call after renderer.render())
   */
  endTimer(): void {
    if (!this.gpuTimingAvailable || !this.renderer || !this.gpuQuery) return

    const gl = this.renderer.getContext() as WebGL2RenderingContext
    gl.endQuery(this.gpuTimerExt.TIME_ELAPSED_EXT)
  }

  /**
   * Collect GPU timing result from previous frame (async, non-blocking)
   * Call once per frame after endGPUTimer()
   */
  collectTime(): void {
    if (!this.gpuQuery || !this.renderer) return

    const gl = this.renderer.getContext() as WebGL2RenderingContext
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
        programs: 0
      }
    }

    const info = this.renderer.info
    return {
      available: this.gpuTimingAvailable,
      gpuTimeMs: this.gpuTimeMs,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: (info.memory as any).programs ?? 0
    }
  }

  get isAvailable(): boolean {
    return this.gpuTimingAvailable
  }

  get timeMs(): number {
    return this.gpuTimeMs
  }
}

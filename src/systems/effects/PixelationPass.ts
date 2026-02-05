import * as THREE from 'three';
import { Pass } from 'postprocessing';

export class PixelationPass extends Pass {
  private material: THREE.ShaderMaterial;
  private resolution: THREE.Vector2;
  private pixelSize: number;
  private outlineStrength: number;
  private outlineThreshold: number;

  constructor(
    pixelSize = 4,
    outlineStrength = 0.8,
    outlineThreshold = 0.3
  ) {
    super('PixelationPass');

    this.pixelSize = pixelSize;
    this.outlineStrength = outlineStrength;
    this.outlineThreshold = outlineThreshold;
    this.resolution = new THREE.Vector2();

    // Custom shader for pixelation with outline detection
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        resolution: { value: this.resolution },
        pixelSize: { value: pixelSize },
        outlineStrength: { value: outlineStrength },
        outlineThreshold: { value: outlineThreshold },
        outlineColor: { value: new THREE.Color(0x000000) } // Dark outline
      },

      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,

      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform vec2 resolution;
        uniform float pixelSize;
        uniform float outlineStrength;
        uniform float outlineThreshold;
        uniform vec3 outlineColor;

        varying vec2 vUv;

        // Sample depth at a position
        float getDepth(vec2 coord) {
          return texture2D(tDepth, coord).r;
        }

        // Detect edges using depth and color differences
        float detectEdge(vec2 coord) {
          vec2 texelSize = 1.0 / resolution;

          // Sample neighboring pixels
          vec4 center = texture2D(tDiffuse, coord);
          vec4 left = texture2D(tDiffuse, coord - vec2(texelSize.x, 0.0));
          vec4 right = texture2D(tDiffuse, coord + vec2(texelSize.x, 0.0));
          vec4 top = texture2D(tDiffuse, coord - vec2(0.0, texelSize.y));
          vec4 bottom = texture2D(tDiffuse, coord + vec2(0.0, texelSize.y));

          // Check alpha differences for sprite edges
          float alphaEdge = 0.0;
          alphaEdge = max(alphaEdge, abs(center.a - left.a));
          alphaEdge = max(alphaEdge, abs(center.a - right.a));
          alphaEdge = max(alphaEdge, abs(center.a - top.a));
          alphaEdge = max(alphaEdge, abs(center.a - bottom.a));

          // Check color differences (helps with white edges)
          vec3 colorDiff = vec3(0.0);
          colorDiff = max(colorDiff, abs(center.rgb - left.rgb));
          colorDiff = max(colorDiff, abs(center.rgb - right.rgb));
          colorDiff = max(colorDiff, abs(center.rgb - top.rgb));
          colorDiff = max(colorDiff, abs(center.rgb - bottom.rgb));

          float colorEdge = max(colorDiff.r, max(colorDiff.g, colorDiff.b));

          // Check depth differences for 3D edges
          float depthCenter = getDepth(coord);
          float depthDiff = 0.0;
          depthDiff = max(depthDiff, abs(depthCenter - getDepth(coord - vec2(texelSize.x, 0.0))));
          depthDiff = max(depthDiff, abs(depthCenter - getDepth(coord + vec2(texelSize.x, 0.0))));
          depthDiff = max(depthDiff, abs(depthCenter - getDepth(coord - vec2(0.0, texelSize.y))));
          depthDiff = max(depthDiff, abs(depthCenter - getDepth(coord + vec2(0.0, texelSize.y))));

          // Combine edge detection methods
          float edge = max(alphaEdge * 2.0, max(colorEdge, depthDiff * 100.0));

          return smoothstep(outlineThreshold, outlineThreshold + 0.1, edge);
        }

        void main() {
          // Calculate pixelated coordinates
          vec2 pixelatedCoord = vUv;
          pixelatedCoord.x = floor(pixelatedCoord.x * resolution.x / pixelSize) * pixelSize / resolution.x;
          pixelatedCoord.y = floor(pixelatedCoord.y * resolution.y / pixelSize) * pixelSize / resolution.y;

          // Sample the pixelated color
          vec4 color = texture2D(tDiffuse, pixelatedCoord);

          // Detect edges at original resolution for sharper outlines
          float edge = detectEdge(vUv);

          // Apply outline
          if (edge > 0.0) {
            // Mix with outline color based on edge strength and overall outline strength
            color.rgb = mix(color.rgb, outlineColor, edge * outlineStrength);

            // Clean up white fringes by darkening very bright edges
            float brightness = dot(color.rgb, vec3(0.299, 0.587, 0.114));
            if (brightness > 0.9 && edge > 0.5) {
              color.rgb *= 0.7; // Darken white edges
            }
          }

          // Enhance contrast slightly for pixel art feel
          color.rgb = pow(color.rgb, vec3(0.95));

          gl_FragColor = color;
        }
      `
    });

    this.fullscreenMaterial = this.material;
  }

  render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: any,
    outputBuffer: any,
    _deltaTime?: number,
    _stencilTest?: boolean
  ): void {
    renderer.getSize(this.resolution);
    this.material.uniforms.resolution.value.copy(this.resolution);
    this.material.uniforms.tDiffuse.value = inputBuffer.texture;

    // Use the Pass base class's fullscreen quad rendering
    // Set render target before calling parent render
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    renderer.render(this.scene, this.camera);
  }

  setPixelSize(size: number): void {
    this.pixelSize = size;
    this.material.uniforms.pixelSize.value = size;
  }

  setOutlineStrength(strength: number): void {
    this.outlineStrength = strength;
    this.material.uniforms.outlineStrength.value = strength;
  }

  setOutlineThreshold(threshold: number): void {
    this.outlineThreshold = threshold;
    this.material.uniforms.outlineThreshold.value = threshold;
  }
}
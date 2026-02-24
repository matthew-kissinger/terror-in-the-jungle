/**
 * GPU Terrain Shader Code
 *
 * Vertex shader: heightmap-displaced terrain with computed normals.
 * Fragment shader: multi-texture blending based on elevation and slope,
 * with lighting and fog.
 */

export function getGPUTerrainVertexShader(): string {
  return `
    uniform sampler2D heightmap;
    uniform float heightmapSize;
    uniform float terrainScale;
    uniform vec2 heightmapCenter;

    varying vec2 vWorldUV;
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying float vFogDepth;
    varying float vSlope;

    void main() {
      vec3 worldPos = position + vec3(cameraPosition.x, 0.0, cameraPosition.z);
      vWorldPosition = worldPos;
      vWorldUV = worldPos.xz;

      vec2 heightmapUV = (worldPos.xz - heightmapCenter) / (heightmapSize * terrainScale) + 0.5;

      float height = 0.0;
      if (heightmapUV.x >= 0.0 && heightmapUV.x <= 1.0 &&
          heightmapUV.y >= 0.0 && heightmapUV.y <= 1.0) {
        height = texture2D(heightmap, heightmapUV).r;
      }

      worldPos.y = height;

      float texelSize = 1.0 / heightmapSize;
      float hL = texture2D(heightmap, heightmapUV + vec2(-texelSize, 0.0)).r;
      float hR = texture2D(heightmap, heightmapUV + vec2(texelSize, 0.0)).r;
      float hD = texture2D(heightmap, heightmapUV + vec2(0.0, -texelSize)).r;
      float hU = texture2D(heightmap, heightmapUV + vec2(0.0, texelSize)).r;

      vec3 normal = normalize(vec3(hL - hR, 2.0 * terrainScale, hD - hU));
      vNormal = normal;

      // Slope: 0.0 = flat, 1.0 = vertical
      vSlope = 1.0 - normal.y;

      vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
      vFogDepth = -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;
    }
  `;
}

/**
 * Fragment shader with two-texture blending: jungle floor at low elevations,
 * rocky highland at high elevations, with slope-based rocky bleed-in.
 */
export function getGPUTerrainFragmentShader(): string {
  return `
    uniform sampler2D groundTexture;
    uniform sampler2D highTexture;
    uniform float textureRepeat;
    uniform vec3 fogColor;
    uniform float fogNear;
    uniform float fogFar;

    // Elevation thresholds for texture blending
    uniform float blendLow;   // Below this: 100% groundTexture
    uniform float blendHigh;  // Above this: 100% highTexture

    varying vec2 vWorldUV;
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying float vFogDepth;
    varying float vSlope;

    void main() {
      vec2 texCoord = vWorldUV * textureRepeat;
      vec4 lowColor  = texture2D(groundTexture, texCoord);
      vec4 highColor = texture2D(highTexture,   texCoord);

      // Elevation blend
      float elevBlend = smoothstep(blendLow, blendHigh, vWorldPosition.y);

      // Steep slopes push toward rock texture regardless of elevation
      float slopeBlend = smoothstep(0.3, 0.6, vSlope);
      float blend = max(elevBlend, slopeBlend);

      vec4 texColor = mix(lowColor, highColor, blend);

      // Lighting
      vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
      float diffuse = max(dot(vNormal, lightDir), 0.0);
      float lighting = 0.55 + diffuse * 0.5;

      vec3 color = texColor.rgb * lighting;

      // Fog
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
      color = mix(color, fogColor, fogFactor);

      gl_FragColor = vec4(color, 1.0);
    }
  `;
}

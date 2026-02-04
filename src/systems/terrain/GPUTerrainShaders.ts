/**
 * GPU Terrain Shader Code
 * 
 * Contains the vertex and fragment shaders for GPU-accelerated terrain rendering.
 * These shaders use heightmap texture displacement for dynamic terrain generation.
 */

/**
 * Vertex shader for GPU terrain.
 * Samples heightmap texture to displace vertices vertically.
 * Calculates normals from heightmap gradients.
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

    void main() {
      // World position (mesh follows camera)
      vec3 worldPos = position + vec3(cameraPosition.x, 0.0, cameraPosition.z);
      vWorldPosition = worldPos;
      vWorldUV = worldPos.xz;

      // Calculate UV for heightmap sampling
      vec2 heightmapUV = (worldPos.xz - heightmapCenter) / (heightmapSize * terrainScale) + 0.5;

      // Sample height from heightmap
      float height = 0.0;
      if (heightmapUV.x >= 0.0 && heightmapUV.x <= 1.0 &&
          heightmapUV.y >= 0.0 && heightmapUV.y <= 1.0) {
        height = texture2D(heightmap, heightmapUV).r;
      }

      // Apply height displacement
      worldPos.y = height;

      // Calculate normal from heightmap (central difference)
      float texelSize = 1.0 / heightmapSize;
      float hL = texture2D(heightmap, heightmapUV + vec2(-texelSize, 0.0)).r;
      float hR = texture2D(heightmap, heightmapUV + vec2(texelSize, 0.0)).r;
      float hD = texture2D(heightmap, heightmapUV + vec2(0.0, -texelSize)).r;
      float hU = texture2D(heightmap, heightmapUV + vec2(0.0, texelSize)).r;

      vec3 normal = normalize(vec3(hL - hR, 2.0 * terrainScale, hD - hU));
      vNormal = normal;

      // Transform to clip space
      vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
      vFogDepth = -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;
    }
  `;
}

/**
 * Fragment shader for GPU terrain.
 * Applies ground texture, lighting, height-based coloring, and fog.
 */
export function getGPUTerrainFragmentShader(): string {
  return `
    uniform sampler2D groundTexture;
    uniform float textureRepeat;
    uniform vec3 fogColor;
    uniform float fogNear;
    uniform float fogFar;

    varying vec2 vWorldUV;
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying float vFogDepth;

    void main() {
      // Sample ground texture with world-space tiling
      vec2 texCoord = vWorldUV * textureRepeat;
      vec4 texColor = texture2D(groundTexture, texCoord);

      // Basic lighting
      vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
      float diffuse = max(dot(vNormal, lightDir), 0.0);
      float ambient = 0.4;
      float lighting = ambient + diffuse * 0.6;

      vec3 color = texColor.rgb * lighting;

      // Height-based coloring (grass -> rock at higher elevations)
      float heightFactor = smoothstep(20.0, 60.0, vWorldPosition.y);
      vec3 rockColor = vec3(0.4, 0.35, 0.3);
      color = mix(color, rockColor * lighting, heightFactor * 0.5);

      // Fog
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
      color = mix(color, fogColor, fogFactor);

      gl_FragColor = vec4(color, 1.0);
    }
  `;
}

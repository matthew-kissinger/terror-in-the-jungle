// Vertex shader for GPU-based billboard instancing with LOD and culling
export const BILLBOARD_VERTEX_SHADER = `
  precision highp float;

  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform vec3 cameraPosition;
  uniform float time;
  uniform vec2 lodDistances; // x = LOD1 distance, y = LOD2 distance
  uniform mat4 viewMatrix;
  uniform float maxDistance;
  uniform vec3 fogColor;
  uniform float fogDensity;        // Base fog density
  uniform float fogHeightFalloff;  // How quickly fog thins with altitude
  uniform float fogStartDistance;  // Distance before fog begins
  uniform bool fogEnabled;

  attribute vec3 position;
  attribute vec2 uv;

  // Instance attributes
  attribute vec3 instancePosition;
  attribute vec2 instanceScale;
  attribute float instanceRotation;

  varying vec2 vUv;
  varying float vDistance;
  varying float vLodFactor;
  varying float vWorldY;
  varying float vFogFactor;

  void main() {
    vUv = uv;

    // Calculate distance for LOD/fade
    vec3 worldPos = instancePosition;
    vDistance = length(cameraPosition - worldPos);

    // LOD factor for fragment shader (0-1, where 0 = full quality, 1 = lowest quality)
    if (vDistance < lodDistances.x) {
      vLodFactor = 0.0; // Full quality
    } else if (vDistance < lodDistances.y) {
      vLodFactor = 0.5; // Medium quality
    } else {
      vLodFactor = 1.0; // Low quality
    }

    // Calculate billboard orientation - cylindrical (Y-axis aligned)
    // Get direction from billboard to camera
    vec3 toCamera = cameraPosition - worldPos;
    vec3 toCameraXZ = vec3(toCamera.x, 0.0, toCamera.z);

    // Handle edge case when camera is directly above/below
    float xzLength = length(toCameraXZ);
    if (xzLength < 0.001) {
      toCameraXZ = vec3(0.0, 0.0, 1.0);
      xzLength = 1.0;
    }

    // Normalize the XZ direction
    vec3 forward = toCameraXZ / xzLength;

    // Calculate right vector (perpendicular to forward in XZ plane)
    // Right is 90 degrees CCW from forward in XZ plane
    vec3 right = vec3(forward.z, 0.0, -forward.x);
    vec3 up = vec3(0.0, 1.0, 0.0);

    // Scale the billboard quad
    vec3 scaledPos = vec3(position.x * instanceScale.x, position.y * instanceScale.y, 0.0);

    // Transform from billboard space to world space
    // Since PlaneGeometry is in XY facing +Z, we map:
    // X -> right, Y -> up, and implicitly the plane faces toward the camera
    vec3 rotatedPosition = right * scaledPos.x + up * scaledPos.y;

    // Add wind sway animation anchored at the base (uv.y = 0 at ground, 1 at top)
    float lodWindScale = 1.0 - vLodFactor * 0.7; // Reduce wind for distant objects
    float windStrength = 0.3 * lodWindScale;
    float windFreq = 1.5;
    float sway = sin(time * windFreq + worldPos.x * 0.1 + worldPos.z * 0.1) * windStrength;
    float swayWeight = uv.y * uv.y; // Quadratic: rooted at base, increasing toward canopy
    rotatedPosition.x += sway * swayWeight * 0.08;

    // Transform to world position
    vec3 finalPosition = worldPos + rotatedPosition;

    // Pass world Y for height fog
    vWorldY = finalPosition.y;
    if (fogEnabled) {
      float heightFactor = exp(-fogHeightFalloff * max(0.0, vWorldY));
      float effectiveDistance = max(0.0, vDistance - fogStartDistance);
      float distanceFactor = 1.0 - exp(-fogDensity * effectiveDistance);
      vFogFactor = clamp(heightFactor * distanceFactor, 0.0, 1.0);
    } else {
      vFogFactor = 0.0;
    }

    // Project to screen
    vec4 mvPosition = modelViewMatrix * vec4(finalPosition, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fragment shader with distance-based alpha fade, LOD, and height fog
export const BILLBOARD_FRAGMENT_SHADER = `
  precision highp float;

  uniform sampler2D map;
  uniform float fadeDistance;
  uniform float maxDistance;
  uniform vec3 colorTint;
  uniform float gammaAdjust;

  // Height fog uniforms
  uniform vec3 fogColor;
  uniform float fogDensity;        // Base fog density
  uniform float fogHeightFalloff;  // How quickly fog thins with altitude
  uniform float fogStartDistance;  // Distance before fog begins
  uniform bool fogEnabled;

  varying vec2 vUv;
  varying float vDistance;
  varying float vLodFactor;
  varying float vWorldY;
  varying float vFogFactor;

  void main() {
    vec4 texColor = texture2D(map, vUv);

    // Alpha test for transparency
    if (texColor.a < 0.5) discard;

    // Distance-based fade
    float fadeFactor = 1.0;
    if (vDistance > fadeDistance) {
      fadeFactor = 1.0 - smoothstep(fadeDistance, maxDistance, vDistance);
    }

    // Apply LOD-based alpha reduction for distant objects
    fadeFactor *= (1.0 - vLodFactor * 0.3);

    vec3 shaded = pow(texColor.rgb * colorTint, vec3(gammaAdjust));

    // Apply height-based fog (dense at ground, thin at altitude)
    if (fogEnabled) {
      shaded = mix(shaded, fogColor, vFogFactor);
    }

    gl_FragColor = vec4(shaded, texColor.a * fadeFactor);
  }
`;

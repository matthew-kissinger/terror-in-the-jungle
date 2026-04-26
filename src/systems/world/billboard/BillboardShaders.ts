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
  uniform bool imposterAtlasEnabled;
  uniform vec2 imposterTiles;
  uniform bool stableAtlasAzimuth;
  uniform float stableAtlasColumn;
  uniform float maxAtlasElevationRow;
  uniform float windStrength;
  uniform float windSpeed;
  uniform float windSpatialScale;

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
  varying vec2 vAtlasTile;
  varying vec2 vAtlasTileNext;
  varying float vAtlasBlend;

  float elevationRow(float elevation, float rows) {
    if (rows <= 1.5) return 0.0;

    float degrees = elevation * 57.295779513;
    if (rows < 3.0) {
      return degrees >= 35.0 ? 0.0 : 1.0;
    }

    if (degrees >= 72.5) return 0.0;
    if (degrees >= 45.0) return min(1.0, rows - 1.0);
    if (degrees >= 17.5) return min(2.0, rows - 1.0);
    return rows - 1.0;
  }

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
    vAtlasTile = vec2(0.0);
    vAtlasTileNext = vec2(0.0);
    vAtlasBlend = 0.0;

    if (imposterAtlasEnabled) {
      float elevation = asin(clamp(toCamera.y / max(length(toCamera), 0.0001), 0.0, 1.0));
      float tileY = elevationRow(elevation, imposterTiles.y);
      if (maxAtlasElevationRow >= 0.0) {
        tileY = min(tileY, maxAtlasElevationRow);
      }
      float tileX = 0.0;
      float nextTileX = 0.0;
      if (stableAtlasAzimuth) {
        tileX = clamp(floor(stableAtlasColumn + 0.5), 0.0, imposterTiles.x - 1.0);
        nextTileX = tileX;
        vAtlasBlend = 0.0;
      } else {
        float azimuth = atan(toCamera.z, toCamera.x);
        if (azimuth < 0.0) azimuth += 6.283185307;
        float azimuthTile = (azimuth / 6.283185307) * imposterTiles.x;
        tileX = mod(floor(azimuthTile), imposterTiles.x);
        nextTileX = mod(tileX + 1.0, imposterTiles.x);
        vAtlasBlend = smoothstep(0.0, 1.0, fract(azimuthTile));
      }
      vAtlasTile = vec2(tileX, tileY);
      vAtlasTileNext = vec2(nextTileX, tileY);
    }

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

    // Add wind sway animation anchored at the base (uv.y = 0 at ground, 1 at top).
    // This stays entirely GPU-side: no per-instance CPU updates or matrices.
    float lodWindScale = 1.0 - vLodFactor * 0.7; // Reduce wind for distant objects
    float windPhase = worldPos.x * windSpatialScale + worldPos.z * (windSpatialScale * 1.37);
    float primarySway = sin(time * windSpeed + windPhase);
    float gustSway = sin(time * (windSpeed * 0.43) + windPhase * 1.91 + instanceRotation);
    float sway = (primarySway + gustSway * 0.35) * windStrength * lodWindScale;
    float swayWeight = uv.y * uv.y; // Quadratic: rooted at base, increasing toward canopy
    rotatedPosition += right * sway * swayWeight;

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
  uniform float nearFadeDistance;
  uniform float maxDistance;
  uniform vec3 colorTint;
  uniform float gammaAdjust;
  uniform float nearAlphaSolidDistance;
  uniform float vegetationExposure;
  uniform float nearLightBoostDistance;
  uniform float minVegetationLight;
  uniform sampler2D normalMap;
  uniform bool normalMapEnabled;
  uniform bool imposterAtlasEnabled;
  uniform vec2 imposterTiles;
  uniform vec4 imposterUvBounds;

  // Height fog uniforms
  uniform vec3 fogColor;
  uniform float fogDensity;        // Base fog density
  uniform float fogHeightFalloff;  // How quickly fog thins with altitude
  uniform float fogStartDistance;  // Distance before fog begins
  uniform bool fogEnabled;

  // Atmosphere lighting uniforms (cycle-2026-04-21 parity pass).
  // Terrain uses MeshStandardMaterial and picks up AtmosphereSystem's
  // per-frame hemisphere/sun colors automatically; billboards have no
  // lighting pipeline, so we feed the same colors in as uniforms and
  // apply a cheap hemispheric tint here.
  uniform vec3 sunColor;      // directional light color (matches renderer.moonLight.color)
  uniform vec3 skyColor;      // zenith/hemisphere sky color
  uniform vec3 groundColor;   // darkened horizon — matches hemisphereLight.groundColor
  uniform bool lightingEnabled;

  varying vec2 vUv;
  varying float vDistance;
  varying float vLodFactor;
  varying float vWorldY;
  varying float vFogFactor;
  varying vec2 vAtlasTile;
  varying vec2 vAtlasTileNext;
  varying float vAtlasBlend;

  vec2 resolveSampleUv(vec2 uv, vec2 tile) {
    vec2 croppedUv = mix(imposterUvBounds.xy, imposterUvBounds.zw, uv);
    if (!imposterAtlasEnabled) return croppedUv;

    vec2 invTiles = vec2(1.0) / imposterTiles;
    return vec2(
      (tile.x + croppedUv.x) * invTiles.x,
      (1.0 - invTiles.y) - tile.y * invTiles.y + croppedUv.y * invTiles.y
    );
  }

  void main() {
    vec2 sampleUv = resolveSampleUv(vUv, vAtlasTile);
    vec2 sampleUvNext = resolveSampleUv(vUv, vAtlasTileNext);
    vec4 texColor = texture2D(map, sampleUv);
    if (imposterAtlasEnabled && imposterTiles.x > 1.5) {
      vec4 nextTexColor = texture2D(map, sampleUvNext);
      texColor = mix(texColor, nextTexColor, vAtlasBlend);
    }

    // Alpha test - discard the weakest fringe pixels. The sky-driven fog color
    // (cycle-2026-04-20 atmosphere) is near-white at the horizon, so any
    // partial-alpha pixel that survives the test and gets fog-mixed would
    // emit premultiplied bright-white RGB and read as a halo against the
    // surviving opaque silhouette. 0.25 drops those without thinning the
    // silhouette noticeably at gameplay camera distances.
    if (texColor.a < 0.25) discard;

    // Distance-based fade. nearFadeDistance remains disabled for Pixel Forge
    // vegetation because there is no close mesh replacement yet.
    float fadeFactor = 1.0;
    if (nearFadeDistance > 0.001) {
      fadeFactor *= smoothstep(nearFadeDistance * 0.55, nearFadeDistance, vDistance);
    }
    if (vDistance > fadeDistance) {
      fadeFactor *= 1.0 - smoothstep(fadeDistance, maxDistance, vDistance);
    }

    // Apply LOD-based alpha reduction for distant objects
    fadeFactor *= (1.0 - vLodFactor * 0.3);

    // Close alpha hardening makes near impostors read as solid cutout foliage
    // instead of translucent planes. The 0.25 alpha test above still removes
    // weak fringes, while this only strengthens surviving core pixels.
    float nearAlphaBlend = 1.0 - smoothstep(nearAlphaSolidDistance, nearAlphaSolidDistance + 25.0, vDistance);
    float hardenedAlpha = mix(texColor.a, 1.0, smoothstep(0.25, 0.65, texColor.a));
    float vegetationAlpha = mix(texColor.a, hardenedAlpha, nearAlphaBlend);

    vec3 shaded = pow(texColor.rgb * colorTint, vec3(gammaAdjust));

    // Hemispheric lighting parity with terrain. Vegetation billboards have
    // no real normals, but uv.y is 0 at the base and 1 at the canopy
    // (see vertex shader's sway weighting), which gives us a free vertical
    // gradient. We mix ground->sky along that axis for the ambient term,
    // then add a flat sun contribution so the scene's directional color
    // (dawn orange, midday white, dusk gold) reads on the foliage too.
    // Terrain gets this via MeshStandardMaterial + Three's built-in
    // hemisphere + directional passes; this is the lightweight analogue.
    if (lightingEnabled) {
      vec3 ambient = mix(groundColor, skyColor, 0.5 + 0.5 * vUv.y);
      vec3 light = ambient + sunColor * 0.35;

      if (normalMapEnabled) {
        vec3 normalSample = texture2D(normalMap, sampleUv).xyz;
        if (imposterAtlasEnabled && imposterTiles.x > 1.5) {
          normalSample = mix(normalSample, texture2D(normalMap, sampleUvNext).xyz, vAtlasBlend);
        }
        vec3 imposterNormal = normalize(normalSample * 2.0 - 1.0);
        vec3 captureSun = normalize(vec3(0.35, 0.65, 0.68));
        float ndotl = max(dot(imposterNormal, captureSun), 0.0);
        ambient = mix(groundColor, skyColor, 0.62 + 0.38 * clamp(imposterNormal.y, -1.0, 1.0));
        light = ambient + sunColor * (0.28 + 0.50 * ndotl);
      }

      light = max(light, vec3(minVegetationLight));
      shaded *= light;
    }
    float nearLightBoost = 1.0 + 0.14 * (1.0 - smoothstep(0.0, nearLightBoostDistance, vDistance));
    shaded *= vegetationExposure * nearLightBoost;

    // Apply height-based fog (dense at ground, thin at altitude). Scale the
    // fog mix by texture alpha so soft edge pixels keep more of their bled
    // RGB instead of being lerped toward the bright sky/fog tint — that
    // lerp was the source of the white/blue outlines reported after the
    // atmosphere cycle made fogColor sky-driven.
    if (fogEnabled) {
      shaded = mix(shaded, fogColor, vFogFactor * texColor.a);
    }

    // Premultiplied alpha output - prevents dark halos from bilinear filtering
    float finalAlpha = vegetationAlpha * fadeFactor;
    gl_FragColor = vec4(shaded * finalAlpha, finalAlpha);
  }
`;

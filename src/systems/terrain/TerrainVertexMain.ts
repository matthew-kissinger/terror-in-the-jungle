// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export const TERRAIN_VERTEX_MAIN = /* glsl */ `
// CDLOD morph: snap fine-grid vertices toward parent LOD grid for smooth transitions.
// tileGridResolution is the QUAD count (e.g. 32 for the default 33-vertex
// tile), set via tileResolution - 1 at TerrainSystem.ts:114 -> wired into
// TerrainSurfaceRuntime.ts:67 as the uniform value. Vertex spacing in
// tile-local gridPos units (gridPos = position.xz + 0.5, range [0,1]) is
// 1/tileGridResolution; the parent LOD grid hits every other vertex, so
// parent spacing is 2/tileGridResolution. Don't change this without also
// updating the JS port in TerrainMaterial.morph.test.ts.
float parentStep = 2.0 / tileGridResolution;
vec2 gridPos = position.xz + 0.5;

// Force full morph on edges abutting a coarser-LOD neighbour. The
// neighbour's vertex grid spacing is 2x ours; without the force-morph
// our edge vertices drift between the neighbour's verts at any partial
// morphFactor and reopen the T-junction crack. Bits: 1=+Z(N), 2=+X(E),
// 4=-Z(S), 8=-X(W). Perimeter verts hit gridPos==0 or gridPos==1 exactly
// (PlaneGeometry-derived; see createTileGeometry).
float effectiveMorph = morphFactor;
const float EDGE_EPS = 1.0e-4;
int mask = int(edgeMorphMask + 0.5);
if (gridPos.y >= 1.0 - EDGE_EPS && (mask & 1) != 0) effectiveMorph = 1.0;
if (gridPos.x >= 1.0 - EDGE_EPS && (mask & 2) != 0) effectiveMorph = 1.0;
if (gridPos.y <= EDGE_EPS         && (mask & 4) != 0) effectiveMorph = 1.0;
if (gridPos.x <= EDGE_EPS         && (mask & 8) != 0) effectiveMorph = 1.0;

vec2 snapped = floor(gridPos / parentStep + 0.5) * parentStep;
vec3 morphedPos = vec3(
  mix(gridPos.x, snapped.x, effectiveMorph) - 0.5,
  position.y,
  mix(gridPos.y, snapped.y, effectiveMorph) - 0.5
);

vec4 worldPos4 = instanceMatrix * vec4(morphedPos, 1.0);
float halfWorld = terrainWorldSize * 0.5;
// Half-texel correction: GPU texture2D maps UV via pixelCoord = UV * gridSize - 0.5,
// but the CPU BakedHeightProvider maps via gx = normalizedPos * (gridSize - 1).
// Without correction these diverge by up to 0.5 texels at world edges (~3m for 3200m maps).
// Remap UV so texel centers align with the bake-loop sample positions.
float texelHalf = 0.5 / heightmapGridSize;
float uvScale = (heightmapGridSize - 1.0) / heightmapGridSize;
vec2 normalizedPos = vec2(
  (worldPos4.x + halfWorld) / terrainWorldSize,
  (worldPos4.z + halfWorld) / terrainWorldSize
);
vWorldUV = clamp(normalizedPos * uvScale + texelHalf, 0.0, 1.0);

float terrainH = texture2D(terrainHeightmap, vWorldUV).r;
worldPos4.y = terrainH;

// CDLOD skirt: perimeter-ring duplicate vertices drop below the heightmap
// to hide sub-pixel cracks at chunk borders. Coarser tiles (higher
// lodLevel) get larger drops because their seam-cracks scale with tile
// size. Skirts only ever drop, never rise - guarantees no poke-through
// into adjacent tiles. See terrain-cdlod-seam Stage D2.
float skirtDrop = max(2.0, 4.0 * (lodLevel + 1.0));
worldPos4.y -= step(0.5, isSkirt) * skirtDrop;

vWorldPosition = worldPos4.xyz;
vLodLevel = lodLevel;
vMorphFactor = morphFactor;

vec3 nSample = texture2D(terrainNormalMap, vWorldUV).rgb * 2.0 - 1.0;
vTerrainNormal = normalize(nSample);

// Set transformed to local-space position so any Three.js includes that apply
// instanceMatrix get the correct single application.  worldpos_vertex is
// replaced below to use worldPos4 directly (which already includes instanceMatrix
// and heightmap displacement).
transformed = morphedPos;
`;

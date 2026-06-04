// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

attribute vec3 position;
attribute vec2 uv;
attribute mat4 instanceMatrix;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;

varying vec2 vUv;

void main() {
  vUv = uv;
  
  // Extract instance position from instance matrix
  vec3 instancePos = vec3(instanceMatrix[3]);
  
  // Calculate billboard rotation to face camera
  vec3 toCamera = cameraPosition - instancePos;
  toCamera.y = 0.0; // Cylindrical billboard (only rotate on Y axis)
  toCamera = normalize(toCamera);
  
  // Build rotation matrix
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(up, toCamera));
  mat3 billboardMatrix = mat3(right, up, toCamera);
  
  // Apply billboard rotation to vertex position
  vec3 billboardPos = billboardMatrix * position;
  
  // Apply instance transformation (position and scale)
  vec4 worldPos = instanceMatrix * vec4(billboardPos, 1.0);
  
  gl_Position = projectionMatrix * modelViewMatrix * worldPos;
}
/*
 * Palette, Bayer dithering and Sobel edge shader adapted from Video-to-Pixel-Art.
 * Copyright (c) 2024 Alan Ang (collidingScopes), MIT license.
 * https://github.com/collidingScopes/video-to-pixel-art
 * Upstream revision: 773cbdea04cae8a3e87d2f273b1c2e5a41851085
 * Full notice: public/licenses/video-to-pixel-art-MIT.txt
 */

// Reference screenshot settings, with the owner's requested black edges.
export const PIXEL_SETTINGS = {
  width: 1200,
  height: 672,
  pixelSize: 1,
  ditherStrength: 0.52,
  edgeThreshold: 0.48,
  edgeIntensity: 0.25,
  edgeColor: [0, 0, 0],
} as const;

const acid = [
  [0.031, 0.027, 0.035],
  [0.157, 0.118, 0.196],
  [0.235, 0.392, 0.902],
  [0.431, 0.314, 0.784],
  [0.902, 0.431, 0.784],
  [0.98, 0.549, 0.902],
  [0.196, 0.784, 0.314],
  [0.98, 0.784, 0.196],
  [0.902, 0.902, 0.98],
  [1, 1, 1],
];

export const vertexShader = `
attribute vec2 position;
attribute vec2 texCoord;
varying vec2 uv;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
  uv = texCoord;
}`;

export const fragmentShader = `
precision mediump float;
varying vec2 uv;
uniform sampler2D baseTexture;
uniform sampler2D motionTexture;
uniform sampler2D previousMotionTexture;
uniform float sourceBlend;
uniform float motionMix;
uniform bool interiorMask;
uniform vec2 resolution;
uniform float pixelSize;
uniform float ditherFactor;
uniform float edgeThreshold;
uniform float edgeIntensity;
uniform vec3 edgeColor;
uniform vec3 candles[3]; // Scene-relative wick position and current flame opacity.

float extinguishedRegion(vec2 coord, vec3 light) {
  if (light.z >= 1.0) return 0.0;
  float radius = length((coord - light.xy - vec2(0.0, 0.012)) / vec2(0.090, 0.170));
  return (1.0 - light.z) * (1.0 - smoothstep(0.80, 1.0, radius));
}

float litCandle(vec2 coord, vec3 light) {
  if (light.z <= 0.0) return 0.0;
  vec2 delta = abs((coord - light.xy - vec2(0.0, 0.012)) / vec2(0.024, 0.075));
  return light.z * (1.0 - smoothstep(0.85, 1.0, max(delta.x, delta.y)));
}

vec3 scene(vec2 coord) {
  vec3 base = texture2D(baseTexture, coord).rgb;
  vec3 motion = texture2D(motionTexture, coord).rgb;
  if (sourceBlend < 1.0) {
    motion = mix(texture2D(previousMotionTexture, coord).rgb, motion, sourceBlend);
  }
  float amount = motionMix;
  if (interiorMask && min(candles[0].z, min(candles[1].z, candles[2].z)) < 1.0
      && coord.y > 0.46 && coord.y < 0.89 && (coord.x < 0.27 || coord.x > 0.70)) {
    // Preserve the original footage, including its flames, wax and warm halos.
    // Only spent candles reveal the unlit plate, before the shared pixel effect.
    float spent = max(extinguishedRegion(coord, candles[0]),
      max(extinguishedRegion(coord, candles[1]), extinguishedRegion(coord, candles[2])));
    float lit = max(litCandle(coord, candles[0]),
      max(litCandle(coord, candles[1]), litCandle(coord, candles[2])));
    amount *= 1.0 - spent * (1.0 - lit);
  }
  return mix(base, motion, amount);
}

float edge(vec2 coord) {
  mat3 sobelX = mat3(-1.0, 0.0, 1.0, -2.0, 0.0, 2.0, -1.0, 0.0, 1.0);
  mat3 sobelY = mat3(-1.0, -2.0, -1.0, 0.0, 0.0, 0.0, 1.0, 2.0, 1.0);
  float gx = 0.0;
  float gy = 0.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      vec2 offset = vec2(float(i), float(j)) / resolution;
      float luminance = dot(scene(coord + offset), vec3(0.299, 0.587, 0.114));
      gx += luminance * sobelX[i+1][j+1];
      gy += luminance * sobelY[i+1][j+1];
    }
  }
  return sqrt(gx * gx + gy * gy);
}

vec3 closestColor(vec3 color) {
  float minDist = 1000.0;
  vec3 closest = vec3(0.0);
  float dist;
  ${acid
    .map(
      (c) => `dist = distance(color, vec3(${c.map((n) => n.toFixed(3)).join(', ')}));
  if (dist < minDist) { minDist = dist; closest = vec3(${c.map((n) => n.toFixed(3)).join(', ')}); }`,
    )
    .join('\n  ')}
  return closest;
}

float bayer(vec2 coord) {
  float x = mod(coord.x, 4.0);
  float y = mod(coord.y, 4.0);
  if (x < 1.0) {
    if (y < 1.0) return 0.0/16.0;
    else if (y < 2.0) return 12.0/16.0;
    else if (y < 3.0) return 3.0/16.0;
    else return 15.0/16.0;
  } else if (x < 2.0) {
    if (y < 1.0) return 8.0/16.0;
    else if (y < 2.0) return 4.0/16.0;
    else if (y < 3.0) return 11.0/16.0;
    else return 7.0/16.0;
  } else if (x < 3.0) {
    if (y < 1.0) return 2.0/16.0;
    else if (y < 2.0) return 14.0/16.0;
    else if (y < 3.0) return 1.0/16.0;
    else return 13.0/16.0;
  } else {
    if (y < 1.0) return 10.0/16.0;
    else if (y < 2.0) return 6.0/16.0;
    else if (y < 3.0) return 9.0/16.0;
    else return 5.0/16.0;
  }
}

void main() {
  vec2 coord = floor(uv * resolution / pixelSize) * pixelSize / resolution;
  vec3 adjusted = clamp(scene(coord) + (bayer(gl_FragCoord.xy) - 0.5) * ditherFactor, 0.0, 1.0);
  vec3 color = closestColor(adjusted);
  if (edge(coord) > edgeThreshold) color = mix(color, edgeColor, edgeIntensity);
  gl_FragColor = vec4(color, 1.0);
}`;

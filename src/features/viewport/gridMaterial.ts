import * as THREE from 'three'
import type { GridLevels } from './gridLevels'

export interface GridMaterialOptions {
  color?: number | string | THREE.Color
  useLocal?: boolean
  fade?: number
  alpha?: number
  majorAlpha?: number
  minorAlpha?: number
}

const vertexShader = `
varying vec2 vCoord;
varying vec3 vWorldPos;
uniform bool uUseLocal;

void main() {
  vec4 wPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = wPos.xyz;
  vCoord = uUseLocal ? position.xy : wPos.xy;
  gl_Position = projectionMatrix * viewMatrix * wPos;
}
`

const fragmentShader = `
varying vec2 vCoord;
varying vec3 vWorldPos;

uniform vec3 uCenter;
uniform float uMinor;
uniform float uMajor;
uniform float uSubFade;
uniform float uAlpha;
uniform float uFade;
uniform vec3 uColor;
uniform float uMajorAlpha;
uniform float uMinorAlpha;

float getLine(vec2 coord, float spacing, float width) {
  vec2 c = coord / spacing;
  vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
  return 1.0 - min(min(g.x, g.y) / width, 1.0);
}

void main() {
  float dist = distance(vWorldPos.xy, uCenter.xy);
  float radialFade = uFade > 0.0 ? (1.0 - smoothstep(uFade * 0.25, uFade, dist)) : 1.0;

  float majorLine = getLine(vCoord, uMajor, 1.5) * uMajorAlpha;
  float minorLine = getLine(vCoord, uMinor, 1.0) * uMinorAlpha * uSubFade;

  float combined = max(majorLine, minorLine);
  float finalAlpha = combined * radialFade * uAlpha;

  if (finalAlpha < 0.01) discard;
  gl_FragColor = vec4(uColor, finalAlpha);
}
`

export function createGridMaterial(options: GridMaterialOptions = {}): THREE.ShaderMaterial {
  const color =
    options.color instanceof THREE.Color
      ? options.color
      : new THREE.Color(options.color ?? 0x2b73bf)

  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uCenter: { value: new THREE.Vector3(0, 0, 0) },
      uMinor: { value: 10 },
      uMajor: { value: 50 },
      uSubFade: { value: 1 },
      uAlpha: { value: options.alpha ?? 1 },
      uFade: { value: options.fade ?? 600 },
      uColor: { value: color },
      uMajorAlpha: { value: options.majorAlpha ?? 0.45 },
      uMinorAlpha: { value: options.minorAlpha ?? 0.15 },
      uUseLocal: { value: options.useLocal ?? false },
    },
    vertexShader,
    fragmentShader,
  })
}

export function updateGridMaterialUniforms(
  material: THREE.ShaderMaterial,
  levels: GridLevels,
  extra: { center?: THREE.Vector3; alpha?: number; fade?: number } = {},
): void {
  const u = material.uniforms
  if (!u) return
  if (u.uMinor) u.uMinor.value = levels.minor
  if (u.uMajor) u.uMajor.value = levels.major
  if (u.uSubFade) u.uSubFade.value = levels.fade
  if (extra.alpha !== undefined && u.uAlpha) u.uAlpha.value = extra.alpha
  if (extra.fade !== undefined && u.uFade) u.uFade.value = extra.fade
  if (extra.center && u.uCenter) u.uCenter.value.copy(extra.center)
}

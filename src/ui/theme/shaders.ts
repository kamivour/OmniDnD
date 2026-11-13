/**
 * GPU backgrounds for themes (computers, full effects only). Each theme with a shader gets a
 * full-screen fragment shader; themes without one keep their CSS ambient layer.
 *
 * Every shader receives, in canvas pixels with the origin at the bottom left:
 * u_res (size), u_time (seconds), u_mouse (eased pointer, far off-screen when absent),
 * u_ripples[6] (x, y, start time of recent taps) and u_scroll (page scroll).
 * Helpers work in "height units": p = gl_FragCoord.xy / u_res.y.
 */

import type { ThemeId } from '../../theme/themes';

export interface ShaderSpec {
  fragment: string;
  /** Taps anywhere send a ripple into the background. */
  ripples?: boolean;
}

export const SHADER_PRELUDE = /* glsl */ `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;
uniform vec3 u_ripples[6];
uniform float u_scroll;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
/* Distance between the two nearest moving cell points: small near cell borders. */
float cellEdge(vec2 p, float t) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = 0.5 + 0.45 * sin(t + 6.2831 * hash2(i + g));
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return sqrt(f2) - sqrt(f1);
}
`;

/* Tidewater: looking down through clear water at light on the sea floor. */
const TIDEWATER = /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = gl_FragCoord.xy / u_res.y;
  float t = u_time;

  // Taps send rings outward that bend the light beneath them.
  float ring = 0.0;
  vec2 bend = vec2(0.0);
  for (int i = 0; i < 6; i++) {
    vec3 r = u_ripples[i];
    float age = t - r.z;
    if (age < 0.0 || age > 3.0) continue;
    vec2 d = p - r.xy / u_res.y;
    float dist = length(d);
    float x = dist - age * 0.38;
    float env = exp(-x * x * 60.0) * exp(-age * 1.1);
    float wave = sin(x * 60.0) * env;
    bend += d / (dist + 1e-4) * wave * 0.03;
    ring += env * (0.35 + max(wave, 0.0));
  }

  vec2 q = p + bend;
  q.y -= u_scroll / u_res.y * 0.12;
  vec2 warp = vec2(fbm(q * 0.9 + t * 0.04), fbm(q * 0.9 - t * 0.035 + 5.0)) - 0.5;

  // Two light nets drifting past each other. Where their lines cross, light gathers into bright
  // knots; each net also splits a little into colour at its edges.
  vec2 a = q * 2.7 + warp * 2.2;
  vec2 b = q * 2.3 + warp.yx * 2.6 + vec2(4.3, 1.7);
  float t1 = t * 0.45;
  float t2 = t * 0.38 + 2.0;
  vec3 e1 = vec3(cellEdge(a + vec2(0.035, 0.0), t1), cellEdge(a, t1), cellEdge(a - vec2(0.035, 0.0), t1));
  float e2 = cellEdge(b, t2);
  vec3 caustic = exp(-e1 * 11.0) * 0.45 + exp(-e2 * 11.0) * 0.4 + exp(-(e1 + e2) * 7.0) * 1.1;
  caustic *= 0.6 + 0.8 * fbm(q * 1.7 - t * 0.06);

  float depth = 1.0 - uv.y;
  vec3 col = mix(vec3(0.035, 0.235, 0.29), vec3(0.008, 0.06, 0.085), smoothstep(0.0, 1.0, depth));
  col += caustic * vec3(0.4, 0.88, 1.0) * mix(0.34, 0.09, depth);

  // Slanted sun shafts from the surface.
  float rx = p.x + p.y * 0.45;
  float shafts = noise(vec2(rx * 6.0, t * 0.12)) * noise(vec2(rx * 2.7 + 4.0, t * 0.08 + 2.0));
  col += vec3(0.25, 0.7, 0.8) * shafts * shafts * smoothstep(0.1, 1.0, uv.y) * 0.32;

  // The pointer carries a soft lamp that also brightens the light net.
  vec2 m = u_mouse / u_res.y;
  float md = dot(p - m, p - m);
  col += vec3(0.16, 0.5, 0.6) * exp(-md * 12.0) * 0.28;
  col += caustic * vec3(0.45, 0.92, 1.0) * exp(-md * 9.0) * 0.3;

  col += vec3(0.55, 0.95, 1.0) * ring * 0.4;

  // Drifting specks rising slowly.
  vec2 gp = (p - vec2(0.0, t * 0.018)) * 16.0;
  vec2 gi = floor(gp);
  vec2 h = hash2(gi);
  vec2 dp = fract(gp) - (0.2 + 0.6 * h) - 0.06 * vec2(sin(t * 0.7 + h.x * 6.0), cos(t * 0.5 + h.y * 6.0));
  float mote = smoothstep(0.07, 0.0, length(dp)) * step(0.78, hash(gi + 7.0));
  col += vec3(0.6, 0.95, 1.0) * mote * (0.12 + 0.12 * sin(t * 1.7 + h.x * 20.0));

  col *= 1.0 - 0.4 * pow(length(uv - 0.5) * 1.25, 2.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

/* Prism: coloured light moving behind a sheet of ribbed glass that splits it into rainbows. */
const PRISM = /* glsl */ `
vec3 lights(vec2 p, float t) {
  vec3 sum = vec3(0.0);
  float w = 0.0;
  float k;
  vec2 o;
  o = vec2(0.25 + 0.2 * sin(t * 0.13), 0.75 + 0.15 * cos(t * 0.11));
  k = exp(-dot(p - o, p - o) * 5.0); sum += vec3(0.93, 0.28, 0.6) * k; w += k;
  o = vec2(1.35 + 0.25 * cos(t * 0.09), 0.7 + 0.2 * sin(t * 0.12 + 1.0));
  k = exp(-dot(p - o, p - o) * 4.0); sum += vec3(0.39, 0.4, 0.95) * k; w += k;
  o = vec2(0.8 + 0.35 * sin(t * 0.07 + 2.0), 0.1 + 0.15 * sin(t * 0.1));
  k = exp(-dot(p - o, p - o) * 4.5); sum += vec3(0.13, 0.83, 0.93) * k; w += k;
  o = vec2(1.0 + 0.3 * cos(t * 0.1 + 3.0), 0.45 + 0.25 * sin(t * 0.08 + 4.0));
  k = exp(-dot(p - o, p - o) * 7.0); sum += vec3(1.0, 0.7, 0.3) * k * 0.7; w += k;
  o = vec2(0.1 + 0.15 * cos(t * 0.12 + 5.0), 0.2 + 0.2 * cos(t * 0.09));
  k = exp(-dot(p - o, p - o) * 6.0); sum += vec3(0.6, 0.35, 1.0) * k; w += k;
  return sum / (0.35 + w) * min(w, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = gl_FragCoord.xy / u_res.y;
  float t = u_time;
  p.y -= u_scroll / u_res.y * 0.08;

  // Wide diagonal glass ribs, sliding slowly. Each rib bends what is behind it, red, green and
  // blue by different amounts, so rainbows appear along the rib edges.
  float s = (p.x * 0.85 + p.y * 0.5) * 2.4 + t * 0.03 + 0.25 * fbm(p * 1.3 + t * 0.05);
  float rib = fract(s);
  float slope = rib - 0.5;
  vec2 dir = normalize(vec2(0.85, 0.5));
  vec2 bend = dir * slope * 0.22;
  vec3 col;
  col.r = lights(p + bend * 1.7, t).r;
  col.g = lights(p + bend, t).g;
  col.b = lights(p + bend * 0.3, t).b;
  col *= 0.7;

  // A faint rainbow sits along every rib edge, as light splits in cut glass.
  vec3 spectrum = 0.5 + 0.5 * cos(6.2831 * (rib * 1.6 + vec3(0.0, 0.33, 0.67)));
  col += spectrum * smoothstep(0.6, 1.0, rib) * smoothstep(1.0, 0.92, rib) * 0.07;

  // Thin shine where each rib starts, stronger near the pointer.
  vec2 m = u_mouse / u_res.y;
  float md = dot(p - m, p - m);
  float edge = smoothstep(0.035, 0.0, rib) + smoothstep(0.965, 1.0, rib) * 0.6;
  col += vec3(0.9, 0.92, 1.0) * edge * (0.035 + 0.22 * exp(-md * 6.0));

  // The pointer is a small lamp behind the glass: a soft glow with a rainbow fringe.
  float lamp = exp(-md * 18.0);
  vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (s * 0.5 + vec3(0.0, 0.33, 0.67)));
  col += (vec3(0.5, 0.48, 0.7) + rainbow * 0.35) * lamp * 0.22;

  col = mix(vec3(0.051, 0.055, 0.11), col + vec3(0.04, 0.04, 0.08), 0.92);
  col *= 1.0 - 0.35 * pow(length(uv - 0.5) * 1.2, 2.0);
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0 * 2.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const SHADERS: Partial<Record<ThemeId, ShaderSpec>> = {
  tidewater: { fragment: TIDEWATER, ripples: true },
  prism: { fragment: PRISM },
};

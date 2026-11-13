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

/* Elemental Plane of Fire: flames rising from below, drifting embers, sparks from every click. */
const FIRE = /* glsl */ `
float ember(vec2 p, float t, float scale, float speed, float seed) {
  vec2 g = p * scale;
  g.y -= t * speed;
  g.x += sin(g.y * 0.35 + seed) * 0.6;
  vec2 id = floor(g);
  vec2 h = hash2(id + seed);
  vec2 c = fract(g) - 0.5 - (h - 0.5) * 0.6;
  float d = length(c);
  float flicker = 0.55 + 0.45 * sin(t * (4.0 + h.y * 6.0) + h.x * 40.0);
  float on = step(hash(id + seed + 3.1), 0.28);
  return (smoothstep(0.07, 0.0, d) + smoothstep(0.35, 0.0, d) * 0.18) * flicker * on;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = gl_FragCoord.xy / u_res.y;
  float t = u_time;
  vec2 m = u_mouse / u_res.y;
  float md = length(p - m);

  // Heat haze makes everything shimmer a little.
  vec2 q = p;
  q.x += (noise(vec2(p.y * 9.0 - t * 3.0, p.x * 3.0)) - 0.5) * 0.02;
  q.y -= u_scroll / u_res.y * 0.1;

  // Flames: rising, stretching noise, tallest at the bottom of the window. They reach up toward
  // the pointer.
  vec2 fp = vec2(q.x * 2.4, q.y * 1.3 - t * 0.6);
  float w = fbm(fp * 0.8 + vec2(0.0, -t * 0.15));
  float n = fbm(fp * 1.7 + vec2(w * 1.8, -t * 0.9));
  float reach = exp(-md * md * 9.0) * 0.4;
  float f = clamp(n * 1.35 - uv.y * 1.25 + 0.05 + reach * (1.0 - uv.y * 0.5), 0.0, 1.0);
  vec3 flame = pow(vec3(f), vec3(1.0, 2.3, 5.0)) * vec3(1.6, 0.95, 0.6);

  vec3 col = vec3(0.075, 0.04, 0.03);
  col += vec3(0.3, 0.07, 0.02) * pow(1.0 - uv.y, 2.5);
  col += flame * 0.68;

  // Embers drifting up in two layers, nearer ones bigger and faster.
  float e = ember(q, t, 9.0, 0.9, 1.0) + ember(q, t, 16.0, 1.4, 7.0) * 0.7;
  e *= 0.35 + 0.65 * smoothstep(1.1, 0.1, uv.y);
  col += vec3(1.0, 0.5, 0.14) * e * 0.9;

  // The pointer warms the air around it.
  col += vec3(0.5, 0.16, 0.03) * exp(-md * md * 14.0) * 0.35;

  // Clicks throw a shower of sparks that arc and fall.
  for (int i = 0; i < 6; i++) {
    vec3 r = u_ripples[i];
    float age = t - r.z;
    if (age < 0.0 || age > 1.6) continue;
    vec2 o = r.xy / u_res.y;
    float fade = 1.0 - age / 1.6;
    col += vec3(1.0, 0.6, 0.2) * exp(-length(p - o) * 18.0) * exp(-age * 6.0) * 0.8;
    for (int k = 0; k < 14; k++) {
      vec2 h = hash2(vec2(float(k), r.z));
      float a = h.x * 6.2831;
      float sp = 0.22 + 0.35 * h.y;
      vec2 pos = o + vec2(cos(a), sin(a) * 0.7 + 0.5) * sp * age - vec2(0.0, 0.45 * age * age);
      float d = length(p - pos);
      col += vec3(1.0, 0.7, 0.3) * (smoothstep(0.009, 0.0, d) + exp(-d * d * 3000.0) * 0.35) * fade;
    }
  }

  col *= 1.0 - 0.35 * pow(length(uv - 0.5) * 1.2, 2.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

/* Nine Hells: a cracked plain of molten rock under red smoke and falling ash. */
const NINE_HELLS = /* glsl */ `
float ash(vec2 p, float t, float scale, float speed, float seed, out float burning) {
  vec2 g = p * scale;
  g.y += t * speed;
  g.x += t * 0.08 * scale * 0.1 + sin(g.y * 0.4 + seed) * 0.5;
  vec2 id = floor(g);
  vec2 h = hash2(id + seed);
  vec2 c = fract(g) - 0.5 - (h - 0.5) * 0.5;
  float a = t * (1.0 + h.x * 2.0) + h.y * 6.2831;
  c = mat2(cos(a), -sin(a), sin(a), cos(a)) * c;
  c.y *= 2.0 + 1.5 * sin(t * (1.5 + h.y) + h.x * 9.0);
  float on = step(hash(id + seed + 5.3), 0.35);
  burning = step(hash(id + seed + 9.1), 0.12) * on;
  return smoothstep(0.09, 0.03, length(c)) * on;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = gl_FragCoord.xy / u_res.y;
  float aspect = u_res.x / u_res.y;
  float t = u_time;
  vec2 m = u_mouse / u_res.y;
  float md = length(p - m);
  p.y -= u_scroll / u_res.y * 0.06;

  // Smoke rolling overhead, lit red from the fires below.
  vec2 sp = p * 1.3 + vec2(t * 0.025, 0.0);
  float smoke = fbm(sp + vec2(fbm(sp * 1.3 + t * 0.05), fbm(sp * 1.1 - t * 0.04 + 3.0)) * 1.6);
  vec3 col = vec3(0.065, 0.022, 0.025);
  col += vec3(0.42, 0.07, 0.05) * smoke * smoke * (0.2 + pow(1.0 - uv.y, 2.0) * 0.9);

  // The ground: a plain of cooling rock whose cracks glow, rolling slowly toward the viewer.
  float horizon = 0.36;
  float glow = exp(-abs(uv.y - horizon) * 14.0);
  col += vec3(0.55, 0.12, 0.04) * glow * 0.35;
  if (uv.y < horizon) {
    float z = 0.22 / (horizon - uv.y + 0.02);
    vec2 gp = vec2((p.x - aspect * 0.5) * z * 1.6, z * 2.2 + t * 0.12);
    float crack = cellEdge(gp, t * 0.15);
    float pulse = 0.65 + 0.35 * sin(t * 1.3 + gp.y * 1.7 + gp.x);
    float near = smoothstep(horizon, 0.0, uv.y);
    float heat = 1.0 + 1.5 * exp(-md * md * 10.0);
    col *= 0.6 + 0.4 * (1.0 - near);
    col += vec3(1.0, 0.32, 0.07) * exp(-crack * 22.0) * pulse * (0.12 + 0.4 * near) * heat;
    col += vec3(1.0, 0.75, 0.35) * exp(-crack * 60.0) * pulse * 0.25 * near * heat;
  }

  // Ash falling in three layers; a few flakes are still burning.
  float b1;
  float b2;
  float b3;
  float a1 = ash(p, t, 6.0, 0.35, 1.0, b1);
  float a2 = ash(p, t, 10.0, 0.5, 4.0, b2);
  float a3 = ash(p, t, 16.0, 0.7, 8.0, b3);
  col += vec3(0.42, 0.38, 0.37) * (a1 * 0.35 + a2 * 0.25 + a3 * 0.16);
  col += vec3(1.0, 0.45, 0.12) * (a1 * b1 + a2 * b2 + a3 * b3) * 0.6;

  col += vec3(0.45, 0.1, 0.04) * exp(-md * md * 12.0) * 0.3;

  // Clicks stamp a brass seal that spreads and fades, like a contract being signed.
  for (int i = 0; i < 6; i++) {
    vec3 r = u_ripples[i];
    float age = t - r.z;
    if (age < 0.0 || age > 2.2) continue;
    vec2 d = p - r.xy / u_res.y;
    float dist = length(d);
    float radius = 0.06 + age * 0.12;
    float fade = exp(-age * 1.6);
    float ring = exp(-pow((dist - radius) * 140.0, 2.0)) + exp(-pow((dist - radius * 0.78) * 200.0, 2.0)) * 0.6;
    float ang = atan(d.y, d.x) + age * 0.6;
    float ticks = smoothstep(0.75, 0.9, abs(sin(ang * 12.0))) * step(abs(dist - radius * 0.89), radius * 0.07);
    col += vec3(0.95, 0.7, 0.35) * (ring + ticks * 0.8) * fade;
  }

  col *= 1.0 - 0.4 * pow(length(uv - 0.5) * 1.2, 2.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

/* Icewind Dale: northern lights over dark peaks, blowing snow and frost at the window edges. */
const ICEWIND_DALE = /* glsl */ `
float snow(vec2 p, float t, float scale, float speed, float seed) {
  vec2 g = p * scale;
  float wind = t * (0.25 + 0.15 * scale * 0.05) + sin(t * 0.3 + seed) * 1.5;
  g += vec2(wind, t * speed);
  vec2 id = floor(g);
  vec2 h = hash2(id + seed);
  vec2 c = fract(g) - 0.5 - (h - 0.5) * 0.7;
  c.x += sin(t * (1.0 + h.y) + h.x * 6.2831) * 0.12;
  float on = step(hash(id + seed + 2.7), 0.45);
  return smoothstep(0.1, 0.0, length(c)) * on;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = gl_FragCoord.xy / u_res.y;
  float aspect = u_res.x / u_res.y;
  float t = u_time;
  vec2 m = u_mouse / u_res.y;
  float md = length(p - m);
  vec2 q = p;
  q.y -= u_scroll / u_res.y * 0.05;

  vec3 col = mix(vec3(0.05, 0.08, 0.11), vec3(0.02, 0.035, 0.055), uv.y);

  // Northern lights: three curtains that sway, with fine upward streaks.
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float base = 0.62 + fi * 0.09 + 0.07 * sin(q.x * 1.1 + t * 0.12 + fi * 2.1)
      + 0.06 * (fbm(vec2(q.x * 1.8 + fi * 5.0, t * 0.07)) - 0.5);
    float above = uv.y - base;
    float curtain = smoothstep(-0.015, 0.0, above) * exp(-max(above, 0.0) * (7.0 - fi)) + exp(-above * above * 900.0) * 0.5;
    float streak = 0.45 + 0.55 * noise(vec2(q.x * 30.0 + fi * 13.0, t * 0.4));
    float shimmer = 0.6 + 0.4 * sin(q.x * 3.0 - t * 0.5 + fi);
    vec3 tint = mix(vec3(0.2, 0.95, 0.65), vec3(0.55, 0.4, 1.0), smoothstep(0.0, 0.18, above) * 0.8 + fi * 0.15);
    col += tint * curtain * streak * shimmer * 0.16;
  }

  // Two ridges of sharp peaks, the far one hazy with snow on its crests, the near one dark.
  float ridge1 = 0.2 + 0.2 * pow(1.0 - abs(noise(vec2(q.x * 2.2, 1.0)) * 2.0 - 1.0), 2.0)
    + 0.035 * noise(vec2(q.x * 9.0, 2.0));
  float ridge2 = 0.08 + 0.14 * pow(1.0 - abs(noise(vec2(q.x * 1.6 + 7.0, 3.0)) * 2.0 - 1.0), 1.6)
    + 0.025 * noise(vec2(q.x * 12.0, 4.0));
  float r1 = smoothstep(ridge1 + 0.002, ridge1 - 0.002, uv.y);
  float cap = smoothstep(ridge1 - 0.07 - 0.04 * noise(vec2(q.x * 25.0, 5.0)), ridge1 - 0.005, uv.y);
  col = mix(col, mix(vec3(0.06, 0.085, 0.115), vec3(0.2, 0.25, 0.31), cap), r1);
  col = mix(col, vec3(0.02, 0.03, 0.045), smoothstep(ridge2 + 0.002, ridge2 - 0.002, uv.y));

  // Blowing snow in three layers. The pointer pushes the flakes aside.
  vec2 push = (p - m) / (md + 1e-3) * 0.05 * exp(-md * md * 30.0);
  vec2 sp = q - push;
  float s = snow(sp, t, 5.0, 0.6, 1.0) * 0.5 + snow(sp, t, 9.0, 0.9, 3.0) * 0.32 + snow(sp, t, 15.0, 1.3, 5.0) * 0.2;
  col += vec3(0.85, 0.93, 1.0) * s;

  // Frost creeping in from the window edges, with crystal lines and a few glints.
  float edge = min(min(uv.x, 1.0 - uv.x) * aspect, min(uv.y, 1.0 - uv.y));
  float frost = smoothstep(0.1, 0.0, edge + (fbm(p * 5.0) - 0.5) * 0.08);
  float crystal = exp(-cellEdge(p * 30.0, 0.0) * 30.0);
  float glint = step(0.992, hash(floor(p * 150.0))) * (0.5 + 0.5 * sin(t * 3.0 + hash(floor(p * 150.0) + 1.0) * 40.0));
  col += vec3(0.65, 0.85, 1.0) * frost * (0.05 + 0.12 * crystal + glint * 0.5);

  col += vec3(0.4, 0.6, 0.8) * exp(-md * md * 14.0) * 0.06;

  // Clicks grow a snowflake that turns slowly and fades.
  for (int i = 0; i < 6; i++) {
    vec3 r = u_ripples[i];
    float age = t - r.z;
    if (age < 0.0 || age > 2.0) continue;
    vec2 d = p - r.xy / u_res.y;
    float size = 0.07 * smoothstep(0.0, 0.5, age) + 0.01;
    float ang = atan(d.y, d.x) + age * 0.4;
    float rad = length(d);
    float k = mod(ang + 0.5236, 1.0472) - 0.5236;
    vec2 l = vec2(rad * cos(k), abs(rad * sin(k)));
    float arm = l.x < size ? l.y : length(l - vec2(size, 0.0));
    float b1 = abs((l.x - size * 0.45) * 0.866 - l.y * 0.5);
    float b2 = abs((l.x - size * 0.7) * 0.866 - l.y * 0.5);
    float branches = min(b1 + step(size * 0.3, l.y) + step(l.x, size * 0.45), b2 + step(size * 0.18, l.y) + step(l.x, size * 0.7));
    float flake = exp(-pow(min(arm, branches) * 700.0, 2.0));
    float fade = smoothstep(2.0, 1.2, age);
    col += vec3(0.8, 0.95, 1.0) * (flake * 0.8 + exp(-rad * rad * 400.0) * 0.25) * fade;
  }

  col *= 1.0 - 0.35 * pow(length(uv - 0.5) * 1.2, 2.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

/* Feywild: a twilight glade with soft lights, falling blossom and fireflies that follow you. */
const FEYWILD = /* glsl */ `
float petal(vec2 p, float t, float scale, float seed) {
  vec2 g = p * scale;
  g += vec2(t * 0.35, t * 0.55);
  g.x += sin(g.y * 0.5 + seed) * 0.8;
  vec2 id = floor(g);
  vec2 h = hash2(id + seed);
  vec2 c = fract(g) - 0.5 - (h - 0.5) * 0.5;
  float a = t * (0.6 + h.x) + h.y * 6.2831;
  c = mat2(cos(a), -sin(a), sin(a), cos(a)) * c;
  c.x /= 0.35 + 0.65 * abs(cos(t * (1.2 + h.y) + h.x * 9.0));
  c.y += c.x * c.x * 2.0;
  float on = step(hash(id + seed + 4.4), 0.3);
  return smoothstep(0.12, 0.08, length(c * vec2(1.0, 1.7))) * on;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = gl_FragCoord.xy / u_res.y;
  float t = u_time;
  vec2 m = u_mouse / u_res.y;
  float md = length(p - m);
  vec2 q = p;
  q.y -= u_scroll / u_res.y * 0.06;

  vec3 col = mix(vec3(0.16, 0.07, 0.17), vec3(0.08, 0.045, 0.13), uv.y);

  // Fey mist swirling in pink and teal.
  vec2 w = vec2(fbm(q * 1.2 + t * 0.03), fbm(q * 1.2 - t * 0.025 + 4.0));
  float mist = fbm(q * 1.6 + w * 2.0);
  col += mix(vec3(0.5, 0.15, 0.4), vec3(0.1, 0.45, 0.45), w.x) * mist * mist * 0.35;

  // Large soft lights drifting out of focus.
  vec2 bg = q * 3.0 + vec2(t * 0.04, t * 0.02);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 id = floor(bg) + vec2(float(x), float(y));
      vec2 h = hash2(id);
      vec2 o = id + 0.5 + 0.35 * vec2(sin(t * 0.2 + h.x * 6.2831), cos(t * 0.17 + h.y * 6.2831));
      float d = length(bg - o);
      float r = 0.18 + 0.2 * h.y;
      float disc = smoothstep(r, r - 0.04, d) * (0.6 + 0.4 * smoothstep(r - 0.1, r, d));
      vec3 tint = mix(mix(vec3(1.0, 0.55, 0.8), vec3(0.45, 0.95, 0.9), h.x), vec3(1.0, 0.85, 0.5), step(0.75, h.y));
      col += tint * disc * step(0.45, hash(id + 2.0)) * (0.06 + 0.03 * sin(t * 0.8 + h.x * 20.0));
    }
  }

  // Blossom petals tumbling down.
  col += vec3(1.0, 0.62, 0.82) * (petal(q, t, 6.0, 1.0) * 0.45 + petal(q, t, 10.0, 6.0) * 0.28);

  // Fireflies wandering. Those near the pointer are drawn toward it.
  vec2 fg = p * 5.0;
  float flies = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 id = floor(fg) + vec2(float(x), float(y));
      vec2 h = hash2(id + 11.0);
      vec2 o = (id + 0.5 + 0.4 * vec2(sin(t * (0.3 + h.x * 0.4) + h.y * 9.0), sin(t * (0.25 + h.y * 0.4) + h.x * 7.0))) / 5.0;
      vec2 toward = m - o;
      o += toward * 0.45 * exp(-dot(toward, toward) * 12.0);
      float d = length(p - o);
      float blink = smoothstep(0.2, 1.0, sin(t * (1.0 + h.x) + h.y * 30.0));
      flies += (smoothstep(0.006, 0.0, d) + exp(-d * d * 1500.0) * 0.5) * blink * step(0.35, h.x);
    }
  }
  col += vec3(0.9, 1.0, 0.55) * flies * 0.7;

  col += vec3(0.6, 0.35, 0.6) * exp(-md * md * 12.0) * 0.12;

  // Clicks scatter a handful of twinkling sparkles.
  for (int i = 0; i < 6; i++) {
    vec3 r = u_ripples[i];
    float age = t - r.z;
    if (age < 0.0 || age > 1.8) continue;
    vec2 o = r.xy / u_res.y;
    float fade = smoothstep(1.8, 0.4, age);
    for (int k = 0; k < 12; k++) {
      vec2 h = hash2(vec2(float(k), r.z + 3.0));
      float a = h.x * 6.2831;
      vec2 pos = o + vec2(cos(a), sin(a)) * (0.04 + 0.12 * h.y) * (1.0 - exp(-age * 3.0)) + vec2(0.0, -0.02 * age);
      vec2 c = abs(p - pos) * 300.0;
      float star = exp(-c.x * c.y * 0.6) * exp(-(c.x + c.y) * 0.08) + exp(-dot(c, c) * 0.05);
      float tw = 0.5 + 0.5 * sin(age * 14.0 + h.y * 30.0);
      vec3 tint = mix(vec3(1.0, 0.65, 0.85), vec3(0.55, 1.0, 0.95), h.y);
      col += tint * star * tw * fade * 0.7;
    }
  }

  col *= 1.0 - 0.35 * pow(length(uv - 0.5) * 1.2, 2.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

/* Shadowfell: grey fog rolling through, shadows reaching in from the edges, a lantern at the
   pointer that pushes the fog back. */
const SHADOWFELL = /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = gl_FragCoord.xy / u_res.y;
  float aspect = u_res.x / u_res.y;
  float t = u_time;
  vec2 m = u_mouse / u_res.y;
  float md = length(p - m);
  vec2 q = p;
  q.y -= u_scroll / u_res.y * 0.05;

  vec3 col = mix(vec3(0.065, 0.068, 0.075), vec3(0.04, 0.042, 0.048), uv.y);
  // A sun with no warmth: a pale disc behind the haze, high to the left.
  vec2 sun = vec2(aspect * 0.18, 0.86);
  float sd = length(q - sun);
  col += vec3(0.5, 0.52, 0.56) * smoothstep(0.06, 0.055, sd) * 0.18;
  col += vec3(0.2, 0.21, 0.24) * exp(-sd * 3.5) * 0.6;

  // Fog in three layers drifting at different speeds. The lantern thins the fog near it.
  float clear = exp(-md * md * 9.0);
  float fog = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 fp = q * vec2(1.0 + fi * 0.6, 2.0 + fi) + vec2(t * (0.025 + fi * 0.02), fi * 3.1);
    fp += vec2(fbm(fp * 0.6 + t * 0.03) * 1.5, 0.0);
    fog += smoothstep(0.3, 0.75, fbm(fp)) * (0.55 - fi * 0.13) * (0.6 + 0.6 * (1.0 - uv.y));
  }
  fog *= 1.0 - clear * 0.8;
  col += vec3(0.27, 0.28, 0.3) * fog;

  // Pale wisps, like breath or lost souls, curling through the fog.
  vec2 wp = q * 2.0 + vec2(t * 0.04, -t * 0.02);
  float wisp = exp(-abs(fbm(wp + fbm(wp * 1.5 + t * 0.05)) - 0.5) * 45.0);
  col += vec3(0.62, 0.6, 0.78) * wisp * smoothstep(0.35, 0.7, fbm(q * 1.3 - t * 0.02)) * 0.12;

  // Shadows reach in from the window edges, curling as they move.
  float edge = min(min(uv.x, 1.0 - uv.x) * aspect, uv.y * 1.3);
  vec2 sp = p * 3.5 + vec2(0.0, t * 0.06);
  float shade = fbm(sp + vec2(fbm(sp * 0.8 - t * 0.04), 0.0) * 1.5);
  float dark = smoothstep(0.5, 0.7, shade + (0.22 - edge) * 2.6);
  col *= 1.0 - dark * 0.88;

  // A few faint violet lights wandering through the fog.
  vec2 wg = q * 2.5 + vec2(t * 0.05, 0.0);
  vec2 wid = floor(wg);
  vec2 wh = hash2(wid + 5.0);
  vec2 wo = wid + 0.5 + 0.3 * vec2(sin(t * 0.4 + wh.x * 6.2831), cos(t * 0.3 + wh.y * 6.2831));
  float wd = length(wg - wo);
  col += vec3(0.6, 0.55, 0.85) * exp(-wd * wd * 60.0) * step(0.75, hash(wid + 1.0)) * (0.2 + 0.1 * sin(t * 2.0 + wh.x * 9.0));

  // The lantern.
  float flicker = 0.92 + 0.08 * noise(vec2(t * 6.0, 0.0));
  col += vec3(0.55, 0.57, 0.6) * exp(-md * md * 7.0) * 0.12 * flicker;
  col += vec3(0.75, 0.75, 0.78) * exp(-md * md * 60.0) * 0.08 * flicker;

  // Clicks send out a ring of darkness with a pale edge.
  for (int i = 0; i < 6; i++) {
    vec3 r = u_ripples[i];
    float age = t - r.z;
    if (age < 0.0 || age > 2.5) continue;
    float dist = length(p - r.xy / u_res.y);
    float radius = age * 0.22;
    float fade = exp(-age * 1.3);
    col *= 1.0 - smoothstep(radius, radius - 0.08, dist) * smoothstep(radius - 0.2, radius - 0.08, dist) * 0.6 * fade;
    col += vec3(0.6, 0.62, 0.66) * exp(-pow((dist - radius) * 90.0, 2.0)) * 0.25 * fade;
  }

  col *= 1.0 - 0.45 * pow(length(uv - 0.5) * 1.2, 2.0);
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0 * 3.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

/* Underdark: cave rock threaded with glowing faerzress, fungus light below, spores drifting up. */
const UNDERDARK = /* glsl */ `
float ridged(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * (1.0 - abs(noise(p) * 2.0 - 1.0));
    p = p * 2.1 + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = gl_FragCoord.xy / u_res.y;
  float t = u_time;
  vec2 m = u_mouse / u_res.y;
  float md = length(p - m);
  vec2 q = p;
  q.y -= u_scroll / u_res.y * 0.08;

  // Rough rock, lit only by what glows in it.
  float rock = fbm(q * 3.0) * 0.6 + fbm(q * 9.0) * 0.4;
  vec3 col = vec3(0.045, 0.035, 0.075) * (0.7 + rock * 0.6);

  // Faerzress: veins of violet light that pulse along their length and wake near the pointer.
  vec2 vp = q * 1.4 + vec2(fbm(q * 0.8 + t * 0.03), fbm(q * 0.8 - t * 0.02 + 5.0)) * 1.2;
  float n1 = fbm(vp);
  float n2 = fbm(vp * 2.3 + 4.0);
  float vein = exp(-abs(n1 - 0.5) * 70.0) + exp(-abs(n2 - 0.5) * 90.0) * 0.5 * smoothstep(0.3, 0.6, ridged(vp * 0.7));
  float halo = exp(-abs(n1 - 0.5) * 14.0) * 0.25;
  float flow = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(dot(vp, vec2(3.0, 2.0)) * 2.0 + n2 * 8.0 - t * 1.4), 3.0);
  float wake = 1.0 + 2.0 * exp(-md * md * 10.0);
  col += mix(vec3(0.6, 0.3, 1.0), vec3(1.0, 0.5, 0.95), flow * 0.5) * (vein + halo) * flow * 0.5 * wake;
  col += vec3(0.25, 0.1, 0.4) * exp(-md * md * 8.0) * 0.12;

  // Fungus glowing along the floor, breathing slowly.
  float caps = pow(noise(vec2(q.x * 5.0, 1.0)), 3.0) + pow(noise(vec2(q.x * 11.0, 4.0)), 4.0) * 0.6;
  float breathe = 0.7 + 0.3 * sin(t * 0.9 + q.x * 3.0);
  col += vec3(0.2, 0.95, 0.8) * exp(-uv.y * 6.0) * caps * breathe * 0.9;
  col += vec3(0.1, 0.4, 0.45) * exp(-uv.y * 3.0) * 0.12 * breathe;

  // Spores rising. Nearby ones drift toward the pointer.
  vec2 sg = vec2(p.x * 7.0, p.y * 7.0 - t * 0.25);
  float spores = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 id = floor(sg) + vec2(float(x), float(y));
      vec2 h = hash2(id + 3.0);
      vec2 o = id + 0.5 + 0.35 * vec2(sin(t * 0.5 + h.x * 6.2831), sin(t * 0.4 + h.y * 6.2831));
      o = vec2(o.x / 7.0, (o.y + t * 0.25) / 7.0);
      vec2 toward = m - o;
      o += toward * 0.3 * exp(-dot(toward, toward) * 15.0);
      float d = length(p - o);
      float pulse = 0.5 + 0.5 * sin(t * 1.5 + h.y * 20.0);
      spores += (smoothstep(0.005, 0.0, d) + exp(-d * d * 2500.0) * 0.4) * pulse * step(0.5, h.x);
    }
  }
  col += vec3(0.4, 1.0, 0.85) * spores * 0.6;

  // Clicks release a slow puff of spores.
  for (int i = 0; i < 6; i++) {
    vec3 r = u_ripples[i];
    float age = t - r.z;
    if (age < 0.0 || age > 2.5) continue;
    vec2 o = r.xy / u_res.y;
    float fade = smoothstep(2.5, 0.6, age);
    col += vec3(0.3, 0.9, 0.8) * exp(-length(p - o) * 25.0) * exp(-age * 4.0) * 0.5;
    for (int k = 0; k < 12; k++) {
      vec2 h = hash2(vec2(float(k), r.z + 7.0));
      float a = h.x * 6.2831;
      vec2 pos = o + vec2(cos(a), sin(a)) * (0.03 + 0.1 * h.y) * (1.0 - exp(-age * 2.0)) + vec2(0.0, 0.03 * age);
      float d = length(p - pos);
      col += mix(vec3(0.4, 1.0, 0.85), vec3(0.8, 0.6, 1.0), h.y) * (smoothstep(0.006, 0.0, d) + exp(-d * d * 2000.0) * 0.4) * fade * 0.8;
    }
  }

  col *= 1.0 - 0.4 * pow(length(uv - 0.5) * 1.2, 2.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

/* Astral Sea: a nebula and silver currents among stars; the pointer bends starlight around it. */
const ASTRAL_SEA = /* glsl */ `
float stars(vec2 p, float scale, float t, float seed) {
  vec2 g = p * scale;
  vec2 id = floor(g);
  vec2 h = hash2(id + seed);
  vec2 c = fract(g) - 0.5 - (h - 0.5) * 0.7;
  float size = 0.03 + 0.05 * h.y * h.y;
  float tw = 0.55 + 0.45 * sin(t * (1.0 + h.x * 3.0) + h.y * 40.0);
  float on = step(hash(id + seed + 1.3), 0.4);
  float spikes = exp(-abs(c.x * c.y) * 900.0) * smoothstep(0.3, 0.0, length(c)) * step(0.85, h.y);
  return (smoothstep(size, 0.0, length(c)) + spikes * 0.6) * tw * on;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = gl_FragCoord.xy / u_res.y;
  float aspect = u_res.x / u_res.y;
  float t = u_time;
  vec2 m = u_mouse / u_res.y;
  float md = length(p - m);
  vec2 q = p;
  q.y -= u_scroll / u_res.y * 0.04;

  // Starlight bends around the pointer like light passing a heavy body.
  vec2 lens = (p - m) / (md + 1e-3);
  vec2 sp = q - lens * 0.012 / (md + 0.06) * smoothstep(0.6, 0.0, md);

  vec3 col = mix(vec3(0.05, 0.06, 0.15), vec3(0.03, 0.035, 0.1), uv.y);

  // A slowly turning nebula in violet, blue and rose.
  vec2 np = q * 1.1 + vec2(t * 0.01, 0.0);
  vec2 w = vec2(fbm(np + t * 0.02), fbm(np * 1.3 - t * 0.015 + 7.0));
  float neb = fbm(np * 1.5 + w * 2.5);
  vec3 nebc = mix(vec3(0.45, 0.25, 0.85), vec3(0.25, 0.4, 0.95), w.y);
  nebc = mix(nebc, vec3(0.9, 0.35, 0.6), smoothstep(0.55, 0.8, w.x));
  col += nebc * pow(neb, 2.5) * 0.55;

  // Silver currents flowing through the sea.
  float flow = q.y * 3.0 + q.x * 0.6 + fbm(q * 1.5 + vec2(t * 0.04, 0.0)) * 3.5;
  float current = exp(-abs(sin(flow)) * 22.0);
  float glints = 0.4 + 0.6 * pow(noise(vec2(flow * 2.0, q.x * 4.0 - t * 0.8)), 3.0);
  col += vec3(0.75, 0.8, 1.0) * current * glints * 0.1;

  // Stars in three depths, the nearest drifting slightly.
  col += vec3(0.9, 0.92, 1.0) * stars(sp, 40.0, t, 1.0) * 0.4;
  col += vec3(0.85, 0.9, 1.0) * stars(sp + vec2(t * 0.003, 0.0), 22.0, t, 4.0) * 0.6;
  col += vec3(1.0, 0.95, 0.9) * stars(sp + vec2(t * 0.007, 0.0), 11.0, t, 9.0) * 0.8;

  // A shooting star now and then.
  float slot = floor(t / 5.0);
  float ph = fract(t / 5.0) * 5.0;
  vec2 sh = hash2(vec2(slot, 3.0));
  if (ph < 0.9 && sh.x > 0.3) {
    vec2 start = vec2(sh.x * aspect, 0.65 + sh.y * 0.35);
    vec2 dir = normalize(vec2(-0.8, -0.45));
    vec2 head = start + dir * ph * 0.9;
    vec2 rel = p - head;
    float along = dot(rel, -dir);
    float across = abs(rel.x * dir.y - rel.y * dir.x);
    float tail = smoothstep(0.25, 0.0, along) * step(0.0, along) * exp(-across * across * 150000.0);
    col += vec3(0.9, 0.95, 1.0) * (tail + exp(-dot(rel, rel) * 20000.0)) * sin(ph / 0.9 * 3.1416) * 0.9;
  }

  col += vec3(0.35, 0.35, 0.6) * exp(-md * md * 14.0) * 0.1;

  // Clicks flare a new star that spreads a ring of light.
  for (int i = 0; i < 6; i++) {
    vec3 r = u_ripples[i];
    float age = t - r.z;
    if (age < 0.0 || age > 2.0) continue;
    vec2 d = p - r.xy / u_res.y;
    float dist = length(d);
    float fade = exp(-age * 1.8);
    vec2 c = abs(d) * 220.0;
    float flare = exp(-c.x * c.y * 0.05) * exp(-(c.x + c.y) * 0.02) + exp(-dist * 60.0);
    col += vec3(0.85, 0.85, 1.0) * flare * fade;
    col += vec3(0.7, 0.6, 1.0) * exp(-pow((dist - age * 0.25) * 70.0, 2.0)) * fade * 0.5;
  }

  col *= 1.0 - 0.4 * pow(length(uv - 0.5) * 1.2, 2.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

/* Mechanus: great brass and steel gears turning in step with a clock's tick. */
const MECHANUS = /* glsl */ `
// Distance to a gear: r is the pitch radius, n the tooth count, a its turn.
float gear(vec2 p, vec2 c, float r, float n, float a) {
  vec2 d = p - c;
  float rr = length(d);
  float th = atan(d.y, d.x) - a;
  float tooth = smoothstep(-0.25, 0.25, cos(th * n));
  float body = rr - (r - 0.012 + tooth * 0.024);
  float hole = r * 0.18 - rr;
  float spokes = abs(sin(th * 3.0)) * rr - r * 0.1;
  float window = max(abs(rr - r * 0.5) - r * 0.2, -spokes);
  return max(max(body, hole), -window);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = gl_FragCoord.xy / u_res.y;
  float aspect = u_res.x / u_res.y;
  float t = u_time;
  vec2 m = u_mouse / u_res.y;
  float md = length(p - m);
  p.y -= u_scroll / u_res.y * 0.05;

  vec3 col = mix(vec3(0.07, 0.08, 0.09), vec3(0.045, 0.05, 0.06), uv.y);

  // A fine engraved grid.
  vec2 gl = abs(fract(p * 12.0) - 0.5);
  col += vec3(0.5, 0.6, 0.7) * smoothstep(0.48, 0.5, max(gl.x, gl.y)) * 0.025;

  // Gears move one tooth per second, settling with a small bounce.
  float tick = floor(t) + smoothstep(0.0, 0.18, fract(t)) + sin(smoothstep(0.0, 0.35, fract(t)) * 3.1416) * 0.06;
  float step0 = tick * 6.2831 / 24.0;

  // Two meshed trains, one in each margin. Each gear's speed follows its tooth count.
  float best = 1.0;
  float brass = 0.0;
  for (int side = 0; side < 2; side++) {
    float sx = side == 0 ? 0.14 : aspect - 0.14;
    float dir = side == 0 ? 1.0 : -1.0;
    vec2 c1 = vec2(sx, 0.62);
    float r1 = 0.2;
    float d1 = gear(p, c1, r1, 24.0, step0 * dir);
    vec2 c2 = c1 + vec2(dir * 0.06, -0.3) * (0.33 / length(vec2(0.06, -0.3)));
    float r2 = 0.13;
    float d2 = gear(p, c2, r2, 16.0, -step0 * dir * 1.5 + 3.1416 / 16.0);
    vec2 c3 = c1 + vec2(dir * 0.26, 0.2) * (0.3 / length(vec2(0.26, 0.2)));
    float r3 = 0.1;
    float d3 = gear(p, c3, r3, 12.0, -step0 * dir * 2.0);
    float dmin = min(d1, min(d2, d3));
    if (dmin < best) {
      best = dmin;
      brass = d2 < d1 && d2 < d3 ? 1.0 : 0.0;
    }
  }

  float inside = smoothstep(0.003, -0.003, best);
  float rim = exp(-abs(best) * 300.0);
  vec3 metal = mix(vec3(0.16, 0.17, 0.19), vec3(0.3, 0.22, 0.1), brass);
  // A slow band of light passes over the metal, and the pointer lights it like a lamp.
  float sweep = exp(-pow((p.x + p.y * 0.6 - mod(t * 0.25, aspect + 2.0) + 0.5), 2.0) * 6.0);
  float lamp = exp(-md * md * 8.0);
  col = mix(col, metal * (0.8 + 0.4 * fbm(p * 30.0)) * (1.0 + sweep * 0.8 + lamp * 1.2), inside * 0.85);
  col += mix(vec3(0.5, 0.55, 0.6), vec3(0.85, 0.65, 0.35), brass) * rim * (0.12 + sweep * 0.35 + lamp * 0.5);

  col += vec3(0.4, 0.33, 0.2) * lamp * 0.06;

  // Clicks send a brass pulse along the gear edges and out in a square wave.
  for (int i = 0; i < 6; i++) {
    vec3 r = u_ripples[i];
    float age = t - r.z;
    if (age < 0.0 || age > 1.5) continue;
    vec2 d = abs(p - r.xy / u_res.y);
    float box = max(d.x, d.y);
    float fade = exp(-age * 2.5);
    col += vec3(0.85, 0.65, 0.35) * exp(-pow((box - age * 0.3) * 120.0, 2.0)) * fade * 0.6;
    col += vec3(0.85, 0.65, 0.35) * rim * fade * 0.5;
  }

  col *= 1.0 - 0.4 * pow(length(uv - 0.5) * 1.2, 2.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

/* Barovia: a blood moon over a dark castle, mist rolling through, distant lightning. */
const BAROVIA = /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = gl_FragCoord.xy / u_res.y;
  float aspect = u_res.x / u_res.y;
  float t = u_time;
  vec2 m = u_mouse / u_res.y;
  float md = length(p - m);
  vec2 q = p;
  q.y -= u_scroll / u_res.y * 0.04;

  // Distant lightning: a double flash every so often.
  float slot = floor(t / 9.0);
  float ph = fract(t / 9.0) * 9.0;
  float flash = step(0.45, hash(vec2(slot, 1.0))) * (exp(-ph * 12.0) + exp(-abs(ph - 0.25) * 18.0) * 0.7);

  vec3 col = mix(vec3(0.11, 0.07, 0.08), vec3(0.05, 0.035, 0.045), uv.y);
  col += vec3(0.35, 0.33, 0.4) * flash * 0.25 * uv.y;

  // The blood moon, partly hidden by passing cloud.
  vec2 mc = vec2(aspect * 0.84, 0.8);
  float mdist = length(q - mc);
  float face = smoothstep(0.085, 0.082, mdist);
  float marks = fbm(q * 18.0) * 0.4 + 0.6;
  vec3 moon = vec3(0.75, 0.2, 0.12) * marks * face + vec3(0.5, 0.1, 0.06) * exp(-mdist * 9.0) * 0.6;
  float cloud = smoothstep(0.45, 0.75, fbm(vec2(q.x * 2.0 - t * 0.03, q.y * 5.0)));
  float sky = smoothstep(0.4, 0.8, fbm(vec2(q.x * 1.5 - t * 0.02, q.y * 3.5 + 2.0)));
  col += vec3(0.16, 0.08, 0.09) * sky * smoothstep(0.3, 0.8, uv.y);
  col += moon * (1.0 - cloud * 0.8);
  col += vec3(0.25, 0.08, 0.07) * cloud * exp(-mdist * 5.0) * 0.6;
  col += vec3(0.4, 0.38, 0.45) * cloud * flash * 0.3;

  // Hills, and a castle with towers on a crag. A few windows hold a flickering candle.
  float hill = 0.2 + 0.09 * fbm(vec2(q.x * 1.3, 2.0));
  float cx = aspect * 0.72;
  float crag = 0.33 - 0.25 * pow(abs(q.x - cx) / 0.3, 1.5);
  float top = max(hill, crag);
  float castle = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float x = cx + (fi - 2.0) * 0.05 + (fi == 2.0 ? 0.0 : 0.008);
    float h = 0.33 + 0.06 + (fi == 2.0 ? 0.08 : hash(vec2(fi, 9.0)) * 0.05);
    float w = fi == 2.0 ? 0.018 : 0.012;
    float tower = step(abs(q.x - x), w) * step(q.y, h);
    float roof = step(q.y, h + 0.04 - abs(q.x - x) * 2.2) * step(abs(q.x - x), w + 0.004);
    castle = max(castle, max(tower, roof));
  }
  castle = max(castle, step(abs(q.x - cx), 0.11) * step(q.y, 0.37));
  float land = max(step(q.y, top), castle * step(0.2, q.y));
  vec2 win = vec2((q.x - cx) * 70.0, q.y * 55.0);
  vec2 wid = floor(win);
  float lit = step(0.86, hash(wid)) * castle * step(0.3, q.y) * step(mod(wid.x, 2.0), 0.5);
  float flame = 0.6 + 0.4 * noise(vec2(t * 5.0, wid.x));
  vec2 wc = abs(fract(win) - 0.5);
  float pane = step(max(wc.x, wc.y * 0.7), 0.22);
  col = mix(col, vec3(0.025, 0.018, 0.022) + vec3(0.2, 0.18, 0.24) * flash * 0.3, land);
  col += vec3(1.0, 0.6, 0.25) * lit * pane * flame * 0.5;

  // Mist rolling through the valley, thick near the ground, tinted red by the moon.
  float mist = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 mp = vec2(q.x * (1.2 + fi * 0.6) - t * (0.04 + fi * 0.03), q.y * (2.5 + fi) + fi * 4.0);
    mist += smoothstep(0.3, 0.75, fbm(mp)) * exp(-q.y * (2.0 - fi * 0.4)) * 0.6;
  }
  col += vec3(0.32, 0.25, 0.27) * mist * (1.0 + flash * 0.6);

  // A candle carried by the pointer.
  float candle = 0.85 + 0.15 * noise(vec2(t * 7.0, 3.0));
  col += vec3(1.0, 0.6, 0.3) * exp(-md * md * 12.0) * 0.12 * candle;
  col += vec3(0.6, 0.4, 0.3) * mist * exp(-md * md * 6.0) * 0.25;

  // Clicks ring out like a far-off bell in the mist.
  for (int i = 0; i < 6; i++) {
    vec3 r = u_ripples[i];
    float age = t - r.z;
    if (age < 0.0 || age > 2.5) continue;
    float dist = length(p - r.xy / u_res.y);
    float fade = exp(-age * 1.4);
    col += vec3(0.85, 0.35, 0.3) * exp(-pow((dist - age * 0.2) * 60.0, 2.0)) * fade * 0.25;
    col += vec3(0.85, 0.35, 0.3) * exp(-pow((dist - age * 0.13) * 80.0, 2.0)) * fade * 0.15;
  }

  col *= 1.0 - 0.45 * pow(length(uv - 0.5) * 1.2, 2.0);
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0 * 3.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

/* Mount Celestia: warm light pouring down through soft clouds, gold motes rising. Light theme. */
const MOUNT_CELESTIA = /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = gl_FragCoord.xy / u_res.y;
  float aspect = u_res.x / u_res.y;
  float t = u_time;
  vec2 m = u_mouse / u_res.y;
  float md = length(p - m);
  vec2 q = p;
  q.y -= u_scroll / u_res.y * 0.05;

  vec3 col = mix(vec3(0.93, 0.89, 0.8), vec3(0.97, 0.95, 0.9), uv.y);

  // Rays fanning down from a bright point above the window, slowly turning.
  vec2 src = vec2(aspect * 0.5, 1.35);
  vec2 rd = p - src;
  float ang = atan(rd.x, -rd.y);
  float rays = noise(vec2(ang * 9.0 + t * 0.05, t * 0.1)) * noise(vec2(ang * 23.0 - t * 0.08, 3.0));
  float fall = exp(-length(rd) * 0.9);
  col += vec3(1.0, 0.93, 0.7) * rays * fall * 0.22;
  col += vec3(1.0, 0.96, 0.85) * exp(-length(rd) * 1.6) * 0.18;

  // A distant peak in blue haze, with terraces catching the light.
  float peak = 0.52 - abs(q.x - aspect * 0.5) * 0.55 + 0.03 * fbm(vec2(q.x * 3.0, 1.0));
  float onPeak = smoothstep(peak + 0.003, peak - 0.003, q.y);
  float terrace = smoothstep(0.85, 1.0, sin(q.y * 70.0)) * onPeak;
  col = mix(col, vec3(0.86, 0.86, 0.88), onPeak * 0.45);
  col += vec3(1.0, 0.88, 0.55) * terrace * 0.12 * (0.7 + 0.3 * sin(t * 0.6 + q.x * 4.0));

  // Clouds drifting along the bottom, shaded gold underneath.
  float cl = 0.0;
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    vec2 cp = vec2(q.x * (1.4 + fi * 0.8) + t * (0.02 + fi * 0.015), q.y * (3.0 + fi));
    float c = fbm(cp + fbm(cp * 1.5) * 0.6);
    float c2 = fbm(cp + vec2(0.0, -0.08) + fbm(cp * 1.5) * 0.6);
    float body = smoothstep(0.45, 0.7, c) * exp(-q.y * (3.0 - fi));
    col = mix(col, vec3(1.0, 0.99, 0.96), body * 0.8);
    col -= vec3(0.05, 0.06, 0.1) * clamp(c - c2, 0.0, 0.3) * body * 2.0;
    cl += body;
  }

  // Gold motes rising.
  vec2 g = vec2(p.x * 9.0, p.y * 9.0 - t * 0.3);
  vec2 id = floor(g);
  vec2 h = hash2(id + 2.0);
  vec2 c = fract(g) - 0.5 - (h - 0.5) * 0.6;
  c.x += sin(t * 0.8 + h.y * 6.2831) * 0.12;
  float mote = smoothstep(0.08, 0.0, length(c)) * step(0.7, hash(id + 6.0)) * (0.5 + 0.5 * sin(t * 2.0 + h.x * 30.0));
  col = mix(col, vec3(0.85, 0.62, 0.2), mote * 0.45);

  // A warm halo follows the pointer.
  col += vec3(0.1, 0.07, 0.0) * exp(-md * md * 10.0) * 0.5;

  // Clicks ring a golden halo with a few glints.
  for (int i = 0; i < 6; i++) {
    vec3 r = u_ripples[i];
    float age = t - r.z;
    if (age < 0.0 || age > 2.0) continue;
    vec2 d = p - r.xy / u_res.y;
    float dist = length(d);
    float radius = 0.03 + age * 0.15;
    float fade = exp(-age * 1.8);
    float ring = exp(-pow((dist - radius) * 110.0, 2.0));
    float glints = pow(0.5 + 0.5 * sin(atan(d.y, d.x) * 8.0 + age * 3.0), 8.0);
    col = mix(col, vec3(0.8, 0.58, 0.15), ring * (0.35 + 0.4 * glints) * fade);
  }

  col *= 1.0 - 0.12 * pow(length(uv - 0.5) * 1.2, 2.0);
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0 * 2.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const SHADERS: Partial<Record<ThemeId, ShaderSpec>> = {
  fire: { fragment: FIRE, ripples: true },
  'nine-hells': { fragment: NINE_HELLS, ripples: true },
  'icewind-dale': { fragment: ICEWIND_DALE, ripples: true },
  feywild: { fragment: FEYWILD, ripples: true },
  shadowfell: { fragment: SHADOWFELL, ripples: true },
  underdark: { fragment: UNDERDARK, ripples: true },
  'astral-sea': { fragment: ASTRAL_SEA, ripples: true },
  mechanus: { fragment: MECHANUS, ripples: true },
  barovia: { fragment: BAROVIA, ripples: true },
  'mount-celestia': { fragment: MOUNT_CELESTIA, ripples: true },
  tidewater: { fragment: TIDEWATER, ripples: true },
  prism: { fragment: PRISM },
};

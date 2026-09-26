// All GLSL. Flow indices match FLOW_RECIPES; blend indices match BLEND_MODES.
// Look-tuning (Task 16) only edits numeric constants in this file.

export const QUAD_VS = `#version 300 es
in vec2 a_pos;
uniform mat3 u_toClip;
out vec2 v_uv;
void main() {
  v_uv = a_pos;
  vec3 p = u_toClip * vec3(a_pos, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
}`

export const STAMP_VS = `#version 300 es
in vec2 a_pos;
in vec4 a_dab; // x, y (layer px), radius, alpha
uniform float u_size;
out vec2 v_local;
out float v_alpha;
void main() {
  float pad = a_dab.z + 1.0;
  v_local = a_pos * pad / a_dab.z;
  v_alpha = a_dab.w;
  vec2 p = a_dab.xy + a_pos * pad;
  gl_Position = vec4(p / u_size * 2.0 - 1.0, 0.0, 1.0);
}`

export const STAMP_FS = `#version 300 es
precision highp float;
in vec2 v_local;
in float v_alpha;
uniform vec3 u_color;
out vec4 o;
void main() {
  float a = (1.0 - smoothstep(0.7, 1.0, length(v_local))) * v_alpha;
  o = vec4(u_color * a, a);
}`

export const IMAGE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 o;
void main() { o = texture(u_tex, v_uv); }`

const NOISE = `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
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
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
vec2 curl(vec2 p) {
  const float e = 0.02;
  float dy = fbm(p + vec2(0.0, e)) - fbm(p - vec2(0.0, e));
  float dx = fbm(p + vec2(e, 0.0)) - fbm(p - vec2(e, 0.0));
  return vec2(dy, -dx) / (2.0 * e);
}`

// Constants must match lib/color/lab.ts
const LAB = `
const vec3 WHITE = vec3(0.95047, 1.0, 1.08883);
vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 labF(vec3 t) { return mix((24389.0 / 27.0 * t + 16.0) / 116.0, pow(t, vec3(1.0 / 3.0)), step(216.0 / 24389.0, t)); }
vec3 labFInv(vec3 t) { vec3 t3 = t * t * t; return mix((116.0 * t - 16.0) / (24389.0 / 27.0), t3, step(216.0 / 24389.0, t3)); }
vec3 rgb2lab(vec3 c) {
  vec3 xyz = mat3(0.4124564, 0.2126729, 0.0193339,
                  0.3575761, 0.7151522, 0.1191920,
                  0.1804375, 0.0721750, 0.9503041) * toLin(c) / WHITE;
  vec3 f = labF(xyz);
  return vec3(116.0 * f.y - 16.0, 500.0 * (f.x - f.y), 200.0 * (f.y - f.z));
}
vec3 lab2rgb(vec3 lab) {
  float fy = (lab.x + 16.0) / 116.0;
  vec3 xyz = labFInv(vec3(fy + lab.y / 500.0, fy, fy - lab.z / 200.0)) * WHITE;
  vec3 l = mat3(3.2404542, -0.9692660, 0.0556434,
                -1.5371385, 1.8760108, -0.2040259,
                -0.4985314, 0.0415560, 1.0572252) * xyz;
  return toSrgb(clamp(l, 0.0, 1.0));
}`

// Sample outside the conditional so mip selection has valid derivatives.
const LAYER_SAMPLING = `
uniform sampler2D u_layer;
uniform vec3 u_place; // x/S, y/S, scale
vec2 toLayer(vec2 puv) { return (puv - 0.5 - u_place.xy) / u_place.z + 0.5; }
bool inside(vec2 l) { return l.x >= 0.0 && l.y >= 0.0 && l.x <= 1.0 && l.y <= 1.0; }
vec4 layerAt(vec2 l) { vec4 c = texture(u_layer, l); return inside(l) ? c : vec4(0.0); }
float softA(vec2 l, float lod) { float a = textureLod(u_layer, l, lod).a; return inside(l) ? a : 0.0; }`

const FLOWS = `
vec4 smoke(vec2 l, float t, float k) {
  vec2 q = l * 3.0 + u_seed + vec2(0.0, -t * 0.08);
  vec2 d = curl(q) * 0.012 * k + u_dir * k * 0.02 * sin(t * 0.3);
  vec4 c = vec4(0.0);
  for (int i = 0; i < 4; i++) c += layerAt(l - d * (1.0 + float(i) * 0.6));
  return c * 0.25;
}
vec4 melt(vec2 l, float t, float k) {
  vec2 perp = vec2(-u_dir.y, u_dir.x);
  float n = fbm(vec2(dot(l, perp) * 14.0, 0.0) + u_seed);
  float drip = pow(n, 3.0) * k * 0.18 * (0.55 + 0.45 * sin(t * 0.5 + n * 6.2831));
  vec4 c = vec4(0.0);
  for (int i = 0; i < 6; i++) c += layerAt(l - u_dir * drip * float(i) / 5.0);
  return c / 6.0;
}
vec4 streaks(vec2 l, float t, float k) {
  vec2 perp = vec2(-u_dir.y, u_dir.x);
  float band = noise(vec2(dot(l, perp) * 180.0, t * 0.4) + u_seed);
  float len = k * 0.22 * (0.25 + 0.75 * band);
  vec4 c = vec4(0.0);
  for (int i = 0; i < 12; i++) c += layerAt(l - u_dir * len * float(i) / 11.0);
  return c / 12.0;
}
vec4 shimmer(vec2 l, float t, float k) {
  vec2 d = vec2(noise(l * 40.0 + u_seed + t * 1.5), noise(l * 40.0 + u_seed.yx - t * 1.5)) - 0.5;
  return layerAt(l + d * 0.012 * k);
}
// Forward travel toward u_origin: two zoom phases cross-fade so the loop never jumps.
vec4 rush(vec2 l, float t, float k) {
  vec2 o = toLayer(u_origin);
  vec2 d = l - o;
  float r = length(d) + 1e-4;
  vec2 radial = d / r;
  float phase = fract(t * 0.12);
  vec4 acc = vec4(0.0);
  for (int ph = 0; ph < 2; ph++) {
    float f = fract(phase + float(ph) * 0.5);
    float w = 1.0 - abs(2.0 * f - 1.0);
    float zoom = exp(f * (0.2 + 0.5 * k));
    vec2 base = o + d / zoom;
    float cell = noise(radial * 9.0 + vec2(log(r) * 7.0 - f * 5.0) + u_seed + float(ph) * 17.0);
    float smear = k * 0.07 * r * (0.25 + cell);
    vec4 c = vec4(0.0);
    for (int i = 0; i < 8; i++) c += layerAt(base - radial * smear * float(i) / 7.0);
    acc += w * c / 8.0;
  }
  return acc;
}
vec4 flowSample(vec2 l) {
  float t = u_time * u_flow.x;
  float k = u_flow.y;
  if (u_flowKind == 1) return smoke(l, t, k);
  if (u_flowKind == 2) return melt(l, t, k);
  if (u_flowKind == 3) return streaks(l, t, k);
  if (u_flowKind == 4) return shimmer(l, t, k);
  if (u_flowKind == 5) return rush(l, t, k);
  return layerAt(l);
}`

// W3C separable blend modes; backdrop b is opaque, s is straight color.
const BLEND = `
vec3 blendFn(vec3 b, vec3 s) {
  if (u_blend == 1) return b * s;
  if (u_blend == 2) return b + s - b * s;
  if (u_blend == 3) return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
  if (u_blend == 4) {
    vec3 d = mix(((16.0 * b - 12.0) * b + 4.0) * b, sqrt(b), step(0.25, b));
    return mix(b - (1.0 - 2.0 * s) * b * (1.0 - b), b + (2.0 * s - 1.0) * (d - b), step(0.5, s));
  }
  if (u_blend == 5) return min(b, s);
  if (u_blend == 6) return max(b, s);
  return s;
}`

export const LAYER_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_below;
uniform float u_time;
uniform float u_opacity;
uniform mat3 u_xform;
uniform int u_blend;
uniform int u_flowKind;
uniform vec2 u_flow; // speed, intensity
uniform vec2 u_dir;
uniform vec2 u_seed;
uniform vec2 u_origin; // painting uv
uniform float u_featherOn;
uniform float u_featherLod;
uniform float u_bleed;
uniform float u_match;
uniform vec3 u_srcMean;
uniform vec3 u_labScale;
uniform vec3 u_dstMean;
${NOISE}
${LAB}
${LAYER_SAMPLING}
${FLOWS}
${BLEND}
void main() {
  vec2 puv = (u_xform * vec3(v_uv, 1.0)).xy;
  vec2 l = toLayer(puv);
  if (u_bleed > 0.0) {
    float edge = 1.0 - smoothstep(0.55, 0.95, softA(l, max(u_featherLod, 3.0) + 1.0));
    vec2 w = vec2(noise(l * 55.0 + u_seed + u_time * 0.15), noise(l * 55.0 + u_seed.yx - u_time * 0.15)) - 0.5;
    l += w * edge * u_bleed * 0.035;
  }
  vec4 c = flowSample(l);
  if (u_featherOn > 0.5) c *= smoothstep(0.3, 0.9, softA(l, u_featherLod));
  if (u_match > 0.0 && c.a > 0.002) {
    vec3 rgb = min(c.rgb / c.a, vec3(1.0));
    vec3 moved = lab2rgb((rgb2lab(rgb) - u_srcMean) * u_labScale + u_dstMean);
    c.rgb = mix(rgb, moved, u_match) * c.a;
  }
  c *= u_opacity;
  vec3 b = texture(u_below, v_uv).rgb;
  vec3 s = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
  o = vec4(mix(b, blendFn(b, s), c.a), 1.0);
}`

export const PLACE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
${LAYER_SAMPLING}
void main() { o = layerAt(toLayer(v_uv)); }`

export const SCREEN_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform float u_grain;
uniform float u_time;
${NOISE}
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  float g = hash(floor(v_uv * 2048.0) + floor(u_time * 12.0) * vec2(7.0, 3.0)) - 0.5;
  o = vec4(clamp(c + g * u_grain * 0.16, 0.0, 1.0), 1.0);
}`

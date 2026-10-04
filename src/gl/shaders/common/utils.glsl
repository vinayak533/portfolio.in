#define PI 3.14159265359
#define TAU 6.28318530718

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

float remap01(float v, float a, float b) { return clamp((v - a) / (b - a), 0.0, 1.0); }
float easeOutExpo(float t) { return t >= 1.0 ? 1.0 : 1.0 - pow(2.0, -10.0 * t); }
float easeInOutCubic(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }
float easeOutCubic(float t) { return 1.0 - pow(1.0 - t, 3.0); }

mat3 rotAxis(vec3 axis, float a) {
  axis = normalize(axis);
  float s = sin(a), c = cos(a), oc = 1.0 - c;
  return mat3(
    oc * axis.x * axis.x + c,           oc * axis.x * axis.y + axis.z * s,  oc * axis.z * axis.x - axis.y * s,
    oc * axis.x * axis.y - axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z + axis.x * s,
    oc * axis.z * axis.x + axis.y * s,  oc * axis.y * axis.z - axis.x * s,  oc * axis.z * axis.z + c
  );
}

// Divergence-free flow from the curl of a trigonometric vector potential.
// Far cheaper than simplex curl noise and good enough for particle paths.
vec3 curlTrig(vec3 p) {
  vec3 s = sin(p), c = cos(p);
  vec3 a = vec3(-s.x * s.y - c.z * c.x, -s.y * s.z - c.x * c.y, -s.z * s.x - c.y * c.z);
  vec3 q = p.yzx * 1.73 + vec3(1.7, 9.2, 4.1);
  vec3 s2 = sin(q), c2 = cos(q);
  vec3 b = vec3(-s2.x * s2.y - c2.z * c2.x, -s2.y * s2.z - c2.x * c2.y, -s2.z * s2.x - c2.y * c2.z);
  return a + 0.5 * b.zxy;
}

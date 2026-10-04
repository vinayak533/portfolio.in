// Exhibit screens. Each project gets a live, generative visual of what the
// system does, instead of a screenshot. Hover adds a ripple from the cursor and
// an RGB split. Also used by the case-study overlay's live media canvas.
#include "../common/utils.glsl"

uniform float uTime;
uniform float uKind;    // 0 rag, 1 vision, 2 pipeline, 3 agents, 4 recsys
uniform float uHover;   // 0..1
uniform float uFocus;   // 0..1, how centred the exhibit is
uniform vec2 uMouse;    // uv
uniform float uAspect;  // width / height
uniform vec3 uAccent;
uniform vec3 uInk;
uniform float uOpacity;

varying vec2 vUv;

float box(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float line(float d, float w) { return smoothstep(w, 0.0, d); }
float glow(float d, float k) { return exp(-d * k); }

// ---------------------------------------------------------------- 0 RAG
// A 2D embedding space. A query point wanders; its nearest chunks light up and
// are wired to it, while a generated answer streams in on the left.
vec3 sceneRag(vec2 uv, float t) {
  vec2 p = vec2(uv.x * uAspect, uv.y);
  vec3 col = vec3(0.0);
  vec2 q = vec2((0.62 + 0.2 * sin(t * 0.31)) * uAspect, 0.5 + 0.28 * sin(t * 0.47 + 1.3));
  float cells = 16.0;
  vec2 g = p * cells;
  vec2 id = floor(g);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = id + vec2(float(i), float(j));
      vec2 o = hash22(c);
      vec2 dotP = (c + 0.2 + o * 0.6) / cells;
      float cluster = smoothstep(0.55, 0.2, length(dotP - vec2(0.7 * uAspect, 0.48)));
      if (hash21(c + 3.1) > 0.55 + cluster * 0.4) continue;
      float d = length(p - dotP);
      float dq = length(dotP - q);
      float hit = smoothstep(0.17, 0.05, dq);
      col += mix(uAccent * 0.9, uInk, hit) * line(d, 0.0055 + hit * 0.004) * (0.9 + hit * 1.8);
      col += uAccent * glow(d, 260.0) * 0.25;
      col += uAccent * glow(d, 120.0) * hit * 0.6;
      float l = seg(p, q, dotP);
      col += mix(uAccent, uInk, 0.4) * line(l, 0.0012) * hit * 0.9;
    }
  }
  col += uInk * line(abs(length(p - q) - 0.17), 0.0015) * 0.35;
  col += uInk * glow(length(p - q), 90.0) * 1.4;
  // Answer stream: rows of token blocks with citation markers.
  if (uv.x < 0.34) {
    float row = floor((uv.y - 0.1) * 14.0);
    float fy = fract((uv.y - 0.1) * 14.0);
    float rows = mod(t * 1.6, 12.0);
    if (row >= 0.0 && row < 10.0 && fy > 0.35 && fy < 0.65) {
      float w = 0.12 + hash11(row * 7.1) * 0.16;
      float reveal = clamp(rows - (9.0 - row), 0.0, 1.0);
      float on = step(uv.x, 0.05 + w * reveal);
      float gaps = step(0.12, fract(uv.x * 46.0 + hash11(row) * 3.0));
      col += mix(uAccent, uInk, 0.55) * 0.7 * on * gaps * step(0.05, uv.x);
      float cite = step(abs(uv.x - (0.06 + w * reveal)), 0.004) * step(0.5, hash11(row * 3.3));
      col += uAccent * cite * 2.2;
    }
  }
  return col;
}

// ---------------------------------------------------------------- 1 Vision
// A live feature map with a sliding kernel and a detection box that locks onto
// the hottest region.
vec3 sceneVision(vec2 uv, float t) {
  vec2 grid = vec2(26.0, 16.0);
  vec2 g = uv * grid;
  vec2 id = floor(g);
  vec2 f = fract(g);
  vec2 hot = vec2(0.64 + 0.14 * sin(t * 0.35), 0.52 + 0.16 * cos(t * 0.29));
  vec2 c = (id + 0.5) / grid;
  float v = 0.5 + 0.5 * sin(c.x * 9.0 + t * 0.6) * cos(c.y * 7.0 - t * 0.4);
  v = v * 0.45 + 0.55 * exp(-pow(length((c - hot) * vec2(1.4, 1.0)) * 5.5, 2.0));
  v += (hash21(id + floor(t * 3.0)) - 0.5) * 0.06;
  float cell = step(0.08, f.x) * step(0.08, f.y);
  vec3 ramp = mix(uAccent * 0.08, uAccent * 0.9, smoothstep(0.15, 0.6, v));
  ramp = mix(ramp, uInk * 1.2, smoothstep(0.72, 1.0, v));
  vec3 col = ramp * cell * 0.85;
  // Sliding 3x3 kernel.
  float k = floor(mod(t * 6.0, grid.x * grid.y));
  vec2 kc = vec2(mod(k, grid.x), floor(k / grid.x));
  vec2 kd = abs(id - kc);
  col += uInk * 0.45 * step(max(kd.x, kd.y), 1.0) * (1.0 - cell * 0.6);
  // Detection box with corner brackets.
  vec2 bs = vec2(0.13, 0.17);
  vec2 bp = uv - hot;
  float edge = abs(box(bp, bs));
  vec2 ab = abs(bp);
  float corner = step(bs.x - 0.04, ab.x) * step(bs.y - 0.05, ab.y);
  col += uInk * line(edge, 0.0025) * (0.35 + corner * 1.6);
  // Label tab.
  vec2 lp = uv - (hot + vec2(-bs.x + 0.06, bs.y + 0.03));
  col += uAccent * 1.4 * step(box(lp, vec2(0.06, 0.02)), 0.0);
  col += uInk * 0.7 * step(box(lp - vec2(-0.02, 0.0), vec2(0.025, 0.004)), 0.0);
  return col;
}

// ---------------------------------------------------------------- 2 Pipeline
// A DAG of stages; data packets flow along the edges, stages pulse as they fire.
vec2 stageNode(float col, float row) {
  float n = col == 1.0 || col == 2.0 ? 3.0 : 2.0;
  float y = (row + 0.5) / n;
  return vec2(0.12 + col * 0.255, 0.18 + y * 0.64 + (hash11(col * 3.0 + row) - 0.5) * 0.06);
}
vec3 scenePipeline(vec2 uv, float t) {
  vec3 col = vec3(0.0);
  vec2 p = vec2(uv.x * uAspect, uv.y);
  for (int ci = 0; ci < 3; ci++) {
    float cA = float(ci);
    float nA = cA == 1.0 || cA == 2.0 ? 3.0 : 2.0;
    float nB = cA + 1.0 == 1.0 || cA + 1.0 == 2.0 ? 3.0 : 2.0;
    for (int ra = 0; ra < 3; ra++) {
      if (float(ra) >= nA) break;
      for (int rb = 0; rb < 3; rb++) {
        if (float(rb) >= nB) break;
        if (hash21(vec2(cA * 7.0 + float(ra), float(rb))) > 0.62) continue;
        vec2 a = stageNode(cA, float(ra));
        vec2 b = stageNode(cA + 1.0, float(rb));
        if (uv.x < a.x - 0.01 || uv.x > b.x + 0.01) continue;
        float k = smoothstep(a.x, b.x, uv.x);
        float y = mix(a.y, b.y, k);
        float d = abs(uv.y - y) * (1.0 - 0.5 * abs(b.y - a.y));
        col += uAccent * 0.6 * line(d, 0.0022);
        float sp = fract(t * 0.32 + hash21(a + b) * 7.0);
        float px = mix(a.x, b.x, sp);
        vec2 pk = vec2(px, mix(a.y, b.y, smoothstep(a.x, b.x, px)));
        float pd = length((uv - pk) * vec2(uAspect, 1.0));
        col += uInk * glow(pd, 160.0) * 1.8;
      }
    }
  }
  for (int ci = 0; ci < 4; ci++) {
    float c = float(ci);
    float n = c == 1.0 || c == 2.0 ? 3.0 : 2.0;
    for (int r = 0; r < 3; r++) {
      if (float(r) >= n) break;
      vec2 s = stageNode(c, float(r));
      vec2 d = vec2((uv.x - s.x) * uAspect, uv.y - s.y);
      float b = box(d, vec2(0.075, 0.035)) - 0.008;
      float fire = pow(max(sin(t * 1.1 - c * 1.3 + float(r)), 0.0), 8.0);
      col += uAccent * 0.18 * step(b, 0.0);
      col += mix(uAccent, uInk, fire) * line(abs(b), 0.0025) * (0.8 + fire * 1.4);
      col += uInk * 0.5 * step(box(d - vec2(-0.03, 0.0), vec2(0.03, 0.004)), 0.0);
    }
  }
  return col;
}

// ---------------------------------------------------------------- 3 Agents
// A planner core with tools on orbits; calls arc out and return, with a trace
// timeline along the bottom.
vec3 sceneAgents(vec2 uv, float t) {
  vec2 c = vec2(0.5 * uAspect, 0.56);
  vec2 p = vec2(uv.x * uAspect, uv.y);
  vec2 d = p - c;
  float r = length(d);
  vec3 col = vec3(0.0);
  col += uInk * glow(r, 22.0) * 0.9 + uAccent * glow(r, 7.0) * 0.4;
  col += uInk * line(abs(r - 0.06), 0.002) * 0.9;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float rr = 0.15 + fi * 0.095;
    col += uAccent * line(abs(r - rr), 0.0012) * 0.5;
    for (int j = 0; j < 3; j++) {
      float fj = float(j);
      float a = t * (0.35 - fi * 0.08) + fj * 2.094 + fi * 1.1;
      vec2 tp = c + vec2(cos(a), sin(a) * 0.82) * rr;
      float td = length(p - tp);
      float call = step(0.82, fract(t * 0.23 + fi * 0.37 + fj * 0.21));
      col += mix(uAccent, uInk, call) * line(abs(td - 0.018), 0.002) * 1.2;
      col += uInk * glow(td, 140.0) * (0.4 + call * 1.6);
      col += mix(uAccent, uInk, 0.6) * line(seg(p, c, tp), 0.0016) * call * 1.4;
    }
  }
  // Trace timeline.
  if (uv.y < 0.14 && uv.y > 0.06) {
    float lane = floor((uv.y - 0.06) / 0.027);
    float x = uv.x * 18.0 - t * 0.9 + lane * 3.1;
    float span = step(0.35, fract(x * 0.5 + hash11(floor(x * 0.5) + lane)));
    col += mix(uAccent, uInk, step(0.86, hash11(floor(x) + lane))) * span * 0.55 * step(0.25, fract((uv.y - 0.06) / 0.027));
  }
  return col;
}

// ---------------------------------------------------------------- 4 RecSys
// A user x item affinity matrix from evolving latent vectors. One user row is
// active; its top items flare and are pulled into a ranked strip on the right.
vec3 sceneRecsys(vec2 uv, float t) {
  vec3 col = vec3(0.0);
  vec2 area = vec2(0.72, 0.8);
  vec2 o = vec2(0.06, 0.1);
  vec2 m = (uv - o) / area;
  vec2 grid = vec2(30.0, 16.0);
  float activeRow = floor(mod(t * 0.5, grid.y));
  if (m.x > 0.0 && m.x < 1.0 && m.y > 0.0 && m.y < 1.0) {
    vec2 id = floor(m * grid);
    vec2 f = fract(m * grid);
    vec3 u = vec3(sin(id.y * 1.7 + t * 0.2), cos(id.y * 0.9 - t * 0.15), sin(id.y * 2.3));
    vec3 v = vec3(cos(id.x * 0.8 - t * 0.1), sin(id.x * 1.3 + t * 0.25), cos(id.x * 2.1));
    float s = 1.0 / (1.0 + exp(-dot(u, v) * 2.2));
    float isRow = step(abs(id.y - activeRow), 0.0);
    float cell = step(0.1, f.x) * step(0.12, f.y);
    vec3 c = mix(uAccent * 0.06, uAccent * 0.8, s * s);
    c = mix(c, uInk * (0.6 + s * 1.4), isRow * smoothstep(0.62, 0.9, s));
    col += c * cell * (0.55 + isRow * 0.6);
    col += uInk * 0.08 * isRow;
  }
  // Ranked strip.
  if (uv.x > 0.82 && uv.x < 0.95 && uv.y > 0.1 && uv.y < 0.9) {
    float slot = floor((uv.y - 0.1) / 0.08);
    float fy = fract((uv.y - 0.1) / 0.08);
    float w = 1.0 - slot * 0.09;
    float bar = step(0.2, fy) * step(fy, 0.8) * step((uv.x - 0.82) / 0.13, w);
    col += mix(uAccent, uInk, step(slot, 2.0)) * bar * (0.5 + 0.5 * step(slot, 2.0));
  }
  // Crosshair on the active row.
  float rowY = o.y + (activeRow + 0.5) / grid.y * area.y;
  col += uInk * line(abs(uv.y - rowY), 0.001) * 0.35 * step(uv.x, 0.8);
  return col;
}

vec3 scene(vec2 uv, float t) {
  if (uKind < 0.5) return sceneRag(uv, t);
  if (uKind < 1.5) return sceneVision(uv, t);
  if (uKind < 2.5) return scenePipeline(uv, t);
  if (uKind < 3.5) return sceneAgents(uv, t);
  return sceneRecsys(uv, t);
}

void main() {
  vec2 uv = vUv;
  float t = uTime;

  // Hover ripple from the cursor.
  vec2 dm = (uv - uMouse) * vec2(uAspect, 1.0);
  float dl = length(dm);
  uv += (dm / (dl + 1e-4)) / vec2(uAspect, 1.0) * sin(dl * 46.0 - t * 7.0) * 0.0045 * uHover * exp(-dl * 3.5);

  vec3 col;
  if (uHover > 0.01) {
    vec2 sh = vec2(0.006 * uHover, 0.0);
    col = vec3(scene(uv + sh, t).r, scene(uv, t).g, scene(uv - sh, t).b);
  } else {
    col = scene(uv, t);
  }

  // Screen treatment: faint grid, scanlines, inner vignette, base glass tint.
  vec2 gp = fract(vUv * vec2(uAspect, 1.0) * 12.0);
  float grid = (line(gp.x, 0.02) + line(gp.y, 0.02)) * 0.025;
  col += uAccent * grid;
  col *= 0.88 + 0.12 * sin(vUv.y * 900.0);
  vec2 vv = vUv - 0.5;
  col *= smoothstep(0.85, 0.25, length(vv * vec2(1.0, 1.3)));
  col += uAccent * 0.025;
  col *= mix(0.35, 1.0, uFocus) * (1.0 + uHover * 0.25);

  gl_FragColor = vec4(col * uOpacity, 1.0);
}

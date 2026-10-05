// Film finish: rays + bloom, edge-only chromatic aberration, soft vignette,
// a highlight shoulder that rolls off instead of clipping, sRGB encode,
// animated grain, fade from black. The laptop screen is composited here, at
// full device resolution and in true perspective, so it is sharp at any zoom.
// During the scroll transition it also blends the half-res push lens, tightens
// the vignette and lays the cloud bank over everything; once the bank has
// closed the photo is gone and alpha follows the clouds alone, so About shows
// through as they part. Output is premultiplied alpha.
#include "./common.glsl"

uniform sampler2D uScene;
uniform sampler2D uRays;
uniform sampler2D uBloom;
uniform sampler2D uLensTex;
uniform vec2 uRes;
uniform vec3 uRayColor;    // moon tint * intensity * strength
uniform float uBloomStrength;
uniform float uVignette;
uniform float uVigTight;   // 0..1 pulls the vignette in toward the centre
uniform float uGrain;
uniform float uAberration;
uniform float uCaSpread;   // 0 edges only .. 1 the whole frame
uniform float uKnee;
uniform float uStreak;     // anamorphic streak from the bloom
uniform float uToe;        // lift of the deepest blacks (linear)
uniform float uFade;
uniform float uSeed;
uniform float uRaw;        // debug views skip the post stack
uniform vec2 uSceneTexel;  // 1 / scene target size
uniform float uSharpen;    // contrast-adaptive sharpening of the scene (0 = off)
uniform float uClarity;    // local contrast on the midtones (0 = off)

uniform float uLensOn;
uniform vec4 uLens;        // anchor uv (y up), motion fraction, dof (viewport heights)
uniform float uLensFocus;  // sharp radius, viewport heights

uniform float uCloudOn;
uniform sampler2D uClouds; // linear, premultiplied (light, coverage), half res
uniform float uSceneVis;   // 1 while the photo is behind the clouds, 0 once the bank has closed
uniform float uScreenOn;
uniform sampler2D uScreenTex; // the screen art, sRGB, mipmapped
uniform mat3 uScreenH;     // device px (y up) -> screen uv (0,0 top-left), a homography
uniform vec2 uScreenDesign; // design px of the art
uniform float uScreenRad;  // corner radius, design px
uniform float uBezel;      // black bezel width around the panel, design px
uniform float uScreenBright;
uniform float uScreenGlare;
uniform vec4 uCaret;       // uv rect
uniform float uCaretOn;    // 0 / 1 blink
uniform float uVideoOn;    // K. the screen shows the video instead of the art
uniform sampler2D uVideoTex; // display-encoded frames, mipmapped (shown as they are)
uniform vec2 uVideoCover;  // cover fit: screen uv -> video uv scale about the centre
uniform float uVideoBright; // emission relative to the file

varying vec2 vUv;

vec3 shoulder(vec3 c, float knee) {
  float m = max(max(c.r, c.g), c.b);
  if (m <= knee) return c;
  float t = (m - knee) / (1.0 - knee);
  float mm = knee + (1.0 - knee) * (1.0 - exp(-t));
  vec3 o = c * (mm / m);
  return mix(o, vec3(mm), smoothstep(0.9, 1.0, mm) * 0.35); // the hottest light desaturates like film
}

vec3 toSRGB(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// Contrast-adaptive sharpening (after AMD FidelityFX CAS): sharpens low-contrast
// detail most and leaves edges and highlights alone, so no halos or ringing.
// Returns the detail to add to the centre sample.
vec3 casDetail(vec2 uv) {
  vec3 c = texture(uScene, uv).rgb;
  vec3 a = texture(uScene, uv - vec2(0.0, uSceneTexel.y)).rgb;
  vec3 b = texture(uScene, uv - vec2(uSceneTexel.x, 0.0)).rgb;
  vec3 d = texture(uScene, uv + vec2(uSceneTexel.x, 0.0)).rgb;
  vec3 e = texture(uScene, uv + vec2(0.0, uSceneTexel.y)).rgb;
  vec3 mn = min(c, min(min(a, b), min(d, e)));
  vec3 mx = max(c, max(max(a, b), max(d, e)));
  vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
  vec3 w = amp * (-1.0 / mix(8.0, 5.0, clamp(uSharpen, 0.0, 1.0)));
  return (c + (a + b + d + e) * w) / (1.0 + 4.0 * w) - c;
}

void main() {
  vec2 uv = vUv;
  if (uRaw > 0.5) {
    gl_FragColor = vec4(toSRGB(texture(uScene, uv).rgb), 1.0);
    return;
  }
  float aspect = uRes.x / uRes.y;
  vec2 dc = uv - 0.5;
  float rad = length(dc * vec2(aspect, 1.0)) / length(vec2(aspect, 1.0) * 0.5); // 0 centre .. 1 corner

  vec2 ca = dc * uAberration * mix(smoothstep(0.45, 1.0, rad), 1.0, uCaSpread);
  vec3 col = vec3(texture(uScene, uv - ca).r, texture(uScene, uv).g, texture(uScene, uv + ca).b);
  if (uSharpen > 0.0) col = max(col + casDetail(uv), 0.0);
  // Clarity: a wide, gentle unsharp mask on luminance (a hex ring ~6 texels out),
  // midtones only, ratio-limited: depth in the cloud relief, no halos on the moon or stars.
  if (uClarity > 0.0) {
    vec3 m = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0471976 + 0.5;
      m += texture(uScene, uv + vec2(cos(a), sin(a)) * uSceneTexel * 6.0).rgb;
    }
    float lc = luma(col);
    float lm = luma(m / 6.0);
    float mid = smoothstep(0.004, 0.03, lc) * (1.0 - smoothstep(0.3, 0.8, lc));
    col *= 1.0 + uClarity * mid * clamp((lc - lm) / max(lm, 1e-3), -0.4, 0.4);
  }

  // Dive lens: only where the streak or the defocus is wider than a few pixels.
  if (uLensOn > 0.5) {
    float r = length((uv - uLens.xy) * vec2(aspect, 1.0));
    float blurPx = max(uLens.z * r, uLens.w * smoothstep(uLensFocus, uLensFocus + 0.45, r)) * uRes.y;
    col = mix(col, texture(uLensTex, uv).rgb, smoothstep(1.5, 5.0, blurPx));
  }

  col += texture(uRays, uv).r * uRayColor;
  col += texture(uBloom, uv).rgb * uBloomStrength;
  // Anamorphic glass: the brightest light smears a faint, cool horizontal line.
  if (uStreak > 0.0) {
    vec3 st = vec3(0.0);
    for (int i = 1; i <= 8; i++) {
      float o = float(i) * 0.016;
      float w = exp(-float(i) * 0.38);
      st += (texture(uBloom, uv + vec2(o, 0.0)).rgb + texture(uBloom, uv - vec2(o, 0.0)).rgb) * w;
    }
    col += st * uStreak * vec3(0.8, 0.9, 1.0);
  }

  float vig = mix(1.0, 1.0 - uVignette, pow(smoothstep(mix(0.3, 0.05, uVigTight), mix(1.05, 0.8, uVigTight), rad), 1.3));
  col *= vig;
  // A gentle toe: the deepest blacks keep a breath of information instead of crushing.
  col = max(col, 0.0) + uToe * exp(-max(col, 0.0) * 80.0);
  col = toSRGB(shoulder(col, uKnee));

  // The laptop screen: a homography from this pixel to the art, so it stays in
  // perspective and as sharp as the art allows at any zoom.
  if (uScreenOn > 0.5) {
    vec3 hs = uScreenH * vec3(gl_FragCoord.xy, 1.0);
    // Far from the quad the projection runs off to infinity (and flips sign
    // across its horizon): clamp it finite and gate it to the screen's surroundings.
    vec2 su = clamp(hs.xy / max(hs.z, 1e-6), -4.0, 5.0);
    vec2 sdx = dFdx(su);
    vec2 sdy = dFdy(su);
    float sd = frameDist(su - 0.5, uScreenDesign, uScreenRad);
    float saa = max(fwidth(sd), 1e-4);
    float near = step(0.0, hs.z) * step(max(abs(su.x - 0.5), abs(su.y - 0.5)), 1.0);
    float inside = near * (1.0 - smoothstep(-saa, saa, sd));
    // The black bezel of a real display, so the photo's blown-out screen never fringes the panel.
    float bezel = near * (1.0 - inside) * (1.0 - smoothstep(uBezel - saa, uBezel + saa * 2.0, sd));
    col = mix(col, vec3(0.012, 0.012, 0.02) * vig, bezel * 0.94);
    if (inside > 0.0) {
      vec3 sc;
      if (uVideoOn > 0.5) {
        // Cover fit, centred: no stretch, the overflow is cropped by the panel mask.
        vec2 vu = (su - 0.5) * uVideoCover + 0.5;
        sc = textureGrad(uVideoTex, vu, sdx * uVideoCover, sdy * uVideoCover).rgb;
      } else {
        sc = toSRGB(textureGrad(uScreenTex, su, sdx, sdy).rgb);
        vec2 cq = (su - uCaret.xy) / uCaret.zw;
        sc = mix(sc, vec3(0.86, 0.82, 1.0), uCaretOn * step(0.0, cq.x) * step(cq.x, 1.0) * step(0.0, cq.y) * step(cq.y, 1.0));
      }
      // Glass: a soft diagonal sheen and the faint falloff of a real panel.
      float sheen = 1.0 - smoothstep(0.0, 0.32, abs(su.x * 0.7 + su.y - 0.62));
      sc += vec3(0.88, 0.9, 1.0) * sheen * uScreenGlare;
      sc *= 1.0 - 0.2 * dot(su - 0.5, su - 0.5);
      col = mix(col, sc * (uVideoOn > 0.5 ? uVideoBright : uScreenBright) * mix(1.0, vig, 0.6), inside);
    }
  }

  // The atmosphere, over everything. Toned like the scene, a little vignetted.
  // Premultiplied from here on: once the camera is inside the bank the photo is
  // gone for good (uSceneVis), whether or not any cloud is left in front.
  float alpha = uSceneVis;
  col *= uSceneVis;
  if (uCloudOn > 0.5) {
    vec4 cl = texture(uClouds, uv);
    vec3 cc = cl.a > 1e-4 ? toSRGB(shoulder(cl.rgb / cl.a, uKnee)) * mix(1.0, vig, 0.5) : vec3(0.0);
    col = col * (1.0 - cl.a) + cc * cl.a;
    alpha = cl.a + uSceneVis * (1.0 - cl.a);
  }

  // Triangular grain, stronger in the shadows, refreshed at 24 fps for a film cadence.
  vec2 fc = gl_FragCoord.xy + uSeed * vec2(113.7, 71.3);
  float n = hash12(fc) + hash12(fc + 19.19) - 1.0;
  col += n * uGrain * (1.0 - 0.6 * luma(col)) * alpha;
  col = clamp(col, 0.0, alpha) * uFade;
  gl_FragColor = vec4(col, alpha * uFade + (1.0 - uFade) * uSceneVis);
}

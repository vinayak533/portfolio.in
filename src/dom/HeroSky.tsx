import { useEffect, useRef } from 'react'
import { onTick } from '../core/clock'
import { signals } from '../store/useStore'

const SRC = '/hero/night-1672.webp'
/** Moon centre in image UV (y down), measured on the 1672x941 photo. */
const MOON = [0.7, 0.162]
const LEAVES = 16

const quadVert = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`

/**
 * Redraws the photo with the sky in motion. A two-phase flow map drifts the
 * clouds left to right without smearing; a soft mask keeps the island, the
 * figure and the moon still. Stars twinkle only where the photo is dark, and
 * the moon's halo breathes.
 */
const skyFrag = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uImg;
uniform vec2 uRes;
uniform float uTime;
uniform float uImgAspect;
uniform vec2 uMoon;
in vec2 vUv;
out vec4 o;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
float ell(vec2 p, vec2 c, vec2 r) { vec2 d = (p - c) / r; return dot(d, d); }

void main() {
  // object-fit: cover, object-position: 50% 42% (matches the <img> underneath).
  float va = uRes.x / uRes.y;
  vec2 s = va > uImgAspect ? vec2(1.0, uImgAspect / va) : vec2(va / uImgAspect, 1.0);
  vec2 uv = vec2(0.5, 0.42) * (1.0 - s) + vec2(vUv.x, 1.0 - vUv.y) * s;

  // Still regions: island top, rock body, the small floating rock, the moon disc.
  float isl = min(ell(uv, vec2(0.5, 0.49), vec2(0.31, 0.15)), ell(uv, vec2(0.47, 0.72), vec2(0.22, 0.25)));
  isl = min(isl, ell(uv, vec2(0.755, 0.715), vec2(0.04, 0.055)));
  vec2 md = (uv - uMoon) * vec2(uImgAspect, 1.0);
  float m = smoothstep(1.0, 1.8, isl) * smoothstep(0.06, 0.12, length(md));

  // Far sky drifts slowest, the cloud sea near the lens fastest (image UV per second).
  float speed = mix(0.0016, 0.0042, smoothstep(0.15, 0.95, uv.y));
  vec2 dir = vec2(1.0, -0.06) + (vec2(fbm(uv * 3.0 + uTime * 0.015), fbm(uv * 3.0 + 7.3 - uTime * 0.015)) - 0.5) * 0.8;
  vec2 flow = dir * speed * m;

  const float CYCLE = 7.0;
  float ph = uTime / CYCLE + fbm(uv * 1.7) * 0.7;
  float p0 = fract(ph), p1 = fract(ph + 0.5);
  vec3 a = texture(uImg, uv - flow * p0 * CYCLE).rgb;
  vec3 b = texture(uImg, uv - flow * p1 * CYCLE).rgb;
  vec3 col = mix(a, b, abs(p0 - 0.5) * 2.0);

  // Moon halo, slowly breathing.
  float r = length(md);
  col += vec3(0.82, 0.86, 1.0) * exp(-r * 7.0) * (0.05 + 0.03 * sin(uTime * 0.5));

  // Twinkling stars in the dark upper sky.
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec2 g = uv * vec2(uImgAspect, 1.0) * 85.0;
  vec2 cell = floor(g);
  float h = hash(cell);
  if (h > 0.955) {
    vec2 sp = vec2(hash(cell + 3.1), hash(cell + 7.7));
    float d = length(fract(g) - sp);
    float tw = 0.45 + 0.55 * sin(uTime * (1.2 + 2.5 * hash(cell + 1.3)) + h * 40.0);
    float star = smoothstep(0.09, 0.0, d) * tw * (1.0 - smoothstep(0.06, 0.16, lum)) * (1.0 - smoothstep(0.22, 0.38, uv.y));
    col += vec3(0.85, 0.9, 1.0) * star * 0.9;
  }

  o = vec4(col, 1.0);
}`

/** Wind-borne leaves: point sprites blowing left to right, nearer ones bigger and softer. */
const leafVert = /* glsl */ `#version 300 es
in vec4 aSeed;
uniform float uTime;
uniform vec2 uRes;
uniform float uDpr;
out float vDepth;
out float vAngle;
out float vFade;
void main() {
  float depth = aSeed.z;
  float speed = mix(0.025, 0.09, depth);
  float x = fract(aSeed.x + uTime * speed) * 1.3 - 0.15;
  float y = aSeed.y + sin(uTime * (0.6 + aSeed.w) + aSeed.w * 20.0) * 0.04 - x * 0.12;
  vDepth = depth;
  vAngle = uTime * (1.5 + aSeed.w * 3.0) + aSeed.w * 10.0;
  vFade = smoothstep(-0.15, 0.05, x) * (1.0 - smoothstep(0.95, 1.15, x));
  gl_Position = vec4(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  gl_PointSize = mix(5.0, 26.0, depth * depth) * uDpr * (uRes.y / (900.0 * uDpr) * 0.6 + 0.4);
}`

const leafFrag = /* glsl */ `#version 300 es
precision mediump float;
in float vDepth;
in float vAngle;
in float vFade;
out vec4 o;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float c = cos(vAngle), s = sin(vAngle);
  p = mat2(c, -s, s, c) * p;
  // Squash on one axis as it tumbles, so it reads as a flat leaf turning.
  p.y /= max(0.25, abs(sin(vAngle * 0.7)));
  float d = length(vec2(p.x * 1.0, p.y * 2.4));
  float soft = mix(0.08, 0.5, vDepth * vDepth);
  float a = smoothstep(0.9, 0.9 - soft, d) * vFade * mix(0.55, 0.8, vDepth);
  vec3 col = mix(vec3(0.32, 0.4, 0.12), vec3(0.62, 0.68, 0.24), 0.5 + 0.5 * p.x);
  o = vec4(col * a, a);
}`

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const prog = gl.createProgram()!
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const sh = gl.createShader(type)!
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader')
    gl.attachShader(prog, sh)
  }
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link')
  return prog
}

/**
 * Living sky for the hero photograph. Sits exactly over the <img> (same cover
 * crop) and fades in once its texture is ready; if WebGL fails the still photo
 * simply stays. Renders only while the hero is on screen.
 */
export function HeroSky({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: true, powerPreference: 'low-power' })
    if (!gl) return

    let sky: WebGLProgram, leaf: WebGLProgram
    try {
      sky = compile(gl, quadVert, skyFrag)
      leaf = compile(gl, leafVert, leafFrag)
    } catch (e) {
      console.warn('[hero sky]', e)
      return
    }

    const quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const skyVao = gl.createVertexArray()
    gl.bindVertexArray(skyVao)
    const aPos = gl.getAttribLocation(sky, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const seeds = new Float32Array(LEAVES * 4)
    for (let i = 0; i < LEAVES; i++) seeds.set([Math.random(), 0.12 + Math.random() * 0.8, Math.random(), Math.random()], i * 4)
    const leafVao = gl.createVertexArray()
    gl.bindVertexArray(leafVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW)
    const aSeed = gl.getAttribLocation(leaf, 'aSeed')
    gl.enableVertexAttribArray(aSeed)
    gl.vertexAttribPointer(aSeed, 4, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    const u = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n)
    const su = { img: u(sky, 'uImg'), res: u(sky, 'uRes'), time: u(sky, 'uTime'), aspect: u(sky, 'uImgAspect'), moon: u(sky, 'uMoon') }
    const lu = { time: u(leaf, 'uTime'), res: u(leaf, 'uRes'), dpr: u(leaf, 'uDpr') }

    let ready = false
    let imgAspect = 1672 / 941
    const tex = gl.createTexture()
    const img = new Image()
    img.src = SRC
    img
      .decode()
      .then(() => {
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        imgAspect = img.naturalWidth / img.naturalHeight
        ready = true
      })
      .catch(() => {})

    let dpr = 1
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let shown = false
    const stop = onTick((time) => {
      // Off screen (scrolled past, covered by the case study, hidden tab): skip the frame.
      if (!ready || signals.paused || document.hidden || signals.progress.hero >= 0.999) return
      gl.viewport(0, 0, canvas.width, canvas.height)

      gl.disable(gl.BLEND)
      gl.useProgram(sky)
      gl.bindVertexArray(skyVao)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.uniform1i(su.img, 0)
      gl.uniform2f(su.res, canvas.width, canvas.height)
      gl.uniform1f(su.time, time)
      gl.uniform1f(su.aspect, imgAspect)
      gl.uniform2f(su.moon, MOON[0], MOON[1])
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.useProgram(leaf)
      gl.bindVertexArray(leafVao)
      gl.uniform1f(lu.time, time)
      gl.uniform2f(lu.res, canvas.width, canvas.height)
      gl.uniform1f(lu.dpr, dpr)
      gl.drawArrays(gl.POINTS, 0, LEAVES)

      if (!shown) {
        shown = true
        canvas.style.opacity = '1'
      }
    })

    return () => {
      stop()
      ro.disconnect()
      // Free resources but keep the context: a canvas only ever gets one, and a remount reuses it.
      gl.deleteTexture(tex)
      gl.deleteProgram(sky)
      gl.deleteProgram(leaf)
    }
  }, [])

  return <canvas ref={ref} aria-hidden="true" className={`opacity-0 transition-opacity duration-700 ${className}`} />
}

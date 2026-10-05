import GUI from 'lil-gui'
import moonRefUrl from '../assets/moon/reference.png'
import { heroConfig as cfg } from './config'
import { heroDebug, heroDebugApi } from './engine'
import { activeTransition, transitionDebug } from './transition'

/**
 * Live tuning panel, loaded only with ?debug. Edits heroConfig in place; the
 * engine reads it every frame. "Copy config" puts the current values on the
 * clipboard as JSON to paste back into config.ts.
 */
export function attachDebug(onResize: () => void): () => void {
  const gui = new GUI({ title: 'Hero' })
  gui.domElement.style.zIndex = '400'
  // Console access while tuning (?debug only): __hero.cfg.moon.phase = 40, etc.
  ;(window as unknown as { __hero: unknown }).__hero = { cfg, debug: heroDebug }

  // The handful worth reaching for first; every one is repeated in its own folder below.
  const L = cfg.sky.layers
  const ess = gui.addFolder('Essentials')
  ess.add(L.far, 'advect', 0, 10, 0.1).name('far drift px/s')
  ess.add(L.mid, 'advect', 0, 15, 0.1).name('mid drift px/s')
  ess.add(L.near, 'advect', 0, 25, 0.1).name('near drift px/s')
  ess.add(L.near, 'billow', 0, 0.05, 0.001).name('billow (near)')
  ess.add(cfg.sky.rim, 'amount', 0, 2, 0.01).name('cloud rim light')
  ess.add(cfg.moon, 'response', 0, 1, 0.01).name('moon response')
  ess.add(cfg.rays, 'strength', 0, 1, 0.01).name('god-ray strength')
  ess.add(cfg.stars, 'twinkle', 0, 3, 0.05).name('star twinkle')
  ess.add(cfg.film, 'grain', 0, 0.2, 0.002)
  ess.add(cfg.film, 'bloom', 0, 1.5, 0.01)

  const info = gui.addFolder('Info')
  info.add(heroDebug, 'fps').listen().disable()
  info.add(heroDebug, 'frameMs').name('frame ms (avg)').listen().disable()
  info.add(heroDebug, 'quality').name('auto quality').listen().disable()
  info.add(heroDebug, 'scene').name('scene px').listen().disable()
  info.add(heroDebug, 'photo').name('photo tier').listen().disable()
  info.add(heroDebug, 'moonMaps').name('moon maps').disable()
  info.add(heroDebug, 'maps').listen().disable()
  info.add(heroDebug, 'moonCover').name('cloud on moon').listen().disable()
  info.add(heroDebug, 'moonLight').name('moon light').listen().disable()
  info
    .add(heroDebug, 'view', { final: 0, 'sky mask': 1, depth: 2, 'grass mask': 3, 'protect mask': 4, 'wisps / sea shadow': 5, 'moon light': 6, 'moon matte': 7 })
    .name('view')
  info
    .add(
      {
        copy: () => {
          const json = JSON.stringify(cfg, null, 2)
          navigator.clipboard?.writeText(json).catch(() => {})
          console.log(json)
        },
      },
      'copy',
    )
    .name('Copy config')

  const sky = gui.addFolder('A. Sky drift')
  for (const name of ['far', 'mid', 'near'] as const) {
    const l = sky.addFolder(`${name} layer`)
    l.add(L[name], 'advect', 0, 25, 0.1).name('clouds travel px/s')
    l.add(L[name], 'drift', 0, 60, 0.5).name('warp field px/s')
    l.add(L[name], 'scale', 0.3, 6, 0.05)
    l.add(L[name], 'displace', 0, 40, 0.5).name('roll px')
    l.add(L[name], 'billow', 0, 0.05, 0.001)
    l.close()
  }
  sky.add(cfg.sky.split, '0', 0, 0.5, 0.005).name('far / mid depth')
  sky.add(cfg.sky.split, '1', 0, 0.8, 0.005).name('mid / near depth')
  sky.add(cfg.sky, 'blend', 0.001, 0.2, 0.001).name('split softness')
  sky.add(cfg.sky, 'warp', 0, 4, 0.05)
  sky.add(cfg.sky, 'advectCycle', 2, 20, 0.5)
  sky.add(cfg.sky, 'grade', 0, 1, 0.01).name('night grade')
  sky.add(cfg.sky.rim, 'amount', 0, 2, 0.01).name('rim light')
  sky.add(cfg.sky.rim, 'reach', 0.5, 20, 0.1).name('rim reach (moon radii)')
  sky.add(cfg.sky.rim, 'under', 0, 2, 0.01).name('warm under-light')
  sky.addColor(cfg.sky.rim, 'underColor').name('under-light colour')
  sky.add(cfg.sky.rim, 'shimmer', 0, 1, 0.01).name('light shimmer')
  sky.add(cfg.sky, 'detail', 0, 0.15, 0.001).name('micro-detail')
  sky.add(cfg.sea, 'coverage', 0.2, 0.8, 0.005).name('sea shadow coverage')
  sky.add(cfg.sea, 'softness', 0.01, 0.4, 0.005).name('sea shadow softness')
  sky.add(cfg.sea, 'shadow', 0, 0.6, 0.01).name('sea shadow')

  const wisps = gui.addFolder('Wisps')
  for (const [name, l] of [['near', cfg.wisps.near], ['mid', cfg.wisps.mid]] as const) {
    wisps.add(l, 'speed', 0, 40, 0.5).name(`${name} speed px/s`)
    wisps.add(l, 'scale', 0.3, 6, 0.05).name(`${name} scale`)
    wisps.add(l, 'stretch', 1, 8, 0.1).name(`${name} stretch`)
    wisps.add(l, 'threshold', 0.2, 0.9, 0.005).name(`${name} threshold`)
    wisps.add(l, 'softness', 0.02, 0.6, 0.005).name(`${name} softness`)
    wisps.add(l, 'density', 0, 4, 0.05).name(`${name} density`)
    wisps.add(l, 'parallax', 0, 2, 0.01).name(`${name} parallax`)
  }
  wisps.add(cfg.wisps, 'evolve', 0, 0.03, 0.001)
  wisps.add(cfg.wisps, 'light', 0, 3, 0.01).name('backlight')
  wisps.add(cfg.wisps, 'ambient', 0, 3, 0.01)
  wisps.add(cfg.wisps, 'selfShadow', 0, 1, 0.01).name('self shadow')

  const moon = gui.addFolder('B. Moon')
  moon.add(cfg.moon.pos, '0', 0, cfg.image.ref[0], 1).name('x px')
  moon.add(cfg.moon.pos, '1', 0, cfg.image.ref[1], 1).name('y px')
  moon.add(cfg.moon, 'radius', 5, 200, 0.5)
  moon.add(cfg.moon, 'rotation', -180, 180, 0.5).name('position angle deg')
  moon.add(cfg.moon, 'lightAngle', 0, 360, 1).name('light from (deg)')
  moon.add(cfg.moon, 'phase', 0, 120, 0.5).name('phase deg (0 = full)')
  moon.add(cfg.moon, 'terminator', 0.001, 0.5, 0.005).name('terminator softness')
  moon.add(cfg.moon, 'limbDarkening', 0, 1, 0.01).name('limb darkening')
  moon.add(cfg.moon, 'earthshine', 0, 0.2, 0.001)
  moon.addColor(cfg.moon, 'earthshineColor').name('earthshine colour')
  moon.add(cfg.moon, 'relief', 0, 4, 0.05)
  moon.add(cfg.moon, 'kelvin', 3500, 7500, 50).name('colour temp K')
  moon.add(cfg.moon, 'sceneMatch', 0, 1, 0.01).name('match cloud highlights')
  moon.addColor(cfg.moon, 'tint')
  moon.add(cfg.moon, 'mapSaturation', 0, 1, 0.01).name('map colour')
  moon.add(cfg.moon, 'brightness', 0.2, 1.5, 0.01).name('face brightness')
  moon.add(cfg.moon, 'feather', 0.5, 4, 0.05).name('limb feather px')
  moon.add(cfg.moon.scatter, 'amount', 0, 1, 0.005).name('scatter ring')
  moon.add(cfg.moon.scatter, 'width', 0.005, 0.3, 0.005).name('scatter ring width')
  moon.add(cfg.moon, 'glow', 0, 3, 0.01).name('halo strength')
  moon.add(cfg.moon.halo.amp, '0', 0, 0.3, 0.001).name('halo core amp')
  moon.add(cfg.moon.halo.scale, '0', 0.01, 1, 0.005).name('halo core falloff')
  moon.add(cfg.moon.halo.amp, '1', 0, 0.3, 0.001).name('halo tail amp')
  moon.add(cfg.moon.halo.scale, '1', 0.05, 4, 0.01).name('halo tail falloff')
  moon.add(cfg.moon.halo, 'skyColor', 0, 1, 0.01).name('halo takes sky colour')
  moon.add(cfg.moon.halo, 'haze', 0, 1, 0.01).name('halo haze response')
  moon.add(cfg.moon.halo, 'occlusion', 0, 1, 0.01).name('halo behind cloud')
  moon.add(cfg.moon, 'response', 0, 1, 0.01).name('scene response')
  moon.add(cfg.moon, 'flare', 0, 1, 0.01).name('flare in clear gaps')
  moon.add(cfg.moon, 'dim', 0, 1, 0.01).name('dim under cloud')
  moon.add(cfg.moon, 'soften', 0, 2, 0.01).name('soften under cloud')
  moon.add(cfg.moon, 'smoothing', 0.1, 5, 0.05)
  moon.add(cfg.moon, 'baseline', 0.4, 1.2, 0.01)
  moon.add(cfg.moon, 'lightBrightness', 0.2, 3, 0.01).name('light thrown')
  moon.add(cfg.moon, 'wispTint', 0, 1, 0.01).name('wisp light tint')
  moon.add(cfg.moon, 'warmth', 0, 1, 0.01)
  moon.add(cfg.moon, 'breathHz', 0.02, 0.2, 0.005)
  moon.add(cfg.moon, 'breathAmount', 0, 0.2, 0.005)

  const light = gui.addFolder('C. Moonlight on scene')
  light.add(cfg.light, 'sceneResponse', 0, 1.5, 0.01)
  light.add(cfg.light, 'rim', 0, 4, 0.05)

  const rays = gui.addFolder('D. God rays')
  rays.add(cfg.rays, 'strength', 0, 2, 0.01)
  rays.add(cfg.rays, 'length', 0, 1, 0.01)
  rays.add(cfg.rays, 'decay', 0.9, 1, 0.001)
  rays.add(cfg.rays, 'threshold', 0, 1, 0.01)
  rays.add(cfg.rays, 'reach', 0.05, 1, 0.01)

  const grass = gui.addFolder('E. Grass + wind')
  grass.add(cfg.grass, 'amplitude', 0, 8, 0.1)
  grass.add(cfg.grass, 'frequency', 0.05, 2, 0.01)
  grass.add(cfg.grass, 'gust', 0, 4, 0.05)
  grass.add(cfg.grass, 'gustSpeed', 0.01, 0.5, 0.005)
  grass.add(cfg.wind, 'direction', { 'right to left': -1, 'left to right': 1 })

  const laptop = gui.addFolder('F. Laptop')
  laptop.add(cfg.laptop, 'pulse', 0, 0.4, 0.005)
  laptop.add(cfg.laptop, 'pool', 0, 2, 0.01)
  laptop.add(cfg.laptop, 'hz', 0.05, 3, 0.01)

  const screen = gui.addFolder('F2. Laptop screen')
  screen.add(cfg.screen, 'enabled')
  screen.add(cfg.screen, 'brightness', 0.3, 2, 0.01)
  screen.add(cfg.screen, 'glare', 0, 0.3, 0.005)
  screen.add(cfg.screen, 'bezel', 0, 120, 1).name('bezel (art px)')
  screen.add(cfg.screen, 'caretHz', 0, 3, 0.05)

  const vid = gui.addFolder('K. Screen video')
  vid.add(heroDebug, 'video').name('status').listen().disable()
  vid.add(cfg.video, 'enabled')
  vid.add(cfg.video, 'emissive', 0.5, 2, 0.01)
  vid.add(cfg.video, 'bloom', 0, 8, 0.05).name('bloom boost')
  vid.add(cfg.video, 'spill', 0, 10, 0.05).name('light spill')
  vid.add(cfg.video, 'screenAspect', 1, 2.4, 0.01).name('panel aspect')
  const detachHandles = cornerHandles(vid)

  const detachCompare = moonCompare(moon)

  const atmo = gui.addFolder('G. Atmosphere')
  atmo.add(cfg.particles, 'dust', 0, 80, 1)
  atmo.add(cfg.particles, 'fireflies', 0, 30, 1)
  atmo.add(cfg.particles, 'leaves', 0, 60, 1)
  atmo.add(cfg.particles, 'dustSpeed', 0, 5, 0.05)
  atmo.add(cfg.particles, 'leafSpeed', 0, 6, 0.05)
  atmo.add(cfg.particles, 'leafFlutter', 0, 4, 0.05)
  atmo.add(cfg.particles, 'brightness', 0, 3, 0.05)
  atmo.add(cfg.stars, 'twinkle', 0, 3, 0.05)
  atmo.add(cfg.stars, 'density', 0, 1, 0.01)
  atmo.add(cfg.stars, 'brightness', 0, 3, 0.05)
  atmo.add(cfg.stars, 'milkyWay', 0, 3, 0.05).name('milky way')
  atmo.add(cfg.stars.meteor, 'every', 5, 300, 1).name('shooting star every s')
  atmo.add(cfg.stars.meteor, 'duration', 0.2, 3, 0.05).name('shooting star s')
  atmo.add(cfg.stars.meteor, 'length', 0.01, 0.3, 0.005).name('shooting star length')
  atmo.add(cfg.stars.meteor, 'brightness', 0, 4, 0.05).name('shooting star brightness')
  atmo.add({ go: () => (heroDebug.meteorNow = true) }, 'go').name('Shooting star now')

  const cam = gui.addFolder('H. Camera')
  cam.add(cfg.parallax, 'maxShiftPx', 0, 40, 0.5).onFinishChange(onResize)
  cam.add(cfg.parallax, 'ease', 0.005, 0.3, 0.005)
  cam.add(cfg.parallax, 'focus', 0, 1, 0.01)
  cam.add(cfg.parallax, 'gyro')
  cam.add(cfg.dolly, 'min', 0.9, 1.2, 0.001)
  cam.add(cfg.dolly, 'max', 0.9, 1.2, 0.001)
  cam.add(cfg.dolly, 'period', 5, 120, 1)

  const film = gui.addFolder('I. Film')
  film.add(cfg.image, 'exposure', 0.3, 2, 0.01)
  film.add(cfg.film, 'vignette', 0, 1, 0.01)
  film.add(cfg.film, 'grain', 0, 0.2, 0.002)
  film.add(cfg.film, 'aberration', 0, 0.02, 0.0005)
  film.add(cfg.film, 'bloom', 0, 1.5, 0.01)
  film.add(cfg.film, 'bloomThreshold', 0, 2, 0.01)
  film.add(cfg.film, 'knee', 0.3, 0.98, 0.01)
  film.add(cfg.film, 'streak', 0, 0.4, 0.005).name('anamorphic streak')
  film.add(cfg.film, 'toe', 0, 0.02, 0.0005)
  film.add(cfg.film, 'sharpen', 0, 1, 0.01)
  film.add(cfg.film, 'clarity', 0, 1, 0.01).name('clarity (local contrast)')

  const perf = gui.addFolder('Performance')
  perf.add(cfg.perf, 'maxDpr', 0.5, 2, 0.05).onFinishChange(onResize)
  perf.add(cfg.perf, 'maxScenePixels', 200_000, 8_000_000, 100_000).onFinishChange(onResize)
  perf.add(cfg.perf, 'adaptive').name('auto quality')
  perf.add(cfg.perf, 'targetMs', 8, 40, 0.5).name('target frame ms')
  perf.add(cfg.perf, 'minScale', 0.2, 1, 0.01).name('lowest quality')
  perf.add(cfg.loop, 'seconds', 60, 1800, 30).name('loop seconds')

  // ---- J. scroll transition: scrub and freeze any frame, tune every phase
  const T = cfg.transition
  const refresh = () => activeTransition?.refresh()
  const tr = gui.addFolder('J. Scroll transition')
  tr.add(transitionDebug, 'freeze').name('freeze frame').listen()
  tr.add(transitionDebug, 'progress', 0, 1, 0.001)
    .name('progress')
    .onChange(() => (transitionDebug.freeze = true))
  tr.add(transitionDebug, 'live').name('live progress').listen().disable()
  tr.add(transitionDebug, 'raw').name('raw scroll').listen().disable()
  tr.add(heroDebug, 'zoom').listen().disable()
  tr.add(heroDebug, 'pauseTime').name('pause ambient')

  const profile = (name: string, o: typeof T.desktop) => {
    const f = tr.addFolder(name)
    f.add(o.target, '0', 0, 1, 0.0005).name('push target x (uv)')
    f.add(o.target, '1', 0, 1, 0.0005).name('push target y (uv, down)')
    f.add(o.frame, '0', 0, 1, 0.005).name('lands at x (screen)')
    f.add(o.frame, '1', 0, 1, 0.005).name('lands at y (screen, down)')
    f.add(o, 'zoom', 1, 8, 0.05).name('push zoom')
    f.add(o, 'pinVh', 120, 700, 10).name('pin (vh)').onFinishChange(refresh)
    f.close()
  }
  profile('Desktop', T.desktop)
  profile('Mobile (portrait or < 768 px)', T.mobile)

  const phases = tr.addFolder('Timing')
  phases.add(T, 'hold', 0, 0.5, 0.005).name('hold ends')
  phases.add(T.move, 'easeIn', 0.01, 0.8, 0.01).name('camera eases in over')
  phases.add(T.move, 'settle', 0.01, 0.8, 0.01).name('camera settles over')
  phases.add(T, 'scrub', 0, 3, 0.05).name('scrub smoothing (s)').onFinishChange(refresh)
  phases.add(T, 'renderUntil', 0.5, 1, 0.001).name('render until')
  phases.add(T.stageMap, '0', 0, 1, 0.01).name('About handover from')
  phases.add(T.stageMap, '1', 0, 1, 0.01).name('About handover to')
  phases.close()

  const push = tr.addFolder('Push')
  push.add(T.cue, 'pulse', 0, 6, 0.05).name('hold cue pulse')
  push.add(T.cue, 'glow', 0, 1, 0.01).name('hold cue glow')
  push.add(T.parallax, 'far', 0, 1, 0.01).name('parallax far (sky)')
  push.add(T.parallax, 'near', 1, 3, 0.01).name('parallax near')
  push.add(T.parallax, 'iterations', 0, 4, 1).name('layer search steps')
  push.add(T.blur, 'motion', 0, 4, 0.05).name('motion blur')
  push.add(T.blur, 'dof', 0, 0.05, 0.0005).name('depth of field')
  push.add(T.blur, 'focus', 0, 0.6, 0.005).name('sharp radius')
  push.add(T, 'vignette', 0, 0.6, 0.01).name('vignette tighten')
  push.add(T, 'raysFade', 0, 1, 0.01).name('rays / moon fade')
  push.add(T, 'ambientSlow', 0, 1, 0.01).name('ambient slow-down')
  push.add(T, 'windUp', 0, 3, 0.05).name('wind builds')
  push.add(T, 'screenGlow', 0, 1, 0.01).name('screen glow')
  push.close()

  const C = T.atmosphere
  const clouds = tr.addFolder('Atmosphere')
  clouds.add(C.path, '0', -40, 0, 0.1).name('camera starts at')
  clouds.add(C.path, '1', 0, 12, 0.1).name('camera ends at')
  clouds.add(C.scene, 'figure', 0.5, 8, 0.05).name('figure distance')
  clouds.add(C.scene, 'spread', 0, 5, 0.05).name('depth spread')
  clouds.add(C.scene, 'sky', 2, 30, 0.5).name('sky distance')
  clouds.add(C.bank, 'depth', 0.5, 8, 0.05).name('bank depth')
  clouds.add(C.bank, 'ramp', 0.05, 3, 0.05).name('bank edge')
  clouds.add(C.bank, 'density', 0, 12, 0.1).name('bank density')
  C.leading.forEach((v, i) => clouds.add(v, '3', 0, 2, 0.01).name(`veil ${i + 1} density`))
  clouds.add(C.trailing, '3', 0, 2, 0.01).name('last veil density')
  clouds.add(C, 'slices', 2, 16, 1)
  clouds.add(C, 'slicesLow', 2, 16, 1).name('slices (Lite)')
  clouds.add(C, 'scale', 0.2, 4, 0.01)
  clouds.add(C, 'softness', 0.05, 0.8, 0.01)
  clouds.add(C, 'structure', 0, 1, 0.01)
  clouds.add(C, 'silver', 0, 3, 0.01)
  clouds.add(C, 'scatter', 0, 6, 0.05)
  clouds.add(C, 'moonReach', 0, 3, 0.01).name('moonlight dies (1/u)')
  clouds.add(C, 'glowReach', 0, 3, 0.01).name('About light reach (1/u)')
  clouds.addColor(C, 'ambient')
  clouds.addColor(C, 'deep').name('bank heart')
  clouds.addColor(C, 'glow').name('About light')
  clouds.add(C, 'laptop', 0, 2, 0.01).name('laptop glow')
  clouds.addColor(C, 'laptopColor')
  clouds.add(C, 'wind', 0, 0.5, 0.005)
  clouds.add(C, 'dim', 0, 1, 0.01).name('scene dims')
  clouds.close()

  gui.folders.forEach((f, i) => i > 0 && f.close())
  tr.open()
  return () => {
    transitionDebug.freeze = false
    detachHandles()
    detachCompare()
    gui.destroy()
  }
}

/**
 * Split view of the moon: the live render on the left of the slider, the
 * lunar reference on the right (src/assets/moon/reference.png: the same map,
 * orthographic, flat-lit and ungraded, built by scripts/prepare-moon.mjs),
 * both scaled so the disks coincide and turned by the same position angle.
 * Drawn from the canvas right after each frame.
 */
function moonCompare(folder: GUI): () => void {
  const state = { show: true, split: 0.5, span: 2.2 }
  const SIZE = 300
  const wrap = document.createElement('div')
  wrap.style.cssText =
    'position:fixed;left:12px;bottom:12px;z-index:400;width:300px;padding:6px;background:rgba(10,10,16,.92);border:1px solid rgba(255,255,255,.18);border-radius:6px;font:11px/1.4 ui-monospace,Menlo,monospace;color:#cfd2e6'
  const title = document.createElement('div')
  title.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:4px'
  title.innerHTML = '<span>render</span><span>moon split view</span><span>reference</span>'
  const cv = document.createElement('canvas')
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  cv.width = cv.height = SIZE * dpr
  cv.style.cssText = 'display:block;width:300px;height:300px;cursor:ew-resize;background:#000'
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '0'
  slider.max = '1'
  slider.step = '0.001'
  slider.value = String(state.split)
  slider.style.cssText = 'width:100%;margin:6px 0 0'
  slider.addEventListener('input', () => (state.split = Number(slider.value)))
  // Dragging across the picture moves the split too.
  const fromPointer = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect()
    state.split = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    slider.value = String(state.split)
  }
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId)
    fromPointer(e)
  })
  cv.addEventListener('pointermove', (e) => {
    if (cv.hasPointerCapture(e.pointerId)) fromPointer(e)
  })
  wrap.append(title, cv, slider)
  document.body.appendChild(wrap)

  const ref = new Image()
  ref.src = moonRefUrl
  const ctx = cv.getContext('2d')!

  heroDebugApi.afterRender = () => {
    wrap.style.display = state.show ? '' : 'none'
    const src = heroDebugApi.canvas
    const box = heroDebugApi.container
    if (!state.show || !src || !box || !box.clientWidth) return
    const W = cv.width
    const m = heroDebugApi.moon()
    const k = src.width / box.clientWidth // canvas px per css px
    const half = m.r * state.span
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, W)
    ctx.drawImage(src, (m.x - half) * k, (m.y - half) * k, 2 * half * k, 2 * half * k, 0, 0, W, W)
    if (ref.complete && ref.naturalWidth) {
      // The reference disk fills its image.
      const rx = ref.naturalWidth / 2
      const ry = ref.naturalHeight / 2
      const rh = (ref.naturalWidth / 2) * state.span
      const x0 = W * state.split
      ctx.save()
      ctx.beginPath()
      ctx.rect(x0, 0, W - x0, W)
      ctx.clip()
      ctx.fillStyle = '#000'
      ctx.fillRect(x0, 0, W - x0, W)
      // Turned with the face, so the craters line up when rotation is set.
      ctx.translate(W / 2, W / 2)
      ctx.rotate((cfg.moon.rotation * Math.PI) / 180)
      // Source rect outside the image is clipped by drawImage, so scale by hand.
      const k = W / (2 * rh)
      ctx.drawImage(ref, -rx * k, -ry * k, ref.naturalWidth * k, ref.naturalHeight * k)
      ctx.restore()
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillRect(x0 - dpr / 2, 0, dpr, W)
    }
  }

  const f = folder.addFolder('Compare with reference')
  f.add(state, 'show').name('split view')
  f.add(state, 'split', 0, 1, 0.001).name('split').listen().onChange((v: number) => (slider.value = String(v)))
  f.add(state, 'span', 1.1, 6, 0.05).name('radii shown')
  return () => {
    heroDebugApi.afterRender = null
    wrap.remove()
  }
}

/**
 * Draggable handles on the four video corners (TL, TR, BR, BL). They follow
 * the camera (breathing dolly, parallax, the dive), so the corners can be
 * placed at any zoom: freeze the scroll transition mid-dive for precision.
 * Releasing a handle prints the corners, ready to paste into config.ts.
 */
function cornerHandles(folder: GUI): () => void {
  const state = { handles: true, corners: '' }
  const names = ['TL', 'TR', 'BR', 'BL']
  const layer = document.createElement('div')
  layer.style.cssText = 'position:fixed;inset:0;z-index:450;pointer-events:none'
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  svg.style.cssText = 'position:absolute;inset:0;overflow:visible'
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
  poly.setAttribute('fill', 'rgba(255,222,89,0.08)')
  poly.setAttribute('stroke', '#ffde59')
  poly.setAttribute('stroke-width', '1')
  svg.appendChild(poly)
  layer.appendChild(svg)

  const round = (v: number) => +v.toFixed(5)
  const print = () => {
    state.corners = JSON.stringify(cfg.video.corners.map((c) => c.map(round)))
    console.log(`[hero] video.corners (paste into src/hero/config.ts):\n${state.corners}`)
    navigator.clipboard?.writeText(state.corners).catch(() => {})
  }
  state.corners = JSON.stringify(cfg.video.corners.map((c) => c.map(round)))

  const handles = names.map((name, i) => {
    const h = document.createElement('div')
    h.title = `${name}: drag to the screen corner`
    h.style.cssText =
      'position:absolute;left:0;top:0;width:14px;height:14px;margin:-8px 0 0 -8px;border:2px solid #ffde59;border-radius:50%;background:rgba(0,0,0,.35);pointer-events:auto;cursor:grab;touch-action:none'
    const label = document.createElement('span')
    label.textContent = name
    label.style.cssText = 'position:absolute;left:16px;top:-4px;font:10px ui-monospace,monospace;color:#ffde59;text-shadow:0 0 3px #000'
    h.appendChild(label)
    h.addEventListener('pointerdown', (e) => {
      h.setPointerCapture(e.pointerId)
      h.style.cursor = 'grabbing'
      e.preventDefault()
      e.stopPropagation()
    })
    h.addEventListener('pointermove', (e) => {
      if (!h.hasPointerCapture(e.pointerId) || !heroDebugApi.container) return
      const r = heroDebugApi.container.getBoundingClientRect()
      const [u, v] = heroDebugApi.fromScreen(e.clientX - r.left, e.clientY - r.top)
      cfg.video.corners[i] = [round(u), round(v)]
      state.corners = JSON.stringify(cfg.video.corners.map((c) => c.map(round)))
    })
    const release = (e: PointerEvent) => {
      if (!h.hasPointerCapture(e.pointerId)) return
      h.releasePointerCapture(e.pointerId)
      h.style.cursor = 'grab'
      print()
    }
    h.addEventListener('pointerup', release)
    h.addEventListener('pointercancel', release)
    layer.appendChild(h)
    return h
  })
  document.body.appendChild(layer)

  let raf = 0
  const place = () => {
    raf = requestAnimationFrame(place)
    const box = heroDebugApi.container
    const r = box?.getBoundingClientRect()
    const visible = !!r && state.handles && r.bottom > 0 && getComputedStyle(box!.parentElement ?? box!).visibility !== 'hidden'
    layer.style.display = visible ? '' : 'none'
    if (!visible || !r) return
    const pts = cfg.video.corners.map(([u, v]) => {
      const [x, y] = heroDebugApi.toScreen(u, v)
      return [x + r.left, y + r.top]
    })
    pts.forEach(([x, y], i) => (handles[i].style.transform = `translate(${x}px, ${y}px)`))
    poly.setAttribute('points', pts.map((p) => p.join(',')).join(' '))
  }
  place()

  folder.add(state, 'handles').name('corner handles')
  folder.add(state, 'corners').name('corners (uv)').listen().disable()
  folder.add({ print }, 'print').name('Print corners')
  return () => {
    cancelAnimationFrame(raf)
    layer.remove()
  }
}

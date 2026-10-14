/**
 * The performance lab: frame-by-frame measurements of the home route in headless Chrome on this machine's
 * GPU, per device profile and scenario, with layers switched off one at a time (src/core/perfLab.ts).
 *
 *   npm run perf:build                                  the production build with the lab's switches (dist-perf/)
 *   node scripts/perf-lab.mjs                           baseline: every profile x scenario
 *   node scripts/perf-lab.mjs --profiles phone-mid --scenarios idle,pointer --matrix
 *                                                       the kill-switch matrix (one run per layer off)
 *   --query "rdpr=1"                                    extra URL parameters for every run
 *   --out .hero-shots/lab/run.json                      where the raw results go
 *   --url http://localhost:5301                         a server that is already running
 *
 * Per frame it records the rAF callbacks' main-thread time (every loop on the page runs in one) and each
 * WebGL context's GPU time (EXT_disjoint_timer_query, one query per callback). Phones are this machine with
 * the CPU throttled: their GPU cost is under-represented (a laptop's Iris Xe is faster than a mid-range
 * phone's GPU at the same pixel count).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium } from 'playwright-core'
import { chromePath } from './hero-baseline.mjs'

export const PROFILES = {
  // This machine as itself: a 1920 x 1080 laptop panel at 125%.
  laptop: { width: 1536, height: 864, scale: 1.25, mobile: false, cpu: 1 },
  // A 4K laptop / HiDPI screen (3840 x 2160 at 200%) on the same integrated GPU.
  'laptop-4k': { width: 1920, height: 1080, scale: 2, mobile: false, cpu: 1 },
  // A mid-range Android phone (412 x 915 CSS px, DPR 2.625), CPU 4x slower.
  'phone-mid': { width: 412, height: 915, scale: 2.625, mobile: true, cpu: 4, cores: 8, memory: 8 },
  // A low-end Android phone that still reports 8 cores and 4 GB (so it is not detected as low-end): CPU 6x slower.
  'phone-low': { width: 360, height: 800, scale: 2, mobile: true, cpu: 6, cores: 8, memory: 4 },
}

export const SCENARIOS = ['load', 'idle', 'pointer', 'handoff', 'docked', 'scroll', 'works']

/** The layers the matrix switches off (src/core/perfLab.ts). CSS layers are switched off by an injected style. */
export const LAYERS = ['terrain', 'landscape', 'inflow', 'fx', 'robot', 'robotdraw', 'shadows', 'reflect', 'glows', 'dissolve', 'screenlight', 'env', 'beam', 'sections', 'post', 'videos', 'grain', 'haze', 'scrim', 'backdrop']
const CSS_OFF = {
  grain: '.hero-grain{display:none!important}',
  haze: '.hero-haze,.hero-ridges{display:none!important}',
  scrim: '.hero-scrim,.hero-copy-scrim,[class*="scrim"]{-webkit-mask:none!important;mask:none!important}',
  backdrop: '*{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}',
}
/** The fixes' lab switches (src/core/perfLab.ts) and CSS reverts: ?off=<these> is the build before them. */
export const REVERTS = ['skin', 'skinalpha', 'shadow30', 'reflect15', 'dissolveskip', 'dockdemand', 'sharedpace']
export const REVERT_CSS = {
  // The beam's light without its own layer.
  beamlayer: '.hero-beam__light{will-change:auto!important}',
}
Object.assign(CSS_OFF, REVERT_CSS)

/** Injected before the page: overrides for the profile, and the per-frame recorder. */
function recorder(profile) {
  return `(() => {
  ${profile.cores ? `Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${profile.cores} });` : ''}
  ${profile.memory ? `Object.defineProperty(navigator, 'deviceMemory', { get: () => ${profile.memory} });` : ''}
  const lab = (window.__lab = { frames: [], long: [], recording: true, paints: {}, gpu: true })
  const ctxs = []
  const getContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const gl = getContext.call(this, type, attrs)
    if (gl && /webgl/.test(type) && !ctxs.some((c) => c.gl === gl)) {
      const v2 = type === 'webgl2'
      const ext = gl.getExtension(v2 ? 'EXT_disjoint_timer_query_webgl2' : 'EXT_disjoint_timer_query')
      if (ext) ctxs.push({ gl, v2, ext, canvas: this, pending: [], label: '' })
    }
    return gl
  }
  const labelOf = (c) => c.canvas.classList.contains('robot-canvas') ? 'robot' : c.canvas.classList.contains('hero-terrain') ? 'terrain' : c.canvas.closest('[data-stage]') ? 'sections' : 'other'
  const live = () => ctxs.filter((c) => c.canvas.isConnected && !c.gl.isContextLost())
  function begin() {
    const out = []
    for (const c of live()) {
      const { gl, ext } = c
      const q = c.v2 ? gl.createQuery() : ext.createQueryEXT()
      if (!q) continue
      if (c.v2) gl.beginQuery(ext.TIME_ELAPSED_EXT, q)
      else ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, q)
      out.push([c, q])
    }
    return out
  }
  function end(open, frame) {
    for (const [c, q] of open) {
      if (c.v2) c.gl.endQuery(c.ext.TIME_ELAPSED_EXT)
      else c.ext.endQueryEXT(c.ext.TIME_ELAPSED_EXT)
      c.pending.push([q, frame])
    }
  }
  function poll() {
    for (const c of ctxs) {
      const { gl, ext } = c
      while (c.pending.length) {
        const [q, frame] = c.pending[0]
        if (gl.isContextLost()) { c.pending.length = 0; break }
        const ready = c.v2 ? gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) : ext.getQueryObjectEXT(q, ext.QUERY_RESULT_AVAILABLE_EXT)
        if (!ready) break
        c.pending.shift()
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
        const ns = c.v2 ? gl.getQueryParameter(q, gl.QUERY_RESULT) : ext.getQueryObjectEXT(q, ext.QUERY_RESULT_EXT)
        if (c.v2) gl.deleteQuery(q)
        else ext.deleteQueryEXT(q)
        if (!disjoint && frame) {
          const k = c.label || (c.label = labelOf(c))
          frame.gpu[k] = (frame.gpu[k] || 0) + ns / 1e6
        }
      }
    }
  }
  const raf = window.requestAnimationFrame.bind(window)
  let cur = null
  window.requestAnimationFrame = function (cb) {
    return raf((t) => {
      if (!cur || cur.t !== t) {
        poll()
        cur = { t, js: 0, gpu: {}, cbs: 0 }
        if (lab.recording) lab.frames.push(cur)
      }
      const frame = cur
      // GPU queries on every 8th frame only: a query pair per callback per context is itself a load on the GPU process.
      const open = lab.recording && lab.gpu && lab.frames.length % 8 === 0 ? begin() : null
      const s = performance.now()
      try {
        cb(t)
      } finally {
        frame.js += performance.now() - s
        frame.cbs++
        if (open) (end(open, frame), (frame.sampled = true))
      }
    })
  }
  // A frame tick with no callbacks of the page's own would not be recorded: keep one running.
  const keep = (t) => { window.requestAnimationFrame(keep) }
  window.requestAnimationFrame(keep)
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) lab.long.push([e.startTime, e.duration]) }).observe({ type: 'longtask', buffered: true })
    new PerformanceObserver((l) => { for (const e of l.getEntries()) lab.paints[e.name] = e.startTime }).observe({ type: 'paint', buffered: true })
    new PerformanceObserver((l) => { const e = l.getEntries().at(-1); if (e) lab.paints.lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
  } catch {}
  lab.reset = () => { lab.frames = []; lab.long = []; lab.since = performance.now() }
  lab.contexts = () => live().map((c) => ({ label: labelOf(c), w: c.gl.drawingBufferWidth, h: c.gl.drawingBufferHeight, renderer: (() => { const d = c.gl.getExtension('WEBGL_debug_renderer_info'); return d ? c.gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '' })() }))
})()`
}

const pct = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0)
const r2 = (v) => Math.round(v * 100) / 100

/** Statistics for a recorded window. */
export function stats(frames, long, since, hz = 60) {
  const iv = []
  for (let i = 1; i < frames.length; i++) iv.push(frames[i].t - frames[i - 1].t)
  const period = 1000 / hz
  const sorted = [...iv].sort((a, b) => a - b)
  const span = frames.length > 1 ? frames.at(-1).t - frames[0].t : 0
  let dropped = 0
  for (const v of iv) dropped += Math.max(0, Math.round(v / period) - 1)
  const js = frames.map((f) => f.js).sort((a, b) => a - b)
  const sampled = frames.filter((f) => f.sampled)
  const gpuKeys = [...new Set(sampled.flatMap((f) => Object.keys(f.gpu)))]
  const gpu = {}
  for (const k of gpuKeys) {
    const v = sampled.map((f) => f.gpu[k] || 0).sort((a, b) => a - b)
    gpu[k] = { avg: r2(v.reduce((a, b) => a + b, 0) / v.length), p95: r2(pct(v, 0.95)) }
  }
  const gpuTotal = sampled.map((f) => Object.values(f.gpu).reduce((a, b) => a + b, 0)).sort((a, b) => a - b)
  const lt = long.filter(([at]) => at >= since)
  return {
    frames: frames.length,
    fps: span ? r2(((frames.length - 1) * 1000) / span) : 0,
    p50: r2(pct(sorted, 0.5)),
    p95: r2(pct(sorted, 0.95)),
    p99: r2(pct(sorted, 0.99)),
    max: r2(sorted.at(-1) ?? 0),
    over50: iv.filter((v) => v > 50).length,
    dropped,
    jsAvg: r2(js.reduce((a, b) => a + b, 0) / Math.max(1, js.length)),
    jsP95: r2(pct(js, 0.95)),
    gpuAvg: r2(gpuTotal.reduce((a, b) => a + b, 0) / Math.max(1, gpuTotal.length)),
    gpuP95: r2(pct(gpuTotal, 0.95)),
    gpu,
    longTasks: lt.length,
    longestTask: r2(Math.max(0, ...lt.map(([, d]) => d))),
  }
}

/** Starts `vite preview` on dist-perf/ and resolves its URL. */
export async function labServer(url, dir = 'dist-perf') {
  if (url) return { url, stop() {} }
  if (!existsSync(`${dir}/index.html`)) throw new Error(`No ${dir}/: run \`npm run perf:build\` first.`)
  const port = Number(process.env.LAB_PORT ?? 5311)
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dir, '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'ignore'] })
  await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('vite preview did not start')), 20000)
    child.stdout.on('data', (d) => String(d).includes(String(port)) && (clearTimeout(timer), ok()))
    child.on('exit', (code) => fail(new Error(`vite preview exited (${code})`)))
  })
  return { url: `http://localhost:${port}`, stop: () => child.kill() }
}

export async function labBrowser(extraArgs = []) {
  return chromium.launch({ executablePath: chromePath(), headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', '--force-color-profile=srgb', ...extraArgs] })
}

/** One page of a profile at `query`, live and settled; returns { page, ctx, cdp, info }. */
export async function openPage(browser, base, profile, query = '', { css = '', settle = 4000, bare = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.scale, isMobile: profile.mobile, hasTouch: profile.mobile, reducedMotion: 'no-preference' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.addInitScript(bare ? recorder(profile).replace(/const raf = window\.requestAnimationFrame[\s\S]*?window\.requestAnimationFrame\(keep\)/, '') : recorder(profile))
  if (css) await page.addInitScript((c) => document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = c; document.head.append(s) }), css)
  const cdp = await ctx.newCDPSession(page)
  if (profile.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu })
  const t0 = Date.now()
  let live = false
  for (let k = 0; k < 2 && !live; k++) {
    await page.goto(`${base}/${query ? `?${query}` : ''}`, { waitUntil: 'load' })
    live = await page.waitForSelector('.hero-cinematic[data-live]', { timeout: 30000 }).then(() => true).catch(() => false)
  }
  const liveMs = Date.now() - t0
  await page.waitForTimeout(settle)
  return { page, ctx, cdp, errors, liveMs, live }
}

/** Device facts and the renderers' counters. */
export async function facts(page) {
  return page.evaluate(() => {
    const r = window.__heroRobot
    const t = window.__heroTerrain
    const info = r?.renderer.info
    return {
      dpr: devicePixelRatio,
      tier: document.getElementById('hero')?.dataset.tier,
      lite: !!document.querySelector('[data-lite-landscape]'),
      contexts: window.__lab.contexts(),
      robot: info ? { calls: info.render.calls, triangles: info.render.triangles, programs: info.programs?.length, geometries: info.memory.geometries, textures: info.memory.textures } : null,
      terrain: t ? { points: t.state().gridCount, vortex: t.state().vortexCount, degrade: t.state().ladder } : null,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    }
  })
}

/** The CDP session the scenarios trace through (set per page). */
let tracer = null

/**
 * Busy time per second of the renderer's main thread and the GPU process's main thread (where the WebGL
 * command streams are executed: ANGLE's validation and translation, the driver), from a light trace.
 */
async function traced(fn) {
  if (!tracer) return { result: await fn(), threads: null }
  const events = []
  const onData = (e) => events.push(...e.value)
  tracer.on('Tracing.dataCollected', onData)
  const done = new Promise((ok) => tracer.once('Tracing.tracingComplete', ok))
  await tracer.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: ['toplevel', '__metadata'] } })
  const t0 = Date.now()
  const result = await fn()
  const span = (Date.now() - t0) / 1000
  await tracer.send('Tracing.end')
  await done
  tracer.off('Tracing.dataCollected', onData)
  const names = {}
  for (const e of events) if (e.name === 'thread_name') names[`${e.pid}:${e.tid}`] = e.args.name
  const busy = {}
  const ends = {}
  for (const e of events.filter((e) => e.ph === 'X' && e.dur).sort((a, b) => a.ts - b.ts)) {
    const k = `${e.pid}:${e.tid}`
    if (e.ts < (ends[k] ?? 0)) continue
    ends[k] = e.ts + e.dur
    const n = names[k]
    if (n === 'CrRendererMain' || n === 'CrGpuMain' || n === 'VizCompositorThread') busy[n] = (busy[n] ?? 0) + e.dur / 1000
  }
  const threads = {}
  for (const [n, v] of Object.entries(busy)) threads[n] = Math.round(v / span)
  return { result, threads }
}

const window_ = async (page, ms, during) => {
  await page.evaluate(() => window.__lab.reset())
  const { threads } = await traced(async () => {
    const t0 = Date.now()
    if (during) await during(ms)
    const left = ms - (Date.now() - t0)
    if (left > 0) await page.waitForTimeout(left)
  })
  const w = await page.evaluate(() => ({ frames: window.__lab.frames.slice(1), long: window.__lab.long, since: window.__lab.since }))
  return { ...w, threads }
}

async function wheelTo(page, target, step, gapMs) {
  for (let i = 0; i < 400; i++) {
    const y = await page.evaluate(() => window.scrollY)
    if ((step > 0 && y >= target - 2) || (step < 0 && y <= target + 2)) return
    await page.mouse.wheel(0, step)
    await page.waitForTimeout(gapMs)
  }
}

/** The scenarios: each returns a recorded window (or several). */
export const RUN = {
  async idle(page) {
    return { idle: await window_(page, 8000) }
  },
  async pointer(page, profile, cdp) {
    const { width: W, height: H } = profile
    const move = async (ms) => {
      const end = Date.now() + ms
      let k = 0
      if (profile.mobile) {
        while (Date.now() < end) {
          const pts = (a) => [{ x: W * (0.3 + 0.4 * ((a % 20) / 20)), y: H * 0.45 }]
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(k) })
          for (let j = 0; j < 8; j++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(k + j) })
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
          k += 3
          await page.waitForTimeout(250)
        }
      } else {
        while (Date.now() < end) {
          const a = k++ * 0.06
          await page.mouse.move(W * (0.5 + 0.3 * Math.cos(a)), H * (0.45 + 0.25 * Math.sin(a)))
          await page.waitForTimeout(16)
        }
      }
    }
    return { pointer: await window_(page, 8000, move) }
  },
  async handoff(page, profile) {
    const end = await page.evaluate(() => document.getElementById('hero').offsetHeight - innerHeight)
    // The pin's length in ~3 s of steady wheel ticks, then held for the head to land, then back up.
    const step = Math.round(end / 36)
    const down = await window_(page, 5000, () => wheelTo(page, end + 40, step, 80))
    const docked = await page.evaluate(() => !!document.querySelector('canvas.robot-canvas.is-docked'))
    await page.waitForTimeout(1500)
    const up = await window_(page, 5000, () => wheelTo(page, 0, -step, 80))
    return { 'handoff-down': { ...down, docked }, 'handoff-up': up }
  },
  /** Past the hero, the head docked in the launcher, nothing touched: its cost per drawn frame and per second. */
  async docked(page) {
    await page.evaluate(() => {
      const y = document.getElementById('hero').offsetHeight
      window.__lenis?.scrollTo(y, { immediate: true }) ?? window.scrollTo(0, y)
    })
    await page.waitForSelector('canvas.robot-canvas.is-docked', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(3000)
    const w = await window_(page, 6000)
    const dock = await page.evaluate(() => window.__heroRobot?.dock())
    return { docked: { ...w, dock } }
  },
  async scroll(page) {
    const bottom = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
    const step = 160
    const down = await window_(page, 1, () => wheelTo(page, bottom, step, 60))
    const up = await window_(page, 1, () => wheelTo(page, 0, -step, 60))
    return { 'scroll-down': down, 'scroll-up': up }
  },
  async works(page) {
    await page.evaluate(() => {
      const el = document.getElementById('works')
      window.__lenis?.scrollTo(el.offsetTop + el.offsetHeight * 0.18, { immediate: true }) ?? window.scrollTo(0, el.offsetTop + el.offsetHeight * 0.18)
    })
    await page.waitForTimeout(3000)
    const w = await window_(page, 8000)
    const playing = await page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => !v.paused).length)
    return { works: { ...w, playing } }
  },
}

/** The load window: from navigation to 5 s after the scene went live (the copy's entrance plays in it). */
/**
 * The load, in a browser of its own: a page closed before it is measured can leave the GPU process compiling its
 * shaders for seconds, and the next page's first WebGL context waits for them (a visitor never has that page).
 * Warmed with a blank page and a context, not the site.
 */
async function loadRun(_browser, base, profile, query, css) {
  const browser = await labBrowser()
  try {
    const warm = await browser.newPage()
    await warm.setContent('<canvas></canvas>')
    await warm.evaluate(() => document.querySelector('canvas').getContext('webgl2')?.clear(0x4000))
    await warm.waitForTimeout(1500)
    await warm.close()
    const { page, ctx, errors, liveMs } = await openPage(browser, base, profile, query, { css, settle: 1500 })
    const w = await page.evaluate(() => ({ frames: window.__lab.frames.slice(1), long: window.__lab.long, since: 0, paints: window.__lab.paints }))
    await ctx.close()
    return { load: { ...w, liveMs, errors } }
  } finally {
    await browser.close()
  }
}

async function main() {
  const args = process.argv.slice(2)
  const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d)
  const profiles = opt('profiles', Object.keys(PROFILES).join(',')).split(',')
  const scenarios = opt('scenarios', SCENARIOS.join(',')).split(',')
  // --variants 'rdpr=1;rdpr=1.5': whole query strings in place of layers (the DPR and refresh experiments).
  const layers = args.includes('--matrix') ? ['', ...opt('layers', LAYERS.join(',')).split(',')] : args.includes('--variants') ? ['', ...opt('variants', '').split(';')] : ['']
  const query = opt('query', '')
  const out = opt('out', `.hero-shots/lab/run-${Date.now()}.json`)
  const repeat = Number(opt('repeat', 1))
  const srv = await labServer(opt('url'), opt('dist', 'dist-perf'))
  const browser = await labBrowser()
  const results = []
  try {
    // A fresh headless Chrome stalls its first pages while its GPU process warms up.
    for (let i = 0; i < 2; i++) {
      const { ctx } = await openPage(browser, srv.url, PROFILES.laptop, '', { settle: 500 }).catch(() => ({ ctx: null }))
      await ctx?.close()
    }
    for (const name of profiles) {
      const profile = PROFILES[name]
      // Repeats interleave the layers (none, a, b, none, a, b...): a laptop's clocks drift as it warms up.
      for (let rep = 0; rep < repeat; rep++) {
        for (const layer of layers) {
          // 'before': every fix reverted (its lab switch or CSS), for the before / after table.
          const css = layer === 'before' ? Object.values(REVERT_CSS).join('') : CSS_OFF[layer] ?? ''
          // (Every off= list merges into one: ?off=adapt plus the layer's.)
          const params = new URLSearchParams([query, layer.includes('=') ? layer : ''].filter(Boolean).join('&'))
          const offs = [...params.getAll('off').flatMap((v) => v.split(',')), ...(layer === 'before' ? REVERTS : layer && !layer.includes('=') && !CSS_OFF[layer] ? [layer] : [])].filter(Boolean)
          params.delete('off')
          if (offs.length) params.set('off', offs.join(','))
          const q = params.toString().replace(/%2C/g, ',')
          const row = { profile: name, layer: layer || 'none', query, rep, windows: {} }
          if (scenarios.includes('load')) Object.assign(row.windows, await loadRun(browser, srv.url, profile, q, css))
          const rest = scenarios.filter((s) => s !== 'load')
          if (rest.length) {
            const { page, ctx, cdp, errors, liveMs, live } = await openPage(browser, srv.url, profile, q, { css })
            row.facts = await facts(page)
            row.liveMs = liveMs
            row.live = live
            tracer = args.includes('--no-trace') ? null : cdp
            for (const s of rest) Object.assign(row.windows, await RUN[s](page, profile, cdp))
            tracer = null
            row.errors = errors
            await ctx.close()
          }
          for (const [k, w] of Object.entries(row.windows)) {
            row.windows[k] = { ...stats(w.frames, w.long, w.since), ...(w.paints ? { fcp: r2(w.paints['first-contentful-paint'] ?? 0), lcp: r2(w.paints.lcp ?? 0), liveMs: w.liveMs, errors: w.errors?.length ?? 0 } : {}), ...(w.threads ? { busy: w.threads } : {}), ...(w.docked !== undefined ? { docked: w.docked } : {}), ...(w.playing !== undefined ? { playing: w.playing } : {}), ...(w.dock ? { dock: w.dock } : {}) }
          }
          results.push(row)
          const brief = Object.entries(row.windows).map(([k, s]) => `${k} ${s.fps}fps p95 ${s.p95} max ${s.max} js ${s.jsAvg} gpu ${s.gpuAvg}${s.busy ? ` main ${s.busy.CrRendererMain} gpuproc ${s.busy.CrGpuMain}` : ''}`).join(' | ')
          console.log(`${name.padEnd(10)} ${row.layer.padEnd(12)} ${brief}`)
          mkdirSync(dirname(out), { recursive: true })
          writeFileSync(out, JSON.stringify(results, null, 1))
        }
      }
    }
  } finally {
    await browser.close()
    srv.stop()
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/perf-lab.mjs')) main()

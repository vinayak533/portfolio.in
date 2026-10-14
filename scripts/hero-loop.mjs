/**
 * The hero's last-resort loops (src/hero/loop.ts): the real scene, captured frame by frame on a virtual clock and
 * made seamless, as public/hero/loop-{phone,tablet,desktop}.mp4 (H.264) and .webm (VP9).
 *
 *   npm run perf:build && npm run hero:loop
 *   npm run hero:loop -- --only phone --seconds 10 --url http://localhost:5311
 *   npm run hero:loop -- --only desktop --reuse          re-encode the last capture (.hero-shots/loop/)
 *
 * Deterministic: the page runs on a virtual clock (performance.now, Date.now and requestAnimationFrame are the
 * script's: each frame is exactly 1/30 s later) with Math.random seeded, so a run gives the same frames on the
 * same machine. It uses the perf build (dist-perf/: the production build plus the lab's switches) to pin each
 * framing's tier as the posters do (phones and tablets MEDIUM, landscape screens HIGH) with the frame-rate
 * ladders off. Framed like the posters (Hero.tsx POSTER) at 720p / 1080p, with what the page draws over the hero
 * hidden (the copy, the header, the launcher, the grain, the vignette). Seamless: the loop is `--seconds` long
 * (10: sixteen bars of the 96 BPM beat the robot moves to) and its last `--blend` seconds crossfade into its
 * first. Each encoding is the best quality under its framing's budget.
 *
 * Needs ffmpeg (with libx264 and libvpx-vp9): on PATH, or FFMPEG=path/to/ffmpeg.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { PROFILES, labBrowser, labServer, openPage } from './perf-lab.mjs'

const FRAMINGS = [
  // CSS viewport, device scale (to 720 px wide / 1080 px tall), tier, budget per file
  { name: 'phone', width: 400, height: 866, scale: 1.8, mobile: true, tier: 'medium', budget: 2 * 1024 * 1024 },
  { name: 'tablet', width: 768, height: 1024, scale: 1080 / 1024, mobile: true, tier: 'medium', budget: 2.5 * 1024 * 1024 },
  // (The landscape's dots at 1080p: under ~6 MB they lose their detail, SSIM under 0.97.)
  { name: 'desktop', width: 1440, height: 900, scale: 1.2, mobile: false, tier: 'high', budget: 6 * 1024 * 1024 },
]
const FPS = 30

const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d)
const only = opt('only', '')
const seconds = Number(opt('seconds', 10))
const blend = Number(opt('blend', 0.8))
const warm = Number(opt('warm', 1.5))
const work = resolve(opt('work', '.hero-shots/loop'))
const outDir = resolve('public/hero')
const ffmpeg = process.env.FFMPEG || 'ffmpeg'

/** The virtual clock, installed before any of the page's scripts (it follows real time until started). */
const CLOCK = `(() => {
  let s = 0x5eed10 | 0
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const realNow = performance.now.bind(performance)
  const realDate = Date.now
  const realRaf = window.requestAnimationFrame.bind(window)
  const realCaf = window.cancelAnimationFrame.bind(window)
  let manual = false
  let now = 0
  let dateBase = 0
  let id = 1e9
  const queue = new Map()
  performance.now = () => (manual ? now : realNow())
  Date.now = () => (manual ? Math.round(dateBase + now) : realDate())
  window.requestAnimationFrame = (cb) => (manual ? (queue.set(++id, cb), id) : realRaf(cb))
  window.cancelAnimationFrame = (h) => { if (!queue.delete(h)) realCaf(h) }
  window.__vt = {
    start() { manual = true; now = realNow(); dateBase = realDate() - now },
    step(ms) {
      now += ms
      const due = [...queue.values()]
      queue.clear()
      for (const cb of due) { try { cb(now) } catch (e) { console.error(e) } }
    },
    // Two real frames: what was drawn in the step is on the screen.
    presented: () => new Promise((ok) => realRaf(() => realRaf(ok))),
  }
})()`

/** What the page draws over the hero (as for the posters: .hero-shots/accept/poster-capture.mjs). */
const HIDE = `.hero-poster, .hero-loop, .hero-grain, [data-hero-intro], #hero-copy, .hud, .chat, .skip-link, .scroll-cue { visibility: hidden !important; opacity: 0 !important }
  .hero-cinematic::after { display: none !important }`

function run(cmd, list) {
  const r = spawnSync(cmd, list, { stdio: ['ignore', 'ignore', 'pipe'] })
  if (r.error) throw new Error(`${cmd} not found (${r.error.message}). Put ffmpeg on PATH or set FFMPEG.`)
  if (r.status !== 0) throw new Error(`${cmd} failed: ${String(r.stderr).slice(-600)}`)
}

/** Encodes the frames in `dir` under `budget` bytes: the lowest CRF (best quality) that fits. */
function encode(dir, out, codec, budget) {
  // sRGB captures to BT.709 limited-range 4:2:0, tagged as such (swscale's default matrix would be BT.601).
  const color = ['-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2:out_color_matrix=bt709:out_range=tv,format=yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']
  const input = ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', `${dir}/%04d.png`]
  const crfs = codec === 'h264' ? [20, 22, 24, 26, 28, 30, 32, 34, 36] : [28, 31, 34, 37, 40, 43, 46, 49]
  for (const crf of crfs) {
    const enc =
      codec === 'h264'
        ? ['-c:v', 'libx264', '-preset', 'veryslow', '-crf', String(crf), '-profile:v', 'high', '-level:v', '4.0', '-g', String(FPS * 2), '-movflags', '+faststart']
        : ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-g', String(FPS * 2)]
    run(ffmpeg, [...input, ...color, ...enc, '-an', out])
    const size = statSync(out).size
    if (size <= budget) return { crf, kb: Math.round(size / 1024) }
  }
  throw new Error(`${out}: over ${Math.round(budget / 1024)} KB at every quality tried`)
}

/** Captures `seconds` + `blend` of the hero in framing `f` into `raw`, then the seamless loop's frames into `loop`. */
async function captureLoop(browser, base, f, raw, loop) {
  for (const d of [raw, loop]) (rmSync(d, { recursive: true, force: true }), mkdirSync(d, { recursive: true }))
  const ctx = await browser.newContext({ viewport: { width: f.width, height: f.height }, deviceScaleFactor: f.scale, isMobile: f.mobile, hasTouch: f.mobile, reducedMotion: 'no-preference' })
  await ctx.addInitScript(CLOCK)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  let live = false
  for (let k = 0; k < 2 && !live; k++) {
    await page.goto(`${base}/?tier=${f.tier}&off=adapt,loop`, { waitUntil: 'load', timeout: 120000 })
    live = await page.waitForSelector('.hero-cinematic[data-live]', { timeout: 60000 }).then(() => true).catch(() => false)
  }
  if (!live) throw new Error(`${f.name}: the hero never went live`)
  // Settled after its load sequence (as the posters are), then onto the virtual clock.
  await page.waitForTimeout(4500)
  await page.addStyleTag({ content: HIDE })
  await page.evaluate(() => window.__vt.start())
  const step = 1000 / FPS
  for (let i = 0; i < Math.round(warm * FPS); i++) await page.evaluate((ms) => window.__vt.step(ms), step)
  const n = Math.round(seconds * FPS)
  const b = Math.round(blend * FPS)
  for (let i = 0; i < n + b; i++) {
    await page.evaluate((ms) => window.__vt.step(ms), step)
    await page.evaluate(() => window.__vt.presented())
    await page.screenshot({ path: `${raw}/${String(i).padStart(4, '0')}.png`, type: 'png' })
  }
  await ctx.close()
  if (errors.length) console.warn(`[loop] ${f.name}: page errors: ${errors.join(' | ')}`)
  // Seamless: frame i < b is frame n + i fading into frame i, so the last frame (n - 1) runs on into frame n,
  // its natural successor, and the fade has finished by frame b.
  for (let i = 0; i < n; i++) {
    const dst = `${loop}/${String(i).padStart(4, '0')}.png`
    const src = `${raw}/${String(i).padStart(4, '0')}.png`
    if (i >= b) {
      copyFileSync(src, dst)
      continue
    }
    const w = i / b
    const [{ data: a, info }, { data: z }] = await Promise.all([
      sharp(`${raw}/${String(n + i).padStart(4, '0')}.png`).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    ])
    const mix = Buffer.alloc(a.length)
    for (let k = 0; k < a.length; k++) mix[k] = Math.round(a[k] * (1 - w) + z[k] * w)
    await sharp(mix, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toFile(dst)
  }
}

const reuse = args.includes('--reuse')
const srv = reuse ? null : await labServer(opt('url'))
const browser = reuse ? null : await labBrowser()
try {
  // A fresh headless Chrome stalls its first pages while its GPU process warms up.
  for (let i = 0; i < 2 && browser; i++) {
    const { ctx } = await openPage(browser, srv.url, PROFILES.laptop, '', { settle: 500 }).catch(() => ({ ctx: null }))
    await ctx?.close()
  }
  for (const f of FRAMINGS.filter((f) => !only || only.split(',').includes(f.name))) {
    const raw = resolve(work, f.name, 'raw')
    const loop = resolve(work, f.name, 'loop')
    const t0 = Date.now()
    if (!reuse) await captureLoop(browser, srv.url, f, raw, loop)
    else if (!existsSync(`${loop}/0000.png`)) throw new Error(`--reuse: no capture in ${loop}`)
    const meta = await sharp(`${loop}/0000.png`).metadata()
    const h264 = encode(loop, resolve(outDir, `loop-${f.name}.mp4`), 'h264', f.budget)
    const vp9 = encode(loop, resolve(outDir, `loop-${f.name}.webm`), 'vp9', f.budget)
    const line = `[loop] ${f.name} ${meta.width}x${meta.height} ${seconds}s @${FPS} (${Math.round((Date.now() - t0) / 1000)} s): mp4 crf ${h264.crf} ${h264.kb} KB, webm crf ${vp9.crf} ${vp9.kb} KB`
    console.log(line)
    writeFileSync(resolve(work, f.name, 'result.txt'), line + '\n')
  }
} finally {
  await browser?.close()
  srv?.stop()
}

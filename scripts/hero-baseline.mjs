/**
 * The hero's visual-regression check (HERO_SPEC.md, "Lock"). Renders the frozen frame (?freeze=1: every
 * clock and agent held, randomness seeded, src/hero/freeze.ts) of the production build in headless Chrome
 * and compares it with the baselines in scripts/baselines/hero/.
 *
 *   npm run hero:baseline              compare (exit 1 on a diff above the threshold)
 *   npm run hero:baseline -- --update  write new baselines (after a deliberate change to the spec)
 *   --url http://localhost:5201        use a server that is already running (else it builds nothing and
 *                                      starts `vite preview` on dist/; run `npm run build` first)
 *   --out <dir>                        where the current shots and diff images go (default .hero-shots/)
 *
 * Shots: the hero at 390x844, 768x1024, 1440x900 and 1920x1080, and the docked head (the hero scrolled
 * past) at 390x844 and 1440x900. GPU output differs between machines and drivers: the baselines are only
 * comparable on the machine class that wrote them (see scripts/baselines/hero/README.md).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}

/** Share of differing pixels (after pixelmatch's per-pixel colour threshold) that fails a shot. */
const MAX_DIFF = 0.002
const COLOR_THRESHOLD = 0.1

export const SHOTS = [
  { name: 'hero-390x844', width: 390, height: 844, scale: 2, mobile: true },
  { name: 'hero-768x1024', width: 768, height: 1024, scale: 2, mobile: true },
  { name: 'hero-1440x900', width: 1440, height: 900, scale: 1, mobile: false },
  { name: 'hero-1920x1080', width: 1920, height: 1080, scale: 1, mobile: false },
  { name: 'docked-390x844', width: 390, height: 844, scale: 2, mobile: true, docked: true },
  { name: 'docked-1440x900', width: 1440, height: 900, scale: 1, mobile: false, docked: true },
]

export function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error('No Chrome found: set CHROME_PATH.')
  return found
}

/** Starts `vite preview` on a free port and resolves its URL (or uses --url). */
export async function server(url) {
  if (url) return { url, stop() {} }
  if (!existsSync('dist/index.html')) throw new Error('No dist/: run `npm run build` first.')
  const port = Number(process.env.HERO_PORT ?? 5301)
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'ignore'] })
  await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('vite preview did not start')), 20000)
    child.stdout.on('data', (d) => {
      if (String(d).includes(String(port))) {
        clearTimeout(timer)
        ok()
      }
    })
    child.on('exit', (code) => fail(new Error(`vite preview exited (${code})`)))
  })
  return { url: `http://localhost:${port}`, stop: () => child.kill() }
}

/** The frozen frame of one shot, as a PNG buffer. */
export async function capture(browser, base, shot) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: shot.scale,
    isMobile: shot.mobile,
    hasTouch: shot.mobile,
    reducedMotion: 'no-preference',
  })
  const page = await context.newPage()
  const errors = []
  // Console errors and warnings fail a shot, except three's deprecation of THREE.Clock, which
  // @react-three/fiber (the other sections' scene, not the hero) still triggers.
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !m.text().includes('THREE.Clock') && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  // (One reload if the scene is not live in 20 s: a local preview server can stall a fresh context's requests.)
  for (let attempt = 0; ; attempt++) {
    await page.goto(`${base}/?freeze=1`, { waitUntil: 'load', timeout: 120000 })
    try {
      await page.waitForSelector('.hero-cinematic[data-live]', { timeout: 20000 })
      break
    } catch (err) {
      if (attempt) throw err
      errors.length = 0
    }
  }
  await page.evaluate(() => document.fonts.ready)
  if (shot.progress !== undefined) {
    // Mid hand-off (scripts/hero-compare.mjs): the pin scrolled to this share of its length, the scrub settled.
    await page.evaluate((p) => {
      const hero = document.getElementById('hero')
      window.scrollTo(0, (hero.offsetHeight - innerHeight) * p)
    }, shot.progress)
  }
  if (shot.docked) {
    // Past the pin: the hero hands over and the head docks in the launcher.
    await page.evaluate(() => {
      const hero = document.getElementById('hero')
      window.scrollTo(0, hero.offsetHeight)
    })
    await page.waitForSelector('canvas.robot-canvas.is-docked', { timeout: 15000 })
    // The docked head alone: the sections' own scene (About's portrait, its stars) is not the hero's and
    // keeps moving, so the shot is the launcher's corner over the page's base colour.
    await page.addStyleTag({ content: '#root > :not(.chat) { visibility: hidden !important }' })
  }
  // The copy's entrance (2 s), the poster's crossfade and the neck's spring settling.
  await page.waitForTimeout(3500)
  const clip = shot.docked
    ? await page.evaluate(() => {
        const r = document.querySelector('.chat-launcher').getBoundingClientRect()
        const pad = 48
        return { x: Math.max(0, r.left - pad), y: Math.max(0, r.top - pad), width: Math.min(innerWidth, r.right + pad) - Math.max(0, r.left - pad), height: Math.min(innerHeight, r.bottom + pad) - Math.max(0, r.top - pad) }
      })
    : undefined
  const png = await page.screenshot({ type: 'png', clip })
  await context.close()
  return { png, errors }
}

export async function launch(warmUrl) {
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', '--force-color-profile=srgb'] })
  // A fresh headless Chrome can leave its first pages' task queues idle while its GPU process warms up (the
  // hero then stays on its poster): two throwaway loads first.
  if (warmUrl) {
    for (let i = 0; i < 2; i++) {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      await page.goto(warmUrl).catch(() => {})
      await page.waitForSelector('.hero-cinematic[data-live]', { timeout: 15000 }).catch(() => {})
      await ctx.close()
    }
  }
  return browser
}

async function main() {
  const dir = resolve('scripts/baselines/hero')
  const out = resolve(opt('out', '.hero-shots'))
  mkdirSync(dir, { recursive: true })
  mkdirSync(out, { recursive: true })
  const srv = await server(opt('url'))
  const browser = await launch(srv.url)
  let failed = 0
  try {
    for (const shot of SHOTS) {
      const { png, errors } = await capture(browser, srv.url, shot)
      writeFileSync(resolve(out, `${shot.name}.png`), png)
      if (errors.length) {
        failed++
        console.log(`FAIL ${shot.name}: console output\n  ${errors.join('\n  ')}`)
      }
      const file = resolve(dir, `${shot.name}.png`)
      if (flag('update') || !existsSync(file)) {
        writeFileSync(file, png)
        console.log(`wrote ${shot.name}`)
        continue
      }
      const a = PNG.sync.read(readFileSync(file))
      const b = PNG.sync.read(png)
      if (a.width !== b.width || a.height !== b.height) {
        failed++
        console.log(`FAIL ${shot.name}: size ${b.width}x${b.height} vs baseline ${a.width}x${a.height}`)
        continue
      }
      const diff = new PNG({ width: a.width, height: a.height })
      const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: COLOR_THRESHOLD })
      const share = n / (a.width * a.height)
      const ok = share <= MAX_DIFF
      if (!ok) {
        failed++
        writeFileSync(resolve(out, `${shot.name}.diff.png`), PNG.sync.write(diff))
      }
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${shot.name}: ${(share * 100).toFixed(3)}% of pixels differ (limit ${(MAX_DIFF * 100).toFixed(1)}%)`)
    }
  } finally {
    await browser.close()
    srv.stop()
  }
  process.exit(failed ? 1 : 0)
}

// Run directly (scripts/hero-perf.mjs imports the helpers).
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/hero-baseline.mjs')) main()

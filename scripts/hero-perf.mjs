/**
 * The hero's performance guard (HERO_SPEC.md, "Lock"): Lighthouse's mobile profile on the home route, then an
 * in-session check on a phone viewport with the CPU throttled 4x. Exit 1 if any budget is missed.
 *
 *   npm run build && npm run hero:perf
 *   npm run hero:perf -- --url http://localhost:5201     against a server that is already running
 *
 * Lab runs cannot measure INP (it needs real input): Total Blocking Time is its budgeted proxy here.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'
import { chromePath, launch, server } from './hero-baseline.mjs'

export const BUDGETS = {
  performance: 90, // Lighthouse score, mobile
  lcpMs: 2500,
  cls: 0, // (anything under 0.001 counts as 0)
  tbtMs: 200,
  transferBytes: 2.5 * 1024 * 1024, // the home route's whole transfer, the hero's assets included
  avgFps: 45, // in the hero, phone viewport, CPU 4x slower
  minFps: 30, // the worst 1 s window
  heapMB: 150,
  longTasksAfterLoad: 0, // tasks over 50 ms once the hero has settled
}

const args = process.argv.slice(2)
const i = args.indexOf('--url')
const srv = await server(i >= 0 ? args[i + 1] : undefined)
const rows = []
const check = (name, value, ok, budget) => rows.push({ name, value, budget, ok })

try {
  // ---- Lighthouse, mobile (its default: a mid-range phone, 4x CPU, slow 4G)
  const chrome = await chromeLauncher.launch({ chromePath: chromePath(), chromeFlags: ['--headless=new', '--enable-gpu', '--ignore-gpu-blocklist'] })
  const { lhr } = await lighthouse(`${srv.url}/`, { port: chrome.port, onlyCategories: ['performance'], output: 'json', logLevel: 'error' })
  await chrome.kill()
  mkdirSync('.hero-shots', { recursive: true })
  writeFileSync('.hero-shots/lighthouse-mobile.json', JSON.stringify(lhr))
  const a = lhr.audits
  const perf = Math.round(lhr.categories.performance.score * 100)
  check('Lighthouse performance', perf, perf >= BUDGETS.performance, `>= ${BUDGETS.performance}`)
  check('LCP (ms)', Math.round(a['largest-contentful-paint'].numericValue), a['largest-contentful-paint'].numericValue <= BUDGETS.lcpMs, `<= ${BUDGETS.lcpMs}`)
  check('CLS', +a['cumulative-layout-shift'].numericValue.toFixed(4), a['cumulative-layout-shift'].numericValue < 0.001, '0')
  check('TBT (ms, the INP proxy)', Math.round(a['total-blocking-time'].numericValue), a['total-blocking-time'].numericValue <= BUDGETS.tbtMs, `<= ${BUDGETS.tbtMs}`)
  const bytes = a['total-byte-weight'].numericValue
  check('Transfer (MB)', +(bytes / 1048576).toFixed(2), bytes <= BUDGETS.transferBytes, `<= ${(BUDGETS.transferBytes / 1048576).toFixed(1)}`)

  // ---- In session: a phone viewport, CPU 4x slower, 10 s in the hero after it has settled
  const browser = await launch(srv.url)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.addInitScript(() => {
    window.__lt = []
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]) }).observe({ type: 'longtask', buffered: true })
  })
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  for (let k = 0; k < 3; k++) {
    await page.goto(`${srv.url}/`)
    if (await page.waitForSelector('.hero-cinematic[data-live]', { timeout: 30000 }).then(() => true).catch(() => false)) break
  }
  await page.waitForTimeout(6000)
  const settled = await page.evaluate(() => performance.now())
  const t = await page.evaluate(() => new Promise((ok) => { const t = []; const s = (n) => { t.push(n); if (n - t[0] < 10000) requestAnimationFrame(s); else ok(t) }; requestAnimationFrame(s) }))
  let minFps = Infinity
  for (let j = 0; j < t.length; j++) { let k = j; while (k < t.length && t[k] - t[j] < 1000) k++; if (t[t.length - 1] - t[j] >= 1000) minFps = Math.min(minFps, k - j - 1) }
  const avgFps = (t.length - 1) / ((t[t.length - 1] - t[0]) / 1000)
  const heap = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0))
  const lt = await page.evaluate((s) => window.__lt.filter(([at]) => at > s).length, settled)
  check('Hero fps, phone, CPU 4x (avg)', +avgFps.toFixed(1), avgFps >= BUDGETS.avgFps, `>= ${BUDGETS.avgFps}`)
  check('Hero fps, phone, CPU 4x (worst 1 s)', minFps, minFps >= BUDGETS.minFps, `>= ${BUDGETS.minFps}`)
  check('JS heap (MB)', Math.round(heap), heap < BUDGETS.heapMB, `< ${BUDGETS.heapMB}`)
  check('Long tasks after load', lt, lt <= BUDGETS.longTasksAfterLoad, `${BUDGETS.longTasksAfterLoad}`)
  await browser.close()
} finally {
  srv.stop()
}

const w = Math.max(...rows.map((r) => r.name.length))
for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(w)}  ${String(r.value).padStart(8)}  (budget ${r.budget})`)
process.exit(rows.every((r) => r.ok) ? 0 : 1)

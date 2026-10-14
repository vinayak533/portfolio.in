/**
 * The hero's performance guard (HERO_SPEC.md, "Lock"): Lighthouse's mobile profile on the home route, then a
 * frame-time smoke test on a laptop and a phone profile (scripts/perf-lab.mjs). Exit 1 if any budget is missed.
 *
 *   npm run build && npm run hero:perf
 *   npm run hero:perf -- --url http://localhost:5201     against a server that is already running
 *
 * Lab runs cannot measure INP (it needs real input): Total Blocking Time is its budgeted proxy here.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'
import { chromePath, server } from './hero-baseline.mjs'
import { PROFILES, RUN, labBrowser, openPage, stats } from './perf-lab.mjs'

export const BUDGETS = {
  performance: 90, // Lighthouse score, mobile
  lcpMs: 2500,
  cls: 0, // (anything under 0.001 counts as 0)
  tbtMs: 200,
  transferBytes: 2.5 * 1024 * 1024, // the home route's whole transfer, the hero's assets included
  fps60: 55, // the frame-time smoke test: 55+ fps with p95 <= 20 ms...
  p95at60: 20,
  fps30: 28, // ...or a steady 30 (the frame pacer's lock) with p95 <= 34 ms
  p95at30: 34,
  over50: 0, // frames over 50 ms in the hero (idle, pointer) and the hand-off (both ways)
  heapMB: 150,
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

  // ---- Frame-time smoke test (scripts/perf-lab.mjs): the production build as visitors get it (its own frame
  // pacing and quality ladder on), this machine's GPU; phones are its CPU slowed 4x (their GPU cost is
  // under-represented). Per HERO_SPEC.md: 55+ fps (p95 <= 20 ms) or a steady 30 (p95 <= 34 ms), no frame over
  // 50 ms in the hero or the hand-off, the JS heap under 150 MB.
  const browser = await labBrowser()
  try {
    // A fresh headless Chrome stalls its first pages while its GPU process warms up: two throwaway loads first.
    for (let i = 0; i < 2; i++) {
      const { ctx } = await openPage(browser, srv.url, PROFILES.laptop, '', { settle: 500 }).catch(() => ({ ctx: null }))
      await ctx?.close()
    }
    for (const name of ['laptop', 'phone-mid']) {
      const profile = PROFILES[name]
      const { page, ctx, cdp } = await openPage(browser, srv.url, profile, '', { settle: 6000 })
      const windows = {}
      for (const sc of ['idle', 'pointer', 'handoff']) Object.assign(windows, await RUN[sc](page, profile, cdp))
      const heap = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0))
      await ctx.close()
      for (const [k, w] of Object.entries(windows)) {
        const st = stats(w.frames, w.long, w.since)
        const smooth = (st.fps >= BUDGETS.fps60 && st.p95 <= BUDGETS.p95at60) || (st.fps >= BUDGETS.fps30 && st.p95 <= BUDGETS.p95at30)
        check(`${name} ${k}: fps, p95 (ms)`, `${st.fps} / ${st.p95}`, smooth, `>= ${BUDGETS.fps60} / <= ${BUDGETS.p95at60}, or >= ${BUDGETS.fps30} / <= ${BUDGETS.p95at30}`)
        check(`${name} ${k}: frames over 50 ms`, st.over50, st.over50 <= BUDGETS.over50, `${BUDGETS.over50}`)
      }
      check(`${name}: JS heap (MB)`, Math.round(heap), heap < BUDGETS.heapMB, `< ${BUDGETS.heapMB}`)
    }
  } finally {
    await browser.close()
  }
} finally {
  srv.stop()
}

const w = Math.max(...rows.map((r) => r.name.length))
for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(w)}  ${String(r.value).padStart(8)}  (budget ${r.budget})`)
process.exit(rows.every((r) => r.ok) ? 0 : 1)

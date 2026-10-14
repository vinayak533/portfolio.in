/**
 * Visual integrity across a change: the frozen frame (?freeze=1, src/hero/freeze.ts) of two builds, side by
 * side, at the baseline sizes (scripts/hero-baseline.mjs SHOTS), scored by SSIM (luminance, 8 x 8 windows) and
 * by pixelmatch's share of differing pixels. Diff images go to --out.
 *
 *   node scripts/hero-compare.mjs --a http://localhost:5401 --b http://localhost:5301 [--query tier=medium]
 *   --dist-a <dir> --dist-b <dir>   serve two builds with `vite preview` instead of URLs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { SHOTS, capture, launch } from './hero-baseline.mjs'

const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d)

async function serve(dir, port) {
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dir, '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'ignore'] })
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('vite preview did not start')), 20000)
    child.stdout.on('data', (d) => String(d).includes(String(port)) && (clearTimeout(t), ok()))
  })
  return { url: `http://localhost:${port}`, stop: () => child.kill() }
}

/** Mean SSIM over 8 x 8 windows of the luminance (Rec. 709), the standard constants for 8-bit images. */
export function ssim(a, b, w, h) {
  const L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
  const C1 = (0.01 * 255) ** 2
  const C2 = (0.03 * 255) ** 2
  let sum = 0
  let n = 0
  for (let y = 0; y + 8 <= h; y += 8) {
    for (let x = 0; x + 8 <= w; x += 8) {
      let ma = 0, mb = 0, va = 0, vb = 0, cov = 0
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
        const k = ((y + j) * w + x + i) * 4
        const p = L(a, k), q = L(b, k)
        ma += p; mb += q; va += p * p; vb += q * q; cov += p * q
      }
      ma /= 64; mb /= 64
      va = va / 64 - ma * ma; vb = vb / 64 - mb * mb; cov = cov / 64 - ma * mb
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2))
      n++
    }
  }
  return sum / n
}

const out = resolve(opt('out', '.hero-shots/compare'))
mkdirSync(out, { recursive: true })
const srvA = opt('dist-a') ? await serve(opt('dist-a'), 5321) : { url: opt('a'), stop() {} }
const srvB = opt('dist-b') ? await serve(opt('dist-b'), 5322) : { url: opt('b'), stop() {} }
const query = opt('query', '')
const only = opt('shots', '')
const browser = await launch(srvA.url)
const rows = []
try {
  // --progress 0.3,0.55,0.8: frames from inside the hand-off too (the dissolve, the head's flight).
  const mid = opt('progress', '')
    .split(',')
    .filter(Boolean)
    .flatMap((p) => [
      { name: `mid${p}-390x844`, width: 390, height: 844, scale: 2, mobile: true, progress: +p },
      { name: `mid${p}-1440x900`, width: 1440, height: 900, scale: 1, mobile: false, progress: +p },
    ])
  for (const shot of [...SHOTS.filter((s) => !only || only.split(',').includes(s.name)), ...mid]) {
    const s = { ...shot }
    // (--qa / --qb: a query for one side only, e.g. a lab switch that reverts a fix.)
    const q = (side) => [query, opt(side, '')].filter(Boolean).join('&')
    const a = await capture(browser, srvA.url + (q('qa') ? `/?${q('qa')}&freeze=1&x=` : ''), s)
    const b = await capture(browser, srvB.url + (q('qb') ? `/?${q('qb')}&freeze=1&x=` : ''), s)
    const A = PNG.sync.read(a.png)
    const B = PNG.sync.read(b.png)
    writeFileSync(resolve(out, `${shot.name}${query ? '-' + query.replace(/\W+/g, '_') : ''}.a.png`), a.png)
    writeFileSync(resolve(out, `${shot.name}${query ? '-' + query.replace(/\W+/g, '_') : ''}.b.png`), b.png)
    if (A.width !== B.width || A.height !== B.height) {
      rows.push({ shot: shot.name, error: 'size' })
      continue
    }
    const diff = new PNG({ width: A.width, height: A.height })
    const n = pixelmatch(A.data, B.data, diff.data, A.width, A.height, { threshold: 0.1 })
    writeFileSync(resolve(out, `${shot.name}${query ? '-' + query.replace(/\W+/g, '_') : ''}.diff.png`), PNG.sync.write(diff))
    const score = ssim(A.data, B.data, A.width, A.height)
    rows.push({ shot: shot.name, ssim: +score.toFixed(5), diffPct: +((n / (A.width * A.height)) * 100).toFixed(3), errors: [...a.errors, ...b.errors].length })
    console.log(`${shot.name.padEnd(18)} SSIM ${score.toFixed(5)}  differing ${((n / (A.width * A.height)) * 100).toFixed(3)}%`)
  }
} finally {
  await browser.close()
  srvA.stop()
  srvB.stop()
}
writeFileSync(resolve(out, 'compare.json'), JSON.stringify(rows, null, 1))
process.exit(rows.every((r) => r.ssim >= 0.98) ? 0 : 1)

/**
 * The hero's posters: the first paint (src/dom/sections/Hero.tsx), one per framing.
 *
 *   npm run poster
 *
 * Reads scripts/source/poster-{phone,tablet,desktop}.webp: captures of the live hero with no text, no
 * navigation, no vignette and no grain (the page draws those over the poster): phones at 400 x 866 CSS px
 * (2x), portrait tablets at 768 x 1024 (1.5x), landscape screens at 1440 x 900 (4/3x), each settled after
 * its load sequence with the robot's eyes open. Writes public/hero/poster-{name}.avif and .webp, each the
 * best quality under its budget (phones 120 KB: the mobile LCP image).
 */
import sharp from 'sharp'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const POSTERS = [
  { name: 'phone', budget: 120 * 1024 },
  { name: 'tablet', budget: 170 * 1024 },
  { name: 'desktop', budget: 200 * 1024 },
]
const outDir = resolve('public/hero')
mkdirSync(outDir, { recursive: true })

async function under(src, format, budget, out) {
  for (let q = format === 'avif' ? 62 : 82; q >= 20; q -= 4) {
    const buf = await sharp(src)[format]({ quality: q, effort: format === 'avif' ? 6 : 6 }).toBuffer()
    if (buf.length <= budget || q <= 20) {
      await sharp(buf).toFile(out)
      return { q, kb: Math.round(statSync(out).size / 1024) }
    }
  }
}

for (const { name, budget } of POSTERS) {
  const src = resolve(`scripts/source/poster-${name}.webp`)
  if (!existsSync(src)) {
    console.error(`[poster] missing ${src}`)
    process.exitCode = 1
    continue
  }
  const { width, height } = await sharp(src).metadata()
  const avif = await under(src, 'avif', budget, resolve(outDir, `poster-${name}.avif`))
  const webp = await under(src, 'webp', budget * 1.4, resolve(outDir, `poster-${name}.webp`))
  console.log(`[poster] ${name} ${width}x${height}: avif q${avif.q} ${avif.kb} KB, webp q${webp.q} ${webp.kb} KB`)
}

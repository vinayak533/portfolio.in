/**
 * The About portrait's sharp renditions.
 *
 *   npm run about-photo                       (reads public/portrait/about.cutout.png, from `npm run portrait`)
 *   npm run about-photo -- path/to.cutout.png (any RGBA cutout)
 *
 * The 3D crystals assemble into the cutout; once they have settled, About shows these over them, registered to
 * them, at the screen's own resolution (src/dom/sections/About.tsx). Writes public/portrait/about-<w>.avif (q 82)
 * and .webp (q 84), alpha kept, at 800, 1200, 1600 and 2000 px wide, never wider than the cutout itself (nothing is
 * upscaled), and prints the widths for `about.photo.widths` in src/content.ts.
 */
import sharp from 'sharp'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const input = resolve(process.argv[2] ?? 'public/portrait/about.cutout.png')
if (!existsSync(input)) {
  console.error(`[about] not found: ${input} (run \`npm run portrait\` first)`)
  process.exit(1)
}
const out = resolve('public/portrait')
const { width: W, height: H } = await sharp(input).metadata()
const widths = [800, 1200, 1600, 2000].filter((w) => w < W * 0.9)
widths.push(Math.min(W, 2000))
const kb = (f) => Math.round(statSync(f).size / 1024) + ' KB'
for (const w of widths) {
  const r = () => sharp(input).resize({ width: w, kernel: 'lanczos3' })
  const avif = `${out}/about-${w}.avif`
  const webp = `${out}/about-${w}.webp`
  await r().avif({ quality: 82, effort: 6 }).toFile(avif)
  await r().webp({ quality: 84, alphaQuality: 90, effort: 6, smartSubsample: true }).toFile(webp)
  console.log(`  ${w}x${Math.round((w * H) / W)}: avif ${kb(avif)}, webp ${kb(webp)}`)
}
console.log(`[about] widths: [${widths.join(', ')}]`)
if (W < 2000) console.log(`[about] the cutout is ${W} px wide: for full sharpness on large 2x screens, provide an original of at least 2000 px across (2000 x 2500 or larger).`)

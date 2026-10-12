/**
 * The certificate images the chat assistant shows (src/assistant.ts `certifications`).
 *
 *   npm run certs
 *
 * Reads the originals from src/img (screenshots and exports, named as they were saved) and writes
 * public/certs/<id>.webp, at most 1200 px wide (nothing is upscaled), q 82. The ids here must match
 * the `image` paths in src/assistant.ts. An original that isn't listed is ignored.
 */
import sharp from 'sharp'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const SOURCES = {
  'anthropic-ai-fluency': 'Screenshot 2026-03-11 215745.png',
  'aws-genai': 'Screenshot 2026-03-14 020245.png',
  'hackerrank-sql-advanced': 'Screenshot 2026-01-16 210820.png',
  'kaggle-python-coder': 'Python Coder - Copy.png',
  'ibm-deep-learning-tensorflow': 'Screenshot 2025-12-26 121733.png',
  'tata-data-visualisation': 'Screenshot 2025-08-16 220216.png',
  'ibm-machine-learning-python': 'Screenshot 2025-08-06 101849 - Copy.png',
  'ibm-data-analysis-python': 'Screenshot 2025-07-20 214802 - Copy.png',
  'ibm-sql-databases': 'Screenshot 2025-07-20 205003 - Copy.png',
  'openai-agents-workflows': 'a188c0fd-bf2d-46ac-9f40-20dba9f4d4a6.png',
}

const from = resolve('src/img')
const out = resolve('public/certs')
mkdirSync(out, { recursive: true })
const kb = (f) => Math.round(statSync(f).size / 1024) + ' KB'

for (const [id, name] of Object.entries(SOURCES)) {
  const input = `${from}/${name}`
  if (!existsSync(input)) {
    console.warn(`[certs] missing: ${name} (for ${id})`)
    continue
  }
  const file = `${out}/${id}.webp`
  await sharp(input).resize({ width: 1200, withoutEnlargement: true, kernel: 'lanczos3' }).webp({ quality: 82, effort: 6 }).toFile(file)
  const { width, height } = await sharp(file).metadata()
  console.log(`  ${id}: ${width}x${height}, ${kb(file)}`)
}

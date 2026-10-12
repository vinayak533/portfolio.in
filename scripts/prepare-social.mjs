/**
 * Social-share card and home-screen icon.
 *
 *   npm run social
 *
 * Output:
 *   public/og.jpg                1200x630, the hero photo with name and role (og:image, twitter:image)
 *   public/apple-touch-icon.png  180x180, from public/favicon.svg
 *
 * Re-run after changing the name or role in src/content.ts, or the hero photo.
 * Text is rasterised by librsvg with the system sans-serif, so no font files are needed.
 */
import sharp from 'sharp'
import { resolve } from 'node:path'

const { site } = await import('../src/content.ts')

const W = 1200
const H = 630
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])

// The island and figure sit right of centre; a left-hand shade keeps the type legible.
const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="shade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#07070d" stop-opacity="0.92"/>
      <stop offset="0.5" stop-color="#07070d" stop-opacity="0.55"/>
      <stop offset="0.85" stop-color="#07070d" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#shade)"/>
  <text x="72" y="250" fill="#a08bff" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="26" letter-spacing="4">${esc(site.role.toUpperCase())}</text>
  <text x="68" y="350" fill="#eceaf2" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-weight="700" font-size="96">${esc(site.name)}</text>
  <text x="72" y="420" fill="#eceaf2" fill-opacity="0.82" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="30">LLM applications · agent systems · ML services</text>
  <text x="72" y="466" fill="#eceaf2" fill-opacity="0.6" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="24">${esc(site.location)}</text>
</svg>`

// The social card's background photo.
await sharp(resolve('scripts/source/night.webp'))
  .resize(W, H, { fit: 'cover', position: 'centre' })
  .composite([{ input: Buffer.from(overlay) }])
  .jpeg({ quality: 84, mozjpeg: true })
  .toFile(resolve('public/og.jpg'))

await sharp(resolve('public/favicon.svg'), { density: 384 })
  .resize(180, 180)
  .png()
  .toFile(resolve('public/apple-touch-icon.png'))

console.log('[social] wrote public/og.jpg and public/apple-touch-icon.png')

/**
 * Social-share card and home-screen icon.
 *
 *   npm run social
 *
 * Output:
 *   public/og.jpg                1200x630, the logo in src/img/download.jpeg on black (og:image, twitter:image)
 *   public/apple-touch-icon.png  180x180, from public/favicon.svg
 *
 * Re-run after changing the logo. Bump OG_VERSION in vite.config.ts too, so link
 * previews that cached the old card fetch the new one.
 */
import sharp from 'sharp'
import { resolve } from 'node:path'

const W = 1200
const H = 630

// The logo (src/img/download.jpeg, white on black) centred on a black card. Link previews
// that show a square thumbnail (WhatsApp, Slack, iMessage) crop the middle, so the mark
// stays whole; the title and description sit beside it in the preview anyway.
const logo = await sharp(resolve('src/img/download.jpeg')).resize(H, H, { fit: 'cover', kernel: 'lanczos3' }).toBuffer()
await sharp({ create: { width: W, height: H, channels: 3, background: '#000000' } })
  .composite([{ input: logo, left: Math.round((W - H) / 2), top: 0 }])
  .jpeg({ quality: 90, mozjpeg: true })
  .toFile(resolve('public/og.jpg'))

await sharp(resolve('public/favicon.svg'), { density: 384 })
  .resize(180, 180)
  .png()
  .toFile(resolve('public/apple-touch-icon.png'))

console.log('[social] wrote public/og.jpg and public/apple-touch-icon.png')

/**
 * Encodes the project reels for the web.
 *
 *   npm run videos
 *
 * Reads the masters in src/project-videos/ (not shipped) and writes, per
 * project, to public/works/:
 *   <id>-1080.mp4  desktop: 3D exhibit texture and case study
 *   <id>-720.mp4   phones and low-tier GPUs
 *   <id>.webp      poster: the frame at `media.start` in src/content.ts, which
 *                  is also where playback begins, so poster -> video is seamless
 *
 * H.264 (hardware-decoded everywhere) with a keyframe every second, so the
 * case study can seek its HD copy into sync with the exhibit almost instantly,
 * and `faststart` so playback begins before the file has finished loading.
 *
 * Needs ffmpeg: on PATH, or FFMPEG=path/to/ffmpeg.
 */
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { projects } from '../src/content.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const at = (...p) => join(root, ...p)
const ffmpeg = process.env.FFMPEG || 'ffmpeg'

/** Master file per reel id (the id is the poster's basename in content.ts). */
const MASTERS = {
  loom: 'Loom Reveal.mp4',
  lazyhire: 'LazyHire Reel.mp4',
  aria: 'ARIA Showcase.mp4',
  health: 'Health Assistant Reel.mp4',
  predictlab: 'PredictLab Reel.mp4',
}

/**
 * 1080p plays on desktop exhibits and in the case study, 720p on phones and
 * low-tier GPUs. Low CRF keeps UI text sharp; aq-mode 3 spends extra bits in
 * dark regions, so the near-black UI backgrounds do not band or block.
 */
const RENDITIONS = [
  { suffix: '1080', height: 1080, crf: 19, maxrate: '7000k', level: '4.1' },
  { suffix: '720', height: 720, crf: 21, maxrate: '3000k', level: '4.0' },
]

function run(args) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
  if (r.error) throw new Error(`ffmpeg not found (${r.error.message}). Put it on PATH or set FFMPEG.`)
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`)
}

const mb = (f) => {
  const b = statSync(f).size
  return b < 1e6 ? Math.round(b / 1e3) + ' KB' : (b / 1e6).toFixed(1) + ' MB'
}

mkdirSync(at('public/works'), { recursive: true })

for (const p of projects) {
  if (!p.media?.poster) continue
  const id = p.media.poster.replace(/^.*\/|\.webp$/g, '')
  const master = MASTERS[id] && at('src/project-videos', MASTERS[id])
  if (!master || !existsSync(master)) {
    console.warn(`skip ${p.title}: no master for "${id}"`)
    continue
  }

  for (const r of RENDITIONS) {
    const out = at('public/works', `${id}-${r.suffix}.mp4`)
    run([
      '-i', master,
      '-vf', `scale=-2:${r.height}:flags=lanczos,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(r.crf),
      '-maxrate', r.maxrate, '-bufsize', String(parseInt(r.maxrate) * 2) + 'k',
      '-profile:v', 'high', '-level', r.level,
      '-g', '30', '-keyint_min', '30',
      '-x264-params', 'aq-mode=3:aq-strength=0.9:deblock=-1,-1',
      '-an', '-movflags', '+faststart',
      out,
    ])
    console.log(`${id}-${r.suffix}.mp4  ${mb(out)}`)
  }

  const poster = at('public/works', `${id}.webp`)
  run(['-ss', String(p.media.start ?? 0), '-i', master, '-frames:v', '1', '-vf', 'scale=1920:-2:flags=lanczos', '-c:v', 'libwebp', '-quality', '86', poster])
  console.log(`${id}.webp  ${mb(poster)}`)
}

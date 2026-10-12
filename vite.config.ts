import { defineConfig, loadEnv, type HtmlTagDescriptor, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import glsl from 'vite-plugin-glsl'
import { site } from './src/content'

/** The parts of Node's IncomingMessage the middleware uses (the project has no @types/node). */
interface NodeRequest {
  method?: string
  originalUrl?: string
  headers: Record<string, string | string[] | undefined>
  socket: { remoteAddress?: string }
  setEncoding(encoding: 'utf8'): void
  on(event: 'data', cb: (chunk: string) => void): void
  on(event: 'end', cb: () => void): void
}

/**
 * Serves POST /api/contact in `npm run dev` with the same handler Vercel runs
 * (server/contact.ts), reading RESEND_API_KEY etc. from .env.local. Server-only:
 * nothing here reaches the client bundle (only VITE_* variables ever do).
 */
function contactApi(): Plugin {
  return {
    name: 'contact-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      const env = loadEnv(server.config.mode, server.config.root, '')
      server.middlewares.use('/api/contact', (incoming, res) => {
        const req = incoming as unknown as NodeRequest
        let body = ''
        let size = 0
        req.setEncoding('utf8')
        req.on('data', (chunk: string) => {
          size += chunk.length
          // The handler rejects anything over 16 KB; stop buffering well past that.
          if (size <= 64 * 1024) body += chunk
        })
        req.on('end', async () => {
          try {
            const { handleContact } = (await server.ssrLoadModule('/server/contact.ts')) as typeof import('./server/contact')
            const headers = new Headers()
            for (const [k, v] of Object.entries(req.headers)) {
              if (typeof v === 'string') headers.set(k, v)
              else if (Array.isArray(v)) headers.set(k, v.join(', '))
            }
            headers.set('x-forwarded-for', req.socket.remoteAddress ?? 'local')
            const method = req.method ?? 'GET'
            const request = new Request(`http://localhost${req.originalUrl ?? '/api/contact'}`, {
              method,
              headers,
              body: method === 'GET' || method === 'HEAD' ? undefined : body,
            })
            const response = await handleContact(request, env)
            res.statusCode = response.status
            response.headers.forEach((value, key) => res.setHeader(key, value))
            res.end(await response.text())
          } catch (err) {
            server.config.logger.error(`[contact] ${String(err)}`)
            res.statusCode = 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: 'The message couldn’t be sent. Please try again.' }))
          }
        })
      })
    },
  }
}

/**
 * Social-card tags that need the site's absolute URL. It comes from SITE_URL
 * (e.g. https://example.com) or, on Vercel, the project's production domain.
 * Without one, og:image stays relative and there is no canonical / og:url.
 */
function siteMeta(): Plugin {
  let url = ''
  return {
    name: 'site-meta',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, '')
      const raw = env.SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
      url = raw.trim().replace(/\/+$/, '')
    },
    transformIndexHtml() {
      const image = `${url}/og.jpg`
      const tags: HtmlTagDescriptor[] = [
        { tag: 'meta', attrs: { property: 'og:image', content: image }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'twitter:image', content: image }, injectTo: 'head' },
      ]
      if (url) {
        tags.push(
          { tag: 'meta', attrs: { property: 'og:url', content: `${url}/` }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'canonical', href: `${url}/` }, injectTo: 'head' },
        )
      }
      return tags
    },
  }
}

/**
 * The hero's first paint, before any script runs: its copy (from src/content.ts, so it never drifts) over
 * the poster index.html already has, laid out by the same CSS as the app's (hero.css .hero-intro, a fixed
 * box), and preloads for the two web fonts it is set in (built only: their names are hashed). The copy sits
 * outside the app's root and the app adopts it rather than drawing its own (src/dom/HeroCopy.tsx): the page's
 * largest paint is this text, at the first paint, and it is never replaced.
 *
 * Built, the entry script starts two frames after that paint: run straight after the parser it holds the
 * main thread for the length of its compile (most of a second on a mid-range phone), and nothing, not even
 * this pre-rendered hero, is painted until it ends. It is still fetched at once (its modulepreload).
 */
function heroBoot(): Plugin {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const FONTS = [/instrument-serif-latin-400-italic-[\w-]+\.woff2$/, /space-grotesk-latin-wght-normal-[\w-]+\.woff2$/]
  return {
    name: 'hero-boot',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const copy =
          `<div class="hero-copy-layer" id="hero-copy"><div class="hero-intro hero-intro--both" data-on data-hero-intro>` +
          `<h1 class="hero-intro__name">Vinayak<span class="sr-only"> K V</span></h1>` +
          `<span class="hero-intro__rule" aria-hidden="true"></span>` +
          `<p class="hero-intro__tagline">${esc(site.tagline)}</p>` +
          `<p class="hero-intro__role">${esc(site.role)}</p></div></div>`
        const tags: HtmlTagDescriptor[] = []
        for (const file of Object.keys(ctx.bundle ?? {})) {
          if (FONTS.some((re) => re.test(file))) {
            tags.push({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: '' }, injectTo: 'head' })
          }
        }
        let out = html.replace('<!-- hero-boot-copy -->', copy)
        if (ctx.bundle) {
          out = out.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, (_, src: string) => {
            tags.push({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: '', href: src }, injectTo: 'head-prepend' })
            // (A background tab has no frames: a timer starts it there.)
            return `<script type="module">let go=()=>{go=()=>{};import('${src}')};requestAnimationFrame(()=>requestAnimationFrame(()=>go()));setTimeout(()=>go(),1000)</script>`
          })
        }
        return { html: out, tags }
      },
    },
  }
}

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), glsl({ minify: command === 'build' }), contactApi(), siteMeta(), heroBoot()],
  // OneDrive turns node_modules files into reparse points; without this the
  // Rolldown resolver treats them as broken symlinks and fails to resolve deps.
  resolve: { preserveSymlinks: true },
  server: { port: 5199, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
}))

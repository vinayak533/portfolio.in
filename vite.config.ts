import { defineConfig, loadEnv, type HtmlTagDescriptor, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import glsl from 'vite-plugin-glsl'

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

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), glsl({ minify: command === 'build' }), contactApi(), siteMeta()],
  // OneDrive turns node_modules files into reparse points; without this the
  // Rolldown resolver treats them as broken symlinks and fails to resolve deps.
  resolve: { preserveSymlinks: true },
  server: { port: 5199, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
}))

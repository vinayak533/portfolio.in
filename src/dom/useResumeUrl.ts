import { useEffect, useState } from 'react'
import { contact } from '../content'

let check: Promise<string | null> | null = null

/**
 * The résumé link, or null until a PDF is actually served at `contact.resume`.
 * One HEAD request per page load, shared by every caller. The content-type test
 * matters in `npm run dev`, which answers unknown paths with index.html.
 */
export function useResumeUrl() {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    check ??= fetch(contact.resume, { method: 'HEAD' })
      .then((r) => (r.ok && /pdf/i.test(r.headers.get('content-type') ?? '') ? contact.resume : null))
      .catch(() => null)
    check.then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [])
  return url
}

/**
 * The hero copy's markup, one string for both of its makers: the copy index.html paints before any script
 * (vite.config.ts heroBoot) and the app's own (src/dom/HeroCopy.tsx), so the two never drift and the scrim's
 * copy lays out exactly like the text's.
 *
 * The tagline is split for its entrance (src/hero/introFx.ts): each word its own span, "prototype chaos" the
 * words that resolve from a scramble and "production." the one that arrives with an underline. A tagline
 * without those words is split into plain words only. The real words are always in the DOM, in order, with
 * their spaces: the entrance only decorates them.
 */
const CHAOS = 'prototype chaos'
const PROD = 'production.'

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function taglineHtml(tagline: string): string {
  const out: string[] = []
  let i = 0
  const words = (part: string, cls: string, inner = false) => {
    for (const w of part.split(/\s+/).filter(Boolean)) {
      const t = inner ? `<span class="hi-s__t">${esc(w)}</span>` : esc(w)
      out.push(`<span class="${cls}" style="--i:${i++}">${t}</span>`)
    }
  }
  const at = tagline.indexOf(CHAOS)
  const pd = tagline.lastIndexOf(PROD)
  if (at < 0 || pd < at + CHAOS.length) {
    words(tagline, 'hi-w')
    return out.join(' ')
  }
  words(tagline.slice(0, at), 'hi-w')
  words(CHAOS, 'hi-w hi-s', true)
  words(tagline.slice(at + CHAOS.length, pd), 'hi-w hi-w--late')
  out.push(`<span class="hi-w hi-p" style="--i:${i++}">${esc(PROD)}</span>`)
  words(tagline.slice(pd + PROD.length), 'hi-w hi-w--late')
  return out.join(' ')
}

/** The block's inner markup. `heading`: the name is the page's h1 (the scrim's copy uses a div, hidden). */
export function introHtml(copy: { tagline: string; role: string }, heading = true): string {
  const tag = heading ? 'h1' : 'div'
  return (
    `<${tag} class="hero-intro__name"><span class="hero-intro__glyphs">Vinayak</span><span class="sr-only"> K V</span></${tag}>` +
    `<span class="hero-intro__rule" aria-hidden="true"></span>` +
    `<p class="hero-intro__tagline">${taglineHtml(copy.tagline)}</p>` +
    `<p class="hero-intro__role">${esc(copy.role)}</p>`
  )
}

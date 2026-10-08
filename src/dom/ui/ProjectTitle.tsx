import '@fontsource/instrument-serif/latin-400-italic.css'
import '@fontsource-variable/inter/opsz.css'
import '@fontsource/playfair-display/latin-500.css'
import '@fontsource/playfair-display/latin-500-italic.css'
import '@fontsource/orbitron/latin-700.css'
import '@fontsource/unbounded/latin-700.css'
import './projectTitle.css'
import type { Project } from '../../content'

/**
 * A project's name set in its own brand: the typeface and colours of the
 * product's UI in its reel. Unknown ids fall back to the site's display face.
 * Size comes from the caller's font-size; each brand scales itself to match
 * the others optically (see projectTitle.css).
 */
export function ProjectTitle({ project, className = '' }: { project: Project; className?: string }) {
  return (
    <span className={`brand-title brand-${project.id} ${className}`}>
      <span aria-hidden="true">{parts(project)}</span>
      <span className="sr-only">{project.title}</span>
    </span>
  )
}

function parts(p: Project) {
  switch (p.id) {
    case 'loom': {
      // The logo sets the domain smaller: loom.ai
      const [name, tld] = p.title.split('.')
      return tld ? (
        <>
          {name}
          <span className="brand-sub">.{tld}</span>
        </>
      ) : (
        p.title
      )
    }
    case 'lazyhire':
      // White "Lazy", amber "Hire", as in the logo.
      return /hire$/i.test(p.title) ? (
        <>
          {p.title.slice(0, -4)}
          <span className="brand-sub">{p.title.slice(-4)}</span>
        </>
      ) : (
        p.title
      )
    case 'bank-churn': {
      // ARIA: ivory serif, the last word in champagne italic.
      const i = p.title.lastIndexOf(' ')
      return i < 0 ? (
        p.title
      ) : (
        <>
          {p.title.slice(0, i + 1)}
          <span className="brand-sub">{p.title.slice(i + 1)}</span>
        </>
      )
    }
    default:
      return p.title
  }
}

import { Fragment } from 'react'
import { Section } from '../Section'
import { experience, type Role } from '../../content'
import { signals, useStore } from '../../store/useStore'
import { shatter } from '../../core/registry'
import { sampleGlyphs } from '../ui/sampleGlyphs'
import { holdEnd, waypointU } from '../../core/timeline'
import './experience.css'

/** Section progress at which the beam head reaches waypoint i (inverse of experienceHead). */
const progressAt = (u: number) => 0.02 + u * (holdEnd('experience') - 0.04)

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const isPresent = (r: Role) => /present/i.test(r.end)
const pad = (i: number) => String(i + 1).padStart(2, '0')

/** 'Jun 2026' -> months since year 0; 'Present' -> this month. */
function monthIndex(label: string) {
  const [mon, year] = label.trim().toLowerCase().split(/\s+/)
  const m = MONTHS.indexOf(mon.slice(0, 3))
  if (m < 0 || !year) {
    const now = new Date()
    return now.getFullYear() * 12 + now.getMonth()
  }
  return Number(year) * 12 + m
}

/** Inclusive tenure, e.g. '2 mos' or '1 yr 3 mos'. */
function tenure(r: Role) {
  const n = Math.max(1, monthIndex(r.end) - monthIndex(r.start) + 1)
  const y = Math.floor(n / 12)
  const m = n % 12
  const mo = m ? `${m} ${m === 1 ? 'mo' : 'mos'}` : ''
  return y ? `${y} ${y === 1 ? 'yr' : 'yrs'}${mo ? ` ${mo}` : ''}` : mo
}

/** 'AMnova Technologies' -> bold 'AMnova', light italic 'Technologies'. */
function CompanyName({ name }: { name: string }) {
  const words = name.split(' ')
  if (words.length < 2) return <>{name}</>
  return (
    <>
      {words[0]} <em className="xp-company-tail">{words.slice(1).join(' ')}</em>
    </>
  )
}

/** Wraps each highlight phrase of `text` in a keyword span. */
function withHighlights(text: string, phrases: readonly string[]) {
  if (!phrases.length) return text
  const pattern = new RegExp(`(${phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  return text.split(pattern).map((part, i) =>
    phrases.includes(part) ? (
      <span key={i} className="xp-key">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

export function Experience() {
  const mode = useStore((s) => s.mode)
  const lite = useStore((s) => s.lite)
  const webgl = mode === 'webgl'

  return (
    <Section
      id="experience"
      title="Experience"
      choreography={(tl, root) => {
        const head = root.querySelectorAll('[data-x-head]')
        tl.fromTo(head, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.05, ease: 'power3.out' }, 0)
        const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-x-card]'))
        cards.forEach((card, i) => {
          const at = progressAt(waypointU[i]) - 0.07
          const lines = card.querySelectorAll('[data-x-line]')
          const tick = root.querySelectorAll('[data-x-tick]')[i]
          tl.set(card, { visibility: 'visible' }, at - 0.001)
          tl.fromTo(lines, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.05, stagger: 0.008, ease: 'power3.out' }, at)
          if (tick) tl.fromTo(tick, { scaleX: 0 }, { scaleX: 1, duration: 0.05, ease: 'power3.out' }, at)

          // Leaving a role: the card's own letters shatter into crystals (WebGL)
          // and the camera flies through the debris. Scrubbed, so it reverses.
          const boom = i < cards.length - 1 ? progressAt(waypointU[i + 1]) - 0.115 : holdEnd('experience') - 0.095
          const span = 0.09
          shatter.start[i] = boom
          shatter.end[i] = boom + span
          shatter.sample[i] = () => {
            const q = useStore.getState()
            const tierMax = q.lite || q.quality === 'low' ? 800 : q.quality === 'mid' ? 1500 : 2400
            return sampleGlyphs(card, tierMax)
          }
          tl.fromTo(signals.shatter[i], { p: 0 }, { p: 1, duration: span, ease: 'none' }, boom)
          tl.set(lines, { opacity: 0 }, boom + 0.003)
          tl.set(card, { visibility: 'hidden' }, boom + span)
        })
        shatter.version++
        tl.to(head, { opacity: 0, y: -30, duration: 0.04 }, holdEnd('experience') - 0.02)
      }}
    >
      <div
        className={`xp ${lite ? 'is-lite ' : ''}${webgl ? 'relative h-full w-full' : 'mx-auto max-w-[80rem] px-[var(--gutter)] py-[16vh]'}`}
      >
        <div data-x-head className={webgl ? 'xp-head absolute left-[var(--gutter)] top-[calc(var(--gutter)+3.4rem)]' : 'xp-head'}>
          <span className="xp-kicker">
            <span aria-hidden="true" className="xp-kicker-index">
              04
            </span>
            <span aria-hidden="true" className="xp-kicker-rule" />
            Experience
          </span>
          <h2 className="xp-title">
            A path, measured in <em className="xp-title-accent">what shipped.</em>
          </h2>
        </div>

        {webgl && (
          <ol data-x-head aria-hidden="true" className="xp-rail absolute right-[var(--gutter)] top-[calc(var(--gutter)+3.6rem)] hidden md:flex">
            {experience.map((r, i) => (
              <li key={r.company} className="xp-rail-item">
                <span className="xp-rail-year">{r.start.split(' ').pop()}</span>
                <span className="xp-rail-co">{r.company}</span>
                <span className="xp-rail-bar">
                  <span data-x-tick className="xp-rail-tick" style={{ transform: 'scaleX(0)' }} />
                </span>
                <span className="xp-rail-n">{pad(i)}</span>
              </li>
            ))}
          </ol>
        )}

        <ol className={webgl ? '' : 'mt-14 flex flex-col gap-20'}>
          {experience.map((r, i) => (
            <li
              key={r.company}
              data-x-card
              className={
                webgl
                  ? 'xp-card invisible absolute bottom-[calc(var(--gutter)+2rem)] left-[var(--gutter)] right-[var(--gutter)] max-w-[44rem]'
                  : 'xp-card max-w-[46rem]'
              }
            >
              <span className="line-mask block">
                <span data-x-line className="xp-meta">
                  <span aria-hidden="true" className="xp-gem" />
                  <span aria-hidden="true" className="xp-meta-rule" />
                  <span>{r.start}</span>
                  <span aria-hidden="true" className="xp-meta-arrow">
                    →
                  </span>
                  <span className={isPresent(r) ? 'xp-meta-now' : undefined}>{r.end}</span>
                  <span className="xp-meta-dur">{tenure(r)}</span>
                </span>
              </span>

              <h3 className="xp-name">
                <span aria-hidden="true" className="line-mask xp-num-mask">
                  <span data-x-line className="xp-num">
                    {pad(i)}
                  </span>
                </span>
                <span className="line-mask block">
                  <span data-x-line className="xp-company">
                    <CompanyName name={r.company} />
                  </span>
                </span>
                <span className="line-mask block">
                  <span data-x-line className="xp-role">
                    <span className="xp-role-as">as</span>
                    {r.title}
                  </span>
                </span>
              </h3>

              <p className="line-mask block">
                <span data-x-line className="xp-summary">
                  {withHighlights(r.summary, r.highlights)}
                </span>
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  )
}

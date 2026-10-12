/**
 * The hero copy's entrance, played once (2.6 s): the name assembles from dots drifting in along the
 * landscape's inflow (toward the stage) and settles into solid type, the hairline draws, the tagline's words
 * fade up with "prototype chaos" resolving from a scramble, "production." arrives with an underline, then the
 * role. The timings of the CSS half are in hero.css ([data-intro=play]); this is the script half (the dots and
 * the scramble) and the clock both share.
 *
 * It is inlined into index.html straight after the pre-painted copy (vite.config.ts heroBoot), so it starts
 * with the first paint rather than after the app's bundle; the app calls it for the copy it draws itself
 * (src/dom/HeroCopy.tsx). So: no imports, nothing from the app.
 *
 * Decoration only: the real text is in the DOM, selectable and read by screen readers from the first paint;
 * the dots are a canvas and the scramble an aria-hidden span over the real (transparent) words. Whatever
 * happens (no frames in a background tab, an error), a timer puts the final text in place by 3.2 s. Reduced
 * motion: nothing runs, the text is simply there.
 */
export function playIntro(target: Element | null): void {
  if (!(target instanceof HTMLElement) || target.dataset.intro) return
  const root: HTMLElement = target
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const T = { land: 1100, dissolve: [1000, 1450], chaos: 1650, resolve: 850, end: 2650, safety: 3200 }
  const name = root.querySelector<HTMLElement>('.hero-intro__glyphs')
  const chaos = Array.from(root.querySelectorAll<HTMLElement>('.hi-s'))
  if (!name) return
  root.dataset.intro = 'wait'

  let canvas: HTMLCanvasElement | null = null
  const fx: { el: HTMLElement; done: HTMLElement; mess: HTMLElement; text: string; from: number }[] = []
  let done = false
  const finish = () => {
    if (done) return
    done = true
    canvas?.remove()
    for (const f of fx) f.el.remove()
    root.dataset.intro = 'done'
  }
  setTimeout(finish, T.safety + 800)

  // Start once the copy is laid out by its stylesheet and its display face is in (or soon: at most 400 ms).
  const font = getComputedStyle(name)
  const ready = Promise.race([
    document.fonts ? document.fonts.load(`${font.fontWeight} ${font.fontSize} ${font.fontFamily}`).catch(() => {}) : null,
    new Promise((r) => setTimeout(r, 400)),
  ])
  let waited = 0
  const styled = () => getComputedStyle(root).position === 'absolute'
  const go = () => {
    if (done) return
    if (!styled() && waited++ < 90) return void requestAnimationFrame(go)
    try {
      start()
    } catch {
      finish()
    }
  }
  ready.then(() => requestAnimationFrame(go))

  function start() {
    const t0 = performance.now()
    root.dataset.intro = 'play'
    setTimeout(finish, T.safety)
    for (const el of chaos) {
      const text = el.textContent ?? ''
      const box = document.createElement('span')
      box.className = 'hi-s__fx'
      box.setAttribute('aria-hidden', 'true')
      const doneEl = document.createElement('b')
      const mess = document.createElement('i')
      box.append(doneEl, mess)
      el.append(box)
      fx.push({ el: box, done: doneEl, mess, text, from: 0 })
    }
    const GLYPHS = 'abcdefghijklmnopqrstuvwxyz#%&*+=/<>'
    const shuffle = (n: number) => {
      let m = ''
      for (let i = 0; i < n; i++) m += GLYPHS[(Math.random() * GLYPHS.length) | 0]
      return m
    }
    // Scrambled from the start: if the page's own start-up holds the main thread, this is what shows.
    for (const f of fx) f.mess.textContent = shuffle(f.text.length)
    // The scramble resolves letter by letter across both words, left to right.
    let k = 0
    for (const f of fx) {
      f.from = k
      k += f.text.length
    }
    const letters = Math.max(1, k)
    let lastShuffle = -1

    const dots = makeDots()
    const frame = (now: number) => {
      if (done || !root.isConnected) return finish()
      const t = now - t0
      if (dots) dots(t)
      if (t >= T.chaos && Math.floor(t / 50) !== lastShuffle) {
        lastShuffle = Math.floor(t / 50)
        const solved = Math.floor(((t - T.chaos) / T.resolve) * letters)
        for (const f of fx) {
          const n = Math.max(0, Math.min(f.text.length, solved - f.from))
          f.done.textContent = f.text.slice(0, n)
          const m = shuffle(f.text.length - n)
          f.mess.textContent = m
          f.mess.style.transform = m ? `translateX(${(Math.random() * 3 - 1.5).toFixed(1)}px)` : ''
        }
      }
      if (t >= T.end) return finish()
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }

  /** The name's dots: each glyph sampled on a 6 px grid, every dot flown in from away from the stage. */
  function makeDots(): ((t: number) => void) | null {
    const node = name!.firstChild
    if (!node || node.nodeType !== 3) return null
    const nb = name!.getBoundingClientRect()
    const rb = root.getBoundingClientRect()
    if (nb.width < 4) return null
    const cs = getComputedStyle(name!)
    const W = Math.ceil(nb.width)
    const H = Math.ceil(nb.height)
    const off = document.createElement('canvas')
    off.width = W
    off.height = H
    const o = off.getContext('2d', { willReadFrequently: true })
    if (!o) return null
    o.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    o.textBaseline = 'alphabetic'
    o.fillStyle = '#fff'
    // Each letter where the page drew it (its letter-spacing and case included).
    const text = node.textContent ?? ''
    const range = document.createRange()
    for (let i = 0; i < text.length; i++) {
      range.setStart(node, i)
      range.setEnd(node, i + 1)
      const r = range.getBoundingClientRect()
      const ch = cs.textTransform === 'uppercase' ? text[i].toUpperCase() : text[i]
      const m = o.measureText(ch)
      // Fitted to the letter's box: right even if the face here is still a fallback's.
      const sx = m.width > 0 ? Math.min(1.6, Math.max(0.6, (r.width - parseFloat(cs.letterSpacing || '0')) / m.width)) : 1
      o.setTransform(sx, 0, 0, 1, r.left - nb.left, 0)
      o.fillText(ch, 0, r.top - nb.top + (m.fontBoundingBoxAscent || r.height * 0.8))
    }
    o.setTransform(1, 0, 0, 1, 0, 0)
    const img = o.getImageData(0, 0, W, H).data
    const PITCH = 6
    const PAD = 140
    // Toward the stage (the landscape's inflow at the copy): the dais, up and to the right of the copy.
    const phone = innerWidth < 768
    const sx = innerWidth * (phone ? 0.6 : 0.52) - (nb.left + nb.width / 2)
    const sy = innerHeight * (phone ? 0.5 : 0.66) - (nb.top + nb.height / 2)
    const sl = Math.hypot(sx, sy) || 1
    const dx = sx / sl
    const dy = sy / sl
    type Dot = { x: number; y: number; ax: number; ay: number; bow: number; at: number; dur: number; out: number; c: number }
    const list: Dot[] = []
    for (let y = PITCH / 2; y < H; y += PITCH) {
      for (let x = PITCH / 2; x < W; x += PITCH) {
        if (img[((y | 0) * W + (x | 0)) * 4 + 3] < 128) continue
        const d = 50 + Math.random() * 110
        const side = (Math.random() * 2 - 1) * 34
        const at = Math.random() * 300
        list.push({
          x,
          y,
          ax: x - dx * d - dy * side,
          ay: y - dy * d + dx * side,
          bow: (Math.random() * 2 - 1) * 16,
          at,
          dur: T.land - at - Math.random() * 160,
          out: T.dissolve[0] + Math.random() * (T.dissolve[1] - T.dissolve[0] - 220),
          c: y / H,
        })
      }
    }
    if (!list.length) return null
    const dpr = Math.min(devicePixelRatio || 1, 2)
    canvas = document.createElement('canvas')
    canvas.className = 'hero-intro__dots'
    canvas.setAttribute('aria-hidden', 'true')
    canvas.width = Math.ceil((W + PAD * 2) * dpr)
    canvas.height = Math.ceil((H + PAD * 2) * dpr)
    Object.assign(canvas.style, {
      left: `${nb.left - rb.left - PAD}px`,
      top: `${nb.top - rb.top - PAD}px`,
      width: `${W + PAD * 2}px`,
      height: `${H + PAD * 2}px`,
    })
    root.append(canvas)
    const g = canvas.getContext('2d')
    if (!g) return null
    // Two sprites (#C4B5FD at the letters' top, #A78BFA at their foot): a soft 3 px dot.
    const sprite = (col: string) => {
      const s = document.createElement('canvas')
      const n = Math.ceil(5 * dpr)
      s.width = s.height = n
      const c = s.getContext('2d')!
      const grd = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2)
      grd.addColorStop(0, col)
      grd.addColorStop(0.55, col)
      grd.addColorStop(1, 'rgba(0,0,0,0)')
      c.fillStyle = grd
      c.fillRect(0, 0, n, n)
      return s
    }
    const top = sprite('#c4b5fd')
    const foot = sprite('#a78bfa')
    const S = 5
    const ease = (u: number) => 1 - (1 - u) ** 3
    let cleared = false
    return (t: number) => {
      if (t > T.dissolve[1]) {
        if (!cleared) {
          cleared = true
          canvas?.remove()
          canvas = null
        }
        return
      }
      g.setTransform(dpr, 0, 0, dpr, PAD * dpr, PAD * dpr)
      g.clearRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2)
      for (const d of list) {
        const u = Math.min(1, Math.max(0, (t - d.at) / d.dur))
        if (u <= 0) continue
        const e = ease(u)
        const arc = Math.sin(Math.PI * e) * d.bow
        const x = d.ax + (d.x - d.ax) * e - dy * arc
        const y = d.ay + (d.y - d.ay) * e + dx * arc
        const a = Math.min(1, u / 0.25) * (t < d.out ? 0.95 : Math.max(0, 0.95 - (t - d.out) / 220))
        if (a <= 0.01) continue
        g.globalAlpha = a
        g.drawImage(d.c < 0.5 ? top : foot, x - S / 2, y - S / 2, S, S)
      }
    }
  }
}

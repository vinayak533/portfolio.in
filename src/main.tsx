import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource/bricolage-grotesque/latin-400.css'
import '@fontsource/bricolage-grotesque/latin-500.css'
import '@fontsource/bricolage-grotesque/latin-600.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import './styles/global.css'

import { App } from './App'
import { useStore } from './store/useStore'
import { detectQuality, hasWebGL2, isTouchDevice, prefersReducedMotion } from './core/quality'
import { initialLite, watchFrameRate } from './core/autoLite'
import { expect } from './core/loading'

// Decide the render mode once, before first paint.
const reducedMotion = prefersReducedMotion()
const webgl = hasWebGL2()
// ?static forces the no-WebGL / reduced-motion layout for QA.
const forceStatic = new URLSearchParams(location.search).has('static')
const mode = webgl && !reducedMotion && !forceStatic ? 'webgl' : 'static'
useStore.getState().set({
  mode,
  reducedMotion,
  isTouch: isTouchDevice(),
  quality: detectQuality(),
  // Lite is automatic (src/core/autoLite.ts): reduced motion or a low-end device now, a low frame rate later.
  lite: initialLite(reducedMotion),
})
if (mode === 'webgl') watchFrameRate()
document.documentElement.dataset.mode = mode

expect('fonts', 'hero', ...(mode === 'webgl' ? ['portrait', 'compile'] : ['still']))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

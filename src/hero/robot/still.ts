/**
 * No WebGL (or reduced motion, or a lost context): the same robot as a
 * pre-rendered still standing in the hero. Nothing moves; once the hero is
 * left the still fades with the stage and the chat launcher shows the robot's
 * head (its SVG face, src/dom/chat/Robot.tsx), so there is still only ever
 * one robot on screen.
 */
import { setDock } from './bridge'
import type { RobotHandle, RobotOptions } from './dom'

export const STILL_URL = '/hero/robot-still.webp'

export function mountRobot(host: HTMLElement, _opts: RobotOptions = {}): RobotHandle {
  const img = new Image()
  img.src = STILL_URL
  img.alt = ''
  img.decoding = 'async'
  img.className = 'hero-robot-still'
  host.appendChild(img)
  setDock('away', false)

  return {
    reveal() {
      img.classList.add('is-revealed')
    },
    setLowPower() {},
    setProgress(p) {
      setDock(p >= 0.5 ? 'docked' : 'away', false)
    },
    setRendering() {},
    dispose() {
      img.remove()
      setDock('none', false)
    },
  }
}

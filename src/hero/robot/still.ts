/**
 * No WebGL (or reduced motion, or a lost context): the hero is its poster (Hero.tsx), which already shows
 * the robot at its desk, so nothing is drawn here. This only keeps the hand-over to the chat launcher: once
 * the hero is left, the launcher shows the robot's head (its SVG face, src/dom/chat/Robot.tsx), so there is
 * still only ever one robot on screen.
 */
import { setDock } from './bridge'
import type { RobotHandle, RobotOptions } from './dom'

export function mountRobot(_host: HTMLElement, _opts: RobotOptions = {}): RobotHandle {
  setDock('away', false)
  return {
    reveal() {},
    setTier() {},
    setProgress(p) {
      setDock(p >= 0.5 ? 'docked' : 'away', false)
    },
    dispose() {
      setDock('none', false)
    },
  }
}

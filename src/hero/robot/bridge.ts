/**
 * The one robot, shared by the hero and the chat launcher.
 *
 * The hero engine (engine.ts, or still.ts without WebGL) owns the robot: it
 * stands in the hero, then on scroll its head alone flies into the chat
 * launcher's corner and becomes the launcher's face. The chat widget never
 * draws a second robot while that is happening. It reads `useRobotDock` to know
 * where the robot is, and hands the engine what it needs through `robotLink`:
 * where to land (the launcher button), where to live once landed (the icon
 * slot), and the mood to wear.
 */
import { create } from 'zustand'
import type { Mood } from './face'

export type DockState =
  /** No hero robot (not mounted yet, or gone): the launcher draws its own. */
  | 'none'
  /** The robot is in the hero, or on its way: the launcher waits, empty. */
  | 'away'
  /** The head is in the launcher. */
  | 'docked'

interface DockStore {
  state: DockState
  /** True when the launcher's face is the 3D head (a canvas in the slot); false: the SVG robot. */
  gl: boolean
}

export const useRobotDock = create<DockStore>(() => ({ state: 'none', gl: false }))

/** Per-frame values the engine reads; written by the chat widget. Never triggers renders. */
export const robotLink = {
  /** The launcher button: its box is where the head lands. */
  anchor: null as HTMLElement | null,
  /** The launcher's icon element: the docked head's canvas lives inside it. */
  slot: null as HTMLElement | null,
  mood: 'neutral' as Mood,
  /** Idle life (glances, float) on; off while the chat is open. */
  live: true,
  /** The chat panel is open: the launcher shows × and the head is put away. */
  open: false,
}

export function setDock(state: DockState, gl: boolean) {
  const cur = useRobotDock.getState()
  if (cur.state !== state || cur.gl !== gl) useRobotDock.setState({ state, gl })
}

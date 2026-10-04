import { useStore } from '../store/useStore'

/**
 * Tiny load registry. Every named task contributes equally to the loader
 * counter. Tasks are declared up front so the total never grows mid-load.
 */
const expected = new Set<string>()
const done = new Set<string>()

export function expect(...names: string[]) {
  names.forEach((n) => expected.add(n))
  publish()
}

export function complete(name: string) {
  if (!expected.has(name) || done.has(name)) return
  done.add(name)
  publish()
}

export async function track<T>(name: string, p: Promise<T>): Promise<T> {
  try {
    return await p
  } finally {
    complete(name)
  }
}

function publish() {
  const total = Math.max(expected.size, 1)
  useStore.getState().set({ loadProgress: done.size / total })
}

/** Resolve after `ms`, used as a hard ceiling so a stuck asset never blocks the site. */
export const timeout = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

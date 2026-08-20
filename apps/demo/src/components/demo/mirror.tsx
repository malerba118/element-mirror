'use client'

import * as React from 'react'

import {
  ElementMirror,
  ElementMirror2,
  type ElementMirrorSource,
} from '@frostin/element-mirror'

/**
 * Both mirrors, under one switch, so that every demo on the page can be seen
 * running on either.
 *
 * The two differ in what a mirror's box is for. ElementMirror's box is the box
 * the source occupies on screen, transform included, and the capture is
 * stretched to fill it. ElementMirror2's box is the box the source laid out in,
 * and the capture is drawn at its own scale wherever the source's transform put
 * it — outside the box if that is where it went. Everything else, from sharing
 * captures to delay trails, is the same engine underneath.
 *
 * Which means `objectFit` only exists on the first: stretching a capture to fill
 * a box is the one thing the second will not do. It is accepted here and dropped
 * for the second, so a demo can pass it without knowing which is rendering.
 */

export type MirrorVersion = 1 | 2

export type MirrorProps = Omit<
  React.HTMLAttributes<HTMLElement>,
  'children'
> & {
  source: ElementMirrorSource
  fps?: number
  delay?: number
  pixelRatio?: number
  /** Version 1 only: version 2 has one fit, and it is uniform. */
  objectFit?: React.CSSProperties['objectFit']
  objectPosition?: string
  background?: string | null
  paused?: boolean
}

const STORAGE_KEY = 'element-mirror-version'

/**
 * The choice, kept outside React in the one place a browser remembers things
 * between reloads.
 *
 * Read as an external store rather than into state after mounting: the server
 * cannot know what this browser last chose, and this is how React is told that
 * the first client render may legitimately differ from the markup it hydrates.
 */
const listeners = new Set<() => void>()

const store = {
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  read: (): MirrorVersion =>
    window.localStorage.getItem(STORAGE_KEY) === '1' ? 1 : 2,
  // Version 2 by default: it is the one being evaluated, and the point of the
  // switch is to check it against the other rather than the other way round.
  server: (): MirrorVersion => 2,
  write: (version: MirrorVersion) => {
    window.localStorage.setItem(STORAGE_KEY, String(version))
    for (const listener of listeners) listener()
  },
}

const MirrorVersionContext = React.createContext<{
  version: MirrorVersion
  setVersion: (version: MirrorVersion) => void
}>({ version: 2, setVersion: () => {} })

export const useMirrorVersion = () => React.useContext(MirrorVersionContext)

/** The name to print in a snippet, so the code shown is the code running. */
export const useMirrorName = () =>
  useMirrorVersion().version === 1 ? 'ElementMirror' : 'ElementMirror2'

export function MirrorVersionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const version = React.useSyncExternalStore(
    store.subscribe,
    store.read,
    store.server
  )

  const value = React.useMemo(
    () => ({ version, setVersion: store.write }),
    [version]
  )

  return (
    <MirrorVersionContext.Provider value={value}>
      {children}
    </MirrorVersionContext.Provider>
  )
}

/**
 * Prose that only holds for one of them, so that the page can describe what is
 * actually rendering. Takes both and shows one, which keeps each sentence where
 * it is read rather than in a table of strings somewhere else.
 */
export function ByVersion({
  one,
  two,
}: {
  one: React.ReactNode
  two: React.ReactNode
}) {
  return <>{useMirrorVersion().version === 1 ? one : two}</>
}

export function Mirror({ objectFit, ...props }: MirrorProps) {
  const { version } = useMirrorVersion()
  if (version === 1) return <ElementMirror objectFit={objectFit} {...props} />
  return <ElementMirror2 {...props} />
}

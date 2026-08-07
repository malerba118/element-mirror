'use client'

import * as React from 'react'

import {
  getMirrorEngine,
  setMirrorEngine,
  subscribeToMirrorEngine,
} from '@/lib/mirror-capture'
import {
  DEFAULT_MIRROR_ENGINE,
  MIRROR_ENGINE_NOTES,
  MIRROR_ENGINES,
  type MirrorEngine,
} from '@/lib/mirror-engines'
import { cn } from '@/lib/utils'

/**
 * The engine every mirror on the page captures with, and a way to change it.
 *
 * The setting lives outside React, in the capture loop, so this reads it
 * through a subscription rather than owning it: two of these on one page agree,
 * and a mirror rendered before either of them still captures with whatever the
 * address asked for.
 */
export function useMirrorEngine(): [
  MirrorEngine,
  (next: MirrorEngine) => void,
] {
  const engine = React.useSyncExternalStore(
    subscribeToMirrorEngine,
    getMirrorEngine,
    () => DEFAULT_MIRROR_ENGINE
  )

  const choose = React.useCallback((next: MirrorEngine) => {
    setMirrorEngine(next)
    // Left in the address so that a reload, or a link to what you are looking
    // at, comes back on the same engine.
    const url = new URL(window.location.href)
    if (next === DEFAULT_MIRROR_ENGINE) url.searchParams.delete('engine')
    else url.searchParams.set('engine', next)
    window.history.replaceState(null, '', url)
  }, [])

  return [engine, choose]
}

export function MirrorEngineSwitch({ className }: { className?: string }) {
  const [engine, choose] = useMirrorEngine()

  return (
    <div
      className={cn(
        'flex items-center gap-0.5 rounded-md border bg-background p-0.5',
        className
      )}
    >
      {MIRROR_ENGINES.map((value) => (
        <button
          key={value}
          type="button"
          data-engine={value}
          title={MIRROR_ENGINE_NOTES[value]}
          onClick={() => choose(value)}
          className={cn(
            'rounded px-2 py-0.5 font-mono text-[11px] transition-colors',
            engine === value
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          {value}
        </button>
      ))}
    </div>
  )
}

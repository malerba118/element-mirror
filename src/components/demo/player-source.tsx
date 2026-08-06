'use client'

import * as React from 'react'
import {
  HeartIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Volume2Icon,
} from 'lucide-react'

import { cn } from '@/lib/utils'

const DURATION_S = 228

/** Staggered so the bars read as an equalizer rather than a single pulse. */
const BAR_DELAYS_MS = [0, 260, 120, 380, 200]

function clock(seconds: number) {
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

interface PlayerSourceProps {
  /** The id mirrors point at, for sources named by selector. */
  id?: string
  className?: string
}

/**
 * The element the main example mirrors.
 *
 * Chosen to be the awkward parts of a real interface rather than a neutral box:
 * layered gradients, a CSS animation, text that changes on a timer, an SVG icon
 * set, and controls whose state lives somewhere a mirror cannot see it. The
 * volume slider is the pointed one — dragging it changes a property on the
 * input and nothing in the DOM at all, so a mirror that follows it is a mirror
 * watching for more than mutations.
 */
export const PlayerSource = React.forwardRef<HTMLDivElement, PlayerSourceProps>(
  function PlayerSource({ id, className }, forwardedRef) {
    const [playing, setPlaying] = React.useState(true)
    const [elapsed, setElapsed] = React.useState(64)
    const [liked, setLiked] = React.useState(false)
    const [volume, setVolume] = React.useState(70)

    // Anchored to a wall-clock instant rather than accumulated per tick, so
    // playback keeps time and a seek can move it without restarting the clock.
    const startedAt = React.useRef(0)

    React.useEffect(() => {
      if (!playing) return
      startedAt.current = performance.now() - elapsed * 1000
      const timer = window.setInterval(() => {
        setElapsed(
          ((performance.now() - startedAt.current) / 1000) % DURATION_S
        )
      }, 100)
      return () => window.clearInterval(timer)
      // Reads `elapsed` once on resume to continue from where it stopped.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing])

    const seek = (event: React.PointerEvent<HTMLDivElement>) => {
      const bar = event.currentTarget.getBoundingClientRect()
      const fraction = Math.min(
        1,
        Math.max(0, (event.clientX - bar.left) / bar.width)
      )
      const next = fraction * DURATION_S
      startedAt.current = performance.now() - next * 1000
      setElapsed(next)
    }

    const progress = (elapsed / DURATION_S) * 100

    return (
      <div
        id={id}
        ref={forwardedRef}
        className={cn(
          'w-90 overflow-hidden rounded-2xl bg-neutral-950 text-white ring-1 ring-white/10',
          className
        )}
      >
        <div className="flex gap-4 p-4">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-xl">
            <div className="absolute inset-0 bg-linear-to-br from-violet-500 via-rose-500 to-amber-400" />
            <div className="absolute inset-0 bg-radial-[at_28%_18%] from-white/30 to-transparent to-50%" />
            <div className="absolute inset-x-0 bottom-0 flex h-9 items-end gap-1 bg-linear-to-t from-black/55 to-transparent px-2.5 pb-2.5">
              {BAR_DELAYS_MS.map((delay) => (
                <span
                  key={delay}
                  className={cn(
                    'h-4 w-1 origin-bottom rounded-sm bg-white/95',
                    playing ? 'demo-equalize' : 'scale-y-[0.3]'
                  )}
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm leading-tight font-medium">
                  Chasing Static
                </p>
                <p className="mt-0.5 truncate text-xs text-white/55">
                  Renoun · Mirror Sessions
                </p>
              </div>
              <button
                type="button"
                aria-label="Like"
                onClick={() => setLiked((value) => !value)}
                className="-mt-0.5 -mr-1 rounded-full p-1 text-white/55 transition-colors hover:text-white"
              >
                <HeartIcon
                  className={cn(
                    'size-4',
                    liked && 'fill-rose-500 text-rose-500'
                  )}
                />
              </button>
            </div>

            <div className="mt-auto space-y-1.5">
              <div
                onPointerDown={seek}
                className="relative flex h-3 cursor-pointer items-center"
              >
                <div className="h-1 w-full rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-white"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {/* Outside the track rather than within it: a capture clips a
                    child to its parent's border radius, and the knob stands
                    proud of a 4px track, so nesting it would shave it away. */}
                <span
                  className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                  style={{ left: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between font-mono text-[10px] text-white/45 tabular-nums">
                <span>{clock(elapsed)}</span>
                <span>−{clock(DURATION_S - elapsed)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 border-t border-white/10 px-4 py-2.5">
          <button
            type="button"
            aria-label="Previous"
            className="rounded-full p-1.5 text-white/55 transition-colors hover:text-white"
          >
            <SkipBackIcon className="size-4 fill-current" />
          </button>
          <button
            type="button"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => setPlaying((value) => !value)}
            className="flex items-center justify-center rounded-full bg-white p-2 text-neutral-950 transition-transform hover:scale-105"
          >
            {playing ? (
              <PauseIcon className="size-4 fill-current" />
            ) : (
              <PlayIcon className="size-4 fill-current" />
            )}
          </button>
          <button
            type="button"
            aria-label="Next"
            className="rounded-full p-1.5 text-white/55 transition-colors hover:text-white"
          >
            <SkipForwardIcon className="size-4 fill-current" />
          </button>

          <div className="ml-auto flex items-center gap-2">
            <Volume2Icon className="size-3.5 text-white/45" />
            <input
              type="range"
              aria-label="Volume"
              min={0}
              max={100}
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              className="h-1 w-20 accent-white"
            />
          </div>
        </div>
      </div>
    )
  }
)

'use client'

import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface MirrorSourceProps {
  /** The id mirrors point at, for sources named by selector. */
  id?: string
  /** How mirrors reach this source, shown in the header. */
  label?: string
  className?: string
  /** Drops the interactive controls, for sources that only need to animate. */
  static?: boolean
  /**
   * Stops the clock and the CSS animations. A source that holds still has
   * nothing for mirrors to capture, which is visible in the capture stats.
   */
  animate?: boolean
}

/**
 * The element every demo on the page mirrors. It deliberately combines the
 * things that are hard to capture: a gradient, a CSS animation, live text,
 * and real form controls holding React state.
 */
export const MirrorSource = React.forwardRef<HTMLDivElement, MirrorSourceProps>(
  function MirrorSource(
    { id, label, className, static: isStatic = false, animate = true },
    forwardedRef
  ) {
    const [count, setCount] = React.useState(0)
    const [text, setText] = React.useState('')
    const [elapsed, setElapsed] = React.useState(0)

    React.useEffect(() => {
      if (!animate) return
      const started = performance.now() - elapsed
      const timer = window.setInterval(() => {
        setElapsed(performance.now() - started)
      }, 100)
      return () => window.clearInterval(timer)
      // Resuming reads `elapsed` once to continue where it left off.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [animate])

    return (
      <div
        id={id}
        ref={forwardedRef}
        className={cn(
          'w-[360px] overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10',
          className
        )}
      >
        <div className="flex items-center gap-3 bg-linear-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-4 py-3 text-white">
          <span
            className={cn(
              'size-6 shrink-0 rounded-full border-2 border-white/30 border-t-white',
              animate && 'animate-spin'
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-none font-medium">Live source</p>
            <p className="mt-1 font-mono text-[11px] text-white/75">
              {label ?? `#${id}`}
            </p>
          </div>
          <span className="font-mono text-sm tabular-nums">
            {(elapsed / 1000).toFixed(1)}s
          </span>
        </div>

        <div className="space-y-3 p-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full w-1/5 rounded-full bg-violet-500',
                animate && 'demo-sweep'
              )}
            />
          </div>

          {isStatic ? (
            <p className="text-sm text-muted-foreground">
              Every pixel here is painted into a canvas elsewhere on the page.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Counter{' '}
                  <span className="font-mono text-foreground tabular-nums">
                    {count}
                  </span>
                </p>
                <Button
                  size="sm"
                  onClick={() => setCount((value) => value + 1)}
                >
                  Increment
                </Button>
              </div>
              <Input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Type here, watch the mirrors"
              />
            </>
          )}
        </div>
      </div>
    )
  }
)

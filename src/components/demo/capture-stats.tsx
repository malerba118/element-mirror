'use client'

import * as React from 'react'

import {
  subscribeToCaptureStats,
  type CaptureStats,
} from '@/lib/mirror-capture'
import { cn } from '@/lib/utils'

const EMPTY: CaptureStats = {
  sources: 0,
  mirrors: 0,
  capturesPerSecond: 0,
  blitsPerSecond: 0,
  skippedPerSecond: 0,
  msPerCapture: 0,
  mainThreadPercent: 0,
}

export function useCaptureStats() {
  const [stats, setStats] = React.useState(EMPTY)
  React.useEffect(() => subscribeToCaptureStats(setStats), [])
  return stats
}

/** Page-wide capture accounting, live in the header. */
export function CaptureStatsBadge() {
  const stats = useCaptureStats()

  return (
    <div className="hidden items-center gap-3 rounded-lg bg-muted/60 px-2.5 py-1 font-mono text-[11px] text-muted-foreground sm:flex">
      <span>
        <span className="text-foreground tabular-nums">
          {stats.capturesPerSecond}
        </span>{' '}
        cap/s
      </span>
      <span>
        <span className="text-foreground tabular-nums">
          {stats.blitsPerSecond}
        </span>{' '}
        blit/s
      </span>
      <span>
        <span className="text-foreground tabular-nums">
          {stats.msPerCapture}
        </span>{' '}
        ms
      </span>
      <span>
        <span className="text-foreground tabular-nums">
          {stats.mainThreadPercent}
        </span>
        % thread
      </span>
    </div>
  )
}

interface StatProps {
  label: string
  value: number
  unit?: string
  hint?: string
  emphasis?: boolean
}

export function Stat({ label, value, unit, hint, emphasis }: StatProps) {
  return (
    <div className="space-y-1" data-stat={label}>
      <p className="font-mono text-xs text-muted-foreground">{label}</p>
      <p
        data-stat-value=""
        className={cn(
          'font-mono text-2xl tabular-nums',
          emphasis ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {value}
        {unit ? (
          <span className="ml-1 text-xs text-muted-foreground">{unit}</span>
        ) : null}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

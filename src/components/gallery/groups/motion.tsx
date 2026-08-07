'use client'

import * as React from 'react'
import { Loader2, RefreshCw } from 'lucide-react'

import { Specimen, SpecimenGroup } from '@/components/gallery/specimen'
import { Badge } from '@/components/ui/badge'

/** Flips a class on a timer, so a CSS transition is caught partway through. */
function TransitionToggle() {
  const [on, setOn] = React.useState(false)

  React.useEffect(() => {
    const timer = window.setInterval(() => setOn((value) => !value), 1400)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="flex items-center gap-4">
      <div
        className={`size-12 rounded-lg transition-all duration-700 ${
          on
            ? 'translate-x-8 rotate-45 bg-fuchsia-500'
            : 'translate-x-0 rotate-0 bg-indigo-500'
        }`}
      />
      <div
        className={`h-2 w-24 rounded-full bg-muted transition-colors duration-700 ${
          on ? 'bg-emerald-500' : 'bg-muted'
        }`}
      />
    </div>
  )
}

export function MotionSpecimens() {
  return (
    <SpecimenGroup
      id="motion"
      title="Motion"
      description="A mirror runs a fraction of a second behind its source, so anything moving is caught at a different moment in the two views: in the difference view they will never cancel out. What to look for here is whether the mirrored frame is a plausible frame at all, rather than whether it matches."
    >
      <Specimen name="spinners" note="the ring is faint on three sides, bright on one">
        <div className="flex items-center gap-5">
          <span className="size-6 animate-spin rounded-full border-2 border-foreground/25 border-t-foreground" />
          <span className="size-8 animate-spin rounded-full border-4 border-indigo-500/20 border-t-indigo-500" />
          <span
            className="size-6 animate-spin rounded-full border-2 border-transparent border-t-fuchsia-500 border-r-fuchsia-500"
            style={{ animationDuration: '600ms' }}
          />
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <RefreshCw className="size-5 animate-spin text-emerald-500" />
        </div>
      </Specimen>

      <Specimen name="pulse and ping" note="opacity and scale keyframes mid-flight">
        <div className="flex items-center gap-6">
          <span className="size-10 animate-pulse rounded-lg bg-indigo-500" />
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
          </span>
          <span className="size-8 animate-bounce rounded-full bg-amber-400" />
          <Badge className="animate-pulse">live</Badge>
        </div>
      </Specimen>

      <Specimen name="transitions" note="a class flipped on a timer, caught in between">
        <TransitionToggle />
      </Specimen>

      <Specimen
        name="animated gradient"
        note="a background position sweeping under a mask"
      >
        <div className="space-y-3">
          <div className="h-3 w-48 overflow-hidden rounded-full bg-muted">
            <div className="demo-sweep h-full w-8 rounded-full bg-linear-to-r from-indigo-500 to-fuchsia-500" />
          </div>
          <div className="h-8 w-48 rounded-lg bg-[linear-gradient(90deg,var(--color-muted)_25%,var(--color-accent)_50%,var(--color-muted)_75%)] bg-[length:200%_100%] [animation:gallery-shimmer_1.6s_linear_infinite]" />
        </div>
      </Specimen>
    </SpecimenGroup>
  )
}

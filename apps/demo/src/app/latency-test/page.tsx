'use client'

import * as React from 'react'
import { ElementMirror } from '@frostin/element-mirror'

/**
 * Scratch page for measuring change-to-capture latency at a slow fps, where
 * the gap between grid-aligned and event-aligned capture is unmistakable.
 * Not linked from anywhere; used by .perf/latency-grid.mjs.
 */
export default function LatencyTestPage() {
  const sourceRef = React.useRef<HTMLDivElement>(null)
  const [label, setLabel] = React.useState('waiting')

  React.useEffect(() => {
    // Lets the harness flip the source's content from page.evaluate.
    ;(window as unknown as { __bump: (text: string) => void }).__bump = (
      text: string
    ) => setLabel(text)
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center gap-16 bg-zinc-950 text-white">
      <div
        ref={sourceRef}
        className="flex h-40 w-64 items-center justify-center rounded-xl bg-indigo-600 text-2xl font-bold"
      >
        {label}
      </div>
      <div data-mirror>
        <ElementMirror source={sourceRef} fps={5} />
      </div>
    </main>
  )
}

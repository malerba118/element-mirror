'use client'

import * as React from 'react'

import { ElementMirror } from '@frostin/element-mirror'
import { CodeBlock, Token } from '@/components/demo/section'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type ColumnId = 'queue' | 'shipped'

interface Task {
  id: string
  title: string
  detail: string
  tags: string[]
  tone: string
  progress: number
}

const COLUMNS: { id: ColumnId; name: string }[] = [
  { id: 'queue', name: 'In progress' },
  { id: 'shipped', name: 'Shipped' },
]

const INITIAL: Record<ColumnId, Task[]> = {
  queue: [
    {
      id: 'session',
      title: 'Session refresh',
      detail: 'api · 3 files',
      tags: ['api', 'p1'],
      tone: 'from-indigo-500 to-violet-500',
      progress: 62,
    },
    {
      id: 'sheet',
      title: 'Bottom sheet gestures',
      detail: 'mobile · 8 files',
      tags: ['ui'],
      tone: 'from-fuchsia-500 to-pink-500',
      progress: 34,
    },
    {
      id: 'audit',
      title: 'Query audit log',
      detail: 'db · 2 files',
      tags: ['infra', 'p2'],
      tone: 'from-cyan-500 to-blue-500',
      progress: 12,
    },
  ],
  shipped: [
    {
      id: 'tokens',
      title: 'Colour tokens',
      detail: 'design · 41 files',
      tags: ['ui'],
      tone: 'from-emerald-500 to-teal-500',
      progress: 100,
    },
  ],
}

interface DragState {
  id: string
  element: HTMLElement
  /** False while the press might still turn out to be a click. */
  active: boolean
}

/** How far the pointer travels before a press counts as a drag. */
const DRAG_THRESHOLD = 4

export function DragGhostShowcase() {
  const [columns, setColumns] = React.useState(INITIAL)
  const [drag, setDrag] = React.useState<DragState | null>(null)
  const [over, setOver] = React.useState<ColumnId | null>(null)

  const ghostRef = React.useRef<HTMLDivElement>(null)
  // Where in the card the pointer grabbed it, so the ghost sits under the
  // cursor exactly where the card did.
  const grab = React.useRef({ x: 0, y: 0 })
  const pointer = React.useRef({ x: 0, y: 0 })
  const origin = React.useRef({ x: 0, y: 0 })
  const queueRef = React.useRef<HTMLDivElement>(null)
  const shippedRef = React.useRef<HTMLDivElement>(null)
  const columnRefs = React.useMemo(
    () => ({ queue: queueRef, shipped: shippedRef }),
    []
  )

  const placeGhost = React.useCallback(() => {
    const ghost = ghostRef.current
    if (!ghost) return
    // Landing the bitmap on whole device pixels. Anywhere in between and the
    // compositor has to resample it, which shows up as a soft edge.
    const density = window.devicePixelRatio || 1
    const snap = (value: number) => Math.round(value * density) / density
    const x = snap(pointer.current.x - grab.current.x)
    const y = snap(pointer.current.y - grab.current.y)
    // Moving the ghost is a transform, so it tracks the pointer at pointer
    // speed no matter how slowly the mirror behind it is capturing.
    ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`
  }, [])

  // The ghost mounts a frame after the drag starts, so place it before paint.
  React.useLayoutEffect(placeGhost, [drag, placeGhost])

  function columnAt(x: number, y: number): ColumnId | null {
    for (const { id } of COLUMNS) {
      const rect = columnRefs[id].current?.getBoundingClientRect()
      if (!rect) continue
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return id
      }
    }
    return null
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>, id: string) {
    if (event.button !== 0) return
    const element = event.currentTarget
    const rect = element.getBoundingClientRect()
    grab.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    pointer.current = { x: event.clientX, y: event.clientY }
    origin.current = { x: event.clientX, y: event.clientY }
    element.setPointerCapture(event.pointerId)
    // Mounted hidden, so the mirror is already capturing while the press is
    // still deciding whether it is a drag. By the time the ghost is revealed
    // it has a frame to show, instead of appearing empty for one.
    setDrag({ id, element, active: false })
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return
    pointer.current = { x: event.clientX, y: event.clientY }
    placeGhost()

    if (!drag.active) {
      const travelled = Math.hypot(
        event.clientX - origin.current.x,
        event.clientY - origin.current.y
      )
      if (travelled < DRAG_THRESHOLD) return
      setDrag({ ...drag, active: true })
    }

    const target = columnAt(event.clientX, event.clientY)
    setOver((previous) => (previous === target ? previous : target))
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return
    const target = drag.active ? columnAt(event.clientX, event.clientY) : null
    if (target) {
      setColumns((previous) => {
        const from = COLUMNS.map(({ id }) => id).find((id) =>
          previous[id].some((task) => task.id === drag.id)
        )
        if (!from || from === target) return previous
        const task = previous[from].find((item) => item.id === drag.id)
        if (!task) return previous
        return {
          ...previous,
          [from]: previous[from].filter((item) => item.id !== drag.id),
          [target]: [...previous[target], task],
        }
      })
    }
    setDrag(null)
    setOver(null)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {COLUMNS.map(({ id, name }) => (
              <div
                key={id}
                ref={columnRefs[id]}
                className={cn(
                  'min-h-64 rounded-xl border border-dashed p-3 transition-colors',
                  over === id && drag?.active
                    ? 'border-primary bg-primary/5'
                    : 'border-border'
                )}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="text-xs font-medium">{name}</span>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {columns[id].length}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {columns[id].map((task) => (
                    <div key={task.id} className="relative">
                      <div
                        onPointerDown={(event) => startDrag(event, task.id)}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        className="cursor-grab touch-none rounded-lg bg-card p-3 ring-1 ring-foreground/10 select-none active:cursor-grabbing"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              'grid size-9 shrink-0 place-items-center rounded-md bg-linear-to-br text-[11px] font-semibold text-white',
                              task.tone
                            )}
                          >
                            {task.title.slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {task.title}
                            </p>
                            <p className="font-mono text-[11px] text-muted-foreground">
                              {task.detail}
                            </p>
                          </div>
                          <span className="demo-pulse size-2 shrink-0 rounded-full bg-emerald-500" />
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          {task.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                          <span className="ml-auto font-mono text-[10px] text-muted-foreground tabular-nums">
                            {task.progress}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-violet-500"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                      </div>

                      {/* The card stays rendered and on screen, because that is
                          what the ghost is capturing. The slot is drawn over
                          it rather than by fading the card itself. */}
                      {drag?.active && drag.id === task.id ? (
                        <div className="absolute inset-0 rounded-lg border-2 border-dashed border-primary/40 bg-background/80" />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Drag a card between the columns. The card under the cursor is a
            mirror, not a clone: one <Token>&lt;canvas&gt;</Token> the size of
            the original, pixel for pixel, still ticking along with it.
          </p>
        </CardContent>
      </Card>

      {drag ? (
        <div
          ref={ghostRef}
          className={cn(
            'pointer-events-none fixed top-0 left-0 z-50 will-change-transform',
            drag.active ? 'demo-ghost-in' : 'opacity-0'
          )}
        >
          <ElementMirror
            source={drag.element}
            fps={15}
            // No width or height, so the ghost takes the card's own size and
            // one bitmap pixel lands on one device pixel.
            className="block rounded-lg shadow-2xl shadow-black/40"
          />
        </div>
      ) : null}

      <CodeBlock
        code={`const [drag, setDrag] = useState<HTMLElement | null>(null)

<div onPointerDown={(event) => setDrag(event.currentTarget)} …>…</div>

{drag ? (
  <div ref={ghostRef} className="pointer-events-none fixed top-0 left-0">
    <ElementMirror source={drag} fps={15} />
  </div>
) : null}`}
      />

      <div className="space-y-3 text-xs text-muted-foreground">
        <p>
          The alternatives cost more than they look. Cloning the node copies a
          whole subtree, along with its ids, its React-owned state, and its
          animations restarting from zero. The drag-and-drop API&apos;s{' '}
          <Token>setDragImage</Token> takes a bitmap once at drag start, so it
          cannot keep up with a card that changes mid-drag. A mirror is a
          single canvas that follows the pointer with a transform.
        </p>
        <p>
          A capture takes a few milliseconds to arrive, which is long enough
          for a ghost mounted and shown in the same instant to appear empty for
          a frame. The fix is to separate the two: the mirror mounts hidden on
          pointer down and is revealed only once the pointer has travelled far
          enough to count as a drag. It spends that time capturing, so it has a
          frame ready by the time anyone sees it, and a plain click no longer
          lifts the card.
        </p>
        <p>
          The ghost is deliberately not tilted, which is the one thing a clone
          does better. Rotate a DOM node and the browser re-rasterises its text
          at the new angle; rotate a canvas and there is nothing left to
          rasterise, only pixels to resample, so the type goes soft. Kept
          upright and snapped to whole device pixels, the ghost is
          indistinguishable from the card underneath it.
        </p>
        <p>
          One more thing worth knowing: the lifted card has to stay on screen,
          since it is what the ghost is capturing, and its own opacity is
          captured along with everything else. Fading the card to leave a gap
          behind would fade the ghost with it. The empty slot above is an
          overlay sitting on top of the card rather than a style on the card.
        </p>
      </div>
    </div>
  )
}

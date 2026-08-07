'use client'

import * as React from 'react'

import { Specimen, SpecimenGroup } from '@/components/gallery/specimen'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/** A scroll container parked partway down, which a capture has to follow. */
function ScrolledList({
  className,
  offset = 60,
  horizontal = false,
  children,
}: {
  className?: string
  offset?: number
  horizontal?: boolean
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const node = ref.current
    if (!node) return
    if (horizontal) node.scrollLeft = offset
    else node.scrollTop = offset
  }, [offset, horizontal])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

export function LayoutSpecimens() {
  return (
    <SpecimenGroup
      id="layout"
      title="Layout and overflow"
      description="Where things sit, what clips them, and what is scrolled out of view. A renderer walks the DOM in tree order, so anything that moves a box away from that order — a scroll offset, a stacking context, a sticky header — is somewhere it can go wrong."
    >
      <Specimen
        name="scrolled container"
        note="parked 60px down; the first rows should be out of sight"
      >
        <ScrolledList
          className="h-32 w-56 overflow-y-auto rounded-lg bg-muted/50 ring-1 ring-border"
          offset={60}
        >
          <ul className="divide-y divide-border text-sm">
            {Array.from({ length: 12 }, (_, index) => (
              <li key={index} className="px-3 py-2">
                Row {index + 1}
              </li>
            ))}
          </ul>
        </ScrolledList>
      </Specimen>

      <Specimen
        name="sticky header in a scroll container"
        note="the header should stay at the top of the box"
      >
        <ScrolledList
          className="h-32 w-56 overflow-y-auto rounded-lg bg-card ring-1 ring-border"
          offset={70}
        >
          <div className="sticky top-0 bg-card/95 px-3 py-2 text-xs font-medium ring-1 ring-border backdrop-blur">
            Sticky header
          </div>
          <ul className="divide-y divide-border text-sm">
            {Array.from({ length: 12 }, (_, index) => (
              <li key={index} className="px-3 py-2">
                Item {index + 1}
              </li>
            ))}
          </ul>
        </ScrolledList>
      </Specimen>

      <Specimen
        name="horizontal scroll"
        note="scrolled right, so the left columns are cut off"
      >
        <ScrolledList
          className="w-56 overflow-x-auto rounded-lg ring-1 ring-border"
          offset={80}
          horizontal
        >
          <div className="flex w-max gap-2 p-2">
            {['one', 'two', 'three', 'four', 'five'].map((label) => (
              <div
                key={label}
                className="rounded-md bg-muted px-3 py-2 text-sm whitespace-nowrap"
              >
                {label}
              </div>
            ))}
          </div>
        </ScrolledList>
      </Specimen>

      <Specimen
        name="rounded clipping"
        note="a photo, a gradient and a child all cut to the same corner"
      >
        <div className="flex items-center gap-3">
          <div className="size-20 overflow-hidden rounded-xl ring-1 ring-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/sample-frame.jpg"
              alt=""
              className="size-full object-cover"
            />
          </div>
          <div className="size-20 overflow-hidden rounded-full bg-linear-to-br from-indigo-500 to-fuchsia-500" />
          <div className="relative size-20 overflow-hidden rounded-xl bg-muted">
            <div className="absolute -top-3 -left-3 size-12 rotate-12 bg-emerald-500" />
          </div>
          <div className="relative size-20 rounded-xl bg-muted">
            <div className="absolute -top-3 -left-3 size-12 rotate-12 bg-amber-500" />
          </div>
        </div>
      </Specimen>

      <Specimen
        name="stacking order"
        note="z-index, negative margins and an overlapping ring"
      >
        <div className="flex items-center">
          <div className="relative z-30 size-14 rounded-full bg-indigo-500 ring-4 ring-card" />
          <div className="relative z-20 -ml-5 size-14 rounded-full bg-fuchsia-500 ring-4 ring-card" />
          <div className="relative z-10 -ml-5 size-14 rounded-full bg-amber-500 ring-4 ring-card" />
          <div className="relative -ml-5 size-14 rounded-full bg-emerald-500 ring-4 ring-card" />
          <Badge className="relative z-40 -ml-3">+4</Badge>
        </div>
      </Specimen>

      <Specimen
        name="absolute overlays"
        note="badges pinned to corners, a bar pinned to the bottom"
      >
        <div className="relative size-32 overflow-hidden rounded-xl bg-muted ring-1 ring-border">
          <Badge className="absolute top-2 left-2">new</Badge>
          <Badge variant="secondary" className="absolute right-2 bottom-8">
            2:14
          </Badge>
          <div className="absolute inset-x-0 bottom-0 h-6 bg-foreground/70 px-2 text-[11px] leading-6 text-background">
            pinned bar
          </div>
        </div>
      </Specimen>

      <Specimen name="transforms" note="rotate, scale, skew and a 3D card">
        <div className="flex items-center gap-6 py-3">
          <div className="size-14 rotate-12 rounded-lg bg-indigo-500" />
          <div className="size-14 scale-75 rounded-lg bg-fuchsia-500" />
          <div className="size-14 skew-x-12 rounded-lg bg-amber-500" />
          <div className="size-14 origin-bottom-left -rotate-12 rounded-lg bg-emerald-500" />
          <div style={{ perspective: '400px' }}>
            <div
              className="grid size-14 place-items-center rounded-lg bg-linear-to-br from-sky-500 to-indigo-600 text-xs text-white"
              style={{ transform: 'rotateY(35deg) rotateX(12deg)' }}
            >
              3D
            </div>
          </div>
        </div>
      </Specimen>

      <Specimen name="flex and grid" note="gaps, fractions, aspect ratios">
        <div className="space-y-3">
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
            <div className="rounded-md bg-muted p-2 text-xs">2fr</div>
            <div className="rounded-md bg-muted p-2 text-xs">1fr</div>
            <div className="rounded-md bg-muted p-2 text-xs">1fr</div>
          </div>
          <div className="flex gap-2">
            <div className="aspect-square w-12 rounded-md bg-indigo-500/20 ring-1 ring-indigo-500/40" />
            <div className="aspect-video w-24 rounded-md bg-indigo-500/20 ring-1 ring-indigo-500/40" />
            <div className="flex-1 rounded-md bg-indigo-500/20 ring-1 ring-indigo-500/40" />
          </div>
        </div>
      </Specimen>

      <Specimen name="disclosure" note="a details element, open and closed">
        <div className="max-w-xs space-y-2 text-sm">
          <details open className="rounded-lg bg-muted/50 p-3 ring-1 ring-border">
            <summary className="cursor-default font-medium">Open</summary>
            <p className="mt-2 text-muted-foreground">
              The marker is drawn by the browser, not by CSS.
            </p>
          </details>
          <details className="rounded-lg bg-muted/50 p-3 ring-1 ring-border">
            <summary className="cursor-default font-medium">Closed</summary>
            <p className="mt-2 text-muted-foreground">Hidden.</p>
          </details>
        </div>
      </Specimen>

      <Specimen
        name="dividers and rules"
        note="divide utilities, per-side borders, dashed and dotted"
      >
        <div className="space-y-3">
          <div className="flex divide-x divide-border rounded-lg ring-1 ring-border">
            <div className="px-3 py-2 text-sm">One</div>
            <div className="px-3 py-2 text-sm">Two</div>
            <div className="px-3 py-2 text-sm">Three</div>
          </div>
          <div className="flex gap-3">
            <div className="size-12 rounded-lg border-2 border-dashed border-indigo-500" />
            <div className="size-12 rounded-lg border-2 border-dotted border-fuchsia-500" />
            <div className="size-12 rounded-lg border-4 border-emerald-500 border-t-transparent" />
            <div className="size-12 rounded-lg border-t-4 border-r-2 border-b-8 border-l-2 border-amber-500" />
            <div className="size-12 rounded-full border-4 border-sky-500/30 border-t-sky-500" />
          </div>
        </div>
      </Specimen>

      <Specimen
        name="button group"
        note="shared radii between adjacent controls"
      >
        <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-border">
          <Button variant="ghost" className="rounded-none">
            Left
          </Button>
          <div className="w-px bg-border" />
          <Button variant="ghost" className="rounded-none">
            Middle
          </Button>
          <div className="w-px bg-border" />
          <Button variant="ghost" className="rounded-none">
            Right
          </Button>
        </div>
      </Specimen>
    </SpecimenGroup>
  )
}

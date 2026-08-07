'use client'

import { ThemeToggle } from '@/components/demo/theme-toggle'
import { ComponentSpecimens } from '@/components/gallery/groups/components'
import { FormSpecimens } from '@/components/gallery/groups/forms'
import { GraphicsSpecimens } from '@/components/gallery/groups/graphics'
import { LayoutSpecimens } from '@/components/gallery/groups/layout'
import { MotionSpecimens } from '@/components/gallery/groups/motion'
import { PaintSpecimens } from '@/components/gallery/groups/paint'
import { TextSpecimens } from '@/components/gallery/groups/text'
import { Gallery, GalleryControls } from '@/components/gallery/specimen'

const GROUPS = [
  { id: 'components', label: 'Components' },
  { id: 'forms', label: 'Forms' },
  { id: 'layout', label: 'Layout' },
  { id: 'paint', label: 'Colour' },
  { id: 'text', label: 'Text' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'motion', label: 'Motion' },
]

export default function GalleryPage() {
  return (
    <Gallery>
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <header className="space-y-4 pb-8">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-2">
              <h1 className="font-heading text-2xl font-medium tracking-tight">
                Fidelity gallery
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Each specimen is a piece of interface and a mirror of it, taken
                by the vendored renderer. Side by side, the source is on the
                left and the capture on the right. In the difference view the
                capture is laid over its source and blended, so whatever the two
                disagree on is the only thing lit up; turn the gain up to find a
                near miss.
              </p>
            </div>
            <ThemeToggle />
          </div>

          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {GROUPS.map((group) => (
              <a
                key={group.id}
                href={`#${group.id}`}
                className="hover:text-foreground"
              >
                {group.label}
              </a>
            ))}
          </nav>
        </header>

        <div className="sticky top-0 z-30 -mx-2 mb-8 rounded-lg bg-background/85 px-2 py-2 backdrop-blur">
          <GalleryControls />
        </div>

        <div className="space-y-14">
          <ComponentSpecimens />
          <FormSpecimens />
          <LayoutSpecimens />
          <PaintSpecimens />
          <TextSpecimens />
          <GraphicsSpecimens />
          <MotionSpecimens />
        </div>
      </div>
    </Gallery>
  )
}

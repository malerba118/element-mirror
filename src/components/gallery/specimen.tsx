'use client'

import * as React from 'react'

import { ElementMirror } from '@/components/element-mirror'
import { useMirrorEngine } from '@/components/mirror-engine-switch'
import { MIRROR_ENGINES } from '@/lib/mirror-engines'
import { cn } from '@/lib/utils'

/**
 * How a specimen shows its mirror.
 *
 * `split` puts the source and the mirror side by side, which is how a
 * difference in shape or colour is read. `difference` lays the mirror over the
 * source and blends the two, which turns anything they disagree on into the
 * only light in an otherwise black box, and is how a difference too small to
 * see in two places at once is found.
 */
export type SpecimenView = 'split' | 'difference'

interface GalleryState {
  view: SpecimenView
  setView: (view: SpecimenView) => void
  /** Multiplies the blended result, so a near miss is not lost in the black. */
  gain: number
  setGain: (gain: number) => void
  fps: number
  setFps: (fps: number) => void
  /**
   * The page's own background, as a colour a canvas can take. Mirrors are
   * filled with it so that the part of a specimen nothing paints on blends
   * against the page to black rather than lighting up.
   */
  background: string
}

const GalleryContext = React.createContext<GalleryState | null>(null)

function useGallery(): GalleryState {
  const state = React.useContext(GalleryContext)
  if (!state) throw new Error('Specimens have to be rendered in a Gallery')
  return state
}

/** Reads the resolved page background, following a change of theme. */
function usePageBackground(): string {
  const [background, setBackground] = React.useState('#ffffff')

  React.useEffect(() => {
    const read = () => {
      setBackground(getComputedStyle(document.body).backgroundColor)
    }
    read()

    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
    return () => observer.disconnect()
  }, [])

  return background
}

export function Gallery({ children }: { children: React.ReactNode }) {
  const [view, setView] = React.useState<SpecimenView>('split')
  const [gain, setGain] = React.useState(1)
  const [fps, setFps] = React.useState(8)
  const background = usePageBackground()

  const state = React.useMemo(
    () => ({ view, setView, gain, setGain, fps, setFps, background }),
    [view, gain, fps, background]
  )

  return (
    <GalleryContext.Provider value={state}>{children}</GalleryContext.Provider>
  )
}

function ControlButton({
  active,
  className,
  ...props
}: React.ComponentProps<'button'> & { active: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40',
        active
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        className
      )}
      {...props}
    />
  )
}

export function GalleryControls({ className }: { className?: string }) {
  const { view, setView, gain, setGain, fps, setFps } = useGallery()
  const [engine, chooseEngine] = useMirrorEngine()

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-5 gap-y-2 text-xs',
        className
      )}
    >
      <div className="flex items-center gap-1">
        <span className="mr-1 text-muted-foreground">engine</span>
        {MIRROR_ENGINES.map((value) => (
          <ControlButton
            key={value}
            data-engine={value}
            active={engine === value}
            onClick={() => chooseEngine(value)}
          >
            {value}
          </ControlButton>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <span className="mr-1 text-muted-foreground">view</span>
        <ControlButton
          active={view === 'split'}
          onClick={() => setView('split')}
        >
          source | mirror
        </ControlButton>
        <ControlButton
          active={view === 'difference'}
          onClick={() => setView('difference')}
        >
          difference
        </ControlButton>
      </div>

      <div className="flex items-center gap-1">
        <span className="mr-1 text-muted-foreground">gain</span>
        {[1, 4, 10].map((value) => (
          <ControlButton
            key={value}
            active={gain === value}
            disabled={view !== 'difference'}
            onClick={() => setGain(value)}
            className="font-mono"
          >
            {value}&times;
          </ControlButton>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <span className="mr-1 text-muted-foreground">fps</span>
        {[1, 8, 24].map((value) => (
          <ControlButton
            key={value}
            data-fps={value}
            active={fps === value}
            onClick={() => setFps(value)}
          >
            {value}
          </ControlButton>
        ))}
      </div>
    </div>
  )
}

interface SpecimenGroupProps {
  id: string
  title: string
  description: React.ReactNode
  children: React.ReactNode
}

export function SpecimenGroup({
  id,
  title,
  description,
  children,
}: SpecimenGroupProps) {
  return (
    <section id={id} className="scroll-mt-24 space-y-5">
      <div className="space-y-1">
        <h2 className="font-heading text-lg font-medium tracking-tight">
          {title}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">{children}</div>
    </section>
  )
}

interface SpecimenProps {
  /** Names the specimen, so a report can point at one. */
  name: string
  /** What the specimen is for, and what to look at. */
  note?: string
  /** Takes the full width of the group, for anything wide. */
  wide?: boolean
  /** Applied to the element that is mirrored. */
  className?: string
  children: React.ReactNode
}

export function Specimen({
  name,
  note,
  wide,
  className,
  children,
}: SpecimenProps) {
  const { view, gain, fps, background } = useGallery()
  const sourceRef = React.useRef<HTMLDivElement>(null)

  const source = (
    <div ref={sourceRef} data-specimen-source className={className}>
      {children}
    </div>
  )

  return (
    <figure
      // Lets one specimen be pulled out of the page by name, for a screenshot
      // or a diff, without hunting for it by position.
      data-specimen={name}
      className={cn(
        'flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-border',
        wide && 'lg:col-span-2'
      )}
    >
      <figcaption className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-xs font-medium">{name}</span>
        {note ? (
          <span className="text-right text-[11px] leading-tight text-muted-foreground">
            {note}
          </span>
        ) : null}
      </figcaption>

      {view === 'split' ? (
        <div className="grid grid-cols-2 items-start gap-4">
          {source}
          <ElementMirror
            source={sourceRef}
            fps={fps}
            background={background}
            className="block"
          />
        </div>
      ) : (
        <div
          className="relative isolate w-full"
          style={gain > 1 ? { filter: `brightness(${gain})` } : undefined}
        >
          {source}
          <ElementMirror
            source={sourceRef}
            fps={fps}
            background={background}
            className="absolute top-0 left-0 mix-blend-difference"
          />
        </div>
      )}
    </figure>
  )
}

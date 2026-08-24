import { CaptureStatsBadge } from '@/components/demo/capture-stats'
import { DelayShowcase } from '@/components/demo/delay-showcase'
import { DragGhostShowcase } from '@/components/demo/drag-ghost-showcase'
import { FrameRateShowcase } from '@/components/demo/frame-rate-showcase'
import { Playground } from '@/components/demo/playground'
import { PropsReference } from '@/components/demo/props-reference'
import { Section, Token } from '@/components/demo/section'
import { SharingShowcase } from '@/components/demo/sharing-showcase'
import { SizingShowcase } from '@/components/demo/sizing-showcase'
import { SnapshotShowcase } from '@/components/demo/snapshot-showcase'
import { ThemeToggle } from '@/components/demo/theme-toggle'
import { VideoBackdropShowcase } from '@/components/demo/video-backdrop-showcase'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <span className="font-heading text-sm font-medium">
            ElementMirror
          </span>
          <div className="flex items-center gap-3">
            <CaptureStatsBadge />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-16 px-6 py-14">
        <div className="max-w-2xl space-y-4">
          <Badge variant="secondary" className="font-mono text-xs">
            React 19 · canvas
          </Badge>
          <h1 className="font-heading text-4xl font-medium tracking-tight">
            A live mirror of any DOM element
          </h1>
          <p className="text-base text-muted-foreground">
            <Token>ElementMirror</Token> repaints another element into a{' '}
            <Token>&lt;canvas&gt;</Token> a few times a second. It sizes like
            an <Token>&lt;img&gt;</Token> of the source: leave it alone and it
            takes the source&apos;s own size, give it a width and it keeps the
            ratio, give it both dimensions and it keeps the ratio anyway, since
            a mirror is a picture of a box the source drew for itself.
          </p>
        </div>

        <Separator />

        <Section
          title="Playground"
          description={
            <>
              Every prop, wired to a control. The snippet underneath is the
              component rendering on the right, and its <Token>source</Token> is
              the ref held by the card on the left.
            </>
          }
        >
          <Playground />
        </Section>

        <Section
          title="It sizes like an image"
          description={
            <>
              The same source, mirrored several ways. There is no sizing prop:
              CSS decides, and the source only supplies the natural size and
              ratio to fall back on.
            </>
          }
        >
          <SizingShowcase />
        </Section>

        <Section
          title="Filling a frame the video does not fit"
          description={
            <>
              A portrait video in a landscape container leaves empty bars. The
              usual fix is to fill them with a scaled-up, blurred copy of the
              video, and a mirror is that copy: sized past the container the
              way you would size any oversized image, and it is a canvas, so a
              CSS <Token>filter</Token> blurs it.
            </>
          }
        >
          <VideoBackdropShowcase />
        </Section>

        <Section
          title="Drag ghosts"
          description={
            <>
              The thing under the cursor while you drag is usually a clone of
              the element, or a bitmap frozen at drag start. A mirror is
              neither: given no CSS size it comes out at the card&apos;s exact
              size, a transform moves it, and it keeps mirroring the real card
              the whole way across.
            </>
          }
        >
          <DragGhostShowcase />
        </Section>

        <Section
          title="Many mirrors, one capture"
          description={
            <>
              Capturing walks the source&apos;s subtree, which costs far more
              than drawing the result. So mirrors of the same element share a
              single capture and each draw from it, the fastest one sets the
              pace, and a source that holds still is not captured at all.
            </>
          }
        >
          <SharingShowcase />
        </Section>

        <Section
          title="Mirrors that run behind"
          description={
            <>
              <Token>delay</Token> shows the source as it was some milliseconds
              ago. Mirrors of one element share a single capture history, so a
              trail of them costs the same captures as one, and each is drawn
              whichever frame has aged into its own past. Skipping captures on a
              still source costs nothing here: a frame stands for every moment
              until the next one, so a gap in the history is not a gap in time.
            </>
          }
        >
          <DelayShowcase />
        </Section>

        <Section
          title="Frame rate is the cost dial"
          description={
            <>
              <Token>fps</Token> trades smoothness for CPU per mirror, and a
              group runs at its fastest member rather than the sum. Mirrors
              scrolled out of view stop capturing on their own, as do mirrors on
              a hidden tab, and the loop backs off on its own if captures turn
              out to be expensive.
            </>
          }
        >
          <FrameRateShowcase />
        </Section>

        <Section
          title="One frame and stop"
          description={
            <>
              <Token>paused</Token> holds a running mirror on its last frame
              until you let it go again. A mirror that has no frame yet takes
              one first, so mounting it paused paints a single frame and
              retires, the way a video shows its poster. That makes a cheap
              before-and-after snapshot of a component you are about to change.
            </>
          }
        >
          <SnapshotShowcase />
        </Section>

        <Section
          title="Props"
          description="Everything else is forwarded to the element that holds the mirror's box, and the ref points at it. The canvas inside is out of flow, since what it paints is not what the mirror occupies."
        >
          <PropsReference />
        </Section>
      </main>

      <footer className="border-t">
        <div className="mx-auto w-full max-w-6xl px-6 py-6 text-xs text-muted-foreground">
          Captures are produced by{' '}
          <a
            href="https://www.npmjs.com/package/@frostin/snapdom"
            className="underline underline-offset-4 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            @frostin/snapdom
          </a>
          , a fork of{' '}
          <a
            href="https://github.com/zumerlab/snapdom"
            className="underline underline-offset-4 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            SnapDOM
          </a>
          .
        </div>
      </footer>
    </div>
  )
}

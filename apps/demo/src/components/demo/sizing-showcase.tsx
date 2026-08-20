'use client'

import { ElementMirror } from '@frostin/element-mirror'

import { MirrorFigure } from '@/components/demo/mirror-figure'
import { MirrorSource } from '@/components/demo/mirror-source'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const SOURCE_ID = 'sizing-source'
const SOURCE = `#${SOURCE_ID}`
const FPS = 8
const BOX = { width: 320, height: 120 }

/**
 * Sizing is CSS's job, not a prop's. A mirror sizes like an image while there
 * is a ratio to follow, and once it is given a box the source's shape does not
 * fit there is one fit — the source's box, scaled uniformly, placed with
 * `objectPosition` — because a capture stretched to fill a box would have to
 * stretch the paint that left that box along with it.
 */
export function SizingShowcase() {
  const shared = (
    <>
      <MirrorFigure
        title="Width only"
        caption="Height follows the source's aspect ratio, exactly like an <img>."
        code={`<ElementMirror
  source="${SOURCE}"
  style={{ width: 220, height: 'auto' }}
/>`}
      >
        <ElementMirror
          source={SOURCE}
          fps={FPS}
          style={{ width: 220, height: 'auto' }}
          className="rounded-md"
        />
      </MirrorFigure>

      <MirrorFigure
        title="No size at all"
        caption="Falls back to the source's own width and height, the way an <img> falls back to its natural size. The bitmap is still captured at pixelRatio, so it stays crisp on retina."
        code={`<ElementMirror source="${SOURCE}" />`}
      >
        <ElementMirror source={SOURCE} fps={FPS} className="rounded-md" />
      </MirrorFigure>
    </>
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            One source, five sizing strategies
          </CardTitle>
          <CardDescription className="text-xs">
            Every mirror below names this element with the same CSS selector,
            and they share one capture between them.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-2">
          <MirrorSource id={SOURCE_ID} static />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {shared}

        <MirrorFigure
          title="Both dimensions"
          caption="A box the source's shape does not fit. There is no fit to choose: the source's box is scaled to the largest that fits inside, and the leftover space is left alone."
          code={`<ElementMirror
  source="${SOURCE}"
  style={{ width: 320, height: 120 }}
/>`}
        >
          <ElementMirror
            source={SOURCE}
            fps={FPS}
            style={BOX}
            className="rounded-md"
          />
        </MirrorFigure>

        <MirrorFigure
          title='objectPosition="left top"'
          caption="Which is all objectPosition has left to decide: where the source's box sits in the space it did not fill."
          code={`<ElementMirror
  source="${SOURCE}"
  objectPosition="left top"
  style={{ width: 320, height: 120 }}
/>`}
        >
          <ElementMirror
            source={SOURCE}
            fps={FPS}
            objectPosition="left top"
            style={BOX}
            className="rounded-md"
          />
        </MirrorFigure>

        <MirrorFigure
          className="lg:col-span-2"
          title="Filling a box it does not fit"
          caption="Covering, done the way you would fill a box with any oversized element: size the mirror to the smallest box that covers, and let the container crop it. The mirror keeps its ratio throughout, which is what makes min-width and min-height enough to say it."
          code={`<div className="h-[120px] w-[320px] overflow-hidden">
  <ElementMirror
    source="${SOURCE}"
    className="min-h-full min-w-full"
    style={{ width: 'auto', height: 'auto' }}
  />
</div>`}
        >
          <div
            className="overflow-hidden rounded-md"
            style={{ ...BOX, position: 'relative' }}
          >
            <ElementMirror
              source={SOURCE}
              fps={FPS}
              className="min-h-full min-w-full"
              style={{
                width: 'auto',
                height: 'auto',
                position: 'absolute',
                top: '50%',
                left: '50%',
                // Centres whatever overflowed, so the crop takes the same
                // amount off each side.
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>
        </MirrorFigure>
      </div>
    </div>
  )
}

'use client'

import { ElementMirror } from '@/components/element-mirror'
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

export function SizingShowcase() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            One source, four sizing strategies
          </CardTitle>
          <CardDescription className="text-xs">
            All four mirrors below name this element with the same CSS
            selector, and share one capture between them.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-2">
          <MirrorSource id={SOURCE_ID} static />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
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
            className="block rounded-md"
          />
        </MirrorFigure>

        <MirrorFigure
          title="No size at all"
          caption="Falls back to the source's own width and height, the way an <img> falls back to its natural size. The bitmap is still captured at pixelRatio, so it stays crisp on retina."
          code={`<ElementMirror source="${SOURCE}" />`}
        >
          <ElementMirror
            source={SOURCE}
            fps={FPS}
            className="block rounded-md"
          />
        </MirrorFigure>

        <MirrorFigure
          title='objectFit="cover"'
          caption="Both dimensions set, so the capture is cropped to fill the box."
          code={`<ElementMirror
  source="${SOURCE}"
  objectFit="cover"
  style={{ width: 320, height: 120 }}
/>`}
        >
          <ElementMirror
            source={SOURCE}
            fps={FPS}
            objectFit="cover"
            style={{ width: 320, height: 120 }}
            className="block rounded-md"
          />
        </MirrorFigure>

        <MirrorFigure
          title='objectFit="contain"'
          caption="Same box, letterboxed instead of cropped. The checkerboard is the untouched, transparent canvas."
          code={`<ElementMirror
  source="${SOURCE}"
  objectFit="contain"
  style={{ width: 320, height: 120 }}
/>`}
        >
          <ElementMirror
            source={SOURCE}
            fps={FPS}
            objectFit="contain"
            style={{ width: 320, height: 120 }}
            className="block rounded-md"
          />
        </MirrorFigure>
      </div>
    </div>
  )
}

'use client'

import * as React from 'react'

import { ElementMirror } from '@frostin/element-mirror'
import { Stat, useCaptureStats } from '@/components/demo/capture-stats'
import { MirrorSource } from '@/components/demo/mirror-source'
import { Token } from '@/components/demo/section'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

const SOURCE_ID = 'sharing-source'
const FPS = 12

export function SharingShowcase() {
  const sourceRef = React.useRef<HTMLDivElement>(null)
  const [mirrors, setMirrors] = React.useState(3)
  const [animate, setAnimate] = React.useState(true)
  const stats = useCaptureStats()

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Source</CardTitle>
            <CardDescription className="text-xs">
              One element, mirrored {mirrors} {mirrors === 1 ? 'time' : 'times'}{' '}
              at {FPS}fps.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center py-2">
            <MirrorSource
              id={SOURCE_ID}
              ref={sourceRef}
              label={`#${SOURCE_ID} / sourceRef`}
              static
              animate={animate}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Mirrors</CardTitle>
            <CardDescription className="text-xs">
              Each one draws from the same captured bitmap. They alternate
              between naming the source by selector and by ref, which changes
              nothing: sharing keys on the element they resolve to.
            </CardDescription>
            <CardAction>
              <Badge variant="secondary" className="font-mono">
                {mirrors} × {FPS}fps
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-wrap items-start gap-3">
            {Array.from({ length: mirrors }, (_, index) => (
              <ElementMirror
                key={index}
                source={index % 2 === 0 ? `#${SOURCE_ID}` : sourceRef}
                fps={FPS}
                style={{ width: 150, height: 'auto' }}
                className="block rounded-md ring-1 ring-border"
              />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-6">
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="mirror-count">mirrors of this source</Label>
                <span className="font-mono text-xs text-muted-foreground">
                  {mirrors}
                </span>
              </div>
              <Slider
                id="mirror-count"
                min={1}
                max={8}
                step={1}
                value={[mirrors]}
                onValueChange={([value]) => setMirrors(value)}
              />
              <p className="text-xs text-muted-foreground">
                Watch <Token>blit/s</Token> climb while{' '}
                <Token>captures/s</Token> stays flat.
              </p>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="animate-source">source is animating</Label>
                <p className="text-xs text-muted-foreground">
                  Turn it off and the source holds still, so there is nothing
                  to capture and the loop goes quiet.
                </p>
              </div>
              <Switch
                id="animate-source"
                checked={animate}
                onCheckedChange={setAnimate}
              />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            <Stat
              label="captures/s"
              value={stats.capturesPerSecond}
              emphasis
              hint="Shared across every mirror."
            />
            <Stat
              label="blits/s"
              value={stats.blitsPerSecond}
              hint="One drawImage per mirror per frame."
            />
            <Stat
              label="ms/capture"
              value={stats.msPerCapture}
              hint="Grows with the source's subtree."
            />
            <Stat
              label="main thread"
              value={stats.mainThreadPercent}
              unit="%"
              hint="captures/s × ms, budget-capped at 20%."
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Counts cover every mirror on the page, but mirrors scrolled out of
            view stop capturing, so these numbers are effectively this section&apos;s.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import * as React from 'react'

import { ElementMirror } from '@frostin/element-mirror'

import { Stat, useCaptureStats } from '@/components/demo/capture-stats'
import { MirrorSource } from '@/components/demo/mirror-source'
import { CodeBlock, Token } from '@/components/demo/section'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'

const SOURCE_ID = 'delay-source'
const FPS = 20
const GHOSTS = 4

export function DelayShowcase() {
  const [spacing, setSpacing] = React.useState(250)
  const stats = useCaptureStats()

  const delays = Array.from({ length: GHOSTS }, (_, index) => index * spacing)

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Source</CardTitle>
            <CardDescription className="text-xs">
              Its clock is the giveaway: every mirror reads a different time.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center py-2">
            <MirrorSource id={SOURCE_ID} static />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Mirrors, each further behind</CardTitle>
            <CardDescription className="text-xs">
              One capture per frame feeds all of them. A delayed mirror costs
              history, not captures.
            </CardDescription>
            <CardAction>
              <Badge variant="secondary" className="font-mono">
                {GHOSTS} × {FPS}fps
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3">
            {delays.map((delay) => (
              <div key={delay} className="space-y-1.5">
                <ElementMirror
                  source={`#${SOURCE_ID}`}
                  fps={FPS}
                  delay={delay}
                  style={{ width: '100%', height: 'auto' }}
                  className="block rounded-md ring-1 ring-border"
                />
                <p className="font-mono text-[11px] text-muted-foreground">
                  {delay === 0 ? 'live' : `−${delay}ms`}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-6">
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="spacing">spacing between mirrors</Label>
                <span className="font-mono text-xs text-muted-foreground">
                  {spacing}ms
                </span>
              </div>
              <Slider
                id="spacing"
                min={0}
                max={500}
                step={50}
                value={[spacing]}
                onValueChange={([value]) => setSpacing(value)}
              />
              <p className="text-xs text-muted-foreground">
                At <Token>0</Token> they collapse onto the source. Widen it and
                they fan out into the past, up to{' '}
                <Token>{spacing * (GHOSTS - 1)}ms</Token> behind.
              </p>
            </div>

            <div className="space-y-3">
              <Label>How far back it can reach</Label>
              <p className="text-xs text-muted-foreground">
                History is kept only as far back as the furthest mirror needs,
                so this slider decides the memory: {FPS} frames a second for{' '}
                {spacing * (GHOSTS - 1)}ms is about{' '}
                {Math.max(
                  1,
                  Math.round((spacing * (GHOSTS - 1) * FPS) / 1000)
                )}{' '}
                frames of the source held at a time.
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            <Stat
              label="captures/s"
              value={stats.capturesPerSecond}
              emphasis
              hint="Flat, however far the trail reaches."
            />
            <Stat
              label="blits/s"
              value={stats.blitsPerSecond}
              hint="One per mirror per frame."
            />
            <Stat
              label="ms/capture"
              value={stats.msPerCapture}
              hint="Unchanged by delay."
            />
            <Stat
              label="main thread"
              value={stats.mainThreadPercent}
              unit="%"
              hint="Delay buys latency with memory, not CPU."
            />
          </div>
        </CardContent>
      </Card>

      <CodeBlock
        code={`{[0, 250, 500, 750].map((delay) => (
  <ElementMirror key={delay} source="#${SOURCE_ID}" fps={${FPS}} delay={delay} />
))}`}
      />
    </div>
  )
}

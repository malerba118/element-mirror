'use client'

import * as React from 'react'
import { PauseIcon, PlayIcon } from 'lucide-react'

import {
  Mirror,
  useMirrorName,
  useMirrorVersion,
} from '@/components/demo/mirror'
import { CodeBlock, Token } from '@/components/demo/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const VIDEO_ID = 'backdrop-video'

const ASPECTS = {
  '16 / 9': 'landscape',
  '4 / 3': 'classic',
  '1 / 1': 'square',
} as const

type Aspect = keyof typeof ASPECTS

export function VideoBackdropShowcase() {
  const [aspect, setAspect] = React.useState<Aspect>('16 / 9')
  const [blur, setBlur] = React.useState(28)
  const [backdrop, setBackdrop] = React.useState(true)
  const [playing, setPlaying] = React.useState(true)
  const videoRef = React.useRef<HTMLVideoElement>(null)

  const { version } = useMirrorVersion()
  const name = useMirrorName()

  // Covering a box of the wrong ratio is the one thing the two versions ask for
  // differently, and this is the case that asks for it. Version 1 fills a box
  // you give it, so the box is the container and `objectFit` says how to fill
  // it. Version 2 keeps its source's ratio no matter what, so a minimum on each
  // axis already describes the smallest box that covers, and the container's own
  // overflow does the cropping — the same thing you would write for an oversized
  // image. Both are then overscanned so the blur's soft edge stays out of sight.
  const cover =
    version === 1
      ? {
          objectFit: 'cover' as const,
          className: 'pointer-events-none absolute inset-0 h-full w-full',
          size: null,
          transform: 'scale(1.15)',
        }
      : {
          objectFit: undefined,
          className:
            'pointer-events-none absolute top-1/2 left-1/2 min-h-full min-w-full',
          size: { width: 'auto', height: 'auto' } as const,
          transform: 'translate(-50%, -50%) scale(1.15)',
        }

  function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play()
    } else {
      video.pause()
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            A 9:16 video in a {ASPECTS[aspect]} frame
          </CardTitle>
          <CardDescription className="text-xs">
            There is one video element here. Everything around it is a mirror of
            that same element, blown up to cover and blurred. Its controls are
            painted by the browser rather than the DOM, so the capture never
            picks them up.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary" className="font-mono">
              1 decode
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div
            className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-xl bg-muted"
            style={{ aspectRatio: aspect }}
          >
            {backdrop ? (
              <Mirror
                source={videoRef}
                fps={12}
                // The backdrop is blurred beyond recognition, so it does not
                // need a crisp capture.
                pixelRatio={0.5}
                objectFit={cover.objectFit}
                className={cover.className}
                style={{
                  ...cover.size,
                  filter: `blur(${blur}px) saturate(0.8) brightness(0.9)`,
                  transform: cover.transform,
                }}
              />
            ) : null}

            <video
              id={VIDEO_ID}
              ref={videoRef}
              className="relative mx-auto h-full w-auto"
              src="/portrait.mp4"
              autoPlay
              loop
              muted
              playsInline
              controls
              // The native controls can start and stop playback too, so follow
              // the element rather than assume the button is the only cause.
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-6">
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-3">
            <div className="space-y-3">
              <Label>container aspect</Label>
              <Tabs
                value={aspect}
                onValueChange={(value) => setAspect(value as Aspect)}
              >
                <TabsList className="w-full">
                  {Object.keys(ASPECTS).map((value) => (
                    <TabsTrigger key={value} value={value}>
                      {value.replace(/ /g, '')}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="blur">backdrop blur</Label>
                <span className="font-mono text-xs text-muted-foreground">
                  {blur}px
                </span>
              </div>
              <Slider
                id="blur"
                min={0}
                max={60}
                step={2}
                value={[blur]}
                disabled={!backdrop}
                onValueChange={([value]) => setBlur(value)}
              />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="backdrop">blurred backdrop</Label>
                <p className="text-xs text-muted-foreground">
                  Off leaves the bars empty, the way the video alone would look.
                </p>
              </div>
              <Switch
                id="backdrop"
                checked={backdrop}
                onCheckedChange={setBackdrop}
              />
            </div>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-xs text-muted-foreground">
              Pausing the video stops the mirror too: a paused video advances no
              frames, so there is nothing new to capture and the loop goes
              quiet on its own.
            </p>
            <Button variant="outline" size="sm" onClick={togglePlayback}>
              {playing ? <PauseIcon /> : <PlayIcon />}
              {playing ? 'Pause video' : 'Play video'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <CodeBlock
        code={`<div className="relative aspect-video overflow-hidden">
  <${name}
    source={videoRef}
    pixelRatio={0.5}${version === 1 ? '\n    objectFit="cover"' : ''}
    className="${cover.className.replace('pointer-events-none ', '')}"
    style={{${cover.size ? "\n      width: 'auto',\n      height: 'auto'," : ''}
      filter: 'blur(${blur}px)',
      transform: '${cover.transform}',
    }}
  />
  <video ref={videoRef} className="relative mx-auto h-full w-auto" ... />
</div>`}
      />

      <p className="text-xs text-muted-foreground">
        Doing this with a second <Token>&lt;video&gt;</Token> costs a second
        decode of the same file, and the two copies drift out of sync. A mirror
        is one decode presented twice.
      </p>
    </div>
  )
}

'use client'

import * as React from 'react'

import { ElementMirror } from '@frostin/element-mirror'

import { PlayerSource } from '@/components/demo/player-source'
import { CodeBlock } from '@/components/demo/section'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/** What CSS size the canvas is given, if any. */
type Layout = 'natural' | 'intrinsic' | 'boxed'

const POSITION_VALUES = ['center', 'top', 'bottom', 'left', 'right']

export function Playground() {
  const sourceRef = React.useRef<HTMLDivElement>(null)
  const [fps, setFps] = React.useState(12)
  const [delay, setDelay] = React.useState(0)
  const [pixelRatio, setPixelRatio] = React.useState(2)
  const [layout, setLayout] = React.useState<Layout>('boxed')
  const [width, setWidth] = React.useState(320)
  const [height, setHeight] = React.useState(160)
  const [objectPosition, setObjectPosition] = React.useState('center')
  const [transparent, setTransparent] = React.useState(true)
  const [paused, setPaused] = React.useState(false)

  const boxed = layout === 'boxed'
  const mirrorStyle: React.CSSProperties | undefined = boxed
    ? { width, height }
    : layout === 'intrinsic'
      ? { width, height: 'auto' }
      : undefined

  const code = React.useMemo(() => {
    const props = [
      'source={sourceRef}',
      `fps={${fps}}`,
      `pixelRatio={${pixelRatio}}`,
    ]
    if (delay > 0) props.push(`delay={${delay}}`)
    if (boxed && objectPosition !== 'center') {
      props.push(`objectPosition="${objectPosition}"`)
    }
    if (!transparent) props.push('background="#ffffff"')
    if (paused) props.push('paused')
    if (layout === 'intrinsic') {
      props.push(`style={{ width: ${width}, height: 'auto' }}`)
    }
    if (boxed) props.push(`style={{ width: ${width}, height: ${height} }}`)
    return `<ElementMirror\n${props.map((prop) => `  ${prop}`).join('\n')}\n/>`
  }, [
    boxed,
    delay,
    fps,
    height,
    layout,
    objectPosition,
    paused,
    pixelRatio,
    transparent,
    width,
  ])

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Source</CardTitle>
            <CardAction>
              <Badge variant="outline" className="font-mono">
                by ref
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-h-56 items-center justify-center py-2">
            <PlayerSource id="playground-source" ref={sourceRef} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mirror</CardTitle>
            <CardAction>
              <Badge variant="secondary" className="font-mono">
                {paused ? 'paused' : `${fps} fps`}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-h-56 items-center justify-center overflow-auto py-2">
            <div className="checkerboard inline-block rounded-md ring-1 ring-border">
              <ElementMirror
                source={sourceRef}
                fps={fps}
                delay={delay}
                pixelRatio={pixelRatio}
                objectPosition={objectPosition}
                background={transparent ? null : '#ffffff'}
                paused={paused}
                style={mirrorStyle}
                className="rounded-md"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="fps">fps</Label>
              <span className="font-mono text-xs text-muted-foreground">
                {fps}/s
              </span>
            </div>
            <Slider
              id="fps"
              min={1}
              max={60}
              step={1}
              value={[fps]}
              disabled={paused}
              onValueChange={([value]) => setFps(value)}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="delay">delay</Label>
              <span className="font-mono text-xs text-muted-foreground">
                {delay === 0 ? 'live' : `−${delay}ms`}
              </span>
            </div>
            <Slider
              id="delay"
              min={0}
              max={1000}
              step={50}
              value={[delay]}
              disabled={paused}
              onValueChange={([value]) => setDelay(value)}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="pixel-ratio">pixelRatio</Label>
              <span className="font-mono text-xs text-muted-foreground">
                {pixelRatio}×
              </span>
            </div>
            <Slider
              id="pixel-ratio"
              min={0.5}
              max={3}
              step={0.5}
              value={[pixelRatio]}
              onValueChange={([value]) => setPixelRatio(value)}
            />
          </div>

          <div className="space-y-3">
            <Label>css size</Label>
            <Tabs
              value={layout}
              onValueChange={(value) => setLayout(value as Layout)}
            >
              <TabsList className="w-full">
                <TabsTrigger value="natural">none</TabsTrigger>
                <TabsTrigger value="intrinsic">width</TabsTrigger>
                <TabsTrigger value="boxed">width + height</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="width">width</Label>
              <span className="font-mono text-xs text-muted-foreground">
                {layout === 'natural' ? 'from source' : `${width}px`}
              </span>
            </div>
            <Slider
              id="width"
              min={120}
              max={480}
              step={4}
              value={[width]}
              disabled={layout === 'natural'}
              onValueChange={([value]) => setWidth(value)}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="height">height</Label>
              <span className="font-mono text-xs text-muted-foreground">
                {boxed ? `${height}px` : 'auto'}
              </span>
            </div>
            <Slider
              id="height"
              min={80}
              max={320}
              step={4}
              value={[height]}
              disabled={!boxed}
              onValueChange={([value]) => setHeight(value)}
            />
          </div>

          <div className="space-y-3">
            <Label className="w-fit">objectFit</Label>
            <p className="text-xs text-muted-foreground">
              Not a prop. There is one fit: the source&apos;s box, scaled
              uniformly to whatever box CSS gave the mirror.
            </p>
          </div>

          <div className="space-y-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Label className="w-fit">objectPosition</Label>
              </TooltipTrigger>
              <TooltipContent side="right">
                Decides where the source&apos;s box sits in the space it did
                not fill.
              </TooltipContent>
            </Tooltip>
            <Select
              value={objectPosition}
              disabled={!boxed}
              onValueChange={setObjectPosition}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POSITION_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator className="md:col-span-2 lg:col-span-3" />

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="transparent">transparent background</Label>
              <p className="text-xs text-muted-foreground">
                {transparent ? 'background={null}' : 'background="#ffffff"'}
              </p>
            </div>
            <Switch
              id="transparent"
              checked={transparent}
              onCheckedChange={setTransparent}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="paused">paused</Label>
              <p className="text-xs text-muted-foreground">
                Keeps the last frame on screen.
              </p>
            </div>
            <Switch id="paused" checked={paused} onCheckedChange={setPaused} />
          </div>
        </CardContent>
      </Card>

      <CodeBlock code={code} />
    </div>
  )
}

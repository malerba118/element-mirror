'use client'

import * as React from 'react'

import { ElementMirror } from '@frostin/element-mirror'

import { useCaptureStats } from '@/components/demo/capture-stats'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'

/**
 * Slit scan: the viewport is sliced into parallel diagonal bands, and each
 * band shows the scene a step further back in time.
 *
 * The scene is one full-stage element — a few blurred gradient blobs chasing
 * the pointer — and every band is a full-stage ElementMirror of it, clipped to
 * its own diagonal strip and given its own `delay`. The bands tile the stage,
 * so the raw scene underneath is never seen directly; what you see is time
 * itself laid out across space. A moving light source breaks at every seam
 * because each band remembers a different moment, which is the whole look.
 *
 * All of it comes from the capture history that `delay` already keeps: one
 * capture per frame feeds every band, so twenty slices of the past cost the
 * same captures as one live mirror.
 */

const FPS = 30
/** Blobs are blurred beyond recognition, so captures can be very coarse. */
const PIXEL_RATIO = 0.4

const BLOBS = [
  // Chase rate: how much of the remaining distance a blob covers per frame.
  // Different rates make the cluster stretch along its own motion, which is
  // what feeds the bands something worth slicing.
  { size: 0.68, rate: 0.13, hue: 'radial-gradient(circle, #ff1e3c 0%, #ff1e3c 40%, transparent 72%)' },
  { size: 0.36, rate: 0.2, hue: 'radial-gradient(circle, #ffd0dc 0%, #ff8faa 30%, transparent 68%)' },
  { size: 0.52, rate: 0.06, hue: 'radial-gradient(circle, #ff5577 0%, #ff3d66dd 38%, transparent 72%)' },
  { size: 0.44, rate: 0.03, hue: 'radial-gradient(circle, #2fd8ff 0%, #2a7cffaa 42%, transparent 72%)' },
]

/** Drift the blobs on their own so the page performs without a pointer. */
function wander(now: number, width: number, height: number) {
  return {
    x: width * (0.5 + 0.34 * Math.sin(now * 0.0011) * Math.cos(now * 0.00043)),
    y: height * (0.5 + 0.34 * Math.sin(now * 0.00077 + 1.7)),
  }
}

/**
 * The clip polygon for band `index` of `count`, cut at `angle` degrees. Bands
 * are strips between parallel lines; the polygon is the strip drawn long
 * enough to cross the whole stage, and a hair of overlap on the trailing edge
 * hides antialiasing seams between neighbours.
 */
function bandClip(
  index: number,
  count: number,
  angle: number,
  width: number,
  height: number
) {
  const theta = (angle * Math.PI) / 180
  const n = { x: Math.cos(theta), y: Math.sin(theta) }
  const d = { x: -Math.sin(theta), y: Math.cos(theta) }
  const corners = [
    0,
    width * n.x,
    height * n.y,
    width * n.x + height * n.y,
  ]
  const min = Math.min(...corners)
  const max = Math.max(...corners)
  const step = (max - min) / count
  const a = min + index * step
  const b = a + step + 0.75
  const reach = width + height
  const point = (t: number, along: number) =>
    `${(n.x * t + d.x * along).toFixed(2)}px ${(n.y * t + d.y * along).toFixed(2)}px`
  return `polygon(${point(a, -reach)}, ${point(a, reach)}, ${point(b, reach)}, ${point(b, -reach)})`
}

export default function SlitScanPage() {
  const stageRef = React.useRef<HTMLDivElement>(null)
  const sceneRef = React.useRef<HTMLDivElement>(null)
  const blobRefs = React.useRef<(HTMLDivElement | null)[]>([])
  const [bands, setBands] = React.useState(14)
  const [timeStep, setTimeStep] = React.useState(80)
  const [angle, setAngle] = React.useState(50)
  const [size, setSize] = React.useState({ width: 0, height: 0 })
  const stats = useCaptureStats()

  // Pointer target and blob positions live outside React; the chase loop
  // writes transforms straight to the blobs at display rate.
  const motion = React.useRef({
    pointer: { x: 0, y: 0, at: -Infinity },
    blobs: BLOBS.map(() => ({ x: 0, y: 0, started: false })),
  })

  React.useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(() => {
      setSize({ width: stage.clientWidth, height: stage.clientHeight })
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    let frame = 0
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      const stage = stageRef.current
      if (!stage) return
      const { width, height } = { width: stage.clientWidth, height: stage.clientHeight }
      const m = motion.current
      // The pointer leads while it is moving; the scene wanders on its own
      // once it has been still for a moment.
      const idle = now - m.pointer.at > 1800
      const target = idle ? wander(now, width, height) : m.pointer
      m.blobs.forEach((blob, index) => {
        if (!blob.started) {
          blob.x = width / 2
          blob.y = height / 2
          blob.started = true
        }
        const { rate, size: scale } = BLOBS[index]
        blob.x += (target.x - blob.x) * rate
        blob.y += (target.y - blob.y) * rate
        const el = blobRefs.current[index]
        if (!el) return
        const px = Math.min(width, height) * scale
        el.style.width = `${px}px`
        el.style.height = `${px}px`
        el.style.transform = `translate3d(${blob.x - px / 2}px, ${blob.y - px / 2}px, 0)`
      })
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    motion.current.pointer = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      at: performance.now(),
    }
  }

  const ready = size.width > 0 && size.height > 0
  const strips = ready
    ? Array.from({ length: bands }, (_, index) => ({
        delay: index * timeStep,
        clipPath: bandClip(index, bands, angle, size.width, size.height),
      }))
    : []

  return (
    <div className="dark flex h-dvh flex-col overflow-hidden bg-black text-zinc-100">
      <header className="pointer-events-none absolute top-0 right-0 left-0 z-20 flex items-baseline justify-between px-6 pt-5">
        <h1 className="font-heading text-sm font-medium tracking-tight">
          Slit scan
        </h1>
        <p className="max-w-md text-right text-xs text-pretty text-zinc-500">
          Each diagonal band is a mirror of the same scene, one step further
          into the past. Move the cursor and watch the moment shear.
        </p>
      </header>

      <div
        ref={stageRef}
        onPointerMove={onPointerMove}
        className="relative flex-1 cursor-crosshair touch-none"
      >
        {/* The scene: never seen directly, only through the bands above it. */}
        <div ref={sceneRef} className="absolute inset-0 overflow-hidden bg-black">
          {BLOBS.map((blob, index) => (
            <div
              key={index}
              ref={(el) => {
                blobRefs.current[index] = el
              }}
              className="absolute top-0 left-0 rounded-full"
              style={{
                background: blob.hue,
                filter: 'blur(36px)',
                mixBlendMode: 'screen',
              }}
            />
          ))}
        </div>

        {strips.map(({ delay, clipPath }, index) => (
          <ElementMirror
            key={index}
            source={sceneRef}
            fps={FPS}
            delay={delay}
            pixelRatio={PIXEL_RATIO}
            className="pointer-events-none absolute top-0 left-0 z-10"
            style={{ clipPath }}
          />
        ))}
      </div>

      <footer className="z-20 flex flex-wrap items-center gap-x-10 gap-y-4 border-t border-white/10 bg-black px-6 py-5">
        <div className="w-56 space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="bands" className="text-xs text-zinc-400">
              bands
            </Label>
            <span className="font-mono text-xs text-zinc-500">{bands}</span>
          </div>
          <Slider
            id="bands"
            min={4}
            max={24}
            step={1}
            value={[bands]}
            onValueChange={([value]) => setBands(value)}
          />
        </div>

        <div className="w-56 space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="time-step" className="text-xs text-zinc-400">
              time step
            </Label>
            <span className="font-mono text-xs text-zinc-500">
              {timeStep}ms · reach {((bands - 1) * timeStep) / 1000}s
            </span>
          </div>
          <Slider
            id="time-step"
            min={30}
            max={150}
            step={10}
            value={[timeStep]}
            onValueChange={([value]) => setTimeStep(value)}
          />
        </div>

        <div className="w-56 space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="angle" className="text-xs text-zinc-400">
              angle
            </Label>
            <span className="font-mono text-xs text-zinc-500">{angle}°</span>
          </div>
          <Slider
            id="angle"
            min={0}
            max={90}
            step={5}
            value={[angle]}
            onValueChange={([value]) => setAngle(value)}
          />
        </div>

        <p className="ml-auto font-mono text-xs text-zinc-600">
          {stats.capturesPerSecond} cap/s · {stats.blitsPerSecond} blit/s ·{' '}
          {stats.mainThreadPercent}% thread
        </p>
      </footer>
    </div>
  )
}

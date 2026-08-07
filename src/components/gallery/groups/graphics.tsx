'use client'

import * as React from 'react'
import {
  Activity,
  Bell,
  Camera,
  Check,
  Heart,
  Settings,
  Volume2,
} from 'lucide-react'

import { Specimen, SpecimenGroup } from '@/components/gallery/specimen'

/** Something drawn rather than laid out, to see whether a nested canvas survives. */
function SparkCanvas() {
  const ref = React.useRef<HTMLCanvasElement>(null)

  React.useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const ratio = window.devicePixelRatio || 1
    canvas.width = 120 * ratio
    canvas.height = 48 * ratio
    context.scale(ratio, ratio)

    context.strokeStyle = '#6366f1'
    context.lineWidth = 2
    context.beginPath()
    for (let x = 0; x <= 120; x += 4) {
      const y = 24 + Math.sin(x / 12) * 14 * Math.cos(x / 40)
      if (x === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.stroke()
  }, [])

  return (
    <canvas
      ref={ref}
      style={{ width: 120, height: 48 }}
      className="rounded-md bg-muted"
    />
  )
}

export function GraphicsSpecimens() {
  return (
    <SpecimenGroup
      id="graphics"
      title="Images and SVG"
      description="An inline svg is rasterized rather than walked, an img has to be fetched and fitted, and a canvas is already a bitmap. Icons are the case that matters most: shadcn puts a lucide svg inside half its components."
    >
      <Specimen name="lucide icons" note="stroke width, sizing, currentColor">
        <div className="flex flex-wrap items-center gap-4">
          <Bell className="size-4" />
          <Settings className="size-6 text-muted-foreground" />
          <Heart className="size-8 fill-rose-500 text-rose-500" />
          <Volume2 className="size-6 text-indigo-500" strokeWidth={1} />
          <Camera className="size-6" strokeWidth={3} />
          <Activity className="size-10 text-emerald-500" />
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm">
            <Check className="size-4 text-emerald-500" /> inline with text
          </span>
        </div>
      </Specimen>

      <Specimen name="svg paint" note="gradients, patterns, dashes and text">
        <svg viewBox="0 0 220 80" className="h-20 w-[220px]">
          <defs>
            <linearGradient id="gallery-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
            <pattern
              id="gallery-dots"
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="2" cy="2" r="1.5" fill="#10b981" />
            </pattern>
          </defs>
          <rect x="0" y="10" width="60" height="60" rx="12" fill="url(#gallery-grad)" />
          <rect x="70" y="10" width="60" height="60" rx="12" fill="url(#gallery-dots)" />
          <circle
            cx="170"
            cy="40"
            r="26"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="6"
            strokeDasharray="10 6"
            strokeLinecap="round"
          />
          <text x="170" y="45" textAnchor="middle" className="fill-foreground text-[11px]">
            svg text
          </text>
        </svg>
      </Specimen>

      <Specimen name="svg clipping and filters" note="clipPath, mask, feGaussianBlur">
        <svg viewBox="0 0 220 80" className="h-20 w-[220px]">
          <defs>
            <clipPath id="gallery-clip">
              <polygon points="30,5 55,70 5,70" />
            </clipPath>
            <mask id="gallery-mask">
              <rect x="0" y="0" width="220" height="80" fill="black" />
              <circle cx="105" cy="40" r="28" fill="white" />
            </mask>
            <filter id="gallery-blur">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>
          <rect
            x="0"
            y="0"
            width="60"
            height="80"
            fill="#6366f1"
            clipPath="url(#gallery-clip)"
          />
          <rect
            x="75"
            y="10"
            width="60"
            height="60"
            fill="#ec4899"
            mask="url(#gallery-mask)"
          />
          <circle cx="185" cy="40" r="24" fill="#10b981" filter="url(#gallery-blur)" />
        </svg>
      </Specimen>

      <Specimen name="transformed svg" note="a rotated and scaled root, and a rotated group">
        <div className="flex items-center gap-6">
          <svg viewBox="0 0 40 40" className="size-14 rotate-45">
            <rect x="6" y="6" width="28" height="28" rx="6" fill="#6366f1" />
          </svg>
          <svg viewBox="0 0 40 40" className="size-14 scale-75">
            <rect x="6" y="6" width="28" height="28" rx="6" fill="#ec4899" />
          </svg>
          <svg viewBox="0 0 40 40" className="size-14">
            <g transform="rotate(20 20 20)">
              <rect x="6" y="6" width="28" height="28" rx="6" fill="#f59e0b" />
            </g>
          </svg>
          <svg viewBox="0 0 40 40" className="size-14" style={{ transform: 'skewY(12deg)' }}>
            <circle cx="20" cy="20" r="14" fill="#10b981" />
          </svg>
        </div>
      </Specimen>

      <Specimen name="object fit" note="cover, contain and fill in the same box">
        <div className="flex items-center gap-3">
          {(['cover', 'contain', 'fill', 'none'] as const).map((fit) => (
            <div key={fit} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/sample-frame.jpg"
                alt=""
                className="size-16 rounded-md bg-muted ring-1 ring-border"
                style={{ objectFit: fit }}
              />
              <div className="text-center font-mono text-[10px] text-muted-foreground">
                {fit}
              </div>
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen name="image sources" note="an svg data URL, a missing file, and alt text">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            className="size-16 rounded-md ring-1 ring-border"
            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%236366f1'/%3E%3Ccircle cx='32' cy='32' r='14' fill='%23fbbf24'/%3E%3C/svg%3E"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/does-not-exist.png"
            alt="Missing image"
            className="h-16 w-28 rounded-md text-xs ring-1 ring-border"
          />
          <div className="size-16 overflow-hidden rounded-full ring-2 ring-indigo-500">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sample-frame.jpg" alt="" className="size-full object-cover" />
          </div>
        </div>
      </Specimen>

      <Specimen name="nested canvas" note="a canvas inside the mirrored element">
        <div className="flex items-center gap-3">
          <SparkCanvas />
          <span className="text-xs text-muted-foreground">
            already a bitmap
          </span>
        </div>
      </Specimen>

      <Specimen name="video" note="a playing video inside the mirrored element">
        <video
          src="/portrait.mp4"
          className="h-24 w-40 rounded-lg object-cover ring-1 ring-border"
          autoPlay
          muted
          loop
          playsInline
        />
      </Specimen>
    </SpecimenGroup>
  )
}

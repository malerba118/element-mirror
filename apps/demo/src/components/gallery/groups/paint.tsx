'use client'

import { Specimen, SpecimenGroup } from '@/components/gallery/specimen'

export function PaintSpecimens() {
  return (
    <SpecimenGroup
      id="paint"
      title="Colour and effects"
      description="Everything a box can be filled with, and everything that can happen to it afterwards. Tailwind's palette is oklch and its opacity modifiers compile to colour-mix, so even a plain button is a colour the renderer has to work out rather than read."
    >
      <Specimen name="shadows" note="the whole scale, plus coloured and inset">
        <div className="flex flex-wrap items-center gap-4 p-2">
          <div className="size-12 rounded-lg bg-card shadow-xs" />
          <div className="size-12 rounded-lg bg-card shadow-sm" />
          <div className="size-12 rounded-lg bg-card shadow-md" />
          <div className="size-12 rounded-lg bg-card shadow-lg" />
          <div className="size-12 rounded-lg bg-card shadow-xl" />
          <div className="size-12 rounded-lg bg-card shadow-2xl" />
          <div className="size-12 rounded-lg bg-indigo-500 shadow-lg shadow-indigo-500/50" />
          <div className="size-12 rounded-lg bg-muted shadow-[inset_0_2px_6px_rgb(0_0_0/0.3)]" />
          <div className="size-12 rounded-full bg-card shadow-[0_0_0_4px_var(--color-indigo-500),0_8px_16px_rgb(0_0_0/0.3)]" />
        </div>
      </Specimen>

      <Specimen name="gradients" note="linear, radial, conic, and a stop past 100%">
        <div className="flex flex-wrap gap-3">
          <div className="size-16 rounded-lg bg-linear-to-br from-indigo-500 via-fuchsia-500 to-amber-400" />
          <div className="size-16 rounded-lg bg-radial from-emerald-400 to-sky-600" />
          <div className="size-16 rounded-full bg-conic from-indigo-500 via-fuchsia-500 to-indigo-500" />
          <div
            className="size-16 rounded-lg"
            style={{
              backgroundImage:
                'linear-gradient(70deg, #6366f1 0%, #ec4899 45%, #f59e0b 100%)',
            }}
          />
          <div
            className="size-16 rounded-lg"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--color-indigo-500) 0 6px, transparent 6px 12px)',
            }}
          />
          <div
            className="size-16 rounded-lg"
            style={{
              backgroundImage:
                'radial-gradient(circle at 30% 30%, #fff 0 4px, transparent 4px), linear-gradient(#0ea5e9, #6366f1)',
            }}
          />
        </div>
      </Specimen>

      <Specimen
        name="gradient text and borders"
        note="bg-clip-text, and a border painted by two backgrounds"
      >
        <div className="space-y-3">
          <p className="bg-linear-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-2xl font-semibold text-transparent">
            Painted through the glyphs
          </p>
          <div
            className="w-fit rounded-xl p-px"
            style={{
              background:
                'linear-gradient(120deg, var(--color-indigo-500), var(--color-fuchsia-500))',
            }}
          >
            <div className="rounded-[calc(0.75rem-1px)] bg-card px-3 py-2 text-sm">
              Gradient border
            </div>
          </div>
        </div>
      </Specimen>

      <Specimen
        name="colour syntaxes"
        note="oklch, colour-mix, hsl, alpha modifiers and currentColor"
      >
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="size-12 rounded-lg bg-primary/10 ring-1 ring-primary/30" />
          <div
            className="size-12 rounded-lg"
            style={{ background: 'oklch(0.68 0.19 25)' }}
          />
          <div
            className="size-12 rounded-lg"
            style={{
              background: 'color-mix(in oklch, var(--color-indigo-500), white 35%)',
            }}
          />
          <div
            className="size-12 rounded-lg"
            style={{ background: 'hsl(280 80% 60% / 0.5)' }}
          />
          <div
            className="size-12 rounded-lg"
            style={{ background: 'lab(60% 40 -50)' }}
          />
          <div className="size-12 rounded-lg bg-[#10b981]/40" />
          <div className="text-fuchsia-500">
            <svg viewBox="0 0 24 24" className="size-8">
              <circle cx="12" cy="12" r="10" fill="currentColor" />
            </svg>
          </div>
        </div>
      </Specimen>

      <Specimen
        name="opacity"
        note="element opacity, nested opacity, and a translucent overlay"
      >
        <div className="flex items-center gap-4">
          <div className="size-14 rounded-lg bg-indigo-500 opacity-100" />
          <div className="size-14 rounded-lg bg-indigo-500 opacity-60" />
          <div className="size-14 rounded-lg bg-indigo-500 opacity-25" />
          <div className="opacity-50">
            <div className="size-14 rounded-lg bg-fuchsia-500 opacity-50" />
          </div>
          <div className="relative size-14 rounded-lg bg-amber-400">
            <div className="absolute inset-2 rounded bg-black/40" />
          </div>
        </div>
      </Specimen>

      <Specimen name="filters" note="blur, grayscale, saturate, hue-rotate, drop-shadow">
        <div className="flex flex-wrap items-center gap-4 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sample-frame.jpg" alt="" className="size-14 rounded-lg object-cover" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/sample-frame.jpg"
            alt=""
            className="size-14 rounded-lg object-cover blur-[2px]"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/sample-frame.jpg"
            alt=""
            className="size-14 rounded-lg object-cover grayscale"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/sample-frame.jpg"
            alt=""
            className="size-14 rounded-lg object-cover saturate-200 hue-rotate-90"
          />
          <div className="size-14 rounded-lg bg-indigo-500 drop-shadow-lg drop-shadow-indigo-500/50" />
        </div>
      </Specimen>

      <Specimen
        name="backdrop filters"
        note="a glass panel over a photo and a gradient"
      >
        <div className="relative h-28 overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/sample-frame.jpg"
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-r from-indigo-600/50 to-transparent" />
          <div className="absolute inset-x-4 bottom-3 rounded-lg bg-white/20 px-3 py-2 text-sm text-white ring-1 ring-white/30 backdrop-blur-md">
            Frosted panel
          </div>
        </div>
      </Specimen>

      <Specimen name="blend modes" note="multiply, screen, overlay, difference">
        <div className="relative flex gap-3">
          {['multiply', 'screen', 'overlay', 'difference'].map((mode) => (
            <div
              key={mode}
              className="relative size-16 overflow-hidden rounded-lg bg-linear-to-br from-amber-400 to-rose-500"
            >
              <div
                className="absolute inset-3 rounded bg-sky-500"
                style={{ mixBlendMode: mode as React.CSSProperties['mixBlendMode'] }}
              />
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen
        name="masks"
        note="a gradient mask fading a photo and a block out"
      >
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/sample-frame.jpg"
            alt=""
            className="h-16 w-28 rounded-lg object-cover"
            style={{
              maskImage: 'linear-gradient(to right, black 40%, transparent)',
            }}
          />
          <div
            className="h-16 w-28 rounded-lg bg-linear-to-r from-indigo-500 to-fuchsia-500"
            style={{
              maskImage:
                'radial-gradient(circle at 50% 50%, black 40%, transparent 70%)',
            }}
          />
        </div>
      </Specimen>

      <Specimen
        name="background sizing"
        note="cover, contain, repeat, position and multiple layers"
      >
        <div className="flex flex-wrap gap-3">
          <div
            className="size-16 rounded-lg bg-cover bg-center"
            style={{ backgroundImage: 'url(/sample-frame.jpg)' }}
          />
          <div
            className="size-16 rounded-lg bg-contain bg-no-repeat bg-center ring-1 ring-border"
            style={{ backgroundImage: 'url(/sample-frame.jpg)' }}
          />
          <div
            className="size-16 rounded-lg ring-1 ring-border"
            style={{
              backgroundImage: 'url(/sample-frame.jpg)',
              backgroundSize: '24px',
              backgroundRepeat: 'repeat',
            }}
          />
          <div
            className="size-16 rounded-lg bg-muted ring-1 ring-border"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Ccircle cx='4' cy='4' r='2' fill='%236366f1'/%3E%3C/svg%3E\")",
              backgroundRepeat: 'repeat',
            }}
          />
        </div>
      </Specimen>
    </SpecimenGroup>
  )
}

'use client'

import { Specimen, SpecimenGroup } from '@/components/gallery/specimen'

export function TextSpecimens() {
  return (
    <SpecimenGroup
      id="text"
      title="Text"
      description="Text is the part a renderer has to lay out itself rather than copy. Line breaking, truncation, decoration and anything the browser generates rather than the document containing it are all places where a capture can drift from the page."
    >
      <Specimen name="scale and weight" note="sizes, weights and leading">
        <div className="space-y-1">
          <p className="text-2xl font-semibold tracking-tight">Heading</p>
          <p className="text-base font-medium">Subheading</p>
          <p className="text-sm">Body copy at the default weight.</p>
          <p className="text-xs text-muted-foreground">
            Caption, muted and small.
          </p>
          <p className="font-mono text-xs">monospace 0123456789</p>
        </div>
      </Specimen>

      <Specimen
        name="truncation"
        note="one line with an ellipsis, and two lines clamped"
      >
        <div className="max-w-[220px] space-y-3 text-sm">
          <p className="truncate">
            A single line of text far too long for the box it is in
          </p>
          <p className="line-clamp-2">
            Two lines of text, clamped, with the ellipsis landing at the end of
            the second line rather than the first, which is a different
            mechanism to the single-line case.
          </p>
          <p className="truncate text-right" dir="rtl">
            نص طويل جدا لا يتسع في هذا الصندوق الصغير
          </p>
        </div>
      </Specimen>

      <Specimen
        name="wrapping"
        note="balance, pretty, hyphens and a long unbroken word"
      >
        <div className="max-w-[260px] space-y-3 text-sm">
          <p className="text-balance">
            A balanced heading spreads its words evenly across its lines.
          </p>
          <p className="hyphens-auto" lang="en">
            Internationalization and counterrevolutionaries are hyphenated when
            they will not fit.
          </p>
          <p className="break-all font-mono text-xs">
            supercalifragilisticexpialidocious/supercalifragilistic
          </p>
        </div>
      </Specimen>

      <Specimen name="decoration" note="underline offsets, thickness, wavy, strike">
        <div className="space-y-2 text-sm">
          <p className="underline underline-offset-4">Underlined, offset 4</p>
          <p className="underline decoration-2 decoration-indigo-500">
            Thick and coloured
          </p>
          <p className="underline decoration-wavy decoration-rose-500">
            Wavy underline
          </p>
          <p className="line-through text-muted-foreground">Struck through</p>
          <p className="overline">Overlined</p>
        </div>
      </Specimen>

      <Specimen name="numbers" note="tabular against proportional figures">
        <div className="space-y-1 font-mono text-sm">
          <div className="tabular-nums">1,204.55 · 999.01 · 11.28</div>
          <div className="proportional-nums">1,204.55 · 999.01 · 11.28</div>
          <div className="text-2xl tabular-nums">344.1s</div>
          <div>
            10<sup>3</sup> and H<sub>2</sub>O
          </div>
        </div>
      </Specimen>

      <Specimen
        name="case and tracking"
        note="transforms the browser applies at paint time"
      >
        <div className="space-y-1 text-sm">
          <p className="uppercase tracking-widest">wide uppercase</p>
          <p className="lowercase">LOWERCASED TEXT</p>
          <p className="capitalize">capitalized each word</p>
          <p className="tracking-tighter text-lg">Tightly tracked text</p>
          <p style={{ fontVariant: 'small-caps' }}>Small caps rendering</p>
        </div>
      </Specimen>

      <Specimen
        name="scripts and symbols"
        note="emoji, CJK, right-to-left and combining marks"
      >
        <div className="space-y-1 text-sm">
          <p>Emoji: 🎛️ 🪞 ✅ 👩‍💻 🇬🇧</p>
          <p>日本語のテキストと漢字</p>
          <p dir="rtl">مرحبا بالعالم — مرآة</p>
          <p>Combining: é ñ ǫ̈ ẫ</p>
          <p className="font-mono">→ ← ↑ ↓ ✓ ✗ … ‹›</p>
        </div>
      </Specimen>

      <Specimen name="lists" note="markers, nesting and custom marker colour">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <ul className="list-disc space-y-1 pl-5">
            <li>First item</li>
            <li>
              Second item
              <ul className="list-[circle] pl-5">
                <li>Nested</li>
              </ul>
            </li>
            <li className="marker:text-indigo-500">Coloured marker</li>
          </ul>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Resolve the source</li>
            <li>Capture once</li>
            <li>Blit to every mirror</li>
          </ol>
        </div>
      </Specimen>

      <Specimen
        name="generated content"
        note="before and after, first-letter, quotes"
      >
        <div className="space-y-2 text-sm">
          <p className="before:mr-1 before:text-indigo-500 before:content-['→'] after:ml-1 after:text-muted-foreground after:content-['(new)']">
            Flanked by generated content
          </p>
          <p className="first-letter:float-left first-letter:mr-1 first-letter:text-3xl first-letter:leading-none first-letter:font-semibold">
            Drop capital at the start of a paragraph that runs on for a couple
            of lines so the float has something to sit against.
          </p>
          <blockquote className="border-l-2 border-indigo-500 pl-3 text-muted-foreground italic">
            A quote with a rule down its left side.
          </blockquote>
        </div>
      </Specimen>

      <Specimen name="inline flow" note="baselines, inline icons, marks, code">
        <p className="max-w-sm text-sm leading-relaxed">
          Inline <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">code</code>{' '}
          sits next to a{' '}
          <svg viewBox="0 0 24 24" className="inline size-4 align-text-bottom">
            <circle cx="12" cy="12" r="9" className="fill-indigo-500" />
          </svg>{' '}
          inline svg, a <mark className="bg-amber-200 px-0.5">highlighted</mark>{' '}
          run, a <a href="#text" className="text-primary underline">link</a>, and{' '}
          <strong>bold</strong> plus <em>italic</em> text on the same line.
        </p>
      </Specimen>

      <Specimen name="columns and vertical text" note="multi-column flow, writing modes">
        <div className="flex gap-4">
          <p className="columns-2 gap-4 text-xs leading-relaxed">
            Multi-column text flows down one column and then continues in the
            next, which is a layout the renderer has to follow rather than
            assume. This paragraph is long enough to fill both columns.
          </p>
          <p
            className="text-xs"
            style={{ writingMode: 'vertical-rl', height: 90 }}
          >
            Vertical writing mode
          </p>
        </div>
      </Specimen>
    </SpecimenGroup>
  )
}

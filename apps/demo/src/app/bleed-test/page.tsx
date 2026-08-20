'use client'

import * as React from 'react'

import { ElementMirror2 } from '@frostin/element-mirror'

/**
 * Exists for `.perf/bleed.mjs`, which asks whether ElementMirror2 can lay out
 * at its source's layout box while painting the source's transform, and land on
 * the source's own pixels while doing it.
 *
 * Each case appears twice in identical frames: the source in one, its bleed
 * mirror in the other. The frames are the same size and centre a box of the
 * same 120x24, so the two are comparable pixel for pixel and any error in
 * placing a frame shows up as a difference. The bar carries a red marker at its
 * left end, so a mirror that landed turned the wrong way, or mirrored about its
 * centre, cannot pass by accident.
 *
 * Every source is wrapped in a snug span. A transform never touches layout, so
 * that span's box is the source's layout box exactly — including its fraction
 * of a pixel, which `offsetWidth` would have rounded away — and it is the box
 * the mirror's wrapper stands in for.
 *
 * The `flow` rows are the other half of the claim: a rotating source sits
 * between two markers, and so does its mirror. A plain mirror's box tracks the
 * transformed bounding box, so the marker beside it would shuffle every frame.
 */

const STATIC: { name: string; transform: string | undefined }[] = [
  { name: 'still', transform: undefined },
  { name: 'translate', transform: 'translate(60px, 20px)' },
  { name: 'scale', transform: 'scale(2)' },
  { name: 'rotate', transform: 'rotate(45deg)' },
  { name: 'all', transform: 'translate(40px, 10px) rotate(30deg) scale(1.5)' },
]

const ANIMATED: { name: string; from: string; to: string; ms: number }[] = [
  // Slow enough that a capture's two-frame latency cannot account for a
  // mismatch, so what is left to see is the geometry.
  {
    name: 'creep',
    from: 'rotate(0deg) scale(1)',
    to: 'rotate(90deg) scale(1.6)',
    ms: 9000,
  },
  {
    name: 'sprint',
    from: 'translate(0, 0) rotate(0deg) scale(1)',
    to: 'translate(60px, 10px) rotate(200deg) scale(2)',
    ms: 900,
  },
]

const FRAME = { width: 320, height: 200 }

const Frame = ({
  role,
  children,
}: {
  role: 'source' | 'mirror'
  children: React.ReactNode
}) => (
  <div
    data-frame={role}
    style={{
      ...FRAME,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#ffffff',
      // Both columns crop at the same edges, which keeps the comparison fair
      // and, more to the point, keeps each frame's shot to itself: a mirror's
      // canvas is far wider than the frame holding it and would otherwise paint
      // over its neighbour, which an element screenshot faithfully includes.
      overflow: 'hidden',
    }}
  >
    {children}
  </div>
)

/** The snug wrapper: the source's layout box, and nothing of its transform. */
const Source = ({
  id,
  transform,
}: {
  id: string
  transform?: string
}) => (
  <span style={{ display: 'inline-flex' }}>
    <span
      id={id}
      style={{
        width: 120,
        height: 24,
        background: '#2563eb',
        display: 'flex',
        alignItems: 'center',
        transform,
      }}
    >
      <span style={{ width: 12, height: 12, background: '#dc2626' }} />
    </span>
  </span>
)

const Marker = () => (
  <span data-marker style={{ width: 20, height: 20, background: '#111' }} />
)

export default function BleedTest() {
  const cases = [
    ...STATIC,
    ...ANIMATED.map(({ name }) => ({ name, transform: undefined })),
  ]

  return (
    <div style={{ padding: 24, display: 'grid', gap: 8, background: '#fff' }}>
      {/*
        One child, deliberately: React separates adjacent text children with
        comment markers, which inside a <style> element is both invalid CSS and
        a hydration mismatch. The flow row rides the slow keyframes, since what
        it is testing is its neighbours rather than itself.
      */}
      <style>
        {ANIMATED.map(
          ({ name, from, to, ms }) => `
            @keyframes bleed-${name} {
              from { transform: ${from} }
              to { transform: ${to} }
            }
            #bleed-${name} {
              animation: bleed-${name} ${ms}ms linear infinite alternate;
            }
          `
        ).join('') +
          `#bleed-flow {
            animation: bleed-creep 9000ms linear infinite alternate;
          }`}
      </style>

      {cases.map(({ name, transform }) => (
        <div
          key={name}
          data-case={name}
          style={{ display: 'flex', gap: 8, alignItems: 'center' }}
        >
          <Frame role="source">
            <Source id={`bleed-${name}`} transform={transform} />
          </Frame>
          <Frame role="mirror">
            {/*
              Nothing declares how far these paint. `sprint` takes its painted
              box about 180px clear of its layout box — half of a doubled 120px
              bar plus its 60px translation — so the canvas has to find that
              reach on its own, before the frame that needs it is drawn rather
              than after one was clipped.
            */}
            <ElementMirror2
              source={`#bleed-${name}`}
              fps={60}
              pixelRatio={2}
              data-mirror
            />
          </Frame>
          <code style={{ font: '12px ui-monospace, monospace' }}>{name}</code>
        </div>
      ))}

      {/*
        Nothing crops the flow rows — cropping is the one thing they must not do,
        since they exist to show a mirror painting outside its box — so they are
        held well clear of the rows above, whose screenshots would otherwise
        include whatever these two paint upward.
      */}
      <div style={{ height: 240 }} />

      <div
        data-flow="source"
        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <Marker />
        <Source id="bleed-flow" />
        <Marker />
      </div>
      <div
        data-flow="mirror"
        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <Marker />
        <ElementMirror2 source="#bleed-flow" fps={30} pixelRatio={1} data-mirror />
        <Marker />
      </div>
    </div>
  )
}

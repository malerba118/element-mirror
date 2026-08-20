'use client'

import * as React from 'react'

import { ElementMirror } from '@frostin/element-mirror'

/**
 * Exists for `.perf/transform.mjs`, which asks what a capture does with a
 * transform on the source itself. A motion blur made of delayed mirrors has to
 * stamp each sample at the source's past transform, and it can only stamp the
 * part the capture did not already bake into the bitmap.
 *
 * Every source is the same bar — 120x24, with a red 12px marker at its left
 * end so orientation is readable from the pixels. The static cases appear once
 * per pixel ratio, on their own source: pixelRatio is a property of the shared
 * capture, so two mirrors of one element would both be captured at the higher
 * of the two.
 */

const CASES: { name: string; style: React.CSSProperties }[] = [
  { name: 'none', style: {} },
  { name: 'translate', style: { transform: 'translate(60px, 20px)' } },
  { name: 'scale', style: { transform: 'scale(2)' } },
  { name: 'rotate', style: { transform: 'rotate(45deg)' } },
  {
    name: 'all',
    style: { transform: 'translate(40px, 10px) rotate(30deg) scale(1.5)' },
  },
  // The individual transform properties compose separately from `transform`,
  // and the engine handles them on a different path.
  { name: 'prop-translate', style: { translate: '60px 20px' } },
  { name: 'prop-rotate', style: { rotate: '45deg' } },
  { name: 'prop-scale', style: { scale: '2' } },
]

const RATIOS = [1, 2]

/**
 * The same transforms under animation, which is the case a motion blur cares
 * about: a capture reads the source's box and then its styles, so an element
 * that moves between those reads could come out inconsistent with the viewBox
 * drawn to hold it, which would show as clipping. `offscreen` crosses the
 * viewport edge, since an entrance animation spends its first frames outside
 * it.
 */
const ANIMATED: { name: string; from: string; to: string }[] = [
  { name: 'anim-translate', from: 'translateX(0)', to: 'translateX(200px)' },
  { name: 'anim-rotate', from: 'rotate(0deg)', to: 'rotate(360deg)' },
  {
    name: 'anim-all',
    from: 'translate(0, 0) rotate(0deg) scale(1)',
    to: 'translate(80px, 20px) rotate(200deg) scale(2.2)',
  },
  {
    name: 'anim-offscreen',
    from: 'translateX(-520px) rotate(0deg)',
    to: 'translateX(40px) rotate(90deg)',
  },
]

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      width: 300,
      height: 150,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      outline: '1px solid #e5e7eb',
    }}
  >
    {children}
  </div>
)

const Bar = ({ id, style }: { id: string; style?: React.CSSProperties }) => (
  <div
    id={id}
    data-role="source"
    style={{
      width: 120,
      height: 24,
      background: '#2563eb',
      display: 'flex',
      alignItems: 'center',
      ...style,
    }}
  >
    <div style={{ width: 12, height: 12, background: '#dc2626' }} />
  </div>
)

const Row = ({
  name,
  dpr,
  animated,
  children,
}: {
  name: string
  dpr: number
  animated?: boolean
  children: React.ReactNode
}) => (
  <div
    data-case={name}
    data-dpr={dpr}
    {...(animated ? { 'data-animated': name } : null)}
    style={{ display: 'flex', gap: 24, alignItems: 'center' }}
  >
    {children}
  </div>
)

export default function TransformTest() {
  return (
    <div style={{ padding: 32, display: 'grid', gap: 12, background: '#fff' }}>
      <style>
        {ANIMATED.map(
          ({ name, from, to }) => `
            @keyframes ${name} {
              from { transform: ${from} }
              to { transform: ${to} }
            }
            #source-${name} {
              animation: ${name} 1.2s linear infinite alternate;
            }
          `
        ).join('')}
      </style>

      {ANIMATED.map(({ name }) => (
        <Row key={name} name={name} dpr={1} animated>
          <Frame>
            <Bar id={`source-${name}`} />
          </Frame>
          <Frame>
            <ElementMirror source={`#source-${name}`} pixelRatio={1} fps={60} />
          </Frame>
          <code style={{ font: '12px ui-monospace, monospace' }}>{name}</code>
        </Row>
      ))}

      {CASES.flatMap((testCase) =>
        RATIOS.map((ratio) => {
          const id = `source-${testCase.name}-${ratio}`
          return (
            <Row key={id} name={testCase.name} dpr={ratio}>
              <Frame>
                <Bar id={id} style={testCase.style} />
              </Frame>
              <Frame>
                <ElementMirror source={`#${id}`} pixelRatio={ratio} fps={4} />
              </Frame>
              <code style={{ font: '12px ui-monospace, monospace' }}>
                {testCase.name} @{ratio}x
              </code>
            </Row>
          )
        })
      )}
    </div>
  )
}

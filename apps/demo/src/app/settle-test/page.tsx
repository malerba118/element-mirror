'use client'

import * as React from 'react'

import { ElementMirror } from '@frostin/element-mirror'

/**
 * Exists for `.perf/settle.mjs`: paused mirrors over sources whose images are
 * still loading — sized, so the zero-size guard cannot save them. The one
 * frame a paused mirror keeps must wait for the pixels.
 */
export default function SettleTest() {
  const single = React.useRef<HTMLImageElement>(null)
  const nested = React.useRef<HTMLDivElement>(null)
  return (
    <div style={{ padding: 32, display: 'grid', gap: 24 }}>
      <div id="case-single" style={{ display: 'flex', gap: 24 }}>
        <ElementMirror source={single} paused data-case="single" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={single}
          src="/api/slow-image?ms=1500&which=0"
          alt=""
          width={160}
          height={120}
        />
      </div>
      <div id="case-nested" style={{ display: 'flex', gap: 24 }}>
        <ElementMirror source={nested} paused data-case="nested" />
        <div ref={nested} style={{ display: 'flex', gap: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/api/slow-image?ms=1000&which=1"
            alt=""
            width={160}
            height={120}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/api/slow-image?ms=2200&which=2"
            alt=""
            width={160}
            height={120}
          />
        </div>
      </div>
    </div>
  )
}

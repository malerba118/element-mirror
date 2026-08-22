'use client'

import { Card } from '@/components/ui/card'

const CAPTURE = [
  {
    name: 'source',
    type: 'Element | RefObject | string',
    default: '—',
    description:
      'The element to mirror, as a DOM element, a React ref, or a CSS selector. Mirrors that resolve to the same element share a capture.',
  },
  {
    name: 'fps',
    type: 'number | (() => number)',
    default: '30',
    description:
      'Maximum captures per second, up to the display refresh rate. Within a shared source, the highest fps sets the capture rate. A function is read every cycle, so a rate can rise for the length of an interaction without re-subscribing.',
  },
  {
    name: 'delay',
    type: 'number',
    default: '0',
    description:
      'Milliseconds behind the source to run. Mirrors of one source share its capture history, so a trail of delayed mirrors costs no extra captures.',
  },
  {
    name: 'pixelRatio',
    type: 'number',
    default: 'devicePixelRatio',
    description:
      'Bitmap pixels captured per CSS pixel. Lower is cheaper, higher is sharper when displayed large.',
  },
]

const PAINT = [
  {
    name: 'background',
    type: 'string | null',
    default: 'null',
    description:
      'Fill painted behind the element. null preserves transparency.',
  },
  {
    name: 'paused',
    type: 'boolean',
    default: 'false',
    description:
      'Suspends capturing. The last frame stays on screen, and a mirror paused before it has one still captures a single frame to hold.',
  },
]

const PLACEMENT = [
  {
    name: 'objectPosition',
    type: 'string',
    default: "'center'",
    description:
      'Where the source’s box sits when CSS gives the mirror a box of a different ratio. Keywords, percentages and pixels, as in CSS.',
  },
]

export function PropsReference() {
  const props = [...CAPTURE, ...PLACEMENT, ...PAINT]

  return (
    <Card className="overflow-x-auto py-0">
      <table className="w-full min-w-2xl border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="px-4 py-3 font-medium">Prop</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Default</th>
            <th className="px-4 py-3 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {props.map((prop) => (
            <tr key={prop.name} className="border-b last:border-0">
              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                {prop.name}
              </td>
              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-muted-foreground">
                {prop.type}
              </td>
              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-muted-foreground">
                {prop.default}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {prop.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

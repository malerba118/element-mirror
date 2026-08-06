import { Card } from '@/components/ui/card'

const PROPS = [
  {
    name: 'source',
    type: 'Element | RefObject | string',
    default: '—',
    description:
      'The element to mirror, as a DOM element, a React ref, or a CSS selector. Mirrors that resolve to the same element share a capture.',
  },
  {
    name: 'fps',
    type: 'number',
    default: '12',
    description:
      'Maximum captures per second. Within a shared source, the highest fps sets the capture rate.',
  },
  {
    name: 'pixelRatio',
    type: 'number',
    default: 'devicePixelRatio',
    description:
      'Bitmap pixels captured per CSS pixel. Lower is cheaper, higher is sharper when displayed large.',
  },
  {
    name: 'objectFit',
    type: 'ObjectFit',
    default: "'fill'",
    description:
      'How the bitmap fits the canvas box once CSS gives the canvas both a width and a height.',
  },
  {
    name: 'objectPosition',
    type: 'string',
    default: "'center'",
    description:
      'Alignment of the bitmap when objectFit crops or letterboxes it.',
  },
  {
    name: 'capture',
    type: "'auto' | 'always' | 'once'",
    default: "'auto'",
    description:
      'auto skips captures while the source is unchanged; always captures up to fps regardless; once paints a single frame.',
  },
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
    description: 'Suspends capturing. The last frame stays on screen.',
  },
]

export function PropsReference() {
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
          {PROPS.map((prop) => (
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

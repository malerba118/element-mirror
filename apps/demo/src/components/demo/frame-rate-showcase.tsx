'use client'

import { Mirror } from '@/components/demo/mirror'
import { MirrorSource } from '@/components/demo/mirror-source'
import { CodeBlock } from '@/components/demo/section'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const SOURCE_ID = 'frame-rate-source'
const RATES = [1, 8, 24] as const

export function FrameRateShowcase() {
  return (
    <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-sm">Source</CardTitle>
          <CardDescription className="text-xs">
            The clock and the sweep bar never stop.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-2">
          <MirrorSource id={SOURCE_ID} static />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {RATES.map((rate) => (
          <Card key={rate} size="sm">
            <CardHeader>
              <CardTitle className="text-sm">{rate} fps</CardTitle>
              <CardAction>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {Math.round(1000 / rate)}ms
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              <Mirror
                source={`#${SOURCE_ID}`}
                fps={rate}
                style={{ width: '100%', height: 'auto' }}
                className="block rounded-md ring-1 ring-border"
              />
              <CodeBlock code={`fps={${rate}}`} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

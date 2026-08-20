'use client'

import * as React from 'react'
import { CameraIcon } from 'lucide-react'

import { Mirror, useMirrorName } from '@/components/demo/mirror'
import { MirrorSource } from '@/components/demo/mirror-source'
import { CodeBlock } from '@/components/demo/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const SOURCE_ID = 'snapshot-source'

export function SnapshotShowcase() {
  const [take, setTake] = React.useState(0)
  const name = useMirrorName()

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Source, still running</CardTitle>
          <CardDescription className="text-xs">
            Change the counter or the text, then compare.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-2">
          <MirrorSource id={SOURCE_ID} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Held frame</CardTitle>
          <CardDescription className="text-xs">
            Its clock stopped where the capture did.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary" className="font-mono">
              paused
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-center">
            <Mirror
              // Remounting is the re-capture: a mirror that has taken its one
              // frame is done until it is asked for another.
              key={take}
              source={`#${SOURCE_ID}`}
              paused
              style={{ width: 300, height: 'auto' }}
              className="block rounded-md ring-1 ring-border"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTake((value) => value + 1)}
          >
            <CameraIcon />
            Re-capture
          </Button>
          <CodeBlock code={`<${name} source="#${SOURCE_ID}" paused />`} />
        </CardContent>
      </Card>
    </div>
  )
}

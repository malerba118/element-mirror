import * as React from 'react'

import { CodeBlock } from '@/components/demo/section'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface MirrorFigureProps {
  title: string
  caption: React.ReactNode
  code: string
  children: React.ReactNode
  className?: string
}

/** A single mirror presented with the exact code that produced it. */
export function MirrorFigure({
  title,
  caption,
  code,
  children,
  className,
}: MirrorFigureProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">{caption}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex min-h-40 items-center justify-center overflow-auto rounded-lg bg-muted/40 p-4">
          <div className="checkerboard inline-block rounded-md ring-1 ring-border">
            {children}
          </div>
        </div>
        <CodeBlock code={code} />
      </CardContent>
    </Card>
  )
}

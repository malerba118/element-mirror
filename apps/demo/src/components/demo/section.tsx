import * as React from 'react'

import { cn } from '@/lib/utils'

interface SectionProps {
  title: string
  description: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Section({
  title,
  description,
  children,
  className,
}: SectionProps) {
  return (
    <section className={cn('scroll-mt-20 space-y-6', className)}>
      <div className="space-y-1.5">
        <h2 className="font-heading text-xl font-medium tracking-tight">
          {title}
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

/** Inline monospace token, for prop and value names in prose. */
export function Token({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  )
}

/** A block of JSX shown as-is, used to label each mirror with its own code. */
export function CodeBlock({
  code,
  className,
}: {
  code: string
  className?: string
}) {
  return (
    <pre
      className={cn(
        'overflow-x-auto rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed text-muted-foreground ring-1 ring-foreground/5',
        className
      )}
    >
      <code>{code}</code>
    </pre>
  )
}

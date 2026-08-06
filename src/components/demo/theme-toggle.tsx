'use client'

import * as React from 'react'
import { MoonIcon, SunIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Doubles as a demo: flipping the theme repaints every mirror on the next
 * frame, since captures read live computed styles.
 */
export function ThemeToggle() {
  const [dark, setDark] = React.useState(false)

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setDark((value) => !value)}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}

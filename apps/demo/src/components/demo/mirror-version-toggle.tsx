'use client'

import { useMirrorVersion, type MirrorVersion } from '@/components/demo/mirror'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/**
 * Switches every mirror on the page between the two implementations.
 *
 * Flipping it remounts them, so what a mirror looks like a moment later is what
 * it looks like from a cold start rather than a state it drifted into.
 */
export function MirrorVersionToggle() {
  const { version, setVersion } = useMirrorVersion()

  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      spacing={0}
      value={String(version)}
      onValueChange={(next) => {
        // Radix clears the value when the pressed item is pressed again, and
        // there is no third state to go to.
        if (next) setVersion(Number(next) as MirrorVersion)
      }}
      aria-label="Mirror implementation"
    >
      <ToggleGroupItem value="1" className="font-mono text-[11px]">
        v1
      </ToggleGroupItem>
      <ToggleGroupItem value="2" className="font-mono text-[11px]">
        v2
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

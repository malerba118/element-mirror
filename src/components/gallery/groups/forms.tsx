'use client'

import { Search } from 'lucide-react'

import { Specimen, SpecimenGroup } from '@/components/gallery/specimen'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

export function FormSpecimens() {
  return (
    <SpecimenGroup
      id="forms"
      title="Forms"
      description="Controls the browser draws itself sit next to controls built out of divs. A native control has no DOM to walk, so a renderer has to know what the theme would have painted; the volume slider on the front page was one of these."
    >
      <Specimen name="text inputs" note="placeholder colour, disabled, invalid">
        <div className="max-w-xs space-y-3">
          <Input placeholder="Search sources" />
          <Input defaultValue="#delay-source" />
          <Input placeholder="Disabled" disabled />
          <Input defaultValue="not a selector" aria-invalid="true" />
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="With an icon" />
          </div>
        </div>
      </Specimen>

      <Specimen name="textarea and labels" note="rows, resize handle, label pairing">
        <div className="max-w-xs space-y-2">
          <Label htmlFor="gallery-note">Note</Label>
          <Textarea
            id="gallery-note"
            defaultValue={'Two lines of text\nin a resizable box.'}
          />
        </div>
      </Specimen>

      <Specimen name="checkbox and radio" note="checked marks, disabled states">
        <div className="flex flex-wrap items-start gap-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="gallery-a" defaultChecked />
              <Label htmlFor="gallery-a">Checked</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="gallery-b" />
              <Label htmlFor="gallery-b">Unchecked</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="gallery-c" disabled defaultChecked />
              <Label htmlFor="gallery-c">Disabled</Label>
            </div>
          </div>
          <RadioGroup defaultValue="second" className="space-y-2">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="first" id="gallery-r1" />
              <Label htmlFor="gallery-r1">First</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="second" id="gallery-r2" />
              <Label htmlFor="gallery-r2">Second</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="third" id="gallery-r3" disabled />
              <Label htmlFor="gallery-r3">Third</Label>
            </div>
          </RadioGroup>
        </div>
      </Specimen>

      <Specimen name="switches" note="thumb travel and track fill">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch id="gallery-s1" defaultChecked />
            <Label htmlFor="gallery-s1">On</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="gallery-s2" />
            <Label htmlFor="gallery-s2">Off</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="gallery-s3" disabled defaultChecked />
            <Label htmlFor="gallery-s3">Disabled</Label>
          </div>
        </div>
      </Specimen>

      <Specimen name="sliders and progress" note="two thumbs, filled range">
        <div className="max-w-xs space-y-5 py-1">
          <Slider defaultValue={[35]} max={100} />
          <Slider defaultValue={[20, 70]} max={100} />
          <Progress value={45} />
        </div>
      </Specimen>

      <Specimen name="select triggers" note="chevron, value alignment, size variants">
        <div className="max-w-xs space-y-3">
          <Select defaultValue="delay">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="delay">#delay-source</SelectItem>
              <SelectItem value="sharing">#sharing-source</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger className="w-full" size="sm">
              <SelectValue placeholder="Pick a source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one">One</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Specimen>

      <Specimen
        name="native controls"
        note="drawn by the browser theme rather than by CSS"
        wide
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked /> checkbox
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="gallery-native" defaultChecked /> radio
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="gallery-native" /> other
          </label>
          <input type="range" defaultValue={30} />
          <input
            type="range"
            defaultValue={80}
            style={{ accentColor: '#7c3aed' }}
          />
          <select defaultValue="two" className="text-sm">
            <option value="one">One</option>
            <option value="two">Two</option>
          </select>
          <input type="text" defaultValue="native text" size={12} />
          <input type="date" defaultValue="2026-08-06" />
          <input type="color" defaultValue="#7c3aed" />
          <input type="file" className="text-xs" />
          <progress value={0.6} />
          <meter value={0.7} />
          <button type="button">native button</button>
        </div>
      </Specimen>

      <Specimen
        name="field with helper text"
        note="a whole field group, the way a form is actually built"
      >
        <div className="max-w-xs space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="gallery-fps">Capture rate</Label>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              12 fps
            </span>
          </div>
          <Slider defaultValue={[12]} max={60} />
          <p className="text-xs text-muted-foreground">
            Mirrors of one source share the highest rate any of them asks for.
          </p>
        </div>
      </Specimen>
    </SpecimenGroup>
  )
}

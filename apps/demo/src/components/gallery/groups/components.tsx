'use client'

import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Info,
  Loader2,
  Star,
  Trash2,
} from 'lucide-react'

import { Specimen, SpecimenGroup } from '@/components/gallery/specimen'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export function ComponentSpecimens() {
  return (
    <SpecimenGroup
      id="components"
      title="Components"
      description="shadcn/ui as it ships, one component to a specimen. These lean on rings, translucent fills and colour-mixed hovers rather than plain borders and backgrounds, so they exercise most of a renderer at once."
    >
      <Specimen
        name="button variants"
        note="fills, rings, translucent destructive, underline on the link"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
      </Specimen>

      <Specimen name="button sizes and icons" note="icon alignment and gaps">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs">Extra small</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">
            <Star /> Large
          </Button>
          <Button size="icon" variant="outline">
            <Copy />
          </Button>
          <Button size="icon-sm" variant="ghost">
            <Trash2 />
          </Button>
          <Button disabled>
            <Loader2 className="animate-spin" /> Disabled
          </Button>
          <Button variant="outline">
            Continue <ArrowRight />
          </Button>
        </div>
      </Specimen>

      <Specimen
        name="focus and invalid rings"
        note="ring-3 at 50% alpha, drawn outside the border"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button className="border-ring ring-3 ring-ring/50">Focused</Button>
          <Button variant="outline" aria-invalid="true">
            Invalid
          </Button>
          <Badge className="ring-3 ring-ring/50">Badge</Badge>
          <span className="rounded-md bg-muted px-2 py-1 text-xs ring-2 ring-foreground/20 ring-offset-2 ring-offset-card">
            ring offset
          </span>
        </div>
      </Specimen>

      <Specimen name="badges" note="pill radius, icon sizing, alpha fills">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">
            <CircleAlert /> Failed
          </Badge>
          <Badge variant="ghost">Ghost</Badge>
          <Badge className="tabular-nums">128</Badge>
          <Badge variant="secondary">
            <Check /> Passing
          </Badge>
        </div>
      </Specimen>

      <Specimen
        name="card"
        note="rounded overflow, ring, footer on a tinted band"
        wide
      >
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Deployment</CardTitle>
            <CardDescription>
              Pushed to production four minutes ago.
            </CardDescription>
            <CardAction>
              <Badge variant="secondary">
                <Check /> Live
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground">
              Every pixel of this card is painted twice: once by the browser and
              once by the renderer under test.
            </p>
            <Progress value={72} />
          </CardContent>
          <CardFooter className="gap-2">
            <Button size="sm">Promote</Button>
            <Button size="sm" variant="ghost">
              Roll back
            </Button>
          </CardFooter>
        </Card>
      </Specimen>

      <Specimen name="alerts" note="icon column, destructive tint">
        <div className="space-y-3">
          <Alert>
            <Info />
            <AlertTitle>Heads up</AlertTitle>
            <AlertDescription>
              An alert lays its icon out in a grid column of its own.
            </AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Build failed</AlertTitle>
            <AlertDescription>
              Two of eleven checks did not pass.
            </AlertDescription>
          </Alert>
        </div>
      </Specimen>

      <Specimen name="tabs" note="selected trigger, panel below">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="pt-3 text-sm">
            The selected trigger carries a background and a shadow that the rest
            do not.
          </TabsContent>
        </Tabs>
      </Specimen>

      <Specimen name="toggle group" note="joined radii, pressed state">
        <ToggleGroup type="single" defaultValue="week" variant="outline">
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week">Week</ToggleGroupItem>
          <ToggleGroupItem value="month">Month</ToggleGroupItem>
        </ToggleGroup>
      </Specimen>

      <Specimen name="avatars" note="clipped images, overlap, ring cutouts">
        <div className="flex items-center gap-4">
          <Avatar>
            <AvatarImage src="/sample-frame.jpg" alt="" />
            <AvatarFallback>EM</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>AM</AvatarFallback>
          </Avatar>
          <AvatarGroup>
            <Avatar>
              <AvatarImage src="/sample-frame.jpg" alt="" />
            </Avatar>
            <Avatar>
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>KL</AvatarFallback>
            </Avatar>
            <AvatarGroupCount>+3</AvatarGroupCount>
          </AvatarGroup>
        </div>
      </Specimen>

      <Specimen name="breadcrumb" note="chevrons, ellipsis, muted trail">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbEllipsis />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Components</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Gallery</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Specimen>

      <Specimen name="accordion" note="open panel, rotated chevron">
        <Accordion type="single" defaultValue="one" collapsible>
          <AccordionItem value="one">
            <AccordionTrigger>What is mirrored?</AccordionTrigger>
            <AccordionContent>
              The element, its children, and everything their computed styles
              ask for.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="two">
            <AccordionTrigger>What is not?</AccordionTrigger>
            <AccordionContent>Anything outside the element box.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </Specimen>

      <Specimen name="skeleton" note="pulsing muted blocks">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </Specimen>

      <Specimen name="separator" note="hairlines at both orientations">
        <div className="space-y-3 text-sm">
          <div>Above</div>
          <Separator />
          <div className="flex h-5 items-center gap-3">
            <span>Left</span>
            <Separator orientation="vertical" />
            <span>Middle</span>
            <Separator orientation="vertical" />
            <span>Right</span>
          </div>
        </div>
      </Specimen>

      <Specimen
        name="table"
        note="header band, row rules, tabular numbers"
        wide
      >
        <Table>
          <TableCaption>Captures over the last three runs.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Run</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Captures</TableHead>
              <TableHead className="text-right">ms/capture</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>1</TableCell>
              <TableCell>#delay-source</TableCell>
              <TableCell className="text-right tabular-nums">1,204</TableCell>
              <TableCell className="text-right tabular-nums">11.28</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>2</TableCell>
              <TableCell>#sharing-source</TableCell>
              <TableCell className="text-right tabular-nums">980</TableCell>
              <TableCell className="text-right tabular-nums">9.02</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>3</TableCell>
              <TableCell>#frame-rate-source</TableCell>
              <TableCell className="text-right tabular-nums">312</TableCell>
              <TableCell className="text-right tabular-nums">8.44</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>Total</TableCell>
              <TableCell className="text-right tabular-nums">2,496</TableCell>
              <TableCell className="text-right tabular-nums">9.58</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Specimen>

      <Specimen
        name="popover panel"
        note="the styles a floating panel is built from, laid out in place"
      >
        <div className="w-64 rounded-lg bg-popover p-4 text-popover-foreground shadow-lg ring-1 ring-border">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Capture rate</span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Shared by every mirror of one source.
          </p>
          <Separator className="my-3" />
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between rounded-md bg-muted px-2 py-1">
              <span>12 fps</span>
              <Check className="size-4" />
            </div>
            <div className="flex items-center justify-between rounded-md px-2 py-1 text-muted-foreground">
              <span>24 fps</span>
            </div>
          </div>
        </div>
      </Specimen>
    </SpecimenGroup>
  )
}

'use client'

import * as React from 'react'

/**
 * A DOM text caret for an <input> or <textarea>.
 *
 * The native caret is paint rather than DOM: the browser draws it over the
 * field at paint time, so no capture can carry it — and its blink runs on a
 * clock the platform does not expose, so a capture engine cannot even
 * synthesize it convincingly (a painted bar would freeze mid-phase, since a
 * blink changes nothing an observer can see). This component turns the caret
 * into DOM instead: it hides the native caret (`caret-color: transparent` on
 * the field) and renders a real element where the caret sits, measured the
 * same way the engine measures a field's selection. Because it is DOM it
 * carries into a mirror the way everything else does, blink included — the
 * blink is a Web Animation, which the capture loop treats as live content.
 *
 * Render it inside a positioned ancestor that also contains the field, so the
 * caret and the field share an offset context and both land in the same
 * capture:
 *
 *   <div className="relative">
 *     <input ref={inputRef} … />
 *     <TextCaret input={inputRef} />
 *   </div>
 *
 * Unstyled, it matches the native caret: one pixel wide, the field's own
 * caret color, blinking on the traditional cadence, solid for a beat after
 * every move the way a real caret is while typing. Style it like any element
 * — `style` and `className` land on the caret span, so width, color, glow and
 * radius are yours; left/top/height are measured and written by the
 * component.
 *
 * Works on the input types that expose the selection API (text, search, url,
 * tel, password): an email or number input does not report a caret position,
 * the same platform gap that keeps its selection out of captures. The caret
 * hides itself while the field is unfocused or a range is selected, which is
 * what the native caret does.
 */

export type TextCaretProps = Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  'children'
> & {
  /** The field this caret belongs to. */
  input: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>

  /**
   * Blink period in milliseconds: solid for the first half, gone for the
   * second, the way native carets step rather than fade. 0 keeps the caret
   * solid.
   *
   * @default 1060
   */
  blinkMs?: number
}

const px = (value: string) => Number.parseFloat(value) || 0

/**
 * Text-layout properties the hidden twin must share with the field it
 * measures. Mirrors the engine's field-selection measurement
 * (packages/snapdom/src/modules/selection.js), which is the same problem:
 * where a run of a field's value paints.
 */
const TEXT_LAYOUT_PROPS = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant',
  'font-stretch',
  'letter-spacing',
  'word-spacing',
  'text-transform',
  'text-indent',
  'text-align',
  'line-height',
  'tab-size',
  'direction',
] as const

/**
 * Where the caret at `index` paints, relative to the field's border box.
 *
 * A hidden twin lays the value out in the field's own text styles and the
 * text on either side of the caret is wrapped and measured — no characters
 * are inserted, so the twin wraps exactly where the field does. Null when the
 * position cannot be measured.
 */
function measureCaret(
  field: HTMLInputElement | HTMLTextAreaElement,
  index: number
) {
  const doc = field.ownerDocument
  const style = getComputedStyle(field)
  const isTextArea = field.localName === 'textarea'
  const rtl = style.direction === 'rtl'

  let value = field.value
  // A password field paints mask characters, so the mask is what is measured.
  if (!isTextArea && (field as HTMLInputElement).type === 'password') {
    value = '\u2022'.repeat(value.length)
  }

  const borderLeft = px(style.borderLeftWidth)
  const borderTop = px(style.borderTopWidth)
  const paddingLeft = px(style.paddingLeft)
  const paddingTop = px(style.paddingTop)
  // clientWidth excludes borders and any scrollbar, which is the space the
  // value actually lays out in.
  const contentWidth = field.clientWidth - paddingLeft - px(style.paddingRight)
  const contentHeight = field.clientHeight - paddingTop - px(style.paddingBottom)

  const twin = doc.createElement('div')
  twin.style.cssText =
    'position:absolute;top:0;left:-99999px;visibility:hidden;' +
    'margin:0;border:0;padding:0;box-sizing:content-box;'
  for (const prop of TEXT_LAYOUT_PROPS) {
    twin.style.setProperty(prop, style.getPropertyValue(prop))
  }
  if (isTextArea) {
    // How the UA lays a <textarea>'s value out: wrapped at the content width,
    // breaking words where it must.
    twin.style.whiteSpace = 'pre-wrap'
    twin.style.overflowWrap = 'break-word'
    twin.style.width = `${Math.max(0, contentWidth)}px`
  } else {
    twin.style.whiteSpace = 'pre'
  }

  // The text after the caret is wrapped, and its first leading edge is the
  // caret; at the end of the value the text before is wrapped instead and its
  // trailing edge is. An empty value gets a zero-width space, which buys a
  // line box without buying any width.
  const before = value.slice(0, index)
  const after = value.slice(index)
  const marker = doc.createElement('span')
  const atEnd = after.length === 0
  if (atEnd) {
    marker.textContent = before || '\u200b'
    twin.append(marker)
  } else {
    marker.textContent = after
    twin.append(doc.createTextNode(before), marker)
  }
  doc.body.appendChild(twin)

  try {
    const base = twin.getBoundingClientRect()
    const rects = marker.getClientRects()
    if (rects.length === 0) return null
    const rect = atEnd ? rects[rects.length - 1] : rects[0]
    // The caret hugs the marker's edge nearest the text before it: the
    // trailing edge when the marker IS that text, the leading edge when the
    // marker is the text after — each of which direction flips.
    const edge = atEnd === rtl ? rect.left : rect.right
    const x = edge - base.left
    const y = rect.top - base.top

    let dx = -field.scrollLeft
    let dy = -field.scrollTop
    if (!isTextArea) {
      // A single-line input aligns its one line box within the content area —
      // vertically centered, horizontally by text-align once the value is
      // shorter than the field — while the twin's line sits at its own
      // top-left, shrink-to-fit.
      dy += Math.max(0, (contentHeight - base.height) / 2)
      let align = style.textAlign
      if (align === 'start') align = rtl ? 'right' : 'left'
      else if (align === 'end') align = rtl ? 'left' : 'right'
      const slack = contentWidth - base.width
      if (slack > 0) {
        if (align === 'right') dx += slack
        else if (align === 'center') dx += slack / 2
      }
    }

    return {
      x: borderLeft + paddingLeft + x + dx,
      y: borderTop + paddingTop + y + dy,
      height: rect.height,
    }
  } finally {
    twin.remove()
  }
}

/** Stepped rather than faded, which is how every native caret blinks. */
const BLINK_KEYFRAMES: Keyframe[] = [
  { opacity: 1 },
  { opacity: 1, offset: 0.5 },
  { opacity: 0, offset: 0.5 },
  { opacity: 0 },
]

export const TextCaret = React.forwardRef<HTMLSpanElement, TextCaretProps>(
  function TextCaret({ input, blinkMs = 1060, style, ...spanProps }, forwardedRef) {
    const spanRef = React.useRef<HTMLSpanElement>(null)
    React.useImperativeHandle(forwardedRef, () => spanRef.current!)
    // Read at update time so a style change never rewires the listeners.
    const styleRef = React.useRef(style)
    styleRef.current = style

    React.useEffect(() => {
      const span = spanRef.current
      if (!span) return

      let field: HTMLInputElement | HTMLTextAreaElement | null = null
      let previousCaretColor = ''
      let blink: Animation | null = null
      let placedAt = ''

      const observer = new ResizeObserver(() => update())

      const hide = () => {
        span.style.visibility = 'hidden'
        placedAt = ''
        if (blink) {
          blink.cancel()
          blink = null
        }
      }

      const release = () => {
        if (!field) return
        field.style.caretColor = previousCaretColor
        field.removeEventListener('scroll', update)
        field.removeEventListener('input', update)
        field.removeEventListener('focus', update)
        field.removeEventListener('blur', update)
        observer.unobserve(field)
        field = null
      }

      /** Follows the ref, which may point at nothing yet or swap fields. */
      const acquire = () => {
        const next = input.current ?? null
        if (next === field) return
        release()
        field = next
        if (!field) return
        // The native caret would paint under the custom one, so it goes.
        previousCaretColor = field.style.caretColor
        field.style.caretColor = 'transparent'
        field.addEventListener('scroll', update, { passive: true })
        field.addEventListener('input', update)
        field.addEventListener('focus', update)
        field.addEventListener('blur', update)
        observer.observe(field)
      }

      const update = () => {
        acquire()
        if (!field) return hide()
        if (field.ownerDocument.activeElement !== field) return hide()

        let start: number | null = null
        let end: number | null = null
        try {
          start = field.selectionStart
          end = field.selectionEnd
        } catch {
          return hide() // an input type without a selection API
        }
        // No caret while a range is selected, which is the native behaviour.
        if (start == null || start !== end) return hide()

        const caret = measureCaret(field, start)
        if (!caret) return hide()

        // Placed against the span's own offset context, which the field is
        // required to share (see the component doc).
        const parent = span.offsetParent as HTMLElement | null
        if (!parent) return hide()
        const parentBox = parent.getBoundingClientRect()
        const fieldBox = field.getBoundingClientRect()
        const left =
          fieldBox.left - parentBox.left - parent.clientLeft +
          parent.scrollLeft + caret.x
        const top =
          fieldBox.top - parentBox.top - parent.clientTop +
          parent.scrollTop + caret.y

        span.style.left = `${left}px`
        span.style.top = `${top}px`
        span.style.height = `${caret.height}px`
        // The default paint follows the field's own text color through
        // `currentColor`, unless the caller took the color over.
        const overrides = styleRef.current
        if (!overrides?.color && !overrides?.background && !overrides?.backgroundColor) {
          span.style.color = getComputedStyle(field).color
        }
        span.style.visibility = 'visible'

        // A caret that just moved holds solid for a beat before blinking,
        // which is what a native caret does while typing.
        const at = `${left}:${top}:${caret.height}`
        if (blinkMs > 0) {
          if (!blink) {
            blink = span.animate(BLINK_KEYFRAMES, {
              duration: blinkMs,
              iterations: Number.POSITIVE_INFINITY,
            })
          } else if (at !== placedAt) {
            blink.currentTime = 0
          }
        }
        placedAt = at
      }

      // The caret index is selection state, and selectionchange is the one
      // event that reports every way it can move — keys, mouse, script.
      document.addEventListener('selectionchange', update)
      update()

      return () => {
        document.removeEventListener('selectionchange', update)
        release()
        observer.disconnect()
        hide()
      }
    }, [input, blinkMs])

    return (
      <span
        ref={spanRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          width: '1px',
          background: 'currentColor',
          visibility: 'hidden',
          ...style,
        }}
        {...spanProps}
      />
    )
  }
)

// A thin bar you drag to resize the docked roll log.
// While dragging, the pointer is "captured" so the drag keeps working even
// if the mouse moves faster than the bar.

import type { PointerEvent } from 'react'

export function ResizeHandle(props: { direction: 'vertical' | 'horizontal'; onResize: (pointer: { x: number; y: number }) => void }) {
  function start(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      props.onResize({ x: event.clientX, y: event.clientY })
    }
  }
  return (
    <div
      className={`resize-handle ${props.direction}`}
      title="Drag to resize"
      onPointerDown={start}
      onPointerMove={move}
      role="separator"
      aria-orientation={props.direction === 'vertical' ? 'horizontal' : 'vertical'}
    />
  )
}

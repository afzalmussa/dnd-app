// Shows its children in a separate window (used for the popped-out roll log and wiki).
//
// How it works: window.open('') makes an empty window that belongs to this
// app, and React's createPortal draws part of our page into it. The log in
// the popup is still the same React component, so new rolls appear there
// straight away with no messages passed between windows.

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function PopoutWindow(props: { title: string; name?: string; size?: string; onClose: () => void; children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const popup = window.open('', props.name ?? 'roll-log', props.size ?? 'width=560,height=640')
    if (!popup) {
      props.onClose()
      return
    }
    popup.document.title = props.title

    // Give the popup the same styles as the main window. Stylesheet links are
    // copied with their full address so they load from the right place.
    for (const node of document.querySelectorAll('style, link[rel="stylesheet"]')) {
      if (node instanceof HTMLLinkElement) {
        const link = popup.document.createElement('link')
        link.rel = 'stylesheet'
        link.href = node.href
        popup.document.head.appendChild(link)
      } else {
        popup.document.head.appendChild(node.cloneNode(true))
      }
    }
    popup.document.documentElement.setAttribute('style', document.documentElement.getAttribute('style') ?? '') // the chosen colours
    popup.document.body.className = 'popout-body'
    const root = popup.document.createElement('div')
    root.className = 'popout-root'
    popup.document.body.appendChild(root)
    setContainer(root)

    // Closing the popup with its own X puts the log back in the main window.
    const closedByUser = () => props.onClose()
    popup.addEventListener('pagehide', closedByUser)
    return () => {
      popup.removeEventListener('pagehide', closedByUser)
      popup.close()
    }
    // The empty list means: open the window once when the log is popped out,
    // and close it when the log is docked again.
  }, [])

  return container ? createPortal(props.children, container) : null
}

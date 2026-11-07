// Turns a wiki page into safe HTML. [[links]] become links the screen handles itself, images load
// through the wiki-file:// scheme, callouts get a class, and everything is sanitised so a page in a
// shared folder cannot run script inside the app (which has access to character files).

import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import { extractLinks, resolveLink, splitFrontMatter, type Area } from '../../../shared/wiki/wiki'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

export type PagesByArea = Record<Area, string[]>

// A link in My Notes looks in My Notes first, then the Party Wiki. A link in the Party Wiki looks only in the
// Party Wiki, so shared pages never point at someone's private notes.
export function resolveInAreas(target: string, area: Area, fromPath: string, pages: PagesByArea): { area: Area; path: string; ambiguous: boolean } | null {
  // My Notes look in My Notes, then the Party Wiki, then "From the DM". Shared pages only look in the Party Wiki. "From the DM" looks there, then in the Party Wiki.
  const order: Area[] = area === 'notes' ? ['notes', 'party', 'private'] : area === 'party' ? ['party'] : ['private', 'party']
  for (const a of order) {
    const hit = resolveLink(target, a === area ? fromPath : '', pages[a])
    if (hit) return { area: a, path: hit.path, ambiguous: hit.ambiguous }
  }
  return null
}

function folderOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

function imageUrl(area: Area, fromPath: string, target: string): string {
  const relative = target.includes('/') ? target : [folderOf(fromPath), target].filter(Boolean).join('/')
  return `wiki-file://${area}/${relative.split('/').map(encodeURIComponent).join('/')}`
}

export function renderPage(text: string, area: Area, path: string): string {
  const { body } = splitFrontMatter(text)
  let prepared = body
  for (const link of extractLinks(body)) {
    if (link.image) {
      prepared = prepared.replace(link.raw, `![${link.target}](${imageUrl(area, path, link.target)})`)
    } else {
      const label = link.label ?? (link.heading ? `${link.target} > ${link.heading}` : link.target)
      prepared = prepared.replace(link.raw, `[${label.replace(/[[\]]/g, '')}](#wikilink:${encodeURIComponent(link.target)})`)
    }
  }
  const html = md.render(prepared)
  return DOMPurify.sanitize(html, {
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|wiki-file):|#|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
  })
}

// After the HTML is in the page: relative images get their address, wiki links get their target and
// a style for missing or ambiguous ones, callouts get a class.
export function decorate(container: HTMLElement, area: Area, path: string, pages: PagesByArea): void {
  container.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') ?? ''
    if (src && !/^(wiki-file:|https?:|data:)/i.test(src)) img.setAttribute('src', imageUrl(area, path, decodeURIComponent(src)))
  })
  container.querySelectorAll<HTMLAnchorElement>('a[href^="#wikilink:"]').forEach((a) => {
    const target = decodeURIComponent(a.getAttribute('href')!.slice('#wikilink:'.length))
    const hit = resolveInAreas(target, area, path, pages)
    a.classList.add('wikilink')
    a.dataset.target = target
    if (!hit) a.classList.add('missing')
    else {
      a.dataset.area = hit.area
      a.dataset.path = hit.path
      if (hit.ambiguous) { a.classList.add('ambiguous'); a.title = 'Several pages have this name; use a path link such as [[Folder/Page]] to be exact.' }
    }
  })
  container.querySelectorAll('blockquote').forEach((q) => {
    const first = q.querySelector('p')
    const m = first?.textContent?.match(/^\[!(\w+)\]\s*(.*)/)
    if (first && m) {
      q.classList.add('callout', `callout-${m[1].toLowerCase()}`)
      first.innerHTML = first.innerHTML.replace(/^\[!\w+\][^<\n]*/, '') // already sanitised HTML; only the marker text is removed
      const title = document.createElement('strong')
      title.textContent = m[2] || m[1]
      first.prepend(title)
    }
  })
}

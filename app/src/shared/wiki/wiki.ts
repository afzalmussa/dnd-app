// Wiki logic that needs no Electron or React: front matter, [[links]], tags, rename rewriting.
// Pure functions, so they are easy to test. See docs/wiki-design.md.

export type Area = 'notes' | 'party'

// ---- front matter ----------------------------------------------------------------------------

// The block between the first two "---" lines at the top of a page. It is kept as the exact text it
// was, so saving a page never changes it unless it is edited.
export function splitFrontMatter(text: string): { front: string; body: string } {
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/)
  return m ? { front: m[0], body: text.slice(m[0].length) } : { front: '', body: text }
}

export function joinFrontMatter(front: string, body: string): string {
  return front + body
}

// Simple "key: value" lines for the properties panel. Lists and nested values are shown as their text.
export function readProperties(front: string): { key: string; value: string }[] {
  const lines = front.split(/\r?\n/).slice(1, -2)
  const props: { key: string; value: string }[] = []
  for (const line of lines) {
    const m = line.match(/^([A-Za-z0-9_ -]+):\s*(.*)$/)
    if (m) props.push({ key: m[1].trim(), value: m[2].trim() })
    else if (props.length && line.trim()) props[props.length - 1].value += ` ${line.trim().replace(/^- /, '')}`
  }
  return props
}

// ---- links -------------------------------------------------------------------------------------

export interface WikiLink {
  raw: string
  target: string // "Page" or "Folder/Page", without the heading or label
  heading: string | null
  label: string | null
  image: boolean
}

const LINK = /(!?)\[\[([^\]|#]+?)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g

export function extractLinks(markdown: string): WikiLink[] {
  return [...markdown.matchAll(LINK)].map((m) => ({
    raw: m[0], target: m[2].trim(), heading: m[3]?.trim() ?? null, label: m[4]?.trim() ?? null, image: m[1] === '!'
  }))
}

export function extractTags(markdown: string): string[] {
  const tags = new Set<string>()
  for (const m of markdown.matchAll(/(?:^|\s)#([A-Za-z][\w/-]*)/gm)) tags.add(m[1])
  return [...tags].sort()
}

function stripMd(path: string): string {
  return path.replace(/\.md$/i, '')
}

function folderOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

function commonPrefixLength(a: string, b: string): number {
  const x = a.split('/').filter(Boolean)
  const y = b.split('/').filter(Boolean)
  let n = 0
  while (n < x.length && n < y.length && x[n].toLowerCase() === y[n].toLowerCase()) n++
  return n
}

export interface Resolved {
  path: string // the page's path inside its area, with ".md"
  ambiguous: boolean
}

// Finds the page a link means. `pages` are paths inside one area ("Barovia/Village.md").
//  - a path link ("Barovia/Village") must match the whole path;
//  - a bare name matches the file name anywhere; with several matches the one nearest the linking
//    page's folder wins, ties go to the first alphabetically, and the link is marked ambiguous.
export function resolveLink(target: string, fromPath: string, pages: string[]): Resolved | null {
  const wanted = stripMd(target).toLowerCase()
  if (wanted.includes('/')) {
    const hit = pages.find((p) => stripMd(p).toLowerCase() === wanted)
    return hit ? { path: hit, ambiguous: false } : null
  }
  const matches = pages.filter((p) => stripMd(p.split('/').pop() ?? '').toLowerCase() === wanted)
  if (matches.length === 0) return null
  if (matches.length === 1) return { path: matches[0], ambiguous: false }
  const from = folderOf(fromPath)
  const ranked = [...matches].sort((a, b) => {
    const diff = commonPrefixLength(folderOf(b), from) - commonPrefixLength(folderOf(a), from)
    return diff !== 0 ? diff : a.localeCompare(b)
  })
  return { path: ranked[0], ambiguous: true }
}

// A folder with a note of the same name inside ("Old Svalich Road/Old Svalich Road.md") opens that note.
export function folderNote(folderPath: string, pages: string[]): string | null {
  const name = folderPath.split('/').pop() ?? ''
  const want = `${folderPath}/${name}.md`.toLowerCase()
  return pages.find((p) => p.toLowerCase() === want) ?? null
}

// After a page is renamed, links to it in other pages are rewritten, as Obsidian does.
// `oldPath` and `newPath` are paths inside the area. Returns the new text (unchanged if nothing linked).
export function rewriteLinksOnRename(markdown: string, oldPath: string, newPath: string): string {
  const oldBare = stripMd(oldPath.split('/').pop() ?? '').toLowerCase()
  const oldFull = stripMd(oldPath).toLowerCase()
  const newBare = stripMd(newPath.split('/').pop() ?? '')
  const newFull = stripMd(newPath)
  return markdown.replace(LINK, (whole, bang: string, target: string, heading?: string, label?: string) => {
    const t = target.trim().toLowerCase()
    let replacement: string | null = null
    if (t === oldFull) replacement = newFull
    else if (!t.includes('/') && t === oldBare) replacement = newBare
    if (replacement === null) return whole
    return `${bang}[[${replacement}${heading ? `#${heading}` : ''}${label ? `|${label}` : ''}]]`
  })
}

// "Linked from": the pages whose text links to this page.
export function backlinks(target: string, pages: { path: string; text: string }[], allPaths: string[]): string[] {
  return pages
    .filter((p) => p.path !== target && extractLinks(p.text).some((l) => !l.image && resolveLink(l.target, p.path, allPaths)?.path === target))
    .map((p) => p.path)
}

// Guard for paths coming from the screen: only plain relative paths inside the folder.
export function isSafeRelativePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:/.test(path)) return false
  return !path.split(/[\\/]/).some((part) => part === '..' || part === '')
}

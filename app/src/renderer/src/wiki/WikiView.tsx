// The story wiki: My Notes (private) and the Party Wiki (shared), plain Markdown files.
// Left: folders and search. Centre: the page (read or edit). Right: properties and "linked from".

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WikiArea, WikiTreeNode } from '../../../shared/api'
import { backlinks, extractTags, folderNote, readProperties, splitFrontMatter } from '../../../shared/wiki/wiki'
import { decorate, renderPage, type PagesByArea } from './markdown'

interface Open { area: WikiArea; path: string }
interface Conflict { theirs: string; modified: number }
interface Ask { title: string; value: string; confirm: (value: string) => void }

const AREAS: { area: WikiArea; title: string; setting: 'notesFolder' | 'partyWikiFolder' }[] = [
  { area: 'notes', title: 'My Notes', setting: 'notesFolder' },
  { area: 'party', title: 'Party Wiki', setting: 'partyWikiFolder' }
]

function flatten(nodes: WikiTreeNode[]): string[] {
  return nodes.flatMap((n) => (n.type === 'file' ? [n.path] : flatten(n.children ?? [])))
}

export function WikiView({ onClose }: { onClose: () => void }) {
  const [trees, setTrees] = useState<Record<WikiArea, WikiTreeNode[] | null>>({ notes: null, party: null })
  const [texts, setTexts] = useState<Record<WikiArea, { path: string; text: string }[]>>({ notes: [], party: [] })
  const [open, setOpen] = useState<Open | null>(null)
  const [text, setText] = useState('')
  const [modified, setModified] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [ask, setAsk] = useState<Ask | null>(null)
  const readRef = useRef<HTMLDivElement>(null)

  const pagesByArea: PagesByArea = useMemo(
    () => ({ notes: trees.notes ? flatten(trees.notes) : [], party: trees.party ? flatten(trees.party) : [] }),
    [trees]
  )

  const reload = useCallback(async () => {
    const [notes, party] = await Promise.all([window.api.wikiTree('notes').catch(() => null), window.api.wikiTree('party').catch(() => null)])
    setTrees({ notes, party })
    const [nt, pt] = await Promise.all([
      notes ? window.api.wikiPages('notes') : Promise.resolve([]),
      party ? window.api.wikiPages('party') : Promise.resolve([])
    ])
    setTexts({ notes: nt, party: pt })
  }, [])

  const openPage = useCallback(async (area: WikiArea, path: string) => {
    try {
      const page = await window.api.wikiRead(area, path)
      setOpen({ area, path })
      setText(page.content)
      setModified(page.modified)
      setDirty(false)
      setConflict(null)
      setEditing(false)
      setStatus('')
    } catch (e) {
      setStatus((e as Error).message)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  // Files change on disk (Drive syncing, Obsidian): refresh the lists, and the open page if I have not edited it.
  useEffect(() => {
    return window.api.onWikiChanged(async (area) => {
      await reload()
      if (open && open.area === area && !dirty) {
        try {
          const page = await window.api.wikiRead(open.area, open.path)
          if (page.modified !== modified) { setText(page.content); setModified(page.modified) }
        } catch {
          // the page was removed or renamed elsewhere
        }
      }
    })
  }, [open, dirty, modified, reload])

  // Autosave about a second after the last keystroke.
  useEffect(() => {
    if (!open || !dirty || conflict) return
    const timer = setTimeout(() => { void save(false) }, 1000)
    return () => clearTimeout(timer)
  }, [text, dirty, open, conflict])

  async function save(overwrite: boolean) {
    if (!open) return
    const result = await window.api.wikiWrite(open.area, open.path, text, modified, overwrite)
    if (result.ok) {
      setModified(result.modified)
      setDirty(false)
      setConflict(null)
      setStatus('Saved')
    } else {
      setConflict({ theirs: result.theirs, modified: result.modified })
    }
  }

  async function resolveConflict(choice: 'theirs' | 'mine' | 'copy') {
    if (!open || !conflict) return
    if (choice === 'mine') return save(true)
    if (choice === 'copy') {
      const copy = await window.api.wikiSaveCopy(open.area, open.path, text)
      setStatus(`Your version was saved as ${copy}`)
    }
    setText(conflict.theirs)
    setModified(conflict.modified)
    setDirty(false)
    setConflict(null)
    await reload()
  }

  const folderForNew = open ? open.path.split('/').slice(0, -1).join('/') : ''

  function newPage(area: WikiArea) {
    setAsk({
      title: `New page in ${area === 'notes' ? 'My Notes' : 'Party Wiki'}${folderForNew && open?.area === area ? ` / ${folderForNew}` : ''}`, value: '',
      confirm: async (name) => {
        const dir = open?.area === area ? folderForNew : ''
        const path = `${dir ? `${dir}/` : ''}${name.replace(/\.md$/i, '')}.md`
        try { await window.api.wikiCreatePage(area, path, `# ${name.replace(/\.md$/i, '')}\n`); await reload(); await openPage(area, path); setEditing(true) } catch (e) { setStatus((e as Error).message) }
      }
    })
  }

  function newFolder(area: WikiArea) {
    setAsk({
      title: 'New folder', value: '',
      confirm: async (name) => {
        const dir = open?.area === area ? folderForNew : ''
        try { await window.api.wikiCreateFolder(area, `${dir ? `${dir}/` : ''}${name}`); await reload() } catch (e) { setStatus((e as Error).message) }
      }
    })
  }

  function renamePage() {
    if (!open) return
    const current = open
    const base = current.path.split('/').pop()!.replace(/\.md$/i, '')
    setAsk({
      title: 'Rename page (links to it are updated)', value: base,
      confirm: async (name) => {
        const dir = current.path.split('/').slice(0, -1).join('/')
        const next = `${dir ? `${dir}/` : ''}${name.replace(/\.md$/i, '')}.md`
        try {
          const changed = await window.api.wikiRename(current.area, current.path, next)
          setStatus(changed.length ? `Renamed. Links updated in: ${changed.join(', ')}` : 'Renamed.')
          await reload()
          await openPage(current.area, next)
        } catch (e) { setStatus((e as Error).message) }
      }
    })
  }

  async function deletePage() {
    if (!open || !confirm(`Move "${open.path}" to the Recycle Bin?`)) return
    await window.api.wikiTrash(open.area, open.path)
    setOpen(null)
    setText('')
    await reload()
    setStatus('Moved to the Recycle Bin.')
  }

  async function chooseFolder(setting: 'notesFolder' | 'partyWikiFolder') {
    if (await window.api.chooseFolder(setting)) await reload()
  }

  // Click in the page: open a wiki link, or offer to create a page that does not exist yet.
  async function onPageClick(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest('a.wikilink') as HTMLAnchorElement | null
    if (!a) return
    e.preventDefault()
    if (a.dataset.path && a.dataset.area) return openPage(a.dataset.area as WikiArea, a.dataset.path)
    const name = a.dataset.target ?? ''
    if (open && confirm(`There is no page called "${name}". Create it?`)) {
      const path = `${name.replace(/\.md$/i, '')}.md`
      try { await window.api.wikiCreatePage(open.area, path, `# ${name}\n`); await reload(); await openPage(open.area, path); setEditing(true) } catch (err) { setStatus((err as Error).message) }
    }
  }

  const html = useMemo(() => (open ? renderPage(text, open.area, open.path) : ''), [text, open, pagesByArea])
  useEffect(() => { if (readRef.current && open) decorate(readRef.current, open.area, open.path, pagesByArea) }, [html, open, pagesByArea, editing])

  const props = open ? readProperties(splitFrontMatter(text).front) : []
  const tags = open ? extractTags(splitFrontMatter(text).body) : []
  const linkedFrom = open
    ? backlinks(open.path, texts[open.area], pagesByArea[open.area])
    : []

  const results = search.trim()
    ? AREAS.flatMap(({ area }) => texts[area]
        .filter((p) => p.path.toLowerCase().includes(search.toLowerCase()) || p.text.toLowerCase().includes(search.toLowerCase()))
        .map((p) => ({ area, path: p.path })))
    : []

  function renderNodes(area: WikiArea, nodes: WikiTreeNode[], depth = 0): React.ReactNode {
    return nodes.map((n) => {
      const key = `${area}:${n.path}`
      if (n.type === 'folder') {
        const isOpen = expanded.has(key)
        const note = folderNote(n.path, pagesByArea[area])
        return (
          <div key={key}>
            <button className="tree-row" style={{ paddingLeft: depth * 12 }} onClick={() => {
              setExpanded((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
              if (note) void openPage(area, note)
            }}>{isOpen ? '▾' : '▸'} {n.name}</button>
            {isOpen && renderNodes(area, n.children ?? [], depth + 1)}
          </div>
        )
      }
      return (
        <button key={key} className={`tree-row ${open?.area === area && open.path === n.path ? 'on' : ''}`} style={{ paddingLeft: depth * 12 + 12 }}
          onClick={() => openPage(area, n.path)}>{n.name}</button>
      )
    })
  }

  return (
    <div className="wiki">
      <div className="wiki-bar">
        <strong>Wiki</strong>
        <button className="small" onClick={() => newPage(open?.area ?? 'notes')}>New page</button>
        <button className="small" onClick={() => newFolder(open?.area ?? 'notes')}>New folder</button>
        <button className="small" disabled={!open} onClick={renamePage}>Rename</button>
        <button className="small danger" disabled={!open} onClick={deletePage}>Delete</button>
        <button className="small" onClick={() => void reload()}>Refresh</button>
        <span className="muted small wiki-status">{dirty ? 'Unsaved…' : status}</span>
        <button className="small" onClick={onClose}>Back to the sheet</button>
      </div>
      <div className="wiki-body">
        <aside className="wiki-tree">
          <input type="text" className="text-input" placeholder="Search pages and text…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search.trim() ? (
            <div>
              {results.length === 0 && <p className="muted small">Nothing found.</p>}
              {results.map((r) => <button key={`${r.area}${r.path}`} className="tree-row" onClick={() => { setSearch(''); void openPage(r.area, r.path) }}>
                <span className="chip">{r.area === 'notes' ? 'Mine' : 'Party'}</span> {r.path.replace(/\.md$/i, '')}</button>)}
            </div>
          ) : AREAS.map(({ area, title, setting }) => (
            <div key={area} className="wiki-area">
              <div className="small-label">{title}</div>
              {trees[area] === null ? (
                <div><p className="muted small">No folder chosen.</p><button className="small" onClick={() => chooseFolder(setting)}>Choose folder…</button></div>
              ) : renderNodes(area, trees[area]!)}
            </div>
          ))}
        </aside>
        <main className="wiki-page">
          {!open && <p className="muted">Pick a page on the left, or make a new one. My Notes stay on your PC; the Party Wiki is the shared folder.</p>}
          {open && (
            <>
              <div className="wiki-title">
                <h2>{open.path.split('/').pop()!.replace(/\.md$/i, '')}</h2>
                <span className="muted small">{open.area === 'notes' ? 'My Notes' : 'Party Wiki'} / {open.path}</span>
                <button className="small" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>
              </div>
              {conflict && (
                <div className="conflict">
                  <strong>This page was changed somewhere else while you had it open.</strong>
                  <div>
                    <button onClick={() => resolveConflict('theirs')}>Load their version</button>{' '}
                    <button onClick={() => resolveConflict('mine')}>Keep mine (overwrite)</button>{' '}
                    <button onClick={() => resolveConflict('copy')}>Save mine as a copy</button>
                  </div>
                </div>
              )}
              <div className={editing ? 'wiki-split' : ''}>
                {editing && <textarea className="wiki-editor" value={text} spellCheck onChange={(e) => { setText(e.target.value); setDirty(true) }} />}
                <div ref={readRef} className="wiki-read" onClick={onPageClick} dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            </>
          )}
        </main>
        <aside className="wiki-side">
          {open && (
            <>
              <div className="small-label">Properties</div>
              {props.length === 0 && tags.length === 0 && <p className="muted small">None.</p>}
              {props.map((p) => <div key={p.key} className="small"><b>{p.key}</b> {p.value}</div>)}
              {tags.length > 0 && <div className="small">{tags.map((t) => <span key={t} className="chip">#{t}</span>)}</div>}
              <div className="small-label" style={{ marginTop: '1rem' }}>Linked from</div>
              {linkedFrom.length === 0 && <p className="muted small">No page links here.</p>}
              {linkedFrom.map((p) => <button key={p} className="tree-row" onClick={() => openPage(open.area, p)}>{p.replace(/\.md$/i, '')}</button>)}
            </>
          )}
        </aside>
      </div>
      {ask && (
        <div className="modal-backdrop">
          <div className="modal levelup ask">
            <h3>{ask.title}</h3>
            <input autoFocus type="text" className="text-input" value={ask.value} onChange={(e) => setAsk({ ...ask, value: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' && ask.value.trim()) { ask.confirm(ask.value.trim()); setAsk(null) } }} />
            <footer>
              <button onClick={() => setAsk(null)}>Cancel</button>
              <button className="primary" disabled={!ask.value.trim()} onClick={() => { ask.confirm(ask.value.trim()); setAsk(null) }}>OK</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}

// Content editor: correct any imported entry or add your own. Saved as separate files in the content
// folder; the imported data pack is never changed. Spells, feats and items have forms. Classes,
// subclasses, species and backgrounds (class features included) are edited as JSON.

import { useEffect, useMemo, useState } from 'react'
import type { ContentKind } from '../../../shared/api'

type Entry = Record<string, any>

const KINDS: { kind: ContentKind; label: string; form: boolean }[] = [
  { kind: 'spell', label: 'Spells', form: true },
  { kind: 'feat', label: 'Feats', form: true },
  { kind: 'item', label: 'Items', form: true },
  { kind: 'class', label: 'Classes', form: false },
  { kind: 'subclass', label: 'Subclasses', form: false },
  { kind: 'species', label: 'Species', form: false },
  { kind: 'background', label: 'Backgrounds', form: false }
]
const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation']
const RULESETS = ['2024', '2014']

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function blank(kind: ContentKind): Entry {
  const source = { book: 'user', ruleset: '2024', page: null, ocrUsed: false, flags: [] }
  if (kind === 'spell') {
    return { id: '', kind, name: '', source, level: 1, school: 'Evocation', castingTime: 'Action', ritual: false, range: '', components: { v: true, s: true, m: false, material: null }, duration: 'Instantaneous', concentration: false, classLists: [], summary: '', text: '', higherLevels: null }
  }
  if (kind === 'feat') return { id: '', kind, name: '', source, category: 'General', prerequisite: null, repeatable: false, summary: '', text: '' }
  if (kind === 'item') return { id: '', kind, name: '', source, category: 'gear', cost: '', weight: '', attunement: false, summary: '', text: '' }
  return { id: '', kind, name: '', source }
}

function Field(props: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={props.wide ? 'wide' : ''}>{props.label}{props.children}</label>
}

export function ContentEditor({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<ContentKind>('spell')
  const [entries, setEntries] = useState<Entry[]>([])
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<Entry | null>(null)
  const [json, setJson] = useState('')
  const [message, setMessage] = useState('')

  const useForm = KINDS.find((k) => k.kind === kind)!.form

  async function reload(keepId?: string) {
    const list = await window.api.listContent(kind)
    setEntries(list)
    const again = keepId ? list.find((e) => e.id === keepId) ?? null : null
    setSelected(again)
    setJson(again ? JSON.stringify(strip(again), null, 2) : '')
  }
  useEffect(() => { setSelected(null); setJson(''); setMessage(''); void reload() }, [kind])

  const shown = useMemo(
    () => entries.filter((e) => (e.name ?? '').toLowerCase().includes(filter.toLowerCase())).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
    [entries, filter]
  )

  // `_origin` is bookkeeping added by the app, not part of the entry.
  function strip(e: Entry): Entry {
    const { _origin, ...rest } = e
    return rest
  }

  function pick(e: Entry) {
    setSelected({ ...e })
    setJson(JSON.stringify(strip(e), null, 2))
    setMessage('')
  }

  function set(change: (draft: Entry) => void) {
    if (!selected) return
    const draft = JSON.parse(JSON.stringify(selected))
    change(draft)
    setSelected(draft)
  }

  async function save() {
    if (!selected) return
    let entry: Entry
    try {
      entry = useForm ? strip(selected) : JSON.parse(json)
    } catch (error) {
      setMessage(`The JSON is not valid: ${(error as Error).message}`)
      return
    }
    if (!entry.name || !String(entry.name).trim()) { setMessage('The entry needs a name.'); return }
    if (!entry.id) entry.id = `${kind}.${slug(entry.name)}.user`
    entry.kind = kind
    entry.source = { ...(entry.source ?? {}), flags: entry.source?.flags ?? [] }
    if (!entry.source.book) entry.source.book = 'user'
    await window.api.saveContent(kind, entry)
    setMessage('Saved. It is used the next time a list or wizard loads.')
    await reload(entry.id)
  }

  async function remove() {
    if (!selected?.id) return
    const label = selected._origin === 'edited' ? 'Go back to the book version of this entry?' : 'Delete this homebrew entry?'
    if (!confirm(label)) return
    await window.api.deleteContent(kind, selected.id)
    setMessage(selected._origin === 'edited' ? 'Back to the book version.' : 'Deleted.')
    await reload()
  }

  const s = selected
  return (
    <div className="modal-backdrop">
      <div className="modal levelup content-editor">
        <header>
          <h2>Content editor</h2>
          <select value={kind} onChange={(e) => setKind(e.target.value as ContentKind)}>
            {KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
          <button className="small" onClick={onClose}>Close</button>
        </header>
        <p className="muted small">Your changes are saved in separate files. The imported book data is never changed. "edited" entries replace the book entry with the same id; "homebrew" entries are new.</p>
        <div className="editor-split">
          <div className="editor-list">
            <input type="text" className="text-input" placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button className="small" onClick={() => { setSelected(blank(kind)); setJson(JSON.stringify(strip(blank(kind)), null, 2)); setMessage('') }}>New {kind}</button>
            <div className="editor-items">
              {shown.map((e) => (
                <button key={e.id} className={`link-row ${s?.id === e.id ? 'on' : ''}`} onClick={() => pick(e)}>
                  {e.name || '(no name)'} {e._origin !== 'book' && <span className="chip">{e._origin === 'edited' ? 'edited' : 'homebrew'}</span>}
                  {e.source?.ruleset === '2014' && <span className="chip">legacy</span>}
                  {(e.source?.flags?.length ?? 0) > 0 && <span className="chip warn" title={e.source.flags.join('; ')}>flagged</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="editor-form">
            {!s && <p className="muted">Pick an entry on the left, or make a new one.</p>}
            {s && s.source?.flags?.length > 0 && <p className="warning small">Import flags: {s.source.flags.join('; ')}</p>}
            {s && s.source?.page != null && <p className="muted small">Book {s.source.book}, PDF page {s.source.page}</p>}
            {s && useForm && (
              <div className="edit-grid">
                <Field label="Name"><input className="text-input" value={s.name ?? ''} onChange={(e) => set((d) => { d.name = e.target.value })} /></Field>
                <Field label="Ruleset (2014 shows a legacy tag)">
                  <select value={s.source?.ruleset ?? '2024'} onChange={(e) => set((d) => { d.source = { ...d.source, ruleset: e.target.value } })}>
                    {RULESETS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </Field>
                {kind === 'spell' && (
                  <>
                    <Field label="Level (0 = cantrip)"><input type="number" min={0} max={9} value={s.level ?? 0} onChange={(e) => set((d) => { d.level = Number(e.target.value) })} /></Field>
                    <Field label="School"><select value={s.school ?? ''} onChange={(e) => set((d) => { d.school = e.target.value })}>{SCHOOLS.map((x) => <option key={x}>{x}</option>)}</select></Field>
                    <Field label="Casting time"><input className="text-input" value={s.castingTime ?? ''} onChange={(e) => set((d) => { d.castingTime = e.target.value })} /></Field>
                    <Field label="Range"><input className="text-input" value={s.range ?? ''} onChange={(e) => set((d) => { d.range = e.target.value })} /></Field>
                    <Field label="Duration"><input className="text-input" value={s.duration ?? ''} onChange={(e) => set((d) => { d.duration = e.target.value; d.concentration = /^concentration/i.test(e.target.value) })} /></Field>
                    <Field label="Components">
                      <span>
                        {(['v', 's', 'm'] as const).map((c) => (
                          <label key={c} className="checkbox"><input type="checkbox" checked={!!s.components?.[c]} onChange={(e) => set((d) => { d.components = { ...(d.components ?? {}), [c]: e.target.checked } })} />{c.toUpperCase()}</label>
                        ))}
                      </span>
                    </Field>
                    <Field label="Material (if M)"><input className="text-input" value={s.components?.material ?? ''} onChange={(e) => set((d) => { d.components = { ...(d.components ?? {}), material: e.target.value || null } })} /></Field>
                    <Field label="Ritual"><input type="checkbox" checked={!!s.ritual} onChange={(e) => set((d) => { d.ritual = e.target.checked })} /></Field>
                    <Field label="Classes (comma separated)"><input className="text-input" value={(s.classLists ?? []).join(', ')} onChange={(e) => set((d) => { d.classLists = e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean) })} /></Field>
                    <Field wide label="At higher levels"><textarea rows={2} value={s.higherLevels ?? ''} onChange={(e) => set((d) => { d.higherLevels = e.target.value || null })} /></Field>
                  </>
                )}
                {kind === 'feat' && (
                  <>
                    <Field label="Category">
                      <select value={s.category ?? 'General'} onChange={(e) => set((d) => { d.category = e.target.value })}>
                        {['Origin', 'General', 'Fighting Style', 'Epic Boon', 'legacy'].map((x) => <option key={x}>{x}</option>)}
                      </select>
                    </Field>
                    <Field label="Prerequisite"><input className="text-input" value={s.prerequisite?.printed ?? ''} onChange={(e) => set((d) => { d.prerequisite = e.target.value ? { printed: e.target.value, level: null, abilities: {} } : null })} /></Field>
                    <Field label="Can be taken more than once"><input type="checkbox" checked={!!s.repeatable} onChange={(e) => set((d) => { d.repeatable = e.target.checked })} /></Field>
                  </>
                )}
                {kind === 'item' && (
                  <>
                    <Field label="Category"><select value={s.category ?? 'gear'} onChange={(e) => set((d) => { d.category = e.target.value })}>{['weapon', 'armor', 'gear', 'tool', 'magic'].map((x) => <option key={x}>{x}</option>)}</select></Field>
                    <Field label="Cost"><input className="text-input" value={s.cost ?? ''} placeholder="25 GP" onChange={(e) => set((d) => { d.cost = e.target.value })} /></Field>
                    <Field label="Weight"><input className="text-input" value={s.weight ?? ''} placeholder="5 lb." onChange={(e) => set((d) => { d.weight = e.target.value })} /></Field>
                    <Field label="Needs attunement"><input type="checkbox" checked={!!s.attunement} onChange={(e) => set((d) => { d.attunement = e.target.checked })} /></Field>
                    {s.category === 'weapon' && (
                      <>
                        <Field label="Damage (e.g. 1d8)"><input className="text-input" value={s.weapon?.damage ?? ''} onChange={(e) => set((d) => { d.weapon = { ...(d.weapon ?? { properties: [] }), damage: e.target.value } })} /></Field>
                        <Field label="Damage type"><input className="text-input" value={s.weapon?.damageType ?? ''} onChange={(e) => set((d) => { d.weapon = { ...(d.weapon ?? { properties: [] }), damageType: e.target.value } })} /></Field>
                        <Field label="Mastery"><input className="text-input" value={s.weapon?.mastery ?? ''} onChange={(e) => set((d) => { d.weapon = { ...(d.weapon ?? { properties: [] }), mastery: e.target.value || null } })} /></Field>
                        <Field label="Properties (comma separated)"><input className="text-input" value={(s.weapon?.properties ?? []).join(', ')} onChange={(e) => set((d) => { d.weapon = { ...(d.weapon ?? {}), properties: e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean) } })} /></Field>
                      </>
                    )}
                  </>
                )}
                <Field wide label="Short summary"><input className="text-input" value={s.summary ?? ''} onChange={(e) => set((d) => { d.summary = e.target.value })} /></Field>
                <Field wide label="Full text"><textarea rows={8} value={s.text ?? ''} onChange={(e) => set((d) => { d.text = e.target.value })} /></Field>
              </div>
            )}
            {s && !useForm && (
              <>
                <p className="muted small">Edit the JSON. Class features are in <code>features</code> (each has <code>name</code>, <code>level</code>, <code>text</code>); the level table is in <code>progression</code>. Keep the <code>id</code> to replace the book entry.</p>
                <textarea className="json-editor" rows={22} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
              </>
            )}
            {s && (
              <div className="editor-actions">
                <button className="primary" onClick={save}>Save</button>
                {s.id && s._origin && s._origin !== 'book' && <button className="danger" onClick={remove}>{s._origin === 'edited' ? 'Back to book version' : 'Delete'}</button>}
                {message && <span className="muted">{message}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Small reusable inputs used across the sheet.

import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'

// A number box that lets you clear it while typing without the value jumping
// to 0. The new number is passed on as soon as it is valid; empty gives null.
export function NumberInput(props: {
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  className?: string
  title?: string
  placeholder?: string
}) {
  const { value, onChange, min, max, className, title, placeholder } = props
  const [text, setText] = useState(value === null ? '' : String(value))
  useEffect(() => setText(value === null ? '' : String(value)), [value])

  return (
    <input
      type="number"
      className={`num-input ${className ?? ''}`}
      value={text}
      min={min}
      max={max}
      title={title}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value)
        if (e.target.value === '') onChange(null)
        else if (Number.isFinite(Number(e.target.value))) onChange(Number(e.target.value))
      }}
      onBlur={() => setText(value === null ? '' : String(value))}
    />
  )
}

export function TextInput(props: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <input
      type="text"
      className={`text-input ${props.className ?? ''}`}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
    />
  )
}

// A list of short labels (languages, resistances, conditions). When editable,
// each has a remove button. New ones are picked from `options` in a dropdown
// (with "Other…" for anything not listed), or typed and added with Enter when
// there are no options.
export function TagList(props: {
  items: string[]
  onChange: (items: string[]) => void
  editable: boolean
  options?: string[]
  placeholder?: string
  emptyText?: string
}) {
  const { items, onChange, editable, options, placeholder, emptyText } = props
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const remaining = (options ?? []).filter((o) => !items.includes(o))

  function addItem(value: string) {
    const trimmed = value.trim()
    if (trimmed && !items.includes(trimmed)) onChange([...items, trimmed])
  }

  function addTyped(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      addItem(draft)
      setDraft('')
      if (options) setTyping(false)
    }
    if (event.key === 'Escape') setTyping(false)
  }

  const showDropdown = editable && options !== undefined && !typing

  return (
    <div className="tag-list">
      {items.length === 0 && !editable && <span className="muted">{emptyText ?? 'None'}</span>}
      {items.map((item) => (
        <span className="tag" key={item}>
          {item}
          {editable && (
            <button className="tag-remove" title={`Remove ${item}`} onClick={() => onChange(items.filter((i) => i !== item))}>
              ×
            </button>
          )}
        </span>
      ))}
      {showDropdown && (
        <select
          className="tag-select"
          value=""
          onChange={(e) => (e.target.value === OTHER ? setTyping(true) : addItem(e.target.value))}
        >
          <option value="">{placeholder ?? 'Add…'}</option>
          {remaining.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
          <option value={OTHER}>Other (type it)…</option>
        </select>
      )}
      {editable && !showDropdown && (
        <input
          className="tag-input"
          value={draft}
          autoFocus={typing}
          placeholder={typing ? 'Type, then Enter' : placeholder ?? 'Add…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={addTyped}
          onBlur={() => draft === '' && setTyping(false)}
        />
      )}
    </div>
  )
}

const OTHER = '__other__'

// A single value picked from a list, with "Other…" to type something not
// listed. With no options (e.g. subclasses before the book import) it is a
// plain text box.
export function ChoiceInput(props: { value: string; options: string[]; onChange: (value: string) => void; placeholder?: string }) {
  const { value, options, onChange, placeholder } = props
  const isCustom = value !== '' && !options.includes(value)
  const [typing, setTyping] = useState(isCustom)
  // A value that is not in the list (homebrew, or another character opened) shows as typed text.
  useEffect(() => {
    if (isCustom) setTyping(true)
  }, [isCustom])

  if (options.length === 0 || typing) {
    return (
      <span className="choice-input">
        <TextInput value={value} placeholder={placeholder} onChange={onChange} />
        {options.length > 0 && (
          <button className="small" title="Pick from the list" onClick={() => { setTyping(false); if (isCustom) onChange('') }}>
            List
          </button>
        )}
      </span>
    )
  }
  return (
    <select className="choice-select" value={value} onChange={(e) => (e.target.value === OTHER ? setTyping(true) : onChange(e.target.value))}>
      <option value="">{placeholder ?? 'Choose…'}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
      <option value={OTHER}>Other (type it)…</option>
    </select>
  )
}

// Tick boxes for limited uses (rages, spell slots). Clicking a box marks
// everything up to it as used; clicking a used box frees it and the ones after it.
// Large pools show a number with - and + buttons instead.
export function UsesTracker(props: { max: number; used: number; onChange: (used: number) => void; label?: string }) {
  const { max, used, onChange, label } = props
  if (max > 12) {
    return (
      <span className="uses-number">
        <button onClick={() => onChange(Math.max(0, used - 1))} title="Regain one">−</button>
        <span>{max - used} / {max} left</span>
        <button onClick={() => onChange(Math.min(max, used + 1))} title="Spend one">+</button>
      </span>
    )
  }
  return (
    <span className="pips" aria-label={label}>
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          className={`pip ${i < used ? 'used' : ''}`}
          title={i < used ? 'Used (click to regain)' : 'Available (click to spend)'}
          onClick={() => onChange(i < used ? i : i + 1)}
        />
      ))}
    </span>
  )
}

export function Section(props: { title: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`box ${props.className ?? ''}`}>
      <header className="box-title">
        <span>{props.title}</span>
        {props.actions}
      </header>
      {props.children}
    </section>
  )
}

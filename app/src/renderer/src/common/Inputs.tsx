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
// each has a remove button and new ones are added by typing and pressing Enter.
export function TagList(props: {
  items: string[]
  onChange: (items: string[]) => void
  editable: boolean
  placeholder?: string
  emptyText?: string
}) {
  const { items, onChange, editable, placeholder, emptyText } = props
  const [draft, setDraft] = useState('')

  function add(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    const value = draft.trim()
    if (value && !items.includes(value)) onChange([...items, value])
    setDraft('')
  }

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
      {editable && (
        <input
          className="tag-input"
          value={draft}
          placeholder={placeholder ?? 'Add…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={add}
        />
      )}
    </div>
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

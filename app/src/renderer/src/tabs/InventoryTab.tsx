// Inventory tab. Always editable, because items and coins change during play.

import { newId } from '../../../shared/character'
import { useEffect, useState } from 'react'
import type { ItemInfo } from '../../../shared/api'
import { attunedCount, capacity, isOverCapacity, totalWeight } from '../../../shared/rules/inventory'
import type { Coins } from '../../../shared/schema/character'
import { NumberInput, Section, TextInput } from '../common/Inputs'
import { useSheet } from '../SheetContext'

const COINS: { key: keyof Coins; label: string }[] = [
  { key: 'cp', label: 'CP' },
  { key: 'sp', label: 'SP' },
  { key: 'ep', label: 'EP' },
  { key: 'gp', label: 'GP' },
  { key: 'pp', label: 'PP' }
]

export function InventoryTab() {
  const { character, update } = useSheet()
  const [known, setKnown] = useState<ItemInfo[]>([])
  useEffect(() => {
    window.api.listItems().then(setKnown).catch(() => setKnown([]))
  }, [])

  // Picking a name from the list fills in the weight from the book data (only if the weight is still 0).
  function nameChanged(index: number, name: string) {
    const match = known.find((item) => item.name.toLowerCase() === name.trim().toLowerCase())
    update((c) => {
      const row = c.inventory[index]
      row.name = name
      if (match) {
        row.itemId = match.id
        if (row.weight === 0 && match.weight !== null) row.weight = match.weight
        // A magic item says its rarity and whether it needs attunement (the 3-item limit is on this tab).
        if (!row.notes && match.rarity) row.notes = `${match.rarity}${match.attunement ? ', requires attunement' : ''}`
      }
    })
  }

  return (
    <div className="tab-body">
      <Section title="Coins">
        <div className="coins">
          {COINS.map((coin) => (
            <label key={coin.key}>
              {coin.label}
              <NumberInput value={character.coins[coin.key]} min={0} onChange={(v) => update((c) => { c.coins[coin.key] = Math.max(0, v ?? 0) })} />
            </label>
          ))}
        </div>
      </Section>

      <Section
        title="Items"
        actions={
          <button
            className="small"
            onClick={() =>
              update((c) => {
                c.inventory.push({ id: newId(), itemId: null, name: '', quantity: 1, weight: 0, equipped: false, attuned: false, notes: '' })
              })
            }
          >
            Add item
          </button>
        }
      >
        <table className="inventory">
          <thead>
            <tr>
              <th title="Equipped">Eq.</th>
              <th>Name</th>
              <th>Qty</th>
              <th>Weight (lb each)</th>
              <th title="Attuned">Att.</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {character.inventory.map((item, i) => (
              <tr key={item.id}>
                <td><input type="checkbox" checked={item.equipped} onChange={(e) => update((c) => { c.inventory[i].equipped = e.target.checked })} /></td>
                <td><input type="text" className="text-input" list="known-items" value={item.name} placeholder="Item name" onChange={(e) => nameChanged(i, e.target.value)} /></td>
                <td><NumberInput value={item.quantity} min={0} onChange={(v) => update((c) => { c.inventory[i].quantity = Math.max(0, v ?? 0) })} /></td>
                <td><NumberInput value={item.weight} min={0} onChange={(v) => update((c) => { c.inventory[i].weight = Math.max(0, v ?? 0) })} /></td>
                <td><input type="checkbox" checked={item.attuned} onChange={(e) => update((c) => { c.inventory[i].attuned = e.target.checked })} /></td>
                <td><TextInput value={item.notes} onChange={(v) => update((c) => { c.inventory[i].notes = v })} /></td>
                <td><button className="small danger" title="Remove item" onClick={() => update((c) => { c.inventory.splice(i, 1) })}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="known-items">
          {known.map((item) => <option key={item.id} value={item.name} />)}
        </datalist>
        <div className={`inventory-totals ${isOverCapacity(character) ? 'over' : ''}`}>
          <span title="Carry limit is Strength x 15 lb (2024 PHB). Drag, lift or push up to Strength x 30 lb.">
            Carried: {totalWeight(character)} / {capacity(character).carry} lb
            {isOverCapacity(character) ? ' (over the limit)' : ''}
          </span>
          <span>Drag, lift or push: {capacity(character).dragLiftPush} lb</span>
          <span>Attuned items: {attunedCount(character)}</span>
        </div>
      </Section>
    </div>
  )
}

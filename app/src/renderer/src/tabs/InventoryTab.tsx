// Inventory tab. Always editable, because items and coins change during play.

import { newId } from '../../../shared/character'
import { attunedCount, totalWeight } from '../../../shared/rules/inventory'
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
                <td><TextInput value={item.name} placeholder="Item name" onChange={(v) => update((c) => { c.inventory[i].name = v })} /></td>
                <td><NumberInput value={item.quantity} min={0} onChange={(v) => update((c) => { c.inventory[i].quantity = Math.max(0, v ?? 0) })} /></td>
                <td><NumberInput value={item.weight} min={0} onChange={(v) => update((c) => { c.inventory[i].weight = Math.max(0, v ?? 0) })} /></td>
                <td><input type="checkbox" checked={item.attuned} onChange={(e) => update((c) => { c.inventory[i].attuned = e.target.checked })} /></td>
                <td><TextInput value={item.notes} onChange={(v) => update((c) => { c.inventory[i].notes = v })} /></td>
                <td><button className="small danger" title="Remove item" onClick={() => update((c) => { c.inventory.splice(i, 1) })}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="inventory-totals">
          <span>Total weight: {totalWeight(character)} lb</span>
          <span>Attuned items: {attunedCount(character)}</span>
        </div>
      </Section>
    </div>
  )
}

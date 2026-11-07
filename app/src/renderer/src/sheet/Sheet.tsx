// The three-column sheet under the top bar.

import { useState } from 'react'
import { CombatTab } from '../tabs/CombatTab'
import { FeaturesTab } from '../tabs/FeaturesTab'
import { InventoryTab } from '../tabs/InventoryTab'
import { NotesTab } from '../tabs/NotesTab'
import { SpellsTab } from '../tabs/SpellsTab'
import { CampaignSync } from './CampaignSync'
import { LeftColumn } from './LeftColumn'
import { RightColumn } from './RightColumn'
import { TopBar } from './TopBar'

const TABS = [
  { id: 'combat', title: 'Combat', component: CombatTab },
  { id: 'spells', title: 'Spells', component: SpellsTab },
  { id: 'inventory', title: 'Inventory', component: InventoryTab },
  { id: 'features', title: 'Features and Traits', component: FeaturesTab },
  { id: 'notes', title: 'Notes', component: NotesTab }
]

export function Sheet() {
  const [tab, setTab] = useState('combat')
  const Current = TABS.find((t) => t.id === tab)!.component

  return (
    <div className="sheet">
      <CampaignSync />
      <TopBar />
      <div className="columns">
        <LeftColumn />
        <div className="column centre">
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={t.id === tab} className={t.id === tab ? 'active' : ''} onClick={() => setTab(t.id)}>
                {t.title}
              </button>
            ))}
          </nav>
          <Current />
        </div>
        <RightColumn />
      </div>
    </div>
  )
}

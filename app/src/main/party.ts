// The DM view's data (read-only) and the shared campaign clock.

import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Campaign } from '../shared/api'
import { partyMember, unreadableMember, type PartyMember } from '../shared/rules/party'
import { readCharacterFile } from './characterFiles'
import { PLAYER_EDITION } from './edition'
import { getSaveFolder, loadSettings } from './settings'

export const CAMPAIGN_FILE = 'campaign.json'

// Opens every character file in the DM folder for reading only. This function never writes there.
export function listParty(): PartyMember[] {
  if (PLAYER_EDITION) return [] // the DM view is not in the players' build
  const folder = loadSettings().dmFolder
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((name) => name.endsWith('.json') && name !== CAMPAIGN_FILE)
    .sort()
    .map((fileName) => {
      const result = readCharacterFile(join(folder, fileName))
      return result.ok ? partyMember(fileName, result.character) : unreadableMember(fileName, result.error)
    })
}

export function getCampaign(): Campaign | null {
  const path = join(getSaveFolder(), CAMPAIGN_FILE)
  if (!existsSync(path)) return null
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    return typeof data.gameMinutes === 'number' ? { gameMinutes: data.gameMinutes } : null
  } catch {
    return null
  }
}

// Only the DM's app writes the clock. It is saved in the save folder so a shared Drive folder carries it.
export function setCampaign(campaign: Campaign): void {
  if (loadSettings().role !== 'dm') throw new Error('Only the DM can change the campaign clock.')
  const path = join(getSaveFolder(), CAMPAIGN_FILE)
  writeFileSync(`${path}.tmp`, JSON.stringify({ gameMinutes: Math.max(0, Math.floor(campaign.gameMinutes)) }, null, 2), 'utf8')
  renameSync(`${path}.tmp`, path)
}

// Shares the open character, the edit switch and the dice roller with every
// part of the sheet, so they don't have to be passed down through each component.

import { createContext, useContext, type MouseEvent } from 'react'
import type { CharacterFile } from '../../shared/schema/character'

export interface SheetContextValue {
  character: CharacterFile
  // Change the character: `update(c => { c.state.hpCurrent = 5 })`.
  // The function gets a copy, so it can change it directly.
  update: (change: (draft: CharacterFile) => void) => void
  editing: boolean
  // Shift-click rolls with advantage, Ctrl-click with disadvantage.
  rollD20: (label: string, bonus: number, event?: MouseEvent) => void
  rollDice: (label: string, expression: string, critical?: boolean) => number | null
}

export const SheetContext = createContext<SheetContextValue | null>(null)

export function useSheet(): SheetContextValue {
  const value = useContext(SheetContext)
  if (!value) throw new Error('useSheet must be used inside the character sheet')
  return value
}

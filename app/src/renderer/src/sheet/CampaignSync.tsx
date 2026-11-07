// Keeps this character's game clock in step with the DM's campaign clock (campaign.json in the save
// folder). When the DM moves time forward, effects and temporary HP that run out are ended here too.

import { useEffect, useRef } from 'react'
import { advanceTime, gameMinutes } from '../../../shared/rules/effects'
import { useSheet } from '../SheetContext'

export function CampaignSync() {
  const { character, update } = useSheet()
  const current = useRef(gameMinutes(character))
  current.current = gameMinutes(character)

  useEffect(() => {
    let stopped = false
    async function check() {
      try {
        const campaign = await window.api.getCampaign()
        if (stopped || !campaign || campaign.gameMinutes === current.current) return
        update((c) => {
          const delta = campaign.gameMinutes - gameMinutes(c)
          if (delta > 0) advanceTime(c, delta)
          else c.state.gameMinutes = campaign.gameMinutes // the DM moved the clock back
        })
      } catch {
        // no campaign file or an unreadable one: keep the local clock
      }
    }
    void check()
    const timer = setInterval(check, 5000)
    return () => { stopped = true; clearInterval(timer) }
  }, [character.id])

  return null
}

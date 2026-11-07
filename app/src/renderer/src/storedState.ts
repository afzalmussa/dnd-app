// Like useState, but remembers the value on this computer between sessions
// (for layout preferences such as where the roll log is docked).
// If browser storage is unavailable the value simply isn't remembered.

import { useEffect, useState } from 'react'

export function useStoredState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved === null ? initial : (JSON.parse(saved) as T)
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Not remembered this time; nothing else to do.
    }
  }, [key, value])

  return [value, setValue]
}

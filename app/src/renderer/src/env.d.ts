// Tells TypeScript that the preload script adds `window.api`.
import type { AppApi } from '../../shared/api'

declare global {
  interface Window {
    api: AppApi
  }
}

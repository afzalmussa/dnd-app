// Tells TypeScript that the preload script adds `window.api`.
import type { AppApi } from '../../shared/api'

interface ImportMetaEnv {
  readonly VITE_EDITION?: string
}

declare global {
  interface Window {
    api: AppApi
  }
}

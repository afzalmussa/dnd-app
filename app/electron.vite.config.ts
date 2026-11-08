// Build settings for the three parts of an Electron app:
//   main     - the Node.js process that owns windows and files (src/main)
//   preload  - a tiny bridge that exposes a safe API to the page (src/preload)
//   renderer - the React user interface (src/renderer)
// electron-vite finds each part's entry file by convention, so no paths needed here.
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// In the players' build the DM's screens are swapped for an empty stub, so their code is not shipped.
const dm = resolve(__dirname, 'src/renderer/src/dm')
const playerAlias =
  process.env.VITE_EDITION === 'player'
    ? [
        { find: './dm/EncountersTab', replacement: resolve(dm, 'stub.tsx') },
        { find: './dm/PartyView', replacement: resolve(dm, 'stub.tsx') },
        { find: './dm/SoundboardTab', replacement: resolve(dm, 'stub.tsx') }
      ]
    : []

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    resolve: { alias: playerAlias }
  }
})

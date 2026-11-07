// Build settings for the three parts of an Electron app:
//   main     - the Node.js process that owns windows and files (src/main)
//   preload  - a tiny bridge that exposes a safe API to the page (src/preload)
//   renderer - the React user interface (src/renderer)
// electron-vite finds each part's entry file by convention, so no paths needed here.
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()]
  }
})

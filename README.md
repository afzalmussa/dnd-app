# DnD Character Manager

A Windows desktop character manager for our D&D group, using the 2024 Player's Handbook rules.

- `app/` is the Electron + React + TypeScript app.
- `tools/book_import/` will hold the Python book import (Milestone 2).
- `docs/milestone-0-design.md` explains the layout, data schema and decisions.

The PDFs, the OCR cache, the generated data pack and the import reports are
git-ignored and never leave your PC.

## Running the app (development)

From PowerShell (not as Administrator), in the project folder:

```
cd app
npm install
npm run dev
```

`npm run dev` opens the app with live reload: save a source file and the window updates.

## Checks

```
cd app
npm test            # unit tests for the rules maths
npm run typecheck   # TypeScript type check
```

## Where characters are saved

`%APPDATA%\DnD Character Manager\characters\`, one JSON file per character.
Changes save automatically about half a second after you stop typing.

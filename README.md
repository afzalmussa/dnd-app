# DnD Character Manager

A Windows desktop character manager for our D&D group, using the 2024 Player's Handbook rules.

- `app/` is the Electron + React + TypeScript app.
- `tools/book_import/` is the Python book import (Milestone 2, in progress: classes only so far).
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

## Book import (DM's PC only)

```
python -m venv .venv
.venv\Scripts\python -m pip install -r tools\book_import\requirements.txt
cd tools\book_import
..\..\.venv\Scripts\python import_books.py --book phb24 --only classes:barbarian,cleric,wizard
```

Needs Tesseract at `C:\Program Files\Tesseract-OCR`. Output: `data-pack/phb24/classes.json`, `reports/import-report-phb24.html`, `reports/fixes-phb24.json`.

## Using the sheet (Milestone 3 pieces)

- **Spells tab:** type a spell name in "Add a spell" and pick it from the list. School, casting time, range, components, duration and the description are copied from the book data. Click a spell's name to open its details.
- **Inventory tab:** pick an item name from the list to fill in its weight. The tab shows carried weight against the limit (Strength x 15 lb).
- **Level up** (top bar): a guided wizard. It lists what the new level gives you and asks only for the choices that level needs: hit points, subclass, ability score improvement or feat, new cantrips and spells, expertise, weapon mastery. A new class starts at level 1 (multiclassing), with the PHB prerequisite check and multiclass spell slots.
- All of it reads `data-pack/` (made by the book import). Without it, the lists are empty and you can still type everything by hand.

Re-run the full import: `python tools\book_import\import_books.py --book phb24` (and `xge`, `tce`, `bgg`), then `python tools\book_import\multiclass.py`.

## Windows build (Milestone 5)

```
cd app
npm run dist
```

Makes `app\release\DnD Character Manager-<version>-win.zip` and a portable `.exe` that run without installing anything. The data pack (`data-pack\`) is copied in as a resource; the PDFs, OCR cache and reports are not. Run the book import first so the data pack exists.

## Sharing with the party

- **Settings** (toolbar): choose the folder characters are saved in (a shared Google Drive folder works), the folder your corrections and homebrew are saved in, and whether this PC is the DM's.
- **DM view** (toolbar): all party sheets at a glance (HP, AC, passive Perception, spell slots, resources, conditions). It only reads the folder and never changes a sheet.
- **Campaign clock:** on the DM's PC (Settings, DM) the DM view can advance the in-game time. It is saved as `campaign.json` in the save folder. Players' apps read it every few seconds and end effects and temporary HP whose time has run out.

## Story wiki

The **Wiki** button switches to your story notes: **My Notes** (private, a folder on your PC) and the **Party Wiki** (a shared folder, normally the Google Drive player wiki). Pages are plain Markdown, so Obsidian can open the same folders. Choose both folders in **Settings**.

Supported: `[[links]]` (with labels, headings and `Folder/Page` paths), `![[image.png]]`, `#tags`, callouts (`> [!note] Title`), front matter (shown as properties and saved back unchanged), folder notes, "Linked from", search, rename (updates links), delete (Recycle Bin). If a page was changed elsewhere while you had it open, you choose: load theirs, keep yours, or save yours as a copy. Not supported: Obsidian plugins and embedding one note inside another.

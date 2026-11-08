# DMs Toolbox (DnD Character Manager)

The DM's build is called DMs Toolbox; the players' build is called Heroes Toolbox. They keep their old data folders, `%APPDATA%\DnD Character Manager` (DM) and `%APPDATA%\DnD Character Manager Players` (players).

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

The Artificer (Tasha's, a legacy 2014 class) is imported by the `tce` run: its table, features, four Artificer Specialists and spell list. Its printed table loses a few "1" digits in the scan; those cells are filled from the Ranger and Paladin half-caster tables and listed in the report. Artificer spells it could not match (not yet imported, such as Longstrider and Expeditious Retreat) are flagged. Prepared spells follow the rule text (Intelligence modifier + half your levels, rounded up), not a table column. The Artificer Infusions list is not imported yet.

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

## Sharing notes with the players (DM)

Everything shared goes through folders, so Google Drive does the syncing. Nobody needs to be online at the same time: players see changes when Drive syncs and the app refreshes the Wiki on its own.

1. **Settings** (DM PC): choose **My Notes** (your private vault), the shared **Party Wiki** folder, and set the role to **DM**. For secrets, add a **Player folder** per player: a separate Drive folder shared with that player only.
2. **Players:** choose the Party Wiki folder, and (for secrets) the **From the DM** folder that you shared with them.
3. **Write your notes** in My Notes as usual, and paste in monologues, place descriptions or dialogue. Everything stays private unless you mark it:
   - select text in the editor and click **Share selection** (the whole party sees it), or **Secret for…** (one player sees it);
   - this is a plain callout: `> [!share] Title` or `> [!secret Auriviel] Title`, so Obsidian shows it too.
4. **Publish this page** or **Publish all** (end of session). Only the marked parts are copied to `Party Wiki/DM Shares/` (with an `Index.md` front page) and each player's private folder. Your own page is never changed.
5. **Copy for WhatsApp** copies the shared text so you can paste it into a chat. WhatsApp itself cannot be connected to the app, so that step stays manual.

Secrets are only as private as the Drive folder: share each player's folder with that player only.

## Encounters (DM)

**Encounters** in the toolbar (DM only): every party member with live health and one line of battle numbers (AC, initiative, passive Perception, speed, slots, conditions), refreshed from the DM folder every few seconds. **Add enemy** is a search box over the Monster Manual (504 stat blocks, imported with `python tools\book_import\import_books.py --book mm`); picking one fills in its numbers. Enemy abilities appear as chips: hover one to read what it does. There are no roll buttons, you roll your own dice. Enter initiative, press Next turn, use Dmg / Heal on enemies. Total XP is shown. The encounter is remembered on this PC. Difficulty ratings are not shown: the XP threshold tables live in the DMG and the data pack only has the 2014 one.

## Players' edition

`npm run dist:player` (in `app`) builds a version for your players with no bestiary, encounter screen, DM view or publishing, and without the Monster Manual and DMG data. The role is fixed to player. Output goes to `app/release-player`. The normal `npm run dist` build is the DM's.

## Sound tab (DM)

**Sound** in the toolbar (DM only; the players' edition does not contain it). Pick a category, click a sound: effects play once and can overlap, ambience and music loop (click again to fade out). One volume slider and **Stop sounds**. Sounds keep playing while you use other tabs. **Streaming music** holds links you save: paste a YouTube video link (a bare playlist link does not work; open a video in the playlist and copy that) (the name fills in from YouTube, or type your own), then Play. A bar shows the position: use the slider, or the 10-second back and forward buttons, to move through the song, plus Pause and a volume slider. YouTube's own embedded player is blocked inside desktop apps, so the app plays the video's page in a hidden window. Nothing is downloaded. Spotify cannot be played inside the app; use a YouTube link or a direct link to an mp3/ogg file.

The sounds are files in the sound folder (Settings, "The sound library"; while developing it is `audio\` in the project). Each sub-folder is a category, each folder inside that a pack. To get a free starter library run `python tools\audio_fetch\fetch_audio.py` (add `--dry-run` to see what it would download). It reads `tools\audio_fetch\queries.json`, takes only CC0 pages from OpenGameArt, stays under the budget there (950 MB), and records every file's author, licence and page in `audio\credits.json` (hover a sound to see its credit). The `audio` folder is not in git. You can add your own files to the sound folder, for example exports from other soundboard apps you have the rights to use.

## Wiki window, session recaps, backups, tests

- **Pop out** (Wiki toolbar) opens the wiki in its own window; close it or press Wiki again to bring it back.
- **New session recap** (Wiki toolbar) makes a dated page in My Notes / Sessions with headings for the summary, what happened, NPCs, loot and XP, and a share block for the players.
- **Backups:** Settings, "Backups are saved in" (use a Google Drive folder). A zip of your characters, corrections and notes is saved once a day when the app opens, and when you press Back up now. The newest 15 are kept. To restore, unzip a backup and copy its folders back to the folders Settings shows.
- **Tests:** `npm test` (rules and logic), `npm run test:e2e` (starts the real app in a temporary profile and checks the toolbar for each role, the sound board, monster search, session recaps, wiki pop-out and backups).

**DM start-up:** when this PC is set to DM, the app opens straight to the screen you used last (the Wiki the first time) and does not ask for a character. The party comes from the DM folder (Settings, "The DM view reads sheets from"): put each player's character file there and the Encounters tab lists them with their live hit points and slots. The encounter is remembered, and hit points live in the players' own sheets, so the next session carries on where it stopped.

## Campaigns, colours, wiki images

- **Campaigns:** Settings, "Campaign". Each campaign has its own characters, notes, party wiki, secrets, DM folder, backups and encounter; homebrew corrections and the sound library are shared. Your existing settings become the first campaign. Create more, rename or forget one (its files are never deleted); with two or more, a switcher appears in the toolbar.
- **Colours:** Settings, "Colours": pick a theme (dark grey is the default; Obsidian purple, Dragon red, Midnight, Forest, High contrast, Parchment light), then change the background, panels, text or accent colour if you like. Saved on this PC.
- **Wiki images:** `![[name.png]]` and relative images are found by file name anywhere in the folder, as Obsidian does, so images kept in an Assets folder show up.
- **Names:** the DM's app is **DMs Toolbox**; the players' app is **Heroes Toolbox**. The DM's data folder keeps its old name, so nothing moves.

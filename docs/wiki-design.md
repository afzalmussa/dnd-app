# Story wiki: design

Status: draft for review, 2026-11-07. Planned to be built after Milestone 2 (book import).

## Goal

Give each player a place for their own story notes, and give the party one shared set of pages for NPCs, towns and shared notes. Both work like a small Obsidian vault inside the app, and the files stay ordinary Markdown so the DM can keep using Obsidian on the same pages.

## Two areas

| | My Notes | Party Wiki |
|---|---|---|
| What | Each person's own notes | NPCs, towns, factions, story so far, shared notes |
| Who edits | Only the owner | Everyone in the party |
| Where | A folder on that person's PC. Default `%APPDATA%\DnD Character Manager\notes\`, changeable in Settings | A folder chosen in Settings, normally the shared Google Drive copy of `00_Player Wiki` |
| Seen by others | No, unless the owner moves it somewhere shared | Yes, everyone with access to the Drive folder |

Both areas show in one tree with two top-level headings, "My Notes" and "Party Wiki". Either can be left unset; the tree then shows a "Choose folder" button for it.

**DM-only content stays out of both.** The app can't hide a file that sits in a folder players can open, because anyone with Drive access can read the raw files. The DM's private folders (Bestiary, Castle Ravenloft notes and so on) stay in a vault that is not shared. Access control is Google Drive sharing; the app follows it.

The per-character Notes tab on the sheet is unchanged: it stays inside the character file.

## Screen

A **Wiki** button in the toolbar switches between the character sheet and the wiki. The wiki can also pop out into its own window, using the same mechanism as the roll log.

- **Left:** the folder tree for both areas, with a search box covering page titles and text in both.
- **Centre:** the page in reading view. **Edit** switches to a text editor beside a live preview. Changes save automatically, as on the sheet.
- **Right:** "Linked from" (pages that link to this one) and the page's properties (front matter).

Toolbar inside the wiki: New page, New folder, Rename, Delete.

**Folder notes:** a folder containing a note with the same name (for example `A. Old Svalich Road/Old Svalich Road.md`) opens that note when the folder is clicked, matching the existing vault layout.

## Obsidian compatibility

Supported:

- `[[Page]]`, `[[Page|shown text]]`, `[[Page#Heading]]` and path links like `[[Barovia/Village of Barovia]]`. A bare name is matched by file name anywhere in the area. If two pages share that name, the one nearest the linking page's folder wins (ties go to the first alphabetically) and the link shows a small "ambiguous" marker so it can be fixed with a path link. A link in My Notes looks in My Notes first, then the Party Wiki. A link in the Party Wiki looks only in the Party Wiki, so shared pages never point at someone's private notes.
- Links to pages that don't exist show in a different colour; clicking one offers to create the page.
- Front matter between `---` lines: shown as properties, and saved back exactly as it was.
- Images: `![[map.png]]` and `![alt](map.png)` shown inline when the image is inside that area's folder.
- `#tags` (shown and searchable) and callouts (`> [!note] Title`).

Not supported: Obsidian plugins (Dataview, Canvas, Excalidraw and so on) and embedding one note inside another (`![[Other note]]` shows as a link). Their raw text still shows, and saving never removes it.

## Editing safely

- **Edited elsewhere while open.** When a page is opened, the app notes the file's last-modified time. Before saving it checks again. If the file changed (another player's edit synced by Drive, or the DM in Obsidian), the app does not save. It shows the choices: reload their version, keep mine (overwrite), or save mine as a copy next to it.
- **Rename** updates `[[links]]` to the page in the same area, as Obsidian does, and lists the pages it changed.
- **Delete** moves the file to the Windows Recycle Bin, not permanent deletion.
- **Live refresh:** the tree and open page refresh when files change on disk (Drive syncing). Uses Node's built-in recursive folder watching on Windows.
- **No code from pages.** Page HTML is sanitised before display (DOMPurify), so a page in a shared folder can't run script inside the app, which has access to character files.
- **Folder boundary:** the main process only reads and writes inside the two chosen folders. Paths from the UI are checked so nothing outside them can be touched (same approach as character files).

## Technical outline

- **Main process** `src/main/wikiFiles.ts`: list tree, read, write (temp file then rename, as for characters), rename, trash, watch. Exposed through new `window.api` functions.
- **Shared** `src/shared/wiki/`: link parsing and resolution, front matter split and join, rename-link rewriting. Pure functions with unit tests.
- **Renderer** `src/renderer/src/wiki/`: tree, page view, editor, search.
- **Images** are served to the page through a small custom protocol (`wiki-file://`) registered in the main process and restricted to the two folders; the page's Content Security Policy allows it for images only.
- **Libraries:** `markdown-it` for Markdown (with a small plugin we write for `[[links]]`, about 50 lines), `dompurify` for sanitising, `yaml` for front matter. Search is a simple scan of the files in memory; a party wiki is small enough that no index is needed.

## Testing

- Unit tests: link resolution (including duplicates and folder notes), front matter round trip (byte-for-byte unchanged when not edited), rename rewriting `[[Old]]`, `[[Old|x]]` and `[[Old#h]]`, path boundary checks.
- End-to-end (Playwright on the built app): create, link, rename and delete pages in both areas; simulate an outside edit and check the conflict prompt; check a page containing a `<script>` tag does not run it.

## Settings added

- My Notes folder (default in app data).
- Party Wiki folder (no default).

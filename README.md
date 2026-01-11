# Wro

Wro is a local-first, privacy-first web-based text and document editor. The current build focuses on a smooth writing surface, basic rich text formatting, math quick insert, and local autosave.

## Project Status

### What works today
- Writing in a contenteditable editor with a custom cursor
- Toolbar actions for bold, italic, underline, heading, and bullet list
- Math quick insert: type an expression, add "=", press Tab to insert the result
- .wro export and import (JSON, HTML-based)
- Document metadata persists across sessions and is reused for exports
- Editable document title (manual overrides auto title)
- Document library with create, duplicate, delete, and quick switching
- In-document search with next/previous navigation
- Outline panel generated from headings
- Paste is sanitized to plain text
- Autosave to localStorage with a visible Saved / Saving... indicator
- Editor route runs client-only (SSR disabled)
- Devtools .well-known probe is handled to keep dev logs clean
- Reload restores the last saved content
- Clicking below the last line moves the caret to the end
- Cursor position is restored on reload

### What is next
- Document library polish (bulk actions, rename in list, sorting)
- Search highlights that persist without moving the caret
- .wro container format with embedded assets

### Known issues
- localStorage size limits apply, so very large libraries may fail to save
- Formatting relies on document.execCommand, which is deprecated but still supported by browsers
- Rich formatting from paste is stripped
- .wro exports are HTML-only and do not include assets yet
- .wro imports strip unsupported tags and all attributes
- Document titles are derived from the first non-empty line unless manually edited
- Document title auto-mode uses the first non-empty line and updates on save
- Search selects matches but does not apply persistent highlights

### How to test
1) Run `npm install` if this is your first time in the repo.
2) Run `npm run dev`.
3) Open http://localhost:5173 in your browser.
4) Type in the editor and watch the save indicator flip to Saving... and then Saved after a short pause.
5) Click Export .wro and confirm a `.wro` file downloads.
6) Open the `.wro` file in a text editor and note the `meta.id`.
7) Add a line, click Export .wro again, and confirm the new file keeps the same `meta.id`.
8) Click the title field, type a custom title, and export again. Confirm the `.wro` file uses the new `meta.title`.
9) Click Import .wro and select the file you just exported. Confirm a new document appears and becomes active, and its content matches.
10) Click New Document in the sidebar, confirm it opens, and then switch back to your previous document.
11) Duplicate a document and confirm the new one appears at the top of the list.
12) Delete a document and confirm it is removed (and the active document switches).
13) Use the search field to find a word, then click the next and previous arrows to jump between matches.
14) Add a heading and confirm it appears in the outline; click it to jump back to the heading.
15) Paste formatted text from another app and confirm only plain text is inserted.
16) Click below the last line and confirm the caret jumps to the end of the document.
17) Place the caret in the middle of the text, reload, and confirm it returns to that position.
18) Reload the page and confirm the content is restored.

## Developing

```bash
npm install
npm run dev
```

## Docs
- Architecture overview: `docs/ARCHITECTURE.md`
- Storage model: `docs/STORAGE.md`
- Wro format spec: `docs/WRO_FORMAT.md`
- Testing guide: `docs/TESTING.md`
- Roadmap: `docs/ROADMAP.md`

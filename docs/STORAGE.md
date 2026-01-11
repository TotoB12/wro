# Storage Model

## Local storage
- Key: `wroDocuments`
- Value: array of document objects:
  - `id`, `title`, `title_mode`, `created_at`, `updated_at`
  - `content` (HTML string)
  - `selection` (caret snapshot with DOM path + offset)
- Autosave: debounced 300 ms on input, immediate on formatting actions
- Status: save indicator shows Saved, Saving..., or Save failed
- Key: `wroActiveDocumentId`
- Value: id for the currently open document
- Legacy keys (`userNote`, `userNoteMeta`, `userNoteMetaState`, `userNoteSelection`) are read once for migration if present.

## Recovery
- On load, documents are read from `wroDocuments`, and the active id is restored.
- If a selection snapshot exists for that document, the caret is restored.
- Otherwise, the caret falls back to the end of the document.
- Importing a `.wro` file adds a new document and switches to it.

## Limitations
- localStorage is size limited and not suitable for very large documents.
- There is no version history yet.
- .wro export uses HTML only and does not include assets yet.

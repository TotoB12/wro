# Wro Architecture

## Overview
Wro is a SvelteKit single page app. The editor is a contenteditable surface with a custom cursor overlay and a lightweight toolbar. SSR is disabled for the editor route because it relies on DOM-only APIs.

## Key flows
- Editor state lives in an HTML string and is bound to the contenteditable element.
- Formatting uses document.execCommand for bold, italic, underline, heading, and list actions.
- Math assist starts when you type an expression followed by "=". Press Tab to insert the result or Escape to cancel.
- Autosave writes to localStorage and updates the save indicator without shifting layout.
- The caret position is stored as a DOM path + offset snapshot and restored on load.
- Clicking below the last line moves the caret to the end of the document.
- Paste is intercepted and inserted as plain text to avoid unsafe HTML.
- Document library reads and writes a local documents array, with create/duplicate/delete actions.
- Search scans document text and moves selection to next/previous matches.
- Outline lists headings and jumps to them in the editor.
- Export builds a `.wro` JSON file from the current HTML and downloads it.
- Import validates a `.wro` file and adds it as a new document.
- Import sanitizes HTML to a safe tag subset and strips attributes.
- Document metadata is stored locally and reused for exports.
- Title input toggles between auto (derived from content) and manual modes.

## Source map
- `src/routes/+page.svelte`: editor UI, editor state, math assist, autosave, save indicator
- `src/routes/+page.js`: route options (SSR disabled)
- `src/routes/+layout.svelte`: app shell and global styles
- `static/fonts/*`: Poly Sans font files used by the editor UI

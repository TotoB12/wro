# Testing Guide

## Local dev setup
1) Open PowerShell in the repo root.
2) Run `npm install` if you have not installed dependencies yet.
3) Run `npm run dev`.
4) Open http://localhost:5173 in your browser.

## Manual checklist
1) Click inside the editor and type quickly for 15 to 30 seconds. Expect no lag and a stable cursor.
2) Select a word, click Bold, Italic, and Underline. Expect the formatting to apply without the selection jumping.
3) Type `2+2=` and press Tab. Expect the result to insert. Press Escape to cancel math mode.
4) Click Export .wro and confirm a `.wro` file downloads.
5) Add a new line, then click Import .wro and select the file you just exported. Expect a new document to appear and become active, with content matching the file.
6) Open the exported `.wro` file in a text editor and note the `meta.id`.
7) Add another line, export again, open the new file, and confirm `meta.id` matches while `meta.updated_at` is newer.
8) Click the title field, enter a custom title, export again, and confirm `meta.title` matches the title you typed.
9) Click New Document in the sidebar and confirm it opens.
10) Duplicate a document and confirm the copy appears at the top of the list.
11) Delete a document and confirm it is removed and another document becomes active.
12) Use the search field to find a word, then click the next/previous buttons to jump between matches.
13) Add a heading and confirm it appears in the outline. Click the outline entry to jump to it.
14) Paste formatted text from another app. Expect only plain text to be inserted.
15) Click below the last line. Expect the caret to jump to the end of the document.
16) Watch the save indicator in the top bar. It should show Saving... while you type and then Saved after a short pause.
17) Place the caret in the middle of the text, reload the page, and confirm the caret returns to that position.
18) Reload the page and confirm your content is restored.

## If something looks wrong
- Open the browser console and note any errors.
- Take a screenshot of the toolbar and save indicator.
- Check localStorage for the `wroDocuments` and `wroActiveDocumentId` keys and note their sizes.
- If imported content loses formatting, confirm it used only the supported tags.

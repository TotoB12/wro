# AGENTS.md — Wro (Web-based Text & Document Editor)

This repository is **Wro**, an early-stage project intended to become a **sleek, elegant, extremely smooth** web-based text + document editor with **powerful, extensible capabilities**.

`AGENTS.md` is the agent-facing companion to the README. It defines the product vision, workflow rules, engineering constraints, and project norms so coding agents (e.g., OpenAI Codex) can work effectively.

---

## 0) Agent workflow rules (IMPORTANT)

### How to work in this repo
1. **Read before writing**
   - Inspect existing files, current editor behavior, styling, state management, routing, and persistence.
   - Prefer incremental improvements over rewrites.
   - Follow existing patterns unless they are clearly broken.

2. **Ship small, end-to-end slices**
   - Implement the smallest vertical slice that works: UI → state → persistence → reload.
   - Keep changesets focused and reviewable.

3. **Always update documentation**
   - Any functional change must update relevant docs (README, docs pages, in-code comments, changelog notes).
   - Keep a running “Project Status” section up to date:
     - what works today
     - what’s next
     - known issues
     - how to test

4. **Always provide a concrete test plan**
   - After each change, provide:
     - exact commands to run
     - what to click / type / verify in the UI
     - expected outcomes and where to look (UI, console, storage)

5. **Default behavior when the user’s request is not specific**
   - If the user asks something broad (e.g., “improve Wro”), do **not** ask lots of questions first.
   - Instead, do the following autonomously:
     - evaluate repo state and identify the top risks/bugs
     - propose a short, prioritized feature list
     - implement **one** small improvement that can be validated quickly
     - update documentation and add a test plan
     - record the next 3–7 items in a living roadmap

### “Explain slowly” rule (user is not a Svelte expert)
- When asking the user to test anything:
  - write steps **clearly, slowly, and sequentially**
  - assume minimal framework knowledge
  - include where to click and what “success” looks like
  - include how to capture useful info (console logs, screenshots, storage state)
- Never say “just run the dev server” without explaining how.

### Boundaries / Never do
- Never commit secrets or telemetry keys.
- Never add analytics, tracking, or “phone-home” behavior.
- Never introduce a backend requirement or background server worker unless the user explicitly asks.
- Don’t replace the editor framework wholesale unless the user explicitly approves.
- Don’t degrade typing latency, cursor stability, or offline reliability for “nice-to-have” features.

---

## 1) Core product goal (what we’re building)

Wro should feel like a premium editor:
- **Instant, stable typing** (no lag, no selection jumps)
- **Beautiful, minimal UI** (clean typography, subtle motion, consistent spacing)
- **Powerful editing primitives** (blocks, formatting, links, lists, tables, code, embeds)
- **Serious document workflows** (search, outline, export/import)
- **Extensible architecture** (features ship as plugins/extensions, not hacks)

Wro is **local-first** and **privacy-first**:
- Everything runs on the user’s device.
- User data **never leaves** the device by default.

---

## 2) Non-negotiables

### Local-first, offline-first
- Wro must work fully offline after first load.
- Editing must not depend on network availability.

### Privacy-first (no data leaves device)
- No uploads.
- No background sync to any server.
- No third-party tracking.
- No remote logging of document contents.
- If any optional “remote feature” is ever considered, it must be:
  - opt-in
  - clearly explained
  - disabled by default
  - designed so content is never sent unless the user explicitly initiates it

### Performance + stability
- Typing performance is sacred.
- Cursor/selection stability is sacred.
- Undo/redo reliability is sacred.

---

## 3) Wro document format: `.wro` (REQUIRED)

Wro documents are not “Word files” or “PDF-first” or “plain text-first”.
Wro has its own file format: **`.wro`**.

### Format principles
- `.wro` must be:
  - **portable** (you can move it between machines)
  - **versioned** (format_version included)
  - **deterministic** (same input → same output)
  - **recoverable** (able to detect corruption and fail gracefully)
  - **future-proof** (supports migrations)

### Recommended initial structure (v1)
Use a single-file container with:
- a JSON manifest (metadata + schema/version)
- a structured document representation (editor JSON)
- optional binary assets (images) stored inside the container OR referenced with stable IDs

**Implementation options:**
1. **Simple first:** `.wro` as a JSON file (text) with a `format_version`
   - easiest to implement, debug, and diff
   - later can migrate to a container without breaking users

2. **Container later:** `.wro` as a ZIP container (like `.docx` style, but ours)
   - `manifest.json`
   - `document.json`
   - `assets/<id>.<ext>`

Agents should start with option (1) unless the repo already has a different approach.

### Required import/export behaviors
- Export `.wro` must exactly preserve structure and formatting.
- Import `.wro` must validate:
  - format_version
  - schema compatibility
  - required fields
- Provide migration hooks for newer versions.

### Optional secondary exports (later)
- Export to Markdown/HTML/PDF can exist as convenience, but `.wro` is the **primary** format.
- Never design features around PDF/Word constraints.

---

## 4) UX principles

1. **Typing comes first**
   - Never block keystrokes on parsing, saving, or heavy transforms.

2. **Selection stability**
   - No cursor jumps.
   - No unexpected focus loss.
   - Toolbars must not cause layout shifts.

3. **Polished interactions**
   - Smooth scrolling.
   - Subtle animations (short, non-janky).
   - Keyboard-first power features (shortcuts + command palette).

4. **Accessible by default**
   - Focus management
   - Keyboard navigation
   - Reasonable contrast

---

## 5) Persistence (on-device only)

### Required
- Autosave locally (e.g., IndexedDB or browser storage suited for structured data).
- Crash-safe behavior:
  - last autosave recoverable
  - avoid corrupting saved state

### Strongly recommended
- Treat persistence as a separate layer:
  - editor state ↔ storage adapter
- Add an explicit “Saved / Saving…” indicator that does not reflow layout.

---

## 6) MVP definition (features that make Wro “real”)

Wro MVP is “real” when it can:
1. Create/open a document (local list)
2. Rich text editing (at least: bold/italic/underline, headings, lists, links)
3. Undo/redo reliably
4. Autosave + restore on reload
5. Export + import `.wro`
6. Search within the current document (basic)
7. Clean UI (sidebar + top bar + editor canvas)

If any feature compromises typing stability, scale it back.

---

## 7) “Power features” (implemented incrementally)

Implement as extensions/plugins where possible:

### Structure
- Outline from headings
- Collapsible sections

### Content types
- Tables (basic)
- Code blocks
- Images (paste/import into `.wro` assets)

### Productivity
- Command palette (Ctrl/Cmd+K)
- Slash menu insertion
- Markdown shortcuts (optional)

### Workflows
- Version snapshots (local)
- Document duplication
- Export formats (secondary)

---

## 8) Testing + validation (must be easy for non-experts)

### Always provide a simple test plan
When asking Antonin (the user) to test:
- Use numbered steps.
- Include what to click.
- Include expected results.
- Include how to share debugging info.

### Manual test checklist (run after editor changes)
1. Type fast for 15–30 seconds → no lag, no dropped characters
2. Select text + apply formatting → selection remains stable
3. Undo/redo across multiple edits → correct
4. Reload page → content restored exactly
5. Export `.wro` → re-import it → matches (structure + formatting)
6. Paste plain text + formatted text → behaves predictably

---

## 9) Documentation rules (AUTONOMOUS MODE)

### Always keep docs current
- Update docs as part of every change.
- Add or update:
  - “How it works” (architecture)
  - “Storage model” (where docs live, how autosave works)
  - “.wro format spec” (versioned)
  - “How to test” (step-by-step)

### Living roadmap + feature checklist
Maintain a living checklist in the repo (prefer `docs/ROADMAP.md` or similar):
- **Now:** current milestone goals
- **Next:** 3–7 prioritized items
- **Later:** longer-term ideas
- Mark features as:
  - Planned
  - In progress
  - Done
  - Deferred
- Every time you complete a feature:
  - check it off
  - add brief notes about implementation + how to test
  - update any affected docs

### Default behavior when user request is vague
If the user does not specify a concrete goal:
- Identify the next highest-leverage improvement.
- Implement one small, testable step.
- Update roadmap + docs.
- Provide a clear manual test plan.

---

## 10) Security & safety requirements

- Sanitize imported HTML if the app supports pasting rich content.
- Treat embeds as untrusted (ideally disabled initially).
- Don’t store sensitive content in logs.
- Avoid unnecessary dependencies.

---

## 11) Development workflow (align with repo)

### Before making changes
- Determine:
  - how the editor state is represented
  - how documents are stored locally
  - how `.wro` export/import should map to that model
  - what framework is used (Svelte/React/etc.) and existing conventions

### After making changes
- Provide:
  - commands to run
  - a “click-by-click” manual test plan
  - where to look if something fails (console, storage, file downloads)

---

## 12) Suggested milestone plan (next steps)

### Milestone A — Stability baseline
- Fix any typing/selection bugs
- Confirm undo/redo correctness
- Add “Saved/Saving” indicator (local only)

### Milestone B — `.wro` format v1
- Implement export/import
- Write `docs/WRO_FORMAT.md` with:
  - format_version
  - schema
  - migration approach
- Add round-trip tests

### Milestone C — Document library
- Document list (local)
- Create/rename/delete/duplicate

### Milestone D — Outline + search
- Outline from headings
- Search within doc

### Milestone E — Power blocks
- Tables, code blocks, images
- Store assets inside `.wro` container (when implemented)

---

## 13) Definition of done (for any feature)

A feature is done only if:
- Typing performance is not degraded
- Cursor/selection stability is preserved
- Autosave/restore is not broken
- `.wro` import/export remains compatible (or migrates safely)
- Docs are updated
- A clear test plan exists

---
codex resume 019bad2f-80d7-7382-80ed-c08041116371
# WRO Format v1

Status: implemented for export and import.

## File shape (JSON)

```json
{
  "format_version": 1,
  "schema": "wro-doc",
  "meta": {
    "id": "string",
    "title": "string",
    "created_at": "ISO-8601 timestamp",
    "updated_at": "ISO-8601 timestamp"
  },
  "document": {
    "type": "html",
    "content": "<p>Hello</p>"
  }
}
```

## Required fields
- `format_version`: number
- `schema`: must be "wro-doc"
- `meta`: object with `id`, `title`, `created_at`, `updated_at`
- `document`: object with `type` and `content`

## Validation rules
- Only `format_version: 1` is accepted.
- Fail fast when required fields are missing.
- `document.type` must be `"html"`.
- `document.content` must be a string.

## Export notes
- Metadata is created on first save/export and then persisted.
- The editor currently stores HTML in `document.content`.
- Metadata persists across sessions so repeated exports keep the same `meta.id`.
- Manual title edits update `meta.title` and switch to manual mode.

## Import notes
- HTML is sanitized to a safe tag subset and all attributes are stripped.
- Imports add a new document to the local library.
- If the imported `meta.id` collides with an existing document, a new id is generated.

## Migration approach
- Keep `format_version` in every file.
- Add a migration function for each version bump.
- Migrations must be deterministic.
- Import runs migrations before validation.

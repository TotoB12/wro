<script>
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment'; 
  import * as math from 'mathjs';

  // --- State Variables ---
  let editorElement; 
  let customCursorElement; 
  let autoCompleteElement; 
  let editorContainerElement;

  let editorContent = ''; 

  let saveTimeout;
  let lastCursorPosition = { node: null, offset: 0 }; // Used to detect cursor movement
  let mathMode = false;
  let currentEquation = ''; // Stores the expression PART of the math input (e.g. "2+2")

  let isBoldActive = false;
  let isItalicActive = false;
  let isUnderlineActive = false;
  let isHeadingActive = false;
  let isListActive = false;
  let saveState = 'saved';
  let selectionSaveTimeout;
  let lastSelectionSnapshot = null;
  let statusResetTimeout;
  let importInputElement;
  let documents = [];
  let activeDocumentId = null;
  let titleValue = '';
  let titleMode = 'auto';
  let searchQuery = '';
  let searchMatches = [];
  let searchIndex = -1;
  let outlineItems = [];
  let sortedDocuments = [];

  const saveStateLabels = {
    saved: 'Saved',
    saving: 'Saving...',
    error: 'Save failed',
    exported: 'Exported',
    export_error: 'Export failed',
    imported: 'Imported',
    import_error: 'Import failed'
  };
  const documentsStorageKey = 'wroDocuments';
  const activeDocumentStorageKey = 'wroActiveDocumentId';
  const legacyContentKey = 'userNote';
  const legacyMetaKey = 'userNoteMeta';
  const legacyMetaStateKey = 'userNoteMetaState';
  const legacySelectionKey = 'userNoteSelection';
  const WRO_FORMAT_VERSION = 1;
  const WRO_SCHEMA = 'wro-doc';
  const WRO_DOCUMENT_TYPE = 'html';
  const allowedImportTags = new Set([
    'P',
    'DIV',
    'BR',
    'B',
    'STRONG',
    'I',
    'EM',
    'U',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'UL',
    'OL',
    'LI',
    'SPAN'
  ]);

  $: sortedDocuments = [...documents].sort((a, b) => {
    const aTime = new Date(a.updated_at || 0).getTime();
    const bTime = new Date(b.updated_at || 0).getTime();
    return bTime - aTime;
  });

  const placeCaretAtEnd = () => {
    if (!browser || !editorElement) return;
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(editorElement);
    range.collapse(false);
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  const getNodePath = (node, root) => {
    const path = [];
    let current = node;
    while (current && current !== root) {
      const parent = current.parentNode;
      if (!parent) return null;
      const index = Array.prototype.indexOf.call(parent.childNodes, current);
      if (index < 0) return null;
      path.unshift(index);
      current = parent;
    }
    return current === root ? path : null;
  };

  const getNodeFromPath = (root, path) => {
    let current = root;
    for (const index of path) {
      if (!current || !current.childNodes || index < 0 || index >= current.childNodes.length) {
        return null;
      }
      current = current.childNodes[index];
    }
    return current;
  };

  const getSafeOffset = (node, offset) => {
    const safeOffset = Number.isFinite(offset) ? offset : 0;
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.nodeValue ? node.nodeValue.length : 0;
      return Math.max(0, Math.min(safeOffset, length));
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const length = node.childNodes ? node.childNodes.length : 0;
      return Math.max(0, Math.min(safeOffset, length));
    }
    return 0;
  };

  const createSelectionSnapshot = () => {
    if (!browser || !editorElement) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    const anchorNode = selection.anchorNode;
    if (!anchorNode || !editorElement.contains(anchorNode)) return null;

    const path = getNodePath(anchorNode, editorElement);
    if (!path) return null;

    return {
      path,
      offset: selection.anchorOffset,
      nodeType: anchorNode.nodeType
    };
  };

  const saveSelectionSnapshot = () => {
    if (!browser) return;
    const snapshot = createSelectionSnapshot();
    if (!snapshot) return;

    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSelectionSnapshot) return;

    lastSelectionSnapshot = serialized;
    updateActiveDocumentSelection(snapshot);
  };

  const queueSelectionSave = () => {
    if (!browser) return;
    clearTimeout(selectionSaveTimeout);
    selectionSaveTimeout = setTimeout(saveSelectionSnapshot, 150);
  };

  const restoreSelectionSnapshot = (snapshot) => {
    if (!browser || !editorElement || !snapshot) return false;
    if (!snapshot || !Array.isArray(snapshot.path)) return false;
    const node = getNodeFromPath(editorElement, snapshot.path);
    if (!node) return false;

    const selection = window.getSelection();
    if (!selection) return false;

    const range = document.createRange();
    const offset = getSafeOffset(node, snapshot.offset);
    try {
      range.setStart(node, offset);
    } catch (error) {
      return false;
    }
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    lastSelectionSnapshot = JSON.stringify(snapshot);
    return true;
  };

  const getContentEndRect = () => {
    if (!browser || !editorElement) return null;
    const selection = window.getSelection();
    const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

    const endRange = document.createRange();
    endRange.selectNodeContents(editorElement);
    endRange.collapse(false);

    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    endRange.insertNode(marker);
    const rect = marker.getBoundingClientRect();
    marker.remove();

    if (savedRange && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }

    return rect;
  };

  const moveCaretToEndIfClickPastContent = (event) => {
    if (!browser || !editorElement || !event) return;
    if (event.currentTarget !== editorElement) return;

    const endRect = getContentEndRect();
    if (!endRect) return;

    if (event.clientY > endRect.bottom + 4) {
      placeCaretAtEnd();
    }
  };

  const getEditorHtml = () => {
    if (editorElement) return editorElement.innerHTML;
    return editorContent || '';
  };

  const getPlainTextFromHtml = (html) => {
    if (!browser) return '';
    const container = document.createElement('div');
    container.innerHTML = html;
    return container.textContent || '';
  };

  const sanitizeImportedHtml = (html) => {
    if (!browser) return '';
    const template = document.createElement('template');
    template.innerHTML = html;

    const sanitizeNode = (node) => {
      const fragment = document.createDocumentFragment();
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          fragment.appendChild(document.createTextNode(child.textContent || ''));
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }
        const tag = child.tagName.toUpperCase();
        if (!allowedImportTags.has(tag)) {
          fragment.appendChild(sanitizeNode(child));
          continue;
        }
        const cleanEl = document.createElement(tag.toLowerCase());
        if (tag === 'BR') {
          fragment.appendChild(cleanEl);
          continue;
        }
        cleanEl.appendChild(sanitizeNode(child));
        fragment.appendChild(cleanEl);
      }
      return fragment;
    };

    const sanitized = sanitizeNode(template.content);
    const container = document.createElement('div');
    container.appendChild(sanitized);
    return container.innerHTML;
  };

  const deriveTitleFromContent = (html) => {
    if (!browser) return 'Untitled';
    const sourceHtml = typeof html === 'string' ? html : editorContent;
    const sourceText = typeof html === 'string'
      ? getPlainTextFromHtml(sourceHtml)
      : (editorElement?.innerText || getPlainTextFromHtml(sourceHtml));
    const lines = sourceText.split('\n').map((line) => line.trim()).filter(Boolean);
    const title = lines[0] || 'Untitled';
    return title.slice(0, 80);
  };

  const sanitizeFileName = (name) => {
    const cleaned = name.replace(/[^A-Za-z0-9 _-]/g, '').trim();
    const normalized = cleaned.replace(/\s+/g, '_');
    return normalized.slice(0, 64);
  };

  const createDocumentId = () => {
    if (browser && window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `wro-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  };

  const isValidMeta = (meta) => {
    if (!meta || typeof meta !== 'object') return false;
    if (typeof meta.id !== 'string' || typeof meta.title !== 'string') return false;
    if (typeof meta.created_at !== 'string' || typeof meta.updated_at !== 'string') return false;
    return true;
  };

  const createDocument = (overrides = {}) => {
    const now = new Date().toISOString();
    const content = typeof overrides.content === 'string' ? overrides.content : '';
    const titleModeValue = overrides.title_mode === 'manual' ? 'manual' : 'auto';
    const titleValue = typeof overrides.title === 'string' && overrides.title.trim()
      ? overrides.title
      : (titleModeValue === 'auto' ? deriveTitleFromContent(content) : 'Untitled');

    return {
      id: typeof overrides.id === 'string' ? overrides.id : createDocumentId(),
      title: titleValue || 'Untitled',
      title_mode: titleModeValue,
      created_at: typeof overrides.created_at === 'string' ? overrides.created_at : now,
      updated_at: typeof overrides.updated_at === 'string' ? overrides.updated_at : now,
      content,
      selection: overrides.selection && Array.isArray(overrides.selection.path) ? overrides.selection : null
    };
  };

  const normalizeDocument = (doc) => {
    if (!doc || typeof doc !== 'object') return null;
    return createDocument({
      id: doc.id,
      title: doc.title,
      title_mode: doc.title_mode,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      content: doc.content,
      selection: doc.selection
    });
  };

  const parseJson = (raw) => {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  };

  const persistDocuments = () => {
    if (!browser) return;
    localStorage.setItem(documentsStorageKey, JSON.stringify(documents));
  };

  const loadDocuments = () => {
    if (!browser) return [];
    const raw = localStorage.getItem(documentsStorageKey);
    if (!raw) return [];
    const parsed = parseJson(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeDocument).filter(Boolean);
  };

  const loadLegacyDocument = () => {
    if (!browser) return null;
    const legacyContent = localStorage.getItem(legacyContentKey);
    const legacyMeta = parseJson(localStorage.getItem(legacyMetaKey));
    const legacyMetaState = parseJson(localStorage.getItem(legacyMetaStateKey));
    const legacySelection = parseJson(localStorage.getItem(legacySelectionKey));

    if (!legacyContent && !legacyMeta && !legacySelection) return null;

    return createDocument({
      id: legacyMeta?.id,
      title: legacyMeta?.title,
      title_mode: legacyMetaState?.title_mode === 'manual' ? 'manual' : 'auto',
      created_at: legacyMeta?.created_at,
      updated_at: legacyMeta?.updated_at,
      content: legacyContent || '',
      selection: legacySelection && Array.isArray(legacySelection.path) ? legacySelection : null
    });
  };

  const persistActiveDocumentId = (id) => {
    if (!browser) return;
    localStorage.setItem(activeDocumentStorageKey, id);
  };

  const getActiveDocument = () => documents.find((doc) => doc.id === activeDocumentId) || null;

  const setDocuments = (nextDocuments) => {
    documents = nextDocuments;
    persistDocuments();
  };

  const updateDocumentById = (id, updates) => {
    const index = documents.findIndex((doc) => doc.id === id);
    if (index === -1) return false;
    const updated = { ...documents[index], ...updates };
    const nextDocuments = [...documents];
    nextDocuments[index] = updated;
    setDocuments(nextDocuments);
    return true;
  };

  const updateActiveDocumentSelection = (snapshot) => {
    if (!activeDocumentId) return;
    updateDocumentById(activeDocumentId, { selection: snapshot });
  };

  const syncTitleValue = () => {
    const activeDoc = getActiveDocument();
    if (!activeDoc) {
      titleValue = '';
      titleMode = 'auto';
      return;
    }
    titleMode = activeDoc.title_mode === 'manual' ? 'manual' : 'auto';
    titleValue = activeDoc.title || (titleMode === 'auto' ? deriveTitleFromContent(activeDoc.content) : 'Untitled');
  };

  const applyActiveDocument = ({ restoreSelection = true } = {}) => {
    const activeDoc = getActiveDocument();
    if (!activeDoc) return;

    editorContent = activeDoc.content;
    if (editorElement) {
      editorElement.innerHTML = activeDoc.content;
    }

    syncTitleValue();
    updateOutline();
    updateSearchMatches();

    if (editorElement) {
      editorElement.focus();
      if (restoreSelection) {
        const restored = restoreSelectionSnapshot(activeDoc.selection);
        if (!restored) {
          placeCaretAtEnd();
        }
      }
    }
    lastSelectionSnapshot = activeDoc.selection ? JSON.stringify(activeDoc.selection) : null;
  };

  const initializeDocuments = () => {
    const storedDocuments = loadDocuments();
    if (storedDocuments.length > 0) {
      documents = storedDocuments;
    } else {
      const legacyDoc = loadLegacyDocument();
      documents = [legacyDoc || createDocument()];
      persistDocuments();
    }

    const storedActiveId = browser ? localStorage.getItem(activeDocumentStorageKey) : null;
    const hasStoredActive = storedActiveId && documents.some((doc) => doc.id === storedActiveId);
    activeDocumentId = hasStoredActive ? storedActiveId : documents[0]?.id || null;
    if (activeDocumentId) {
      persistActiveDocumentId(activeDocumentId);
    }
  };

  const setActiveDocument = (id) => {
    if (!browser || !id || id === activeDocumentId) return;
    saveNote({ refreshTitle: titleMode === 'auto', touchUpdatedAt: true });
    saveSelectionSnapshot();
    activeDocumentId = id;
    persistActiveDocumentId(id);
    applyActiveDocument({ restoreSelection: true });
    updateFormattingState();
    updateCustomCursor();
  };

  const createNewDocument = () => {
    saveNote({ refreshTitle: titleMode === 'auto', touchUpdatedAt: true });
    saveSelectionSnapshot();
    const newDoc = createDocument();
    setDocuments([newDoc, ...documents]);
    activeDocumentId = newDoc.id;
    persistActiveDocumentId(newDoc.id);
    applyActiveDocument({ restoreSelection: false });
    updateFormattingState();
    updateCustomCursor();
  };

  const duplicateDocument = (id) => {
    const source = documents.find((doc) => doc.id === id);
    if (!source) return;
    if (id === activeDocumentId) {
      saveNote({ refreshTitle: titleMode === 'auto', touchUpdatedAt: true });
      saveSelectionSnapshot();
    }
    const now = new Date().toISOString();
    const copyTitle = `${source.title || 'Untitled'} (copy)`;
    const duplicate = createDocument({
      title: copyTitle,
      title_mode: 'manual',
      created_at: now,
      updated_at: now,
      content: source.content
    });
    setDocuments([duplicate, ...documents]);
    activeDocumentId = duplicate.id;
    persistActiveDocumentId(duplicate.id);
    applyActiveDocument({ restoreSelection: false });
    updateFormattingState();
    updateCustomCursor();
  };

  const deleteDocument = (id) => {
    if (documents.length <= 1) {
      const confirmed = window.confirm('Delete the last document and clear its contents?');
      if (!confirmed) return;
      updateDocumentById(id, {
        title: 'Untitled',
        title_mode: 'auto',
        content: '',
        updated_at: new Date().toISOString(),
        selection: null
      });
      editorContent = '';
      if (editorElement) {
        editorElement.innerHTML = '';
      }
      syncTitleValue();
      placeCaretAtEnd();
      updateOutline();
      updateSearchMatches();
      updateFormattingState();
      updateCustomCursor();
      saveNote({ refreshTitle: true, touchUpdatedAt: true });
      return;
    }

    const confirmed = window.confirm('Delete this document? This cannot be undone.');
    if (!confirmed) return;
    const remaining = documents.filter((doc) => doc.id !== id);
    setDocuments(remaining);
    if (activeDocumentId === id) {
      activeDocumentId = remaining[0]?.id || null;
      if (activeDocumentId) {
        persistActiveDocumentId(activeDocumentId);
        applyActiveDocument({ restoreSelection: true });
        updateFormattingState();
        updateCustomCursor();
      }
    }
  };

  const formatDocumentDate = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const handleDocKeyDown = (event, docId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActiveDocument(docId);
    }
  };

  const buildWroDocument = () => {
    const activeDoc = getActiveDocument();
    if (!activeDoc) return null;
    return {
      format_version: WRO_FORMAT_VERSION,
      schema: WRO_SCHEMA,
      meta: {
        id: activeDoc.id,
        title: activeDoc.title,
        created_at: activeDoc.created_at,
        updated_at: activeDoc.updated_at
      },
      document: {
        type: WRO_DOCUMENT_TYPE,
        content: activeDoc.content
      }
    };
  };

  const validateWroDocument = (data) => {
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'Invalid file' };
    }
    if (data.format_version !== WRO_FORMAT_VERSION) {
      return { ok: false, error: 'Unsupported format version' };
    }
    if (data.schema !== WRO_SCHEMA) {
      return { ok: false, error: 'Unsupported schema' };
    }
    if (!data.meta || typeof data.meta !== 'object') {
      return { ok: false, error: 'Missing meta' };
    }
    if (!isValidMeta(data.meta)) {
      return { ok: false, error: 'Invalid meta fields' };
    }
    if (!data.document || typeof data.document !== 'object') {
      return { ok: false, error: 'Missing document' };
    }
    if (data.document.type !== WRO_DOCUMENT_TYPE) {
      return { ok: false, error: 'Unsupported document type' };
    }
    if (typeof data.document.content !== 'string') {
      return { ok: false, error: 'Invalid document content' };
    }
    return { ok: true };
  };

  const migrateWroDocument = (data) => {
    if (!data || typeof data !== 'object') return null;
    if (data.format_version === WRO_FORMAT_VERSION) return data;
    return null;
  };

  const exportWroDocument = () => {
    if (!browser) return;
    try {
      saveNote({ refreshTitle: titleMode === 'auto', touchUpdatedAt: true });
      const doc = buildWroDocument();
      if (!doc) {
        setTransientStatus('export_error');
        return;
      }
      const json = JSON.stringify(doc, null, 2);
      const safeTitle = sanitizeFileName(doc.meta.title);
      const fileName = `${safeTitle || 'wro-document'}.wro`;

      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setTransientStatus('exported');
    } catch (error) {
      setTransientStatus('export_error');
    }
  };

  const handleTitleInput = (event) => {
    if (!browser) return;
    const value = event.currentTarget?.value ?? '';
    const trimmed = value.trim();
    const activeDoc = getActiveDocument();
    if (!activeDoc) return;

    if (!trimmed) {
      titleMode = 'auto';
      const autoTitle = deriveTitleFromContent(editorContent);
      titleValue = autoTitle;
      updateDocumentById(activeDoc.id, {
        title: autoTitle,
        title_mode: 'auto',
        updated_at: new Date().toISOString()
      });
    } else {
      titleMode = 'manual';
      titleValue = value;
      updateDocumentById(activeDoc.id, {
        title: value,
        title_mode: 'manual',
        updated_at: new Date().toISOString()
      });
    }

    queueSave();
  };

  const getSearchableText = () => {
    if (!browser) return '';
    if (editorElement) {
      return editorElement.textContent || '';
    }
    return getPlainTextFromHtml(editorContent);
  };

  const updateSearchMatches = () => {
    const query = searchQuery.trim();
    if (!query) {
      searchMatches = [];
      searchIndex = -1;
      return;
    }
    const haystack = getSearchableText().toLowerCase();
    const needle = query.toLowerCase();
    const matches = [];
    let cursor = 0;
    while (cursor <= haystack.length) {
      const index = haystack.indexOf(needle, cursor);
      if (index === -1) break;
      matches.push({ start: index, end: index + needle.length });
      cursor = index + needle.length;
    }
    searchMatches = matches;
    if (matches.length === 0) {
      searchIndex = -1;
      return;
    }
    if (searchIndex < 0 || searchIndex >= matches.length) {
      searchIndex = 0;
    }
  };

  const findRangeForOffsets = (root, start, end) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let currentOffset = 0;
    let startNode = null;
    let endNode = null;
    let startOffset = 0;
    let endOffset = 0;

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.nodeValue || '';
      const nextOffset = currentOffset + text.length;

      if (!startNode && start >= currentOffset && start <= nextOffset) {
        startNode = node;
        startOffset = start - currentOffset;
      }

      if (startNode && end <= nextOffset) {
        endNode = node;
        endOffset = end - currentOffset;
        break;
      }

      currentOffset = nextOffset;
    }

    if (!startNode || !endNode) return null;
    const range = document.createRange();
    range.setStart(startNode, getSafeOffset(startNode, startOffset));
    range.setEnd(endNode, getSafeOffset(endNode, endOffset));
    return range;
  };

  const selectSearchMatch = (index) => {
    if (!browser || !editorElement) return;
    if (index < 0 || index >= searchMatches.length) return;
    const match = searchMatches[index];
    const range = findRangeForOffsets(editorElement, match.start, match.end);
    if (!range) return;

    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);

    const scrollTarget = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
    if (scrollTarget && scrollTarget.scrollIntoView) {
      scrollTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    updateFormattingState();
    updateCustomCursor();
  };

  const stepSearch = (direction) => {
    if (!searchMatches.length) return;
    const nextIndex = (searchIndex + direction + searchMatches.length) % searchMatches.length;
    searchIndex = nextIndex;
    selectSearchMatch(nextIndex);
  };

  const handleSearchInput = (event) => {
    searchQuery = event.currentTarget?.value ?? '';
    searchIndex = 0;
    updateSearchMatches();
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      stepSearch(event.shiftKey ? -1 : 1);
    }
    if (event.key === 'Escape') {
      searchQuery = '';
      searchMatches = [];
      searchIndex = -1;
    }
  };

  const updateOutline = () => {
    if (!browser || !editorElement) {
      outlineItems = [];
      return;
    }
    const headings = Array.from(editorElement.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    outlineItems = headings.map((heading, index) => ({
      id: `${activeDocumentId || 'doc'}-${index}`,
      level: Number(heading.tagName.slice(1)),
      text: heading.textContent?.trim() || 'Untitled',
      element: heading
    }));
  };

  const getOutlineIndent = (level) => {
    const indent = Math.max(0, level - 1) * 12;
    return `${Math.min(indent, 48)}px`;
  };

  const focusOutlineItem = (item) => {
    if (!browser || !editorElement || !item?.element) return;
    const range = document.createRange();
    range.selectNodeContents(item.element);
    range.collapse(true);
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
    item.element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    updateFormattingState();
    updateCustomCursor();
  };

  const openImportDialog = () => {
    if (!browser || !importInputElement) return;
    importInputElement.value = '';
    importInputElement.click();
  };

  const handleImportFile = async (event) => {
    if (!browser || !editorElement || !event?.currentTarget?.files) return;
    const file = event.currentTarget.files[0];
    if (!file) return;

    let parsed;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch (error) {
      setTransientStatus('import_error');
      event.currentTarget.value = '';
      return;
    }

    const migrated = migrateWroDocument(parsed);
    if (!migrated) {
      setTransientStatus('import_error');
      event.currentTarget.value = '';
      return;
    }

    const validation = validateWroDocument(migrated);
    if (!validation.ok) {
      setTransientStatus('import_error');
      event.currentTarget.value = '';
      return;
    }

    const sanitizedContent = sanitizeImportedHtml(migrated.document.content);
    const baseTitle = migrated.meta.title || deriveTitleFromContent(sanitizedContent);
    const idCollision = documents.some((doc) => doc.id === migrated.meta.id);
    const nextId = idCollision ? createDocumentId() : migrated.meta.id;
    const nextTitle = idCollision ? `${baseTitle} (imported)` : baseTitle;

    const importedDoc = createDocument({
      id: nextId,
      title: nextTitle,
      title_mode: 'manual',
      created_at: migrated.meta.created_at,
      updated_at: migrated.meta.updated_at,
      content: sanitizedContent
    });

    setDocuments([importedDoc, ...documents]);
    activeDocumentId = importedDoc.id;
    persistActiveDocumentId(importedDoc.id);
    applyActiveDocument({ restoreSelection: false });
    exitMathMode();
    placeCaretAtEnd();
    updateFormattingState();
    updateCustomCursor();
    queueSelectionSave();

    setTransientStatus('imported');
    event.currentTarget.value = '';
  };

  // --- Lifecycle Functions ---
  onMount(() => {
    if (!browser) return; 

    initializeDocuments();
    applyActiveDocument({ restoreSelection: true });
    
    updateCustomCursor(); 
    updateFormattingState(); 

    document.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('resize', updateCustomCursor);
  });

  onDestroy(() => {
    clearTimeout(saveTimeout);
    clearTimeout(selectionSaveTimeout);
    clearTimeout(statusResetTimeout);
    if (browser) {
        document.removeEventListener('selectionchange', handleSelectionChange);
        window.removeEventListener('resize', updateCustomCursor);
    }
  });

  // --- Core Editor Functions ---
  const saveNote = ({ refreshTitle = titleMode === 'auto', touchUpdatedAt = true } = {}) => {
    if (!browser) return false;
    const activeDoc = getActiveDocument();
    if (!activeDoc) return false;
    try {
      const nextTitle = refreshTitle ? deriveTitleFromContent(editorContent) : activeDoc.title;
      const contentChanged = editorContent !== activeDoc.content;
      const titleChanged = nextTitle !== activeDoc.title;
      const shouldTouchUpdatedAt = touchUpdatedAt && (contentChanged || titleChanged);
      const updatedAt = shouldTouchUpdatedAt ? new Date().toISOString() : activeDoc.updated_at;
      updateDocumentById(activeDoc.id, {
        content: editorContent,
        title: nextTitle,
        title_mode: titleMode,
        updated_at: updatedAt
      });
      if (refreshTitle && titleMode === 'auto') {
        titleValue = nextTitle;
      }
      saveState = 'saved';
      return true;
    } catch (error) {
      saveState = 'error';
      return false;
    }
  };

  const queueSave = () => {
    if (!browser) return;
    saveState = 'saving';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveNote, 300);
  };

  const setTransientStatus = (state) => {
    clearTimeout(statusResetTimeout);
    saveState = state;
    statusResetTimeout = setTimeout(() => {
      if (saveState === state) {
        saveState = 'saved';
      }
    }, 1600);
  };

  function handleEditorInput(event) { // event is the native InputEvent
    // editorContent is automatically updated by Svelte's bind:innerHTML
    queueSave();
    queueSelectionSave();
    
    updateCustomCursor(); // Update cursor position after input
    handleMathInput(event); // Process for math mode based on current input
    updateFormattingState(); // Update toolbar based on selection after input
    updateOutline();
    if (searchQuery.trim()) {
      updateSearchMatches();
    }
  }

  function handleEditorPaste(event) {
    if (!browser || !editorElement || !event || !event.clipboardData) return;
    event.preventDefault();

    const plainText = event.clipboardData.getData('text/plain') || '';
    if (!plainText) return;

    const normalizedText = plainText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    document.execCommand('insertText', false, normalizedText);

    editorContent = editorElement.innerHTML;
    queueSave();
    queueSelectionSave();
    updateFormattingState();
    updateCustomCursor();
    updateOutline();
    if (searchQuery.trim()) {
      updateSearchMatches();
    }
  }

  const getCaretCoordinates = () => {
    if (!browser) return { x: 0, y: 0 };
    const selection = window.getSelection();
    // Provide a default position if no selection or editor not focused
    if (!selection || selection.rangeCount === 0 || !editorElement || !editorElement.contains(selection.anchorNode)) {
        if (editorElement) { // Default to top-left of editor + padding
            const editorRect = editorElement.getBoundingClientRect();
            const editorStyle = getComputedStyle(editorElement);
            return { 
                x: editorRect.left + (parseInt(editorStyle.paddingLeft) || 0), 
                y: editorRect.top + (parseInt(editorStyle.paddingTop) || 0)
            };
        }
        return { x: 20, y: 20 }; // Fallback if editorElement not ready
    }

    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true); 

    const dummy = document.createElement('span');
    dummy.textContent = '\u200b'; // Zero-width space
    range.insertNode(dummy);

    const rect = dummy.getBoundingClientRect();
    const x = rect.left;
    const y = rect.top;

    if (dummy.parentNode) {
        dummy.parentNode.removeChild(dummy);
    }
    
    // Check if the editor is scrolled, to adjust y relative to viewport
    const editorScrollTop = editorElement ? editorElement.scrollTop : 0;
    return { x, y: y + editorScrollTop }; // y should be relative to document for container comparison
  };


  const updateCustomCursor = () => {
    if (!browser || !customCursorElement || !editorContainerElement || !editorElement) return;

    const coords = getCaretCoordinates(); // These are viewport-relative generally, or adjusted for scroll
    const containerRect = editorContainerElement.getBoundingClientRect(); // editor-container is the reference
    const editorStyle = getComputedStyle(editorElement);

    // Calculate position relative to the editorContainerElement
    let cursorX = coords.x - containerRect.left;
    let cursorY = coords.y - containerRect.top;

    // If getCaretCoordinates() didn't factor in editorElement.scrollTop, adjust here.
    // It appears my getCaretCoordinates attempts this, so cursorY above *should* be relative to non-scrolled content.
    // Let's adjust for scroll directly here to be sure.
    cursorY -= editorElement.scrollTop; // Adjust Y for the editor's internal scroll

    cursorY += 2; // Small offset to align better visually, depends on font/line-height

    const cursorActualHeight = customCursorElement.offsetHeight || (parseFloat(editorStyle.fontSize) * 1.2); // Use actual height or an estimate
    const cursorActualWidth = customCursorElement.offsetWidth || 2;
    
    const clampedX = Math.max(0, Math.min(cursorX, editorElement.clientWidth - cursorActualWidth)); 
    const clampedY = Math.max(0, Math.min(cursorY, editorElement.clientHeight - cursorActualHeight));

    customCursorElement.style.left = `${clampedX}px`;
    customCursorElement.style.top = `${clampedY}px`;
    // Height is set by CSS: #custom-cursor { height: 1.2em; }
    // If dynamic height is preferred based on actual line:
    // const currentLineHeight = parseFloat(editorStyle.lineHeight) || (parseFloat(editorStyle.fontSize) * 1.6);
    // customCursorElement.style.height = `${currentLineHeight}px`;
  };


  // --- Math Input Handling ---
  const handleMathInput = (event) => { // event is native InputEvent
    if (!browser || !event || !event.inputType) return;

    const inputType = event.inputType;
    const data = event.data;

    if (mathMode) { // If already in math mode
        if (inputType === 'deleteContentBackward') {
            // Current line (which includes the equation prefix and '=')
            // Get content up to cursor to check if '=' was just deleted
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) { exitMathMode(); return; }
            const range = selection.getRangeAt(0);
            const textBeforeCursor = range.startContainer.nodeValue?.substring(0, range.startOffset) || "";

            // This needs robust getCurrentLine to know the expression context
            const lineContext = getCurrentLine(); 
            if (lineContext.includes("=")) {
                 const parts = lineContext.split("=");
                 currentEquation = parts[0].trim(); // Expression before "="
                 if(currentEquation) {
                    processEquation();
                 } else {
                    hideAutoComplete(); // Equation part became empty
                 }
            } else {
                // '=' character likely deleted or cursor moved away from expression context
                exitMathMode();
            }

        } else if (inputType.startsWith('insert')) { // e.g. insertText, insertLineBreak, insertParagraph
            // Any insertion after '=' implies user is moving on, not using the result.
            // Tab and Escape for insertion/exit are handled in on:keydown
            exitMathMode();
        }
        // Other types: insertFromPaste, formatBold, etc. also exit.
        // else if (!inputType.startsWith("history")) { // Don't exit on undo/redo perhaps
        //    exitMathMode();
        // }
    } else { // Math mode is NOT active, check if this input should activate it
        if (inputType === 'insertText' && data === '=') {
            const lineTextBeforeEquals = getCurrentLine().slice(0, -1); // Get current line content *excluding* the just-typed '='
            
            if (lineTextBeforeEquals && lineTextBeforeEquals.trim() !== "") {
                currentEquation = lineTextBeforeEquals.trim();
                mathMode = true;
                processEquation();
            }
            // If line before '=' is empty, do nothing (e.g. user types '=' on an empty line)
        }
    }
  };
  
  const exitMathMode = () => {
    if (mathMode) { // Only change state if actually in math mode
        mathMode = false;
        currentEquation = ''; 
        hideAutoComplete();
    }
  };

  const processEquation = () => {
    if (!browser) return;
    if (currentEquation && mathMode) { 
      try {
        const result = math.evaluate(currentEquation);
        if (result !== undefined && result !== null && typeof result.toString === 'function') {
          showAutoComplete(result.toString());
        } else {
          hideAutoComplete();
        }
      } catch (error) {
        hideAutoComplete();
      }
    } else {
      hideAutoComplete(); // Also hide if not in mathMode or no currentEquation
    }
  };

  const getCurrentLine = () => {
    if (!browser) return '';
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return '';

    const range = selection.getRangeAt(0);
    let node = range.startContainer;
    
    // Simplified: work within the current text node primarily
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
      const textUpToCursorInNode = node.nodeValue.substring(0, range.startOffset);
      // For current line, usually we want text from line start up to cursor
      const linePartBefore = textUpToCursorInNode.split('\n').pop() || "";
      // To get full line:
      // const textFromCursorInNode = node.nodeValue.substring(range.startOffset);
      // const linePartAfter = textFromCursorInNode.split('\n')[0] || "";
      // return linePartBefore + linePartAfter;
      return linePartBefore; // For math, we usually care about what's *before* the cursor on this line segment
    }
    
    // Fallback: If cursor is not in a text node, or complex structure
    // Try to get text of parent block, but this is less precise for "current line up to cursor"
    let blockParent = node;
    while (blockParent && blockParent !== editorElement && blockParent.nodeType !== Node.ELEMENT_NODE) {
        if (!blockParent.parentNode) return '';
        blockParent = blockParent.parentNode;
    }
    if (blockParent && blockParent !== editorElement && blockParent.textContent) {
        return blockParent.textContent.trim(); // Less precise
    }
    if (node.textContent) {
        return node.textContent.substring(0, range.startOffset).split('\n').pop() || "";
    }
    return '';
  };


  const showAutoComplete = (result) => {
    if (!browser || !autoCompleteElement || !editorContainerElement || !editorElement) return;
    
    // Use existing getCaretCoordinates for base position.
    const coords = getCaretCoordinates(); // Viewport-relative
    const containerRect = editorContainerElement.getBoundingClientRect();
    const editorStyle = getComputedStyle(editorElement);
    const editorFontSize = parseInt(editorStyle.fontSize) || 16;
    // const editorLineHeight = parseFloat(editorStyle.lineHeight) || (editorFontSize * 1.6);


    // Position relative to editorContainer, account for editor's own scroll
    let acX = coords.x - containerRect.left;
    let acY = coords.y - containerRect.top - editorElement.scrollTop + (editorFontSize * 1.2); // Approx one line below caret
    // Use editor line height instead of editorFontSize * 1.2 if available and parsed
    // acY = coords.y - containerRect.top - editorElement.scrollTop + editorLineHeight;


    autoCompleteElement.textContent = result;
    autoCompleteElement.style.display = 'block';
    autoCompleteElement.style.left = `${acX}px`;
    autoCompleteElement.style.top = `${acY}px`;

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const currentRange = selection.getRangeAt(0);
      lastCursorPosition = { node: currentRange.startContainer, offset: currentRange.startOffset };
    }
  };

  const hideAutoComplete = () => {
    if (browser && autoCompleteElement) {
      autoCompleteElement.style.display = 'none';
    }
  };

  const insertAutoComplete = () => {
    if (!browser || !autoCompleteElement || autoCompleteElement.style.display === 'none' || !editorElement) return;

    const resultText = autoCompleteElement.textContent;
    if (!resultText) {
        exitMathMode();
        editorElement.focus();
        return;
    }
    
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount > 0) {
        exitMathMode();
        editorElement.focus();
        return;
    }
    
    const range = selection.getRangeAt(0);
    // Assumes cursor is right after '=', e.g., "2+2=" <-- cursor here
    // We want to insert the result, effectively replacing nothing or any tiny selection.
    // The current currentEquation (e.g. "2+2") remains, then the result is appended.
    // Then the original '=' might need to be removed if it's still there after cursor.

    // A simple approach: delete the characters making up the equation *after* the equals.
    // Since math mode triggered on '=', currentEquation is the LHS.
    // We assume user typed "LHS=" then Tab.
    // Range is at: LHS=X (X is caret position). currentEquation = LHS
    // Insert `resultText`.

    if (range.startContainer.nodeType === Node.TEXT_NODE && range.startContainer.nodeValue) {
        const textNode = range.startContainer;
        const offset = range.startOffset;
        // Check if the character immediately before the cursor is '='
        if (offset > 0 && textNode.nodeValue.substring(offset - 1, offset) === '=') {
            // Correct. We are just after an equals sign. Insert result.
        } else {
            // Not directly after an equals, maybe cursor moved or structure is complex.
            // Attempting to insert at current cursor position is a fallback.
        }
    } // else, if not a text node, insertion might be more complex. For now, assume common case.


    range.deleteContents(); // Deletes selection. If caret is collapsed, deletes nothing.
    const resultNode = document.createTextNode(resultText);
    range.insertNode(resultNode);
    
    // Move cursor after the inserted text
    range.setStartAfter(resultNode);
    range.setEndAfter(resultNode);
    selection.removeAllRanges();
    selection.addRange(range);

    animateInsertion(resultNode);
    editorContent = editorElement.innerHTML; // Sync Svelte state with DOM
    saveNote(); 

    exitMathMode(); 
    editorElement.focus(); 
    updateCustomCursor();
  };
  
  const animateInsertion = (node) => {
    if (!browser || !node || node.nodeType !== Node.TEXT_NODE || !node.parentNode) {
      return;
    }
    const animationSpan = document.createElement('span');
    node.parentNode.insertBefore(animationSpan, node);
    animationSpan.appendChild(node);

    animationSpan.style.display = 'inline-block'; 
    animationSpan.style.opacity = '0';
    animationSpan.style.transform = 'translateY(10px)'; 
    animationSpan.style.transition = 'opacity 0.1s ease-out, transform 0.1s ease-out';
    
    requestAnimationFrame(() => { 
        animationSpan.style.opacity = '1';
        animationSpan.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      if (animationSpan.parentNode && animationSpan.firstChild === node) {
        animationSpan.parentNode.insertBefore(node, animationSpan);
        animationSpan.remove();
      } else if (animationSpan.parentNode) { // Safety if node somehow detached
        animationSpan.remove();
      }
    }, 110); // Slightly longer than transition (100ms)
  };


  const hasCursorMoved = () => {
    if (!browser) return true; 
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return true; 

    const range = selection.getRangeAt(0);
    const moved = (
      range.startContainer !== lastCursorPosition.node ||
      range.startOffset !== lastCursorPosition.offset
    );
    // Update lastCursorPosition for the next check
    if (moved) {
      lastCursorPosition = { node: range.startContainer, offset: range.startOffset };
    }
    return moved;
  };

  function handleSelectionChange() {
    if (!browser) return;
    // Using setTimeout 0 to allow browser to finish selection update before we react
    setTimeout(() => { 
      updateCustomCursor();
      // If autocomplete is visible and cursor moved significantly, maybe hide it or exit math mode
      if (autoCompleteElement && autoCompleteElement.style.display !== 'none' && hasCursorMoved()) {
          // Check if selection is still conducive to math mode or if user clicked far away
          // Consider: if selection is no longer collapsed, or far from math context.
          // exitMathMode(); // This can be aggressive; better to let input/keydown handle exit.
      }
      updateFormattingState();
      queueSelectionSave();
    }, 0);
  }

  const execCommandAndUpdate = (command, value = null) => {
    if (!browser || !editorElement) return;
    document.execCommand(command, false, value);
    editorContent = editorElement.innerHTML; // Sync Svelte state
    updateFormattingState();
    updateOutline();
    if (searchQuery.trim()) {
      updateSearchMatches();
    }
    queueSelectionSave();
    saveState = 'saving';
    saveNote(); // Also save on formatting changes
    editorElement.focus(); // Keep focus in editor
  };

  const toggleFormat = (command) => {
    execCommandAndUpdate(command);
  };

  const toggleHeading = () => {
    if (!browser || !window.getSelection) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    let commonAncestor = selection.getRangeAt(0).commonAncestorContainer;
    if (commonAncestor.nodeType === Node.TEXT_NODE) {
        commonAncestor = commonAncestor.parentElement;
    }
    
    let isCurrentlyHeading = false;
    let currentBlock = commonAncestor;
    while(currentBlock && currentBlock !== editorElement) {
        if (currentBlock.tagName && currentBlock.tagName.match(/^H[1-6]$/)) {
            isCurrentlyHeading = true;
            break;
        }
        if (!currentBlock.parentElement) break;
        currentBlock = currentBlock.parentElement;
    }

    execCommandAndUpdate('formatBlock', isCurrentlyHeading ? 'p' : 'h2');
  };

  const toggleList = () => {
    execCommandAndUpdate('insertUnorderedList');
  };

  const updateFormattingState = () => {
    if (!browser || typeof document.queryCommandState === 'undefined' || !window.getSelection || !editorElement) return; 

    isBoldActive = document.queryCommandState('bold');
    isItalicActive = document.queryCommandState('italic');
    isUnderlineActive = document.queryCommandState('underline');

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.anchorNode) {
      isHeadingActive = false;
      isListActive = false;
      return;
    }
    
    let parentNode = selection.anchorNode;
    if (parentNode.nodeType === Node.TEXT_NODE) {
        parentNode = parentNode.parentElement;
    }

    isHeadingActive = false;
    let tempElement = parentNode;
    while(tempElement && tempElement !== editorElement && tempElement !== document.body) { 
        if (tempElement.tagName && tempElement.tagName.match(/^H[1-6]$/)) {
            isHeadingActive = true;
            break;
        }
        if (!tempElement.parentElement) break; 
        tempElement = tempElement.parentElement;
    }
    
    isListActive = document.queryCommandState('insertUnorderedList') || document.queryCommandState('insertOrderedList');
    if (!isListActive && parentNode && parentNode.closest) { // Fallback
        isListActive = !!(parentNode.closest('ul') || parentNode.closest('ol'));
    }
  };

  function handleEditorKeyDown(event) {
    if (!browser) return;

    if (mathMode) { // Math mode takes priority for these keys
        if (event.key === 'Tab') {
            event.preventDefault();
            insertAutoComplete();
            return; 
        } else if (event.key === 'Escape') {
            event.preventDefault();
            exitMathMode();
            return; 
        }
        // Let other keys fall through to on:input, which will then exit mathMode
    }

    // General shortcuts
    if (event.ctrlKey || event.metaKey) {
      switch (event.key.toLowerCase()) {
        case 'b':
          event.preventDefault();
          toggleFormat('bold');
          break;
        case 'i':
          event.preventDefault();
          toggleFormat('italic');
          break;
        case 'u':
          event.preventDefault();
          toggleFormat('underline');
          break;
      }
    }
    // For line breaks (Enter, Shift+Enter), default browser behavior should handle it.
    // Svelte's bind:innerHTML and on:input will pick up the changes.
  }

  function handleEditorClick(event) {
    if (!browser) return;
    // If user clicks and autocomplete was visible, check if it makes sense to exit math mode.
    // HasCursorMoved is useful here.
    if (autoCompleteElement && autoCompleteElement.style.display !== 'none') {
        if (hasCursorMoved()) { // If click actually moved the cursor
             // Potentially exit math mode, but be cautious not to be too aggressive.
             // Often handled better by subsequent input or keydown.
        }
    }
    moveCaretToEndIfClickPastContent(event);
    updateFormattingState(); 
    queueSelectionSave();
    updateCustomCursor(); // Ensure cursor updates on click too.
  }

</script>

<div class="workspace">
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-title">Documents</div>
      <button
        class="sidebar-button"
        type="button"
        title="New document"
        aria-label="New document"
        on:click={createNewDocument}
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
      </button>
    </div>
    <div class="doc-list">
      {#each sortedDocuments as doc (doc.id)}
        <div
          class="doc-item"
          class:active={doc.id === activeDocumentId}
          role="button"
          tabindex="0"
          on:click={() => setActiveDocument(doc.id)}
          on:keydown={(event) => handleDocKeyDown(event, doc.id)}
          aria-label={`Open ${doc.title || 'Untitled'}`}
        >
          <div class="doc-title">{doc.title || 'Untitled'}</div>
          <div class="doc-meta">
            <span>{formatDocumentDate(doc.updated_at)}</span>
          </div>
          <div class="doc-actions">
            <button
              class="doc-action"
              type="button"
              title="Duplicate document"
              aria-label="Duplicate document"
              on:click|stopPropagation={() => duplicateDocument(doc.id)}
            >
              <i class="fas fa-clone" aria-hidden="true"></i>
            </button>
            <button
              class="doc-action"
              type="button"
              title="Delete document"
              aria-label="Delete document"
              on:click|stopPropagation={() => deleteDocument(doc.id)}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      {/each}
    </div>
    <div class="outline-panel">
      <div class="outline-header">Outline</div>
      {#if outlineItems.length}
        <div class="outline-list">
          {#each outlineItems as item (item.id)}
            <button
              class="outline-item"
              style={`padding-left: ${getOutlineIndent(item.level)}`}
              title={`Jump to ${item.text}`}
              on:click={() => focusOutlineItem(item)}
            >
              <span class="outline-level">H{item.level}</span>
              <span class="outline-text">{item.text}</span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="outline-empty">No headings yet</div>
      {/if}
    </div>
  </aside>

  <div class="editor-shell">
    <div id="toolbar">
      <button 
        class="toolbar-button" 
        class:active={isBoldActive} 
        title="Bold (Ctrl+B)" 
        aria-label="Bold" 
        on:click={() => toggleFormat('bold')}>
        <i class="fas fa-bold" aria-hidden="true"></i>
      </button>
      <button 
        class="toolbar-button" 
        class:active={isItalicActive} 
        title="Italic (Ctrl+I)" 
        aria-label="Italic" 
        on:click={() => toggleFormat('italic')}>
        <i class="fas fa-italic" aria-hidden="true"></i>
      </button>
      <button 
        class="toolbar-button" 
        class:active={isUnderlineActive} 
        title="Underline (Ctrl+U)" 
        aria-label="Underline" 
        on:click={() => toggleFormat('underline')}>
        <i class="fas fa-underline" aria-hidden="true"></i>
      </button>
      <button 
        class="toolbar-button" 
        class:active={isHeadingActive} 
        title="Toggle Heading" 
        aria-label="Toggle Heading" 
        on:click={toggleHeading}>
        <i class="fas fa-heading" aria-hidden="true"></i>
      </button>
      <button 
        class="toolbar-button" 
        class:active={isListActive} 
        title="Bullet List" 
        aria-label="Toggle Bullet List" 
        on:click={toggleList}>
        <i class="fas fa-list-ul" aria-hidden="true"></i>
      </button>
      <input
        id="document-title"
        class="title-input"
        type="text"
        maxlength="80"
        placeholder="Untitled"
        aria-label="Document title"
        bind:value={titleValue}
        on:input={handleTitleInput}
      />
      <div class="search-group">
        <input
          class="search-input"
          type="search"
          placeholder="Search"
          aria-label="Search in document"
          bind:value={searchQuery}
          on:input={handleSearchInput}
          on:keydown={handleSearchKeyDown}
        />
        <div class="search-buttons">
          <button
            class="search-button"
            type="button"
            title="Previous match"
            aria-label="Previous match"
            on:click={() => stepSearch(-1)}
            disabled={!searchMatches.length}
          >
            <i class="fas fa-chevron-up" aria-hidden="true"></i>
          </button>
          <button
            class="search-button"
            type="button"
            title="Next match"
            aria-label="Next match"
            on:click={() => stepSearch(1)}
            disabled={!searchMatches.length}
          >
            <i class="fas fa-chevron-down" aria-hidden="true"></i>
          </button>
        </div>
        <div class="search-count">
          {searchMatches.length ? `${searchIndex + 1}/${searchMatches.length}` : '0'}
        </div>
      </div>
      <button
        class="toolbar-button"
        title="Import .wro"
        aria-label="Import .wro"
        on:click={openImportDialog}
      >
        <i class="fas fa-file-import" aria-hidden="true"></i>
      </button>
      <button
        class="toolbar-button"
        title="Export .wro"
        aria-label="Export .wro"
        on:click={exportWroDocument}
      >
        <i class="fas fa-file-export" aria-hidden="true"></i>
      </button>
      <input
        class="import-input"
        type="file"
        accept=".wro,application/json"
        bind:this={importInputElement}
        on:change={handleImportFile}
      />
      <div
        id="save-indicator"
        data-state={saveState}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {saveStateLabels[saveState] ?? 'Saved'}
      </div>
    </div>

    <div id="editor-container" bind:this={editorContainerElement}>
      <div 
        id="editor" 
        contenteditable="true" 
        spellcheck="false"
        role="textbox"
        tabindex="0"
        aria-multiline="true"
        aria-label="Note editor"
        bind:this={editorElement}
        bind:innerHTML={editorContent}
        on:input={handleEditorInput}
        on:keydown={handleEditorKeyDown}
        on:paste={handleEditorPaste}
        on:click={handleEditorClick}
      >
      </div>
      <div id="custom-cursor" bind:this={customCursorElement} aria-hidden="true"></div>
      <div id="auto-complete" bind:this={autoCompleteElement} role="tooltip" aria-live="polite"></div>
    </div>
  </div>
</div>

<style>
  @font-face {
    font-family: "Poly Sans";
    src: url('/fonts/PolySansNeutral.ttf') format('truetype');
  }
  @font-face {
    font-family: "Poly Sans Bulky";
    src: url('/fonts/PolySansBulky.ttf') format('truetype');
  }
  @font-face {
    font-family: "Poly Sans Slim";
    src: url('/fonts/PolySansSlim.ttf') format('truetype');
  }

  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(html),
  :global(body) {
    height: 100%;
    font-family: "Poly Sans Slim", Arial, sans-serif;
    background-color: #f9f9f9;
  }
  
  :global(body > div:first-child) { /* SvelteKit wrapper div */
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  :global(b), :global(strong) {
    font-family: "Poly Sans Bulky", Arial, sans-serif;
    font-weight: bold; 
  }
  :global(i), :global(em) {
    font-style: italic; 
  }
  :global(u) {
    text-decoration: underline;
  }
  :global(h1), :global(h2), :global(h3), :global(h4), :global(h5), :global(h6) {
    font-family: "Poly Sans", Arial, sans-serif;
    margin-top: 0.8em;
    margin-bottom: 0.4em;
    line-height: 1.3;
  }
  :global(ul), :global(ol) {
    padding-left: 25px; 
    margin-top: 0.5em;
    margin-bottom: 0.5em;
    list-style-position: outside; 
  }
  :global(p) {
    margin-bottom: 0.5em; /* Ensure paragraphs created by formatBlock have some spacing */
  }

  .workspace {
    display: flex;
    height: 100%;
    min-height: 0;
    flex: 1;
  }

  .sidebar {
    width: 260px;
    background-color: #f4f5f7;
    border-right: 1px solid #ddd;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 12px 8px;
  }

  .sidebar-title {
    font-size: 0.75em;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #5b5f6a;
    font-weight: 600;
  }

  .sidebar-button {
    background: #fff;
    border: 1px solid #d7d7d7;
    border-radius: 8px;
    padding: 6px 8px;
    cursor: pointer;
    color: #2b2b2b;
    transition: background-color 0.2s ease, border-color 0.2s ease;
  }

  .sidebar-button:hover {
    background-color: #eef2ff;
    border-color: #c8d8ff;
  }

  .doc-list {
    padding: 6px 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    flex: 1;
  }

  .doc-item {
    position: relative;
    background-color: #fff;
    border: 1px solid #e2e2e2;
    border-radius: 12px;
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
  }

  .doc-item:hover {
    border-color: #c6d6ff;
    transform: translateY(-1px);
  }

  .doc-item.active {
    border-color: #8fb3ff;
    box-shadow: 0 0 0 2px rgba(143, 179, 255, 0.35);
  }

  .doc-item:focus {
    outline: 2px solid #8fb3ff;
    outline-offset: 2px;
  }

  .doc-title {
    font-size: 0.95em;
    font-weight: 600;
    color: #1b1b1b;
    margin-bottom: 6px;
  }

  .doc-meta {
    font-size: 0.75em;
    color: #6d7078;
  }

  .doc-actions {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .doc-item:hover .doc-actions {
    opacity: 1;
  }

  .doc-action {
    background: #f2f2f2;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 4px 6px;
    font-size: 0.8em;
    cursor: pointer;
    color: #4a4a4a;
  }

  .doc-action:hover {
    background-color: #e8e8e8;
  }

  .outline-panel {
    border-top: 1px solid #e1e1e1;
    padding: 10px 12px 14px;
  }

  .outline-header {
    font-size: 0.72em;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: #6d7078;
    margin-bottom: 8px;
    font-weight: 600;
  }

  .outline-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 220px;
    overflow-y: auto;
  }

  .outline-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 8px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    color: #2b2b2b;
    font-size: 0.85em;
  }

  .outline-item:hover {
    background-color: #e9edf4;
  }

  .outline-level {
    font-size: 0.7em;
    color: #6b6f77;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    min-width: 26px;
  }

  .outline-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .outline-empty {
    font-size: 0.8em;
    color: #7c8089;
    padding: 4px 6px;
  }

  .editor-shell {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  #toolbar {
    display: flex;
    align-items: center;
    padding: 8px 10px;
    background-color: #f1f1f1;
    border-bottom: 1px solid #ddd;
    flex-shrink: 0; 
    gap: 6px;
    flex-wrap: wrap;
  }

  .toolbar-button {
    background: none;
    border: 1px solid transparent; 
    font-size: 1.1em; 
    cursor: pointer;
    padding: 6px 8px;
    margin: 0;
    border-radius: 4px;
    transition: background-color 0.2s, border-color 0.2s;
    color: #333;
  }
  .toolbar-button i { 
    font-style: normal; 
    display: inline-block;
    width: 1.2em; 
    text-align: center;
  }

  .toolbar-button:hover {
    background-color: #e0e0e0;
    border-color: #ccc;
  }

  .toolbar-button.active {
    background-color: #d0d0d0;
    border-color: #bbb;
    color: #000;
  }

  #save-indicator {
    margin-left: auto;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 0.85em;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    min-width: 120px;
    text-align: center;
    background-color: #e8efe9;
    color: #1e5b37;
  }

  #save-indicator[data-state='saving'] {
    background-color: #fff2c2;
    color: #6a5200;
  }

  #save-indicator[data-state='error'] {
    background-color: #f8d7da;
    color: #6a1a21;
  }

  #save-indicator[data-state='exported'],
  #save-indicator[data-state='imported'] {
    background-color: #e3ecff;
    color: #1f3a6d;
  }

  #save-indicator[data-state='export_error'],
  #save-indicator[data-state='import_error'] {
    background-color: #f8d7da;
    color: #6a1a21;
  }

  .import-input {
    display: none;
  }

  .title-input {
    flex: 1 1 220px;
    min-width: 160px;
    max-width: 320px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid #d5d5d5;
    background-color: #fff;
    font-size: 0.95em;
    color: #222;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .title-input:focus {
    outline: none;
    border-color: #8fb3ff;
    box-shadow: 0 0 0 2px rgba(143, 179, 255, 0.35);
  }

  .search-group {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid #d5d5d5;
    background-color: #fff;
  }

  .search-input {
    border: none;
    outline: none;
    font-size: 0.9em;
    min-width: 120px;
    max-width: 180px;
    background: transparent;
  }

  .search-buttons {
    display: flex;
    gap: 4px;
  }

  .search-button {
    border: 1px solid #e1e1e1;
    background: #f6f6f6;
    border-radius: 6px;
    padding: 4px 6px;
    cursor: pointer;
    color: #4a4a4a;
  }

  .search-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .search-count {
    font-size: 0.8em;
    color: #6a6d75;
    min-width: 36px;
    text-align: right;
  }

  #editor-container {
    position: relative;
    width: 100%;
    flex-grow: 1; 
    overflow: hidden; 
    display: flex; 
    min-height: 0;
  }

  #editor {
    width: 100%;
    height: 100%;
    padding: 20px;
    outline: none;
    resize: none;
    font-size: 1.2em; 
    line-height: 1.6; 
    letter-spacing: 0.03em;
    white-space: pre-wrap; /* This is crucial for line breaks */
    overflow-y: auto; 
    caret-color: transparent; 
    -webkit-tap-highlight-color: transparent;
  }
  :global(#editor p) {
    margin-bottom: 0.75em; 
  }
  :global(#editor ul), :global(#editor ol) {
     padding-left: 30px; 
     margin-bottom: 0.75em;
  }
   :global(#editor li) {
     padding-left: 5px;
     margin-bottom: 0.25em;
  }


  #auto-complete {
    position: absolute;
    background-color: #fff;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 6px 8px;
    font-size: 1em;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
    display: none;
    z-index: 20; 
    color: #2c3e50;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(#editor::selection) {
    background: rgba(100, 149, 237, 0.4); 
  }

  #custom-cursor {
    position: absolute;
    width: 2px;
    background-color: black;
    pointer-events: none;
    z-index: 10;
    user-select: none; 
    -webkit-user-select: none; 
    transition: top 0.05s ease-out, left 0.05s ease-out; /* Restored for smoothness */
    height: 1.2em; /* Rely on CSS for height, relative to editor's font-size if inherited */
  }

  @media (max-width: 900px) {
    .workspace {
      flex-direction: column;
    }

    .sidebar {
      width: 100%;
      max-height: 240px;
    }

    .doc-list {
      max-height: 160px;
    }

    .outline-panel {
      display: none;
    }

    .doc-actions {
      opacity: 1;
    }

    .title-input {
      max-width: none;
      flex: 1 1 100%;
    }

    .search-group {
      width: 100%;
      justify-content: space-between;
    }
  }
</style>

<script>
  // Solution for "document is not defined": Disable SSR for this page
  export const ssr = false; 

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

  // --- Lifecycle Functions ---
  onMount(() => {
    if (!browser) return; 

    const savedNote = localStorage.getItem('userNote');
    if (savedNote) {
      editorContent = savedNote; 
      if (editorElement) {
        editorElement.innerHTML = savedNote; 
        
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(editorElement);
        range.collapse(false); 
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
        }
      }
    }
    
    updateCustomCursor(); 
    updateFormattingState(); 

    document.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('resize', updateCustomCursor);
    
    if (editorElement) { // Always focus editor on mount if element exists
        editorElement.focus();
    }
  });

  onDestroy(() => {
    clearTimeout(saveTimeout);
    if (browser) {
        document.removeEventListener('selectionchange', handleSelectionChange);
        window.removeEventListener('resize', updateCustomCursor);
    }
  });

  // --- Core Editor Functions ---
  const saveNote = () => {
    if (browser) {
        localStorage.setItem('userNote', editorContent);
    }
  };

  function handleEditorInput(event) { // event is the native InputEvent
    // editorContent is automatically updated by Svelte's bind:innerHTML
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveNote, 300);
    
    updateCustomCursor(); // Update cursor position after input
    handleMathInput(event); // Process for math mode based on current input
    updateFormattingState(); // Update toolbar based on selection after input
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
    }, 0);
  }

  const execCommandAndUpdate = (command, value = null) => {
    if (!browser || !editorElement) return;
    document.execCommand(command, false, value);
    editorContent = editorElement.innerHTML; // Sync Svelte state
    updateFormattingState();
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

  function handleEditorClick() {
    if (!browser) return;
    // If user clicks and autocomplete was visible, check if it makes sense to exit math mode.
    // HasCursorMoved is useful here.
    if (autoCompleteElement && autoCompleteElement.style.display !== 'none') {
        if (hasCursorMoved()) { // If click actually moved the cursor
             // Potentially exit math mode, but be cautious not to be too aggressive.
             // Often handled better by subsequent input or keydown.
        }
    }
    updateFormattingState(); 
    updateCustomCursor(); // Ensure cursor updates on click too.
  }

</script>

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
</div>

<div id="editor-container" bind:this={editorContainerElement}>
  <div 
    id="editor" 
    contenteditable="true" 
    spellcheck="false"
    role="textbox"
    aria-multiline="true"
    aria-label="Note editor"
    bind:this={editorElement}
    bind:innerHTML={editorContent}
    on:input={handleEditorInput}
    on:keydown={handleEditorKeyDown}
    on:click={handleEditorClick}
  >
  </div>
  <div id="custom-cursor" bind:this={customCursorElement} aria-hidden="true"></div>
  <div id="auto-complete" bind:this={autoCompleteElement} role="tooltip" aria-live="polite"></div>
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


  #toolbar {
    display: flex;
    align-items: center;
    padding: 8px 10px;
    background-color: #f1f1f1;
    border-bottom: 1px solid #ddd;
    flex-shrink: 0; 
    gap: 5px;
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

  #editor-container {
    position: relative;
    width: 100%;
    flex-grow: 1; 
    overflow: hidden; 
    display: flex; 
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
</style>
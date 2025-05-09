<script>
  // Solution for "document is not defined": Disable SSR for this page
  export const ssr = false; 

  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment'; // Useful for conditional client-side logic if not disabling SSR
  import * as math from 'mathjs';

  // --- State Variables ---
  let editorElement; 
  let customCursorElement; 
  let autoCompleteElement; 
  let editorContainerElement;

  let editorContent = ''; 

  let saveTimeout;
  let lastCursorPosition = { node: null, offset: 0 };
  let mathMode = false;
  let currentEquation = '';

  let isBoldActive = false;
  let isItalicActive = false;
  let isUnderlineActive = false;
  let isHeadingActive = false;
  let isListActive = false;

  // --- Lifecycle Functions ---
  onMount(() => {
    // All code here runs only in the browser
    const savedNote = localStorage.getItem('userNote');
    if (savedNote) {
      editorContent = savedNote; 
      if (editorElement) editorElement.innerHTML = savedNote; // Ensure editor reflects loaded content
    }
    
    // Initial updates require DOM to be ready
    updateCustomCursor(); 
    updateFormattingState(); 

    document.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('resize', updateCustomCursor);
    
    if (editorElement) {
        editorElement.focus();
    }
  });

  onDestroy(() => {
    clearTimeout(saveTimeout);
    // Ensure to remove listeners only if they were added (i.e., in browser)
    if (browser) {
        document.removeEventListener('selectionchange', handleSelectionChange);
        window.removeEventListener('resize', updateCustomCursor);
    }
  });

  // --- Core Editor Functions ---
  const saveNote = () => {
    // localStorage is browser-only
    if (browser) {
        localStorage.setItem('userNote', editorContent);
    }
  };

  function handleEditorInput(event) {
    // editorContent is automatically updated by Svelte's bind:innerHTML
    // However, if you manipulate innerHTML directly, ensure editorContent is synced if needed
    // For contenteditable with bind:innerHTML, Svelte handles the sync from DOM to variable.
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveNote, 300);
    updateCustomCursor();
    handleMathInput(event.nativeEvent || event); // Pass the native event if available
    updateFormattingState(); 
  }

  const getCaretCoordinates = () => {
    if (!browser) return { x: 0, y: 0 }; // Should not be called on server with ssr=false
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return { x: 20, y: 20 }; 

    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true); 

    const dummy = document.createElement('span');
    dummy.textContent = '\u200b'; 
    range.insertNode(dummy);

    const rect = dummy.getBoundingClientRect();
    const x = rect.left;
    const y = rect.top;

    if (dummy.parentNode) { // Check if dummy is still in DOM
        dummy.parentNode.removeChild(dummy);
    }
    
    return { x, y };
  };

  const updateCustomCursor = () => {
    if (!browser || !customCursorElement || !editorContainerElement || !editorElement) return;

    const { x, y } = getCaretCoordinates();
    const containerRect = editorContainerElement.getBoundingClientRect();

    const cursorX = x - containerRect.left;
    let cursorY = y - containerRect.top;
    cursorY += 2; 

    const editorStyle = getComputedStyle(editorElement);
    const editorFontSize = parseInt(editorStyle.fontSize) || 16; 
    
    const clampedX = Math.max(0, Math.min(cursorX, editorElement.clientWidth - 2)); 
    const clampedY = Math.max(0, Math.min(cursorY, editorElement.clientHeight - editorFontSize));

    customCursorElement.style.left = `${clampedX}px`;
    customCursorElement.style.top = `${clampedY}px`;
  };

  // --- Math Input Handling ---
  const handleMathInput = (event) => {
    if (!browser || !event || !event.inputType) return;

    if (event.inputType === 'insertText' && event.data === '=') {
      mathMode = true;
      const currentLineText = getCurrentLine();
      // Ensure currentLineText is not null or undefined before splitting
      currentEquation = currentLineText ? currentLineText.split('=')[0].trim() : "";
      processEquation();
    } else if (mathMode) {
      const line = getCurrentLine();
      if (event.inputType === 'insertText' && event.data !== null) {
        const parts = line ? line.split('=') : [];
        if (parts.length > 1) {
            currentEquation = parts.pop() || ""; // The part after the last '=', ensure it's a string
        } else if (parts.length === 1 && line && line.includes('=')) { // e.g. "2*2=" then type
            currentEquation = ""; // Start new equation part
        }
        // Append the new character to currentEquation if it's being built after '='
        // This part of the logic might need refinement based on exact behavior of getCurrentLine and user input flow
        // For now, let's assume currentEquation is the part *after* the equals.
        // If currentEquation is meant to be built from scratch after '=', it should be reset then appended.
        // currentEquation += event.data; // This was from original, might need adjustment
        // Let's assume getCurrentLine and then processing the part after '=' is more robust
        processEquation();

      } else if (event.inputType === 'deleteContentBackward') {
        if (!line || !line.includes('=')) {
            exitMathMode();
        } else {
            const parts = line.split('=');
            if (parts.length > 1) {
                currentEquation = parts.pop() || "";
                 if (currentEquation === '') {
                    hideAutoComplete(); 
                 } else {
                    processEquation();
                 }
            } else {
                exitMathMode();
            }
        }
      }
    }
  };
  
  const exitMathMode = () => {
    mathMode = false;
    currentEquation = '';
    hideAutoComplete();
  };

  const processEquation = () => {
    if (!browser) return;
    if (currentEquation && mathMode) {
      try {
        const result = math.evaluate(currentEquation);
        if (typeof result === 'number' || typeof result === 'boolean' || (result && typeof result.toString === 'function')) {
          showAutoComplete(result.toString());
        } else if (result && typeof result === 'object') {
          showAutoComplete(JSON.stringify(result)); 
        } else {
          hideAutoComplete();
        }
      } catch (error) {
        hideAutoComplete();
      }
    } else {
      hideAutoComplete();
    }
  };

  const getCurrentLine = () => {
    if (!browser) return '';
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return '';

    const range = selection.getRangeAt(0);
    let node = range.startContainer;
    
    let blockParent = node;
    // Traverse up carefully, ensuring editorElement is defined (it will be if browser is true and onMount ran)
    while (blockParent && blockParent.nodeType !== Node.ELEMENT_NODE && editorElement && blockParent.parentNode !== editorElement) {
        if (!blockParent.parentNode) return ''; 
        blockParent = blockParent.parentNode;
    }

    if (blockParent === editorElement && node.nodeType === Node.TEXT_NODE) {
      // Handled below
    } else if (blockParent && blockParent.nodeType === Node.ELEMENT_NODE && blockParent !== editorElement) {
        node = blockParent;
    } else if (node.nodeType === Node.ELEMENT_NODE && node.childNodes.length > 0 && range.startOffset < node.childNodes.length) {
        const childNode = node.childNodes[range.startOffset];
        if (childNode && childNode.nodeType === Node.TEXT_NODE) {
            node = childNode; 
        } else if (childNode && childNode.textContent) {
             return childNode.textContent.trim(); 
        }
    }

    if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
      // Get text from start of line in this node to end of line in this node
      const textBeforeCursor = node.nodeValue.substring(0, range.startOffset);
      const textAfterCursor = node.nodeValue.substring(range.startOffset);
      const linePartBefore = textBeforeCursor.split('\n').pop() || "";
      const linePartAfter = textAfterCursor.split('\n')[0] || "";
      return linePartBefore + linePartAfter;
    } else if (node.textContent) { 
      return node.textContent.trim();
    }
    return '';
  };


  const showAutoComplete = (result) => {
    if (!browser || !autoCompleteElement || !editorContainerElement || !editorElement) return;
    const { x, y } = getCaretCoordinates();
    const containerRect = editorContainerElement.getBoundingClientRect();

    autoCompleteElement.textContent = result.toString();
    autoCompleteElement.style.display = 'block';
    autoCompleteElement.style.left = `${x - containerRect.left}px`;
    autoCompleteElement.style.top = `${y - containerRect.top + 20 + editorElement.scrollTop}px`; // Adjust for scroll

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      lastCursorPosition = { node: range.startContainer, offset: range.startOffset };
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
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      let currentNode = range.startContainer;
      let currentOffset = range.startOffset;

      if (currentNode.nodeType === Node.TEXT_NODE && currentNode.nodeValue) {
        const text = currentNode.nodeValue;
        // Find the last '=' before the current cursor position in this text node
        const indexOfEquals = text.substring(0, currentOffset).lastIndexOf('=');
        
        if (indexOfEquals !== -1) {
          range.setStart(currentNode, indexOfEquals + 1); // After '='
          // range.setEnd(currentNode, currentOffset); // Up to cursor, already there by default
          range.deleteContents(); 
          
          const resultNode = document.createTextNode(resultText);
          range.insertNode(resultNode);
          range.setStartAfter(resultNode);
          range.setEndAfter(resultNode);
          selection.removeAllRanges();
          selection.addRange(range);

          animateInsertion(resultNode);
          editorContent = editorElement.innerHTML; 
          saveNote();
        }
      }
      exitMathMode();
      editorElement.focus(); 
    }
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
    animationSpan.offsetHeight; 
    animationSpan.style.opacity = '1';
    animationSpan.style.transform = 'translateY(0)';

    setTimeout(() => {
      if (animationSpan.parentNode && animationSpan.firstChild === node) {
        animationSpan.parentNode.insertBefore(node, animationSpan);
        animationSpan.remove();
      }
    }, 100); 
  };

  const hasCursorMoved = () => {
    if (!browser) return true; 
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return true; 

    const range = selection.getRangeAt(0);
    return (
      range.startContainer !== lastCursorPosition.node ||
      range.startOffset !== lastCursorPosition.offset
    );
  };

  function handleSelectionChange() {
    if (!browser) return;
    setTimeout(() => {
      updateCustomCursor();
      if (hasCursorMoved()) {
        // Consider if exiting math mode here is always desired
        // exitMathMode(); 
      }
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        lastCursorPosition = { node: range.startContainer, offset: range.startOffset };
      }
      updateFormattingState();
    }, 0);
  }

  const execCommandAndUpdate = (command, value = null) => {
    if (!browser || !editorElement) return;
    document.execCommand(command, false, value);
    editorContent = editorElement.innerHTML; // Sync Svelte state
    updateFormattingState();
    editorElement.focus();
  };

  const toggleFormat = (command) => {
    execCommandAndUpdate(command);
  };

  const toggleHeading = () => {
    if (!browser || !window.getSelection) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    
    let parentElement = range.commonAncestorContainer;
    if (parentElement.nodeType === Node.TEXT_NODE) {
      parentElement = parentElement.parentElement;
    }

    if (parentElement && parentElement.tagName && parentElement.tagName.match(/^H[1-6]$/)) {
      execCommandAndUpdate('formatBlock', 'p');
    } else {
      execCommandAndUpdate('formatBlock', 'h2');
    }
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
    
    let parentElement = selection.anchorNode;
    if (parentElement.nodeType === Node.TEXT_NODE) {
        parentElement = parentElement.parentElement;
    }

    isHeadingActive = false;
    let tempElement = parentElement;
    while(tempElement && tempElement !== editorElement) { 
        if (tempElement.tagName && tempElement.tagName.match(/^H[1-6]$/)) {
            isHeadingActive = true;
            break;
        }
        if (!tempElement.parentElement) break; // Safety break
        tempElement = tempElement.parentElement;
    }
    
    isListActive = !!(parentElement && parentElement.closest && parentElement.closest('ul'));
  };


  function handleEditorKeyDown(event) {
    if (!browser) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      insertAutoComplete();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      exitMathMode();
    } else if (event.ctrlKey || event.metaKey) {
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
    // Let Svelte's bind:innerHTML handle editorContent update for other keys
    // Math input is handled in on:input via handleMathInput
  }

  function handleEditorClick() {
    if (!browser) return;
    if (autoCompleteElement && autoCompleteElement.style.display !== 'none') {
        if (hasCursorMoved()) { // If click moved cursor away from active math editing
            // exitMathMode(); // Consider if this is too aggressive
        }
    }
    updateFormattingState(); 
  }

</script>

<div id="toolbar">
  <button 
    class="toolbar-button" 
    class:active={isBoldActive} 
    title="Bold" 
    aria-label="Bold" 
    on:click={() => toggleFormat('bold')}>
    <i class="fas fa-bold"></i>
  </button>
  <button 
    class="toolbar-button" 
    class:active={isItalicActive} 
    title="Italic" 
    aria-label="Italic" 
    on:click={() => toggleFormat('italic')}>
    <i class="fas fa-italic"></i>
  </button>
  <button 
    class="toolbar-button" 
    class:active={isUnderlineActive} 
    title="Underline" 
    aria-label="Underline" 
    on:click={() => toggleFormat('underline')}>
    <i class="fas fa-underline"></i>
  </button>
  <button 
    class="toolbar-button" 
    class:active={isHeadingActive} 
    title="Heading" 
    aria-label="Toggle Heading" 
    on:click={toggleHeading}>
    <i class="fas fa-heading"></i>
  </button>
  <button 
    class="toolbar-button" 
    class:active={isListActive} 
    title="Bullet List" 
    aria-label="Toggle Bullet List" 
    on:click={toggleList}>
    <i class="fas fa-list-ul"></i>
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
  /* Styles remain largely the same, ensure font paths are correct */
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
    /* position: relative; -- Removed as SvelteKit's body > div handles structure */
  }
  
  /* Ensure the root div SvelteKit uses takes full height */
  :global(body > div#svelte) { /* More specific if SvelteKit adds an id */
    height: 100%;
    display: flex;
    flex-direction: column;
  }
   /* Fallback if no id */
  :global(body > div:first-child) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }


  :global(b) {
    font-family: "Poly Sans Bulky", Arial, sans-serif;
  }
  :global(i) {
    font-style: italic; 
  }
  :global(u) {
    text-decoration: underline;
  }
  :global(h1), :global(h2), :global(h3), :global(h4), :global(h5), :global(h6) {
    font-family: "Poly Sans", Arial, sans-serif;
    margin-bottom: 0.5em;
  }
  :global(ul) {
    padding-left: 20px; 
    list-style-position: inside; 
  }

  #toolbar {
    display: flex;
    align-items: center;
    padding: 10px;
    background-color: #f1f1f1;
    border-bottom: 1px solid #ddd;
    flex-shrink: 0; 
  }

  .toolbar-button {
    background: none;
    border: none;
    font-size: 1.2em; 
    cursor: pointer;
    padding: 8px;
    margin: 0 5px;
    border-radius: 4px;
    transition: background-color 0.2s;
  }
  .toolbar-button i { 
    font-style: normal; 
  }

  .toolbar-button:hover {
    background-color: #e0e0e0;
  }

  .toolbar-button.active {
    background-color: #d0d0d0;
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
    letter-spacing: 0.05em;
    white-space: pre-wrap; 
    overflow-y: auto; 
    caret-color: transparent; 
    line-height: 1.6;
  }

  #auto-complete {
    position: absolute;
    background-color: #fff;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 5px;
    font-size: 1em;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    display: none;
    z-index: 20; 
  }

  :global(#editor::selection) {
    background: rgba(0, 0, 255, 0.3);
  }

  #custom-cursor {
    position: absolute;
    width: 2px;
    background-color: black;
    pointer-events: none;
    z-index: 10;
    user-select: none; 
    -webkit-user-select: none; 
    transition: top 0.05s ease-out, left 0.05s ease-out; 
    height: 1.2em; 
  }
</style>
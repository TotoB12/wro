document.addEventListener('DOMContentLoaded', () => {
  const editor = document.getElementById('editor');
  const customCursor = document.getElementById('custom-cursor');
  const boldButton = document.getElementById('boldButton');
  const italicButton = document.getElementById('italicButton');
  const underlineButton = document.getElementById('underlineButton');
  const toolbar = document.getElementById('toolbar');
  const editorContainer = document.getElementById('editor-container');

  let isBoldActive = false;
  let isItalicActive = false;
  let isUnderlineActive = false;

  const savedNote = localStorage.getItem('userNote');
  if (savedNote) {
    editor.innerHTML = savedNote;
  }

  const saveNote = () => {
    localStorage.setItem('userNote', editor.innerHTML);
  };

  let saveTimeout;
  let lastCursorPosition = { node: null, offset: 0 };

  editor.addEventListener('input', (event) => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveNote, 300);
    updateCustomCursor();
    if (event.inputType === 'insertText' && event.data === '=') {
      processEquation();
    }
    if (isBoldActive || isItalicActive || isUnderlineActive) {
      applyFormattingToNewText(event);
    }
  });

  const applyFormattingToNewText = (event) => {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const node = range.startContainer;

    if (event.inputType === 'insertText') {
      let parent = node.parentNode;

      let formattedNode = node;

      if (isBoldActive && (!parent.classList || !parent.classList.contains('bold'))) {
        const boldSpan = document.createElement('span');
        boldSpan.classList.add('bold');
        parent.insertBefore(boldSpan, node);
        boldSpan.appendChild(node);
        formattedNode = boldSpan;
      }

      if (isItalicActive) {
        const italicElement = document.createElement('i');
        formattedNode.parentNode.insertBefore(italicElement, formattedNode);
        italicElement.appendChild(formattedNode);
        formattedNode = italicElement;
      }

      if (isUnderlineActive) {
        const underlineElement = document.createElement('u');
        formattedNode.parentNode.insertBefore(underlineElement, formattedNode);
        underlineElement.appendChild(formattedNode);
        formattedNode = underlineElement;
      }
    }
  };

  const getCaretCoordinates = () => {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return { x: 20, y: 20 };

    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);

    const dummy = document.createElement('span');
    dummy.textContent = '\u200b';
    range.insertNode(dummy);

    const rect = dummy.getBoundingClientRect();
    const x = rect.left;
    const y = rect.top;

    dummy.parentNode.removeChild(dummy);

    return { x, y };
  };

  const updateCustomCursor = () => {
    const { x, y } = getCaretCoordinates();
    const containerRect = editorContainer.getBoundingClientRect();

    const cursorX = x - containerRect.left;
    let cursorY = y - containerRect.top;

    cursorY += 2;

    const clampedX = Math.max(0, Math.min(cursorX, editor.clientWidth - 2));
    const clampedY = Math.max(0, Math.min(cursorY, editor.clientHeight - parseInt(getComputedStyle(editor).fontSize)));

    customCursor.style.left = `${clampedX}px`;
    customCursor.style.top = `${clampedY}px`;
  };

  const processEquation = () => {
    const currentLine = getCurrentLine();
    if (currentLine) {
      const equationMatch = currentLine.match(/(\S+)=$/);
      if (equationMatch) {
        const equation = equationMatch[1];
        try {
          const result = math.evaluate(equation);
          if (typeof result === 'number') {
            showAutoComplete(result);
          }
        } catch (error) {
          console.log('Invalid equation');
        }
      }
    }
  };

  const getCurrentLine = () => {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const node = range.startContainer;

    if (node.nodeType === Node.TEXT_NODE) {
      const fullText = node.textContent;
      const lines = fullText.split('\n');
      const caretOffset = range.startOffset;
      let currentLine = '';
      let currentLineLength = 0;

      for (const line of lines) {
        currentLineLength += line.length + 1;
        if (currentLineLength > caretOffset) {
          currentLine = line;
          break;
        }
      }

      return currentLine.trim();
    }
  };

  const showAutoComplete = (result) => {
    removeAutoComplete();
    const autoCompleteSpan = document.createElement('span');
    autoCompleteSpan.textContent = result.toString();
    autoCompleteSpan.style.color = '#999';
    autoCompleteSpan.style.position = 'absolute';
    autoCompleteSpan.style.fontSize = getComputedStyle(editor).fontSize;
    autoCompleteSpan.style.fontFamily = getComputedStyle(editor).fontFamily;
    autoCompleteSpan.id = 'autoComplete';

    const { x, y } = getCaretCoordinates();
    autoCompleteSpan.style.left = `${x}px`;
    autoCompleteSpan.style.top = `${y}px`;

    editor.parentNode.appendChild(autoCompleteSpan);

    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      lastCursorPosition = { node: range.startContainer, offset: range.startOffset };
    }
  };

  const removeAutoComplete = () => {
    const existingAutoComplete = document.getElementById('autoComplete');
    if (existingAutoComplete) {
      existingAutoComplete.remove();
    }
  };

  const insertAutoComplete = () => {
    const autoCompleteSpan = document.getElementById('autoComplete');
    if (autoCompleteSpan) {
      const result = autoCompleteSpan.textContent;
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);

        const resultNode = document.createTextNode(result);

        range.insertNode(resultNode);

        range.setStartAfter(resultNode);
        range.setEndAfter(resultNode);
        selection.removeAllRanges();
        selection.addRange(range);

        removeAutoComplete();
        animateInsertion(resultNode);

        saveNote();
      }
    }
  };

  const animateInsertion = (node) => {
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      console.error('Invalid node for animation');
      return;
    }

    const animationSpan = document.createElement('span');
    node.parentNode.insertBefore(animationSpan, node);
    animationSpan.appendChild(node);

    animationSpan.style.display = 'inline-block';
    animationSpan.style.opacity = '0';
    animationSpan.style.transform = 'translateY(-20px)';
    animationSpan.style.transition = 'opacity 0.1s ease-out, transform 0.1s ease-out';

    animationSpan.offsetHeight;

    animationSpan.style.opacity = '1';
    animationSpan.style.transform = 'translateY(0)';

    setTimeout(() => {
      if (animationSpan.parentNode) {
        animationSpan.parentNode.insertBefore(node, animationSpan);
        animationSpan.remove();
      }
    }, 100);
  };

  const hasCursorMoved = () => {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return true;

    const range = selection.getRangeAt(0);
    return (
      range.startContainer !== lastCursorPosition.node ||
      range.startOffset !== lastCursorPosition.offset
    );
  };

  const toggleBold = () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (!range.collapsed) {
        applyBoldToSelection(range);
      } else {
        isBoldActive = !isBoldActive;
        updateBoldIndicator();
      }
    }
  };

  const applyBoldToSelection = (range) => {
    const span = document.createElement('span');
    span.classList.add('bold');
    try {
      span.appendChild(range.extractContents());
    } catch (e) {
      console.error('Error applying bold:', e);
      return;
    }
    range.insertNode(span);
    range.setStartAfter(span);
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    saveNote();
  };

  const toggleItalic = () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (!range.collapsed) {
        applyItalicToSelection(range);
      } else {
        isItalicActive = !isItalicActive;
        updateItalicIndicator();
      }
    }
  };

  const applyItalicToSelection = (range) => {
    const italicElement = document.createElement('i');
    try {
      italicElement.appendChild(range.extractContents());
    } catch (e) {
      console.error('Error applying italic:', e);
      return;
    }
    range.insertNode(italicElement);
    range.setStartAfter(italicElement);
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    saveNote();
  };

  const toggleUnderline = () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (!range.collapsed) {
        applyUnderlineToSelection(range);
      } else {
        isUnderlineActive = !isUnderlineActive;
        updateUnderlineIndicator();
      }
    }
  };

  const applyUnderlineToSelection = (range) => {
    const underlineElement = document.createElement('u');
    try {
      underlineElement.appendChild(range.extractContents());
    } catch (e) {
      console.error('Error applying underline:', e);
      return;
    }
    range.insertNode(underlineElement);
    range.setStartAfter(underlineElement);
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    saveNote();
  };

  const updateBoldIndicator = () => {
    if (isBoldActive) {
      boldButton.classList.add('active');
    } else {
      boldButton.classList.remove('active');
    }
  };

  const updateItalicIndicator = () => {
    if (isItalicActive) {
      italicButton.classList.add('active');
    } else {
      italicButton.classList.remove('active');
    }
  };

  const updateUnderlineIndicator = () => {
    if (isUnderlineActive) {
      underlineButton.classList.add('active');
    } else {
      underlineButton.classList.remove('active');
    }
  };

  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      insertAutoComplete();
    } else if (event.ctrlKey && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      toggleBold();
    } else if (event.ctrlKey && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      toggleItalic();
    } else if (event.ctrlKey && event.key.toLowerCase() === 'u') {
      event.preventDefault();
      toggleUnderline();
    }
  });

  editor.addEventListener('click', () => {
    if (hasCursorMoved()) {
      removeAutoComplete();
    }
  });

  boldButton.addEventListener('click', () => {
    toggleBold();
    editor.focus();
  });

  italicButton.addEventListener('click', () => {
    toggleItalic();
    editor.focus();
  });

  underlineButton.addEventListener('click', () => {
    toggleUnderline();
    editor.focus();
  });

  updateCustomCursor();

  document.addEventListener('selectionchange', () => {
    setTimeout(() => {
      updateCustomCursor();
      if (hasCursorMoved()) {
        removeAutoComplete();
      }
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        lastCursorPosition = { node: range.startContainer, offset: range.startOffset };
      }
      checkFormattingState();
    }, 0);
  });

  const checkFormattingState = () => {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const node = selection.anchorNode;
    if (node) {
      let parentElement = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;

      if (parentElement && parentElement.closest('.bold')) {
        isBoldActive = true;
      } else {
        isBoldActive = false;
      }
      updateBoldIndicator();

      if (parentElement && parentElement.closest('i')) {
        isItalicActive = true;
      } else {
        isItalicActive = false;
      }
      updateItalicIndicator();

      if (parentElement && parentElement.closest('u')) {
        isUnderlineActive = true;
      } else {
        isUnderlineActive = false;
      }
      updateUnderlineIndicator();
    }
  };

  window.addEventListener('resize', updateCustomCursor);
});
document.addEventListener('DOMContentLoaded', () => {
  const editor = document.getElementById('editor');
  const customCursor = document.getElementById('custom-cursor');

  const savedNote = localStorage.getItem('userNote');
  if (savedNote) {
    editor.innerText = savedNote;
  }

  const saveNote = () => {
    localStorage.setItem('userNote', editor.innerText);
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
  });

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
    const editorRect = editor.getBoundingClientRect();

    const cursorX = x - editorRect.left;
    let cursorY = y - editorRect.top;

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
      const range = selection.getRangeAt(0);
      
      const resultNode = document.createTextNode(result);
      range.insertNode(resultNode);
      range.setStartAfter(resultNode);
      range.setEndAfter(resultNode);
      selection.removeAllRanges();
      selection.addRange(range);

      removeAutoComplete();
      animateInsertion(resultNode);
    }
  };

  const animateInsertion = (node) => {
    node.style.opacity = '0';
    node.style.transform = 'translateX(-20px)';
    node.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
    
    setTimeout(() => {
      node.style.opacity = '1';
      node.style.transform = 'translateX(0)';
    }, 0);
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

  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      insertAutoComplete();
    }
  });

  editor.addEventListener('click', () => {
    if (hasCursorMoved()) {
      removeAutoComplete();
    }
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
    }, 0);
  });

  window.addEventListener('resize', updateCustomCursor);
});
document.addEventListener('DOMContentLoaded', () => {
  const editor = document.getElementById('editor');
  const customCursor = document.getElementById('custom-cursor');
  const autoComplete = document.getElementById('auto-complete');
  const toolbar = document.getElementById('toolbar');
  const editorContainer = document.getElementById('editor-container');

  const buttons = {
    bold: document.getElementById('boldButton'),
    italic: document.getElementById('italicButton'),
    underline: document.getElementById('underlineButton'),
    heading: document.getElementById('headingButton'),
    list: document.getElementById('listButton')
  };

  const savedNote = localStorage.getItem('userNote');
  if (savedNote) {
    editor.innerHTML = savedNote;
  }

  const saveNote = () => {
    localStorage.setItem('userNote', editor.innerHTML);
  };

  let saveTimeout;
  let lastCursorPosition = { node: null, offset: 0 };
  let mathMode = false;
  let currentEquation = '';

  editor.addEventListener('input', (event) => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveNote, 300);
    updateCustomCursor();
    handleMathInput(event);
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
    const containerRect = editorContainer.getBoundingClientRect();

    const cursorX = x - containerRect.left;
    let cursorY = y - containerRect.top;

    cursorY += 2;

    const clampedX = Math.max(0, Math.min(cursorX, editor.clientWidth - 2));
    const clampedY = Math.max(0, Math.min(cursorY, editor.clientHeight - parseInt(getComputedStyle(editor).fontSize)));

    customCursor.style.left = `${clampedX}px`;
    customCursor.style.top = `${clampedY}px`;
  };

  const handleMathInput = (event) => {
    if (event.inputType === 'insertText' && event.data === '=') {
      mathMode = true;
      currentEquation = getCurrentLine().split('=')[0].trim();
      processEquation();
    } else if (mathMode) {
      if (event.inputType === 'insertText' && event.data !== null) {
        currentEquation += event.data;
        processEquation();
      } else if (event.inputType === 'deleteContentBackward') {
        exitMathMode();
      }
    }
  };

  const exitMathMode = () => {
    mathMode = false;
    currentEquation = '';
    hideAutoComplete();
  };

  const processEquation = () => {
    if (currentEquation) {
      try {
        const result = math.evaluate(currentEquation);
        if (typeof result === 'number' || typeof result === 'boolean') {
          showAutoComplete(result);
        } else if (result && typeof result === 'object') {
          showAutoComplete(JSON.stringify(result));
        }
      } catch (error) {
        console.log('Invalid equation');
        hideAutoComplete();
      }
    } else {
      hideAutoComplete();
    }
  };

  const getCurrentLine = () => {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return '';

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
    return '';
  };

  const showAutoComplete = (result) => {
    const { x, y } = getCaretCoordinates();
    const containerRect = editorContainer.getBoundingClientRect();

    autoComplete.textContent = result.toString();
    autoComplete.style.display = 'block';
    autoComplete.style.left = `${x - containerRect.left}px`;
    autoComplete.style.top = `${y - containerRect.top + 20}px`;

    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      lastCursorPosition = { node: range.startContainer, offset: range.startOffset };
    }
  };

  const hideAutoComplete = () => {
    autoComplete.style.display = 'none';
  };

  const insertAutoComplete = () => {
    if (autoComplete.style.display !== 'none') {
      const result = autoComplete.textContent;
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const resultNode = document.createTextNode(result);
        range.insertNode(resultNode);
        range.setStartAfter(resultNode);
        range.setEndAfter(resultNode);
        selection.removeAllRanges();
        selection.addRange(range);
        hideAutoComplete();
        animateInsertion(resultNode);
        saveNote();
        exitMathMode();
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
    animationSpan.style.transform = 'translateY(20px)';
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

  const toggleFormat = (command) => {
    document.execCommand(command);
    updateFormattingState();
    editor.focus();
  };

  buttons.bold.addEventListener('click', () => toggleFormat('bold'));
  buttons.italic.addEventListener('click', () => toggleFormat('italic'));
  buttons.underline.addEventListener('click', () => toggleFormat('underline'));
  buttons.heading.addEventListener('click', () => {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const parentElement = range.commonAncestorContainer.parentElement;

    if (parentElement.tagName.match(/^H[1-6]$/)) {
      document.execCommand('formatBlock', false, 'p');
    } else {
      document.execCommand('formatBlock', false, 'h2');
    }
    updateFormattingState();
    editor.focus();
  });
  buttons.list.addEventListener('click', () => {
    document.execCommand('insertUnorderedList');
    updateFormattingState();
    editor.focus();
  });

  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      insertAutoComplete();
    } else if (event.key === 'Escape') {
      exitMathMode();
    } else if (event.key === 'Backspace' && mathMode) {
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
  });

  editor.addEventListener('click', () => {
    if (hasCursorMoved()) {
      exitMathMode();
    }
  });

  const updateFormattingState = () => {
    const commands = ['bold', 'italic', 'underline'];
    commands.forEach(cmd => {
      if (document.queryCommandState(cmd)) {
        buttons[cmd].classList.add('active');
      } else {
        buttons[cmd].classList.remove('active');
      }
    });

    const parentElement = window.getSelection().anchorNode.parentElement;
    if (parentElement.tagName.match(/^H[1-6]$/)) {
      buttons.heading.classList.add('active');
    } else {
      buttons.heading.classList.remove('active');
    }

    if (parentElement.closest('ul')) {
      buttons.list.classList.add('active');
    } else {
      buttons.list.classList.remove('active');
    }
  };

  updateCustomCursor();

  document.addEventListener('selectionchange', () => {
    setTimeout(() => {
      updateCustomCursor();
      if (hasCursorMoved()) {
        exitMathMode();
      }
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        lastCursorPosition = { node: range.startContainer, offset: range.startOffset };
      }
      updateFormattingState();
    }, 0);
  });

  window.addEventListener('resize', updateCustomCursor);
});
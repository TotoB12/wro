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
    editor.addEventListener('input', () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(saveNote, 300);
      updateCustomCursor();
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
  
      const clampedX = Math.max(0, Math.min(cursorX, editor.clientWidth - 2)); // 2px width of cursor
      const clampedY = Math.max(0, Math.min(cursorY, editor.clientHeight - parseInt(getComputedStyle(editor).fontSize)));
  
      customCursor.style.left = `${clampedX}px`;
      customCursor.style.top = `${clampedY}px`;
    };
  
    updateCustomCursor();
  
    document.addEventListener('selectionchange', () => {
      setTimeout(updateCustomCursor, 0);
    });
  
    window.addEventListener('resize', updateCustomCursor);
  });
  
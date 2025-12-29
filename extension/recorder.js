/**
 * Recorder Content Script
 * Captures user actions (clicks, typing, file uploads) and generates selectors
 */

(function() {
  // Prevent multiple injections
  if (window.__mcpRecorderInjected) return;
  window.__mcpRecorderInjected = true;

  let isRecording = false;

  /**
   * Generate a unique CSS selector for an element
   * Tries multiple strategies to find the most robust selector
   */
  function generateSelector(el) {
    // Strategy 1: ID (most stable)
    if (el.id && !el.id.match(/^\d/) && !el.id.includes(':')) {
      const idSelector = `#${CSS.escape(el.id)}`;
      if (document.querySelectorAll(idSelector).length === 1) {
        return idSelector;
      }
    }

    // Strategy 2: data-testid or data-cy (test attributes)
    for (const attr of ['data-testid', 'data-cy', 'data-test', 'data-automation-id']) {
      const value = el.getAttribute(attr);
      if (value) {
        const selector = `[${attr}="${CSS.escape(value)}"]`;
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }
    }

    // Strategy 3: Unique class combination
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.trim().split(/\s+/).filter(c =>
        c && !c.match(/^(hover|active|focus|visited|disabled)/) && !c.match(/^\d/)
      );
      if (classes.length > 0) {
        // Try single unique class
        for (const cls of classes) {
          const selector = `.${CSS.escape(cls)}`;
          if (document.querySelectorAll(selector).length === 1) {
            return selector;
          }
        }
        // Try class combination
        const selector = classes.slice(0, 3).map(c => `.${CSS.escape(c)}`).join('');
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }
    }

    // Strategy 4: Tag + attributes
    const tag = el.tagName.toLowerCase();

    // For inputs, use type and name
    if (tag === 'input') {
      const type = el.type || 'text';
      const name = el.name;
      if (name) {
        const selector = `input[name="${CSS.escape(name)}"]`;
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }
      if (el.placeholder) {
        const selector = `input[placeholder="${CSS.escape(el.placeholder)}"]`;
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }
    }

    // For buttons and links, use text content
    if (tag === 'button' || tag === 'a') {
      const text = el.textContent.trim().slice(0, 50);
      if (text) {
        // Can't use text in CSS selector, but we can use aria-label or title
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) {
          const selector = `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;
          if (document.querySelectorAll(selector).length === 1) {
            return selector;
          }
        }
      }
    }

    // Strategy 5: Build path with nth-child
    const path = [];
    let current = el;
    while (current && current !== document.body && path.length < 5) {
      let selector = current.tagName.toLowerCase();

      if (current.id && !current.id.match(/^\d/)) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }

      // Add nth-child if needed
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(s => s.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }

      path.unshift(selector);
      current = parent;
    }

    return path.join(' > ');
  }

  /**
   * Record an action and send to background
   */
  function recordAction(action) {
    if (!isRecording) return;

    chrome.runtime.sendMessage({
      type: 'record_action',
      action: {
        ...action,
        url: window.location.href,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Handle click events
   */
  function handleClick(e) {
    if (!isRecording) return;

    const el = e.target;

    // Skip if clicking on extension UI or invisible elements
    if (el.closest('[data-mcp-ignore]')) return;

    const selector = generateSelector(el);
    const text = el.textContent?.trim().slice(0, 100) || '';

    recordAction({
      type: 'click',
      selector,
      tag: el.tagName.toLowerCase(),
      text
    });
  }

  /**
   * Handle input/change events (for typing and selections)
   */
  function handleInput(e) {
    if (!isRecording) return;

    const el = e.target;
    if (!el.matches('input, textarea, select')) return;

    const selector = generateSelector(el);

    if (el.type === 'file') {
      // File input - record file selection
      if (el.files && el.files.length > 0) {
        const file = el.files[0];
        recordAction({
          type: 'upload',
          selector,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type
        });
      }
    } else if (el.tagName === 'SELECT') {
      // Select dropdown
      recordAction({
        type: 'select',
        selector,
        value: el.value,
        text: el.options[el.selectedIndex]?.text
      });
    } else {
      // Text input - debounce to capture final value
      clearTimeout(el.__mcpInputTimeout);
      el.__mcpInputTimeout = setTimeout(() => {
        recordAction({
          type: 'type',
          selector,
          value: el.value
        });
      }, 500);
    }
  }

  /**
   * Handle keyboard events (for special keys like Enter)
   */
  function handleKeydown(e) {
    if (!isRecording) return;

    // Only record special keys
    const specialKeys = ['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!specialKeys.includes(e.key)) return;

    const el = e.target;
    const selector = generateSelector(el);

    recordAction({
      type: 'keypress',
      selector,
      key: e.key
    });
  }

  /**
   * Handle navigation (for page loads)
   */
  function handleNavigation() {
    if (!isRecording) return;

    recordAction({
      type: 'navigate',
      url: window.location.href,
      title: document.title
    });
  }

  /**
   * Start recording
   */
  function startRecording() {
    isRecording = true;

    // Record initial page
    handleNavigation();

    // Add event listeners
    document.addEventListener('click', handleClick, true);
    document.addEventListener('change', handleInput, true);
    document.addEventListener('keydown', handleKeydown, true);

    console.log('[MCP Recorder] Recording started');
  }

  /**
   * Stop recording
   */
  function stopRecording() {
    isRecording = false;

    // Remove event listeners
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('change', handleInput, true);
    document.removeEventListener('keydown', handleKeydown, true);

    console.log('[MCP Recorder] Recording stopped');
  }

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'start_recording') {
      startRecording();
      sendResponse({ success: true });
    } else if (message.type === 'stop_recording') {
      stopRecording();
      sendResponse({ success: true });
    } else if (message.type === 'is_recording') {
      sendResponse({ isRecording });
    }
    return true;
  });

  console.log('[MCP Recorder] Injected and ready');
})();

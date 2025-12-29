/**
 * Background Service Worker
 * Maintains WebSocket connection to MCP server and routes messages to content scripts
 */

const WS_URL = 'ws://localhost:9876';
let ws = null;
let connectedTabId = null;
let keepAliveInterval = null;

// Session-based control: ON = all tabs accessible, OFF = nothing
let sessionEnabled = false;

// Recording state
let isRecording = false;
let currentRecording = []; // Actions being recorded
let recordingTabId = null; // Tab being recorded
let lastSaved = true; // Whether current recording was saved

// Load session state from storage
async function loadSessionState() {
  const result = await chrome.storage.local.get('sessionEnabled');
  sessionEnabled = result.sessionEnabled || false;
  await updateIcon();
}

// Save session state
async function saveSessionState() {
  await chrome.storage.local.set({ sessionEnabled });
}

// Toggle session
async function toggleSession() {
  sessionEnabled = !sessionEnabled;
  await saveSessionState();
  await updateIcon();
  // Disconnect if turning off
  if (!sessionEnabled) {
    connectedTabId = null;
  }
  return sessionEnabled;
}

// Update the extension icon based on state
async function updateIcon() {
  const isConnected = ws && ws.readyState === WebSocket.OPEN;

  let iconColor;
  if (!isConnected) {
    iconColor = 'gray';
  } else if (sessionEnabled) {
    iconColor = 'green';
  } else {
    iconColor = 'yellow';
  }

  try {
    await chrome.action.setIcon({
      path: {
        16: `icons/icon-${iconColor}-16.png`,
        48: `icons/icon-${iconColor}-48.png`,
        128: `icons/icon-${iconColor}-128.png`
      }
    });
  } catch (err) {
    console.log('[Background] Could not set icon:', err.message);
  }
}

// Initialize on load
loadSessionState();

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (connectedTabId === tabId) {
    connectedTabId = null;
  }
});

// Connect to WebSocket server
function connect() {
  console.log('[Background] Connecting to', WS_URL);

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[Background] WebSocket connected');
    startKeepAlive();
    // Notify server we're ready
    send({ type: 'extension_ready' });
    // Update icon to reflect connected state
    updateIcon();
  };

  ws.onmessage = async (event) => {
    console.log('[Background] Received:', event.data);
    try {
      const message = JSON.parse(event.data);
      await handleMessage(message);
    } catch (err) {
      console.error('[Background] Error handling message:', err);
    }
  };

  ws.onclose = () => {
    console.log('[Background] WebSocket closed, reconnecting in 3s...');
    stopKeepAlive();
    ws = null;
    // Update icon to reflect disconnected state
    updateIcon();
    setTimeout(connect, 3000);
  };

  ws.onerror = (err) => {
    console.error('[Background] WebSocket error:', err);
  };
}

function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function startKeepAlive() {
  stopKeepAlive();
  keepAliveInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'keepalive' }));
    }
  }, 20000); // Every 20 seconds
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// Handle incoming messages from MCP server
async function handleMessage(message) {
  const { id, method, params } = message;

  try {
    let result;

    switch (method) {
      case 'list_tabs':
        result = await listTabs();
        break;

      case 'connect_tab':
        result = await connectTab(params.tabId);
        break;

      case 'disconnect_tab':
        result = disconnectTab();
        break;

      case 'upload_file':
        result = await uploadFile(params);
        break;

      case 'get_page_info':
        result = await getPageInfo();
        break;

      case 'navigate':
        result = await navigate(params.url);
        break;

      case 'click':
        result = await click(params.selector);
        break;

      case 'type':
        result = await type(params.selector, params.text);
        break;

      case 'select_option':
        result = await selectOption(params.selector, params.value);
        break;

      case 'press_key':
        result = await pressKey(params.key, params.selector);
        break;

      case 'screenshot':
        result = await screenshot();
        break;

      case 'go_back':
        result = await goBack();
        break;

      case 'go_forward':
        result = await goForward();
        break;

      case 'console_messages':
        result = await getConsoleMessages();
        break;

      case 'snapshot':
        result = await getSnapshot();
        break;

      case 'tab_new':
        result = await createTab(params.url);
        break;

      // Phase 2 methods
      case 'hover':
        result = await hover(params.selector);
        break;

      case 'drag':
        result = await drag(params.sourceSelector, params.targetSelector);
        break;

      case 'handle_dialog':
        result = await handleDialog(params.action, params.promptText);
        break;

      case 'tab_close':
        result = await closeTab(params.tabId);
        break;

      // Phase 3 methods
      case 'scroll':
        result = await scroll(params.direction, params.amount, params.selector);
        break;

      case 'wait_for_selector':
        result = await waitForSelector(params.selector, params.timeout);
        break;

      case 'evaluate':
        result = await evaluate(params.code);
        break;

      case 'get_cookies':
        result = await getCookies();
        break;

      case 'set_cookie':
        result = await setCookie(params);
        break;

      case 'network_requests':
        result = await getNetworkRequests(params.filter);
        break;

      // Recording methods
      case 'list_recordings':
        result = await getRecordings();
        break;

      case 'get_recording':
        result = await getRecordingByName(params.name);
        break;

      case 'replay_recording':
        result = await replayRecording(params.name);
        break;

      case 'delete_recording':
        result = await deleteRecording(params.name);
        break;

      default:
        throw new Error(`Unknown method: ${method}`);
    }

    send({ id, result });
  } catch (error) {
    send({ id, error: error.message });
  }
}

// List all tabs (only if session is enabled)
async function listTabs() {
  if (!sessionEnabled) {
    return []; // Session disabled, return empty
  }
  const tabs = await chrome.tabs.query({});
  return tabs.map(tab => ({
    id: tab.id,
    title: tab.title,
    url: tab.url,
    active: tab.active,
    connected: tab.id === connectedTabId
  }));
}

// Connect to a specific tab (session must be enabled)
async function connectTab(tabId) {
  if (!sessionEnabled) {
    throw new Error('Browser control is disabled. Enable it via the extension icon.');
  }
  const tab = await chrome.tabs.get(tabId);
  if (!tab) {
    throw new Error(`Tab ${tabId} not found`);
  }
  connectedTabId = tabId;
  console.log('[Background] Connected to tab:', tabId, tab.title);
  return {
    success: true,
    tabId,
    title: tab.title,
    url: tab.url
  };
}

// Disconnect from current tab
function disconnectTab() {
  const oldTabId = connectedTabId;
  connectedTabId = null;
  return { success: true, disconnectedTabId: oldTabId };
}

// Get info about connected page
async function getPageInfo() {
  if (!connectedTabId) {
    throw new Error('No tab connected');
  }

  const tab = await chrome.tabs.get(connectedTabId);
  return {
    tabId: connectedTabId,
    title: tab.title,
    url: tab.url
  };
}

// Upload file to an input element
async function uploadFile(params) {
  const { selector, fileName, fileContent, mimeType } = params;

  if (!connectedTabId) {
    throw new Error('No tab connected. Use connect_tab first.');
  }

  // Execute in the content script context
  const results = await chrome.scripting.executeScript({
    target: { tabId: connectedTabId },
    func: injectFile,
    args: [selector, fileName, fileContent, mimeType]
  });

  if (results && results[0]) {
    return results[0].result;
  }
  throw new Error('Script execution failed');
}

// Helper to check connected tab
function requireConnectedTab() {
  if (!connectedTabId) {
    throw new Error('No tab connected. Use connect_tab first.');
  }
  return connectedTabId;
}

// Navigate to URL
async function navigate(url) {
  const tabId = requireConnectedTab();
  await chrome.tabs.update(tabId, { url });
  return { success: true, url };
}

// Click an element
async function click(selector) {
  const tabId = requireConnectedTab();
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { success: false, error: `Element not found: ${sel}` };
      el.click();
      return { success: true, selector: sel };
    },
    args: [selector]
  });
  return results[0]?.result || { success: false, error: 'Script failed' };
}

// Type text into an element
async function type(selector, text) {
  const tabId = requireConnectedTab();
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel, txt) => {
      const el = document.querySelector(sel);
      if (!el) return { success: false, error: `Element not found: ${sel}` };
      el.focus();
      el.value = txt;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, selector: sel, text: txt };
    },
    args: [selector, text]
  });
  return results[0]?.result || { success: false, error: 'Script failed' };
}

// Select an option from a dropdown
async function selectOption(selector, value) {
  const tabId = requireConnectedTab();
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return { success: false, error: `Element not found: ${sel}` };
      if (el.tagName !== 'SELECT') return { success: false, error: 'Element is not a select' };
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, selector: sel, value: val };
    },
    args: [selector, value]
  });
  return results[0]?.result || { success: false, error: 'Script failed' };
}

// Press a keyboard key
async function pressKey(key, selector) {
  const tabId = requireConnectedTab();
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (k, sel) => {
      const el = sel ? document.querySelector(sel) : document.activeElement;
      if (!el) return { success: false, error: sel ? `Element not found: ${sel}` : 'No active element' };
      const opts = { key: k, bubbles: true, cancelable: true };
      el.dispatchEvent(new KeyboardEvent('keydown', opts));
      el.dispatchEvent(new KeyboardEvent('keypress', opts));
      el.dispatchEvent(new KeyboardEvent('keyup', opts));
      return { success: true, key: k };
    },
    args: [key, selector || null]
  });
  return results[0]?.result || { success: false, error: 'Script failed' };
}

// Take a screenshot
async function screenshot() {
  const tabId = requireConnectedTab();
  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
  return { success: true, dataUrl };
}

// Go back in history
async function goBack() {
  const tabId = requireConnectedTab();
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      history.back();
      return { success: true };
    }
  });
  return results[0]?.result || { success: false, error: 'Script failed' };
}

// Go forward in history
async function goForward() {
  const tabId = requireConnectedTab();
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      history.forward();
      return { success: true };
    }
  });
  return results[0]?.result || { success: false, error: 'Script failed' };
}

// Get console messages (injects interceptor and returns captured messages)
async function getConsoleMessages() {
  const tabId = requireConnectedTab();
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Return captured messages if we've already injected
      if (window.__mcpConsoleLogs) {
        const logs = [...window.__mcpConsoleLogs];
        window.__mcpConsoleLogs = []; // Clear after reading
        return { success: true, messages: logs };
      }

      // Inject interceptor
      window.__mcpConsoleLogs = [];
      const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info
      };

      ['log', 'warn', 'error', 'info'].forEach(level => {
        console[level] = (...args) => {
          window.__mcpConsoleLogs.push({
            level,
            message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '),
            timestamp: Date.now()
          });
          originalConsole[level].apply(console, args);
        };
      });

      return { success: true, messages: [], note: 'Console interceptor installed. Call again to get messages.' };
    }
  });
  return results[0]?.result || { success: false, error: 'Script failed' };
}

// Get page snapshot (accessibility tree-like structure)
async function getSnapshot() {
  const tabId = requireConnectedTab();
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const elements = [];
      let refCounter = 0;

      // Find all interactive elements
      const interactiveSelectors = [
        'a[href]', 'button', 'input', 'select', 'textarea',
        '[role="button"]', '[role="link"]', '[role="checkbox"]',
        '[role="radio"]', '[role="textbox"]', '[role="combobox"]',
        '[onclick]', '[tabindex]'
      ];

      const allElements = document.querySelectorAll(interactiveSelectors.join(','));

      allElements.forEach(el => {
        // Skip hidden elements
        if (el.offsetParent === null && el.tagName !== 'INPUT') return;

        const ref = `e${++refCounter}`;
        el.dataset.mcpRef = ref;

        const info = {
          ref,
          tag: el.tagName.toLowerCase(),
          type: el.type || null,
          role: el.getAttribute('role') || null,
          text: (el.textContent || '').trim().slice(0, 100),
          value: el.value || null,
          placeholder: el.placeholder || null,
          href: el.href || null,
          name: el.name || null,
          id: el.id || null,
          className: el.className || null,
          disabled: el.disabled || false,
          checked: el.checked || null
        };

        // Clean up null values
        Object.keys(info).forEach(k => {
          if (info[k] === null || info[k] === '') delete info[k];
        });

        elements.push(info);
      });

      return {
        success: true,
        url: window.location.href,
        title: document.title,
        elements
      };
    }
  });
  return results[0]?.result || { success: false, error: 'Script failed' };
}

// Create a new tab
async function createTab(url) {
  const tab = await chrome.tabs.create({ url: url || 'about:blank' });
  return {
    success: true,
    tabId: tab.id,
    url: tab.url
  };
}

// ========== Phase 2 Functions ==========

// Hover over an element
async function hover(selector) {
  const tabId = requireConnectedTab();
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { success: false, error: `Element not found: ${sel}` };

      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Dispatch mouse events for hover
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: centerX, clientY: centerY }));
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: centerX, clientY: centerY }));
      el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: centerX, clientY: centerY }));

      return { success: true, selector: sel };
    },
    args: [selector]
  });
  return results[0]?.result || { success: false, error: 'Script failed' };
}

// Drag an element to another element
async function drag(sourceSelector, targetSelector) {
  const tabId = requireConnectedTab();
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (srcSel, tgtSel) => {
      const source = document.querySelector(srcSel);
      const target = document.querySelector(tgtSel);

      if (!source) return { success: false, error: `Source element not found: ${srcSel}` };
      if (!target) return { success: false, error: `Target element not found: ${tgtSel}` };

      const srcRect = source.getBoundingClientRect();
      const tgtRect = target.getBoundingClientRect();

      const srcX = srcRect.left + srcRect.width / 2;
      const srcY = srcRect.top + srcRect.height / 2;
      const tgtX = tgtRect.left + tgtRect.width / 2;
      const tgtY = tgtRect.top + tgtRect.height / 2;

      // Create and dispatch drag events
      const dataTransfer = new DataTransfer();

      source.dispatchEvent(new DragEvent('dragstart', {
        bubbles: true, cancelable: true, clientX: srcX, clientY: srcY, dataTransfer
      }));

      target.dispatchEvent(new DragEvent('dragenter', {
        bubbles: true, cancelable: true, clientX: tgtX, clientY: tgtY, dataTransfer
      }));

      target.dispatchEvent(new DragEvent('dragover', {
        bubbles: true, cancelable: true, clientX: tgtX, clientY: tgtY, dataTransfer
      }));

      target.dispatchEvent(new DragEvent('drop', {
        bubbles: true, cancelable: true, clientX: tgtX, clientY: tgtY, dataTransfer
      }));

      source.dispatchEvent(new DragEvent('dragend', {
        bubbles: true, cancelable: true, clientX: tgtX, clientY: tgtY, dataTransfer
      }));

      return { success: true, source: srcSel, target: tgtSel };
    },
    args: [sourceSelector, targetSelector]
  });
  return results[0]?.result || { success: false, error: 'Script failed' };
}

// Handle browser dialogs (alert, confirm, prompt)
async function handleDialog(action, promptText) {
  const tabId = requireConnectedTab();
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (act, txt) => {
      // Override dialog functions to auto-handle
      if (act === 'accept') {
        window.__mcpDialogResult = txt || true;
        window.alert = () => {};
        window.confirm = () => true;
        window.prompt = () => txt || '';
      } else {
        window.__mcpDialogResult = null;
        window.alert = () => {};
        window.confirm = () => false;
        window.prompt = () => null;
      }
      return { success: true, action: act, note: 'Dialog handlers installed. Trigger the dialog now.' };
    },
    args: [action, promptText || null]
  });
  return results[0]?.result || { success: false, error: 'Script failed' };
}

// Close a tab
async function closeTab(tabId) {
  const targetTabId = tabId || connectedTabId;
  if (!targetTabId) {
    throw new Error('No tab specified and no tab connected');
  }

  await chrome.tabs.remove(targetTabId);

  // Clean up if we closed the connected tab
  if (targetTabId === connectedTabId) {
    connectedTabId = null;
  }

  return { success: true, closedTabId: targetTabId };
}

// ========== Phase 3 Functions ==========

// Scroll the page or element
async function scroll(direction, amount, selector) {
  const tabId = requireConnectedTab();
  const scrollAmount = amount || 500;

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (dir, amt, sel) => {
      const el = sel ? document.querySelector(sel) : window;
      if (sel && !el) return { success: false, error: `Element not found: ${sel}` };

      const target = sel ? el : document.documentElement;

      let x = 0, y = 0;
      switch (dir) {
        case 'up': y = -amt; break;
        case 'down': y = amt; break;
        case 'left': x = -amt; break;
        case 'right': x = amt; break;
      }

      if (sel) {
        el.scrollBy(x, y);
      } else {
        window.scrollBy(x, y);
      }

      return { success: true, direction: dir, amount: amt };
    },
    args: [direction, scrollAmount, selector || null]
  });
  return results[0]?.result || { success: false, error: 'Script failed' };
}

// Wait for a selector to appear
async function waitForSelector(selector, timeout) {
  const tabId = requireConnectedTab();
  const maxTime = timeout || 10000;

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (sel, max) => {
      const startTime = Date.now();

      while (Date.now() - startTime < max) {
        const el = document.querySelector(sel);
        if (el) {
          return { success: true, selector: sel, found: true, elapsed: Date.now() - startTime };
        }
        await new Promise(r => setTimeout(r, 100));
      }

      return { success: false, error: `Timeout waiting for selector: ${sel}`, elapsed: max };
    },
    args: [selector, maxTime]
  });
  return results[0]?.result || { success: false, error: 'Script failed' };
}

// Execute arbitrary JavaScript
async function evaluate(code) {
  const tabId = requireConnectedTab();
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN', // Run in page context, not extension sandbox
    func: (jsCode) => {
      try {
        // Use Function constructor for eval
        const fn = new Function('return (' + jsCode + ')');
        const result = fn();
        // Try to serialize the result
        try {
          return { success: true, result: JSON.parse(JSON.stringify(result)) };
        } catch {
          // If can't serialize, return string representation
          return { success: true, result: String(result) };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
    args: [code]
  });
  return results[0]?.result || { success: false, error: 'Script failed' };
}

// Get cookies for the current page
async function getCookies() {
  const tabId = requireConnectedTab();
  const tab = await chrome.tabs.get(tabId);
  const url = new URL(tab.url);

  const cookies = await chrome.cookies.getAll({ domain: url.hostname });
  return { success: true, cookies };
}

// Set a cookie
async function setCookie(params) {
  const tabId = requireConnectedTab();
  const tab = await chrome.tabs.get(tabId);
  const url = new URL(tab.url);

  const cookie = {
    url: tab.url,
    name: params.name,
    value: params.value,
    domain: params.domain || url.hostname,
    path: params.path || '/',
    secure: params.secure || false,
    httpOnly: params.httpOnly || false,
  };

  if (params.expirationDate) {
    cookie.expirationDate = params.expirationDate;
  }

  await chrome.cookies.set(cookie);
  return { success: true, cookie: { name: params.name, value: params.value } };
}

// Get network requests (install interceptor on first call)
async function getNetworkRequests(filter) {
  const tabId = requireConnectedTab();
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (filterPattern) => {
      // Return captured requests if we've already injected
      if (window.__mcpNetworkRequests) {
        let requests = [...window.__mcpNetworkRequests];
        window.__mcpNetworkRequests = []; // Clear after reading

        if (filterPattern) {
          requests = requests.filter(r => r.url.includes(filterPattern));
        }

        return { success: true, requests };
      }

      // Inject interceptor
      window.__mcpNetworkRequests = [];

      // Intercept fetch
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        const method = args[1]?.method || 'GET';
        const startTime = Date.now();

        try {
          const response = await originalFetch.apply(window, args);
          window.__mcpNetworkRequests.push({
            type: 'fetch',
            url,
            method,
            status: response.status,
            duration: Date.now() - startTime,
            timestamp: startTime
          });
          return response;
        } catch (err) {
          window.__mcpNetworkRequests.push({
            type: 'fetch',
            url,
            method,
            error: err.message,
            duration: Date.now() - startTime,
            timestamp: startTime
          });
          throw err;
        }
      };

      // Intercept XMLHttpRequest
      const originalXHROpen = XMLHttpRequest.prototype.open;
      const originalXHRSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function(method, url) {
        this.__mcpMethod = method;
        this.__mcpUrl = url;
        this.__mcpStartTime = Date.now();
        return originalXHROpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function() {
        this.addEventListener('loadend', () => {
          window.__mcpNetworkRequests.push({
            type: 'xhr',
            url: this.__mcpUrl,
            method: this.__mcpMethod,
            status: this.status,
            duration: Date.now() - this.__mcpStartTime,
            timestamp: this.__mcpStartTime
          });
        });
        return originalXHRSend.apply(this, arguments);
      };

      return { success: true, requests: [], note: 'Network interceptor installed. Call again to get requests.' };
    },
    args: [filter || null]
  });
  return results[0]?.result || { success: false, error: 'Script failed' };
}

// This function runs in the page context
function injectFile(selector, fileName, fileContentBase64, mimeType) {
  try {
    const input = document.querySelector(selector);
    if (!input) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    if (input.type !== 'file') {
      return { success: false, error: `Element is not a file input: ${input.type}` };
    }

    // Decode base64 content
    const binaryString = atob(fileContentBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create File object
    const file = new File([bytes], fileName, { type: mimeType });

    // Use DataTransfer to set files
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;

    // Dispatch change event
    input.dispatchEvent(new Event('change', { bubbles: true }));

    return {
      success: true,
      fileName,
      fileSize: file.size,
      mimeType
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ========== Recording Functions ==========

// Start recording on current tab
async function startRecording() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) throw new Error('No active tab');

  recordingTabId = tabs[0].id;
  isRecording = true;
  currentRecording = [];
  lastSaved = false;

  // Inject recorder script
  await chrome.scripting.executeScript({
    target: { tabId: recordingTabId },
    files: ['recorder.js']
  });

  // Tell the recorder to start
  await chrome.tabs.sendMessage(recordingTabId, { type: 'start_recording' });

  console.log('[Background] Recording started on tab', recordingTabId);
}

// Stop recording
async function stopRecording() {
  if (recordingTabId) {
    try {
      await chrome.tabs.sendMessage(recordingTabId, { type: 'stop_recording' });
    } catch (err) {
      // Tab may have been closed
    }
  }

  isRecording = false;
  console.log('[Background] Recording stopped,', currentRecording.length, 'actions captured');
}

// Save recording with a name
async function saveRecording(name) {
  if (currentRecording.length === 0) {
    throw new Error('No actions to save');
  }

  // Load existing recordings
  const result = await chrome.storage.local.get('recordings');
  const recordings = result.recordings || {};

  // Save with name as key
  recordings[name] = {
    name,
    actions: currentRecording,
    createdAt: Date.now(),
    url: currentRecording[0]?.url || ''
  };

  await chrome.storage.local.set({ recordings });

  // Clear current recording
  currentRecording = [];
  lastSaved = true;
  recordingTabId = null;

  console.log('[Background] Recording saved as:', name);
  return { success: true, name, actionCount: recordings[name].actions.length };
}

// Get all saved recordings
async function getRecordings() {
  const result = await chrome.storage.local.get('recordings');
  return result.recordings || {};
}

// Delete a recording
async function deleteRecording(name) {
  const result = await chrome.storage.local.get('recordings');
  const recordings = result.recordings || {};

  if (!recordings[name]) {
    throw new Error(`Recording "${name}" not found`);
  }

  delete recordings[name];
  await chrome.storage.local.set({ recordings });

  return { success: true, deleted: name };
}

// Get a single recording by name
async function getRecordingByName(name) {
  const recordings = await getRecordings();
  if (!recordings[name]) {
    throw new Error(`Recording "${name}" not found`);
  }
  return recordings[name];
}

// Replay a recording
async function replayRecording(name) {
  const recording = await getRecordingByName(name);
  const results = [];

  for (const action of recording.actions) {
    try {
      let result;

      switch (action.type) {
        case 'navigate':
          result = await navigate(action.url);
          // Wait for page to load
          await new Promise(r => setTimeout(r, 1000));
          break;

        case 'click':
          result = await click(action.selector);
          await new Promise(r => setTimeout(r, 300));
          break;

        case 'type':
          result = await type(action.selector, action.value);
          await new Promise(r => setTimeout(r, 100));
          break;

        case 'select':
          result = await selectOption(action.selector, action.value);
          await new Promise(r => setTimeout(r, 100));
          break;

        case 'keypress':
          result = await pressKey(action.key, action.selector);
          await new Promise(r => setTimeout(r, 100));
          break;

        case 'upload':
          // For uploads, we need the file path - caller must provide it
          result = { skipped: true, reason: 'File uploads require file path parameter' };
          break;

        default:
          result = { skipped: true, reason: `Unknown action type: ${action.type}` };
      }

      results.push({
        action: action.type,
        selector: action.selector,
        success: true,
        result
      });
    } catch (err) {
      results.push({
        action: action.type,
        selector: action.selector,
        success: false,
        error: err.message
      });
    }
  }

  return {
    success: true,
    recording: name,
    actionsExecuted: results.length,
    results
  };
}

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get_status') {
    sendResponse({
      connected: ws && ws.readyState === WebSocket.OPEN,
      sessionEnabled,
      isRecording,
      actionCount: currentRecording.length,
      lastSaved
    });
    return true;
  }

  if (message.type === 'toggle_session') {
    toggleSession().then(enabled => {
      sendResponse({ success: true, enabled });
    });
    return true;
  }

  if (message.type === 'start_recording') {
    startRecording()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'stop_recording') {
    stopRecording()
      .then(() => sendResponse({ success: true, actionCount: currentRecording.length }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'save_recording') {
    saveRecording(message.name)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'record_action') {
    // Action recorded by content script
    if (isRecording && message.action) {
      currentRecording.push(message.action);
      console.log('[Background] Recorded action:', message.action.type, message.action.selector);
    }
    sendResponse({ success: true });
    return true;
  }

  return true;
});

// Start connection when extension loads
connect();

// Also try to reconnect when service worker wakes up
chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] Extension started');
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connect();
  }
});

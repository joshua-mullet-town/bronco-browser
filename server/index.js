#!/usr/bin/env node
/**
 * Bronco Browser MCP Server
 *
 * Wrangle your browser.
 * Uses your existing browser with file upload support.
 * Part of Mullet Town - https://mullet.town
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer } from 'ws';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { resolve, join, basename } from 'path';

// Directory for storing recordings
const RECORDINGS_DIR = resolve(process.env.HOME, '.bronco-browser-recordings');

const WS_PORT = 9876;

// State
let extensionSocket = null;
let pendingRequests = new Map();
let requestId = 0;

// Create WebSocket server for extension
const wss = new WebSocketServer({ port: WS_PORT });
console.error(`[Bronco] WebSocket server listening on ws://localhost:${WS_PORT}`);

wss.on('connection', (socket) => {
  console.error('[Bronco] Extension connected');
  extensionSocket = socket;

  socket.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      // Handle keepalive
      if (message.type === 'keepalive') {
        return;
      }

      // Handle extension ready
      if (message.type === 'extension_ready') {
        console.error('[Bronco] Extension ready');
        return;
      }

      // Handle response to our request
      if (message.id !== undefined && pendingRequests.has(message.id)) {
        const { resolve, reject } = pendingRequests.get(message.id);
        pendingRequests.delete(message.id);

        if (message.error) {
          reject(new Error(message.error));
        } else {
          resolve(message.result);
        }
      }
    } catch (err) {
      console.error('[Bronco] Error parsing message:', err);
    }
  });

  socket.on('close', () => {
    console.error('[Bronco] Extension disconnected');
    extensionSocket = null;
    // Reject all pending requests
    for (const [id, { reject }] of pendingRequests) {
      reject(new Error('Extension disconnected'));
    }
    pendingRequests.clear();
  });

  socket.on('error', (err) => {
    console.error('[Bronco] Socket error:', err);
  });
});

// Send message to extension and wait for response
function sendToExtension(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!extensionSocket) {
      reject(new Error(`Browser extension not connected.

To use Bronco Browser:
1. Install the Chrome extension from: https://github.com/mullet-town/bronco-browser
   (Clone the repo, go to chrome://extensions, enable Developer mode, Load unpacked → select extension folder)
2. Open Chrome
3. Click the Bronco Browser extension icon to enable the current tab

The extension must be running and connected for browser automation to work.`));
      return;
    }

    const id = ++requestId;
    pendingRequests.set(id, { resolve, reject });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }
    }, 30000);

    extensionSocket.send(JSON.stringify({ id, method, params }));
  });
}

// Create MCP server
const server = new Server(
  {
    name: 'browser-mcp-bridge',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'browser_list_tabs',
        description: 'List all enabled browser tabs (user must enable tabs via extension icon)',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'browser_connect_tab',
        description: 'Connect to a specific browser tab for automation',
        inputSchema: {
          type: 'object',
          properties: {
            tabId: {
              type: 'number',
              description: 'The ID of the tab to connect to',
            },
          },
          required: ['tabId'],
        },
      },
      {
        name: 'browser_disconnect_tab',
        description: 'Disconnect from the currently connected tab',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'browser_get_page_info',
        description: 'Get information about the currently connected tab',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'browser_navigate',
        description: 'Navigate the connected tab to a URL',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to navigate to',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'browser_click',
        description: 'Click an element on the page',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the element to click (e.g., "#submit-btn", "button.primary")',
            },
          },
          required: ['selector'],
        },
      },
      {
        name: 'browser_type',
        description: 'Type text into an input element',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the input element',
            },
            text: {
              type: 'string',
              description: 'Text to type into the element',
            },
          },
          required: ['selector', 'text'],
        },
      },
      {
        name: 'browser_select_option',
        description: 'Select an option from a dropdown',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the select element',
            },
            value: {
              type: 'string',
              description: 'Value of the option to select',
            },
          },
          required: ['selector', 'value'],
        },
      },
      {
        name: 'browser_press_key',
        description: 'Press a keyboard key',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Key to press (e.g., "Enter", "Tab", "Escape", "ArrowDown")',
            },
            selector: {
              type: 'string',
              description: 'Optional CSS selector for element to focus first',
            },
          },
          required: ['key'],
        },
      },
      {
        name: 'browser_screenshot',
        description: 'Take a screenshot of the current page',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'browser_go_back',
        description: 'Go back in browser history',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'browser_go_forward',
        description: 'Go forward in browser history',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'browser_console_messages',
        description: 'Get console messages from the page. First call installs interceptor, subsequent calls return captured messages.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'browser_snapshot',
        description: 'Get a snapshot of interactive elements on the page with refs for clicking/typing',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'browser_tab_new',
        description: 'Create a new browser tab (auto-enabled for automation)',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to open in the new tab (defaults to blank)',
            },
          },
          required: [],
        },
      },
      {
        name: 'browser_upload_file',
        description: 'Upload a file to a file input element on the connected page',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the file input element',
            },
            filePath: {
              type: 'string',
              description: 'Local file path to upload',
            },
            fileName: {
              type: 'string',
              description: 'Name to give the file (defaults to basename of filePath)',
            },
            mimeType: {
              type: 'string',
              description: 'MIME type of the file (auto-detected if not provided)',
            },
          },
          required: ['selector', 'filePath'],
        },
      },
      // Phase 2 tools
      {
        name: 'browser_hover',
        description: 'Hover over an element on the page (triggers CSS :hover states, tooltips)',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the element to hover over',
            },
          },
          required: ['selector'],
        },
      },
      {
        name: 'browser_wait',
        description: 'Wait for a specified number of seconds',
        inputSchema: {
          type: 'object',
          properties: {
            seconds: {
              type: 'number',
              description: 'Number of seconds to wait',
            },
          },
          required: ['seconds'],
        },
      },
      {
        name: 'browser_drag',
        description: 'Drag an element to another element or position',
        inputSchema: {
          type: 'object',
          properties: {
            sourceSelector: {
              type: 'string',
              description: 'CSS selector for the element to drag',
            },
            targetSelector: {
              type: 'string',
              description: 'CSS selector for the drop target',
            },
          },
          required: ['sourceSelector', 'targetSelector'],
        },
      },
      {
        name: 'browser_handle_dialog',
        description: 'Handle browser dialogs (alert, confirm, prompt). Call this BEFORE triggering the dialog.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action to take: "accept" or "dismiss"',
              enum: ['accept', 'dismiss'],
            },
            promptText: {
              type: 'string',
              description: 'Text to enter for prompt dialogs (optional)',
            },
          },
          required: ['action'],
        },
      },
      {
        name: 'browser_tab_close',
        description: 'Close a specific browser tab',
        inputSchema: {
          type: 'object',
          properties: {
            tabId: {
              type: 'number',
              description: 'The ID of the tab to close (defaults to connected tab)',
            },
          },
          required: [],
        },
      },
      // Phase 3 tools
      {
        name: 'browser_scroll',
        description: 'Scroll the page or an element',
        inputSchema: {
          type: 'object',
          properties: {
            direction: {
              type: 'string',
              description: 'Direction to scroll: "up", "down", "left", "right"',
              enum: ['up', 'down', 'left', 'right'],
            },
            amount: {
              type: 'number',
              description: 'Amount to scroll in pixels (default 500)',
            },
            selector: {
              type: 'string',
              description: 'Optional CSS selector for element to scroll (defaults to page)',
            },
          },
          required: ['direction'],
        },
      },
      {
        name: 'browser_wait_for_selector',
        description: 'Wait until an element appears on the page',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector to wait for',
            },
            timeout: {
              type: 'number',
              description: 'Maximum time to wait in milliseconds (default 10000)',
            },
          },
          required: ['selector'],
        },
      },
      {
        name: 'browser_evaluate',
        description: 'Execute JavaScript code in the page context and return the result',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'JavaScript code to execute',
            },
          },
          required: ['code'],
        },
      },
      {
        name: 'browser_get_cookies',
        description: 'Get cookies for the current page',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'browser_set_cookie',
        description: 'Set a cookie for the current page',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Cookie name',
            },
            value: {
              type: 'string',
              description: 'Cookie value',
            },
            domain: {
              type: 'string',
              description: 'Cookie domain (optional)',
            },
            path: {
              type: 'string',
              description: 'Cookie path (default "/")',
            },
            secure: {
              type: 'boolean',
              description: 'Secure flag (default false)',
            },
            httpOnly: {
              type: 'boolean',
              description: 'HttpOnly flag (default false)',
            },
            expirationDate: {
              type: 'number',
              description: 'Expiration timestamp in seconds since epoch',
            },
          },
          required: ['name', 'value'],
        },
      },
      {
        name: 'browser_network_requests',
        description: 'Get captured network requests. First call installs interceptor, subsequent calls return captured requests.',
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              description: 'Optional URL pattern to filter requests',
            },
          },
          required: [],
        },
      },
      // Recording tools
      {
        name: 'browser_list_recordings',
        description: 'List all saved recordings. Recordings are user-created action sequences that can be replayed.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'browser_get_recording',
        description: 'Get details of a specific recording by name, including all recorded actions.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the recording to retrieve',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'browser_replay_recording',
        description: 'Replay a saved recording by name. Executes all recorded actions in sequence.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the recording to replay',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'browser_delete_recording',
        description: 'Delete a saved recording by name.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the recording to delete',
            },
          },
          required: ['name'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case 'browser_list_tabs':
        result = await sendToExtension('list_tabs');
        break;

      case 'browser_connect_tab':
        result = await sendToExtension('connect_tab', { tabId: args.tabId });
        break;

      case 'browser_disconnect_tab':
        result = await sendToExtension('disconnect_tab');
        break;

      case 'browser_get_page_info':
        result = await sendToExtension('get_page_info');
        break;

      case 'browser_navigate':
        result = await sendToExtension('navigate', { url: args.url });
        break;

      case 'browser_click':
        result = await sendToExtension('click', { selector: args.selector });
        break;

      case 'browser_type':
        result = await sendToExtension('type', { selector: args.selector, text: args.text });
        break;

      case 'browser_select_option':
        result = await sendToExtension('select_option', { selector: args.selector, value: args.value });
        break;

      case 'browser_press_key':
        result = await sendToExtension('press_key', { key: args.key, selector: args.selector });
        break;

      case 'browser_screenshot':
        result = await sendToExtension('screenshot');
        break;

      case 'browser_go_back':
        result = await sendToExtension('go_back');
        break;

      case 'browser_go_forward':
        result = await sendToExtension('go_forward');
        break;

      case 'browser_console_messages':
        result = await sendToExtension('console_messages');
        break;

      case 'browser_snapshot':
        result = await sendToExtension('snapshot');
        break;

      case 'browser_tab_new':
        result = await sendToExtension('tab_new', { url: args.url });
        break;

      case 'browser_upload_file': {
        // Read file from disk
        const filePath = resolve(args.filePath);
        const fileContent = readFileSync(filePath);
        const base64Content = fileContent.toString('base64');

        // Determine filename
        const fileName = args.fileName || filePath.split('/').pop();

        // Determine mime type
        const mimeType = args.mimeType || getMimeType(fileName);

        result = await sendToExtension('upload_file', {
          selector: args.selector,
          fileName,
          fileContent: base64Content,
          mimeType,
        });
        break;
      }

      // Phase 2 tools
      case 'browser_hover':
        result = await sendToExtension('hover', { selector: args.selector });
        break;

      case 'browser_wait':
        // Wait is handled server-side, no need to send to extension
        await new Promise(resolve => setTimeout(resolve, args.seconds * 1000));
        result = { success: true, waited: args.seconds };
        break;

      case 'browser_drag':
        result = await sendToExtension('drag', {
          sourceSelector: args.sourceSelector,
          targetSelector: args.targetSelector
        });
        break;

      case 'browser_handle_dialog':
        result = await sendToExtension('handle_dialog', {
          action: args.action,
          promptText: args.promptText
        });
        break;

      case 'browser_tab_close':
        result = await sendToExtension('tab_close', { tabId: args.tabId });
        break;

      // Phase 3 tools
      case 'browser_scroll':
        result = await sendToExtension('scroll', {
          direction: args.direction,
          amount: args.amount,
          selector: args.selector
        });
        break;

      case 'browser_wait_for_selector':
        result = await sendToExtension('wait_for_selector', {
          selector: args.selector,
          timeout: args.timeout
        });
        break;

      case 'browser_evaluate':
        result = await sendToExtension('evaluate', { code: args.code });
        break;

      case 'browser_get_cookies':
        result = await sendToExtension('get_cookies');
        break;

      case 'browser_set_cookie':
        result = await sendToExtension('set_cookie', {
          name: args.name,
          value: args.value,
          domain: args.domain,
          path: args.path,
          secure: args.secure,
          httpOnly: args.httpOnly,
          expirationDate: args.expirationDate,
        });
        break;

      case 'browser_network_requests':
        result = await sendToExtension('network_requests', { filter: args.filter });
        break;

      // Recording tools - now use file-based storage
      case 'browser_list_recordings':
        result = listRecordingsFromDisk();
        break;

      case 'browser_get_recording':
        result = getRecordingFromDisk(args.name);
        break;

      case 'browser_replay_recording':
        result = await replayRecordingFromDisk(args.name);
        break;

      case 'browser_delete_recording':
        result = deleteRecordingFromDisk(args.name);
        break;

      case 'browser_save_recording':
        // Save recording from extension to disk
        const recording = await sendToExtension('get_current_recording');
        result = saveRecordingToDisk(args.name, recording);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Simple mime type detection
function getMimeType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes = {
    'txt': 'text/plain',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'xml': 'application/xml',
    'pdf': 'application/pdf',
    'zip': 'application/zip',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'mp3': 'audio/mpeg',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'csv': 'text/csv',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// ========== File-based Recording Storage ==========

// Ensure recordings directory exists
function ensureRecordingsDir() {
  if (!existsSync(RECORDINGS_DIR)) {
    mkdirSync(RECORDINGS_DIR, { recursive: true });
  }
}

// Convert name to safe filename
function toFilename(name) {
  return name.replace(/[^a-zA-Z0-9-_]/g, '_') + '.json';
}

// List all recordings from disk
function listRecordingsFromDisk() {
  ensureRecordingsDir();
  const files = readdirSync(RECORDINGS_DIR).filter(f => f.endsWith('.json'));
  const recordings = {};

  for (const file of files) {
    try {
      const content = readFileSync(join(RECORDINGS_DIR, file), 'utf-8');
      const recording = JSON.parse(content);
      recordings[recording.name] = {
        name: recording.name,
        actionCount: recording.actions?.length || 0,
        createdAt: recording.createdAt,
        url: recording.url,
        file: join(RECORDINGS_DIR, file)
      };
    } catch (err) {
      console.error(`[Bronco] Error reading recording ${file}:`, err.message);
    }
  }

  return recordings;
}

// Get a single recording from disk
function getRecordingFromDisk(name) {
  ensureRecordingsDir();
  const filename = toFilename(name);
  const filepath = join(RECORDINGS_DIR, filename);

  if (!existsSync(filepath)) {
    throw new Error(`Recording "${name}" not found`);
  }

  const content = readFileSync(filepath, 'utf-8');
  return JSON.parse(content);
}

// Save a recording to disk
function saveRecordingToDisk(name, recording) {
  ensureRecordingsDir();
  const filename = toFilename(name);
  const filepath = join(RECORDINGS_DIR, filename);

  const data = {
    name,
    actions: recording.actions || recording,
    createdAt: Date.now(),
    url: recording.url || (recording.actions?.[0]?.url) || ''
  };

  writeFileSync(filepath, JSON.stringify(data, null, 2));

  return {
    success: true,
    name,
    file: filepath,
    actionCount: data.actions.length
  };
}

// Delete a recording from disk
function deleteRecordingFromDisk(name) {
  ensureRecordingsDir();
  const filename = toFilename(name);
  const filepath = join(RECORDINGS_DIR, filename);

  if (!existsSync(filepath)) {
    throw new Error(`Recording "${name}" not found`);
  }

  unlinkSync(filepath);
  return { success: true, deleted: name };
}

// Replay a recording from disk
async function replayRecordingFromDisk(name) {
  const recording = getRecordingFromDisk(name);
  const results = [];

  for (const action of recording.actions) {
    try {
      let result;

      switch (action.type) {
        case 'navigate':
          result = await sendToExtension('navigate', { url: action.url });
          await new Promise(r => setTimeout(r, 1000));
          break;

        case 'click':
          result = await sendToExtension('click', { selector: action.selector });
          await new Promise(r => setTimeout(r, 300));
          break;

        case 'type':
          result = await sendToExtension('type', { selector: action.selector, text: action.value });
          await new Promise(r => setTimeout(r, 100));
          break;

        case 'select':
          result = await sendToExtension('select_option', { selector: action.selector, value: action.value });
          await new Promise(r => setTimeout(r, 100));
          break;

        case 'keypress':
          result = await sendToExtension('press_key', { key: action.key, selector: action.selector });
          await new Promise(r => setTimeout(r, 100));
          break;

        case 'upload':
          // Try to find file - check if filePath is specified or look in common locations
          if (action.filePath && existsSync(action.filePath)) {
            const fileContent = readFileSync(action.filePath);
            const base64Content = fileContent.toString('base64');
            result = await sendToExtension('upload_file', {
              selector: action.selector,
              fileName: action.fileName,
              fileContent: base64Content,
              mimeType: action.mimeType
            });
          } else {
            result = {
              skipped: true,
              reason: `File not found. Add "filePath" to the recording: ${action.fileName}`
            };
          }
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

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Bronco] Server started');
}

main().catch((error) => {
  console.error('[Bronco] Fatal error:', error);
  process.exit(1);
});

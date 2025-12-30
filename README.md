# Bronco Browser

**Wrangle your browser.** A browser automation tool that uses your *actual* browser with all your cookies, logins, and extensions intact. Part of the [Mullet Town](https://mullet.town) family.

## Why Bronco Browser?

| Feature | Playwright MCP | BrowserMCP | Bronco Browser |
|---------|---------------|------------|----------------|
| Uses your real browser | No (spawns new) | Yes | Yes |
| File uploads | Yes | No | Yes |
| Open source | Yes | No (extension) | Yes |
| Your cookies/logins | No | Yes | Yes |

**Two things that make this special:**
1. **Uses your existing browser** - No spawning a fresh Chromium. Your logged-in sessions, cookies, and extensions all work.
2. **Supports file uploads** - BrowserMCP can't do this. We can.

## Setup

### 1. Install the Chrome Extension

1. Clone this repo (or download the `extension/` folder)
2. Open Chrome → `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" → select the `extension/` folder

### 2. Add MCP Server to Claude Code

Add to your `~/.claude.json`:

```json
{
  "mcpServers": {
    "bronco-browser": {
      "command": "npx",
      "args": ["bronco-browser"]
    }
  }
}
```

### 3. Restart Claude Code

The tools will be available. Click the extension icon to enable a tab for automation.

## Available Tools

### Core
- `browser_list_tabs` - List all enabled browser tabs
- `browser_connect_tab` - Connect to a specific tab by ID
- `browser_disconnect_tab` - Disconnect from current tab
- `browser_get_page_info` - Get info about connected tab

### Navigation
- `browser_navigate` - Go to a URL
- `browser_go_back` - Browser back button
- `browser_go_forward` - Browser forward button
- `browser_tab_new` - Open a new tab
- `browser_tab_close` - Close a tab

### Interaction
- `browser_click` - Click an element
- `browser_type` - Type text into an input
- `browser_select_option` - Select from a dropdown
- `browser_press_key` - Press a keyboard key
- `browser_hover` - Hover over an element
- `browser_drag` - Drag and drop
- `browser_scroll` - Scroll the page
- `browser_upload_file` - Upload a file to a file input
- `browser_handle_dialog` - Handle alert/confirm/prompt dialogs

### Inspection
- `browser_snapshot` - Get interactive elements with refs
- `browser_screenshot` - Take a screenshot
- `browser_console_messages` - Get console logs
- `browser_network_requests` - Get captured network requests
- `browser_get_cookies` / `browser_set_cookie` - Manage cookies
- `browser_evaluate` - Execute JavaScript
- `browser_wait` / `browser_wait_for_selector` - Wait utilities

### Recording
- `browser_list_recordings` - List saved recordings
- `browser_get_recording` - Get a recording's actions
- `browser_replay_recording` - Replay a saved recording
- `browser_delete_recording` - Delete a recording

## Recording Actions

Click the extension popup to record a sequence of actions (clicks, typing, file uploads), then save and replay them later.

## Architecture

```
┌─────────────────────┐     WebSocket      ┌─────────────────────┐
│   Bronco MCP Server │ ←───────────────→  │  Chrome Extension   │
│   (Node.js)         │   localhost:9876   │  (background.js)    │
└─────────────────────┘                    └─────────────────────┘
         ↑                                          ↓
         │                                 ┌─────────────────────┐
    Claude Code                            │  Browser Tab        │
    (stdio)                                │  (your real browser)│
                                           └─────────────────────┘
```

## License

MIT - A Mullet Town project

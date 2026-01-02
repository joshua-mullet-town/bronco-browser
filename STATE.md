# Bronco Browser - State

*What's built and working.*

## v1.1 - Parallel Operations (2024-12-31)

### Parallelization Support
- All tab-operating tools now accept optional `tabId` parameter
- If `tabId` provided → operate on that specific tab
- If `tabId` omitted → fall back to `connectedTabId` (backward compatible)
- Multiple agents can work on different tabs simultaneously
- No race conditions - each agent targets its own tab explicitly

### Reliability Improvements
- Automatic port recovery: kills zombie processes on port 9876
- Graceful shutdown on SIGINT/SIGTERM/SIGHUP
- Better error messages with actionable hints

---

## v1.0 - Complete

### Core Architecture
- Chrome extension (Manifest V3) connects via WebSocket to MCP server
- MCP server uses stdio transport for Claude Code integration
- Session-based control: user enables/disables via extension icon
- Legacy connect/disconnect pattern still supported

### Tools Implemented

**Tab Management**
- `browser_list_tabs` - List all enabled tabs
- `browser_connect_tab` - Connect to a specific tab
- `browser_disconnect_tab` - Disconnect from current tab
- `browser_get_page_info` - Get info about connected tab
- `browser_tab_new` - Create new tab
- `browser_tab_close` - Close a tab

**Navigation**
- `browser_navigate` - Go to URL
- `browser_go_back` - Browser back
- `browser_go_forward` - Browser forward

**Interaction**
- `browser_click` - Click element (CSS selector)
- `browser_type` - Type text into input
- `browser_select_option` - Select dropdown option
- `browser_press_key` - Press keyboard key
- `browser_hover` - Hover over element
- `browser_drag` - Drag and drop
- `browser_scroll` - Scroll page/element
- `browser_upload_file` - Upload file to file input
- `browser_handle_dialog` - Handle alert/confirm/prompt

**Inspection**
- `browser_snapshot` - Get interactive elements with refs
- `browser_screenshot` - Take screenshot
- `browser_console_messages` - Get console logs
- `browser_network_requests` - Get captured network requests
- `browser_get_cookies` / `browser_set_cookie` - Cookie management
- `browser_evaluate` - Execute JavaScript
- `browser_wait` / `browser_wait_for_selector` - Wait utilities

**Recording**
- `browser_list_recordings` - List saved recordings
- `browser_get_recording` - Get recording details
- `browser_replay_recording` - Replay a recording
- `browser_delete_recording` - Delete a recording

### Extension UI
- Icon states: Gray (disconnected), Yellow (connected), Green (enabled)
- Popup for session toggle and recording controls
- Recording: click extension to record actions, save, replay

### Distribution
- Published to npm as `bronco-browser`
- Install via `npx bronco-browser`

# Bronco Browser - Development Plan

*Wrangle your browser.*

## Goal
A browser automation tool we fully control. Connect to an existing browser, do stuff.
No Playwright spawning its own browser. No closed-source extensions. Just our code.

Part of the [Mullet Town](https://mullet.town) family.

---

## Success Criteria

1. **Connect to existing browser** - Use your real browser with your cookies, logins, extensions
2. **Per-tab control** - Each tab opts in/out of automation independently
3. **Visual status** - Extension icon shows: disconnected / connected / controlling this tab
4. **Core automation** - Navigate, click, type, screenshot, upload files
5. **No black boxes** - We own all the code

---

## Complete Tool List (Every Single One)

### Phase 0: Tab Opt-In System
| Story | Status |
|-------|--------|
| User clicks extension icon to enable/disable current tab | ⬜ TODO |
| Icon states: Gray (disconnected), Yellow (connected, not enabled), Green (enabled) | ⬜ TODO |
| Claude only sees tabs the user has enabled | ⬜ TODO |
| Claude can connect to an enabled tab by ID | ⬜ TODO |

### Phase 1: Core (Build First)
| Tool | What it does | How to build | Status |
|------|--------------|--------------|--------|
| `browser_list_tabs` | List all enabled tabs | `chrome.tabs.query` | ✅ DONE |
| `browser_connect_tab` | Connect to a tab by ID | Store tab ID in state | ✅ DONE |
| `browser_disconnect_tab` | Disconnect from current tab | Clear state | ✅ DONE |
| `browser_get_page_info` | Get info about connected tab | `chrome.tabs.get` | ✅ DONE |
| `browser_upload_file` | Upload file to file input | `DataTransfer` API | ✅ DONE |
| `browser_navigate` | Go to a URL | `chrome.tabs.update({url})` | ⬜ TODO |
| `browser_click` | Click element (CSS selector or ref) | `element.click()` | ⬜ TODO |
| `browser_type` | Type text into input | Set value + dispatch `input` event | ⬜ TODO |
| `browser_select_option` | Select from dropdown | Set `select.value` + dispatch `change` | ⬜ TODO |
| `browser_press_key` | Press keyboard key | Dispatch `KeyboardEvent` | ⬜ TODO |
| `browser_snapshot` | Get page structure with refs | Walk DOM, find interactive elements | ⬜ TODO |
| `browser_screenshot` | Take picture of page | `chrome.tabs.captureVisibleTab` | ⬜ TODO |
| `browser_go_back` | Browser back button | `history.back()` | ⬜ TODO |
| `browser_go_forward` | Browser forward button | `history.forward()` | ⬜ TODO |
| `browser_console_messages` | Read console.log output | Override `console.*` methods | ⬜ TODO |
| `browser_tab_new` | Open a new tab | `chrome.tabs.create` | ⬜ TODO |

### Phase 2: Extended (Build Second)
| Tool | What it does | How to build | Status |
|------|--------------|--------------|--------|
| `browser_hover` | Hover over element | Dispatch `mouseenter`/`mouseover` | ⬜ TODO |
| `browser_wait_for` | Wait for element to appear | Poll with `MutationObserver` | ⬜ TODO |
| `browser_drag` | Drag and drop | Dispatch drag events sequence | ⬜ TODO |
| `browser_handle_dialog` | Click OK/Cancel on alerts | `window.confirm` override | ⬜ TODO |
| `browser_tab_close` | Close a tab | `chrome.tabs.remove` | ⬜ TODO |

### Phase 3: Probably Never
| Tool | What it does | Why skip |
|------|--------------|----------|
| `browser_pdf_save` | Save page as PDF | Niche use case |
| `browser_resize` | Resize browser window | Rarely needed |
| `browser_network_requests` | Intercept network traffic | Complex, security concerns |
| `browser_install_mouse` | Low-level mouse control | Overkill |
| `browser_generate_playwright_test` | Generate test code | Not relevant to us |
| `browser_close` | Close browser entirely | Dangerous |

---

## What We're Building
- **Like BrowserMCP**: Extension connects to your real browser
- **Like Playwright**: Full feature set, accessibility snapshots
- **Unlike both**: Per-tab control, visual status, file uploads, open source

---

## Current Status

### What's Built
- ✅ Chrome extension skeleton (Manifest V3)
- ✅ WebSocket connection to MCP server
- ✅ MCP server with stdio transport
- ✅ `browser_list_tabs` - List all open tabs
- ✅ `browser_connect_tab` - Connect to a specific tab
- ✅ `browser_disconnect_tab` - Disconnect from current tab
- ✅ `browser_get_page_info` - Get info about connected tab
- ✅ `browser_upload_file` - Upload file to file input

### What's Next
**Phase 0**: Tab opt-in system with icon states

---

## Technical Notes

### Element Selection Strategy
Support BOTH:
- **CSS Selectors**: `input[type="file"]`, `#submit-btn` - for when you know what you want
- **Accessibility Refs**: `ref=s1e16` - for when Claude needs to explore a page first via snapshot

### Implementation Complexity

**Easy** (just JavaScript in page):
- navigate, go_back, go_forward, click, type, hover, press_key, select_option

**Medium** (extension API):
- screenshot (`chrome.tabs.captureVisibleTab`)

**Hard** (need to figure out):
- snapshot (walk DOM and build structured tree with refs)

---

## Log

**2024-12-29**: MVP complete. File upload works end-to-end. Plan solidified.

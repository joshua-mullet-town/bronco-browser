/**
 * Content Script
 * Runs in the context of web pages
 * For now, just logs that it's loaded - main work happens via executeScript in background.js
 */

console.log('[Browser MCP Bridge] Content script loaded on:', window.location.href);

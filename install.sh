#!/bin/bash

# Bronco Browser Install Script
# Installs the MCP server, slash command, and creates test directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRONCO_DIR="$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "🐴 Bronco Browser Installer"
echo "==========================="
echo ""

# Check if target directory is provided
if [ -z "$1" ]; then
    echo -e "${YELLOW}Usage: ./install.sh <target-project-directory>${NC}"
    echo ""
    echo "Example:"
    echo "  ./install.sh /path/to/my-project"
    echo ""
    echo "This will:"
    echo "  1. Add bronco-browser MCP to your Claude settings"
    echo "  2. Create bronco-tests/ directory with example test"
    echo "  3. Install /bronco-run-tests slash command"
    echo ""
    exit 1
fi

TARGET_DIR="$(cd "$1" 2>/dev/null && pwd)" || {
    echo -e "${RED}Error: Directory '$1' does not exist${NC}"
    exit 1
}

echo "Target project: $TARGET_DIR"
echo ""

# Step 1: Add MCP config to Claude settings
echo "Step 1: Configuring MCP server..."

CLAUDE_CONFIG="$HOME/.claude.json"

if [ ! -f "$CLAUDE_CONFIG" ]; then
    echo '{"mcpServers":{}}' > "$CLAUDE_CONFIG"
    echo "  Created new Claude config file"
fi

# Check if jq is available
if command -v jq &> /dev/null; then
    # Use jq for proper JSON manipulation
    TEMP_CONFIG=$(mktemp)
    jq --arg dir "$BRONCO_DIR" '.mcpServers["bronco-browser"] = {
        "command": "node",
        "args": [($dir + "/server/index.js")]
    }' "$CLAUDE_CONFIG" > "$TEMP_CONFIG" && mv "$TEMP_CONFIG" "$CLAUDE_CONFIG"
    echo -e "  ${GREEN}✓${NC} Added bronco-browser to MCP servers"
else
    echo -e "  ${YELLOW}⚠${NC} jq not found - please manually add to ~/.claude.json:"
    echo ""
    echo '    "bronco-browser": {'
    echo '      "command": "node",'
    echo "      \"args\": [\"$BRONCO_DIR/server/index.js\"]"
    echo '    }'
    echo ""
fi

# Step 2: Create bronco-tests directory
echo ""
echo "Step 2: Creating bronco-tests directory..."

TESTS_DIR="$TARGET_DIR/bronco-tests"
mkdir -p "$TESTS_DIR"

# Create README
cat > "$TESTS_DIR/README.md" << 'EOF'
# Bronco Browser Tests

This directory contains browser tests for Bronco Browser.

## Running Tests

Use the slash command in Claude Code:

```
/bronco-run-tests
```

This will:
1. Create an isolated browser window
2. Run all `*.md` tests in parallel
3. Report results with timing

## Writing Tests

Each `.md` file is a test. Use this format:

```markdown
# Test Name

## Instructions
1. Navigate to https://example.com
2. Click the login button
3. Verify the login form appears

## Expectations
- Login form should be visible
- Email and password fields should exist
```

## Tips

- Tests run in parallel - each gets its own tab
- Use specific selectors when possible
- Expected failures should note "This SHOULD fail"
EOF

echo -e "  ${GREEN}✓${NC} Created $TESTS_DIR/README.md"

# Create example test
cat > "$TESTS_DIR/01-example.md" << 'EOF'
# Example Test

A simple test to verify Bronco Browser is working.

## Instructions

1. Navigate to https://example.com
2. Verify the page loads successfully
3. Check that the page title contains "Example"

## Expectations

- Page should load without errors
- Title should be "Example Domain"
- There should be at least one link on the page
EOF

echo -e "  ${GREEN}✓${NC} Created $TESTS_DIR/01-example.md"

# Step 3: Install slash command
echo ""
echo "Step 3: Installing slash command..."

COMMANDS_DIR="$TARGET_DIR/.claude/commands"
mkdir -p "$COMMANDS_DIR"

cp "$BRONCO_DIR/.claude/commands/bronco-run-tests.md" "$COMMANDS_DIR/"
echo -e "  ${GREEN}✓${NC} Installed /bronco-run-tests command"

# Done!
echo ""
echo "==========================="
echo -e "${GREEN}✓ Installation complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Load the Chrome extension from: $BRONCO_DIR/extension"
echo "  2. Click the Bronco icon on a tab to enable it"
echo "  3. Restart Claude Code to load the MCP server"
echo "  4. Run /bronco-run-tests in your project"
echo ""

#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Colors for terminal output
const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function printHelp() {
  console.log(`
${colors.bold('🐴 Bronco Browser')}

Usage: bronco-browser <command>

Commands:
  init      Initialize Bronco Browser in current directory
  serve     Start the MCP server (used by Claude)
  help      Show this help message

Examples:
  cd my-project
  npx bronco-browser init

  # Then in Claude Code:
  /bronco-run-tests
`);
}

function initProject() {
  const targetDir = process.cwd();
  const broncoDir = __dirname;

  console.log('');
  console.log(colors.bold('🐴 Bronco Browser Installer'));
  console.log('===========================');
  console.log('');
  console.log(`Target project: ${targetDir}`);
  console.log('');

  // Step 1: Add MCP config to Claude settings
  console.log('Step 1: Configuring MCP server...');

  const claudeConfig = join(process.env.HOME, '.claude.json');
  let config = { mcpServers: {} };

  if (existsSync(claudeConfig)) {
    try {
      config = JSON.parse(readFileSync(claudeConfig, 'utf-8'));
      if (!config.mcpServers) config.mcpServers = {};
    } catch (e) {
      console.log(colors.yellow('  ⚠ Could not parse existing config, creating new one'));
    }
  }

  // Add bronco-browser MCP server
  config.mcpServers['bronco-browser'] = {
    command: 'npx',
    args: ['-y', 'bronco-browser', 'serve']
  };

  writeFileSync(claudeConfig, JSON.stringify(config, null, 2));
  console.log(colors.green('  ✓') + ' Added bronco-browser to MCP servers');

  // Step 2: Create bronco-tests directory
  console.log('');
  console.log('Step 2: Creating bronco-tests directory...');

  const testsDir = join(targetDir, 'bronco-tests');
  mkdirSync(testsDir, { recursive: true });

  // Create README
  const readmeContent = `# Bronco Browser Tests

This directory contains browser tests for Bronco Browser.

## Running Tests

Use the slash command in Claude Code:

\`\`\`
/bronco-run-tests
\`\`\`

This will:
1. Create an isolated browser window
2. Run all \`*.md\` tests in parallel
3. Report results with timing

## Writing Tests

Each \`.md\` file is a test. Use this format:

\`\`\`markdown
# Test Name

## Instructions
1. Navigate to https://example.com
2. Click the login button
3. Verify the login form appears

## Expectations
- Login form should be visible
- Email and password fields should exist
\`\`\`

## Tips

- Tests run in parallel - each gets its own tab
- Use specific selectors when possible
- Expected failures should note "This SHOULD fail"
`;

  writeFileSync(join(testsDir, 'README.md'), readmeContent);
  console.log(colors.green('  ✓') + ' Created bronco-tests/README.md');

  // Create example test
  const exampleTest = `# Example Test

A simple test to verify Bronco Browser is working.

## Instructions

1. Navigate to https://example.com
2. Verify the page loads successfully
3. Check that the page title contains "Example"

## Expectations

- Page should load without errors
- Title should be "Example Domain"
- There should be at least one link on the page
`;

  writeFileSync(join(testsDir, '01-example.md'), exampleTest);
  console.log(colors.green('  ✓') + ' Created bronco-tests/01-example.md');

  // Step 3: Install slash command
  console.log('');
  console.log('Step 3: Installing slash command...');

  const commandsDir = join(targetDir, '.claude', 'commands');
  mkdirSync(commandsDir, { recursive: true });

  const slashCommandPath = join(broncoDir, '.claude', 'commands', 'bronco-run-tests.md');

  if (existsSync(slashCommandPath)) {
    copyFileSync(slashCommandPath, join(commandsDir, 'bronco-run-tests.md'));
    console.log(colors.green('  ✓') + ' Installed /bronco-run-tests command');
  } else {
    // If running from npm package, the command file might be in a different location
    // Create it inline
    const slashCommandContent = `# Bronco Browser Test Runner

You are a test orchestrator for Bronco Browser. Run all browser tests in parallel with window isolation.

## Your Job

1. **Setup**: Create an isolated browser window using \`mcp__bronco-browser__browser_window_new\` - save the windowId
2. **Discover**: Read all test files from \`bronco-tests/*.md\` in this project
3. **Start Timer**: Use Bash to run \`date +%s\` and save the Unix timestamp as START_TIME
4. **Execute**: Spawn ALL test agents in parallel (single message with multiple Task tool calls)
5. **End Timer**: Use Bash to run \`date +%s\` and save as END_TIME, calculate DURATION = END_TIME - START_TIME
6. **Cleanup**: Close the test window using \`mcp__bronco-browser__browser_window_close\` with the windowId
7. **Report**: Summarize all results in a table including the duration

## Agent Prompt Template

CRITICAL: You must include the exact windowId number in the agent prompt. Example:

\`\`\`
You are a test runner. Execute this browser test.

CRITICAL: Create your tab in window 1234567890 (use this exact windowId)

## Test: [name from file]

[paste the Instructions and Expectations sections from the test file]

## How to Execute

1. First, create a tab: \`mcp__bronco-browser__browser_tab_new\` with parameters:
   - url: [the URL from the test]
   - windowId: 1234567890

2. Note the tabId returned, then perform test actions using that tabId

3. Report results in this exact format:

TEST: [name]
RESULT: PASS or FAIL
DETAILS: [observations]
FAILURE_REASON: [only if FAIL]
\`\`\`

## Important

- Use \`model: haiku\` for speed
- Spawn ALL agents in ONE message (parallel execution)
- The windowId MUST be passed as a number, not a string
- Always attempt cleanup even if tests fail

## Timing Instructions

Before spawning agents, run:
\`\`\`bash
date +%s
\`\`\`
This returns a Unix timestamp (e.g., 1735600000). Save this as START_TIME.

After ALL agents complete (you receive all results), run:
\`\`\`bash
date +%s
\`\`\`
Save this as END_TIME. Calculate duration: \`END_TIME - START_TIME\` seconds.

## Final Report Format

\`\`\`
## Browser Test Results

**Duration**: X seconds
**Passed**: X/Y

| Test | Result | Details |
|------|--------|---------|
| name | PASS/FAIL | note |
\`\`\`
`;
    writeFileSync(join(commandsDir, 'bronco-run-tests.md'), slashCommandContent);
    console.log(colors.green('  ✓') + ' Installed /bronco-run-tests command');
  }

  // Done!
  console.log('');
  console.log('===========================');
  console.log(colors.green('✓ Installation complete!'));
  console.log('');
  console.log(colors.bold('Next steps:'));
  console.log('');
  console.log('  1. ' + colors.cyan('Install the Chrome extension'));
  console.log('     https://github.com/joshua-mullet-town/bronco-browser/releases');
  console.log('');
  console.log('  2. ' + colors.cyan('Enable a browser tab'));
  console.log('     Click the Bronco icon on any tab you want to automate');
  console.log('');
  console.log('  3. ' + colors.cyan('Restart Claude Code'));
  console.log('     So it picks up the new MCP server');
  console.log('');
  console.log('  4. ' + colors.cyan('Run your tests'));
  console.log('     Type /bronco-run-tests in Claude Code');
  console.log('');
  console.log(colors.bold('What /bronco-run-tests does:'));
  console.log('  - Creates an isolated browser window for testing');
  console.log('  - Runs all tests in bronco-tests/*.md in parallel');
  console.log('  - Reports results with timing');
  console.log('');
  console.log(colors.bold('Docs:'));
  console.log('  https://github.com/joshua-mullet-town/bronco-browser#readme');
  console.log('');
}

async function startServer() {
  // Dynamic import the server
  const serverPath = join(__dirname, 'server', 'index.js');
  await import(serverPath);
}

// Parse command
const command = process.argv[2];

switch (command) {
  case 'init':
    initProject();
    break;
  case 'serve':
    startServer();
    break;
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  case undefined:
    printHelp();
    break;
  default:
    console.log(colors.red(`Unknown command: ${command}`));
    printHelp();
    process.exit(1);
}

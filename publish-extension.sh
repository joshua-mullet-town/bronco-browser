#!/bin/bash

# Bronco Browser - Chrome Web Store Publish Script
# Uploads and publishes the extension to Chrome Web Store
#
# Required environment variables (set in ~/.bronco-creds or export manually):
#   BRONCO_EXTENSION_ID
#   BRONCO_CLIENT_ID
#   BRONCO_CLIENT_SECRET
#   BRONCO_REFRESH_TOKEN

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load credentials from file if it exists
if [ -f "$HOME/.bronco-creds" ]; then
  source "$HOME/.bronco-creds"
fi

# Check required env vars
if [ -z "$BRONCO_EXTENSION_ID" ] || [ -z "$BRONCO_CLIENT_ID" ] || [ -z "$BRONCO_CLIENT_SECRET" ] || [ -z "$BRONCO_REFRESH_TOKEN" ]; then
  echo "Error: Missing required environment variables."
  echo ""
  echo "Create ~/.bronco-creds with:"
  echo "  export BRONCO_EXTENSION_ID='your-extension-id'"
  echo "  export BRONCO_CLIENT_ID='your-client-id'"
  echo "  export BRONCO_CLIENT_SECRET='your-client-secret'"
  echo "  export BRONCO_REFRESH_TOKEN='your-refresh-token'"
  exit 1
fi

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
ZIP_FILE="bronco-browser-extension-v${VERSION}.zip"

echo "🐴 Bronco Browser Extension Publisher"
echo "======================================"
echo "Version: $VERSION"
echo ""

# Step 1: Create fresh zip
echo "Step 1: Creating extension zip..."
rm -f "$ZIP_FILE"
zip -r "$ZIP_FILE" extension/ \
  -x "extension/.claude/*" \
  -x "*.DS_Store" \
  -x "extension/icons/node_modules/*" \
  -x "extension/icons/package*" \
  -x "extension/icons/generate-icons.js" \
  -x "extension/icons/.claude/*"
echo "  ✓ Created $ZIP_FILE"

# Step 2: Upload to Chrome Web Store
echo ""
echo "Step 2: Uploading to Chrome Web Store..."
npx chrome-webstore-upload-cli upload \
  --source "$ZIP_FILE" \
  --extension-id "$BRONCO_EXTENSION_ID" \
  --client-id "$BRONCO_CLIENT_ID" \
  --client-secret "$BRONCO_CLIENT_SECRET" \
  --refresh-token "$BRONCO_REFRESH_TOKEN"
echo "  ✓ Uploaded"

# Step 3: Publish
echo ""
echo "Step 3: Publishing..."
npx chrome-webstore-upload-cli publish \
  --extension-id "$BRONCO_EXTENSION_ID" \
  --client-id "$BRONCO_CLIENT_ID" \
  --client-secret "$BRONCO_CLIENT_SECRET" \
  --refresh-token "$BRONCO_REFRESH_TOKEN"
echo "  ✓ Published"

echo ""
echo "======================================"
echo "✓ Extension v${VERSION} published to Chrome Web Store!"
echo ""
echo "Note: It may take a few minutes to hours for Google to review and make it live."

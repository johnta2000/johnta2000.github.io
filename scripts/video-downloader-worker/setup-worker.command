#!/bin/zsh

set -e
SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR/../.."

node scripts/video-downloader-worker/setup-worker.mjs
node scripts/video-downloader-worker/install-launch-agent.mjs

echo ""
echo "The john-ta.com downloader worker is ready."
read -r "?Press Return to close…"

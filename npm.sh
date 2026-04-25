#!/bin/bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: ./npm.sh <version>"
  echo "Example: ./npm.sh 0.0.1"
  exit 1
fi

VERSION="$1"

echo "Releasing ssexi-js v${VERSION}..."

cat > package.json <<EOF
{
  "name": "ssexi-js",
  "version": "${VERSION}",
  "description": "ssexi.js - A Small SSE Streaming Companion for fixi.js",
  "main": "ssexi.js",
  "files": [
    "ssexi.js",
    "README.md"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/bigskysoftware/ssexi.git"
  },
  "author": "1cg",
  "license": "BSD-0",
  "keywords": [
    "ssexi",
    "fixi",
    "htmx",
    "sse",
    "server-sent-events",
    "streaming",
    "hypermedia"
  ],
  "bugs": {
    "url": "https://github.com/bigskysoftware/ssexi/issues"
  }
}
EOF

echo "Generated package.json for v${VERSION}"

npm publish --access public

rm package.json

echo "Published ssexi-js@${VERSION} to npm"
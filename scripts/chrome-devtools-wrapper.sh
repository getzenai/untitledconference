#!/bin/bash
# Wrapper script for Chrome DevTools MCP server
# Connects to a Chrome instance with remote debugging enabled on port 9222

exec npx chrome-devtools-mcp --browserUrl http://127.0.0.1:9222

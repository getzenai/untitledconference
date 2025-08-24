# Use the official Node.js devcontainer image as base
FROM mcr.microsoft.com/devcontainers/javascript-node:1-20-bookworm

# Install additional system packages
RUN apt-get update && apt-get install -y \
    postgresql-client \
    tmux \
    && rm -rf /var/lib/apt/lists/*

# Install global npm packages
RUN npm install -g @anthropic-ai/claude-code

# Switch back to the node user
USER node
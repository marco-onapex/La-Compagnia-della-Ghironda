#!/bin/bash
# Setup Git Hooks
# Installs pre-commit hook automatically

HOOK_DIR=".git/hooks"
HOOK_FILE="$HOOK_DIR/pre-commit"
SCRIPT_FILE="scripts/pre-commit.sh"

echo "📋 Setting up Git hooks for La Compagnia della Ghironda..."
echo ""

# Check if .git directory exists
if [ ! -d ".git" ]; then
  echo "❌ Not a git repository. Run this from the repo root."
  exit 1
fi

# Create hooks directory if it doesn't exist
if [ ! -d "$HOOK_DIR" ]; then
  echo "📁 Creating .git/hooks directory..."
  mkdir -p "$HOOK_DIR"
fi

# Copy pre-commit hook
if [ -f "$SCRIPT_FILE" ]; then
  echo "📝 Installing pre-commit hook..."
  cp "$SCRIPT_FILE" "$HOOK_FILE"
  chmod +x "$HOOK_FILE"
  echo "✅ Pre-commit hook installed"
else
  echo "❌ Pre-commit script not found at $SCRIPT_FILE"
  exit 1
fi

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║  ✅ Git hooks setup complete!             ║"
echo "╠════════════════════════════════════════════╣"
echo "║  Pre-commit hook will now run:            ║"
echo "║  • HTML linting                           ║"
echo "║  • CSS linting                            ║"
echo "║  • JavaScript linting (cached)            ║"
echo "║  • Unit tests (fast mode)                 ║"
echo "║  • Bundle size check                      ║"
echo "║                                           ║"
echo "║  Skip checks: git commit --no-verify      ║"
echo "╚════════════════════════════════════════════╝"
echo ""
echo "📖 For more info, see PIPELINE-OPTIMIZATION.md"

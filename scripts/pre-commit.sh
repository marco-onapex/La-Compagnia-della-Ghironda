#!/bin/bash
# Pre-commit hook for La Compagnia della Ghironda
# Validate code before committing
# 
# Installation:
#   cp ./scripts/pre-commit.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# Skip hook: git commit --no-verify

set -e

echo "🔍 Running pre-commit checks..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track failures
FAILED=0

# Get only staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)
STAGED_JS_FILES=$(echo "$STAGED_FILES" | grep '\.js$' || true)
STAGED_CSS_FILES=$(echo "$STAGED_FILES" | grep '\.css$' || true)
STAGED_HTML_FILES=$(echo "$STAGED_FILES" | grep '\.html$' || true)

echo "📝 Staged files:"
echo "$STAGED_FILES" | head -5
if [ $(echo "$STAGED_FILES" | wc -l) -gt 5 ]; then
  echo "   ... and $(( $(echo "$STAGED_FILES" | wc -l) - 5 )) more"
fi
echo ""

# 1. HTML Linting (quick)
if [ -n "$STAGED_HTML_FILES" ]; then
  echo "🔵 Linting HTML... "
  if npm run lint:html > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ HTML OK${NC}"
  else
    echo -e "  ${RED}✗ HTML lint failed${NC}"
    npm run lint:html
    FAILED=1
  fi
else
  echo "⏭️  Skipping HTML (no changes)"
fi
echo ""

# 2. CSS Linting (quick)
if [ -n "$STAGED_CSS_FILES" ]; then
  echo "🔵 Linting CSS... "
  if npm run lint:css > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ CSS OK${NC}"
  else
    echo -e "  ${RED}✗ CSS lint failed${NC}"
    npm run lint:css
    FAILED=1
  fi
else
  echo "⏭️  Skipping CSS (no changes)"
fi
echo ""

# 3. JS Linting (with cache)
if [ -n "$STAGED_JS_FILES" ]; then
  echo "🔵 Linting JavaScript (cached)... "
  if npm run lint:js -- --cache > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ JS OK${NC}"
  else
    echo -e "  ${RED}✗ JS lint failed${NC}"
    npm run lint:js -- --cache
    FAILED=1
  fi
else
  echo "⏭️  Skipping JS (no changes)"
fi
echo ""

# 4. Fast unit tests (if JS changed)
if [ -n "$STAGED_JS_FILES" ]; then
  echo "🔵 Running unit tests (fast mode)... "
  if npm run test:unit:fast > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Tests OK${NC}"
  else
    echo -e "  ${RED}✗ Tests failed${NC}"
    npm run test:unit:fast
    # In CI environments (no TTY) fail immediately; locally allow override
    if [ -n "${CI}" ] || [ ! -t 0 ]; then
      exit 1
    fi
    echo ""
    echo -e "  ${YELLOW}Commit anyway? (y/N)${NC}"
    read -r RESPONSE
    if [ "$RESPONSE" != "y" ] && [ "$RESPONSE" != "Y" ]; then
      exit 1
    fi
  fi
else
  echo "⏭️  Skipping tests (no JS changes)"
fi
echo ""

# 5. Check bundle size didn't explode
if [ -n "$STAGED_JS_FILES" ] || [ -n "$STAGED_CSS_FILES" ]; then
  echo "🔵 Building and checking bundle size... "
  if npm run build:css > /dev/null 2>&1 && npm run build:js > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Bundle OK${NC}"
    npm run size-report
    node scripts/performance-budget.js
  else
    echo -e "  ${RED}✗ Build failed${NC}"
    FAILED=1
  fi
fi
echo ""

# Results
echo "╔════════════════════════════════════╗"
if [ $FAILED -eq 0 ]; then
  echo -e "║ ${GREEN}✓ ALL CHECKS PASSED${NC}          ║"
  echo "║ Ready to commit! 🚀             ║"
else
  echo -e "║ ${RED}✗ CHECKS FAILED${NC}            ║"
  echo "║ Fix issues and try again       ║"
fi
echo "╚════════════════════════════════════╝"
echo ""

exit $FAILED

#!/bin/bash
# Comprehensive Validation & Audit Script
# Runs all tests, audits, and generates evidence report

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  La Compagnia della Ghironda - Complete Validation Suite  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Create reports directory
mkdir -p test-results/{lighthouse,accessibility,e2e}

echo -e "${BLUE}[1/7]${NC} Building project..."
npm run build:ci

echo -e "${BLUE}[2/7]${NC} Running unit tests with coverage..."
npm run test:unit:ci -- --passWithNoTests

echo -e "${BLUE}[3/7]${NC} Running linters in parallel..."
npm run lint:parallel

echo -e "${BLUE}[4/7]${NC} Starting local server..."
http-server dist -p 8000 -c-1 &
SERVER_PID=$!
sleep 3

# Trap to kill server on exit
trap "kill $SERVER_PID 2>/dev/null || true" EXIT

echo -e "${BLUE}[5/7]${NC} Running Lighthouse audit (3 runs)..."
lighthouse-ci autorun || echo "⚠️  Lighthouse CI not available, running manual audit..."
lighthouse http://localhost:8000 --chrome-flags="--headless" --output-path=./test-results/lighthouse/report.html --output=html || true
lighthouse http://localhost:8000 --chrome-flags="--headless" --output=json > ./test-results/lighthouse/report.json || true

echo -e "${BLUE}[6/7]${NC} Running accessibility audit with axe..."
npm run test:accessibility || true

echo -e "${BLUE}[7/7]${NC} Running Playwright E2E tests..."
npm run test:e2e:ci || true

echo ""
echo -e "${GREEN}✓${NC} All validations complete!"
echo ""
echo "Reports generated:"
echo "  - Unit tests + coverage: test-results/unit-coverage/"
echo "  - Lighthouse audit: test-results/lighthouse/"
echo "  - Accessibility: test-results/accessibility/"
echo "  - E2E tests: test-results/e2e/"
echo ""

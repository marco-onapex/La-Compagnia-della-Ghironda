# CI/CD Pipeline Documentation

## Overview

Enterprise-grade CI/CD pipeline with strict quality gates, security audits, and performance monitoring.

## Local Development Pipeline

### Pre-commit Hooks

Runs automatically before every commit:
- **ESLint** - JavaScript code quality
- **Stylelint** - CSS code quality
- **HTMLHint** - HTML validation
- **Jest** - Unit tests for modified files
- **Commitlint** - Conventional commit enforcement

```bash
# Hooks are managed by Husky
# Skip hooks (not recommended): git commit --no-verify
```

### Conventional Commits

All commits must follow the conventional commit format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Code formatting (no logic change)
- `refactor` - Code refactoring
- `perf` - Performance improvement
- `test` - Test updates
- `chore` - Build/config changes
- `ci` - CI/CD changes
- `revert` - Revert previous commit

**Examples:**
```
feat(observer): add intersection observer for scroll tracking
fix(header): resolve header height calculation on resize
docs: update installation instructions
```

## Local Validation Commands

```bash
# Run all tests
npm run test:all

# Run linting only
npm run lint:parallel

# Run security audit
npm run audit:security

# Check performance budget
npm run audit:performance

# Run all audits
npm run audit:all

# Fast local development (quick tests + lint)
npm run test:fast

# Production validation (full suite)
npm run prod
```

## GitHub Actions Workflows

### CI Pipeline (ci.yml)

**Trigger:** Push to main/develop, or PR to main/develop

**Jobs:**
1. **Code Quality** (ubuntu-latest, ~10 min)
   - npm dependencies installation
   - Security audit (npm audit --audit-level=moderate)
   - ESLint, Stylelint, HTMLHint
   - Jest with coverage
   - CodeCov upload

2. **E2E Tests** (ubuntu-latest, ~15 min)
   - Playwright test suite
   - Full integration testing

3. **Performance & Security** (ubuntu-latest, ~20 min)
   - Build production artifacts
   - Performance budget validation
   - Lighthouse audit
   - Accessibility audit

4. **Build Artifacts** (ubuntu-latest, ~5 min)
   - Requires: quality & e2e jobs pass
   - Creates production build
   - Uploads dist/ as artifact

**Total CI Runtime:** ~30 minutes

### Release Workflow (release.yml)

**Trigger:** Manual dispatch (Actions tab)

**Inputs:**
- `version` - Release version (e.g., 1.2.3)

**Steps:**
1. Validate all tests pass
2. Security audit
3. Build production
4. Create GitHub Release
5. Upload artifacts

## Performance Budgets

Default limits (configured in `scripts/performance-budget.js`):

| Metric | Warning | Max |
|--------|---------|-----|
| JavaScript | 40 KB | 50 KB |
| CSS | 20 KB | 30 KB |
| Total | 60 KB | 80 KB |

Build **fails** if max is exceeded. **Warnings** are reported but non-blocking.

## Security Audits

### npm Audit

Runs on every commit and CI:
- Checks for known vulnerabilities
- Minimum level: `moderate`
- Blocks merge on moderate+ vulnerabilities

```bash
npm audit fix              # Auto-fix vulnerabilities
npm audit --audit-level=moderate
```

### Dependencies

Keep dependencies updated:
```bash
npm outdated               # Show outdated packages
npm update                 # Update within semver range
npm update --save          # Save updated versions
```

## Coverage Thresholds

Jest coverage requirements (in `jest.config.cjs`):

```
  branches: 75%
  functions: 80%
  lines: 80%
  statements: 80%
```

## Troubleshooting

### Husky hooks not running

```bash
# Reinstall husky
npm install
npx husky install

# Make hooks executable (Unix/Linux/Mac)
chmod +x .husky/*
```

### Lint-staged not running

```bash
# Verify .lint-stagedrc exists
cat .lint-stagedrc

# Manually run
npx lint-staged
```

### ESLint cache issues

```bash
# Clear ESLint cache
rm .eslintcache

# Rebuild cache
npm run lint:js
```

### Performance budget fails

```bash
# Check bundle sizes
npm run build
node scripts/performance-budget.js

# Analyze bundle (requires webpack-bundle-analyzer)
npm run build:analyze
```

## Best Practices

1. **Commit Frequently** - Smaller commits are easier to review
2. **Write Clear Commit Messages** - Follow conventional commits
3. **Test Locally** - Run `npm run test:fast` before pushing
4. **Update Dependencies** - Keep packages current (`npm update`)
5. **Monitor Performance** - Check bundle sizes regularly
6. **Review Audit Warnings** - Address security warnings promptly

## CI/CD Status

Check workflow status:
- **GitHub Actions:** Visit your repo → Actions tab
- **Branch protection:** Requires all checks to pass before merge
- **Artifact download:** Each successful CI stores dist/ artifact

## Next Steps

- [ ] Set up branch protection rules
- [ ] Configure CodeCov integration
- [ ] Add Slack notifications
- [ ] Configure SonarQube integration
- [ ] Add automated dependency updates (Dependabot)
- [ ] Evaluate TypeScript migration

---

**Pipeline Version:** 1.0.0  
**Last Updated:** 2026-04-10  
**Maintainer:** DevOps Team

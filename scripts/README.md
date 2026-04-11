# Scripts Directory

Utility scripts for development, testing, and deployment.

## Available Scripts

### `pre-commit.sh`
**Purpose**: Git pre-commit hook that runs local validation before every commit

**What it does**:
1. ✅ HTML linting (htmlhint)
2. ✅ CSS linting (stylelint)  
3. ✅ JavaScript linting (eslint with cache)
4. ✅ Unit tests (fast mode with --bail)
5. ✅ Bundle size check

**Installation**:
```bash
chmod +x scripts/pre-commit.sh
chmod +x scripts/setup-hooks.sh
./scripts/setup-hooks.sh
```

**Manual Setup**:
```bash
cp scripts/pre-commit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

**Usage** (automatic, runs on every `git commit`):
```bash
git commit -m "Your message"  # Runs checks, fails if issues found
```

**Skip checks** (when needed):
```bash
git commit --no-verify  # Bypasses pre-commit hook
```

### `setup-hooks.sh`
**Purpose**: Automated setup for Git hooks

**What it does**:
- Creates `.git/hooks` directory if needed
- Copies and makes `pre-commit` hook executable
- Displays confirmation message

**Usage**:
```bash
./scripts/setup-hooks.sh
```

---

## Quick Setup

```bash
# 1. Make scripts executable
chmod +x scripts/*.sh

# 2. Install hooks
./scripts/setup-hooks.sh

# 3. Verify installation
ls -la .git/hooks/pre-commit
```

---

## Benefits

✅ **Catch errors early** - Before pushing to remote  
✅ **Faster CI** - No bad commits reach CI/CD  
✅ **Local feedback** - Immediate validation while coding  
✅ **Cache aware** - ESLint cache speeds up repeated checks  
✅ **Optional** - Can bypass with `--no-verify` if needed  

---

## Troubleshooting

**"Permission denied" when committing**
```bash
ls -la scripts/pre-commit.sh  # Check permissions
chmod +x scripts/pre-commit.sh
ls -la .git/hooks/pre-commit  # Check hook permissions
chmod +x .git/hooks/pre-commit
```

**Tests failing but I want to commit anyway**
```bash
# Option 1: Fix issues and recommit
npm run test:fast

# Option 2: Skip hook (temporary)
git commit --no-verify
```

**Hook not running**
```bash
# Check if hook exists
test -x .git/hooks/pre-commit && echo "Hook installed" || echo "Not installed"

# Reinstall
./scripts/setup-hooks.sh
```

---

## Integration with CI/CD

The pre-commit hook validates locally, and the GitHub Actions workflow validates on push:

```
Local Development          CI/CD Pipeline
────────────────────      ──────────────────────
git commit
  ↓
pre-commit hook           GitHub Actions
  ↓                         ↓
  • Lint (fast)           • Lint (full)
  • Test (fast)           • Test (full)
  • Build                 • E2E Tests
  ↓                       • Lighthouse
  ✅ Pass →               • Build
    Push to remote        ↓
    ↓                     ✅ Merge to main
    └──→ CI/CD runs
```

---

## Maintenance

### Keep hooks up-to-date
After pulling changes that modify `scripts/pre-commit.sh`:
```bash
./scripts/setup-hooks.sh
```

### Disable hooks temporarily
```bash
# Disable all hooks
git config core.hooksPath /dev/null

# Re-enable
git config core.hooksPath .git/hooks
./scripts/setup-hooks.sh
```

### Monitor hook execution
```bash
# Check what hook would do (dry run)
bash scripts/pre-commit.sh

# Commits with verbose output
git commit -v  # Shows diff alongside commit message
```

---

## Related Documentation

- `PIPELINE-OPTIMIZATION.md` - Full CI/CD pipeline guide
- `TESTING.md` - Testing infrastructure details
- `.github/workflows/test.yml` - GitHub Actions configuration


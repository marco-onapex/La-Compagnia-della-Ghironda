/**
 * scripts/lib/repo-root.js
 *
 * Walk up from the current working directory looking for the
 * repository root (identified by a `package.json` sibling). Throws
 * if not found within 10 parents — a sane defence against runaway
 * recursion when invoked outside any project.
 *
 * Why this lives in `scripts/lib/`:
 *   Round 20 had three near-identical copies of `findRepoRoot()`
 *   in `docs-lint.js`, `inject-doc-numbers.js`, and
 *   `strip-html-comments.js`. The Round-21 audit flagged the
 *   duplication; consolidating here keeps the contract single-
 *   sourced. Each caller previously wrote ~15 lines of identical
 *   code; now they import this 1-line export.
 *
 * Why `import.meta.url` is NOT used:
 *   Some callers — `docs-lint.js` in particular — are imported by
 *   tests (`tests/unit/docs-lint.test.js` exercises the pure
 *   helpers via the DI seam). `import.meta.url` resolves at parse
 *   time; under `babel-jest`'s CJS transform it has historically
 *   thrown. The `process.cwd()` walker is portable across both
 *   ESM-runtime and CJS-jest worlds.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Walk up from `startDir` (default: `process.cwd()`) until a
 * directory containing `package.json` is found. Returns the
 * absolute path to that directory.
 *
 * @param {string} [startDir]
 * @returns {string}
 * @throws {Error} if no `package.json` is found within 10 parents.
 */
export function findRepoRoot(startDir = process.cwd()) {
  let dir = startDir;
  for (let depth = 0; depth < 10; depth++) {
    if (existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(
    `findRepoRoot: cannot locate package.json walking up from ${startDir} ` +
      `(checked up to 10 parents). Are you invoking this script from inside the repository?`,
  );
}

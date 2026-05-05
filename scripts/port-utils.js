/**
 * Cross-platform utility: free a TCP port before binding to it.
 *
 * Finds every PID that is LISTENING on the given port and kills it.
 * Silent on errors (port already free, permission issues, etc.).
 */

import { execSync } from 'node:child_process';

/**
 * Kill any process listening on `port`.
 * @param {number} port
 */
export function killPort(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano', { encoding: 'utf8' });
      const re = new RegExp(`:${port}\\s`);
      const pids = new Set(
        out
          .split('\n')
          .filter((l) => re.test(l) && l.includes('LISTENING'))
          .map((l) => l.trim().split(/\s+/).at(-1))
          .filter((p) => p && /^\d+$/.test(p)),
      );
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        } catch {
          /* ignore */
        }
      }
    } else {
      /* `shell` option on execSync expects the path to a shell binary
         (e.g. '/bin/sh'), not a boolean — execSync runs commands through
         the system shell by default, so we don't need to set it. The
         `xargs -r` (don't run if empty) flag is GNU-only; replace with a
         POSIX-portable check so this works on macOS/BSD too. */
      execSync(`pids=$(lsof -ti:${port} 2>/dev/null); [ -n "$pids" ] && kill -9 $pids`, {
        stdio: 'ignore',
      });
    }
  } catch {
    /* port was already free */
  }
}

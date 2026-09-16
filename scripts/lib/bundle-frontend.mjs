/**
 * Bundle frontend/src/portal/data modules so they run under Node, the
 * repo-wide pattern every seed/provision script uses (never retype generated
 * or scaffold data — bundle and execute it):
 *
 *   npx esbuild <entry> --bundle --format=cjs --platform=node --outfile=<tmp>
 *
 * Extracted here (contract v2.1, Sprint 13) so seed-firestore.mjs — already
 * grandfathered over the 500-line guideline — doesn't grow a second inline
 * copy for export-memberships.mjs to duplicate a third time. Each caller
 * supplies its own `export { X, Y } from '<path>';` lines, so the bundle only
 * pulls in what that script actually needs.
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * @param {string} repoRoot        Repo root (esbuild's cwd, so it resolves
 *                                  frontend/node_modules for date-fns etc).
 * @param {string[]} importLines   e.g. ["export { ALL_PACKAGES } from '...';"]
 * @param {object} [opts]
 * @param {string} [opts.tmpPrefix]  Temp dir prefix, for readable OS temp listings.
 * @returns {object} the bundled module's exports.
 */
export function bundleFrontend(repoRoot, importLines, { tmpPrefix = 'ryp-bundle-' } = {}) {
  const tmp = mkdtempSync(path.join(tmpdir(), tmpPrefix));
  const entry = path.join(tmp, 'entry.js');
  const outfile = path.join(tmp, 'bundle.cjs');

  writeFileSync(entry, importLines.join('\n'));

  try {
    execSync(
      `npx esbuild "${entry}" --bundle --format=cjs --platform=node --outfile="${outfile}" --log-level=warning`,
      { stdio: ['ignore', 'inherit', 'inherit'], cwd: repoRoot }
    );
  } catch {
    console.error(
      '\nesbuild bundling failed. If the error above mentions an unresolved package\n' +
        '(e.g. date-fns), install the frontend dependencies first:  cd frontend && npm install\n' +
        '(or point NODE_PATH at an installed frontend/node_modules).'
    );
    process.exit(1);
  }

  const data = createRequire(import.meta.url)(outfile);
  rmSync(tmp, { recursive: true, force: true });
  return data;
}

/** Windows-safe forward-slash path, since esbuild entry files are plain JS
 * import specifiers regardless of host OS. */
export function fwdPath(p) {
  return p.split(path.sep).join('/');
}

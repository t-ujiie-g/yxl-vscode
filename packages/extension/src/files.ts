import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { DataReader } from '@yxl-vscode/compile';
import type { IncludeReader } from '@yxl-vscode/loader';
import { filePath } from '@yxl-vscode/units';

/**
 * The half of reading a spec that belongs to the host (ADR-004): resolve a path
 * the spec wrote, and read it.
 *
 * Synchronous, and `node:fs` rather than VS Code's own filesystem API, because
 * the core is synchronous all the way down — a loader that returned promises
 * would put them in every reader in the project for the sake of a file read
 * that takes microseconds. The price is that this extension is a desktop one;
 * it invokes `yxl` as a binary anyway, so it was never going to be otherwise.
 *
 * The two constructs resolve differently, and that is `docs/spec.md`'s rule:
 * an `$include` against the file that wrote it, a `data:` path against the spec
 * that was opened (`docs/spec.md` §8, §9). Both arrive here as `from`, so one function serves
 * both — the caller decides which `from` it means.
 */
export const readBeside: IncludeReader & DataReader = (from, path) => {
  const found = resolve(dirname(from), path.replace(/\\/g, '/'));
  const file = filePath(found);
  if (file === null) return null;

  try {
    return { file, source: readFileSync(found, 'utf8') };
  } catch {
    return null;
  }
};

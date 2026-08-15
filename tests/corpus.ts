import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncludeReader } from '@yxl-vscode/loader';
import { filePath } from '@yxl-vscode/units';

const here = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(here, '..');

/**
 * The half of `$include` that belongs to the shell (ADR-004): resolve the path
 * against the file that wrote it, and read it.
 *
 * The core is I/O-free, so this is what a test has to bring; the extension will
 * bring the same thing over VS Code's filesystem API.
 */
export const includeReader: IncludeReader = (from, path) => {
  const resolved = resolve(dirname(from), path);
  const file = filePath(resolved);
  if (file === null) return null;

  try {
    return { file, source: readFileSync(resolved, 'utf8') };
  } catch {
    return null;
  }
};

export interface Sample {
  readonly name: string;
  readonly path: string;
  readonly source: string;
}

/**
 * The awkward-YAML fixtures: comments in every position, flow style, block
 * scalars, CRLF, a BOM, odd indentation, an anchor, a tab inside a string.
 * Written to be hostile to a serializer that re-prints rather than patches.
 */
export function awkward(): Sample[] {
  return read(join(here, 'fixtures', 'awkward'));
}

/**
 * Every spec in yxl's own cookbook, when a checkout is next door.
 *
 * These are the real thing — the corpus CI compiles upstream — which is why
 * they are worth more than anything written here. They are optional so the
 * suite still runs without the sibling checkout; `pnpm test` reports how many
 * were found, and CI fails when the count is zero (`corpus.test.ts`).
 */
export function yxlExamples(): Sample[] {
  const dir = join(REPO_ROOT, '..', 'yxl', 'examples');
  try {
    statSync(dir);
  } catch {
    return [];
  }
  return read(dir);
}

function read(dir: string): Sample[] {
  const found: Sample[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...read(path));
    } else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
      found.push({ name: relative(dir, path), path, source: readFileSync(path, 'utf8') });
    }
  }

  return found;
}

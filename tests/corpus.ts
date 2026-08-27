import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncludeReader } from '@yxl-vscode/loader';
import { filePath } from '@yxl-vscode/units';

const here = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(here, '..');

/** The half of `$include` that belongs to the shell (ADR-004): resolve against the writing file, and read. */
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

/** The awkward-YAML fixtures, written to be hostile to a serializer that re-prints. */
export function awkward(): Sample[] {
  return read(join(here, 'fixtures', 'awkward'));
}

/** The yxl checkout this repo expects next door, which holds the schema and the cookbook. */
export function yxlRoot(): string {
  return join(REPO_ROOT, '..', 'yxl');
}

/** Every spec in yxl's own cookbook, when a checkout is next door; `corpus.test.ts` fails on zero. */
export function yxlExamples(): Sample[] {
  const dir = join(yxlRoot(), 'examples');
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

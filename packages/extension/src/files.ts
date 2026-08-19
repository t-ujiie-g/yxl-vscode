import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { DataReader } from '@yxl-vscode/compile';
import type { IncludeReader } from '@yxl-vscode/loader';
import { type FilePath, filePath } from '@yxl-vscode/units';

/**
 * The half of reading a spec that belongs to the host (ADR-004): resolve a path
 * against `from` and read it, synchronously, because the core is. Which file
 * `from` is — the includer, or the opened spec — is the caller's to choose.
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

/** The same reader, answering with what the editor holds where it holds anything: an unsaved buffer is the spec. */
export function openFirst(
  beside: IncludeReader & DataReader,
  opened: (file: FilePath) => string | null,
): IncludeReader & DataReader {
  return (from, path) => {
    const found = beside(from, path);
    if (found === null) return null;

    const held = opened(found.file);
    return held === null ? found : { file: found.file, source: held };
  };
}

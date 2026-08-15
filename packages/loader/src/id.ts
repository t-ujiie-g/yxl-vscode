import type { Path } from '@yxl-vscode/cst';
import { type FilePath, type NodeId, nodeId } from '@yxl-vscode/units';

/**
 * The identity of the node at `path` in `file`, derived rather than read
 * (ADR-015).
 *
 * The file is part of it because `$include` makes two files one document, and
 * the first sheet of each is `sheets/0` in its own.
 *
 * JSON because every step is arbitrary text — a style may be named `a/b` and a
 * cell key is an address — and a separator that can appear inside a step makes
 * two different nodes share an id.
 */
export function nodeIdAt(file: FilePath, path: Path): NodeId {
  return nodeId(JSON.stringify([file, ...path]));
}

/**
 * The file and path an id was derived from.
 *
 * The inverse lives here, next to the derivation, so that how an id is spelled
 * stays one module's business: a caller that wants to *edit* the node an id
 * names needs the path back, and reading it off the string anywhere else would
 * make the spelling everyone's business.
 */
export function pathOf(id: NodeId): { file: FilePath; path: Path } | null {
  try {
    const read: unknown = JSON.parse(id);
    if (!Array.isArray(read)) return null;

    const [file, ...path] = read;
    if (typeof file !== 'string') return null;
    if (!path.every((step) => typeof step === 'string' || typeof step === 'number')) return null;

    return { file: file as FilePath, path };
  } catch {
    return null;
  }
}

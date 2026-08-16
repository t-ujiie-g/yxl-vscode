import type { Path } from '@yxl-vscode/cst';
import { type FilePath, type NodeId, nodeId } from '@yxl-vscode/units';

/**
 * The identity of the node at `path` in `file`, derived rather than read
 * (ADR-015). JSON, because a step is arbitrary text and any separator could
 * appear inside one.
 */
export function nodeIdAt(file: FilePath, path: Path): NodeId {
  return nodeId(JSON.stringify([file, ...path]));
}

/** The file and path an id was derived from — the inverse, kept beside the derivation. */
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

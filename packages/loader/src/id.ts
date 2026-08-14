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

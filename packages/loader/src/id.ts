import type { Path } from '@yxl-vscode/cst';
import { type NodeId, nodeId } from '@yxl-vscode/units';

/**
 * The identity of the node at `path`, derived rather than read (ADR-015).
 *
 * JSON because a path's steps are arbitrary text — a style may be named `a/b`
 * and a cell key is an address — and a separator that can appear inside a step
 * makes two different nodes share an id.
 */
export function nodeIdAt(path: Path): NodeId {
  return nodeId(JSON.stringify(path));
}

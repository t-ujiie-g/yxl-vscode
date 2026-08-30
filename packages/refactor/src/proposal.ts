import type { CompiledGrid } from '@yxl-vscode/compile';
import type { Parsed, Path } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import type { SpecDoc } from '@yxl-vscode/spec';
import type { FilePath, StyleName } from '@yxl-vscode/units';
import { gatherStyles } from './styles';

/** What a proposal is worked out from: the spec as it stands, and the trees of the files it is written in. */
export interface Proposing {
  readonly doc: SpecDoc;
  readonly grid: CompiledGrid;
  readonly parsed: (file: FilePath) => Parsed | null;
}

/** One place a proposal would rewrite. */
export interface Site {
  readonly file: FilePath;
  readonly path: Path;
}

/**
 * A tidy-up the spec allows: what it would do, where, and the name it needs
 * from the reader before it can be written (ADR-053).
 */
export interface Proposal {
  readonly id: string;
  readonly what: Saying;
  readonly file: FilePath;
  readonly at: readonly Site[];
  readonly source: string;
  readonly suggested: string;
  readonly taken: readonly StyleName[];
  readonly holds: Holds;
}

/** Which keys the definition's own home is missing, which decides where it is added. */
export type Holds = 'styles' | 'defs' | 'nothing';

/** Every tidy-up this spec allows, in the order they would be offered. */
export function proposals(spec: Proposing): readonly Proposal[] {
  return gatherStyles(spec);
}

import type { CompiledGrid } from '@yxl-vscode/compile';
import type { Parsed, Path } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import type { SpecDoc } from '@yxl-vscode/spec';
import type { A1Range, FilePath, StyleName } from '@yxl-vscode/units';
import { mergeStyles } from './merge';
import { rangeFormulas } from './ranges';
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

/** A site that reads a look by name, or the definition that declares one. */
export interface Named extends Site {
  readonly name: StyleName;
}

/** What every proposal says of itself, whatever it would do. */
interface Made {
  readonly id: string;
  readonly what: Saying;
  readonly file: FilePath;
}

/** A look written out in full at several places, to be given a name of its own. */
export interface Gathering extends Made {
  readonly kind: 'gather';
  readonly at: readonly Site[];
  readonly source: string;
  readonly suggested: string;
  readonly taken: readonly StyleName[];
  readonly holds: Holds;
}

/** Definitions that say the same thing, to become one the others' readers follow. */
export interface Merging extends Made {
  readonly kind: 'merge';
  readonly names: readonly StyleName[];
  readonly at: readonly Named[];
  readonly defs: readonly Named[];
}

/** A column of cells each translating one formula, to be said once as a range. */
export interface Ranging extends Made {
  readonly kind: 'range';
  readonly sheet: Path;
  readonly over: A1Range;
  readonly formula: string;
  readonly at: readonly Site[];
  readonly holds: boolean;
}

/**
 * A tidy-up the spec allows. Each needs at most one thing from the reader before
 * it can be written — a name to give, or a name to keep (ADR-054).
 */
export type Proposal = Gathering | Merging | Ranging;

/** Which keys the definition's own home is missing, which decides where it is added. */
export type Holds = 'styles' | 'defs' | 'nothing';

/** How many places a proposal would rewrite, which is what a reader is agreeing to. */
export function sites(one: Proposal): number {
  if (one.kind === 'merge') return one.at.length + one.defs.length - 1;
  return one.at.length;
}

/** Every tidy-up this spec allows, in the order they would be offered. */
export function proposals(spec: Proposing): readonly Proposal[] {
  return [...mergeStyles(spec), ...gatherStyles(spec), ...rangeFormulas(spec)];
}

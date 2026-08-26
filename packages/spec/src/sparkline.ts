import type { A1Addr, Color } from '@yxl-vscode/units';
import type { SpecNode, Templated } from './node';

/** What a sparkline plots its points as; `win_loss` plots only each point's sign (`docs/spec.md` §19). */
export const SPARKLINE_TYPES = ['line', 'column', 'win_loss'] as const;

export type SparklineType = (typeof SPARKLINE_TYPES)[number];

/** The colours of the marks a sparkline can pick out (`docs/spec.md` §19). */
export interface SparklineColors {
  readonly markers: Templated<Color> | null;
  readonly high: Templated<Color> | null;
  readonly low: Templated<Color> | null;
}

/** One sparkline: the cell it sits in, and the cells it plots, which may name another sheet. */
export interface Sparkline {
  readonly at: Templated<A1Addr>;
  readonly data: Templated<string>;
}

/**
 * One `sparklines:` entry: a group Excel scales and styles as one unit, placed
 * either as one `at`/`data` pair or as a `cells` sequence (`docs/spec.md` §19).
 */
export interface SparklineGroup extends SpecNode {
  readonly cells: readonly Sparkline[];
  readonly type: SparklineType;
  readonly markers: boolean;
  readonly high: boolean;
  readonly low: boolean;
  readonly min: number | null;
  readonly max: number | null;
  readonly weight: number | null;
  readonly color: Templated<Color> | null;
  readonly colors: SparklineColors | null;
  readonly axis: boolean;
}

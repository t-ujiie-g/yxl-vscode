import type { A1Range } from '@yxl-vscode/units';
import type { Comparison } from './conditional';
import type { SpecNode, Templated } from './node';
import type { ScalarValue } from './value';

/**
 * What a validation asks of a cell, one per entry: a list of choices, the cells
 * holding them, or a comparison over what the cell holds (`docs/spec.md` §10).
 */
export type ValidationTest =
  | { readonly kind: 'list'; readonly choices: readonly ScalarValue[] }
  | { readonly kind: 'listFrom'; readonly from: Templated<string> }
  | {
      readonly kind: 'whole' | 'decimal' | 'text_length' | 'date';
      readonly compares: Comparison;
    };

/** What a validation says: to the reader when the cell is selected, or when a value is refused. */
export interface Said {
  readonly title: string | null;
  readonly body: string | null;
}

/** How Excel refuses a value: `stop` refuses it, the other two let it through (`docs/spec.md` §10). */
export const ERROR_STYLES = ['stop', 'warning', 'information'] as const;

export type ErrorStyle = (typeof ERROR_STYLES)[number];

/**
 * One `validations:` entry: the range it covers, what it asks, and what it says
 * about it. `allowBlank` is Excel's "Ignore blank", which defaults to on.
 */
export interface Validation extends SpecNode {
  readonly at: Templated<A1Range>;
  readonly test: ValidationTest;
  readonly allowBlank: boolean;
  readonly prompt: Said | null;
  readonly error: (Said & { readonly style: Templated<ErrorStyle> }) | null;
}

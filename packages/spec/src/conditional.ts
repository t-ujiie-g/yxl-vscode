import type { A1Range, Color } from '@yxl-vscode/units';
import type { SpecNode, Templated } from './node';
import type { StyleUse } from './style';
import type { ScalarValue } from './value';

/** The comparisons a `cell:` rule and a validation are both spelled in (`docs/spec.md` §10). */
export type Comparison =
  | {
      readonly kind: 'between' | 'not_between';
      readonly low: ScalarValue;
      readonly high: ScalarValue;
    }
  | {
      readonly kind:
        | 'equals'
        | 'not_equals'
        | 'at_least'
        | 'at_most'
        | 'greater_than'
        | 'less_than';
      readonly bound: ScalarValue;
    };

/** What a `text:` rule asks of the text a cell shows. */
export interface TextTest {
  readonly kind: 'contains' | 'not_contains' | 'begins_with' | 'ends_with';
  readonly text: string;
}

/**
 * What decides whether a conditional rule matches. The last three draw an
 * appearance of their own rather than applying a look (`docs/spec.md` §10).
 */
export type ConditionalTest =
  | { readonly kind: 'cell'; readonly compares: Comparison }
  | { readonly kind: 'text'; readonly asks: TextTest }
  | { readonly kind: 'formula'; readonly body: string }
  | {
      readonly kind: 'top' | 'bottom';
      readonly count: number;
      readonly percent: boolean;
    }
  | { readonly kind: 'duplicate' | 'unique' }
  | {
      readonly kind: 'colorScale';
      readonly low: Templated<Color>;
      readonly middle: Templated<Color> | null;
      readonly high: Templated<Color>;
    }
  | { readonly kind: 'dataBar'; readonly color: Templated<Color>; readonly barOnly: boolean }
  | {
      readonly kind: 'iconSet';
      readonly name: string;
      readonly reverse: boolean;
      readonly iconsOnly: boolean;
    };

/**
 * One `conditional:` entry: a range, what decides it, and the look it applies.
 * Rules apply in the order written, which is Excel's priority order.
 */
export interface Conditional extends SpecNode {
  readonly at: Templated<A1Range>;
  readonly test: ConditionalTest;
  readonly style: StyleUse | null;
  readonly format: string | null;
  readonly stopIfTrue: boolean;
}

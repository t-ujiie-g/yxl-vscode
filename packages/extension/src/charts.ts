import { chartsOver } from '@yxl-vscode/intent';
import type { Ranged } from '@yxl-vscode/webview/protocol';
import { type Asking, asked } from './asked';
import type { Port, Spec } from './write';

/**
 * A chart over the selected rectangle, all the way to the file. Which shape it
 * takes is not in the selection, so it is asked rather than picked (ADR-001);
 * what it plots is (`docs/spec.md` §12).
 */
export function chart(spec: Spec, ranged: Ranged, port: Port, choice?: string): Promise<void> {
  return asked(spec, ranged, port, choice, CHART);
}

const CHART: Asking<Ranged> = {
  about: (ranged) => ({ ...ranged, kind: 'chart' }),
  answers: (spec, ranged, sheet, read) => {
    const { top, left, bottom, right } = ranged;
    return chartsOver(spec, { sheet, rect: { top, left, bottom, right } }, read);
  },
  nothing: () => 'a chart plots a column against the labels beside it, and this is one column',
  why: () =>
    'a chart is a shape as well as a range, and the shape is not in the selection — a stacked one is the same entry with the word changed',
  done: (_ranged, taken) => `${taken.what} is over the cells you selected.`,
};

import { chartsOver } from '@yxl-vscode/intent';
import type { Ranged } from '@yxl-vscode/webview/protocol';
import { type Asking, asked } from './asked';
import { say } from './text';
import { type Port, rectIn, type Spec } from './write';

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
  answers: (spec, ranged, sheet, read) => chartsOver(spec, { sheet, rect: rectIn(ranged) }, read),
  nothing: () => say('host.no-chart-here'),
  why: () => say('host.chart-is-a-shape'),
  done: (_ranged, taken) => say('host.chart-done', { what: taken.what }),
};

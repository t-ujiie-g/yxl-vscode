import { draw } from './draw';
import type { Drawing } from './protocol';

export { draw } from './draw';
export type {
  Drawing,
  DrawnCell,
  DrawnDiagnostic,
  DrawnMerge,
  DrawnSheet,
  Sized,
} from './protocol';

/**
 * The view, from the host's messages.
 *
 * It holds one thing of its own: which sheet is showing. Everything else is
 * the drawing it was last sent, redrawn outright — a projection has nothing to
 * reconcile (ADR-001).
 */
function start(): void {
  const into = document.getElementById('grid');
  if (into === null) return;

  let showing = 0;
  let drawn: Drawing | null = null;

  const show = (index: number): void => {
    showing = index;
    if (drawn !== null) draw(into, drawn, showing, show);
  };

  window.addEventListener('message', (event: MessageEvent<Drawing>) => {
    const sent = event.data;
    if (sent.kind !== 'drawing') return;

    if (drawn?.file !== sent.file) showing = 0;
    drawn = sent;
    draw(into, sent, showing, show);
  });
}

if (typeof document !== 'undefined') start();

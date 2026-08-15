import { type Asks, draw, type Showing } from './draw';
import type { Drawing, FromView, Source, ToView } from './protocol';

export { type Asks, draw, type Showing } from './draw';
export type {
  Drawing,
  DrawnCell,
  DrawnDiagnostic,
  DrawnMerge,
  DrawnSheet,
  FromView,
  Inspected,
  Sized,
  Source,
  ToView,
} from './protocol';

/** The bridge VS Code puts in a webview, and the only way out of one. */
declare function acquireVsCodeApi(): { postMessage: (message: FromView) => void };

/**
 * The view, driven by the host's messages.
 *
 * It holds three things of its own — which sheet is showing, which cell is
 * selected, and the answer to the last question it asked — and redraws outright
 * for everything else, because a projection has nothing to reconcile (ADR-001).
 */
function start(): void {
  const into = document.getElementById('grid');
  if (into === null) return;

  const host = acquireVsCodeApi();
  let drawing: Drawing | null = null;
  let sheet = 0;
  let selected: Showing['selected'] = null;
  let sources: readonly Source[] | null = null;

  const redraw = (): void => {
    if (drawing !== null) draw(into, { drawing, sheet, selected, sources }, asks);
  };

  const asks: Asks = {
    showSheet: (index) => {
      sheet = index;
      selected = null;
      sources = null;
      redraw();
    },
    select: (row, col) => {
      selected = { row, col };
      sources = null;
      host.postMessage({ kind: 'inspect', sheet, row, col });
      redraw();
    },
    reveal: (source) => {
      host.postMessage({ kind: 'reveal', file: source.file, start: source.start, end: source.end });
    },
  };

  window.addEventListener('message', (event: MessageEvent<ToView>) => {
    const sent = event.data;

    if (sent.kind === 'drawing') {
      if (drawing?.file !== sent.file) {
        sheet = 0;
        selected = null;
      }
      drawing = sent;
      sources = null;
      redraw();
      return;
    }

    // An answer about a cell that is still the selected one: a redraw may have
    // arrived since it was asked, and then it is no longer the question.
    if (sent.sheet === sheet && sent.row === selected?.row && sent.col === selected.col) {
      sources = sent.sources;
      redraw();
    }
  });
}

if (typeof document !== 'undefined') start();

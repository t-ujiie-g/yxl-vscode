import { sheetAgain } from './again';
import { type Asks, cellKey, draw, type Reached, restate, type Showing } from './draw';
import type { Drawing, FromView, Source, ToView } from './protocol';

export { type Kept, sheetAgain } from './again';
export { type Asks, draw, type Reached, restate, type Showing } from './draw';
export type {
  Drawing,
  DrawnCell,
  DrawnDiagnostic,
  DrawnMerge,
  DrawnRun,
  DrawnSheet,
  FromView,
  Highlighted,
  Inspected,
  Refused,
  Sized,
  Source,
  ToView,
  Uncomputed,
} from './protocol';

/** The bridge VS Code puts in a webview, and the only way out of one. */
declare function acquireVsCodeApi(): { postMessage: (message: FromView) => void };

/**
 * The view, driven by the host's messages.
 *
 * It holds three things of its own — which sheet is showing, which cell is
 * selected, and the answer to the last question it asked — and redraws outright
 * for everything else, because a projection has nothing to reconcile (ADR-001).
 * The three are named, not numbered, so that a spec read again finds them where
 * the reader left them (ADR-023).
 */
function start(): void {
  const into = document.getElementById('grid');
  if (into === null) return;

  const host = acquireVsCodeApi();
  let drawing: Drawing | null = null;
  let sheet = 0;
  let selected: Showing['selected'] = null;
  let sources: readonly Source[] | null = null;
  let reached: Reached | null = null;
  let refused: string | null = null;

  const redraw = (): void => {
    if (drawing !== null) draw(into, { drawing, sheet, selected, sources, reached, refused }, asks);
  };

  /** The same, for what the view holds of its own: the grid stays as it is. */
  const restated = (): void => {
    if (drawing !== null) {
      restate(into, { drawing, sheet, selected, sources, reached, refused }, asks);
    }
  };

  const named = (): string => drawing?.sheets[sheet]?.name ?? '';

  const asks: Asks = {
    showSheet: (index) => {
      sheet = index;
      selected = null;
      sources = null;
      reached = null;
      redraw();
    },
    select: (row, col) => {
      selected = { row, col };
      sources = null;
      host.postMessage({ kind: 'inspect', sheet: named(), row, col });
      restated();
    },
    reveal: (source) => {
      host.postMessage({ kind: 'reveal', file: source.file, start: source.start, end: source.end });
    },
    setParam: (name, value) => {
      host.postMessage({ kind: 'setParam', name, value });
    },
    showWindow: (row, col) => {
      host.postMessage({ kind: 'window', sheet: named(), row, col });
    },
    edit: (row, col, text) => {
      refused = null;
      host.postMessage({ kind: 'edit', sheet: named(), row, col, text });
    },
  };

  window.addEventListener('message', (event: MessageEvent<ToView>) => {
    const sent = event.data;

    if (sent.kind === 'refused') {
      refused = sent.why;
      restated();
      return;
    }

    if (sent.kind === 'drawing') {
      const was = drawing?.sheets[sheet];
      if (drawing?.file !== sent.file) {
        sheet = 0;
        selected = null;
      } else if (was !== undefined) {
        sheet = sheetAgain(sent.sheets, { name: was.name, index: sheet });
      }
      drawing = sent;
      sources = null;
      reached = null;
      refused = null;
      redraw();
      return;
    }

    if (sent.kind === 'highlighted') {
      const here = sent.cells.filter((cell) => cell.sheet === named());
      reached = { says: sent.says, cells: new Set(here.map((one) => cellKey(one.col, one.row))) };
      restated();
      return;
    }

    // An answer about a cell that is still the selected one: a redraw may have
    // arrived since it was asked, and then it is no longer the question.
    if (sent.sheet === named() && sent.row === selected?.row && sent.col === selected.col) {
      sources = sent.sources;
      restated();
    }
  });
}

if (typeof document !== 'undefined') start();

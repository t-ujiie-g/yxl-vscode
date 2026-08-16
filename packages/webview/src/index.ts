import { sheetAgain } from './again';
import { type Asks, cellKey, draw, type Reached, restate, type Showing } from './draw';
import type { Drawing, Editable, FromView, Refused, Source, ToView } from './protocol';

export { type Kept, sheetAgain } from './again';
export { type Asks, draw, type Reached, restate, type Showing } from './draw';
export type {
  Drawing,
  DrawnCell,
  DrawnDiagnostic,
  DrawnMerge,
  DrawnRun,
  DrawnSheet,
  Editable,
  FromView,
  Highlighted,
  Inspected,
  Refused,
  Sized,
  Source,
  ToView,
  Typed,
  Uncomputed,
} from './protocol';

/** The bridge VS Code puts in a webview, and the only way out of one. */
declare function acquireVsCodeApi(): { postMessage: (message: FromView) => void };

/** Where the view sends what it wants, which is the editor and nothing else. */
export interface Host {
  readonly postMessage: (message: FromView) => void;
}

/**
 * The view, driven by the host's messages.
 *
 * It holds a few things of its own — which sheet is showing, which cell is
 * selected, the answer to the last question it asked, and what the host last
 * said about an edit — and redraws outright for everything else, because a
 * projection has nothing to reconcile (ADR-001). They are named, not numbered,
 * so that a spec read again finds them where the reader left them (ADR-023).
 *
 * Takes the page and the host rather than reaching for them, so that what it
 * *sends* can be tested: a message going out under the wrong `kind` is a bug
 * neither the type checker nor a drawing test can see.
 */
export function wire(into: HTMLElement, host: Host): (message: ToView) => void {
  let drawing: Drawing | null = null;
  let sheet = 0;
  let selected: Showing['selected'] = null;
  let sources: readonly Source[] | null = null;
  let reached: Reached | null = null;
  let refused: Refused | null = null;
  let said: string | null = null;

  /** Where the last edit was typed, so a refusal can put the reader back at it. */
  let typedAt: { row: number; col: number } | null = null;

  const redraw = (): void => {
    if (drawing !== null) {
      draw(
        into,
        { drawing, sheet, selected, sources, reached, refused, said, editable: editable() },
        asks,
      );
    }
  };

  /** The same, for what the view holds of its own: the grid stays as it is. */
  const restated = (): void => {
    if (drawing !== null) {
      restate(
        into,
        { drawing, sheet, selected, sources, reached, refused, said, editable: editable() },
        asks,
      );
    }
  };

  const named = (): string => drawing?.sheets[sheet]?.name ?? '';

  /** Whether the cell the reader has selected is one they can type into. */
  const editable = (): Editable | null => {
    if (selected === null) return null;

    const cells = drawing?.sheets[sheet]?.cells ?? [];
    const at = cells.find((one) => one.row === selected?.row && one.col === selected?.col);
    return at?.editable ?? null;
  };

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
      said = null;
      typedAt = { row, col };
      host.postMessage({ kind: 'edit', sheet: named(), row, col, text });
    },
    resolveWith: (typed, choice) => {
      host.postMessage({ ...typed, choice, kind: 'resolve' });
    },
    overrideWith: (typed, reason) => {
      // `kind` last: whatever the host handed back is spread first, and a
      // message that ends in someone else's `kind` is that other message.
      host.postMessage({ ...typed, reason, kind: 'override' });
    },
  };

  return (sent: ToView): void => {
    if (sent.kind === 'refused') {
      refused = sent;
      said = null;
      // Enter moves down, and an edit that did not happen should not move the
      // reader away from the cell it was about.
      if (typedAt !== null) selected = typedAt;
      restated();
      return;
    }

    if (sent.kind === 'said') {
      said = sent.text;
      refused = null;
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
  };
}

/** The view as the webview runs it: the page it was given, and VS Code's bridge. */
function start(): void {
  const into = document.getElementById('grid');
  if (into === null) return;

  const host = acquireVsCodeApi();
  const told = wire(into, host);
  window.addEventListener('message', (event: MessageEvent<ToView>) => told(event.data));
}

if (typeof document !== 'undefined') start();

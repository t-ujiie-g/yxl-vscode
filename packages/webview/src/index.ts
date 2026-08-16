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
 * The view, driven by the host's messages. It holds a few things of its own —
 * named, not numbered, so a spec read again finds them (ADR-023) — and redraws
 * outright for everything else (ADR-001). Takes the page and the host so that
 * what it *sends* can be tested.
 */
export function wire(into: HTMLElement, host: Host): (message: ToView) => void {
  let drawing: Drawing | null = null;
  let sheet = 0;
  let selected: Showing['selected'] = null;
  /** Where a range was started from, which stays put while the selection moves. */
  let anchor: Showing['anchor'] = null;
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
        { drawing, sheet, selected, anchor, sources, reached, refused, said, editable: editable() },
        asks,
      );
    }
  };

  /** The same, for what the view holds of its own: the grid stays as it is. */
  const restated = (): void => {
    if (drawing !== null) {
      restate(
        into,
        { drawing, sheet, selected, anchor, sources, reached, refused, said, editable: editable() },
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
      anchor = null;
      sources = null;
      reached = null;
      redraw();
    },
    select: (row, col) => {
      selected = { row, col };
      anchor = { row, col };
      sources = null;
      host.postMessage({ kind: 'inspect', sheet: named(), row, col });
      restated();
    },
    reachTo: (row, col) => {
      anchor ??= selected;
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
      // `kind` last, or a spread message carrying its own `kind` is that message.
      host.postMessage({ ...typed, reason, kind: 'override' });
    },
  };

  return (sent: ToView): void => {
    if (sent.kind === 'refused') {
      refused = sent;
      said = null;
      // Enter already moved down; an edit that did not happen puts the reader back.
      if (typedAt !== null) {
        selected = typedAt;
        anchor = typedAt;
      }
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
        anchor = null;
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

    // Only while it is still the selected cell: a redraw may have come between.
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

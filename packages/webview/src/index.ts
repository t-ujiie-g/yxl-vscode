import type { Rect } from '@yxl-vscode/units';
import { sheetAgain } from './again';
import { flavours, onto } from './clipboard';
import {
  type Asks,
  type Copied,
  cellKey,
  draw,
  focusCell,
  type Reached,
  restate,
  type Showing,
} from './draw';
import { between } from './keys';
import type {
  Drawing,
  DrawnSheet,
  Editable,
  FromView,
  Pasted,
  Refused,
  Source,
  ToView,
} from './protocol';

export { type Kept, sheetAgain } from './again';
export { type Asks, type Copied, draw, type Reached, restate, type Showing } from './draw';
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
  Pasted,
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
  /** The rectangle the reader has copied, which is a place rather than the cells in it (ADR-032). */
  let copied: Copied | null = null;
  /** What our own copy last put on the system clipboard, which says whose paste this is. */
  let ours: string | null = null;
  /** Where a paste is going, while the clipboard it lands from is still on its way. */
  let landing: { row: number; col: number } | null = null;

  into.addEventListener('paste', (event) => {
    const where = landing;
    landing = null;
    if (where === null) return;

    event.preventDefault();
    const text = (event as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
    if (copied !== null && (text === '' || text === ours)) {
      host.postMessage({ kind: 'paste', ...putting(copied, where.row, where.col) });
      return;
    }

    if (text === '') return;

    host.postMessage({ kind: 'pasteText', text, sheet: named(), row: where.row, col: where.col });
  });

  /** Where the last edit was typed, so a refusal can put the reader back at it. */
  let typedAt: { row: number; col: number } | null = null;

  /** Everything the view is showing, read at the moment it is asked for. */
  const showing = (of: Drawing): Showing => ({
    drawing: of,
    sheet,
    selected,
    anchor,
    sources,
    reached,
    refused,
    said,
    copied,
    editable: editable(),
  });

  const redraw = (): void => {
    if (drawing !== null) draw(into, showing(drawing), asks);
  };

  /** The same, for what the view holds of its own: the grid stays as it is. */
  const restated = (): void => {
    if (drawing !== null) restate(into, showing(drawing), asks);
  };

  const named = (): string => drawing?.sheets[sheet]?.name ?? '';

  /** The rectangle selected, read live: the grid restates rather than redraws on a selection. */
  const spanned = (): Rect | null => {
    if (selected === null || anchor === null) return null;
    if (selected.row === anchor.row && selected.col === anchor.col) return null;

    return between(selected, anchor);
  };

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
    empty: (row, col) => {
      refused = null;
      said = null;

      const rect = spanned();
      if (rect === null) {
        typedAt = { row, col };
        host.postMessage({ kind: 'edit', sheet: named(), row, col, text: '' });
        return;
      }

      typedAt = { row: rect.top, col: rect.left };
      host.postMessage({ kind: 'empty', sheet: named(), ...rect });
    },
    undo: (redo) => {
      refused = null;
      said = null;
      host.postMessage({ kind: 'undo', redo });
    },
    copy: (row, col, cut) => {
      refused = null;
      const rect = spanned() ?? between({ row, col }, { row, col });
      copied = { sheet: named(), rect, cut };
      const gone = out(drawing?.sheets[sheet], rect);
      ours = gone.text;
      said = gone.said;
      restated();
    },
    paste: (row, col) => {
      refused = null;
      said = null;
      // The clipboard arrives in the `paste` event the key sets off. Where the
      // page is never given one, the rectangle the grid holds is what lands.
      landing = { row, col };
      setTimeout(() => {
        if (landing === null) return;

        landing = null;
        if (copied !== null) host.postMessage({ kind: 'paste', ...putting(copied, row, col) });
      }, 0);
    },
    resolveWith: (typed, choice) => {
      host.postMessage({ ...typed, choice, kind: 'resolve' });
    },
    emptiedWith: (ranged, choice) => {
      refused = null;
      said = null;
      host.postMessage({ ...ranged, choice, kind: 'emptied' });
    },
    pastedWith: (pasted, choice) => {
      refused = null;
      said = null;
      host.postMessage({ ...pasted, choice, kind: 'pasted' });
    },
    pastedTextWith: (text, choice) => {
      refused = null;
      said = null;
      host.postMessage({ ...text, choice, kind: 'pastedText' });
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

    if (sent.kind === 'focus') {
      if (drawing !== null) focusCell(into, showing(drawing));
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

/** The rectangle onto the system clipboard (ADR-028): what went there, and what stopped it. */
function out(
  sheet: DrawnSheet | undefined,
  rect: Rect,
): { readonly text: string | null; readonly said: string | null } {
  if (sheet === undefined) return { text: null, said: null };

  const what = flavours(sheet, rect);
  if (what === null) {
    return {
      text: null,
      said: 'this reaches past what the preview has drawn, so only the grid has it.',
    };
  }

  return onto(what)
    ? { text: what.text, said: null }
    : {
        text: null,
        said: 'this preview could not reach the clipboard, so only the grid has it.',
      };
}

/** What a paste names: the rectangle it came from, and the cell it is going down on. */
function putting(copied: Copied, row: number, col: number): Pasted {
  return {
    from: { sheet: copied.sheet, ...copied.rect },
    sheet: copied.sheet,
    row,
    col,
    cut: copied.cut,
  };
}

import type { Axis } from '@yxl-vscode/spec';
import { cellOf, parseA1Addr, type Rect } from '@yxl-vscode/units';
import { sheetAgain } from './again';
import { flavours, onto } from './clipboard';
import { draw, focusCell, restate } from './draw';
import { between } from './keys';
import type {
  Drawing,
  DrawnSheet,
  Editable,
  FromView,
  Refused,
  Source,
  ToView,
  Whole,
} from './protocol';
import {
  type Asks,
  type Copied,
  cellKey,
  type Looking,
  type Reached,
  type Showing,
} from './showing';

/** The bridge VS Code puts in a webview, and the only way out of one. */
declare function acquireVsCodeApi(): { postMessage: (message: FromView) => void };

/** Where the view sends what it wants, which is the editor and nothing else. */
export interface Host {
  readonly postMessage: (message: FromView) => void;
}

/**
 * The view, driven by the host's messages. It holds a few things of its own —
 * named, not numbered, so a spec read again finds them (ADR-023) — and redraws
 * outright for everything else (ADR-001).
 */
export function wire(into: HTMLElement, host: Host): (message: ToView) => void {
  let drawing: Drawing | null = null;
  let sheet = 0;
  let selected: Showing['selected'] = null;
  /** Where a range was started from, which stays put while the selection moves. */
  let anchor: Showing['anchor'] = null;
  let line: Showing['line'] = 'thin';
  /** Which of the toolbar's menus the reader has open, which no redraw closes. */
  let menu: Showing['menu'] = null;
  let sources: readonly Source[] | null = null;
  let reached: Reached | null = null;
  let refused: Refused | null = null;
  let said: string | null = null;
  /** The rectangle the reader has copied, which is a place rather than the cells in it (ADR-032). */
  let copied: Copied | null = null;
  /** What the reader is looking for, and where they are in what the host found. */
  let looking: Looking | null = null;
  /** Where a window was asked for, so the drawing that answers it can finish the going. */
  let going: { row: number; col: number } | null = null;
  /** What our own copy last put on the system clipboard, which says whose paste this is. */
  let ours: string | null = null;
  /** How the selection was taken, which a heading changes and a cell puts back (ADR-041). */
  let taken: Whole = null;

  /** Where the last edit was typed, so a refusal can put the reader back at it. */
  let typedAt: { row: number; col: number } | null = null;

  /** Everything the view is showing, read at the moment it is asked for. */
  const showing = (of: Drawing): Showing => ({
    drawing: of,
    sheet,
    selected,
    anchor,
    line,
    menu,
    sources,
    reached,
    refused,
    said,
    copied,
    looking,
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

  /** The selection put on a cell, and the window moved where the cell is outside the one drawn. */
  const goToCell = (at: { row: number; col: number } | undefined): void => {
    if (at === undefined) return;

    selected = at;
    anchor = at;
    sources = null;
    host.postMessage({ kind: 'inspect', sheet: named(), row: at.row, col: at.col });

    const of = drawing?.sheets[sheet];
    const inside =
      of !== undefined &&
      at.row >= of.at.row &&
      at.col >= of.at.col &&
      at.row < of.at.row + of.rows &&
      at.col < of.at.col + of.columns;

    if (!inside) {
      going = at;
      host.postMessage({ kind: 'window', sheet: named(), row: at.row, col: at.col });
      return;
    }

    restated();
    seen(at);
  };

  /** The cell brought into view, which selecting it does not do on its own. */
  const seen = (at: { row: number; col: number }): void => {
    const cell = into.querySelector<HTMLElement>(`td[data-at="${cellKey(at.col, at.row)}"]`);
    cell?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };

  /** What a drag sizes: the run taken by its headings where the one dragged is inside it (ADR-042). */
  const dragging = (axis: Axis, at: number): { first: number; last: number } => {
    const along = axis === 'column' ? 'columns' : 'rows';
    if (taken !== along || selected === null || anchor === null) return { first: at, last: at };

    const one = axis === 'column' ? selected.col : selected.row;
    const than = axis === 'column' ? anchor.col : anchor.row;
    const run = { first: Math.min(one, than), last: Math.max(one, than) };

    return at >= run.first && at <= run.last ? run : { first: at, last: at };
  };

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
      taken = null;
      sources = null;
      host.postMessage({ kind: 'inspect', sheet: named(), row, col });
      restated();
    },
    reachTo: (row, col) => {
      anchor ??= selected;
      selected = { row, col };
      taken = null;
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
      host.postMessage({
        kind: 'pasteAt',
        sheet: named(),
        row,
        col,
        from: copied === null ? null : { sheet: copied.sheet, ...copied.rect },
        cut: copied?.cut ?? false,
        ours,
      });
    },
    resolveWith: (typed, choice) => {
      host.postMessage({ ...typed, choice, kind: 'resolve' });
    },
    drawWith: (chosen) => {
      line = chosen;
      restated();
    },
    openMenu: (name) => {
      menu = name;
      restated();
    },
    freeze: (at) => {
      refused = null;
      said = null;
      host.postMessage({ kind: 'freeze', sheet: named(), at });
    },
    takeAll: () => {
      const of = drawing?.sheets[sheet];
      if (of === undefined) return;

      // Whole columns, so a look over the sheet is bands rather than a cell
      // entry per address the grid happens to be drawing (ADR-041).
      anchor = { row: of.of.rows, col: of.of.columns };
      selected = { row: 1, col: 1 };
      taken = 'columns';
      sources = null;
      host.postMessage({ kind: 'inspect', sheet: named(), row: 1, col: 1 });
      restated();
    },
    takeBand: (axis, at, extend) => {
      const of = drawing?.sheets[sheet];
      if (of === undefined) return;

      const far =
        axis === 'column' ? { row: of.of.rows, col: at } : { row: at, col: of.of.columns };
      const near = axis === 'column' ? { row: 1, col: at } : { row: at, col: 1 };
      const along: Whole = axis === 'column' ? 'columns' : 'rows';

      if (!extend || taken !== along || anchor === null) anchor = far;
      selected = near;
      taken = along;
      sources = null;
      host.postMessage({ kind: 'inspect', sheet: named(), row: near.row, col: near.col });
      restated();
    },
    resize: (axis, at, size) => {
      refused = null;
      said = null;
      host.postMessage({ kind: 'resize', sheet: named(), axis, ...dragging(axis, at), size });
    },
    resizedWith: (resized, choice) => {
      refused = null;
      said = null;
      host.postMessage({ ...resized, choice, kind: 'resized' });
    },
    wear: (want, over) => {
      refused = null;
      said = null;
      host.postMessage({ kind: 'wear', sheet: named(), ...over, want, whole: taken });
    },
    wornWith: (worn, choice) => {
      refused = null;
      said = null;
      host.postMessage({ kind: 'worn', choice, ...worn });
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
    look: (text) => {
      const first = looking === null;
      looking = { text, cells: [], at: -1 };
      host.postMessage({ kind: 'find', sheet: named(), text });
      if (!first) return;

      // Only the first time: redrawing while the reader is typing would take
      // the box out from under them.
      redraw();
      into.querySelector<HTMLInputElement>('.looking .for')?.focus();
    },
    goOn: (by) => {
      if (looking === null || looking.cells.length === 0) return;

      const at = (looking.at + by + looking.cells.length * 2) % looking.cells.length;
      looking = { ...looking, at };
      goToCell(looking.cells[at]);
    },
    goTo: (address) => {
      const at = parseA1Addr(address.trim().toUpperCase());
      if (at === null) {
        said = `\`${address}\` is not an address to go to.`;
        restated();
        return;
      }

      goToCell(cellOf(at));
    },
    stopLooking: () => {
      looking = null;
      redraw();
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

      // Only for a window this view asked for: every other drawing is the file
      // changing under a reader who is typing somewhere else.
      const went = going;
      going = null;
      if (went === null) return;

      seen(went);
      if (looking !== null) into.querySelector<HTMLInputElement>('.looking .for')?.focus();
      return;
    }

    if (sent.kind === 'found') {
      // Only for the search still being typed: an older answer would jump the
      // reader back to what they had already moved past.
      if (looking !== null && looking.text === sent.text && sent.sheet === named()) {
        looking = { ...looking, cells: sent.cells, at: -1 };
        if (sent.cells.length > 0) asks.goOn(1);
        else restated();
      }
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

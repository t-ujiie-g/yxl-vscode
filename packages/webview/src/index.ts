import type { Axis } from '@yxl-vscode/spec';
import { cellOf, parseA1Addr, type Rect } from '@yxl-vscode/units';
import { sheetAgain } from './again';
import { flavours, onto } from './clipboard';
import { draw, focusCell, restate } from './draw';
import { between } from './keys';
import { ruler, widest } from './measure';
import type {
  Drawing,
  DrawnSheet,
  Editable,
  FromView,
  Inspected,
  Refused,
  ToView,
  Whole,
} from './protocol';
import {
  type Asks,
  type Copied,
  cellKey,
  type Looking,
  type Pointed,
  type Reached,
  reaches,
  type Showing,
} from './showing';
import { headed } from './table';
import { sizeOf } from './window';

/** The bridge VS Code puts in a webview, and the only way out of one. */
declare function acquireVsCodeApi(): Host;

/**
 * Where the view sends what it wants, which is the editor and nothing else.
 * `setState` is VS Code's own: what it hands back to revive this panel after a
 * window reload, and the only thing the view keeps across one.
 */
export interface Host {
  readonly postMessage: (message: FromView) => void;
  readonly setState?: (state: { readonly file: string }) => void;
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
  /** What the host last said about the selected cell, and about the sheet it is on. */
  let inspected: Inspected | null = null;
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
  /** The heading a menu was asked for on, which is the view's own like the rest of them. */
  let pointed: Showing['pointed'] = null;
  /** What the host last said the selection comes to, which only a rectangle has. */
  let comes: Showing['comes'] = null;

  /** The sheet the reader asked for and has not seen yet. */
  let adding: string | null = null;

  /** The tab being renamed, kept here so a redraw does not take the box away. */
  let naming: number | null = null;

  /** The box open over a cell and what it asks for, kept here for the same reason. */
  let asking: Showing['asking'] = null;

  /** The tab last gone to, so the second click on it is the one that renames. */
  let went: { index: number; at: number } | null = null;

  /** Whether a press is being held. A button down is not a drag: it is still down after a link was followed. */
  let pressed = false;

  /** Where the last edit was typed, so a refusal can put the reader back at it. */
  let typedAt: { row: number; col: number } | null = null;

  /** The run of a rich cell the bar is on, and the cell it was picked on: another cell starts at its first. */
  let run: { row: number; col: number; at: number } | null = null;

  /** Everything the view is showing, read at the moment it is asked for. */
  const showing = (of: Drawing): Showing => ({
    drawing: of,
    sheet,
    selected,
    anchor,
    line,
    menu,
    pointed,
    comes,
    sources: inspected?.sources ?? null,
    carried: inspected?.carried ?? null,
    reached,
    refused,
    said,
    copied,
    looking,
    editable: editable(),
    run: runAt(),
    naming,
    asking,
  });

  const redraw = (): void => {
    if (drawing !== null) draw(into, showing(drawing), asks);
  };

  // Taken before the cell's own listener, which is where following a link says
  // this press is not a drag.
  into.addEventListener(
    'mousedown',
    () => {
      pressed = true;
    },
    { capture: true },
  );
  into.addEventListener('mouseup', () => {
    pressed = false;
  });

  /** The same, for what the view holds of its own: the grid stays as it is. */
  const restated = (): void => {
    if (drawing !== null) restate(into, showing(drawing), asks);
  };

  /** A gesture on its way to the host, which takes down what the host said about the last one. */
  const send = (message: FromView): void => {
    refused = null;
    said = null;
    host.postMessage(message);
  };

  /** Whether what the reader pointed at is already selected, which is what leaves a menu's run alone. */
  const already = (at: Pointed): boolean => {
    if (drawing === null) return false;
    const now = showing(drawing);

    if (at.kind === 'tab') return at.sheet === now.sheet;

    return at.kind === 'cell' ? reaches(now, at) : headed(now, at.axis, at.at);
  };

  /** The keyboard put on the cell the selection starts at, where the grid is drawing it. */
  const focused = (): void => {
    if (drawing !== null) focusCell(into, showing(drawing));
  };

  const named = (): string => drawing?.sheets[sheet]?.name ?? '';

  /** The selection put on a cell, and the window moved where the cell is outside the one drawn. */
  const goToCell = (at: { row: number; col: number } | undefined): void => {
    if (at === undefined) return;

    selected = at;
    anchor = at;
    inspected = null;
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

  /** What the selection comes to, asked of the host: the view has only a window (ADR-019). */
  const summing = (): void => {
    const rect = spanned();
    if (rect === null) {
      comes = null;
      return;
    }

    host.postMessage({ kind: 'sum', sheet: named(), ...rect });
  };

  /** The rectangle a gesture acts on: everything selected, a lone cell included. */
  const acting = (): Rect => {
    const at = selected ?? { row: 1, col: 1 };
    return between(at, anchor ?? at);
  };

  /** The rectangle selected, read live: the grid restates rather than redraws on a selection. */
  const spanned = (): Rect | null => {
    if (selected === null || anchor === null) return null;
    if (selected.row === anchor.row && selected.col === anchor.col) return null;

    return between(selected, anchor);
  };

  /** Which run the bar is on, which is the first of them wherever the reader has since moved. */
  const runAt = (): number =>
    run !== null && run.row === selected?.row && run.col === selected.col ? run.at : 0;

  /** Whether the cell the reader has selected is one they can type into. */
  const editable = (): Editable | null => {
    if (selected === null) return null;

    const cells = drawing?.sheets[sheet]?.cells ?? [];
    const at = cells.find((one) => one.row === selected?.row && one.col === selected?.col);
    return at?.editable ?? null;
  };

  const asks: Asks = {
    showSheet: (index) => {
      // Counted here rather than left to `dblclick`, which never arrives: going
      // to a sheet redraws the bar, so the second click is on a new element.
      const twice = went?.index === index && Date.now() - went.at < 500;
      went = { index, at: Date.now() };
      if (twice) {
        naming = index;
        redraw();
        return;
      }

      naming = null;
      sheet = index;
      selected = null;
      anchor = null;
      inspected = null;
      reached = null;
      redraw();
    },
    addSheet: (name) => {
      adding = name;
      send({ kind: 'addSheet', name });
    },
    setTab: (sheet, of) => {
      naming = null;
      send({ kind: 'setTab', sheet, ...of });
    },
    moveSheet: (sheet, to) => {
      naming = null;
      send({ kind: 'moveSheet', sheet, to });
    },
    deleteSheet: (sheet) => {
      naming = null;
      send({ kind: 'deleteSheet', sheet });
    },
    nameSheet: (index) => {
      naming = index;
      redraw();
    },
    renameSheet: (sheet, name) => {
      naming = null;
      adding = name;
      redraw();
      send({ kind: 'renameSheet', sheet, name });
    },
    select: (row, col) => {
      selected = { row, col };
      anchor = { row, col };
      taken = null;
      inspected = null;
      comes = null;
      host.postMessage({ kind: 'inspect', sheet: named(), row, col });
      restated();
    },
    dragTo: (row, col) => {
      if (pressed) asks.reachTo(row, col);
    },
    dragBand: (axis, at) => {
      if (pressed) asks.takeBand(axis, at, true);
    },
    reachTo: (row, col) => {
      anchor ??= selected;
      selected = { row, col };
      taken = null;
      inspected = null;
      host.postMessage({ kind: 'inspect', sheet: named(), row, col });
      summing();
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
      typedAt = { row, col };
      send({ kind: 'edit', sheet: named(), row, col, text });
    },
    editRun: (row, col, index, text) => {
      typedAt = { row, col };
      send({ kind: 'editRun', sheet: named(), row, col, index, text });
    },
    showRun: (index) => {
      if (selected !== null) run = { ...selected, at: index };
    },
    empty: (row, col) => {
      const rect = spanned();
      if (rect === null) {
        typedAt = { row, col };
        send({ kind: 'edit', sheet: named(), row, col, text: '' });
        return;
      }

      typedAt = { row: rect.top, col: rect.left };
      send({ kind: 'empty', sheet: named(), ...rect });
    },
    undo: (redo) => {
      send({ kind: 'undo', redo });
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
      send({
        kind: 'pasteAt',
        sheet: named(),
        row,
        col,
        from: copied === null ? null : { sheet: copied.sheet, ...copied.rect },
        cut: copied?.cut ?? false,
        ours,
      });
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
      send({ kind: 'freeze', sheet: named(), at });
    },
    filter: (on) => {
      send({ kind: 'filter', sheet: named(), on, ...acting() });
    },
    formatTable: (on) => {
      send({ kind: 'tabled', sheet: named(), on, ...acting() });
    },
    chart: () => {
      send({ kind: 'chart', sheet: named(), ...acting() });
    },
    image: (row, col) => {
      send({ kind: 'image', sheet: named(), row, col });
    },
    moveFloat: (node, to) => {
      send({ kind: 'moveFloat', sheet: named(), node, ...to });
    },
    sizeFloat: (node, size) => {
      send({ kind: 'sizeFloat', sheet: named(), node, ...size });
    },
    askAt: (asked) => {
      asking = asked;
      redraw();
    },
    note: (row, col, text) => {
      asking = null;
      redraw();
      send({ kind: 'note', sheet: named(), row, col, text });
    },
    link: (row, col, to) => {
      asking = null;
      redraw();
      send({ kind: 'link', sheet: named(), row, col, link: to });
    },
    validate: (choices) => {
      asking = null;
      redraw();
      send({ kind: 'validate', sheet: named(), ...acting(), choices });
    },
    follow: (row, col) => {
      pressed = false;
      send({ kind: 'follow', sheet: named(), row, col });
    },
    takeAll: () => {
      const of = drawing?.sheets[sheet];
      if (of === undefined) return;

      // Whole columns, so a look over the sheet is bands rather than a cell
      // entry per address the grid happens to be drawing (ADR-041).
      anchor = { row: of.of.rows, col: of.of.columns };
      selected = { row: 1, col: 1 };
      taken = 'columns';
      inspected = null;
      host.postMessage({ kind: 'inspect', sheet: named(), row: 1, col: 1 });
      summing();
      restated();
      focused();
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
      inspected = null;
      host.postMessage({ kind: 'inspect', sheet: named(), row: near.row, col: near.col });
      summing();
      restated();
      focused();
    },
    pointAt: (at) => {
      // Decided here rather than in the grid, whose listeners were built when
      // it was last drawn and cannot know where the reader has got to since.
      if (at !== null && !already(at)) {
        if (at.kind === 'cell') asks.select(at.row, at.col);
        if (at.kind === 'heading') asks.takeBand(at.axis, at.at, false);
        if (at.kind === 'tab') asks.showSheet(at.sheet);
      }

      pointed = at;
      redraw();
    },
    hide: (axis, first, last, hidden) => {
      send({ kind: 'hide', sheet: named(), axis, first, last, hidden });
    },
    sort: (down) => {
      const rect = spanned();
      if (rect === null) return;

      send({ kind: 'sort', sheet: named(), ...rect, down });
    },
    fill: (axis) => {
      const rect = spanned();
      if (rect === null) return;

      send({ kind: 'fill', sheet: named(), ...rect, axis });
    },
    table: () => {
      const rect = spanned();
      if (rect === null) return;

      send({ kind: 'table', sheet: named(), ...rect });
    },
    merge: (merged) => {
      const rect = spanned();
      if (rect === null && merged) return;

      const where = rect ?? between(selected ?? { row: 1, col: 1 }, selected ?? { row: 1, col: 1 });
      send({ kind: 'merge', sheet: named(), ...where, merged });
    },
    line: (axis, at, by) => {
      send({ kind: 'line', sheet: named(), axis, at, by });
    },
    group: (axis, first, last, level) => {
      send({ kind: 'group', sheet: named(), axis, first, last, level });
    },
    fit: (axis, at) => {
      send({ kind: 'fit', sheet: named(), axis, at });
    },
    resize: (axis, at, size) => {
      send({ kind: 'resize', sheet: named(), axis, ...dragging(axis, at), size });
    },
    wear: (want, over) => {
      send({ kind: 'wear', sheet: named(), ...over, want, whole: taken });
    },
    look: (asked) => {
      // `null` is the key asking for the search, which is about whatever it
      // already holds — the grid was drawn before the reader typed (ADR-047).
      const text = asked ?? looking?.text ?? '';
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
    stopAsking: () => {
      refused = null;
      restated();
    },
    stopLooking: () => {
      looking = null;
      redraw();
    },
    // One path for every question the host asks: the message it refused comes
    // back with the answer taken, and the host reads its own `kind` (ADR-048).
    answer: (asked, choice) => {
      send({ ...asked, choice });
      restated();
    },
    overrideWith: (typed, reason) => {
      // `kind` last, or a spread message carrying its own `kind` is that message.
      host.postMessage({ ...typed, reason, kind: 'override' });
      refused = null;
      restated();
    },
  };

  // A panel VS Code tore down while it was hidden loads this page again, into a
  // host that has already sent its drawing to a webview that is gone.
  host.postMessage({ kind: 'ready' });

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
      host.setState?.({ file: sent.file });
      // The answers were worked out against the text as it was; a spec that has
      // changed since is not the one the question was about.
      refused = null;
      const was = drawing?.sheets[sheet];
      if (drawing?.file !== sent.file) {
        sheet = 0;
        selected = null;
        anchor = null;
      } else if (was !== undefined) {
        sheet = sheetAgain(sent.sheets, { name: was.name, index: sheet });
      }

      // The sheet the reader just asked for, once the drawing that has it arrives.
      const made = adding === null ? -1 : sent.sheets.findIndex((one) => one.name === adding);
      if (made >= 0) {
        sheet = made;
        selected = null;
        anchor = null;
      }
      adding = null;
      drawing = sent;
      inspected = null;
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

    if (sent.kind === 'fitting') {
      // The host has every cell of the run; the view has the font each is drawn
      // in, so the width is measured here and sent back as an ordinary drag.
      const rule = ruler();
      const wide = rule === null ? null : widest(sent.cells, rule);
      if (wide !== null && sent.sheet === named()) {
        asks.resize(sent.axis, sent.at, sizeOf(sent.axis, wide));
      }
      return;
    }

    if (sent.kind === 'summed') {
      // Only while it is still the sheet that asked: a drawing may have come between.
      if (sent.sheet === named()) {
        comes = sent;
        restated();
      }
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

    if (sent.kind === 'goTo') {
      const went = drawing?.sheets.findIndex((one) => one.name === sent.sheet) ?? -1;
      if (went < 0) return;

      // Cleared before the sheet is drawn: the cell came from another sheet,
      // and drawing it selected here is a wrong answer until it catches up.
      sheet = went;
      selected = null;
      anchor = null;
      inspected = null;
      reached = null;
      redraw();
      goToCell({ row: sent.row, col: sent.col });
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
      inspected = sent;
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

import { finds, reaches } from '@yxl-vscode/compile';
import { type Engine, univerEngine } from '@yxl-vscode/evaluate';
import type { Tabbed } from '@yxl-vscode/intent';
import { did, type History, nothing } from '@yxl-vscode/patch';
import type { Axis } from '@yxl-vscode/spec';
import { addrAt, cellOf, filePath, parseColor, qualified, rangeOf } from '@yxl-vscode/units';
import type {
  Edging,
  EditedRun,
  Filled,
  Filtered,
  FromView,
  Frozen,
  Grouped,
  Hidden,
  Lined,
  Linked,
  Merged,
  MovedFloat,
  Noted,
  Pasted,
  PastedAt,
  PastedText,
  Ranged,
  Resized,
  SizedFloat,
  Sorted,
  Tabled,
  Typed,
  Validated,
  Worn,
} from '@yxl-vscode/webview/protocol';
import * as vscode from 'vscode';
import { moved, resized } from './anchors';
import { chart } from './charts';
import { paste, pastedWith, pasteFrom, whose } from './clipboard';
import { asText } from './copying';
import { asOpen, put, reveal, textOf } from './documents';
import { edgeFrom } from './edges';
import { besideSpec } from './files';
import { fill } from './fills';
import { group } from './group';
import { hide } from './hidden';
import { image } from './images';
import { carriedBy, inspect, type Nodes, nodeUnder } from './inspect';
import { line } from './lines';
import { following, link } from './links';
import { wear } from './look';
import { merge } from './merges';
import { note } from './notes';
import { filter, freeze } from './panes';
import { measureBeside } from './pictures';
import { drawRun, extent, type Projected, project, redraw, type Window } from './project';
import { formatTable } from './regions';
import { editRun } from './runs';
import { add, move, remove, rename, tab } from './sheets';
import { resize } from './size';
import { sort } from './sorts';
import { summed } from './summing';
import { table } from './tables';
import { goBack } from './undo';
import { validate } from './validations';
import {
  emptied,
  empty,
  type Offer,
  type Port,
  rectIn,
  resolve,
  type Spec,
  write,
  writeOverride,
} from './write';

/** The extensions the picker offers, which are the ones Excel decodes (`docs/spec.md` §13). */
const PICTURES = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff', 'ico', 'svg', 'emf', 'wmf'];

/** Long enough that typing does not redraw on every keystroke, short enough to feel live. */
const SETTLE = 150;

/** The same, for a cursor, which moves more often and costs less to answer. */
const FOLLOW = 80;

/** Every gesture that writes, by the kind that carries it: the message minus `kind` and `choice` is what it takes. */
const WRITES = {
  edit: (spec: Spec, typed: Typed, port: Port, choice?: string) =>
    choice === undefined ? write(spec, typed, port) : resolve(spec, typed, choice, port),
  override: (spec: Spec, asked: Typed & { reason: string }, port: Port) => {
    const { reason, ...typed } = asked;
    return writeOverride(spec, typed, reason === '' ? undefined : reason, port);
  },
  empty: (spec: Spec, ranged: Ranged, port: Port, choice?: string) =>
    choice === undefined ? empty(spec, ranged, port) : emptied(spec, ranged, choice, port),
  wear: (spec: Spec, worn: Worn, port: Port, choice?: string) => wear(spec, worn, port, choice),
  freeze: (spec: Spec, frozen: Frozen, port: Port) => freeze(spec, frozen, port),
  filter: (spec: Spec, asked: Filtered, port: Port) => filter(spec, asked, port),
  tabled: (spec: Spec, asked: Tabled, port: Port) => formatTable(spec, asked, port),
  chart: (spec: Spec, one: Ranged, port: Port, choice?: string) => chart(spec, one, port, choice),
  moveFloat: (spec: Spec, one: MovedFloat, port: Port) => moved(spec, one, port),
  sizeFloat: (spec: Spec, one: SizedFloat, port: Port) => resized(spec, one, port, measureBeside),
  note: (spec: Spec, asked: Noted, port: Port) => note(spec, asked, port),
  editRun: (spec: Spec, asked: EditedRun, port: Port) => editRun(spec, asked, port),
  link: (spec: Spec, asked: Linked, port: Port) => link(spec, asked, port),
  validate: (spec: Spec, asked: Validated, port: Port) => validate(spec, asked, port),
  merge: (spec: Spec, one: Merged, port: Port) => merge(spec, one, port),
  table: (spec: Spec, one: Ranged, port: Port) => table(spec, one, port),
  fill: (spec: Spec, one: Filled, port: Port, choice?: string) => fill(spec, one, port, choice),
  sort: (spec: Spec, one: Sorted, port: Port) => sort(spec, one, port),
  addSheet: (spec: Spec, one: { name: string }, port: Port) => add(spec, one.name, port),
  renameSheet: (spec: Spec, one: { sheet: string; name: string }, port: Port) =>
    rename(spec, one.sheet, one.name, port),
  deleteSheet: (spec: Spec, one: { sheet: string }, port: Port) => remove(spec, one.sheet, port),
  moveSheet: (spec: Spec, one: { sheet: string; to: number }, port: Port) =>
    move(spec, one.sheet, one.to, port),
  setTab: (
    spec: Spec,
    one: {
      sheet: string;
      visibility?: 'visible' | 'hidden';
      color?: string | null;
      gridlines?: boolean;
    },
    port: Port,
  ) => tab(spec, one.sheet, worn(one), port),
  group: (spec: Spec, grouped: Grouped, port: Port, choice?: string) =>
    group(spec, grouped, port, choice),
  hide: (spec: Spec, one: Hidden, port: Port, choice?: string) => hide(spec, one, port, choice),
  resize: (spec: Spec, one: Resized, port: Port, choice?: string) =>
    resize(spec, one, port, choice),
  line: (spec: Spec, one: Lined, port: Port, choice?: string) => line(spec, one, port, choice),
  paste: (spec: Spec, one: Pasted, port: Port, choice?: string) =>
    pastedWith(spec, one, choice ?? '', port),
  pasteText: (spec: Spec, one: PastedText, port: Port, choice?: string) =>
    pasteFrom(spec, one, port, choice),
} as const;

/** The preview: one panel per spec, beside the text, recomputed from the file on every change (ADR-001). */
export class Preview {
  private static open = new Map<string, Preview>();

  private readonly panel: vscode.WebviewPanel;
  private readonly problems: vscode.DiagnosticCollection;
  private readonly listeners: vscode.Disposable[] = [];
  private settling: ReturnType<typeof setTimeout> | undefined;
  private following: ReturnType<typeof setTimeout> | undefined;
  private drawn: Projected | undefined;
  private nodes: Nodes = new Map();
  /** Every file the last drawing was read from, which is what a redraw watches. */
  private sources = new Set<string>();
  private read = -1;
  private readonly params = new Map<string, string>();
  private readonly windows = new Map<string, Window>();
  private history: History = nothing;
  /** What this editor left each file at, which is what says whether its own undo is the honest one (ADR-030). */
  private readonly left = new Map<string, string>();

  /** One engine for the life of the panel: standing one up registers five hundred functions. */
  private readonly engine: Engine = univerEngine();

  /** The preview a reader is in, which is the one a command about *this* preview is about. */
  private static showing: Preview | undefined;

  /** The spec the grid in front of the reader draws, where one is: `showing` is the last, not the live. */
  static spec(): vscode.TextDocument | undefined {
    const showing = Preview.showing;
    return showing?.panel.active === true ? showing.document : undefined;
  }

  /** The spec behind the grid, put back in front of the reader (ADR-020). */
  static showSource(): void {
    const document = Preview.showing?.document;
    if (document === undefined) return;

    const open = vscode.window.visibleTextEditors.find((one) => one.document === document);
    void vscode.window.showTextDocument(document, {
      viewColumn: open?.viewColumn ?? vscode.ViewColumn.One,
    });
  }

  static show(document: vscode.TextDocument, extension: vscode.Uri): void {
    const already = Preview.open.get(document.uri.toString());
    if (already !== undefined) {
      already.panel.reveal(vscode.ViewColumn.Beside, true);
      return;
    }

    Preview.open.set(document.uri.toString(), new Preview(document, extension));
  }

  /** A panel VS Code kept across a window reload, given back the spec the view saved. */
  static revive(
    document: vscode.TextDocument,
    extension: vscode.Uri,
    panel: vscode.WebviewPanel,
  ): void {
    if (Preview.open.has(document.uri.toString())) {
      panel.dispose();
      return;
    }

    Preview.open.set(document.uri.toString(), new Preview(document, extension, panel));
  }

  private constructor(
    private readonly document: vscode.TextDocument,
    extension: vscode.Uri,
    panel?: vscode.WebviewPanel,
  ) {
    const options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extension, 'dist')],
    };

    this.panel =
      panel ??
      vscode.window.createWebviewPanel(
        'yxl.preview',
        `Preview ${document.uri.path.split('/').at(-1) ?? ''}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        {
          ...options,
          // A hidden panel is torn down otherwise, and the reader loses where
          // they were in the sheet, which the host cannot send back to them.
          retainContextWhenHidden: true,
        },
      );

    // Only the revived one: setting these reloads the webview, and a panel just
    // created has them already.
    if (panel !== undefined) this.panel.webview.options = options;

    this.problems = vscode.languages.createDiagnosticCollection('yxl');
    this.panel.webview.html = this.page(extension);

    this.listeners.push(
      // Any file the spec is made of, unsaved: a `WorkspaceEdit` into an
      // `$include`d file leaves its buffer dirty and no save ever comes.
      vscode.workspace.onDidChangeTextDocument((change) => {
        if (this.reads(change.document)) this.later();
      }),
      vscode.workspace.onDidSaveTextDocument((saved) => {
        // A file changed outside this editor, which no change event spoke for.
        if (!this.reads(saved)) this.later();
      }),
      vscode.window.onDidChangeTextEditorSelection((moved) => this.follow(moved.textEditor)),
    );

    this.listeners.push(this.panel.webview.onDidReceiveMessage((asked) => this.answer(asked)));
    this.listeners.push(
      this.panel.onDidChangeViewState(() => {
        if (this.panel.active) Preview.showing = this;
      }),
    );
    this.panel.onDidDispose(() => this.close());
    Preview.showing = this;
    this.redraw();
  }

  private later(): void {
    clearTimeout(this.settling);
    this.settling = setTimeout(() => this.redraw(), SETTLE);
  }

  /** Which cells the node under the text cursor reaches. */
  private follow(editor: vscode.TextEditor): void {
    if (!this.reads(editor.document)) return;

    clearTimeout(this.following);
    this.following = setTimeout(() => this.reaching(editor), FOLLOW);
  }

  /** Whether the last drawing was read from this document — the spec, an `$include`, a `data:` file. */
  private reads(document: vscode.TextDocument): boolean {
    return (
      document.uri.toString() === this.document.uri.toString() ||
      this.sources.has(document.uri.fsPath)
    );
  }

  /** The editor whose cursor to answer about, of those a reader can see. */
  private cursor(): vscode.TextEditor | undefined {
    const active = vscode.window.activeTextEditor;
    if (active !== undefined && this.reads(active.document)) return active;

    return vscode.window.visibleTextEditors.find((one) => this.reads(one.document));
  }

  private reaching(editor: vscode.TextEditor | undefined = this.cursor()): void {
    const grid = this.drawn?.grid;
    if (editor === undefined || grid === undefined || grid === null) return;

    // Spans are offsets into the text as it was read; until the redraw catches
    // up, a cursor in edited text names whatever the shift lands on.
    const own = editor.document.uri.toString() === this.document.uri.toString();
    const inStep = own ? this.document.version === this.read : !editor.document.isDirty;
    if (!inStep) {
      void this.panel.webview.postMessage({ kind: 'highlighted', says: '', cells: [] });
      return;
    }

    const at = editor.document.offsetAt(editor.selection.active);
    const node = nodeUnder(this.nodes, editor.document.uri.fsPath, at);
    if (node === null) {
      void this.panel.webview.postMessage({ kind: 'highlighted', says: '', cells: [] });
      return;
    }

    void this.panel.webview.postMessage({
      kind: 'highlighted',
      says: this.nodes.get(node)?.what ?? 'the cursor',
      cells: reaches(grid, node).map((one) => ({ sheet: one.sheet, ...cellOf(one.at) })),
    });
  }

  private redraw(): void {
    const file = this.document.uri.fsPath;
    this.read = this.document.version;

    const sources = new Set<string>();
    const drawn = project(
      this.document.getText(),
      file,
      (from, path) => {
        const found = asOpen(from, path);
        if (found !== null) sources.add(found.file);
        return found;
      },
      this.params,
      this.windows,
      this.engine,
      measureBeside,
    );
    const { drawing, diagnostics } = drawn;
    this.drawn = drawn;
    this.nodes = drawn.nodes;
    this.sources = sources;

    void this.panel.webview.postMessage(drawing);
    this.problems.set(
      this.document.uri,
      diagnostics
        .filter((one) => one.file === file)
        .map((one) => {
          const at = new vscode.Range(
            this.document.positionAt(one.span.start),
            this.document.positionAt(one.span.end),
          );
          const shown = new vscode.Diagnostic(at, one.message, vscode.DiagnosticSeverity.Error);
          shown.source = 'yxl';
          shown.code = one.code;
          return shown;
        }),
    );

    this.reaching();
  }

  /** Every cell of a sheet holding what the reader is looking for, whether it is drawn or not. */
  private searched(name: string, text: string): void {
    const sheet = this.drawn?.grid?.sheets.find((one) => one.name === name);
    const cells = sheet === undefined ? [] : finds(sheet, text).map((at) => cellOf(at));

    void this.panel.webview.postMessage({ kind: 'found', sheet: name, text, cells });
  }

  /** What the rectangle a reader has selected comes to, said under the grid (ADR-014). */
  private summing(ranged: Ranged): void {
    const sheet = this.drawn?.grid?.sheets.find((one) => one.name === ranged.sheet);
    if (sheet === undefined) return;

    const rect = { top: ranged.top, left: ranged.left, bottom: ranged.bottom, right: ranged.right };
    const comes = summed(sheet, rect, this.drawn?.evaluation ?? null);

    void this.panel.webview.postMessage({ kind: 'summed', sheet: ranged.sheet, ...comes });
  }

  /** A rectangle onto the clipboard as values, for a copy the view could not make (ADR-035). */
  private async copying(ranged: Ranged): Promise<void> {
    const sheet = this.drawn?.grid?.sheets.find((one) => one.name === ranged.sheet);
    if (sheet === undefined) return;

    const text = asText(sheet, rectIn(ranged), this.drawn?.evaluation ?? null);
    await vscode.env.clipboard.writeText(text);

    void this.panel.webview.postMessage({ kind: 'copied', text });
    this.port().said(
      `${rangeOf(rectIn(ranged))} copied as values: the look is only known for what is drawn.`,
    );
  }

  /** Where a `Cmd`+arrow lands, over every cell rather than the drawn window (ADR-019). */
  private edging(asked: Edging): void {
    const sheet = this.drawn?.grid?.sheets.find((one) => one.name === asked.sheet);
    if (sheet === undefined) return;

    const at = edgeFrom(sheet, extent(sheet), addrAt({ col: asked.col, row: asked.row }), asked.to);
    const { col, row } = cellOf(at);

    void this.panel.webview.postMessage({
      kind: 'edged',
      sheet: asked.sheet,
      row,
      col,
      extend: asked.extend,
    });
  }

  /** Every cell of a run, for the view to measure a fit against (ADR-043). */
  private measuring(name: string, axis: Axis, at: number): void {
    const sheet = this.drawn?.grid?.sheets.find((one) => one.name === name);
    if (sheet === undefined) return;

    const cells = drawRun(sheet, axis, at, this.drawn?.evaluation ?? null);
    void this.panel.webview.postMessage({ kind: 'fitting', sheet: name, axis, at, cells });
  }

  /** What the host holds, sent again: a webview that has reloaded has nothing of its own. */
  private shown(): void {
    const drawing = this.drawn?.drawing;
    if (drawing === undefined) this.redraw();
    else void this.panel.webview.postMessage(drawing);
  }

  /** What the view asked for. */
  private answer(asked: FromView): void {
    if (asked.kind === 'ready') {
      this.shown();
      return;
    }

    const writes = WRITES[asked.kind as keyof typeof WRITES];
    if (writes !== undefined) {
      const { kind, choice, ...about } = asked as { kind: string; choice?: string };
      this.writing((spec, port) => writes(spec, about as never, port, choice));
      return;
    }

    if (asked.kind === 'image') {
      void this.picturing(asked);
      return;
    }

    if (asked.kind === 'follow') {
      this.went(asked);
      return;
    }

    if (asked.kind === 'reveal') {
      void reveal(asked.file, asked.start, asked.end);
      return;
    }

    if (asked.kind === 'undo') {
      this.tried(this.takeBack(asked.redo));
      return;
    }

    if (asked.kind === 'window') {
      this.looking(asked.sheet, asked.row, asked.col);
      return;
    }

    if (asked.kind === 'pasteAt') {
      const { kind, ...where } = asked;
      this.writing((spec, port) => this.pasteHere(spec, where, port));
      return;
    }

    if (asked.kind === 'copyOut') {
      void this.copying(asked);
      return;
    }

    if (asked.kind === 'sum') {
      this.summing(asked);
      return;
    }

    if (asked.kind === 'find') {
      this.searched(asked.sheet, asked.text);
      return;
    }

    if (asked.kind === 'edge') {
      this.edging(asked);
      return;
    }

    if (asked.kind === 'fit') {
      this.measuring(asked.sheet, asked.axis, asked.at);
      return;
    }

    if (asked.kind === 'setParam') {
      if (asked.value === '') this.params.delete(asked.name);
      else this.params.set(asked.name, asked.value);

      this.redraw();
      return;
    }

    if (asked.kind === 'inspect') this.inspected(asked.sheet, asked.row, asked.col);
  }

  /** The window a sheet is looked at through, where the view has scrolled somewhere new. */
  private looking(name: string, row: number, col: number): void {
    // Answering a window that has not moved turns one stray scroll into a loop.
    const at = this.windows.get(name);
    if (at?.row === row && at.col === col) return;

    this.windows.set(name, { row, col });
    const drawn = this.drawn;
    if (drawn === undefined) return;

    const drawing = redraw(drawn, this.params, this.windows, measureBeside);
    this.drawn = { ...drawn, drawing };
    void this.panel.webview.postMessage(drawing);
  }

  /** Where each facet of one cell came from, for the cell that asked. */
  private inspected(name: string, row: number, col: number): void {
    const sheet = this.drawn?.grid?.sheets.find((one) => one.name === name);
    if (sheet === undefined) return;

    void this.panel.webview.postMessage({
      kind: 'inspected',
      sheet: name,
      row,
      col,
      sources: inspect(this.nodes, sheet, addrAt({ col, row }), this.document.uri.fsPath),
      carried: carriedBy(sheet),
    });
  }

  /** A link followed: the page opened outside VS Code, or the view sent to the cell it names. */
  private went(asked: { sheet: string; row: number; col: number }): void {
    const spec = this.spec();
    if (spec === null) return;

    const went = following(spec, asked);
    if (went.kind === 'refused') {
      this.refuse(went.why, null);
      return;
    }

    const port = this.port();
    if (went.kind === 'open') {
      void vscode.env.openExternal(vscode.Uri.parse(went.url));
      port.said(`Opened ${went.url}.`);
      return;
    }

    void this.panel.webview.postMessage({
      kind: 'goTo',
      sheet: went.sheet,
      row: went.row,
      col: went.col,
    });
    port.said(`Went to ${qualified(went.sheet, addrAt({ col: went.col, row: went.row }))}.`);
  }

  /** A write, with the spec and port it needs; a spec still loading and a failure are both said rather than dropped. */
  /** A picture chosen in the editor: a webview has no file dialog, and a path is the host's to resolve. */
  private async picturing(asked: { sheet: string; row: number; col: number }): Promise<void> {
    const chosen = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Insert',
      title: 'A picture to float over the sheet',
      filters: { Pictures: [...PICTURES] },
      defaultUri: vscode.Uri.file(this.document.uri.fsPath),
    });

    const picked = chosen?.[0];
    if (picked === undefined) return;

    const path = besideSpec(this.document.uri.fsPath, picked.fsPath);
    this.writing((spec, port) => image(spec, { ...asked, path }, port));
  }

  private writing(make: (spec: Spec, port: Port) => Promise<void>): void {
    const spec = this.spec();
    if (spec === null) {
      this.refuse('this spec has not finished loading', null);
      return;
    }

    this.tried(make(spec, this.port()));
  }

  /** `Cmd`+`V` in the grid; the clipboard is read here because a webview is never given one (ADR-035). */
  private async pasteHere(spec: Spec, where: PastedAt, port: Port): Promise<void> {
    const taken = whose(where, await vscode.env.clipboard.readText());
    if (taken.is === 'grid') await paste(spec, taken.pasted, port);
    if (taken.is === 'clipboard') await pasteFrom(spec, taken.text, port);
  }

  /** The last edit taken back in place, or the editor's own undo where this one no longer holds the file (ADR-030). */
  private async takeBack(redo: boolean): Promise<void> {
    const spec = this.spec();
    const port = this.port();
    const taken = spec === null ? null : await goBack(spec, this.history, redo, port);
    if (taken !== null) this.history = taken.history;

    if (taken?.at === 'here') return;
    if (taken?.at === 'nowhere') {
      port.said(redo ? 'nothing to put on again.' : 'nothing left to take back.');
      return;
    }

    const beside = this.panel.viewColumn;
    await vscode.window.showTextDocument(this.document, { preview: false });
    await vscode.commands.executeCommand(redo ? 'redo' : 'undo');

    this.panel.reveal(beside, false);
    void this.panel.webview.postMessage({ kind: 'focus' });
  }

  /** Work that may fail, with the failure said: a rejected promise from a message handler goes nowhere. */
  private tried(work: Promise<void>): void {
    void work.catch((failed: unknown) => {
      this.refuse(failed instanceof Error ? failed.message : String(failed), null);
    });
  }

  /** The spec as the write path needs it, or nothing where it is not readable. */
  private spec(): Spec | null {
    const drawn = this.drawn;
    const root = filePath(this.document.uri.fsPath);
    if (drawn?.grid == null || drawn.doc == null || root === null) return null;

    return { root, doc: drawn.doc, grid: drawn.grid, read: asOpen, params: this.params };
  }

  private port(): Port {
    return {
      text: (file) => textOf(this.document, file),
      put: async (file, text) => {
        this.left.set(file, text);
        await put(file, text);
      },
      refuse: (why, offer) => this.refuse(why, offer),
      said: (what) => {
        void this.panel.webview.postMessage({ kind: 'said', text: what });
      },
      kept: (step) => {
        if (step !== null) {
          this.history = did(this.history, step);
          return;
        }

        this.history = nothing;
        this.left.clear();
      },
      left: (file) => this.left.get(file) ?? null,
    };
  }

  /** Why an edit did not happen, said in the preview where the reader is looking. */
  private refuse(why: string, offer: Offer | null): void {
    void this.panel.webview.postMessage({
      kind: 'refused',
      why: why.replace(/`/g, ''),
      about: offer?.about ?? null,
      canOverride: offer?.canOverride ?? false,
      choices: (offer?.choices ?? []).map((one) => ({
        ...one,
        what: one.what.replace(/`/g, ''),
      })),
    });
  }

  private close(): void {
    Preview.open.delete(this.document.uri.toString());
    if (Preview.showing === this) Preview.showing = undefined;
    clearTimeout(this.settling);
    clearTimeout(this.following);
    for (const listener of this.listeners) listener.dispose();
    this.problems.dispose();
  }

  private page(extension: vscode.Uri): string {
    const { webview } = this.panel;
    const script = webview.asWebviewUri(vscode.Uri.joinPath(extension, 'dist', 'webview.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(extension, 'dist', 'webview.css'));
    const nonce = Math.random().toString(36).slice(2);

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
    <link href="${style}" rel="stylesheet" />
  </head>
  <body>
    <main id="grid"></main>
    <script nonce="${nonce}" src="${script}"></script>
  </body>
</html>`;
  }
}

/** A tab's keys as the intent takes them, the colour parsed at the edge; an absent key stays absent. */
function worn(one: {
  visibility?: 'visible' | 'hidden';
  color?: string | null;
  gridlines?: boolean;
}): Omit<Tabbed, 'sheet'> {
  const shown = one.visibility === undefined ? {} : { visibility: one.visibility };
  const lined = one.gridlines === undefined ? shown : { ...shown, gridlines: one.gridlines };
  if (one.color === undefined) return lined;

  return { ...lined, color: one.color === null ? null : parseColor(one.color) };
}

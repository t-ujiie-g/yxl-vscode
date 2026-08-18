import {
  beside,
  couldBlock,
  type Pasting,
  pasteRange,
  pasteText,
  type Reading,
  reading,
  type Shape,
  type Standing,
  tabular,
} from '@yxl-vscode/intent';
import { applyPatch, rewrites } from '@yxl-vscode/patch';
import { type A1Addr, addrAt, type FilePath, type SheetName, sheetName } from '@yxl-vscode/units';
import type { Choice, Pasted, PastedAt, PastedText } from '@yxl-vscode/webview/protocol';
import {
  applied,
  excepted,
  ONLY,
  PASTED,
  type Port,
  perOrigin,
  type Spec,
  theseOnly,
} from './write';

/**
 * A rectangle put down somewhere else, as one edit. A cell that cannot take it
 * refuses the whole and is offered as an answer instead: the same paste with
 * `only` the cells that can (ADR-001, ADR-032).
 */
export async function paste(
  spec: Spec,
  pasted: Pasted,
  port: Port,
  doing: Standing = 'refuse',
): Promise<void> {
  const where = pasting(pasted);
  if (where === null) {
    port.refuse(`\`${pasted.from.sheet}\` is not a name a sheet can have`, null);
    return;
  }

  const read = reading(port.text);
  const intent = pasteRange(spec, where, read, doing);

  if (intent.kind === 'refused' && doing === 'refuse') {
    const some = pasteRange(spec, where, read, 'skip');
    const cells = some.kind === 'edit' ? some.expects.cells : new Set<string>();
    port.refuse(
      intent.why,
      some.kind === 'edit'
        ? theseOnly(
            { is: 'pasted', pasted },
            PASTED,
            cells,
            perOrigin(cells, (by) => pasteRange(spec, where, read, by), 'paste'),
          )
        : null,
    );
    return;
  }

  const done = await applied(spec, intent, port, { anyway: false, from: null, typed: null });
  if (done && intent.kind === 'edit') {
    const cells = intent.expects.cells.size;
    port.said(`${cells} cell${cells === 1 ? '' : 's'} ${pasted.cut ? 'moved' : 'pasted'}.`);
  }
}

/** That answer, taken. Worked out again rather than remembered: the file may have moved. */
export async function pastedWith(
  spec: Spec,
  pasted: Pasted,
  choice: string,
  port: Port,
): Promise<void> {
  const doing = choice === ONLY ? 'skip' : excepted(choice);
  if (doing === null) {
    port.refuse('that answer is no longer one of the ways this edit could be made', null);
    return;
  }

  await paste(spec, pasted, port, doing);
}

/** What the view named, in the units the resolver works in. */
function pasting(pasted: Pasted): Pasting | null {
  const from = sheetName(pasted.from.sheet);
  const to = sheetName(pasted.sheet);
  if (from === null || to === null) return null;

  const { top, left, bottom, right } = pasted.from;

  return {
    from: { sheet: from, rect: { top, left, bottom, right } },
    to: { sheet: to, at: addrAt({ col: pasted.col, row: pasted.row }) },
    cut: pasted.cut,
  };
}

/** Whose paste `Cmd`+`V` is: the rectangle the grid holds, what the clipboard holds, or neither. */
export type Whose =
  | { readonly is: 'grid'; readonly pasted: Pasted }
  | { readonly is: 'clipboard'; readonly text: PastedText }
  | { readonly is: 'neither' };

/**
 * Which paste this is, given what the clipboard turned out to hold. The grid's
 * own rectangle wins while the clipboard still holds what its copy put there,
 * because only that one moves a formula and empties a cut (ADR-032, ADR-035).
 */
export function whose(asked: PastedAt, held: string): Whose {
  const { sheet, row, col, from, cut, ours } = asked;
  const own = from !== null && (held === '' || held === ours);
  if (own && from !== null) return { is: 'grid', pasted: { from, sheet, row, col, cut } };

  return held === ''
    ? { is: 'neither' }
    : { is: 'clipboard', text: { text: held, sheet, row, col } };
}

/**
 * A rectangle from another spreadsheet put down in the grid. The shape it lands
 * in is the reader's to pick, with the lines each answer would add said before
 * it is made (ADR-028, §8 Q11).
 */
export async function pasteFrom(
  spec: Spec,
  asked: PastedText,
  port: Port,
  choice?: string,
): Promise<void> {
  const sheet = sheetName(asked.sheet);
  if (sheet === null) {
    port.refuse(`\`${asked.sheet}\` is not a name a sheet can have`, null);
    return;
  }

  const where = { sheet, at: addrAt({ col: asked.col, row: asked.row }) };
  const rows = tabular(asked.text);
  if (rows.length === 0) {
    port.refuse('there is nothing on the clipboard to put down', null);
    return;
  }

  const apart = choice === undefined ? null : choice === ONLY ? 'skip' : excepted(choice);
  if (apart !== null) {
    await land(spec, where, rows, 'cells', apart, asked, port);
    return;
  }

  const read = reading(port.text);
  const shapes = ways(spec, where, rows, read, port);
  const many = counting(rows) > MANY;
  const taken =
    choice === undefined
      ? shapes.length === 1 && !many
        ? shapes[0]
        : undefined
      : shaped(shapes, choice);

  if (taken === undefined) {
    if (choice !== undefined) {
      port.refuse('that answer is no longer one of the ways this edit could be made', null);
      return;
    }

    port.refuse(counted(rows, spec.root), {
      about: { is: 'text', text: asked },
      canOverride: false,
      choices: shapes,
    });
    return;
  }

  await land(spec, where, rows, taken.id === 'data' ? 'data' : 'cells', 'refuse', asked, port);
}

/** The rectangle written in the shape that was picked, with the answer a refusal has. */
async function land(
  spec: Spec,
  where: { sheet: SheetName; at: A1Addr },
  rows: readonly (readonly string[])[],
  shape: Shape,
  doing: Standing,
  asked: PastedText,
  port: Port,
): Promise<void> {
  const read = reading(port.text);
  const intent = pasteText(spec, where, rows, read, shape, doing);

  if (intent.kind === 'refused' && shape === 'cells' && doing === 'refuse') {
    const some = pasteText(spec, where, rows, read, 'cells', 'skip');
    const cells = some.kind === 'edit' ? some.expects.cells : new Set<string>();
    port.refuse(
      intent.why,
      some.kind === 'edit'
        ? theseOnly(
            { is: 'text', text: asked },
            PASTED,
            cells,
            perOrigin(cells, (by) => pasteText(spec, where, rows, read, 'cells', by), 'paste'),
          )
        : null,
    );
    return;
  }

  const done = await applied(spec, intent, port, { anyway: false, from: null, typed: null });
  if (done && intent.kind === 'edit') {
    const cells = intent.expects.cells.size;
    port.said(`${cells} cell${cells === 1 ? '' : 's'} pasted.`);
  }
}

function shaped(shapes: readonly Choice[], choice: string): Choice | undefined {
  return shapes.find((one) => one.id === choice);
}

/** More cells than a reader takes in at a glance, past which a paste says its size before it lands. */
const MANY = 40;

function counting(rows: readonly (readonly string[])[]): number {
  return rows.reduce((sum, row) => sum + row.length, 0);
}

/** What the clipboard holds and where it is going, said before any of it is written. */
function counted(rows: readonly (readonly string[])[], root: FilePath): string {
  return `${counting(rows)} cells from the clipboard, into ${beside(root)}.`;
}

/** The shapes a rectangle from outside could land in, each with the lines it would rewrite. */
function ways(
  spec: Spec,
  where: { sheet: SheetName; at: A1Addr },
  rows: readonly (readonly string[])[],
  read: Reading,
  port: Port,
): Choice[] {
  const shaping = (id: Shape, what: string): Choice => {
    const lines = rewriting(spec, where, rows, read, id, port);
    const size = lines === null ? '' : ` — ${lines} line${lines === 1 ? '' : 's'}`;

    return { id, what: `${what}${size}`, moves: counting(rows), sample: [] };
  };

  const entries = shaping('cells', 'As `cells:` entries');
  if (!couldBlock(spec.grid, where, rows)) return [entries];

  return [shaping('data', 'As one `data:` block'), entries];
}

/** How many lines of the file a shape would rewrite, measured rather than guessed. */
function rewriting(
  spec: Spec,
  where: { sheet: SheetName; at: A1Addr },
  rows: readonly (readonly string[])[],
  read: Reading,
  shape: Shape,
  port: Port,
): number | null {
  const intent = pasteText(spec, where, rows, read, shape);
  if (intent.kind !== 'edit') return null;

  const source = port.text(intent.file);
  if (source === null) return null;

  return rewrites(source, applyPatch(source, intent.patch, { file: intent.file }).edits);
}

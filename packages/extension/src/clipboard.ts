import {
  couldBlock,
  type Pasting,
  pasteRange,
  pasteText,
  reading,
  type Shape,
  tabular,
} from '@yxl-vscode/intent';
import { type A1Addr, addrAt, type SheetName, sheetName } from '@yxl-vscode/units';
import type { Choice, Pasted, PastedAt, PastedText } from '@yxl-vscode/webview/protocol';
import { applied, ONLY, PASTED, type Port, type Spec, theseOnly } from './write';

/**
 * A rectangle put down somewhere else, as one edit. A cell that cannot take it
 * refuses the whole and is offered as an answer instead: the same paste with
 * `only` the cells that can (ADR-001, ADR-032).
 */
export async function paste(spec: Spec, pasted: Pasted, port: Port, only = false): Promise<void> {
  const where = pasting(pasted);
  if (where === null) {
    port.refuse(`\`${pasted.from.sheet}\` is not a name a sheet can have`, null);
    return;
  }

  const read = reading(port.text);
  const intent = pasteRange(spec.grid, where, read, only);

  if (intent.kind === 'refused' && !only) {
    const some = pasteRange(spec.grid, where, read, true);
    port.refuse(
      intent.why,
      some.kind === 'edit' ? theseOnly({ is: 'pasted', pasted }, PASTED, some.expects.cells) : null,
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
  if (choice !== ONLY) {
    port.refuse('that answer is no longer one of the ways this edit could be made', null);
    return;
  }

  await paste(spec, pasted, port, true);
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

  if (choice === ONLY) {
    await land(spec, where, rows, 'cells', true, asked, port);
    return;
  }

  const shapes = ways(spec, where, rows);
  const taken =
    choice === undefined ? (shapes.length === 1 ? shapes[0] : undefined) : shaped(shapes, choice);

  if (taken === undefined) {
    if (choice !== undefined) {
      port.refuse('that answer is no longer one of the ways this edit could be made', null);
      return;
    }

    port.refuse(counted(rows), {
      about: { is: 'text', text: asked },
      canOverride: false,
      choices: shapes,
    });
    return;
  }

  await land(spec, where, rows, taken.id === 'data' ? 'data' : 'cells', false, asked, port);
}

/** The rectangle written in the shape that was picked, with the answer a refusal has. */
async function land(
  spec: Spec,
  where: { sheet: SheetName; at: A1Addr },
  rows: readonly (readonly string[])[],
  shape: Shape,
  only: boolean,
  asked: PastedText,
  port: Port,
): Promise<void> {
  const read = reading(port.text);
  const intent = pasteText(spec.grid, where, rows, read, shape, only);

  if (intent.kind === 'refused' && shape === 'cells' && !only) {
    const some = pasteText(spec.grid, where, rows, read, 'cells', true);
    port.refuse(
      intent.why,
      some.kind === 'edit'
        ? theseOnly({ is: 'text', text: asked }, PASTED, some.expects.cells)
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

/** How many cells the clipboard holds, asked before the shape is picked. */
function counted(rows: readonly (readonly string[])[]): string {
  const cells = rows.reduce((sum, row) => sum + row.length, 0);
  return `${cells} cells from the clipboard: how should they be written?`;
}

/** The shapes a rectangle from outside could land in, with the lines each would add. */
function ways(
  spec: Spec,
  where: { sheet: SheetName; at: A1Addr },
  rows: readonly (readonly string[])[],
): Choice[] {
  const cells = rows.reduce((sum, row) => sum + row.length, 0);
  const entries: Choice = {
    id: 'cells',
    what: `As \`cells:\` entries — ${cells} line${cells === 1 ? '' : 's'}`,
    moves: cells,
    sample: [],
  };
  if (!couldBlock(spec.grid, where, rows)) return [entries];

  return [
    {
      id: 'data',
      what: `As one \`data:\` block — ${rows.length + 2} lines`,
      moves: cells,
      sample: [],
    },
    entries,
  ];
}

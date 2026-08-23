import { sheetOf } from '@yxl-vscode/compile';
import { entryOf, type Node, type Op, type Path, renderScalar } from '@yxl-vscode/cst';
import { INCLUDE_KEY, KEY } from '@yxl-vscode/spec';
import type { A1Addr, SheetName } from '@yxl-vscode/units';
import { nothingChanges } from '@yxl-vscode/verify';
import { type Intent, located, type Projection, type Reading, refused } from './direct';

/** A note on a cell as a gesture asks for it: what it says, or `null` to take it off. */
export interface Noting {
  readonly sheet: SheetName;
  readonly at: A1Addr;
  readonly text: string | null;
}

/**
 * A cell's note under the sheet's `comments:`, written, changed, or taken away
 * (`docs/spec.md` §10). A note written in the expanded form keeps its `author`,
 * since only its `text` is edited here.
 */
export function setNote(spec: Projection, where: Noting, read: Reading): Intent {
  const sheet = sheetOf(spec.grid, where.sheet);
  if (sheet === null) return refused(`there is no sheet named \`${where.sheet}\``);

  const found = located(sheet.node, read);
  if (found.kind === 'refused') return found;
  if (found.node.kind !== 'map') return refused(`\`${where.sheet}\` is not written as a sheet`);

  const comments = entryOf(found.node, KEY.comments)?.value ?? null;
  if (comments !== null && entryOf(comments, INCLUDE_KEY) !== undefined) {
    return refused(`\`${where.sheet}\` keeps its notes in another file`);
  }

  const already = comments === null ? null : (entryOf(comments, where.at)?.value ?? null);
  const under: Path = [...found.path, KEY.comments];
  const ops = writing(where, { comments, already, under, sheet: found.path });

  return 'why' in ops
    ? refused(ops.why)
    : { kind: 'edit', file: found.file, patch: ops, expects: nothingChanges };
}

/** Where the note is written, as the file has it: the mapping, the entry in it, and the paths to both. */
interface Where {
  readonly comments: Node | null;
  readonly already: Node | null;
  readonly under: Path;
  readonly sheet: Path;
}

function writing(want: Noting, where: Where): { ops: readonly Op[] } | { why: string } {
  const { comments, already, under } = where;

  if (want.text === null) {
    if (already === null) return { why: `\`${want.at}\` has no note to take off` };

    const alone = comments?.kind === 'map' && comments.entries.length === 1;
    return { ops: [{ op: 'remove', path: alone ? under : [...under, want.at] }] };
  }

  if (want.text === '') return { why: 'a note needs something to say' };

  if (already === null) {
    return {
      ops: [
        comments === null
          ? {
              op: 'addSource',
              path: where.sheet,
              key: KEY.comments,
              source: `${want.at}: ${renderScalar(want.text)}`,
            }
          : { op: 'add', path: under, key: want.at, value: want.text, before: null },
      ],
    };
  }

  if (already.kind !== 'map') {
    return { ops: [{ op: 'set', path: [...under, want.at], value: want.text }] };
  }
  if (entryOf(already, KEY.text) === undefined) {
    return { why: `the note on \`${want.at}\` is not written as text` };
  }

  return { ops: [{ op: 'set', path: [...under, want.at, KEY.text], value: want.text }] };
}

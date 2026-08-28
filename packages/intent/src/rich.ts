import { cellAt, namesParam, sheetOf } from '@yxl-vscode/compile';
import { entryOf, type Node, type Path } from '@yxl-vscode/cst';
import { KEY } from '@yxl-vscode/spec';
import { type A1Addr, qualified, type SheetName } from '@yxl-vscode/units';
import { type Intent, literalPath, type Projection, type Reading, refused } from './direct';

/** One run of a `rich:` cell as a gesture asks for it: which run, and what it should say. */
export interface Running {
  readonly sheet: SheetName;
  readonly at: A1Addr;
  readonly index: number;
  readonly text: string;
}

/**
 * The text of one run of a rich cell, changed where it is written — a run at a
 * time, since a run is what the spec's sequence is made of (`docs/spec.md` §3).
 * A run's font is left as it stands; only its text is edited here.
 */
export function setRun(spec: Projection, where: Running, read: Reading): Intent {
  const sheet = sheetOf(spec.grid, where.sheet);
  if (sheet === null) return refused(`there is no sheet named \`${where.sheet}\``);

  const cell = cellAt(sheet, where.at);
  if (cell === null || cell.rich === null) return refused(`\`${where.at}\` holds no rich text`);
  if (where.text === '') return refused('a run needs something to say');

  const found = literalPath(cell.provenance.value, sheet, where.at, read);
  if (found.kind === 'refused') return found;

  const runs = entryOf(found.node, KEY.rich)?.value ?? null;
  if (runs === null || runs.kind !== 'seq') {
    return refused(`\`${where.at}\` is not written as rich text here`);
  }

  const run = runs.items[where.index];
  if (run === undefined) {
    return refused(`\`${where.at}\` has ${runs.items.length} runs, and no run ${where.index + 1}`);
  }

  const said = written(run, where);
  if ('why' in said) return refused(said.why);

  return {
    kind: 'edit',
    file: found.file,
    patch: {
      ops: [
        {
          op: 'set',
          path: [...found.path, KEY.rich, where.index, ...said.into],
          value: where.text,
        },
      ],
    },
    expects: { cells: new Set([qualified(where.sheet, where.at)]), beyond: 'ask' },
  };
}

/** Where a run's text sits under the run: nowhere for a bare string, `text:` for one that wears a font. */
function written(run: Node, want: Running): { into: Path } | { why: string } {
  const said = run.kind === 'scalar' ? run : (entryOf(run, KEY.text)?.value ?? null);
  if (said === null || said.kind !== 'scalar') {
    return { why: `run ${want.index + 1} of \`${want.at}\` is not written as text` };
  }
  if (typeof said.value === 'string' && namesParam(said.value)) {
    return { why: `run ${want.index + 1} of \`${want.at}\` reads a parameter` };
  }

  return { into: run.kind === 'scalar' ? [] : [KEY.text] };
}

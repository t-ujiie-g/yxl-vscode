import { cellAt, namesParam, sheetOf } from '@yxl-vscode/compile';
import { entryOf, type Node, type Path } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import { KEY } from '@yxl-vscode/spec';
import { type A1Addr, qualified, type SheetName } from '@yxl-vscode/units';
import { type Intent, literalPath, type Projection, type Reading, refused } from './direct';
import { say } from './text';

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
  if (sheet === null) return refused(say('intent.no-such-sheet', { sheet: where.sheet }));

  const cell = cellAt(sheet, where.at);
  if (cell === null || cell.rich === null)
    return refused(say('intent.no-rich-text', { at: where.at }));
  if (where.text === '') return refused(say('intent.run-needs-something'));

  const found = literalPath(cell.provenance.value, sheet, where.at, read);
  if (found.kind === 'refused') return found;

  const runs = entryOf(found.node, KEY.rich)?.value ?? null;
  if (runs === null || runs.kind !== 'seq') {
    return refused(say('intent.not-written-as-rich', { at: where.at }));
  }

  const run = runs.items[where.index];
  if (run === undefined) {
    return refused(
      say('intent.no-such-run', {
        at: where.at,
        runs: runs.items.length,
        index: where.index + 1,
      }),
    );
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
function written(run: Node, want: Running): { into: Path } | { why: Saying } {
  const said = run.kind === 'scalar' ? run : (entryOf(run, KEY.text)?.value ?? null);
  if (said === null || said.kind !== 'scalar') {
    return { why: say('intent.run-not-text', { at: want.at, index: want.index + 1 }) };
  }
  if (typeof said.value === 'string' && namesParam(said.value)) {
    return { why: say('intent.run-reads-a-parameter', { at: want.at, index: want.index + 1 }) };
  }

  return { into: run.kind === 'scalar' ? [] : [KEY.text] };
}

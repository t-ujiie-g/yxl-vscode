import { type Op, renderScalar } from '@yxl-vscode/cst';
import { sheetName, whyNotASheetName } from '@yxl-vscode/units';
import { type Intent, located, type Projection, type Reading, refused } from './direct';

/** A sheet a reader asked for, by the name it is to have. */
export interface Adding {
  readonly name: string;
}

/**
 * A new sheet at the end of `sheets:`, which is tab order (`docs/spec.md` §2):
 * one `- name:` entry, holding nothing yet. Refused where the name is not one a
 * sheet can have, or is one a sheet already has — the compiler refuses both.
 */
export function addSheet(spec: Projection, adding: Adding, read: Reading): Intent {
  const why = whyNotASheetName(adding.name);
  const name = sheetName(adding.name);
  if (why !== null || name === null) return refused(why ?? 'a sheet needs a name');
  if (spec.grid.sheets.some((one) => one.name === name)) {
    return refused(`there is already a sheet named \`${name}\``);
  }

  const first = spec.doc.sheets[0];
  const found = first === undefined ? null : located(first.id, read);
  if (found === null || found.kind === 'refused') {
    return refused('this spec has no `sheets:` to put one in');
  }

  const list = found.path.slice(0, -1);
  const ops: readonly Op[] = [
    {
      op: 'insertSource',
      path: list,
      index: spec.doc.sheets.length,
      source: `name: ${renderScalar(name)}`,
    },
  ];

  return {
    kind: 'edit',
    file: found.file,
    patch: { ops },
    expects: { cells: new Set(), sheets: new Set([name]), beyond: 'ask' },
  };
}

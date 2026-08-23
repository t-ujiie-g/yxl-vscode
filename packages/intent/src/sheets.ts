import { type Op, type Path, renderScalar, reordered } from '@yxl-vscode/cst';
import type { Templated } from '@yxl-vscode/spec';
import {
  type FilePath,
  parseQualifiedAddr,
  type QualifiedAddr,
  qualified,
  type SheetName,
  sheetName,
  whyNotASheetName,
} from '@yxl-vscode/units';
import { nothingChanges } from '@yxl-vscode/verify';
import {
  cellsNaming,
  type Intent,
  located,
  nameOf,
  type Projection,
  type Reading,
  refused,
} from './direct';

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

/** A sheet a reader asked to be rid of. */
export interface Deleting {
  readonly sheet: SheetName;
}

/**
 * A sheet taken out of `sheets:`, with the overrides that named its cells. It is
 * refused where nothing would be left to show, or where a surviving formula
 * names it — Excel writes `#REF!` there, and this writes nothing (ADR-001).
 */
export function deleteSheet(spec: Projection, where: Deleting, read: Reading): Intent {
  const sheet = spec.doc.sheets.find((one) => nameOf(one) === where.sheet);
  if (sheet === undefined) return refused(`there is no sheet named \`${where.sheet}\``);

  const rest = spec.doc.sheets.filter((one) => one !== sheet);
  if (rest.length === 0) return refused('a workbook needs a sheet, and this is the only one');
  if (!rest.some((one) => !one.opaque.some((key) => key.key === 'visibility'))) {
    return refused(
      'every other sheet sets `visibility:`, which this preview does not read yet, so it cannot tell one would be left visible',
    );
  }

  const held = [...cellsNaming(spec, where.sheet)];
  if (held.length > 0) {
    const shown = held.slice(0, 3).join(', ');
    const more = held.length > 3 ? `, and ${held.length - 3} more` : '';
    return refused(
      `\`${where.sheet}\` is named by ${shown}${more}, which would be left with \`#REF!\``,
    );
  }

  const ops = new Map<FilePath, Op[]>();
  const put = (path: Path, file: FilePath): void => {
    ops.set(file, [...(ops.get(file) ?? []), { op: 'remove', path }]);
  };

  const found = located(sheet.id, read);
  if (found.kind === 'refused') return refused('this sheet has no place in the file to take out');
  put(found.path, found.file);

  const on = spec.doc.overrides.filter((one) => onSheet(one.at, where.sheet));
  for (const one of on) {
    const at = located(one.id, read);
    if (at.kind === 'refused') return refused('an override on this sheet has no place in the file');

    put(on.length === spec.doc.overrides.length ? at.path.slice(0, -1) : at.path, at.file);
  }

  const files = [...ops.keys()];
  const file = files[0];
  if (file === undefined || files.length > 1) {
    return refused(
      `\`${where.sheet}\` is written across more than one file, which this cannot take out at once`,
    );
  }

  return {
    kind: 'edit',
    file,
    patch: { ops: ops.get(file) ?? [] },
    expects: { cells: new Set(), sheets: new Set([where.sheet]), beyond: 'ask' },
  };
}

/** Whether an override's `at:` names this sheet, where a template has not stopped it being read. */
function onSheet(at: Templated<QualifiedAddr>, sheet: SheetName): boolean {
  if (typeof at !== 'string' && 'kind' in at) return false;

  const said = typeof at === 'string' ? at : qualified(at.sheet, at.at);
  return parseQualifiedAddr(said)?.sheet === sheet;
}

/** A sheet a reader dragged, and where in the tab bar they let it go. */
export interface Ordering {
  readonly sheet: SheetName;
  readonly to: number;
}

/**
 * A sheet moved along the tab bar, which is the order of `sheets:`
 * (`docs/spec.md` §2). Every other entry keeps its own bytes; only the order
 * changes, and the blank lines between them stay where they are.
 */
export function moveSheet(spec: Projection, where: Ordering, read: Reading): Intent {
  const at = spec.doc.sheets.findIndex((one) => nameOf(one) === where.sheet);
  if (at < 0) return refused(`there is no sheet named \`${where.sheet}\``);

  const many = spec.doc.sheets.length;
  if (where.to < 0 || where.to >= many) return refused('a sheet cannot go there');
  if (where.to === at) return refused(`\`${where.sheet}\` is already there`);

  const sheet = spec.doc.sheets[at];
  const found = sheet === undefined ? null : located(sheet.id, read);
  if (found === null || found.kind === 'refused') {
    return refused('this sheet has no place in the file to move');
  }

  const rest = [...Array(many).keys()].filter((one) => one !== at);
  const order = [...rest.slice(0, where.to), at, ...rest.slice(where.to)];

  const list = found.path.slice(0, -1);
  const tree = read.parsed(found.file);
  const root = tree?.root ?? null;
  const said = root === null ? null : reordered(read.text(found.file) ?? '', root, list, order);
  if (said === null) return refused('the sheets are not written as a list this can reorder');

  const ops: readonly Op[] = [{ op: 'write', path: list, source: said }];

  return { kind: 'edit', file: found.file, patch: { ops }, expects: nothingChanges };
}

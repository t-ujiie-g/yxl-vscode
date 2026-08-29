import { type Op, type Path, renderScalar, reordered } from '@yxl-vscode/cst';
import { KEY, type Templated, type Visibility } from '@yxl-vscode/spec';
import {
  type Color,
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
  keyed,
  located,
  nameOf,
  type Projection,
  type Reading,
  refused,
  writtenSheet,
} from './direct';
import { say } from './text';

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
    return refused(say('intent.already-a-sheet-named', { name }));
  }

  const first = spec.doc.sheets[0];
  const found = first === undefined ? null : located(first.id, read);
  if (found === null || found.kind === 'refused') {
    return refused(say('intent.no-sheets-key'));
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
  if (sheet === undefined) return refused(say('intent.no-such-sheet', { sheet: where.sheet }));

  const rest = spec.doc.sheets.filter((one) => one !== sheet);
  if (rest.length === 0) return refused(say('intent.workbook-needs-a-sheet'));
  if (!spec.grid.sheets.some((one) => one.name !== where.sheet && shows(one))) {
    return refused(say('intent.workbook-needs-a-shown-sheet'));
  }

  const held = [...cellsNaming(spec, where.sheet)];
  if (held.length > 0) {
    const shown = held.slice(0, 3).join(', ');
    return refused(
      say('intent.named-by-cells', {
        sheet: where.sheet,
        shown,
        rest: Math.max(held.length - 3, 0),
      }),
    );
  }

  const ops = new Map<FilePath, Op[]>();
  const put = (path: Path, file: FilePath): void => {
    ops.set(file, [...(ops.get(file) ?? []), { op: 'remove', path }]);
  };

  const found = located(sheet.id, read);
  if (found.kind === 'refused') return refused(say('intent.no-place-to-take-out'));
  put(found.path, found.file);

  const on = spec.doc.overrides.filter((one) => onSheet(one.at, where.sheet));
  for (const one of on) {
    const at = located(one.id, read);
    if (at.kind === 'refused') return refused(say('intent.override-no-place'));

    put(on.length === spec.doc.overrides.length ? at.path.slice(0, -1) : at.path, at.file);
  }

  const files = [...ops.keys()];
  const file = files[0];
  if (file === undefined || files.length > 1) {
    return refused(say('intent.take-out-across-files', { sheet: where.sheet }));
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
  if (at < 0) return refused(say('intent.no-such-sheet', { sheet: where.sheet }));

  const many = spec.doc.sheets.length;
  if (where.to < 0 || where.to >= many) return refused(say('intent.sheet-cannot-go-there'));
  if (where.to === at) return refused(say('intent.already-there', { sheet: where.sheet }));

  const sheet = spec.doc.sheets[at];
  const found = sheet === undefined ? null : located(sheet.id, read);
  if (found === null || found.kind === 'refused') {
    return refused(say('intent.no-place-to-move'));
  }

  const rest = [...Array(many).keys()].filter((one) => one !== at);
  const order = [...rest.slice(0, where.to), at, ...rest.slice(where.to)];

  const list = found.path.slice(0, -1);
  const tree = read.parsed(found.file);
  const root = tree?.root ?? null;
  const said = root === null ? null : reordered(read.text(found.file) ?? '', root, list, order);
  if (said === null) return refused(say('intent.not-a-list-to-reorder'));

  const ops: readonly Op[] = [{ op: 'write', path: list, source: said }];

  return { kind: 'edit', file: found.file, patch: { ops }, expects: nothingChanges };
}

/** A sheet's own switches as a gesture asks for them: the tab's two keys, and its gridlines. */
export interface Tabbed {
  readonly sheet: SheetName;
  readonly visibility?: Visibility;
  readonly color?: Color | null;
  readonly gridlines?: boolean;
}

/**
 * A sheet's `visibility:` or `tab_color:`, the tab's own two keys
 * (`docs/spec.md` §2). Hiding the last one that shows is refused, and
 * `very_hidden` is left to VBA.
 */
export function setTab(spec: Projection, tabbed: Tabbed, read: Reading): Intent {
  const found = writtenSheet(spec, tabbed.sheet, read);
  if (found.kind === 'refused') return found;

  const sheet = found.sheet;
  if (sheet.visibility === 'very_hidden') {
    return refused(say('intent.very-hidden', { sheet: tabbed.sheet }));
  }

  const shown = tabbed.visibility;
  if (shown === 'very_hidden') return refused(say('intent.very-hidden-not-written'));
  if (shown === 'hidden' && !spec.grid.sheets.some((one) => one !== sheet && shows(one))) {
    return refused(say('intent.workbook-needs-a-shown-sheet'));
  }

  const ops: Op[] = [];
  if (shown !== undefined) {
    ops.push(...keyed(found.path, KEY.visibility, shown === 'visible' ? null : shown, found.node));
  }
  if (tabbed.color !== undefined) {
    ops.push(...keyed(found.path, KEY.tabColor, tabbed.color, found.node));
  }
  if (tabbed.gridlines !== undefined) {
    ops.push(...keyed(found.path, KEY.gridlines, tabbed.gridlines ? null : false, found.node));
  }
  if (ops.length === 0) return refused(say('intent.nothing-would-change'));

  return { kind: 'edit', file: found.file, patch: { ops }, expects: nothingChanges };
}

/** Whether a sheet's tab is one Excel shows, which is every sheet but the two hidden spellings. */
function shows(sheet: { readonly visibility: Visibility }): boolean {
  return sheet.visibility === 'visible';
}

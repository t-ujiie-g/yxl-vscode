import { addressesIn, cellAt, REACH } from '@yxl-vscode/compile';
import type { Op, Path } from '@yxl-vscode/cst';
import type { Sheet, Templated } from '@yxl-vscode/spec';
import {
  type FilePath,
  type NodeId,
  parseQualifiedAddr,
  type QualifiedAddr,
  qualified,
  renamed,
  type SheetName,
  sheetName,
  whyNotASheetName,
} from '@yxl-vscode/units';
import { type Intent, located, type Projection, type Reading, refused } from './direct';

/** A sheet a reader asked to call something else. */
export interface Renaming {
  readonly sheet: SheetName;
  readonly name: string;
}

/**
 * A sheet renamed: its own `name:`, and everything that named it — every
 * formula, every `defs.formulas` body, and every override's `at:`.
 */
export function renameSheet(spec: Projection, where: Renaming, read: Reading): Intent {
  const why = whyNotASheetName(where.name);
  const to = sheetName(where.name);
  if (why !== null || to === null) return refused(why ?? 'a sheet needs a name');
  if (to === where.sheet) return refused(`this sheet is called \`${to}\` already`);
  if (spec.grid.sheets.some((one) => one.name === to)) {
    return refused(`there is already a sheet named \`${to}\``);
  }

  const sheet = spec.doc.sheets.find((one) => named(one) === where.sheet);
  if (sheet === undefined) return refused(`there is no sheet named \`${where.sheet}\``);

  const ops = new Map<FilePath, Op[]>();
  const put = (id: NodeId, key: string | null, value: string): boolean => {
    const found = located(id, read);
    if (found.kind === 'refused') return false;

    const path: Path = key === null ? found.path : [...found.path, key];
    ops.set(found.file, [...(ops.get(found.file) ?? []), { op: 'set', path, value }]);
    return true;
  };

  if (!put(sheet.id, 'name', to)) return refused('this sheet has no place in the file to rename');

  const bodies: { id: NodeId; key: string | null; body: string; what: string }[] = [
    ...spec.doc.sheets.flatMap((one) => [
      ...one.cells.flatMap((cell) =>
        cell.formula?.kind === 'inline'
          ? [
              {
                id: cell.id,
                key: 'formula',
                body: cell.formula.body,
                what: `a cell of \`${named(one)}\``,
              },
            ]
          : [],
      ),
      ...one.formulas.map((range) => ({
        id: range.id,
        key: 'formula',
        body: range.formula,
        what: `a range of \`${named(one)}\``,
      })),
    ]),
    ...spec.doc.defs.formulas.map((def) => ({
      id: def.id,
      key: null,
      body: def.body,
      what: `\`${def.name}\``,
    })),
  ];

  for (const one of bodies) {
    const now = renamed(one.body, where.sheet, to);
    if (!now.ok) return refused(`${one.what} holds a formula that ${now.why}`);
    if (now.formula !== one.body) put(one.id, one.key, now.formula);
  }

  for (const one of spec.doc.overrides) {
    const at = spelled(one.at);
    const read1 = at === null ? null : parseQualifiedAddr(at);
    if (read1 === null || read1.sheet !== where.sheet) continue;

    put(one.id, 'at', qualified(to, read1.at));
  }

  const files = [...ops.keys()];
  const file = files[0];
  if (file === undefined || files.length > 1) {
    return refused(
      `\`${where.sheet}\` is named in more than one file, which this cannot rewrite at once`,
    );
  }

  return {
    kind: 'edit',
    file,
    patch: { ops: ops.get(file) ?? [] },
    expects: {
      cells: rewritten(spec, where.sheet, to),
      sheets: new Set([where.sheet, to]),
      beyond: 'ask',
    },
  };
}

/** The name a sheet is written under, where a `${...}` has not stopped it being read. */
function named(sheet: Sheet): SheetName | null {
  return typeof sheet.name === 'string' ? sheet.name : null;
}

/** What an override's `at:` says, or `null` where a template stands in its place. */
function spelled(at: Templated<QualifiedAddr>): string | null {
  return typeof at === 'string' || !('kind' in at) ? qualified(at.sheet, at.at) : null;
}

/** Every cell on the other sheets whose formula the rename rewrites, as `Sheet!A1`. */
function rewritten(spec: Projection, from: SheetName, to: SheetName): Set<string> {
  const cells = new Set<string>();

  for (const sheet of spec.grid.sheets) {
    if (sheet.name === from) continue;

    for (const at of addressesIn(sheet, REACH)) {
      const body = cellAt(sheet, at)?.formula ?? null;
      if (body === null) continue;

      const now = renamed(body, from, to);
      if (now.ok && now.formula !== body) cells.add(qualified(sheet.name, at));
    }
  }

  return cells;
}

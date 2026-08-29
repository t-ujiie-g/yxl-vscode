import type { Op, Path } from '@yxl-vscode/cst';
import { KEY, type Templated } from '@yxl-vscode/spec';
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
import {
  cellsNaming,
  type Intent,
  located,
  nameOf,
  type Projection,
  type Reading,
  refused,
} from './direct';
import { say } from './text';

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
  if (to === where.sheet) return refused(say('intent.already-called-that', { name: to }));
  if (spec.grid.sheets.some((one) => one.name === to)) {
    return refused(say('intent.already-a-sheet-named', { name: to }));
  }

  const sheet = spec.doc.sheets.find((one) => nameOf(one) === where.sheet);
  if (sheet === undefined) return refused(say('intent.no-such-sheet', { sheet: where.sheet }));

  const ops = new Map<FilePath, Op[]>();
  const put = (id: NodeId, key: string | null, value: string): boolean => {
    const found = located(id, read);
    if (found.kind === 'refused') return false;

    const path: Path = key === null ? found.path : [...found.path, key];
    ops.set(found.file, [...(ops.get(found.file) ?? []), { op: 'set', path, value }]);
    return true;
  };

  if (!put(sheet.id, KEY.name, to)) return refused(say('intent.no-place-to-rename'));

  const bodies: { id: NodeId; key: string | null; body: string; what: string }[] = [
    ...spec.doc.sheets.flatMap((one) => [
      ...one.cells.flatMap((cell) =>
        cell.formula?.kind === 'inline'
          ? [
              {
                id: cell.id,
                key: 'formula',
                body: cell.formula.body,
                what: `a cell of \`${nameOf(one)}\``,
              },
            ]
          : [],
      ),
      ...one.formulas.map((range) => ({
        id: range.id,
        key: 'formula',
        body: range.formula,
        what: `a range of \`${nameOf(one)}\``,
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
    if (!now.ok)
      return refused(say('intent.named-formula-breaks', { what: one.what, why: now.why }));
    if (now.formula !== one.body) put(one.id, one.key, now.formula);
  }

  for (const one of spec.doc.overrides) {
    const at = spelled(one.at);
    const read1 = at === null ? null : parseQualifiedAddr(at);
    if (read1 === null || read1.sheet !== where.sheet) continue;

    put(one.id, KEY.at, qualified(to, read1.at));
  }

  const files = [...ops.keys()];
  const file = files[0];
  if (file === undefined || files.length > 1) {
    return refused(say('intent.named-across-files', { sheet: where.sheet }));
  }

  return {
    kind: 'edit',
    file,
    patch: { ops: ops.get(file) ?? [] },
    expects: {
      cells: cellsNaming(spec, where.sheet),
      sheets: new Set([where.sheet, to]),
      beyond: 'ask',
    },
  };
}

/** What an override's `at:` says, or `null` where a template stands in its place. */
function spelled(at: Templated<QualifiedAddr>): string | null {
  return typeof at === 'string' || !('kind' in at) ? qualified(at.sheet, at.at) : null;
}

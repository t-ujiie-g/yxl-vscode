import { holds, type Op, type Path } from '@yxl-vscode/cst';
import { KEY, type Override, type SpecDoc } from '@yxl-vscode/spec';
import {
  type FilePath,
  type NodeId,
  parseQualifiedAddr,
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
 * formula, every `defs.formulas` body, every override's `at:`, and every
 * `references` entry.
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
  const put = (id: NodeId, under: Path, value: string): boolean => {
    const found = located(id, read);
    if (found.kind === 'refused') return false;

    const path: Path = [...found.path, ...under];
    ops.set(found.file, [...(ops.get(found.file) ?? []), { op: 'set', path, value }]);
    return true;
  };

  if (!put(sheet.id, [KEY.name], to)) return refused(say('intent.no-place-to-rename'));

  for (const one of [...formulas(spec.doc), ...references(spec.doc, read)]) {
    const now = renamed(one.text, where.sheet, to);
    if (!now.ok)
      return refused(say('intent.named-formula-breaks', { what: one.where, why: now.why }));
    if (now.formula !== one.text) put(one.id, one.path, now.formula);
  }

  for (const one of spec.doc.overrides) {
    const at = spelled(one.at);
    const read1 = at === null ? null : parseQualifiedAddr(at);
    if (read1 === null || read1.sheet !== where.sheet) continue;

    put(one.id, [KEY.at], qualified(to, read1.at));
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
function spelled(at: Override['at']): string | null {
  return typeof at === 'string' || !('kind' in at) ? qualified(at.sheet, at.at) : null;
}

/**
 * One piece of the spec's text that may name a sheet, at `path` under the node
 * `id`; `where` names it for a reader.
 */
export interface Reference {
  readonly id: NodeId;
  readonly path: Path;
  readonly text: string;
  readonly on: SheetName | null;
  readonly where: string;
}

/** Every formula the spec writes in place: in a cell, over a `formulas:` range, and in `defs.formulas`. */
function formulas(doc: SpecDoc): Reference[] {
  const found: Reference[] = [];

  for (const sheet of doc.sheets) {
    const on = nameOf(sheet);
    for (const cell of sheet.cells) {
      if (cell.formula?.kind !== 'inline') continue;
      const where = `a cell of \`${on}\``;
      found.push({ id: cell.id, path: [KEY.formula], text: cell.formula.body, on, where });
    }
    for (const range of sheet.formulas) {
      const where = `a range of \`${on}\``;
      found.push({ id: range.id, path: [KEY.formula], text: range.formula, on, where });
    }
  }
  for (const def of doc.defs.formulas) {
    found.push({ id: def.id, path: [], text: def.body, on: null, where: `\`${def.name}\`` });
  }

  return found;
}

/**
 * Every reference besides `formulas`, as yxl reads them: a rule's `formula:`, a
 * list's `from:`, a link's `to:`, and what a chart or a sparkline plots.
 */
export function references(doc: SpecDoc, read: Reading): Reference[] {
  const found: Reference[] = [];

  for (const sheet of doc.sheets) {
    const on = nameOf(sheet);
    const add = (id: NodeId, path: Path, text: unknown, at: unknown) => {
      if (typeof text !== 'string') return;
      const where = typeof at === 'string' ? `${on}!${at}` : `${on}`;
      found.push({ id, path, text, on, where });
    };

    for (const rule of sheet.conditional) {
      if (rule.test.kind === 'formula') add(rule.id, [KEY.formula], rule.test.body, rule.at);
    }
    for (const one of sheet.validations) {
      if (one.test.kind === 'listFrom') add(one.id, [KEY.list, 'from'], one.test.from, one.at);
    }
    for (const link of sheet.links) {
      if (link.target.kind === 'to') add(link.id, [KEY.to], link.target.text, link.at);
    }
    for (const chart of sheet.charts) {
      for (const series of chart.series) {
        add(series.id, [KEY.values], series.values, chart.at);
        add(series.id, [KEY.categories], series.categories, chart.at);
        add(series.id, [KEY.nameFrom], series.nameFrom, chart.at);
      }
    }
    for (const group of sheet.sparklines) {
      const node = located(group.id, read);
      const listed = node.kind === 'found' && holds(node.node, KEY.cells);
      group.cells.forEach((one, index) => {
        add(group.id, listed ? [KEY.cells, index, KEY.data] : [KEY.data], one.data, one.at);
      });
    }
  }

  return found;
}

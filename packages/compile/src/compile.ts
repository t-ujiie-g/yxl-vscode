import type { Override, SpecDoc } from '@yxl-vscode/spec';
import {
  type A1Addr,
  cellOf,
  parseQualifiedAddr,
  type QualifiedAddr,
  type SheetName,
  within,
} from '@yxl-vscode/units';
import { compileFacets } from './cell';
import { CODE } from './codes';
import { type Ctx, context, type DataReader, reject, type Setting, text } from './ctx';
import type { CompiledCell, CompiledGrid, CompiledSheet } from './grid';
import { compileSheet, type Drafted } from './sheet';
import type { StyleLayer } from './style';

/**
 * The grid a spec projects to: pure and computed forward only (ADR-001). `read`
 * is how it reaches a `csv:` or `json:` file (ADR-004); `params` is what the
 * caller wants the parameters to be, as `--set` is.
 */
export interface Options {
  readonly read?: DataReader;
  readonly params?: Setting;
}

/** As above. */
export function compile(doc: SpecDoc, options: Options = {}): CompiledGrid {
  const ctx = context(doc, options.read ?? null, options.params ?? new Map());
  const drafts = doc.sheets.map((sheet) => compileSheet(ctx, sheet));

  for (const override of doc.overrides) applyOverride(ctx, override, drafts);

  return { sheets: drafts.map((draft) => draft.sheet), diagnostics: ctx.diagnostics };
}

/** The sheet of that name, or `null` where the grid has none. */
export function sheetOf(grid: CompiledGrid, name: SheetName): CompiledSheet | null {
  return grid.sheets.find((one) => one.name === name) ?? null;
}

/** The cell at an address, written or filled by a range; a written cell wins (`docs/spec.md` §23). */
export function cellAt(sheet: CompiledSheet, at: A1Addr): CompiledCell | null {
  const written = sheet.cells.get(at);
  if (written !== undefined) return written;

  const cell = cellOf(at);
  const fill = sheet.fills.find((one) => within(cell, one.rect));
  if (fill === undefined) return null;

  const anchor = cellOf(fill.anchor);
  return {
    at,
    value: null,
    type: null,
    formula: fill.formula,
    format: null,
    rich: null,
    style: [],
    provenance: {
      value: {
        kind: 'formulaRange',
        node: fill.node,
        anchor: fill.anchor,
        offset: [cell.col - anchor.col, cell.row - anchor.row],
      },
      format: null,
    },
  };
}

/**
 * Every layer that makes an address look how it looks, in the order they apply
 * — column bands, rows, the cell, an override (`docs/spec.md` §4). An address,
 * not a cell: an empty one has a look too.
 */
export function styleAt(sheet: CompiledSheet, at: A1Addr): readonly StyleLayer[] {
  const cell = cellOf(at);
  const bands = [
    ...sheet.columns.filter((band) => cell.col >= band.first && cell.col <= band.last),
    ...sheet.rows.filter((band) => cell.row >= band.first && cell.row <= band.last),
  ];

  return [...bands.flatMap((band) => band.style), ...(sheet.cells.get(at)?.style ?? [])];
}

/** An override, applied after everything that wrote the cell; facets it does not give are left alone (`docs/spec.md` §23). */
function applyOverride(ctx: Ctx, override: Override, drafts: readonly Drafted[]): void {
  const read = overrideAddr(ctx, override);
  if (read === null) return;

  const draft = drafts.find((one) => one.sheet.name === read.sheet);
  if (draft === undefined) {
    reject(ctx, CODE.unknownSheet, `no sheet is named \`${read.sheet}\``, override);
    return;
  }

  const under = cellAt(draft.sheet, read.at);
  const own = { kind: 'override', node: override.id } as const;
  const written = compileFacets(ctx, override, read.at, own, 'override');
  draft.cells.set(read.at, under === null ? written : layer(under, written, override));
}

/** Where an override lands, read now if a `${...}` stopped the loader reading it. */
function overrideAddr(ctx: Ctx, override: Override): QualifiedAddr | null {
  if (!('kind' in override.at)) return override.at;

  const spelled = text(ctx, override.at.text, override);
  const read = parseQualifiedAddr(spelled);
  if (read === null)
    reject(ctx, CODE.badAddress, `\`${spelled}\` is not a sheet and a cell`, override);
  return read;
}

/** What the override said, over what was there. */
function layer(under: CompiledCell, over: CompiledCell, override: Override): CompiledCell {
  const writesValue =
    override.value !== null || override.formula !== null || override.rich !== null;

  return {
    at: under.at,
    value: writesValue ? over.value : under.value,
    type: writesValue ? over.type : under.type,
    formula: writesValue ? over.formula : under.formula,
    rich: writesValue ? over.rich : under.rich,
    format: override.format === null ? under.format : over.format,
    style: [...under.style, ...over.style],
    provenance: {
      value: writesValue ? over.provenance.value : under.provenance.value,
      format: override.format === null ? under.provenance.format : over.provenance.format,
    },
  };
}

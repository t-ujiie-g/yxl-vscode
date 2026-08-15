import type { Override, SpecDoc } from '@yxl-vscode/spec';
import {
  type A1Addr,
  cellOf,
  parseQualifiedAddr,
  type QualifiedAddr,
  within,
} from '@yxl-vscode/units';
import { compileFacets } from './cell';
import { CODE } from './codes';
import { type Ctx, context, type DataReader, filled, reject } from './ctx';
import type { CompiledCell, CompiledGrid, CompiledSheet } from './grid';
import { compileSheet, type Drafted } from './sheet';
import type { StyleLayer } from './style';

/**
 * The grid a spec projects to: pure, deterministic, and computed forward only
 * (ADR-001).
 *
 * No filesystem and no host (ADR-004): `read` is how it reaches the file a
 * `csv:` or `json:` block names. Without one it says which file it did not
 * read, rather than guessing at what was in it.
 */
export function compile(doc: SpecDoc, read?: DataReader): CompiledGrid {
  const ctx = context(doc, read ?? null);
  const drafts = doc.sheets.map((sheet) => compileSheet(ctx, sheet));

  for (const override of doc.overrides) applyOverride(ctx, override, drafts);

  return { sheets: drafts.map((draft) => draft.sheet), diagnostics: ctx.diagnostics };
}

/**
 * The cell at an address, whether a spec wrote it or a `formulas:` range covers
 * it.
 *
 * A written cell wins: an override lands on one cell of a filled range and
 * takes it out of the range, which is the case §23 exists for.
 */
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
 * Every layer that makes an address look how it looks, in the order they apply:
 * the column bands over it, then the rows, then whatever the cell itself said,
 * then an override (`docs/spec.md` §4).
 *
 * An address, not a cell — a band reaches the cells in its span whether a spec
 * wrote them or not, so an empty cell has a look and this answers for it.
 */
export function styleAt(sheet: CompiledSheet, at: A1Addr): readonly StyleLayer[] {
  const cell = cellOf(at);
  const bands = [
    ...sheet.columns.filter((band) => cell.col >= band.first && cell.col <= band.last),
    ...sheet.rows.filter((band) => cell.row >= band.first && cell.row <= band.last),
  ];

  return [...bands.flatMap((band) => band.style), ...(sheet.cells.get(at)?.style ?? [])];
}

/**
 * An override, applied after everything that wrote the cell — by construction
 * rather than by where it sits in the file (`docs/spec.md` §23, ADR-007).
 *
 * The facets it does not give are left as they were, which is why this replaces
 * the cell's value only when the override wrote one.
 */
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

/**
 * Where an override lands.
 *
 * The loader read it unless a `${...}` stood in the way, in which case the
 * parameters are in hand now and the address can be read at last.
 */
function overrideAddr(ctx: Ctx, override: Override): QualifiedAddr | null {
  if (!('kind' in override.at)) return override.at;

  const text = String(filled(ctx, override.at.text, override).value);
  const read = parseQualifiedAddr(text);
  if (read === null)
    reject(ctx, CODE.badAddress, `\`${text}\` is not a sheet and a cell`, override);
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

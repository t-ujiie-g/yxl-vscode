import { BORDER_SIDES } from './style';

/** The mapping key that names a `defs.values` or `defs.formulas` entry. */
export const REF_KEY = '$ref';

/** The mapping key that stands for the contents of another file. */
export const INCLUDE_KEY = '$include';

const CELL_KEYS = ['value', 'formula', 'rich', 'type', 'format', 'style'] as const;

/**
 * The keys each construct is read from; a key not here is kept verbatim and
 * marked opaque (ADR-011). The document's and the sheet's lists are short of
 * what yxl accepts and grow as constructs are modeled.
 */
export const MODELED_KEYS = {
  document: keySet(['sheets', 'params', 'defs', 'overrides', 'date1904']),
  defs: keySet(['styles', 'values', 'formulas']),
  sheet: keySet(['name', 'cells', 'formulas', 'data', 'columns', 'rows', 'merges']),
  cell: keySet(CELL_KEYS),
  override: keySet(['at', 'reason', ...CELL_KEYS]),
  richRun: keySet(['text', 'font']),
  style: keySet(['extends', 'font', 'fill', 'border', 'align', 'protection', 'format']),
  font: keySet(['bold', 'italic', 'underline', 'strike', 'size', 'name', 'color']),
  fill: keySet(['color']),
  border: keySet(BORDER_SIDES),
  borderEdge: keySet(['style', 'color']),
  align: keySet(['horizontal', 'vertical', 'wrap']),
  protection: keySet(['locked', 'hidden']),
  columnBand: keySet(['at', 'style', 'format', 'width', 'hidden', 'group']),
  rowBand: keySet(['at', 'style', 'format', 'height', 'hidden', 'group']),
  data: keySet(['at', 'values', 'csv', 'json', 'columns']),
  formulaRange: keySet(['at', 'formula']),
};

function keySet(names: readonly string[]): ReadonlySet<string> {
  return new Set(names);
}

import { BORDER_SIDES } from './style';

/** The mapping key that names a `defs.values` or `defs.formulas` entry. */
export const REF_KEY = '$ref';

/** The mapping key that stands for the contents of another file. */
export const INCLUDE_KEY = '$include';

/** The keys a cell says what it *holds* in, against the ones it says how it *looks* in. */
export const CELL_HOLDS: ReadonlySet<string> = keySet(['value', 'formula', 'rich', 'type']);
export const CELL_WEARS: ReadonlySet<string> = keySet(['format', 'style']);

const CELL_KEYS = [...CELL_HOLDS, ...CELL_WEARS];

/**
 * The keys a *writer* names, which are the schema's own: a spec is edited by
 * putting things under them, and they are spelled here and nowhere else.
 */
export const KEY = {
  at: 'at',
  cells: 'cells',
  comments: 'comments',
  filter: 'filter',
  data: 'data',
  format: 'format',
  formulas: 'formulas',
  freeze: 'freeze',
  gridlines: 'gridlines',
  group: 'group',
  hidden: 'hidden',
  links: 'links',
  merges: 'merges',
  name: 'name',
  overrides: 'overrides',
  style: 'style',
  to: 'to',
  list: 'list',
  text: 'text',
  tip: 'tip',
  url: 'url',
  tabColor: 'tab_color',
  tables: 'tables',
  validations: 'validations',
  visibility: 'visibility',
} as const;

/**
 * The keys each construct is read from; a key not here is kept verbatim and
 * marked opaque (ADR-011). The document's and the sheet's lists are short of
 * what yxl accepts and grow as constructs are modeled.
 */
export const MODELED_KEYS = {
  document: keySet(['sheets', 'params', 'defs', 'overrides', 'date1904']),
  defs: keySet(['styles', 'values', 'formulas']),
  sheet: keySet([
    'name',
    'cells',
    'formulas',
    'data',
    'columns',
    'rows',
    'merges',
    'freeze',
    'visibility',
    'tab_color',
    'gridlines',
    'split',
    'conditional',
    'filter',
    'comments',
    'links',
    'validations',
    'tables',
  ]),
  cell: keySet(CELL_KEYS),
  override: keySet(['at', 'reason', ...CELL_KEYS]),
  link: keySet(['url', 'to', 'tip']),
  validation: keySet([
    'at',
    'list',
    'whole',
    'decimal',
    'text_length',
    'date',
    'allow_blank',
    'prompt',
    'error',
  ]),
  table: keySet([
    'at',
    'name',
    'style',
    'banded_rows',
    'banded_columns',
    'first_column',
    'last_column',
  ]),
  said: keySet(['title', 'body']),
  refusal: keySet(['title', 'body', 'style']),
  note: keySet(['text', 'author']),
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
  conditional: keySet([
    'at',
    'cell',
    'text',
    'formula',
    'top',
    'bottom',
    'duplicate',
    'unique',
    'color_scale',
    'data_bar',
    'icon_set',
    'style',
    'format',
    'stop_if_true',
  ]),
};

function keySet(names: readonly string[]): ReadonlySet<string> {
  return new Set(names);
}

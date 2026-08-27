import { MODELED_KEYS } from './keys';

/**
 * What this editor does with one key of the schema: a gesture writes it, it is
 * read and drawn but nothing writes it, or it is carried through untouched and
 * invisible (ADR-011).
 */
export type Standing = 'editable' | 'preview' | 'opaque';

/** One key of the schema, what this editor does with it, and what that comes to. */
export interface Covered {
  readonly key: string;
  readonly standing: Standing;
  readonly says: string;
}

/**
 * Every key `docs/spec.md` gives a document, in the order the schema lists them.
 * `$include` is the format's own grammar rather than a construct, and is not here.
 */
export const DOCUMENT_KEYS: readonly Covered[] = [
  {
    key: 'sheets',
    standing: 'editable',
    says: 'the workbook itself: added, renamed, reordered, deleted',
  },
  { key: 'active', standing: 'opaque', says: 'which sheet opens first' },
  {
    key: 'params',
    standing: 'preview',
    says: 'turned in the preview, which redraws without touching the file',
  },
  {
    key: 'defs',
    standing: 'editable',
    says: 'a look lands here where the normalizer finds it a home',
  },
  { key: 'overrides', standing: 'editable', says: 'the exception a refusal offers' },
  {
    key: 'properties',
    standing: 'opaque',
    says: 'title, author and the rest of the document properties',
  },
  { key: 'calc', standing: 'opaque', says: 'when Excel recalculates' },
  { key: 'protect', standing: 'opaque', says: 'the workbook lock' },
  { key: 'date1904', standing: 'preview', says: 'honoured when a date is computed' },
  { key: 'default_font', standing: 'opaque', says: 'the font every cell starts from' },
];

/** Every key `docs/spec.md` gives a sheet, in the order the schema lists them. */
export const SHEET_KEYS: readonly Covered[] = [
  {
    key: 'name',
    standing: 'editable',
    says: 'renamed from its tab; every formula that names it follows',
  },
  { key: 'cells', standing: 'editable', says: 'typed into, cleared, pasted over, styled' },
  {
    key: 'formulas',
    standing: 'editable',
    says: 'what a fill writes, and what a fill can be split out of',
  },
  { key: 'data', standing: 'editable', says: 'sorted, extended, and what a rectangle converts to' },
  {
    key: 'columns',
    standing: 'editable',
    says: 'width, hidden, group and a look over a whole column',
  },
  { key: 'rows', standing: 'editable', says: 'the same down the side' },
  {
    key: 'merges',
    standing: 'editable',
    says: 'merged and taken apart, losing no value either way',
  },
  {
    key: 'visibility',
    standing: 'editable',
    says: 'hidden and shown from the tab; `very_hidden` is drawn, not offered',
  },
  {
    key: 'freeze',
    standing: 'editable',
    says: 'set at the selected cell, and honoured while scrolling',
  },
  {
    key: 'split',
    standing: 'preview',
    says: 'the splitter drawn where it sits; the panes do not come apart',
  },
  {
    key: 'gridlines',
    standing: 'editable',
    says: 'switched from the tab; the key goes away at Excel default',
  },
  { key: 'tab_color', standing: 'editable', says: 'picked from the tab' },
  {
    key: 'print',
    standing: 'preview',
    says: 'the area outlined and the page breaks drawn; the rest said under the grid',
  },
  {
    key: 'filter',
    standing: 'editable',
    says: 'put on the header row and taken off; per-column criteria are not in the schema',
  },
  {
    key: 'validations',
    standing: 'editable',
    says: 'a `list:` written over a selection; every kind read and said',
  },
  {
    key: 'links',
    standing: 'editable',
    says: 'written, followed and taken off; the kind is asked, never guessed',
  },
  {
    key: 'conditional',
    standing: 'preview',
    says: 'every kind of rule applied in the grid, over the computed values',
  },
  {
    key: 'comments',
    standing: 'editable',
    says: "written in a box over the cell, and shown on Excel's red corner",
  },
  {
    key: 'tables',
    standing: 'editable',
    says: 'made over a selection and taken apart; drawn as Excel bands one',
  },
  {
    key: 'charts',
    standing: 'editable',
    says: 'put in over a selection, moved, resized; sketched, never rendered',
  },
  {
    key: 'images',
    standing: 'editable',
    says: 'put in from a file, moved, scaled by a drag on the corner',
  },
  {
    key: 'shapes',
    standing: 'editable',
    says: 'moved and resized; drawn as the geometry each one names',
  },
  {
    key: 'background',
    standing: 'opaque',
    says: 'the watermark behind the cells, which Excel never prints',
  },
  {
    key: 'sparklines',
    standing: 'preview',
    says: 'drawn inside the cell, from the values the sheet holds',
  },
  {
    key: 'controls',
    standing: 'opaque',
    says: 'buttons, checkboxes and the rest of the form controls',
  },
  { key: 'slicers', standing: 'opaque', says: 'the tiles that filter a table or a pivot' },
  { key: 'pivots', standing: 'opaque', says: 'pivot tables' },
  {
    key: 'protect',
    standing: 'preview',
    says: 'the cells a style unlocks marked, and what the sheet still allows said',
  },
];

/**
 * Whether the loader reads this key at all. `opaque` is not a claim but a
 * consequence: a key `MODELED_KEYS` does not list is carried through untouched.
 */
export function standingOf(key: string, of: 'document' | 'sheet'): Standing | 'opaque' {
  const modeled = of === 'document' ? MODELED_KEYS.document : MODELED_KEYS.sheet;
  const found = (of === 'document' ? DOCUMENT_KEYS : SHEET_KEYS).find((one) => one.key === key);
  if (!modeled.has(key)) return 'opaque';

  return found?.standing ?? 'opaque';
}

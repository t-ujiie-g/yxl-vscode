import type { ScalarValue } from '@yxl-vscode/spec';
import { format as excel, formatColor, isDateFormat } from 'numfmt';
import { japanese } from './japanese';
import type { DrawnCell } from './protocol';

/**
 * What a cell shows: a computed result, else the cached value, else the formula
 * itself — never a number that is not the workbook's (ADR-014). A number wears
 * its format.
 */
export function shown(cell: DrawnCell): string {
  if (cell.computed?.kind === 'error') return cell.computed.error;

  const value = held(cell);
  if (value !== null) return formatted(value, cell.format, cell.date1904);

  return cell.formula === null ? '' : `=${cell.formula}`;
}

/** What a format would make of the number a cell shows, or `null` where it shows none. */
export function underFormat(cell: DrawnCell, format: string): string | null {
  const value = held(cell);
  return typeof value === 'number' ? formatted(value, format, cell.date1904) : null;
}

/** The value a cell shows: what was computed where there is one, else what the spec holds (ADR-014). */
function held(cell: DrawnCell): ScalarValue | null {
  return cell.computed?.kind === 'value' ? cell.computed.value : cell.value;
}

/** Where Excel's General alignment puts what a cell shows: a number right, a truth or an error centred, text left. */
export function standard(cell: DrawnCell): string | null {
  if (cell.computed?.kind === 'error' || cell.error) return 'center';

  const value = held(cell);
  if (typeof value === 'number') return 'right';
  return typeof value === 'boolean' ? 'center' : null;
}

/** The colour a number format's section draws its number in (`[Red]`), or `null` where it names none. */
export function tinted(cell: DrawnCell): string | null {
  const value = held(cell);
  if (value === null || typeof value === 'boolean' || cell.format === null) return null;

  const named = formatColor(cell.format, value, { throws: false });
  if (typeof named !== 'string') return null;

  return SECTION_COLORS[named] ?? named;
}

/** Excel's eight named section colours, which are not CSS's: its `[Green]` is `#00FF00`. */
const SECTION_COLORS: Readonly<Record<string, string>> = {
  black: '#000000',
  blue: '#0000FF',
  cyan: '#00FFFF',
  green: '#00FF00',
  magenta: '#FF00FF',
  red: '#FF0000',
  white: '#FFFFFF',
  yellow: '#FFFF00',
};

/** A value as Excel shows it: General with no format (#209), text through its text section, truth in capitals (#213). */
function formatted(value: ScalarValue, format: string | null, date1904: boolean): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'string')
    return format === null ? value : excel(format, value, { throws: false });

  const code = format ?? 'General';
  const dated = isDateFormat(code);
  const serial = dated && date1904 ? value + DAYS_FROM_1900_TO_1904 : value;
  return excel(dated ? japanese(code, serial) : code, serial, { throws: false });
}

/** How far a 1904-system serial sits from the 1900-system one that names the same day (#210). */
const DAYS_FROM_1900_TO_1904 = 1462;

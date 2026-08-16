/** A date or an elapsed time as the number Excel stores (`docs/spec.md` §3). */

/** The default formats a typed cell takes when the spec writes none. */
export const DATE_FORMAT = 'yyyy-mm-dd';
export const DATETIME_FORMAT = 'yyyy-mm-dd hh:mm:ss';
export const DURATION_FORMAT = '[h]:mm:ss';

const DATE = /^(\d{1,4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;
const DURATION = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/;

/** A date and, when the text carried one, a time of day. */
interface Dated {
  readonly serial: number;
  readonly withTime: boolean;
}

/**
 * The serial for a date under the workbook's epoch, or `null`. The 1900 system
 * keeps Excel's own bug — a 1900-02-29 that never happened — or every modern
 * date lands a day early.
 */
export function dateSerial(text: string, from1904: boolean): Dated | null {
  const read = DATE.exec(text);
  if (read === null) return null;

  const parts = read.slice(1).map((one) => (one === undefined ? 0 : Number(one)));
  const [y = 0, m = 0, d = 0, hh = 0, mm = 0, ss = 0] = parts;

  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  if (hh > 23 || mm > 59 || ss > 59) return null;

  const days = from1904
    ? daysFromCivil(y, m, d) - daysFromCivil(1904, 1, 1)
    : daysFromCivil(y, m, d) - daysFromCivil(1899, 12, 31) + (after1900February(y, m) ? 1 : 0);

  return {
    serial: days + (hh * 3600 + mm * 60 + ss) / 86_400,
    withTime: hh !== 0 || mm !== 0 || ss !== 0,
  };
}

/** The serial for an elapsed time: its length as a fraction of a day, under either epoch. */
export function durationSerial(text: string): number | null {
  const read = DURATION.exec(text);
  if (read === null) return null;

  const [hours = 0, minutes = 0, seconds = 0] = read
    .slice(1)
    .map((one) => (one === undefined ? 0 : Number(one)));

  if (minutes > 59 || seconds > 59) return null;
  return (hours * 3600 + minutes * 60 + seconds) / 86_400;
}

function after1900February(year: number, month: number): boolean {
  return year > 1900 || (year === 1900 && month >= 3);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return leap(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function leap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Days from the civil calendar to a fixed point, so two of them subtract to a span. */
function daysFromCivil(year: number, month: number, day: number): number {
  const shifted = month <= 2 ? year - 1 : year;
  const era = Math.floor(shifted / 400);
  const ofEra = shifted - era * 400;
  const ofYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = ofEra * 365 + Math.floor(ofEra / 4) - Math.floor(ofEra / 100) + ofYear;

  return era * 146_097 + doe - 719_468;
}

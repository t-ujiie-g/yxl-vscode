import { type Span, span } from '@yxl-vscode/diag';
import type { DataRow, ScalarValue } from '@yxl-vscode/spec';

/** A table read, or the reason it would not read; `null` in a row is no cell at all (`docs/spec.md` §9). */
export type Table = { readonly rows: readonly DataRow[] } | { readonly problem: string };

const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const BOOLEAN = /^(?:true|false)$/;

/**
 * RFC 4180. A quoted field is always text and a bare one is read as the number
 * or boolean it looks like — narrower than YAML, as Excel reads an import
 * (`docs/spec.md` §9).
 */
export function readCsv(source: string): Table {
  const scanned = scanCsv(source);
  if (scanned.problem !== null) return { problem: scanned.problem };

  return { rows: scanned.rows.map((row) => row.map((field) => field.value)) };
}

/**
 * Where a field sits, quotes included, so a writer can replace it and no other
 * byte; `null` where the file has no such row or field.
 */
export function fieldAt(source: string, row: number, col: number): Span | null {
  return scanCsv(source).rows[row]?.[col]?.span ?? null;
}

/** A value as a CSV field the reader above reads back as itself; the quoting is the type. */
export function asCsvField(value: ScalarValue): string {
  if (value === null) return '';
  if (typeof value !== 'string') return String(value);

  // RFC 4180 needs no quotes for a space, but a leading or trailing one is
  // what most readers trim.
  const quoted =
    /[",\r\n]/.test(value) || /^\s|\s$/.test(value) || NUMBER.test(value) || BOOLEAN.test(value);

  return quoted ? `"${value.replace(/"/g, '""')}"` : value;
}

/** One field of a CSV: what it says, and where it says it. */
interface Field {
  readonly value: ScalarValue;
  readonly span: Span;
}

/** The one pass both readings are made of, so a field's value and its bytes cannot disagree. */
function scanCsv(source: string): { rows: Field[][]; problem: string | null } {
  const rows: Field[][] = [];
  let row: Field[] = [];
  let field = '';
  let quoting = false;
  let quoted = false;
  let started = false;
  let from = 0;

  const endField = (at: number): void => {
    row.push({ value: csvField(field, quoted), span: span(from, at) });
    field = '';
    quoted = false;
    from = at + 1;
  };

  for (let index = 0; index < source.length; index += 1) {
    const here = source.charAt(index);

    if (quoting) {
      if (here !== '"') {
        field += here;
      } else if (source.charAt(index + 1) === '"') {
        field += '"';
        index += 1;
      } else {
        quoting = false;
      }
      continue;
    }

    if (here === '"') {
      quoting = true;
      quoted = true;
      started = true;
    } else if (here === ',') {
      endField(index);
      started = true;
    } else if (here === '\n') {
      if (started) {
        endField(source.charAt(index - 1) === '\r' ? index - 1 : index);
        rows.push(row);
        row = [];
        started = false;
      }
      from = index + 1;
    } else if (here !== '\r') {
      field += here;
      started = true;
    }
  }

  if (quoting) return { rows: [], problem: 'the CSV ends inside a quoted field' };
  if (started) {
    endField(source.length);
    rows.push(row);
  }
  return { rows, problem: null };
}

/**
 * A JSON table: an array of rows, or of objects whose fields `columns` names
 * and orders — required there, since JSON promises no key order (`docs/spec.md`
 * §9).
 */
export function readJson(source: string, columns: readonly string[] | null): Table {
  let document: unknown;
  try {
    document = JSON.parse(source);
  } catch (failure) {
    return { problem: `invalid JSON: ${(failure as Error).message}` };
  }

  if (!Array.isArray(document)) return { problem: 'a JSON table must be an array of rows' };

  const rows: DataRow[] = [];
  for (const [index, item] of document.entries()) {
    const at = index + 1;
    const row = jsonRow(item, columns, at);
    if ('problem' in row) return row;
    rows.push(row.fields);
  }
  return { rows };
}

function jsonRow(
  item: unknown,
  columns: readonly string[] | null,
  at: number,
): { readonly fields: DataRow } | { readonly problem: string } {
  if (Array.isArray(item)) {
    if (columns !== null) {
      return { problem: `\`columns\` names the fields of objects, but row ${at} is an array` };
    }
    return fieldsOf(item, at);
  }

  if (item === null || typeof item !== 'object') {
    return { problem: `row ${at} of a JSON table must be an array or an object` };
  }

  if (columns === null) {
    const why = 'object key order is not dependable';
    return {
      problem: `row ${at} is an object, so \`columns\` must name the fields to take (${why})`,
    };
  }

  const held = item as Record<string, unknown>;
  const taken: unknown[] = [];
  for (const name of columns) {
    if (!(name in held)) return { problem: `row ${at} has no field \`${name}\`` };
    taken.push(held[name]);
  }
  return fieldsOf(taken, at);
}

function fieldsOf(
  values: readonly unknown[],
  at: number,
): { readonly fields: DataRow } | { readonly problem: string } {
  const fields: ScalarValue[] = [];

  for (const value of values) {
    if (value === null) {
      fields.push(null);
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      fields.push(value);
      continue;
    }
    const kinds = 'a string, a number, a boolean, or null';
    return {
      problem: `row ${at} has a field that is an array or an object; a cell holds ${kinds}`,
    };
  }

  return { fields };
}

function csvField(text: string, quoted: boolean): ScalarValue {
  if (quoted) return text;
  return text === '' ? null : infer(text);
}

/**
 * Text as the scalar it looks like — one reading for a bare CSV field and a
 * `--set` value (`docs/spec.md` §7, §9), narrower than YAML's.
 */
export function infer(text: string): ScalarValue {
  if (text === 'true') return true;
  if (text === 'false') return false;
  return NUMBER.test(text) ? Number(text) : text;
}

import { type Span, span } from '@yxl-vscode/diag';
import type { DataRow, ScalarValue } from '@yxl-vscode/spec';

/**
 * A table read, or the reason it would not read.
 *
 * `null` in a row means no cell at all rather than an empty one — a blank a
 * `formulas:` range may cover, which is the same rule inline rows follow
 * (`docs/spec.md` §9).
 */
export type Table = { readonly rows: readonly DataRow[] } | { readonly problem: string };

const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const BOOLEAN = /^(?:true|false)$/;

/**
 * RFC 4180: commas separate fields, newlines separate records, and a quoted
 * field may hold either and doubles an inner quote.
 *
 * A **quoted** field is always text, so a CSV can carry `"007"` verbatim; a
 * **bare** one is read as a number or a boolean when it looks like one, and an
 * empty bare field writes no cell. That reading is narrower than YAML's — no
 * `0x1F`, no `.inf`, no `True` — because a CSV is not a YAML document and this
 * is what Excel does with an imported file.
 */
export function readCsv(source: string): Table {
  const scanned = scanCsv(source);
  if (scanned.problem !== null) return { problem: scanned.problem };

  return { rows: scanned.rows.map((row) => row.map((field) => field.value)) };
}

/**
 * Where a field sits in the text, so a writer can replace that field and no
 * other byte of the file.
 *
 * The span covers the quotes where the field has them: what replaces it decides
 * its own quoting, and a field that was `"007"` may become `8`. `null` where the
 * file has no such row or no such field in it — a short row is allowed
 * (`docs/spec.md` §9), so the answer is about this file rather than about the
 * shape of the block.
 */
export function fieldAt(source: string, row: number, col: number): Span | null {
  return scanCsv(source).rows[row]?.[col]?.span ?? null;
}

/**
 * A value as a CSV field, read back as itself by the reader above.
 *
 * A CSV carries no types, so the quoting *is* the type: text that looks like a
 * number has to be quoted to stay text, and a number must not be. A field
 * holding a comma, a quote or a line break is quoted because RFC 4180 says so.
 */
export function asCsvField(value: ScalarValue): string {
  if (value === null) return '';
  if (typeof value !== 'string') return String(value);

  const quoted = /[",\r\n]/.test(value) || NUMBER.test(value) || BOOLEAN.test(value);
  return quoted ? `"${value.replace(/"/g, '""')}"` : value;
}

/** One field of a CSV: what it says, and where it says it. */
interface Field {
  readonly value: ScalarValue;
  readonly span: Span;
}

/**
 * The one pass both readings are made of, so the value a field has and the
 * bytes it occupies can never disagree.
 */
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
 * A JSON table: an array of rows, each an array of values, or an object whose
 * fields `columns` names and orders.
 *
 * `columns` is required for objects and refused for arrays, because JSON does
 * not promise key order and a layout derived from it would not be
 * deterministic (`docs/spec.md` §9).
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
    // Rows count from one in a message: the reader is looking at data, not code.
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
 * Text as the scalar it looks like.
 *
 * The reading a bare CSV field gets and the reading a `--set` value gets are
 * the same one (`docs/spec.md` §7, §9), so they are the same function: `--set
 * rate=0.15` stays a number, and so does a `0.15` in a column of them.
 *
 * Narrower than YAML's core schema — no `0x1F`, no `.inf`, no `True` — because
 * neither of these is a YAML document.
 */
export function infer(text: string): ScalarValue {
  if (text === 'true') return true;
  if (text === 'false') return false;
  return NUMBER.test(text) ? Number(text) : text;
}

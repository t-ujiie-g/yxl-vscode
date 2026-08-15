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
  const rows: DataRow[] = [];
  let row: ScalarValue[] = [];
  let field = '';
  let quoting = false;
  let quoted = false;
  let started = false;

  const endField = (): void => {
    row.push(csvField(field, quoted));
    field = '';
    quoted = false;
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
      endField();
      started = true;
    } else if (here === '\n') {
      if (started) {
        endField();
        rows.push(row);
        row = [];
        started = false;
      }
    } else if (here !== '\r') {
      field += here;
      started = true;
    }
  }

  if (quoting) return { problem: 'the CSV ends inside a quoted field' };
  if (started) {
    endField();
    rows.push(row);
  }
  return { rows };
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
  if (text === '') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  return NUMBER.test(text) ? Number(text) : text;
}

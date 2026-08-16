/**
 * A rectangle as another spreadsheet puts one on the clipboard: rows by line,
 * fields by tab, a field holding either of those quoted. Short rows are made up
 * to the widest, so what comes back is a rectangle rather than a ragged list.
 */
export function tabular(text: string): string[][] {
  const rows: string[][] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let at = 0;

  const endField = (): void => {
    fields.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    rows.push(fields);
    fields = [];
  };

  while (at < text.length) {
    const char = text[at] as string;

    if (quoted) {
      if (char !== '"') {
        field += char;
        at += 1;
        continue;
      }
      if (text[at + 1] === '"') {
        field += '"';
        at += 2;
        continue;
      }

      quoted = false;
      at += 1;
      continue;
    }

    if (char === '"' && field === '') {
      quoted = true;
      at += 1;
      continue;
    }
    if (char === '\t') {
      endField();
      at += 1;
      continue;
    }
    if (char === '\n' || char === '\r') {
      endRow();
      at += text[at] === '\r' && text[at + 1] === '\n' ? 2 : 1;
      continue;
    }

    field += char;
    at += 1;
  }

  if (field !== '' || fields.length > 0) endRow();

  return squared(rows);
}

/** Every row made up to the widest, so the caller has a rectangle to land. */
function squared(rows: readonly string[][]): string[][] {
  const wide = rows.reduce((most, row) => Math.max(most, row.length), 0);
  return rows.map((row) => [...row, ...Array.from({ length: wide - row.length }, () => '')]);
}

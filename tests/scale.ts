import { columnLabel } from '@yxl-vscode/units';
/** A spec as large as anyone would plausibly write, built rather than stored as a megabyte of YAML. */
export function largeSpec(rows: number, columns: number): string {
  const bands = Array.from(
    { length: columns },
    (_, at) => `      - at: ${columnLabel(at + 1)}\n        width: 14\n        format: "#,##0"`,
  ).join('\n');

  const values = Array.from(
    { length: rows },
    (_, row) =>
      `          - [${Array.from({ length: columns }, (_, col) => row * columns + col).join(', ')}]`,
  ).join('\n');

  return [
    'defs:',
    '  styles:',
    '    base: { font: { name: Calibri, size: 11 } }',
    '    header: { extends: base, font: { bold: true }, fill: "1F3864" }',
    'sheets:',
    '  - name: Sales',
    '    columns:',
    bands,
    '    rows:',
    '      - at: 1',
    '        style: header',
    '    formulas:',
    `      - at: ${columnLabel(columns + 1)}2:${columnLabel(columns + 1)}${rows + 1}`,
    '        formula: "A2*2"',
    '    data:',
    '      - at: A2',
    '        values:',
    values,
    '',
  ].join('\n');
}

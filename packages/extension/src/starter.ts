/**
 * What a new spec starts as: one sheet with a heading row, a number, a formula
 * and a look, which is enough of `docs/spec.md` to edit rather than to read.
 * Checked against the compiler that will build it, like any other spec.
 */
export const STARTER = `# A yxl spec: what the workbook holds, as text. The grid beside it is a
# preview — edit either one. To build the workbook:
#
#   yxl build sheet.yxl.yaml -o sheet.xlsx
#
# The format is documented at https://github.com/t-ujiie-g/yxl/blob/main/docs/spec.md
defs:
  styles:
    heading:
      font: { bold: true, color: "FFFFFF" }
      fill: "1F3864"

sheets:
  - name: Sheet1
    columns:
      - at: A
        width: 18
      - at: B
        width: 12
        format: "#,##0"
    rows:
      - at: 1
        style: heading

    cells:
      A1: Item
      B1: Amount
      A2: First
      B2: 1200
      A3: Second
      B3: 800

      # yxl writes the formula; Excel computes it when it opens the workbook.
      A4: Total
      B4: { formula: "SUM(B2:B3)" }
`;

/**
 * Where a new spec is written: this editor reads `*.yxl.yaml`, so a name the
 * reader gave that is not one becomes one rather than opening as plain YAML.
 */
export function specPath(chosen: string): string {
  if (/\.yxl\.ya?ml$/.test(chosen)) return chosen;

  return `${chosen.replace(/\.ya?ml$/, '')}.yxl.yaml`;
}

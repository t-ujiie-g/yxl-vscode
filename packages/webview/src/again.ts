/**
 * Finding what the reader was looking at, in a spec that has been read again.
 *
 * The file changes under the preview — an editor keystroke, the CLI, a git
 * checkout — and every read derives a whole new projection (ADR-001). What the
 * view keeps across that is what the reader *pointed at*: a sheet by name, a
 * cell by address, a parameter by name (ADR-023). This is the one of those that
 * has to be looked up again, because a sheet is drawn by position.
 */

/** The sheet the view was showing: what it was called, and where it then was. */
export interface Kept {
  readonly name: string;
  readonly index: number;
}

/**
 * Where the kept sheet is now.
 *
 * Position first, so that two sheets sharing a name — which the workbook
 * forbids (`docs/spec.md` §2) but a half-written spec can hold — stay
 * distinguishable while they do. Then the name, which is what survives a sheet
 * appearing before it. Then the first sheet, because the one being looked at is
 * gone and there is nothing to be faithful to.
 */
export function sheetAgain(
  sheets: readonly { readonly name: string }[],
  kept: Kept | null,
): number {
  if (kept === null) return 0;
  if (sheets[kept.index]?.name === kept.name) return kept.index;

  const named = sheets.findIndex((sheet) => sheet.name === kept.name);
  return named === -1 ? 0 : named;
}

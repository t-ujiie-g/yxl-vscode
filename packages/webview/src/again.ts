/** The sheet the view was showing: what it was called, and where it then was. */
export interface Kept {
  readonly name: string;
  readonly index: number;
}

/**
 * Where the kept sheet is in a spec read again (ADR-023): its position if the
 * name still matches, else its name, else the first sheet.
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

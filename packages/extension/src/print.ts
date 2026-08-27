import type { CompiledPrint } from '@yxl-vscode/compile';
import type { Margins } from '@yxl-vscode/spec';
import { rangeOf } from '@yxl-vscode/units';
import type { DrawnPrint } from '@yxl-vscode/webview/protocol';

/** A sheet's `print:` as the view draws it: the area, the breaks, and the rest in a sentence. */
export function printed(one: CompiledPrint | null): DrawnPrint | null {
  if (one === null) return null;

  return {
    area: one.area === null ? null : { ...one.area },
    breaks: one.breaks.map((at) => ({ row: at.row, col: at.col })),
    says: printSaid(one),
  };
}

/** What a `print:` sets, in a reader's words; the preview draws the paper's edges and no pages. */
function printSaid(one: CompiledPrint): string {
  const scaled =
    one.scale !== null
      ? `scaled to ${one.scale}%`
      : one.fit === null
        ? ''
        : `fitted to ${pages(one.fit.width, 'across')} ${pages(one.fit.height, 'down')}`.trim();

  const said = [
    one.area === null ? 'The whole sheet prints' : `${rangeOf(one.area)} prints`,
    one.orientation ?? '',
    scaled,
    one.margins === null ? '' : `margins ${inches(one.margins)}`,
    one.breaks.length === 0 ? '' : `${one.breaks.length} page break(s)`,
  ].filter((piece) => piece !== '');

  const running = [
    one.header === null ? '' : `header \`${one.header}\``,
    one.footer === null ? '' : `footer \`${one.footer}\``,
  ].filter((piece) => piece !== '');

  const rest = running.length === 0 ? '' : ` Its ${running.join(' and ')}.`;
  return `${said.join(', ')}.${rest} The preview outlines the area and the breaks; it does not paginate.`;
}

/** How many pages an axis is squeezed into; `0` and unset both leave it alone. */
function pages(many: number | null, way: string): string {
  return many === null || many === 0 ? '' : `${many} page${many === 1 ? '' : 's'} ${way}`;
}

/** The margins as a reader reads them, in the inches Excel measures them in. */
function inches(margins: Margins): string {
  const named: readonly (keyof Margins)[] = ['top', 'bottom', 'left', 'right', 'header', 'footer'];
  const said = named
    .filter((edge) => margins[edge] !== null)
    .map((edge) => `${edge} ${margins[edge]}in`);

  return said.join(', ');
}

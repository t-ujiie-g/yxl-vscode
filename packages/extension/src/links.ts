import { reading, setLink } from '@yxl-vscode/intent';
import { addrAt, cellOf, parseQualifiedAddr, type SheetName } from '@yxl-vscode/units';
import type { Linked } from '@yxl-vscode/webview/protocol';
import { applied, type Port, type Spec, sheetNamed } from './write';

/**
 * A cell's link, written, pointed elsewhere, or taken off (`docs/spec.md` §10).
 * The link decorates the cell; what the cell holds is left alone either way.
 */
export async function link(spec: Spec, asked: Linked, port: Port): Promise<void> {
  const sheet = sheetNamed(asked.sheet, port);
  if (sheet === null) return;

  const at = addrAt({ col: asked.col, row: asked.row });
  const intent = setLink(spec, { sheet, at, target: asked.link }, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: 'link', about: null });
  if (!done) return;

  port.said(asked.link === null ? `${at} has no link now.` : `${at} goes to ${asked.link.text}.`);
}

/** Where a cell asked to be followed: a page to open, a cell to go to, or why neither. */
export type Followed =
  | { readonly kind: 'open'; readonly url: string }
  | { readonly kind: 'goTo'; readonly sheet: SheetName; readonly row: number; readonly col: number }
  | { readonly kind: 'refused'; readonly why: string };

/** The schemes a link is opened for: a spec is a file, and a file may come from anywhere. */
const OPENS = ['http', 'https', 'mailto'];

/** What following a cell's link comes to, decided here so that opening one is all the caller does. */
export function following(
  spec: Spec,
  where: { readonly sheet: string; readonly row: number; readonly col: number },
): Followed {
  const sheet = spec.grid.sheets.find((one) => one.name === where.sheet);
  const at = addrAt({ col: where.col, row: where.row });
  const link = sheet?.links.get(at) ?? null;
  if (link === null) return { kind: 'refused', why: `\`${at}\` holds no link to follow` };

  const target = link.target.text;
  if (link.target.kind === 'url') return opening(target);

  const inside = parseQualifiedAddr(target);
  if (inside === null) {
    return { kind: 'refused', why: `\`${target}\` is a name, and this preview follows cells` };
  }
  if (!spec.grid.sheets.some((one) => one.name === inside.sheet)) {
    return { kind: 'refused', why: `there is no sheet named \`${inside.sheet}\`` };
  }

  return { kind: 'goTo', sheet: inside.sheet, ...cellOf(inside.at) };
}

function opening(url: string): Followed {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase() ?? null;
  if (scheme === null) return { kind: 'refused', why: `\`${url}\` is not a page to open` };

  return OPENS.includes(scheme)
    ? { kind: 'open', url }
    : { kind: 'refused', why: `this preview opens ${OPENS.join(', ')}, not \`${scheme}\`` };
}

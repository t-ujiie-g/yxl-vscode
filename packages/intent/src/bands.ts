import type { CompiledSheet } from '@yxl-vscode/compile';
import { entryOf, type Op } from '@yxl-vscode/cst';
import { type Axis, BAND_KEYS } from '@yxl-vscode/spec';
import { columnLabel } from '@yxl-vscode/units';
import { type Found, located, type Reading } from './direct';

/** A run of columns or rows a gesture names, as a band's `at` covers one. */
export interface Span {
  readonly axis: Axis;
  readonly first: number;
  readonly last: number;
}

/** A span as a band's `at` spells it: a column label or a row number, and a range as two of them. */
export function spelled(span: Span): string {
  const said = (at: number) => (span.axis === 'column' ? columnLabel(at) : String(at));
  return span.first === span.last ? said(span.first) : `${said(span.first)}-${said(span.last)}`;
}

/** What a band of a reader's own would be: where it goes, and the op that puts it there. */
export function bandOfItsOwn(
  sheet: CompiledSheet,
  span: Span,
  keys: readonly (readonly [string, string])[],
  read: Reading,
): { found: Found & { kind: 'found' }; op: Op } | null {
  const found = located(sheet.node, read);
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const key = BAND_KEYS[span.axis].at;
  const body = [`at: ${spelled(span)}`, ...keys.map(([one, value]) => `${one}: ${value}`)].join(
    '\n',
  );
  const held = entryOf(found.node, key)?.value;

  const op: Op =
    held?.kind === 'seq'
      ? { op: 'insertSource', path: [...found.path, key], index: held.items.length, source: body }
      : { op: 'addSource', path: found.path, key, source: `- ${body.replaceAll('\n', '\n  ')}` };

  return { found, op };
}

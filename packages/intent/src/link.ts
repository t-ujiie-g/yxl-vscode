import { entryOf, type Node, type Op, type Path, renderScalar } from '@yxl-vscode/cst';
import { KEY, type LinkTarget } from '@yxl-vscode/spec';
import type { A1Addr, SheetName } from '@yxl-vscode/units';
import { nothingChanges } from '@yxl-vscode/verify';
import {
  type Intent,
  keptElsewhere,
  type Projection,
  type Reading,
  refused,
  writtenSheet,
} from './direct';

/** A link on a cell as a gesture asks for it: where it goes, or `null` to take it off. */
export interface Linking {
  readonly sheet: SheetName;
  readonly at: A1Addr;
  readonly target: LinkTarget | null;
}

/**
 * A cell's link under the sheet's `links:`, written, pointed elsewhere, or
 * taken away (`docs/spec.md` §10). A link keeps the kind of target it was
 * written with, and its `tip`: which kind it is, is never inferred.
 */
export function setLink(spec: Projection, where: Linking, read: Reading): Intent {
  const found = writtenSheet(spec, where.sheet, read);
  if (found.kind === 'refused') return found;

  const away = keptElsewhere(found.node, KEY.links, where.sheet);
  if (away !== null) return refused(away);

  const links = entryOf(found.node, KEY.links)?.value ?? null;

  const already = links === null ? null : (entryOf(links, where.at)?.value ?? null);
  const ops = writing(where, { links, already, under: [...found.path, KEY.links] }, found.path);
  if ('why' in ops) return refused(ops.why);

  return { kind: 'edit', file: found.file, patch: ops, expects: nothingChanges };
}

/** Where the link is written, as the file has it: the mapping, the entry in it, and the path to both. */
interface Where {
  readonly links: Node | null;
  readonly already: Node | null;
  readonly under: Path;
}

function writing(
  want: Linking,
  where: Where,
  sheet: Path,
): { ops: readonly Op[] } | { why: string } {
  const { links, already, under } = where;
  const target = want.target;

  if (target === null) {
    if (already === null) return { why: `\`${want.at}\` has no link to take off` };

    const alone = links?.kind === 'map' && links.entries.length === 1;
    return { ops: [{ op: 'remove', path: alone ? under : [...under, want.at] }] };
  }

  if (target.text === '') return { why: 'a link needs somewhere to go' };
  if (already === null) return { ops: [putting(target, want.at, links === null, sheet, under)] };

  if (already.kind !== 'map') {
    return target.kind === 'url'
      ? { ops: [{ op: 'set', path: [...under, want.at], value: target.text }] }
      : { why: `\`${want.at}\` links out of the workbook — take that link off first` };
  }

  if (entryOf(already, target.kind) === undefined) {
    return { why: `the link on \`${want.at}\` does not go to a \`${target.kind}\`` };
  }

  return { ops: [{ op: 'set', path: [...under, want.at, target.kind], value: target.text }] };
}

/** The entry going in, with the `links:` key itself where the sheet has none. */
function putting(target: LinkTarget, at: A1Addr, first: boolean, sheet: Path, under: Path): Op {
  const inside = `${KEY.to}: ${renderScalar(target.text, 'double')}`;

  if (first) {
    const entry =
      target.kind === 'url' ? `${at}: ${renderScalar(target.text)}` : `${at}:\n  ${inside}`;
    return { op: 'addSource', path: sheet, key: KEY.links, source: entry };
  }

  return target.kind === 'url'
    ? { op: 'add', path: under, key: at, value: target.text, before: null }
    : { op: 'addSource', path: under, key: at, source: inside };
}

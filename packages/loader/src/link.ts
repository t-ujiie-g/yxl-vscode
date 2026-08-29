import type { Entry, Node, Path } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import { type Link, type LinkTarget, MODELED_KEYS } from '@yxl-vscode/spec';
import { CODE } from './codes';
import { type Ctx, identify, keyOf, reject } from './ctx';
import { expectText, findEntry, openEntries, rejectUnknownKey } from './read';
import { ADDRESS, readTextAs } from './template';
import { about, entryOf, say, under } from './text';

/** A sheet's `links:` mapping: one link per addressed cell (`docs/spec.md` §10). */
export function readLinks(ctx: Ctx, node: Node, path: Path): Link[] {
  const opened = openEntries(ctx, node, path, '`links`');
  if (opened === null) return [];

  const links: Link[] = [];
  for (const entry of opened.entries) {
    const link = readLink(opened.ctx, entry, opened.path);
    if (link !== null) links.push(link);
  }
  return links;
}

function readLink(ctx: Ctx, entry: Entry, path: Path): Link | null {
  const key = keyOf(entry);
  const at = readTextAs(ctx, key, entry.key.span, entryOf('links'), ADDRESS);
  if (at === null) return null;

  const what = about('link', String(key));
  const site = identify(ctx, [...path, key], entry.span);

  if (entry.value.kind !== 'map') {
    const url = expectText(ctx, entry.value, what);
    return url === null ? null : { ...site, at, target: { kind: 'url', text: url }, tip: null };
  }

  const written = expanded(ctx, entry.value, what);
  return written === null ? null : { ...site, at, ...written };
}

/** The `{ url:, to:, tip: }` form; exactly one of the two targets (`docs/spec.md` §10). */
function expanded(
  ctx: Ctx,
  node: Node,
  what: Saying,
): { target: LinkTarget; tip: string | null } | null {
  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;

  const here = opened.ctx;
  for (const entry of opened.entries) {
    if (!MODELED_KEYS.link.has(keyOf(entry))) {
      rejectUnknownKey(here, entry, what, MODELED_KEYS.link);
    }
  }

  const out = findEntry(opened.entries, 'url');
  const inside = findEntry(opened.entries, 'to');
  if (out !== undefined && inside !== undefined) {
    reject(here, CODE.conflictingKeys, say('loader.link-two-targets', { what }), node.span);
    return null;
  }

  const written = out ?? inside;
  if (written === undefined) {
    reject(here, CODE.missingKey, say('loader.link-needs-a-target', { what }), opened.node.span);
    return null;
  }

  const kind = out === undefined ? 'to' : 'url';
  const text = expectText(here, written.value, under(what, kind));
  const said = findEntry(opened.entries, 'tip');
  const tip = said === undefined ? null : expectText(here, said.value, under(what, 'tip'));

  return text === null ? null : { target: { kind, text }, tip };
}

import type { Entry, Node, Path } from '@yxl-vscode/cst';
import { MODELED_KEYS, type Note } from '@yxl-vscode/spec';
import { CODE } from './codes';
import { type Ctx, identify, keyOf, reject } from './ctx';
import { expectText, findEntry, openEntries, rejectUnknownKey } from './read';
import { ADDRESS, readTextAs } from './template';

/** A sheet's `comments:` mapping: one note per addressed cell (`docs/spec.md` §10). */
export function readNotes(ctx: Ctx, node: Node, path: Path): Note[] {
  const opened = openEntries(ctx, node, path, '`comments`');
  if (opened === null) return [];

  const notes: Note[] = [];
  for (const entry of opened.entries) {
    const note = readNote(opened.ctx, entry, opened.path);
    if (note !== null) notes.push(note);
  }
  return notes;
}

function readNote(ctx: Ctx, entry: Entry, path: Path): Note | null {
  const key = keyOf(entry);
  const at = readTextAs(ctx, key, entry.key.span, 'a `comments` key', ADDRESS);
  if (at === null) return null;

  const what = `note \`${key}\``;
  const site = identify(ctx, [...path, key], entry.span);

  if (entry.value.kind !== 'map') {
    const text = expectText(ctx, entry.value, what);
    return text === null ? null : { ...site, at, text, author: null };
  }

  const written = expanded(ctx, entry.value, what);
  return written === null ? null : { ...site, at, ...written };
}

/** The `{ text:, author: }` form; a note written that way needs its `text` (`docs/spec.md` §10). */
function expanded(
  ctx: Ctx,
  node: Node,
  what: string,
): { text: string; author: string | null } | null {
  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;

  const here = opened.ctx;
  for (const entry of opened.entries) {
    if (!MODELED_KEYS.note.has(keyOf(entry))) {
      rejectUnknownKey(here, entry, what, MODELED_KEYS.note);
    }
  }

  const written = findEntry(opened.entries, 'text');
  if (written === undefined) {
    reject(here, CODE.missingKey, `${what} needs a \`text\``, opened.node.span);
    return null;
  }

  const text = expectText(here, written.value, `${what} \`text\``);
  const named = findEntry(opened.entries, 'author');
  const author = named === undefined ? null : expectText(here, named.value, `${what} \`author\``);

  return text === null ? null : { text, author };
}
